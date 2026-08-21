/* ── Los rubros del presupuesto DAFO, por categoría ──
   La Sección D del formulario es una tabla de costos agrupada por RUBRO. Como
   las etapas, los rubros dependen de la categoría del concurso. Hay tres
   presets —Cine Indígena, ficción/documental y videojuego—, cada uno sacado
   del formulario DAFO de su concurso; agregar otra categoría = una lista más
   aquí. Ojo: un ítem cuyo rubro no esté en el preset de su categoría NO se
   pinta (components/Presupuesto.tsx filtra por clave), así que cargar un
   presupuesto y olvidar su preset deja la pantalla vacía sin dar error. */

export type Rubro = { clave: string; nombre: string };

/* ── FICCIÓN Y DOCUMENTAL DE LARGOMETRAJE ──
   Los 32 rubros del formulario de presupuesto DAFO, sacados del expediente
   real de PO-001 · Mujeres del Ande (Plataforma Virtual de Trámites, 2025).
   Cuatro categorías —Gastos generales, Pre producción, Producción, Post
   producción— con sus sub-rubros; los códigos oficiales viven abajo, en
   CATEGORIAS_PRESU_FICCION.

   ── POR QUÉ LAS CLAVES LLEVAN PREFIJO ──
   El formulario repite nombres entre categorías: «LOGÍSTICA» aparece tres
   veces (2.7, 3.11, 4.8) y «PRODUCCIÓN» dos (2.1 y la categoría 3). Son
   rubros DISTINTOS con el mismo rótulo, y una clave compartida los fundiría
   en uno solo al agrupar el informe económico. El prefijo (gen_ / pre_ /
   prod_ / post_) los separa, y de paso evita pisar las claves del preset de
   Cine Indígena — que se resuelven en un mapa global por clave donde gana el
   último, así que un choque renombraría un rubro ajeno sin avisar.

   ── DOS RUBROS QUE NO SON DE LA PLANTILLA ──
   2.8 «Permisos» y 4.9 «Directora responsable del Proyecto» los agregó la
   postulante (el formulario deja añadir filas). Se dejan en el catálogo
   porque sin ellos S/ 46,500 de PO-001 no se pintan; 4.9 se guarda como
   «Responsable del proyecto», sin el género de ese expediente concreto. */
export const RUBROS_FICCION_DOC: Rubro[] = [
  { clave: "gen_seguros_juridicos", nombre: "Seguros, aspectos jurídicos y financieros" },  // 1.1  SEGUROS, ASPECTOS JURÍDICOS Y FINANCIEROS
  { clave: "gen_contables", nombre: "Aspectos contables" },  // 1.2  ASPECTOS CONTABLES
  { clave: "gen_admin_oficina", nombre: "Gastos administrativos y de oficina" },  // 1.3  GASTOS ADMINISTRATIVOS Y DE OFICINA
  { clave: "gen_personal_admin", nombre: "Personal administrativo y servicios" },  // 1.4  PERSONAL ADMINISTRATIVO Y SERVICIOS
  { clave: "pre_produccion", nombre: "Producción (preproducción)" },  // 2.1  PRODUCCIÓN
  { clave: "pre_direccion", nombre: "Dirección y jefes de área" },  // 2.2  DIRECCIÓN Y JEFES DE ÁREA
  { clave: "pre_scouting", nombre: "Scouting de locaciones" },  // 2.3  SCOUTING DE LOCACIONES
  { clave: "pre_casting", nombre: "Casting" },  // 2.4  CASTING
  { clave: "pre_ensayos", nombre: "Ensayos" },  // 2.5  ENSAYOS
  { clave: "pre_pruebas_camara", nombre: "Pruebas de cámara" },  // 2.6  PRUEBAS DE CÁMARA
  { clave: "pre_logistica", nombre: "Logística (preproducción)" },  // 2.7  LOGÍSTICA
  { clave: "pre_permisos", nombre: "Permisos" },  // 2.8  Permisos
  { clave: "prod_direccion", nombre: "Personal dirección" },  // 3.1  PERSONAL DIRECCIÓN
  { clave: "prod_produccion", nombre: "Personal producción" },  // 3.2  PERSONAL PRODUCCIÓN
  { clave: "prod_personajes", nombre: "Personajes" },  // 3.3  PERSONAJES
  { clave: "prod_fotografia", nombre: "Personal departamento de fotografía" },  // 3.4  PERSONAL DEPARTAMENTO DE FOTOGRAFÍA
  { clave: "prod_arte", nombre: "Personal departamento de arte" },  // 3.5  PERSONAL DEPARTAMENTO DE ARTE
  { clave: "prod_sonido", nombre: "Personal departamento de sonido" },  // 3.6  PERSONAL DEPARTAMENTO DE SONIDO
  { clave: "prod_equipo_rodaje", nombre: "Equipo de rodaje, accesorios y materiales" },  // 3.7  EQUIPO DE RODAJE, ACCESORIOS Y MATERIALES
  { clave: "prod_materiales_arte", nombre: "Materiales de arte, escenografía, utilería, maquillaje y vestuario" },  // 3.8  MATERIALES DE ARTE, ESCENOGRAFÍA, UTILERÍA, MAQUILLAJE Y VESTUARIO
  { clave: "prod_materiales_sonido", nombre: "Materiales de sonido" },  // 3.9  MATERIALES DE SONIDO
  { clave: "prod_locaciones", nombre: "Locaciones" },  // 3.10  LOCACIONES
  { clave: "prod_logistica", nombre: "Logística (rodaje)" },  // 3.11  LOGÍSTICA
  { clave: "post_edicion", nombre: "Edición" },  // 4.1  EDICIÓN
  { clave: "post_laboratorio", nombre: "Laboratorio" },  // 4.2  LABORATORIO
  { clave: "post_finalizacion", nombre: "Finalización" },  // 4.3  FINALIZACIÓN
  { clave: "post_entrega", nombre: "Entrega (película y tráiler)" },  // 4.4  ENTREGA (incluye película y tráiler)
  { clave: "post_sonido", nombre: "Sonido (película y tráiler)" },  // 4.5  SONIDO (incluye película y tráiler)
  { clave: "post_musica", nombre: "Música" },  // 4.6  MÚSICA
  { clave: "post_trailer", nombre: "Tráiler" },  // 4.7  TRAILER
  { clave: "post_logistica", nombre: "Logística (postproducción)" },  // 4.8  LOGÍSTICA
  { clave: "post_responsable", nombre: "Responsable del proyecto" },  // 4.9  Directora responsable del Proyecto
];

export const RUBROS_POR_CATEGORIA: Record<string, Rubro[]> = {
  /* Video y Cine Indígena: los 9 rubros del presupuesto DAFO (2 categorías →
     9 sub-rubros), sacados del presupuesto real de Mujunakuy. Son los que
     clasifican cada gasto/RHE para el informe económico. */
  "Video y Cine Indígena": [
    { clave: "juridicos_financieros", nombre: "Aspectos jurídicos y financieros" },
    { clave: "contables_admin", nombre: "Aspectos contables y administrativos" },
    { clave: "admin_oficina", nombre: "Gastos administrativos y de oficina" },
    { clave: "formativo", nombre: "Aspecto formativo" },
    { clave: "recursos_tecnicos", nombre: "Recursos técnicos" },
    { clave: "equipo_proyecto", nombre: "Equipo del proyecto" },
    { clave: "diseno", nombre: "Diseño" },
    { clave: "logistica", nombre: "Logística" },
    { clave: "socializacion", nombre: "Socialización de resultados" },
  ],
  /* Las dos categorías DAFO que usan el formulario de presupuesto de ficción
     y documental de largometraje. Comparten lista a propósito: es el MISMO
     formulario, y dos copias se desincronizarían el día que DAFO cambie un
     rubro. Si alguna vez divergen de verdad, se separan entonces. */
  "Producción audiovisual": RUBROS_FICCION_DOC,
  "Documental": RUBROS_FICCION_DOC,
  "Videojuego": [
    { clave: "gastos_generales", nombre: "Gastos generales" },
    { clave: "aspectos_admin", nombre: "Aspectos contables y administrativos" },
    { clave: "desarrollo_conceptual", nombre: "Desarrollo conceptual" },
    { clave: "diseno", nombre: "Diseño" },
    { clave: "programacion", nombre: "Programación" },
    { clave: "pruebas", nombre: "Pruebas de prototipo con usuarios" },
    { clave: "licencias", nombre: "Licencias" },
  ],
};

/* Genérico, para categorías que aún no tienen su preset. */
export const RUBROS_DEFAULT: Rubro[] = [
  { clave: "gastos_generales", nombre: "Gastos generales" },
  { clave: "honorarios", nombre: "Honorarios" },
  { clave: "produccion", nombre: "Producción" },
  { clave: "postproduccion", nombre: "Postproducción" },
];

export function rubrosDe(categoria?: string | null): Rubro[] {
  return (categoria && RUBROS_POR_CATEGORIA[categoria]) || RUBROS_DEFAULT;
}

/* ── La codificación jerárquica DAFO (categoría 1 · rubro 1.1 · ítem 1.1.1) ──
   El formato oficial agrupa los rubros en 2 CATEGORÍAS, cada una con su código
   y su total. Aquí vive ese árbol para el audiovisual (Cine Indígena). Si un
   rubro no está en el árbol (videojuego, genéricos), no tiene categoría y la
   tabla lo muestra plano. */
export type CatPresu = { cod: string; nombre: string; rubros: { clave: string; cod: string }[] };
export const CATEGORIAS_PRESU_AUDIOVISUAL: CatPresu[] = [
  { cod: "1", nombre: "GASTOS GENERALES (todas las etapas)", rubros: [
    { clave: "juridicos_financieros", cod: "1.1" },
    { clave: "contables_admin", cod: "1.2" },
    { clave: "admin_oficina", cod: "1.3" },
  ] },
  { cod: "2", nombre: "DESARROLLO DEL PROYECTO", rubros: [
    { clave: "formativo", cod: "2.1" },
    { clave: "recursos_tecnicos", cod: "2.2" },
    { clave: "equipo_proyecto", cod: "2.3" },
    { clave: "diseno", cod: "2.4" },
    { clave: "logistica", cod: "2.5" },
    { clave: "socializacion", cod: "2.6" },
  ] },
];

/* El mismo árbol para el formulario de FICCIÓN Y DOCUMENTAL, que trae cuatro
   categorías en vez de dos. Claves con prefijo — ver RUBROS_POR_CATEGORIA. */
export const CATEGORIAS_PRESU_FICCION: CatPresu[] = [
  { cod: "1", nombre: "GASTOS GENERALES (todas las etapas)", rubros: [
    { clave: "gen_seguros_juridicos", cod: "1.1" },
    { clave: "gen_contables", cod: "1.2" },
    { clave: "gen_admin_oficina", cod: "1.3" },
    { clave: "gen_personal_admin", cod: "1.4" },
  ] },
  { cod: "2", nombre: "PRE PRODUCCIÓN", rubros: [
    { clave: "pre_produccion", cod: "2.1" },
    { clave: "pre_direccion", cod: "2.2" },
    { clave: "pre_scouting", cod: "2.3" },
    { clave: "pre_casting", cod: "2.4" },
    { clave: "pre_ensayos", cod: "2.5" },
    { clave: "pre_pruebas_camara", cod: "2.6" },
    { clave: "pre_logistica", cod: "2.7" },
    { clave: "pre_permisos", cod: "2.8" },
  ] },
  { cod: "3", nombre: "PRODUCCIÓN", rubros: [
    { clave: "prod_direccion", cod: "3.1" },
    { clave: "prod_produccion", cod: "3.2" },
    { clave: "prod_personajes", cod: "3.3" },
    { clave: "prod_fotografia", cod: "3.4" },
    { clave: "prod_arte", cod: "3.5" },
    { clave: "prod_sonido", cod: "3.6" },
    { clave: "prod_equipo_rodaje", cod: "3.7" },
    { clave: "prod_materiales_arte", cod: "3.8" },
    { clave: "prod_materiales_sonido", cod: "3.9" },
    { clave: "prod_locaciones", cod: "3.10" },
    { clave: "prod_logistica", cod: "3.11" },
  ] },
  { cod: "4", nombre: "POST PRODUCCIÓN", rubros: [
    { clave: "post_edicion", cod: "4.1" },
    { clave: "post_laboratorio", cod: "4.2" },
    { clave: "post_finalizacion", cod: "4.3" },
    { clave: "post_entrega", cod: "4.4" },
    { clave: "post_sonido", cod: "4.5" },
    { clave: "post_musica", cod: "4.6" },
    { clave: "post_trailer", cod: "4.7" },
    { clave: "post_logistica", cod: "4.8" },
    { clave: "post_responsable", cod: "4.9" },
  ] },
];

/* Meta de un rubro: su código y la categoría a la que pertenece. Null si el
   rubro no está en ningún árbol conocido (se muestra plano). */
export type RubroMeta = { rubroCod: string; catCod: string; catNombre: string };
const RUBRO_META: Record<string, RubroMeta> = {};
/* Los dos árboles, en un solo mapa por clave. Funciona porque ninguna clave se
   repite entre ellos (las de ficción llevan prefijo justo para eso): si alguna
   se repitiera, el último árbol le cambiaría el código al rubro del primero y
   la tabla lo pintaría bajo la categoría equivocada, sin error. */
for (const arbol of [CATEGORIAS_PRESU_AUDIOVISUAL, CATEGORIAS_PRESU_FICCION])
  for (const c of arbol)
    for (const r of c.rubros)
      RUBRO_META[r.clave] = { rubroCod: r.cod, catCod: c.cod, catNombre: c.nombre };
export const metaRubro = (clave: string): RubroMeta | null => RUBRO_META[clave] || null;

const TODOS = [...Object.values(RUBROS_POR_CATEGORIA).flat(), ...RUBROS_DEFAULT];
export const nombreRubro = (clave: string) =>
  TODOS.find(r => r.clave === clave)?.nombre || (clave || "").replace(/_/g, " ");

export const ESTADOS_FUENTE = ["Confirmada", "Por confirmar"];

/* El estímulo del Ministerio no puede exceder el 70% del costo total del
   proyecto (Bases CDV, art. 24 del Reglamento). El resto es contrapartida.
   PERO esa regla es de VIDEOJUEGOS: otras categorías (Cine Indígena, etc.)
   admiten estímulo del 100% sin contrapartida. Por eso el tope depende de la
   categoría; `TOPE_ESTIMULO` queda como el default de videojuego. */
export const TOPE_ESTIMULO = 0.70;
export const topeEstimuloDe = (categoria?: string | null): number =>
  categoria === "Videojuego" ? 0.70 : 1.0;

/* La forma de lo que se guarda en postulaciones.presupuesto (jsonb). */
export type ItemPre = {
  id: string; rubro: string; concepto: string; unidad: string;
  cantidad: number; costo_unit: number;
  /* Cuánto de este ítem lo cubre OTRA fuente (contrapartida). Lo demás lo
     cubre el estímulo: por defecto 0 = ítem íntegramente financiado con el
     estímulo, y el medidor del 70% avisa cuando falta contrapartida. */
  otras: number;
};
export type FuentePre = { id: string; fuente: string; pais: string; estado: string; importe: number };
export type Presupuesto = { tipo_cambio: number; items: ItemPre[]; fuentes: FuentePre[] };
