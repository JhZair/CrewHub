/* 🖼 PREPARADOR DE IMÁGENES — corre en el navegador, antes de subir.
   Le tiras la foto que sea (12MB del celular, PNG gigante) y la deja lista:
   reducida al tamaño que la cabecera necesita y comprimida a WebP liviano.
   Nadie del equipo vuelve a pensar en "tamaño adecuado": el sistema lo hace.

   No recorta: reduce manteniendo la proporción; el encuadre final lo da el
   CSS (object-fit: cover). Así jamás le cortamos la cabeza a nadie. */

export type MedidaImagen = {
  maxAncho: number;
  maxAlto: number;
  calidad?: number;    // 0..1 WebP (defecto 0.82)
  cuadrado?: boolean;  // recorte cuadrado perfecto, automático
};

export const MEDIDAS = {
  portada: { maxAncho: 1600, maxAlto: 900 },   // banner de cabecera
  cartel:  { maxAncho: 800,  maxAlto: 1000 },  // póster / cuadro de la entidad
  foto:    { maxAncho: 512,  maxAlto: 512, cuadrado: true },  // avatar: siempre cuadrado
  adjunto: { maxAncho: 1920, maxAlto: 1920 },  // pantallazos de casos
} as const;

export async function prepararImagen(f: File, medida: MedidaImagen): Promise<File> {
  try {
    if (!f.type.startsWith("image/")) return f;
    // Los GIF animados se dejan pasar: el canvas los congelaría.
    if (f.type === "image/gif") return f;

    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const url = URL.createObjectURL(f);
      const i = new Image();
      i.onload = () => { URL.revokeObjectURL(url); ok(i); };
      i.onerror = (e) => { URL.revokeObjectURL(url); no(e); };
      i.src = url;
    });

    // Recorte cuadrado perfecto (avatares): toma el cuadrado más grande
    // posible. En fotos VERTICALES no toma el centro exacto sino un poco
    // más arriba (25%), porque ahí viven las caras en los retratos.
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (medida.cuadrado) {
      const lado = Math.min(img.width, img.height);
      sx = (img.width - lado) / 2;
      sy = img.height > img.width ? (img.height - lado) * 0.25 : (img.height - lado) / 2;
      sw = lado; sh = lado;
    }

    // Escala solo hacia abajo: una imagen chica no se infla (se vería borrosa)
    const esc = Math.min(1, medida.maxAncho / sw, medida.maxAlto / sh);
    const ancho = Math.round(sw * esc);
    const alto = Math.round(sh * esc);

    // Si ya es chica, liviana y no hay que cuadrarla, no hay nada que preparar
    if (esc === 1 && f.size < 400 * 1024 && !(medida.cuadrado && img.width !== img.height)) return f;

    const canvas = document.createElement("canvas");
    canvas.width = ancho; canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return f;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>(ok =>
      canvas.toBlob(ok, "image/webp", medida.calidad ?? 0.82));
    if (!blob || blob.size >= f.size) return f;  // si no mejoró, la original

    return new File([blob], f.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return f;  // ante cualquier tropiezo, se sube la original como siempre
  }
}
