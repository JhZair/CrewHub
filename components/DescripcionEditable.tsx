"use client";
import { editarCuerpo } from "@/app/actions";
import TextoRico from "@/components/TextoRico";
import Foto from "@/components/Foto";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Descripción del caso con lápiz: clic, corriges, Guardar. Si está vacía,
   muestra "+ Agregar descripción". Enter hace salto de línea (no guarda),
   Escape cancela. La bitácora recuerda la edición. */
export default function DescripcionEditable({ pubId, cuerpo, estado, imagenes }: {
  pubId: string; cuerpo: string; estado?: string; imagenes?: string[];
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(cuerpo);
  const [guardando, setGuardando] = useState(false);
  const router = useRouter();

  const guardar = async () => {
    if (guardando) return;
    if (valor.trim() === cuerpo.trim()) { setEditando(false); return; }
    setGuardando(true);
    const res: any = await editarCuerpo(pubId, valor);
    setGuardando(false);
    if (res?.error) { alert(res.error); return; }
    setEditando(false);
    router.refresh();
  };

  if (!editando) {
    const imgs = imagenes || [];
    return (cuerpo || imgs.length > 0) ? (
      <div className={`desc est-${estado || ""}`}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>
            {cuerpo ? <TextoRico texto={cuerpo} /> : <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Sin texto</span>}
          </span>
          <button title="Editar descripción" onClick={() => setEditando(true)}
            style={{ color: "var(--dim)", fontSize: 13, flex: "none" }}>✎</button>
        </div>
        {imgs.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: cuerpo ? 12 : 2 }}>
            {imgs.map((u, i) => <Foto key={i} src={u} />)}
          </div>
        )}
      </div>
    ) : (
      <button className="desc-add" onClick={() => setEditando(true)}>+ Agregar descripción</button>
    );
  }

  return (
    <div style={{ margin: "4px 0 12px" }}>
      <textarea autoFocus rows={4} value={valor}
        onChange={e => setValor(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") { setEditando(false); setValor(cuerpo); } }}
        style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--violet)", borderRadius: 12, padding: "10px 14px", fontSize: 14, color: "var(--text)", outline: "none", resize: "vertical", lineHeight: 1.5 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="btn" style={{ padding: "5px 14px", fontSize: 12 }} disabled={guardando} onClick={guardar}>
          {guardando ? "..." : "Guardar"}
        </button>
        <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
          onClick={() => { setEditando(false); setValor(cuerpo); }}>Cancelar (Esc)</button>
      </div>
    </div>
  );
}
