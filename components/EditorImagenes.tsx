"use client";
import { useState } from "react";
import { subirImagen } from "@/lib/subirImagen";

/* Mini-editor de imágenes reusable: miniaturas con ✕ para quitar + botón para
   adjuntar. La subida se comparte con `subir` (también la usa el pegado del
   textarea que lo envuelve). `imgs`/`setImgs` los maneja el padre. */
export default function EditorImagenes({ imgs, setImgs, max = 6 }: {
  imgs: string[]; setImgs: (v: string[]) => void; max?: number;
}) {
  const [subiendo, setSubiendo] = useState(false);

  const subir = async (files: File[]) => {
    if (!files.length || subiendo || imgs.length >= max) return;
    setSubiendo(true);
    const nuevas: string[] = [];
    // Math.max(0,…): si por una carrera imgs ya excede el tope, slice(0,neg)
    // NO devuelve [] (recorta desde el final) y dejaría pasar de más.
    for (const f of files.slice(0, Math.max(0, max - imgs.length))) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) nuevas.push(r.url);
    }
    if (nuevas.length) setImgs([...imgs, ...nuevas]);
    setSubiendo(false);
  };

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 7 }}>
      {imgs.map((u, i) => (
        <span key={i} style={{ position: "relative", display: "inline-flex" }}>
          <img src={u} alt="" style={{ height: 46, borderRadius: 6, border: "1px solid var(--border)" }} />
          <button title="Quitar" onClick={() => setImgs(imgs.filter((_, j) => j !== i))}
            style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "var(--card)", border: "1px solid var(--border2)", color: "var(--red)", fontSize: 11, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </span>
      ))}
      {imgs.length < max && (
        <label className="btn btn-ghost" title="Agregar imagen (o pega con Ctrl+V)"
          style={{ padding: "5px 9px", fontSize: 11.5, cursor: "pointer" }}>
          📷 {subiendo ? "…" : "Imagen"}
          <input type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { subir(Array.from(e.target.files || [])); e.target.value = ""; }} />
        </label>
      )}
    </div>
  );
}
