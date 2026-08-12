/* VEREDICTO de un concurso, en un solo sitio: lo usan la ficha (carné + cancha),
   y la lista de participantes de la convocatoria para estampar el sello por
   fila. En curso → null (sin sello). */
export type Veredicto = { titulo: string; sub: string; ico: string; tono: string };

/* Postulación: ganó / finalista pero no ganó / no apta / no seleccionada / retirada. */
export function resultadoPostulacion(estado?: string | null): Veredicto | null {
  switch (estado) {
    case "ganadora": return { titulo: "Ganó", sub: "Ganadora", ico: "🏆", tono: "gano" };
    case "finalista_no_ganadora": return { titulo: "Finalista", sub: "No ganó", ico: "🥈", tono: "finalista" };
    case "no_apta": return { titulo: "No apta", sub: "No admitida", ico: "✖", tono: "noapta" };
    case "no_seleccionada": return { titulo: "No seleccionada", sub: "No ganó", ico: "✖", tono: "noapta" };
    case "retirada": return { titulo: "Retirada", sub: "No se presentó", ico: "↩", tono: "noapta" };
    default: return null;   // en_preparacion, enviada, apta, finalista → en curso
  }
}

/* ── ¿VA APAGADA? ──
 * Una postulación se pinta apagada cuando ya no compite. Vivía escrita a mano
 * dentro de /postulaciones, y el listado de convocatorias solo copió la mitad
 * —la de «externa»—: la misma postulación salía apagada en una pantalla y a
 * pleno color en la otra. Dos pantallas dando dos respuestas a «¿esto sigue en
 * carrera?» es peor que ninguna respuesta, porque las dos parecen seguras.
 *
 * Tres motivos para apagarse:
 *  1. El ESTADO ya lo dice: no apta, retirada, no seleccionada, finalista que
 *     no ganó. Eso es justo lo que sabe `resultadoPostulacion`.
 *  2. Quedó como «finalista» pero su concurso YA cerró sin que ganara. También
 *     perdió, aunque nadie actualizara el estado a mano.
 *  3. Es EXTERNA —ni el proyecto ni la empresa son de casa—: se sigue por
 *     contexto, pero no es trabajo nuestro.
 *
 * NUESTRA ganadora nunca se apaga, ni con el concurso cerrado: es el logro, y
 * es lo único que uno viene a buscar en un año pasado. Una ganadora EXTERNA sí
 * —el orden de las dos comprobaciones es el que decide eso, no un descuido—:
 * que gane un concurso alguien de fuera es contexto, no un logro de la casa.
 */
export function postApagada(
  p: { estado?: string | null; proy?: { relacion?: string | null } | null; emp?: { relacion?: string | null } | null },
  estadoConv?: string | null,
): boolean {
  if (p.proy?.relacion === "externa" || p.emp?.relacion === "externa") return true;
  if (p.estado === "ganadora") return false;
  if (resultadoPostulacion(p.estado)) return true;
  const convCerrada = ["con_resultados", "finalizada"].includes(String(estadoConv ?? ""));
  return p.estado === "finalista" && convCerrada;
}

/* Color de identidad del ESTADO de una postulación, en un solo sitio: el mismo
   que usa el listado (EST_META) y la cancha. Sirve para el refuerzo tenue de la
   tarjeta (borde + degradado) donde se muestra una postulación. */
const COLOR_ESTADO_POST: Record<string, string> = {
  en_preparacion: "var(--violet)",
  enviada: "var(--blue)",
  en_subsanacion: "var(--yellow)",
  apta: "var(--teal)",
  no_apta: "var(--red)",
  finalista: "var(--yellow)",
  finalista_no_ganadora: "var(--yellow)",
  ganadora: "var(--green)",
  no_seleccionada: "var(--dim)",
  retirada: "var(--dim)",
};
export const colorEstadoPost = (estado?: string | null) =>
  COLOR_ESTADO_POST[String(estado ?? "")] || "var(--muted)";

/* Convocatoria: cuando el concurso cerró (finalizada / cancelada). */
export function resultadoConvocatoria(estado?: string | null): Veredicto | null {
  switch (estado) {
    case "finalizada": return { titulo: "Finalizada", sub: "Concurso cerrado", ico: "🏁", tono: "cerrada" };
    case "cancelada": return { titulo: "Cancelada", sub: "No se realizó", ico: "🚫", tono: "noapta" };
    default: return null;
  }
}
