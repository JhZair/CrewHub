"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { marcarLink } from "@/app/actions";
import { previewCandidates } from "@/lib/drive";

/* Link de documento con verificador de contenido. Junto al botón para abrir se
   muestra una miniatura del archivo real (Drive o imagen directa) para cazar el
   que quedó equivocado, y el veredicto de un humano: ✓ Correcto o ✗ Incorrecto.
   El veredicto se guarda contra la URL: si el link cambia, vuelve a «sin
   revisar». Volver a tocar el mismo veredicto lo quita. */
export default function LinkVerificable({ tipo, id, campo, url, etiqueta, icono, verif }: {
  tipo: string; id: string; campo: string; url: string;
  etiqueta: string; icono: string;
  verif?: { url: string; por?: string | null; en?: string | null; correcto?: boolean } | null;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [zoom, setZoom] = useState(false);
  // Candidatos de miniatura; si uno falla (Drive intermitente) se prueba el
  // siguiente. Al agotarlos, no se muestra miniatura (en vez de un ícono roto).
  const miniCand = previewCandidates(url, 220);
  const grandeCand = previewCandidates(url, 1200);
  const [mi, setMi] = useState(0);
  const [gi, setGi] = useState(0);
  const mini = mi < miniCand.length ? miniCand[mi] : null;
  const grande = gi < grandeCand.length ? grandeCand[gi] : null;
  // Veredicto vigente solo si es para ESTE mismo link (si cambió, no cuenta).
  // La acción guarda la url con .trim(), así que se compara normalizada.
  const vig = !!verif && verif.url === (url || "").trim();
  const ok = vig && verif!.correcto !== false;
  const malo = vig && verif!.correcto === false;

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [zoom]);

  const marcar = async (correcto: boolean) => {
    if (ocupado) return;
    setOcupado(true);
    const r: any = await marcarLink(tipo, id, campo, url, correcto, etiqueta);
    setOcupado(false);
    if (r?.error) { alert(r.error); return; }
    router.refresh();
  };

  const fecha = verif?.en ? new Date(verif.en).toLocaleDateString("es-PE", { day: "numeric", month: "short" }) : "";
  const quien = (verif?.por || "").split(" ")[0];
  const firma = quien || fecha ? ` · ${[quien, fecha].filter(Boolean).join(" · ")}` : "";

  return (
    <div className={`link-verif ${ok ? "ok" : malo ? "malo" : ""}`}>
      {mini && (
        <button className="lv-mini" onClick={() => setZoom(true)} title="Ver el contenido del link">
          <img src={mini} alt="" loading="lazy" referrerPolicy="no-referrer"
            onError={() => setMi(i => i + 1)} />
        </button>
      )}
      <div className="lv-cuerpo">
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost lv-abrir">
          {icono} {etiqueta} ↗
        </a>

        {/* Veredicto actual */}
        {ok && <span className="lv-sello lv-ok">✅ Revisado{firma}</span>}
        {malo && <span className="lv-sello lv-bad">⚠ Contenido equivocado{firma} — corrige el link</span>}
        {!vig && <span className="lv-sello lv-pend">Sin revisar</span>}

        {/* El humano decide: correcto / incorrecto (toca de nuevo para quitar) */}
        <div className="lv-marcas">
          <button className={`lv-m lv-mok ${ok ? "on" : ""}`} onClick={() => marcar(true)} disabled={ocupado}
            title={ok ? "Quitar la revisión" : "El contenido es el correcto"}>✓ Correcto</button>
          <button className={`lv-m lv-mno ${malo ? "on" : ""}`} onClick={() => marcar(false)} disabled={ocupado}
            title={malo ? "Quitar la revisión" : "El contenido está equivocado — hay que corregir el link"}>✗ Incorrecto</button>
        </div>
      </div>

      {zoom && grande && typeof document !== "undefined" && createPortal(
        <div className="lv-lightbox" onClick={() => setZoom(false)}>
          <img src={grande} alt="" onClick={e => e.stopPropagation()} referrerPolicy="no-referrer"
            onError={() => setGi(i => i + 1)} />
          <div className="lv-lb-barra" onClick={e => e.stopPropagation()}>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Abrir original ↗</a>
            {!ok && <button className="btn" onClick={() => marcar(true)} disabled={ocupado}>{ocupado ? "…" : "✓ Es correcto"}</button>}
            {!malo && <button className="btn btn-ghost" onClick={() => marcar(false)} disabled={ocupado}>✗ Está equivocado</button>}
            <button className="btn btn-ghost" onClick={() => setZoom(false)}>Cerrar (Esc)</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
