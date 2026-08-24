/* ============================================================
 *  lib/reacciones.ts — LA PALETA, EN UN SOLO SITIO
 *
 *  Había TRES listas de emojis: once en `Reacciones` (el chip de siempre),
 *  seis en `VistaHilo` y otras seis en `VistaRapida`. Como cada pantalla
 *  contaba las reacciones recorriendo SU lista, una reacción puesta desde
 *  otra —un ✔️ «revisado», por ejemplo— no salía por ninguna parte en las
 *  otras dos. No es que se viera distinta: no se veía. El dato estaba en la
 *  base y la pantalla decía que no había nada.
 *
 *  Aquí viven la lista, lo que significa cada emoji y el agrupado.
 * ============================================================ */

/** El orden es el de la paleta: primero los tres que son un acuse de recibo
 *  —lo vi, de acuerdo, lo revisé—, y después los de ánimo. */
export const EMOJIS = ["👀", "👍", "✔️", "❤️", "🔥", "👏", "😂", "😮", "🤔", "😕", "😢"];

/** Un emoji sin rótulo es un jeroglífico: 👀 y ✔️ no significan lo mismo aquí
 *  que en un chat, y esa diferencia es justo la que hace útil el acuse. */
export const LABEL: Record<string, string> = {
  "👀": "Visto — lo leí y lo tengo presente",
  "👍": "De acuerdo",
  "✔️": "Revisado — lo verifiqué y está conforme",
  "❤️": "Me encanta",
  "🔥": "Genial",
  "👏": "Aplausos",
  "😂": "Me dio risa",
  "😮": "Me sorprendió",
  "🤔": "Estoy pensando / déjame revisarlo",
  "😕": "No entendí / estoy confundido",
  "😢": "Triste",
};

export type RxMin = { emoji: string; usuario_id: string };

/** Agrupa las reacciones por emoji.
 *
 *  ── CUENTA LO QUE HAY, NO LO QUE RECONOCE ──
 *  Recorre las reacciones REALES y luego las ordena por la paleta. Si mañana
 *  se quita un emoji de `EMOJIS`, o alguien reaccionó desde una versión con
 *  otra lista, su chip se sigue viendo —al final, pero se ve—. Recorrer la
 *  paleta y filtrar, que es como estaba, esconde en silencio todo lo que no
 *  esté en la lista de hoy.
 *
 *  Devuelve también las filas (`rs`) para quien necesite los nombres de quién
 *  reaccionó, que es el acuse de lectura de verdad. */
export function agrupar<T extends RxMin>(rx: T[], userId: string) {
  const orden = (e: string) => {
    const i = EMOJIS.indexOf(e);
    return i < 0 ? EMOJIS.length : i;
  };
  // Un solo recorrido y una sola limpieza: si aquí se admite que una fila
  // venga en nulo, no puede haber tres líneas más abajo un `.filter` que la
  // dé por buena. O se desconfía en todo el camino o en ninguno.
  const filas = (rx || []).filter(r => r && r.emoji);
  const distintos: string[] = [];
  for (const r of filas) if (!distintos.includes(r.emoji)) distintos.push(r.emoji);
  return distintos
    .sort((a, b) => orden(a) - orden(b) || a.localeCompare(b))
    .map(e => {
      const rs = filas.filter(r => r.emoji === e);
      return { emoji: e, n: rs.length, mia: rs.some(r => r.usuario_id === userId), rs };
    });
}
