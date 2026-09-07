/* ══════════════════════════════════════════════════════════════════════════
   ¿PUEDO PUBLICAR ESTE DOCUMENTAL HOY, Y QUÉ ME FALTA SI NO?

   Es la única pregunta que este módulo existe para contestar. Todo lo demás
   —las tablas, los enums, las pantallas— son la forma de llegar a ella.

   ── LAS TRES COSAS QUE EL MODELO ANTERIOR NO PODÍA DECIR ──

   1. QUE «MÚSICA» SON TRES DERECHOS DE TRES PERSONAS DISTINTAS.
      Jennifer Pachaqutec toca «Fatal Destino» con Las Patronas en el cargo de
      Lino. Ahí hay tres permisos y ninguno sustituye a otro:
        · la INTERPRETACIÓN, que es de cada música que toca;
        · la COMPOSICIÓN, que es de su autor — y hay QUINCE «Fatal Destino» en
          el catálogo de APDAYC, ninguno en dominio público;
        · la GRABACIÓN, si se usa un fonograma en vez de grabarlo uno mismo.
      Con un solo tipo `musica`, la firma de Jennifer parecía cubrir la canción
      de Zenobio Dágha. No la cubre.

   2. LA CALIDAD DEL FIRMANTE.
      Jennifer puede firmar por sí misma o como representante de la banda, y no
      es lo mismo. Es la regla R1 y la razón principal de este archivo.

   3. QUE HAY PERMISOS QUE NO CUELGAN DE UNA PERSONA.
      Una obra cuelga de su autor, una grabación de su productor. Forzarlos a
      colgar de una persona produce datos falsos.

   ── UN CERO AQUÍ NO ES UN CERO ──
   Si la consulta falla y llega una lista vacía, «0 pendientes» se lee como
   «puedo publicar», que es lo contrario de la verdad. Por eso este archivo NO
   decide qué pintar: devuelve los números, y quien llama enseña el error del
   servidor en vez del semáforo.

   ⚠ NO IMPORTA NADA DE SUPABASE, y no llama a `new Date()`: el «hoy» entra por
   parámetro. A partir de las 7 de la tarde en Perú `new Date()` ya está en el
   día siguiente, y un plazo vencería un día antes de tiempo.
   ══════════════════════════════════════════════════════════════════════════ */

/* ══════════════ VOCABULARIO ══════════════ */

export type TipoAutorizacion =
  | "imagen_voz_testimonio" | "interpretacion_musical" | "interpretacion_danza"
  | "obra_musical" | "obra_no_musical" | "fonograma" | "material_aportado"
  | "locacion" | "actividad_organizada" | "aporte_de_equipo" | "otro";

export type Naturaleza = "consentimiento" | "licencia" | "cesion";

export type CalidadFirmante =
  | "titular" | "representante_agrupacion" | "representante_legal_menor"
  | "heredero_o_causahabiente" | "propietario_administrador"
  | "organizador_actividad" | "autoridad_comunal" | "representante_entidad";

export type EstadoAutorizacion =
  | "no_iniciada" | "en_gestion" | "solicitada" | "firmada"
  | "rechazada" | "no_ubicable" | "no_aplica";

export type NivelRiesgo = "bajo" | "medio" | "alto" | "critico";

export type EstadoDominioPublico =
  | "no" | "si_verificado" | "presunto_sin_verificar" | "desconocido";

const limpia = (v?: string | null) => String(v || "").trim();
const baja = (v?: string | null) => limpia(v).toLowerCase();
const hay = (v?: string | null) => !!limpia(v);

export const TIPOS_AUT: TipoAutorizacion[] = [
  "imagen_voz_testimonio", "interpretacion_musical", "interpretacion_danza",
  "obra_musical", "obra_no_musical", "fonograma", "material_aportado",
  "locacion", "actividad_organizada", "aporte_de_equipo", "otro",
];

export const META_TIPO_AUT: Record<TipoAutorizacion, {
  ico: string; corto: string; largo: string;
  /** Sobre qué recae. Es lo que impide registrar la composición contra la
   *  persona que solo la interpretó (R2). */
  objeto: "persona" | "obra" | "grabacion" | "agrupacion"
        | "locacion" | "actividad" | "material" | "libre";
  /** Lo razonable por defecto, que la acción pone si nadie dice otra cosa. */
  naturaleza: Naturaleza;
}> = {
  imagen_voz_testimonio: {
    ico: "📷", corto: "imagen, voz y testimonio", objeto: "persona",
    naturaleza: "consentimiento",
    largo: "Autoriza que se le grabe, que su voz suene y que lo que cuenta aparezca en la pieza. Es el papel que se firma una vez y cubre las tres cosas. No es una cesión: es un acto de disposición sobre un derecho de la personalidad.",
  },
  interpretacion_musical: {
    ico: "🎻", corto: "interpretación musical", objeto: "agrupacion",
    naturaleza: "licencia",
    largo: "El derecho del artista intérprete o ejecutante: que se registre y se use SU ejecución. Es personal — lo cede cada músico, no el que dirige la banda. No cubre la composición.",
  },
  interpretacion_danza: {
    ico: "💃", corto: "interpretación de danza", objeto: "agrupacion",
    naturaleza: "licencia",
    largo: "Lo mismo que la musical, para quien danza. También es individual: la firma del capitán de la cuadrilla no cubre a los danzantes.",
  },
  obra_musical: {
    ico: "🎼", corto: "obra musical", objeto: "obra", naturaleza: "licencia",
    largo: "La composición y la letra. Es del autor o de su editorial, y no de quien la toca. Hay quince «Fatal Destino» registrados en APDAYC: sin ISWC no se sabe de cuál se está hablando.",
  },
  obra_no_musical: {
    ico: "🖼", corto: "otra obra", objeto: "obra", naturaleza: "licencia",
    largo: "Un texto, una pintura, una coreografía, una fotografía como obra. Del autor o de su titular.",
  },
  fonograma: {
    ico: "💿", corto: "grabación / fonograma", objeto: "grabacion",
    naturaleza: "licencia",
    largo: "El registro sonoro concreto, que es del productor fonográfico. ⚠ Una canción en dominio público puede tener una grabación de 2019 plenamente protegida: son dos permisos.",
  },
  material_aportado: {
    ico: "📦", corto: "material de archivo", objeto: "material",
    naturaleza: "licencia",
    largo: "Una foto o un vídeo que alguien presta. ⚠ Tener el material no es tener sus derechos: quien lo presta y quien lo hizo suelen ser personas distintas.",
  },
  locacion: {
    ico: "🏛", corto: "locación", objeto: "locacion", naturaleza: "licencia",
    largo: "Permiso de filmación de un lugar, de su propietario o administrador.",
  },
  actividad_organizada: {
    ico: "🎪", corto: "actividad", objeto: "actividad", naturaleza: "licencia",
    largo: "La procesión, la misa, la corrida, el concurso. Lo da quien la organiza — y cubre la actividad, NO a cada persona que participa en ella.",
  },
  aporte_de_equipo: {
    ico: "🎬", corto: "aporte del equipo", objeto: "persona",
    naturaleza: "cesion",
    largo: "El aporte creativo de quien hace la película. Aquí sí suele ser una cesión de verdad: la productora pasa a ser titular.",
  },
  otro: {
    ico: "📄", corto: "otro", objeto: "libre", naturaleza: "licencia",
    largo: "Lo que no cabe en los anteriores y hay que poder guardar igual.",
  },
};

export const ROTULO_CALIDAD: Record<CalidadFirmante, { txt: string; cubre: string }> = {
  titular: { txt: "por sí misma", cubre: "Sus propios derechos." },
  representante_agrupacion: {
    txt: "como representante de la agrupación",
    cubre: "⚠ La conformidad del colectivo, NO los derechos individuales de sus integrantes. Cada intérprete firma el suyo.",
  },
  representante_legal_menor: {
    txt: "como representante legal de un menor",
    cubre: "Los derechos del menor representado. Es la única forma válida de autorizar por alguien menor de edad.",
  },
  heredero_o_causahabiente: {
    txt: "como heredero", cubre: "Según el orden legal aplicable, cuando el titular falleció.",
  },
  propietario_administrador: {
    txt: "como propietario o administrador", cubre: "El acceso al lugar y su imagen.",
  },
  organizador_actividad: {
    txt: "como organizador de la actividad",
    cubre: "⚠ La actividad, NO a quienes participan en ella. Cada persona identificable sigue necesitando el suyo.",
  },
  autoridad_comunal: {
    txt: "como autoridad comunal",
    cubre: "⚠ El consentimiento colectivo, que es complementario y NO sustituye al de cada persona.",
  },
  representante_entidad: {
    txt: "como apoderado de una entidad", cubre: "Según el alcance de su poder.",
  },
};

/** Las calidades, en orden de uso — DERIVADAS del rótulo de arriba.
 *
 *  ⚠ `Object.keys` y no una lista escrita a mano. `app/clearance/acciones.ts`
 *  tenía su propia copia; moverla aquí quitaba una de las dos, pero seguía sin
 *  arreglar el fallo de fondo: añadir un valor al tipo `CalidadFirmante` rompe
 *  el `Record` —TypeScript exige que sea total— y NO rompe un array, así que la
 *  calidad nueva se habría quedado fuera de la validación y del desplegable sin
 *  que nada avisara. Derivada, eso es imposible: hay un solo sitio donde
 *  añadirla, y es el que ya te obliga a escribir su explicación. */
export const CALIDADES = Object.keys(ROTULO_CALIDAD) as CalidadFirmante[];

/** Las calidades que representan a OTROS. Es la lista de la que sale R1: nunca
 *  cubren al representado, solo lo comprometen como colectivo. */
const CALIDADES_DE_REPRESENTACION: CalidadFirmante[] = [
  "representante_agrupacion", "organizador_actividad", "autoridad_comunal",
];

export const esRepresentacion = (c?: string | null) =>
  CALIDADES_DE_REPRESENTACION.includes(baja(c) as CalidadFirmante);

export const ROTULO_ESTADO_AUT: Record<EstadoAutorizacion, string> = {
  no_iniciada: "sin empezar", en_gestion: "en gestión", solicitada: "solicitada",
  firmada: "firmada", rechazada: "rechazada", no_ubicable: "no ubicable",
  no_aplica: "no aplica",
};

/** ── DE QUIÉN HABLA UNA AUTORIZACIÓN ──
 *  El OBJETO manda sobre el otorgante, y el orden importa: cuando los dos son
 *  distintos —una menor cuyo permiso firma su madre, un heredero que cede lo
 *  del fallecido— la fila habla de la menor y del fallecido, no de quien puso
 *  la firma. Al revés, el permiso de la menor cuelga de la ficha de la madre y
 *  la fila de la menor en el reparto dice «sin registrar» sobre alguien que sí
 *  lo tiene.
 *  ⚠ Vive aquí y no en cada pantalla porque ya pasó: /musica indexaba por
 *  otorgante y la ficha del proyecto por objeto, así que el MISMO papel caía
 *  bajo personas distintas en cada sitio. Dos criterios se separan; uno, no. */
export const personaDeAutorizacion = (a: FilaAutorizacion): string | null =>
  a.objeto_persona_id || a.otorgante_persona_id || null;

/** ── QUÉ CUELGA DE LA FILA DE UNA PERSONA EN EL REPARTO ──
 *  Los papeles que hablan de ELLA: que se le grabe, y lo que ella interpreta.
 *
 *  ⚠ No basta con `objeto === "persona"`. La interpretación tiene por objeto la
 *  `agrupacion` —lo que se registra es la ejecución— pero el derecho es
 *  personal y lo cede cada músico: la cesión de Jennifer es suya y tiene que
 *  verse en su fila. Dejarla fuera sería esconder justo el papel del caso que
 *  levantó todo este módulo.
 *
 *  ⚠ Y hay que excluir lo demás, que antes entraba: el permiso de la CASA lo
 *  firma Braulia como propietaria, así que su id está en `otorgante_persona_id`
 *  y colgaba de su fila del reparto como si fuera un papel suyo de actriz.
 *  Recae sobre la casa; ella solo pone la firma. Igual con el material de
 *  archivo que alguien aporta y con la composición de una obra. */
export const esPapelDeLaPersona = (a: FilaAutorizacion): boolean => {
  const o = META_TIPO_AUT[baja(a.tipo) as TipoAutorizacion]?.objeto;
  return o === "persona" || o === "agrupacion";
};

/* ══════════════════════════════════════════════════════════════════════════
   PARA QUÉ MEDIOS VALE EL PERMISO

   ── POR QUÉ ESTA LISTA VIVE AQUÍ ──
   `autorizacion.medios` es un `text[]` SIN check en la base, a propósito: un
   vocabulario cerrado en Postgres obliga a una migración cada vez que aparece
   un soporte nuevo, y aparecen. Así que la lista vive en código, y este es su
   único sitio.

   ── DE DÓNDE SALEN ESTOS NOMBRES ──
   De la cláusula TERCERA del release de PUKLLAYCHA FILMS, que es el papel que
   se firma de verdad: «salas de cine y proyecciones públicas; televisión
   abierta y por cable; plataformas digitales de video y audio, incluidos
   canales de YouTube y redes sociales, con o sin monetización publicitaria;
   internet en general; soportes físicos; muestras, festivales y usos
   educativos, culturales y de archivo del proyecto».

   No se inventaron categorías: se copiaron. Un vocabulario que no coincide con
   el papel obliga a traducir en la cabeza cada vez que se rellena, y entonces
   se rellena mal o no se rellena.

   ── POR QUÉ IMPORTA QUE ESTÉ ──
   `motivosRiesgo` marca «firmada sin decir para qué medios vale» como riesgo
   MEDIO. Ninguna pantalla escribía este campo, así que ese ámbar se encendía
   en cada permiso firmado y no había clic capaz de apagarlo — un aviso que no
   se puede resolver se deja de leer, y detrás se van los que sí importan.
   ══════════════════════════════════════════════════════════════════════════ */

/* ⚠ NUEVE, los que la cláusula enumera. `promocion` estuvo aquí un rato y se
   quitó por dos razones que apuntan al mismo sitio:
     · la cláusula TERCERA NO la menciona — el tráiler y el afiche los concede
       la SEGUNDA, que es otro párrafo—, así que un botón «los del release» que
       la marcara escribiría, en nombre de un papel firmado, una concesión que
       ese papel no contiene;
     · y `permite_uso_promocional` ya existe y es la columna que mira R6. Con
       las dos, el mismo panel dejaba marcar «promoción» entre los medios y
       desmarcar «autoriza tráiler y afiche» a diez líneas de distancia: dos
       pantallas del mismo expediente afirmando lo contrario.
   Un dato en dos sitios que pueden discrepar es lo que este módulo entero
   evita. Su único hogar es el booleano. */
export const MEDIOS = [
  "salas", "television", "plataformas", "redes", "internet",
  "soportes_fisicos", "festivales", "educativo", "archivo",
] as const;
export type Medio = typeof MEDIOS[number];

export const ROTULO_MEDIO: Record<Medio, { corto: string; largo: string }> = {
  salas: { corto: "salas y proyecciones",
    largo: "Salas de cine y proyecciones públicas." },
  television: { corto: "televisión",
    largo: "Televisión abierta y por cable." },
  plataformas: { corto: "plataformas",
    largo: "Plataformas digitales de video y audio, incluidos canales de YouTube. Es donde acaba la película, y el medio que más se olvida de nombrar." },
  redes: { corto: "redes sociales",
    largo: "Redes sociales, con o sin monetización publicitaria. Lo de «con monetización» no es un detalle: es lo que separa difundir de explotar." },
  internet: { corto: "internet en general",
    largo: "Internet sin restricción de soporte — la web del proyecto, prensa digital, lo que venga." },
  soportes_fisicos: { corto: "soportes físicos",
    largo: "DVD, disco duro, copias en mano." },
  festivales: { corto: "muestras y festivales",
    largo: "Muestras, festivales y catálogos. Suele ser lo primero que ocurre, y lo que hace falta tener firmado antes de inscribirse." },
  educativo: { corto: "uso educativo",
    largo: "Usos educativos y culturales: aulas, cineclubes, talleres." },
  archivo: { corto: "archivo del proyecto",
    largo: "Conservar el material en el archivo del proyecto. Sin esto, guardar los brutos después del estreno no está cubierto." },
};

/** Lo que concede el release estándar de PUKLLAYCHA: su cláusula TERCERA los
 *  nombra los nueve. Se ofrece como un clic —«los del release»— porque marcar
 *  nueve casillas una por una en cada persona es lo que hace que no se marque
 *  ninguna. Quien firme un papel recortado desmarca lo que sobre.
 *  El tráiler y el afiche NO van aquí: los concede la cláusula SEGUNDA y viven
 *  en `permite_uso_promocional`, que es lo que mira R6. */
export const MEDIOS_RELEASE_ESTANDAR: Medio[] = [...MEDIOS];

export const esMedio = (v: unknown): v is Medio =>
  MEDIOS.includes(String(v) as Medio);

export type TipoPlazo = "indefinido" | "anios" | "hasta_fecha";

/** ⚠ `Record<TipoPlazo, …>` y no `Record<string, …>`: el `<select>` se
 *  construye recorriendo este objeto, así que una clave de más aquí produciría
 *  una opción que la acción descarta en silencio a «indefinido». */
export const ROTULO_PLAZO: Record<TipoPlazo, string> = {
  indefinido: "indefinido — por el máximo que permita la ley",
  anios: "por un número de años desde la firma",
  hasta_fecha: "hasta una fecha concreta",
};

/* ══════════════════════════════════════════════════════════════════════════
   EL PAPEL QUE SE FIRMA

   `documento_firmado.modelo` dice QUÉ papel es. No es decorativo: el expediente
   de clearance se enseña meses después a un fondo o a una aseguradora, y
   entonces «un PDF» no vale — hay que poder decir que ese PDF es el release de
   imagen de Fulano y no la licencia de un fonograma.
   ══════════════════════════════════════════════════════════════════════════ */

export const MODELOS_DOC = [
  "release_individual", "release_simplificado", "autorizacion_representante_menor",
  "autorizacion_agrupacion", "anexo_integrantes",
  "autorizacion_actividad_comunidad", "autorizacion_locacion",
  "entrega_material_terceros", "licencia_obra", "licencia_fonograma",
  "contrato_equipo", "otro",
] as const;
export type ModeloDoc = typeof MODELOS_DOC[number];

export const ROTULO_MODELO: Record<ModeloDoc, string> = {
  release_individual: "release individual",
  release_simplificado: "release simplificado",
  autorizacion_representante_menor: "autorización del representante de la menor",
  autorizacion_agrupacion: "autorización de la agrupación",
  anexo_integrantes: "anexo de integrantes",
  autorizacion_actividad_comunidad: "autorización de la actividad",
  autorizacion_locacion: "autorización de la locación",
  entrega_material_terceros: "entrega de material de terceros",
  licencia_obra: "licencia de la obra",
  licencia_fonograma: "licencia del fonograma",
  contrato_equipo: "contrato de equipo",
  otro: "otro",
};

/**
 * El modelo que le toca por defecto a un permiso, por su tipo y quién firma.
 *
 * ⚠ Una SUGERENCIA, no una imposición: el formulario lo deja cambiar. Pero
 * ponerlo bien de entrada es lo que hace que el campo se rellene en vez de
 * quedarse en «otro» —que es lo que pasa con todo desplegable que arranca
 * vacío, y entonces la columna existe y no dice nada.
 *
 * ⚠ La minoría de edad manda sobre el tipo: si firma el representante legal, el
 * papel es el suyo, no el release de ella. Es la distinción entera de R5.
 */
export function modeloSugerido(
  tipo?: string | null, calidad?: string | null, hayAgrupacion = true,
): ModeloDoc {
  if (baja(calidad) === "representante_legal_menor")
    return "autorizacion_representante_menor";
  switch (baja(tipo)) {
    case "imagen_voz_testimonio":    return "release_individual";
    case "interpretacion_musical":
    case "interpretacion_danza":
      /* ⚠ El solista no firma una «autorización de agrupación». El derecho de
         intérprete es personal —lo cede cada músico— y una banda es solo el
         caso frecuente, no el único: el modelo tiene que seguir a quién firma,
         no al tipo. Con el valor equivocado puesto por defecto es peor que con
         «otro»: `modelo` se guarda y luego se lee como una afirmación. */
      return hayAgrupacion ? "autorizacion_agrupacion" : "release_individual";
    case "obra_musical":
    /* `obra_no_musical` caía en «otro» teniendo su modelo: es una obra, y lo
       que se firma sobre una obra es su licencia. */
    case "obra_no_musical":          return "licencia_obra";
    case "fonograma":                return "licencia_fonograma";
    case "locacion":                 return "autorizacion_locacion";
    case "actividad_organizada":     return "autorizacion_actividad_comunidad";
    case "material_aportado":        return "entrega_material_terceros";
    case "aporte_de_equipo":         return "contrato_equipo";
    default:                         return "otro";
  }
}

/** Los estados en que el permiso TODAVÍA NO ESTÁ. Se usa en el semáforo, y por
 *  eso vive aquí y no en la pantalla: dos listas se separan. */
const ESTADOS_ABIERTOS: EstadoAutorizacion[] =
  ["no_iniciada", "en_gestion", "solicitada", "no_ubicable"];

export const estaAbierta = (e?: string | null) =>
  ESTADOS_ABIERTOS.includes(baja(e) as EstadoAutorizacion);

/** `rechazada` no está abierta —nadie va a firmar— pero tampoco resuelta: hay
 *  que quitar el material o reencuadrar. Es su propio caso. */
export const estaResuelta = (e?: string | null) =>
  baja(e) === "firmada" || baja(e) === "no_aplica";

/**
 * ¿Este permiso está RESUELTO, tal como lo pinta una pantalla?
 *
 * ⚠ UNA SOLA DEFINICIÓN. Había tres copiadas a mano —en `PermisosDeActor`, en
 * `ActoresProyecto` y en el bloque del reparto de `PermisosProyecto`— y una
 * cuarta distinta en `estaResuelta`, que sí cuenta `no_aplica`. Tres pantallas
 * decidiendo por su cuenta cuándo algo está verde es la misma familia de fallo
 * que este módulo entero existe para impedir, y ya se manifestó: un permiso
 * bien marcado «no aplica» salía en ámbar para siempre y ningún clic lo
 * apagaba.
 *
 * Las tres condiciones, y por qué cada una:
 *   · `no_aplica` cuenta como resuelto. Es una decisión analizada y anotada
 *     —el check de la base exige la nota—, no un hueco.
 *   · `firmada` exige DOCUMENTO. Sin papel es alguien diciendo que hay una
 *     firma, y eso no se enseña a una aseguradora.
 *   · y exige que el riesgo no sea grave. Una menor con su release firmado y
 *     su PDF, pero sin representante registrado, no está cubierta: pintarla en
 *     verde es la definición de un verde que miente.
 */
export function permisoResuelto(a: FilaAutorizacion, riesgo?: NivelRiesgo | null): boolean {
  const e = baja(a.estado);
  if (e === "no_aplica") return true;
  if (e !== "firmada" || !a.documento_id) return false;
  return riesgo !== "critico" && riesgo !== "alto";
}

/* ══════════════════════════════════════════════════════════════════════════
   EL COLOR DE UN ESTADO

   ── POR QUÉ NO BASTABA CON EL DEL RIESGO ──
   Hasta hoy el color de un estado era el de su RIESGO, y en la ficha del
   proyecto salían «en gestión», «sin registrar» y «solicitada» del mismo ámbar:
   nueve filas idénticas de las que no se podía leer cuál está en marcha y cuál
   no ha empezado. Un color que no distingue no es información, es decoración.

   ── Y POR QUÉ NO ES SOLO EL ESTADO ──
   ⚠ Una excepción, y es la que sostiene todo el módulo: `firmada` sale en verde
   SOLO si el permiso está resuelto de verdad. Una firmada sin documento es
   alguien diciendo que hay una firma; una de una menor sin representante
   registrado no cubre nada. Pintarlas del mismo verde que una completa
   devolvería exactamente la mentira que este módulo existe para impedir, ahora
   por la puerta de la paleta.
   Cuando eso pasa, el color vuelve a ser el del riesgo — y el rótulo de la
   pantalla ya dice «firmada, falta el papel».
   ══════════════════════════════════════════════════════════════════════════ */

const COLOR_ESTADO: Record<EstadoAutorizacion, string> = {
  /* Nadie lo ha tocado. Apagado a propósito: no es malo, es que no empezó. */
  no_iniciada: "var(--dim)",
  /* En marcha. Azul y no ámbar: hay alguien detrás de esto. */
  en_gestion: "var(--blue)",
  /* ⚠ Violeta y NO `--teal`. El teal (#2dd4bf) está en la familia del verde
     (#2ecc71), y una columna de «solicitada» en verde-agua se lee de un vistazo
     como resuelta. La única distinción que no puede difuminarse nunca es hecho
     / no hecho. */
  solicitada: "var(--accent)",
  /* Resuelto. El verde se gana en `colorEstadoAut`, no aquí. */
  firmada: "var(--green)",
  /* Nadie va a firmar. Rojo: no es «pendiente», es que dijeron que no. */
  rechazada: "var(--red)",
  /* No se le encuentra. Naranja: se puede seguir intentando, y hay que apuntar
     los intentos — la prueba del intento razonable es parte de la defensa. */
  no_ubicable: "var(--orange)",
  /* Decidido y anotado. Violeta claro y no verde: no es que esté firmado, es
     que se analizó y no hacía falta. Son dos cosas distintas. */
  no_aplica: "var(--violet)",
};

/**
 * El color con que se pinta el estado de un permiso.
 *
 * ⚠ Una sola función para las tres pantallas. El color de una fila es lo
 * primero que se lee y lo último que alguien comprueba: tres paletas escritas a
 * mano se separan sin que nada avise, y entonces el mismo permiso se ve de un
 * color en la ficha del proyecto y de otro en ⚖ clearance.
 *
 * ── EL RIESGO GRAVE MANDA SOBRE EL ESTADO, EN CUALQUIER ESTADO ──
 * ⚠ La primera versión solo degradaba las `firmada`, y eso BORRÓ una alarma que
 * antes se veía: una actriz menor sin representante legal, con su release en
 * `no_iniciada`, da riesgo CRÍTICO — y salía pintada del gris apagado de «nadie
 * lo ha tocado». La fila más grave de la lista era la más silenciosa, y en las
 * tres pantallas donde no hay un motivo escrito al lado que la rescate.
 * El `medio` sí se queda con el color de su estado: ese ámbar indistinguible
 * era justo lo que este cambio venía a matar, y su motivo sí se lee al lado.
 */
export function colorEstadoAut(
  a: FilaAutorizacion, riesgo?: NivelRiesgo | null,
): string {
  const e = baja(a.estado) as EstadoAutorizacion;

  /* ── EL CRÍTICO MANDA SOBRE CUALQUIER ESTADO ──
     Es la ÚNICA anomalía de verdad: una menor sin representante, un plazo
     vencido. Se ve en rojo esté como esté el papel. */
  if (riesgo === "critico" && !permisoResuelto(a, riesgo)) return COLOR_RIESGO.critico;

  /* ── PERO «ALTO» NO, Y ESTO SE APRENDIÓ MIRANDO LA PANTALLA ──
     ⚠ La versión anterior degradaba también el `alto`, y el resultado fue que
     TODO seguía saliendo del mismo naranja. El motivo: `riesgoDe` da `alto` a
     cualquier permiso que no esté resuelto —«sin empezar», «en gestión»,
     «solicitada» y «no ubicable», todos—. O sea que `alto` no es una anomalía
     en un estado abierto: es EXACTAMENTE lo que ese estado ya dice, y pintarlo
     encima borraba la distinción que la paleta venía a crear.
     Un color que sale igual en el 90% de las filas no informa de nada.

     En una FIRMADA sí es anomalía: dice estar hecha y no lo está. Ahí se
     degrada, y de eso se encarga `permisoResuelto` en la línea de abajo. */
  if (e === "firmada" && !permisoResuelto(a, riesgo))
    return riesgo && riesgo !== "bajo" ? COLOR_RIESGO[riesgo] : "var(--yellow)";

  return COLOR_ESTADO[e] || "var(--dim)";
}

export const COLOR_RIESGO: Record<NivelRiesgo, string> = {
  bajo: "var(--dim)", medio: "var(--yellow)",
  alto: "var(--orange)", critico: "var(--red)",
};

const PESO_RIESGO: Record<NivelRiesgo, number> = {
  bajo: 0, medio: 1, alto: 2, critico: 3,
};

export const peorRiesgo = (a: NivelRiesgo, b: NivelRiesgo): NivelRiesgo =>
  PESO_RIESGO[a] >= PESO_RIESGO[b] ? a : b;

/* ══════════════ LAS FILAS QUE ENTRAN ══════════════ */

export type FilaAutorizacion = {
  id: string;
  proyecto_id?: string | null;
  tipo?: string | null;
  naturaleza?: string | null;
  otorgante_tipo?: string | null;
  otorgante_persona_id?: string | null;
  otorgante_agrupacion_id?: string | null;
  otorgante_entidad_nombre?: string | null;
  calidad_firmante?: string | null;
  objeto_persona_id?: string | null;
  objeto_obra_id?: string | null;
  objeto_grabacion_id?: string | null;
  objeto_agrupacion_id?: string | null;
  objeto_locacion_id?: string | null;
  objeto_actividad_id?: string | null;
  objeto_material_id?: string | null;
  medios?: string[] | null;
  permite_uso_promocional?: boolean | null;
  incluye_explotacion_comercial_futura?: boolean | null;
  tipo_plazo?: string | null;
  plazo_anios?: number | null;
  plazo_hasta?: string | null;
  estado?: string | null;
  riesgo_manual?: string | null;
  prioridad?: string | null;
  documento_id?: string | null;
  firmado_el?: string | null;
  notas?: string | null;
};

export type FilaObraCat = {
  id: string;
  titulo?: string | null;
  autor_conocido?: boolean | null;
  iswc?: string | null;
  estado_dominio_publico?: string | null;
  es_tradicional_o_anonima?: boolean | null;
};

export type FilaGrabacion = {
  id: string;
  origen?: string | null;
  plan_ia?: string | null;
  productor_fonografico?: string | null;
  /** Si un sistema de identificación la reconoció. Es el único elemento del
   *  proyecto que puede bloquear un vídeo SIN que nadie presente un reclamo. */
  reconocida_por_sistemas_automaticos?: boolean | null;
};

export type FilaPersonaMin = {
  id: string;
  es_menor_de_edad?: boolean | null;
  /** Manda sobre el booleano cuando existe: es lo que hace que la minoría de
   *  edad deje de aplicar SOLA. Con solo el booleano, quien cumple dieciocho se
   *  queda marcado como menor para siempre y hay que acordarse de desmarcarlo,
   *  que es exactamente lo que no pasa. */
  fecha_nacimiento?: string | null;
  representante_legal_id?: string | null;
};

/** ¿Es menor HOY? La fecha manda; el booleano es el respaldo para cuando solo
 *  se sabe «es un niño» y nadie preguntó el año.
 *  ⚠ `hoy` entra por parámetro: `new Date()` a partir de las 7 de la tarde en
 *  Perú ya está en el día siguiente. */
export function esMenor(p?: FilaPersonaMin | null, hoy?: string): boolean {
  if (!p) return false;
  const n = limpia(p.fecha_nacimiento);
  if (/^\d{4}-\d{2}-\d{2}$/.test(n) && hoy && /^\d{4}-\d{2}-\d{2}$/.test(hoy)) {
    /* Comparación de cadenas, que en AAAA-MM-DD ordena igual que las fechas y
       no arrastra husos horarios. Cumple 18 el día de su cumpleaños. */
    const y = Number(n.slice(0, 4)) + 18;
    return n.slice(4).length ? `${y}${n.slice(4)}` > hoy : false;
  }
  return !!p.es_menor_de_edad;
}

/* ══════════════ R7 · EL RIESGO, CALCULADO ══════════════
 *
 * ⚠ NO SE GUARDA EN LA BASE, a propósito. Un riesgo escrito en una columna se
 * queda rancio en cuanto cambie cualquier cosa que lo alimenta —una obra que
 * pasa a verificada, un menor que cumple dieciocho, una licencia que vence— y
 * entonces el semáforo de publicación miente con toda la autoridad de un dato
 * guardado. Se calcula al leer, que cuesta nada.
 *
 * Lo único que sí se guarda es `riesgo_manual`, la excepción razonada: cuando
 * el equipo decide que ese caso concreto es más o menos grave de lo que la
 * regla supone. `null` significa «usa el calculado», que es lo normal.
 */

export type ContextoRiesgo = {
  obra?: FilaObraCat | null;
  grabacion?: FilaGrabacion | null;
  persona?: FilaPersonaMin | null;
  /** El día de hoy en Lima, para los plazos vencidos. */
  hoy?: string;
};

/** Hasta cuándo vale, sea cual sea la forma en que se guardó el plazo.
 *  Devuelve null cuando es indefinido o cuando falta el dato para calcularlo —
 *  y «no lo sé» NO es «no vence»: quien llama no puede tratarlo como vigente
 *  sin decirlo, porque un plazo a años sin fecha de firma es un permiso cuya
 *  vigencia nadie puede comprobar. */
export function vencimiento(a: FilaAutorizacion): string | null {
  const t = baja(a.tipo_plazo);
  if (t === "hasta_fecha" || (!t && hay(a.plazo_hasta))) return limpia(a.plazo_hasta) || null;
  if (t === "anios" && a.plazo_anios && hay(a.firmado_el)) {
    const f = limpia(a.firmado_el);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null;
    return `${Number(f.slice(0, 4)) + a.plazo_anios}${f.slice(4)}`;
  }
  return null;
}

export type MotivoRiesgo = { nivel: NivelRiesgo; txt: string };

/** Por qué esta autorización es del riesgo que es, en frases. Devolver los
 *  motivos y no solo el nivel es lo que permite que la pantalla explique en vez
 *  de sentenciar: un rojo sin motivo se deja de mirar. */
export function motivosRiesgo(a: FilaAutorizacion, ctx: ContextoRiesgo = {}): MotivoRiesgo[] {
  const ms: MotivoRiesgo[] = [];
  const tipo = baja(a.tipo) as TipoAutorizacion;
  const abierta = estaAbierta(a.estado);

  /* ── R5 · MENORES ──
     Lo más grave que puede haber, y no admite matices: sin representante legal
     que firme, la única salida es desenfocar o descartar. */
  if (esMenor(ctx.persona, ctx.hoy)) {
    if (baja(a.calidad_firmante) !== "representante_legal_menor")
      ms.push({
        nivel: "critico",
        txt: "es menor de edad y no firma su representante legal: la firma del propio menor no vale",
      });
    else if (!ctx.persona?.representante_legal_id)
      ms.push({ nivel: "alto", txt: "es menor y no está registrado quién lo representa" });
  }

  /* ── R7 · GRABACIÓN COMERCIAL SIN LICENCIAR ──
     El único elemento del proyecto que puede bloquear un vídeo SOLO, sin que
     ninguna persona presente un reclamo: lo hace un sistema automático. */
  /* ⚠ `comercial` E `internet`, y NO `libreria`. La primera versión miraba solo
     `comercial`, y el backfill mapeaba las de biblioteca ahí: un tema de
     Artlist —el caso donde la licencia SÍ está pagada— salía como crítico «sin
     licencia del productor fonográfico» y bloqueaba la publicación. Un crítico
     falso enseña a ignorar los críticos. Y al revés, `internet` —bajado de
     donde sea, que es el peor caso real— no disparaba nada. */
  const og = baja(ctx.grabacion?.origen);
  if ((og === "comercial" || og === "internet") && abierta)
    ms.push({
      nivel: "critico",
      txt: og === "internet"
        ? "grabación bajada de internet, sin licencia ni titular identificado"
        : "grabación comercial audible y sin licencia del productor fonográfico",
    });

  /* Reconocida por un sistema automático: no hace falta que nadie reclame para
     que el vídeo se bloquee o se desmonetice solo. */
  if (ctx.grabacion?.reconocida_por_sistemas_automaticos && abierta)
    ms.push({ nivel: "critico", txt: "un sistema de identificación la reconoció: puede bloquear el vídeo solo" });

  /* La música de IA con un plan que no permite uso comercial. No es «falta un
     dato»: el dato está y dice que no. */
  const plan = baja(ctx.grabacion?.plan_ia);
  if (plan === "free" || plan === "basic")
    ms.push({ nivel: "critico", txt: `generada con un plan ${plan} que no permite uso comercial` });

  /* ── R3 · TRADICIONAL NO ES DOMINIO PÚBLICO ──
     «Valicha» tiene dos registros en APDAYC, uno DP y otro a nombre de una
     persona. La sospecha de que algo es libre no es la prueba. */
  const dp = baja(ctx.obra?.estado_dominio_publico) as EstadoDominioPublico;
  if (ctx.obra?.es_tradicional_o_anonima && dp !== "si_verificado")
    ms.push({ nivel: "alto", txt: "se da por tradicional pero el dominio público no está verificado" });

  if (ctx.obra && !ctx.obra.autor_conocido && abierta)
    ms.push({ nivel: "alto", txt: "la obra está en uso y no se sabe quién es su autor" });

  /* Sin ISWC no se sabe de cuál de los quince se está hablando. */
  if (ctx.obra && !hay(ctx.obra.iswc) && dp !== "si_verificado" && abierta)
    ms.push({ nivel: "medio", txt: "la obra no tiene ISWC: no se sabe cuál de los registros es" });

  /* ── EL PLAZO VENCIDO ──
     El dato está y dice que caducó. ⚠ Los DOS tipos de plazo: la primera
     versión solo miraba `plazo_hasta`, así que una licencia «a 2 años» —que se
     guarda como `tipo_plazo='anios'` con `plazo_anios=2` y `plazo_hasta` en
     null— no vencía jamás para el semáforo. Se cuenta desde la firma. */
  const vence = vencimiento(a);
  if (vence && ctx.hoy && vence < ctx.hoy)
    ms.push({ nivel: "critico", txt: `el permiso venció el ${vence}` });

  /* ── FIRMADA SIN PAPEL ──
     No es ni «hecho» ni «falta»: es alguien diciendo que hay una firma. */
  if (baja(a.estado) === "firmada" && !a.documento_id)
    ms.push({ nivel: "medio", txt: "dice «firmada» pero no está el documento escaneado" });

  /* ── EL ALCANCE EN BLANCO ──
     Un permiso firmado que no dice para qué medios vale es un permiso que
     nadie sabe si cubre el festival al que la película ya se inscribió. */
  if (estaResuelta(a.estado) && baja(a.estado) === "firmada" && !(a.medios || []).length)
    ms.push({ nivel: "medio", txt: "firmada sin decir para qué medios vale" });

  /* Lo básico: el permiso no está y hace falta. */
  if (abierta) {
    /* ⚠ SE ENUMERAN LOS LEVES, NO LOS GRAVES. La primera versión listaba tres
       graves y dejaba todo lo demás en `medio` — y `medio` no bloquea. Con eso,
       las diez Patronas sin firmar salían como «10 sin cerrar, ninguno
       bloqueante» y el semáforo daba luz verde: exactamente el caso que motivó
       todo este módulo. Al revés no puede pasar: lo nuevo que alguien añada al
       enum cae en `alto` por omisión, que es el lado seguro del error. */
    const leves: TipoAutorizacion[] =
      ["locacion", "actividad_organizada", "aporte_de_equipo", "otro"];
    ms.push({
      nivel: leves.includes(tipo) ? "medio" : "alto",
      txt: `${META_TIPO_AUT[tipo]?.corto || "el permiso"}: ${ROTULO_ESTADO_AUT[baja(a.estado) as EstadoAutorizacion] || "sin empezar"}`,
    });
  }

  if (baja(a.estado) === "rechazada")
    ms.push({ nivel: "alto", txt: "rechazada: hay que quitar el material, reencuadrar o sustituirlo" });

  return ms;
}

/** El riesgo calculado: el peor de sus motivos. Sin motivos, `bajo`. */
export function riesgoCalculado(a: FilaAutorizacion, ctx: ContextoRiesgo = {}): NivelRiesgo {
  return motivosRiesgo(a, ctx).reduce<NivelRiesgo>((peor, m) => peorRiesgo(peor, m.nivel), "bajo");
}

/** El riesgo EFECTIVO: el que el equipo puso a mano, o el calculado. */
export function riesgoDe(a: FilaAutorizacion, ctx: ContextoRiesgo = {}): NivelRiesgo {
  const m = baja(a.riesgo_manual);
  if (m === "bajo" || m === "medio" || m === "alto" || m === "critico") return m;
  return riesgoCalculado(a, ctx);
}

/* ══════════════ R1 · LA COBERTURA DE UNA AGRUPACIÓN ══════════════
 *
 * La regla entera del sistema, en una función.
 *
 * Jennifer firmó por Las Patronas. Eso compromete a la banda como colectivo
 * —que toquen, que se les grabe— pero el derecho de intérprete de cada música
 * es de cada música: el D. Leg. 822 lo dice de los derechos conexos del artista
 * intérprete o ejecutante, y son personales.
 *
 * Así que la firma de la representante NO cuenta como las once. Lo que la
 * pantalla tiene que decir es «1 de 11», con las diez que faltan nombradas.
 */

export type CoberturaAgrupacion = {
  integrantes: number;
  /** Cuántas firmaron por sí mismas. Es el numerador de «n de m». */
  firmaron: number;
  /** Cuántas están marcadas «no aplica». No suman a `firmaron` —no es lo mismo
   *  no tener que firmar que haber firmado— pero tampoco faltan. */
  noAplican: number;
  /** Las que faltan, por id. Nombrarlas es lo que convierte el aviso en tarea. */
  faltanIds: string[];
  /** Si existe la autorización del colectivo. Se enseña, pero NO suma. */
  hayFirmaDeRepresentante: boolean;
  /** Quién firmó como representante, cuando el otorgante es una persona. */
  representanteId: string | null;
  /** Si quien firmó por el colectivo es la agrupación misma. Entonces el nombre
   *  de quien la representa está en `agrupacion.representante_id`. */
  representanteEsLaAgrupacion: boolean;
};

export function coberturaAgrupacion(
  agrupacionId: string,
  integrantesIds: string[],
  autorizaciones: FilaAutorizacion[],
): CoberturaAgrupacion {
  /* Sin repetidos: la misma persona podría estar dos veces en la lista que
     llega, y contarla dos veces inflaría el denominador. */
  const ids = [...new Set(integrantesIds.filter(Boolean))];

  const enBanda = new Set(ids);
  /* ⚠ POR LA AGRUPACIÓN **O** POR LA PERSONA. La forma canónica es que el objeto
     sea la agrupación, pero las filas que vienen de `proyecto_cesion` traen el
     objeto puesto a la persona —era lo único que aquella tabla sabía— y con
     solo el primer filtro NINGUNA entraba: una banda cuyas integrantes sí
     habían firmado y sí se migraron decía «0 de 11».
     Un número equivocado no da error: se lee y se cree. */
  const suyas = autorizaciones.filter(a =>
    (baja(a.tipo) === "interpretacion_musical" || baja(a.tipo) === "interpretacion_danza")
    && (a.objeto_agrupacion_id === agrupacionId
        || (!a.objeto_agrupacion_id && !!a.objeto_persona_id && enBanda.has(a.objeto_persona_id))));

  /* ⚠ SOLO LAS DE CALIDAD `titular`. Aquí está R1: si se contaran también las
     de representación, la firma de Jennifer haría el `n de m` igual a `1 de 1`
     y el sistema diría que la banda está cubierta. */
  /* ⚠ FIRMADA, no «resuelta». `estaResuelta` incluye `no_aplica`, y con eso
     alguien marcada «no aplica» subía el numerador de una frase que dice
     literalmente «han firmado». Se cuenta aparte, más abajo: no es lo mismo que
     alguien no tenga que firmar a que ya haya firmado. */
  const firmadasPorSuTitular = new Set(
    suyas
      .filter(a => baja(a.calidad_firmante) === "titular" && baja(a.estado) === "firmada")
      .map(a => a.otorgante_persona_id)
      .filter(Boolean) as string[],
  );
  const noAplican = new Set(
    suyas
      .filter(a => baja(a.calidad_firmante) === "titular" && baja(a.estado) === "no_aplica")
      .map(a => a.otorgante_persona_id)
      .filter(Boolean) as string[],
  );

  const delRepresentante = suyas.find(a => esRepresentacion(a.calidad_firmante));

  return {
    integrantes: ids.length,
    /* Solo las que están EN la banda: una firma de alguien que ya salió del
       conjunto no puede subir el numerador por encima del denominador. */
    firmaron: [...firmadasPorSuTitular].filter(p => enBanda.has(p)).length,
    noAplican: [...noAplican].filter(p => enBanda.has(p)).length,
    faltanIds: ids.filter(p => !firmadasPorSuTitular.has(p) && !noAplican.has(p)),
    hayFirmaDeRepresentante: !!delRepresentante,
    /* ⚠ El otorgante de la firma del colectivo puede ser la AGRUPACIÓN, y
       entonces el check `un_otorgante` obliga a que la persona sea null. La
       primera versión leía solo `otorgante_persona_id` y devolvía siempre null,
       justo lo contrario de lo que su nombre promete. Cuando firma la
       agrupación, quien la representa se mira en `agrupacion.representante_id`,
       que es donde vive ese dato. */
    representanteId: delRepresentante?.otorgante_persona_id || null,
    representanteEsLaAgrupacion:
      !!delRepresentante && !delRepresentante.otorgante_persona_id,
  };
}

/** La cobertura, en palabras. «1 de 11» y no «falta gente»: el número es lo que
 *  convierte el aviso en una tarea con final. */
export function resumenCobertura(c: CoberturaAgrupacion): string {
  if (!c.integrantes)
    return c.hayFirmaDeRepresentante
      ? "firmó la representante, pero no hay ningún integrante registrado: no se puede saber a cuántas cubre"
      : "sin integrantes registrados";
  const base = `${c.firmaron} de ${c.integrantes} integrantes han firmado`
    + (c.noAplican ? ` · ${c.noAplican} marcada${c.noAplican === 1 ? "" : "s"} «no aplica»` : "");
  return c.hayFirmaDeRepresentante && c.firmaron + c.noAplican < c.integrantes
    ? `${base} · la firma de la representante NO cubre a las demás`
    : base;
}

/* ══════════════ LA BITÁCORA DE MONTAJE ══════════════
 *
 * No son autorizaciones: son DECISIONES documentadas sobre el corte. Una
 * autorización dice «esta persona firmó»; una aparición incidental dice «esta
 * persona sale, NO firmó, y esto es lo que decidimos hacer». Meter lo segundo
 * en `autorizacion` con estado `no_aplica` lo convertiría en un permiso que no
 * existe y perdería lo único que importa: qué se hizo.
 *
 * El caso que las pidió: al cargo del Patrón San Esteban acudió mucha gente, y
 * en la procesión y la misa sale un montón de personas de las que no tenemos ni
 * los nombres. No se les puede pedir un release —no se sabe quiénes son— y
 * tampoco se puede fingir que no salen.
 */

export type DecisionIncidental =
  | "pendiente" | "usar" | "reencuadrar" | "desenfocar" | "quitar_audio"
  | "sustituir_plano" | "pedir_release" | "descartar";

export type DecisionMusical =
  | "pendiente" | "licenciar" | "atenuar" | "sustituir" | "cambiar_toma" | "mantener";

export type ModoAparicionMusical =
  | "ejecucion_en_vivo_registrada" | "ambiental_de_local_o_altavoz"
  | "reproducida_por_organizador" | "radio_o_television_en_escena"
  | "musica_original_encargada" | "libreria_licenciada" | "generada_con_ia";

export const DECISIONES_INCIDENTAL: DecisionIncidental[] = [
  "pendiente", "usar", "reencuadrar", "desenfocar", "quitar_audio",
  "sustituir_plano", "pedir_release", "descartar",
];
export const ROTULO_DECISION_INC: Record<DecisionIncidental, string> = {
  pendiente: "sin decidir", usar: "usar tal cual", reencuadrar: "reencuadrar",
  desenfocar: "desenfocar", quitar_audio: "quitar el audio",
  sustituir_plano: "sustituir el plano", pedir_release: "pedirle que firme",
  descartar: "descartar",
};

export const DECISIONES_MUSICAL: DecisionMusical[] = [
  "pendiente", "licenciar", "atenuar", "sustituir", "cambiar_toma", "mantener",
];
export const ROTULO_DECISION_MUS: Record<DecisionMusical, string> = {
  pendiente: "sin decidir", licenciar: "licenciarla", atenuar: "atenuar en la mezcla",
  sustituir: "sustituir por otra", cambiar_toma: "cambiar de toma",
  mantener: "mantener tal cual",
};

export const MODOS_MUSICAL: ModoAparicionMusical[] = [
  "ejecucion_en_vivo_registrada", "ambiental_de_local_o_altavoz",
  "reproducida_por_organizador", "radio_o_television_en_escena",
  "musica_original_encargada", "libreria_licenciada", "generada_con_ia",
];
export const META_MODO_MUSICAL: Record<ModoAparicionMusical, { txt: string; ayuda: string }> = {
  ejecucion_en_vivo_registrada: {
    txt: "tocada en vivo y grabada por nosotros",
    ayuda: "La banda estaba ahí y la grabamos. Pide la interpretación de cada músico y, aparte, la composición.",
  },
  ambiental_de_local_o_altavoz: {
    txt: "sonaba en el lugar",
    ayuda: "⚠ Casi siempre es una grabación comercial: la radio del comedor, el altavoz de la plaza. Es lo único que puede bloquear el vídeo sin que nadie reclame.",
  },
  reproducida_por_organizador: {
    txt: "la puso el organizador",
    ayuda: "⚠ También suele ser comercial. Que la pusiera otro no cambia que suene en tu película.",
  },
  radio_o_television_en_escena: {
    txt: "de una radio o tele en escena",
    ayuda: "⚠ Comercial casi con seguridad, y además con el fonograma de un tercero.",
  },
  musica_original_encargada: {
    txt: "compuesta para la pieza",
    ayuda: "La encargamos a alguien. Es la única que se declara como música original.",
  },
  libreria_licenciada: {
    txt: "de una biblioteca",
    ayuda: "Artlist, Epidemic y similares. Guarda el enlace de la licencia y su plazo.",
  },
  generada_con_ia: {
    txt: "generada con IA",
    ayuda: "No tiene autor —Indecopi no la registra—, pero el PLAN con el que se generó decide si puedes usarla comercialmente.",
  },
};

/** ⚠ Los modos que casi siempre son una grabación comercial de un tercero. Son
 *  el único elemento del proyecto que puede bloquear un vídeo SOLO, sin que
 *  ninguna persona presente un reclamo: lo hace un sistema de identificación.
 *  Por eso el semáforo los trata aparte y la pantalla los filtra. */
const MODOS_DE_TERCERO: ModoAparicionMusical[] = [
  "ambiental_de_local_o_altavoz", "reproducida_por_organizador",
  "radio_o_television_en_escena",
];
export const esModoDeTercero = (m?: string | null) =>
  MODOS_DE_TERCERO.includes(baja(m) as ModoAparicionMusical);

export type FilaIncidental = {
  id: string;
  proyecto_id?: string | null;
  escena_o_plano?: string | null;
  descripcion_persona?: string | null;
  es_identificable?: boolean | null;
  tiene_protagonismo?: boolean | null;
  es_menor?: string | null;
  contexto_sensible?: boolean | null;
  aviso_filmacion_colocado?: boolean | null;
  decision_montaje?: string | null;
  resuelto?: boolean | null;
  nota?: string | null;
};

export type FilaUsoMusical = {
  id: string;
  proyecto_id?: string | null;
  timecode_inicio?: string | null;
  timecode_fin?: string | null;
  escena?: string | null;
  obra_id?: string | null;
  grabacion_id?: string | null;
  agrupacion_id?: string | null;
  modo_aparicion?: string | null;
  decision_montaje?: string | null;
  autorizacion_id?: string | null;
  resuelto?: boolean | null;
  nota?: string | null;
};

/** El riesgo de una aparición incidental. R7 del modelo, aplicado al montaje.
 *
 *  El art. 15 del Código Civil admite excepciones al consentimiento cuando la
 *  imagen se capta en un lugar público y la persona no es el objeto principal
 *  del plano. Por eso lo que decide aquí no es «¿sale?» sino identificable +
 *  protagonismo — y por eso el menor y el contexto sensible van aparte: ahí no
 *  hay excepción que valga. */
export function riesgoIncidental(i: FilaIncidental): { nivel: NivelRiesgo; txt: string } | null {
  if (i.resuelto) return null;
  const menor = baja(i.es_menor);
  const ident = i.es_identificable !== false;

  if (menor === "si" && ident)
    return { nivel: "critico", txt: "menor identificable sin autorización: solo cabe desenfocar o descartar" };
  if (menor === "por_revisar" && ident)
    return { nivel: "alto", txt: "puede ser menor y está sin revisar" };
  if (i.contexto_sensible && ident)
    return { nivel: "alto", txt: "contexto sensible: el lugar público no excusa el honor ni la intimidad" };
  if (ident && i.tiene_protagonismo)
    return { nivel: "alto", txt: "identificable y con protagonismo: no es incidental, necesita firma" };
  if (!ident)
    return { nivel: "bajo", txt: "no es identificable" };
  /* Identificable, sin protagonismo, en actividad pública. Es el caso que la
     excepción cubre — y baja más si además había cartel de filmación. */
  return i.aviso_filmacion_colocado
    ? { nivel: "bajo", txt: "incidental en actividad pública, con aviso de filmación colocado" }
    : { nivel: "medio", txt: "identificable en plano, sin aviso de filmación colocado" };
}

/** El riesgo de una música del corte. */
export function riesgoUsoMusical(u: FilaUsoMusical): { nivel: NivelRiesgo; txt: string } | null {
  if (u.resuelto) return null;
  if (esModoDeTercero(u.modo_aparicion))
    return {
      nivel: "critico",
      txt: `${META_MODO_MUSICAL[baja(u.modo_aparicion) as ModoAparicionMusical]?.txt || "de un tercero"}: grabación comercial que puede bloquear el vídeo sola`,
    };
  if (!u.obra_id && !u.agrupacion_id && !u.grabacion_id)
    return { nivel: "alto", txt: "suena algo sin identificar: no se sabe de quién es" };
  return { nivel: "medio", txt: "sin resolver en el corte" };
}

/* ══════════════ R8 · EL SEMÁFORO DE PUBLICACIÓN ══════════════
 *
 * La única métrica que importa, y la que va permanentemente en la cabecera:
 * ¿puedo publicar esto hoy?
 */

/** Un bloqueo, con SU ORIGEN. La tabla de la que sale cambia cómo se nombra —un
 *  incidental no es un permiso— y sin este campo el rótulo llamaba «permiso» a
 *  una decisión de montaje. */
export type Bloqueo = {
  id: string;
  nivel: NivelRiesgo;
  origen: "permiso" | "incidental" | "musica";
  txt: string;
};

export type Semaforo = {
  publicable: boolean;
  /** No hay ni una autorización. ⚠ No es «todo en regla»: o nadie ha empezado o
   *  la consulta falló, y las dos cosas se ven igual desde aquí. */
  sinDatos: boolean;
  /** Lo que lo impide, de peor a mejor. Vacío si se puede publicar.
   *  `origen` dice de qué tabla sale: la pantalla rotulaba «permiso» todo lo
   *  que salía de aquí, buscando el id entre las autorizaciones — y un
   *  incidental o una música NUNCA está ahí. Llamar «permiso» a una decisión de
   *  montaje borra justo la distinción que las dos tablas existen para
   *  mantener. */
  bloqueos: Bloqueo[];
  criticos: number;
  altos: number;
  abiertas: number;
  total: number;
};

export function semaforo(
  autorizaciones: FilaAutorizacion[],
  ctxDe: (a: FilaAutorizacion) => ContextoRiesgo = () => ({}),
  /* ── R8 COMPLETA ──
     ⚠ La definición de la regla dice «y ninguna AparicionIncidental o
     UsoMusicalEnCorte sin resolver». Sin estas dos listas el semáforo daba
     verde con la procesión entera de gente sin decidir y con la radio del
     comedor sonando de fondo — que son, respectivamente, el hueco que John
     nombró y lo único capaz de bloquear un vídeo sin que nadie reclame.
     Opcionales para no romper a quien ya llamaba con un argumento. */
  montaje: { incidentales?: FilaIncidental[]; usosMusicales?: FilaUsoMusical[] } = {},
): Semaforo {
  const bloqueos: Semaforo["bloqueos"] = [];
  let criticos = 0, altos = 0, abiertas = 0;

  /* ⚠ `criticos` y `altos` cuentan lo que BLOQUEA, no todas las filas de ese
     nivel. Contándolas todas, un permiso FIRMADO con el plazo vencido daba
     `criticos: 1` con `publicable: true` — y como la pantalla ordena las
     películas por críticos, esa subía a lo alto de la lista en verde. Los
     contadores y `bloqueos` medían dos cosas distintas y se leían como si
     midieran la misma. Ahora `criticos + altos === bloqueos.length`. */
  for (const a of autorizaciones) {
    const ctx = ctxDe(a);
    const r = riesgoDe(a, ctx);
    const abierta = estaAbierta(a.estado);
    if (abierta) abiertas++;

    /* ── QUÉ BLOQUEA, EXACTAMENTE ──
       Riesgo alto o crítico Y el permiso todavía sin resolver. Una firmada de
       riesgo alto no bloquea: el riesgo ya se asumió con el papel delante.
       ⚠ `rechazada` sí bloquea aunque no esté «abierta»: nadie va a firmar y el
       material sigue dentro. Es el caso que la primera versión de esta regla se
       dejaba fuera por definir «abierta» como «puede acabar en firma». */
    /* ⚠ Y TAMBIÉN CUANDO EL EQUIPO LO MARCÓ A MANO. Sin esto, `riesgo_manual`
       solo podía BAJAR el semáforo: marcar como crítica una firmada —«este
       release es defectuoso», «la firma está impugnada», que es el caso exacto
       para el que la columna existe— no tenía ningún efecto. Servía para tapar
       rojos y no para encender ninguno, o sea la mitad de lo que promete. */
    const marcada = !!baja(a.riesgo_manual);
    const cuenta = abierta || baja(a.estado) === "rechazada" || marcada;
    if (cuenta && (r === "alto" || r === "critico")) {
      if (r === "critico") criticos++; else altos++;
      /* El motivo de SU nivel; si el nivel viene de una marca manual no habrá
         ninguno calculado que coincida, y entonces se dice eso — y no
         «pendiente», que era el texto que salía y no explica nada.
         Un rojo sin motivo se deja de mirar, con todos los demás detrás. */
      const m = motivosRiesgo(a, ctx).filter(x => x.nivel === r)[0];
      bloqueos.push({
        id: a.id, nivel: r, origen: "permiso",
        txt: m?.txt || (marcada
          ? `marcada como ${r} a mano por el equipo${hay(a.notas) ? `: ${limpia(a.notas).slice(0, 120)}` : ""}`
          : "pendiente"),
      });
    }
  }

  /* ── LO DEL MONTAJE, QUE TAMBIÉN BLOQUEA ──
     Una decisión tomada y no aplicada sigue siendo una persona sin desenfocar
     en la película: por eso lo que se mira es `resuelto`, no la decisión. */
  const incidentales = montaje.incidentales || [];
  const usos = montaje.usosMusicales || [];
  for (const i of incidentales) {
    const r = riesgoIncidental(i);
    if (!r) continue;
    /* ⚠ `abiertas` FUERA del `if` de bloqueo. Dentro, solo se incrementaba para
       lo que además bloquea — y cuando algo bloquea, `resumenSemaforo` ni mira
       este número. Resultado: una persona identificable sin cartel de filmación,
       sin resolver, daba «se puede publicar · todo resuelto», con la fila
       pintada como pendiente tres líneas más abajo. */
    abiertas++;
    if (r.nivel === "alto" || r.nivel === "critico") {
      if (r.nivel === "critico") criticos++; else altos++;
      bloqueos.push({
        id: i.id, nivel: r.nivel, origen: "incidental",
        txt: `${i.escena_o_plano || "un plano"} · ${i.descripcion_persona || "alguien"}: ${r.txt}`,
      });
    }
  }
  for (const u of usos) {
    const r = riesgoUsoMusical(u);
    if (!r) continue;
    abiertas++;
    if (r.nivel === "alto" || r.nivel === "critico") {
      if (r.nivel === "critico") criticos++; else altos++;
      const donde = u.timecode_inicio || u.escena || "en el corte";
      bloqueos.push({ id: u.id, nivel: r.nivel, origen: "musica", txt: `${donde}: ${r.txt}` });
    }
  }

  bloqueos.sort((x, y) => PESO_RIESGO[y.nivel] - PESO_RIESGO[x.nivel]);
  /* ⚠ SIN DATOS NO ES «SE PUEDE PUBLICAR». Con la lista vacía no hay bloqueos,
     así que `bloqueos.length === 0` daba verde — y una lista vacía es tanto un
     proyecto donde nadie ha empezado como una consulta que falló. Es el error
     que la cabecera de este archivo jura no cometer, cometido en el booleano
     más importante que exporta. */
  /* ⚠ SOBRE LOS PERMISOS, y no sobre todo lo que haya.
     Con `&& !incidentales.length && !usos.length`, una película con CERO
     permisos y un solo incidental ya resuelto salía «✓ se puede publicar» en
     verde: `sinDatos` era false, no había bloqueos, y el veredicto era que sí.
     Es el mismo error que la cabecera de este archivo jura no cometer, colado
     por una vía nueva tres líneas más abajo. Sin ni un permiso registrado no se
     puede decir que se pueda publicar nada. */
  const sinDatos = !autorizaciones.length;
  return {
    publicable: !sinDatos && bloqueos.length === 0,
    sinDatos,
    bloqueos, criticos, altos, abiertas,
    total: autorizaciones.length + incidentales.length + usos.length,
  };
}

/** El titular del semáforo, en palabras. */
export function resumenSemaforo(s: Semaforo): string {
  if (!s.total) return "todavía no hay nada registrado";
  if (s.publicable)
    return s.abiertas
      ? `se puede publicar · quedan ${s.abiertas} sin cerrar, ninguno bloqueante`
      : "se puede publicar · todo resuelto";
  const partes: string[] = [];
  if (s.criticos) partes.push(`${s.criticos} crítico${s.criticos === 1 ? "" : "s"}`);
  if (s.altos) partes.push(`${s.altos} de riesgo alto`);
  return `NO se puede publicar · ${partes.join(" · ")}`;
}

/* ══════════════ R6 · QUIÉN NO PUEDE IR EN PROMOCIÓN ══════════════
 *
 * El tráiler, el afiche y la miniatura son lo que ve más gente y lo que se
 * publica antes, a veces años antes del estreno. Un permiso que autoriza salir
 * en la película y no en su promoción es frecuente y legítimo, y si no se puede
 * listar acaba incumpliéndose sin querer.
 */
export function sinUsoPromocional(autorizaciones: FilaAutorizacion[]): FilaAutorizacion[] {
  return autorizaciones.filter(a =>
    /* Solo entre las FIRMADAS: en una que no está firmada, el `false` es el
       valor por defecto de una fila a medio llenar y no una negativa de nadie.
       Acusar por eso llenaría la lista de gente que nunca dijo que no. */
    baja(a.estado) === "firmada" && a.permite_uso_promocional === false);
}
