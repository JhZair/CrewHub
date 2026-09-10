/* ══════════════════════════════════════════════════════════════════════════
   📖 WIKI — TIPOS Y CATÁLOGOS FIJOS

   Lo que aquí es constante son los VOCABULARIOS de la guía (tipos de página,
   estados, niveles, tipos de anotación). Las áreas y secciones NO están aquí:
   son filas de `wiki_areas` y `wiki_secciones` (db/wiki.sql), para poder sumar
   un área sin reprogramar.
   ══════════════════════════════════════════════════════════════════════════ */

export type EstadoArea = "definida" | "propuesta" | "por-definir";

export type Area = {
  id: string;
  nombre: string;
  descripcion: string | null;
  icono: string | null;
  color: string;
  color_oscuro: string;
  estado: EstadoArea;
  orden: number;
};

export type Seccion = {
  id: string;
  area_id: string;
  numero: number;
  nombre: string;
  descripcion: string | null;
};

export type TipoPagina =
  | "tecnica" | "concepto" | "problema" | "caso" | "fuente"
  | "profesional" | "herramienta" | "experiencia";

export type EstadoPagina =
  | "pendiente" | "investigacion" | "verificado" | "probado" | "recomendado" | "archivado";

export type Pagina = {
  id: string;
  area_id: string;
  seccion_id: string | null;
  slug: string;
  titulo: string;
  tipo: TipoPagina;
  etiquetas: string[];
  etapa: string | null;
  nivel: number;
  estado: EstadoPagina;
  preguntas: string[];
  contenido: string;
  actualizado: string;          // AAAA-MM-DD
  creado_por: string | null;
  creado_en: string;
  editado_en: string;
};

/** Lo que listan las portadas y el buscador: la página sin su contenido. */
export type PaginaResumen = Omit<Pagina, "contenido" | "creado_por" | "creado_en" | "editado_en">;

export type Historial = {
  id: string;
  pagina_id: string;
  fecha: string;
  cambio: string;
  motivo: string | null;
  fuente: string | null;
  autor_id: string | null;
};

export type EstadoAplicacion = "evaluando" | "planificado" | "aplicado" | "descartado";

export type VinculoProyecto = {
  id: string;
  pagina_id: string;
  proyecto_id: string;
  uso: string | null;
  estado: EstadoAplicacion;
  nota: string | null;
  fecha: string;
  /* Leído de `proyectos`, nunca copiado: */
  proyecto: { id: string; nombre: string; nombre_corto: string | null; folio: string | null; tipo: string | null; etapa: string | null } | null;
};

export type TipoAnotacion =
  | "comentario" | "inspira" | "referente" | "visual" | "narrativo"
  | "sonoro" | "jugabilidad" | "investigar" | "aplicar" | "evitar";

export type Anotacion = {
  id: string;
  pagina_id: string;
  tipo: TipoAnotacion;
  texto: string;
  autor_id: string | null;
  creado_en: string;
  autor?: { nombre: string | null } | null;
};

/* ── Vocabularios ─────────────────────────────────────────────────────── */

export const TIPOS: Record<TipoPagina, string> = {
  tecnica: "Técnica",
  concepto: "Concepto",
  problema: "Problema",
  caso: "Caso de estudio",
  fuente: "Fuente",
  profesional: "Profesional",
  herramienta: "Herramienta",
  experiencia: "Experiencia",
};

/* Los colores viven en variables CSS (--st-*) para cambiar con el tema. */
export const ESTADOS: Record<EstadoPagina, { label: string; icono: string; var: string }> = {
  pendiente:     { label: "Pendiente",             icono: "🟡", var: "--st-pendiente" },
  investigacion: { label: "En investigación",      icono: "🔵", var: "--st-investigacion" },
  verificado:    { label: "Verificado",            icono: "🟢", var: "--st-verificado" },
  probado:       { label: "Probado en producción", icono: "🟣", var: "--st-probado" },
  recomendado:   { label: "Recurso recomendado",   icono: "⭐", var: "--st-recomendado" },
  archivado:     { label: "Archivado",             icono: "⚫", var: "--st-archivado" },
};

export const NIVELES: Record<number, string> = {
  1: "Referencia rápida",
  2: "Técnica",
  3: "Investigación",
  4: "Experiencia propia",
};

export const ESTADOS_APLICACION: Record<EstadoAplicacion, string> = {
  evaluando: "Evaluando",
  planificado: "Planificado",
  aplicado: "Aplicado",
  descartado: "Descartado",
};

export const TIPOS_ANOTACION: Record<TipoAnotacion, string> = {
  comentario:  "💭 Mi comentario",
  inspira:     "❤️ Me inspira",
  referente:   "⭐ Referente importante",
  visual:      "🎥 Referente visual",
  narrativo:   "📝 Referente narrativo",
  sonoro:      "🎧 Referente sonoro",
  jugabilidad: "🎮 Referente de jugabilidad",
  investigar:  "🔎 Quiero investigarlo",
  aplicar:     "💡 Lo puedo aplicar",
  evitar:      "⚠️ Quiero evitar este recurso",
};

/* Apartados de las plantillas (3.2 y 3.3), para mostrar qué falta en una
   página pendiente. */
export const PLANTILLA_TECNICA = [
  "¿Qué es?", "¿Para qué sirve?", "¿Cuándo usarla? ¿Cuándo no?", "Preguntas para decidir",
  "¿Qué necesito?", "Paso a paso", "Checklist", "Errores frecuentes", "Buenas prácticas",
  "Variaciones", "Casos de estudio", "Casos por verificar", "Recursos",
  "Relación con otros conceptos", "Fuentes", "Anotaciones personales", "Historial de cambios",
];

export const PLANTILLA_PROBLEMA = [
  "Problema", "Preguntas de contexto", "Opciones", "Recomendación", "Paso a paso o checklist",
  "Errores a evitar", "Casos de estudio verificados", "Fuentes", "Páginas relacionadas",
  "Aplicación en proyectos",
];

/* Los apartados que el módulo pinta por su cuenta desde las tablas, y por eso
   NO se escriben dentro del Markdown de la página (si vienen, se ignoran). */
export const APARTADOS_DEL_MODULO = ["anotaciones personales", "historial de cambios"];
