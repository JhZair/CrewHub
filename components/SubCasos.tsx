"use client";
import { crearSubCaso } from "@/app/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { claseEstado, textoEstado } from "@/lib/estados";
import { CERRADOS } from "@/lib/familia";

/* Los hijos de un caso largo: lista con progreso + alta rápida.
   (Tenía su propio mapa de estados —otra copia de lib/estados, sin íconos y
   sin saber de avisos—. Ahora se importa.) */
export default function SubCasos({ padreId, hijos }: {
  padreId: string;
  hijos: any[];
}) {
  const [titulo, setTitulo] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  /* «Cerrado» = resuelta O archivada, y esa decisión vive en lib/familia:
     archivar es una forma de cerrar, no de olvidar. Estaba escrita a mano
     dos veces en este mismo archivo. */
  const resueltos = hijos.filter(h => CERRADOS.includes(h.estado)).length;

  const crear = async () => {
    if (!titulo.trim() || creando) return;
    setCreando(true); setError("");
    const res = await crearSubCaso(padreId, titulo.trim());
    setCreando(false);
    if (res?.error) { setError(res.error); return; }
    setTitulo("");
    router.refresh();
  };

  return (
    <div className="card" style={{ marginTop: 4, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="panel-h" style={{ margin: 0 }}>🧩 Sub-casos · {hijos.length}</div>
        {hijos.length > 0 && (
          <span className="badge" style={{
            color: resueltos === hijos.length ? "var(--green)" : "var(--muted)",
            background: "#1c1c2c",
          }}>✅ {resueltos}/{hijos.length}</span>
        )}
      </div>
      {error && <div className="err-inline">⚠ {error}</div>}

      {hijos.map((h: any) => (
        <div className="info-row" key={h.id}>
          <Link href={`/caso/${h.id}`} style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
            {CERRADOS.includes(h.estado) ? "✅ " : "○ "}{h.titulo} →
          </Link>
          {h.resp?.nombre && <span style={{ color: "var(--teal)", fontSize: 12 }}>{h.resp.nombre}</span>}
          <span className={`pill st-${claseEstado(h.estado, h.tipo)}`} style={{ fontSize: 10 }}>{textoEstado(h.estado, h.tipo)}</span>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input value={titulo} placeholder="＋ Nuevo sub-caso (hereda los vínculos del padre)..."
          onChange={e => setTitulo(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") crear(); }}
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", outline: "none", fontSize: 13, color: "var(--text)" }} />
        <button className="btn" disabled={!titulo.trim() || creando} onClick={crear}>
          {creando ? "..." : "Crear"}
        </button>
      </div>
    </div>
  );
}
