/* ── LA CAJA — saldos y totales, decididos en un solo sitio ──
 *
 * Control interno: lo que entra y lo que sale del día a día. Nada de esto se
 * rinde a DAFO (para eso están lib/dj.ts y los comprobantes del fondo).
 *
 * Como los demás archivos de reglas, no importa nada de Supabase: lo usan el
 * servidor y el cliente, y una regla que se escribe dos veces se corrige en
 * una.
 */

export type CajaMin = {
  id: string; nombre: string; tipo: string;
  saldo_inicial?: number | string | null;
  /* Desde cuándo vale ese saldo inicial. NO es decorativo: quien lo pone
     acaba de contar el sobre HOY, y en ese conteo ya están los gastos de este
     mes que ya apuntó. Sin esta fecha, el cálculo los volvía a restar encima y
     el saldo salía mal — hacia abajo, callando, y contra un número que la
     persona acababa de verificar a mano. */
  fecha_inicio?: string | null;
};
export type CuentaMin = { id: string; nombre: string; flujo: "ingreso" | "egreso" };
export type MovMin = {
  id: string; caja_id: string; fecha: string; monto: number | string;
  cuenta_id: string | null; caja_destino: string | null;
};

const n = (v: any) => Number(v) || 0;

/* ── UN TRASPASO NO ES UN INGRESO NI UN EGRESO ──
 * Depositar en el banco el efectivo de una cobertura no mueve el patrimonio:
 * la plata es la misma y cambió de sitio. Si contara, el resumen del mes
 * sumaría un egreso y un ingreso que nunca ocurrieron, y el número que esta
 * pantalla existe para dar —cuánto entró y cuánto salió— dejaría de servir.
 * Sí mueve el SALDO de cada caja, y por eso aparece en `saldoDeCaja`. */
export const esTraspaso = (m: MovMin) => !!m.caja_destino;

/* El saldo de UNA caja: lo que había + lo que entró − lo que salió, contando
 * los traspasos en los dos sentidos.
 *
 * `saldo_inicial` no es un adorno: sin él esto sería «la suma de lo apuntado
 * desde que uso el sistema», que no es el dinero que hay en el sobre — y se
 * leería como si lo fuera. Un saldo que no cuadra con la realidad enseña a no
 * mirar el saldo, y entonces el módulo entero sobra.
 */
export function saldoDeCaja(caja: CajaMin, movs: MovMin[], cuentas: CuentaMin[]): number {
  const flujoDe = new Map(cuentas.map(c => [c.id, c.flujo]));
  const desde = caja.fecha_inicio || null;
  let s = n(caja.saldo_inicial);
  for (const m of movs) {
    /* Lo anterior al conteo YA está dentro del saldo inicial. Volver a sumarlo
       es contarlo dos veces, y el error va justo contra el único número que la
       persona verificó a mano. */
    if (desde && m.fecha < desde) continue;
    const monto = n(m.monto);
    if (esTraspaso(m)) {
      if (m.caja_id === caja.id) s -= monto;
      if (m.caja_destino === caja.id) s += monto;
      continue;
    }
    if (m.caja_id !== caja.id) continue;
    /* Explícito en los dos lados. Con un `else`, un movimiento cuya cuenta no
       esté en la lista —una consulta truncada, una fila vieja— se restaba como
       egreso sin que nada lo dijera: el saldo bajaba por un dato que el sistema
       no supo leer. Lo desconocido no mueve el saldo y se cuenta aparte. */
    const fl = flujoDe.get(m.cuenta_id || "");
    if (fl === "ingreso") s += monto;
    else if (fl === "egreso") s -= monto;
  }
  return s;
}

/* Lo que de verdad entró y salió en un periodo. Los traspasos quedan fuera de
   los dos lados; se cuentan aparte por si hace falta explicar por qué el saldo
   de una caja bajó sin que hubiera gastos. */
export function totales(movs: MovMin[], cuentas: CuentaMin[]) {
  const flujoDe = new Map(cuentas.map(c => [c.id, c.flujo]));
  let ingresos = 0, egresos = 0, traspasos = 0, sinClasificar = 0;
  for (const m of movs) {
    const monto = n(m.monto);
    if (esTraspaso(m)) { traspasos += monto; continue; }
    const fl = flujoDe.get(m.cuenta_id || "");
    if (fl === "ingreso") ingresos += monto;
    else if (fl === "egreso") egresos += monto;
    /* Ni ingreso ni egreso: su cuenta no se pudo leer. Se cuenta aparte y se
       dice, en vez de engordar los egresos con algo que el sistema no entendió. */
    else sinClasificar += monto;
  }
  return { ingresos, egresos, resultado: ingresos - egresos, traspasos, sinClasificar };
}

/* El desglose por cuenta, que es la pregunta real del mes: no «cuánto gasté»
   sino «en qué». Ordenado de mayor a menor porque lo que importa mirar es lo
   grande, y las cuentas sin movimiento no salen —una lista con nueve ceros
   esconde las tres que sí tienen algo. */
export function porCuenta(movs: MovMin[], cuentas: CuentaMin[]) {
  const suma = new Map<string, number>();
  for (const m of movs) {
    if (esTraspaso(m) || !m.cuenta_id) continue;
    suma.set(m.cuenta_id, (suma.get(m.cuenta_id) || 0) + n(m.monto));
  }
  return cuentas
    .filter(c => suma.has(c.id))
    .map(c => ({ ...c, total: suma.get(c.id) as number }))
    .sort((a, b) => b.total - a.total);
}

export const ICO_CAJA: Record<string, string> = {
  efectivo: "💵", banco: "🏦", otro: "📦",
};

export const money = (v: number) => {
  const x = Number(v) || 0;
  const exacto = Math.abs(x - Math.round(x)) < 0.005;
  return `S/ ${x.toLocaleString("es-PE", {
    minimumFractionDigits: exacto ? 0 : 2,
    maximumFractionDigits: exacto ? 0 : 2,
  })}`;
};
