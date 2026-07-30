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

/* Color de identidad del ESTADO de una postulación, en un solo sitio: el mismo
   que usa el listado (EST_META) y la cancha. Sirve para el refuerzo tenue de la
   tarjeta (borde + degradado) donde se muestra una postulación. */
const COLOR_ESTADO_POST: Record<string, string> = {
  en_preparacion: "var(--violet)",
  enviada: "var(--blue)",
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
