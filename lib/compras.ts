/* COMBO · UNIDAD · KIT — tres cosas que no son la misma
 *
 *   COMBO   cómo ENTRÓ. Una compra: el pack de 5 radios, el combo DJI con
 *           sus baterías y su jaula. Una boleta, un proveedor, un precio.
 *   UNIDAD  la COSA FÍSICA. A-127. Folio, estado, bitácora, daños,
 *           reparaciones, préstamos. Ya existía: es cada fila de
 *           `equipamiento`, y las cinco radios ya eran cinco unidades sin
 *           que se notara en ninguna pantalla.
 *   KIT     cómo SALE. Lo que se usa junto para hacer un trabajo.
 *
 * Que un combo NO sea un kit es la distinción que pidió el modelo: las
 * cinco radios entraron juntas y pueden salir en cinco kits distintos.
 *
 * Aquí vive lo que se calcula sobre eso, en un solo sitio, porque lo leen
 * el listado, la ficha de la compra y el KPI del inventario.
 */

/* Qué no cuenta como inventario vivo: de lib/estadosEquipo, no de una copia
   local. Importa quién decide esto —«no aparece» SÍ cuenta, porque no está
   confirmado que se perdiera— y esa decisión no puede vivir en tres sitios. */
export { FUERA_DE_INVENTARIO } from "@/lib/estadosEquipo";
import { FUERA_DE_INVENTARIO } from "@/lib/estadosEquipo";

export type Unidad = {
  id: string; folio?: string | null; nombre: string;
  estado?: string | null; categoria?: string | null;
  valor_compra?: number | string | null;
  compra_id?: string | null;
  /** Su cartel. Lo llevan las unidades y no el grupo porque el grupo se
   *  arma aquí: la lista solo sabe de equipos. */
  cartel?: string | null;
};

/* ══════════ EL FOLIO ══════════
 * A-### correlativo. Se calcula del máximo que exista y no del número de
 * filas: con 208 equipos y tres borrados, contar filas devolvería un folio
 * ya usado —y `folio` es único, así que el alta en lote entera reventaría
 * en la cuarta unidad—. */
export const PREFIJO_FOLIO = "A-";

export function numeroDeFolio(f?: string | null): number {
  const m = String(f || "").match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Los siguientes N folios libres, en orden.
 *
 *  El relleno es SIEMPRE de tres cifras, no del ancho que toque. Con un
 *  ancho variable, pasar de 999 emitía «A-1000» junto a «A-0999»: dos
 *  grafías del mismo número que el índice único no ve como iguales y que
 *  rompen cualquier orden alfabético. Pasado el 999 el número crece solo,
 *  sin ceros de más. */
export function siguientesFolios(existentes: (string | null | undefined)[], n: number): string[] {
  const max = existentes.reduce((a, f) => Math.max(a, numeroDeFolio(f)), 0);
  return Array.from({ length: n }, (_, i) =>
    `${PREFIJO_FOLIO}${String(max + 1 + i).padStart(3, "0")}`);
}

/* ══════════ EL VALOR DEL INVENTARIO ══════════
 * DOS cifras que no se suman entre sí, y se dice por qué.
 *
 * Antes era una sola —la suma de `valor_compra`— con 163 equipos sin
 * precio, así que iba corta y solo lo avisaba una nota al pie. Ahora, lo
 * que tiene precio propio suma por su cuenta; lo que no lo tiene pero
 * viene de un combo con total, suma por el combo, ENTERO y una sola vez.
 *
 * ⚠ El total de un combo se cuenta si le queda alguna unidad viva. No se
 * reparte ni se prorratea: repartir 1200 entre 6 piezas da 200 por una
 * batería que costó 60, y esa cifra inventada acabaría en un inventario
 * para un seguro. Es una aproximación por arriba y se dice que lo es.
 */
export type Compra = { id: string; nombre: string; total?: number | string | null; moneda?: string | null };

export function valorInventario(unidades: Unidad[], compras: Compra[]) {
  const vivas = unidades.filter(u => !FUERA_DE_INVENTARIO.includes(String(u.estado || "")));
  const conPrecio = vivas.filter(u => Number(u.valor_compra) > 0);
  const propio = conPrecio.reduce((a, u) => a + Number(u.valor_compra), 0);

  /* Lo que aporta un combo es su total MENOS lo que ya se contó pieza por
     pieza. Sumar el total entero encima de los precios propios contaba dos
     veces las mismas cosas: un combo de 1200 con tres piezas valoradas en
     300 daba 1500 por algo que costó 1200 — un inventario inflado, que para
     un seguro es peor que uno corto.
     Nunca baja de cero: si las piezas valoradas ya suman más que la boleta,
     el combo no aporta nada, no resta. */
  const porCompra = new Map<string, Unidad[]>();
  vivas.forEach(u => {
    if (!u.compra_id) return;
    porCompra.set(u.compra_id, [...(porCompra.get(u.compra_id) || []), u]);
  });
  const aporta = compras.map(c => {
    const n = Number(c.total);
    if (!(n > 0)) return { c, resto: 0 };
    const suyas = porCompra.get(c.id) || [];
    if (!suyas.length) return { c, resto: 0 };          // sin unidades vivas, no es inventario
    if (!suyas.some(u => !(Number(u.valor_compra) > 0))) return { c, resto: 0 };  // ya contado entero
    const yaContado = suyas.reduce((a, u) => a + (Number(u.valor_compra) > 0 ? Number(u.valor_compra) : 0), 0);
    return { c, resto: Math.max(0, n - yaContado) };
  }).filter(x => x.resto > 0);
  const combos = aporta.map(x => x.c);
  const porCombo = aporta.reduce((a, x) => a + x.resto, 0);

  /* Lo que sigue sin contarse: ni precio propio ni combo con total. Es el
     número honesto de «cuánto de esto no sabemos cuánto vale». */
  const idsCombo = new Set(combos.map(c => c.id));
  const huerfanas = vivas.filter(u =>
    !(Number(u.valor_compra) > 0) && !(u.compra_id && idsCombo.has(u.compra_id)));

  return {
    propio, porCombo, total: propio + porCombo,
    nConPrecio: conPrecio.length, nCombos: combos.length,
    sinValorar: huerfanas.length, vivas: vivas.length,
  };
}

/* ══════════ AGRUPAR UNIDADES IGUALES ══════════
 * Cinco filas que dicen «Walkie-talkie Baofeng BF-888S Radio» no informan
 * cinco veces: informan una, y esconden lo demás. Lo que hace falta saber
 * de un vistazo es cuántas hay y cómo están.
 *
 * Se agrupa por NOMBRE, no por combo: en el estante dos radios del mismo
 * modelo son lo mismo aunque se compraran en fechas distintas. La
 * procedencia no se pierde —cada unidad sigue diciendo de qué combo vino—,
 * simplemente no es lo que decide cómo se apilan.
 */
const clave = (u: Unidad) =>
  `${(u.nombre || "").trim().toLowerCase()}|${(u.categoria || "").trim().toLowerCase()}`;

export type GrupoUnidades = {
  k: string; nombre: string; categoria?: string | null;
  unidades: Unidad[];
  porEstado: [string, number][];
  /** La foto de la PRIMERA unidad que tenga una. Son el mismo producto, así
   *  que cualquiera de ellas retrata al grupo; la primera A SECAS no vale
   *  —si justo esa no tiene cartel, el grupo entero sale con el emoji
   *  aunque las otras dos tengan foto—. */
  cartel?: string | null;
};

export function agruparUnidades(unidades: Unidad[]): (Unidad | GrupoUnidades)[] {
  const m = new Map<string, Unidad[]>();
  const orden: string[] = [];
  unidades.forEach(u => {
    const k = clave(u);
    if (!m.has(k)) { m.set(k, []); orden.push(k); }
    m.get(k)!.push(u);
  });
  return orden.map(k => {
    const us = m.get(k)!;
    /* Con una sola unidad NO se agrupa: una fila plegable que esconde una
       cosa es un clic para no ver nada. */
    if (us.length === 1) return us[0];
    const cnt = new Map<string, number>();
    us.forEach(u => { const e = String(u.estado || "—"); cnt.set(e, (cnt.get(e) || 0) + 1); });
    return {
      k, nombre: us[0].nombre, categoria: us[0].categoria, unidades: us,
      porEstado: [...cnt.entries()].sort((a, b) => b[1] - a[1]),
      cartel: us.find(u => u.cartel)?.cartel || null,
    };
  });
}

export const esGrupo = (x: Unidad | GrupoUnidades): x is GrupoUnidades =>
  Array.isArray((x as GrupoUnidades).unidades);

export const soles = (n: number, moneda = "PEN") =>
  `${moneda === "USD" ? "$" : "S/"} ${Math.round(n).toLocaleString("es-PE")}`;
