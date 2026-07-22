"use client";
import { editarComentario } from "@/app/actions";
import TextoRico from "@/components/TextoRico";
import Foto from "@/components/Foto";
import EditorImagenes from "@/components/EditorImagenes";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Texto de un comentario: resalta @menciones y, si es mío, se edita en línea —
   texto E imágenes (miniaturas con ✕, adjuntar, pegar). Las imágenes se muestran
   aquí (vista y edición) para que editarlas no dependa de otro bloque. */
export default function ComentarioTexto({ comentarioId, pubId, cuerpo, imagenes, esMio, editadoEn }: {
  comentarioId: string;
  pubId: string;
  cuerpo: string;
  imagenes?: string[];
  esMio: boolean;
  editadoEn?: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(cuerpo);
  const [imgs, setImgs] = useState<string[]>(imagenes || []);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const imgsBase = JSON.stringify(imagenes || []);
  const abrir = () => { setTexto(cuerpo); setImgs(imagenes || []); setError(""); setEditando(true); };
  const cancelar = () => { setEditando(false); setTexto(cuerpo); setImgs(imagenes || []); setError(""); };

  const pegar = async (files: File[]) => {
    for (const f of files.slice(0, Math.max(0, 6 - imgs.length))) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
  };

  const guardar = async () => {
    if (ocupado) return;
    if (!texto.trim() && imgs.length === 0) { setError("El comentario no puede quedar vacío."); return; }
    if (texto.trim() === cuerpo.trim() && JSON.stringify(imgs) === imgsBase) { setEditando(false); return; }
    setOcupado(true); setError("");
    const res: any = await editarComentario(comentarioId, pubId, texto, imgs);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    setEditando(false);
    router.refresh();
  };

  if (editando) {
    return (
      <div>
        {error && <div className="err-inline">⚠ {error}</div>}
        <textarea value={texto} autoFocus rows={Math.min(8, Math.max(2, texto.split("\n").length))}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") cancelar(); }}
          onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); pegar(f); } }}
          style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--text)", outline: "none", resize: "vertical", lineHeight: 1.5 }} />
        <EditorImagenes imgs={imgs} setImgs={setImgs} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn" style={{ padding: "5px 14px", fontSize: 12 }}
            disabled={ocupado} onClick={guardar}>
            {ocupado ? "..." : "Guardar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
            onClick={cancelar}>Cancelar</button>
        </div>
      </div>
    );
  }

  const imgsVista = imagenes || [];
  // Un comentario solo-imagen guarda "📷" como cuerpo; no lo mostramos como texto.
  const soloFoto = (cuerpo || "").trim() === "📷" && imgsVista.length > 0;
  return (
    <div className="tx" style={{ position: "relative" }}>
      {!soloFoto && <TextoRico texto={cuerpo} />}
      {editadoEn && (
        <span style={{ color: "var(--dim)", fontSize: 10.5, marginLeft: 6 }}
          title={new Date(editadoEn).toLocaleString("es-PE")}>(editado)</span>
      )}
      {esMio && (
        <button title="Editar mi comentario"
          style={{ color: "var(--dim)", fontSize: 11.5, marginLeft: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          onClick={abrir}>✎</button>
      )}
      {imgsVista.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {imgsVista.map((u, j) => <Foto key={j} src={u} maxHeight={160} />)}
        </div>
      )}
    </div>
  );
}
