import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Realtime from "@/components/Realtime";
import Plegable from "@/components/Plegable";
import TabsPanel from "@/components/TabsPanel";
import CronogramaPostulacion from "@/components/CronogramaPostulacion";
import Presupuesto from "@/components/Presupuesto";
import RendicionFondo from "@/components/RendicionFondo";
import MovimientosBanco from "@/components/MovimientosBanco";
import ConciliacionFondo from "@/components/ConciliacionFondo";
import AuditoriaFondo from "@/components/AuditoriaFondo";
import VersionesFondo from "@/components/VersionesFondo";
import { etapasDe, nombreEtapa } from "@/lib/etapas";
import { rubrosDe, nombreRubro } from "@/lib/rubros";
import { plazoRendicion, rendicionVencida } from "@/lib/fondos";
import { plazoFondo, ETIQ_FUENTE, PLAZO_MESES } from "@/lib/plazoFondo";
import { saldoDJ as calcSaldoDJ } from "@/lib/dj";
import SaldoDj from "@/components/SaldoDj";
import Comprobantes from "@/components/Comprobantes";
import EquipoFondo from "@/components/EquipoFondo";
import CompromisosActa from "@/components/CompromisosActa";
import { integrantesDeFondo } from "@/lib/equipoFondo";
import { urlPlataforma, PLAT } from "@/lib/plataformas";
import { hilosDeFilas } from "@/lib/rendicionHilo";
import { gastosDelFondo, ayudaRubro } from "@/lib/ejecutado";

/* ── LA EJECUCIÓN DEL FONDO — la segunda vida de un proyecto ──
 *
 * Un proyecto tiene tres vidas: postularse, ejecutarse, distribuirse. La
 * página de Postulación es la primera —el expediente de cómo se pidió el
 * fondo—, y una vez ganado se vuelve un registro que ya no cambia. La
 * ejecución es otra cosa entera: dos años de presupuesto real, contratos,
 * rodajes, rendiciones e informes. Meterla en la misma página que el
 * expediente sería amontonar una promesa congelada con la vida real que vino
 * después.
 *
 * Por eso vive aparte, pero SIN una entidad nueva: el fondo ES la postulación
 * que ganó (misma acta, mismo presupuesto, mismo plazo), así que esta página
 * usa el MISMO id. Cero migración, cero doble verdad.
 *
 * Se organiza por las dos naturalezas del trabajo: FINANCIERA (la plata que
 * hay que rendir) y AUDIOVISUAL (la obra que hay que entregar). Más los
 * entregables del acta. La distribución —la tercera vida— vendrá después.
 */

async function cargarFondo(id: string) {
  const supabase = createClient();
  const { data } = await supabase.from("postulaciones")
    /* Los topes de DJ NO se piden aquí, y es a propósito. Esta consulta decide
       si la ficha existe: si falla, la página hace `notFound()`. Nombrar una
       columna que puede no estar todavía —db/declaraciones-juradas.sql sin
       correr— convertía «falta una migración» en «este fondo no existe», y se
       llevaba por delante todo el cuidado de degradar con elegancia del bloque
       de DJ. Van en su propia consulta, que puede fallar sola. */
    .select("*, proy:proyectos(id,nombre,tipo), emp:empresas(id,nombre), " +
      "conv:convocatorias(id,nombre,anio,categoria,monto_adjudicado)")
    .eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const f: any = await cargarFondo(params.id);
  if (!f) return { title: "🎬 Fondo" };
  const t = [f.codigo, f.proy?.nombre, f.conv?.anio].filter(Boolean).join(" · ");
  return { title: `🎬 ${t || "Fondo"}` };
}

const fmt = (n: number) => "S/ " + Number(n || 0).toLocaleString("es-PE");
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};


export default async function FondoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const ent: any = await cargarFondo(params.id);
  if (!ent) notFound();

  /* Esta página es SOLO para fondos ganados. Una postulación que aún está en
     juego no tiene ejecución que mostrar: se la manda a su expediente, que es
     donde vive su trabajo. */
  if (ent.estado !== "ganadora") {
    redirect(`/entidad/postulacion/${params.id}`);
  }

  const { data: perfilActual } = await supabase.from("perfiles")
    .select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
  /* «Admin» aquí significa «puede tocar los datos de plata de esta ficha», que
     no es lo mismo que tener /admin entero. El asistente de administración
     registra recibos de terceros y no debería necesitar la llave maestra para
     eso — ampliar `es_admin` para conceder esto habría sido justo la forma en
     que se acaban repartiendo llaves de más (ver db/rhe-permisos.sql). */
  const esAdmin = !!(perfilActual?.es_admin || perfilActual?.es_finanzas);

  const categoria = ent.conv?.categoria || null;

  const [cp, pl, pf, plPre, pc, vtp, ec, rf, mb, gdj, cmp, au, vf, eqp, eqf, cac, urlSunat, s4] = await Promise.all([
    supabase.from("cronograma_actividades").select("*, resp:perfiles!responsable(nombre)")
      .eq("postulacion_id", params.id)
      .order("etapa").order("orden").order("fecha_inicio").order("creado_en"),
    supabase.from("plantillas_cronograma")
      .select("id,nombre,tipo_proyecto,acts:plantilla_actividades(count)").order("nombre"),
    supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre"),
    supabase.from("plantillas_presupuesto").select("id,nombre,categoria,items").order("nombre"),
    /* Con foto: esta lista se lee poniéndole cara a los nombres que salen de
       los recibos, y un catálogo sin imagen obliga a abrir ficha por ficha. */
    /* ── `*` Y NO UNA LISTA DE COLUMNAS ──
       Aquí había una lista enumerada —nombre, tipo, domicilio, 4ta— que servía
       para la pestaña Equipo. Desde que el «＋ Sumar» abre el directorio
       ENTERO con sus filtros, esa lista se convertiría en una trampa: filtrar
       por región, especialidad o estado SUNAT sobre columnas que no se
       pidieron no da error, simplemente no encuentra a nadie. Y «no hay
       sonidistas en Cusco» se lee como un hecho, no como un fallo.
       Es la misma tabla que /personas trae con `*` por la misma razón: son
       ciento cuarenta filas. */
    supabase.from("personas").select("*").order("nombre"),
    /* Las vistas guardadas de personas. Son las MISMAS que las de /personas
       —misma tabla, misma entidad— para que una vista que el equipo armó allí
       («técnicos de Cusco») sirva también al sumar personal a un fondo. */
    supabase.from("vistas_guardadas").select("id,nombre,icono,usuario_id,config")
      .eq("entidad", "persona").order("orden").order("nombre"),
    supabase.from("estado_cuenta")
      .select("id,periodo,url,saldo,intereses,nota,imagenes,creado_en,comprobante_en," +
        "creado:perfiles!creado_por(nombre),quien:perfiles!comprobante_por(nombre)")
      .eq("postulacion_id", params.id).order("periodo"),
    supabase.from("rhe")
      .select("id,persona_id,fecha,monto,numero,url,etapa,rubro_item,concepto,persona:personas(nombre,alias)")
      .eq("postulacion_id", params.id).order("fecha", { ascending: false }),
    supabase.from("movimiento_banco")
      .select("id,fecha,glosa,medio,tipo,monto,saldo,categoria,nota")
      .eq("postulacion_id", params.id).order("fecha").order("creado_en"),
    /* Los gastos declarados. Van por fecha ascendente porque se leen contra el
       cuaderno de campo, que va en ese orden — al revés obliga a ir saltando
       para cotejar. */
    supabase.from("gasto_dj")
      .select("id,descripcion,importe,fecha,fecha_hasta,lugar_origen,lugar_destino," +
              "etapa,rubro_item,dj_numero,dj_url,firmada_por")
      .eq("postulacion_id", params.id).order("fecha"),
    /* Las facturas y boletas de proveedor: la tercera forma de rendir. Su
       ausencia hacía que una factura no tuviera dónde ir, y la salida a mano
       era meterla como declaración jurada — gastando un tope que no le tocaba
       (ver db/facturas.sql). */
    supabase.from("comprobante")
      /* Quién lo registró y cuándo. Es plata que se rinde ante el Ministerio:
         una cifra sin autor es una cifra que nadie puede explicar el día que
         la observan, y la bitácora de auditoría —que sí lo guarda— está tres
         plegables más abajo y en otro idioma. El dato tiene que estar donde
         está la duda. Mismo patrón que estado_cuenta, arriba. */
      .select("id,tipo,proveedor,ruc,serie,numero,fecha,importe,igv,concepto,etapa,rubro_item,url," +
        "creado_en,creado:perfiles!creado_por(nombre)")
      .eq("postulacion_id", params.id).order("fecha"),
    /* La bitácora inmutable de este fondo. Filtra por el postulacion_id que
       vive dentro del JSON (antes/después), así también captura los borrados. */
    supabase.from("auditoria_financiera")
      .select("id,tabla,fila_id,accion,creado_en,campos,antes,despues,actor_id")
      .or(`antes->>postulacion_id.eq.${params.id},despues->>postulacion_id.eq.${params.id}`)
      .order("creado_en", { ascending: false }).limit(80),
    supabase.from("version_fondo")
      .select("id,tipo,etiqueta,motivo,vigente,creado_en,datos,creado:perfiles!creado_por(nombre)")
      .eq("postulacion_id", params.id).order("creado_en", { ascending: false }),
    /* El equipo que se presentó: es la nómina del cronograma de esta
       postulación, aquí igual que en la ficha. Sin esto, la misma actividad
       ofrecería responsables distintos según por qué pantalla se entre. */
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
    /* El extracto del acta. En su propia consulta y tolerante: sin
       db/compromiso-acta.sql corrido, la pestaña lo dice y el resto del fondo
       sigue funcionando. */
    supabase.from("compromiso_acta")
      /* El estado del CASO viaja con el compromiso. Son dos preguntas distintas
         —«¿se entregó?» y «¿estamos trabajando en ello?»— y si solo se enseña
         una de las dos, la que se ve se lee como si contestara las dos. */
      .select("id,clase,clausula,titulo,detalle,fecha_limite,estado,entregado_en,url,nota,orden," +
              "caso_id,caso:publicaciones(estado,tipo)")
      .eq("postulacion_id", params.id).order("orden"),
    /* La URL del buscador de SUNAT, administrada en /admin?s=plataformas.
       Devuelve `undefined` si nadie la cargó y el botón usa su respaldo: un
       fondo no puede caerse porque falte un enlace. */
    urlPlataforma(PLAT.sunatConsultaRuc),
    /* El historial de suspensiones de 4ta, una fila por persona y año. En su
       propia consulta y tolerante: sin db/suspension-4ta-anios.sql corrida,
       `error` viene con la queja, la pestaña Equipo cae a la columna vieja y
       el resto del fondo ni se entera. */
    supabase.from("suspension_4ta").select("persona_id,anio,url"),
  ]);

  /* Responsable de actividad de postulación = persona del equipo
     (`responsable_persona`), no cuenta del sistema. Se normaliza a
     `responsable` al leer — ver db/crono-responsable-persona.sql. */
  const cronoPost = (cp.data || []).map((a: any) => ({ ...a, responsable: a.responsable_persona || null }));
  const perfilesCat = pf.data || [];
  const cargosF = new Map<string, string[]>();
  const nombresF = new Map<string, string>();
  const fotosF = new Map<string, string | null>();
  for (const m of (eqp.data || []) as any[]) {
    const p = m?.persona; if (!p?.id) continue;
    nombresF.set(p.id, p.alias || p.nombre || "—");
    fotosF.set(p.id, p.foto_url || null);
    cargosF.set(p.id, [...(cargosF.get(p.id) || []), m.cargo].filter(Boolean));
  }
  const plantelPost = [...nombresF].map(([id, n]) => ({
    id, nombre: (cargosF.get(id) || []).length ? `${n} · ${(cargosF.get(id) || []).join(" / ")}` : n,
    foto: fotosF.get(id) || null,
  }));
  const plantillas = (pl.data || []).map((x: any) => ({
    id: x.id, nombre: x.nombre, tipo_proyecto: x.tipo_proyecto, n: x.acts?.[0]?.count ?? 0,
  }));
  const plantillasPre = plPre.data || [];
  const personasCat = (pc.data || []).map((p: any) => ({ id: p.id, nombre: p.alias || p.nombre }));
  /* El catálogo entero, con foto: la pestaña de equipo tiene que poner cara a
     quien aparezca por un recibo, y esa persona puede no estar en ninguna de
     las otras listas. */
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
  const personasMin = (pc.data || []).map((p: any) => ({
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
  const compromisos = (cac.data || []) as any[];
  const cacError = (cac as any)?.error?.message || null;
  const estadosFondo: any[] = (ec.data as any) || [];
  const movBanco = mb.data || [];
  /* Los gastos con DJ y su saldo. Si falta correr el SQL, la consulta falla y
     esto queda vacío: el bloque lo dice en vez de enseñar «S/ 0 usado», que se
     leería como «no has gastado nada» — la lectura más peligrosa posible en el
     único número que obliga a devolver plata si se pasa. */
  const gastosDj = gdj.data || [];
  const comprobantes = (cmp.data || []) as any[];
  const cmpError = ((cmp as any).error?.message || null) as string | null;
  const totCmp = comprobantes.reduce((s: number, c: any) => s + Number(c.importe || 0), 0);
  const usadoDj = gastosDj.reduce((s: number, g: any) => s + Number(g.importe || 0), 0);

  /* Los dos topes, en una consulta aparte de la que decide si la ficha existe.
     Si falla, es que falta la migración — y entonces el saldo NO se enseña:
     con `gastosDj` vacío saldría «te queda el tope entero», que es la lectura
     más peligrosa posible del único número que obliga a devolver plata. */
  const { data: topes, error: eTopes } = await supabase.from("postulaciones")
    .select("tope_dj_pct,conv:convocatorias(tope_dj_pct)").eq("id", params.id).maybeSingle();
  const djError = ((gdj as any).error?.message || eTopes?.message || null) as string | null;
  const convTope = Array.isArray((topes as any)?.conv) ? (topes as any).conv[0] : (topes as any)?.conv;
  const saldoDj = calcSaldoDJ(
    ent.monto_adjudicado, usadoDj,
    { tope_dj_pct: (topes as any)?.tope_dj_pct },
    { tope_dj_pct: convTope?.tope_dj_pct },
  );
  const rheFondo = (rf.data || []).map((r: any) => ({
    ...r, persona: r.persona?.alias || r.persona?.nombre || "—",
  }));
  const totComision = movBanco.filter((m: any) => m.categoria === "comision").reduce((s: number, m: any) => s + Number(m.monto || 0), 0);

  /* ── EL HILO DE CADA FILA DE LA RENDICIÓN ──
     Las cinco listas donde vive el dinero pueden conversarse, igual que la
     caja. Aquí solo se traen el CONTADOR y los 👀 de cada fila: el hilo
     completo se carga al abrir el pop-up, pero el número tiene que verse desde
     la lista o una conversación de cuatro mensajes es invisible.
     Las cinco se piden a la vez y ninguna puede tumbar la página: si falta
     db/rendicion-interaccion.sql, vuelven vacías con su aviso y la rendición
     sigue leyéndose entera. */
  const [hCmp, hEct, hRhe, hDj, hMb] = await Promise.all([
    hilosDeFilas(supabase, "comprobante", comprobantes.map((c: any) => c.id)),
    hilosDeFilas(supabase, "estado_cuenta", estadosFondo.map((e: any) => e.id)),
    hilosDeFilas(supabase, "rhe", rheFondo.map((r: any) => r.id)),
    hilosDeFilas(supabase, "gasto_dj", gastosDj.map((g: any) => g.id)),
    hilosDeFilas(supabase, "movimiento_banco", movBanco.map((m: any) => m.id)),
  ]);
  /* Se dice UNA vez, no cinco: las cinco fallan por lo mismo —un solo archivo
     SQL sin correr— y repetir el aviso en cada bloque enseña a ignorarlo. */
  const hiloError = [hCmp, hEct, hRhe, hDj, hMb].map(h => h.error).find(Boolean) || null;
  const conHilo = (xs: any[], h: {
    conteo: Map<string, number>; reacciones: Map<string, any[]>;
    casos: Map<string, { id: string; estado?: string | null; tipo?: string | null }>;
  }) => xs.map(x => ({
    ...x,
    nComentarios: h.conteo.get(x.id) || 0,
    reacciones: h.reacciones.get(x.id) || [],
    caso: h.casos.get(x.id) || null,
  }));

  // Bitácora del fondo con el actor ya resuelto a nombre (perfilesCat).
  const nombrePerfil = (id: string | null) =>
    !id ? "sistema" : (perfilesCat.find((p: any) => p.id === id)?.nombre || "—");
  const auditoria = ((au?.data as any[]) || []).map((a: any) => ({ ...a, actor: nombrePerfil(a.actor_id) }));

  // Versiones del fondo (presupuesto · cronograma) con su autor resuelto.
  const versiones = ((vf?.data as any[]) || []).map((v: any) => ({ ...v, autor: v.creado?.nombre || null }));
  const versPresu = versiones.filter((v: any) => v.tipo === "presupuesto");
  const versCrono = versiones.filter((v: any) => v.tipo === "cronograma");
  const vigPresu = versPresu.find((v: any) => v.vigente) || null;
  const vigCrono = versCrono.find((v: any) => v.vigente) || null;

  // Datos de la rendición (ejes de cada gasto). El eje «etapa» = las etapas
  // DISTINTAS del cronograma del fondo (Pre / Prod / Post), en el orden del
  // preset de la categoría.
  const ordenEtapa = etapasDe(categoria).map((e: any) => e.clave);
  const etapasCrono = Array.from(new Set(cronoPost.filter((a: any) => a.estado !== "cancelada").map((a: any) => a.etapa).filter(Boolean)))
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
  const preItemsRaw = (((ent.presupuesto as any)?.items) || []) as any[];
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
     rendir ya en la mano, y viaja a los tres desplegables que lo ofrecen. */
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

  // Estado de la ejecución, en una línea.
  const plazo = plazoRendicion(ent);
  /* El plazo real, decidido en lib/plazoFondo: la prórroga manda sobre el acta,
     el acta sobre el cálculo, y si el acta y el cálculo no concuerdan se dice
     en vez de elegir por nadie. */
  const pz = plazoFondo(ent);
  const vencida = rendicionVencida(ent);
  const estadoEjec = ent.fecha_rendicion_real
    ? { ico: "✅", txt: "Rendido", col: "var(--green)" }
    : vencida
      ? { ico: "🔴", txt: `Debe rendición — venció ${dmy(plazo)}`, col: "var(--red)" }
      : { ico: "🎬", txt: plazo ? `En ejecución — rinde ${dmy(plazo)}` : "En ejecución", col: "var(--teal)" };

  const titulo = [ent.codigo, ent.proy?.nombre, ent.conv?.anio].filter(Boolean).join(" · ");
  const dim = (t: string) => <span style={{ color: "var(--dim)", fontWeight: 400 }}>{t}</span>;

  const totRhe = rheFondo.reduce((s: number, r: any) => s + Number(r.monto || 0), 0);
  /* Cuánta gente hay en el fondo, para el contador de la pestaña. Se calcula
     con la MISMA función que pinta la lista: un número de cabecera que no sale
     de lo que hay debajo es el que acaba discrepando. */
  const equipoDelFondo = integrantesDeFondo(
    (eqp.data || []) as any[], rheFondo as any[], previstosFondo, personasMin as any).length;
  const totInt = estadosFondo.reduce((s: number, e: any) => s + Number(e.intereses || 0), 0);
  const preItems = ((ent.presupuesto as any)?.items || []) as any[];
  const preCosto = preItems.reduce((s, i) => s + (i.cantidad || 0) * (i.costo_unit || 0), 0);
  // Conciliación: el presupuesto VIGENTE es la referencia (si no hay versión
  // vigente aún, se cae al presupuesto vivo). Costo vigente y % ejecutado (RHE).
  const vigItems = (((vigPresu?.datos as any)?.items) || preItems) as any[];
  const vigCosto = vigItems.reduce((s: number, i: any) => s + (i.cantidad || 0) * (i.costo_unit || 0), 0);
  const conPct = vigCosto ? Math.round((totRhe / vigCosto) * 100) : 0;

  return (
    <div className="shell" style={{ maxWidth: "min(1200px, 96vw)" }}>
      <Realtime tablas={["cronograma_actividades", "rhe", "estado_cuenta", "movimiento_banco", "gasto_dj", "comprobante", "auditoria_financiera", "version_fondo", "postulaciones"]}
        token={session?.access_token} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>🎬 EJECUCIÓN DEL FONDO</span>
      </div>

      {/* ── Cabecera del fondo ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0 2px" }}>
        <h1 className="title-lg" style={{ margin: 0 }}>🎬 {titulo}</h1>
        <Link href={`/entidad/postulacion/${params.id}`} className="btn btn-ghost"
          style={{ fontSize: 12, padding: "6px 12px" }}>📄 Ver expediente de postulación →</Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span className="badge" style={{ color: estadoEjec.col, background: "rgba(255,255,255,.05)", fontWeight: 700 }}>
            {estadoEjec.ico} {estadoEjec.txt}
          </span>
          {ent.emp?.nombre && <span style={{ color: "var(--dim)", fontSize: 12 }}>🏢 {ent.emp.nombre}</span>}
          {ent.conv?.nombre && <span style={{ color: "var(--dim)", fontSize: 12 }}>📜 {ent.conv.nombre}</span>}
        </div>
        <div className="fondo-cab">
          <Celda k="Estímulo" v={ent.monto_adjudicado ? fmt(parseFloat(ent.monto_adjudicado)) : "—"} destacado />
          <Celda k="Acta firmada" v={dmy(ent.fecha_firma_acta)} />
          <Celda k="Desembolso" v={ent.fecha_desembolso ? dmy(ent.fecha_desembolso) : "⚠ falta"}
            alerta={!ent.fecha_desembolso} />
          {/* ── EL PLAZO, UN AÑO Y NO DOS ──
              Aquí decía «Plazo (2 años)» y calculaba desembolso + 2, citando en
              el comentario la cláusula 7.2 del acta… que dice UN año. Los dos
              salían de sumarle la prórroga de la 8.1, que no es automática: hay
              que pedirla antes de vencer, con sustento y documento bancario.
              Para este fondo eso significaba anunciar 11/09/2026 cuando el
              plazo vencía el 11/09/2025 — un año de tranquilidad falsa. */}
          <Celda k={`Plazo (${PLAZO_MESES / 12} año)`}
            v={pz.limite ? dmy(pz.limite) : "—"}
            alerta={pz.discrepa} />
          <Celda k="Rinde" v={dmy(plazo)} />
        </div>
        <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 6 }}>
          {pz.fuente ? ETIQ_FUENTE[pz.fuente] : "sin plazo: falta la fecha de desembolso o la del acta"}
          {pz.techoConProrroga && !pz.conProrroga && (
            <> · con prórroga concedida podría llegar al {dmy(pz.techoConProrroga)} (acta 8.1, hay que solicitarla ANTES de vencer)</>
          )}
        </div>
        {/* Las dos fechas no concuerdan y las dos vienen del mismo acta: una de
            las dos está mal cargada, y de eso depende si el fondo está en plazo
            o en incumplimiento. No se elige por él: se dice. */}
        {pz.discrepa && (
          <p style={{ color: "var(--yellow)", fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.5 }}>
            ⚠ El límite cargado ({dmy(ent.fecha_limite_rendicion)}) no coincide con el año del
            desembolso ({dmy(pz.calculado)}). Los dos deberían salir del acta: revisa cuál está mal
            antes de fiarte de cualquiera de los dos.
          </p>
        )}
        {!ent.fecha_desembolso && (
          <p style={{ color: "var(--yellow)", fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.5 }}>
            ⚠ Falta la fecha de desembolso — el plazo de un año se cuenta desde que el dinero llega a la
            cuenta, no desde la firma del acta. Se edita en el expediente de postulación.
          </p>
        )}
      </div>

      {/* Las tres naturalezas del fondo, en pestañas: cada una va a crecer con
          su propia información, y apiladas se volverían un scroll interminable.
          Arranca en Financiera —el dinero es lo que tiene reloj—. */}
      <TabsPanel
        labels={["💰 Financiera", "🎥 Audiovisual", `📦 Entregables${compromisos.length ? ` · ${compromisos.length}` : ""}`, `👥 Equipo · ${equipoDelFondo}`]}
        /* Nombres de pestaña para poder enlazarlas: `…/fondo/<id>#equipo`.
           Sin esto, un enlace a la pestaña de equipo apunta a un panel que
           está montado pero oculto, y el clic no hace nada — el mismo fallo
           que costó dos rondas en la ficha de postulación. */
        claves={["financiera", "audiovisual", "entregables", "equipo"]}
        paneles={[
          <div key="fin">
            <p className="fondo-nat-sub">La plata que hay que rendir a DAFO: presupuesto real, banco, pagos y rendiciones.</p>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:presu`} titulo="🧮 Presupuesto (ejecución)" abiertoPorDefecto={false}
                resumen={dim(preItems.length ? `costo ${fmt(preCosto)} · ${preItems.length} ítems${versPresu.length ? ` · ${versPresu.length} versión(es)` : ""}` : "sin ítems")}>
                <Presupuesto key={`pre-${params.id}`} postulacionId={params.id}
                  rubros={rubrosFondo} categoria={categoria}
                  inicial={ent.presupuesto || null} plantillas={plantillasPre}
                  postulado={vigPresu?.datos || null}
                  postuladoEn={vigPresu?.creado_en || null} ocultarFijar
                  estimuloConcurso={ent.conv?.monto_adjudicado ? parseFloat(ent.conv.monto_adjudicado) : null} />
                <Plegable nivel={2} id={`fondo:${params.id}:presu:versiones`} titulo="🕑 Historial de versiones"
                  abiertoPorDefecto={false}
                  resumen={dim(versPresu.length ? `${versPresu.length} versión(es)` : "sin versiones")}>
                  <VersionesFondo postulacionId={params.id} tipo="presupuesto" esAdmin={esAdmin} versiones={versPresu} />
                </Plegable>
              </Plegable>
            </div>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:movbanco`} titulo="🏦 Movimientos del banco" abiertoPorDefecto={false}
                resumen={dim(movBanco.length ? `${movBanco.length} movimientos · comisiones ${fmt(totComision)}` : "sin movimientos")}>
                <MovimientosBanco postulacionId={params.id} esAdmin={esAdmin}
                  movimientos={conHilo(movBanco, hMb) as any} userId={user.id} hiloError={hiloError} />
              </Plegable>
            </div>
            <div style={{ scrollMarginTop: 12 }}>
              {/* ── EL RESUMEN CUENTA LO QUE HAY DENTRO, Y AHORA HAY CUATRO ──
                  Decía «26 RHE · S/ 98,270 · 15 estados». Con las DJ y las
                  facturas dentro, ese resumen se quedaba corto justo en la
                  cifra que importa: cuánto del estímulo está sustentado.
                  Se enseña la SUMA de las tres formas de rendir —recibos,
                  declaraciones y comprobantes— y lo que falta para los
                  S/ 200,000. Es la única línea de toda la página que contesta
                  «¿cómo vamos?» sin abrir nada. */}
              <Plegable id={`fondo:${params.id}:rendicion`} titulo="🧾 Rendición del fondo" abiertoPorDefecto={true}
                resumen={(() => {
                  const estimulo = ent.monto_adjudicado ? parseFloat(ent.monto_adjudicado) : 0;
                  const sustentado = totRhe + usadoDj + totCmp;
                  const falta = estimulo - sustentado;
                  return (
                    <>
                      <span style={{ color: "var(--muted)" }}>
                        {rheFondo.length} RHE · {gastosDj.length} DJ · {comprobantes.length} facturas
                      </span>
                      <span style={{ marginLeft: 8, color: "var(--teal)", fontWeight: 700 }}>
                        {fmt(sustentado)}
                      </span>
                      {estimulo > 0 && (
                        <span style={{ marginLeft: 8, fontWeight: 600,
                          color: falta > 0 ? "var(--yellow)" : "var(--green)" }}
                          title={`De los ${fmt(estimulo)} del estímulo, ${fmt(sustentado)} están sustentados entre recibos, declaraciones juradas y comprobantes.`}>
                          {falta > 0 ? `faltan ${fmt(falta)}` : "✓ sustentado"}
                        </span>
                      )}
                    </>
                  );
                })()}>
                <RendicionFondo postulacionId={params.id} esAdmin={esAdmin}
                  fechaDesembolso={ent.fecha_desembolso || null}
                  montoAdjudicado={ent.monto_adjudicado ? parseFloat(ent.monto_adjudicado) : null}
                  estados={conHilo(estadosFondo, hEct)} rhe={conHilo(rheFondo, hRhe)}
                  userId={user.id} hiloError={hiloError}
                  empresa={ent.emp?.nombre || null}
                  etapas={etapasFondo} rubros={fondoRubros} personas={personasCat} />

                {/* ── LAS CUATRO FORMAS DE RENDIR, JUNTAS ──
                    Las declaraciones juradas y las facturas colgaban del panel
                    de al lado, como si fueran otra cosa. No lo son: rendir este
                    fondo es exactamente estas cuatro —estados de cuenta, RHE,
                    DJ y comprobantes—, y son alternativas entre sí. Sueltas,
                    para saber cuánto está sustentado había que sumar de tres
                    plegables que no se leen juntos, y la pregunta «¿me conviene
                    una DJ o busco factura?» se hacía sin ver el tope al lado.
                    Ahora son sub-secciones de nivel 2, como los estados y los
                    recibos, y el resumen de arriba cuenta las cuatro. */}
              {/* Va ANTES de la conciliación y abierto por defecto. No es
                  jerarquía visual: el resumen del plegado —«te quedan S/ X»— es
                  el dato que hay que ver sin abrir nada, porque se consulta antes
                  de subir a rodar y no cuando se rinde. */}
                <Plegable nivel={2} id={`fondo:${params.id}:dj`} titulo="📝 Declaraciones juradas" abiertoPorDefecto={true}
                  /* El resumen se pinta esté el panel abierto o cerrado, así que
                     tiene que mirar el error igual que el interior. Sin eso, una
                     consulta caída enseñaba «quedan S/ 40,000 de S/ 40,000» en la
                     cabecera —el tope entero libre— mientras el aviso de dentro
                     decía lo contrario. */
                  resumen={dim(
                    djError
                      ? "⚠ no se pudo leer"
                      : saldoDj.falta === "estimulo"
                        ? "falta el monto adjudicado"
                        : saldoDj.tope === null
                          ? "falta cargar el tope"
                          : saldoDj.supero
                            ? `⚠ exceso ${fmt(saldoDj.exceso)} — a devolver`
                            : `quedan ${fmt(saldoDj.resta ?? 0)} de ${fmt(saldoDj.tope)}`)}>
                  <SaldoDj postulacionId={params.id} saldo={saldoDj} gastos={conHilo(gastosDj, hDj) as any}
                    etapas={etapasFondo} rubros={fondoRubros} esAdmin={esAdmin} error={djError}
                    userId={user.id} hiloError={hiloError} />
                  </Plegable>
                {/* ── EL MONTO EN TEAL, COMO EN LOS RECIBOS ──
                    Iba entero en gris, y justo debajo de «Pagos al personal ·
                    S/ 98,270» en teal parecía de otra naturaleza: un detalle,
                    no plata. Son lo mismo — gasto sustentado que suma al total
                    de la cabecera. El color es lo que le dice a un ojo que
                    recorre la columna cuáles son las cifras que se suman entre
                    sí, y tenerlas de dos colores obligaba a leer para saberlo. */}
                <Plegable nivel={2} id={`fondo:${params.id}:comprobantes`} titulo="🧾 Facturas y boletas" abiertoPorDefecto={false}
                  resumen={cmpError ? dim("⚠ no se pudo leer")
                    : comprobantes.length ? (
                      <>
                        <span style={{ color: "var(--muted)" }}>
                          {comprobantes.length} comprobante{comprobantes.length === 1 ? "" : "s"}
                        </span>
                        <span style={{ marginLeft: 8, color: "var(--teal)", fontWeight: 700 }}>
                          {fmt(totCmp)}
                        </span>
                        {/* El PDF que falta se cuenta aquí también, con el mismo
                            ⚠ que los estados y los recibos: es lo que separa
                            «cargado» de «presentable», y plegado era invisible. */}
                        {comprobantes.filter((c: any) => !c.url).length > 0 && (
                          <span style={{ marginLeft: 8, color: "var(--yellow)", fontWeight: 600 }}
                            title="Comprobantes sin el PDF adjunto: cuentan en el ejecutado pero no se pueden presentar.">
                            ⚠ {comprobantes.filter((c: any) => !c.url).length} sin PDF
                          </span>
                        )}
                      </>
                    ) : dim("sin comprobantes")}>
                  <Comprobantes postulacionId={params.id} comprobantes={conHilo(comprobantes, hCmp) as any}
                    etapas={etapasFondo} rubros={fondoRubros} esAdmin={esAdmin} error={cmpError}
                    urlSunat={urlSunat} userId={user.id} hiloError={hiloError} />
                  </Plegable>

              </Plegable>
            </div>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:concilia`} titulo="⚖️ Conciliación (ejecutado vs. presupuesto)" abiertoPorDefecto={false}
                /* El resumen contaba `totRhe`, igual que el interior antes de
                   incluir facturas y DJ. Dejarlo así habría dado dos cifras
                   distintas para lo mismo —una plegada y otra abierta—, que es
                   peor que la que estaba mal: obliga a decidir a cuál creerle. */
                resumen={(() => {
                  const ejec = totRhe + totCmp + usadoDj;
                  const p = vigCosto > 0 ? Math.round(ejec / vigCosto * 100) : 0;
                  return dim(vigItems.length
                    ? `${fmt(ejec)} de ${fmt(vigCosto)} · ${p}%${vigPresu ? "" : " · sin versión vigente"}`
                    : "sin presupuesto");
                })()}>
                {/* Las tres formas de rendir, no solo los recibos. Ver
                    lib/ejecutado.ts: con solo `rhe`, este bloque decía
                    «ejecutado S/ 98,270» sobre un gasto sustentado de
                    S/ 115,811 — y la PC de edición de S/ 7,588 no aparecía
                    contra ningún rubro. */}
                <ConciliacionFondo items={vigItems} esVigente={!!vigPresu}
                  postuladoEn={vigPresu?.creado_en || null}
                  rhe={rheFondo} comprobantes={comprobantes as any} dj={gastosDj as any}
                  etapas={etapasFondo}
                  estimulo={ent.monto_adjudicado ? parseFloat(ent.monto_adjudicado) : null} />
              </Plegable>
            </div>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:auditoria`} titulo="🔍 Auditoría" abiertoPorDefecto={false}
                resumen={dim(auditoria.length ? `${auditoria.length} cambio(s) registrado(s)` : "sin cambios")}>
                <AuditoriaFondo filas={auditoria} />
              </Plegable>
            </div>
          </div>,

          <div key="av">
            <p className="fondo-nat-sub">La obra que hay que entregar: el rodaje de dos años y su registro.</p>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:crono`} titulo="📅 Cronograma de ejecución" abiertoPorDefecto={true}
                resumen={dim(cronoPost.filter((a: any) => a.estado !== "cancelada").length
                  ? `${cronoPost.filter((a: any) => a.estado !== "cancelada").length} actividades` : "sin actividades")}>
                <CronogramaPostulacion key={`crono-${params.id}`} postulacionId={params.id}
                  actividades={cronoPost} perfiles={plantelPost}
                  plantillas={plantillas} tipoProyecto={ent.proy?.tipo || ""}
                  etapas={etapasDe(categoria)}
                  postulado={vigCrono?.datos || null}
                  postuladoEn={vigCrono?.creado_en || null} ocultarFijar />
                <Plegable nivel={2} id={`fondo:${params.id}:crono:versiones`} titulo="🕑 Historial de versiones"
                  abiertoPorDefecto={false}
                  resumen={dim(versCrono.length ? `${versCrono.length} versión(es)` : "sin versiones")}>
                  <VersionesFondo postulacionId={params.id} tipo="cronograma" esAdmin={esAdmin} versiones={versCrono} />
                </Plegable>
              </Plegable>
            </div>
            {/* Lo que el plan tiene mapeado pero aún no se construye: se anuncia
                para que se sepa dónde va a vivir, no para simular que ya está. */}
            <div className="fondo-pronto">
              <Pronto ico="📝" t="Contratos oficiales" d="Los contratos de personal de la ejecución (distintos de los precontratos de la postulación)." />
              <Pronto ico="©️" t="Derechos de autor" d="Cesiones y licencias de la obra y su material." />
              <Pronto ico="🎞️" t="Material de archivo (producción)" d="El registro que se genera durante el rodaje." />
              <Pronto ico="📖" t="Informes de ejecución" d="El informe narrativo por etapa — lo alimentan los casos del proyecto." />
            </div>
          </div>,

          <div key="ent">
            <p className="fondo-nat-sub">
              Lo que el acta de compromiso obliga: entregables, obligaciones y plazos, cada uno
              con su cláusula para poder comprobarlo en el PDF.
            </p>
            <div className="card">
              <CompromisosActa postulacionId={params.id} compromisos={compromisos as any}
                actaUrl={ent.acta_url || null} codigoActa={ent.codigo_acta || null}
                puedeEditar error={cacError} />
            </div>
          </div>,

          /* ── LA CUARTA NATURALEZA: QUIÉN ──
             Financiera dice cuánto, Audiovisual qué, Entregables a qué se
             obligó. Faltaba quién, y no es un directorio: es lo que hay que
             poder poner al lado de los recibos cuando pregunten de quién es
             cada uno. */
          <div key="eq">
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
                equipoPost={(eqp.data || []) as any[]}
                rhes={rheFondo as any[]}
                previstos={previstosFondo}
                personas={personasMin as any}
                personasTabla={(pc.data || []) as any[]}
                vistasPersona={(vtp.data as any[]) || []}
                /* Los mismos catálogos que usan los desplegables de la
                   rendición: si la pestaña de Equipo armara los suyos, una
                   etapa renombrada saldría con dos nombres según dónde mires. */
                etapas={etapasFondo}
                rubros={fondoRubros}
                puedeEditar />
            </div>
          </div>,
        ]}
      />
    </div>
  );
}

function Celda({ k, v, destacado, alerta }: { k: string; v: string; destacado?: boolean; alerta?: boolean }) {
  return (
    <div className="fondo-celda">
      <span className="fondo-celda-k">{k}</span>
      <span className="fondo-celda-v" style={{
        color: alerta ? "var(--yellow)" : destacado ? "var(--teal)" : "var(--text)",
        fontWeight: destacado ? 700 : 600,
      }}>{v}</span>
    </div>
  );
}

function Pronto({ ico, t, d }: { ico: string; t: string; d: string }) {
  return (
    <div className="card fondo-pronto-card">
      <div style={{ fontWeight: 700, fontSize: 12.5 }}>{ico} {t} <span className="badge" style={{ marginLeft: 4, color: "var(--dim)", background: "rgba(255,255,255,.05)" }}>pronto</span></div>
      <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>{d}</div>
    </div>
  );
}
