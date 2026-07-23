"use client";
import { useState } from "react";
import { previewCandidates } from "@/lib/drive";

/* Miniatura de un link (Drive, YouTube o imagen directa). Prueba los candidatos
   en orden: el thumbnail de Drive es intermitente, así que si uno falla se pasa
   al siguiente; al agotarlos no se muestra nada (en vez de un ícono roto). La
   misma lógica de LinkVerificable, pero sin el aparato de verificación —aquí
   solo se quiere la cara del archivo en un listado. */
export default function Miniatura({ url, size = 44, alt = "", radio = 7 }: {
  url?: string | null; size?: number; alt?: string; radio?: number;
}) {
  const cand = previewCandidates(url, 200);
  const [i, setI] = useState(0);
  const src = i < cand.length ? cand[i] : null;
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer"
      onError={() => setI(v => v + 1)}
      style={{ width: size, height: size, objectFit: "cover", borderRadius: radio, flex: "none", background: "#1c1c2c" }} />
  );
}
