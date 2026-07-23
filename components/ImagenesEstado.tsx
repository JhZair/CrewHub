"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { subirAdjunto, esPdfUrl } from "@/lib/subirImagen";
import { imagenesEstadoCuenta } from "@/app/actions";
import { useConfirmar, useAviso } from "@/components/useConfirmar";
import Foto from "@/components/Foto";

/* El comprobante físico de un mes: sus escaneos/fotos. Se ven como miniaturas
   (clic = zoom) y, si eres admin, se adjuntan y se quitan. Autoguarda: cada
   cambio persiste la lista de URLs en el estado de cuenta. */
export default function ImagenesEstado({ estadoId, postulacionId, esAdmin, inicial }: {
  estadoId: string; postulacionId: string; esAdmin: boolean; inicial: string[];
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();
  const [imgs, setImgs] = useState<string[]>(inicial || []);
  const [subiendo, setSubiendo] = useState(false);

  const guardar = async (next: string[]) => {
    setImgs(next);
    const r: any = await imagenesEstadoCuenta(estadoId, next, postulacionId);
    if (r?.error) { avisar(r.error); router.refresh(); }
  };

  const subir = async (files: File[]) => {
    if (!files.length || subiendo) return;
    setSubiendo(true);
    const nuevas: string[] = [];
    for (const f of files.slice(0, Math.max(0, 12 - imgs.length))) {
      const r = await subirAdjunto(f);
      if (r.error) { avisar(r.error); break; }
      if (r.url) nuevas.push(r.url);
    }
    setSubiendo(false);
    if (nuevas.length) guardar([...imgs, ...nuevas]);
  };

  const quitar = async (i: number) => {
    if (!(await pedir("¿Quitar este escaneo?", { peligro: true, aceptar: "Quitar" }))) return;
    guardar(imgs.filter((_, j) => j !== i));
  };

  if (!esAdmin && !imgs.length) return null;
  return (
    <div style={{ marginTop: 4 }}>
      {dialogo}
      {aviso}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {imgs.map((u, i) => (
        <span key={i} style={{ position: "relative", display: "inline-flex" }}>
          {esPdfUrl(u) ? (
            <a href={u} target="_blank" rel="noopener noreferrer" title="Abrir el PDF"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 74, padding: "0 14px",
                borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)",
                color: "var(--violet)", fontSize: 12.5, textDecoration: "none" }}>📄 PDF ↗</a>
          ) : (
            <Foto src={u} maxHeight={74} />
          )}
          {esAdmin && (
            <button onClick={() => quitar(i)} title="Quitar"
              style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%",
                background: "var(--card)", border: "1px solid var(--border2)", color: "var(--red)",
                fontSize: 11, lineHeight: 1, cursor: "pointer", zIndex: 2 }}>✕</button>
          )}
        </span>
      ))}
      {esAdmin && imgs.length < 12 && (
        <label className="btn btn-ghost" title="Adjuntar el comprobante del estado de cuenta (imagen o PDF)"
          style={{ padding: "4px 9px", fontSize: 11, cursor: "pointer" }}>
          📎 {subiendo ? "…" : "Adjuntar"}
          <input type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }}
            onChange={e => { subir(Array.from(e.target.files || [])); e.target.value = ""; }} />
        </label>
      )}
      </div>
    </div>
  );
}
