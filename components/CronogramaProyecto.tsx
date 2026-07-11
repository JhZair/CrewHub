"use client";
import { agregarActividadCrono, cancelarActividadCrono, materializarActividad } from "@/app/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const ETAPA_ORDEN = ["preproduccion", "produccion", "postproduccion", "entrega", "administracion"];

const ETAPA_COLOR: Record<string, string> = {
  preproduccion: "#8b8ba3",
  produccion: "#f59e0b",
  postproduccion: "#2dd4bf",
  entrega: "#2ecc71",
  administracion: "#a78bfa",
};

const CHIP: Record<string, [string, string]> = {
  planificada: ["PLANIFICADA", "var(--dim)"],
  materializada: ["CASO ABIERTO", "var(--violet)"],
  en_progreso: ["EN PROGRESO", "var(--yellow)"],
  finalizada: ["FINALIZADA", "var(--green)"],
};
const BARRA: Record<string, string> = {
  planificada: "transparent",
  materializada: "var(--violet)",
  en_progreso: "var(--yellow)",
  finalizada: "var(--green)",
};

const dia = 86400000;
const pd = (s: string) => new Date(s + "T12:00:00").getTime();
const fmt = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });

export default function CronogramaProyecto({ dueno = "proyecto", duenoId, actividades, perfiles }: {
  dueno?: "proyecto" | "convocatoria";
  duenoId: string;
  actividades: any[];
  perfiles: { id: string; nombre: string }[];
}) {
  const [vista, setVista] = useState<"lista" | "gantt">("lista");
  const [confirmando, setConfirmando] = useState<{ id: string; accion: "mat" | "del" } | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [f, setF] = useState({ nombre: "", etapa: dueno === "convocatoria" ? "administracion" : "produccion", ini: "", fin: "", responsable: "", antic: "7", clase: "trabajo" });
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();

  const guardar = async () => {
    if (ocupado) return;
    setOcupado(true);
    const res = await agregarActividadCrono(dueno, duenoId, f);
    setOcupado(false);
    if (res?.error) { alert(res.error); return; }
    setF({ ...f, nombre: "", ini: "", fin: "", responsable: "" });
    setAgregando(false);
    router.refresh();
  };

  const materializar = async (id: string) => {
    setConfirmando(null);
    setOcupado(true);
    const res = await materializarActividad(id, dueno, duenoId);
    setOcupado(false);
    if (res?.error) alert(res.error); else router.refresh();
  };

  const cancelar = async (id: string) => {
    setConfirmando(null);
    const res = await cancelarActividadCrono(id, dueno, duenoId);
    if (res?.error) alert(res.error); else router.refresh();
  };

  const visibles = actividades.filter(a => a.estado !== "cancelada" && a.fecha_inicio);
  const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, outline: "none", color: "var(--text)" } as const;

  /* --- cálculo del Gantt --- */
  const minT = visibles.length ? Math.min(...visibles.map(a => pd(a.fecha_inicio))) : 0;
  const maxT = visibles.length ? Math.max(...visibles.map(a => pd(a.fecha_fin || a.fecha_inicio))) + dia : dia;
  const span = Math.max(maxT - minT, 7 * dia);
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - minT) / span) * 100));
  const hoyT = Date.now();
  const hoyPct = pct(hoyT);
  const ordenadas = [...visibles].sort((a, b) =>
    a.fecha_inicio === b.fecha_inicio
      ? ETAPA_ORDEN.indexOf(a.etapa) - ETAPA_ORDEN.indexOf(b.etapa)
      : (a.fecha_inicio < b.fecha_inicio ? -1 : 1));

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>📅 Cronograma · {visibles.length}</b>
        <div className="vtabs" style={{ margin: 0 }}>
          <button className={`vtab ${vista === "lista" ? "on" : ""}`} onClick={() => setVista("lista")}>☰ Lista</button>
          <button className={`vtab ${vista === "gantt" ? "on" : ""}`} onClick={() => setVista("gantt")}>📊 Gantt</button>
        </div>
        <span style={{ flex: 1 }} />
        {!agregando && <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
          onClick={() => setAgregando(true)}>＋ Actividad</button>}
      </div>

      {agregando && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0", padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <select style={{ ...inp, borderColor: f.clase === "hito_externo" ? "var(--blue)" : "var(--border)" }}
            value={f.clase} onChange={e => setF({ ...f, clase: e.target.value })}>
            <option value="trabajo">✅ Trabajo nuestro</option>
            <option value="hito_externo">🏛 Hito del concurso</option>
          </select>
          <input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="Actividad *"
            value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
          <select style={inp} value={f.etapa} onChange={e => setF({ ...f, etapa: e.target.value })}>
            {ETAPA_ORDEN.map(x => <option key={x} value={x}>{x.replace(/_/g, " ")}</option>)}
          </select>
          <input type="date" style={inp} title="Inicio *" value={f.ini} onChange={e => setF({ ...f, ini: e.target.value })} />
          <input type="date" style={inp} title="Fin" value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })} />
          <select style={inp} value={f.responsable} onChange={e => setF({ ...f, responsable: e.target.value })}>
            <option value="">Responsable...</option>
            {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <label style={{ color: "var(--dim)", fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
            avisar <input type="number" min={0} max={60} style={{ ...inp, width: 54 }}
              value={f.antic} onChange={e => setF({ ...f, antic: e.target.value })} /> días antes
          </label>
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }} disabled={ocupado} onClick={guardar}>Guardar</button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }} onClick={() => setAgregando(false)}>Cancelar</button>
        </div>
      )}

      {/* ===== VISTA LISTA, agrupada por etapa ===== */}
      {vista === "lista" && ETAPA_ORDEN.map(et => {
        const grupo = ordenadas.filter(a => a.etapa === et);
        if (!grupo.length) return null;
        return (
          <div key={et}>
            <div className="cr-etapa-h">{et.replace(/_/g, " ")}</div>
            {grupo.map(a => {
              const [txt, col] = CHIP[a.estado] || CHIP.planificada;
              return (
                <div key={a.id} className="cr-item" style={{
                  opacity: a.estado === "finalizada" ? .6 : 1,
                  borderLeft: `3px solid ${ETAPA_COLOR[a.etapa] || "var(--border)"}`,
                }}>
                  <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>
                    {a.clase === "hito_externo" ? "🏛" : a.estado === "finalizada" ? "✅" : a.estado === "planificada" ? "⚪" : "🟣"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>
                      {fmt(a.fecha_inicio)} → {a.fecha_fin ? fmt(a.fecha_fin) : "—"}
                      {(a.resp as any)?.nombre && <> · {(a.resp as any).nombre.split(" ")[0]}</>}
                      {a.estado === "planificada" && <> · 🔕 −{a.dias_anticipacion ?? 7}d</>}
                    </div>
                  </div>
                  <span className="badge" style={{ color: col, background: "#1c1c2c", whiteSpace: "nowrap", flexShrink: 0 }}>{txt}</span>
                  <span style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                    {a.publicacion_id && (
                      <Link href={`/caso/${a.publicacion_id}`} style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600 }}>
                        caso →
                      </Link>
                    )}
                    {a.estado === "planificada" && confirmando?.id === a.id && (
                      <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5 }}>
                        <span style={{ color: confirmando.accion === "mat" ? "var(--yellow)" : "var(--red)" }}>
                          {confirmando.accion === "mat" ? "¿Crear el caso ya?" : "¿Cancelar actividad?"}
                        </span>
                        <button className="btn" style={{ padding: "3px 10px", fontSize: 11 }} disabled={ocupado}
                          onClick={() => confirmando.accion === "mat" ? materializar(a.id) : cancelar(a.id)}>Sí</button>
                        <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}
                          onClick={() => setConfirmando(null)}>No</button>
                      </span>
                    )}
                    {a.estado === "planificada" && confirmando?.id !== a.id && (
                      <>
                        <button title="Materializar ahora" style={{ color: "var(--yellow)" }}
                          onClick={() => setConfirmando({ id: a.id, accion: "mat" })}>▶</button>
                        <button title="Cancelar" style={{ color: "var(--dim)" }}
                          onClick={() => setConfirmando({ id: a.id, accion: "del" })}>✕</button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ===== VISTA GANTT ===== */}
      {vista === "gantt" && visibles.length > 0 && (
        <div className="gt" style={{ position: "relative", marginTop: 12 }}>
          <div className="gt-axis">
            <span>{fmt(new Date(minT).toISOString().slice(0, 10))}</span>
            <span>{fmt(new Date(maxT - dia).toISOString().slice(0, 10))}</span>
          </div>
          {hoyPct > 0 && hoyPct < 100 && (
            <div className="gt-hoy" style={{ left: `calc(170px + (100% - 170px) * ${hoyPct / 100})` }}>
              <i>HOY</i>
            </div>
          )}
          {ordenadas.map(a => {
            const ini = pct(pd(a.fecha_inicio));
            const fin = pct(pd(a.fecha_fin || a.fecha_inicio) + dia);
            const w = Math.max(fin - ini, 1.5);
            const etCol = ETAPA_COLOR[a.etapa] || "#8b8ba3";
            const barra = (
              <div className="gt-track">
                <div className="gt-bar" title={`${a.nombre} · ${(a.etapa || "").replace(/_/g, " ")}: ${fmt(a.fecha_inicio)} → ${a.fecha_fin ? fmt(a.fecha_fin) : "—"}`}
                  style={{
                    left: `${ini}%`, width: `${w}%`,
                    background: a.estado === "planificada" ? `${etCol}26` : etCol,
                    border: a.estado === "planificada" ? `1px dashed ${etCol}` : "none",
                    opacity: a.estado === "finalizada" ? .45 : 1,
                  }} />
              </div>
            );
            return (
              <div className="gt-row" key={a.id}>
                <div className="gt-nombre" title={a.nombre}>
                  {a.estado === "finalizada" ? "✅ " : a.estado === "planificada" ? "" : "🟣 "}
                  {a.publicacion_id
                    ? <Link href={`/caso/${a.publicacion_id}`} style={{ color: "var(--text)" }}>{a.nombre}</Link>
                    : a.nombre}
                </div>
                {barra}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10.5, color: "var(--dim)", paddingLeft: 170, flexWrap: "wrap" }}>
            {ETAPA_ORDEN.filter(et => visibles.some(a => a.etapa === et)).map(et => (
              <span key={et}>
                <i style={{ display: "inline-block", width: 16, height: 7, background: ETAPA_COLOR[et], borderRadius: 4, verticalAlign: "middle", marginRight: 4 }} />
                {et.replace(/_/g, " ")}
              </span>
            ))}
            <span style={{ marginLeft: 10 }}>· punteada = planificada · sólida = en curso · tenue = finalizada</span>
          </div>
        </div>
      )}

      {!visibles.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 8 }}>Sin actividades — planifica la primera.</div>
      )}
    </div>
  );
}
