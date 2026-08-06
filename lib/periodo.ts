/* ── Periodos en hora de Cusco ──
   El servidor corre en UTC (Vercel). Si "hoy" se calcula con la hora del
   servidor, empieza a las 19:00 del día anterior en Perú: verías los eventos
   de anoche mezclados con los de hoy y faltarían las últimas cinco horas.
   Perú no tiene horario de verano, así que basta con el desfase fijo. */

import { fechaConDia } from "@/lib/fechas";

const LIMA_OFFSET_MS = 5 * 3600000;   // UTC-5, todo el año

export type Periodo = "hoy" | "semana" | "mes" | "mes_pasado" | "anio" | "anio_pasado" | "todo";

export const PERIODOS: [Periodo, string][] = [
  ["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"],
  ["mes_pasado", "Mes pasado"], ["anio", "Este año"], ["anio_pasado", "Año pasado"],
  ["todo", "Todo"],
];

/* Desde cuándo cuenta el periodo, en ISO/UTC listo para la consulta.
   `todo` devuelve null: sin corte. */
/* ⚠ Solo la punta de abajo. Sirve para periodos ABIERTOS («este mes», «este
   año»); con uno cerrado («mes pasado») deja fuera el corte de arriba y el
   resultado incluye hasta hoy — sin fallar, solo mintiendo. Para eso está
   `rangoDe`, que es lo que deberían usar los llamadores nuevos.
   Se conserva porque no cuesta nada y evita romper lo que quede fuera. */
export function desdeDe(p: Periodo): string | null {
  return rangoDe(p).desde;
}

/* Los periodos CERRADOS («mes pasado», «año pasado») necesitan las dos puntas:
   con solo `desde`, «mes pasado» incluiría también este mes y diría lo mismo
   que «este año» hasta que alguien lo comprobara. */
export function rangoDe(p: Periodo): { desde: string | null; hasta: string | null } {
  if (p === "todo") return { desde: null, hasta: null };
  // "Ahora" visto como si Lima fuera UTC: así los get/set UTC dan la fecha local
  const iso = (d: Date) => new Date(d.getTime() + LIMA_OFFSET_MS).toISOString();
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
  } else if (p === "mes_pasado") {
    l.setUTCDate(1);
    const fin = new Date(l);
    l.setUTCMonth(l.getUTCMonth() - 1);
    return { desde: iso(l), hasta: iso(fin) };
  } else if (p === "anio_pasado") {
    l.setUTCMonth(0, 1);
    const fin = new Date(l);
    l.setUTCFullYear(l.getUTCFullYear() - 1);
    return { desde: iso(l), hasta: iso(fin) };
  }
  return { desde: iso(l), hasta: null };
}

/* Día en Lima de una marca de tiempo — para agrupar el historial por fecha */
export const diaLima = (iso: string) =>
  new Date(new Date(iso).getTime() - LIMA_OFFSET_MS).toISOString().slice(0, 10);

/* Hora local (0-23) en Cusco. Con la hora del servidor daría todo corrido
   cinco horas: el equipo parecería trabajar de madrugada. */
export const horaLima = (iso: string) =>
  new Date(new Date(iso).getTime() - LIMA_OFFSET_MS).getUTCHours();

export const rotuloDia = (dia: string) => {
  const hoy = diaLima(new Date().toISOString());
  const ayer = diaLima(new Date(Date.now() - 86400000).toISOString());
  if (dia === hoy) return "Hoy";
  if (dia === ayer) return "Ayer";
  return fechaConDia(dia);
};
