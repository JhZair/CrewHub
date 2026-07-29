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

export function pideAccion(asunto?: string | null, extracto?: string | null): boolean {
  const t = sinTildes(`${asunto || ""} ${extracto || ""}`);
  return AGUJAS_ACCION.some(a => t.includes(a));
}

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
