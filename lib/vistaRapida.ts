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

/* «hace 2 días» en vez de una fecha: la pregunta que responde este dato no es
   CUÁNDO fue sino CUÁNTO HACE, y obligar a restar mentalmente contra el
   calendario es trabajo que puede hacer la máquina. */
export function haceCuanto(iso?: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "";
  const dias = Math.floor(ms / 86400000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
  const anios = Math.floor(dias / 365);
  return `hace ${anios} ${anios === 1 ? "año" : "años"}`;
}
