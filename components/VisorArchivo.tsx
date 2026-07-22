"use client";
import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import { previewCandidates, driveFileId, youtubeId, enlaceLimpio } from "@/lib/drive";

/* VER EL ARCHIVO SIN SALIR DE LA LISTA.

   Antes, tocar una miniatura llevaba a la ficha del objeto y desde ahí había
   que abrir el link: dos saltos para responder «¿qué es esto?», que es la
   pregunta que la miniatura ya estaba contestando a medias. Ahora se abre
   encima, en grande, y se cierra con Esc.

   Para Drive NO se muestra la miniatura ampliada sino `/preview`, el visor
   real: un PDF de 40 páginas se lee entero, no solo su portada. Para YouTube
   y Vimeo, el reproductor. Para una imagen suelta, la imagen. */

const vimeoId = (s: string) => (s.match(/vimeo\.com\/(?:video\/)?(\d+)/) || [])[1] || null;
const ES_GOOGLE = /(?:drive|docs)\.google\.com/;

/* La ruta del visor de Google depende del producto: un Documento NO se abre
   por `/file/d/…/preview` —eso es solo para archivos subidos a Drive— y el
   iframe queda en blanco. Se decide por la propia URL. */
function marcoGoogle(s: string): string | null {
  if (!ES_GOOGLE.test(s)) return null;
  const id = driveFileId(s);
  if (!id) return null;
  if (/docs\.google\.com\/document/.test(s)) return `https://docs.google.com/document/d/${id}/preview`;
  if (/docs\.google\.com\/spreadsheets/.test(s)) return `https://docs.google.com/spreadsheets/d/${id}/preview`;
  if (/docs\.google\.com\/presentation/.test(s)) return `https://docs.google.com/presentation/d/${id}/preview`;
  return `https://drive.google.com/file/d/${id}/preview`;
}

/** ¿Hay algo que mostrar dentro de la app, o toca abrir el original? */
export function puedeVerse(url?: string | null): boolean {
  const s = (url || "").trim();
  if (!s) return false;
  /* `driveFileId` mira solo la forma del link (`/d/ID`, `?id=ID`), no el host:
     sin el filtro de Google, cualquier URL de un CMS con `?id=` prometía visor
     y luego mostraba «no se puede mostrar» — peor que mandar al original. */
  return !!(youtubeId(s) || vimeoId(s) || marcoGoogle(s) || previewCandidates(s, 1200).length);
}

export default function VisorArchivo({ url, onClose, acciones }: {
  url: string;
  onClose: () => void;
  /** Botones extra para la barra inferior (p. ej. el veredicto del link). */
  acciones?: ReactNode;
}) {
  const s = (url || "").trim();
  const yt = youtubeId(s);
  const vi = vimeoId(s);
  const google = marcoGoogle(s);
  const cand = previewCandidates(s, 1600);
  const [i, setI] = useState(0);
  const img = !yt && !vi && !google && i < cand.length ? cand[i] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  /* Siempre plantillas fijas con un id validado — nunca la URL cruda que
     escribió una persona dentro de un iframe. */
  const marco = yt ? `https://www.youtube.com/embed/${yt}?autoplay=1&rel=0`
    : vi ? `https://player.vimeo.com/video/${vi}?autoplay=1`
    : google;

  return createPortal(
    /* Al `document.body`: dentro de una tarjeta con `transform` el `position:
       fixed` queda atrapado y el visor sale diminuto y descolocado. */
    <div className="lv-lightbox" onClick={onClose}>
      {marco && (
        <iframe src={marco} className="va-marco" onClick={e => e.stopPropagation()}
          allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
      )}
      {img && (
        <img src={img} alt="" onClick={e => e.stopPropagation()} referrerPolicy="no-referrer"
          onError={() => setI(n => n + 1)} />
      )}
      {!marco && !img && (
        <div className="va-nada" onClick={e => e.stopPropagation()}>
          Este archivo no se puede mostrar aquí.
        </div>
      )}
      <div className="lv-lb-barra" onClick={e => e.stopPropagation()}>
        <a href={enlaceLimpio(s)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          Abrir original ↗
        </a>
        {acciones}
        <button className="btn btn-ghost" onClick={onClose}>Cerrar (Esc)</button>
      </div>
    </div>,
    document.body
  );
}
