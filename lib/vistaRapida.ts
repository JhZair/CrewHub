/* Piezas compartidas por VistaPersona y VistaEmpresa.
   Estaban copiadas verbatim en los dos archivos —el mismo copiar-pegar que
   lib/palmares.ts vino a terminar, reintroducido en los dos archivos que lo
   importan—. */

/** Ícono por estado de postulación. Mismo mapa que la ficha de entidad. */
export const ICO_EST: Record<string, string> = {
  ganadora: "🏆", finalista: "⭐", finalista_no_ganadora: "🥈", enviada: "📨",
  apta: "✅", en_subsanacion: "🔧", no_apta: "⛔", no_seleccionada: "✖",
  retirada: "↩", en_preparacion: "🛠",
};

export const soles = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

/** PostgREST devuelve las relaciones a veces como objeto y a veces como array. */
export const un = (v: any) => (Array.isArray(v) ? v[0] : v);

/** Nombre corto de un proyecto embebido, con su respaldo. */
export const nomProy = (p: any) => un(p)?.nombre_corto || un(p)?.nombre || "—";
