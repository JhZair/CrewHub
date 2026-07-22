/* Vista previa de un link de documento (para verlo sin abrirlo y cazar el que
   dejaron equivocado). Casi todos los links del equipo son de Google Drive; de
   su ID sale una miniatura que sirve igual para imágenes y PDFs (primera
   página). Para un link directo a una imagen, la propia URL es la miniatura. */

/* Saca el ID de archivo de un link de Drive en sus formas conocidas:
     .../file/d/ID/view      ?id=ID       .../d/ID       .../open?id=ID
   Devuelve null si no parece de Drive. */
export function driveFileId(url?: string | null): string | null {
  const s = (url || "").trim();
  if (!s) return null;
  const m =
    s.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) ||
    s.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

/* Enlace canónico para ABRIR el archivo. Si es un link de Drive, se reconstruye
   `.../file/d/ID/view` desde el ID — así funciona aunque la URL guardada venga
   recortada (el historial truncaba a 70 chars y rompía el link, pero el ID casi
   siempre queda entero). Si no es de Drive, se devuelve tal cual. */
export function enlaceLimpio(url?: string | null): string {
  const s = (url || "").trim();
  const id = /drive\.google\.com/.test(s) ? driveFileId(s) : null;
  return id ? `https://drive.google.com/file/d/${id}/view` : s;
}

const EXT_IMG = /\.(png|jpe?g|gif|webp|bmp|avif|svg)(\?|#|$)/i;

/* Id de un video de YouTube en sus formas habituales:
     youtu.be/ID · youtube.com/watch?v=ID · /embed/ID · /shorts/ID
   Una referencia audiovisual es casi siempre un link de YouTube, y sin esto el
   repositorio la mostraba sin miniatura — que es justo lo que la hace
   reconocible de un vistazo. */
export function youtubeId(url?: string | null): string | null {
  const s = (url || "").trim();
  if (!/youtu\.?be/.test(s)) return null;
  const m =
    s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ||
    s.match(/[?&]v=([A-Za-z0-9_-]{6,})/) ||
    s.match(/\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

/* URL de miniatura para previsualizar, o null si no se puede (folder, link
   raro, PDF directo…). `sz` controla el ancho pedido a Drive. */
export function previewUrl(url?: string | null, sz = 400): string | null {
  return previewCandidates(url, sz)[0] || null;
}

/* Candidatos de miniatura en orden de preferencia. Para links de Drive damos
   DOS: el endpoint `thumbnail` y, como reserva, `lh3.googleusercontent.com/d/ID`
   —el servicio de Drive es intermitente (rate-limit / generación diferida) y
   entre los dos casi siempre uno responde—. El cliente prueba el siguiente si
   uno falla. Para una imagen directa, la propia URL. */
export function previewCandidates(url?: string | null, sz = 400): string[] {
  const s = (url || "").trim();
  if (!s || esCarpeta(s)) return [];
  // YouTube: la carátula del video. `hqdefault` existe siempre; `maxres` no.
  const yt = youtubeId(s);
  if (yt) return [
    `https://img.youtube.com/vi/${yt}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${yt}/hqdefault.jpg`,
  ];
  /* La miniatura SOLO para links de Google: un link directo a imagen que por
     casualidad traiga `?id=` o `/d/` no debe mandarse a un thumbnail roto.

     `docs.google.com` cuenta. Un Documento, una Hoja o una Presentación son
     archivos de Drive como cualquier otro —el endpoint `thumbnail?id=` les
     devuelve su primera página igual— pero viven en otro host, así que el
     filtro los dejaba fuera: un Google Doc del repositorio salía siempre con
     el ícono genérico, justo el material que más se guarda.

     Si aun así no aparece, el motivo suele ser el permiso: la miniatura la
     pide el navegador sin sesión, así que un archivo restringido no la
     entrega. Ahí el ícono no es un fallo, es el aviso de que ese link no lo
     puede abrir quien no esté invitado. */
  const id = /(?:drive|docs)\.google\.com/.test(s) ? driveFileId(s) : null;
  if (id) return [
    `https://drive.google.com/thumbnail?id=${id}&sz=w${sz}`,
    `https://lh3.googleusercontent.com/d/${id}=w${sz}`,
  ];
  if (EXT_IMG.test(s)) return [s];   // imagen directa: se muestra tal cual
  return [];                         // PDF directo u otros: sin miniatura, solo abrir
}

/* ═══════════════════════════════════════════════════════════════════════
   EL FORMATO SE DEDUCE DEL LINK, NO SE ESCRIBE EN EL TÍTULO.

   La costumbre era anteponer «Video:» al título para avisar que la referencia
   era audiovisual. Funciona el primer día y falla siempre después: el segundo
   lo escribe «VIDEO -», el tercero se olvida, y el buscador ya no encuentra
   los videos porque la marca vive dentro de un texto libre. Un dato que la
   máquina puede deducir no se le pide a una persona.

   La URL ya dice qué es: youtube → video, .mp4 → video, Drive con un doc de
   Google → documento. Se deriva aquí, en un solo sitio, y se pinta igual en
   todas las pantallas.
   ═══════════════════════════════════════════════════════════════════════ */
const EXT_VIDEO = /\.(mp4|mov|avi|mkv|webm|m4v)(\?|#|$)/i;
const EXT_AUDIO = /\.(mp3|wav|aac|m4a|ogg|flac)(\?|#|$)/i;

export type Formato = { key: string; ico: string; lbl: string };

export function formatoDe(url?: string | null): Formato | null {
  const s = (url || "").trim();
  if (!s) return null;
  if (esCarpeta(s)) return { key: "carpeta", ico: "📁", lbl: "Carpeta" };
  if (youtubeId(s) || /vimeo\.com/.test(s) || EXT_VIDEO.test(s))
    return { key: "video", ico: "▶", lbl: "Video" };
  if (EXT_AUDIO.test(s)) return { key: "audio", ico: "🎧", lbl: "Audio" };
  if (/\.pdf(\?|#|$)/i.test(s)) return { key: "pdf", ico: "📕", lbl: "PDF" };
  if (EXT_IMG.test(s)) return { key: "imagen", ico: "🖼", lbl: "Imagen" };
  // Los editores de Google se distinguen por la ruta, no por extensión.
  if (/docs\.google\.com\/document/.test(s)) return { key: "doc", ico: "📄", lbl: "Documento" };
  if (/docs\.google\.com\/spreadsheets/.test(s)) return { key: "hoja", ico: "📊", lbl: "Hoja" };
  if (/docs\.google\.com\/presentation/.test(s)) return { key: "slides", ico: "🖥", lbl: "Presentación" };
  if (/drive\.google\.com/.test(s)) return { key: "archivo", ico: "📎", lbl: "Archivo" };
  return { key: "web", ico: "🔗", lbl: "Web" };
}

/* ¿El link apunta a una carpeta (no a un archivo)? Para no ofrecer verificar
   contenido de algo que no es un documento. */
export function esCarpeta(url?: string | null): boolean {
  const s = (url || "").trim();
  return /drive\.google\.com\/drive\//.test(s) || /\/folders\//.test(s);
}
