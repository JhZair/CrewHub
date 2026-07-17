/* LA FAMILIA DE UN CASO: padres e hijos, en un solo sitio.
 *
 * «¿Cuántos sub-casos tiene, y cuántos ya están cerrados?» estaba escrito
 * cuatro veces —feed, tablero, ficha de entidad, buscador— y ya había
 * divergido: el del tablero solo contaba el total y nunca supo cuántos
 * estaban cerrados, así que un caso con todo terminado se veía igual que uno
 * sin empezar.
 *
 * Y «cerrado» es la otra decisión que andaba suelta: un sub-caso cuenta como
 * hecho si está `resuelta` O `archivada` — archivar es una forma de cerrar,
 * no de olvidar. Esa lista literal aparecía en cada copia.
 */

export const CERRADOS = ["resuelta", "archivada"];

export type Familia = { total: number; ok: number };

/** Cuenta hijos por padre a partir de filas que traigan `padre_id` y `estado`.
 *  No consulta nada: recibe lo ya traído. Así sirve igual cuando los hijos
 *  vienen de su propia consulta (`.in("padre_id", ids)`) que cuando ya están
 *  dentro de un lote más grande —el buscador se trae 1500 publicaciones y la
 *  familia sale de ahí sin pedir una sola fila más—. */
export const contarHijos = (filas: any[] | null | undefined): Map<string, Familia> => {
  const m = new Map<string, Familia>();
  (filas || []).forEach((h: any) => {
    if (!h?.padre_id) return;
    const x = m.get(h.padre_id) || { total: 0, ok: 0 };
    x.total++;
    if (CERRADOS.includes(h.estado)) x.ok++;
    m.set(h.padre_id, x);
  });
  return m;
};

/** Color del contador: verde solo cuando están TODOS cerrados. El verde a
 *  medias es el que hace que nadie lo mire. */
export const colorFamilia = (f: Familia) =>
  f.ok === f.total ? "var(--green)" : "var(--teal)";
