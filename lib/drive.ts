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
  // La miniatura de Drive SOLO para links de Drive: un link directo a imagen que
  // por casualidad traiga `?id=` o `/d/` no debe mandarse a un thumbnail roto.
  const id = /drive\.google\.com/.test(s) ? driveFileId(s) : null;
  if (id) return [
    `https://drive.google.com/thumbnail?id=${id}&sz=w${sz}`,
    `https://lh3.googleusercontent.com/d/${id}=w${sz}`,
  ];
  if (EXT_IMG.test(s)) return [s];   // imagen directa: se muestra tal cual
  return [];                         // PDF directo u otros: sin miniatura, solo abrir
}

/* ¿El link apunta a una carpeta (no a un archivo)? Para no ofrecer verificar
   contenido de algo que no es un documento. */
export function esCarpeta(url?: string | null): boolean {
  const s = (url || "").trim();
  return /drive\.google\.com\/drive\//.test(s) || /\/folders\//.test(s);
}
