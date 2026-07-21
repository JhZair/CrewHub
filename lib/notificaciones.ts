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

/* Cuánto hace, dicho corto: la campanita es una lista, no un texto */
export const hace = (d: string) => {
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

/* El título entre comillas angulares del mensaje del bot */
export const tituloDe = (m: string) => {
  const x = (m || "").match(/«([^»]+)»/);
  return x ? x[1] : (m || "");
};
