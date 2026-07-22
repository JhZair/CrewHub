"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { previewCandidates, enlaceLimpio } from "@/lib/drive";

/* Botón compacto para ver el contenido de un link (👁 abre una vista previa;
   ↗ abre el original). Sirve para el historial: en vez de volcar una URL larga
   de Drive, deja verla de un vistazo. Si no hay miniatura posible (PDF directo,
   link raro) solo queda el ↗. */
export default function LinkPreview({ url }: { url: string }) {
  const [zoom, setZoom] = useState(false);
  const [gi, setGi] = useState(0);
  const cand = previewCandidates(url, 1200);
  const grande = gi < cand.length ? cand[gi] : null;

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [zoom]);

  return (
    <span className="lh-prev">
      {grande && (
        <button className="lh-ver" onClick={() => setZoom(true)} title="Ver el contenido del link">👁</button>
      )}
      <a href={enlaceLimpio(url)} target="_blank" rel="noopener noreferrer" className="lh-ver" title={enlaceLimpio(url)}>↗</a>
      {/* Portal al body: el visor es `position:fixed`, y dentro del timeline del
          historial (con transform) quedaba atrapado y se veía chico y mal
          ubicado. En el body cubre toda la pantalla. */}
      {zoom && grande && typeof document !== "undefined" && createPortal(
        <div className="lv-lightbox" onClick={() => setZoom(false)}>
          <img src={grande} alt="" referrerPolicy="no-referrer" onError={() => setGi(i => i + 1)} onClick={e => e.stopPropagation()} />
          <div className="lv-lb-barra" onClick={e => e.stopPropagation()}>
            <a href={enlaceLimpio(url)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Abrir original ↗</a>
            <button className="btn btn-ghost" onClick={() => setZoom(false)}>Cerrar (Esc)</button>
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}
