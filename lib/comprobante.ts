/* ── CUANDO UN RECIBO SE REGISTRA COMO FACTURA ──
 *
 * Las dos cosas se parecen en pantalla —un emisor, un número, un importe— y no
 * se parecen en nada de lo que importa después:
 *
 *   · Un RHE cuenta para el TOPE de 4ta de esa persona, y pasarlo obliga a
 *     retener el 8 % el resto del año.
 *   · Un RHE necesita la constancia de suspensión del año para justificar la
 *     retención cero.
 *   · La pestaña Equipo del fondo se arma desde `rhe`: quien cobró por factura
 *     no aparece como que trabajó ahí.
 *   · El informe económico de DAFO separa honorarios de bienes y servicios.
 *
 * Nada de eso falla ruidosamente. Simplemente la persona no sale en la nómina,
 * su tope no avanza y nadie le pide la constancia — y el descuadre aparece el
 * día de la rendición, cuando ya no hay margen.
 *
 * ── LA SEÑAL ──
 * RUC que empieza en 10 = persona natural. Serie E### = la serie electrónica
 * de los recibos por honorarios. Las dos juntas casi siempre son un RHE.
 *
 * «Casi siempre» y no «siempre», y por eso esto AVISA en vez de impedir: una
 * persona natural con negocio (RUS o MYPE) emite facturas legítimamente. Lo
 * que no hace es emitirlas con serie E001 —esa se reserva a los recibos—, así
 * que hace falta que se cumplan las dos condiciones para decir nada.
 */

/** RUC de persona natural: los de empresa empiezan en 20. */
export const esPersonaNatural = (ruc?: string | null) =>
  /^10\d{9}$/.test(String(ruc || "").replace(/\D/g, ""));

/** Serie electrónica de recibo por honorarios: E + tres dígitos. */
export const esSerieRhe = (serie?: string | null) =>
  /^E\d{3}$/i.test(String(serie || "").trim());

/** ¿Esto huele a recibo por honorarios registrado como comprobante? */
export const pareceRhe = (c: { tipo?: string | null; ruc?: string | null; serie?: string | null }) =>
  c.tipo !== "recibo_servicio" && esPersonaNatural(c.ruc) && esSerieRhe(c.serie);

export const AVISO_PARECE_RHE =
  "El RUC es de persona natural y la serie es de recibo por honorarios (E###). "
  + "Si lo es, su sitio es el bloque de RHE: ahí cuenta para el tope de 4ta, "
  + "pide la constancia de suspensión y la persona aparece en el equipo del "
  + "fondo. Como factura no hace ninguna de las tres cosas. "
  + "Si de verdad es una factura de una persona natural con negocio, ignora "
  + "este aviso — pero entonces la serie no debería empezar por E.";
