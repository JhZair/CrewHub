import { createClient } from "@/lib/supabase/client";

/* Sube una imagen (pantallazo, foto) a Supabase Storage y devuelve su URL
   pública. La excepción a la regla "todo vive en Drive": los pantallazos
   son comunicación efímera, no documentos del archivo institucional. */
export async function subirImagen(file: File): Promise<{ url?: string; error?: string }> {
  if (!file.type.startsWith("image/")) return { error: "Solo se aceptan imágenes." };
  if (file.size > 5 * 1024 * 1024) return { error: "Máximo 5MB por imagen." };
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const ruta = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("adjuntos").upload(ruta, file);
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("adjuntos").getPublicUrl(ruta);
  return { url: data.publicUrl };
}

/* Extrae las imágenes de un evento de pegado (Ctrl+V de un pantallazo) */
export function imagenesDePaste(e: React.ClipboardEvent): File[] {
  return Array.from(e.clipboardData?.items || [])
    .filter(i => i.type.startsWith("image/"))
    .map(i => i.getAsFile())
    .filter(Boolean) as File[];
}
