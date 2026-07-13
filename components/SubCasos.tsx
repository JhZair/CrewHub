"use client";
import { crearSubCaso } from "@/app/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const EST_TXT: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso", en_pausa: "En Pausa",
  seguimiento: "Seguimiento", resuelta: "Resuelta", archivada: "Archivada",
};

/* Los hijos de un caso largo: lista con progreso + alta rápida */
export default function SubCasos({ padreId, hijos }: {
  padreId: string;
  hijos: any[];
}) {
  const [titulo, setTitulo] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const resueltos = hijos.filter(h => ["resuelta", "archivada"].includes(h.estado)).length;

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
            {["resuelta", "archivada"].includes(h.estado) ? "✅ " : "○ "}{h.titulo} →
          </Link>
          {h.resp?.nombre && <span style={{ color: "var(--teal)", fontSize: 12 }}>{h.resp.nombre.split(" ")[0]}</span>}
          <span className={`pill st-${h.estado}`} style={{ fontSize: 10 }}>{EST_TXT[h.estado] || h.estado}</span>
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
