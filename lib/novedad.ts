/* "Última visita" del usuario, en SU navegador. Una sola marca compartida por
   todo lo que dependa de "lo nuevo desde que entré": el badge ✨ NUEVO y el
   auto-ocultado de los resueltos ya vistos. Se lee (y se avanza a "ahora") una
   vez por carga; ambos consumidores usan el MISMO valor cacheado, así que ven
   lo mismo dentro de la misma visita. */

let visitaAnterior: number | null = null;

export function ultimaVisita(): number {
  if (typeof window === "undefined") return Date.now();  // SSR: nada es "nuevo"
  if (visitaAnterior == null) {
    const v = localStorage.getItem("cw_ultima_visita");
    visitaAnterior = v ? parseInt(v) : 0;
    localStorage.setItem("cw_ultima_visita", String(Date.now()));
  }
  return visitaAnterior;
}

/** ¿Se publicó/actualizó después de mi última visita? */
export const esNuevo = (creadoEn: string): boolean =>
  new Date(creadoEn).getTime() > ultimaVisita();
