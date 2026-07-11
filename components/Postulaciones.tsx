"use client";
import { crearPostulacion, actualizarPostulacion, borrarPostulacion } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const ESTADOS: [string, string, string][] = [
  ["en_preparacion", "🛠 En preparación", "var(--violet)"],
  ["enviada", "📨 Enviada", "var(--blue)"],
  ["finalista", "⭐ Finalista", "var(--yellow)"],
  ["ganadora", "🏆 Ganadora", "var(--green)"],
  ["no_seleccionada", "✖ No seleccionada", "var(--dim)"],
  ["retirada", "↩ Retirada", "var(--dim)"],
];
const estMeta = (e: string) => ESTADOS.find(x => x[0] === e) || ESTADOS[0];

const inputCss: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "6px 9px", fontSize: 12, color: "var(--text)", outline: "none",
};

export default function Postulaciones({ convocatoriaId, postulaciones, proyectos, empresas }: {
  convocatoriaId: string;
  postulaciones: any[];
  proyectos: CatalogoItem[];
  empresas: CatalogoItem[];
}) {
  const [agregando, setAgregando] = useState(false);
  const [proy, setProy] = useState<{ id: string; nombre: string } | null>(null);
  const [emp, setEmp] = useState<{ id: string; nombre: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [ej, setEj] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const router = useRouter();

  const crear = async () => {
    if (!proy || guardando) return;
    setGuardando(true); setError("");
    const res = await crearPostulacion(convocatoriaId, proy.id, emp?.id || null);
    setGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setProy(null); setEmp(null); setAgregando(false);
    router.refresh();
  };

  const cambiarEstado = async (id: string, estado: string) => {
    const res = await actualizarPostulacion(id, convocatoriaId, { estado });
    if (res?.error) setError(res.error); else router.refresh();
  };

  const abrirEjec = (p: any) => {
    setEditando(p.id);
    setEj({
      codigo_acta: p.codigo_acta || "",
      fecha_firma_acta: p.fecha_firma_acta || "",
      monto_adjudicado: p.monto_adjudicado || "",
      fecha_limite_rendicion: p.fecha_limite_rendicion || "",
      fecha_prorroga: p.fecha_prorroga || "",
      acta_url: p.acta_url || "",
    });
  };

  const guardarEjec = async (id: string) => {
    setGuardando(true); setError("");
    const res = await actualizarPostulacion(id, convocatoriaId, ej);
    setGuardando(false);
    if (res?.error) setError(res.error); else { setEditando(null); router.refresh(); }
  };

  const borrar = async (id: string) => {
    const res = await borrarPostulacion(id, convocatoriaId);
    setBorrando(null);
    if (res?.error) setError(res.error); else router.refresh();
  };

  const fmtF = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          🎯 Postulaciones · {postulaciones.length}
        </h4>
        <span style={{ flex: 1 }} />
        {!agregando && <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
          onClick={() => setAgregando(true)}>＋ Postular</button>}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}
      {agregando && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <EntPicker etiqueta={proy ? `📁 ${proy.nombre}` : "📁 Elegir proyecto"} items={proyectos}
            onPick={id => { const p = proyectos.find(x => x.id === id); if (p) setProy({ id: p.id, nombre: p.nombre }); }} />
          <EntPicker etiqueta={emp ? `🏢 ${emp.nombre}` : "🏢 Empresa que postula"} items={empresas}
            onPick={id => { const x = empresas.find(y => y.id === id); if (x) setEmp({ id: x.id, nombre: x.nombre }); }} />
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }} disabled={!proy || guardando} onClick={crear}>
            {guardando ? "..." : "Guardar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
            onClick={() => { setAgregando(false); setProy(null); setEmp(null); }}>Cancelar</button>
        </div>
      )}

      {postulaciones.map((p: any) => {
        const [, lbl, col] = estMeta(p.estado);
        return (
          <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "8px 0" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Link href={`/entidad/postulacion/${p.id}`} style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>
                🎯 {p.codigo ? `${p.codigo} · ` : ""}{p.proy?.nombre || "—"} →
              </Link>
              {p.emp && (
                <Link href={`/entidad/empresa/${p.emp.id}`} style={{ color: "var(--muted)", fontSize: 12 }}>
                  🏢 {p.emp.nombre}
                </Link>
              )}
              <span style={{ flex: 1 }} />
              <select value={p.estado} onChange={e => cambiarEstado(p.id, e.target.value)}
                style={{ ...inputCss, color: col, fontWeight: 700 }}>
                {ESTADOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {borrando === p.id ? (
                <span style={{ fontSize: 11.5 }}>
                  ¿borrar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => borrar(p.id)}>sí</button>
                  {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(null)}>no</button>
                </span>
              ) : (
                <button title="Borrar postulación" style={{ color: "var(--dim)" }} onClick={() => setBorrando(p.id)}>✕</button>
              )}
            </div>

            {p.estado === "ganadora" && editando !== p.id && (
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                {p.codigo_acta && <span style={{ color: "var(--green)", fontWeight: 700 }}>{p.codigo_acta}</span>}
                {p.monto_adjudicado && <span style={{ color: "var(--teal)" }}>S/ {parseFloat(p.monto_adjudicado).toLocaleString("es-PE")}</span>}
                {p.fecha_firma_acta && <span>🖋 acta: {fmtF(p.fecha_firma_acta)}</span>}
                {p.fecha_limite_rendicion && <span style={{ color: "var(--yellow)" }}>🧾 rendición: {fmtF(p.fecha_prorroga || p.fecha_limite_rendicion)}{p.fecha_prorroga ? " (prórroga)" : ""}</span>}
                {p.acta_url && <a href={p.acta_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--violet)" }}>📄 Acta</a>}
                <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11.5 }} onClick={() => abrirEjec(p)}>
                  ✎ {p.fecha_firma_acta || p.monto_adjudicado ? "Editar" : "Registrar"} ejecución
                </button>
              </div>
            )}

            {editando === p.id && (
              <div style={{ marginTop: 8, padding: 10, background: "var(--bg)", borderRadius: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11, color: "var(--dim)" }}>Código del acta (ej. 139-2025-DAFO)
                  <input value={ej.codigo_acta} style={{ ...inputCss, width: "100%", marginTop: 3 }}
                    onChange={e => setEj({ ...ej, codigo_acta: e.target.value })} /></label>
                <label style={{ fontSize: 11, color: "var(--dim)" }}>Firma del acta
                  <input type="date" value={ej.fecha_firma_acta} style={{ ...inputCss, width: "100%", marginTop: 3 }}
                    onChange={e => setEj({ ...ej, fecha_firma_acta: e.target.value })} /></label>
                <label style={{ fontSize: 11, color: "var(--dim)" }}>Monto adjudicado (S/)
                  <input value={ej.monto_adjudicado} style={{ ...inputCss, width: "100%", marginTop: 3 }}
                    onChange={e => setEj({ ...ej, monto_adjudicado: e.target.value })} /></label>
                <label style={{ fontSize: 11, color: "var(--dim)" }}>Límite de rendición
                  <input type="date" value={ej.fecha_limite_rendicion} style={{ ...inputCss, width: "100%", marginTop: 3 }}
                    onChange={e => setEj({ ...ej, fecha_limite_rendicion: e.target.value })} /></label>
                <label style={{ fontSize: 11, color: "var(--dim)" }}>Prórroga (si existe)
                  <input type="date" value={ej.fecha_prorroga} style={{ ...inputCss, width: "100%", marginTop: 3 }}
                    onChange={e => setEj({ ...ej, fecha_prorroga: e.target.value })} /></label>
                <label style={{ fontSize: 11, color: "var(--dim)", gridColumn: "1 / -1" }}>Acta de compromiso (link Drive)
                  <input value={ej.acta_url} placeholder="https://..." style={{ ...inputCss, width: "100%", marginTop: 3 }}
                    onChange={e => setEj({ ...ej, acta_url: e.target.value })} /></label>
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                  <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} disabled={guardando}
                    onClick={() => guardarEjec(p.id)}>{guardando ? "..." : "Guardar ejecución"}</button>
                  <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {!postulaciones.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0" }}>
          Sin postulaciones — registra qué proyectos y empresas compiten aquí.
        </div>
      )}
    </div>
  );
}
