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
