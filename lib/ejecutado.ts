/* ── QUÉ CUENTA COMO EJECUTADO — en un solo sitio ──
 *
 * Un fondo se rinde de tres maneras, y las tres son gasto del proyecto:
 *
 *   · RHE          — pagos a personas con recibo por honorarios.
 *   · COMPROBANTES — facturas y boletas de proveedor.
 *   · DECLARACIONES JURADAS — gasto sin comprobante, con tope (acta cl. 6.9).
 *
 * La conciliación miraba SOLO los RHE. No fue un descuido de quien la escribió:
 * cuando se hizo, las otras dos tablas no existían. Pero el resultado, hoy, es
 * que dice «ejecutado S/ 98,270» cuando el gasto sustentado es S/ 115,811 — y
 * la PC de edición de S/ 7,588, el gasto individual más grande del fondo, no
 * aparecía contra ningún rubro.
 *
 * Un número que se llama «ejecutado» y omite un tercio del gasto no es
 * incompleto: es incorrecto, porque nadie que lo lea va a sospechar que le
 * falta algo. Aquí se juntan los tres.
 *
 * ── PERO NO SE FUNDEN ──
 * Cada gasto conserva su ORIGEN, y eso no es contabilidad de más: un rubro
 * cubierto con facturas y uno cubierto con declaraciones juradas se leen
 * distinto ante DAFO. Las DJ tienen tope y pasarse obliga a devolver plata; una
 * factura no tiene límite. Fundirlos en «ejecutado» haría desaparecer
 * justamente la diferencia por la que alguien mira esta pantalla.
 */

export type OrigenGasto = "rhe" | "comprobante" | "dj";

export type Gasto = {
  origen: OrigenGasto;
  monto: number;
  rubro_item?: string | null;
  etapa?: string | null;
};

export const META_ORIGEN: Record<OrigenGasto, { ico: string; txt: string; col: string; ayuda: string }> = {
  rhe: {
    ico: "🧾", txt: "recibos", col: "var(--teal)",
    ayuda: "Pagos a personas con recibo por honorarios.",
  },
  comprobante: {
    ico: "📄", txt: "facturas", col: "var(--blue)",
    ayuda: "Facturas y boletas de proveedor. No tienen tope: mientras más gasto se respalde así, mejor.",
  },
  dj: {
    ico: "📝", txt: "declaraciones", col: "var(--yellow)",
    ayuda: "Gasto declarado sin comprobante. TIENE TOPE (acta cl. 6.9): pasarse obliga a devolver la diferencia.",
  },
};

export const ORIGENES: OrigenGasto[] = ["rhe", "comprobante", "dj"];

const n = (v: any) => Number(v) || 0;

/* Junta las tres tablas en una sola lista. Cada una nombra el importe a su
   manera —`monto` en rhe, `importe` en las otras dos— y esa diferencia se
   resuelve AQUÍ y no en cada pantalla que quiera sumarlas. */
export function gastosDelFondo(
  rhe: any[] = [], comprobantes: any[] = [], dj: any[] = [],
): Gasto[] {
  return [
    ...rhe.map(r => ({ origen: "rhe" as const, monto: n(r.monto),
      rubro_item: r.rubro_item ?? null, etapa: r.etapa ?? null })),
    ...comprobantes.map(c => ({ origen: "comprobante" as const, monto: n(c.importe),
      rubro_item: c.rubro_item ?? null, etapa: c.etapa ?? null })),
    ...dj.map(g => ({ origen: "dj" as const, monto: n(g.importe),
      rubro_item: g.rubro_item ?? null, etapa: g.etapa ?? null })),
  ];
}

/** Reparto por origen de un conjunto de gastos: `{rhe: 1200, comprobante: 800, dj: 0}`. */
export function porOrigen(gs: Gasto[]): Record<OrigenGasto, number> {
  const out: Record<OrigenGasto, number> = { rhe: 0, comprobante: 0, dj: 0 };
  for (const g of gs) out[g.origen] += g.monto;
  return out;
}

/** «S/ 1,200 en recibos · S/ 800 en facturas» — para el título de una fila.
 *  Omite los ceros: enumerar orígenes vacíos alarga el texto sin decir nada. */
export function detalleOrigen(gs: Gasto[], money: (n: number) => string): string {
  const p = porOrigen(gs);
  const partes = ORIGENES.filter(o => p[o] > 0).map(o => `${money(p[o])} en ${META_ORIGEN[o].txt}`);
  return partes.join(" · ");
}

/* ── QUÉ HAY DENTRO DE UN RUBRO, Y CUÁNTO QUEDA ──
 *
 * El desplegable de rubro dice «Equipo del proyecto» y nada más. Quien tiene
 * que clasificar un recibo no sabe si ahí van los honorarios o los equipos, ni
 * cuánto queda de esa partida — y averiguarlo obliga a abrir el presupuesto en
 * otra pestaña, contar líneas y volver. A los veintiséis recibos, eso no se
 * hace: se elige por el nombre y se acierta a medias.
 *
 * Este texto va en el `title` de cada opción y contesta las tres preguntas de
 * un vistazo: cuánto se presupuestó, qué contiene y cuánto queda.
 *
 * ── EL SALDO ES LO QUE DECIDE ──
 * Y por eso va al final, que es donde se lee último y se recuerda. Un rubro sin
 * saldo no es que esté «lleno»: es que el siguiente gasto que se le cuelgue lo
 * sobregira, y un sobregiro DAFO lo observa. Verlo ANTES de elegir es la
 * diferencia entre repartir bien y repartir rápido.
 */
export function ayudaRubro(opts: {
  pres: number; lineas: string[]; ejec: number; money: (n: number) => string;
}): string {
  const { pres, lineas, ejec, money } = opts;
  const saldo = pres - ejec;
  const partes: string[] = [];
  if (pres > 0) partes.push(`${money(pres)} presupuestados en ${lineas.length} línea${lineas.length === 1 ? "" : "s"}`);
  else partes.push("Sin presupuesto en este rubro");
  /* Las primeras líneas, no todas: un `title` de sesenta conceptos no se lee.
     Cinco bastan para reconocer de qué va el rubro, que es la pregunta. */
  if (lineas.length) {
    partes.push(lineas.slice(0, 5).join(" · ") + (lineas.length > 5 ? ` … y ${lineas.length - 5} más` : ""));
  }
  if (pres > 0) {
    partes.push(saldo > 0 ? `Quedan ${money(saldo)}`
      : saldo === 0 ? "Sin saldo: el siguiente gasto lo sobregira"
      : `⚠ SOBREGIRADO en ${money(-saldo)}`);
  }
  return partes.join("\n");
}
