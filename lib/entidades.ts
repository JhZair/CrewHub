/* Configuración de mantenimiento de entidades núcleo.
   Compartida por el formulario (cliente) y la acción (servidor,
   como whitelist de tablas y campos). */
import { CATEGORIAS_OPC } from "@/lib/etapas";
import { ESTADOS_ELEGIBLES } from "@/lib/estadosEquipo";
import { ETAPAS_KEYS_POR_TIPO } from "@/lib/etapasProyecto";
import { PROVINCIAS_POR_DEPARTAMENTO, DISTRITOS_POR_PROVINCIA } from "@/lib/ubigeo";

export type CampoDef = {
  key: string;
  label: string;
  tipo?: "text" | "select" | "textarea" | "date" | "color" | "bool";
  opciones?: string[];
  /** Cómo rotular el valor ACTUAL cuando no está entre las opciones. Por
   *  defecto el formulario dice «(valor actual)», que es lo correcto para un
   *  dato migrado —no se sabe más de él—. Pero un valor puede quedar fuera de
   *  la lista por ser legítimo y no ponerse a mano: «en uso» lo decide el
   *  préstamo. Ahí «(valor actual)» suena a resto de migración, o sea a algo
   *  que hay que limpiar, cuando es justo lo que no hay que tocar. */
  explicaActual?: Record<string, string>;
  requerido?: boolean;
  auto?: boolean;       // lo genera el sistema; solo lectura (folios inmutables)
  verif?: boolean;      // lo llena la verificación automática (RENIEC/SUNAT); solo lectura
  soloEditar?: boolean; // se oculta al crear; solo aparece editando (ej. presupuesto vigente)
  opcional?: boolean;   // no cuenta para la completitud de la ficha (dato circunstancial)
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

/* Completitud de una ficha: qué proporción de sus campos están llenos. Cuenta
   solo los que APLICAN (una cobertura no necesita RENCA) y descarta los
   autogenerados (folios). Los `verif` (RENIEC/SUNAT) sí cuentan: una ficha con
   su verificación al día está más completa que una sin ella. `faltan` lista los
   vacíos, para el tooltip. */
export function completitud(tipo: string, valores: Record<string, any>) {
  const conf = FORM_CONF[tipo];
  if (!conf) return { llenos: 0, total: 0, pct: 0, faltan: [] as string[] };
  const rel = conf.campos.filter(c => !c.auto && !c.opcional && campoAplica(c, valores));
  const lleno = (c: CampoDef) => {
    const v = valores[c.key];
    if (c.tipo === "bool") return v === true || v === false;   // un «No» es una respuesta
    return v != null && String(v).trim() !== "";
  };
  const total = rel.length;
  const llenos = rel.filter(lleno).length;
  const faltan = rel.filter(c => !lleno(c)).map(nombreCorto);
  return { llenos, total, pct: total ? Math.round((llenos / total) * 100) : 0, faltan };
}

/* Nombre breve de un campo para la bitácora: usa `corto` si existe; si no,
   recorta la etiqueta en el guion largo y quita los paréntesis explicativos.
   "RENCA — N° de registro (obligatorio...)" → "RENCA" */
export function nombreCorto(c: { label: string; corto?: string }): string {
  return c.corto || c.label.split("—")[0].replace(/\([^)]*\)/g, "").trim();
}

/* Bloques de campos agrupados en el formulario, cada uno con su tono:
   ámbar = importa, pero no bloquea el alta.
   azul  = lo llena la verificación automática; no se edita a mano. */
export const DOCS_EMPRESA = "📜 Documentos registrales — SUNARP: partida, RENCA, vigencia de poder";
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

/* Los «equipos» a los que puede pertenecer una persona: el ÁREA del crew en la
   que trabaja. Una sola fuente: la usa el combo del formulario Y los chips del
   filtro en /personas, para que al sumar una nueva aparezca sola en los dos
   sitios. OJO: «actor social» NO va aquí —no es un área del crew, es una clase
   de relación, y por eso vive en el eje `tipo` (ver campo tipo de persona). */
export const EQUIPOS_PERSONA = ["creativo", "tecnico", "artistico", "administrativo"];

/* ══════════ QUÉ CLASE DE EQUIPO ES ══════════
 *
 * La lista vieja tenía tres solapamientos y cinco huérfanas.
 *
 * SOLAPAMIENTOS — categorías que eran subcategorías de otra:
 *   · «tripode» y «monopod» dentro de «soporte»
 *   · «audio» y «grabadora portátil» dentro de lo que ahora es «sonido»
 *   · «pc_accesorios» dentro de «cómputo»
 * Cuando una categoría es hija de otra, el mismo objeto puede caer en las
 * dos y cada quien elige distinta: buscar «trípode» deja fuera la mitad.
 *
 * HUÉRFANAS — `soporte`, `tripode`, `audio`, `grabadora portátil` y
 * `monopod` estaban en los DATOS pero no en el desplegable: entraron por la
 * importación del CSV. El formulario las conserva —las enseña como «(valor
 * actual)», que para eso está— pero no se le podían poner a un equipo
 * nuevo. Así el inventario acababa con dos vocabularios: el que se importó
 * y el que se escribe hoy, y ninguna búsqueda cubría los dos.
 *
 * La regla para mantener esto: una categoría dice QUÉ ES la cosa, no qué
 * hace ni de qué marca es. Si una candidata cabe dentro de otra, es una
 * subcategoría. Y si «otro» crece, es que falta una categoría —no que haga
 * falta un cajón más grande—.
 */
export const CATEGORIAS_EQUIPO = [
  "cámara", "drone", "sonido", "iluminación", "soporte",
  "energía", "cómputo", "producción", "camping", "otro",
];

/** Qué es cada una, para el que duda entre dos. */
export const AYUDA_CATEGORIA: Record<string, string> = {
  "cámara": "Lo que capta la imagen y lo que va pegado a ella: cuerpos, ópticas, filtros, jaulas, memorias.",
  "drone": "La aeronave y lo suyo. Aparte de cámara porque vuela, se registra y se le cae encima la normativa.",
  "sonido": "Todo lo que capta o escucha: micros, grabadoras, audífonos, caña, cables.",
  "iluminación": "Lo que da o modela la luz, y lo que la sostiene.",
  "soporte": "Lo que va entre la cámara y algo: trípodes, gimbals, placas, brazos, ventosas, arneses de cámara. Si se lleva puesto pero carga cosas de la persona (cinturón, chaleco), es producción.",
  "energía": "Lo que da corriente: baterías, power banks, cargadores, extensiones, paneles solares.",
  "cómputo": "Lo que procesa o guarda material, y lo que se le conecta.",
  "producción": "Lo que hace posible el rodaje sin grabar: radios, claqueta, cases, gaffer, y lo que el equipo lleva puesto para cargar (cinturón, chaleco, pouches).",
  "camping": "Lo que permite dormir y trabajar en el campo, a 4.000 m: carpa, cocina, frontal, botiquín de altura.",
  "otro": "Provisional. Si algo lleva meses aquí, es que falta una categoría.",
};

/* Subcategorías sugeridas según la categoría del equipo. Son SUGERENCIAS: el
   campo es editable, porque el inventario siempre trae algo que ninguna lista
   previó.
   Que sea editable no las hace prescindibles: si cada quien escribe lo suyo,
   el mismo estuche acaba como «Estuche de baterías», «estuche baterias» y
   «case de pilas», y ninguna búsqueda encuentra los tres.

   ── LOS ESTUCHES ──
   Un estuche aparece en casi todas las categorías —de cámara, de drone, de
   luces, de baterías— y eso no es un problema que resolver: el estuche
   pertenece a LO QUE PROTEGE, no a una categoría «estuches». Una categoría
   así cruzaría todas las demás y volvería a poner el mismo objeto en dos
   sitios, que es justo lo que esta lista vino a quitar. */
export const SUBCATS_EQUIPO: Record<string, string[]> = {
  "cámara": ["Cuerpo de cámara", "Cámara de acción", "Cámara de bolsillo (Pocket / Nano)",
    "Cámara 360", "Lente", "Filtro ND", "Jaula / Rig", "Monitor externo",
    "Memoria SD / CFexpress", "Batería de cámara", "Cargador de cámara",
    "Estuche de baterías / memorias", "Celular / Smartphone", "Visor / Loupe",
    /* La mochila va aparte del case rígido y no dentro de «Mochila / Case» de
       producción: cada categoría ya se queda con su propio transporte —hay
       «Case de drone» y «Case de luces»—, porque lo que decide dónde buscas
       es qué vas a meter dentro. La de producción es la genérica, la del
       asistente con las claquetas y el gaffer. */
    "Mochila de cámara", "Case de cámara"],
  "drone": ["Drone", "Batería de drone", "Hélices", "Control remoto", "Hub de carga",
    "Filtros de drone", "Estuche de baterías", "Case de drone",
    /* Con la que se CARGA, al lado de la que lo guarda. El case protege en el
       almacén; la mochila es para subir el cerro con el drone a la espalda, y
       hoy esa la haces con una bolsa de gimnasio (A-242). */
    "Mochila de drone", "Antena / Repetidor",
    /* Lo que se despliega EN EL SUELO para volar. No es «case» —no guarda
       nada— ni «producción»: sin pista, en tierra suelta de altura, el drone
       levanta polvo y se traga piedras en los motores. Es equipo de vuelo.
       «Pista de aterrizaje» y no «helipuerto» ni «landing pad»: es como lo
       tienes escrito en la ficha A-070, y manda la palabra que ya se usa. */
    "Pista de aterrizaje"],
  "sonido": ["Micrófono corbatero", "Micrófono de cañón", "Micrófono inalámbrico",
    /* El RECEPTOR no es un micrófono: no captura nada. Y en un sistema
       inalámbrico se registra como unidad aparte —el transmisor DJI Mic 2 ya
       es la A-262— porque se pierde, se descarga y se queda en otro bolso por
       su cuenta. Sin subcategoría propia caía en «Micrófono inalámbrico», y
       entonces el filtro decía cuatro micros cuando hay dos micros y dos
       receptores: el número servía para todo menos para saber a cuántas
       personas puedes sonorizar. */
    "Receptor inalámbrico",
    "Micrófono de mano", "Grabadora de audio", "Mezcladora", "Audífonos",
    "Caña / Boom pole", "Zeppelin / Paravientos", "Cable XLR", "Adaptador de audio",
    "Pilas / Batería de sonido"],
  /* Ordenada por lo que hace cada cosa: primero lo que EMITE, luego lo que
     MODIFICA esa luz, y al final lo que la sostiene, la alimenta y la
     guarda. Buscar una luz y buscar una bandera son dos momentos distintos
     del mismo día. */
  "iluminación": [
    // Emiten
    /* El COB es un punto de luz con montura Bowens, y eso NO es un panel: un
       panel trae su difusión de fábrica y se usa tal cual; un COB no da luz
       utilizable sin ponerle algo delante —reflector, softbox, domo—. Meter
       la Molus G60 en «Panel LED» borraría justo lo que decide si sirve para
       un plano: si acepta modificadores. */
    "Luz COB / Foco LED", "Panel LED", "Luz de mano / Tubo", "Aro de luz",
    // Modifican
    "Softbox", "Fresnel", "Reflector / Rebotador", "Bandera / Difusor", "Gelatinas",
    /* Lo que une el COB con el modificador. Es una pieza suelta que se pierde
       y sin la cual la softbox de 300 soles no se puede montar: merece
       nombre propio, no caer en «otro». */
    "Montura / Adaptador Bowens",
    // Sostienen, alimentan y guardan
    "Trípode de luz", "Batería de luz",
    /* El cargador de la NP-F, que faltaba. Era una asimetría de la lista, no
       una decisión: `cámara` tiene «Batería de cámara» Y «Cargador de
       cámara», `drone` tiene la batería Y el hub de carga, y aquí estaba la
       batería sola. Va en iluminación y no en el «Cargador» de energía por lo
       mismo que cada categoría se queda con el suyo: al armar las luces se
       piensa en luces, y un cargador de NP-F escondido entre nueve cargadores
       genéricos no aparece cuando hace falta.
       «Cargador de batería» a secas —no «de luz»— porque es como está escrito
       en la A-103, y aquí dentro no hace falta repetir la categoría. */
    "Cargador de batería", "Case de luces"],
  /* Absorbe «tripode», «monopod» y lo que ya estaba en «soporte». La placa
     Claw Mini, la gorra con soporte y la pértiga del Osmo son todas esto. */
  "soporte": ["Trípode", "Monopié", "Cabezal / Rótula", "Estabilizador / Gimbal",
    "Slider / Dolly", "Grúa / Jib",
    /* Lo que agarra una PERSONA. Va en soporte y no en «Jaula / Rig» (que es
       de cámara) porque la jaula se vuelve parte del cuerpo de la cámara y el
       mango es como se sostiene —que es de lo que trata esta categoría
       entera, del trípode al arnés—. Además se compra y se pierde solo: un
       mango NATO sirve en cualquier jaula, y por eso es una unidad, no un
       detalle de otra. */
    "Mango / Empuñadura", "Riel NATO",
    "Brazo mágico", "Placa de liberación rápida",
    /* Al lado de la placa: las dos son la interfaz pequeña por la que una
       cosa se engancha a otra, y quien busca una busca la otra.
       Se llama «Zapata» a secas, sin «/ Cold shoe», por dos razones. La
       regla de este archivo es que manda la palabra que el equipo ya usa, y
       es la que está escrita en la A-244. Y como coincide EXACTA, los que ya
       estaban clasificados dejan de contar como escritos a mano solos: sin
       sql, sin migración y sin que el mismo tipo de pieza quede repartido
       entre el nombre viejo y el nuevo. */
    "Zapata",
    /* «cuello» en el nombre y no solo «cabeza / pecho»: el TELESIN es un
       soporte de CUELLO con correa al pecho, y quien lo busca escribe la
       palabra que tiene en la mano. Una subcategoría que existe pero no se
       llama como la cosa es una que nadie encuentra. Los que ya estaban
       clasificados se migran en db/subcats-soporte-cuello.sql. */
    "Soporte de cabeza / cuello / pecho", "Arnés / Chest rig de cámara",
    /* El soporte NO es el teléfono. «Celular / Smartphone» (en cámara) es el
       aparato que graba; esto es el fierro que lo sujeta —pinza, jaula de
       smartphone, montura de cuello—. Meterlos juntos hacía que buscar
       «celular» devolviera el teléfono y sus cinco accesorios revueltos. */
    "Soporte / pinza de celular", "Ventosa / Clamp",
    "Pértiga / Extension rod", "Selfie stick", "Saco de arena / Contrapeso"],
  /* Tres entradas nuevas que salieron de mirar los «escritos a mano»: ocho
     equipos de energía repartidos entre «Eléctrica» y «Adaptador». «Eléctrica»
     es otro «Luz Continua» —abarca la categoría entera, así que no separa
     nada— y «Adaptador» existía en cómputo pero no aquí, que es donde estaban
     las fuentes. */
  "energía": ["Batería V-Mount", "Power bank",
    /* «Cargador» queda para el de UN aparato: el de la cámara, el de la
       radio. La estación multipuerto es otra cosa y otra decisión —es la que
       se lleva al hotel para dejar cargando doce cosas de noche, y de esas
       hay tres—. Con un solo nombre para las dos, «cargador · 9» no contesta
       ni cuántas cámaras puedo cargar ni cuántas mesas de carga tengo. */
    "Cargador", "Estación de carga USB",
    /* La fuente que ALIMENTA un aparato mientras trabaja, no que carga una
       batería: el AD-17 del Zoom, el Olead. Se confunde con «Cargador» y no
       es lo mismo — si se queda en la oficina, la grabadora no funciona
       aunque tenga pilas nuevas, y quien la busca la busca por su aparato. */
    "Fuente / Adaptador de corriente",
    "Pilas AA / AAA", "Estuche de baterías", "Extensión eléctrica", "Regleta",
    /* Aparte de la regleta: una regleta multiplica enchufes, un supresor
       PROTEGE. En un pueblo con la red inestable, enchufar el PC de edición a
       una regleta cualquiera creyendo que está protegido es el error que
       cuesta el equipo. Que sean dos nombres es lo que obliga a mirar cuál se
       está llevando. */
    "Supresor de picos", "Generador",
    "Panel solar", "Inversor", "Estabilizador de corriente"],
  /* Absorbe «pc_accesorios»: un lector de memorias y el disco donde va el
     material son la misma cadena, y partirlos obliga a buscar en dos sitios. */
  "cómputo": ["Laptop", "PC de edición", "Tableta", "Monitor",
    /* Donde se VE lo que se hizo. Va aquí, junto al monitor y el cable HDMI,
       porque cierra la misma cadena que esta categoría ya cuenta: el material
       sale de la memoria, pasa por el disco, se edita y se proyecta. En
       producción no encaja —lo de producción es lo que solo sirve en rodaje—
       y una proyección comunitaria no es un rodaje: es el día que la película
       vuelve al sitio donde se filmó.
       Con la pantalla al lado, que se guarda aparte, se presta aparte y se
       olvida aparte: llegar a una comunidad con el proyector y sin ecrán es
       la clase de error que solo evita contarlos por separado. */
    "Proyector", "Pantalla / Ecrán",
    "Disco duro externo",
    "SSD", "NAS / Servidor", "Lector de memorias", "Hub USB", "Teclado", "Mouse",
    "Cable HDMI", "Adaptador", "Tableta gráfica", "Router / Red"],
  /* Sin «mesa plegable», «silla», «toldo» ni «paraguas»: eso es camping, y
     tenerlo en los dos sitios es volver a crear el solapamiento que esta
     lista viene a quitar. Aquí queda lo que solo tiene sentido en un rodaje.

     ── LO QUE SE LLEVA PUESTO ──
     Un cinturón MOLLE, un chaleco de carga o unas rodilleras se llevan
     encima, igual que un chest rig, y aun así NO son `soporte`. La línea es
     qué sostienen: si va entre la cámara y algo —placa, gorra con soporte,
     arnés de pecho— es soporte; si va sobre el cuerpo para cargar lo que la
     persona necesita a mano, es producción. Sin esa línea, «soporte» se
     convierte en «todo lo que se sujeta a algo», que es casi el inventario
     entero. */
  "producción": ["Claqueta", "Radio walkie-talkie", "Mochila / Case", "Maleta rígida",
    "Carrito / Transporte", "Cinturón / arnés de carga", "Pouch / bolsillo modular",
    "Chaleco / Identificación", "Rodilleras / protección",
    "Cinta / Gaffer", "Herramientas", "Botiquín", "Señalética",
    "Pizarra / Plan de rodaje"],
  /* Rodar a 4.000 m no es rodar en un set con carpa: es dormir arriba. Por eso
     va aparte de «producción» —lo de producción se guarda en la oficina; esto
     se revisa antes de cada subida, y que falte una bolsa de dormir no es una
     incomodidad—.
     La lista se ORDENA por lo que se hace con cada cosa (dormir, comer, dar
     sombra, alumbrar, aguantar la altura) y no alfabéticamente: así se lee
     como una lista de empaque antes de subir, que es cuando se usa.
     Y cubre lo que ya tienes y estaba cayendo en «producción»: mesas de
     campamento, el Sport-Brella, el toldo de playa, los LED Consciot, las
     luces telescópicas y las cajas organizadoras. */
  "camping": [
    // Dormir
    "Carpa", "Bolsa de dormir", "Colchoneta / Aislante", "Manta térmica",
    // Sombra, lluvia y frío
    "Toldo / Sombra", "Sombrilla / Parasol", "Poncho de lluvia", "Guantes / Abrigo",
    // Cocina y agua
    "Cocina de campo", "Balón de gas", "Termo", "Menaje de campo",
    "Bidón / Agua", "Filtro de agua",
    // Muebles y carga
    "Mesa de campo", "Silla de campo", "Caja organizadora", "Mochila de trekking",
    // Luz
    "Luz de campamento", "Linterna / Frontal", "Farol recargable",
    // Altura y seguridad
    "Botiquín de altura", "Oxígeno / Soroche", "Bloqueador solar",
    "GPS / Radio satelital", "Botas", "Cuerda / Driza", "Estacas / Martillo"],
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

/* El ciclo de vida de una CONVOCATORIA (la cancha), distinto del de una
   postulación y del de un fondo. Planificada → Abierta → En evaluación → Con
   resultados → Finalizada, con «Cancelada» como salida. En un solo sitio:
   la usan la lista, la ficha, el ícono del historial y el stepper editable. */
export const EST_CONVOCATORIA: Record<string, { label: string; color: string; ico: string }> = {
  planificada:    { label: "Planificada",    color: "var(--dim)",    ico: "📅" },
  abierta:        { label: "Abierta",         color: "var(--green)",  ico: "📣" },
  en_evaluacion:  { label: "En evaluación",   color: "var(--yellow)", ico: "⚖️" },
  con_resultados: { label: "Con resultados",  color: "var(--violet)", ico: "🏆" },
  finalizada:     { label: "Finalizada",      color: "var(--dim)",    ico: "🏁" },
  cancelada:      { label: "Cancelada",       color: "var(--red)",    ico: "🚫" },
};
/* La carrera (sin la salida «cancelada»), en orden. */
export const PASOS_CONVOCATORIA = ["planificada", "abierta", "en_evaluacion", "con_resultados", "finalizada"];

/* Color de IDENTIDAD por TIPO de entidad — para distinguirlas de un vistazo
   (tinte de la cabecera de la ficha, fondo tenue de los bloques del buscador…).
   Una sola fuente: la usan la ficha de entidad Y el buscador general, para que
   el azul de «persona» o el naranja de «equipamiento» sean el mismo en todos
   lados. Distinto de TIPO_COLOR (que colorea el tipo de un PROYECTO) y de los
   colores de estado de un caso: son tres ejes de color separados. */
export const COLOR_ENTIDAD: Record<string, string> = {
  proyecto: "var(--violet)",
  empresa: "var(--teal)",
  persona: "var(--blue)",
  convocatoria: "var(--yellow)",
  postulacion: "var(--green)",
  equipamiento: "#ff8c42",
  /* Ámbar apagado: emparentado con el naranja del equipo —una compra es de
     dónde vino un equipo— pero distinto, para que el ojo no los confunda. */
  compra: "#d99a3f",
  lugar: "#ec4899",
  etiqueta: "var(--dim)",
};

/* Color por tipo de proyecto — el mismo en todo el sistema */
export const TIPO_COLOR: Record<string, string> = {
  documental: "#2dd4bf",   // teal
  animacion: "#ec4899",    // rosa
  videojuego: "#38bdf8",   // azul eléctrico / cian (propio; distinto del azul de persona)
  ficcion: "#a78bfa",      // violeta
  experimental: "#f4b400",     // ámbar
  gestion_cultural: "#2ecc71", // verde
  cobertura: "#f59e0b",        // naranja
};

/* Helpers de color de identidad — fuente única. Nada debe hardcodear el hex de
   una entidad o un tipo de proyecto: se pide por aquí, así el día que se ajusta
   la paleta cambia en un solo sitio y el ojo ve el mismo color en toda la app.
   (El tipo de CASO tiene su propio `colorTipo` en lib/tipos.) */
export const colorEntidad = (tipo?: string | null) =>
  COLOR_ENTIDAD[String(tipo ?? "")] || "var(--dim)";
export const colorTipoProyecto = (tipo?: string | null) =>
  TIPO_COLOR[String(tipo ?? "")] || "var(--dim)";

export const REGIONES = [
  "Amazonas", "Áncash", "Apurímac", "Arequipa", "Ayacucho", "Cajamarca",
  "Callao", "Cusco", "Huancavelica", "Huánuco", "Ica", "Junín",
  "La Libertad", "Lambayeque", "Lima", "Loreto", "Madre de Dios",
  "Moquegua", "Pasco", "Piura", "Puno", "San Martín", "Tacna", "Tumbes", "Ucayali",
];

/* Lenguas para el multiselect «otras lenguas en las que se expresa» (censo
   DAFO). No es cerrado: el campo permite escribir otra que no esté en la lista. */
export const LENGUAS = [
  "Castellano", "Quechua", "Aimara", "Ashaninka", "Awajún (Aguaruna)",
  "Shipibo-Konibo", "Shawi", "Matsigenka", "Achuar", "Kukama-Kukamiria",
  "Wampis", "Yanesha", "Inglés", "Portugués", "Francés",
  "Otra lengua originaria", "Lengua de señas peruana",
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
      { key: "relacion", label: "Relación (nuestro, de un aliado o externo)", corto: "Relación", tipo: "select", opciones: ["propia", "aliada", "externa"] },
      /* La etapa (el ciclo de vida macro del proyecto) depende del TIPO: un
         documental estrena en festivales y se distribuye; un videojuego
         prototipa, lanza y hace post-lanzamiento; una gestión cultural formula,
         ejecuta y cierra. Las opciones salen de lib/etapasProyecto según el tipo
         elegido (sugerenciasPor), la misma fuente que pinta el stepper. */
      { key: "etapa", label: "Etapa", tipo: "select",
        sugerenciasPor: { campo: "tipo", mapa: ETAPAS_KEYS_POR_TIPO } },
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
      /* La reserva regional del DAFO (media convocatoria para empresas fuera de
         Lima Metrop. y Callao) se decide con «Región donde opera» —una sola
         fuente—: ya no hay tres campos SUNARP/SUNAT separados. */
      // — SUNAT: el RUC es la llave, y lo demás lo trae la verificación.
      //   La ficha RUC en PDF se retiró: se consulta en vivo en SUNAT (el
      //   PDF guardado se desactualizaba y engañaba). —
      { key: "ruc", label: "RUC (11 dígitos)", valida: "ruc", grupo: SUNAT_EMPRESA },
      { key: "domicilio_fiscal", label: "Domicilio fiscal", grupo: SUNAT_EMPRESA },
      /* El domicilio fiscal desglosado, como lo pide la plataforma DAFO:
         Departamento · Provincia · Distrito. */
      { key: "departamento_fiscal", label: "Departamento (domicilio fiscal)", corto: "Departamento fiscal", tipo: "select", opciones: REGIONES, grupo: SUNAT_EMPRESA },
      // Provincia y distrito son combos que dependen del de arriba: al elegir
      // departamento, la provincia ofrece las suyas; y el distrito, las de la
      // provincia. (Ubigeo del Perú, lib/ubigeo.)
      { key: "provincia_fiscal", label: "Provincia (domicilio fiscal)", corto: "Provincia fiscal", grupo: SUNAT_EMPRESA,
        tipo: "select", sugerenciasPor: { campo: "departamento_fiscal", mapa: PROVINCIAS_POR_DEPARTAMENTO } },
      { key: "distrito_fiscal", label: "Distrito (domicilio fiscal)", corto: "Distrito fiscal", grupo: SUNAT_EMPRESA,
        tipo: "select", sugerenciasPor: { campo: "provincia_fiscal", mapa: DISTRITOS_POR_PROVINCIA } },
      { key: "estado_sunat", label: "Estado SUNAT", tipo: "select", opciones: ["activo", "suspension_temporal", "baja_provisional", "baja_definitiva"], grupo: SUNAT_EMPRESA, verif: true },
      { key: "condicion_sunat", label: "Condición SUNAT", tipo: "select", opciones: ["habido", "no_habido"], grupo: SUNAT_EMPRESA, verif: true },
      { key: "fecha_verificacion_sunat", label: "Última verificación SUNAT", corto: "Verificado SUNAT", tipo: "date", grupo: SUNAT_EMPRESA, verif: true },
      // — Documentos: importantes para postular, pero no bloquean el alta.
      //   Cada dato va a la izquierda con su respaldo (link) a la derecha. —
      { key: "partida_electronica", label: "N° de partida electrónica (SUNARP)", corto: "Partida electrónica", grupo: DOCS_EMPRESA },
      { key: "partida_electronica_url", label: "Partida electrónica (PDF)", corto: "Partida PDF", valida: "url", grupo: DOCS_EMPRESA },
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
      { key: "estado", label: "Estado", tipo: "select", opciones: Object.keys(EST_CONVOCATORIA) },
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
      { key: "estado", label: "Estado", tipo: "select", opciones: ["en_preparacion", "enviada", "en_subsanacion", "apta", "no_apta", "finalista", "ganadora", "finalista_no_ganadora", "no_seleccionada", "retirada"] },
      { key: "lenguas_originarias", label: "¿Uso de lenguas originarias?", tipo: "select", opciones: ["no", "quechua", "aymara", "mixto"] },
      // — Lo que aparece cuando el jurado publica —
      { key: "puntaje_jurado", label: "Puntaje matriz del jurado", valida: "puntaje", grupo: JURADO_POST },
      { key: "matriz_jurado_url", label: "Matriz del jurado (link al PDF)", corto: "Matriz jurado", valida: "url", grupo: JURADO_POST },
      { key: "feedback_jurado", label: "Comentario del jurado", corto: "Comentario jurado", tipo: "textarea", grupo: JURADO_POST },
      // — Lo que solo existe si se ganó —
      { key: "codigo_acta", label: "Código del acta de compromiso (ej. 139-2025-DAFO)", corto: "Código acta", grupo: FONDO_POST },
      { key: "fecha_firma_acta", label: "Firma del acta de compromiso", corto: "Firma acta", tipo: "date", grupo: FONDO_POST },
      /* El plazo de ejecución (2 años, acta 7.2) se cuenta desde que el dinero
         llega a la cuenta, no desde la firma. Sin esta fecha, la rendición no
         tiene reloj — y era el único hueco de dato del modelo financiero. */
      { key: "fecha_desembolso", label: "Desembolso del estímulo (a la cuenta)", corto: "Desembolso", tipo: "date", grupo: FONDO_POST },
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
  compra: {
    tabla: "compras",
    titulo: "Combo de compra",
    campos: [
      { key: "codigo", label: "Código", auto: true },
      { key: "nombre", label: "Qué se compró", requerido: true },
      { key: "proveedor", label: "Proveedor / tienda" },
      { key: "fecha", label: "Fecha de compra", tipo: "date" },
      { key: "total", label: "Total de la boleta" },
      { key: "moneda", label: "Moneda", tipo: "select", opciones: ["PEN", "USD"] },
      { key: "link", label: "Link del producto", valida: "url" },
      { key: "comprobante_url", label: "Comprobante (boleta/factura)", valida: "url" },
      { key: "nota", label: "Nota", tipo: "textarea" },
    ],
  },
  equipamiento: {
    tabla: "equipamiento",
    titulo: "Equipo audiovisual",
    campos: [
      { key: "folio", label: "Folio", auto: true },
      { key: "nombre", label: "Nombre del activo", requerido: true },
      { key: "categoria", label: "Categoría", tipo: "select", opciones: [...CATEGORIAS_EQUIPO] },
      { key: "subcategoria", label: "Subcategoría", sugerenciasPor: { campo: "categoria", mapa: SUBCATS_EQUIPO } },
      // "en_uso" no es elegible: lo gobiernan los préstamos (🤝 en el perfil).
      // La lista sale de lib/estadosEquipo: escrita aquí a mano, un estado
      // nuevo se quedaba sin poder elegirse y nadie sabía por qué.
      /* Sin «en uso» en las opciones: lo gobierna el préstamo. Cuando el
         equipo YA lo está, el formulario enseña su valor actual para no
         perderlo, y `explicaActual` es lo que evita que parezca chatarra de
         una migración. El servidor además impide cambiarlo con el préstamo
         abierto (ver guardarEntidad): la pantalla es una cortesía, la regla
         está en el servidor. */
      { key: "estado", label: "Estado", tipo: "select", opciones: [...ESTADOS_ELEGIBLES],
        explicaActual: { en_uso: "en uso — lo tiene alguien; se quita al devolverlo" } },
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
      /* «actor social» (comunero, protagonista, sujeto del documental) es una
         CLASE de relación, no un área del crew —por eso es un tipo y no un
         equipo—. Sale destacado en búsquedas/listados (lib/personas
         esProminente) pero no se le reclama papeles como a personal/colaborador. */
      { key: "tipo", label: "Tipo", tipo: "select", opciones: ["personal", "colaborador", "actor social", "colaborador eventual", "independiente", "contacto"] },
      { key: "equipo", label: "Equipo", tipo: "select", opciones: EQUIPOS_PERSONA },
      { key: "estado", label: "Estado", tipo: "select", opciones: ["activo", "potencial", "vetado", "inactivo"] },
      { key: "rol", label: "Especialidades / rol", corto: "Rol", sugerencias: ESPECIALIDADES, multiple: true },
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
      // Multiselect: se pueden marcar varias (chips) y también escribir otra.
      { key: "otras_lenguas", label: "Otras lenguas en las que se expresa", corto: "Otras lenguas", grupo: CENSAL_PERSONA, sugerencias: LENGUAS, multiple: true, opcional: true },
      { key: "discapacidad", label: "Discapacidad o limitación permanente", corto: "Discapacidad", tipo: "select", grupo: CENSAL_PERSONA,
        opciones: ["No tengo", "Moverse o caminar, para usar brazos o piernas", "Ver, aun usando anteojos", "Hablar o comunicarse", "Oír, aun usando audífonos", "Entender o aprender", "Relacionarse con los demás"] },
      /* Domicilio del DNI, desglosado como el censo DAFO: dirección + el mismo
         Departamento · Provincia · Distrito de una empresa (combos dependientes
         del ubigeo). `region` ES el departamento del domicilio del DNI (se llena
         mirando el DNI), así que se reusa esa clave. */
      { key: "direccion", label: "Dirección (domicilio DNI)", corto: "Dirección", grupo: CENSAL_PERSONA },
      { key: "region", label: "Departamento (domicilio DNI)", corto: "Departamento", tipo: "select", opciones: REGIONES, grupo: CENSAL_PERSONA },
      { key: "provincia", label: "Provincia (domicilio DNI)", corto: "Provincia", grupo: CENSAL_PERSONA,
        tipo: "select", sugerenciasPor: { campo: "region", mapa: PROVINCIAS_POR_DEPARTAMENTO } },
      { key: "distrito", label: "Distrito (domicilio DNI)", corto: "Distrito", grupo: CENSAL_PERSONA,
        tipo: "select", sugerenciasPor: { campo: "provincia", mapa: DISTRITOS_POR_PROVINCIA } },
      { key: "telefono", label: "Teléfono", valida: "telefono" },
      { key: "email", label: "Email", valida: "email" },
      // "notas" se retiró: era un pozo sin fondo (sin autor, sin fecha y sin
      // avisar a nadie). Lo que hay que decir de una persona va como caso o
      // comentario, que sí deja rastro. La columna sigue en la BD y el
      // buscador aún la lee, así que lo escrito no se pierde.
      // — Identidad: el DNI es la llave para verificar en RENIEC y SUNAT —
      { key: "ruc_dni", label: "DNI (8 dígitos)", corto: "DNI", valida: "dni", grupo: DNI_PERSONA },
      { key: "dni_vencimiento", label: "DNI — fecha de vencimiento", corto: "DNI vence", tipo: "date", grupo: DNI_PERSONA },
      // La pone el botón «Verificar DNI (RENIEC)»; no se teclea a mano.
      { key: "fecha_verificacion_reniec", label: "Última verificación RENIEC", corto: "Verificado RENIEC", tipo: "date", grupo: DNI_PERSONA, verif: true },
      // El escaneo del DNI y la firma SON identidad, y el fondo los exige
      { key: "dni_url", label: "DNI escaneado (PDF)", corto: "DNI escaneado", valida: "url", grupo: DNI_PERSONA },
      { key: "firma_url", label: "Firma escaneada", corto: "Firma", valida: "url", grupo: DNI_PERSONA },
      // — SUNAT: el RUC se calcula del DNI; el resto lo trae la verificación —
      { key: "estado_sunat", label: "Estado SUNAT", tipo: "select", opciones: ["activo", "suspension_temporal", "baja_provisional", "baja_definitiva"], grupo: SUNAT_PERSONA, verif: true },
      { key: "condicion_sunat", label: "Condición SUNAT", tipo: "select", opciones: ["habido", "no_habido"], grupo: SUNAT_PERSONA, verif: true },
      { key: "fecha_verificacion_sunat", label: "Última verificación SUNAT", corto: "Verificado SUNAT", tipo: "date", grupo: SUNAT_PERSONA, verif: true },
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
