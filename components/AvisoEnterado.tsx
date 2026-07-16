"use client";
import { toggleEnterado } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Acuse de recibo de un aviso: "Enterados N/M". Un aviso no se "resuelve";
   importa hasta que el equipo relevante se dio por enterado. Reusa el 👀. */
export default function AvisoEnterado({ pubId, userId, enteradosIds, equipo, fechaLimite }: {
  pubId: string; userId: string; enteradosIds: string[]; equipo: { id: string; nombre: string }[];
  fechaLimite?: string | null;
}) {
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();

  const setE = new Set(enteradosIds);
  const faltan = equipo.filter(p => !setE.has(p.id));
  const N = equipo.length - faltan.length;
  const M = equipo.length;
  const pct = M ? Math.round((N / M) * 100) : 0;
  const mia = setE.has(userId);
  const objetivo = Math.floor(M / 2) + 1; // más de la mitad
  const suficiente = M > 0 && N >= objetivo;
  /* Con plazo por delante, enterarse NO archiva: el aviso sigue vivo hasta
     que el trabajo esté hecho. Hay que decirlo aquí, porque si no la gente
     marca "ya vi" esperando que desaparezca — y esa expectativa fue la que
     borró del radar la subsanación de Pampacucho. */
  const conPlazo = !!fechaLimite && fechaLimite >= new Date().toISOString().slice(0, 10);

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
        <span className="ae-tit">👀 Enterados · <b>{N}/{M}</b>{" "}
          <span className="ae-meta">
            {conPlazo ? "acuse de recibo — no archiva" : `basta la mayoría (${objetivo})`}
          </span>
        </span>
        <span className="ae-bar"><span style={{ width: `${pct}%`, background: suficiente ? "linear-gradient(90deg,#34d399,#10b981)" : undefined }} /></span>
        <button className={mia ? "btn btn-ghost" : "btn"} onClick={tap} disabled={ocupado}
          style={{ fontSize: 12, padding: "5px 13px", whiteSpace: "nowrap" }}>
          {ocupado ? "…" : mia ? "✓ Te enteraste" : "✓ Ya me enteré"}
        </button>
      </div>
      {conPlazo ? (
        <div className="ae-faltan" style={{ color: "var(--yellow)" }}>
          ⏰ Este aviso tiene plazo — <b>no se archiva al enterarse</b>. Sigue vivo hasta que
          el trabajo esté hecho; archívalo a mano cuando lo esté.
          {N < objetivo && faltan.length ? ` · aún no lo vieron: ${faltan.map(p => p.nombre.split(" ")[0]).join(", ")}` : ""}
        </div>
      ) : suficiente ? (
        <div className="ae-todos">✅ Ya se enteró la mayoría ({N}/{M}) — suficiente, el aviso se archiva solo.</div>
      ) : M > 0 ? (
        <div className="ae-faltan">
          Faltan <b>{objetivo - N}</b> para la mayoría
          {faltan.length ? ` · aún no: ${faltan.map(p => p.nombre.split(" ")[0]).join(", ")}` : ""}
        </div>
      ) : null}
    </div>
  );
}
