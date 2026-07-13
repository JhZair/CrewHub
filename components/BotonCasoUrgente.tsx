"use client";
import { crearCasoUrgente } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* El botón del centro de acciones: hallazgo → caso urgente en un clic */
export default function BotonCasoUrgente({ titulo, cuerpo, entTipo, entId }: {
  titulo: string; cuerpo: string; entTipo: string; entId: string;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const crear = async () => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const r: any = await crearCasoUrgente(titulo, cuerpo, entTipo, entId);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    router.push(`/caso/${r.id}`);
  };

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>⚠</span>}
      <button className="btn btn-ghost" disabled={ocupado} onClick={crear}
        title="Crear caso urgente (❗ prioridad alta) vinculado"
        style={{ padding: "3px 10px", fontSize: 11.5, color: "var(--red)", borderColor: "rgba(255,77,94,.4)" }}>
        {ocupado ? "..." : "🚨 Crear caso"}
      </button>
    </span>
  );
}
