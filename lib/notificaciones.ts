/* ── Las notificaciones, en un solo sitio ──
   Hay dos campanitas: la del feed y la flotante de las páginas internas.
   Tenían copiados los mismos tres mapas, y al ir a añadirles el ancla de
   comentarios iban a quedar cuatro cosas duplicadas en dos archivos que
   nadie mira juntos. Ese es el nacimiento exacto de los bichos de este
   sistema, así que se corta aquí. */

/* ── LA COLUMNA QUE PUEDE NO ESTAR TODAVÍA ──
 *
 * `dafo_id` (casilla DAFO) llega con db/casilla-dafo.sql. Mientras ese SQL no
 * se haya corrido, PostgREST NO ignora la columna que no conoce: rechaza la
 * consulta ENTERA. Y como los contadores del timbre no la piden y las listas
 * sí, el resultado era una campanita vacía con el badge marcando 2 — el aviso
 * existía, decía que existía, y no se podía ver. Se rompió la bandeja de
 * notificaciones de todo el sistema por una migración pendiente de un módulo
 * que todavía no estaba en uso.
 *
 * Así que se pide la columna, y si la base dice que no está, se vuelve a
 * preguntar sin ella. Una pantalla que ya funcionaba no puede caerse porque
 * alguien no corrió un SQL: eso es lo que hace que un sistema propio dé miedo.
 */
export const COL_DAFO = "dafo_id";
export const sinColumna = (e: any, col: string): boolean =>
  !!e && new RegExp(col).test(`${e?.message || ""} ${e?.details || ""} ${e?.hint || ""}`);

/* Las columnas que puede que la base todavía no tenga. Cada una llega con su
   SQL, y cada una tumbaría la consulta entera si se pide antes de tiempo. */
export const COLS_NUEVAS = [COL_DAFO, "comentario_id"];
export const faltaAlguna = (e: any): boolean => COLS_NUEVAS.some(c => sinColumna(e, c));
/* Quita TODAS las opcionales para el segundo intento, no solo la que se quejó.
   Pedirlas de una en una serían tantos reintentos como columnas nuevas haya, y
   este camino es el degradado: lo que importa es que la bandeja se pinte. En
   cuanto los SQL están corridos no se pasa por aquí nunca. */
export const sinOpcionales = (cols: string) =>
  COLS_NUEVAS.reduce((c, x) => c.replace(`,${x}`, ""), cols);
/** @deprecated Usa `sinOpcionales`. Se mantiene por si queda alguna llamada. */
export const sinDafoId = sinOpcionales;

export const ICONO: Record<string, string> = {
  asignacion: "👤", comentario: "💬", vencimiento: "⏰",
  cambio_estado: "🔄", mencion: "🔗", reaccion: "👍", bot: "🤖",
  vinculo: "📢",
  /* Dos tipos para el mismo correo de DAFO: la campanita pinta el ícono a
     partir del TIPO y se queda solo con lo que va entre « » del mensaje
     (tituloDe), así que un emoji delante del texto no se ve. El «esto pide
     algo» tiene que viajar en el tipo o no llega. */
  dafo: "📬", dafo_accion: "🚨",
};

export const ETIQ: Record<string, string> = {
  asignacion: "te asignó", comentario: "comentó", vencimiento: "vence",
  /* Solo los correos de DAFO que exigen respuesta llevan actor («DAFO»), y
     esta es la línea que los explica: «DAFO te escribió · 1h». */
  dafo_accion: "te escribió",
  cambio_estado: "cambió el estado", mencion: "te mencionó", reaccion: "reaccionó",
  vinculo: "te vinculó",
};

/* A dónde lleva el aviso.
   Si es de una conversación, tiene que entregar la conversación — no la
   cabecera de un caso largo para que el lector baje a buscar qué le
   dijeron. Los comentarios van del más viejo al más nuevo, así que lo nuevo
   está al final: #comentarios cae ahí, con el cuadro de responder debajo.
   El resto —asignación, vencimiento, cambio de estado— sí es de la ficha:
   esos van arriba, donde están el estado, el responsable y el plazo. */
export const anclaDe = (tipo: string) =>
  ["comentario", "mencion", "reaccion"].includes(tipo) ? "#comentarios" : "";

/* A DÓNDE LLEVA UNA NOTIFICACIÓN — en un solo sitio.
   Antes las tres pantallas (dos campanitas + la lista) preguntaban cada una
   `if (n.publicacion_id)`, así que un aviso de un comentario sobre un objeto
   del repositorio llegaba a la bandeja pero no era clicable: sonaba y no
   llevaba a ninguna parte. Ahora el destino se decide aquí. */
/* ── EL ANCLA DEL COMENTARIO ──
 * Un aviso de comentario sabía en qué ficha ocurrió y ahí acababa su memoria:
 * te dejaba en el caso o en la bitácora, con lo que te habían escrito en algún
 * punto de un hilo de treinta. Justo en las conversaciones que importan —las
 * que ya llevan un mes— el aviso te dejaba a buscar lo que venía a enseñarte.
 * Con `comentario_id` el enlace termina en el párrafo. Es lo mismo que ya se
 * hizo con las notas del muro (`#pub-<id>`), un nivel más adentro.
 * Sin id —los avisos de antes de la migración, o uno cuyo comentario se
 * borró— se cae al ancla de siempre: la ficha. Nunca a ningún sitio.
 *
 * `com-<id>` y no un prefijo nuevo: la página de un caso ya pinta ese id desde
 * antes y ya lo usa para las citas de «↳ en respuesta a», con su destello en
 * `:target`. Inventar `c-<id>` habría dejado dos anclas para lo mismo y una
 * sola de las dos con destello. */
export const ANCLA_COM = (id: string) => `com-${id}`;
export const anclaCom = (n: { comentario_id?: string | null }, deFondo: string) =>
  n.comentario_id ? `#${ANCLA_COM(n.comentario_id)}` : deFondo;

export const rutaNotif = (n: {
  publicacion_id?: string | null; objeto_id?: string | null; equipamiento_id?: string | null;
  dafo_id?: string | null; comentario_id?: string | null; tipo?: string;
  /** Si la publicación es una NOTA DE MURO, de qué muro es. */
  muro?: { tipo: string; id: string } | null;
}) =>
  /* UNA NOTA DEL MURO NO ES UN CASO. Comparte tabla con los casos —misma
     `publicaciones`, mismos comentarios y reacciones, que es lo que la hizo
     barata de construir— pero no tiene estado, ni responsable, ni plazo, ni
     sub-casos. Llevarla a /caso abría una ficha de caso alrededor de un
     apunte: con su «Sin asignar», su «5 días sin movimiento real» y su
     «Publicado», tres avisos sobre algo que nadie prometió resolver.
     Toda la aplicación ya la excluye de los listados de casos con
     `.neq("tipo","bitacora")`; lo que faltaba era el DESTINO. Va a su muro,
     y el ancla deja al lector en la nota exacta que sonó. */
  n.muro ? `/entidad/${n.muro.tipo}/${n.muro.id}#pub-${n.publicacion_id}`
  : n.publicacion_id ? `/caso/${n.publicacion_id}${anclaCom(n, anclaDe(n.tipo || ""))}`
  // Un correo de DAFO no es un caso: vive en la casilla, y el ancla deja al
  // lector en el mensaje exacto que sonó.
  : n.dafo_id ? `/casilla#c-${n.dafo_id}`
  : n.objeto_id ? `/objeto/${n.objeto_id}${anclaCom(n, anclaDe(n.tipo || ""))}`
  /* Un aviso de préstamo lleva a la ficha del equipo (resuelto en
     conVinculos), y `#bitacora` abre la pestaña donde está lo que le
     escribieron. Sin el ancla, el aviso dejaba al lector en la pestaña de
     siempre con el comentario a dos clics — y si ya estaba en esa ficha, no
     hacía nada al pulsarlo: misma URL, misma pestaña, cero respuesta. */
  /* Aquí el hash lleva DOS cosas separadas por «/»: qué pestaña abrir y a qué
     comentario ir. La ficha de un equipo tiene cuatro pestañas y el comentario
     vive dentro de una; sin la primera mitad, el ancla apuntaría a un elemento
     que está en pantalla pero en otra pestaña. */
  : n.equipamiento_id
    ? `/entidad/equipamiento/${n.equipamiento_id}#bitacora${n.comentario_id ? `/${ANCLA_COM(n.comentario_id)}` : ""}`
  : null;

/* Cuánto hace, dicho corto: la campanita es una lista, no un texto */
export const hace = (d: string) => {
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

/* ¿La generó el Bot (automática) o una persona? Las del Bot Qhaway —de
   cronograma y vencimientos— se insertan SIN actor (actor_nombre = null); toda
   notificación humana (te asignó, comentó, mencionó, vinculó) trae actor. Ese
   es el discriminador, sin depender de enumerar tipos.
   ⚠ MISMA regla que el SQL de los contadores (`.is/.not("actor_nombre",null)`):
   automática = actor_nombre NULL. No usamos trim()≡vacío para no descuadrar el
   badge (SQL, por null) con la pestaña (cliente): una sola definición de "sin
   actor". */
export const esAutomatica = (n: any): boolean => n?.actor_nombre == null;

/* ── AGRUPAR LO QUE APUNTA AL MISMO SITIO ──
 * Un caso conversado producía una fila por comentario. Con datos reales
 * (30/07/2026): quince comentarios alternando entre dos personas en una hora
 * — o sea, una CONVERSACIÓN, no quince eventos. La campanita mostraba cuatro
 * filas idénticas «Carlos comentó · 1d» que llevaban todas al mismo caso.
 *
 * Dos daños, y el segundo es el peor:
 *  1. Ocupan el cupo. La campanita trae 12 por pestaña; un hilo activo se come
 *     la mitad y empuja fuera cosas que sí eran nuevas.
 *  2. Marcabas una y las otras seguían sin leer. Leías los cuatro comentarios
 *     y el timbre seguía marcando 3. El número dejaba de significar «lo que no
 *     has visto» y pasaba a significar «filas que no has clicado», que es como
 *     un contador se vuelve ignorable.
 *
 * Se agrupa AL PINTAR, no al guardar: la base conserva una fila por evento
 * (que es la verdad de lo que pasó) y esto es solo cómo se lee. Si mañana no
 * gusta, se revierte cambiando esta función.
 *
 * La clave incluye el TIPO además del destino: una mención y un comentario en
 * el mismo caso NO se juntan. Se pintan distinto y pesan distinto — enterrar
 * un «te mencionó» dentro de «3 comentarios» sería justo lo que esto viene a
 * evitar. Sin destino (una notificación suelta), cada una es su propio grupo:
 * `id:` garantiza que nunca se fusionen por error.
 */
export type GrupoNotif = {
  n: any;              // la más reciente: es la que se pinta
  ids: string[];       // todas las del grupo
  idsSinLeer: string[];// las que hay que marcar al atender el grupo
  cuenta: number;
  actores: string[];   // nombres cortos, de la más reciente a la más vieja
};

const claveGrupo = (n: any) => `${rutaNotif(n) || `id:${n.id}`}|${n.tipo || ""}`;

/* Espera `items` ya ordenado de más nuevo a más viejo (así llega de la
   consulta). Conserva ese orden por la posición del PRIMERO de cada grupo. */
export function agruparNotifs(items: any[]): GrupoNotif[] {
  const orden: string[] = [];
  const mapa = new Map<string, GrupoNotif>();
  for (const n of items || []) {
    const k = claveGrupo(n);
    let g = mapa.get(k);
    if (!g) {
      g = { n, ids: [], idsSinLeer: [], cuenta: 0, actores: [] };
      mapa.set(k, g); orden.push(k);
    }
    g.ids.push(n.id);
    g.cuenta++;
    if (!n.leida) g.idsSinLeer.push(n.id);
    const quien = String(n.actor_nombre || "").trim().split(/\s+/)[0];
    if (quien && !g.actores.includes(quien)) g.actores.push(quien);
  }
  return orden.map(k => mapa.get(k)!);
}

/* «Carlos», «Carlos y 1 más», «Carlos y 2 más». El primero es el más reciente:
   es el nombre que la persona espera ver cuando algo acaba de moverse. */
export function actoresTexto(actores: string[]): string {
  if (!actores.length) return "";
  if (actores.length === 1) return actores[0];
  return `${actores[0]} y ${actores.length - 1} más`;
}

/* Bloque de fecha para agrupar el historial: Hoy · Ayer · Esta semana · … */
export function bucketFecha(iso: string): string {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy.getTime() - d.getTime()) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 7) return "Esta semana";
  if (dias < 31) return "Este mes";
  return "Más antiguas";
}

/* Los dos tipos de la casilla DAFO. En un solo sitio porque el chip los junta y
   la ingesta los reparte: el que exige respuesta lleva actor («DAFO») y suena,
   el rutinario no. Enumerarlos aquí evita que una pantalla filtre por uno y se
   olvide del otro. */
export const TIPOS_DAFO = ["dafo", "dafo_accion"];

/* Chips que afinan dentro de la pestaña (Para ti / Del Bot). `clave` va a la
   server action; "todas" no filtra. */
export const CHIPS: { clave: string; label: string }[] = [
  { clave: "todas", label: "Todas" },
  { clave: "no_leidas", label: "No leídas" },
  { clave: "mencion", label: "Menciones" },
  { clave: "comentario", label: "Comentarios" },
  { clave: "asignacion", label: "Asignaciones" },
  /* 📬 DAFO va al final y vale en LAS DOS pestañas, porque los correos de la
     casilla viven repartidos entre ambas por diseño: el requerimiento con plazo
     tiene actor y está en «Para ti»; el acuse de recibo no y está en «Del Bot».
     Aquí el chip hace lo que una tercera pestaña haría —aislarlos— sin partir la
     barra por un eje distinto al de las dos que ya hay. */
  { clave: "dafo", label: "📬 DAFO" },
];

/* Los chips que siguen valiendo en la pestaña del Bot: allí no hay menciones ni
   asignaciones que filtrar. Escrito aquí y no en la pantalla para que agregar un
   chip sea una línea en un solo archivo. */
export const CHIPS_BOT = ["todas", "no_leidas", "dafo"];

/* El título entre comillas angulares del mensaje del bot */
export const tituloDe = (m: string) => {
  const x = (m || "").match(/«([^»]+)»/);
  return x ? x[1] : (m || "");
};
