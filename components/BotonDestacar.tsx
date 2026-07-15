"use client";
import { destacarCaso } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const fmt = (f: string) =>
  new Date(f).toLocaleDateString("es-PE", { day: "numeric", month: "short" });

/* Subir un caso a la cabecera del feed. Solo administración.
   Caduca solo, así que no hay que acordarse de bajarlo. */
export default function BotonDestacar({ pubId, hasta }: {
  pubId: string; hasta?: string | null;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const activo = !!hasta && new Date(hasta) > new Date();

  const cambiar = async () => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const r: any = await destacarCaso(pubId, !activo);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn btn-ghost" disabled={ocupado} onClick={cambiar}
        title={activo
          ? "Quitarlo de la cabecera del feed"
          : "Subirlo a la cabecera del feed. Caduca solo: con su fecha límite, o a las 2 semanas"}
        style={{ fontSize: 12, padding: "7px 12px", ...(activo ? { color: "var(--yellow)", borderColor: "rgba(244,180,0,.4)" } : {}) }}>
        {ocupado ? "..." : activo ? "📌 Destacado" : "📌 Destacar en el feed"}
      </button>
      {activo && hasta && (
        <span style={{ color: "var(--dim)", fontSize: 11 }}>hasta el {fmt(hasta)}</span>
      )}
      {error && <span style={{ color: "var(--yellow)", fontSize: 11.5 }}>⚠ {error}</span>}
    </span>
  );
}
