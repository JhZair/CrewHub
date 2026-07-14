"use client";
import { aprobarJornada, editarJornada, borrarJornada } from "@/app/actions";
import MiniSelect from "@/components/MiniSelect";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ICO: Record<string, string> = { rodaje: "🎬", oficina: "🏢", scouting: "🚙" };
const TIPOS: [string, string][] = [["rodaje", "🎬"], ["oficina", "🏢"], ["scouting", "🚙"]];
const FRAC: [number, string][] = [[0.5, "½"], [1, "1"], [1.5, "1½"]];
const money = (n: number | null) => n != null ? `S/ ${Math.round(n).toLocaleString("es-PE")}` : "—";
const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 8px", fontSize: 12, color: "var(--text)", outline: "none" } as const;

function FilaJornada({ j, esAdmin, puedeEditar, proyectos, onChange }: {
  j: any; esAdmin: boolean; puedeEditar: boolean; proyectos: { id: string; nombre: string }[]; onChange: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [fecha, setFecha] = useState(j.fecha);
  const [proyectoId, setProyectoId] = useState(j.proyecto_id || "");
  const [tipo, setTipo] = useState(j.tipo);
  const [fraccion, setFraccion] = useState<number>(Number(j.fraccion));
  const [noche, setNoche] = useState(!!j.noche);

  const aprobar = async (v: boolean) => {
    setOcupado(true); const r: any = await aprobarJornada(j.id, v); setOcupado(false);
    if (r?.error) alert(r.error); else onChange();
  };
  const guardar = async () => {
    setOcupado(true);
    const r: any = await editarJornada(j.id, fecha, proyectoId || null, tipo, tipo === "oficina" ? fraccion : 1, tipo !== "oficina" && noche);
    setOcupado(false);
    if (r?.error) { alert(r.error); return; }
    setEdit(false); onChange();
  };
  const borrar = async () => {
    const r: any = await borrarJornada(j.id); setBorrando(false);
    if (r?.error) alert(r.error); else onChange();
  };

  if (edit) {
    return (
      <div className="info-row" style={{ gap: 7, flexWrap: "wrap", background: "var(--bg)", borderRadius: 9, padding: 8 }}>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...inp, width: 140 }} />
        <MiniSelect value={proyectoId}
          options={[["", "🏢 Oficina"], ...proyectos.map(p => [p.id, `📁 ${p.nombre}`])]}
          onSelect={setProyectoId} buttonClass="" buttonStyle={{ ...inp, minWidth: 150 }} />
        <span className="jr-seg">
          {TIPOS.map(([v, l]) => (
            <button key={v} className={tipo === v ? "on" : ""}
              onClick={() => { setTipo(v); if (v === "oficina") setNoche(false); else setFraccion(1); }}>{l}</button>
          ))}
        </span>
        {tipo === "oficina" && (
          <span className="jr-seg">
            {FRAC.map(([v, l]) => <button key={v} className={fraccion === v ? "on" : ""} onClick={() => setFraccion(v)}>{l}</button>)}
          </span>
        )}
        {tipo !== "oficina" && (
          <button className={`jr-chip ${noche ? "on" : ""}`} onClick={() => setNoche(n => !n)}>🏕 {noche ? "✓" : ""}</button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" style={{ padding: "5px 11px", fontSize: 11.5 }} disabled={ocupado} onClick={guardar}>{ocupado ? "…" : "Guardar"}</button>
        <button className="btn btn-ghost" style={{ padding: "5px 9px", fontSize: 11.5 }} onClick={() => setEdit(false)}>Cancelar</button>
      </div>
    );
  }

  return (
    <div className="info-row" style={{ gap: 10, flexWrap: "wrap" }}>
      <span style={{ color: "var(--dim)", fontSize: 12, minWidth: 52 }}>{j.fecha?.slice(5)}</span>
      <span style={{ fontWeight: 600, fontSize: 12.5 }}>{ICO[j.tipo] || ""} {j.persona}</span>
      <span style={{ color: "var(--dim)", fontSize: 12 }}>{j.proyecto || "sin proyecto"}</span>
      <span style={{ fontSize: 12 }}>{j.fraccion}j{j.noche ? " 🏕" : ""}</span>
      <span style={{ color: "var(--teal)", fontSize: 12, fontWeight: 700 }}>{money(j.monto)}</span>
      <span className="badge" style={{
        fontSize: 10.5,
        color: j.aprobada ? "var(--green)" : "var(--yellow)",
        background: j.aprobada ? "rgba(46,204,113,.12)" : "rgba(244,180,0,.12)",
      }}>{j.aprobada ? "✅ aprobada" : "⏳ pendiente"}</span>
      <span style={{ flex: 1 }} />
      {esAdmin && (j.aprobada
        ? <button className="dato-btn" disabled={ocupado} onClick={() => aprobar(false)}>↩ quitar</button>
        : <button className="dato-btn" disabled={ocupado} onClick={() => aprobar(true)}>✅ aprobar</button>)}
      {puedeEditar && <button className="dato-btn" title="Editar" onClick={() => setEdit(true)}>✎</button>}
      {puedeEditar && (borrando
        ? <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>¿borrar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={borrar}>sí</button>{" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(false)}>no</button></span>
        : <button className="dato-btn" style={{ color: "var(--dim)" }} title="Borrar" onClick={() => setBorrando(true)}>✕</button>)}
    </div>
  );
}

export default function BitacoraJornadas({ items, esAdmin = false, miPersonaId = "", proyectos = [], titulo = "🗒 Jornadas del mes", bloqueado = false }: {
  items: any[]; esAdmin?: boolean; miPersonaId?: string; proyectos?: { id: string; nombre: string }[]; titulo?: string; bloqueado?: boolean;
}) {
  const router = useRouter();
  const onChange = () => router.refresh();
  const pend = items.filter(j => !j.aprobada).length;
  return (
    <details className="card" style={{ marginTop: 14 }} open>
      <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
        {titulo} · {items.length}{pend ? ` · ⏳ ${pend} por aprobar` : " · todas aprobadas ✅"}
      </summary>
      <div style={{ marginTop: 8 }}>
        {items.map(j => (
          <FilaJornada key={j.id} j={j} esAdmin={esAdmin}
            puedeEditar={!bloqueado && (esAdmin || (j.persona_id === miPersonaId && !j.aprobada))}
            proyectos={proyectos} onChange={onChange} />
        ))}
        {!items.length && <div className="empty">Sin jornadas este mes.</div>}
      </div>
    </details>
  );
}
