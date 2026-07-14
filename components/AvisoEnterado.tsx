"use client";
import { toggleEnterado } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Acuse de recibo de un aviso: "Enterados N/M". Un aviso no se "resuelve";
   importa hasta que el equipo relevante se dio por enterado. Reusa el 👀. */
export default function AvisoEnterado({ pubId, userId, enteradosIds, equipo }: {
  pubId: string; userId: string; enteradosIds: string[]; equipo: { id: string; nombre: string }[];
}) {
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();

  const setE = new Set(enteradosIds);
  const faltan = equipo.filter(p => !setE.has(p.id));
  const N = equipo.length - faltan.length;
  const M = equipo.length;
  const pct = M ? Math.round((N / M) * 100) : 0;
  const mia = setE.has(userId);

  const tap = async () => {
    if (ocupado) return;
    setOcupado(true);
    const res: any = await toggleEnterado(pubId);
    setOcupado(false);
    if (res?.error) { alert(res.error); return; }
    router.refresh();
  };

  return (
    <div className="aviso-enterado">
      <div className="ae-top">
        <span className="ae-tit">👀 Enterados · <b>{N}/{M}</b></span>
        <span className="ae-bar"><span style={{ width: `${pct}%` }} /></span>
        <button className={mia ? "btn btn-ghost" : "btn"} onClick={tap} disabled={ocupado}
          style={{ fontSize: 12, padding: "5px 13px", whiteSpace: "nowrap" }}>
          {ocupado ? "…" : mia ? "✓ Te enteraste" : "✓ Ya me enteré"}
        </button>
      </div>
      {faltan.length > 0 ? (
        <div className="ae-faltan">Faltan por enterarse: {faltan.map(p => p.nombre.split(" ")[0]).join(", ")}</div>
      ) : M > 0 ? (
        <div className="ae-todos">✅ Todo el equipo se enteró — el aviso se archiva solo.</div>
      ) : null}
    </div>
  );
}
