import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import TabsPanel from "@/components/TabsPanel";
import TarifasEditor from "@/components/TarifasEditor";
import BitacoraJornadas from "@/components/BitacoraJornadas";
import LiquidacionAdmin from "@/components/LiquidacionAdmin";
import BotonDestacar from "@/components/BotonDestacar";
import RheAdmin from "@/components/RheAdmin";
import PlataformasAdmin from "@/components/PlataformasAdmin";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { buscadorDe, pal } from "@/lib/buscar";
import { estado4ta } from "@/lib/cuarta";
import { ejecutando, rendicionVencida, SEL_FONDO } from "@/lib/fondos";
import { haceOEn } from "@/lib/fechas";
import { ICO_ENT, rutaEntidad, tipoCanonico } from "@/lib/secciones";
import { BOT, mapaAlias } from "@/lib/personas";
import Link from "next/link";
import { plazoDe, diasHasta } from "@/lib/plazo";
import { colorTipo, rotuloTipo } from "@/lib/tipos";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "⚙ Administración" };

/* Administración — temas de gestión que el usuario común no toca:
   aprobar jornadas, liquidar el mes (recibos) y tarifas del personal. */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/* (Los colores salieron a lib/tipos. Éste era el caso más raro de los diez:
   guardaba SOLO los colores, en un mapa aparte, con los mismos nombres y los
   mismos valores hexadecimales que los otros nueve.) */

/* Dona de jornadas: SVG a mano, sin librería.
   Un anillo de dos tramos no justifica traerse Chart.js —200 KB para dibujar
   dos arcos—, y una librería más es una cosa más que actualizar. El truco es
   `stroke-dasharray` sobre un círculo: el primer tramo mide lo aprobado y el
   resto queda al descubierto. */
function Dona({ aprobadas, pendientes }: { aprobadas: number; pendientes: number }) {
  const total = aprobadas + pendientes;
  const R = 52, C = 2 * Math.PI * R;
  const pct = total ? aprobadas / total : 0;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128" role="img"
      aria-label={`${aprobadas} de ${total} jornadas aprobadas`}>
      <circle cx="64" cy="64" r={R} fill="none" stroke="var(--yellow)" strokeWidth="14" opacity=".85" />
      <circle cx="64" cy="64" r={R} fill="none" stroke="var(--green)" strokeWidth="14"
        strokeDasharray={`${C * pct} ${C}`} strokeLinecap="butt"
        transform="rotate(-90 64 64)" />
      <text x="64" y="61" textAnchor="middle" fill="var(--text)" fontSize="24" fontWeight="800">{total}</text>
      <text x="64" y="78" textAnchor="middle" fill="var(--dim)" fontSize="10"
        letterSpacing="1" style={{ textTransform: "uppercase" }}>jornadas</text>
    </svg>
  );
}

function Leyenda({ col, n, txt, total }: { col: string; n: number; txt: string; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, whiteSpace: "nowrap" }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: col, display: "inline-block" }} />
      <b style={{ color: "var(--text)" }}>{n}</b>
      <span style={{ color: "var(--muted)" }}>{txt}</span>
      <span style={{ color: "var(--dim)" }}>· {pct}%</span>
    </div>
  );
}

export default async function Admin({ searchParams }: { searchParams: { lm?: string; s?: string; fd?: string; qd?: string; jm?: string } }) {
  /* Sección activa. Antes entraba directo a «aprobar jornadas» porque era lo
     más frecuente; ahora abre la portada, que dice si hay jornadas por
     aprobar y además todo lo demás que espera. Entrar a una tarea concreta
     escondía las otras cinco. */
  const s = searchParams?.s || "portada";
  const fd = searchParams?.fd || "";                  // filtro dentro de Destacados
  const qd = (searchParams?.qd || "").trim();          // búsqueda dentro de Destacados
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) {
    return (
      <div className="shell">
        <div className="topbar"><Volver /></div>
        <div className="empty">⚙ Esta sección es solo para administración.</div>
      </div>
    );
  }

  // Mes a liquidar (por defecto el actual; navegable)
  const lmOff = parseInt(searchParams?.lm || "0", 10) || 0;
  const hoy = new Date();
  const bl = new Date(hoy.getFullYear(), hoy.getMonth() + lmOff, 1);
  const lAnio = bl.getFullYear(); const lMes = bl.getMonth(); // 0-indexado
  const pad = (n: number) => String(n).padStart(2, "0");
  const lInicio = `${lAnio}-${pad(lMes + 1)}-01`;
  const lFin = `${lMes === 11 ? lAnio + 1 : lAnio}-${pad(lMes === 11 ? 1 : lMes + 2)}-01`;

  const [{ data: personas }, { data: cobrables }, { data: rhes }, { data: jornsPend },
         { data: proyectos }, { data: jornsMes }, { data: liqs }, { data: vivos },
         { data: plats }, { data: credsPlat }, { data: ganadoras }, { data: activid }] = await Promise.all([
    // `usuario_id`: llave para poner el alias del actor en la actividad reciente
    supabase.from("personas").select("id,nombre,alias,usuario_id,tarifa_dia,tarifa_rodaje,tarifa_noche")
      .eq("tipo", "personal").order("nombre"),
    // A quién se le puede girar un RHE, y los del año en curso
    supabase.from("personas").select("id,nombre,alias,suspension_4ta_anio")
      .in("tipo", ["personal", "colaborador", "colaborador eventual", "independiente"])
      .eq("estado", "activo").order("nombre"),
    supabase.from("rhe").select("*")
      .gte("fecha", `${new Date().getFullYear()}-01-01`)
      .order("fecha", { ascending: false }).limit(400),
    supabase.from("jornadas")
      .select("id,persona_id,fecha,proyecto_id,tipo,fraccion,noche,monto,aprobada,per:personas(nombre,alias),proy:proyectos(nombre)")
      .eq("aprobada", false).order("fecha", { ascending: false }).limit(400),
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    /* `proy` y `fecha` entran para la portada: sin proyecto no se puede decir
       en qué se fue el mes, que es la única pregunta que un gráfico de barras
       contesta mejor que una tabla. */
    /* `id`, `tipo` y `noche` entran para poder ABRIR el detalle de cada
       persona antes de liquidar: firmar S/ 2,310 sin ver de qué se componen
       es pedirle a alguien que confíe en un total. */
    supabase.from("jornadas").select("id,persona_id,fecha,tipo,noche,fraccion,monto,aprobada,per:personas(nombre,alias),proy:proyectos(nombre)")
      .gte("fecha", lInicio).lt("fecha", lFin).order("fecha", { ascending: false }).limit(3000),
    supabase.from("liquidaciones").select("persona_id,estado").eq("anio", lAnio).eq("mes", lMes + 1),
    // Las puertas del sistema + qué credenciales entran por cada una.
    // `puertas` son las entradas adicionales: Clave SOL es una cuenta con
    // tres sitios distintos, y con un solo `url` entraba uno.
    supabase.from("plataformas")
      .select("*,puertas:plataforma_puertas(id,titulo,url,notas,orden)")
      .order("nombre"),
    supabase.from("credenciales").select("plataforma"),
    /* Casos vivos, para elegir cuáles suben a la cabecera del feed.
       Estaba en 60 y ordenado por creación descendente: los que se caían
       eran los MÁS VIEJOS, o sea los olvidados, los sin fecha — justo los
       que esta pantalla existe para rescatar. Y los contadores del menú y
       de los chips se calculaban sobre ese recorte, así que podían mentir.
       300 cubre de sobra el tamaño real (unos 25 vivos) y el aviso de abajo
       avisa si algún día no alcanza. */
    supabase.from("publicaciones")
      .select("id,tipo,titulo,fecha_limite,destacado_hasta")
      .in("estado", ["abierta", "en_progreso", "seguimiento"])
      .is("archivado_en", null)   // lo archivado no se destaca ni se lista aquí
      .neq("tipo", "bitacora")    // las notas del muro solo viven en su proyecto
      .order("creado_en", { ascending: false }).limit(300),
    /* Para la portada: lo que espera acción en dinero de fondos. Las
       rendiciones vencidas son lo más caro que hay callado en el sistema —
       una empresa que le debe una rendición a DAFO no puede postular. */
    supabase.from("postulaciones")
      .select(`${SEL_FONDO},proy:proyectos(nombre),emp:empresas(id,nombre)`)
      .eq("estado", "ganadora"),
    // Los últimos movimientos, de quien sea: es el pulso del sistema
    supabase.from("actividad")
      .select("tipo,detalle,creado_en,entidad_tipo,entidad_id,actor_id,actor:perfiles(nombre)")
      .order("creado_en", { ascending: false }).limit(12),
  ]);

  const aliasMap = mapaAlias(personas as any);   // actor → alias (JohnO) en la actividad
  const tarifaLista = (personas || []).map((p: any) => ({
    id: p.id, nombre: p.alias || p.nombre, tarifa_dia: p.tarifa_dia, tarifa_rodaje: p.tarifa_rodaje, tarifa_noche: p.tarifa_noche,
  }));
  /* ── QUÉ MES SE REVISA ──
     Antes se traía «desde el mes más viejo con algo pendiente», y eso dejaba
     un agujero: un mes SIN pendientes no se cargaba nunca, así que una
     jornada ya aprobada de julio era inalcanzable para el admin. El servidor
     sí la deja borrar —`borrarJornada` solo se planta si el mes está
     liquidado o confirmado— pero no había forma de llegar a ella desde la
     pantalla. Un permiso que existe y no tiene puerta es un permiso que no
     existe.
     Ahora el mes se navega, como en «Liquidar mes». Arranca en el más viejo
     con algo pendiente —que es a lo que uno viene— y desde ahí se mueve.
     Va en secuencia y no en el Promise.all porque el rango depende de lo que
     devuelva la primera consulta. */
  const fechasPend = (jornsPend || []).map((j: any) => String(j.fecha)).sort();
  const ymPend = fechasPend.length ? fechasPend[0].slice(0, 7) : null;
  /* Sin `jm` en la URL se abre el mes de lo pendiente; con `jm` manda la URL.
     El offset se cuenta desde HOY para que «‹ mes anterior» sea siempre lo
     mismo, se venga de donde se venga. */
  const jmOff = searchParams?.jm != null ? (parseInt(searchParams.jm, 10) || 0)
    : ymPend ? (Number(ymPend.slice(0, 4)) - hoy.getFullYear()) * 12 + (Number(ymPend.slice(5, 7)) - 1 - hoy.getMonth())
    : 0;
  const bj = new Date(hoy.getFullYear(), hoy.getMonth() + jmOff, 1);
  const jAnio = bj.getFullYear(), jMes = bj.getMonth();
  const jInicio = `${jAnio}-${pad(jMes + 1)}-01`;
  const jFin = `${jMes === 11 ? jAnio + 1 : jAnio}-${pad(jMes === 11 ? 1 : jMes + 2)}-01`;
  const { data: jornsCtx } = await supabase.from("jornadas")
    .select("id,persona_id,fecha,proyecto_id,tipo,fraccion,noche,monto,aprobada,per:personas(nombre,alias),proy:proyectos(nombre)")
    .gte("fecha", jInicio).lt("fecha", jFin)
    .order("fecha", { ascending: false }).limit(3000);

  /* `filasJornadas` es lo que se PINTA: el mes elegido ENTERO, aprobadas
     incluidas, porque para ver los huecos hace falta el mes completo —con
     solo lo pendiente, un día ya aprobado se dibujaría como «no trabajado»,
     una mentira justo sobre lo que ya se revisó. */
  const filasJornadas = (jornsCtx || []).map((j: any) => ({
    id: j.id, persona_id: j.persona_id, proyecto_id: j.proyecto_id, aprobada: j.aprobada,
    fecha: j.fecha, persona: j.per?.alias || j.per?.nombre || "—",
    proyecto: j.proy?.nombre || null, tipo: j.tipo, fraccion: j.fraccion, noche: j.noche, monto: j.monto,
  }));

  /* De `jornsPend` —TODO lo pendiente— y no de `filasJornadas`, que ahora es
     un mes solo. Si el contador leyera lo pintado, navegar a un mes sin
     pendientes pondría «0 jornadas esperando aprobación» en la portada con
     siete esperando en otro mes. El aviso mentiría, y hacia el lado que hace
     que no se revise. */
  const porAprobar = (jornsPend || []);

  const estadoDe = new Map((liqs || []).map((l: any) => [l.persona_id, l.estado]));
  const agg = new Map<string, { nombre: string; dias: number; pend: number; monto: number }>();
  (jornsMes || []).forEach((j: any) => {
    const a = agg.get(j.persona_id) || { nombre: j.per?.alias || j.per?.nombre || "—", dias: 0, pend: 0, monto: 0 };
    a.dias += Number(j.fraccion || 0);
    if (!j.aprobada) a.pend++;
    a.monto += j.aprobada ? Number(j.monto || 0) : 0;
    agg.set(j.persona_id, a);
  });
  /* El detalle de cada persona, para desplegarlo en la fila. Se arma del mismo
     `jornsMes` que ya calcula los totales: si viniera de otra consulta, un día
     el total y el detalle dirían cosas distintas y no habría forma de saber
     cuál miente. */
  const detalleLiq = new Map<string, any[]>();
  (jornsMes || []).forEach((j: any) => {
    const l = detalleLiq.get(j.persona_id) || [];
    l.push({
      id: j.id, fecha: j.fecha, tipo: j.tipo, noche: j.noche,
      fraccion: Number(j.fraccion || 0), monto: Number(j.monto || 0),
      aprobada: !!j.aprobada, proyecto: (j.proy as any)?.nombre || null,
    });
    detalleLiq.set(j.persona_id, l);
  });
  const filasLiq = [...agg.entries()]
    .map(([personaId, a]) => ({
      personaId, nombre: a.nombre, dias: a.dias, pend: a.pend, monto: a.monto,
      estado: estadoDe.get(personaId) || null,
      items: detalleLiq.get(personaId) || [],
    }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre));

  // Cuántos rozan o pasaron el tope de 4ta: eso es lo que pide atención
  const anioHoy = new Date().getFullYear();
  const acum4ta = new Map<string, number>();
  (rhes || []).forEach((r: any) => acum4ta.set(r.persona_id, (acum4ta.get(r.persona_id) || 0) + Number(r.monto || 0)));
  const nCerca = [...acum4ta.values()].filter(v => {
    const e = estado4ta(v, anioHoy);
    return e.cerca || e.supero;
  }).length;

  // Menú: cada sección con su contador, para ver qué pide atención sin entrar
  const ahoraMs = Date.now();
  const nDestacados = (vivos || []).filter((p: any) =>
    p.destacado_hasta && new Date(p.destacado_hasta).getTime() > ahoraMs).length;
  /* Cuántas credenciales entran por cada puerta, y cuáles no tienen link:
     una plataforma sin URL obliga a buscarla en Google, que es justo donde
     aparecen las páginas falsas. Por eso el contador del menú cuenta las
     que faltan, no las que hay. */
  const usosPlat = new Map<string, number>();
  (credsPlat || []).forEach((c: any) => {
    const k = String(c.plataforma || "").trim().toLowerCase();
    if (k) usosPlat.set(k, (usosPlat.get(k) || 0) + 1);
  });
  const plataformas = (plats || []).map((p: any) => ({
    ...p, usos: usosPlat.get(String(p.nombre || "").trim().toLowerCase()) || 0,
    // El `orden` se respeta acá y no en la consulta: ordenar una tabla
    // embebida en PostgREST es frágil, y son tres filas.
    puertas: [...(p.puertas || [])].sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0)),
  }));
  const platSinLink = plataformas.filter((p: any) => !p.url).length;

  /* ── Portada ──
     Las tarjetas cuentan TRABAJO, no tráfico. La referencia contaba
     incidencias, tendencias y cumplimiento SLA porque monitorea un flujo de
     cientos; aquí somos seis y lo que importa no es cuánto pasó sino qué
     espera a alguien. Cada número es algo que se hace, y por eso cada tarjeta
     lleva a donde se hace. */
  const sinLiquidar = filasLiq.filter(f => f.estado !== "liquidado").length;
  const debiendo = (ganadoras || []).filter(rendicionVencida);
  const montoDebiendo = debiendo.reduce((s, p: any) => s + (parseFloat(p.monto_adjudicado) || 0), 0);
  const ejecutandoN = (ganadoras || []).filter(ejecutando).length;
  const montoPorAprobar = porAprobar.reduce((s, j) => s + (Number(j.monto) || 0), 0);

  const KPIS: {
    k: string; ico: string; col: string; n: number | string; label: string;
    pie?: string; href: string; urge?: boolean;
  }[] = [
    { k: "jornadas", ico: "✅", col: "var(--yellow)", n: porAprobar.length,
      label: "Jornadas por aprobar",
      pie: montoPorAprobar > 0 ? `S/ ${montoPorAprobar.toLocaleString("es-PE")} en juego` : "nada pendiente",
      href: "/admin?s=jornadas", urge: porAprobar.length > 0 },
    { k: "liquidar", ico: "🧾", col: "var(--teal)", n: sinLiquidar,
      label: `Por liquidar · ${MESES[lMes]}`,
      pie: filasLiq.length ? `de ${filasLiq.length} con jornadas` : "sin jornadas este mes",
      href: `/admin?s=liquidar&lm=${lmOff}`, urge: sinLiquidar > 0 },
    { k: "rhe", ico: "📊", col: nCerca > 0 ? "var(--red)" : "var(--green)", n: nCerca,
      label: "Cerca o sobre el tope de 4ta",
      pie: `tope ${anioHoy}`, href: "/admin?s=rhe", urge: nCerca > 0 },
    /* Lo más caro que el sistema tenía callado: una rendición vencida impide
       postular a esa empresa. Hasta hoy se daba por cerrada sola. */
    { k: "debiendo", ico: "🔴", col: "var(--red)", n: debiendo.length,
      label: "Rendiciones vencidas",
      pie: debiendo.length ? `S/ ${montoDebiendo.toLocaleString("es-PE")} sin rendir` : "ninguna",
      href: "/postulaciones?f=debiendo", urge: debiendo.length > 0 },
    { k: "ejecutando", ico: "🎬", col: "var(--violet)", n: ejecutandoN,
      label: "Fondos en ejecución",
      pie: "ganados y sin entregar", href: "/postulaciones?f=ejecutando" },
    { k: "plataformas", ico: "🔗", col: platSinLink > 0 ? "var(--yellow)" : "var(--dim)", n: platSinLink,
      label: "Plataformas sin link",
      pie: platSinLink ? "se busca en Google, ahí viven las falsas" : "todas con puerta",
      href: "/admin?s=plataformas", urge: platSinLink > 0 },
  ];

  // Jornadas del mes: la dona de aprobadas vs pendientes
  const jAprob = (jornsMes || []).filter((j: any) => j.aprobada).length;
  const jPend = (jornsMes || []).length - jAprob;

  /* En qué se fue el mes. Barras y no tabla porque la pregunta es
     comparativa: cuál se llevó más días, no cuántos exactamente. */
  const porProy = new Map<string, number>();
  (jornsMes || []).forEach((j: any) => {
    const n = (j.proy as any)?.nombre || "Sin proyecto";
    porProy.set(n, (porProy.get(n) || 0) + Number(j.fraccion || 0));
  });
  const barras = [...porProy.entries()]
    .map(([nombre, dias]) => ({ nombre, dias }))
    .sort((a, b) => b.dias - a.dias).slice(0, 6);
  const maxBarra = Math.max(1, ...barras.map(b => b.dias));

  /* Las alertas salen de reglas que ya existen en otras pantallas: si aquí
     escribiera otras, un día el admin diría que todo está bien mientras el
     vigía grita. */
  const ALERTAS: { txt: string; col: string; href: string }[] = [
    debiendo.length > 0 && { txt: `${debiendo.length} rendición(es) vencida(s) — esas empresas no pueden postular`, col: "var(--red)", href: "/postulaciones?f=debiendo" },
    nCerca > 0 && { txt: `${nCerca} persona(s) cerca o sobre el tope de 4ta ${anioHoy}`, col: "var(--red)", href: "/admin?s=rhe" },
    porAprobar.length > 0 && { txt: `${porAprobar.length} jornada(s) esperando aprobación`, col: "var(--yellow)", href: "/admin?s=jornadas" },
    sinLiquidar > 0 && { txt: `${sinLiquidar} persona(s) sin liquidar en ${MESES[lMes]}`, col: "var(--yellow)", href: `/admin?s=liquidar&lm=${lmOff}` },
    platSinLink > 0 && { txt: `${platSinLink} plataforma(s) sin link cargado`, col: "var(--yellow)", href: "/admin?s=plataformas" },
  ].filter(Boolean) as any[];

  /* (Aquí vivían SECCIONES, GRUPOS y META: el menú lateral con sus tres
     grupos —Hoy / Dinero / Configuración—. Se fue con la barra. Lo que
     agrupaba se conserva en el ORDEN de las pestañas, que va de lo de cada
     semana a lo que se toca una vez al año. Un rótulo de grupo no cabe en
     una fila de pestañas, y fingirlo con separadores habría sido copiar la
     forma sin la función.) */

  /* ── A QUÉ HORA TRABAJA CADA UNO, EN EL MES QUE SE REVISA ──
     La lupa de un día contesta «¿qué hizo el martes?»; esto contesta la de
     antes: «¿a qué hora trabaja esta persona?». Un mes de jornadas de oficina
     todas iguales no lo dice, y el sistema sí lo sabe.
     TRES consultas para todas las personas y todo el mes, no una por fila:
     `actividad`, `comentarios` y `publicaciones` filtradas por rango. Ese
     rango se escribe con el offset de Lima —igual que la ventana del día— o
     las horas saldrían corridas cinco puestos, que es justo lo que se está
     midiendo.
     Las tres son las mismas que lista la ventana del día, y con el mismo
     criterio: la barra tiene que medir lo que uno va a encontrar al abrirla,
     o el pico de un martes no se puede comprobar.
     Lo que NO entra son los préstamos y los recibos. No por peso: `creado_en`
     se añadió a `equipo_prestamos` hace nada y los préstamos viejos lo tienen
     en nulo, así que contarlos borraría de la silueta justo los meses
     anteriores —callando, que es lo peor—. Los recibos son del mes, no del
     día. Esto es una silueta, no un parte contable — y por eso no lleva
     números. */
  const horasPorPersona: Record<string, number[]> = {};
  /* Y la otra silueta: A QUÉ DÍA. La de horas dice si trabaja de mañana; esta
     dice si el mes fue parejo o si se concentró en una semana — y si hubo
     domingos. Son la misma pregunta en dos escalas, así que salen de las
     MISMAS dos consultas: pedir el mes otra vez para contarlo distinto sería
     arriesgar que un día los dos números no cuadren. */
  const diasPorPersona: Record<string, number[]> = {};
  const diasDelMesJ = new Date(jAnio, jMes + 1, 0).getDate();
  {
    const desdeL = `${jInicio}T00:00:00-05:00`;
    const hastaL = `${jFin}T00:00:00-05:00`;
    const [{ data: hAct }, { data: hCom }, { data: hPub }] = await Promise.all([
      /* `neq("comentario")` NO es un detalle: comentar en un caso, en un
         objeto o en una postulación escribe DOS filas —una en `comentarios` y
         otra en `actividad` de tipo «comentario»— y comentar en un equipo
         escribe UNA. Sin este filtro, un día de conversación en casos pesaba
         el doble que el mismo día de conversación en la bitácora de un equipo.
         No fallaba: pintaba un pico que nadie trabajó. La ventana del día ya
         descarta ese tipo por esta misma razón; la franja se lo había
         saltado. */
      supabase.from("actividad").select("actor_id,creado_en").neq("tipo", "comentario")
        .gte("creado_en", desdeL).lt("creado_en", hastaL).limit(20000),
      supabase.from("comentarios").select("autor_id,creado_en")
        .gte("creado_en", desdeL).lt("creado_en", hastaL).limit(20000),
      /* Publicar un caso o un aviso no deja rastro en `actividad` —solo la
         fila en `publicaciones`—, así que el día que alguien abrió cinco casos
         salía en blanco. Es lo primero que lista la ventana del día. */
      supabase.from("publicaciones").select("autor_id,creado_en")
        .gte("creado_en", desdeL).lt("creado_en", hastaL).limit(20000),
    ]);
    /* De cuenta (perfiles.id) a persona: la jornada es de una PERSONA y la
       actividad la firma un USUARIO. Quien no tiene cuenta no aporta horas —y
       no pasa nada: su fila simplemente no lleva barra. */
    const personaDeUsuario = new Map<string, string>();
    (personas || []).forEach((p: any) => { if (p.usuario_id) personaDeUsuario.set(p.usuario_id, p.id); });
    const suma = (uid: string | null, at: string) => {
      const pid = uid ? personaDeUsuario.get(uid) : null;
      if (!pid || !at) return;
      /* Hora Y día, del mismo instante y en la misma zona. Calcularlos por
         separado invitaría a que uno llevara zona y el otro no —el error que
         ya nos corrió las fechas un día entero—. */
      const enLima = new Date(at).toLocaleString("en-GB", {
        day: "2-digit", hour: "2-digit", hour12: false, timeZone: "America/Lima" });
      const h = Number(enLima.slice(-2));
      const d = Number(enLima.slice(0, 2));
      if (Number.isNaN(h) || Number.isNaN(d)) return;
      (horasPorPersona[pid] ||= Array(24).fill(0))[h]++;
      (diasPorPersona[pid] ||= Array(diasDelMesJ).fill(0))[d - 1]++;
    };
    (hAct || []).forEach((x: any) => suma(x.actor_id, x.creado_en));
    (hCom || []).forEach((x: any) => suma(x.autor_id, x.creado_en));
    (hPub || []).forEach((x: any) => suma(x.autor_id, x.creado_en));
  }

  /* ── LOS PANELES, UNO POR SECCIÓN ──
     Antes cada bloque se pintaba con `{s === "x" && (…)}` dentro del return.
     Ahora son variables y las reparte `TabsPanel`, el mismo de la ficha de un
     fondo y de cada entidad: la administración era la única pantalla del
     sistema con un menú lateral propio, y aprender dos formas de moverse por
     lo mismo es aprender de más. */
      const panelPortada = (
        <>
          {/* ── Tarjetas: lo que espera acción ──
              Cada número es algo que alguien tiene que hacer, y por eso cada
              tarjeta es un enlace a donde se hace. Un número que no lleva a
              ninguna parte es un adorno. */}
          <div className="adm-kpis">
            {KPIS.map(k => (
              <Link key={k.k} href={k.href} className={`adm-kpi${k.urge ? " urge" : ""}`}>
                <span className="adm-kpi-ico" style={{ color: k.col, background: `color-mix(in srgb, ${k.col} 14%, transparent)` }}>
                  {k.ico}
                </span>
                <span className="adm-kpi-n" style={{ color: k.n === 0 ? "var(--dim)" : k.col }}>{k.n}</span>
                <span className="adm-kpi-lbl">{k.label}</span>
                {k.pie && <span className="adm-kpi-pie">{k.pie}</span>}
              </Link>
            ))}
          </div>

          <div className="adm-portada">
            <div>
              {/* ── Jornadas del mes ── */}
              <div className="card">
                <div className="panel-h">📅 Jornadas de {MESES[lMes]} · {(jornsMes || []).length}</div>
                {(jornsMes || []).length === 0 ? (
                  <div className="empty">Sin jornadas registradas este mes.</div>
                ) : (
                  <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
                    <Dona aprobadas={jAprob} pendientes={jPend} />
                    <div style={{ fontSize: 12.5 }}>
                      <Leyenda col="var(--green)" n={jAprob} txt="aprobadas" total={(jornsMes || []).length} />
                      <Leyenda col="var(--yellow)" n={jPend} txt="por aprobar" total={(jornsMes || []).length} />
                      {jPend > 0 && (
                        <Link href="/admin?s=jornadas" style={{ color: "var(--accent)", fontSize: 11.5, display: "block", marginTop: 8 }}>
                          → aprobarlas
                        </Link>
                      )}
                    </div>
                    {/* En qué se fue el mes. Barras porque la pregunta es
                        comparativa: cuál se llevó más, no cuántos exactos. */}
                    {barras.length > 0 && (
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--dim)", fontWeight: 700, marginBottom: 8 }}>
                          Días por proyecto
                        </div>
                        {barras.map(b => (
                          <div key={b.nombre} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, fontSize: 11.5 }}>
                            <span style={{ width: 110, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {b.nombre}
                            </span>
                            <span style={{ flex: 1, height: 8, background: "var(--bg)", borderRadius: 4, overflow: "hidden" }}>
                              <span style={{ display: "block", height: "100%", borderRadius: 4,
                                width: `${(b.dias / maxBarra) * 100}%`, background: "var(--accent)" }} />
                            </span>
                            <b style={{ width: 34, textAlign: "right", color: "var(--text)" }}>{b.dias}</b>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              {/* ── Alertas ── */}
              <div className="card">
                <div className="panel-h">🔔 Alertas</div>
                {ALERTAS.length === 0 ? (
                  <div className="empty" style={{ padding: "10px 0" }}>Nada pendiente. Buena señal.</div>
                ) : ALERTAS.map((a, i) => (
                  <Link key={i} href={a.href} className="adm-alerta">
                    <span style={{ color: a.col }}>●</span>
                    <span style={{ flex: 1 }}>{a.txt}</span>
                    <span style={{ color: "var(--dim)" }}>›</span>
                  </Link>
                ))}
              </div>

              {/* ── Actividad reciente ── */}
              <div className="card">
                <div className="panel-h">🕐 Últimos movimientos</div>
                {(activid || []).length === 0 ? (
                  <div className="empty" style={{ padding: "10px 0" }}>Sin actividad.</div>
                ) : (activid || []).map((a: any, i: number) => {
                  const cuerpo = (
                    <>
                      <span>{ICO_ENT[tipoCanonico(a.entidad_tipo)] || "•"}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ color: a.actor ? "var(--text)" : "var(--teal)" }}>
                          {aliasMap[a.actor_id] || a.actor?.nombre || BOT}
                        </b>
                        <i style={{ color: "var(--dim)", fontStyle: "normal" }}>
                          {" "}{a.detalle?.campo ? `cambió ${a.detalle.campo.replace(/_/g, " ")}` : a.tipo}
                        </i>
                      </span>
                      <span style={{ color: "var(--dim)", fontSize: 10.5, whiteSpace: "nowrap" }}>
                        {haceOEn(a.creado_en)}
                      </span>
                    </>
                  );
                  /* rutaEntidad decide: casos → /caso, entidades con ficha →
                     /entidad, y lo que no tiene página (o los nombres en plural
                     que escribe el trigger) → sin enlace, para no caer en 404. */
                  const ruta = rutaEntidad(a.entidad_tipo, a.entidad_id);
                  return ruta
                    ? <Link key={i} href={ruta} className="adm-act">{cuerpo}</Link>
                    : <div key={i} className="adm-act">{cuerpo}</div>;
                })}
              </div>

              {/* ── Acciones rápidas ── */}
              <div className="card">
                <div className="panel-h">⚡ Acciones rápidas</div>
                <div className="adm-acc">
                  <Link href="/jornadas" className="btn btn-ghost">📅 Registrar jornada</Link>
                  <Link href="/entidad/empresa/nuevo" className="btn btn-ghost">🏢 Nueva empresa</Link>
                  <Link href="/entidad/persona/nuevo" className="btn btn-ghost">👤 Nueva persona</Link>
                  {/* `/historial` es el global; `/historial/[tipo]` espera un
                      tipo real de entidad — «todo» le habría dado una página
                      vacía sin decir por qué. */}
                  <Link href="/historial" className="btn btn-ghost">🕐 Historial completo</Link>
                </div>
              </div>
            </div>
          </div>
        </>
      );

      const panelDestacados = (() => {
        const ahora = Date.now();
        /* `dias()` vivía aquí con `T23:59:59` y umbrales propios —rojo a los
           3 días, amarillo a los 15— mientras el feed pone el rojo a los 2 y
           el amarillo a los 7. Sale de lib/plazo. */
        const fijado = (p: any) => !!p.destacado_hasta && new Date(p.destacado_hasta).getTime() > ahora;

        const PRUEBA_D: Record<string, (p: any) => boolean> = {
          fijados: fijado,
          sin_fecha: p => !p.fecha_limite,
          vencidos: p => !!p.fecha_limite && diasHasta(p.fecha_limite) < 0,
          avisos: p => p.tipo === "aviso",
        };
        const coincide = buscadorDe(qd);   // el mismo motor que el resto
        const filtrados = (vivos || []).filter((p: any) =>
          (!fd || PRUEBA_D[fd]?.(p)) && (!qd || coincide(pal(p.titulo, p.tipo))));
        const cntD = (k: string) => (vivos || []).filter(PRUEBA_D[k]).length;

        // Los ya destacados primero; luego lo que vence antes
        const lista = [...filtrados].sort((a: any, b: any) => {
          if (fijado(a) !== fijado(b)) return fijado(a) ? -1 : 1;
          if (!!a.fecha_limite !== !!b.fecha_limite) return a.fecha_limite ? -1 : 1;
          return (a.fecha_limite || "") < (b.fecha_limite || "") ? -1 : 1;
        });
        return (
          <>
            <div className="h4" style={{ marginTop: 0 }}>📌 Destacados del feed</div>
            <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
              Lo que clavas aquí sube a la cabecera del feed. <b>Nada sube solo</b>: si todo
              destaca, nada destaca — un caso con fecha ya se ve en el feed, en el tablero y en
              el mensaje de la mañana. Esto es para lo que no te puedes permitir que se pierda.
              El destacado <b>caduca solo</b>: con la fecha límite del caso, o a las 2 semanas.
            </p>
            {/* Si algún día hay más de 300 vivos, decirlo — el recorte se
                llevaría los más antiguos, que son los que hay que rescatar */}
            {(vivos || []).length >= 300 && (
              <div className="card" style={{ borderColor: "rgba(244,180,0,.4)", color: "var(--yellow)", fontSize: 12.5 }}>
                ⚠ Hay 300 casos vivos o más y esta lista solo carga los 300 más recientes.
                Los más antiguos no aparecen — avísame para paginar esto.
              </div>
            )}

            {/* El único listado del sistema que no tenía buscador */}
            <form className="card" style={{ display: "flex", gap: 10, padding: 10 }}>
              <input type="hidden" name="s" value="destacados" />
              {fd && <input type="hidden" name="fd" value={fd} />}
              <span className="buscador-lista">
                <span className="bg-lupa">🔍</span>
                <input name="qd" defaultValue={qd} placeholder="Buscar el caso por título…" />
              </span>
              <button className="btn" type="submit">Buscar</button>
            </form>

            <PanelFiltros limpiar="/admin?s=destacados" mostrarLimpiar={!!fd || !!qd}>
              <FilaFiltro titulo="Ver">
                <Chip href="/admin?s=destacados&fd=fijados" on={fd === "fijados"} color="var(--yellow)"
                  title="Los que están arriba del feed ahora mismo">
                  📌 destacados ahora · {cntD("fijados")}
                </Chip>
                <Chip href="/admin?s=destacados&fd=sin_fecha" on={fd === "sin_fecha"} color="var(--violet)"
                  title="Sin fecha límite: nunca van a asomar por sí solos">
                  📅 sin fecha · {cntD("sin_fecha")}
                </Chip>
                <Chip href="/admin?s=destacados&fd=vencidos" on={fd === "vencidos"} color="var(--red)">
                  ⚠ vencidos · {cntD("vencidos")}
                </Chip>
                <Chip href="/admin?s=destacados&fd=avisos" on={fd === "avisos"} color="var(--violet)">
                  📢 avisos · {cntD("avisos")}
                </Chip>
              </FilaFiltro>
            </PanelFiltros>

            <div className="card">
              {lista.map((p: any) => {
                // Sin `estado`: aquí un caso resuelto CON fecha debe seguir
                // mostrando su fecha, no caer en la rama de «sin fecha».
                const pl = plazoDe(p.fecha_limite);
                return (
                  <div className="info-row" key={p.id} style={{ gap: 10, flexWrap: "wrap" }}>
                    {/* Con su ícono: esta lista es de administración y el
                        tipo se leía en texto crudo, «aviso», sin el 📢. */}
                    <span className="badge" style={{
                      color: colorTipo(p.tipo),
                      background: `${colorTipo(p.tipo)}22`,
                    }}>{rotuloTipo(p.tipo)}</span>
                    <Link href={`/caso/${p.id}`} style={{ fontWeight: 600, fontSize: 12.5 }}>{p.titulo}</Link>
                    {fijado(p) && (
                      <span className="badge" title="Está en la cabecera del feed"
                        style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>📌 arriba</span>
                    )}
                    <span style={{ flex: 1 }} />
                    {pl ? (
                      <span style={{ color: pl.color, fontSize: 11.5, fontWeight: 700 }}>
                        {pl.vencido ? `vencido hace ${-pl.d} d` : pl.d === 0 ? "vence hoy" : `en ${pl.d} d`}
                      </span>
                    ) : (
                      // Sin fecha, el caso no aparece en ningún radar por su cuenta:
                      // es justo el que más se pierde, y para el que existe esto.
                      <span style={{ color: "var(--dim)", fontSize: 11.5 }}>sin fecha</span>
                    )}
                    <BotonDestacar pubId={p.id} hasta={p.destacado_hasta} />
                  </div>
                );
              })}
              {!lista.length && <div className="empty">Sin casos con este filtro.</div>}
            </div>
          </>
        );
      })();

      const panelPlataformas = (
        <>
          <div className="h4" style={{ marginTop: 0 }}>🔗 Plataformas</div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Dónde se entra. El link vive <b>aquí una vez</b>, no repetido en cada credencial:
            al guardarlo, las credenciales de esa plataforma que no tengan uno propio lo heredan.
            Sin link, el equipo busca la plataforma en Google y entra por el primer resultado —
            que es exactamente donde viven las páginas falsas.
          </p>
          <p style={{ color: "var(--dim)", fontSize: 12, marginTop: -4 }}>
            Si una cuenta abre en varios sitios, cuélgale <b>otra entrada</b> con el nombre de para
            qué sirve: nadie entra «a SUNAT», entra a declarar el IGV. Y comprueba cada link con
            su ↗ — un link que nadie abrió es un link que no sabemos si sirve.
          </p>
          <PlataformasAdmin plataformas={plataformas} />
        </>
      );

      const panelJornadas = (
        <>
          <div className="h4" style={{ marginTop: 0 }}>
            ✅ Jornadas · <span style={{ textTransform: "capitalize" }}>{MESES[jMes]} {jAnio}</span>
          </div>
          {/* NAVEGADOR DE MES. Sin él solo se veían los meses que TENÍAN algo
              pendiente, así que una jornada ya aprobada de un mes cerrado no
              se podía corregir desde ninguna parte —aunque el servidor sí lo
              permite—. Igual que en «Liquidar mes», para que las dos pantallas
              de administración se manejen igual. */}
          <div className="vtabs" style={{ alignItems: "center", marginBottom: 8 }}>
            <Link href={`/admin?s=jornadas&jm=${jmOff - 1}`} className="vtab">‹ mes anterior</Link>
            {jmOff !== 0 && <Link href="/admin?s=jornadas&jm=0" className="vtab">actual</Link>}
            {jmOff < 0 && <Link href={`/admin?s=jornadas&jm=${jmOff + 1}`} className="vtab">siguiente ›</Link>}
            {/* Adónde está lo que espera. Con el mes navegable, entrar a uno
                tranquilo y no ver nada no debe leerse como «no hay nada». */}
            {porAprobar.length > 0 && (
              <span style={{ marginLeft: "auto", color: "var(--yellow)", fontSize: 12 }}>
                ⏳ {porAprobar.length} por aprobar en total
              </span>
            )}
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Al aprobar, la jornada entra al monto «a pagar». Puedes editar o borrar cualquiera —también
            una ya aprobada— mientras el mes de esa persona no esté confirmado ni liquidado.
          </p>
          {/* Sin plegable: la pestaña ya es la sección, el mes ya está en el
              título de arriba y el «por aprobar» al lado del navegador. Un
              rótulo que repite sus dos vecinos y que al cerrarse deja la
              pantalla vacía no es un control, es un estorbo. */}
          <BitacoraJornadas items={filasJornadas} esAdmin miPersonaId="" proyectos={proyectos || []}
            porMes diasVacios plegable={false}
            horasPorPersona={horasPorPersona} diasPorPersona={diasPorPersona}
            mesFranja={jInicio} />
        </>
      );

      const panelLiquidar = (
        <>
          <div className="h4" style={{ marginTop: 0 }}>🧾 Liquidar mes · <span style={{ textTransform: "capitalize" }}>{MESES[lMes]} {lAnio}</span></div>
          <div className="vtabs" style={{ alignItems: "center", marginBottom: 8 }}>
            <Link href={`/admin?s=liquidar&lm=${lmOff - 1}`} className="vtab">‹ mes anterior</Link>
            {lmOff !== 0 && <Link href="/admin?s=liquidar" className="vtab">actual</Link>}
            {lmOff < 0 && <Link href={`/admin?s=liquidar&lm=${lmOff + 1}`} className="vtab">siguiente ›</Link>}
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Liquidar genera el recibo interno (congela lo aprobado) y bloquea el mes de esa persona. Solo se puede si no quedan jornadas por aprobar.
          </p>
          <LiquidacionAdmin anio={lAnio} mes={lMes + 1} filas={filasLiq} />
        </>
      );

      const panelRhe = (
        <>
          <div className="h4" style={{ marginTop: 0 }}>🧾 RHE y tope de 4ta · {anioHoy}</div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Los recibos que giramos por cuenta de quienes nos delegan su clave SOL.
            Importan por dos razones: la rendición del fondo, y sobre todo el <b>tope de 4ta</b> —
            si alguien lo supera, su suspensión se rompe y corresponde retenerle el 8%
            por el resto del año. Nadie más se va a dar cuenta.
          </p>
          <RheAdmin anio={anioHoy}
            personas={(cobrables || []).map((p: any) => ({ id: p.id, nombre: p.alias || p.nombre, suspension_4ta_anio: p.suspension_4ta_anio }))}
            proyectos={proyectos || []} rhes={(rhes || []) as any} />
        </>
      );

      const panelTarifas = (
        <>
          <div className="h4" style={{ marginTop: 0 }}>💰 Tarifas del personal</div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Tarifas por día (S/ normal, rodaje y noche), usadas para calcular el pago de jornadas.
          </p>
          <TarifasEditor personas={tarifaLista} abierto />
        </>
      );
  /* El orden es el de la frecuencia: la portada, lo de cada semana, el dinero
     del mes y al final lo que se toca una vez al año. `masUltima` manda
     Plataformas al menú «⋯», que es donde vive lo que casi nunca se abre. */
  const PESTANAS: [string, string, React.ReactNode][] = [
    ["portada", "🏠 Portada", panelPortada],
    ["jornadas", `✅ Jornadas${porAprobar.length ? ` · ${porAprobar.length}` : ""}`, panelJornadas],
    ["destacados", `📌 Destacados${nDestacados ? ` · ${nDestacados}` : ""}`, panelDestacados],
    ["liquidar", `🧾 Liquidar${sinLiquidar ? ` · ${sinLiquidar}` : ""}`, panelLiquidar],
    ["rhe", `🧾 RHE y 4ta${nCerca ? ` · ${nCerca}` : ""}`, panelRhe],
    ["tarifas", "💰 Tarifas", panelTarifas],
    ["plataformas", `🔗 Plataformas${platSinLink ? ` · ${platSinLink}` : ""}`, panelPlataformas],
  ];
  /* `?s=` sigue mandando cuál abre. No es nostalgia: las alertas de la portada,
     los navegadores de mes y los enlaces que ya circulan apuntan a
     `/admin?s=jornadas&jm=-1`, y una pestaña que no sabe leer su propia URL
     los rompe todos en silencio. */
  const iSel = Math.max(0, PESTANAS.findIndex(([k]) => k === s));

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>solo administración</span>
      </div>
      <h1 className="title-lg">⚙ Administración</h1>

      {/* `perezoso`: siete secciones con sus tablas y editores no se montan
          para enseñar una. Cada panel arranca la primera vez que se abre y a
          partir de ahí se queda montado — así no se pierde el filtro ni el
          scroll al ir y volver, que es lo que costaría desmontarlos al salir. */}
      <TabsPanel inicial={iSel} masUltima perezoso
        labels={PESTANAS.map(([, l]) => l)}
        paneles={PESTANAS.map(([k, , nodo]) => <div key={k}>{nodo}</div>)} />
    </div>
  );
}
