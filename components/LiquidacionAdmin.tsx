"use client";
import { liquidarMes, reabrirLiquidacion } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const money = (n: number) => `S/ ${Math.round(n || 0).toLocaleString("es-PE")}`;

/* Liquidación por persona del mes (admin): genera el recibo (solo si todo
   está aprobado) o reabre una liquidación para corregir. */
export default function LiquidacionAdmin({ anio, mes, filas }: {
  anio: number; mes: number;
  filas: { personaId: string; nombre: string; dias: number; pend: number; monto: number; estado: string | null }[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const act = async (pid: string, fn: () => Promise<any>) => {
    setOcupado(pid); const r: any = await fn(); setOcupado(null);
    if (r?.error) alert(r.error); else router.refresh();
  };
  return (
    <div className="card">
      {filas.map(f => (
        <div className="info-row" key={f.personaId} style={{ gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 12.5, minWidth: 120 }}>{f.nombre}</span>
          <span style={{ fontSize: 12 }}>{f.dias} jornadas</span>
          <span style={{ color: "var(--teal)", fontSize: 12, fontWeight: 700 }}>{money(f.monto)}</span>
          {f.pend > 0 && <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)", fontSize: 10.5 }}>⏳ {f.pend} por aprobar</span>}
          <span className="badge" style={{
            fontSize: 10.5, background: "#1c1c2c",
            color: f.estado === "liquidado" ? "var(--green)" : f.estado === "confirmado" ? "var(--blue)" : "var(--dim)",
          }}>
            {f.estado === "liquidado" ? "🧾 liquidado" : f.estado === "confirmado" ? "✓ confirmó" : "— abierto"}
          </span>
          <span style={{ flex: 1 }} />
          {f.estado === "liquidado" ? (
            <button className="dato-btn" disabled={ocupado === f.personaId}
              onClick={() => act(f.personaId, () => reabrirLiquidacion(f.personaId, anio, mes))}>↩ reabrir</button>
          ) : (
            <button className="btn" style={{ padding: "4px 11px", fontSize: 11.5, opacity: f.pend > 0 ? 0.5 : 1 }}
              disabled={f.pend > 0 || ocupado === f.personaId}
              title={f.pend > 0 ? "Aprueba todas las jornadas antes de liquidar" : "Generar el recibo"}
              onClick={() => act(f.personaId, () => liquidarMes(f.personaId, anio, mes))}>🧾 Liquidar</button>
          )}
        </div>
      ))}
      {!filas.length && <div className="empty">Sin jornadas este mes.</div>}
    </div>
  );
}
