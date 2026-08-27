"use client";
import NavFechas from "@/components/NavFechas";
import Avatar from "@/components/Avatar";
import { hayQueDecirEstado, apagadoHoy, TOPE_GRUPOS } from "@/lib/portadaHoy";
import { ESTADO_ICO, ESTADO_TXT, ESTADO_COL } from "@/lib/estados";
import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import Link from "@/components/Enlace";
import { icoTipo, colorTipo } from "@/lib/tipos";
import VistaRapida from "@/components/VistaRapida";
import { colorEtapa, nombreEtapa, etapasDe, ETAPAS_CINE } from "@/lib/etapas";
import { COLOR_ENTIDAD } from "@/lib/entidades";
import { TXT } from "@/lib/texto";
import { diaLima } from "@/lib/fechas";

/* AGENDA — todo lo que tiene fecha, en dos vistas.
   Línea de tiempo (barras por proyecto, con la duración inicio→fin de cada
   actividad y la fecha límite de cada caso) y calendario mensual. La data
   viene entera del servidor; aquí se filtra por persona y se cambia de vista
   sin recargar. */

export type ItemAgenda = {
  id: string;
  kind: "act" | "caso";
  titulo: string;
  ini: string;             // YYYY-MM-DD
  fin: string;             // YYYY-MM-DD (caso: = fecha límite)
  /* ── ¿ESE `ini` ES UN DATO O UN RELLENO? ──
     Una actividad del cronograma siempre tiene ventana. Un caso solo la tiene
     si alguien le puso `fecha_inicio`; si no, `ini` sale de `creado_en`, que
     es un respaldo razonable para dibujar un tramo tenue pero NO es una
     afirmación sobre cuándo empieza el trabajo.
     La diferencia importa donde se ocupa espacio en nombre del dato: en el
     calendario mensual, pintar todos los casos en todos los días desde que se
     escribieron llenaría el mes de ruido. Con esta bandera, solo se extienden
     los que de verdad duran. */
  ventana?: boolean;
  estado: string;
  etapa?: string;          // color de la actividad
  orden?: number;          // desempate manual dentro de la etapa (del cronograma)
  creado?: string;         // desempata el desempate, para que no bailen
  cat?: string;            // categoría de la convocatoria → preset de etapas
  tipo?: string;           // ícono del caso
  /** A qué hora ocurre, 'HH:MM'. Solo lo que pasa a una hora (una reunión). */
  hora?: string;
  respId: string | null;
  nc?: number;             // comentarios del caso (0 o ausente = no se pinta)
  personas: string[];      // responsable + equipo, para el filtro
  grupo: string;           // rótulo del grupo (su proyecto, fondo, empresa…)
  /** Las personas vinculadas, ya con su cara. Van como avatares y no como
   *  texto: una cara se reconoce de un vistazo y un nombre hay que leerlo. */
  caras?: { nombre: string; color?: string; avatar_url?: string }[];
  /** El estado del CASO, para las actividades materializadas: el `estado` de
   *  arriba es el de la actividad (en curso, materializada…) y no se puede
   *  leer con el vocabulario de las publicaciones. */
  estadoCaso?: string;
  /** TODOS los vínculos, ya nombrados y ordenados: el que agrupa primero.
   *  Un caso cuelga de varias cosas y el grupo es solo una — una reunión
   *  existe por a quién convoca, y con el grupo solo cae en «Casos sueltos». */
  grupos?: string[];
  grupoId: string;
  href: string;
};

const DAY = 86400000;
/* Los tres anchos viajan juntos: LBL y RESP tienen copia en el CSS
   (.ag-tl-lbl / .ag-tl-resp) y OFF ancla rejilla, eje y línea de HOY. Si uno
   se mueve sin el otro, el eje deja de coincidir con las barras.
   La columna del responsable ya no lleva texto sino una cara de 20px: los
   32px que sobraban se los queda el título, que sí los necesita. */
const LBL = 244;           // ancho de la columna de rótulos (px)
const RESP = 36;           // ancho de la columna del responsable (px)
const OFF = LBL + RESP;    // dónde empieza la pista: rejilla y eje se anclan aquí
// Zoom de la ventana visible del timeline (días). El default (2 meses) es
// parecido a las 10 semanas de antes.
const ZOOMS = [
  { lbl: "1 mes", d: 31 },
  { lbl: "2 meses", d: 62 },
  { lbl: "3 meses", d: 93 },
  { lbl: "6 meses", d: 186 },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pd = (s: string) => new Date(s + "T12:00:00").getTime();
const fmtCorto = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });


export default function Agenda({ items, perfiles, miId }: {
  items: ItemAgenda[];
  perfiles: { id: string; nombre: string; avatar_url?: string | null; color?: string | null }[];
  miId: string;
}) {
  const [vista, setVista] = useState<"tl" | "cal">("tl");
  const [persona, setPersona] = useState("");   // "" = todo el equipo
  const [shift, setShift] = useState(0);         // días, línea de tiempo
  const [mesOff, setMesOff] = useState(0);       // meses, calendario

  const nombreDe = (id: string | null) => id ? (perfiles.find(p => p.id === id)?.nombre || "") : "";
  const cortoDe = (id: string | null) => nombreDe(id).split(" ")[0];
  const perfilDe = (id: string | null) => (id ? perfiles.find(p => p.id === id) : null) || null;

  const vis = items.filter(it => !persona || it.personas.includes(persona));

  /* Prendido / apagado, igual que el tablero: el "foco" es la persona filtrada
     o, si es "Todo el equipo", uno mismo. Se prende lo que ESA persona tiene a
     su cargo (es la responsable) y se apaga lo demás —donde solo apoya o que es
     de otro—, para reconocer de un vistazo lo propio en la agenda entera. */
  const foco = persona || miId;
  const apagado = (it: ItemAgenda) => !!foco && it.respId !== foco;

  /* El color dice la cosa: la actividad, su etapa; el caso, su TIPO (tarea,
     aviso, problema…). La urgencia ya la lee la línea roja de HOY —cerca a la
     derecha, lejos a la izquierda—, así que el color no necesita repetirla:
     queda libre para identificar de qué clase es cada caso de un vistazo. */
  const colorDe = (it: ItemAgenda) =>
    it.kind === "act"
      ? colorEtapa(it.etapa || "")
      : colorTipo(it.tipo || "");

  const icoDe = (it: ItemAgenda) => it.kind === "caso" ? icoTipo(it.tipo || "") : "▬";

  return (
    <>
      {/* ── Controles: título + vista + persona ── */}
      {/* El h1 vivía en su propio renglón, con toda la anchura de la pantalla
          para dos palabras. En una línea de tiempo el sitio vertical ES el
          contenido: cada renglón de cabecera es una fila de trabajo menos a la
          vista. El título se muda aquí, al lado de las pestañas de vista, que
          es donde ya se está mirando. */}
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <h1 className="ag-titulo">📅 Agenda</h1>
        <div className="vtabs" style={{ margin: 0 }}>
          <button className={`vtab ${vista === "tl" ? "on" : ""}`} onClick={() => setVista("tl")}>📊 Línea de tiempo</button>
          <button className={`vtab ${vista === "cal" ? "on" : ""}`} onClick={() => setVista("cal")}>🗓 Calendario</button>
        </div>
        <span style={{ flex: 1 }} />
        <label style={{ color: "var(--dim)", fontSize: TXT.micro, display: "flex", alignItems: "center", gap: 6 }}>
          👤
          <select value={persona} onChange={e => setPersona(e.target.value)}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: TXT.micro, color: "var(--text)", outline: "none" }}>
            <option value="">Todo el equipo</option>
            {miId && <option value={miId}>🙋 Solo lo mío</option>}
            {perfiles.filter(p => p.id !== miId).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>
          {vis.length} · <span style={{ color: "var(--muted)" }}>{vis.filter(i => i.kind === "act").length} activ.</span> · <span style={{ color: "var(--muted)" }}>{vis.filter(i => i.kind === "caso").length} casos</span>
        </span>
      </div>

      {vista === "tl"
        ? <Timeline vis={vis} shift={shift} setShift={setShift} colorDe={colorDe} icoDe={icoDe} cortoDe={cortoDe} perfilDe={perfilDe} apagado={apagado} />
        : <Calendario vis={vis} mesOff={mesOff} setMesOff={setMesOff} colorDe={colorDe}
            icoDe={icoDe} apagado={apagado} perfilDe={perfilDe} />}

      {/* Leyenda de etapas. Muestra las de cine (las comunes); cada categoría
          reusa esta paleta, así que sirve de referencia aunque los nombres
          exactos varíen por categoría. */}
      <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: TXT.chip, color: "var(--dim)", marginTop: 12 }}>
        {ETAPAS_CINE.map(e => (
          <span key={e.clave}><i style={{ display: "inline-block", width: 16, height: 7, background: e.color, borderRadius: 4, verticalAlign: "middle", marginRight: 4 }} />{e.nombre}</span>
        ))}
        <span style={{ marginLeft: 6 }}>· los <b style={{ color: "var(--violet)" }}>casos</b> se colorean por urgencia (rojo = vencido)</span>
      </div>
    </>
  );
}

/* ───────────────────────── LÍNEA DE TIEMPO ───────────────────────── */
function Timeline({ vis, shift, setShift, colorDe, icoDe, cortoDe, perfilDe, apagado }: {
  vis: ItemAgenda[]; shift: number; setShift: Dispatch<SetStateAction<number>>;
  colorDe: (it: ItemAgenda) => string; icoDe: (it: ItemAgenda) => string; cortoDe: (id: string | null) => string;
  perfilDe: (id: string | null) => { nombre: string; avatar_url?: string | null; color?: string | null } | null;
  apagado: (it: ItemAgenda) => boolean;
}) {
  /* Grupos plegables (como el tablero): plegar los proyectos que uno no mira
     devuelve alto a los que sí. La preferencia es personal —vive en
     localStorage, no en la URL— y se lee en useEffect para no desajustar la
     hidratación. */
  const CLAVE = "ag-tl-colapsados";
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { const raw = localStorage.getItem(CLAVE); if (raw) setColapsados(new Set(JSON.parse(raw))); } catch { /* modo privado */ }
  }, []);
  const guardar = (n: Set<string>) => {
    try { localStorage.setItem(CLAVE, JSON.stringify([...n])); } catch { /* modo privado */ }
    return n;
  };
  const plegar = (gid: string) => setColapsados(prev => {
    const n = new Set(prev);
    n.has(gid) ? n.delete(gid) : n.add(gid);
    return guardar(n);
  });
  /* ── PLEGAR O DESPLEGAR TODO ──
     Con nueve grupos, dejar la agenda como uno la quiere costaba nueve clics,
     y al día siguiente otros nueve para volver. Se guarda igual que el plegado
     de a uno —misma clave—, así que «ver solo lo mío plegado» sobrevive a la
     recarga.
     Un solo botón y no dos: su rótulo dice lo que VA A HACER, así que nunca
     hay uno de los dos que no haga nada. Con algo abierto, pliega; con todo
     cerrado, despliega. */
  const plegarTodo = (gids: string[]) => setColapsados(() => guardar(new Set(gids)));
  const desplegarTodo = () => setColapsados(() => guardar(new Set()));

  // Zoom de la ventana (persistente por navegador).
  const [zoom, setZoom] = useState(1);   // índice en ZOOMS (default: 2 meses)
  useEffect(() => {
    // Leer el raw antes de Number(): sin clave, getItem→null y Number(null)===0,
    // que pasaría el guard y forzaría "1 mes" pisando el default "2 meses".
    try { const raw = localStorage.getItem("ag-tl-zoom"); const z = Number(raw); if (raw !== null && z >= 0 && z < ZOOMS.length) setZoom(z); } catch { }
  }, []);
  const cambiarZoom = (z: number) => { setZoom(z); try { localStorage.setItem("ag-tl-zoom", String(z)); } catch { } };
  const ventanaDias = ZOOMS[zoom].d;

  const hoy0 = new Date();
  const baseD = new Date(hoy0.getFullYear(), hoy0.getMonth(), hoy0.getDate() - 7 + shift);
  const inicioT = new Date(baseD.getFullYear(), baseD.getMonth(), baseD.getDate(), 12).getTime();
  const finT = inicioT + ventanaDias * DAY;
  const pct = (t: number) => ((t - inicioT) / (finT - inicioT)) * 100;
  const hoyPct = pct(pd(ymd(hoy0)));
  // La fecha "foco" (7 días dentro de la ventana, donde cae HOY sin desplazar):
  // el selector la muestra y saltar a otra fecha la recoloca ahí.
  const fechaFoco = ymd(new Date(inicioT + 7 * DAY));
  const irAFecha = (iso: string) => {
    if (!iso) return;
    const d = new Date(iso + "T12:00:00").getTime();
    setShift(Math.round((d - pd(ymd(hoy0))) / DAY));
  };

  /* Solo lo que cruza la ventana visible.
     El borde izquierdo del dibujo ya no es `ini`: en un caso con ventana, la
     fila empieza en el día en que se APUNTÓ. Filtrando por `ini` desaparecía
     entera justo la fila que el tramo de espera venía a contar —«lo apunté
     hace mes y medio y todavía no empieza»— cuando su inicio caía más allá
     del zoom. Se filtra por lo que de verdad se pinta. */
  const izqDe = (it: ItemAgenda) => {
    const c = it.kind === "caso" && it.ventana ? diaLima(it.creado || "") : "";
    return pd(c && c < it.ini ? c : it.ini);
  };
  const dentro = vis.filter(it => pd(it.fin) + DAY >= inicioT && izqDe(it) < finT);

  // Agrupar por proyecto. Cada caso viene ya con el grupo de su vínculo.
  const byGroup = new Map<string, { label: string; items: ItemAgenda[] }>();
  dentro.forEach(it => {
    const g = byGroup.get(it.grupoId) || { label: it.grupo, items: [] };
    g.items.push(it); byGroup.set(it.grupoId, g);
  });
  /* Orden: proyectos → fondos → convocatorias → empresas → sueltos. Antes era
     alfabético a secas y los proyectos salían partidos alrededor del bloque
     "C-0xx" (15Emi arriba por el dígito, SanEsteban al final por la S). El
     prefijo del grupoId dice el tipo: p: proyecto, postu: fondo, c:
     convocatoria, e: empresa. Dentro de cada bloque, alfabético (las
     convocatorias, por su código).
     ── LOS SUELTOS, AL FINAL ──
     El bloque de casos iba PRIMERO cuando era «Casos» y contenía todos: era la
     mitad de la agenda. Ahora cada caso vive con su película y ahí solo quedan
     los que no cuelgan de nada; abrir la agenda con lo que no tiene contexto
     sería empezar por lo que menos se entiende. */
  const rango = (gid: string) =>
    gid === "__casos__" ? 6 : gid.startsWith("postu:") ? 2
      : gid.startsWith("p:") ? 1 : gid.startsWith("c:") ? 3
      : gid.startsWith("e:") ? 4 : 5;
  const grupos = [...byGroup.entries()].sort((a, b) =>
    rango(a[0]) - rango(b[0]) || a[1].label.localeCompare(b[1].label));
  /* Dentro de cada grupo, el MISMO orden que su cronograma: el `orden` manual
     manda —la secuencia que decidió una persona: primero se alistan los
     equipos, después rueda cámara A, después B—, la fecha es el desempate por
     defecto y `creado_en` desempata el desempate para que dos con el mismo
     orden no bailen entre recargas.
     ⚠ Tiene que ser idéntico al comparador de CronogramaProyecto.tsx (y al
     `cmpEtapa` de actions.ts): si la agenda ordena por fecha a secas, la misma
     etapa se lee en un orden aquí y en otro allá, y ninguno de los dos parece
     roto — solo se contradicen. Los casos no tienen `orden`: caen todos en 0 y
     el comparador se reduce a la fecha entre ellos. Y su `orden` es el
     máximo posible, así que caen DESPUÉS del cronograma de su grupo: con el 0
     de antes se colaban encima y partían en dos la secuencia que alguien
     decidió. */
  const cmp = (x: ItemAgenda, y: ItemAgenda) =>
    (x.orden ?? 0) !== (y.orden ?? 0) ? (x.orden ?? 0) - (y.orden ?? 0)
    : x.ini !== y.ini ? (x.ini < y.ini ? -1 : 1)
    /* Mismo día: manda la hora. Dos reuniones del martes puestas al revés no
       es un detalle — en un día, el orden ES la información. Lo que no tiene
       hora va primero: no se sabe cuándo, así que no puede reclamar un sitio
       entre dos que sí lo saben. */
    : (x.hora || "") !== (y.hora || "") ? ((x.hora || "") < (y.hora || "") ? -1 : 1)
    : (x.creado || "") < (y.creado || "") ? -1 : (x.creado || "") > (y.creado || "") ? 1 : 0;
  grupos.forEach(([, g]) => g.items.sort(cmp));
  /* Se mira contra los grupos VISIBLES y no contra el tamaño de `colapsados`:
     esa lista guarda también los de una ventana de fechas anterior, así que
     podría estar llena mientras en pantalla está todo abierto. */
  const hayAbierto = grupos.some(([gid]) => !colapsados.has(gid));

  // Marcas del eje: el paso se adapta al zoom para no amontonar etiquetas
  // (semanal en ventanas cortas, quincenal/mensual en las largas). Sin el tick
  // final (su etiqueta, centrada en 100%, se salía por la derecha).
  const paso = ventanaDias <= 70 ? 7 : ventanaDias <= 100 ? 14 : 30;
  const semanas = Array.from({ length: Math.ceil(ventanaDias / paso) }, (_, i) => {
    const t = inicioT + i * paso * DAY;
    return { pct: pct(t), lbl: fmtCorto(ymd(new Date(t))) };
  });

  return (
    <div className="card">
      <NavFechas
        onHoy={() => setShift(0)}
        onPrev={() => setShift(s => s - 30)}
        onNext={() => setShift(s => s + 30)}
        fecha={fechaFoco} onFecha={irAFecha}
        zooms={ZOOMS} zoom={zoom} onZoom={cambiarZoom}
        rango={`${fmtCorto(ymd(new Date(inicioT)))} — ${fmtCorto(ymd(new Date(finT - DAY)))}`}
        /* ── UN RENGLÓN MENOS ──
           Esto vivía en su propia línea entre la barra de fechas y el primer
           grupo. Dos controles de la misma cosa —cómo se ve la lista— en dos
           renglones distintos: el de arriba mandaba en el tiempo y el de abajo
           en la forma, y el que perdía sitio era el contenido. Cabe aquí. */
        extra={grupos.length > 1 ? (
          <>
            <button className="ag-tl-todo-btn"
              onClick={() => hayAbierto ? plegarTodo(grupos.map(([gid]) => gid)) : desplegarTodo()}>
              {hayAbierto ? "▸ Plegar todo" : "▾ Desplegar todo"}
            </button>
            <span className="ag-tl-todo-n">
              {grupos.length} grupo{grupos.length === 1 ? "" : "s"}
              {hayAbierto && colapsados.size ? ` · ${colapsados.size} plegado${colapsados.size === 1 ? "" : "s"}` : ""}
            </span>
          </>
        ) : null} />

      {!dentro.length && <div className="empty" style={{ padding: "20px 0" }}>Nada con fecha en esta ventana.</div>}

      {!!dentro.length && (
        <div className="ag-tl-body">
          {/* Rejilla + línea de HOY, superpuestas sobre las filas */}
          <div className="ag-tl-lineas" style={{ left: OFF }}>
            {semanas.map((s, i) => <i key={i} style={{ left: `${s.pct}%` }} />)}
            {hoyPct >= 0 && hoyPct <= 100 && <span className="hoy" style={{ left: `${hoyPct}%` }} />}
          </div>

          {/* Eje de fechas (posiciona con el mismo offset de la columna de rótulos) */}
          <div className="ag-tl-axis">
            {semanas.map((s, i) => (
              <span key={i} style={{ left: `calc(${OFF}px + (100% - ${OFF}px) * ${s.pct / 100})` }}>{s.lbl}</span>
            ))}
          </div>

          {grupos.map(([gid, g]) => {
            const cerrado = colapsados.has(gid);
            /* Acceso rápido al cronograma: el título del proyecto/convocatoria
               enlaza a su ficha (donde vive el cronograma completo). La flecha
               ▾ sigue siendo solo el plegar. Casos no tiene ficha → sin link. */
            /* Un grupo `postu:` en la agenda es un FONDO EN EJECUCIÓN —las
               postulaciones en concurso no llegan aquí, ver app/agenda/page.tsx—
               así que el enlace va a su ejecución y no al expediente: el
               cronograma que se está viendo es el del fondo, y el expediente
               enseña la foto de lo postulado, que es otra cosa.
               `#audiovisual` abre la pestaña donde vive ese cronograma; sin el
               ancla se aterriza en Financiera y hay que buscarlo. */
            const hrefGrupo = gid.startsWith("postu:") ? `/fondo/${gid.slice(6)}#audiovisual`
              : gid.startsWith("p:") ? `/entidad/proyecto/${gid.slice(2)}`
              : gid.startsWith("c:") ? `/entidad/convocatoria/${gid.slice(2)}`
              : gid.startsWith("e:") ? `/entidad/empresa/${gid.slice(2)}` : null;
            /* El 📁 solo donde el rótulo no trae ya el suyo. Los grupos que se
               nombran a sí mismos —🎬 un fondo, 🏢 una empresa, 🗂 los sueltos—
               salían con dos iconos pegados, que se lee como un error de copia.
               Y el rótulo de los sueltos sale del DATO y no de un literal aquí:
               estaba escrito «🗂 Casos» a mano, así que el nombre que arma la
               página no se veía nunca y la lista se ordenaba por un texto que
               no estaba en pantalla. */
            /* ── CADA GRUPO, DEL COLOR DE LO QUE ES ──
               Las cabeceras eran texto gris sobre una línea gris, así que
               veinte filas y seis cabeceras se leían como una sola lista
               larga: para saber dónde empieza un proyecto había que leer.
               El color no se inventa aquí — sale de `COLOR_ENTIDAD`, el mismo
               que usa el buscador para teñir sus bloques y el que enseña la
               ficha de cada entidad. Violeta un proyecto, verde un fondo,
               ámbar una convocatoria, teal una empresa. Así la agenda no
               estrena un vocabulario de colores propio: usa el que el ojo ya
               aprendió en las otras pantallas. */
            const colGrupo = gid.startsWith("p:") ? COLOR_ENTIDAD.proyecto
              : gid.startsWith("postu:") ? COLOR_ENTIDAD.postulacion
              : gid.startsWith("c:") ? COLOR_ENTIDAD.convocatoria
              : gid.startsWith("e:") ? COLOR_ENTIDAD.empresa
              : "var(--dim)";
            const propio = /^\p{Extended_Pictographic}/u.test(g.label);
            const titulo = gid === "__casos__" ? `🗂 ${g.label}`
              : propio ? g.label : `📁 ${g.label}`;
            return (
            <div key={gid}>
              <div className="ag-tl-grupo" style={{ ["--gcol" as any]: colGrupo }}>
                <button className="ag-tl-caret" onClick={() => plegar(gid)}
                  title={cerrado ? "Desplegar" : "Plegar"} aria-label={cerrado ? "Desplegar" : "Plegar"}>
                  {cerrado ? "▸" : "▾"}
                </button>
                {hrefGrupo
                  ? <Link href={hrefGrupo} className="ag-tl-gtit" title="Abrir el cronograma">
                      {titulo} <span className="ag-tl-flecha">→</span>
                    </Link>
                  : <span className="ag-tl-gtit">{titulo}</span>}
                <span className="ag-tl-gn">{g.items.length}</span>
              </div>
              {/* FASES dentro del grupo. Un proyecto de veintitrés actividades
                   es ilegible de corrido: separarlo por etapa devuelve la
                   lectura de «en qué momento del proyecto va esto».
                   Las fases van en el orden de su PRESET, no por su primera
                   fecha: un documental empieza por Investigación aunque alguna
                   tarea de Preproducción arranque antes, y ordenarlas por
                   calendario ponía la agenda a contradecir al cronograma. Cada
                   grupo es un solo proyecto/convocatoria, así que su categoría
                   —la de todos sus ítems— basta para saber cuál es el preset;
                   sin categoría, `etapasDe` devuelve el de cine, que es el que
                   usan los cronogramas de proyecto. Una etapa que no esté en el
                   preset cae al final, y ahí sí manda la fecha. Lo que no tiene
                   etapa —los casos— cae en la última tanda, rotulada aparte. */}
              {!cerrado && (() => {
                const porEtapa = new Map<string, ItemAgenda[]>();
                g.items.forEach(it => {
                  const k = it.etapa || "";
                  porEtapa.set(k, [...(porEtapa.get(k) || []), it]);
                });
                const preset = etapasDe(g.items[0]?.cat || "").map(e => e.clave);
                const pos = (et: string) => { const i = preset.indexOf(et); return i < 0 ? 999 : i; };
                const fases = [...porEtapa.entries()].sort((a, b) =>
                  pos(a[0]) !== pos(b[0]) ? pos(a[0]) - pos(b[0])
                  : (a[1][0]?.ini || "") < (b[1][0]?.ini || "") ? -1 : 1);
                const hayFases = fases.some(([k]) => k);
                return fases.map(([et, items]) => (
                  <div key={et || "_"}>
                    {hayFases && et && (
                      <div className="ag-tl-fase">
                        <i style={{ background: colorEtapa(et) }} />
                        {nombreEtapa(et)}
                      </div>
                    )}
                    {/* La tanda SIN etapa, cuando el grupo tiene fases, son los
                        casos: cuelgan del proyecto pero no del cronograma. Se
                        rotulan igual que las fases porque si no se pegan a la
                        última —«Postproducción» y debajo tres casos sin nada
                        que los separe— y parecen parte de ella. */}
                    {hayFases && !et && items.some(x => x.kind === "caso") && (
                      <div className="ag-tl-fase">
                        <i style={{ background: "var(--dim)" }} />
                        Casos
                      </div>
                    )}
                    {items.map(it => {
                const left = Math.max(0, pct(pd(it.ini)));
                const right = Math.min(100, pct(pd(it.fin) + DAY));
                const w = Math.max(right - left, 1.5);
                const col = colorDe(it);
                const rango = it.fin !== it.ini;   // tiene inicio y fin distintos
                /* El tramo de ESPERA: de cuando se apuntó el caso a cuando
                   empieza el trabajo. Solo existe si hay ventana de verdad
                   —sin ella, `ini` YA es la fecha de creación y dibujarlo
                   sería una línea sobre sí misma— y solo si se apuntó antes:
                   un rodaje que se registra a mitad de rodaje no tiene espera
                   que enseñar, y sin este guard la línea saldría hacia atrás. */
                /* `diaLima` y no `slice(0,10)`: `creado_en` es un instante en
                   UTC, y cortarle diez caracteres da el día UTC — a partir de
                   las 7 de la tarde en Perú, el día SIGUIENTE. Aquí eso no
                   movía el punto un pelo: un caso escrito el 31 a las 20:00
                   para empezar el 1 daba `creado === ini` y la cola de espera
                   desaparecía entera. lib/fechas ya tenía la función y la
                   advertencia escrita. */
                const creadoYMD = diaLima(it.creado || "");
                /* Solo en CASOS. En una actividad del cronograma, `creado_en`
                   es el día en que alguien escribió el plan —meses antes, casi
                   siempre— y no dice nada del trabajo: veintitrés colas
                   punteadas cruzando la pantalla taparían justamente lo que se
                   viene a mirar. En un caso, en cambio, «lo apunté el 18 y
                   empieza el 1» es la historia de esa fila. */
                const espera = it.kind === "caso" && !!it.ventana
                  && !!creadoYMD && creadoYMD < it.ini;
                /* El ancho de la marca final, en % de la pista. Uno solo para
                   todas las filas: tenerlo más gordo en las que no tienen
                   ventana partía la lista en dos tamaños según un dato que no
                   dice nada del tamaño. Sin rango, la marca ES el tramo —un
                   día— y ocupa lo que ocupa ese día. */
                const marca = rango ? 1.2 : w;
                const leftCreado = espera ? Math.max(0, pct(pd(creadoYMD))) : left;
                /* Un solo texto para las dos marcas de la fila: si el punto de
                   inicio y la marca final dijeran cosas distintas, la misma
                   actividad se leería como dos.
                   Con ventana el tramo va en barra sólida y sin ella en
                   punteado, y el texto tampoco puede afirmar lo mismo en los
                   dos casos: «del 23 ene al 20 ago» sobre una fecha de
                   creación es una frase sobre el trabajo que nadie escribió.
                   Con ventana dice «→»; sin ella, «apuntado el …». */
                /* La hora va pegada a SU fecha y no al final de la frase: al
                   final se leía «… apuntado el 18 ago a las 10:00», o sea la
                   hora del apunte, que es justo lo que no es. */
                const cuando = `${fmtCorto(it.fin)}${it.hora ? ` a las ${it.hora}` : ""}`;
                const tramo = it.hora ? cuando
                  : it.ventana
                  ? `${fmtCorto(it.ini)}${rango ? ` → ${fmtCorto(it.fin)}` : ""}`
                  : rango ? `vence ${fmtCorto(it.fin)} · apuntado el ${fmtCorto(it.ini)}`
                  : fmtCorto(it.fin);
                /* El punto se mudó a la fecha de creación, así que el texto
                   tiene que decirla: si no, hay un punto dibujado en un día
                   que no se puede averiguar por ninguna parte —y con el zoom
                   corto, ese punto se recorta al borde izquierdo y encima
                   miente sobre dónde está—. */
                const tip = `${it.titulo} · ${tramo}${espera ? ` · apuntado el ${fmtCorto(creadoYMD)}` : ""}${it.respId ? ` · ${cortoDe(it.respId)}` : ""}`;
                return (
                  <div className={`ag-tl-row ${apagado(it) ? "ag-ajena" : ""}`} key={it.id}>
                    <div className="ag-tl-lbl">
                      {/* Trabajar al vuelo: solo los casos son publicaciones; las
                          actividades del cronograma no. Va dentro del rótulo (ancho
                          fijo) para no descuadrar el eje temporal de la pista. */}
                      {/* Cualquier fila que apunte a un caso, no solo las del
                          grupo «Casos»: una actividad de cronograma ya
                          materializada TIENE caso, y su href ya es /caso/… —
                          solo faltaba dejar de preguntar por el `kind`. */}
                      {it.href.startsWith("/caso/") && (
                        <VistaRapida pubId={it.href.slice("/caso/".length)} />
                      )}
                      <Link href={it.href} className="ag-tl-lbl-txt" title={it.titulo}>
                        {icoDe(it)} {it.titulo}
                      </Link>
                      {/* La hora va pegada al título y no en la pista: ahí un
                          día mide seis píxeles y «10:00» no cabe — y es lo
                          primero que se pregunta de una reunión. */}
                      {it.hora && <span className="ag-tl-hora">{it.hora}</span>}
                      {/* Solo las filas que tienen conversación gastan ancho:
                          un «💬 0» en veintitrés filas es ruido, y el título
                          necesita cada píxel. */}
                      {!!it.nc && (
                        <span className="ag-tl-nc" title={`${it.nc} comentario${it.nc === 1 ? "" : "s"}`}>
                          💬 {it.nc}
                        </span>
                      )}
                    </div>
                    {/* La cara y no el nombre: en una lista de veintitrés filas,
                        «Michel» repetido quince veces no distingue nada y ocupa
                        una columna entera. El nombre vive en el `title`. */}
                    <span className="ag-tl-resp" title={perfilDe(it.respId)?.nombre || "sin responsable"}>
                      {it.respId
                        ? <Avatar size={20} nombre={perfilDe(it.respId)?.nombre}
                            src={perfilDe(it.respId)?.avatar_url} color={perfilDe(it.respId)?.color} />
                        : <i style={{ opacity: .35, fontStyle: "normal" }}>—</i>}
                    </span>
                    <div className="ag-tl-track">
                      {/* ── PUNTEADO = ESPERA · SÓLIDO = TRABAJO ──
                          Un mismo renglón cuenta dos cosas distintas y hasta
                          ahora las dibujaba igual: desde que el caso se apuntó
                          hasta que empieza NO se está trabajando, se está
                          esperando; del inicio al vencimiento sí.
                          Por eso la ventana real —la que alguien escribió— va
                          en barra fina y llena, y lo demás sigue punteado. El
                          punteado dice «esto es lo único que sabemos»: en un
                          caso sin `fecha_inicio` arranca en la fecha en que se
                          escribió, que es una suposición, no un dato. */}
                      {espera && (
                        <span className="ag-tl-span"
                          style={{ left: `${leftCreado}%`, width: `${Math.max(left - leftCreado, 0)}%`, borderColor: col }} />
                      )}
                      {rango && (
                        it.ventana
                          /* Se detiene ANTES de la marca final (1.6 %, su
                             ancho): la marca de un caso es hueca a propósito
                             —«hueca = caso, rellena = actividad»— y una barra
                             sólida cruzándola por dentro deshacía esa
                             distinción justo en la fila donde más se mira. */
                          /* Enlace y no adorno: la barra es la parte de la
                             fila que dice de cuándo a cuándo, y era lo único
                             que no se podía tocar ni preguntar. El texto de
                             ayuda estaba solo en dos marcas de ocho píxeles;
                             ahora está en todo el tramo, que es donde el ojo
                             ya está cuando se pregunta «¿esto qué es?». */
                          ? <Link href={it.href} className="ag-tl-vent" title={tip}
                              style={{ left: `${left}%`, width: `${Math.max(w - marca, 0.5)}%`, color: col }} />
                          : <span className="ag-tl-span"
                              style={{ left: `${left}%`, width: `${w}%`, borderColor: col }} />
                      )}
                      {/* ── EL TRIÁNGULO DICE «AQUÍ EMPIEZA» ──
                          Un punto redondo marca un instante; la punta de
                          flecha marca un instante Y una dirección, que es lo
                          que hace falta al principio de un tramo que corre
                          hacia la derecha. Además separa de un vistazo las dos
                          fechas de la fila: triángulo = arranca, cuadrado =
                          vence. Solo donde hay ventana de verdad: en una fila
                          sin `fecha_inicio` no hay arranque que señalar, solo
                          el día en que se apuntó. */}
                      {rango && it.ventana && (
                        <span className="ag-tl-tri" title={tip}
                          style={{ left: `${left}%`, borderLeftColor: col }} />
                      )}
                      {/* Punto de arranque: sin él, el tramo punteado se pierde
                          contra la rejilla y solo se ve la fecha final. El punto
                          dice «aquí empieza» sin competir con la marca clave.
                          Con espera, el punto se va al DÍA EN QUE SE APUNTÓ —el
                          principio de lo que se dibuja— y el comienzo del
                          trabajo lo marca ya el cambio de punteado a barra. */}
                      {(rango || espera) && !(rango && it.ventana && !espera) && (
                        <Link href={it.href} className="ag-tl-ini" title={tip}
                          style={{ left: `${espera ? leftCreado : left}%`, background: col }} />
                      )}
                      {/* Marca en la fecha clave: al final del rango, o en su única
                          fecha si no hay rango. Hueca para casos, rellena para
                          actividades — la misma identidad de color de siempre. */}
                      <Link href={it.href} title={tip} className="ag-tl-bar"
                        style={{
                          left: `${rango ? Math.max(0, right - marca) : left}%`,
                          width: `${marca}%`,
                          background: it.kind === "caso" ? "transparent" : col,
                          border: `2px solid ${col}`,
                        }} />
                    </div>
                  </div>
                );
              })}
                  </div>
                ));
              })()}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── CALENDARIO ───────────────────────── */
function Calendario({ vis, mesOff, setMesOff, colorDe, icoDe, apagado, perfilDe }: {
  vis: ItemAgenda[]; mesOff: number; setMesOff: Dispatch<SetStateAction<number>>;
  colorDe: (it: ItemAgenda) => string; icoDe: (it: ItemAgenda) => string;
  apagado: (it: ItemAgenda) => boolean;
  /** Para pintar la cara de quien lo tiene. Viene de fuera —el padre ya tiene
   *  la lista de perfiles— en vez de recibir el arreglo entero: aquí solo hace
   *  falta buscar por id. */
  perfilDe: (id: string | null) => { nombre: string; avatar_url?: string | null; color?: string | null } | null;
}) {
  const hoyKey = ymd(new Date());
  const base = new Date();
  const calBase = new Date(base.getFullYear(), base.getMonth() + mesOff, 1);
  const y = calBase.getFullYear(), m = calBase.getMonth();
  const primerDow = (new Date(y, m, 1).getDay() + 6) % 7;   // lunes = 0
  const diasMes = new Date(y, m + 1, 0).getDate();

  /* Un ítem cae en un día si el día está dentro de su rango. Un caso SIN
     ventana ocupa solo su fecha límite: su `ini` es la fecha en que se
     escribió, y extenderlo desde ahí llenaría el mes de barras que no
     significan nada. Con ventana de verdad, ocupa los días que dura — que es
     justo lo que se viene a mirar en un calendario. */
  const enDia = (key: string) => vis.filter(it =>
    (it.kind === "caso" && !it.ventana) ? it.fin === key : (it.ini <= key && key <= it.fin))
    /* Un día es una lista corta y ORDENADA: lo que tiene hora, por hora; lo
       demás detrás. Salían en el orden crudo del arreglo, así que dos
       reuniones del mismo día aparecían como cayera — en la vista que más se
       parece a un calendario de reuniones. */
    .sort((a, b) => (a.hora || "~") < (b.hora || "~") ? -1 : (a.hora || "~") > (b.hora || "~") ? 1 : 0);

  const celdas: (string | null)[] = [
    ...Array.from({ length: primerDow }, () => null),
    ...Array.from({ length: diasMes }, (_, i) => ymd(new Date(y, m, i + 1))),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const TOPE = 4;   // chips por día antes de "+N"

  /* ── EL DÍA COMPLETO, EN UN POP-UP ──
     Una celda de calendario cabe cuatro chips y el resto se resumía en «+3
     más», que decía cuántos faltaban y no dejaba verlos: para saber qué había
     el día 25 tocaba irse a la línea de tiempo y buscar. Un número que informa
     de algo que no se puede abrir es una puerta pintada.
     Se abre el día ENTERO y no solo lo escondido: quien pulsa «+3» quiere ver
     el día, y empezar por el cuarto elemento obliga a recomponerlo de memoria.
     El pop-up es la vista honesta de una celda que no da más de sí. */
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  useEffect(() => {
    if (!diaAbierto) return;
    const onEsc = (e: KeyboardEvent) => {
      /* ── ESC LO CIERRA DE UNO EN UNO ──
         Dentro de este pop-up se puede abrir la vista rápida de un caso, y con
         ella abierta un Esc cerraba las DOS: se desmontaba la lista, y con ella
         el modal de encima y el comentario a medias que hubiera dentro. Justo
         lo que la guarda de VistaRapida existe para evitar, saltándose por
         detrás. Si hay otro modal montado, este no se da por aludido. */
      if (document.querySelectorAll(".modal-fondo").length > 1) return; if (e.key === "Escape") setDiaAbierto(null); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [diaAbierto]);
  const itemsDia = diaAbierto ? enDia(diaAbierto) : [];
  const rotuloDia = (key: string) => {
    const d = new Date(key + "T12:00:00");
    return d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
  };

  return (
    <div className="card">
      <div className="ag-tl-nav">
        <button className="vtab" onClick={() => setMesOff(0)}>Hoy</button>
        <button className="vtab" title="Mes anterior" onClick={() => setMesOff(s => s - 1)}>‹</button>
        <button className="vtab" title="Mes siguiente" onClick={() => setMesOff(s => s + 1)}>›</button>
        <span style={{ color: "var(--muted)", fontSize: TXT.micro, textTransform: "capitalize" }}>{MESES[m]} {y}</span>
      </div>

      <div className="ag-cal">
        {DOW.map(d => <div key={d} className="ag-cal-dow">{d}</div>)}
        {celdas.map((key, i) => {
          if (!key) return <div key={i} className="ag-cal-dia vacia" />;
          const dia = Number(key.slice(8));
          const items = enDia(key);
          return (
            <div key={i} className={`ag-cal-dia ${key === hoyKey ? "hoy" : ""}`}>
              <span className="ag-cal-num">{dia}</span>
              {items.slice(0, TOPE).map(it => (
                /* La hora ANTES del título, no en el tooltip: en un
                   calendario, «10:00» es lo primero que se busca de una
                   reunión, y el tooltip solo lo ve quien ya sospecha que hay
                   algo que mirar. */
                <Link key={it.id} href={it.href}
                  className={`ag-cal-chip ${apagado(it) ? "ag-ajena" : ""}`}
                  title={[it.hora && `${it.hora}`, it.titulo, it.nc && `💬 ${it.nc}`].filter(Boolean).join(" · ")}
                  style={{ borderLeft: `3px solid ${colorDe(it)}` }}>
                  {it.hora ? <b className="ag-cal-hora">{it.hora}</b> : icoDe(it)} {it.titulo}
                </Link>
              ))}
              {items.length > TOPE && (
                <button type="button" className="ag-cal-mas"
                  title={`Ver los ${items.length} de este día`}
                  onClick={() => setDiaAbierto(key)}>
                  +{items.length - TOPE} más
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* El día entero. Mismo pop-up que el resto del sistema (`modal-fondo` /
          `modal-caja`), para que cerrar con Esc o tocando fuera funcione igual
          aquí que en la vista rápida de un caso. */}
      {diaAbierto && typeof document !== "undefined" && createPortal(
        <div className="modal-fondo"
          onMouseDown={e => { if (e.target === e.currentTarget) setDiaAbierto(null); }}>
          <div className="modal-caja ag-dia-caja" role="dialog" aria-modal="true"
            aria-label={`Actividades del ${rotuloDia(diaAbierto)}`}>
            <div className="modal-cab">
              <b style={{ textTransform: "capitalize" }}>📅 {rotuloDia(diaAbierto)}</b>
              <span className="ag-dia-n">{itemsDia.length}</span>
              <span style={{ flex: 1 }} />
              <button className="modal-x" title="Cerrar (Esc)" onClick={() => setDiaAbierto(null)}>✕</button>
            </div>
            <div className="ag-dia-lista">
              {itemsDia.map(it => (
                <div key={it.id}
                  /* `ag-ajena` es «no es tuyo» (filtro de persona) y `es-hecho`
                     es «no se está haciendo» (en pausa, en seguimiento). Son
                     dos razones distintas para bajar el tono y pueden darse a
                     la vez. */
                  className={`ag-dia-fila fila-cap ${apagado(it) ? "ag-ajena" : ""}`
                    + (apagadoHoy(it.estadoCaso || (it.kind === "caso" ? it.estado : "")) ? " es-hecho" : "")}
                  style={{ borderLeft: `3px solid ${colorDe(it)}` }}>
                  {/* El enlace cubre la fila por debajo en vez de envolverla:
                      dentro va el ⚡, y un <button> anidado en un <a> es HTML
                      inválido —rompe la hidratación y los dos clics se pelean—. */}
                  <Link href={it.href} className="fila-cubre" aria-label={it.titulo}
                    onClick={() => setDiaAbierto(null)} />
                  {/* La hora manda: es lo que ordena la lista y lo primero que
                      se busca. Lo que no la tiene enseña su ícono, y así las
                      dos clases de fila se distinguen sin leer. */}
                  <span className="ag-dia-hora">{it.hora || icoDe(it)}</span>
                  {/* De quién es, antes del título: lo primero que se busca en
                      la lista de un día es si algo es tuyo, y eso se contesta
                      con una cara al empezar el renglón, no al terminarlo. */}
                  {(() => {
                    const q = perfilDe(it.respId);
                    return q ? (
                      <span className="port-hoy-resp fila-encima" title={`Responsable: ${q.nombre}`}>
                        <Avatar nombre={q.nombre} color={q.color || undefined}
                          src={q.avatar_url || undefined} size={20} />
                      </span>
                    ) : <span className="port-hoy-resp-hueco" />;
                  })()}
                  <span className="ag-dia-tit">{it.titulo}</span>
                  {/* Lo que contradice la expectativa: si sale en el día se da
                      por hecho que está en marcha, así que una pausa o un
                      seguimiento hay que decirlos — organizarse alrededor de
                      algo que nadie va a hacer sale caro. */}
                  {(() => {
                    /* ── EL MISMO ESTADO EN LAS TRES PREGUNTAS ──
                       Se decidía SI pintar con el estado del caso y luego se
                       pintaba `it.estado`, que en una actividad es el suyo:
                       salía «materializada» en gris, una palabra del vocabulario
                       interno del cronograma que no significa nada para quien
                       mira su día. Una sola variable para decidir, colorear y
                       escribir. */
                    const e = it.estadoCaso || (it.kind === "caso" ? it.estado : "");
                    if (!hayQueDecirEstado(e)) return null;
                    return (
                      <span className="port-hoy-estado"
                        style={{ color: ESTADO_COL[e] || "var(--dim)",
                          borderColor: ESTADO_COL[e] || "var(--dim)" }}>
                        {ESTADO_ICO[e]} {ESTADO_TXT[e] || e}
                      </span>
                    );
                  })()}
                  {/* ── DE QUÉ ES: TODOS SUS VÍNCULOS ──
                      En un pop-up sin cabeceras es lo único que da contexto, y
                      con UNO solo una reunión caía en «Casos sueltos» — que es
                      precisamente lo que no informa de ella: una reunión existe
                      por a quién y a qué convoca.
                      Los primeros y el resto contado: ver `TOPE_GRUPOS`. */}
                  {/* Sin vínculos no se pinta «Casos sueltos»: ese es el nombre
                      del GRUPO en la línea de tiempo —ahí explica por qué esas
                      filas están juntas—, pero en la lista de un día es una
                      etiqueta que ocupa sitio para decir que no hay nada. */}
                  {(it.grupos || []).filter(Boolean)
                    .slice(0, TOPE_GRUPOS).map((g, i) => (
                      <span key={i} className="ag-dia-grupo">{g}</span>
                    ))}
                  {(it.grupos?.length || 0) > TOPE_GRUPOS && (
                    <span className="ag-dia-grupo port-hoy-mas fila-encima"
                      title={it.grupos!.join(" · ")}>
                      +{it.grupos!.length - TOPE_GRUPOS}
                    </span>
                  )}
                  {/* Los vinculados, apiñados y pequeños; el responsable
                      detrás de una línea. «Quién viene» y «quién responde» son
                      dos preguntas distintas: con todas las caras iguales no se
                      contesta ninguna. */}
                  {!!it.caras?.length && (
                    <span className="port-hoy-caras fila-encima"
                      title={"Vinculados: " + it.caras.map(c => c.nombre).join(", ")}>
                      {it.caras.slice(0, 5).map((c, i) => (
                        <Avatar key={i} nombre={c.nombre} color={c.color} src={c.avatar_url} size={18} />
                      ))}
                      {it.caras.length > 5 && (
                        <span className="port-hoy-mas">+{it.caras.length - 5}</span>
                      )}
                    </span>
                  )}
                  {/* Trabajar sin salir: comentar, cambiar el estado o asignar
                      sin cerrar el calendario. Solo donde hay caso — una
                      actividad sin materializar no es una publicación. Ya
                      estaba en la línea de tiempo y faltaba aquí, que es donde
                      se mira un día concreto. */}
                  {it.href.startsWith("/caso/") && (
                    <VistaRapida pubId={it.href.slice("/caso/".length)} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
