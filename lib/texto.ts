/* LA ESCALA DE TEXTO, EN UN SOLO SITIO.
 *
 * Los tamaños de letra estaban escritos a mano en cada `style={{ fontSize: … }}`,
 * repartidos por decenas de elementos. Por eso «los textos están pequeños» era
 * un patrón que reaparecía pantalla por pantalla: no había una fuente única que
 * gobernara la jerarquía, así que cada sección se descalibraba por su cuenta y
 * había que corregirla suelta.
 *
 * Aquí vive la escala. No es una lista de píxeles: es una jerarquía POR EL ROL
 * del dato —qué tan protagonista es— y el valor va detrás. Subir «todo el
 * cuerpo» ahora es cambiar un número aquí, no una cacería por el árbol.
 *
 * Cómo elegir:
 *   titulo → el nombre que identifica la fila (el que buscas)
 *   cuerpo → lo que se vino a leer: citas, fragmentos, descripciones
 *   base   → texto normal de una fila, cuando no es ni título ni metadato
 *   meta   → contexto apagado: rol, autor, año, estado, de quién es
 *   micro  → metadato menor: procedencia, sufijos, notas al pie
 *   chip   → etiquetas y badges (van en cápsula, no son prosa)
 */
export const TXT = {
  titulo: 16.5,
  cuerpo: 15.5,
  base: 15,
  meta: 14,
  micro: 13,
  chip: 12,
} as const;
