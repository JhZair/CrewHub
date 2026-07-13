"use client";
import { prestarEquipo, devolverEquipo } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const fmtF = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

/* ¿En manos de quién está este equipo? Portador actual + historial de uso. */
export default function PrestamoEquipo({ equipoId, prestamos, personas, proyectos }: {
  equipoId: string;
  prestamos: any[];
  personas: CatalogoItem[];
  proyectos: CatalogoItem[];
}) {
  const [prestando, setPrestando] = useState(false);
  const [quien, setQuien] = useState<{ id: string; nombre: string } | null>(null);
  const [proy, setProy] = useState<{ id: string; nombre: string } | null>(null);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [devolviendo, setDevolviendo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const actual = prestamos.find(p => !p.hasta);
  const pasados = prestamos.filter(p => p.hasta);

  const prestar = async () => {
    if (!quien || ocupado) return;
    setOcupado(true); setError("");
    const res = await prestarEquipo(equipoId, quien.id, proy?.id || null, nota);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    setPrestando(false); setQuien(null); setProy(null); setNota("");
    router.refresh();
  };

  const devolver = async (id: string) => {
    const res = await devolverEquipo(id, equipoId);
    setDevolviendo(null);
    if (res?.error) setError(res.error); else router.refresh();
  };

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          🤝 ¿En manos de quién?
        </h4>
        <span style={{ flex: 1 }} />
        {!prestando && !actual && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
            onClick={() => setPrestando(true)}>＋ Prestar</button>
        )}
      </div>
      {error && <div className="err-inline">⚠ {error}</div>}

      {actual ? (
        <div style={{ padding: "9px 11px", background: "var(--bg)", borderRadius: 10, borderLeft: "3px solid var(--yellow)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
            <Link href={`/entidad/persona/${actual.persona?.id}`} style={{ fontWeight: 700, color: "var(--text)" }}>
              👤 {actual.persona?.alias || actual.persona?.nombre} →
            </Link>
            <span style={{ color: "var(--dim)", fontSize: 11.5 }}>desde {fmtF(actual.desde)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6, fontSize: 11.5, color: "var(--muted)" }}>
            {actual.proy && (
              <Link href={`/entidad/proyecto/${actual.proy.id}`} className="badge"
                style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>📁 {actual.proy.nombre}</Link>
            )}
            {actual.nota && <span>«{actual.nota}»</span>}
            <span style={{ flex: 1 }} />
            {devolviendo === actual.id ? (
              <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                ¿devuelto? <button style={{ color: "var(--green)", fontWeight: 700 }} onClick={() => devolver(actual.id)}>sí</button>
                {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setDevolviendo(null)}>no</button>
              </span>
            ) : (
              <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11.5 }}
                onClick={() => setDevolviendo(actual.id)}>↩ Devolver</button>
            )}
          </div>
        </div>
      ) : !prestando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "4px 0" }}>
          En el almacén — nadie lo tiene ahora.
        </div>
      )}

      {prestando && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <EntPicker etiqueta={quien ? `👤 ${quien.nombre}` : "👤 ¿A quién?"} items={personas}
            onPick={id => { const p = personas.find(x => x.id === id); if (p) setQuien({ id: p.id, nombre: p.nombre }); }} />
          <EntPicker etiqueta={proy ? `📁 ${proy.nombre}` : "📁 ¿Para qué proyecto? (opcional)"} items={proyectos}
            onPick={id => { const p = proyectos.find(x => x.id === id); if (p) setProy({ id: p.id, nombre: p.nombre }); }} />
          <input value={nota} placeholder="Nota (opcional)" onChange={e => setNota(e.target.value)}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none", flex: 1, minWidth: 140, color: "var(--text)" }} />
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }} disabled={!quien || ocupado} onClick={prestar}>
            {ocupado ? "..." : "Prestar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
            onClick={() => { setPrestando(false); setQuien(null); setProy(null); }}>Cancelar</button>
        </div>
      )}

      {pasados.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ color: "var(--dim)", fontSize: 11.5, cursor: "pointer" }}>
            🕐 Historial de uso ({pasados.length})
          </summary>
          {pasados.map((p: any) => (
            <div key={p.id} className="eq-row" style={{ opacity: .6 }}>
              <span style={{ fontSize: 12 }}>{p.persona?.alias || p.persona?.nombre}</span>
              {p.proy && <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.1)", fontSize: 10 }}>{p.proy.nombre}</span>}
              <span style={{ flex: 1, textAlign: "right", color: "var(--dim)", fontSize: 11 }}>
                {fmtF(p.desde)} → {fmtF(p.hasta)}
              </span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
