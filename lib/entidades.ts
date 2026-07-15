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
  sugerenciasPor?: { campo: string; mapa: Record<string, string[]> };
    // sugerencias dependientes de otro campo (ej. subcategoría según categoría)
  valida?: "dni" | "ruc" | "email" | "telefono" | "url" | "anio";
    // validación anti-humanos: formato exigido antes de guardar
};

/* Validadores: el formato que cada tipo de dato exige */
export const VALIDADORES: Record<string, [RegExp, string]> = {
  dni: [/^\d{8}$/, "El DNI son exactamente 8 dígitos"],
  ruc: [/^(10|15|17|20)\d{9}$/, "El RUC son 11 dígitos y empieza en 10, 15, 17 o 20"],
  email: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Ese email no parece válido"],
  telefono: [/^[+]?[\d\s\-()]{6,20}$/, "Ese teléfono no parece válido"],
  url: [/^https?:\/\/\S+$/, "Debe ser un link completo (https://...)"],
  anio: [/^(19|20)\d{2}$/, "Año de 4 dígitos (ej. 2026)"],
};

/* Subcategorías sugeridas según la categoría del equipo */
export const SUBCATS_EQUIPO: Record<string, string[]> = {
  "cámara": ["Cuerpo de cámara", "Lente", "Batería", "Cargador", "Memoria SD / CFexpress",
    "Trípode", "Monopié", "Estabilizador / Gimbal", "Filtro ND", "Jaula / Rig",
    "Monitor externo", "Celular / Smartphone"],
  "micrófono": ["Micrófono corbatero", "Micrófono boom / cañón", "Micrófono inalámbrico",
    "Grabadora de audio", "Audífonos", "Caña / Boom pole", "Zeppelin / Paravientos", "Cable XLR"],
  "iluminación": ["Luz LED", "Softbox", "Fresnel", "Aro de luz", "Trípode de luz",
    "Bandera / Difusor", "Reflector", "Gelatinas"],
  "drone": ["Drone", "Batería de drone", "Hélices", "Control remoto", "Case de drone"],
  "energía": ["Batería V-Mount", "Cargador", "Generador", "Extensión eléctrica",
    "Estabilizador de corriente", "Power bank"],
  "producción": ["Claqueta", "Radio walkie-talkie", "Carpa / Toldo", "Mesa plegable",
    "Silla", "Mochila / Case", "Botiquín"],
  "camping": ["Carpa", "Bolsa de dormir", "Colchoneta / Aislante", "Cocina de campo",
    "Balón de gas", "Termo", "Menaje de campo", "Linterna / Frontal",
    "GPS / Radio satelital", "Poncho de lluvia", "Botas", "Cuerda / Driza", "Botiquín de altura"],
  "pc_accesorios": ["Teclado", "Mouse", "Hub USB", "Lector de memorias", "Cable HDMI", "Adaptador"],
  "cómputo": ["Laptop", "PC de edición", "Monitor", "Disco duro externo", "SSD",
    "NAS / Servidor", "Tableta gráfica"],
  "otro": [],
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
      { key: "renca", label: "RENCA — N° de registro de la obra (opcional)" },
      { key: "renca_url", label: "RENCA — reconocimiento PDF (link Drive)", valida: "url" },
      { key: "carpeta_drive_url", label: "Carpeta principal en Drive (link)", valida: "url" },
      { key: "presupuesto_url", label: "Presupuesto vigente (link) — el reajustado, no el postulado", soloEditar: true, valida: "url" },
      { key: "descripcion", label: "Descripción", tipo: "textarea" },
    ],
  },
  empresa: {
    tabla: "empresas",
    titulo: "Empresa",
    campos: [
      // — Identidad (fila a fila en el grid de 2 columnas) —
      { key: "codigo", label: "Código", auto: true },
      { key: "nombre", label: "Nombre corto", requerido: true },
      { key: "razon_social", label: "Razón social (nombre legal)" },
      { key: "tipo", label: "Tipo", tipo: "select", opciones: ["eirl", "sac", "asociacion", "ong", "municipalidad", "otro"] },
      { key: "relacion", label: "Relación — solo las propias generan alertas", tipo: "select", opciones: ["propia", "aliada", "externa"] },
      { key: "region", label: "Región", tipo: "select", opciones: REGIONES },
      { key: "estado", label: "Estado (interno)", tipo: "select", opciones: ["en_constitucion", "activa", "inactiva", "cerrada"] },
      { key: "fecha_constitucion", label: "Fecha de constitución", tipo: "date" },
      { key: "domicilio_fiscal", label: "Domicilio fiscal" },
      // — Registros: cada número con su PDF al lado —
      { key: "ruc", label: "RUC (11 dígitos)", valida: "ruc" },
      { key: "ficha_ruc_url", label: "Ficha RUC — PDF (link Drive)", valida: "url" },
      { key: "renca", label: "RENCA — N° de registro (obligatorio para postular)" },
      { key: "renca_url", label: "RENCA — reconocimiento PDF (link Drive)", valida: "url" },
      { key: "vigencia_poder_fecha", label: "Vigencia de poder — fecha de emisión", tipo: "date" },
      { key: "vigencia_poder_url", label: "Vigencia de poder — PDF (link Drive)", valida: "url" },
      // — SUNAT (lo llena el botón Verificar, pero editable) —
      { key: "estado_sunat", label: "Estado SUNAT", tipo: "select", opciones: ["activo", "suspension_temporal", "baja_provisional", "baja_definitiva"] },
      { key: "condicion_sunat", label: "Condición SUNAT", tipo: "select", opciones: ["habido", "no_habido"] },
      { key: "fecha_verificacion_sunat", label: "Última verificación SUNAT", tipo: "date" },
      { key: "carpeta_drive_url", label: "Carpeta principal en Drive (link)", valida: "url" },
    ],
  },
  convocatoria: {
    tabla: "convocatorias",
    titulo: "Convocatoria",
    campos: [
      { key: "codigo", label: "Código", auto: true },
      { key: "nombre", label: "Nombre del concurso", requerido: true },
      { key: "institucion", label: "Institución" },
      { key: "anio", label: "Año", valida: "anio" },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["postulacion", "en_ejecucion", "rendicion_pendiente", "cerrada"] },
      { key: "monto_adjudicado", label: "Monto del estímulo (S/)" },
      { key: "bases_url", label: "Link a las bases del concurso", valida: "url" },
      { key: "carpeta_drive_url", label: "Carpeta en Drive (link)", valida: "url" },
    ],
  },
  postulacion: {
    tabla: "postulaciones",
    titulo: "Postulación",
    campos: [
      { key: "codigo", label: "Código", auto: true },
      { key: "codigo_plataforma", label: "Código en la plataforma DAFO (ej. CDO-P-00094-26)" },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["en_preparacion", "enviada", "finalista", "ganadora", "finalista_no_ganadora", "no_seleccionada", "retirada"] },
      { key: "lenguas_originarias", label: "¿Uso de lenguas originarias?", tipo: "select", opciones: ["no", "quechua", "aymara", "mixto"] },
      { key: "puntaje_jurado", label: "Puntaje matriz del jurado" },
      { key: "matriz_jurado_url", label: "Matriz del jurado (link al PDF)", valida: "url" },
      { key: "feedback_jurado", label: "Comentario del jurado", tipo: "textarea" },
      { key: "codigo_acta", label: "Código del acta de compromiso (ej. 139-2025-DAFO)" },
      { key: "fecha_firma_acta", label: "Firma del acta de compromiso", tipo: "date" },
      { key: "monto_adjudicado", label: "Monto adjudicado (S/)" },
      { key: "fecha_limite_rendicion", label: "Límite de rendición", tipo: "date" },
      { key: "fecha_prorroga", label: "Prórroga (si existe)", tipo: "date" },
      { key: "acta_url", label: "Acta de compromiso (link)", valida: "url" },
      { key: "carpeta_drive_url", label: "Carpeta en Drive (link)", valida: "url" },
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
      { key: "categoria", label: "Categoría", tipo: "select", opciones: ["cámara", "micrófono", "iluminación", "drone", "energía", "producción", "camping", "pc_accesorios", "cómputo", "otro"] },
      { key: "subcategoria", label: "Subcategoría", sugerenciasPor: { campo: "categoria", mapa: SUBCATS_EQUIPO } },
      // "en_uso" no es elegible: lo gobiernan los préstamos (🤝 en el perfil)
      { key: "estado", label: "Estado", tipo: "select", opciones: ["disponible", "en_reparacion", "perdido", "de_baja"] },
      { key: "valor_compra", label: "Valor de compra (S/)" },
      { key: "comprado_en", label: "Comprado en" },
      { key: "link", label: "Link (referencia)", valida: "url" },
      { key: "descripcion", label: "Descripción", tipo: "textarea" },
    ],
  },
  persona: {
    tabla: "personas",
    titulo: "Persona",
    campos: [
      { key: "nombre", label: "Nombre completo", requerido: true },
      { key: "alias", label: "Nombre corto / alias" },
      { key: "tipo", label: "Tipo", tipo: "select", opciones: ["personal", "colaborador", "colaborador eventual", "independiente", "contacto"] },
      { key: "equipo", label: "Equipo", tipo: "select", opciones: ["creativo", "tecnico", "artistico", "administrativo"] },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["activo", "potencial", "vetado", "inactivo"] },
      { key: "rol", label: "Especialidades / rol", sugerencias: ESPECIALIDADES, multiple: true },
      { key: "region", label: "Región", tipo: "select", opciones: REGIONES },
      { key: "genero", label: "Género", tipo: "select", opciones: ["femenino", "masculino", "otro"] },
      { key: "telefono", label: "Teléfono", valida: "telefono" },
      { key: "email", label: "Email", valida: "email" },
      { key: "ruc_dni", label: "DNI (8 dígitos)", valida: "dni" },
      { key: "dni_vencimiento", label: "DNI — fecha de vencimiento", tipo: "date" },
      { key: "carpeta_drive_url", label: "Carpeta en Drive (link)", valida: "url" },
      { key: "cv_url", label: "CV / hoja de vida (link Drive)", valida: "url" },
      { key: "dni_url", label: "DNI escaneado (link Drive)", valida: "url" },
      { key: "firma_url", label: "Firma escaneada (link Drive)", valida: "url" },
      { key: "notas", label: "Notas", tipo: "textarea" },
    ],
  },
};
