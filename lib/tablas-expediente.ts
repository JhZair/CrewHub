/* ── Tablas repetibles del expediente (Sección C y B del formulario DAFO) ──
   Material de archivo y participantes/beneficiarios: tablas que se llenan
   fila por fila. Las columnas salen del formulario oficial. La forma la comparte
   el componente TablaSimple y la acción guardarTablaPostulacion. */

export type ColTabla = {
  clave: string;
  etiqueta: string;
  tipo?: "text" | "num";
  ancho?: number;          // px de la columna (las de texto sin ancho = flexibles)
  placeholder?: string;
};

export type TablaExp = {
  campo: string;           // columna jsonb en postulaciones (whitelist)
  titulo: string;
  ayuda?: string;
  columnas: ColTabla[];
};

export const TABLAS_EXP: Record<string, TablaExp> = {
  material_archivo: {
    campo: "material_archivo",
    titulo: "📁 Material de archivo",
    ayuda: "Consigna al menos autor y fuente (Ley de Derecho de Autor). Si no se identifica el autor, escribe «no identificado».",
    columnas: [
      { clave: "descripcion", etiqueta: "Descripción del material", placeholder: "Nombre u otros datos que lo identifiquen" },
      { clave: "autor", etiqueta: "Autor", ancho: 200, placeholder: "no identificado" },
      { clave: "fuente", etiqueta: "Fuente", ancho: 200 },
    ],
  },
  beneficiarios: {
    campo: "beneficiarios",
    titulo: "👥 Participantes / beneficiarios",
    ayuda: "Cantidad de personal que se estima emplear en la ejecución del proyecto, por rol o puesto.",
    columnas: [
      { clave: "rol", etiqueta: "Rol / puesto", placeholder: "Ej. Programador, artista 2D…" },
      { clave: "cantidad", etiqueta: "Cantidad", tipo: "num", ancho: 100 },
    ],
  },
};

/* Los campos jsonb que la acción tiene permitido escribir. */
export const CAMPOS_TABLA = Object.keys(TABLAS_EXP);
