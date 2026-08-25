import { CERRADOS } from "@/lib/familia";
import { plazoDe, diasHasta } from "@/lib/plazo";
import { esInformativo, rotuloEstado } from "@/lib/estados";
import { hoyLima } from "@/lib/fechas";

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

/** ⏳ El mayor entre la ventana consumida y el plazo que se viene encima.
 *
 *  ── DE DÓNDE ARRANCA LA VENTANA ──
 *  De `fecha_inicio` si el caso la tiene; si no, de `creado_en`. Es la misma
 *  regla que usa la agenda para dibujar la barra, y tiene que serlo: si la
 *  ficha midiera desde que se escribió el caso y la agenda desde que empieza
 *  el trabajo, el mismo rodaje saldría «80 % consumido» en una pantalla y
 *  «aún no empieza» en la otra, y no habría forma de saber cuál creer.
 *  Un caso apuntado en enero para un rodaje de agosto no lleva siete meses
 *  consumiéndose: lleva siete meses esperando, que no es lo mismo. */
export function tiempoDe(
  creado: string, limite: string | null | undefined, estado: string,
  inicio?: string | null,
): Barra | null {
  if (!limite || CERRADOS.includes(estado)) return null;
  const encima = plazoDe(limite, estado)?.pct ?? 0;

  // `T12:00:00` para que la fecha suelta no se corra un día en Lima (UTC-5).
  const t0 = inicio ? new Date(inicio + "T12:00:00").getTime() : new Date(creado).getTime();
  const t1 = new Date(limite + "T12:00:00").getTime();
  const total = Math.round((t1 - t0) / DIA);
  const ahora = Date.now();
  const pasados = Math.round((ahora - t0) / DIA);
  /* ── LO QUE AÚN NO EMPIEZA NO SE HA CONSUMIDO ──
     El `: 100` de abajo decía «creado el mismo día que vence: la ventana ya se
     agotó», y era cierto mientras `t0` fuera `creado_en` —hoy o antes—. Con
     `fecha_inicio` explícita dejó de serlo: una actividad de UN SOLO DÍA en
     noviembre tiene `total = 0` y salía al 100 %, con la barra llena y el
     veredicto «🐢 vas retrasado» para algo que no ha empezado. Y no era un
     caso raro: todo lo que materializa el cronograma con `fecha_fin` nula o
     igual al inicio nace así.
     El orden importa: primero se pregunta si ya empezó. */
  const ventana = ahora <= t0 ? 0
    : total > 0
      ? Math.round(Math.max(0, Math.min(1, (ahora - t0) / (t1 - t0))) * 100)
      : 100;   // ventana de un solo día, y ese día ya llegó

  const d = diasHasta(limite);
  const plazo = d < 0 ? `vencido hace ${dias(-d)}` : d === 0 ? "vence hoy" : `vence en ${dias(d)}`;
  // Un caso que aún no arranca lo DICE, en vez de enseñar «0 de 5 días» — que
  // se lee como «va empezando» cuando lo cierto es «todavía no toca».
  if (ahora <= t0) {
    const faltan = Math.max(1, Math.round((t0 - ahora) / DIA));
    return { pct: encima, texto: `empieza en ${dias(faltan)} · ${plazo}` };
  }
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
  /** Si el caso tiene ventana, la barra ⏳ se mide desde aquí y no desde que
   *  se escribió. Ver `tiempoDe`. */
  fecha_inicio?: string | null;
  hijos?: { ok: number; total: number } | null;
  vinculadas?: { conTrabajo: number; total: number } | null;
  vinculadasTotal?: number;
  /** Fecha del último evento que NO sea charla (comentario/bot). Si se omite
   *  (undefined) NO se evalúa estancamiento: no saberlo no es estar detenido
   *  —los listados no cargan la bitácora y darían a todo por estancado—. */
  ultimoMovimiento?: string | null;
}): Progreso | null {
  /* `esInformativo` y no `esAviso`: en una reunión tampoco se «avanza» —
     ocurre—, y con la escalera del estado salía con barra de trabajo, veredicto
     y hasta «💤 estancada N días» sobre algo que solo estaba esperando su día.
     Y como sus estados no incluyen «resuelta», esa barra era estructuralmente
     incumplible: no había forma de llegar al 100 %. */
  if (a.tipo && esInformativo(a.tipo)) return null;

  const trabajo = trabajoDe(a);
  if (!trabajo) return null;   // no se puede medir sin contradecir a otra pantalla
  const tiempo = tiempoDe(a.creado_en, a.fecha_limite, a.estado, a.fecha_inicio);
  const desvio = tiempo ? trabajo.pct - tiempo.pct : null;

  /* ── LO QUE NO HA EMPEZADO NO SE JUZGA ──
     Un caso planificado para noviembre tiene la ventana al 0 % y la escalera
     del estado al 50: el desvío daba +50 y el veredicto «🚀 vas adelantado»
     para algo que nadie ha tocado todavía. Igual de falso al revés.
     Y `estancadoDe` mide desde `creado_en`: en un rodaje apuntado en enero
     para agosto diría «200 días sin movimiento real» al lado de una barra que
     dice que aún no toca. No es estar detenido, es estar esperando — y esa es
     la misma frase que justifica que la ventana arranque en `fecha_inicio`.
     Las dos cosas se callan, que es lo único honesto que se puede decir. */
  const noEmpezado = !!a.fecha_inicio && a.fecha_inicio > hoyLima();

  return {
    tiempo, trabajo, desvio,
    veredicto: desvio === null || noEmpezado ? null
      : desvio >= MARGEN ? "adelantado" : desvio <= -MARGEN ? "retrasado" : "a_tiempo",
    // El último movimiento nunca es anterior a la creación del caso.
    estancado: a.ultimoMovimiento === undefined || noEmpezado
      ? null
      : estancadoDe(a.ultimoMovimiento || a.creado_en, a.estado),
  };
}
