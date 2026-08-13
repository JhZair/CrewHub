/* ── EN QUÉ PUNTO ESTÁ UN PAGO — decidido en un solo sitio ──
 *
 * Lo usan el panel de liquidación, el de RHE y cualquier alerta que quiera
 * contar cuántos expedientes van a medias. Por eso este archivo no importa
 * nada de Supabase ni de servidor: en cuanto lo hiciera, el cliente dejaría de
 * compilar y la regla acabaría copiada en dos sitios con palabras distintas.
 * Es la misma lección de lib/casilla.ts y lib/fondos.ts.
 *
 * NINGUNA de estas etapas es una columna que alguien avanza. Se deducen de los
 * hechos que ya existen —hay recibo, tiene comprobante, salió el dinero— y por
 * eso no pueden quedarse desactualizadas ni contradecir a la realidad. La
 * única que se guarda es el cierre, porque es lo único que no es un hecho sino
 * una decisión: alguien miró esto y dice que está bien.
 */

export type RheMin = {
  id: string;
  url?: string | null;          // el PDF del recibo girado
  numero?: string | null;
  monto?: number | string | null;
  pagado_en?: string | null;
  pagado_url?: string | null;   // el comprobante del pago (voucher, captura)
  pagado_medio?: string | null;
};

/* Los dos documentos de un pago, que son distintos y tardaron en separarse:
 *   `url`        → el RHE girado. Dice qué se DEBÍA y por cuánto.
 *   `pagado_url` → el voucher, la captura del BCP, el recibo del efectivo.
 *                  Dice que el dinero SALIÓ.
 * Tenerlos en un solo campo hacía imposible distinguir «giró el recibo y no le
 * ha pagado» de «le pagó», que es exactamente la diferencia que importa.
 */

export const MEDIOS: [string, string][] = [
  ["transferencia", "Transferencia"],
  ["deposito", "Depósito"],
  ["efectivo", "Efectivo"],
  ["otro", "Otro"],
];
export const rotuloMedio = (m?: string | null) =>
  MEDIOS.find(([k]) => k === m)?.[1] || "pagado";

/* Un pago en efectivo puede no tener más papel que la firma de quien cobró;
   una transferencia SIEMPRE deja captura. Por eso la falta de comprobante solo
   se reclama donde tiene que haberlo — reclamar lo imposible enseña a ignorar
   el aviso. */
export const EXIGE_COMPROBANTE = (medio?: string | null) => medio !== "efectivo";

export const VIAS_GIRO: [string, string][] = [
  ["oficina", "Oficina"],
  ["delegado", "Katy, con su clave SOL"],
  ["propio", "Lo giró la persona"],
];
export const rotuloGiro = (v?: string | null) =>
  VIAS_GIRO.find(([k]) => k === v)?.[1] || "sin decir";

export type LiqMin = {
  estado?: string | null;       // confirmado | liquidado
  liquidado_en?: string | null;
  cerrado_en?: string | null;
};

/* Las etapas, en el orden en que ocurren. La clave se usa para agrupar y
   contar; el resto es cómo se dice. */
export type ClaveEtapa =
  | "abierta" | "confirmada" | "sin_recibo" | "sin_comprobante"
  | "sin_pago" | "completo" | "cerrado";

/* ── LO QUE TOCA AHORA, NO LO QUE FALTA ──
 *
 * Las tres etapas del medio se decían como carencias —«sin recibo», «sin
 * comprobante», «sin pago»— y eso las hacía leerse como reproches en el
 * momento en que no hay nada que reprochar: un mes recién liquidado no tiene
 * recibo porque el recibo va DESPUÉS, y no puede ir antes —el monto que se
 * gira es el que produce la liquidación—. Un tablero que llama fallo al curso
 * normal de las cosas enseña a ignorar sus colores.
 *
 * Así que las intermedias dicen el paso siguiente y van en gris. La alarma no
 * la da la etapa sino el TIEMPO: cuando un expediente lleva parado más de
 * DIAS_ATASCO, sale el ⏳ al lado. Estar en el paso tres no es un problema;
 * llevar tres semanas en el paso tres, sí.
 */
export const ETAPA: Record<ClaveEtapa, { ico: string; txt: string; col: string }> = {
  abierta:         { ico: "⚪", txt: "mes abierto",              col: "var(--dim)" },
  confirmada:      { ico: "🟡", txt: "sin liquidar",             col: "var(--yellow)" },
  sin_recibo:      { ico: "→", txt: "toca girar el recibo",      col: "var(--muted)" },
  sin_comprobante: { ico: "→", txt: "toca subir el comprobante", col: "var(--muted)" },
  sin_pago:        { ico: "→", txt: "toca registrar el pago",    col: "var(--muted)" },
  completo:        { ico: "🟢", txt: "completo",                 col: "var(--green)" },
  cerrado:         { ico: "🔒", txt: "cerrado",                  col: "var(--teal)" },
};

/* ¿Salió el dinero de este recibo, y con qué respaldo?
 *
 *   null        · no consta el pago
 *   "sin_papel" · alguien lo dio por pagado y no hay comprobante
 *   "probado"   · hay comprobante (o es efectivo, donde puede no haberlo)
 *
 * La primera versión de esto miraba el estado de cuenta y trataba la línea del
 * banco como la prueba dura. Estaba mal: un cheque de gerencia paga a doce
 * personas de golpe, así que un movimiento NO prueba el pago de un recibo
 * concreto. Lo que sí lo prueba es el comprobante que Katy guarda de todas
 * formas — esta transferencia, a esta persona, por este monto.
 *
 * `conMovimiento` sigue entrando porque la conciliación del fondo sí ata
 * retiros a recibos cuando la correspondencia es uno a uno; ahí suma como
 * respaldo. Ya no es la vía principal.
 */
export type Pago = null | "sin_papel" | "probado";

export function pagoDe(r: RheMin, conMovimiento?: Set<string>): Pago {
  if (!r.pagado_en) return null;
  if (r.pagado_url?.trim()) return "probado";
  if (conMovimiento?.has(r.id)) return "probado";
  /* En efectivo no siempre hay papel que pedir, y exigirlo dejaría un ámbar
     que nadie puede apagar. Lo dicho en la nota es todo el rastro que hay. */
  if (!EXIGE_COMPROBANTE(r.pagado_medio)) return "probado";
  return "sin_papel";
}

/* Un pago sin comprobante no bloquea el expediente —el dinero salió, lo dice
   quien lo pagó— pero se dice, porque dentro de un año ese «pagado» no lo va a
   poder comprobar nadie. */
export const PAGO_SIN_PAPEL = "sin comprobante adjunto";

/* La etapa de una liquidación, dados SUS recibos.
 *
 * Se para en el primer hueco, no en el último: si no hay recibo, da igual que
 * el pago esté declarado — el orden de la tubería es el orden en que hay que
 * resolver las cosas, y decir «sin pago» cuando lo que falta es el recibo
 * manda a mirar donde no está.
 *
 * Con varios recibos para un mes (un adelanto y un saldo) gana el PEOR: el
 * expediente no está completo hasta que lo están todos sus recibos. Quedarse
 * con el mejor habría dado por terminado un mes con la mitad sin pagar.
 */
export function etapaLiquidacion(
  liq: LiqMin | null | undefined,
  rhes: RheMin[],
  conMovimiento?: Set<string>,
): ClaveEtapa {
  if (!liq) return "abierta";
  if (liq.cerrado_en) return "cerrado";
  if (liq.estado !== "liquidado") return "confirmada";
  if (!rhes.length) return "sin_recibo";

  /* `some` y no `every`: basta UN recibo sin comprobante para que el
     expediente no lo tenga. */
  if (rhes.some(r => !String(r.url || "").trim())) return "sin_comprobante";
  if (rhes.some(r => !pagoDe(r, conMovimiento))) return "sin_pago";
  return "completo";
}

/* ¿Cuánto lleva atascada? Solo tiene sentido desde que se liquidó: antes de
   eso el mes todavía se está viviendo y «lleva 20 días» no querría decir nada.
   Null cuando no hay nada que contar —«—» dice la verdad, «0 días» mentiría—,
   la misma regla que `diasDesde` en lib/casilla.ts. */
export const diasParado = (liq: LiqMin | null | undefined): number | null => {
  if (!liq?.liquidado_en || liq.cerrado_en) return null;
  return Math.floor((Date.now() - new Date(liq.liquidado_en).getTime()) / 86400000);
};

/* A partir de aquí un expediente liquidado y sin terminar deja de ser normal.
 * Quince días: el mes se liquida a principios del siguiente y girar el recibo
 * y pagar es cosa de una semana larga. Antes de eso, avisar sería avisar del
 * curso normal de las cosas.
 *
 * Esto NO es un plazo legal ni un estado: es cuándo conviene mirar. Por eso
 * vive aquí y no en la base — cambiarlo es cambiar de opinión, no migrar.
 */
export const DIAS_ATASCO = 15;

export const atascada = (liq: LiqMin | null | undefined, etapa: ClaveEtapa): boolean => {
  if (etapa === "completo" || etapa === "cerrado") return false;
  const d = diasParado(liq);
  return d !== null && d >= DIAS_ATASCO;
};

/* Lo que falta, dicho como una instrucción y no como un diagnóstico. «Sin
   comprobante» describe; «falta subir el PDF a Drive y pegar el link» dice qué
   hacer, que es lo que se necesita a las nueve de la noche de un viernes. */
export const QUE_FALTA: Record<ClaveEtapa, string> = {
  abierta: "Nadie ha confirmado este mes todavía.",
  confirmada: "El mes está confirmado pero sin liquidar. Falta congelar lo aprobado.",
  /* Se explica el ORDEN, porque la primera reacción al verlo es «¿no debería
     haber cargado el recibo antes de liquidar?». No se puede, y por eso: el
     importe que se gira es el que produce la liquidación. Pedir el recibo
     antes sería pedir el monto antes de calcularlo. */
  sin_recibo: "Ahora toca girar el RHE en SUNAT por este importe y registrarlo aquí, enlazado a este mes. Va después de liquidar a propósito: el monto del recibo es el que acaba de congelar la liquidación.",
  sin_comprobante: "El recibo está registrado pero sin su PDF: súbelo a Drive y pega el link en 🧾 RHE.",
  sin_pago: "Falta registrar el pago: cómo salió el dinero y su comprobante (la captura de la transferencia, el voucher del depósito).",
  completo: "No falta nada. Revisa los montos y ciérralo.",
  cerrado: "Revisado y terminado.",
};
