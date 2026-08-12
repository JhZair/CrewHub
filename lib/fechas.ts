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

/* ── HOY, EN LIMA ──
 *
 * `new Date().toISOString().slice(0,10)` da el día en UTC, y Perú va cinco
 * horas por detrás: DE LAS SIETE DE LA TARDE EN ADELANTE, en UTC ya es
 * mañana. Todo lo que se guardaba «hoy» —devolver un equipo, verificar un
 * dato, cerrar un préstamo— quedaba fechado al día siguiente si se hacía de
 * noche, que es cuando se devuelve el equipo después de un rodaje.
 *
 * Y no fallaba: guardaba una fecha válida, solo que la equivocada. Se veía
 * mirando la pantalla a las nueve de la noche y leyendo «12 ago.» un día 11.
 *
 * `en-CA` porque su formato de fecha ES el ISO —2026-08-11—, que es lo que
 * espera una columna `date`. No hay truco de zona horaria en el medio.
 * Perú no tiene horario de verano, así que UTC-5 vale todo el año, pero se
 * pide por nombre de zona igual: una constante -5 es una bomba de relojería
 * el día que se decida cambiarlo.
 */
export const ZONA = "America/Lima";
export const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: ZONA });

/* La hora de un instante, en Lima. Un `timestamptz` formateado sin zona sale
 * en la del servidor —UTC en producción—, así que un comentario de las nueve
 * de la noche se leía con la fecha de mañana. */
export const fechaHoraLima = (f: string | Date) =>
  new Date(f).toLocaleString("es-PE", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: ZONA });
export const fechaDiaLima = (f: string | Date) =>
  new Date(f).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: ZONA });

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
