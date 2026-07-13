"use client";
import { enlazarCuenta, desenlazarCuenta } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* 🔗 Cuenta de acceso: qué usuario del sistema es esta persona.
   Enlazarla hace que su perfil muestre toda su actividad real. */
export default function CuentaAcceso({ personaId, cuenta, libres }: {
  personaId: string;
  cuenta: { id: string; nombre: string } | null;   // perfil enlazado (o null)
  libres: { id: string; nombre: string }[];        // cuentas sin persona asignada
}) {
  const [sel, setSel] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [soltando, setSoltando] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const enlazar = async () => {
    if (!sel || ocupado) return;
    setOcupado(true); setError("");
    const res = await enlazarCuenta(personaId, sel);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    setSel("");
    router.refresh();
  };

  const soltar = async () => {
    setOcupado(true); setError("");
    const res = await desenlazarCuenta(personaId);
    setOcupado(false); setSoltando(false);
    if (res?.error) setError(res.error); else router.refresh();
  };

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <h4>🔗 Cuenta de acceso</h4>
      {error && <div className="err-inline">⚠ {error}</div>}

      {cuenta ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <span style={{ color: "var(--green)" }}>✓</span>
          <b style={{ flex: 1 }}>{cuenta.nombre}</b>
          {soltando ? (
            <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
              ¿desenlazar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={soltar}>sí</button>
              {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setSoltando(false)}>no</button>
            </span>
          ) : (
            <button title="Desenlazar cuenta" style={{ color: "var(--dim)" }}
              onClick={() => setSoltando(true)}>✕</button>
          )}
        </div>
      ) : libres.length ? (
        <>
          <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 8 }}>
            Sin cuenta enlazada — su actividad no aparece en este perfil.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={sel} onChange={e => setSel(e.target.value)}
              style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: "var(--text)", outline: "none" }}>
              <option value="">Elegir cuenta…</option>
              {libres.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
              disabled={!sel || ocupado} onClick={enlazar}>
              {ocupado ? "..." : "Enlazar"}
            </button>
          </div>
        </>
      ) : (
        <div style={{ color: "var(--dim)", fontSize: 12 }}>
          Sin cuenta enlazada, y no quedan cuentas libres — todas ya tienen persona.
        </div>
      )}
    </div>
  );
}
