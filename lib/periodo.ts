/* ── Periodos en hora de Cusco ──
   El servidor corre en UTC (Vercel). Si "hoy" se calcula con la hora del
   servidor, empieza a las 19:00 del día anterior en Perú: verías los eventos
   de anoche mezclados con los de hoy y faltarían las últimas cinco horas.
   Perú no tiene horario de verano, así que basta con el desfase fijo. */

const LIMA_OFFSET_MS = 5 * 3600000;   // UTC-5, todo el año

export type Periodo = "hoy" | "semana" | "mes" | "anio" | "todo";

export const PERIODOS: [Periodo, string][] = [
  ["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"],
  ["anio", "Este año"], ["todo", "Todo"],
];

/* Desde cuándo cuenta el periodo, en ISO/UTC listo para la consulta.
   `todo` devuelve null: sin corte. */
export function desdeDe(p: Periodo): string | null {
  if (p === "todo") return null;
  // "Ahora" visto como si Lima fuera UTC: así los get/set UTC dan la fecha local
  const l = new Date(Date.now() - LIMA_OFFSET_MS);
  l.setUTCHours(0, 0, 0, 0);
  if (p === "semana") {
    // La semana arranca el lunes: el domingo es descanso, no inicio de nada
    const dia = (l.getUTCDay() + 6) % 7;   // 0 = lunes
    l.setUTCDate(l.getUTCDate() - dia);
  } else if (p === "mes") {
    l.setUTCDate(1);
  } else if (p === "anio") {
    l.setUTCMonth(0, 1);
  }
  return new Date(l.getTime() + LIMA_OFFSET_MS).toISOString();
}

/* Día en Lima de una marca de tiempo — para agrupar el historial por fecha */
export const diaLima = (iso: string) =>
  new Date(new Date(iso).getTime() - LIMA_OFFSET_MS).toISOString().slice(0, 10);

export const rotuloDia = (dia: string) => {
  const hoy = diaLima(new Date().toISOString());
  const ayer = diaLima(new Date(Date.now() - 86400000).toISOString());
  if (dia === hoy) return "Hoy";
  if (dia === ayer) return "Ayer";
  return new Date(dia + "T12:00:00").toLocaleDateString("es-PE",
    { weekday: "long", day: "numeric", month: "long" });
};
