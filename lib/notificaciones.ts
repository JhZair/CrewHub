/* ── Las notificaciones, en un solo sitio ──
   Hay dos campanitas: la del feed y la flotante de las páginas internas.
   Tenían copiados los mismos tres mapas, y al ir a añadirles el ancla de
   comentarios iban a quedar cuatro cosas duplicadas en dos archivos que
   nadie mira juntos. Ese es el nacimiento exacto de los bichos de este
   sistema, así que se corta aquí. */

export const ICONO: Record<string, string> = {
  asignacion: "👤", comentario: "💬", vencimiento: "⏰",
  cambio_estado: "🔄", mencion: "🔗", reaccion: "👍", bot: "🤖",
  vinculo: "📢",
};

export const ETIQ: Record<string, string> = {
  asignacion: "te asignó", comentario: "comentó", vencimiento: "vence",
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
export const rutaNotif = (n: { publicacion_id?: string | null; objeto_id?: string | null; equipamiento_id?: string | null; tipo?: string }) =>
  n.publicacion_id ? `/caso/${n.publicacion_id}${anclaDe(n.tipo || "")}`
  : n.objeto_id ? `/objeto/${n.objeto_id}${anclaDe(n.tipo || "")}`
  // Un aviso de préstamo lleva a la ficha del equipo (resuelto en conVinculos).
  : n.equipamiento_id ? `/entidad/equipamiento/${n.equipamiento_id}`
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

/* Chips que afinan dentro de la pestaña (Para ti / Del Bot). `clave` va a la
   server action; "todas" no filtra. */
export const CHIPS: { clave: string; label: string }[] = [
  { clave: "todas", label: "Todas" },
  { clave: "no_leidas", label: "No leídas" },
  { clave: "mencion", label: "Menciones" },
  { clave: "comentario", label: "Comentarios" },
  { clave: "asignacion", label: "Asignaciones" },
];

/* El título entre comillas angulares del mensaje del bot */
export const tituloDe = (m: string) => {
  const x = (m || "").match(/«([^»]+)»/);
  return x ? x[1] : (m || "");
};
