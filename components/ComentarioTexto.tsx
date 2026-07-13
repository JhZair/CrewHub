"use client";
import { editarComentario } from "@/app/actions";
import TextoRico from "@/components/TextoRico";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Texto de un comentario: resalta @menciones y, si es mío, se puede editar en línea. */
export default function ComentarioTexto({ comentarioId, pubId, cuerpo, esMio, editadoEn }: {
  comentarioId: string;
  pubId: string;
  cuerpo: string;
  esMio: boolean;
  editadoEn?: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(cuerpo);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const guardar = async () => {
    if (ocupado || !texto.trim()) return;
    setOcupado(true); setError("");
    const res = await editarComentario(comentarioId, pubId, texto);
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
          style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--text)", outline: "none", resize: "vertical", lineHeight: 1.5 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button className="btn" style={{ padding: "5px 14px", fontSize: 12 }}
            disabled={ocupado || !texto.trim()} onClick={guardar}>
            {ocupado ? "..." : "Guardar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
            onClick={() => { setEditando(false); setTexto(cuerpo); setError(""); }}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tx" style={{ position: "relative" }}>
      <TextoRico texto={cuerpo} />
      {editadoEn && (
        <span style={{ color: "var(--dim)", fontSize: 10.5, marginLeft: 6 }}
          title={new Date(editadoEn).toLocaleString("es-PE")}>(editado)</span>
      )}
      {esMio && (
        <button title="Editar mi comentario"
          style={{ color: "var(--dim)", fontSize: 11.5, marginLeft: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          onClick={() => setEditando(true)}>✎</button>
      )}
    </div>
  );
}
