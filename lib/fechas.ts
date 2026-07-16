/* ── Fechas en formato humano ──
 *
 * Había 27 formateadores de fecha repartidos por el proyecto: cada pantalla
 * se hizo el suyo, y por eso una se escapó cruda en un tooltip —«Emitida el
 * 2025-10-02»— sin que hubiera un solo sitio donde arreglarla.
 *
 * Un dato que se le muestra a una persona se escribe como habla una persona.
 * El ISO es para la base y para los <input type="date">, no para leer.
 *
 * Todas fijan las 12:00 al parsear: con «2025-10-02» a secas, JavaScript
 * asume medianoche UTC y en Perú (UTC-5) la pinta como el día anterior.
 */

const aFecha = (f: string | Date) =>
  f instanceof Date ? f
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f}T12:00:00` : f);

/* "2 de octubre de 2025" — para tooltips y textos que se leen */
export const fechaLarga = (f: string | Date) =>
  aFecha(f).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

/* "2 oct. 2025" — para tablas y chips, donde el espacio manda */
export const fechaCorta = (f: string | Date) =>
  aFecha(f).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

/* "2 oct." — cuando el año se sobreentiende */
export const fechaDia = (f: string | Date) =>
  aFecha(f).toLocaleDateString("es-PE", { day: "numeric", month: "short" });

/* "martes 2 de octubre" — cabeceras de jornada */
export const fechaConDia = (f: string | Date) =>
  aFecha(f).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

/* Cuánto falta o cuánto pasó, dicho como se dice: "en 3 días", "hace 2 meses" */
export function haceOEn(f: string | Date): string {
  const d = Math.round((aFecha(f).getTime() - Date.now()) / 86400000);
  const a = Math.abs(d);
  const txt = a === 0 ? "hoy"
    : a === 1 ? "1 día"
    : a < 30 ? `${a} días`
    : a < 60 ? "1 mes"
    : a < 365 ? `${Math.round(a / 30)} meses`
    : a < 730 ? "1 año"
    : `${Math.round(a / 365)} años`;
  if (a === 0) return "hoy";
  return d > 0 ? `en ${txt}` : `hace ${txt}`;
}
