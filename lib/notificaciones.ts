/* ── Las notificaciones, en un solo sitio ──
   Hay dos campanitas: la del feed y la flotante de las páginas internas.
   Tenían copiados los mismos tres mapas, y al ir a añadirles el ancla de
   comentarios iban a quedar cuatro cosas duplicadas en dos archivos que
   nadie mira juntos. Ese es el nacimiento exacto de los bichos de este
   sistema, así que se corta aquí. */
import {
  META_RENDICION, TABLAS_RENDICION, anclaRendicion, tablaDeNotif,
} from "@/lib/rendicionHilo";

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
   SQL, y cada una tumbaría la consulta entera si se pide antes de tiempo.
   Las cinco de la rendición se enumeran desde META_RENDICION en vez de
   copiarlas: una lista escrita a mano se olvida de la sexta el día que la
   haya, y el síntoma sería la bandeja entera en blanco. */
export const COLS_NUEVAS = [COL_DAFO, "comentario_id", "movimiento_caja_id",
  ...TABLAS_RENDICION.map(t => META_RENDICION[t].col)];
export const faltaAlguna = (e: any): boolean => COLS_NUEVAS.some(c => sinColumna(e, c));

/* ── QUÉ COLUMNA FALTÓ, CON NOMBRE ──
 *
 * El camino degradado existe para que la bandeja no se caiga por un SQL sin
 * correr, y eso está bien. Lo que estaba mal es que fuera INVISIBLE: al pedir
 * la consulta sin las columnas opcionales, los avisos llegan sin `dafo_id`, y
 * sin `dafo_id` la campanita no sabe a dónde llevarlos. El resultado es un
 * aviso que se ve, se lee, y al pulsarlo no hace nada — sin un solo error en
 * ninguna parte.
 *
 * Un modo degradado que no se anuncia es una avería disfrazada de
 * funcionamiento normal: nadie va a correr el SQL que lo arregla porque nadie
 * sabe que falta. Así que se devuelve la lista de lo que faltó y la pantalla
 * la enseña.
 */
export const columnasQueFaltan = (e: any): string[] =>
  COLS_NUEVAS.filter(c => sinColumna(e, c));

/* ── LAS COLUMNAS QUE HAY QUE PEDIR — UNA SOLA LISTA ──
 *
 * Estaban escritas a mano en TRES sitios (las dos campanitas y la lista larga
 * de /notificaciones) y las tres se habían quedado atrás. Ninguna pedía
 * `movimiento_caja_id` ni `postulacion_id`, así que `rutaNotif` recibía esas
 * columnas siempre en `undefined` y devolvía `null`: los avisos de caja y de
 * postulación llegaban a la bandeja, se veían, se leían — y al pulsarlos no
 * pasaba nada. Sin un solo error en ninguna parte.
 *
 * Es EXACTAMENTE el fallo que este archivo lleva cuatro comentarios
 * prometiendo no repetir, y se repitió por el único motivo por el que se
 * repiten estas cosas: la lista de puertas vivía en dos sitios —`rutaNotif` y
 * los `select`— y solo uno se actualizaba al abrir una puerta nueva.
 *
 * Ahora es una. Abrir la puerta doce será añadir su columna aquí y su rama en
 * `rutaNotif`, en el mismo archivo, a treinta líneas de distancia. Y las
 * cinco de la rendición se enumeran desde META_RENDICION en vez de teclearse,
 * para que no haya ni siquiera esa oportunidad de olvido.
 */
export const COLS_NOTIF = [
  "id", "tipo", "mensaje", "actor_nombre", "leida", "creado_en",
  "publicacion_id", "objeto_id", "prestamo_id", "equipamiento_id",
  "dafo_id", "comentario_id", "postulacion_id", "movimiento_caja_id",
  ...TABLAS_RENDICION.map(t => META_RENDICION[t].col),
].join(",");

/* Qué archivo trae cada una, para poder decir qué hacer y no solo qué pasa. */
export const SQL_DE_COLUMNA: Record<string, string> = {
  dafo_id: "db/casilla-dafo.sql",
  comentario_id: "db/notif-comentario.sql",
  movimiento_caja_id: "db/movcaja-comentarios.sql",
  ...Object.fromEntries(TABLAS_RENDICION.map(t =>
    [META_RENDICION[t].col, META_RENDICION[t].migracion])),
};
/* ── QUITAR SOLO LO QUE FALTA, NO TODO LO OPCIONAL ──
 *
 * Esto quitaba las TRES columnas opcionales en cuanto una fallaba, con el
 * argumento de que reintentar de una en una serían varios viajes y lo que
 * importa es que la bandeja se pinte. El argumento era malo y costó caro:
 *
 * Si a la base le falta `comentario_id`, se renunciaba TAMBIÉN a `dafo_id`
 * —que sí existía—, y con eso todos los avisos de la casilla DAFO llegaban sin
 * destino. El síntoma que ve la persona es «pulso el aviso y no pasa nada», y
 * la causa es una columna de otro módulo que no tiene nada que ver.
 *
 * Una migración pendiente puede costar SU función. No las demás.
 *
 * Los reintentos son como mucho tres y solo ocurren mientras haya SQL sin
 * correr; con todo al día no se pasa por aquí nunca, que era el argumento
 * original y sigue siendo cierto.
 */
export const sinEstas = (cols: string, quitar: string[]) =>
  quitar.reduce((c, x) => c.replace(`,${x}`, ""), cols);

/** @deprecated Quita de más. Usa `sinEstas` con `columnasQueFaltan(error)`. */
export const sinOpcionales = (cols: string) => sinEstas(cols, COLS_NUEVAS);
/** @deprecated Usa `sinOpcionales`. Se mantiene por si queda alguna llamada. */
export const sinDafoId = sinOpcionales;

export const ICONO: Record<string, string> = {
  asignacion: "👤", comentario: "💬", vencimiento: "⏰",
  cambio_estado: "🔄", mencion: "🔗", reaccion: "👍", bot: "🤖",
  vinculo: "📢",
  /* Mismo 🧩 con el que la búsqueda y el tablero pintan un sub-caso. Que el
     aviso lleve otro ícono obligaría a aprender dos símbolos para una cosa. */
  subcaso: "🧩",
  /* Los dos cambios que alteran un caso sin ser el estado. Tipos propios y no
     `cambio_estado` reciclado: el ícono y el verbo se sacan del TIPO, así que
     compartirlo diría «cambió el estado» sobre un cambio de fecha.
     `cambio_plazo` NO es ⏰ — ese ya es `vencimiento`, «esto vence», que es una
     alarma. Mover una fecha es un hecho, no una alarma. */
  cambio_responsable: "🔀", cambio_plazo: "📅",
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
  subcaso: "añadió un sub-caso",
  cambio_responsable: "cambió el responsable", cambio_plazo: "movió la fecha",
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
  postulacion_id?: string | null; movimiento_caja_id?: string | null;
  comprobante_id?: string | null; estado_cuenta_id?: string | null;
  rhe_id?: string | null; gasto_dj_id?: string | null; movimiento_banco_id?: string | null;
  /** Si la publicación es una NOTA DE MURO, de qué muro es. */
  muro?: { tipo: string; id: string } | null;
} & Record<string, any>) =>
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
  /* Un comentario en un apunte de caja lleva a la caja, y el ancla al propio
     movimiento. El hilo vive en un pop-up, así que no se puede anclar al
     comentario: se ancla a la fila, que es desde donde se abre. */
  : n.movimiento_caja_id ? `/caja#mov-${n.movimiento_caja_id}`
  /* ── LAS CINCO FILAS DE LA RENDICIÓN ──
     Van ANTES de `postulacion_id` a propósito, y el orden es la regla entera:
     estos avisos llevan las DOS columnas —la fila y el fondo— porque la fila
     sola no dice en qué pantalla vive. Si esta rama fuera después, la de
     postulación se los quedaría todos y un comentario sobre una factura
     acabaría en la ficha del expediente, que es el sitio correcto para otra
     cosa. Lo más específico primero.
     Y si por lo que sea no viene el fondo, NO se cae a la postulación: se
     devuelve null y el aviso queda sin clic. Un enlace que lleva al sitio
     equivocado es peor que uno que no lleva: el segundo se nota. */
  /* La ruta ya no se arma aquí: la dice cada tabla en META_RENDICION. Estaba
     escrita como `/fondo/${postulacion_id}` porque las cinco primeras eran del
     fondo; la sexta —un periodo declarable— vive en /obligaciones y no tiene
     postulación, y con la ruta aquí dentro habría exigido un `if` más en este
     encadenado. El comportamiento no cambia para las cinco: `rutaFondo`
     devuelve null si el fondo no viene, igual que antes. */
  : tablaDeNotif(n)
    ? META_RENDICION[tablaDeNotif(n)!].ruta(n, n[META_RENDICION[tablaDeNotif(n)!].col])
  /* Y la postulación, que llevaba desde su migración devolviendo `null` — el
     aviso llegaba a la bandeja y no era clicable. Es exactamente el fallo que
     el comentario de más arriba dice haber arreglado para los objetos,
     reintroducido al abrir esa puerta y nunca cerrado. */
  : n.postulacion_id
    ? `/entidad/postulacion/${n.postulacion_id}${anclaCom(n, anclaDe(n.tipo || ""))}`
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

/* ── EL AGRUPADOR Y EL ANCLA SE PISABAN ──
 *
 * La clave era la ruta ENTERA. Y el día que los avisos de comentario
 * aprendieron a terminar en el párrafo —`#com-<id>`, para no dejar al lector
 * buscando en un hilo de treinta— cada mensaje pasó a tener una ruta distinta
 * y, con ella, su propio grupo. Veinte comentarios en un caso volvieron a ser
 * veinte filas. Las dos reglas son correctas por separado; juntas se anulan, y
 * ninguna de las dos podía enterarse.
 *
 * Se agrupa por el DESTINO IGNORANDO DE QUÉ COMENTARIO SE TRATA, que es la
 * frase que describe lo que queríamos desde el principio. Y se consigue
 * preguntándole a `rutaNotif` sin `comentario_id` en vez de recortar el `#` a
 * mano: hay anclas que SÍ son identidad —`#pub-<id>` de una nota del muro,
 * `#mov-<id>` de un apunte de caja, la fila de la rendición— y cortar por el
 * almohadilla las habría fundido todas en una. La regla la sigue decidiendo el
 * enrutador, en un solo sitio.
 *
 * Lo que se pinta sigue siendo la notificación más reciente, con SU ancla: el
 * grupo dice «Carlos y 2 más · 20» y el clic lleva al último mensaje.
 */
const claveGrupo = (n: any) =>
  `${rutaNotif({ ...n, comentario_id: null }) || `id:${n.id}`}|${n.tipo || ""}`;

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
