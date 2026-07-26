"use client";
import { comentar, comentarObjeto, comentarPrestamo, comentarEquipo } from "@/app/actions";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* Responder a un comentario concreto: botón "↩ Responder" que abre una
   caja inline; al enviar, el comentario queda enlazado al padre (responde_a).
   Soporta pegar (Ctrl+V) y adjuntar imágenes, igual que el comentario. */
export default function RespuestaBox({ pubId, comentarioId, objetoId, prestamoId, equipoId, bitacoraEquipoId }: {
  pubId?: string | null; comentarioId: string;
  /** Cuando se responde a un comentario del repositorio, no de un caso. */
  objetoId?: string | null;
  /** Cuando se responde a un comentario del hilo de un uso de equipo. */
  prestamoId?: string | null; equipoId?: string | null;
  /** Cuando se responde en la bitácora del equipo (comentario suelto). */
  bitacoraEquipoId?: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [txt, setTxt] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [imgs, setImgs] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const router = useRouter();
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-crecer con el texto (hasta 140px; luego scroll)
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [txt, abierto]);

  const subir = async (files: File[]) => {
    if (!files.length || subiendo) return;
    setSubiendo(true);
    for (const f of files.slice(0, 6 - imgs.length)) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
    setSubiendo(false);
  };

  const enviar = async () => {
    if ((!txt.trim() && !imgs.length) || enviando || subiendo) return;
    setEnviando(true);
    // Misma tabla, dos dueños: el objeto usa su propia acción para que el
    // aviso y el evento cuelguen de él, no de un caso inexistente.
    const res: any = prestamoId
      ? await comentarPrestamo(prestamoId, equipoId!, txt.trim(), imgs, [], comentarioId)
      : bitacoraEquipoId
      ? await comentarEquipo(bitacoraEquipoId, txt.trim(), imgs, [], comentarioId)
      : objetoId
      ? await comentarObjeto(objetoId, txt.trim() || "📷", imgs, comentarioId)
      : await comentar(pubId!, txt.trim() || "📷", imgs, comentarioId);
    setEnviando(false);
    if (res?.error) { alert(res.error); return; }
    setTxt(""); setImgs([]); setAbierto(false);
    router.refresh();
  };

  if (!abierto) {
    return (
      <button className="btn-responder" onClick={e => { e.stopPropagation(); setAbierto(true); }}>
        ↩ Responder
      </button>
    );
  }
  return (
    <div className="resp-box">
      {(imgs.length > 0 || subiendo) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          {imgs.map((u, i) => (
            <span key={i} style={{ position: "relative" }}>
              <img src={u} alt="" style={{ height: 54, borderRadius: 8, border: "1px solid var(--border)" }} />
              <button onClick={() => setImgs(imgs.filter((_, j) => j !== i))}
                style={{ position: "absolute", top: -6, right: -6, background: "var(--panel)", border: "1px solid var(--border2)", borderRadius: "50%", width: 18, height: 18, fontSize: 10, color: "var(--red)", cursor: "pointer", lineHeight: 1 }}>×</button>
            </span>
          ))}
          {subiendo && <span style={{ color: "var(--dim)", fontSize: 11.5, alignSelf: "center" }}>subiendo…</span>}
        </div>
      )}
      <textarea ref={taRef} autoFocus rows={1} value={txt}
        placeholder="Tu respuesta… (Enter envía · Shift+Enter salto de línea · pega una imagen)"
        onChange={e => setTxt(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
          if (e.key === "Escape") { setAbierto(false); setTxt(""); setImgs([]); }
        }}
        onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); subir(f); } }}
        style={{ resize: "none", overflowY: "auto", maxHeight: 140, lineHeight: 1.4 }} />
      <div style={{ display: "flex", gap: 6, marginTop: 5, alignItems: "center" }}>
        <button className="btn" style={{ padding: "4px 12px", fontSize: 11.5 }}
          disabled={(!txt.trim() && !imgs.length) || enviando || subiendo} onClick={enviar}>
          {enviando ? "..." : "Responder"}
        </button>
        <label className="btn btn-ghost" title="Adjuntar imagen" style={{ padding: "4px 9px", fontSize: 11.5, cursor: "pointer" }}>
          📷
          <input type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { subir(Array.from(e.target.files || [])); e.target.value = ""; }} />
        </label>
        <button className="btn btn-ghost" style={{ padding: "4px 9px", fontSize: 11.5 }}
          onClick={() => { setAbierto(false); setTxt(""); setImgs([]); }}>Cancelar</button>
      </div>
    </div>
  );
}
