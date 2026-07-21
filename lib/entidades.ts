/* Configuración de mantenimiento de entidades núcleo.
   Compartida por el formulario (cliente) y la acción (servidor,
   como whitelist de tablas y campos). */
import { CATEGORIAS_OPC } from "@/lib/etapas";

export type CampoDef = {
  key: string;
  label: string;
  tipo?: "text" | "select" | "textarea" | "date" | "color" | "bool";
  opciones?: string[];
  requerido?: boolean;
  auto?: boolean;       // lo genera el sistema; solo lectura (folios inmutables)
  soloEditar?: boolean; // se oculta al crear; solo aparece editando (ej. presupuesto vigente)
  sugerencias?: string[]; // autocompletado con lista, pero acepta texto libre
  multiple?: boolean;     // varias opciones como chips (se guardan separadas por coma)
  sugerenciasPor?: { campo: string; mapa: Record<string, string[]> };
    // sugerencias dependientes de otro campo (ej. subcategoría según categoría)
  valida?: "dni" | "ruc" | "email" | "telefono" | "url" | "anio" | "monto" | "puntaje";
    // validación anti-humanos: formato exigido antes de guardar
  corto?: string;       // nombre breve para el historial (si la etiqueta es larga)
  grupo?: string;       // agrupa el campo en un bloque destacado del formulario
  /* Solo aparece si otro campo tiene cierto valor. Existe para no pedir lo
     que no puede existir: a una cobertura por encargo no le falta el RENCA —
     el RENCA es el registro de una obra cinematográfica, y una cobertura no
     lo es. Un campo vacío se lee como «pendiente», y eso convierte una
     imposibilidad en una tarea. */
  soloSi?: { campo: string; en: string[] };
};

/* ¿Este campo aplica, dados los valores actuales del formulario? */
export const campoAplica = (c: CampoDef, valores: Record<string, any>) =>
  !c.soloSi || c.soloSi.en.includes(String(valores[c.soloSi.campo] ?? ""));

/* Nombre breve de un campo para la bitácora: usa `corto` si existe; si no,
   recorta la etiqueta en el guion largo y quita los paréntesis explicativos.
   "RENCA — N° de registro (obligatorio...)" → "RENCA" */
export function nombreCorto(c: { label: string; corto?: string }): string {
  return c.corto || c.label.split("—")[0].replace(/\([^)]*\)/g, "").trim();
}

/* Bloques de campos agrupados en el formulario, cada uno con su tono:
   ámbar = importa, pero no bloquea el alta.
   azul  = lo llena la verificación automática; no se edita a mano. */
export const DOCS_EMPRESA = "📎 Documentos — necesarios para postular, no para dar de alta";
export const SUNAT_EMPRESA = "🏛 SUNAT — lo llena la verificación automática";
/* El DAFO aparta la mitad del concurso para empresas fuera de Lima Metrop. y
   Callao, y lo mide con tres hechos distintos que hay que acreditar por
   separado. No es lo mismo que «región», que es dónde opera. */
export const RESERVA_EMPRESA = "🗺 Reserva regional — dónde figura la empresa ante SUNARP y SUNAT";
export const DNI_PERSONA = "🪪 Identidad — DNI y firma: obligatorios para postular";
export const CENSAL_PERSONA = "🧬 Ficha censal DAFO — se llena UNA vez y sirve para todas las postulaciones";
export const DOCS_PERSONA = "📎 Otros documentos";
export const SUNAT_PERSONA = "🏛 SUNAT — su RUC sale del DNI; lo demás lo llena la verificación";

/* Una postulación no se llena de una sentada: se envía, la evalúan, y con
   suerte se gana. Presentarla como una pared de 14 campos hace que la mitad
   pida datos que todavía NO EXISTEN —el acta de algo que aún no ganas—, y
   quien la edita no sabe si está olvidando algo o si aún no toca.
   Los bloques cuentan ese orden. */
/* Qué proyectos pueden ir a un concurso del DAFO. Sale de lo que ya postulan:
   documentales, animaciones, videojuegos y gestión cultural están en el
   embudo 2026 (C-062, C-068, C-072, C-076, C-071). Los que faltan aquí no es
   que no puedan nunca — es que hoy no van, y cuando vayan se agregan a esta
   lista y sus campos aparecen solos.
   Una COBERTURA por encargo nunca va: es un trabajo para un cliente, no una
   obra que se registre ni un proyecto que se postule. */
export const TIPOS_A_CONCURSO = ["documental", "animacion", "videojuego", "ficcion", "experimental", "gestion_cultural"];
export const FONDO_PROY = "🏆 Fondos — solo si el proyecto va a concurso";

export const JURADO_POST = "⚖️ Resultado del jurado — recién cuando DAFO publica";
export const FONDO_POST = "🏆 Si ganó — el fondo adjudicado; se llena al firmar el acta";
export const DOCS_POST = "📎 Documentos";

export const GRUPO_TONO: Record<string, "ambar" | "azul"> = {
  [FONDO_PROY]: "ambar",
  [DOCS_EMPRESA]: "ambar",
  [SUNAT_EMPRESA]: "azul",
  [RESERVA_EMPRESA]: "ambar",
  [DNI_PERSONA]: "azul",
  [DOCS_PERSONA]: "ambar",
  [SUNAT_PERSONA]: "azul",
  [JURADO_POST]: "azul",
  [FONDO_POST]: "ambar",
  [DOCS_POST]: "ambar",
};

/* Validadores: el formato que cada tipo de dato exige */
export const VALIDADORES: Record<string, [RegExp, string]> = {
  dni: [/^\d{8}$/, "El DNI son exactamente 8 dígitos"],
  ruc: [/^(10|15|17|20)\d{9}$/, "El RUC son 11 dígitos y empieza en 10, 15, 17 o 20"],
  email: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Ese email no parece válido"],
  telefono: [/^[+]?[\d\s\-()]{6,20}$/, "Ese teléfono no parece válido"],
  url: [/^https?:\/\/\S+$/, "Debe ser un link completo (https://...)"],
  anio: [/^(19|20)\d{2}$/, "Año de 4 dígitos (ej. 2026)"],
  /* Dinero y puntaje van a columnas `numeric` de Postgres. La acción ya
     limpia "S/ 400,000.00" → "400000.00", pero si el operador escribe
     "por confirmar" el error que devuelve la base es «invalid input syntax
     for type numeric» — cierto, e inútil. Mejor decirlo aquí. */
  monto: [/^\d{1,3}(,?\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/, "Solo el número (ej. 45000 o 45,000.50) — sin «S/» ni texto"],
  puntaje: [/^\d{1,3}(\.\d{1,2})?$/, "Solo el puntaje, hasta 2 decimales (ej. 87.5)"],
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

/* Especialidades del oficio — sugerencias, no camisa de fuerza.
 *
 * Esta lista se OBSERVÓ, no se inventó: sale de los roles realmente
 * cargados en las fichas. La versión anterior tenía 27 entradas escritas de
 * memoria y solo diez aparecían en el sistema; peor, nombraba los mismos
 * oficios con otras palabras ("Camarógrafo/a" cuando el equipo escribe
 * "Operador/a de Cámara", doce veces). Por eso nadie la usaba: el
 * desplegable nunca ofrecía la palabra que la gente tenía en la cabeza, y
 * todos terminaban escribiendo a mano.
 *
 * Regla para mantenerla: antes de agregar una entrada, mira si el equipo ya
 * la escribe de otra forma. Manda la palabra que ya usan, no la correcta.
 */
export const ESPECIALIDADES = [
  // — Dirección y guion —
  "Director/a", "Director/a Cinematográfica", "Director/a Documental",
  "Director de Casting", "Guionista", "Guión Animación",
  "Diseño Narrativo", "Escaleta Secuenciada", "Exploración de Historia",
  "Facilitador/a",
  // — Producción —
  "Productor/a", "Productor/a de Línea", "Productor/a de Campo (Local)",
  "Asistente de Producción", "Coordinación de Logística",
  "Administrativo", "Guía Local / Orientador (Fixer)",
  // — Cámara e imagen —
  "Director/a de Fotografía", "Operador/a de Cámara", "Asistente de Cámara",
  "Asistente de Iluminación", "Operador de Dron / Piloto",
  "Operador de Gimbal / Cámara de Dron",
  "Fotógrafo/a", "Fotógrafo/a Fija", "Foto fija Detrás de cámaras BTS",
  // — Sonido —
  "Sonidista", "Asistente de Sonido", "Ingeniero de Sonido",
  "Editor/a de Sonido", "Foley", "Doblaje",
  "Compositor/a de Música", "Director Musical",
  // — Arte —
  "Dirección de Arte", "Arte Conceptual", "Diseño de Personajes",
  "Ilustrador/a", "Diseñador/a Gráfico",
  // — Montaje y post —
  "Editor/a", "Color grading",
  // — Animación y 3D —
  "Animación", "Dirección Animación", "Productor Animación",
  "Productor de Linea Animación", "Animador/a 2D", "Animador/a 3D",
  "Modelado 3D", "Texturizado 3D", "Rig",
  // — Videojuegos —
  "Programador Videojuegos", "Diseñador de Niveles Videojuegos",
  "Productor Videojuegos",
  // — Investigación y cultura (el corazón de lo documental) —
  "Investigación Documental", "Antropólogo/a", "Historiador/a",
  "Entrevistador/a de Documental", "Asesor/a Cultural / Sabio/a",
  "Traductor/a / Intérprete (Lengua Originaria)", "Gestor/a Cultural",
  // "Actor Social" es el participante del documental, no del elenco:
  // son 18 personas y no tiene nada que ver con "Actor / Actriz".
  "Actor Social", "Actor / Actriz",
  // — Servicios de proveedores —
  // Ojo: esto no es una especialidad, es lo que alguien VENDE. Está aquí
  // porque el campo `rol` hace doble trabajo desde Seatable; separarlo es
  // otra conversación.
  "Alquiler de Locaciones", "Alquiler de Vehículos", "Alquiler de Dron",
  "Alquiler de equipos de Filmación", "Alquiler de Grupo Electrógeno",
  "Alquiler de Mobiliario y Utilería",
  "Servicio de Catering / Alimentación", "Servicio de Hospedaje / Alojamiento",
  "Transporte de Personal", "Transporte de Carga / Equipo",
  "Seguridad en Locación", "Servicios Contables",
  "Contador/a", "Abogado/a",
];

/* De quién es una empresa y cómo está — el mismo par en todo el sistema.
   Vivía suelto dentro de /empresas, y el buscador terminó sin mostrarlo:
   por eso ahí una empresa en proceso de cierre parecía tener un problema
   de SUNAT sin resolver. La relación y el estado no son adornos — son lo
   que decide si algo te toca. */
export const REL_EMPRESA: Record<string, [string, string]> = {
  propia: ["propia", "var(--violet)"],
  aliada: ["aliada", "var(--teal)"],
  externa: ["externa", "var(--dim)"],
};
export const EST_EMPRESA: Record<string, [string, string]> = {
  activa: ["activa", "var(--green)"],
  en_constitucion: ["en constitución", "var(--yellow)"],
  inactiva: ["inactiva", "var(--dim)"],
  en_proceso_de_cierre: ["en cierre", "var(--orange)"],
  cerrada: ["cerrada", "var(--dim)"],
};

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
      /* «festivales» y «distribucion» faltaban, y con ellas el sistema
         terminaba donde termina DAFO. El divorcio de la directora con su
         proyecto no es la rendición: es cuando la película llega a los
         festivales y los cines. Un documental que ya rindió y todavía no se
         estrenó no está «finalizado» ni de lejos.
         El orden supone que el documental estrena en festival y recién
         después va a cines y plataformas. */
      { key: "etapa", label: "Etapa", tipo: "select", opciones: ["idea", "en_carpeta", "desarrollo", "preproduccion", "produccion", "postproduccion", "festivales", "distribucion", "finalizado"] },
      { key: "estado_actividad", label: "Estado de actividad", tipo: "select", opciones: ["activo", "bloqueado", "en_pausa", "completado"] },
      { key: "color", label: "Color del proyecto", tipo: "color" },
      { key: "carpeta_drive_url", label: "Carpeta principal en Drive (link)", valida: "url" },
      { key: "descripcion", label: "Descripción", tipo: "textarea" },
      /* — Lo del fondo. Solo aparece si el proyecto puede ir a un concurso.
           Una cobertura por encargo no tiene RENCA ni presupuesto reajustado:
           no es que le falten — es que no existen. El RENCA registra una OBRA
           cinematográfica; una cobertura no lo es, y «reajustado» solo tiene
           sentido cuando hubo un jurado que recortó.
           Antes estaban siempre, y un campo vacío se lee como pendiente: el
           formulario convertía una imposibilidad en una tarea. — */
      { key: "renca", label: "RENCA — N° de registro de la obra (opcional)", corto: "RENCA", grupo: FONDO_PROY,
        soloSi: { campo: "tipo", en: TIPOS_A_CONCURSO } },
      { key: "renca_url", label: "RENCA — reconocimiento PDF (link Drive)", corto: "RENCA PDF", valida: "url", grupo: FONDO_PROY,
        soloSi: { campo: "tipo", en: TIPOS_A_CONCURSO } },
      { key: "presupuesto_url", label: "Presupuesto vigente (link) — el reajustado, no el postulado", corto: "Presupuesto", soloEditar: true, valida: "url", grupo: FONDO_PROY,
        soloSi: { campo: "tipo", en: TIPOS_A_CONCURSO } },
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
      { key: "relacion", label: "Relación (solo las propias generan alertas)", corto: "Relación", tipo: "select", opciones: ["propia", "aliada", "externa"] },
      { key: "region", label: "Región donde opera", corto: "Región", tipo: "select", opciones: REGIONES },
      { key: "estado", label: "Estado (interno)", tipo: "select", opciones: ["en_constitucion", "activa", "inactiva", "en_proceso_de_cierre", "cerrada"] },
      { key: "fecha_constitucion", label: "Fecha de constitución", tipo: "date" },
      /* La reserva regional del DAFO aparta la mitad del concurso para
         empresas fuera de Lima Metropolitana y Callao, y exige TRES cosas
         separadas: constitución en SUNARP, domicilio en SUNARP, domicilio en
         SUNAT. Pueden no coincidir —una empresa constituida en Cusco puede
         haber mudado su domicilio registral—, así que van en tres campos.
         `region` (arriba) es dónde opera: otro hecho, no sirve para esto. */
      { key: "sunarp_region_constitucion", label: "Constituida en (SUNARP) — para la reserva regional", corto: "Constituida en", tipo: "select", opciones: REGIONES, grupo: RESERVA_EMPRESA },
      { key: "sunarp_region_domicilio", label: "Domicilio registral (SUNARP)", corto: "Domicilio SUNARP", tipo: "select", opciones: REGIONES, grupo: RESERVA_EMPRESA },
      { key: "sunat_region_domicilio", label: "Región del domicilio fiscal (SUNAT)", corto: "Región SUNAT", tipo: "select", opciones: REGIONES, grupo: RESERVA_EMPRESA },
      /* Solo si alguna de las tres dice «Lima». La reserva excluye Lima
         METROPOLITANA, no el departamento: Huacho y Cañete sí entran. Con el
         departamento solo, el sistema no puede decidir — y prefiere decirlo
         antes que adivinar. */
      { key: "provincia_lima", label: "¿Qué provincia de Lima? (solo si arriba dice «Lima»)", corto: "Provincia de Lima", grupo: RESERVA_EMPRESA },
      // — SUNAT: el RUC es la llave, y lo demás lo trae la verificación.
      //   La ficha RUC en PDF se retiró: se consulta en vivo en SUNAT (el
      //   PDF guardado se desactualizaba y engañaba). —
      { key: "ruc", label: "RUC (11 dígitos)", valida: "ruc", grupo: SUNAT_EMPRESA },
      { key: "domicilio_fiscal", label: "Domicilio fiscal", grupo: SUNAT_EMPRESA },
      { key: "estado_sunat", label: "Estado SUNAT", tipo: "select", opciones: ["activo", "suspension_temporal", "baja_provisional", "baja_definitiva"], grupo: SUNAT_EMPRESA },
      { key: "condicion_sunat", label: "Condición SUNAT", tipo: "select", opciones: ["habido", "no_habido"], grupo: SUNAT_EMPRESA },
      { key: "fecha_verificacion_sunat", label: "Última verificación SUNAT", corto: "Verificado SUNAT", tipo: "date", grupo: SUNAT_EMPRESA },
      // — Documentos: importantes para postular, pero no bloquean el alta.
      //   Cada dato va a la izquierda con su respaldo (link) a la derecha. —
      { key: "renca", label: "RENCA — N° de registro", corto: "RENCA", grupo: DOCS_EMPRESA },
      { key: "renca_url", label: "RENCA — reconocimiento (PDF)", corto: "RENCA PDF", valida: "url", grupo: DOCS_EMPRESA },
      /* Se pide la emisión, no el vencimiento: es el dato que trae el papel
         de SUNARP. El vencimiento (emisión + 90 d) se calcula y se muestra
         en la ficha, para que nadie tenga que hacer la cuenta de cabeza. */
      { key: "vigencia_poder_fecha", label: "Vigencia de poder — fecha de emisión (vence a los 90 días)", corto: "Vigencia poder", tipo: "date", grupo: DOCS_EMPRESA },
      { key: "vigencia_poder_url", label: "Vigencia de poder (PDF)", corto: "Vigencia PDF", valida: "url", grupo: DOCS_EMPRESA },
      { key: "carpeta_drive_url", label: "Carpeta principal en Drive", corto: "Carpeta Drive", valida: "url", grupo: DOCS_EMPRESA },
    ],
  },
  convocatoria: {
    tabla: "convocatorias",
    titulo: "Convocatoria",
    campos: [
      { key: "codigo", label: "Código", auto: true },
      { key: "nombre", label: "Nombre del concurso", requerido: true },
      // La categoría decide las etapas del cronograma de sus postulaciones.
      { key: "categoria", label: "Categoría del concurso", tipo: "select", opciones: CATEGORIAS_OPC },
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
      // — Lo que existe desde que se prepara —
      { key: "codigo", label: "Código", auto: true },
      { key: "codigo_plataforma", label: "Código en la plataforma DAFO (ej. CDO-P-00094-26)", corto: "Código DAFO" },
      /* El camino real, con sus dos jueces:
           en_preparacion → enviada → APTA → finalista → ganadora
         «Apta» es el primer filtro y no lo pone el jurado: lo pone DAFO, y es
         administrativo (bases 5.2, «NO PODRÁN SER DECLARADAS APTAS»). Elimina
         proyectos antes de que nadie lea el tratamiento — por RUC, por
         rendiciones vencidas, por papeles. Faltaba, y sin él «no seleccionada»
         mezclaba dos cosas: al que descartó un revisor por un papel y al que
         no eligió un jurado por su película. */
      { key: "estado", label: "Estado", tipo: "select", opciones: ["en_preparacion", "enviada", "apta", "no_apta", "finalista", "ganadora", "finalista_no_ganadora", "no_seleccionada", "retirada"] },
      { key: "lenguas_originarias", label: "¿Uso de lenguas originarias?", tipo: "select", opciones: ["no", "quechua", "aymara", "mixto"] },
      // — Lo que aparece cuando el jurado publica —
      { key: "puntaje_jurado", label: "Puntaje matriz del jurado", valida: "puntaje", grupo: JURADO_POST },
      { key: "matriz_jurado_url", label: "Matriz del jurado (link al PDF)", corto: "Matriz jurado", valida: "url", grupo: JURADO_POST },
      { key: "feedback_jurado", label: "Comentario del jurado", corto: "Comentario jurado", tipo: "textarea", grupo: JURADO_POST },
      // — Lo que solo existe si se ganó —
      { key: "codigo_acta", label: "Código del acta de compromiso (ej. 139-2025-DAFO)", corto: "Código acta", grupo: FONDO_POST },
      { key: "fecha_firma_acta", label: "Firma del acta de compromiso", corto: "Firma acta", tipo: "date", grupo: FONDO_POST },
      { key: "monto_adjudicado", label: "Monto adjudicado (S/)", corto: "Monto", valida: "monto", grupo: FONDO_POST },
      { key: "acta_url", label: "Acta de compromiso (link)", corto: "Acta", valida: "url", grupo: FONDO_POST },
      { key: "fecha_limite_rendicion", label: "Límite de rendición", corto: "Límite rendición", tipo: "date", grupo: FONDO_POST },
      { key: "fecha_prorroga", label: "Prórroga (si existe)", corto: "Prórroga", tipo: "date", grupo: FONDO_POST },
      /* El plazo dice para cuándo hay que rendir; este dice si se rindió.
         Mientras esté vacío el fondo sigue abierto y su empresa no aparece
         libre para postular — antes se deducía del calendario, y el
         calendario no sabe si alguien entregó algo. */
      { key: "fecha_rendicion_real", label: "Rendición entregada el (vacío = sigue ejecutando)", corto: "Rendición entregada", tipo: "date", grupo: FONDO_POST },
      { key: "carpeta_drive_url", label: "Carpeta en Drive (link)", corto: "Carpeta Drive", valida: "url", grupo: DOCS_POST },
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
      { key: "nombre", label: "Nombre completo", corto: "Nombre", requerido: true },
      { key: "alias", label: "Nombre corto / alias", corto: "Alias" },
      { key: "tipo", label: "Tipo", tipo: "select", opciones: ["personal", "colaborador", "colaborador eventual", "independiente", "contacto"] },
      { key: "equipo", label: "Equipo", tipo: "select", opciones: ["creativo", "tecnico", "artistico", "administrativo"] },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["activo", "potencial", "vetado", "inactivo"] },
      { key: "rol", label: "Especialidades / rol", corto: "Rol", sugerencias: ESPECIALIDADES, multiple: true },
      { key: "region", label: "Región", tipo: "select", opciones: REGIONES },
      { key: "genero", label: "Género", tipo: "select", opciones: ["femenino", "masculino", "no binario", "otro"] },
      { key: "es_comunero", label: "¿Es comunero/a?", corto: "Comunero/a", tipo: "bool" },
      // — Ficha censal DAFO: los datos que la plataforma pide POR PERSONA en
      //   cada tabla de equipo. Se registran una vez y se generan solos en
      //   el expediente de cada postulación. Opciones = las de la plataforma. —
      { key: "fecha_nacimiento", label: "Fecha de nacimiento", corto: "Nacimiento", tipo: "date", grupo: CENSAL_PERSONA },
      { key: "nacionalidad", label: "Nacionalidad", tipo: "select", opciones: ["Perú", "Extranjero/a domiciliado/a", "Extranjero/a"], grupo: CENSAL_PERSONA },
      { key: "autoident", label: "Autoidentificación étnica (censo)", corto: "Autoident.", tipo: "select", grupo: CENSAL_PERSONA,
        opciones: ["Quechua", "Aimara", "Blanco", "Mestizo", "Nativo o indígena de la Amazonía", "Negro, moreno, zambo, mulato, pueblo afroperuano o afrodescendiente", "Nikkei", "Tusan", "Perteneciente a otro pueblo indígena u originario", "Otros"] },
      { key: "lengua_materna", label: "Lengua con la que aprendió a hablar", corto: "Lengua materna", tipo: "select", opciones: ["Quechua", "Castellano", "Aimara", "Otra lengua originaria", "Otra"], grupo: CENSAL_PERSONA },
      { key: "otras_lenguas", label: "Otras lenguas en las que se expresa", corto: "Otras lenguas", grupo: CENSAL_PERSONA },
      { key: "discapacidad", label: "Discapacidad o limitación permanente", corto: "Discapacidad", tipo: "select", grupo: CENSAL_PERSONA,
        opciones: ["No tengo", "Moverse o caminar, para usar brazos o piernas", "Ver, aun usando anteojos", "Hablar o comunicarse", "Oír, aun usando audífonos", "Entender o aprender", "Relacionarse con los demás"] },
      { key: "provincia", label: "Provincia (domicilio DNI)", corto: "Provincia", grupo: CENSAL_PERSONA },
      { key: "distrito", label: "Distrito (domicilio DNI)", corto: "Distrito", grupo: CENSAL_PERSONA },
      { key: "telefono", label: "Teléfono", valida: "telefono" },
      { key: "email", label: "Email", valida: "email" },
      // "notas" se retiró: era un pozo sin fondo (sin autor, sin fecha y sin
      // avisar a nadie). Lo que hay que decir de una persona va como caso o
      // comentario, que sí deja rastro. La columna sigue en la BD y el
      // buscador aún la lee, así que lo escrito no se pierde.
      // — Identidad: el DNI es la llave para verificar en RENIEC y SUNAT —
      { key: "ruc_dni", label: "DNI (8 dígitos)", corto: "DNI", valida: "dni", grupo: DNI_PERSONA },
      { key: "dni_vencimiento", label: "DNI — fecha de vencimiento", corto: "DNI vence", tipo: "date", grupo: DNI_PERSONA },
      // La pone el botón de RENIEC sola; editable por si se verificó a mano
      // en la web de RENIEC y hay que dejar constancia de cuándo.
      { key: "fecha_verificacion_reniec", label: "Última verificación RENIEC", corto: "Verificado RENIEC", tipo: "date", grupo: DNI_PERSONA },
      // El escaneo del DNI y la firma SON identidad, y el fondo los exige
      { key: "dni_url", label: "DNI escaneado (PDF)", corto: "DNI escaneado", valida: "url", grupo: DNI_PERSONA },
      { key: "firma_url", label: "Firma escaneada", corto: "Firma", valida: "url", grupo: DNI_PERSONA },
      // — SUNAT: el RUC se calcula del DNI; el resto lo trae la verificación —
      { key: "estado_sunat", label: "Estado SUNAT", tipo: "select", opciones: ["activo", "suspension_temporal", "baja_provisional", "baja_definitiva"], grupo: SUNAT_PERSONA },
      { key: "condicion_sunat", label: "Condición SUNAT", tipo: "select", opciones: ["habido", "no_habido"], grupo: SUNAT_PERSONA },
      { key: "fecha_verificacion_sunat", label: "Última verificación SUNAT", corto: "Verificado SUNAT", tipo: "date", grupo: SUNAT_PERSONA },
      // Año, no Sí/No: la suspensión caduca cada 31 de diciembre.
      // La constancia va al lado: el año dice que vale, el PDF lo prueba.
      { key: "suspension_4ta_anio", label: "Suspensión 4ta — año vigente", corto: "Suspensión 4ta", valida: "anio", grupo: SUNAT_PERSONA },
      { key: "suspension_4ta_url", label: "Suspensión 4ta — constancia SUNAT", corto: "Constancia 4ta", valida: "url", grupo: SUNAT_PERSONA },
      // Los CV viven en su propia biblioteca (uno por enfoque), no aquí:
      // un solo cv_url no alcanza cuando se postula con distintos roles.
      { key: "carpeta_drive_url", label: "Carpeta en Drive", corto: "Carpeta Drive", valida: "url", grupo: DOCS_PERSONA },
    ],
  },
};
