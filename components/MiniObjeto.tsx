"use client";
import { previewCandidates, formatoDe, enlaceLimpio } from "@/lib/drive";
import VisorArchivo, { puedeVerse } from "@/components/VisorArchivo";
import { useState } from "react";

/* LA MINIATURA DE UN OBJETO DEL REPOSITORIO, en 16:9 y a tamaño de verdad.

   En un repositorio audiovisual la imagen ES el contenido: la portada del
   libro, el fotograma del documental, la primera página del PDF. Con 56×42 px
   —lo que había— no se distingue un documento de otro y hay que abrir cada
   uno para saber qué es; que es exactamente el problema que el verificador de
   links vino a resolver.

   Prueba los candidatos de `previewCandidates` en orden: Drive devuelve la
   miniatura de forma intermitente, y sin el respaldo de lh3 la portada
   aparecía y desaparecía entre recargas. Si se agotan, cae al ícono del tipo
   en vez de dejar una imagen rota.

   Y se puede tocar: abre el archivo o el video encima, sin pasar por la ficha
   del objeto. `fila-encima` la levanta por sobre el enlace estirado de la
   tarjeta, que si no se lleva el clic. */
export default function MiniObjeto({ url, ico, ancho = 400 }: {
  url?: string | null;
  /** Ícono del tipo de objeto, para cuando no hay imagen que mostrar. */
  ico: string;
  /** Ancho que se le pide al proveedor (no el del recuadro, que lo pone el CSS). */
  ancho?: number;
}) {
  const cand = previewCandidates(url || "", ancho);
  const [i, setI] = useState(0);
  const [ver, setVer] = useState(false);
  const src = i < cand.length ? cand[i] : null;
  /* El formato sale del link, no de que alguien haya escrito «Video:» en el
     título. Va encima de la miniatura, donde YouTube pone la duración. */
  const f = formatoDe(url);
  const visible = puedeVerse(url);

  const dentro = (
    <>
      {src
        ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer"
            onError={() => setI(n => n + 1)} />
        : <span className="obj-mini-ico">{ico}</span>}
      {f && (f.key === "video" || f.key === "audio") && (
        <span className="obj-mini-fmt">{f.ico} {f.lbl}</span>
      )}
    </>
  );

  // Se puede ver dentro de la app → visor. Si no, pero hay link → el original.
  if (visible) {
    return (
      <>
        <button type="button" className={`obj-mini fila-encima ${src ? "" : "obj-mini-vacia"}`}
          onClick={() => setVer(true)} title="Ver el contenido">
          {dentro}
        </button>
        {ver && <VisorArchivo url={(url || "").trim()} onClose={() => setVer(false)} />}
      </>
    );
  }
  if (url) {
    return (
      <a href={enlaceLimpio(url)} target="_blank" rel="noopener noreferrer"
        className={`obj-mini fila-encima ${src ? "" : "obj-mini-vacia"}`} title="Abrir ↗">
        {dentro}
      </a>
    );
  }
  return <span className="obj-mini obj-mini-vacia">{dentro}</span>;
}
