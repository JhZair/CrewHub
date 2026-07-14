"use client";
import { guardarEntidad, buscarParecidos } from "@/app/actions";
import MiniSelect from "@/components/MiniSelect";
import { FORM_CONF, VALIDADORES } from "@/lib/entidades";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const PALETA = ["#a78bfa", "#3b82f6", "#f59e0b", "#2ecc71", "#ec4899", "#2dd4bf", "#f4b400", "#60a5fa"];

/* ¿el valor parece un link abrible? (para el botón ↗ de campos de link) */
const esLink = (v?: string) => /^https?:\/\/\S+/.test((v || "").trim());

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
  const [parecidos, setParecidos] = useState<{ id: string; nombre: string }[]>([]);
  const router = useRouter();

  // Al CREAR: aviso de posibles duplicados mientras se escribe el nombre
  useEffect(() => {
    if (id) return;
    const n = (form["nombre"] || "").trim();
    const timer = setTimeout(async () => {
      if (n.length < 4) { setParecidos([]); return; }
      const r: any = await buscarParecidos(tipo, n);
      setParecidos(r?.parecidos || []);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form["nombre"], id, tipo]);

  const guardar = async () => {
    if (guardando) return;
    // Validación en el propio formulario: marca los campos faltantes
    const errs: Record<string, string> = {};
    campos.forEach(c => {
      const v = (form[c.key] || "").trim();
      if (c.requerido && !v) { errs[c.key] = "Este campo es obligatorio"; return; }
      // validación anti-humanos: si hay valor, debe tener el formato correcto
      if (v && c.valida && VALIDADORES[c.valida] && !VALIDADORES[c.valida][0].test(v)) {
        errs[c.key] = VALIDADORES[c.valida][1];
      }
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

  // Sugerencias fijas o dependientes de otro campo (subcategoría ← categoría)
  const sugerenciasDe = (c: any): string[] | undefined => {
    if (c.sugerencias) return c.sugerencias;
    if (c.sugerenciasPor) {
      const valor = form[c.sugerenciasPor.campo];
      const propias = c.sugerenciasPor.mapa[valor];
      if (propias?.length) return propias;
      return [...new Set(Object.values(c.sugerenciasPor.mapa).flat())] as string[];
    }
    return undefined;
  };

  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <b style={{ fontSize: 15 }}>{id ? `✏️ Editar ${conf.titulo.toLowerCase()}` : `＋ Nuevo ${conf.titulo.toLowerCase()}`}</b>
      <div className="f-grid">
        {campos.map(c => (
          <div key={c.key} className="f-campo" style={c.tipo === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
            <span style={errores[c.key] ? { color: "var(--red)" } : undefined}>
              {c.label}{c.requerido && <b style={{ color: "var(--red)" }}> *</b>}
            </span>
            {c.auto ? (
              <input disabled value={id ? (form[c.key] || "—") : ""}
                placeholder="Se genera automáticamente"
                style={{ opacity: .55, cursor: "not-allowed" }} />
            ) : c.tipo === "select" ? (
              <MiniSelect block value={form[c.key]} error={!!errores[c.key]}
                onSelect={v => setCampo(c.key, v)}
                options={[
                  ["", "—"],
                  // valor actual que no está entre las opciones (dato migrado): visible
                  ...(form[c.key] && !c.opciones!.includes(form[c.key])
                    ? [[form[c.key], `${form[c.key].replace(/_/g, " ")} (valor actual)`]] : []),
                  ...c.opciones!.map(o => [o, o.replace(/_/g, " ")]),
                ]} />
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
            ) : sugerenciasDe(c) && c.multiple ? (
              <MultiTag valor={form[c.key]} onChange={v => setCampo(c.key, v)}
                sugerencias={sugerenciasDe(c)!} listId={`sug-${c.key}`} error={!!errores[c.key]} />
            ) : sugerenciasDe(c) ? (
              <>
                <input list={`sug-${c.key}`} value={form[c.key]}
                  onChange={e => setCampo(c.key, e.target.value)}
                  placeholder="Escribe o elige de la lista..."
                  style={errores[c.key] ? { borderColor: "var(--red)" } : undefined} />
                <datalist id={`sug-${c.key}`}>
                  {sugerenciasDe(c)!.map(s => <option key={s} value={s} />)}
                </datalist>
              </>
            ) : c.valida === "url" ? (
              <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                <input value={form[c.key]} onChange={e => setCampo(c.key, e.target.value)}
                  placeholder="https://..." inputMode="url"
                  style={{ flex: 1, minWidth: 0, ...(errores[c.key] ? { borderColor: "var(--red)" } : {}) }} />
                <a href={esLink(form[c.key]) ? form[c.key].trim() : undefined}
                  target="_blank" rel="noopener noreferrer"
                  title={esLink(form[c.key]) ? "Abrir el link en otra pestaña para revisarlo" : "Pega un link válido (https://…) para poder abrirlo"}
                  onClick={e => { if (!esLink(form[c.key])) e.preventDefault(); }}
                  className="btn btn-ghost"
                  style={{ padding: "0 12px", display: "inline-flex", alignItems: "center", fontSize: 15, textDecoration: "none", flex: "none",
                    opacity: esLink(form[c.key]) ? 1 : .4, cursor: esLink(form[c.key]) ? "pointer" : "not-allowed" }}>
                  ↗
                </a>
              </div>
            ) : (
              <input value={form[c.key]} onChange={e => setCampo(c.key, e.target.value)}
                style={errores[c.key] ? { borderColor: "var(--red)" } : undefined} />
            )}
            {errores[c.key] && <span style={{ color: "var(--red)", fontSize: 10.5, textTransform: "none", letterSpacing: 0 }}>{errores[c.key]}</span>}
          </div>
        ))}
      </div>
      {!id && parecidos.length > 0 && (
        <div style={{ marginTop: 12, padding: "9px 12px", background: "rgba(244,180,0,.08)", border: "1px solid rgba(244,180,0,.35)", borderRadius: 10, fontSize: 12.5, color: "var(--yellow)" }}>
          ⚠ Ya existen parecidos — verifica antes de crear un duplicado:{" "}
          {parecidos.map(p => (
            <a key={p.id} href={`/entidad/${tipo}/${p.id}`} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--yellow)", fontWeight: 700, marginLeft: 8, textDecoration: "underline" }}>
              {p.nombre