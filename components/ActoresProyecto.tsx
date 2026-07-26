"use client";
import { agregarActorProyecto, editarActorProyecto, quitarActorProyecto } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import Avatar from "@/components/Avatar";
import { ROLES_ACTOR, ordenarActores } from "@/lib/actores";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

/* Los actores sociales de un proyecto: los personajes de la vida real que el
 * documental retrata. No son el equipo (quienes lo hacen) ni el cliente (para
 * quién es un encargo) — son a quiénes se cuenta.
 *
 * Cada uno enlaza a su ficha de persona y lleva un rol corto (protagonista,
 * secundario…) y una descripción del personaje. El jurado DAFO valora a quién
 * se retrata, así que esto no es adorno: es material de postulación.
 */
export default function ActoresProyecto({ proyectoId, actores, personas }: {
  proyectoId: string;
  actores: any[];
  personas: CatalogoItem[];
}) {
  const [agregando, setAgregando] = useState(false);
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null);
  const [rol, setRol] = useState("");
  const [desc, setDesc] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [eRol, setERol] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const guardar = async () => {
    if (!sel || guardando) return;
    setGuardando(true); setError("");
    const r: any = await agregarActorProyecto(proyectoId, sel.id, rol, desc);
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    setSel(null); setRol(""); setDesc(""); setAgregando(false);
    router.refresh();
  };
  const guardarEdicion = async (id: string) => {
    const r: any = await editarActorProyecto(id, proyectoId, eRol, eDesc);
    if (r?.error) { setError(r.error); return; }
    setEditando(null);
    router.refresh();
  };
  const quitar = async (id: string) => {
    const r: any = await quitarActorProyecto(id, proyectoId);
    setQuitando(null);
    if (r?.error) setError(r.error); else router.refresh();
  };
  const abrirEdicion = (a: any) => {
    setEditando(a.id); setERol(a.rol || ""); setEDesc(a.descripcion || "");
  };

  const inputStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 10px", fontSize: 13, color: "var(--text)", width: "100%",
  } as const;

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          🎭 Actores sociales · {actores.length}
        </h4>
        <span style={{ flex: 1 }} />
        {!agregando && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
            onClick={() => setAgregando(true)}>＋ Agregar</button>
        )}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}

      {agregando && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <EntPicker etiqueta={sel ? `👤 ${sel.nombre}` : "👤 Elegir persona"} items={personas}
              onPick={id => {
                const p: any = personas.find(x => x.id === id);
                if (p) setSel({ id: p.id, nombre: p.alias || p.nombre });
              }} />
            <input list="roles-actor" value={rol} onChange={e => setRol(e.target.value)}
              placeholder="Rol (protagonista, secundario…)"
              style={{ ...inputStyle, flex: 1, minWidth: 180, width: "auto" }} />
            <datalist id="roles-actor">{ROLES_ACTOR.map(r => <option key={r} value={r} />)}</datalist>
          </div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Descripción del personaje (opcional)"
            rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
              title={!sel ? "Elige la persona" : "Guardar"}
              disabled={!sel || guardando} onClick={guardar}>
              {guardando ? "…" : "Guardar"}
            </button>
            <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
              onClick={() => { setAgregando(false); setSel(null); setRol(""); setDesc(""); }}>Cancelar</button>
          </div>
        </div>
      )}

      {ordenarActores(actores).map(a => (
        <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0", borderTop: "1px solid var(--border)" }}>
          <Avatar nombre={a.persona?.nombre} src={a.persona?.foto_url} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Link href={`/entidad/persona/${a.persona?.id}`} style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>
                {a.persona?.alias || a.persona?.nombre} →
              </Link>
              {a.rol && (
                <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.14)", textTransform: "none", letterSpacing: 0, fontWeight: 700 }}>
                  {a.rol}
                </span>
              )}
            </div>
            {editando === a.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                <input list="roles-actor" value={eRol} onChange={e => setERol(e.target.value)}
                  placeholder="Rol (protagonista, secundario…)" style={inputStyle} />
                <textarea value={eDesc} onChange={e => setEDesc(e.target.value)}
                  placeholder="Descripción del personaje" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => guardarEdicion(a.id)}>Guardar</button>
                  <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              a.descripcion && (
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>
                  {a.descripcion}
                </div>
              )
            )}
          </div>
          {editando !== a.id && (
            quitando === a.id ? (
              <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => quitar(a.id)}>sí</button>
                {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setQuitando(null)}>no</button>
              </span>
            ) : (
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button title="Editar rol y descripción" style={{ color: "var(--dim)" }} onClick={() => abrirEdicion(a)}>✎</button>
                <button title="Quitar de actores sociales" style={{ color: "var(--dim)" }} onClick={() => setQuitando(a.id)}>✕</button>
              </div>
            )
          )}
        </div>
      ))}

      {!actores.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "4px 0" }}>
          Sin actores sociales — los personajes de la vida real que retrata el documental.
        </div>
      )}
    </div>
  );
}
