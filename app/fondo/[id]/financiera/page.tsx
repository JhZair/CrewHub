import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { faltanEstados, seVigila, cierreDe } from "@/lib/estadosCuenta";
import { sinPruebas, textoSinPruebas } from "@/lib/pruebasFondo";
import { hoyLima } from "@/lib/fechas";
import { mapaAlias } from "@/lib/personas";
import Realtime from "@/components/Realtime";
import AnclaHash from "@/components/AnclaHash";
import Plegable from "@/components/Plegable";
import Presupuesto from "@/components/Presupuesto";
import RendicionFondo from "@/components/RendicionFondo";
import MovimientosBanco from "@/components/MovimientosBanco";
import ConciliacionFondo from "@/components/ConciliacionFondo";
import AuditoriaFondo from "@/components/AuditoriaFondo";
import VersionesFondo from "@/components/VersionesFondo";
import SaldoDj from "@/components/SaldoDj";
import Comprobantes from "@/components/Comprobantes";
import { etapasDe, nombreEtapa } from "@/lib/etapas";
import { rubrosDe, nombreRubro } from "@/lib/rubros";
import { saldoDJ as calcSaldoDJ } from "@/lib/dj";
import { urlPlataforma, PLAT } from "@/lib/plataformas";
import { hilosDeFilas } from "@/lib/rendicionHilo";
import { gastosDelFondo, ayudaRubro } from "@/lib/ejecutado";
import {
  traerFondo, traerPerfilActual, traerMiPersona, traerPerfiles, traerVersiones, traerTopes,
} from "@/lib/fondoDatos";

/* ── 💰 FINANCIERA ──
 *
 * La plata que hay que rendir a DAFO. De las seis pestañas es la más pesada, y
 * eso es exactamente lo que justifica partirla: mientras compartían página, sus
 * quince consultas se pagaban también al entrar a mirar el cronograma o las
 * cláusulas del acta. Ahora se pagan cuando alguien viene a mirar el dinero.
 *
 * ── AQUÍ LOS SELECTS FLACOS NO ALCANZAN ──
 * Cuatro de sus tablas —`estado_cuenta`, `rhe`, `gasto_dj` y `comprobante`— las
 * pide GORDAS y no con los loaders cacheados de lib/fondoDatos.ts. Los flacos
 * existen para que la cabecera pueda decir cuánto se giró; aquí no se dice un
 * total, se PINTA cada fila con su autor, su etapa, su rubro y su PDF, y el
 * recibo necesita además el cierre de su expediente para saber si todavía se le
 * puede colgar el comprobante. Pedir el gordo arriba habría cargado ese peso a
 * las seis pestañas — ver la nota «FLACO ARRIBA, GORDO ABAJO» de fondoDatos.
 * La cabecera (título, celdas, alarma) la pone app/fondo/[id]/layout.tsx.
 */

export const metadata = { title: "💰 Financiera" };

const fmt = (n: number) => "S/ " + Number(n || 0).toLocaleString("es-PE");
const dim = (t: string) => <span style={{ color: "var(--dim)", fontWeight: 400 }}>{t}</span>;

export default async function FinancieraPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  /* Token y quién soy, para el canal de tiempo real. Sin `token`, este canal se
     suscribe ANTES de que el layout autentique el socket compartido —los
     efectos de React corren de hijo a padre— y con RLS puede quedarse mudo.
     Sin `miId` se pierde el «no me refresques por lo que escribo yo».
     Las dos son de sesión, no de base: no cuestan un viaje a Supabase. */
  const { data: { session } } = await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [ent, perfilActual, miPersona, pf, versionesRaw, topesQ,
    ec, rf, mb, gdj, cmp, au, plPre, pc, apo, urlSunat, cp] = await Promise.all([
    /* Las seis primeras están cacheadas y el layout ya las llamó en este mismo
       render: en carga dura NO son viajes extra. (En navegación suave entre
       pestañas Next no rerenderiza el layout y sí cuestan — ver el aviso 2 de
       lib/fondoDatos.ts.) */
    traerFondo(params.id),
    traerPerfilActual(user.id),
    /* A qué FICHA DE PERSONA corresponde la cuenta de quien mira: hace falta
       para saber cuáles de los recibos de esta pantalla son suyos —el puente
       `personas.usuario_id` es el mismo que usa /jornadas. */
    traerMiPersona(user.id),
    /* El catálogo de cuentas activas. Sirve para dos cosas a la vez: elegir a
       quién nombrar apoyo de rendición, y resolver el actor de cada línea de la
       bitácora de auditoría a un nombre. */
    traerPerfiles(),
    traerVersiones(params.id),
    /* Los dos topes de DJ, en una consulta aparte de la que decide si la ficha
       existe. Si falla, es que falta la migración — y entonces el saldo NO se
       enseña: con `gastosDj` vacío saldría «te queda el tope entero», que es la
       lectura más peligrosa posible del único número que obliga a devolver
       plata. */
    traerTopes(params.id),
    /* ── Y A PARTIR DE AQUÍ, LO QUE SOLO ESTA PESTAÑA PIDE ── */
    supabase.from("estado_cuenta")
      .select("id,periodo,url,saldo,intereses,nota,imagenes,creado_en,comprobante_en," +
        "creado:perfiles!creado_por(nombre),quien:perfiles!comprobante_por(nombre)")
      .eq("postulacion_id", params.id).order("periodo"),
    supabase.from("rhe")
      /* El CIERRE del expediente viaja porque es lo que decide si el
         comprobante todavía se puede colgar — la misma línea que traza
         db/apoyo-rendicion.sql en la base. Ojo: es el cierre y no el pago. El
         pago protege las cifras, y aquí no se toca ninguna: el orden normal
         del trabajo es cobrar primero y juntar los PDF después, así que
         bloquear por «pagado» prohibiría justo la tarea. Sin este dato la
         pantalla tendría que adivinar, y adivinaría distinto que la base. */
      .select("id,persona_id,fecha,monto,numero,url,etapa,rubro_item,concepto,pagado_en," +
              "liquidacion_id,liq:liquidaciones(cerrado_en),persona:personas(nombre,alias)")
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
      /* Con foto y color: desde que el autor se pinta en la segunda fila con
         su avatar, pedir solo el nombre dejaría aquí unas iniciales grises
         mientras en /comprobantes se ve la cara. El mismo bloque no puede
         enseñar dos cosas distintas según la pantalla. */
      /* `creado_por` a secas, además del perfil embebido: el bloque pinta el
         ALIAS corto («JohnO») y lo cruza por esa columna. Sin ella el `||` se
         caía al nombre largo, así que el mismo comprobante decía «JohnO» en
         /comprobantes y «John Oros Condori» aquí — que es exactamente lo que
         el comentario de arriba dice que no puede pasar. No fallaba nada: solo
         se leía distinto según la puerta por la que entraras. */
      .select("id,tipo,proveedor,ruc,serie,numero,fecha,importe,igv,concepto,etapa,rubro_item,url," +
        "postulacion_id,creado_en,creado_por,creado:perfiles!creado_por(nombre,avatar_url,color)")
      .eq("postulacion_id", params.id).order("fecha"),
    /* La bitácora inmutable de este fondo. Filtra por el postulacion_id que
       vive dentro del JSON (antes/después), así también captura los borrados. */
    supabase.from("auditoria_financiera")
      .select("id,tabla,fila_id,accion,creado_en,campos,antes,despues,actor_id")
      .or(`antes->>postulacion_id.eq.${params.id},despues->>postulacion_id.eq.${params.id}`)
      .order("creado_en", { ascending: false }).limit(80),
    supabase.from("plantillas_presupuesto").select("id,nombre,categoria,items").order("nombre"),
    /* ── AQUÍ LAS PERSONAS SÍ SE PIDEN FLACAS ──
       La ficha vieja traía `personas.*` porque compartía consulta con la
       pestaña Equipo, que abre el directorio ENTERO con sus filtros de región,
       especialidad y estado SUNAT. Aquí las personas llenan tres cosas y
       ninguna necesita más de cinco columnas: el desplegable de «a quién se le
       gira», el puente RUC → persona de la carga por lote y el alias corto que
       firma cada comprobante. Partidas las pestañas, ciento cuarenta filas con
       todas sus columnas dejaron de pagarse aquí. */
    supabase.from("personas").select("id,nombre,alias,ruc_dni,usuario_id").order("nombre"),
    /* Quién ayuda a administración con los papeles de ESTE fondo. Tolerante,
       como las demás: sin db/apoyo-rendicion.sql corrido no hay apoyos y la
       pestaña funciona igual que ayer, en vez de caerse entera por una tabla que
       solo gobierna un botón. */
    supabase.from("fondo_apoyo").select("usuario_id").eq("postulacion_id", params.id),
    /* La URL del buscador de SUNAT, administrada en /admin?s=plataformas.
       Devuelve `undefined` si nadie la cargó y el botón usa su respaldo: un
       fondo no puede caerse porque falte un enlace. */
    urlPlataforma(PLAT.sunatConsultaRuc),
    /* El cronograma, FLACO: de él salen las etapas que este fondo usa de verdad
       —el eje de los tres desplegables de la rendición—, y para eso bastan la
       etapa y el estado. La pestaña que lo PINTA es Audiovisual, y allí sí se
       pide entero. */
    supabase.from("cronograma_actividades").select("etapa,estado")
      .eq("postulacion_id", params.id),
  ]);

  /* «Admin» aquí significa «puede tocar los datos de plata de esta ficha», que
     no es lo mismo que tener /admin entero. El asistente de administración
     registra recibos de terceros y no debería necesitar la llave maestra para
     eso — ampliar `es_admin` para conceder esto habría sido justo la forma en
     que se acaban repartiendo llaves de más (ver db/rhe-permisos.sql). */
  const esAdmin = !!((perfilActual as any)?.es_admin || (perfilActual as any)?.es_finanzas);
  const categoria = (ent as any)?.conv?.categoria || null;

  /* Los nombres de los apoyos salen del catálogo de perfiles que ya viajó
     (`pf`): la tabla de apoyos cuelga de auth.users y no de perfiles, así que
     PostgREST no puede traerlos embebidos —no hay clave foránea entre las dos—
     y pedirlos aparte sería un viaje más para tres nombres. */
  const apoyoIds: string[] = ((apo.data || []) as any[]).map(a => a.usuario_id);
  const soyApoyo = apoyoIds.includes(user.id);
  /* RUC (o DNI) → persona, para que la carga por lote sepa DE QUIÉN es cada
     PDF. Es el único dato que lo dice: el número del recibo no, porque la
     serie E001 la tiene cada emisor y «E001-22» existe tantas veces como
     personas cobran (ver lib/rheLote.ts). */
  const rucsPersonas: Record<string, string> = {};
  for (const p of ((pc.data || []) as any[])) {
    const r = String(p.ruc_dni || "").replace(/\D/g, "");
    if (r) rucsPersonas[r] = p.id;
  }
  const perfilesCat = (pf || []) as any[];
  const personasCat = ((pc.data || []) as any[]).map((p: any) => ({ id: p.id, nombre: p.alias || p.nombre }));
  /* Cuenta → alias corto, para la firma de cada comprobante. Sale de las
     personas que esta pestaña YA trae: es la misma consulta que /comprobantes
     hace aparte, aquí no cuesta un viaje más. */
  const aliasCuenta = mapaAlias(pc.data as any);

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

  const topes = ((topesQ as any)?.data || null) as any;
  const djError = ((gdj as any).error?.message || (topesQ as any)?.error?.message || null) as string | null;
  const convTope = Array.isArray(topes?.conv) ? topes.conv[0] : topes?.conv;
  const saldoDj = calcSaldoDJ(
    (ent as any)?.monto_adjudicado, usadoDj,
    { tope_dj_pct: topes?.tope_dj_pct },
    { tope_dj_pct: convTope?.tope_dj_pct },
  );

  /* ── EL EMBED NO PUEDE COSTAR LA LISTA ENTERA ──
     La consulta de recibos pide `liq:liquidaciones(cerrado_en)`. Si esa tabla
     o su clave foránea no están —db/pagos-expediente.sql sin correr—,
     PostgREST no devuelve «los recibos sin el cierre»: falla la consulta
     COMPLETA, y con `rf.data` en null la rendición diría «sin pagos» con los
     totales en cero. Un fondo con 58 recibos enseñándose vacío es peor que
     cualquier error: se lee como un hecho.
     Así que si falla, se vuelve a pedir sin el adorno. Lo que se pierde es
     saber qué expedientes están cerrados —y el botón de adjuntar aparecerá de
     más en esos—, pero la función de la base sigue diciendo que no.
     ⚠ Este reintento es de ESTA pestaña y de ninguna otra: sus hermanas piden
     el recibo flaco justamente para no tener que llevarlo. */
  let rheCrudo: any[] | null = (rf.data as any) || null;
  if (rf.error) {
    const r2 = await supabase.from("rhe")
      .select("id,persona_id,fecha,monto,numero,url,etapa,rubro_item,concepto,persona:personas(nombre,alias)")
      .eq("postulacion_id", params.id).order("fecha", { ascending: false });
    rheCrudo = (r2.data as any) || null;
  }
  const rheFondo = (rheCrudo || []).map((r: any) => ({
    ...r, persona: r.persona?.alias || r.persona?.nombre || "—",
    /* El nombre completo va APARTE del alias: el recibo dice «PEREZ DIAZ KATY»
       y la lista dice «KatyP». Para reconocer a quién pertenece un RUC hacen
       falta los dos. */
    personaNombre: r.persona?.nombre || null,
    /* PostgREST devuelve el embebido de uno-a-uno como objeto, pero hay
       versiones y relaciones donde llega como array de uno. Se aplana AQUÍ,
       una vez, para que la pantalla no tenga que saberlo: si lo leyera mal,
       `cerrado` daría false siempre y el botón saldría en expedientes
       cerrados. */
    liq: Array.isArray(r.liq) ? (r.liq[0] || null) : (r.liq || null),
  }));
  const totRhe = rheFondo.reduce((s: number, r: any) => s + Number(r.monto || 0), 0);
  const totComision = movBanco.filter((m: any) => m.categoria === "comision").reduce((s: number, m: any) => s + Number(m.monto || 0), 0);

  /* ── EL HILO DE CADA FILA DE LA RENDICIÓN ──
     Las cinco listas donde vive el dinero pueden conversarse, igual que la
     caja. Aquí solo se traen el CONTADOR y los 👀 de cada fila: el hilo
     completo se carga al abrir el pop-up, pero el número tiene que verse desde
     la lista o una conversación de cuatro mensajes es invisible.
     Las cinco se piden a la vez y ninguna puede tumbar la página: si falta
     db/rendicion-interaccion.sql, vuelven vacías con su aviso y la rendición
     sigue leyéndose entera.
     Las cinco son de esta pestaña: es la única que pinta las cinco listas
     —Equipo se lleva la de recibos porque también los enseña. */
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

  // Versiones del fondo (presupuesto) con su autor resuelto. El cronograma se
  // filtra fuera: sus versiones las pinta la pestaña Audiovisual.
  const versiones = ((versionesRaw as any[]) || []).map((v: any) => ({ ...v, autor: v.creado?.nombre || null }));
  const versPresu = versiones.filter((v: any) => v.tipo === "presupuesto");
  const vigPresu = versPresu.find((v: any) => v.vigente) || null;

  // Datos de la rendición (ejes de cada gasto). El eje «etapa» = las etapas
  // DISTINTAS del cronograma del fondo (Pre / Prod / Post), en el orden del
  // preset de la categoría.
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

  /* ── LO QUE FALTA DEL BANCO, CONTADO UNA VEZ PARA LOS TRES ESCALONES ──
     La pestaña Financiera, la cabecera de Rendición y la sub-sección de
     estados de cuenta enseñan el MISMO número. Tres cuentas distintas para lo
     mismo acaban discrepando, y el día que discrepan no se sabe cuál creer.
     Y se cuenta con `faltanEstados` —la misma del menú y de /fondos— para
     que los cinco sitios compartan criterio: un fondo ya rendido o sin
     desembolso no debe nada, y lo demás se mide contra el calendario que
     exige el acta (5.2.3), no contra lo que hay cargado.
     El rastro importa porque lo que falta no ocupa sitio: sin él, el aviso
     vive en la tercera sub-sección de una pestaña, y para verlo hay que
     sospechar antes de mirar. */
  /* Dos preguntas distintas, y antes estaban mezcladas:
     · `faltanEstados` DESCRIBE la serie —qué meses exige el acta y cuáles no
       están—. Recibe siempre la fecha de rendición real, que es la que corta
       la serie por el final: a un fondo cerrado en mayo no se le piden los
       meses de después.
     · `seVigila` decide si eso ENCIENDE una alarma. Un fondo ya rendido, o sin
       desembolso, no tiene a quién pedirle el papel: la serie incompleta se
       sigue viendo dentro de la sub-sección —es un hallazgo, y ahí es donde se
       audita—, pero sin burbujas que nadie pueda apagar.
     Mezcladas, un fondo cerrado con un hueco salía en rojo en la sub-sección y
     en ninguna otra pantalla: el único sitio donde se veía era aquel al que
     hay que entrar sospechando.
     ⚠ El MISMO cálculo lo hace `cifrasCabecera` para la burbuja de la barra de
     pestañas (lib/fondoDatos.ts). No se hereda —un layout no puede pasarle
     props a su página— pero come de las mismas dos funciones a propósito: el
     día que una de las dos se toque, las dos tienen que seguir contestando
     igual o la pestaña dirá un número y su interior otro. */
  const faltanEc = faltanEstados(
    estadosFondo.map((e: any) => e.periodo), (ent as any)?.fecha_desembolso, hoyLima(),
    cierreDe(ent as any));
  const nFaltaEc = seVigila(ent as any) ? faltanEc.faltan.length : 0;
  const avisoEc = nFaltaEc > 0
    ? { n: nFaltaEc, txt: `${nFaltaEc} estado(s) de cuenta del banco sin cargar` }
    : null;
  /* ── Y EL ÁMBAR: LO QUE ESTÁ REGISTRADO PERO SIN SU PAPEL ──
     Un recibo apuntado sin su PDF, un mes del banco con su saldo pero sin el
     extracto. La fila existe, así que ninguna cuenta sale mal y nada se ve
     rojo — pero el día de rendir, DAFO recibe papeles, no filas. Es un
     pendiente distinto del rojo y por eso va aparte y no sumado: el rojo se
     resuelve pidiéndole algo al banco, el ámbar subiendo un archivo que ya se
     tiene. Un número que mezcla las dos cosas no dice qué hacer. */
  /* `seVigila` manda también aquí, igual que en el rojo. Sin esto, un fondo ya
     rendido enseñaba ámbar en su ficha y cero en el menú y en su tarjeta: el
     mismo descuadre que se acaba de arreglar para el rojo, reintroducido en el
     otro color. A una rendición entregada no se le piden más PDF. */
  const docsTodos = sinPruebas({
    estados: estadosFondo, rhe: rheFondo as any[],
    facturas: comprobantes as any[], dj: gastosDj as any[],
  });
  /* La cuenta se hace SIEMPRE —dentro de la ficha, un fondo cerrado con papeles
     sin subir sigue siendo un hallazgo y cada sub-sección lo dice—, pero solo
     enciende burbujas si al fondo se le sigue pidiendo algo. Sin esto, un fondo
     rendido enseñaba ámbar en su ficha y cero en el menú y en su tarjeta: el
     mismo descuadre que se acaba de arreglar para el rojo, en el otro color. */
  const docsEc = seVigila(ent as any) ? docsTodos : { estados: 0, rhe: 0, facturas: 0, dj: 0, total: 0 };
  const avisoDocs = docsEc.total > 0
    ? { n: docsEc.total, txt: textoSinPruebas(docsEc), tono: "ambar" as const }
    : null;
  const burbujas = (
    <>
      {avisoEc && (
        <span className="b-alerta" title={avisoEc.txt} aria-label={avisoEc.txt}>{avisoEc.n}</span>
      )}
      {avisoDocs && (
        <span className="b-alerta tono-ambar" title={avisoDocs.txt} aria-label={avisoDocs.txt}>{avisoDocs.n}</span>
      )}
    </>
  );

  const preItems = (((ent as any)?.presupuesto as any)?.items || []) as any[];
  const preCosto = preItems.reduce((s, i) => s + (i.cantidad || 0) * (i.costo_unit || 0), 0);
  // Conciliación: el presupuesto VIGENTE es la referencia (si no hay versión
  // vigente aún, se cae al presupuesto vivo). Costo vigente y % ejecutado (RHE).
  const vigItems = (((vigPresu?.datos as any)?.items) || preItems) as any[];
  const vigCosto = vigItems.reduce((s: number, i: any) => s + (i.cantidad || 0) * (i.costo_unit || 0), 0);

  return (
    <>
      {/* Solo lo de esta pestaña, y con filtro. Antes la página escuchaba nueve
          tablas SIN filtro, así que un comprobante cargado en otro fondo
          refrescaba tu pantalla.
          `auditoria_financiera` no está: su postulacion_id vive dentro del JSON
          —por eso la consulta de arriba la busca con `->>`— y Realtime solo
          sabe filtrar por columnas. Escucharla entera significaría refrescar
          esta pantalla con cada cambio de plata de cualquier fondo, que es
          justo lo que se vino a quitar. Su bloque se refresca con el resto. */}
      {/* Del ancla de la URL a la fila, abriendo por el camino las secciones
          que estén plegadas. Sin mapa: la respuesta a «¿dentro de qué está
          esto?» la tiene el documento, y ahí no puede quedarse vieja. */}
      <AnclaHash />
      <Realtime tablas={[
        { tabla: "estado_cuenta", filtro: `postulacion_id=eq.${params.id}` },
        { tabla: "rhe", filtro: `postulacion_id=eq.${params.id}` },
        { tabla: "gasto_dj", filtro: `postulacion_id=eq.${params.id}` },
        { tabla: "comprobante", filtro: `postulacion_id=eq.${params.id}` },
        { tabla: "movimiento_banco", filtro: `postulacion_id=eq.${params.id}` },
        { tabla: "version_fondo", filtro: `postulacion_id=eq.${params.id}` },
      ]}
        token={session?.access_token} miId={user.id} />
      <p className="fondo-nat-sub">La plata que hay que rendir a DAFO: presupuesto real, banco, pagos y rendiciones.</p>
      <div style={{ scrollMarginTop: 12 }}>
        <Plegable id={`fondo:${params.id}:presu`} titulo="🧮 Presupuesto (ejecución)" abiertoPorDefecto={false}
          resumen={dim(preItems.length ? `costo ${fmt(preCosto)} · ${preItems.length} ítems${versPresu.length ? ` · ${versPresu.length} versión(es)` : ""}` : "sin ítems")}>
          <Presupuesto key={`pre-${params.id}`} postulacionId={params.id}
            rubros={rubrosFondo} categoria={categoria}
            inicial={(ent as any)?.presupuesto || null} plantillas={plPre.data || []}
            postulado={vigPresu?.datos || null}
            postuladoEn={vigPresu?.creado_en || null} ocultarFijar
            estimuloConcurso={(ent as any)?.conv?.monto_adjudicado ? parseFloat((ent as any).conv.monto_adjudicado) : null} />
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
        <Plegable id={`fondo:${params.id}:rendicion`}
          titulo={<>🧾 Rendición del fondo{burbujas}</>} abiertoPorDefecto={true}
          resumen={(() => {
            const estimulo = (ent as any)?.monto_adjudicado ? parseFloat((ent as any).monto_adjudicado) : 0;
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
            miPersonaId={(miPersona as any)?.id || null}
            esApoyo={soyApoyo}
            apoyos={apoyoIds}
            equipo={perfilesCat}
            rucs={rucsPersonas}
            fechaDesembolso={(ent as any)?.fecha_desembolso || null}
            fechaRendicionReal={(ent as any)?.fecha_rendicion_real || null}
            fechaLimiteRendicion={(ent as any)?.fecha_limite_rendicion || null}
            fechaProrroga={(ent as any)?.fecha_prorroga || null}
            fechaCierreCuenta={(ent as any)?.fecha_cierre_cuenta || null}
            montoAdjudicado={(ent as any)?.monto_adjudicado ? parseFloat((ent as any).monto_adjudicado) : null}
            estados={conHilo(estadosFondo, hEct)} rhe={conHilo(rheFondo, hRhe)}
            faltanEc={faltanEc}
            userId={user.id} hiloError={hiloError}
            empresa={(ent as any)?.emp?.nombre || null}
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
                  {/* El mismo número que alimenta la burbuja ámbar, y de
                      la misma cuenta (`docsEc`): contarlo aquí a mano era
                      una tercera copia de la misma pregunta. */}
                  {docsTodos.facturas > 0 && (
                    <span style={{ marginLeft: 8, color: "var(--yellow)", fontWeight: 600 }}
                      title="Comprobantes sin el PDF adjunto: cuentan en el ejecutado pero no se pueden presentar.">
                      ⚠ {docsTodos.facturas} sin PDF
                    </span>
                  )}
                </>
              ) : dim("sin comprobantes")}>
            <Comprobantes postulacionId={params.id} comprobantes={conHilo(comprobantes, hCmp) as any}
              etapas={etapasFondo} rubros={fondoRubros} esAdmin={esAdmin} error={cmpError}
              urlSunat={urlSunat} userId={user.id} hiloError={hiloError} alias={aliasCuenta} />
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
            estimulo={(ent as any)?.monto_adjudicado ? parseFloat((ent as any).monto_adjudicado) : null} />
        </Plegable>
      </div>
      <div style={{ scrollMarginTop: 12 }}>
        <Plegable id={`fondo:${params.id}:auditoria`} titulo="🔍 Auditoría" abiertoPorDefecto={false}
          resumen={dim(auditoria.length ? `${auditoria.length} cambio(s) registrado(s)` : "sin cambios")}>
          <AuditoriaFondo filas={auditoria} />
        </Plegable>
      </div>
    </>
  );
}
