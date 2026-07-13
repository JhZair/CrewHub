"use client";
import { devolverEquipo } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Ronda de devoluciones: cada préstamo abierto con su retorno a un clic */
export default function BotonDevolver({ prestamoId, equipoId }: {
  prestamoId: string; equipoId: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const devolver = async () => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const res = await devolverEquipo(prestamoId, equipoId);
    setOcupado(false); setConfirmando(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>⚠ {error}</span>}
      {confirmando ? (
        <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
          ¿volvió? <button style={{ color: "var(--green)", fontWeight: 700 }} disabled={ocupado} onClick={devolver}>
            {ocupado ? "..." : "sí"}
          </button>
          {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setConfirmando(false)}>no</button>
        </span>
      ) : (
        <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11.5 }}
          onClick={() => setConfirmando(true)}>↩ Devolver</button>
      )}
    </span>
  );
}
