"use client";
import { guardarEntidad } from "@/app/actions";
import { FORM_CONF } from "@/lib/entidades";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PALETA = ["#a78bfa", "#3b82f6", "#f59e0b", "#2ecc71", "#ec4899", "#2dd4bf", "#f4b400", "#60a5fa"];

/* Campo de opciones múltiples: chips + autocompletado; guarda "a, b, c" */
function MultiTag({ valor, onChange, sugerencias, listId, error }: {
  valor: string; onChange: (v: string) => void;
  sugerencias: string[]; listId: string; error?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const partes = (valor || "").split(",").map(s => s.trim()).filter(Boolean);
  const agregar = (s: string) => {
    const v = s.trim();
    if (!v) return;
    if (!partes.includes(v)) onChange([...partes, v].join(", "));
    setDraft("");
  };
  const quitar = (p: string) => onChange(partes.filter(x => x !== p).join(", "));
  return (
    <div>
      {partes.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {partes.map(p => (
            <span key={p} className="badge"
              style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)", display: "inline-flex", gap: 6, alignItems: "center", textTransform: "none", letterSpacing: 0 }}>
              {p}
              <button type="button" onClick={() => quitar(p)} style={{ color: "var(--dim)", fontWeight: 700 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input list={listId} value={draft}
        placeholder={partes.length ? "＋ agregar otra..." : "Escribe o elige; Enter para agregar"}
        onChange={e => {
          const v = e.target.value;
          if (sugerencias.includes(v)) agregar(v); else setDraft(v);
        }}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); agregar(draft); }
        }}
        onBlur={() => draft && agregar(draft)}
        style={error ? { borderColor: "var(--red)" } : undefined} />
      <datalist id={listId}>
        {sugerencias.filter(s => !partes.includes(s)).map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}

export function EntidadForm({ tipo, id, valores, onDone }:
  { tipo: string; id?: string; valores?: Record<string, any>; onDone?: () => void }) {
  const conf = FORM_CONF[tipo];
  // Al CREAR se ocultan los campos marcados soloEditar (ej. presupuesto
  // vigente de un proyecto: solo existe cuando ya está en ejecución)
  const campos = conf.campos.filter(c => !(c as any).soloEditar || id);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    campos.forEach(c => {
      f[c.key] = valores?.[c.key]
        ?? (c.tipo === "color" ? PALETA[Math.floor(Math.random() * PALETA.length)] : "");
    });
    return f;
  });
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const router = useRouter();

  const guardar = async () => {
    if (guardando) return;
    // Validación en el propio formulario: marca los campos faltantes
    const errs: Record<string, string> = {};
    campos.forEach(c => {
      if (c.requerido && !(form[c.key] || "").trim()) errs[c.key] = "Este campo es obligatorio";
    });
    setErrores(errs);
    if (Object.keys(errs).length) return;

    setGuardando(true);
    const res = await guardarEntidad(tipo, id || null, form);
    setGuardando(false);
    if (res?.error) { alert(res.error); return; }
    if (!id && res?.id) { router.push(`/entidad/${tipo}/${res.id}`); return; }
    router.refresh();
    onDone?.();
  };

  const cancelar = () => { if (onDone) onDone(); else router.back(); };

  const setCampo = (key: string, valor: string) => {
    setForm({ ...form, [key]: valor });
    if (errores[key]) { const e = { ...errores }; delete e[key]; setErrores(e); }
  };

  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <b style={{ fontSize: 15 }}>{id ? `✏️ Editar ${conf.titulo.toLowerCase()}` : `＋ Nuevo ${conf.titulo.toLowerCase()}`}</b>
      <div className="f-grid">
        {campos.map(c => (
          <label key={c.key} className="f-campo" style={c.tipo === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
            <span style={errores[c.key] ? { color: "var(--red)" } : undefined}>
              {c.label}{c.requerido && <b style={{ color: "var(--red)" }}> *</b>}
            </span>
            {c.auto ? (
              <input disabled value={id ? (form[c.key] || "—") : ""}
                placeholder="Se genera automáticamente"
                style={{ opacity: .55, cursor: "not-allowed" }} />
            ) : c.tipo === "select" ? (
              <select value={form[c.key]} onChange={e => setCampo(c.key, e.target.value)}
                style={errores[c.key] ? { borderColor: "var(--red)" } : undefined}>
                <option value="">—</option>
                {c.opciones!.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
              </select>
            ) : c.tipo === "textarea" ? (
              <textarea rows={3} value={form[c.key]} onChange={e => setCampo(c.key, e.target.value)}
                style={errores[c.key] ? { borderColor: "var(--red)" } : undefined} />
            ) : c.tipo === "color" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="color" value={form[c.key] || "#a78bfa"}
                  onChange={e => setCampo(c.key, e.target.value)}
                  style={{ width: 44, height: 32, padding: 2, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer" }} />
                <span style={{ color: "var(--dim)", fontSize: 11, textTransform: "none", letterSpacing: 0 }}>
                  identifica al proyecto en listas y gráficos
                </span>
              </div>
            ) : c.tipo === "date" ? (
              <input type="date" value={form[c.key]} onChange={e => setCampo(c.key, e.target.value)}
                style={errores[c.key] ? { borderColor: "var(--red)" } : undefined} />
            ) : c.sugerencias && c.multiple ? (
              <MultiTag valor={form[c.key]} onChange={v => setCampo(c.key, v)}
                sugerencias={c.sugerencias} listId={`sug-${c.key}`} error={!!errores[c.key]} />
            ) : c.sugerencias ? (
              <>
                <input list={`sug-${c.key}`} value={form[c.key]}
                  onChange={e => setCampo(c.key, e.target.value)}
                  placeholder="Escribe o elige de la lista..."
                  style={errores[c.key] ? { borderColor: "var(--red)" } : undefined} />
                <datalist id={`sug-${c.key}`}>
                  {c.sugerencias.map(s => <option key={s} value={s} />)}
                </datalist>
              </>
            ) : (
              <input value={form[c.key]} onChange={e => setCampo(c.key, e.target.value)}
                style={errores[c.key] ? { borderColor: "var(--red)" } : undefined} />
            )}
            {errores[c.key] && <span style={{ color: "var(--red)", fontSize: 10.5, textTransform: "none", letterSpacing: 0 }}>{errores[c.key]}</span>}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={cancelar}>Cancelar</button>
        <button className="btn" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

/* Botón "Editar" que abre el formulario en ventana modal amplia */
export function Mantenimiento({ tipo, id, valores }:
  { tipo: string; id: string; valores: Record<string, any> }) {
  const [abierto, setAbierto] = useState(false);
  if (!FORM_CONF[tipo]) return null;
  return (
    <>
      <button className="btn btn-ghost" onClick={() => setAbierto(true)}>✏️ Editar</button>
      {abierto && (
        <div className="modal-fondo"
          onClick={e => { if (e.target === e.currentTarget) setAbierto(false); }}>
          <div className="modal-ed">
            <EntidadForm tipo={tipo} id={id} valores={valores} onDone={() => setAbierto(false)} />
          </div>
        </div>
      )}
    </>
  );
}
