"use client";
import { crearPostulacion, actualizarPostulacion, borrarPostulacion } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import Avatar from "@/components/Avatar";
import SelloResultado from "@/components/SelloResultado";
import { resultadoPostulacion } from "@/lib/resultados";
import { TXT } from "@/lib/texto";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

/* Estados alineados con el ciclo de vida real de una postulación (el mismo del
   stepper de su ficha): preparación → enviada → apta → finalista → ganadora,
   con salidas «no apta» y «no ganó». Los dos últimos (no_seleccionada,
   retirada) son legado: se mantienen para que una postulación vieja con ese
   estado siga mostrándose bien en el selector. */
const ESTADOS: [string, string, string][] = [
  ["en_preparacion", "🛠 En preparación", "var(--violet)"],
  ["enviada", "📨 Enviada", "var(--blue)"],
  ["en_subsanacion", "🔧 En subsanación", "var(--yellow)"],
  ["apta", "✅ Apta", "var(--teal)"],
  ["no_apta", "⛔ No apta", "var(--red)"],
  ["finalista", "⭐ Finalista", "var(--yellow)"],
  ["ganadora", "🏆 Ganadora", "var(--green)"],
  ["finalista_no_ganadora", "🥈 Finalista (no ganó)", "var(--yellow)"],
  ["no_seleccionada", "✖ No seleccionada", "var(--dim)"],
  ["retirada", "↩ Retirada", "var(--dim)"],
];
const estMeta = (e: string) => ESTADOS.find(x => x[0] === e) || ESTADOS[0];

/* Secciones del concurso: los participantes no van todos juntos, se agrupan por
   desenlace —ganadoras, finalistas, en proceso, no seleccionadas— y en ese
   orden (lo que ganó primero). Cada fila además lleva su «sello» de estado. */
const SECCIONES_POST: { clave: string; label: string }[] = [
  { clave: "ganadora", label: "🏆 Ganadoras" },
  { clave: "finalista", label: "🥈 Finalistas" },
  { clave: "proceso", label: "🎯 En proceso" },
  { clave: "descartada", label: "✖ No seleccionadas" },
];
const seccionDe = (estado: string): string =>
  estado === "ganadora" ? "ganadora"
  : (estado === "finalista" || estado === "finalista_no_ganadora") ? "finalista"
  : ["en_preparacion", "enviada", "en_subsanacion", "apta"].includes(estado) ? "proceso"
  : "descartada";   // no_apta, no_seleccionada, retirada

const inputCss: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "6px 9px", fontSize: 12, color: "var(--text)", outline: "none",
};

export default function Postulaciones({ convocatoriaId, postulaciones, proyectos, empresas, carteles = {}, logosEmp = {} }: {
  convocatoriaId: string;
  postulaciones: any[];
  proyectos: CatalogoItem[];
  empresas: CatalogoItem[];
  /** Póster (cartel) por id de proyecto, para identificar cada postulación. */
  carteles?: Record<string, string>;
  /** Logo (cartel) por id de empresa, para ponerle cara a quien postula. */
  logosEmp?: Record<string, string>;
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

  const asignarEmpresa = async (id: string, empresaId: string) => {
    const res = await actualizarPostulacion(id, convocatoriaId, { empresa_id: empresaId });
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

      {(() => {
        const fila = (p: any) => {
        const [, , col] = estMeta(p.estado);
        const cartel = p.proy?.id ? carteles[p.proy.id] : null;
        const gano = p.estado === "ganadora";
        // Veredicto: si el concurso ya se resolvió para esta fila, se estampa
        // una capa (con su ✕) encima, como en el carné y la cancha.
        const res = resultadoPostulacion(p.estado);
        return (
          <div key={p.id} className={`pl-fila${res ? " con-sello" : ""}`} style={{ borderLeftColor: col, ["--pl-col" as any]: col }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* línea 1: la postulación (el título enlaza a la postulación). */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Link href={`/entidad/postulacion/${p.id}`}
                  style={{ color: "var(--text)", fontWeight: 600, fontSize: TXT.meta, flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                  🎯 {p.codigo ? `${p.codigo} · ` : ""}{p.proy?.nombre || "—"} →
                </Link>
                {borrando === p.id ? (
                  <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                    ¿borrar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => borrar(p.id)}>sí</button>
                    {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(null)}>no</button>
                  </span>
                ) : (
                  <button title="Borrar postulación" style={{ color: "var(--dim)", flex: "none" }} onClick={() => setBorrando(p.id)}>✕</button>
                )}
              </div>
              {/* línea 2: proyecto (imagen + nombre + link) · empresa (logo +
                  clic para cambiar) · estado */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 7, flexWrap: "wrap" }}>
                {p.proy?.id && (
                  <Link href={`/entidad/proyecto/${p.proy.id}`} className="post-proy-chip" title={p.proy?.nombre || "proyecto"}>
                    {cartel ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cartel} alt="" referrerPolicy="no-referrer" className="post-proy-chip-img" />
                    ) : (
                      <span className="post-proy-chip-ph">📁</span>
                    )}
                    <span className="post-proy-chip-txt">{p.proy?.nombre || "—"} →</span>
                  </Link>
                )}
                {p.emp?.id && logosEmp[p.emp.id] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logosEmp[p.emp.id]} alt="" referrerPolicy="no-referrer" className="post-emp-logo" />
                )}
                <span style={{ flex: 1, minWidth: 160 }}>
                  <EntPicker
                    etiqueta={p.emp ? `🏢 ${p.emp.nombre}` : "🏢 asignar empresa"}
                    items={empresas}
                    onPick={id => asignarEmpresa(p.id, id)} />
                </span>
                <select value={p.estado} onChange={e => cambiarEstado(p.id, e.target.value)}
                  style={{ ...inputCss, color: col, fontWeight: 700, fontSize: 11.5, padding: "5px 7px", maxWidth: 180 }}>
                  {ESTADOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              {/* Contexto del jurado: puntaje, matriz y comentario. Va para
                  cualquier postulación evaluada, gane o pierda. */}
              {(p.puntaje_jurado || p.matriz_jurado_url || p.feedback_jurado) && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: TXT.chip }}>
                    {p.puntaje_jurado && (
                      <span style={{ color: "var(--yellow)", fontWeight: 700 }}>⚖️ {p.puntaje_jurado} pts</span>
                    )}
                    {p.matriz_jurado_url && (
                      <a href={p.matriz_jurado_url} target="_blank" rel="noopener noreferrer"
                        title="Matriz de evaluación del jurado" style={{ color: "var(--violet)" }}>📊 Matriz jurado</a>
                    )}
                  </div>
                  {p.feedback_jurado && (
                    p.feedback_jurado.length > 160 ? (
                      <details className="jurado-box" style={{ marginTop: 6 }}>
                        <summary>
                          <b style={{ color: "var(--text)" }}>💬 Comentario del jurado</b>
                          <span className="jx"><br />{p.feedback_jurado.slice(0, p.feedback_jurado.lastIndexOf(" ", 160))}… <i>ver más</i></span>
                        </summary>
                        <div style={{ marginTop: 6 }}>{p.feedback_jurado}</div>
                      </details>
                    ) : (
                      <div className="jurado-box" style={{ marginTop: 6 }}>
                        <b style={{ color: "var(--text)" }}>💬 Comentario del jurado</b><br />
                        {p.feedback_jurado}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* El equipo con que se presentó al concurso. */}
              {(p.equipo || []).length > 0 && (
                <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                  {p.equipo.map((e: any, i: number) => (
                    <Link key={i} href={`/entidad/persona/${e.persona?.id}`} className="pers-chip" title={e.cargo || ""}>
                      <Avatar nombre={e.persona?.nombre} src={e.persona?.foto_url} size={26} />
                      <span className="pers-chip-txt">
                        {e.persona?.alias || e.persona?.nombre}
                        {e.cargo && <span className="pers-chip-rol"> · {e.cargo}</span>}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {gano && editando !== p.id && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg)", borderRadius: 9, borderLeft: "3px solid var(--green)", fontSize: TXT.chip, color: "var(--muted)" }}>
                  {p.monto_adjudicado && (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ color: "var(--teal)", fontWeight: 700 }}>S/ {parseFloat(p.monto_adjudicado).toLocaleString("es-PE")}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: p.monto_adjudicado ? 5 : 0 }}>
                    {(p.acta_url || p.codigo_acta || p.fecha_firma_acta) && (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        {p.acta_url
                          ? <a href={p.acta_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--violet)" }}>📄 Acta de compromiso{p.codigo_acta ? ` ${p.codigo_acta}` : ""}</a>
                          : <span style={{ color: "var(--dim)" }}>📄 Acta de compromiso{p.codigo_acta ? ` ${p.codigo_acta}` : ""}</span>}
                        {p.fecha_firma_acta && <span>🖋 firmada {fmtF(p.fecha_firma_acta)}</span>}
                      </span>
                    )}
                    {p.fecha_limite_rendicion && <span style={{ color: "var(--yellow)" }}>🧾 rinde: {fmtF(p.fecha_prorroga || p.fecha_limite_rendicion)}{p.fecha_prorroga ? " (prórroga)" : ""}</span>}
                    <span style={{ flex: 1 }} />
                    <button className="btn btn-ghost" style={{ padding: "2px 9px", fontSize: 11 }} onClick={() => abrirEjec(p)}>
                      ✎ {p.fecha_firma_acta || p.monto_adjudicado ? "Editar" : "Registrar"} ejecución
                    </button>
                  </div>
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
            {res && <SelloResultado {...res} variante="fila" />}
          </div>
        );
        };
        // Se pintan las secciones en orden; solo las que tienen participantes.
        return SECCIONES_POST.map(sec => {
          const items = postulaciones.filter((p: any) => seccionDe(p.estado) === sec.clave);
          if (!items.length) return null;
          return (
            <div key={sec.clave} className="pl-seccion">
              <div className="pl-seccion-h">{sec.label} · {items.length}</div>
              {items.map(fila)}
            </div>
          );
        });
      })()}
      {!postulaciones.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0" }}>
          Sin postulaciones — registra qué proyectos y empresas compiten aquí.
        </div>
      )}
    </div>
  );
}
