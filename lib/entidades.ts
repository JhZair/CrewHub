/* Configuración de mantenimiento de entidades núcleo.
   Compartida por el formulario (cliente) y la acción (servidor,
   como whitelist de tablas y campos). */

export type CampoDef = {
  key: string;
  label: string;
  tipo?: "text" | "select" | "textarea" | "date" | "color";
  opciones?: string[];
  requerido?: boolean;
  auto?: boolean;       // lo genera el sistema; solo lectura (folios inmutables)
  soloEditar?: boolean; // se oculta al crear; solo aparece editando (ej. presupuesto vigente)
  sugerencias?: string[]; // autocompletado con lista, pero acepta texto libre
  multiple?: boolean;     // varias opciones como chips (se guardan separadas por coma)
};

/* Especialidades del oficio — sugerencias, no camisa de fuerza */
export const ESPECIALIDADES = [
  "Director/a", "Productor/a", "Guionista", "Director/a de Fotografía",
  "Camarógrafo/a", "Sonidista", "Editor/a", "Colorista",
  "Director/a de Arte", "Compositor/a de Música", "Animador/a 2D",
  "Animador/a 3D", "Ilustrador/a", "Operador/a de Drone",
  "Asistente de Producción", "Investigador/a", "Fotógrafo/a Fija",
  "Foto fija Detrás de cámaras BTS",
  "Traductor/a Quechua", "Actor / Actriz", "Gestor/a Cultural",
  "Desarrollador/a de Videojuegos", "Diseñador/a Gráfico",
  "Contador/a", "Abogado/a", "Transporte", "Catering",
];

/* Color por tipo de proyecto — el mismo en todo el sistema */
export const TIPO_COLOR: Record<string, string> = {
  documental: "#2dd4bf",   // teal
  animacion: "#ec4899",    // rosa
  videojuego: "#3b82f6",   // azul
  ficcion: "#a78bfa",      // violeta
  experimental: "#f4b400",     // ámbar
  gestion_cultural: "#2ecc71", // verde
  cobertura: "#f59e0b",        // naranja
};

export const REGIONES = [
  "Amazonas", "Áncash", "Apurímac", "Arequipa", "Ayacucho", "Cajamarca",
  "Callao", "Cusco", "Huancavelica", "Huánuco", "Ica", "Junín",
  "La Libertad", "Lambayeque", "Lima", "Loreto", "Madre de Dios",
  "Moquegua", "Pasco", "Piura", "Puno", "San Martín", "Tacna", "Tumbes", "Ucayali",
];

export const FORM_CONF: Record<string, { tabla: string; titulo: string; campos: CampoDef[] }> = {
  proyecto: {
    tabla: "proyectos",
    titulo: "Proyecto",
    campos: [
      { key: "folio", label: "Folio", auto: true },
      { key: "nombre", label: "Nombre oficial", requerido: true },
      { key: "nombre_corto", label: "Nombre corto" },
      { key: "tipo", label: "Tipo", tipo: "select", opciones: ["documental", "animacion", "videojuego", "ficcion", "experimental", "gestion_cultural", "cobertura"] },
      { key: "modalidad", label: "Modalidad", tipo: "select", opciones: ["concurso", "encargo", "autofinanciado", "coproduccion"] },
      { key: "etapa", label: "Etapa", tipo: "select", opciones: ["idea", "en_carpeta", "desarrollo", "preproduccion", "produccion", "postproduccion", "finalizado"] },
      { key: "estado_actividad", label: "Estado de actividad", tipo: "select", opciones: ["activo", "bloqueado", "en_pausa", "completado"] },
      { key: "color", label: "Color del proyecto", tipo: "color" },
      { key: "carpeta_drive_url", label: "Carpeta principal en Drive (link)" },
      { key: "presupuesto_url", label: "Presupuesto vigente (link) — el reajustado, no el postulado", soloEditar: true },
      { key: "descripcion", label: "Descripción", tipo: "textarea" },
    ],
  },
  empresa: {
    tabla: "empresas",
    titulo: "Empresa",
    campos: [
      { key: "codigo", label: "Código", auto: true },
      { key: "nombre", label: "Nombre corto", requerido: true },
      { key: "razon_social", label: "Razón social (nombre legal)" },
      { key: "tipo", label: "Tipo", tipo: "select", opciones: ["eirl", "sac", "asociacion", "ong", "municipalidad", "otro"] },
      { key: "ruc", label: "RUC" },
      { key: "region", label: "Región", tipo: "select", opciones: REGIONES },
      { key: "estado", label: "Estado (interno)", tipo: "select", opciones: ["en_constitucion", "activa", "inactiva", "cerrada"] },
      { key: "fecha_constitucion", label: "Fecha de constitución", tipo: "date" },
      { key: "domicilio_fiscal", label: "Domicilio fiscal" },
      { key: "estado_sunat", label: "Estado SUNAT", tipo: "select", opciones: ["activo", "suspension_temporal", "baja_provisional", "baja_definitiva"] },
      { key: "condicion_sunat", label: "Condición SUNAT", tipo: "select", opciones: ["habido", "no_habido"] },
      { key: "fecha_verificacion_sunat", label: "Última verificación SUNAT", tipo: "date" },
      { key: "carpeta_drive_url", label: "Carpeta principal en Drive (link)" },
      { key: "ficha_ruc_url", label: "Ficha RUC (link Drive)" },
      { key: "vigencia_poder_url", label: "Vigencia de poder (link Drive)" },
      { key: "vigencia_poder_fecha", label: "Vigencia de poder — fecha de emisión", tipo: "date" },
    ],
  },
  convocatoria: {
    tabla: "convocatorias",
    titulo: "Convocatoria",
    campos: [
      { key: "codigo", label: "Código", auto: true },
      { key: "nombre", label: "Nombre del concurso", requerido: true },
      { key: "institucion", label: "Institución" },
      { key: "anio", label: "Año" },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["postulacion", "en_ejecucion", "rendicion_pendiente", "cerrada"] },
      { key: "monto_adjudicado", label: "Monto del estímulo (S/)" },
      { key: "bases_url", label: "Link a las bases del concurso" },
      { key: "carpeta_drive_url", label: "Carpeta en Drive (link)" },
    ],
  },
  postulacion: {
    tabla: "postulaciones",
    titulo: "Postulación",
    campos: [
      { key: "codigo", label: "Código", auto: true },
      { key: "codigo_plataforma", label: "Código en la plataforma DAFO (ej. CDO-P-00094-26)" },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["en_preparacion", "enviada", "finalista", "ganadora", "no_seleccionada", "retirada"] },
      { key: "lenguas_originarias", label: "¿Uso de lenguas originarias?", tipo: "select", opciones: ["no", "quechua", "aymara", "mixto"] },
      { key: "puntaje_jurado", label: "Puntaje matriz del jurado" },
      { key: "matriz_jurado_url", label: "Matriz del jurado (link al PDF)" },
      { key: "feedback_jurado", label: "Comentario del jurado", tipo: "textarea" },
      { key: "codigo_acta", label: "Código del acta de compromiso (ej. 139-2025-DAFO)" },
      { key: "fecha_firma_acta", label: "Firma del acta de compromiso", tipo: "date" },
      { key: "monto_adjudicado", label: "Monto adjudicado (S/)" },
      { key: "fecha_limite_rendicion", label: "Límite de rendición", tipo: "date" },
      { key: "fecha_prorroga", label: "Prórroga (si existe)", tipo: "date" },
      { key: "acta_url", label: "Acta de compromiso (link)" },
      { key: "carpeta_drive_url", label: "Carpeta en Drive (link)" },
    ],
  },
  etiqueta: {
    tabla: "etiquetas",
    titulo: "Etiqueta",
    campos: [
      { key: "nombre", label: "Nombre", requerido: true },
      { key: "color", label: "Color", tipo: "color" },
    ],
  },
  lugar: {
    tabla: "lugares",
    titulo: "Lugar",
    campos: [
      { key: "nombre", label: "Nombre", requerido: true },
      { key: "direccion", label: "Dirección / referencia" },
    ],
  },
  equipamiento: {
    tabla: "equipamiento",
    titulo: "Equipo audiovisual",
    campos: [
      { key: "folio", label: "Folio", auto: true },
      { key: "nombre", label: "Nombre del activo", requerido: true },
      { key: "categoria", label: "Categoría", tipo: "select", opciones: ["cámara", "micrófono", "iluminación", "drone", "energía", "producción", "pc_accesorios", "cómputo", "otro"] },
      { key: "subcategoria", label: "Subcategoría" },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["disponible", "en_uso", "en_reparacion", "perdido", "de_baja"] },
      { key: "valor_compra", label: "Valor de compra (S/)" },
      { key: "comprado_en", label: "Comprado en" },
      { key: "link", label: "Link (referencia)" },
      { key: "descripcion", label: "Descripción", tipo: "textarea" },
    ],
  },
  persona: {
    tabla: "personas",
    titulo: "Persona",
    campos: [
      { key: "nombre", label: "Nombre completo", requerido: true },
      { key: "alias", label: "Nombre corto / alias" },
      { key: "tipo", label: "Tipo", tipo: "select", opciones: ["personal", "colaborador", "independiente", "entidad_financiera", "contacto"] },
      { key: "equipo", label: "Equipo", tipo: "select", opciones: ["creativo", "tecnico", "administrativo"] },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["activo", "potencial", "vetado", "inactivo"] },
      { key: "rol", label: "Especialidades / rol", sugerencias: ESPECIALIDADES, multiple: true },
      { key: "region", label: "Región", tipo: "select", opciones: REGIONES },
      { key: "genero", label: "Género", tipo: "select", opciones: ["femenino", "masculino", "otro"] },
      { key: "telefono", label: "Teléfono" },
      { key: "email", label: "Email" },
      { key: "ruc_dni", label: "RUC / DNI" },
      { key: "dni_vencimiento", label: "DNI — fecha de vencimiento", tipo: "date" },
      { key: "carpeta_drive_url", label: "Carpeta en Drive (link)" },
      { key: "cv_url", label: "CV / hoja de vida (link Drive)" },
      { key: "dni_url", label: "DNI escaneado (link Drive)" },
      { key: "notas", label: "Notas", tipo: "textarea" },
    ],
  },
};
