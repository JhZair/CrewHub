/* ══════════════════════════════════════════════════════════════════════════
   DE QUÉ CONCURSO ESTAMOS HABLANDO

   DAFO reparte sus estímulos en una rejilla de dos ejes: el TIPO de obra
   —documental, ficción, animación, cortometraje, serie— y la ETAPA que se
   financia —desarrollo, producción, postproducción…—. «Concurso de Proyectos
   de Documental», «Producción de Largometrajes de Ficción Nacional»: cada
   nombre dice su casilla, y dos nombres que caen en casillas distintas son
   concursos distintos por mucho que se parezcan.

   Esto vive en su propio archivo porque lo usan dos sitios que no se pueden
   importar entre ellos: el lector de PDF —para avisar si estás subiendo la
   lista de ficción a la ficha de documental— y la matriz de rivales —para no
   promediar en una sola cifra concursos donde ganan 8 de 42 con otros donde
   ganan 10 de 202—. Tenerlo copiado en los dos sería garantizar que un día
   digan cosas distintas.
   ══════════════════════════════════════════════════════════════════════════ */

/** Las casillas de la rejilla, en el orden en que se nombran. La primera
 *  palabra de cada fila es la que se busca; el resto son sus variantes. */
export const EJES: string[][][] = [
  [["documental"], ["ficcion"], ["animacion"], ["cortometraje"], ["serie"]],
  [["desarrollo"], ["postproduccion"], ["produccion"], ["distribucion"], ["exhibicion"]],
];

/** Cómo se llama cada casilla del primer eje cuando hay que enseñarla. */
const NOMBRES = ["Documental", "Ficción", "Animación", "Cortometraje", "Series"];

const sinTilde = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** En qué punto de cada eje cae un texto. `-1` si no lo dice. */
export function ejes(texto: string): number[] {
  const t = sinTilde(texto);
  return EJES.map(eje => eje.findIndex(v => v.some(w => t.includes(w))));
}

/** La familia de un concurso: su casilla en el primer eje, para agrupar.
 *  ⚠ «Otros» no es un cajón de sastre que haya que vaciar: es lo honrado
 *  cuando el nombre no dice de qué es, y meterlo con documental porque suele
 *  serlo mezclaría las cuentas sin que nadie pudiera verlo. */
export function familiaDe(nombre: string): string {
  const i = ejes(nombre)[0];
  return i >= 0 ? NOMBRES[i] : "Otros";
}
