"use client";
import { editarTitulo } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Título del caso con lápiz: clic, corriges, Enter. La bitácora recuerda. */
export default function TituloEditable({ pubId, titulo, chip }: {
  pubId: string; titulo: string;
  /* ── QUÉ ES ESTO, PEGADO A CÓMO SE LLAMA ──
   * El tipo («✅ Tarea», «❗ Problema») vivía arriba a la derecha, en la barra
   * de navegación, al lado de un botón de administración. Ahí no se leía junto
   * al título sino junto a los controles, y el título —que es lo primero que se
   * mira— no decía de qué clase de cosa se trata.
   * Va al final del texto y no delante: primero se lee el nombre del caso, que
   * es lo que se estaba buscando, y el tipo matiza. Delante, veinte casos
   * seguidos empezarían todos por la misma palabra. */
  chip?: React.ReactNode;
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
      {/* El chip va DENTRO del mismo `span`, no al lado: así fluye con la
          última línea del título en vez de quedarse anclado arriba a la
          derecha cuando el título ocupa dos o tres renglones. */}
      <span style={{ flex: 1 }}>
        {titulo}
        {chip && (
          /* ── CENTRADO CON LA LÍNEA, NO CON LA CAJA ──
             `vertical-align: middle` alinea con el centro de la caja de texto,
             que en un título de 26 px queda muy por encima del centro óptico de
             las letras: el chip flotaba pegado al techo. `baseline` lo apoya
             sobre la misma línea que las letras y el `translateY` lo sube la
             mitad de su propia altura visual, que es donde el ojo espera un
             marbete al lado de un nombre.
             El `inline-flex` es lo que permite que el chip y el botón de
             archivar viajen juntos como un bloque y no se separen al saltar de
             línea. */
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            marginLeft: 12, verticalAlign: "baseline",
            transform: "translateY(-0.12em)", whiteSpace: "nowrap",
          }}>{chip}</span>
        )}
      </span>
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
