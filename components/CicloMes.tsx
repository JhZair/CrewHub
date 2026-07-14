"use client";
import { confirmarMiMes, reabrirMiMes } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const money = (n: number) => `S/ ${Math.round(n || 0).toLocaleString("es-PE")}`;
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "";

/* El ciclo de pago del mes, lado de la persona: confirmar (firma) y ver el
   recibo cuando el admin liquida. El mes es automático; esto es el cierre. */
export default function CicloMes({ anio, mes, mesNombre, liq }: {
  anio: number; mes: number; mesNombre: string; liq: any | null;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const run = async (fn: () => Promise<any>) => {
    setOcupado(true); const r: any = await fn(); setOcupado(false);
    if (r?.error) alert(r.error); else router.refresh();
  };

  if (liq?.estado === "liquidado") {
    return (
      <div className="card" style={{ borderColor: "rgba(46,204,113,.4)", background: "rgba(46,204,113,.05)" }}>
        <div className="panel-h" style={{ color: "var(--green)" }}>🧾 Recibo interno · {mesNombre} {anio}</div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: "var(--teal)" }}>{money(liq.total_monto)}</span>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>{liq.total_jornadas} jornadas</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: "var(--dim)", fontSize: 12 }}>Liquidado el {fmt(liq.liquidado_en)}</span>
        </div>
        <p style={{ color: "var(--dim)", fontSize: 11.5, margin: "8px 0 0" }}>
          Mes cerrado. Para corregir algo, pide al administrador que reabra la liquidación.
        </p>
      </div>
    );
  }

  if (liq?.estado === "confirmado") {
    return (
      <div className="card" style={{ borderColor: "rgba(244,180,0,.35)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--green)", fontWeight: 700, fontSize: 13.5 }}>✅ Confirmaste tu mes de {mesNombre}</span>
          <span style={{ color: "var(--dim)", fontSize: 12 }}>el {fmt(liq.confirmado_en)} · esperando que el admin lo liquide</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" disabled={ocupado} style={{ fontSize: 12 }}
            onClick={() => run(() => reabrirMiMes(anio, mes))}>↩ Reabrir</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13 }}>📅 Tu ciclo de <b>{mesNombre}</b> está abierto — registra tus jornadas y confírmalo cuando esté completo.</span>
        <span style={{ flex: 1 }} />
        <button className="btn" disabled={ocupado} onClick={() => run(() => confirmarMiMes(anio, mes))}>
          {ocupado ? "…" : "✓ Confirmar mi mes"}
        </button>
      </div>
    </div>
  );
}
