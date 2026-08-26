/* ══════════════════════════════════════════════════════════════════════════
   ¿ESTOY EN UNA VENTANA DONDE MANDO YO?

   Cinco piezas del zócalo —el ＋, la campanita, el buscador flotante, el banco
   de trabajo y quién está— se escondían dentro de cualquier iframe con la misma
   comprobación escrita cinco veces: `window.self === window.top`. La razón era
   el Monitor: dos paneles con la aplicación dentro, y cinco botones flotantes
   duplicados encima de la pantalla partida.

   Pero un panel del Monitor NO es un iframe cualquiera: es una ventana de
   trabajo entera. La idea de «izquierda para navegar, derecha para el tablero»
   no sobrevive al primer clic —en cuanto entras a un caso, ese lado deja de ser
   el tablero—, así que los dos lados necesitan lo mismo: crear un caso, ver los
   avisos, buscar.

   ── POR QUÉ `window.name` Y NO UN PARÁMETRO EN LA URL ──
   `?panel=1` se pierde en cuanto navegas dentro del panel, que es lo primero
   que pasa. `window.name` lo pone el `<iframe>` al crearse y SOBREVIVE a las
   navegaciones de ese marco: es la única marca que sigue puesta tres clics
   después. Y no viaja al servidor, así que no ensucia ninguna ruta.
   ══════════════════════════════════════════════════════════════════════════ */

/** Con lo que EMPIEZA el `name` de cada iframe del Monitor. Cada panel lleva
 *  su número detrás: dos marcos con el mismo nombre en el mismo documento
 *  harían ambiguo cualquier `target="…"`, y el navegador elegiría uno de los
 *  dos sin decir cuál. */
export const NOMBRE_PANEL = "crewhub-panel";

/**
 * `true` si esta ventana es de las que mandan: la principal, o un panel del
 * Monitor. `false` en un iframe ajeno (una vista previa de Drive, un visor de
 * archivo), donde estos controles no pintan nada.
 *
 * ⚠ Solo tiene sentido dentro de un `useEffect`: en el servidor no hay
 * `window`, y decidirlo durante el render haría que el HTML del servidor y el
 * del navegador no coincidan.
 */
export function esVentanaDeTrabajo(): boolean {
  if (typeof window === "undefined") return false;
  /* ── LA VENTANA DEL MONITOR NO ES UNA SUPERFICIE DE TRABAJO ──
     Es el marco que sostiene los dos paneles: no tiene contenido propio, así
     que sus flotantes se dibujaban ENCIMA de los de los paneles, desplazados
     los nueve píxeles del borde. Tres ＋, dos campanitas y dos buscadores
     amontonados en la misma esquina — justo el desastre que este fichero dice
     evitar. Aquí manda cada panel; el marco se calla. */
  if (window.location.pathname.startsWith("/monitor")) return false;
  return window.self === window.top || window.name.startsWith(NOMBRE_PANEL);
}
