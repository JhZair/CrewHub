/* ── EL SALDO DE DECLARACIONES JURADAS ──
 *
 * DAFO acepta que parte del fondo se rinda sin comprobante, con declaración
 * jurada, y lo topea a un porcentaje del estímulo. Pasarse no es un papel
 * rechazado: el contrato obliga a DEVOLVER el exceso (cláusula 6.9), y esa
 * plata ya se pagó en efectivo a gente en comunidad. Se paga dos veces.
 *
 * Por eso este archivo contesta «CUÁNTO QUEDA» y no «cuánto se usó». Son el
 * mismo número al revés y no sirven igual: el que hace falta saber antes de
 * subir a la puna con el cuaderno es el que queda.
 *
 * Es lib/cuarta.ts otra vez —un tope que se consume y avisa antes de romperse—
 * y por eso tiene la misma forma. Y como aquel, no importa nada de Supabase:
 * lo usan el servidor y el cliente.
 */

/* ── DE DÓNDE SALE EL TOPE, Y POR QUÉ NO DE UNA CONSTANTE ──
 *
 * El porcentaje es una regla del CONCURSO (10% general, 25% cine indígena), no
 * del sistema: escribirlo aquí obligaría a desplegar el día que DAFO cambie sus
 * bases. Vive en la convocatoria.
 *
 * Y lo que de verdad obliga es el ACTA. El acta 139-2025 dice 10% para un fondo
 * de S/ 400,000 diga lo que diga la categoría, porque es lo que se firmó. Por
 * eso el de la postulación gana.
 */
export function pctDe(
  postulacion?: { tope_dj_pct?: number | string | null } | null,
  convocatoria?: { tope_dj_pct?: number | string | null } | null,
): { pct: number | null; fuente: "acta" | "bases" | null } {
  /* `>= 0` y no `> 0`: un concurso que NO admite declaraciones juradas es un
     caso real, y descartarlo como si fuera un hueco haría caer al tope de las
     bases y enseñar un margen inexistente. Cero es un dato; nulo es un hueco. */
  const p = postulacion?.tope_dj_pct == null ? NaN : Number(postulacion.tope_dj_pct);
  if (Number.isFinite(p) && p >= 0) return { pct: p, fuente: "acta" };
  const c = convocatoria?.tope_dj_pct == null ? NaN : Number(convocatoria.tope_dj_pct);
  if (Number.isFinite(c) && c >= 0) return { pct: c, fuente: "bases" };
  /* Y aquí NO se devuelve 10 por defecto, que es la tentación.
   *
   * Quedarse corto frena rodaje que sí se podía hacer: días en comunidad que no
   * se graban por un número inventado. Pasarse termina en devolver plata de un
   * bolsillo que ya pagó. Las dos equivocaciones cuestan, y ninguna avisa —el
   * sistema mostraría un saldo con toda confianza.
   *
   * Un hueco reconocido se arregla en dos minutos cargando el dato; un número
   * inventado no se descubre hasta que ya no tiene arreglo. */
  return { pct: null, fuente: null };
}

export type SaldoDJ = {
  pct: number | null;
  fuente: "acta" | "bases" | null;
  /* POR QUÉ no hay tope, cuando no lo hay. Sin esto las dos causas —falta el
     porcentaje, falta el monto adjudicado— colapsaban en un mismo `null`, y la
     pantalla ofrecía cargar el % para un fondo que ya lo tenía: se guardaba, el
     mensaje no se iba, y no había forma de salir del bucle ni de saber qué
     faltaba de verdad. */
  falta: null | "pct" | "estimulo";
  tope: number | null;       // en soles; null si no se sabe el porcentaje
  usado: number;
  resta: number | null;
  pctUsado: number | null;   // del tope, para la barra
  cerca: boolean;
  supero: boolean;
  exceso: number;            // lo que habría que devolver, si ya se pasó
};

export function saldoDJ(
  estimulo: number | string | null | undefined,
  usado: number,
  postulacion?: { tope_dj_pct?: number | string | null } | null,
  convocatoria?: { tope_dj_pct?: number | string | null } | null,
): SaldoDJ {
  const { pct, fuente } = pctDe(postulacion, convocatoria);
  const monto = Number(estimulo) || 0;
  /* Sin porcentaje o sin monto adjudicado no hay tope que calcular. Se
     devuelve null y no cero: cero diría «no te queda nada», que es una
     afirmación, y lo que pasa es que no se sabe. */
  const falta: null | "pct" | "estimulo" =
    pct === null ? "pct" : monto <= 0 ? "estimulo" : null;
  const tope = falta === null ? (monto * (pct as number)) / 100 : null;

  if (tope === null) {
    return { pct, fuente, falta, tope: null, usado, resta: null, pctUsado: null,
      cerca: false, supero: usado > 0 && pct === 0, exceso: pct === 0 ? usado : 0 };
  }
  const resta = tope - usado;
  return {
    pct, fuente, falta: null, tope, usado,
    resta: Math.max(0, resta),
    pctUsado: Math.round((usado / tope) * 100),
    /* 80% como en lib/cuarta.ts, y por la misma razón: el aviso tiene que
       llegar cuando todavía se puede decidir otra cosa —cambiar quién sube,
       pedir factura a un proveedor formal, recortar días— y no cuando ya se
       gastó. */
    /* `usado < tope`, no `<=`: gastado exactamente el tope no es «cerca», es
       agotado. En ámbar diría «quedan S/ 0» con cara de advertencia cuando lo
       que hay es un límite alcanzado. */
    cerca: usado < tope && usado / tope >= 0.8,
    supero: usado > tope,
    exceso: Math.max(0, usado - tope),
  };
}

/* Cuántos días de puna caben en lo que queda. La pregunta real antes de subir
   no es «cuántos soles me quedan» sino «¿alcanza para esta salida?», y esa se
   contesta con un gasto diario aproximado. Se deja fuera de la UI por defecto:
   es una estimación y presentarla como dato la volvería una promesa. */
export const diasQueAlcanzan = (resta: number | null, gastoDiario: number): number | null =>
  resta === null || gastoDiario <= 0 ? null : Math.floor(resta / gastoDiario);

/* El rango de fechas de un gasto, tal como lo pide el formato: un día o un
   tramo. «Del 3 al 9 de agosto» es UNA fila del cuaderno de la puna, y una DJ
   solo admite nueve. */
export const rangoFechas = (desde: string, hasta?: string | null): string => {
  const f = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });
  if (!hasta || hasta === desde) return f(desde);
  return `${f(desde)} — ${f(hasta)}`;
};

export const trayecto = (origen?: string | null, destino?: string | null): string => {
  const o = (origen || "").trim(), d = (destino || "").trim();
  if (o && d) return `${o} → ${d}`;
  return o || d || "—";
};

/* Con céntimos cuando los hay. Redondeando siempre, un exceso de S/ 0,30 salía
 * como «⚠ Pasaste el tope en S/ 0» —el aviso rojo contradiciendo a su propio
 * número— y un saldo de S/ 0,40 se leía «S/ 0» en verde. En un tope que obliga
 * a devolver el exceso, el céntimo es la diferencia entre haberse pasado y no. */
export const money = (n: number) => {
  const v = Number(n) || 0;
  const exacto = Math.abs(v - Math.round(v)) < 0.005;
  return `S/ ${v.toLocaleString("es-PE", {
    minimumFractionDigits: exacto ? 0 : 2,
    maximumFractionDigits: exacto ? 0 : 2,
  })}`;
};
