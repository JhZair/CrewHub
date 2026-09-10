"use client";
import { saltarA } from "./Salto";

/* «k de n afirmaciones tienen fuente»: la barra segmentada. Cada tramo es
   una afirmación y salta a ella. Con cero afirmaciones no se pinta nada. */
export default function Verificacion({ afirmaciones }: { afirmaciones: { id: string; ref: number | null }[] }) {
  if (!afirmaciones.length) return null;
  const con = afirmaciones.filter(a => a.ref).length;
  return (
    <div className="wk-verif">
      <div className="wk-verif-top">
        <strong>{con} de {afirmaciones.length} afirmaciones tienen fuente</strong>
        <span className="wk-muted">Selecciona un tramo para ir a la afirmación</span>
      </div>
      <div className="wk-verif-bar">
        {afirmaciones.map((c, i) => (
          <button key={c.id} type="button" className={`wk-seg ${c.ref ? "ok" : "pend"}`} onClick={() => saltarA(`claim-${c.id}`)}
            aria-label={`Afirmación ${i + 1}: ${c.ref ? `con fuente ${c.ref}` : "por verificar"}`} />
        ))}
      </div>
      <div className="wk-verif-legend">
        <span><i className="wk-key ok" />Con fuente</span>
        <span><i className="wk-key pend" />Por verificar</span>
      </div>
    </div>
  );
}
