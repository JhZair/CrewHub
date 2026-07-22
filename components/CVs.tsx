"use client";
import { guardarCv, borrarCv } from "@/app/actions";
import MiniSelect from "@/components/MiniSelect";
import { DIAS_CV } from "@/lib/objetos";
import { useRouter } from "next/navigation";
import { useState } from "react";

const fmt = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
const diasDe = (f: string) => Math.floor((Date.now() - new Date(f + "T12:00:00").getTime()) / 86400000);

/* Biblioteca de CVs: uno por enfoque (el rol con el que postula).
   El enfoque sale de sus especialidades, para que pueda cruzarse con el
   cargo de cada postulación. */
export default function CVs({ personaId, cvs, especialidades }: {
  personaId: string;
  cvs: any[];
  especialidades: string[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [enfoque, setEnfoque] = useState("");
  const [url, setUrl] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  // Los enfoques ya usados no se ofrecen otra vez (hay uno por rol)
  const usados = new Set(cvs.map(c => c.enfoque));
  const libres = especialidades.filter(e => !usados.has(e) || e === enfoque);

  const limpiar = () => { setAbierto(false); setEditando(null); setEnfoque(""); setUrl(""); setError(""); };

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true); setError("");
    const res: any = await guardarCv(personaId, enfoque, url, editando);
    setGuardando(false);
    if (res?.error) { setError(res.error); return; }
    limpiar(); router.refresh();
  };

  const quitar = async (id: string) => {
    const res: any = await borrarCv(id, personaId);
    setBorrando(null);
    if (res?.error) setError(res.error); else router.refresh();
  };

  const editar = (c: any) => {
    setEditando(c.id); setEnfoque(c.enfoque); setUrl(c.url); setAbierto(true);
  };

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          📋 CVs por enfoque · {cvs.length}
        </h4>
        <span style={{ flex: 1 }} />
        {!abierto && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
            onClick={() => setAbierto(true)}>＋ Agregar</button>
        )}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}

      {abierto && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          {libres.length === 0 && !editando ? (
            <span style={{ color: "var(--yellow)", fontSize: 12 }}>
              Ya tiene CV de todas sus especialidades. Agrega una nueva en ✏️ Editar.
            </span>
          ) : (
            <>
              <MiniSelect value={enfoque} options={[["", "— enfoque —"], ...libres.map(e => [e, e])]}
                onSelect={v => setEnfoque(v)}
                buttonStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: enfoque ? "var(--text)" : "var(--dim)", minWidth: 180, justifyContent: "space-between" }} />
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/..."
                style={{ flex: 1, minWidth: 200, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: "var(--text)", outline: "none" }} />
              <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
                disabled={!enfoque || !url.trim() || guardando} onClick={guardar}>
                {guardando ? "..." : editando ? "Actualizar" : "Guardar"}
              </button>
            </>
          )}
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={limpiar}>Cancelar</button>
        </div>
      )}

      {cvs.map(c => {
        const viejo = c.actualizado ? diasDe(c.actualizado) > DIAS_CV : false;
        return (
          <div key={c.id} className="eq-row" style={{ alignItems: "center" }}>
            <span className="cargo">{c.enfoque}</span>
            <a href={c.url} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--text)", fontSize: 12.5 }}>📋 abrir ↗</a>
            <span style={{ flex: 1 }} />
            {c.actualizado && (
              <span style={{ color: viejo ? "var(--yellow)" : "var(--dim)", fontSize: 11 }}
                title={viejo ? "Conviene rehacerlo: lleva más de un año" : "Última actualización"}>
                {viejo ? "⚠ " : ""}{fmt(c.actualizado)}
              </span>
            )}
            <button className="dato-btn" style={{ marginLeft: 8 }} onClick={() => editar(c)}>✎</button>
            {borrando === c.id ? (
              <span style={{ fontSize: 11.5, marginLeft: 6, whiteSpace: "nowrap" }}>
                ¿borrar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => quitar(c.id)}>sí</button>
                {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(null)}>no</button>
              </span>
            ) : (
              <button style={{ color: "var(--dim)", marginLeft: 6 }} onClick={() => setBorrando(c.id)}>✕</button>
            )}
          </div>
        );
      })}

      {!cvs.length && !abierto && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0" }}>
          Sin CVs. Se necesita uno por cada rol con el que postule.
        </div>
      )}
    </div>
  );
}
