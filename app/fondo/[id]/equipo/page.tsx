import { createClient } from "@/lib/supabase/server";
import Realtime from "@/components/Realtime";
import EquipoFondo from "@/components/EquipoFondo";
import { ESTADOS_VIVOS } from "@/lib/estados";
import { etapasDe, nombreEtapa } from "@/lib/etapas";
import { rubrosDe, nombreRubro } from "@/lib/rubros";
import { gastosDelFondo, ayudaRubro } from "@/lib/ejecutado";
import { hilosDeFilas } from "@/lib/rendicionHilo";
import { traerFondo } from "@/lib/fondoDatos";
import { techo } from "@/lib/api";
import { hoyLima } from "@/lib/fechas";

/* ── 👥 QUIÉN ──
 *
 * Financiera dice cuánto, Audiovisual qué, Entregables a qué se obligó. Esta
 * dice quién, y no es un directorio: es lo que hay que poder poner al lado de
 * los recibos cuando pregunten de quién es cada uno.
 *
 * Era una de las seis pestañas de una página que las cargaba todas a la vez.
 * Ahora es su propia ruta. Sigue siendo la más cara de las seis —el cruce
 * necesita los recibos, el equipo declarado, el personal apuntado a mano, el
 * directorio entero y las constancias de 4ta—, pero ese precio ya no se paga
 * al entrar a mirar la vida del fondo o el cronograma.
 * La cabecera (título, celdas, alarma) la pone app/fondo/[id]/layout.tsx.
 */

export const metadata = { title: "👥 Equipo" };

const fmt = (n: number) => "S/ " + Number(n || 0).toLocaleString("es-PE");

export default async function EquipoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  /* Token y quién soy, para el canal de tiempo real. Sin `token`, este canal se
     suscribe ANTES de que el layout autentique el socket compartido —los
     efectos de React corren de hijo a padre— y con RLS puede quedarse mudo.
     Sin `miId` se pierde el «no me refresques por lo que escribo yo».
     Las dos son de sesión, no de base: no cuestan un viaje a Supabase. */
  const { data: { session } } = await supabase.auth.getSession();
  const { data: { user: quien } } = await supabase.auth.getUser();

  const [ent, rf, eqp, eqf, pc, vtp, s4, cp, cmp, gdj, pap] = await Promise.all([
    /* `traerFondo` está cacheada y el layout ya la llamó en este mismo render:
       esto NO es un viaje extra. Hacen falta el presupuesto vivo —de él salen
       los rubros del fondo y lo que contiene cada uno—, la categoría de la
       convocatoria y el id del proyecto (para los casos de la obra). */
    traerFondo(params.id),
    /* ── AQUÍ EL RECIBO NO NECESITA SU EXPEDIENTE ──
       La consulta de la ficha vieja pedía `liq:liquidaciones(cerrado_en)`,
       `pagado_en` y el nombre de la persona embebido, y por eso llevaba un
       reintento: si faltaba db/pagos-expediente.sql, PostgREST no devolvía
       «los recibos sin el cierre» sino que fallaba la consulta ENTERA, y la
       lista salía vacía. Todo eso era para la pestaña Financiera, que es la
       que pinta el botón de adjuntar y la rendición.
       Esta pestaña usa de cada recibo cuatro cosas —a quién, cuánto, su número
       y su PDF— más la etapa y el rubro para las dos vistas agrupadas. El
       nombre no se pide embebido porque ya viene del catálogo de personas, que
       es de donde `integrantesDeFondo` lo saca. Sin el embebido frágil, esta
       pantalla no tiene cómo salir vacía. */
    supabase.from("rhe")
      .select("id,persona_id,fecha,monto,numero,url,etapa,rubro_item")
      .eq("postulacion_id", params.id).order("fecha", { ascending: false }),
    /* El equipo que se presentó al concurso. Aquí SÍ con todas las columnas de
       persona: los declarados entran al cruce por este objeto embebido y no
       por el catálogo (ver `integrantesDeFondo`), así que lo que no se pida
       aquí sale como «sin domicilio» en la lista — y no como un error. */
    supabase.from("postulacion_equipo")
      .select("cargo,persona:personas(id,nombre,alias,foto_url,tipo,ruc_dni,direccion,distrito,provincia,region," +
              "suspension_4ta_anio,suspension_4ta_url)")
      .eq("postulacion_id", params.id),
    /* El personal PREVISTO del fondo: lo único de esta pestaña que se escribe
       a mano. Quien ya cobró sale de `rhe` y no se guarda dos veces (ver
       lib/equipoFondo.ts). Va en su propia consulta y tolera que falte la
       tabla: sin db/equipo-fondo.sql corrido, la pestaña tiene que seguir
       enseñando el equipo declarado y los recibos —que es la mitad más
       importante— en vez de tumbar la página entera. */
    supabase.from("equipo_fondo")
      .select("id,persona_id,cargo,nota")
      .eq("postulacion_id", params.id),
    /* ── `*` Y NO UNA LISTA DE COLUMNAS ──
       Aquí había una lista enumerada —nombre, tipo, domicilio, 4ta— y desde
       que el «＋ Sumar» abre el directorio ENTERO con sus filtros, esa lista
       se convertiría en una trampa: filtrar por región, especialidad o estado
       SUNAT sobre columnas que no se pidieron no da error, simplemente no
       encuentra a nadie. Y «no hay sonidistas en Cusco» se lee como un hecho,
       no como un fallo.
       Es la misma tabla que /personas trae con `*` por la misma razón: son
       ciento cuarenta filas.
       (Su hermana «Por rol» sí la pide flaca, y por eso mismo: allí las
       personas solo llenan un desplegable de tres columnas.) */
    supabase.from("personas").select("*").order("nombre"),
    /* Las vistas guardadas de personas. Son las MISMAS que las de /personas
       —misma tabla, misma entidad— para que una vista que el equipo armó allí
       («técnicos de Cusco») sirva también al sumar personal a un fondo. */
    supabase.from("vistas_guardadas").select("id,nombre,icono,usuario_id,config")
      .eq("entidad", "persona").order("orden").order("nombre"),
    /* El historial de suspensiones de 4ta, una fila por persona y año. En su
       propia consulta y tolerante: sin db/suspension-4ta-anios.sql corrida,
       `error` viene con la queja, la pestaña cae a la columna vieja y el resto
       del fondo ni se entera. */
    supabase.from("suspension_4ta").select("persona_id,anio,url"),
    /* ── LAS TRES QUE SOLO ALIMENTAN LOS DOS CATÁLOGOS ──
       Las etapas y los rubros de esta pestaña son los MISMOS que usan los
       desplegables de la rendición: si Equipo armara los suyos, una etapa
       renombrada saldría con dos nombres según dónde mires. Y como los arma
       igual, paga lo mismo que ellos: el cronograma dice qué etapas usa de
       verdad este fondo, y las tres formas de rendir dicen cuánto queda de
       cada rubro. Se piden flacas —solo las columnas que entran en la cuenta—
       porque ninguna de las tres se pinta aquí. */
    supabase.from("cronograma_actividades").select("etapa,estado")
      .eq("postulacion_id", params.id),
    supabase.from("comprobante").select("importe,etapa,rubro_item")
      .eq("postulacion_id", params.id),
    supabase.from("gasto_dj").select("importe,etapa,rubro_item")
      .eq("postulacion_id", params.id),
    /* ── LOS PAPELES DE LA CLÁUSULA 5.4 ──
       Contratos, convenios, locaciones y seguros de todo el personal
       vinculado. En su propia consulta y tolerante: sin
       db/postulacion-papel.sql corrida, `error` viene con la queja, la pestaña
       lo dice UNA vez arriba y no pinta las burbujas —en blanco dirían «sin
       contrato» para veintitantas personas, que es una acusación falsa—.
       `.limit` explícito: el techo real son 1000 filas y corta sin avisar.
       Dos papeles por persona y veintitantas personas no llega ni de lejos,
       pero un tope escrito se ve al leerlo; uno heredado, no. */
    supabase.from("postulacion_papel")
      .select("id,persona_id,tipo,estado,url,firmado_en,vigente_desde,vigente_hasta,motivo,nota")
      .eq("postulacion_id", params.id).limit(techo(500)),
  ]);

  const categoria = (ent as any)?.conv?.categoria || null;

  /* Las constancias por año, agrupadas por persona. Si la tabla no existe
     todavía, el mapa queda vacío y `coberturaSuspension` cae a la columna
     vieja — enseña menos, no rompe nada. */
  const susPorPersona = new Map<string, { anio: number; url: string | null }[]>();
  ((s4 as any)?.data || []).forEach((r: any) => {
    const l = susPorPersona.get(r.persona_id) || [];
    l.push({ anio: r.anio, url: r.url || null });
    susPorPersona.set(r.persona_id, l);
  });

  /* ── EL RECORTE TAMBIÉN HAY QUE ACTUALIZARLO ──
     Este `map` copia campo por campo, así que pedir columnas nuevas en la
     consulta no basta: si no se nombran aquí, llegan a la base, viajan hasta
     esta línea y se tiran. La pantalla no daría error — enseñaría «sin
     domicilio» en las veintitrés personas, incluidas las que sí lo tienen, que
     es la peor forma de fallar: convincente. */
  const personasMin = ((pc.data || []) as any[]).map((p: any) => ({
    id: p.id, nombre: p.nombre, alias: p.alias, foto_url: p.foto_url || null,
    tipo: p.tipo || null, ruc_dni: p.ruc_dni || null,
    direccion: p.direccion || null, distrito: p.distrito || null,
    provincia: p.provincia || null, region: p.region || null,
    suspension_4ta_anio: p.suspension_4ta_anio ?? null,
    suspension_4ta_url: p.suspension_4ta_url || null,
    suspensiones: susPorPersona.get(p.id) || [],
  }));

  /* Si falta db/equipo-fondo.sql, `eqf.error` viene con la queja y `data` en
     nulo. No se cae nada: la pestaña enseña el equipo declarado y los recibos,
     y el bloque de «sumar» avisará al intentar guardar. Media pantalla útil es
     mejor que una pantalla que no abre. */
  const previstosFondo = (eqf.data || []) as any[];
  const eqfError = (eqf as any)?.error?.message || null;

  const rheFondo = ((rf.data || []) as any[]);
  const comprobantes = (cmp.data || []) as any[];
  const gastosDj = (gdj.data || []) as any[];

  /* ── EL HILO DE CADA RECIBO ──
     Aquí solo se traen el CONTADOR y los 👀 de cada fila: el hilo completo se
     carga al abrir el pop-up, pero el número tiene que verse desde la lista o
     una conversación de cuatro mensajes es invisible. No puede tumbar la
     página: si falta db/rendicion-interaccion.sql, vuelve vacío con su aviso y
     la lista se sigue leyendo entera.
     De las cinco tablas con hilo que pedía la ficha vieja, aquí solo se pide
     la de recibos — las otras cuatro se leen en Financiera. */
  const hRhe = await hilosDeFilas(supabase, "rhe", rheFondo.map((r: any) => r.id));
  const conHilo = (xs: any[], h: {
    conteo: Map<string, number>; reacciones: Map<string, any[]>;
    casos: Map<string, { id: string; estado?: string | null; tipo?: string | null }>;
  }) => xs.map(x => ({
    ...x,
    nComentarios: h.conteo.get(x.id) || 0,
    reacciones: h.reacciones.get(x.id) || [],
    caso: h.casos.get(x.id) || null,
  }));

  /* ── LOS CASOS ABIERTOS DE CADA PERSONA DEL EQUIPO ──
   *
   * Un caso sobre alguien del fondo —«falta la constancia de 4ta de Frank»,
   * «Arthur no ha firmado»— vive en el tablero y en la ficha de la persona, y
   * la pestaña donde de verdad se revisa a esa gente no sabía nada de él. Se
   * cerraba o no según se acordara alguien de mirar dos pantallas.
   *
   * ── DOS VÍNCULOS, NO UNO ──
   * La persona Y esta obra. Al principio bastaba con la persona, y se vio
   * enseguida por qué no: a alguien del equipo se le abren casos de todo —de
   * otro rodaje, de un equipo prestado, de su DNI— y aquí salían todos. Una
   * lista de pendientes que mezcla proyectos no se usa para decidir nada.
   * «Esta obra» son DOS entidades: la postulación (el fondo) y su proyecto. Un
   * caso sobre la rendición se vincula a la primera y uno sobre la película a
   * la segunda; exigir solo una de las dos habría escondido la mitad.
   *
   * El precio, dicho: un caso sobre alguien de este equipo que nadie vinculó a
   * la obra no aparece. Es deliberado — el vínculo es lo que lo hace «de este
   * fondo», y sin él no hay forma de saberlo.
   *
   * Solo los VIVOS: uno resuelto ya no pide nada y con veintiséis filas la
   * lista se llenaría de historia.
   *
   * `bitacora` fuera: comparte tabla con los casos pero es una nota de muro —no
   * tiene responsable ni plazo, y enseñarla aquí como pendiente sería inventar
   * trabajo. Misma exclusión que hace el resto del sistema. */
  const idsEquipo = [...new Set([
    ...((eqp.data || []) as any[]).map((f: any) => (Array.isArray(f.persona) ? f.persona[0] : f.persona)?.id),
    ...rheFondo.map((r: any) => r.persona_id),
    ...previstosFondo.map((f: any) => f.persona_id),
  ].filter(Boolean))] as string[];
  const casosPorPersona: Record<string, any[]> = {};
  if (idsEquipo.length) {
    const { data: vp } = await supabase.from("publicacion_vinculos")
      .select("entidad_id,pub:publicaciones(id,titulo,estado,tipo)")
      .eq("entidad_tipo", "persona").in("entidad_id", idsEquipo);
    const candidatos = (vp || []).filter((v: any) => {
      const p = Array.isArray(v.pub) ? v.pub[0] : v.pub;
      return p?.id && p.tipo !== "bitacora" && ESTADOS_VIVOS.includes(p.estado);
    });
    /* Cuáles de esos casos hablan además de ESTA obra. Se pregunta en una sola
       consulta sobre los candidatos ya filtrados —nunca sobre la tabla
       entera—, y el resultado es un Set: pertenece o no pertenece. */
    const deLaObra = new Set<string>();
    const idsObra = [params.id, (ent as any)?.proy?.id].filter(Boolean) as string[];
    const idsPub = [...new Set(candidatos.map((v: any) =>
      (Array.isArray(v.pub) ? v.pub[0] : v.pub).id))] as string[];
    if (idsPub.length && idsObra.length) {
      const { data: vo } = await supabase.from("publicacion_vinculos")
        .select("publicacion_id")
        .in("publicacion_id", idsPub)
        .in("entidad_tipo", ["postulacion", "proyecto"])
        .in("entidad_id", idsObra);
      (vo || []).forEach((v: any) => deLaObra.add(v.publicacion_id));
    }
    candidatos.forEach((v: any) => {
      const p = Array.isArray(v.pub) ? v.pub[0] : v.pub;
      if (!deLaObra.has(p.id)) return;
      (casosPorPersona[v.entidad_id] ||= []).push(
        { id: p.id, titulo: p.titulo, estado: p.estado, tipo: p.tipo });
    });
  }

  // El eje «etapa» = las etapas DISTINTAS del cronograma del fondo (Pre /
  // Prod / Post), en el orden del preset de la categoría.
  const ordenEtapa = etapasDe(categoria).map((e: any) => e.clave);
  const etapasCrono = Array.from(new Set(((cp.data || []) as any[])
    .filter((a: any) => a.estado !== "cancelada").map((a: any) => a.etapa).filter(Boolean)))
    .sort((a: any, b: any) => ordenEtapa.indexOf(a) - ordenEtapa.indexOf(b))
    .map((clave: any) => ({ id: clave, nombre: nombreEtapa(clave) }));
  /* ── SI NO HAY CRONOGRAMA, MANDA EL PRESET ──
     Derivar las etapas del cronograma es lo correcto cuando hay cronograma:
     son las etapas que este fondo de verdad usa, no las que el catálogo
     imagina. Pero un fondo cargado desde papeles —PO-003 -042-2024— puede
     tener facturas, recibos y banco antes de que nadie escriba una sola
     actividad, y entonces esta lista salía VACÍA: el desplegable «Etapa…» se
     abría con una única opción que era el propio placeholder.
     Eso no es un campo opcional, es un campo roto. Y peor que roto: mudo,
     porque no dice por qué no hay nada que elegir, así que se lee como que el
     fondo no tiene etapas — cuando lo que no tiene es cronograma.
     El respaldo es el mismo que ya usaban los rubros tres líneas más abajo:
     lo real si existe, el catálogo de la categoría si no. Que dos ejes
     hermanos resolvieran el vacío de forma distinta era la verdadera anomalía. */
  const etapasFondo = etapasCrono.length ? etapasCrono
    : etapasDe(categoria).map((e: any) => ({ id: e.clave, nombre: e.nombre }));
  /* Los rubros del fondo: si el presupuesto ya tiene ítems, se usan SUS rubros
     (los reales, resueltos a nombre), y si no, el catálogo de la categoría. Así
     no dependemos de que el nombre de la categoría calce exactamente con el
     catálogo — el presupuesto real manda. */
  const preItemsRaw = ((((ent as any)?.presupuesto as any)?.items) || []) as any[];
  const rubrosDeItems = Array.from(new Set(preItemsRaw.map((i: any) => i.rubro).filter(Boolean)));
  const rubrosFondo = rubrosDeItems.length
    ? rubrosDeItems.map((clave: any) => ({ clave, nombre: nombreRubro(clave) }))
    : rubrosDe(categoria);
  /* ── CADA RUBRO, CON LO QUE CONTIENE Y LO QUE LE QUEDA ──
     El desplegable decía «Equipo del proyecto» y ya. Quien clasifica un recibo
     no sabía si ahí van los honorarios o los equipos, ni cuánto queda de esa
     partida — y averiguarlo obligaba a abrir el presupuesto en otra pestaña.
     A los veintiséis recibos eso no se hace: se elige por el nombre.
     El `ayuda` se calcula UNA vez aquí, con el presupuesto y las tres formas de
     rendir ya en la mano. */
  const fondoRubros = rubrosFondo.map((r: any) => {
    const items = preItemsRaw.filter((i: any) => i.rubro === r.clave);
    const pres = items.reduce((s: number, i: any) => s + (Number(i.cantidad) || 0) * (Number(i.costo_unit) || 0), 0);
    const ejec = gastosDelFondo(rheFondo as any[], comprobantes as any[], gastosDj as any[])
      .filter(g => g.rubro_item === r.clave).reduce((s, g) => s + g.monto, 0);
    return {
      id: r.clave, etiqueta: r.nombre,
      ayuda: ayudaRubro({
        pres, ejec, money: fmt,
        lineas: items.map((i: any) => String(i.concepto || "").trim()).filter(Boolean),
      }),
    };
  });

  return (
    <>
      {/* Solo lo de esta pestaña. Antes la página escuchaba nueve tablas sin
          filtro, así que un recibo girado en OTRO fondo la refrescaba.
          `suspension_4ta` no está: no tiene `postulacion_id` —una constancia
          es de la persona y de su año, no de un fondo—, y escucharla entera
          significaría refrescar esta pantalla cada vez que alguien carga una
          constancia de cualquier otro proyecto. */}
      <Realtime tablas={[
        { tabla: "rhe", filtro: `postulacion_id=eq.${params.id}` },
        { tabla: "equipo_fondo", filtro: `postulacion_id=eq.${params.id}` },
        { tabla: "postulacion_equipo", filtro: `postulacion_id=eq.${params.id}` },
        /* ⚠ Hasta correr db/postulacion-papel.sql, esta suscripción se abre,
           dice SUBSCRIBED y no emite nada: una tabla no publicada en
           `supabase_realtime` no da error, simplemente no llega nunca un
           evento. La migración la publica. */
        { tabla: "postulacion_papel", filtro: `postulacion_id=eq.${params.id}` },
      ]}
        token={session?.access_token} miId={quien?.id} />
      <p className="fondo-nat-sub">
        Quién trabaja en este fondo: el equipo que ganó el concurso y el personal que se
        le fue sumando. Es contra esta lista que se leen los recibos girados.
      </p>
      {eqfError && (
        <div className="empty" style={{ color: "var(--yellow)", marginBottom: 10 }}>
          No se pudo leer el personal apuntado a mano ({eqfError}). El equipo declarado y
          los recibos sí están: lo que falta es correr <b>db/equipo-fondo.sql</b>.
        </div>
      )}
      <div className="card">
        <EquipoFondo postulacionId={params.id}
          /* Los papeles de la cláusula 5.4 y el día de hoy EN LIMA. La fecha
             se calcula aquí y no en el navegador: el reloj del cliente puede
             estar en otra zona —o mal— y entonces un seguro vigente se
             pintaría vencido en la pantalla de una persona y no en la de otra
             con exactamente los mismos datos. */
          papeles={(pap.data || []) as any[]}
          papelesError={(pap as any)?.error?.message || null}
          hoy={hoyLima()}
          equipoPost={(eqp.data || []) as any[]}
          /* Con su hilo, igual que en «Pagos al personal»: los códigos
             de recibo de esta lista abren la MISMA conversación, y sin
             `conHilo` el contador de comentarios saldría siempre en cero
             —que se lee como «nadie ha dicho nada», no como «no lo he
             preguntado»—. */
          rhes={conHilo(rheFondo, hRhe) as any[]}
          previstos={previstosFondo}
          personas={personasMin as any}
          personasTabla={(pc.data || []) as any[]}
          vistasPersona={(vtp.data as any[]) || []}
          /* Los mismos catálogos que usan los desplegables de la
             rendición: si la pestaña de Equipo armara los suyos, una
             etapa renombrada saldría con dos nombres según dónde mires. */
          etapas={etapasFondo}
          rubros={fondoRubros}
          casosPorPersona={casosPorPersona}
          puedeEditar />
      </div>
    </>
  );
}
