"use client";
import { cambiarEstado } from "@/app/actions";
import { celebrarResuelto } from "@/lib/celebra";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const TIPO_ICO: Record<string, string> = {
  aviso: "📢", tarea: "✅", problema: "❗", consulta: "❓", pago: "💰", idea: "💡", archivo: "📎",
};
const ENT_ICO: Record<string, string> = {
  proyecto: "📁", empresa: "🏢", persona: "👤", convocatoria: "📜",
  postulacion: "🎯", equipamiento: "🎥", lugar: "📍", etiqueta: "🏷️",
};

function dias(fecha: string | null) {
  if (!fecha) return null;
  return Math.ceil((new Date(fecha + "T12:00:00").getTime() - Date.now()) / 86400000);
}

function reacStr(reac?: Record<string, number>) {
  if (!reac) return "";
  return Object.entries(reac).slice(0, 3).map(([em, n]) => `${em}${n}`).join(" ");
}

// Nombre corto que distingue homónimos: "John Oros" → "John O.", "John Zair…" → "John Z."
function corto(n?: string | null) {
  const p = (n || "").trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || "");
}

export default function Tablero({ columnas }: {
  columnas: { estado: string; titulo: string; color: string; items: any[] }[];
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const router = useRouter();

  const soltar = async (estado: string) => {
    setSobre(null);
    if (!arrastrando || moviendo) return;
    const id = arrastrando;
    setArrastrando(null);
    setMoviendo(true);
    const res = await cambiarEstado(id, estado);
    setMoviendo(false);
    if (res?.error) alert(res.error);
    else { if (estado === "resuelta") celebrarResuelto(); router.refresh(); }
  };

  return (
    <div className="kb">
      {columnas.map(col => (
        <div key={col.estado}
          className={`kb-col est-${col.estado} ${sobre === col.estado ? "kb-sobre" : ""}`}
          onDragOver={e => { e.preventDefault(); setSobre(col.estado); }}
          onDragLeave={() => setSobre(s => (s === col.estado ? null : s))}
          onDrop={() => soltar(col.estado)}>
          <div className="kb-head" style={{ color: col.color }}>
            {col.titulo} <span className="kb-n">{col.items.length}</span>
          </div>
          {col.items.map(p => {
            const d = dias(p.fecha_limite);
            const vencColor = d === null ? null : d < 0 || d <= 2 ? "var(--red)" : d <= 7 ? "var(--yellow)" : "var(--dim)";
            return (
              <div key={p.id} className="kb-card" draggable
                onDragStart={() => setArrastrando(p.id)}
                onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                onClick={() => router.push(`/caso/${p.id}`)}>
                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>
                  {TIPO_ICO[p.tipo] || "💬"} {p.titulo}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
                  {(p.resp as any)?.nombre
                    ? <span className="tv-resp" style={{ fontSize: 10, padding: "1px 8px" }}>{corto((p.resp as any).nombre)}</span>
                    : ["tarea", "problema", "pago"].includes(p.tipo) &&
                      <span style={{ color: "var(--yellow)", fontSize: 10.5 }}>⚠ sin resp.</span>}
                  {d !== null && !["resuelta", "archivada"].includes(p.estado) && (
                    <span style={{ color: vencColor!, fontSize: 10.5, fontWeight: 700 }}>
                      {d < 0 ? `vencido ${Math.abs(d)}d` : d === 0 ? "HOY" : `${d}d`}
                    </span>
                  )}
                  {p.nc > 0 && <span className="mini-ind">💬 {p.nc}</span>}
                  {p.sub > 0 && <span className="mini-ind">🧩 {p.sub}</span>}
                  {reacStr(p.reac) && <span className="mini-ind">{reacStr(p.reac)}</span>}
                </div>
                {(p.vinc || []).length > 0 && (
                  <div className="kb-chips">
                    {p.vinc.slice(0, 4).map((c: any, i: number) => (
                      <Link key={i} href={`/entidad/${c.tipo}/${c.id}`}
                        onClick={e => e.stopPropagation()} className="kb-chip">
                        {ENT_ICO[c.tipo] || "🔗"} {c.nombre}
                      </Link>
                    ))}
                    {p.vinc.length > 4 && <span className="kb-chip">+{p.vinc.length - 4}</span>}
                  </div>
                )}
              </div>
            );
          })}
          {!col.items.length && <div className="kb-vacia">— vacío —</div>}
        </div>
      ))}
    </div>
  );
}
