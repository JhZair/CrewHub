"use client";
import { guardarEntidad } from "@/app/actions";
import { FORM_CONF } from "@/lib/entidades";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EntidadForm({ tipo, id, valores, onDone }:
  { tipo: string; id?: string; valores?: Record<string, any>; onDone?: () => void }) {
  const conf = FORM_CONF[tipo];
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    conf.campos.forEach(c => { f[c.key] = valores?.[c.key] ?? ""; });
    return f;
  });
  const [guardando, setGuardando] = useState(false);
  const router = useRouter();

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    const res = await guardarEntidad(tipo, id || null, form);
    setGuardando(false);
    if (res?.error) { alert(res.error); return; }
    if (!id && res?.id) { router.push(`/entidad/${tipo}/${res.id}`); return; }
    router.refresh();
    onDone?.();
  };

  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <b style={{ fontSize: 15 }}>{id ? `✏️ Editar ${conf.titulo.toLowerCase()}` : `＋ Nuevo ${conf.titulo.toLowerCase()}`}</b>
      <div className="f-grid">
        {conf.campos.map(c => (
          <label key={c.key} className="f-campo" style={c.tipo === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
            <span>{c.label}{c.requerido && " *"}</span>
            {c.tipo === "select" ? (
              <select value={form[c.key]} onChange={e => setForm({ ...form, [c.key]: e.target.value })}>
                <option value="">—</option>
                {c.opciones!.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
              </select>
            ) : c.tipo === "textarea" ? (
              <textarea rows={3} value={form[c.key]} onChange={e => setForm({ ...form, [c.key]: e.target.value })} />
            ) : (
              <input value={form[c.key]} onChange={e => setForm({ ...form, [c.key]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
        {onDone && <button className="btn btn-ghost" onClick={onDone}>Cancelar</button>}
        <button className="btn" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

/* Botón "Editar" que despliega el formulario en el perfil de entidad */
export function Mantenimiento({ tipo, id, valores }:
  { tipo: string; id: string; valores: Record<string, any> }) {
  const [abierto, setAbierto] = useState(false);
  if (!FORM_CONF[tipo]) return null;
  return abierto
    ? <EntidadForm tipo={tipo} id={id} valores={valores} onDone={() => setAbierto(false)} />
    : <button className="btn btn-ghost" onClick={() => setAbierto(true)}>✏️ Editar</button>;
}
