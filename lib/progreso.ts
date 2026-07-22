import { CERRADOS } from "@/lib/familia";
import { plazoDe, diasHasta } from "@/lib/plazo";
import { esAviso, rotuloEstado } from "@/lib/estados";

/* ⏳ TIEMPO vs ⚡ TRABAJO — las dos barras que dicen si vamos al día.
 *
 * El TRABAJO no se calcula con un índice de puntos por acción. Un porcentaje
 * necesita denominador y los puntos no lo tienen: si suman al pasar cosas,
 * ¿qué es el 100%? Con cualquier meta fija, un caso muy conversado llega al
 * 90% sin terminar nada y uno resuelto en tres movimientos marca 15% estando
 * hecho. Y en cuanto se nota que comentar suma, el número deja de valer.
 * Los puntos miden ESFUERZO; la barra tiene que medir TERMINACIÓN.
 *
 * Así que el denominador sale de algo real y contable, en este orden:
 *   1. cerrado          → 100%, no hay nada que estimar
 *   2. sub-casos        → resueltos / total        («5 de 8 sub-casos»)
 *   3. entidades vinculadas → con trabajo / total  («15 de 15 vinculadas»)
 *   4. si no hay nada   → la escalera del estado, gruesa pero honesta
 * Siempre con su explicación al lado: un «52%» pelado se ignora, un «5 de 8»
 * se actúa.
 *
 * El TIEMPO toma EL MAYOR de dos lecturas, porque cada una falla sola:
 *   · ventana consumida (creado→límite): buena para un trabajo planificado,
 *     pero un caso creado hoy con plazo mañana daría 0% —justo el bug que
 *     lib/plazo.ts vino a matar («¿por qué está pequeñita?», John 17/07)—.
 *   · plazo encima (lib/plazo, horizonte 7 d): buena para lo urgente, pero un
 *     proyecto de 6 meses marca 0% hasta la última semana.
 * El máximo acierta en los dos y nunca dice «tranquilo» con el plazo encima.
 */

/** Días sin movimiento real para considerar un caso detenido. Es el mismo 3
 *  que ya usa el Bot Qhaway para «dormido»: un tercer umbral solo confundiría. */
export const DIAS_ESTANCADO = 3;

/** Puntos de desvío a partir de los cuales el veredicto deja de ser «a tiempo». */
const MARGEN = 15;

/* Un movimiento REAL es cualquier cosa menos hablar. Los comentarios se
   excluyen a propósito: catorce comentarios y ningún cambio de estado es
   exactamente el caso estancado que queremos cazar. `bot` fuera también —la
   ronda automática toca casos sin que nadie trabaje, y si contara, ningún
   caso parecería detenido nunca. */
export const TIPOS_CHARLA = ["comentario", "bot"];
export const esMovimientoReal = (tipo: string) => !TIPOS_CHARLA.includes(tipo);

export type Barra = { pct: number; texto: string };
export type Progreso = {
  tiempo: Barra | null;          // null si no hay fecha límite o el caso cerró
  trabajo: Barra;
  desvio: number | null;         // trabajo − tiempo, en puntos
  veredicto: "adelantado" | "a_tiempo" | "retrasado" | null;
  estancado: { dias: number } | null;
};

const dias = (n: number) => `${n} día${n === 1 ? "" : "s"}`;
const DIA = 86400000;

/** ⏳ El mayor entre la ventana consumida y el plazo que se viene encima. */
export function tiempoDe(creado: string, limite: string | null | undefined, estado: string): Barra | null {
  if (!limite || CERRADOS.includes(estado)) return null;
  const encima = plazoDe(limite, estado)?.pct ?? 0;

  const t0 = new Date(creado).getTime();
  const t1 = new Date(limite + "T12:00:00").getTime();
  const total = Math.round((t1 - t0) / DIA);
  const pasados = Math.round((Date.now() - t0) / DIA);
  const ventana = total > 0
    ? Math.round(Math.max(0, Math.min(1, (Date.now() - t0) / (t1 - t0))) * 100)
    : 100;   // creado el mismo día que vence: la ventana ya se agotó

  const d = diasHasta(limite);
  const plazo = d < 0 ? `vencido hace ${dias(-d)}` : d === 0 ? "vence hoy" : `vence en ${dias(d)}`;
  const pct = Math.max(ventana, encima);
  // Una fecha corrupta daría NaN, y `NaN >= MARGEN` es false: la barra saldría
  // vacía y el veredicto diría «al día». Mejor no pintar nada.
  if (!Number.isFinite(pct)) return null;
  return {
    pct,
    // Las dos lecturas a la vista, para que el número se pueda auditar.
    texto: total > 0 ? `${Math.max(0, Math.min(pasados, total))} de ${dias(total)} · ${plazo}` : plazo,
  };
}

/* La escalera del estado: el último recurso, cuando el caso no tiene sub-casos
   ni entidades vinculadas de donde sacar una fracción de verdad. */
const ESCALERA: Record<string, number> = {
  abierta: 5, en_progreso: 50, seguimiento: 80, en_pausa: 30,
};

/** ⚡ Fracción real de terminación, con su explicación.
 *  `null` = no se puede calcular igual que en la ficha; mejor no pintar barra
 *  que pintar un número que se contradiga con otra pantalla. */
export function trabajoDe(a: {
  estado: string; tipo?: string;
  hijos?: { ok: number; total: number } | null;
  vinculadas?: { conTrabajo: number; total: number } | null;
  /** Cuántas entidades hay vinculadas, cuando NO se sabe cuáles tienen trabajo
   *  (los listados no cargan la bitácora). Sirve para callar, no para estimar. */
  vinculadasTotal?: number;
}): Barra | null {
  if (CERRADOS.includes(a.estado)) return { pct: 100, texto: rotuloEstado(a.estado, a.tipo) };
  if (a.hijos && a.hijos.total > 0)
    return {
      pct: Math.round((a.hijos.ok / a.hijos.total) * 100),
      texto: `${a.hijos.ok} de ${a.hijos.total} sub-casos`,
    };
  if (a.vinculadas && a.vinculadas.total > 0)
    return {
      pct: Math.round((a.vinculadas.conTrabajo / a.vinculadas.total) * 100),
      texto: `${a.vinculadas.conTrabajo} de ${a.vinculadas.total} vinculadas con trabajo`,
    };
  /* Hay vinculadas pero no sabemos cuántas tienen trabajo: la ficha usaría ESE
     denominador y aquí saldría la escalera del estado. El mismo caso diría 43%
     en su ficha y 5% en el feed —y con veredictos opuestos—. Se calla. */
  if (!a.vinculadas && (a.vinculadasTotal ?? 0) > 0) return null;
  return { pct: ESCALERA[a.estado] ?? 0, texto: `por estado · ${rotuloEstado(a.estado, a.tipo)}` };
}

/** ⚠ Días sin movimiento real, si pasan del umbral. Un caso en seguimiento o
 *  en pausa NO se estanca: está detenido a propósito (misma regla que el bot). */
export function estancadoDe(ultimoMovimiento: string | null | undefined, estado: string) {
  if (CERRADOS.includes(estado) || ["seguimiento", "en_pausa"].includes(estado)) return null;
  if (!ultimoMovimiento) return null;
  const d = Math.floor((Date.now() - new Date(ultimoMovimiento).getTime()) / DIA);
  return d >= DIAS_ESTANCADO ? { dias: d } : null;
}

/** Las dos barras + veredicto + estancamiento. `null` para un aviso: no se
 *  «avanza» en un aviso, se lee — pintarle una escalera de 6 pasos mentiría. */
export function progresoDe(a: {
  creado_en: string; fecha_limite?: string | null; estado: string; tipo?: string;
  hijos?: { ok: number; total: number } | null;
  vinculadas?: { conTrabajo: number; total: number } | null;
  vinculadasTotal?: number;
  /** Fecha del último evento que NO sea charla (comentario/bot). Si se omite
   *  (undefined) NO se evalúa estancamiento: no saberlo no es estar detenido
   *  —los listados no cargan la bitácora y darían a todo por estancado—. */
  ultimoMovimiento?: string | null;
}): Progreso | null {
  if (a.tipo && esAviso(a.tipo)) return null;

  const trabajo = trabajoDe(a);
  if (!trabajo) return null;   // no se puede medir sin contradecir a otra pantalla
  const tiempo = tiempoDe(a.creado_en, a.fecha_limite, a.estado);
  const desvio = tiempo ? trabajo.pct - tiempo.pct : null;
  return {
    tiempo, trabajo, desvio,
    veredicto: desvio === null ? null
      : desvio >= MARGEN ? "adelantado" : desvio <= -MARGEN ? "retrasado" : "a_tiempo",
    // El último movimiento nunca es anterior a la creación del caso.
    estancado: a.ultimoMovimiento === undefined
      ? null
      : estancadoDe(a.ultimoMovimiento || a.creado_en, a.estado),
  };
}
