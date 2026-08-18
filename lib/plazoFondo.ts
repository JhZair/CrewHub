/* ── EL PLAZO DE UN FONDO — leído del acta, no supuesto ──
 *
 * Esto existe porque el sistema estaba diciendo una fecha que no era.
 *
 * En tres sitios había una función `masDosAnios(desembolso)` con el comentario
 * «Desembolso + 2 años (acta 7.2): el plazo de ejecución». La cláusula 7.2 del
 * acta 042-2024-DAFO dice, literalmente:
 *
 *   «El plazo máximo para la ejecución del PROYECTO es de hasta UN (01) AÑO
 *    calendario desde la entrega del estímulo económico a la PERSONA JURÍDICA.»
 *
 * Un año. La cláusula que se citaba para justificar los dos años es la que dice
 * uno. Los dos años salen de sumarle la prórroga de la cláusula 8.1 —otro año—
 * y ahí está el error de fondo: la prórroga NO es automática. Hay que pedirla
 * ANTES de que venza el primer año, con sustento del retraso, informe de
 * actividades, cronograma actualizado y un documento bancario. Si no se pidió,
 * el plazo venció al año.
 *
 * La consecuencia no era estética. Para PO-003 —desembolso 11/09/2024— la
 * pantalla anunciaba «Plazo: 11/09/2026» cuando el plazo real vencía el
 * 11/09/2025. Un año entero de tranquilidad falsa sobre un fondo del Estado
 * que, si nadie pidió prórroga, está en incumplimiento desde entonces.
 *
 * ── QUIÉN MANDA ──
 * `fecha_limite_rendicion` es lo que dice el acta y una persona cargó leyéndola:
 * eso manda. El cálculo desde el desembolso es solo una COMPROBACIÓN — sirve
 * para detectar que las dos no concuerdan, no para reemplazar a la primera. Una
 * fecha derivada de un supuesto no puede pisar una fecha copiada de un
 * documento firmado.
 */

/** Cláusula 7.2: un año calendario desde la entrega del estímulo. */
export const PLAZO_MESES = 12;
/** Cláusula 8.1: hasta un año más, y SOLO si se solicitó antes de vencer. */
export const PRORROGA_MESES = 12;

/** Suma meses a una fecha ISO corta, sin líos de zona horaria. */
export function masMeses(iso?: string | null, meses = PLAZO_MESES): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return null;
  const [, y, mm, d] = m;
  const base = new Date(Date.UTC(+y, +mm - 1 + meses, +d));
  /* Si el día no existe en el mes destino (31 de enero + 1 mes), `Date` se va
     al mes siguiente. Se retrocede al último día del mes que toca: un plazo
     nunca debe caer más tarde de lo que corresponde por un detalle de
     calendario. */
  const esperado = (+mm - 1 + meses) % 12;
  if (base.getUTCMonth() !== esperado) base.setUTCDate(0);
  return base.toISOString().slice(0, 10);
}

export type PlazoFondo = {
  /** La fecha que manda, la que hay que cumplir. */
  limite: string | null;
  /** De dónde sale: del acta cargada a mano, o calculada desde el desembolso. */
  fuente: "acta" | "prorroga" | "calculado" | null;
  /** Lo que da el cálculo desde el desembolso (para comprobar, no para mandar). */
  calculado: string | null;
  /** Hasta cuándo podría llegar CON prórroga concedida. Es un techo, no un plazo. */
  techoConProrroga: string | null;
  /** El acta y el cálculo no concuerdan: hay que mirar por qué. */
  discrepa: boolean;
  /** ¿Hay prórroga registrada? Cambia por completo qué fecha vale. */
  conProrroga: boolean;
};

export function plazoFondo(p: {
  fecha_desembolso?: string | null;
  fecha_limite_rendicion?: string | null;
  fecha_prorroga?: string | null;
}): PlazoFondo {
  const des = p.fecha_desembolso || null;
  const acta = p.fecha_limite_rendicion || null;
  const pro = p.fecha_prorroga || null;
  const calculado = masMeses(des, PLAZO_MESES);
  const techoConProrroga = masMeses(des, PLAZO_MESES + PRORROGA_MESES);

  /* La prórroga concedida manda sobre todo: es una fecha nueva otorgada por el
     Ministerio, no un cálculo. Luego el acta. Y solo si no hay ninguna de las
     dos, el cálculo — diciendo que es un cálculo. */
  const limite = pro || acta || calculado;
  const fuente: PlazoFondo["fuente"] =
    pro ? "prorroga" : acta ? "acta" : calculado ? "calculado" : null;

  /* Discrepa solo si hay las dos cosas que comparar y no coinciden. Sin
     prórroga: el acta debería caer al año del desembolso. */
  const discrepa = !!(acta && calculado && !pro && acta !== calculado);

  return { limite, fuente, calculado, techoConProrroga, discrepa, conProrroga: !!pro };
}

export const ETIQ_FUENTE: Record<Exclude<PlazoFondo["fuente"], null>, string> = {
  prorroga: "prórroga concedida",
  acta: "según el acta",
  calculado: "calculado: desembolso + 1 año (acta 7.2)",
};
