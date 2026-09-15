/* ══════════════════════════════════════════════════════════════════════════
   LOS CASOS DE UNA ACTIVIDAD DE CRONOGRAMA

   Una actividad tiene los casos que haga falta: «Rodaje Nelly» son el permiso
   de filmación, el transporte a la comunidad y el rodaje en sí, tres trabajos
   que caminan a la vez y los lleva gente distinta. La relación vive en
   `publicaciones.actividad_id` (db/crono-casos.sql), igual que la de las
   cláusulas del acta vive en `publicaciones.compromiso_id`.

   ── POR QUÉ ESTO ES UN ARCHIVO Y NO TRES LÍNEAS EN CADA SITIO ──
   Porque «¿está hecha esta actividad?» se contesta en cuatro sitios —la fila
   del cronograma, la barra del Gantt, el estado que escribe el servidor al
   cerrar un caso y el aviso de «⏩ Correr fechas»— y con la regla copiada, el
   día que cambie se cambia en tres.

   ⚠ NO IMPORTA NADA DE SUPABASE.
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo mínimo que hace falta saber de un caso para decidir. Deliberadamente
 *  corto: cuanto menos pida, menos se rompe cuando la tabla crezca. */
export type CasoMin = {
  id: string;
  titulo?: string | null;
  estado?: string | null;
  tipo?: string | null;
  archivado_en?: string | null;
  /** Quien lo lleva, para la cara del chip. */
  resp?: { id?: string; nombre?: string | null; avatar_url?: string | null; color?: string | null } | null;
};

/* ── QUÉ ES UN CASO «CERRADO» ──
 * Las dos formas de terminar que reconoce el sistema: se hizo (`resuelta`) o ya
 * no aplica (`descartada`). Está escrito en lib/estados, y aquí se repite la
 * lista en vez de importarla porque allí es el catálogo del desplegable —qué se
 * puede elegir— y esto es otra pregunta: cuál de esos estados cuenta como
 * terminado. Ligarlas haría que añadir una opción al desplegable cambiara en
 * silencio cuándo se da por hecha una actividad. */
export const CERRADOS = ["resuelta", "descartada"];

export const casoCerrado = (c: CasoMin) =>
  !!c.archivado_en || CERRADOS.includes(String(c.estado || ""));

/** Los casos que siguen vivos y los que ya terminaron, en el orden en que se
 *  pintan: primero lo que pide atención. */
export function repartirCasos(casos: CasoMin[]) {
  const vivos = casos.filter(c => !casoCerrado(c));
  const cerrados = casos.filter(c => casoCerrado(c));
  return { vivos, cerrados, todos: [...vivos, ...cerrados] };
}

/* ══════════════ EL ESTADO DE LA ACTIVIDAD ══════════════
 *
 * Se DEDUCE de sus casos, no se escribe a mano. Dos preguntas distintas, y
 * confundirlas fue el error:
 *
 *   1. ¿QUEDA TRABAJO ABIERTO?  → mientras viva un caso, `materializada`.
 *      El rodaje no está hecho si falta el permiso: darla por terminada al
 *      cerrar el primero —que suele ser el más pequeño, el del transporte—
 *      pondría el cronograma a decir que la semana de rodaje ya pasó mientras
 *      el trabajo sigue abierto en el tablero.
 *
 *   2. Y SI NO QUEDA NINGUNO, ¿SE HIZO?  → solo si alguno está RESUELTA.
 *      ⚠ Aquí estaba el fallo. `resuelta` y `descartada` cuentan igual para la
 *      primera pregunta —las dos cierran el caso— y NO para la segunda:
 *      descartada significa «ya no aplica», no «se hizo». Con las dos en el
 *      mismo saco, descartar el único caso de «Rodaje de planos de apoyo» la
 *      marcaba FINALIZADA ✅, y el cronograma afirmaba que se rodó algo que se
 *      decidió no rodar. Eso acaba en una rendición.
 *      Sin ninguna resuelta, la actividad vuelve a `planificada`: el trabajo
 *      sigue pendiente. Si de verdad no va a hacerse nunca, se cancela con ✕,
 *      que es la palabra para eso y la decide una persona.
 *      Archivado tampoco cuenta como hecho: archivar es quitar de la vista.
 *
 * ⚠ DEVUELVE `null` CUANDO NO HAY NADA QUE DEDUCIR.
 * Sin casos, esto no sabe si la actividad está planificada, en marcha o hecha:
 * puede haberse marcado por otra vía, o ser un hito importado que nació
 * finalizado. Devolver «planificada» por defecto habría borrado ese dato en
 * cuanto alguien soltara el último caso. Quien llama decide qué hacer con el
 * null, y lo normal es no tocar nada.
 */
export type EstadoActividad = "planificada" | "materializada" | "finalizada";

export function estadoPorCasos(casos: CasoMin[]): EstadoActividad | null {
  if (!casos.length) return null;
  if (casos.some(c => !casoCerrado(c))) return "materializada";
  /* Todos cerrados. ¿Alguno se HIZO? Se mira el estado en crudo y no
     `casoCerrado`, que es justo el que mete descartada en el mismo saco. */
  return casos.some(c => String(c.estado || "") === "resuelta")
    ? "finalizada"
    : "planificada";
}

/** El resumen de una fila: cuántos hay y cuántos siguen abiertos. Se usa para
 *  el título del grupo de chips. */
export function resumenCasos(casos: CasoMin[]) {
  const { vivos, cerrados } = repartirCasos(casos);
  return {
    n: casos.length,
    abiertos: vivos.length,
    cerrados: cerrados.length,
    /* Para el `title` del grupo. Se dice en palabras porque «2/3» obliga a
       adivinar cuál es cuál. */
    texto: !casos.length ? "Sin casos"
      : vivos.length === 0
        ? (casos.length === 1 ? "1 caso, cerrado" : `${casos.length} casos, todos cerrados`)
        : cerrados.length === 0 ? `${vivos.length} caso${vivos.length === 1 ? "" : "s"} abierto${vivos.length === 1 ? "" : "s"}`
          : `${vivos.length} abierto${vivos.length === 1 ? "" : "s"} y ${cerrados.length} cerrado${cerrados.length === 1 ? "" : "s"}`,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   CÓMO SE LLAMA CADA CHIP CUANDO HAY VARIOS

   El chip de un caso enseñaba la cara de quien lo lleva y su estado. Con un
   caso por actividad bastaba. Con tres no: «Ingesta, organización y
   sincronización» tenía los suyos los tres resueltos y los tres de Michel, así
   que la fila pintaba TRES CHIPS IDÉNTICOS. Tres cosas distintas dibujadas
   igual no son un adorno feo — son una fila que miente: obliga a abrirlos uno
   por uno para saber cuál es cuál, que es exactamente el trabajo que el
   cronograma existe para ahorrar.

   Lo que los distingue es el título, y el título no cabe entero en una fila de
   chips. De ahí este cálculo: NO el título, sino lo mínimo que hace falta para
   no confundirlo con sus hermanos.

   ⚠ POR QUÉ SE RECORTA LO COMÚN Y NO SE FÍA DEL «…» DEL CSS.
   Porque los casos de una misma actividad nacen casi siempre del mismo sitio y
   empiezan igual —«Ingesta — audio», «Ingesta — video»—, y cortar por la
   derecha con ellipsis deja «Ingesta —…» en los tres: el ellipsis se come
   justamente la parte que los diferencia y el resultado se lee igual de mal
   que antes, pero ocupando el triple. Se quita el arranque que TODOS comparten
   y se enseña lo que sigue, que es lo único con información.

   El título completo nunca se pierde: sigue en el `title` del chip.
   ══════════════════════════════════════════════════════════════════════════ */

/* Un recorte a lo bruto dejaría restos como «— audio» o «: audio». Se limpian
   los separadores sueltos de los bordes, no las letras. */
const limpiaBordes = (s: string) =>
  s.replace(/^[\s\-–—:·,;|/]+/, "").replace(/[\s\-–—:·,;|/]+$/, "").trim();

const palabras = (s: string) => s.split(/\s+/).filter(Boolean);

/** Cuántas palabras iniciales comparten TODAS las listas. */
function comunInicio(ls: string[][]) {
  let n = 0;
  while (ls.every(l => n < l.length - 1 && l[n] === ls[0][n])) n++;
  return n;
}

/**
 * El rótulo corto de cada caso de una fila, por id.
 *
 * Devuelve un mapa VACÍO cuando hay un solo caso: ahí el chip ya es
 * inconfundible y el título suele repetir el nombre de la actividad que tiene
 * al lado —ponerlo sería ruido, y ruido que empuja la fila.
 */
export function rotulosCasos(casos: CasoMin[]): Map<string, string> {
  const m = new Map<string, string>();
  if (casos.length < 2) return m;

  const base = casos.map(c => String(c.titulo || "").trim());

  /* Recortar solo tiene sentido si hay algo que recortar y algo que queda. Si
     dos títulos son iguales de verdad, el recorte no inventa diferencias: se
     detecta abajo y se numeran. */
  let corto = base;
  const llenos = base.filter(Boolean);
  if (llenos.length === base.length) {
    const ls = base.map(palabras);
    /* `- 1` en comunInicio: nunca se consume la última palabra de un título;
       un rótulo vacío es peor que uno largo.

       ⚠ Solo por delante. Recortar también la cola común —«Rodaje día 1
       Nelly» / «Rodaje día 2 Nelly» → «1» / «2»— deja rótulos exactos y
       cortísimos que no significan NADA al mirarlos: un «1» junto a una cara
       no dice de qué caso se habla, y entonces el chip vuelve a haber que
       abrirlo, que es el problema del que veníamos. Quitar el arranque común
       ya separa siempre que separarse sea posible; lo que sobra por la
       derecha es contexto, y el contexto es lo único que hace legible un
       rótulo de tres palabras. */
    const tent = ls.map(l => limpiaBordes(l.slice(comunInicio(ls)).join(" ")));
    /* Solo se acepta el recorte si SIRVE: todos con texto y todos distintos.
       Si no, se vuelve a los títulos enteros — mejor largo que engañoso. */
    const util = tent.every(Boolean) && new Set(tent).size === tent.length;
    if (util) corto = tent;
  }

  /* Últimas defensas: títulos vacíos o repetidos de verdad. Se numeran en el
     orden en que se pintan, para que al menos «el primero» y «el segundo»
     signifiquen algo al mirar y al hablar de ellos. */
  const vistos = new Map<string, number>();
  casos.forEach((c, i) => {
    const t = corto[i];
    const repes = base.filter(x => x === base[i]).length;
    const n = (vistos.get(t) || 0) + 1;
    vistos.set(t, n);
    m.set(c.id, !t ? `#${i + 1}` : repes > 1 || n > 1 ? `${t} #${n}` : t);
  });
  return m;
}

/** Agrupar por actividad los casos que llegan en una sola consulta. Se hace
 *  aquí porque las dos pantallas que montan el cronograma lo necesitan igual, y
 *  una de ellas ya se equivocó una vez armando su propia versión. */
export function casosPorActividad<T extends { actividad_id?: string | null }>(
  casos: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const c of casos) {
    const id = c.actividad_id;
    if (!id) continue;
    m.set(id, [...(m.get(id) || []), c]);
  }
  return m;
}

/* ── EL CASO QUE MANDA EN UNA FILA DE UNA SOLA LÍNEA ──
 *
 * La agenda, la portada y la pared no tienen sitio para una fila de chips:
 * enseñan la actividad en un renglón y necesitan UN caso — para el enlace, para
 * el contador de comentarios y, sobre todo, para decidir si esa actividad ya
 * está cubierta por su caso y no hay que pintarla dos veces.
 *
 * Manda el primero VIVO. Si no queda ninguno vivo, el primero cerrado: eso es
 * lo que hace que `actividadFueraDeAgenda` siga sacando de la lista lo que ya
 * se resolvió. Devolver null cuando todos están cerrados habría hecho lo
 * contrario — que lo terminado se quedara colgado para siempre.
 */
export function casoPrincipal<T extends CasoMin>(casos: T[]): T | null {
  if (!casos.length) return null;
  return repartirCasos(casos as CasoMin[]).todos[0] as T;
}

/** Normaliza el embed de PostgREST. Puede llegar como objeto si la relación se
 *  resolviera a uno solo, y un `.map` sobre un objeto revienta la pantalla. */
export const listaCasos = (v: any): any[] =>
  Array.isArray(v) ? v : v ? [v] : [];

/* ══════════════════════════════════════════════════════════════════════════
   EL ADAPTADOR PARA LAS PANTALLAS DE UNA SOLA LÍNEA

   La agenda, la portada y la pared llevan años hablando de `a.publicacion_id`
   y `a.pub` — el enlace, el contador de 💬, `actividadFueraDeAgenda`, la
   deduplicación con `elCasoLaCubre`—, repartidos por veinte sitios de tres
   archivos grandes.

   Cambiar el modelo debajo dejó todo eso apuntando a una columna que ya no se
   escribe, y lo peor es que NO daba error: `a.pub` valía null y entonces
   `actividadFueraDeAgenda` devolvía false siempre —archivar el caso dejaba de
   sacar la actividad de la agenda— y la deduplicación fallaba, pintando dos
   renglones idénticos.

   Esto rehace esos dos campos desde `casos`, en el punto de carga. Reescribir
   los veinte usos habría sido el triple de superficie para el mismo resultado,
   y cada uno una oportunidad de olvidarse.

   ⚠ ES UN PUENTE, NO EL DESTINO. Lo correcto a la larga es que esas pantallas
   hablen de `casos` en plural; mientras tanto, esto las mantiene contando la
   verdad, y en un solo sitio que se puede borrar entero el día que se haga.
   ══════════════════════════════════════════════════════════════════════════ */
export function conCasoPrincipal<T extends Record<string, any>>(acts: T[]): T[] {
  return acts.map(a => {
    const cs = listaCasos(a.casos);
    const p = casoPrincipal(cs as CasoMin[]);
    return { ...a, publicacion_id: p?.id ?? null, pub: p ?? null };
  });
}
