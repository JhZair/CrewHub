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

/* ══════════════════════════════════════════════════════════════════════════
   COMPARAR COMO LO ESCRIBE LA GENTE

   ── POR QUÉ ESTO VIVE EN lib/ ──
   ⚠ `normalizar` nació dentro de `components/ListaClearance.tsx`, que empieza
   con `"use client"`, y la llamaba también la página de servidor. Eso no
   compila mal: compila PERFECTO y revienta en runtime.

   `"use client"` no marca componentes, marca EL MÓDULO. Cuando un componente
   de servidor importa algo de ahí, Next no le entrega la función: le entrega
   una referencia de cliente, que solo sabe hacer una cosa —lanzar—:

       «Attempted to call normalizar() from the server but normalizar is on the
        client. It's not possible to invoke a client function from the server.»

   Es la frontera de siempre cruzada en el sentido contrario al de costumbre.
   Nos cuidamos mucho de que un closure no viaje del servidor al cliente, y se
   nos coló una función viajando del cliente al servidor. `tsc` no ve ninguno de
   los dos: los tipos son impecables en ambos casos.

   La regla, entonces: una función pura que usen los dos lados vive aquí. Un
   módulo `"use client"` solo puede exportar componentes y tipos hacia el
   servidor.

   ── Y HAY DOCE COPIAS DE `normalizar` EN EL REPO ──
   `lib/casilla.ts`, `lib/rubros.ts`, `lib/tabla.ts`, `components/PanelCombos`,
   `Menciones`, `Ensamblado`, `EntregaLote`, `PrestamoEquipo`, `AsignarACompra`,
   `PanelKits`, `Composer` (dos veces) y `app/actions.ts` tienen cada uno la
   suya. Doce copias de una regla son doce sitios donde arreglarla. Este es a
   donde deberían venir; se empieza por aquí.
   ══════════════════════════════════════════════════════════════════════════ */

/** Minúsculas y sin tildes, para comparar como se teclea: «Ñahui» se encuentra
 *  escribiendo «nahui», y «heroína» escribiendo «heroina». */
export const normalizar = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * ¿El campo contiene TODAS las palabras de la consulta, en cualquier orden?
 *
 * ⚠ Palabra a palabra y no subcadena. Con `includes` a secas, buscar
 * «mujeres ande» no encontraba «MUJERESANDE · Mujeres del Ande»: hay un «del»
 * en medio. Y teclear dos palabras que se recuerdan a medias es exactamente lo
 * que se hace cuando no se recuerda el título — el caso de uso entero de un
 * buscador.
 *
 * `campo` tiene que venir YA normalizado: se compara muchas veces contra la
 * misma fila y normalizarlo en cada tecleo sería rehacer el trabajo. La
 * consulta se normaliza aquí.
 */
export function coincide(campo: string, consulta: string): boolean {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  return palabras.every(p => campo.includes(p));
}
