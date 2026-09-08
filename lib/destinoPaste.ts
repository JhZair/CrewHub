/* ══════════════════════════════════════════════════════════════════════════
   📋 A QUIÉN LE TOCA UN Ctrl+V DE IMAGEN

   En una ficha hay varios sitios que aceptan una imagen pegada: el banner, el
   cartel, la foto de una persona, la galería, los papeles firmados. Pegar es
   un gesto GLOBAL —no se pega «en» un sitio, se pega y ya—, así que hace falta
   decidir a quién le toca.

   ── ANTES ERA UNA BANDERA, Y SE QUEDABA IZADA ──
   Era un booleano que cada destino ponía a `true` al entrarle el ratón y a
   `false` al salir. Dos problemas, los dos vistos:
   · Si el `mouseleave` NO llega —se abre el diálogo de archivos del sistema,
     aparece un visor a pantalla completa encima, el ratón sale por el borde de
     la ventana— la bandera se queda izada y el banner deja de poder pegarse en
     TODA la aplicación hasta recargar.
   · Bajarla es incondicional: el día que dos destinos convivan en la misma
     pantalla, salir de uno desreclama al otro sin que nadie lo note.

   ── AHORA NO SE RECUERDA NADA: SE MIRA ──
   Cada destino se marca en el DOM con `data-paste-destino="…"`, y en el
   momento del pegado se pregunta cuál está bajo el ratón. No hay estado que
   pueda quedarse pegado, porque no hay estado. Y con un visor abierto encima
   la respuesta es la correcta sola: el destino de debajo ya no está `:hover`.
   ══════════════════════════════════════════════════════════════════════════ */

/** El atributo que marca un destino. Se pone en el elemento que envuelve la
 *  zona: lo que cuente como «estar encima» es su caja. */
export const ATRIBUTO = "data-paste-destino";

/** Quién reclama el pegado ahora mismo, o `null` si nadie. El más INTERIOR
 *  gana: `querySelectorAll(":hover")` devuelve en orden de documento y el
 *  último es el más profundo, que es el destino más específico bajo el ratón
 *  —la galería dentro de la ficha, no la ficha—. */
export function destinoDelPegado(): string | null {
  if (typeof document === "undefined") return null;
  const todos = document.querySelectorAll(`[${ATRIBUTO}]:hover`);
  const ultimo = todos[todos.length - 1];
  return ultimo ? ultimo.getAttribute(ATRIBUTO) : null;
}

/** ¿Me toca a mí? `null` significa que el ratón no está sobre ningún destino
 *  marcado; quien quiera quedarse con esos pegados lo dice con `siNadie`. */
export function meToca(quien: string, siNadie = false): boolean {
  const d = destinoDelPegado();
  return d === null ? siNadie : d === quien;
}
