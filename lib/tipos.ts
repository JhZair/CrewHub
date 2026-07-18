/* EL TIPO DE UNA PUBLICACIÓN, EN UN SOLO SITIO
 *
 * Qué es cada cosa que se publica: su ícono, su nombre y su color.
 *
 * Estaba escrito en DIEZ sitios —feed, caso, ficha de entidad, buscador,
 * /casos, /pulso, /admin, Tablero, TableroTimeline, BancoTrabajo, y el
 * TIPOS_SEL de PostCard— y ya había divergido en dos formas:
 *   · /pulso pintaba la conversación 🗂 y los otros ocho 💬
 *   · a cuatro copias les faltaba `conversacion`, así que caían al 💬 del
 *     `||` por accidente y no porque alguien lo decidiera
 * Y /admin guardaba SOLO los colores, en otro mapa, con los mismos nombres.
 *
 * El orden de la lista es el de los combos: primero lo que más se publica.
 *
 * OJO: los cuatro «naturalezas» que John describió (17/07) viven aquí a
 * medias — Caso (problema), Idea/Consulta y el Aviso, que hace de Dirección.
 * Si algún día la Dirección se construye, nace en esta lista.
 */

export type TipoPub = {
  tipo: string;
  ico: string;
  label: string;
  color: string;
};

export const TIPOS: TipoPub[] = [
  { tipo: "tarea", ico: "✅", label: "Tarea", color: "#22c55e" },
  { tipo: "problema", ico: "❗", label: "Problema", color: "#ff4d5e" },
  { tipo: "consulta", ico: "❓", label: "Consulta", color: "#60a5fa" },
  { tipo: "pago", ico: "💰", label: "Pago", color: "#2dd4bf" },
  { tipo: "idea", ico: "💡", label: "Idea", color: "#f4b400" },
  { tipo: "archivo", ico: "📎", label: "Archivo", color: "#3b82f6" },
  { tipo: "aviso", ico: "📢", label: "Aviso", color: "#a78bfa" },
  { tipo: "conversacion", ico: "💬", label: "Conversación", color: "#8b8ba3" },
];

const POR_TIPO = new Map(TIPOS.map(t => [t.tipo, t]));

/* Lo que no está en la lista —un `otro` viejo, un tipo que alguien invente en
   la base— cae aquí. Antes cada copia tenía su propio `|| "💬"` suelto. */
const NINGUNO: TipoPub = { tipo: "conversacion", ico: "💬", label: "Conversación", color: "#8b8ba3" };

export const tipoDe = (t?: string | null): TipoPub => POR_TIPO.get(String(t ?? "")) || NINGUNO;

export const icoTipo = (t?: string | null) => tipoDe(t).ico;
export const labelTipo = (t?: string | null) => tipoDe(t).label;
export const colorTipo = (t?: string | null) => tipoDe(t).color;

/** Ícono + nombre, para badges y combos: «📢 Aviso». */
export const rotuloTipo = (t?: string | null) => `${icoTipo(t)} ${labelTipo(t)}`;

/** Cómo se rotula un MONTÓN de este tipo, para los desgloses en barras de
 *  /pulso y /jornadas: «✅ Tareas», «📢 Avisos».
 *
 *  Dos cosas que parecen capricho y no lo son:
 *  · va en plural porque no nombra un caso, nombra una barra;
 *  · la conversación se llama «🗂 Otros» y no «💬 Conversaciones», porque en
 *    un desglose es el cajón de lo que nadie clasificó — y eso es lo que uno
 *    espera leer. El 🗂 es de ahí; el 💬 es de la insignia de una tarjeta.
 *
 *  /pulso y /jornadas tienen LA MISMA gráfica y cada una había tomado esta
 *  decisión por su cuenta, con su propio mapa. Al migrar /pulso yo mismo la
 *  rompí y le dejé «💬 Otros». Es una decisión: vive una vez. */
export const rotuloMonton = (t?: string | null) => {
  const x = tipoDe(t);
  return x.tipo === "conversacion" ? "🗂 Otros" : `${x.ico} ${x.label}s`;
};

/** Para los combos: [valor, etiqueta].
 *  `conversacion` NO se ofrece: es el cajón donde cae lo que no se clasificó,
 *  no algo que uno elija a propósito. Así estaba en PostCard y así se queda. */
export const TIPOS_SEL: [string, string][] =
  TIPOS.filter(t => t.tipo !== "conversacion").map(t => [t.tipo, rotuloTipo(t.tipo)]);
