"use client";
import { editarTitulo } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Título del caso con lápiz: clic, corriges, Enter. La bitácora recuerda. */
export default function TituloEditable({ pubId, titulo }: {
  pubId: string; titulo: string;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(titulo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const guardar = async () => {
    if (guardando) return;
    if (!valor.trim() || valor.trim() === titulo) { setEditando(false); setValor(titulo); return; }
    setGuardando(true); setError("");
    const res = await editarTitulo(pubId, valor);
    setGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setEditando(false);
    router.refresh();
  };

  if (!editando) return (
    <h1 className="title-lg" style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ flex: 1 }}>{titulo}</span>
      <button title="Editar título" onClick={() => setEditando(true)}
        style={{ color: "var(--dim)", fontSize: 15, marginTop: 6, flex: "none" }}>✎</button>
    </h1>
  );

  return (
    <div style={{ marginBottom: 14 }}>
      <textarea autoFocus rows={2} value={valor}
        onChange={e => setValor(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); guardar(); }
          if (e.key === "Escape") { setEditando(false); setValor(titulo); }
        }}
        style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--violet)", borderRadius: 12, padding: "10px 14px", fontSize: 19, fontWeight: 800, color: "var(--text)", outline: "none", resize: "vertical", lineHeight: 1.35 }} />
      {error && <div className="err-inline">⚠ {error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="btn" style={{ padding: "5px 14px", fontSize: 12 }} disabled={guardando} onClick={guardar}>
          {guardando ? "..." : "Guardar"}
        </button>
        <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
          onClick={() => { setEditando(false); setValor(titulo); }}>Cancelar (Esc)</button>
      </div>
    </div>
  );
}
