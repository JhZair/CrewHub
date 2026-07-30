/* LOS TIPOS DE OBJETO DEL REPOSITORIO — en un solo sitio.
 *
 * Lista CERRADA a propósito, con un «otro» de escape. Si cada quien inventa su
 * tipo, el filtro deja de servir y el repositorio se vuelve un cajón de sastre
 * — que es justo lo que vino a evitar. Trece entradas cubren lo que una
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
  { key: "formacion", ico: "🎓", lbl: "Formación", pista: "Estudios, taller, laboratorio, residencia, diplomado" },
  { key: "contrato", ico: "✍️", lbl: "Contrato", pista: "Acuerdo, adenda, carta de compromiso" },
  { key: "foto", ico: "🖼", lbl: "Fotografía", pista: "Retrato, foto fija, material gráfico" },
  { key: "nota", ico: "🗒", lbl: "Nota", pista: "Algo que conviene recordar (puede no tener link)" },
  { key: "otro", ico: "📦", lbl: "Otro" },
];

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
