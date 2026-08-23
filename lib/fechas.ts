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

/* ── EL DÍA DE UN INSTANTE, EN LIMA ──
 * `creado_en` es un instante en UTC. Cortarle los diez primeros caracteres da
 * el día UTC, y a partir de las 7 de la tarde en Perú eso YA ES EL DÍA
 * SIGUIENTE. Esto estaba escrito a mano en /caja, con la resta de cinco horas
 * puesta a pelo, que es la bomba de relojería que `hoyLima` avisa de no poner. */
export const diaLima = (f: string | Date) => {
  const d = aFecha(f);
  // Una fecha ilegible devuelve "" y no la cadena «Invalid Date»: quien compara
  // dos días no debería tener que saber que una de las dos puede ser un texto.
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-CA", { timeZone: ZONA }) : "";
};

/* ── CUÁNTO HACE, CONTANDO DÍAS Y NO HORAS ──
 *
 * «hoy», «ayer», «hace 3 días». Parece lo mismo que `haceOEn` y no lo es:
 * aquél cuenta tramos de 24 horas, que es lo correcto para un PLAZO —«vence
 * en 3 días»—, pero no para un APUNTE.
 *
 * Un apunte de ayer a las nueve de la noche llevaba doce horas hechas, así
 * que la resta daba cero y la lista decía «hoy» — y lo seguía diciendo hasta
 * las nueve de HOY. Quien mira una lista de apuntes no cuenta horas: si fue
 * ayer, quiere leer ayer. Y era peor de lo que parece, porque el error se ve
 * justo al revés de como se produce: la fecha se lee bien por la mañana y se
 * estropea por la noche, que es cuando se trabaja.
 *
 * Se comparan DÍAS DE CALENDARIO EN LIMA, los dos al mediodía UTC para que el
 * cambio de día no dependa de la hora del servidor.
 *
 * Estaba copiado en /comprobantes y en /obligaciones, con la misma resta y el
 * mismo fallo. Ahora está aquí. */
export function haceDias(f?: string | Date | null): string {
  if (!f) return "";
  const dia = diaLima(f);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return "";
  const d = Math.round(
    (Date.parse(hoyLima() + "T12:00:00Z") - Date.parse(dia + "T12:00:00Z")) / 86400000);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.round(d / 30);
  return m < 12 ? `hace ${m} mes${m > 1 ? "es" : ""}` : `hace ${Math.round(d / 365)} año(s)`;
}

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
