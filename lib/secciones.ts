/* ── Las secciones de entidades, en un solo sitio ──
   Lo usan la navegación, el historial acumulado y el listado de casos.
   Estaba a punto de ser el tercer mapa idéntico en tres archivos, que es
   exactamente como empezaron a divergir los estados, las reglas de SUNAT y
   los 90 días de la vigencia. Agregar una entidad = una línea aquí. */

export type Seccion = {
  tipo: string;
  ruta: string;        // el listado
  ico: string;
  titulo: string;      // para el tooltip de la nav
  plural: string;      // para los títulos ("Historial de empresas")
  /* El singular, escrito a mano y no deducido. Se sacaba con
     `plural.replace(/s$/, "")`, y en castellano eso funciona hasta que
     dejas de mirar: «postulaciones» → «postulacione». El h1 de /casos decía
     «Casos por postulacione» desde siempre. Cuatro palabras cuestan menos
     que una regla que casi acierta. */
  singular: string;
  tabla: string;
  campo: string;       // cómo se llama
  corto?: string;      // versión breve, si la tiene (alias, nombre_corto)
};

export const SECCIONES: Seccion[] = [
  { tipo: "proyecto", ruta: "/proyectos", ico: "📁", titulo: "Proyectos",
    plural: "proyectos", singular: "proyecto", tabla: "proyectos", campo: "nombre", corto: "nombre_corto" },
  // En empresas `nombre` YA es el corto: el largo es razon_social
  { tipo: "empresa", ruta: "/empresas", ico: "🏢", titulo: "Empresas",
    plural: "empresas", singular: "empresa", tabla: "empresas", campo: "nombre" },
  { tipo: "persona", ruta: "/personas", ico: "👤", titulo: "Personas",
    plural: "personas", singular: "persona", tabla: "personas", campo: "nombre", corto: "alias" },
  { tipo: "postulacion", ruta: "/postulaciones", ico: "🎯", titulo: "Postulaciones",
    plural: "postulaciones", singular: "postulación", tabla: "postulaciones", campo: "codigo" },
  { tipo: "equipamiento", ruta: "/equipamiento", ico: "🎥", titulo: "Equipos audiovisuales",
    plural: "equipos", singular: "equipo", tabla: "equipamiento", campo: "nombre" },
  { tipo: "convocatoria", ruta: "/convocatorias", ico: "📜", titulo: "Convocatorias y fondos",
    plural: "convocatorias", singular: "convocatoria", tabla: "convocatorias", campo: "codigo" },
];

export const seccionDe = (tipo: string) => SECCIONES.find(s => s.tipo === tipo);

/* Íconos de cualquier entidad vinculable, incluidas las que no tienen
   sección propia (lugares, etiquetas) y los casos, que no son entidades
   pero sí dejan rastro en la bitácora. */
export const ICO_ENT: Record<string, string> = {
  ...Object.fromEntries(SECCIONES.map(s => [s.tipo, s.ico])),
  lugar: "📍", etiqueta: "🏷️", publicacion: "📌", empresa_miembro: "👥",
  cronograma_actividades: "📅",
};

/* El trigger de bitácora (schema.sql) escribe entidad_tipo con el nombre
   FÍSICO de la tabla —plural: "proyectos", "publicaciones", "empresa_miembros"—
   mientras las acciones a mano y las rutas usan el SINGULAR ("proyecto",
   "publicacion", "empresa_miembro"). Este mapa reconcilia plural→singular; un
   tipo que ya viene singular (o que es igual a su tabla, como "equipamiento" o
   "cronograma_actividades") se devuelve tal cual. */
const SINGULAR_DE: Record<string, string> = {
  proyectos: "proyecto", empresas: "empresa", personas: "persona",
  convocatorias: "convocatoria", vehiculos: "vehiculo", lugares: "lugar",
  etiquetas: "etiqueta", publicaciones: "publicacion",
  empresa_miembros: "empresa_miembro", postulaciones: "postulacion",
};
export const tipoCanonico = (t: string) => SINGULAR_DE[t] || t;

/* Los tipos con ficha en /entidad/[tipo]/[id] — las claves de CONF en esa
   página. No incluye `publicacion` (vive en /caso) ni los que no tienen
   página (empresa_miembro, cronograma_actividades, vehiculo). */
const CON_FICHA = new Set([
  "proyecto", "empresa", "persona", "equipamiento",
  "lugar", "postulacion", "convocatoria", "etiqueta",
]);

/* A dónde lleva una entidad de la bitácora, o `null` si no tiene página.
   Acepta el tipo en singular o en el plural que escribe el trigger. Es el
   único sitio que decide esto: antes /admin y el historial lo hacían cada uno
   por su cuenta y enlazaban a /entidad/publicaciones/… o /entidad/proyectos/…,
   que son 404. */
export function rutaEntidad(tipo: string, id: string): string | null {
  const t = tipoCanonico(tipo);
  if (t === "publicacion") return `/caso/${id}`;
  if (CON_FICHA.has(t)) return `/entidad/${t}/${id}`;
  return null;
}

/* Dónde vive el nombre de CUALQUIER cosa que la bitácora registre — no solo
   las que tienen sección. El historial global guarda ids de todo: sin esto,
   una pantalla llena de "actualizó 1 campo" sin decir de qué. */
export const TABLA_DE: Record<string, [string, string]> = {
  ...Object.fromEntries(SECCIONES.map(s => [s.tipo, [s.tabla, s.campo]])),
  publicacion: ["publicaciones", "titulo"],
  lugar: ["lugares", "nombre"],
  etiqueta: ["etiquetas", "nombre"],
  // Para que el historial nombre la actividad (aunque no tenga página: SIN_PAGINA_PROPIA)
  cronograma_actividades: ["cronograma_actividades", "nombre"],
};

/** Dónde vive el nombre de una entidad, con su versión corta si la tiene.
 *  `TABLA_DE` no lleva el `corto` y `SECCIONES` no llega a lugares ni
 *  etiquetas: esto junta las dos. Lo usa el título de la pestaña, donde el
 *  nombre corto no es un lujo — «15 Emi» cabe y el oficial no. */
export const nombreDe = (tipo: string): { tabla: string; campo: string; corto?: string } | null => {
  const s = seccionDe(tipo);
  if (s) return { tabla: s.tabla, campo: s.campo, corto: s.corto };
  const t = TABLA_DE[tipo];
  return t ? { tabla: t[0], campo: t[1] } : null;
};
