/* LOS TIPOS DE OBJETO DEL REPOSITORIO — en un solo sitio.
 *
 * Lista CERRADA a propósito, con un «otro» de escape. Si cada quien inventa su
 * tipo, el filtro deja de servir y el repositorio se vuelve un cajón de sastre
 * — que es justo lo que vino a evitar. Catorce entradas cubren lo que una
 * productora acumula de una persona, una empresa o una película.
 *
 * `cv` está en la lista porque vive en la misma tabla, pero tiene su propia
 * sección en la ficha (el enfoque se cruza con el cargo de cada postulación),
 * así que el repositorio genérico no lo ofrece.
 */

export type TipoObjeto = {
  key: string;
  ico: string;
  lbl: string;
  /** Frase para el formulario, que dice qué se espera ahí. */
  pista?: string;
  /** Días tras los cuales conviene refrescarlo. Solo unos pocos caducan. */
  caduca?: number;
};

export const TIPOS_OBJETO: TipoObjeto[] = [
  { key: "obra", ico: "🎬", lbl: "Obra", pista: "Película, corto, videojuego, montaje" },
  { key: "publicacion", ico: "📖", lbl: "Publicación", pista: "Libro, artículo, capítulo" },
  { key: "investigacion", ico: "🔬", lbl: "Investigación", pista: "Estudio, trabajo de campo, archivo" },
  /* Material de TERCEROS que alimenta el trabajo — no es obra propia. Un
     documental ajeno sobre los khipus, un paper, un archivo consultado. Se
     separa de «obra» y de «investigación» a propósito: es lo que DAFO exige
     declarar aparte como material de archivo, con su fuente y sus derechos. */
  { key: "referencia", ico: "🔖", lbl: "Referencia", pista: "Fuente consultada: video, paper, archivo de terceros" },
  { key: "premio", ico: "🏆", lbl: "Premio o selección", pista: "Festival, reconocimiento, mención" },
  { key: "prensa", ico: "📰", lbl: "Prensa", pista: "Nota, entrevista, reseña" },
  { key: "red", ico: "🔗", lbl: "Red o web", pista: "Instagram, web personal, Vimeo" },
  { key: "certificado", ico: "📜", lbl: "Certificado", pista: "Constancia, diploma, acreditación" },
  /* Formación como HECHO de la trayectoria (se estudió tal cosa, con quién,
     cuándo), distinta del certificado que la acredita — un taller con un
     maestro reconocido pesa en el CV aunque nunca diera papel. Alimenta la
     sección Formación de los CVs por postulación (PLAN-CVS-POSTULACION.md).
     `datos` jsonb: { institucion, grado }. */
  /* ── ⚠ APRENDER ALGO NO ES LO MISMO QUE HABERLO ESTUDIADO ──
     Estos dos se tocan y por eso van juntos, para que al elegir se vea la
     diferencia en vez de adivinarla:

     · CURSO es el MATERIAL: un tutorial, una guía, una clase grabada. Sirve
       para aprender a hacer algo, o para pasárselo a quien entra al equipo.
       No dice nada de la trayectoria de nadie.
     · FORMACIÓN es el HECHO: que alguien estudió tal cosa, con quién y
       cuándo. Eso alimenta la sección Formación de los CV por postulación.

     Guardar un tutorial como «formación» le metería a alguien en el CV un
     curso que no llevó; guardarlo como «publicación» o «referencia» lo
     esconde entre las fuentes que se citan en una obra, que es otro estante y
     otra intención —la referencia además arrastra derechos y fuente, porque
     es lo que DAFO exige declarar del material de archivo—.
     La pregunta que los separa: ¿esto es algo que MIRAR para aprender, o algo
     que ALGUIEN HIZO? */
  { key: "curso", ico: "📚", lbl: "Curso o tutorial", pista: "Curso, clase grabada, tutorial, guía — para aprender o enseñar al equipo" },
  { key: "formacion", ico: "🎓", lbl: "Formación", pista: "Lo que alguien estudió: taller, laboratorio, residencia, diplomado" },
  { key: "contrato", ico: "✍️", lbl: "Contrato", pista: "Acuerdo, adenda, carta de compromiso" },
  { key: "foto", ico: "🖼", lbl: "Fotografía", pista: "Retrato, foto fija, material gráfico" },
  { key: "nota", ico: "🗒", lbl: "Nota", pista: "Algo que conviene recordar (puede no tener link)" },
  { key: "otro", ico: "📦", lbl: "Otro" },
];

/* ══════════════════════════════════════════════════════════════════════════
   🏠 LA CASA: EL DUEÑO QUE NO ES UNA FICHA

   Todo lo demás del repositorio pertenece a alguien —una obra es de un
   proyecto, un premio de una persona— y por eso sale en SU ficha. Pero hay
   material que es del equipo y de nadie: un curso, una plantilla de contrato,
   una guía de estilo, la normativa del cine. No es «de» ninguna productora.

   Forzarlo a una empresa tenía dos costes, y ninguno era pequeño:
   · La ficha de esa empresa acababa enseñando un tutorial entre sus premios y
     sus publicaciones, que es lo contrario de lo que ese apartado dice de ella.
   · Y aquí se trabaja con varias productoras a la vez, así que cuál elegir era
     arbitrario — y lo arbitrario se decide distinto cada vez, que es como un
     filtro deja de servir.

   Así que «la casa» es un dueño sin ficha: `entidad_tipo = 'casa'` y
   `entidad_id` nulo. Solo aparece en /repositorio, con su filtro propio.

   ⚠ NO está en `SECCIONES` a propósito, y no puede estarlo: esa lista es de
   entidades con tabla, ruta y ficha, y la casa no tiene ninguna de las tres.
   Meterla ahí le abriría una ruta `/entidad/casa/...` que no existe y saldría
   como sección vacía en media aplicación.
   ══════════════════════════════════════════════════════════════════════════ */
export const DUENO_CASA = "casa";
export const CASA_ICO = "🏠";
export const CASA_LBL = "la casa";
/** ¿El dueño de este objeto es la casa? Se pregunta por el tipo y nunca por
 *  el id: el id es NULO justo en este caso. */
export const esDeLaCasa = (t: string | null | undefined) => t === DUENO_CASA;

/* El CV vive en la misma tabla pero no se ofrece aquí: tiene su sección propia,
   con el enfoque sacado de las especialidades de la persona. */
export const TIPO_CV = "cv";
export const DIAS_CV = 365;

export const TIPO_OBJ = Object.fromEntries(TIPOS_OBJETO.map(t => [t.key, t])) as Record<string, TipoObjeto>;

export const icoObjeto = (k: string) => TIPO_OBJ[k]?.ico || (k === TIPO_CV ? "📋" : "📦");
export const lblObjeto = (k: string) => TIPO_OBJ[k]?.lbl || (k === TIPO_CV ? "CV" : k);

/** Orden de presentación: el de la lista, y lo desconocido al final. */
export const ordenObjeto = (k: string) => {
  const i = TIPOS_OBJETO.findIndex(t => t.key === k);
  return i === -1 ? 99 : i;
};
