"use client";
import { comprobarEquipo } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const dias = (f: string) => Math.floor((Date.now() - new Date(f + "T12:00:00").getTime()) / 86400000);

/* El sello de la ronda: "lo vi hoy, existe, está bien" */
export default function BotonComprobar({ equipoId, ultima, compacto = false }: {
  equipoId: string; ultima: string | null; compacto?: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const comprobar = async (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (ocupado) return;
    setOcupado(true); setError("");
    const res = await comprobarEquipo(equipoId);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };

  const d = ultima ? dias(ultima) : null;
  const estado = d === null
    ? { txt: "nunca comprobado", color: "var(--red)" }
    : d > 90
      ? { txt: `visto hace ${d} días`, color: "var(--yellow)" }
      : { txt: d === 0 ? "comprobado hoy" : `visto hace ${d} días`, color: "var(--green)" };

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }} onClick={e => e.stopPropagation()}>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>⚠</span>}
      {!compacto && <span style={{ color: estado.color, fontSize: 11.5 }}>{estado.txt}</span>}
      {(d === null || d > 0) && (
        <button className="btn btn-ghost" disabled={ocupado} onClick={comprobar}
          title={`${estado.txt} — marcar como visto hoy`}
          style={{ padding: "3px 10px", fontSize: 11.5, color: estado.color, borderColor: `${estado.color}55` }}>
          {ocupado ? "..." : "✔ Comprobar"}
        </button>
      )}
      {d === 0 && <span title="Comprobado hoy" style={{ fontSize: 13 }}>✅</span>}
    </span>
  );
}
