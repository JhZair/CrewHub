import { CERRADOS } from "@/lib/familia";

/* EL PLAZO DE UN CASO: cuánto falta, de qué color, y cuánta barra.
 *
 * Estaba escrito en ONCE sitios, con cuatro umbrales y dos horas de corte:
 *   feed, pantalla, tablero, timeline   d≤2 rojo · d≤7 amarillo · T12:00
 *   /casos, banco (×2), destacados      d≤3 amarillo · T23:59:59  ← otro
 *   /admin                              d≤3 rojo · d≤15 amarillo ← otro más
 *   /qhaway                             d≤2 AMARILLO             ← invertido
 *   la barra del feed                   ni miraba los días
 *
 * O sea que el mismo caso era urgente o no según la pantalla que miraras. Lo
 * peor: en /qhaway —el panel del bot que VIGILA los vencimientos— el rojo y
 * el amarillo estaban al revés que en el resto, así que marcaba tranquilo lo
 * que el feed gritaba. Y los destacados del feed usaban un umbral distinto
 * que las tarjetas del feed, a trescientas líneas, en el mismo archivo.
 *
 * (Escribí «cuatro veces» en este comentario al crear el archivo. Luego
 *  «nueve». Eran once. El lib que vino a acabar con las copias nació dos
 *  veces con la cuenta mal: las supuse mirando, en vez de buscarlas.)
 *
 * Y la barra del feed ni siquiera miraba los días: medía qué fracción de la
 * vida del caso había pasado —de cuándo lo escribiste a cuándo vence—. Por
 * eso un aviso escrito esta mañana para el rodaje de mañana salía con el
 * texto «vence en 1 día» en ROJO y la barra de abajo en VERDE: el texto
 * miraba el calendario y la barra miraba cuándo tecleaste. Dos casos que
 * vencen mañana, uno escrito hace 5 meses y otro hoy, tenían barras
 * opuestas con la misma urgencia. Lo dijo John (17/07) mirando el feed:
 * «¿por qué está pequeñita?».
 *
 * Ahora la barra se llena según el plazo SE VIENE ENCIMA, en el mismo
 * horizonte que usa el texto. Algo que vence en tres meses no pinta barra:
 * hoy no es tuyo.
 */

/** Días de aquí a que el plazo importe. Más allá, la barra no pinta nada.
 *  Es el mismo 7 que el texto ya usaba para poner el amarillo: el punto en
 *  que algo deja de ser «del calendario» y pasa a ser «de esta semana». */
export const HORIZONTE = 7;

/* Mediodía a propósito, no medianoche. Esto corre en el servidor (UTC) y
   nosotros vivimos en UTC-5: con `T00:00` o `T23:59` el desfase de cinco
   horas cruza el día y el conteo se equivoca en uno cerca de la medianoche.
   Al mediodía, ±5 h sigue cayendo en la misma fecha. `/casos` usaba
   `T23:59:59` y por eso podía contar un día de más. */
export const diasHasta = (fecha: string) =>
  Math.ceil((new Date(fecha + "T12:00:00").getTime() - Date.now()) / 86400000);

export type Plazo = {
  /** Días que faltan. Negativo = vencido. */
  d: number;
  texto: string;
  color: string;
  /** 0-100. Cuánto se ha venido encima dentro del horizonte. */
  pct: number;
  vencido: boolean;
};

/** El plazo de un caso, o null si no tiene fecha o ya está cerrado.
 *  Un caso cerrado no vence: no hay nada que apurar. */
export function plazoDe(fecha: string | null | undefined, estado?: string): Plazo | null {
  if (!fecha || (estado && CERRADOS.includes(estado))) return null;
  const d = diasHasta(fecha);
  const vencido = d < 0;
  const dias = (n: number) => `${n} día${n === 1 ? "" : "s"}`;
  return {
    d,
    vencido,
    // Vencido y «vence hoy» llenan la barra: ya no queda horizonte.
    pct: Math.round(Math.max(0, Math.min(1, (HORIZONTE - d) / HORIZONTE)) * 100),
    texto: vencido ? `⏱ VENCIDO hace ${dias(-d)}`
      : d === 0 ? "⏱ VENCE HOY"
      : `⏱ vence en ${dias(d)}`,
    // Umbrales del feed, que era el más completo de los tres. Ahora, el único.
    color: d <= 2 ? "var(--red)" : d <= HORIZONTE ? "var(--yellow)" : "var(--dim)",
  };
}
