"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ocultarResueltosDelFeed } from "@/app/actions";

/* Barrita para limpiar de una todos los resueltos que están A LA VISTA. Recibe
   los ids visibles (los que quedan tras el auto-ocultado), así lo que oculta
   coincide exactamente con lo que el usuario ve. Complementa al ojo (uno a uno)
   y al auto-ocultado (que actúa en la próxima visita). */
export default function BotonOcultarResueltos({ ids }: { ids: string[] }) {
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();
  const n = ids.length;
  if (!n) return null;

  const ocultar = async () => {
    if (ocupado) return;
    setOcupado(true);
    const r: any = await ocultarResueltosDelFeed(ids);
    setOcupado(false);
    if (r?.error) { alert(r.error); return; }
    router.refresh();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 10px", color: "var(--dim)", fontSize: 12.5 }}>
      <span>✅ {n} resuelto{n === 1 ? "" : "s"} a la vista</span>
      <button className="btn btn-ghost" onClick={ocultar} disabled={ocupado}
        style={{ fontSize: 12, padding: "5px 12px" }}>
        {ocupado ? "Ocultando…" : "🧹 Ocultar los resueltos"}
      </button>
    </div>
  );
}
