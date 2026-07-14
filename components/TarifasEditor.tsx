"use client";
import { editarTarifa } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

type P = { id: string; nombre: string; tarifa_dia: number | null; tarifa_rodaje: number | null; tarifa_noche: number | null };

const inp = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 8px", fontSize: 12.5, color: "var(--text)", outline: "none", width: 92 } as const;

/* Fila a nivel de módulo para que los inputs no pierdan el foco al escribir */
function Fila({ p, onSaved }: { p: P; onSaved: () => void }) {
  const [dia, setDia] = useState<string>(p.tarifa_dia?.toString() ?? "");
  const [rod, setRod] = useState<string>(p.tarifa_rodaje?.toString() ?? "");
  const [noc, setNoc] = useState<string>(p.tarifa_noche?.toString() ?? "");
  const [ocupado, setOcupado] = useState(false);
  const sucio = dia !== (p.tarifa_dia?.toString() ?? "") || rod !== (p.tarifa_rodaje?.toString() ?? "") || noc !== (p.tarifa_noche?.toString() ?? "");
  const guardar = async () => {
    setOcupado(true);
    const res: any = await editarTarifa(p.id, dia === "" ? null : Number(dia), rod === "" ? null : Number(rod), noc === "" ? null : Number(noc));
    setOcupado(false);
    if (res?.error) alert(res.error); else onSaved();
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 120, fontSize: 12.5, fontWeight: 600 }}>{p.nombre}</span>
      <label style={{ fontSize: 11, color: "var(--dim)" }}>día</label>
      <input type="number" value={dia} placeholder="S/" onChange={e => setDia(e.target.value)} style={inp} />
      <label style={{ fontSize: 11, color: "var(--dim)" }}>rodaje</label>
      <input type="number" value={rod} placeholder="S/" onChange={e => setRod(e.target.value)} style={inp} />
      <label style={{ fontSize: 11, color: "var(--dim)" }}>🏕 noche</label>
      <input type="number" value={noc} placeholder="S/" onChange={e => setNoc(e.target.value)} style={inp} />
      <button className="btn btn-ghost" style={{ padding: "5px 11px", fontSize: 11.5, opacity: sucio ? 1 : 0.45 }}
        disabled={!sucio || ocupado} onClick={guardar}>{ocupado ? "…" : "Guardar"}</button>
    </div>
  );
}

export default function TarifasEditor({ personas, abierto = false }: { personas: P[]; abierto?: boolean }) {
  const router = useRouter();
  return (
    <details className="card" style={{ marginTop: 14 }} open={abierto}>
      <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
        💰 Tarifas por persona (S/ por día · normal y rodaje)
      </summary>
      <div style={{ marginTop: 10 }}>
        {personas.map(p => <Fila key={p.id} p={p} onSaved={() => router.refresh()} />)}
        {!personas.length && <div className="empty">No hay personas.</div>}
        <p style={{ color: "var(--dim)", fontSize: 11, marginTop: 8 }}>
          Si "rodaje" queda vacío se usa la tarifa de día normal; si "🏕 noche" queda vacío se usa la de rodaje.
          El pernocte se suma cuando la jornada incluye noche de camping. El monto se congela al registrar.
        </p>
      </div>
    </details>
  );
}
