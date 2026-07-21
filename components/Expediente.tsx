"use client";
import { guardarExpediente } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* 🗂 EXPEDIENTE DE POSTULACIÓN
   En la pestaña: el medidor y el botón. El formulario vive en un emergente
   a lo ancho de la página, con las secciones A/B/C/D del formulario DAFO.
   - "⚡ de la base": el dato ya vive en CrewHub+ y se llena solo
   - lo demás se redacta: borrador → listo
   - el día D: 📋 en cada campo y copiar-pegar a la plataforma oficial */

export type CampoExp = {
  k: string;
  etiqueta: string;
  ayuda?: string;
  opcional?: boolean;
  largo?: boolean;
  opciones?: string[];   // combo: elegir guarda directo como listo
  max?: number;          // máximo de caracteres de la plataforma DAFO
};
export type SeccionExp = { titulo: string; campos: CampoExp[] };

export default function Expediente({ postulacionId, plantilla, expediente, auto, cronoListo, cronoResumen, presuListo, presuResumen, materialN, benefN, precontN, precontFirm }: {
  postulacionId: string;
  plantilla: SeccionExp[];
  expediente: Record<string, { v: string; listo: boolean }>;
  auto: Record<string, string>;
  /* El cronograma (Sección C) y el presupuesto (Sección D) NO se llenan aquí:
     tienen su propia sección en la ficha. El expediente los enlaza y cuenta su
     estado en el %. */
  cronoListo?: boolean; cronoResumen?: string;
  presuListo?: boolean; presuResumen?: string;
  materialN?: number; benefN?: number;
  precontN?: number; precontFirm?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const valorDe = (c: CampoExp) => expediente[c.k]?.v ?? auto[c.k] ?? "";
  // Un dato auto-llenado con ⚠ (faltantes en la ficha) aún no está listo
  const listoDe = (c: CampoExp) =>
    expediente[c.k]?.listo || (!expediente[c.k] && !!auto[c.k] && !auto[c.k].includes("⚠"));

  /* Campos de cronograma/presupuesto: no se muestran como texto (se llenan en
     su sección dedicada). Se detectan por etiqueta, así funciona sea cual sea
     la clave de la plantilla. */
  const esVinculada = (c: CampoExp) => {
    const e = (c.etiqueta || "").toLowerCase();
    // "Beneficiario final/efectivo" es la DDJJ de titularidad real (SUNAT), NO
    // la tabla de participantes: ese campo SÍ se teclea, no lo escondas.
    if (/beneficiario\s+(final|efectivo)/.test(e)) return false;
    return /cronograma|presupuesto|financiamiento|tipo de cambio|material de archivo|beneficiario|precontrato|carta de compromiso/i.test(e);
  };

  // Obligatorios de la plantilla SIN los vinculados; el cronograma y el
  // presupuesto entran como dos ítems propios, con su estado real.
  const obligatorios = plantilla.flatMap(s => s.campos).filter(c => !c.opcional && !esVinculada(c));
  const totalOblig = obligatorios.length + 2;
  const llenos = obligatorios.filter(c => listoDe(c)).length + (cronoListo ? 1 : 0) + (presuListo ? 1 : 0);
  const pct = totalOblig ? Math.round((llenos / totalOblig) * 100) : 0;

  /* Ir a una sección de la ficha: cierra el emergente y baja hasta ella. El
     pequeño retraso deja que el modal se desmonte antes del scroll. */
  const irA = (id: string) => {
    setAbierto(false);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const guardar = async (c: CampoExp, listo: boolean) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const res = await guardarExpediente(postulacionId, c.k, texto, listo);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    setEditando(null);
    router.refresh();
  };

  const marcarListo = async (c: CampoExp, listo: boolean) => {
    const v = valorDe(c);
    if (!v) return;
    setError("");
    const res = await guardarExpediente(postulacionId, c.k, v, listo);
    if (res?.error) setError(res.error); else router.refresh();
  };

  const copiar = async (c: CampoExp) => {
    try {
      await navigator.clipboard.writeText(valorDe(c));
      setCopiado(c.k);
      setTimeout(() => setCopiado(null), 1500);
    } catch { /* clipboard bloqueado: nada grave */ }
  };

  const Medidor = ({ compacto }: { compacto?: boolean }) => (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1 }}>
      <span style={{ flex: 1, height: compacto ? 8 : 10, background: "var(--bg)", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
        <span style={{ display: "block", height: "100%", width: `${pct}%`, borderRadius: 6, background: pct === 100 ? "var(--green)" : "linear-gradient(90deg,#3b82f6,#7c5cff)" }} />
      </span>
      <b style={{ color: pct === 100 ? "var(--green)" : "var(--blue)", fontSize: 14, whiteSpace: "nowrap" }}>{pct}%</b>
      <span style={{ color: "var(--dim)", fontSize: 11.5, whiteSpace: "nowrap" }}>{llenos}/{totalOblig} listos</span>
    </div>
  );

  return (
    <div>
      {/* ===== En la pestaña: resumen + puerta de entrada ===== */}
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Medidor compacto />
        <button className="btn" style={{ padding: "8px 16px", fontSize: 12.5 }}
          onClick={() => setAbierto(true)}>🗂 Abrir expediente</button>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
        {plantilla.filter(s => s.campos.some(c => !esVinculada(c))).map((s, i) => {
          const oblig = s.campos.filter(c => !c.opcional && !esVinculada(c));
          const ok = oblig.filter(c => listoDe(c)).length;
          return (
            <span key={i} className="badge" style={{
              color: ok === oblig.length ? "var(--green)" : "var(--muted)",
              background: "#1c1c2c", fontSize: 11, cursor: "pointer",
            }} onClick={() => setAbierto(true)}>
              {s.titulo.split("·")[0].trim()} · {ok}/{oblig.length}
            </span>
          );
        })}
      </div>
      {pct === 100 && (
        <div style={{ color: "var(--green)", fontSize: 12.5, marginTop: 10 }}>
          ✅ Expediente completo — a la plataforma DAFO solo a copiar y pegar.
        </div>
      )}

      {/* ===== El emergente: formulario a lo ancho ===== */}
      {abierto && (
        <div className="modal-fondo" onClick={e => { if (e.target === e.currentTarget) setAbierto(false); }}>
          <div className="modal-caja modal-ancho">
            <div className="modal-cab">
              <b>🗂 Expediente de postulación</b>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flex: 1, marginLeft: 18 }}>
                <Medidor compacto />
                <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12.5 }}
                  onClick={() => setAbierto(false)}>✕ Cerrar</button>
              </div>
            </div>
            <p style={{ color: "var(--dim)", fontSize: 11.5, margin: "0 0 12px" }}>
              ⚡ = llenado desde la base · ✎ redacta y guarda como borrador o listo ·
              📋 copia el campo para pegarlo en la plataforma DAFO el día del envío.
            </p>

            {/* Cronograma (Sección C) y Presupuesto (Sección D) no se llenan
                aquí: tienen su propia sección en la ficha. Se enlazan y su
                estado cuenta en el %. */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              {[
                { id: "sec-cronograma", ico: "📅", nom: "Cronograma", listo: cronoListo, res: cronoResumen, opc: false },
                { id: "sec-presupuesto", ico: "💰", nom: "Presupuesto", listo: presuListo, res: presuResumen, opc: false },
                { id: "sec-material", ico: "📁", nom: "Material de archivo", listo: (materialN || 0) > 0, res: (materialN || 0) > 0 ? `${materialN} entradas` : "sin material (o no aplica)", opc: true },
                { id: "sec-beneficiarios", ico: "👥", nom: "Beneficiarios", listo: (benefN || 0) > 0, res: (benefN || 0) > 0 ? `${benefN} filas` : "sin filas (o no aplica)", opc: true },
                { id: "sec-precontratos", ico: "📝", nom: "Precontratos", listo: (precontN || 0) > 0 && (precontFirm || 0) === (precontN || 0), res: (precontN || 0) > 0 ? `${precontFirm || 0}/${precontN} firmados` : "sin precontratos (o no aplica)", opc: true },
              ].map(x => (
                <button key={x.id} className="btn btn-ghost"
                  style={{ flex: "1 1 240px", textAlign: "left", padding: "9px 12px", fontSize: 12.5, borderColor: x.listo ? "rgba(46,204,113,.35)" : "var(--border)" }}
                  onClick={() => irA(x.id)}>
                  <span style={{ color: x.listo ? "var(--green)" : x.opc ? "var(--dim)" : "var(--yellow)" }}>{x.listo ? "✅" : x.opc ? "◦" : "○"}</span>{" "}
                  {x.ico} <b>{x.nom}</b>
                  <span style={{ color: "var(--dim)", fontWeight: 400 }}> — {x.res || (x.listo ? "listo" : "pendiente")}</span>
                  <span style={{ color: "var(--accent)", float: "right" }}>ir →</span>
                </button>
              ))}
            </div>

            {error && <div className="err-inline">⚠ {error}</div>}

            {plantilla.filter(s => s.campos.some(c => !esVinculada(c))).map((s, si) => (
              <div key={si} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: "var(--violet)", textTransform: "uppercase", letterSpacing: 1.2, margin: "0 0 8px", paddingBottom: 5, borderBottom: "1px solid var(--border)" }}>
                  {s.titulo} · {s.campos.filter(c => !c.opcional && !esVinculada(c) && listoDe(c)).length}/{s.campos.filter(c => !c.opcional && !esVinculada(c)).length}
                </div>
                <div className="exp-grid">
                  {s.campos.filter(c => !esVinculada(c)).map(c => {
                    const v = valorDe(c);
                    const esAuto = !expediente[c.k] && !!auto[c.k];
                    const listo = listoDe(c);
                    const abiertoCampo = editando === c.k;
                    return (
                      <div key={c.k} className={c.largo || abiertoCampo ? "exp-campo exp-ancho" : "exp-campo"}
                        style={{ borderLeft: `3px solid ${listo ? "var(--green)" : v ? "var(--yellow)" : "var(--border)"}` }}>
                        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0 }}>
                            {listo ? "✅" : v ? "✏️" : "○"} {c.etiqueta}
                            {c.opcional && <i style={{ color: "var(--dim)", fontWeight: 400 }}> (opc.)</i>}
                          </span>
                          {esAuto && <span className="badge" style={{ color: "var(--teal)", background: "rgba(45,212,191,.1)", fontSize: 9.5 }}>⚡</span>}
                          {(() => {
                            const url = (v.match(/https?:\/\/[^\s"<>]+/) || [])[0];
                            return url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                title="Abrir el archivo / link"
                                style={{ color: "var(--blue)", fontSize: 11.5, fontWeight: 700 }}
                                onClick={e => e.stopPropagation()}>↗</a>
                            ) : null;
                          })()}
                          {v && (
                            <button title="Copiar para la plataforma DAFO"
                              style={{ color: copiado === c.k ? "var(--green)" : "var(--dim)", fontSize: 11 }}
                              onClick={() => copiar(c)}>{copiado === c.k ? "✓" : "📋"}</button>
                          )}
                          {v && !esAuto && (
                            <button title={listo ? "Volver a borrador" : "Marcar listo"}
                              style={{ color: listo ? "var(--yellow)" : "var(--green)", fontSize: 11 }}
                              onClick={() => marcarListo(c, !listo)}>{listo ? "↩" : "✓"}</button>
                          )}
                          <button style={{ color: "var(--dim)", fontSize: 11 }}
                            onClick={() => { setEditando(abiertoCampo ? null : c.k); setTexto(v); }}>
                            {abiertoCampo ? "✕" : "✎"}
                          </button>
                        </div>
                        {c.ayuda && (!v || abiertoCampo) && (
                          <div style={{ color: "var(--dim)", fontSize: 10.5, marginTop: 2, lineHeight: 1.45 }}>💡 {c.ayuda}</div>
                        )}
                        {v && !abiertoCampo && (
                          <div style={{ color: "var(--muted)", fontSize: 11.5, marginTop: 3, whiteSpace: "pre-wrap", maxHeight: 58, overflow: "hidden" }}>
                            {v.length > 220 ? v.slice(0, 220) + "…" : v}
                          </div>
                        )}
                        {abiertoCampo && c.opciones ? (
                          <div style={{ marginTop: 6 }}>
                            <select value={texto} autoFocus
                              onChange={async e => {
                                setTexto(e.target.value);
                                if (!e.target.value) return;
                                setOcupado(true); setError("");
                                const res = await guardarExpediente(postulacionId, c.k, e.target.value, true);
                                setOcupado(false);
                                if (res?.error) { setError(res.error); return; }
                                setEditando(null);
                                router.refresh();
                              }}
                              style={{ width: "100%", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "var(--text)", outline: "none" }}>
                              <option value="">Elegir…</option>
                              {c.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                        ) : abiertoCampo && (
                          <div style={{ marginTop: 6 }}>
                            <textarea value={texto} autoFocus rows={c.largo ? 8 : 3}
                              onChange={e => setTexto(e.target.value)}
                              style={{ width: "100%", background: "var(--card)", border: `1px solid ${c.max && texto.length > c.max ? "var(--red)" : "var(--border)"}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "var(--text)", outline: "none", resize: "vertical", lineHeight: 1.5 }} />
                            <div style={{ display: "flex", gap: 8, marginTop: 5, alignItems: "center" }}>
                              <button className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: 11.5 }} disabled={ocupado}
                                onClick={() => guardar(c, false)}>{ocupado ? "..." : "💾 Borrador"}</button>
                              <button className="btn" style={{ padding: "4px 12px", fontSize: 11.5, background: "var(--green)" }}
                                disabled={ocupado || !texto.trim() || !!(c.max && texto.length > c.max)}
                                onClick={() => guardar(c, true)}>✓ Guardar listo</button>
                              {c.max && (
                                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: texto.length > c.max ? "var(--red)" : texto.length > c.max * 0.9 ? "var(--yellow)" : "var(--dim)" }}>
                                  {texto.length.toLocaleString()}/{c.max.toLocaleString()}
                                  {texto.length > c.max && " — la plataforma lo cortará"}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
