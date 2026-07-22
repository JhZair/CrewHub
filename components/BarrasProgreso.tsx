import type { Progreso } from "@/lib/progreso";

/* Las dos barras del caso: ⏳ Tiempo y ⚡ Trabajo, con el veredicto de la
   comparación. Cada barra lleva su explicación en texto («5 de 8 sub-casos»)
   porque un porcentaje pelado no se audita ni se actúa.
   `mini` es para las tarjetas de los listados: dos hilos de 2 px, sin texto. */

const VEREDICTO: Record<string, [string, string]> = {
  adelantado: ["🚀 Vas adelantado", "var(--green)"],
  a_tiempo:   ["👌 Al día", "var(--teal)"],
  retrasado:  ["🐢 Vas retrasado", "var(--yellow)"],
};

export default function BarrasProgreso({ p, mini }: { p: Progreso | null; mini?: boolean }) {
  if (!p) return null;

  // Compacto: solo los dos hilos, para escanear un tablero sin leer.
  if (mini) {
    const alerta = p.veredicto === "retrasado" || p.estancado;
    return (
      <div className="bp-mini" title={
        [p.tiempo && `⏳ Tiempo ${p.tiempo.pct}% (${p.tiempo.texto})`,
         `⚡ Trabajo ${p.trabajo.pct}% (${p.trabajo.texto})`,
         p.veredicto && VEREDICTO[p.veredicto]?.[0],
         p.estancado && `⚠ ${p.estancado.dias} días sin movimiento`,
        ].filter(Boolean).join("\n")}>
        {p.tiempo && (
          <span className="bp-hilo"><span style={{ width: `${p.tiempo.pct}%`, background: "var(--dim)" }} /></span>
        )}
        <span className="bp-hilo">
          <span style={{ width: `${p.trabajo.pct}%`, background: alerta ? "var(--yellow)" : "var(--teal)" }} />
        </span>
      </div>
    );
  }

  const ver = p.veredicto ? VEREDICTO[p.veredicto] : null;
  return (
    <div className="bp">
      {p.tiempo && (
        <div className="bp-fila">
          <span className="bp-lbl">⏳ Tiempo</span>
          <span className="bp-bar"><span style={{ width: `${p.tiempo.pct}%`, background: "var(--dim)" }} /></span>
          <b className="bp-pct">{p.tiempo.pct}%</b>
          <i className="bp-txt">{p.tiempo.texto}</i>
        </div>
      )}
      <div className="bp-fila">
        <span className="bp-lbl">⚡ Trabajo</span>
        <span className="bp-bar">
          <span style={{ width: `${p.trabajo.pct}%`, background: ver ? ver[1] : "var(--teal)" }} />
        </span>
        <b className="bp-pct" style={{ color: ver ? ver[1] : "var(--teal)" }}>{p.trabajo.pct}%</b>
        <i className="bp-txt">{p.trabajo.texto}</i>
      </div>

      {(ver || p.estancado) && (
        <div className="bp-pie">
          {ver && (
            <span style={{ color: ver[1], fontWeight: 700 }}>
              {ver[0]}
              {p.desvio !== null && p.veredicto !== "a_tiempo" &&
                ` · ${p.desvio > 0 ? "+" : ""}${p.desvio} pts`}
            </span>
          )}
          {p.estancado && (
            <span style={{ color: "var(--red)", fontWeight: 700 }}>
              ⚠ {p.estancado.dias} días sin movimiento real
            </span>
          )}
        </div>
      )}
    </div>
  );
}
