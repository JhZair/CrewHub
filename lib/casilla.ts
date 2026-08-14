/* ── DE QUÉ ES UN CORREO DE DAFO — decidido en un solo sitio ──
 *
 * Lo usan la ingesta (servidor) y el panel (cliente), así que este archivo no
 * importa nada de Supabase ni de servidor: en cuanto lo hiciera, el panel
 * dejaría de compilar y la regla acabaría copiada en dos lados con palabras
 * distintas. Es la misma lección de lib/fondos.ts.
 */

/* Normaliza un código para compararlo: DAFO escribe el mismo expediente con
   guiones, espacios o barras según el correo, y «CDO-P-00094-26» y
   «CDO P 00094 26» son el mismo expediente. */
export const normCod = (s?: string | null) =>
  String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* Los candidatos a código que trae un texto.
 *
 * El separador es SOLO guion o barra, nunca espacio ni punto. La primera
 * versión incluía el espacio y eso rompía el emparejamiento justo en el caso
 * normal: en «Notificacion de subsanacion CDO-P-00094-26 del expediente» el
 * espacio pegaba todo en un único token gigante
 * («NOTIFICACIONDESUBSANACIONCDOP0009426DELEXPEDIENTE») que ya no casaba con
 * ningún código en ninguna dirección. El correo quedaba sin vincular teniendo
 * el código escrito en el asunto — y el síntoma no era un error, era silencio.
 *
 * Exige un dígito: sin eso, «Ministerio-de-Cultura» entra como código y empieza
 * a emparejar con cualquier cosa. Y exige 8 caracteres útiles: más corto que
 * eso, un fragmento como «P-074» aparece en media docena de expedientes y el
 * vínculo sería una moneda al aire.
 */
const RE_TOKEN = /[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)+/g;

/* «2026-07-29» normalizado es «20260729»: ocho caracteres con dígitos, o sea un
   candidato perfectamente válido según la regla de arriba. Y las fechas están
   en todos los asuntos. Fuera. */
const pareceFecha = (n: string) => /^(19|20)\d{6}$/.test(n);

export function candidatosCodigo(texto: string): string[] {
  const out = new Set<string>();
  for (const m of String(texto || "").match(RE_TOKEN) || []) {
    const n = normCod(m);
    if (n.length >= 8 && /\d/.test(n) && !pareceFecha(n)) out.add(n);
  }
  return [...out];
}

export type PostMin = {
  id: string;
  codigo?: string | null;
  codigo_plataforma?: string | null;
  estado?: string | null;
  empresa_id?: string | null;
  /* Para saber si una ganadora sigue viva (lib/fondos.ts → ejecutando). Sin
     ella, una que ya rindió se lee igual que una que debe. */
  fecha_rendicion_real?: string | null;
};

/* ¿De qué postulación habla este texto?
 *
 * Devuelve el id SOLO si hay una única candidata. Si dos postulaciones
 * casan con el mismo fragmento, se devuelve null a propósito: un vínculo
 * inventado es peor que ninguno — el correo aparece «sin vincular» en el
 * panel, que es una pregunta, mientras un vínculo falso es una respuesta
 * equivocada que nadie va a revisar.
 */
export function vincularPorCodigo(texto: string, posts: PostMin[]): string | null {
  const cands = candidatosCodigo(texto);
  if (!cands.length) return null;
  const hits = new Set<string>();
  for (const p of posts) {
    for (const c of [p.codigo, p.codigo_plataforma]) {
      const n = normCod(c);
      if (n.length < 8) continue;
      // En los dos sentidos: el asunto puede traer el código entero o solo
      // su cabeza («CDO-P-00094-26» de «CDO-P-00094-26-P-074-Solischa»).
      if (cands.some(x => n.includes(x) || x.includes(n))) { hits.add(p.id); break; }
    }
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/* ── ¿Este correo pide algo DE MÍ? ──
 * Sin acentos en las agujas y comparando en minúsculas: DAFO escribe
 * «SUBSANACIÓN», «Subsanacion» y «subsanación» en el mismo mes. Se buscan
 * raíces, no palabras completas, para que «subsanar»/«subsanación» entren
 * con una sola aguja.
 *
 * La primera versión traía «notificaci», «resoluci», «plazo» y «presentar», y
 * eso encendía el 🚨 en toda la bandeja: DAFO titula la mitad de sus correos
 * «Notificación de…» y casi todos mencionan un plazo. Un semáforo que siempre
 * está en rojo no es un semáforo — la marca solo sirve si distingue.
 *
 * Así que quedan únicamente las que nombran un ACTO que exige respuesta. Ni
 * «plazo» ni «resolución» entran: acompañan tanto a un requerimiento de cinco
 * días como a una resolución que solo se archiva, y el que sí exige respuesta
 * trae además una de estas palabras.
 *
 * Es una sospecha que ORDENA la lista, no un estado del expediente. Por eso
 * no abre casos sola: eso lo decide una persona, en el panel.
 */
export const AGUJAS_ACCION = [
  "subsan",        // subsanar, subsanación
  "requerimient",  // requerimiento (no «requiere», que aparece en cualquier instructivo)
  "apercib",       // apercibimiento
  "observaci", "observado",
  "absolv", "absoluc",
  "aclaraci",
  "improceden",
  "desist",
  "descargo",
];

const sinTildes = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/* Prefijos de reenvío. Importan porque el correo viejo se rescata reenviándolo
   a mano al maestro, y «Fwd: CONSTANCIA…» tiene que seguir siendo una
   constancia. Se quitan hasta tres veces: los hilos reenviados acumulan. */
const PREFIJOS = /^\s*(?:re|rv|fwd|fw)\s*:\s*/i;
const limpio = (s?: string | null) => {
  let t = String(s || "");
  for (let i = 0; i < 3; i++) t = t.replace(PREFIJOS, "");
  return sinTildes(t.trim());
};

/* ── LAS CONSTANCIAS SON RECIBOS, NO PEDIDOS ──
 * Descubierto con 17 correos reales de una cuenta (30/07/2026), no supuesto:
 * DAFO acusa recibo de lo que TÚ mandas con asuntos que empiezan por
 * «CONSTANCIA DE…», y esos asuntos contienen las mismas palabras que las
 * agujas. «CONSTANCIA DE ENVÍO DE SUBSANACIÓN - DAFO» traía «subsan» y
 * encendía el 🚨; «CONSTANCIA DE ENVÍO DE POSTULACIÓN» dice en el cuerpo
 * «vinculada a las observaciones» y traía «observaci». De 17 correos, la
 * alarma sonaba en 3 que no la merecían.
 *
 * Un semáforo que se pone rojo cuando TÚ entregaste algo es peor que no
 * tenerlo: enseña a ignorarlo. Por eso esta regla GANA sobre las agujas.
 *
 * `startsWith` y no `includes`: «Requerimiento sobre su constancia» es un
 * requerimiento de verdad y tiene que seguir sonando. La palabra solo manda
 * cuando encabeza el asunto, que es donde DAFO la usa como tipo de documento.
 */
export function esAcuse(asunto?: string | null): boolean {
  return limpio(asunto).startsWith("constancia");
}

/* La clave de un solo uso para entrar a la plataforma. Se guarda —queda el
   rastro de quién entró y cuándo— pero no suena: avisar al celular de un
   código que tú mismo acabas de pedir es ruido puro. */
export function esRuido(asunto?: string | null): boolean {
  return limpio(asunto).startsWith("codigo de verificacion");
}

export function pideAccion(asunto?: string | null, extracto?: string | null): boolean {
  if (esAcuse(asunto)) return false;
  const t = sinTildes(`${asunto || ""} ${extracto || ""}`);
  return AGUJAS_ACCION.some(a => t.includes(a));
}

/* ══════════════════════════════════════════════════════════════════
   ¿ESTE CORREO ES DE DAFO, O SOLO CAYÓ EN LA CUENTA?
   ══════════════════════════════════════════════════════════════════

   El filtro de Gmail reenvía TODO lo que llega a las veintiuna cuentas de
   postulación, y tiene que ser así: DAFO escribe desde direcciones que no se
   pueden listar de antemano —los evaluadores usan su Gmail personal— así que
   filtrar por remitente en Gmail dejaría fuera lo importante.

   La consecuencia es que en la casilla aparecen «Estás usando Gemini en la
   web» y «Security alert» como si fueran la última señal de una postulación.
   Y eso no es un adorno feo: la columna se llama «último correo» y es lo que
   se mira para saber si un expediente está callado. Un aviso de Google
   ocupando ese sitio dice que hubo movimiento donde no lo hubo — que es la
   forma más cara de mentir en este panel, porque la respuesta parece buena.

   ── POR QUÉ NO SE BORRA NADA ──
   Se CLASIFICA, no se descarta. Un «Security alert» en la cuenta de una
   postulación es justamente algo que hay que mirar —alguien intentando entrar
   al correo por donde llegan las notificaciones del Estado— y tirarlo sería
   cambiar un ruido por un punto ciego. Lo que cambia es dónde vive: fuera de
   la columna que responde «¿DAFO dijo algo?».

   ── LA REGLA ES POSITIVA, NO UNA LISTA NEGRA ──
   Enumerar remitentes indeseables es una carrera que se pierde: mañana llega
   otro boletín. Se declara qué SÍ es de DAFO y el resto cae en «otro», que es
   un cajón visible y no un agujero. Si algo de DAFO cae ahí, se ve y se
   corrige la regla; al revés —un ruido colado como DAFO— no se ve nunca.
*/
export type ClaseCorreo = "dafo" | "cuenta" | "otro";

/* El Estado escribe desde sus dominios; eso es lo único que no admite duda. */
const DOM_ESTADO = /(^|[@.])(cultura\.gob\.pe|gob\.pe)$/i;

/* Google hablando de la cuenta misma: seguridad, códigos, novedades del
   producto. No es DAFO ni es un tercero — es el buzón hablando de sí mismo, y
   merece su propio cajón porque alguna de estas sí importa. */
const DOM_GOOGLE = /(^|[@.])(google\.com|accounts\.google\.com|gemini\.google\.com|youtube\.com)$/i;

const dominioDe = (de?: string | null): string => {
  const m = /<([^>]+)>/.exec(String(de || ""));
  const dir = (m ? m[1] : String(de || "")).trim();
  const at = dir.lastIndexOf("@");
  return at < 0 ? "" : dir.slice(at + 1).trim().toLowerCase();
};

/* Vocabulario del trámite. Va DESPUÉS del dominio y del vínculo: es la red de
   seguridad para el correo que manda una evaluadora desde su Gmail personal,
   no el criterio principal. Palabras largas y propias del oficio — nada de
   «cultura» o «proyecto», que salen en cualquier boletín de cine. */
const PALABRAS_DAFO = [
  "dafo", "estimulos economicos", "ministerio de cultura",
  "expediente", "postulacion", "convocatoria", "bases integradas",
  "subsan", "requerimient", "apercib", "constancia de envio",
  "resolucion directoral", "acta de compromiso", "rendicion de cuentas",
];

export function claseCorreo(
  remitente?: string | null, asunto?: string | null, extracto?: string | null,
  /** Si la ingesta ya lo ató a una postulación POR EL CÓDIGO, no hay más que
   *  discutir: un correo que cita el número de expediente es del expediente,
   *  lo mande quien lo mande. El vínculo «cuenta» no vale para esto — ese se
   *  dedujo de en qué buzón cayó, que es exactamente lo que aquí se pone en
   *  duda. */
  vinculoPor?: string | null,
): ClaseCorreo {
  const dom = dominioDe(remitente);
  if (DOM_ESTADO.test(dom)) return "dafo";
  if (vinculoPor === "codigo" || vinculoPor === "manual") return "dafo";
  if (DOM_GOOGLE.test(dom)) return "cuenta";
  const t = sinTildes(`${asunto || ""} ${extracto || ""}`);
  if (PALABRAS_DAFO.some(w => t.includes(w))) return "dafo";
  return "otro";
}

export const META_CLASE: Record<ClaseCorreo, { ico: string; txt: string; col: string; ayuda: string }> = {
  dafo:   { ico: "🏛", txt: "DAFO", col: "var(--teal)",
    ayuda: "Del Ministerio, o cita el código del expediente." },
  cuenta: { ico: "🔐", txt: "la cuenta", col: "var(--yellow)",
    ayuda: "Google hablando del buzón: seguridad, códigos, novedades. No es DAFO, pero un aviso de seguridad en la cuenta por donde llegan las notificaciones sí hay que mirarlo." },
  otro:   { ico: "📨", txt: "otro", col: "var(--dim)",
    ayuda: "Ni del Ministerio ni de Google, y sin vocabulario de trámite: boletines, publicidad, correo suelto. Si ves algo de DAFO aquí, dilo — la regla se corrige." },
};

/* El link al hilo en Gmail, armado con el buzón donde de verdad está.
 * Sin `authuser` el enlace abre la cuenta que el navegador tenga cargada, y
 * con varias sesiones de Google eso deja al lector mirando otra bandeja
 * preguntándose dónde está el correo. Es el mismo motivo por el que las
 * credenciales arman su puerta con su propio correo (lib/puertas.ts). */
export function linkGmail(threadId?: string | null, buzon?: string | null): string | null {
  if (!threadId) return null;
  const base = buzon
    ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(buzon)}`
    : "https://mail.google.com/mail/u/0";
  return `${base}#all/${threadId}`;
}

/* Cómo se supo de qué postulación es. Se muestra al lado del vínculo: un
   vínculo deducido y uno confirmado no valen lo mismo. */
/* El asunto MANDA; el cuerpo es solo el respaldo.
 * Una resolución de DAFO puede listar en el cuerpo los códigos de veinte
 * beneficiarios: buscando en todo de una vez, un correo dirigido a un
 * expediente se vincularía a otro que solo aparecía mencionado — o, si salen
 * dos de los nuestros, se quedaría sin vincular teniendo el código correcto en
 * el asunto. Primero se le pregunta al asunto, que es de quien va dirigido.
 */
export function vincularPorAsuntoOCuerpo(
  asunto: string, extracto: string, posts: PostMin[],
): string | null {
  return vincularPorCodigo(asunto, posts) || vincularPorCodigo(extracto, posts);
}

export const ORIGEN_VINCULO: Record<string, { ico: string; txt: string; col: string }> = {
  codigo: { ico: "🎯", txt: "por el código del asunto", col: "var(--teal)" },
  cuenta: { ico: "📧", txt: "deducido de la cuenta", col: "var(--yellow)" },
  manual: { ico: "✋", txt: "vinculado a mano", col: "var(--green)" },
};

/* Días desde la última señal, para el resumen por postulación. Null cuando
   nunca hubo contacto: «—» dice la verdad, «0 días» mentiría. */
export const diasDesde = (iso?: string | null): number | null =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

/* Solo el nombre de quien escribe: el remitente viene como
   «DAFO Estímulos <notificaciones@cultura.gob.pe>» y en una lista de
   cincuenta filas el correo entre picos no aporta nada. */
export const soloNombre = (de?: string | null) => {
  const s = String(de || "").trim();
  const m = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(s);
  return (m ? m[1].trim() : s.replace(/[<>]/g, "")) || "—";
};
