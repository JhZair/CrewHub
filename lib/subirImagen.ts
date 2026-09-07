import { createClient } from "@/lib/supabase/client";

/* Sube una imagen (pantallazo, foto) a Supabase Storage y devuelve su URL
   pública. La excepción a la regla "todo vive en Drive": los pantallazos
   son comunicación efímera, no documentos del archivo institucional. */
export async function subirImagen(file: File): Promise<{ url?: string; error?: string }> {
  if (!file.type.startsWith("image/")) return { error: "Solo se aceptan imágenes." };
  if (file.size > 3 * 1024 * 1024) return { error: "Máximo 3MB por imagen." };
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const ruta = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("adjuntos").upload(ruta, file);
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("adjuntos").getPublicUrl(ruta);
  return { url: data.publicUrl };
}

/* Sube un ADJUNTO (imagen o PDF) al mismo bucket. Igual que `subirImagen`
   pero admite PDF —los comprobantes del banco a veces son PDF, no foto— con
   un tope mayor. Devuelve la URL pública; el que la muestra decide si es
   imagen (miniatura) o PDF (ficha para abrir), por la extensión.

   ⚠ `maxImagenMB` sube el tope de las IMÁGENES para quien lo pida. El de 5 se
   puso pensando en pantallazos, y una foto de un papel firmado no es un
   pantallazo: la cámara de un móvil de hoy saca 6-10MB, y el release de Hugo
   habría rebotado con «Máximo 5MB» sobre la única prueba que hay de que
   autorizó. El PDF ya iba a 15 por la misma razón — que es un documento, no una
   captura de pantalla. Se pasa donde hace falta en vez de subirlo para todos:
   un pantallazo de 12MB en un comentario sigue sin tener sentido. */
export async function subirAdjunto(
  file: File, maxImagenMB = 5,
): Promise<{ url?: string; error?: string }> {
  const esImg = file.type.startsWith("image/");
  const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!esImg && !esPdf) return { error: "Solo se aceptan imágenes o PDF." };
  const maxMB = esPdf ? 15 : maxImagenMB;
  if (file.size > maxMB * 1024 * 1024)
    return { error: `Ese archivo pesa ${(file.size / 1024 / 1024).toFixed(1)}MB y el tope es ${maxMB}MB. Si es una foto, mándala comprimida o hazle una captura.` };
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || (esPdf ? "pdf" : "png")).toLowerCase();
  const ruta = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("adjuntos").upload(ruta, file);
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("adjuntos").getPublicUrl(ruta);
  return { url: data.publicUrl };
}

/* ¿La URL apunta a un PDF? (para decidir miniatura vs. ficha) */
export const esPdfUrl = (u: string) => /\.pdf($|\?)/i.test(u || "");

/* Extrae las imágenes de un evento de pegado (Ctrl+V de un pantallazo) */
export function imagenesDePaste(e: React.ClipboardEvent): File[] {
  return archivosDe(e.clipboardData);
}

/**
 * Los archivos de un `DataTransfer`, vengan de donde vengan.
 *
 * ⚠ Sirve para las TRES puertas —pegar, soltar y el selector— y para el evento
 * NATIVO además del de React. `imagenesDePaste` solo aceptaba
 * `React.ClipboardEvent`, así que un listener de `window` —que es lo que hace
 * falta para «abro el panel y pego, sin tener que acertar en una caja»— no
 * podía usarla y habría acabado en una cuarta copia del mismo bucle.
 *
 * ⚠ Y admite PDF, no solo imágenes: `subirAdjunto` acepta los dos, y quien
 * arrastra el escaneo de un release arrastra un PDF. Filtrar aquí por imagen
 * haría que soltar el PDF no hiciera nada — en silencio, que es lo peor.
 */
export function archivosDe(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  /* `files` primero: al soltar viene relleno y `items` puede traer además una
     entrada de texto con la ruta, que no es un archivo. */
  const sueltos = Array.from(dt.files || []);
  if (sueltos.length) return sueltos;
  return Array.from(dt.items || [])
    .filter(i => i.kind === "file")
    .map(i => i.getAsFile())
    .filter(Boolean) as File[];
}

/* ══════════════════════════════════════════════════════════════════════════
   LA HUELLA DEL ARCHIVO

   ⚠ Para poder decir, meses después y ante una aseguradora o un fondo, que el
   PDF que se enseña es EL MISMO que se firmó. `documento_firmado.hash_archivo`
   existe con ese comentario en la migración y nadie lo escribía: una columna
   que nadie llena no prueba nada.

   `crypto.subtle` solo existe en contexto seguro (https o localhost). Si no
   está, se devuelve null en vez de reventar: la huella es una mejora, no un
   requisito — y hacer que no se pueda guardar un papel por no poder calcularla
   sería cambiar una promesa incumplida por una puerta cerrada.
   ══════════════════════════════════════════════════════════════════════════ */
export async function huellaDe(file: File): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const buf = await file.arrayBuffer();
    const h = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h))
      .map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
