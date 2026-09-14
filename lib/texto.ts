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

/* ── LA FORMA DE UN UUID, EN UN SOLO SITIO ──
 * ⚠ Estaba escrita SEIS veces: dos en `app/actions.ts`, una en la ficha de
 * ⚖ clearance, una en la portada, una en `lib/nombres.ts` y otra recién puesta
 * en la ficha de ✍ guion. Ninguna importaba de las otras.
 * No es que fueran a divergir en el patrón —un UUID es un UUID—: es que cada
 * copia venía sin la razón de estar ahí, y la razón sí importa. Sin esta
 * comprobación, una ruta como `/guion/pelicula/undefined` —que es lo que
 * produce un enlace mal construido— llega a Postgres y vuelve como un 22P02
 * crudo en pantalla en vez de una página de «no existe».
 * Vive aquí, con `normalizar` y `coincide`, porque `lib/texto.ts` es lo que
 * pueden importar tanto el servidor como el cliente. */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUuid = (v: unknown): boolean => RE_UUID.test(String(v ?? "").trim());

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE TODOS COMPARTEN NO DISTINGUE A NINGUNO

   Nueve convocatorias del mismo año se llaman «Concurso de Proyectos de
   Animación», «Concurso de Proyectos de Cortometraje», «Concurso de Proyectos
   de Documental — Producción»… Las primeras cuatro palabras son idénticas en
   las nueve: ocupan la mitad del chip y no ayudan a elegir ninguna, que es
   exactamente la definición de ruido.

   Se calcula sobre lo que HAY EN PANTALLA y no contra una lista de prefijos
   escritos a mano. Un catálogo de fórmulas —«Concurso de», «Estímulos
   Económicos para»…— envejece: el día que DAFO estrene un nombre nuevo, el
   prefijo se queda entero y nadie se entera. Lo que comparten nueve nombres es
   un hecho de esos nueve nombres, y se puede medir.

   ⚠ Y por eso mismo el resultado NO se guarda ni se compara con nada: cambia
   con el filtro de año, porque cambia la lista. «Documental — Producción» con
   nueve del 2026 puede ser «Concurso de Proyectos de Documental — Producción»
   viendo los siete años, si ahí ya no hay prefijo común. Es una ayuda para
   leer, no un nombre.
   ══════════════════════════════════════════════════════════════════════════ */

/** Cuántas palabras iniciales comparten TODOS. Devuelve la cadena a quitar
 *  —ya cortada en un espacio— o "" si no hay nada que valga la pena. */
export function prefijoComun(nombres: string[]): string {
  const xs = (nombres || []).map(n => String(n ?? "").trim()).filter(Boolean);
  /* Con uno solo no hay nada «común»: quitarle sus tres primeras palabras
     porque se parecen a sí mismas lo dejaría irreconocible. */
  if (xs.length < 2) return "";

  /* Se compara sin tildes ni mayúsculas —«Animación» y «animacion» comparten
     prefijo aunque no coincidan carácter a carácter— pero se DEVUELVE el trozo
     del primer nombre tal cual: lo que se recorta es texto real. */
  const norm = xs.map(normalizar);
  let i = 0;
  while (i < norm[0].length && norm.every(s => s[i] === norm[0][i])) i++;

  /* Al último espacio: cortar a media palabra deja «Concurso de Proyectos de
     Anim|ación» y el chip diría «ación».
     ⚠ El índice viene de la cadena NORMALIZADA y se aplica sobre la ORIGINAL.
     Vale porque `normalizar` conserva la longitud en castellano —«ó» y «ñ» se
     descomponen y pierden la marca, un carácter por carácter—, y si algún día
     dejara de valer el fallo no es silencioso: `sinPrefijo` vuelve a comprobar
     con `startsWith` antes de recortar, así que un prefijo mal medido devuelve
     el nombre entero en vez de un trozo cortado por el sitio equivocado. */
  const corte = xs[0].slice(0, i).lastIndexOf(" ");
  if (corte <= 0) return "";
  const pref = xs[0].slice(0, corte + 1);

  /* Dos guardas, y las dos evitan dejar un chip peor que el original:
     · Menos de dos palabras no compensa. Quitar «El » no ahorra nada y a
       cambio empieza los nombres en minúscula o a media frase.
     · Si a ALGUNO le deja menos de tres caracteres, no se quita a ninguno: un
       chip que dice «A» no es más corto, es ilegible. Pasa cuando lo único que
       distingue dos nombres es una letra o un número al final —«Concurso de
       Cine A» y «… B»—, y ahí el prefijo largo ES el nombre.
     (El caso de un nombre que es prefijo de otro —«Documental» y «Documental
     Producción»— no necesita guarda: el corte al último espacio ya retrocede
     una palabra, así que quedan «Documental» y «Documental Producción». Se
     dice porque parece que hiciera falta y no la hace.) */
  if (pref.trim().split(/\s+/).length < 2) return "";
  if (xs.some(n => n.length - pref.length < 3)) return "";
  return pref;
}

/** El nombre sin ese prefijo. Si no encaja —un nombre que no lo lleva— vuelve
 *  entero, que es lo correcto: nunca se recorta lo que no se comprobó. */
export function sinPrefijo(nombre: string, prefijo: string): string {
  const n = String(nombre ?? "").trim();
  if (!prefijo) return n;
  return normalizar(n).startsWith(normalizar(prefijo)) ? n.slice(prefijo.length).trim() : n;
}
