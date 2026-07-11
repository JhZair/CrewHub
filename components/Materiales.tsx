"use client";
import { guardarMateriales } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Expediente de la postulación: los documentos que pide la plataforma.
   Se guarda como JSON flexible — si un año las bases piden un material
   nuevo, solo se agrega un slot aquí, sin tocar la base de datos. */
export const SLOTS: [string, string][] = [
  ["investigacion", "🔍 Investigación"],
  ["ficha_tecnica", "📋 Ficha técnica"],
  ["tratamiento", "📖 Tratamiento / guion"],
  ["propuesta_realizacion", "🎬 Propuesta de realización"],
  ["recursos_tecnicos", "🎥 Recursos técnicos"],
  ["cronograma", "📅 Cronograma"],
  ["presupuesto", "💰 Presupuesto"],
  ["plan_rodaje", "🎬 Plan de rodaje"],
  ["plan_difusion", "📣 Plan tentativo de difusión"],
  ["teaser", "🎞 Teaser video"],
];

export default function Materiales({ postulacionId, materiales }: {
  postulacionId: string;
  materiales: Record<string, string>;
}) {
  const [editando, setEditando] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(SLOTS.map(([k]) => [k, materiales?.[k] || ""])));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const llenos = SLOTS.filter(([k]) => (materiales?.[k] || "").trim()).length;
  const color = llenos === SLOTS.length ? "var(--green)" : llenos >= 6 ? "var(--yellow)" : "var(--red)";

  const guardar = async () => {
    setGuardando(true); setError("");
    const res = await guardarMateriales(postulacionId, vals);
    setGuardando(false);
    if (res?.error) setError(res.error);
    else { setEditando(false); router.refresh(); }
  };

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          📎 Materiales de postulación
        </h4>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 800, color }}>{llenos}/{SLOTS.length}</span>
        {!editando && <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12, marginLeft: 8 }}
          onClick={() => setEditando(true)}>✎ Editar</button>}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}
      {!editando && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SLOTS.map(([k, lbl]) => {
              const url = (materiales?.[k] || "").trim();
              return url ? (
                <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="vtab"
                  style={{ borderColor: "rgba(46,204,113,.35)" }}>{lbl}</a>
              ) : (
                <span key={k} className="vtab" style={{ opacity: .35, cursor: "default" }}>{lbl}</span>
              );
            })}
          </div>
          {llenos < SLOTS.length && (
            <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 8 }}>
              Los apagados aún no tienen link — el expediente se completa durante la ruta de postulación.
            </div>
          )}
        </>
      )}

      {editando && (
        <div style={{ padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          {SLOTS.map(([k, lbl]) => (
            <label key={k} style={{ display: "block", fontSize: 11, color: "var(--dim)", marginBottom: 7 }}>
              {lbl}
              <input value={vals[k]} placeholder="https://drive.google.com/..."
                onChange={e => setVals({ ...vals, [k]: e.target.value })}
                style={{ width: "100%", marginTop: 3, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px", fontSize: 12, color: "var(--text)", outline: "none" }} />
            </label>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} disabled={guardando} onClick={guardar}>
              {guardando ? "..." : "Guardar expediente"}
            </button>
            <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
