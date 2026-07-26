/* ── El ciclo de vida MACRO del proyecto, por tipo ──
   De idea a finalizado: la etapa donde está el proyecto como un todo. NO son las
   fases del plan de trabajo de un concurso (eso es lib/etapas.ts, por categoría
   DAFO) — esto es la vida del proyecto, y la pinta el stepper de la ficha.

   Cada tipo tiene su ciclo: un documental estrena en festivales y luego se
   distribuye; un videojuego prototipa, lanza y hace post-lanzamiento; una
   gestión cultural formula, ejecuta y cierra. Las claves se GUARDAN en
   proyectos.etapa, así que no se renombran a la ligera. Una sola fuente: la usan
   el stepper (ficha), el combo «Etapa» del formulario y la lista /proyectos
   (chips de filtro, colores del badge, panel «en marcha»). */

export type PasoProy = { clave: string; label: string; ico: string; color: string };

const AUDIOVISUAL: PasoProy[] = [
  { clave: "idea", label: "Idea", ico: "💡", color: "var(--dim)" },
  { clave: "en_carpeta", label: "En carpeta", ico: "📁", color: "var(--dim)" },
  { clave: "desarrollo", label: "Desarrollo", ico: "✏️", color: "var(--violet)" },
  { clave: "preproduccion", label: "Preprod.", ico: "🎬", color: "var(--blue)" },
  { clave: "produccion", label: "Producción", ico: "🎥", color: "var(--yellow)" },
  { clave: "postproduccion", label: "Postprod.", ico: "✂️", color: "var(--teal)" },
  { clave: "festivales", label: "Festivales", ico: "🎪", color: "#ec4899" },
  { clave: "distribucion", label: "Distribución", ico: "📽", color: "#22d3ee" },
  { clave: "finalizado", label: "Finalizado", ico: "🏁", color: "var(--green)" },
];

const VIDEOJUEGO: PasoProy[] = [
  { clave: "idea", label: "Idea", ico: "💡", color: "var(--dim)" },
  { clave: "concepto", label: "Concepto", ico: "🧩", color: "var(--dim)" },
  { clave: "prototipo", label: "Prototipo", ico: "🛠", color: "var(--violet)" },
  { clave: "produccion", label: "Producción", ico: "🎮", color: "var(--yellow)" },
  { clave: "alfa_beta", label: "Alfa/Beta", ico: "🧪", color: "#22d3ee" },
  { clave: "lanzamiento", label: "Lanzamiento", ico: "🚀", color: "var(--blue)" },
  { clave: "post_lanzamiento", label: "Post-lanzam.", ico: "📈", color: "#ec4899" },
  { clave: "finalizado", label: "Finalizado", ico: "🏁", color: "var(--green)" },
];

const GESTION: PasoProy[] = [
  { clave: "idea", label: "Idea", ico: "💡", color: "var(--dim)" },
  { clave: "formulacion", label: "Formulación", ico: "📝", color: "var(--dim)" },
  { clave: "planificacion", label: "Planificación", ico: "🗂", color: "var(--blue)" },
  { clave: "ejecucion", label: "Ejecución", ico: "⚙️", color: "var(--yellow)" },
  { clave: "cierre", label: "Cierre", ico: "📦", color: "var(--teal)" },
  { clave: "finalizado", label: "Finalizado", ico: "🏁", color: "var(--green)" },
];

const COBERTURA: PasoProy[] = [
  { clave: "encargo", label: "Encargo", ico: "📩", color: "var(--dim)" },
  { clave: "preproduccion", label: "Preprod.", ico: "🎬", color: "var(--blue)" },
  { clave: "cobertura", label: "Cobertura", ico: "🎥", color: "var(--yellow)" },
  { clave: "postproduccion", label: "Postprod.", ico: "✂️", color: "var(--teal)" },
  { clave: "entrega", label: "Entrega", ico: "📤", color: "var(--green)" },
  { clave: "finalizado", label: "Finalizado", ico: "🏁", color: "var(--green)" },
];

/* Los cuatro audiovisuales comparten el ciclo de cine; los otros tres, el suyo. */
export const ETAPAS_PROYECTO: Record<string, PasoProy[]> = {
  documental: AUDIOVISUAL,
  ficcion: AUDIOVISUAL,
  animacion: AUDIOVISUAL,
  experimental: AUDIOVISUAL,
  videojuego: VIDEOJUEGO,
  gestion_cultural: GESTION,
  cobertura: COBERTURA,
};

/** El ciclo de un proyecto según su tipo; audiovisual por defecto. */
export function etapasProyecto(tipo?: string | null): PasoProy[] {
  return (tipo && ETAPAS_PROYECTO[tipo]) || AUDIOVISUAL;
}

/** Claves por tipo — para el combo «Etapa» del formulario (sugerenciasPor). */
export const ETAPAS_KEYS_POR_TIPO: Record<string, string[]> =
  Object.fromEntries(Object.entries(ETAPAS_PROYECTO).map(([t, ps]) => [t, ps.map(p => p.clave)]));

/** Todas las claves válidas (unión) — para validar el cambio de etapa. */
export const ETAPAS_PROY_VALIDAS = [...new Set(Object.values(ETAPAS_PROYECTO).flat().map(p => p.clave))];

/* Meta por clave, uniendo todos los tipos (primera aparición gana; las claves
   compartidas se definen iguales en todos los sets, así que es consistente).
   Lo usa la lista /proyectos, que mezcla proyectos de todos los tipos y solo
   tiene la clave suelta. */
const META: Record<string, PasoProy> = {};
Object.values(ETAPAS_PROYECTO).flat().forEach(p => { if (!META[p.clave]) META[p.clave] = p; });

/** Etiqueta/ícono/color de una etapa por su clave (para badges y chips sueltos). */
export const metaEtapaProy = (clave?: string | null): PasoProy | undefined => (clave ? META[clave] : undefined);

/** Todas las etapas únicas, en orden de aparición — para los chips de filtro. */
export const ETAPAS_PROY_UNICAS: PasoProy[] = Object.values(META);

/** ¿El proyecto está «en marcha»? Etapa puesta, ya pasó el arranque (idea /
 *  encargo, índice 0) y aún no finalizó. Type-aware: usa el ciclo de SU tipo. */
export function enMarchaProy(p: { tipo?: string | null; etapa?: string | null }): boolean {
  if (!p.etapa || p.etapa === "finalizado") return false;
  const i = etapasProyecto(p.tipo).findIndex(s => s.clave === p.etapa);
  return i > 0;
}
