/* ── El motor de búsqueda, uno solo ──
 *
 * Cada listado tenía el suyo, y todos eran peores que el global:
 *   const nrm = (s) => String(s || "").toLowerCase();
 *   ... nrm(x.nombre).includes(nrm(q))
 * Eso no quita tildes —«cespedes» no encontraba a Pavel Ugarte Céspedes—,
 * no parte la frase en palabras —«ugarte pavel» no daba nada— y no sabe
 * nada de quechua. El buscador global sí hacía las tres cosas, así que la
 * misma consulta encontraba cosas distintas según dónde la escribieras.
 *
 * Todo pasa por aquí: /buscar y los seis listados.
 */

import { coincideQ } from "@/lib/quechua";

const STOP = new Set([
  "de", "del", "la", "las", "el", "los", "un", "una", "y", "en", "al",
  "con", "por", "para", "que",
]);

export const nrmB = (s: any) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* La frase en palabras. Dos letras bastan: el corte estaba en 3 y se comía
   las siglas que más se buscan —cv, tv, 3d—. Los conectores los filtra STOP,
   que es donde corresponde. */
export const partir = (q: string) => {
  const ws = nrmB(q).split(/\s+/).filter(w => w.length >= 2 && !STOP.has(w));
  return ws.length ? ws : [nrmB(q)];
};

/* Arma el pajar de un registro.
 *
 * Dos trabajos en uno, y los dos importan:
 *
 * 1. Los estados se guardan con guion bajo —«en_constitucion», «de_baja»— y
 *    así no los encuentra nadie: la gente escribe «en constitución».
 *
 * 2. Los nulos desaparecen. Con `${c.institucion}` en una plantilla, un campo
 *    vacío se convierte en el TEXTO "undefined" y se queda dentro del pajar.
 *    Por eso todo campo pasa por aquí, no solo los estados.
 */
export const pal = (...xs: any[]) =>
  xs.map(x => String(x ?? "").replace(/_/g, " ")).filter(Boolean).join(" ");

/* Devuelve el comparador ya preparado con las palabras de la consulta:
   coincide si TODAS aparecen en el pajar, aunque sea en campos distintos.
   Primero literal (sin tildes); el esqueleto fonético quechua solo si la
   palabra conserva sustancia — ver lib/quechua. */
export function buscadorDe(q: string) {
  const palabras = partir(q);
  return (hay: string) => coincideQ(hay, palabras);
}
