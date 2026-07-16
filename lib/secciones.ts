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
  tabla: string;
  campo: string;       // cómo se llama
  corto?: string;      // versión breve, si la tiene (alias, nombre_corto)
};

export const SECCIONES: Seccion[] = [
  { tipo: "proyecto", ruta: "/proyectos", ico: "📁", titulo: "Proyectos",
    plural: "proyectos", tabla: "proyectos", campo: "nombre", corto: "nombre_corto" },
  // En empresas `nombre` YA es el corto: el largo es razon_social
  { tipo: "empresa", ruta: "/empresas", ico: "🏢", titulo: "Empresas",
    plural: "empresas", tabla: "empresas", campo: "nombre" },
  { tipo: "persona", ruta: "/personas", ico: "👤", titulo: "Personas",
    plural: "personas", tabla: "personas", campo: "nombre", corto: "alias" },
  { tipo: "postulacion", ruta: "/postulaciones", ico: "🎯", titulo: "Postulaciones",
    plural: "postulaciones", tabla: "postulaciones", campo: "codigo" },
  { tipo: "equipamiento", ruta: "/equipamiento", ico: "🎥", titulo: "Equipos audiovisuales",
    plural: "equipos", tabla: "equipamiento", campo: "nombre" },
  { tipo: "convocatoria", ruta: "/convocatorias", ico: "📜", titulo: "Convocatorias y fondos",
    plural: "convocatorias", tabla: "convocatorias", campo: "codigo" },
];

export const seccionDe = (tipo: string) => SECCIONES.find(s => s.tipo === tipo);

/* Íconos de cualquier entidad vinculable, incluidas las que no tienen
   sección propia (lugares, etiquetas). */
export const ICO_ENT: Record<string, string> = {
  ...Object.fromEntries(SECCIONES.map(s => [s.tipo, s.ico])),
  lugar: "📍", etiqueta: "🏷️",
};
