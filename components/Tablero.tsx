"use client";
import { cambiarEstado } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TIPO_ICO: Record<string, string> = {
  aviso: "📢", tarea: "✅", problema: "❗", consulta: "❓", pago: "💰", idea: "💡", archivo: "📎",
};

function dias(fecha: string | null) {
  if (!fecha) return null;
  return Math.ceil((new Date(fecha + "T12:00:00").getTime() - Date.now()) / 86400000);
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
    if (res?.error) alert(res.error); else router.refresh();
  };

  return (
    <div className="kb">
      {columnas.map(col => (
        <div key={col.estado}
          className={`kb-col ${sobre === col.estado ? "kb-sobre" : ""}`}
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
                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>
                  {TIPO_ICO[p.tipo] || "💬"} {p.titulo}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 7, flexWrap: "wrap" }}>
                  {(p.resp as any)?.nombre
                    ? <span className="tv-resp" style={{ fontSize: 10.5, padding: "2px 9px" }}>{(p.resp as any).nombre.split(" ")[0]}</span>
                    : ["tarea", "problema", "pago"].includes(p.tipo) &&
                      <span style={{ color: "var(--yellow)", fontSize: 10.5 }}>⚠ sin resp.</span>}
                  {d !== null && !["resuelta", "archivada"].includes(p.estado) && (
                    <span style={{ color: vencColor!, fontSize: 10.5, fontWeight: 700 }}>
                      {d < 0 ? `vencido ${Math.abs(d)}d` : d === 0 ? "HOY" : `${d}d`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {!col.items.length && <div className="kb-vacia">— vacío —</div>}
        </div>
      ))}
    </div>
  );
}
