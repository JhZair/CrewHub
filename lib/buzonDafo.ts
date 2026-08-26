/* ══════════════════════════════════════════════════════════════════════════
   EL BUZÓN DE COMUNICACIONES — la tercera ventanilla

   DAFO habla por tres sitios distintos y ninguno avisa al otro:
     · el CORREO, que entra solo (Apps Script → /api/ingesta/dafo)
     · la CASILLA ELECTRÓNICA, que notifica cartas en PDF
     · y el BUZÓN DE COMUNICACIONES de la plataforma de concursos, que es un
       hilo por proyecto donde escriben los dos lados.

   El tercero es el más valioso y el más invisible: ahí está la conversación
   real —«consultamos si podemos entregar el video por enlace», «se le
   requirió y no cumplió, su solicitud se tiene por NO PRESENTADA»— y no llega
   a ninguna parte. Si nadie entra, no existe.

   No hay API. Lo que sí se puede es SELECCIONAR la tabla del buzón y pegarla:
   este archivo la convierte en mensajes.

   ── SE PARTE POR LA CABECERA DE CADA FILA, NO POR LÍNEAS ──
   Un mensaje ocupa veinte renglones con párrafos, listas y líneas en blanco.
   Partir por saltos de línea o por tabuladores sería adivinar cómo copió el
   navegador. Lo único estable es el arranque de cada fila: quién escribe, su
   código y la fecha con hora. Eso se busca, y todo lo que hay hasta el
   siguiente arranque es el cuerpo.

   ── EL CÓDIGO ES LA LLAVE ──
   Cada mensaje trae el suyo («060-2023-DAFO-29»). Guardarlo es lo que permite
   pegar el buzón entero cada mes sin duplicar lo de la vez anterior: los que
   ya están se reconocen y se quedan fuera.
   ══════════════════════════════════════════════════════════════════════════ */

export type MensajeBuzon = {
  /** «060-2023-DAFO-29». Único dentro del proyecto. */
  codigo: string;
  /** `POSTULANTE` (lo escribimos nosotros) o el Ministerio. */
  deNosotros: boolean;
  remitente: string;
  /** `YYYY-MM-DD` */
  fecha: string;
  /** `13:10:32`, tal como lo enseña la plataforma. */
  hora: string;
  /** El mensaje entero, con sus saltos de línea. */
  texto: string;
  /** La primera línea con sustancia, para el titular del hito. */
  titulo: string;
  /** El expediente al que pertenece («060-2023-DAFO»), sacado de su código.
   *  Sirve para comprobar que lo pegado es de ESTE fondo. */
  expediente: string;
};

/* ── LA CABECERA DE UNA FILA ── quién, su código, la fecha y la hora.
   Dos exigencias que no son cosméticas:

   · EMPIEZA RENGLÓN (`^` con `m`). Una cabecera a mitad de una frase no es una
     fila de la tabla.
   · Y entre las celdas hay TABULADOR o SALTO DE LÍNEA, nunca espacios sueltos
     (`[ \t]*[\t\n][\s]*`). Es lo que separa una fila copiada de la tabla de
     una CITA dentro de un mensaje: cuando alguien pega en su respuesta el
     encabezado del mensaje anterior —«MINISTERIO DE CULTURA 060-2023-DAFO-26
     2025/04/22 14:42:48»— lo pega como texto corrido, con espacios. Sin esta
     distinción, esa cita se leía como un mensaje MÁS: partía nuestro mensaje
     en dos y creaba un fantasma del Ministerio con texto nuestro dentro —que
     además se quedaba con el `ref` del mensaje real y lo bloqueaba para
     siempre—. */
const SEP = "[ \\t]*[\\t\\n]\\s*";
const CABECERA = new RegExp(
  `^[ \\t]*(POSTULANTE|MINISTERIO DE CULTURA|DAFO|MINISTERIO)${SEP}` +
  `((?:\\d{2,4}-\\d{4}-[A-Z]+)-\\d{1,4})${SEP}` +
  `(\\d{4})[/-](\\d{2})[/-](\\d{2})${SEP}(\\d{2}:\\d{2}(?::\\d{2})?)`,
  "gim");

/** ¿Es una fecha que existe? `2026/13/45` casa con el patrón y llegaría a una
 *  columna `date` a reventar el guardado — o peor, a guardarse rodada. */
function fechaValida(a: string, m: string, d: string): boolean {
  const f = new Date(`${a}-${m}-${d}T12:00:00`);
  return !isNaN(f.getTime())
    && f.getFullYear() === Number(a)
    && f.getMonth() + 1 === Number(m)
    && f.getDate() === Number(d);
}

/* ── EL TITULAR: LO PRIMERO QUE DICE ALGO ──
   Casi todos los mensajes empiezan igual —«Estimados miembros de la DAFO:»,
   «Reciban un cordial saludo»— y veinte hitos titulados con el mismo saludo
   son veinte hitos que no dicen nada. Así que se saltan las fórmulas y, cuando
   la fórmula comparte renglón con lo importante («Reciban un cordial saludo.
   Escribo en relación al requisito…»), se corta por la primera frase.
   Es un apaño, no una regla: el titular queda editable antes de guardar. */
const SALUDO = /^(estimad|se[ñn]or|buen[oa]s|reciban|de nuestra|nos dirigimos|le saludamos|mediante el presente le saludamos|es grato)/i;
/* Fórmulas que preceden a lo que de verdad se dice: se quitan y lo de detrás
   sirve de titular. */
const PREFIJOS = /^(por medio del presente|mediante el presente|al respecto|en atenci[óo]n a lo anterior|sobre el particular)[,:\s]+/i;

function limpiaLinea(l: string): string {
  let s = l.trim().replace(PREFIJOS, "").trim();
  /* La fórmula va pegada a lo bueno en el mismo renglón: se tira la primera
     frase y se mira lo que queda. */
  if (SALUDO.test(s)) {
    const punto = s.indexOf(". ");
    s = punto > 0 && punto < 90 ? s.slice(punto + 2).trim().replace(PREFIJOS, "").trim() : "";
  }
  return s;
}

function tituloDe(texto: string): string {
  const lineas = texto.split("\n").map(s => s.trim()).filter(Boolean);
  const util = lineas.map(limpiaLinea).find(l => l.length > 25)
    || lineas.find(l => l.length > 25) || lineas[0] || "";
  /* Cortado por palabras: un título partido a mitad de palabra se lee peor que
     uno corto. El texto entero queda en el detalle, así que no se pierde nada. */
  if (util.length <= 120) return util;
  const corte = util.slice(0, 120);
  return corte.slice(0, corte.lastIndexOf(" ") > 60 ? corte.lastIndexOf(" ") : 120).trim() + "…";
}

/**
 * Los mensajes que hay en el texto pegado, del más nuevo al más viejo tal como
 * los da la plataforma (no se reordenan: el orden lo pone quien los pinta).
 *
 * Un texto que no sea el buzón devuelve una lista vacía. Nunca lanza: quien
 * pega algo raro tiene que ver «no encontré ningún mensaje», no una pantalla
 * en blanco.
 */
export function leerBuzon(pegado: string): MensajeBuzon[] {
  const t = String(pegado || "").replace(/\r\n?/g, "\n");
  if (!t.trim()) return [];

  const heads: { i: number; fin: number; quien: string; codigo: string; fecha: string; hora: string }[] = [];
  CABECERA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CABECERA.exec(t))) {
    /* Una fecha imposible se descarta aquí: dejarla pasar la mandaría tal cual
       a una columna `date`, y lo que se rompe entonces es el guardado del lote
       entero. */
    if (!fechaValida(m[3], m[4], m[5])) continue;
    heads.push({
      i: m.index, fin: m.index + m[0].length,
      quien: m[1].toUpperCase(), codigo: m[2].toUpperCase(),
      fecha: `${m[3]}-${m[4]}-${m[5]}`,
      hora: m[6].length === 5 ? `${m[6]}:00` : m[6],
    });
  }

  const out: MensajeBuzon[] = [];
  const vistos = new Set<string>();
  for (let n = 0; n < heads.length; n++) {
    const h = heads[n];
    const hasta = n + 1 < heads.length ? heads[n + 1].i : t.length;
    const texto = t.slice(h.fin, hasta)
      /* La última columna de la tabla («ARCHIVO») copia un icono o queda
         vacía; y los tabuladores de las celdas se vuelven espacios. */
      .replace(/\t+/g, " ")
      .split("\n").map(l => l.trimEnd()).join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!texto) continue;
    /* El mismo código dos veces en el mismo pegado: la plataforma repite la
       fila al paginar. Se queda la primera. */
    if (vistos.has(h.codigo)) continue;
    vistos.add(h.codigo);
    out.push({
      codigo: h.codigo,
      /* «060-2023-DAFO-29» → «060-2023-DAFO»: el expediente es todo menos el
         número de orden del mensaje. */
      expediente: h.codigo.replace(/-\d{1,4}$/, ""),
      deNosotros: h.quien === "POSTULANTE",
      remitente: h.quien === "POSTULANTE" ? "Nosotros" : "Ministerio de Cultura",
      fecha: h.fecha, hora: h.hora,
      texto, titulo: tituloDe(texto),
    });
  }
  return out;
}

/** El `ref` con el que se guarda un mensaje del buzón, y con el que se
 *  reconoce que ya está. Lleva prefijo para no chocar nunca con otra
 *  procedencia futura. */
export const refBuzon = (codigo: string) => `buzon:${String(codigo || "").toUpperCase()}`;
