/* LA FAMILIA DE UN CASO: padres e hijos, en un solo sitio.
 *
 * «¿Cuántos sub-casos tiene, y cuántos ya están cerrados?» estaba escrito
 * cuatro veces —feed, tablero, ficha de entidad, buscador— y ya había
 * divergido: el del tablero solo contaba el total y nunca supo cuántos
 * estaban cerrados, así que un caso con todo terminado se veía igual que uno
 * sin empezar.
 *
 * Y «cerrado» es la otra decisión que andaba suelta. Ojo con lo que cambió el
 * 17/07: era `["resuelta", "archivada"]` — y ahí estaba el número que mentía.
 * «archivada» mezclaba lo hecho con lo abandonado, así que el «✅ 2/20» de los
 * sub-casos contaba como avance un sub-caso que se canceló igual que uno que
 * se terminó. Un rodaje entero cancelado se veía «completo».
 *
 * Ahora cerrado = terminado, de las DOS formas de terminar: `resuelta` (se
 * hizo) o `descartada` (ya no aplica). Las dos sacan el sub-caso de lo
 * pendiente —nadie tiene que hacer nada con ninguna— pero significan cosas
 * opuestas. `CERRADOS` sirve para «¿queda trabajo?»; para «¿cuánto se logró?»
 * hay que mirar solo `resuelta`, y ese conteo es otro (no vive aquí todavía).
 *
 * `archivado_en` SÍ cuenta como cerrado, aunque el estado diga otra cosa. La
 * suposición de que «un caso archivado ya estaba cerrado» no la garantiza el
 * código: `archivar()` no exige estado cerrado, y el bot matutino archiva los
 * avisos con el plazo pasado DEJÁNDOLOS en «abierta». Un hijo así se quedaba
 * en el denominador y fuera del numerador para siempre, y su padre no llegaba
 * al 100% nunca. Si se archivó, ya no queda trabajo ahí.
 * (Requiere que la consulta traiga `archivado_en`; si no viene, se comporta
 *  como antes y solo mira el estado.)
 */

export const CERRADOS = ["resuelta", "descartada"];

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
    if (CERRADOS.includes(h.estado) || h.archivado_en) x.ok++;
    m.set(h.padre_id, x);
  });
  return m;
};

/** Color del contador: verde solo cuando están TODOS cerrados. El verde a
 *  medias es el que hace que nadie lo mire. */
export const colorFamilia = (f: Familia) =>
  f.ok === f.total ? "var(--green)" : "var(--teal)";
