/* Barrita de completitud de la ficha: qué % de sus campos están llenos.
   Verde ≥85%, ámbar ≥55%, gris por debajo (no rojo: una ficha a medias no es un
   error, es trabajo pendiente). El tooltip lista lo que falta. */
export default function Completitud({ pct, llenos, total, faltan, mini }: {
  pct: number; llenos: number; total: number; faltan: string[]; mini?: boolean;
}) {
  if (!total) return null;
  const col = pct >= 85 ? "var(--green)" : pct >= 55 ? "var(--yellow)" : "var(--dim)";
  const titulo = faltan.length ? `Ficha ${pct}% — faltan: ${faltan.join(", ")}` : "Ficha completa";

  // Compacto para los listados: solo la barrita fina + el %, sin etiquetas.
  if (mini) return (
    <div className="pl-compl" title={titulo}>
      <div className="pl-compl-bar"><span style={{ width: `${pct}%`, background: col }} /></div>
      <span className="pl-compl-n" style={{ color: col }}>{pct}%</span>
    </div>
  );

  return (
    <div className="compl" title={titulo}>
      <div className="compl-lbl">
        <span>Ficha completa</span>
        <b style={{ color: col }}>{pct}%</b>
      </div>
      <div className="compl-bar"><span style={{ width: `${pct}%`, background: col }} /></div>
      <div className="compl-sub">{llenos}/{total} campos{faltan.length ? ` · faltan ${faltan.length}` : " · completa"}</div>
    </div>
  );
}
