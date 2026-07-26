"use client";
import { agregarEquipoPostulacion, quitarEquipoPostulacion } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import Avatar from "@/components/Avatar";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const ROLES = [
  "Responsable General", "Representante Legal", "Titular",
  "Director/a", "Asistente de Dirección",
  "Productor/a", "Productor/a Ejecutivo/a", "Jefe/a de Producción", "Asistente de Producción",
  "Creador/a del concepto artístico", "Autor/a del tratamiento o guión", "Guionista",
  "Director/a de Fotografía", "Sonidista", "Director/a de Arte",
  "Editor/a", "Asistente de Edición", "Investigador/a", "Facilitador/a",
  "Compositor/a de Música", "Operador/a de Drone", "Animador/a",
];

export default function EquipoPostulacion({ postulacionId, equipo, personas }: {
  postulacionId: string;
  equipo: any[];
  personas: CatalogoItem[];
}) {
  const [agregando, setAgregando] = useState(false);
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null);
  const [rol, setRol] = useState("Director/a");
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const guardar = async () => {
    if (!sel || guardando) return;
    setGuardando(true); setError("");
    const res = await agregarEquipoPostulacion(postulacionId, sel.id, rol);
    setGuardando(false);
    if (res?.error) { setError(res.error); return; }
    setSel(null); setRol("Director/a"); setAgregando(false);
    router.refresh();
  };

  const quitar = async (id: string) => {
    const res = await quitarEquipoPostulacion(id, postulacionId);
    setQuitando(null);
    if (res?.error) setError(res.error); else router.refresh();
  };

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          👥 Equipo de postulación · {equipo.length}
        </h4>
        <span style={{ flex: 1 }} />
        {!agregando && <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
          onClick={() => setAgregando(true)}>＋ Agregar</button>}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}
      {agregando && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <EntPicker etiqueta={sel ? `👤 ${sel.nombre}` : "👤 Elegir persona"} items={personas}
            onPick={id => { const p = personas.find(x => x.id === id); if (p) setSel({ id: p.id, nombre: p.nombre }); }} />
          <input list="roles-postulacion" value={rol} onChange={e => setRol(e.target.value)}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none", width: 180 }} />
          <datalist id="roles-postulacion">{ROLES.map(r => <option key={r} value={r} />)}</datalist>
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }} disabled={!sel || guardando} onClick={guardar}>
            {guardando ? "..." : "Guardar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
            onClick={() => { setAgregando(false); setSel(null); }}>Cancelar</button>
        </div>
      )}

      {equipo.map((m: any) => {
        const p = m.persona || {};
        // Contexto que pesa en el fondo: qué es, de dónde, y si es comunero/a
        // (la reserva regional y la participación comunitaria puntúan en DAFO).
        const ctx = [p.tipo, p.region, p.es_comunero ? "🌱 comunero/a" : ""].filter(Boolean).join(" · ");
        return (
          <div key={m.id} className="eq-card">
            <Avatar nombre={p.nombre} src={p.foto_url} size={38} />
            <div className="eq-card-main">
              <div className="eq-card-top">
                <Link href={`/entidad/persona/${p.id}`} className="eq-card-nom" title={p.nombre}>{p.alias || p.nombre} →</Link>
                <span className="eq-card-cargo">{m.cargo || "—"}</span>
              </div>
              {ctx && <div className="eq-card-ctx">{ctx}</div>}
              {/* Los datos que el fondo revisa por persona: CV (para su ROL y
                  vigente) y precontrato. Si existe el archivo, el chip lo abre. */}
              <div className="eq-card-chips">
                {m._cv ? (
                  <a href={m._cv.url || `/objeto/${m._cv.id}`} target="_blank" rel="noopener noreferrer"
                    className={`eq-chip eq-chip-link ${m._cv.vigente ? "ok" : "warn"}`}>
                    📄 {m._cv.vigente ? "CV" : "CV viejo"} ↗
                  </a>
                ) : <span className="eq-chip falta">📄 sin CV</span>}
                {m._pre ? (
                  m._pre.id ? (
                    <a href={`/api/precontrato?post=${postulacionId}&pre=${m._pre.id}`} target="_blank" rel="noopener noreferrer"
                      className={`eq-chip eq-chip-link ${m._pre.estado === "firmado" ? "ok" : "warn"}`}>
                      📝 {m._pre.estado} ↗
                    </a>
                  ) : <span className={`eq-chip ${m._pre.estado === "firmado" ? "ok" : "warn"}`}>📝 {m._pre.estado}</span>
                ) : <span className="eq-chip dim">📝 sin precontrato</span>}
              </div>
            </div>
            {quitando === m.id ? (
              <span className="eq-card-conf">
                ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => quitar(m.id)}>sí</button>
                {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setQuitando(null)}>no</button>
              </span>
            ) : (
              <button className="eq-card-x" title="Quitar del equipo" onClick={() => setQuitando(m.id)}>✕</button>
            )}
          </div>
        );
      })}
      {!equipo.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0" }}>
          Sin equipo registrado — el equipo técnico y artístico de esta postulación.
        </div>
      )}
    </div>
  );
}
