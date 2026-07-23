"use client";
import { guardarExpediente, casoDeExpediente } from "@/app/actions";
import { claseEstado, rotuloEstado } from "@/lib/estados";
import Link from "next/link";
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

export default function Expediente({ postulacionId, plantilla, expediente, auto, cronoListo, cronoResumen, presuListo, presuResumen, materialN, benefN, precontN, precontFirm, casos, rutaFondo }: {
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
  /** Qué caso atiende cada campo, ya resuelto: clave del campo → caso. */
  casos?: Record<string, { id: string; titulo: string; estado: string; resp?: string | null }>;
  /* Si el fondo ya está en ejecución, el cronograma y el presupuesto se editan
     en su página propia, no en un plegable de esta ficha. Cuando llega, esos
     dos enlaces navegan allí en vez de bajar a un ancla que ya no existe. */
  rutaFondo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState(0);
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

  /* LAS PESTAÑAS SON LAS SECCIONES DE LA PLANTILLA.

     La plataforma real de DAFO parte el formulario en SECCIÓN A, B, C y D, y
     esa división no es decorativa: A es la persona jurídica, B lo legal del
     proyecto, C lo artístico y D lo económico. Son cuatro trabajos distintos,
     que además hace gente distinta —contabilidad no redacta la sinopsis—.
     Todo junto en una sola página eran cuarenta y cuatro campos de scroll: se
     perdía el sitio, no se sabía cuánto faltaba de cada parte, y el orden en
     que se llena dejaba de parecerse al orden en que se envía.

     No se declaran a mano: cada sección de la plantilla es una pestaña. Si una
     convocatoria trae tres secciones, salen tres. */
  const secciones = plantilla.filter(s => s.campos.some(c => !esVinculada(c)));
  /* La letra que la plantilla ya usa en el título («A · PERSONA JURÍDICA»).
     Es la misma que la plataforma imprime en sus pestañas, así que sirve de
     puente entre las dos pantallas el día del envío. */
  /* Acepta «A · …» y «SECCIÓN A · …»: la plantilla vive en la base y cada
     convocatoria la escribe a su manera. */
  const letraDe = (s: SeccionExp) =>
    (s.titulo.trim().match(/^(?:secci[oó]n\s+)?([A-Z])\s*[·\-.:]/i) || [])[1]?.toUpperCase() || "";
  const cortoDe = (s: SeccionExp) =>
    s.titulo.replace(/^(?:secci[oó]n\s+)?[A-Z]\s*[·\-.:]\s*/i, "").trim() || s.titulo.trim();
  const seguraP = Math.min(pestana, Math.max(0, secciones.length - 1));
  /* Qué letras EXISTEN como pestaña. Hace falta para no perder tarjetas: si la
     Sección D es presupuesto entera, todos sus campos son «vinculados», la
     sección se cae de la lista y no hay pestaña «D» donde colgar el enlace al
     presupuesto — que es justo el que la reemplaza. Lo huérfano va a la
     primera pestaña antes que desaparecer de la pantalla. */
  const letras = new Set(secciones.map(letraDe).filter(Boolean));

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
    // Avisar a la sección para que se despliegue: cuatro de las cinco arrancan
    // plegadas, y aterrizar en una cabecera cerrada se lee como «está vacío».
    window.dispatchEvent(new CustomEvent("plg:abrir", { detail: id }));
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
    /* `linked`: el mismo marco que la pestaña Contexto. Las tres pestañas son
       hermanas y una salía sin caja, flotando sobre el fondo — se leía como si
       fuera otra cosa. */
    <div className="linked">
      {/* ===== En la pestaña: resumen + puerta de entrada ===== */}
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Medidor compacto />
        <button className="btn" style={{ padding: "8px 16px", fontSize: 12.5 }}
          onClick={() => setAbierto(true)}>🗂 Abrir expediente</button>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
        {/* Las píldoras de la pestaña abren el expediente YA en su sección: si
            ves que a la C le faltan cinco, tocarla y aterrizar en la A es un
            paso de más cada vez. */}
        {secciones.map((s, i) => {
          const oblig = s.campos.filter(c => !c.opcional && !esVinculada(c));
          const ok = oblig.filter(c => listoDe(c)).length;
          return (
            <span key={i} className="badge" style={{
              color: ok === oblig.length ? "var(--green)" : "var(--muted)",
              background: "#1c1c2c", fontSize: 11, cursor: "pointer",
            }} title={s.titulo} onClick={() => { setPestana(i); setAbierto(true); }}>
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
          {/* `modal-form`, no `modal-ancho`: esto es un formulario de una
              columna, no una tabla. Ver globals. */}
          <div className="modal-caja modal-form">
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

            {/* LAS PESTAÑAS. Cada una lleva su propio contador: saber que a la
                Sección C le faltan 9 campos es accionable; saber que al
                expediente entero le faltan 13 no le dice a nadie qué hacer. */}
            <div className="exp-tabs">
              {secciones.map((s, i) => {
                const ob = s.campos.filter(c => !c.opcional && !esVinculada(c));
                const ok = ob.filter(c => listoDe(c)).length;
                const full = ob.length > 0 && ok === ob.length;
                return (
                  <button key={i} className={`exp-tab ${i === seguraP ? "on" : ""}`}
                    onClick={() => setPestana(i)} title={s.titulo}>
                    <b>{letraDe(s) ? `Sección ${letraDe(s)}` : cortoDe(s)}</b>
                    <i>{cortoDe(s)}</i>
                    <span className={full ? "ok" : ""}>{ok}/{ob.length}</span>
                  </button>
                );
              })}
            </div>

            {error && <div className="err-inline">⚠ {error}</div>}

            {secciones.slice(seguraP, seguraP + 1).map((s, _i) => {
              const si = seguraP;
              /* Las tarjetas que llevan a OTRA sección de la ficha viven en la
                 pestaña que les toca, no en una banda repetida arriba: el
                 cronograma y el material de archivo son parte de la Sección C
                 y el presupuesto es la Sección D entera. Así cada pestaña se
                 basta a sí misma, como en la plataforma real. */
              const letra = letraDe(s);
              const enlaces = [
                { en: "C", id: "sec-cronograma", ico: "📅", nom: "Cronograma", listo: cronoListo, res: cronoResumen, opc: false },
                { en: "C", id: "sec-material", ico: "📁", nom: "Material de archivo", listo: (materialN || 0) > 0, res: (materialN || 0) > 0 ? `${materialN} entradas` : "sin material (o no aplica)", opc: true },
                { en: "C", id: "sec-beneficiarios", ico: "👥", nom: "Beneficiarios", listo: (benefN || 0) > 0, res: (benefN || 0) > 0 ? `${benefN} filas` : "sin filas (o no aplica)", opc: true },
                { en: "D", id: "sec-presupuesto", ico: "💰", nom: "Presupuesto", listo: presuListo, res: presuResumen, opc: false },
                { en: "B", id: "sec-precontratos", ico: "📝", nom: "Precontratos", listo: (precontN || 0) > 0 && (precontFirm || 0) === (precontN || 0), res: (precontN || 0) > 0 ? `${precontFirm || 0}/${precontN} firmados` : "sin precontratos (o no aplica)", opc: true },
              ].filter(x =>
                letras.has(x.en)
                  ? x.en === letra          // hay pestaña para su letra: ahí va
                  : si === 0);              // no la hay: a la primera, nunca al vacío
              const ob = s.campos.filter(c => !c.opcional && !esVinculada(c));
              const faltan = ob.filter(c => !listoDe(c)).length;
              const encargados = ob.filter(c => casos?.[c.k]).length;
              return (
              <div key={si}>
                {/* Cuánto falta y cuánto está encargado. El botón NO vive aquí:
                    encargar la sección entera de un golpe mete en la misma
                    tarea seis combos de diez segundos y tres textos de verdad.
                    Se encarga campo por campo, desde su propia fila. */}
                <div className="exp-encargo">
                  <span className="exp-encargo-txt">
                    {faltan > 0
                      ? <>Faltan <b style={{ color: "var(--yellow)" }}>{faltan}</b> campo{faltan === 1 ? "" : "s"} en esta sección
                          {encargados > 0 && <> · {encargados} encargado{encargados === 1 ? "" : "s"}</>}.
                          {" "}<i>Con 🗂 conviertes uno en caso, con responsable y plazo.</i></>
                      : <>✅ Sección completa.</>}
                  </span>
                </div>
                {enlaces.length > 0 && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                    {enlaces.map(x => {
                      /* Cronograma y presupuesto migraron a la página del fondo
                         cuando ya se ganó: su enlace navega allí, no baja a un
                         ancla que ya no está en esta ficha. El resto (material,
                         beneficiarios, precontratos) sigue viviendo aquí. */
                      const alFondo = !!rutaFondo && (x.id === "sec-cronograma" || x.id === "sec-presupuesto");
                      const cara = (
                        <>
                          <span style={{ color: x.listo ? "var(--green)" : x.opc ? "var(--dim)" : "var(--yellow)" }}>{x.listo ? "✅" : x.opc ? "◦" : "○"}</span>{" "}
                          {x.ico} <b>{x.nom}</b>
                          <span style={{ color: "var(--dim)", fontWeight: 400 }}> — {x.res || (x.listo ? "listo" : "pendiente")}</span>
                          <span style={{ color: "var(--accent)", float: "right" }}>{alFondo ? "ejecución →" : "ir →"}</span>
                        </>
                      );
                      const estilo = { flex: "1 1 240px", textAlign: "left" as const, padding: "9px 12px", fontSize: 12.5, borderColor: x.listo ? "rgba(46,204,113,.35)" : "var(--border)" };
                      return alFondo ? (
                        <Link key={x.id} href={rutaFondo!} className="btn btn-ghost" style={estilo}>{cara}</Link>
                      ) : (
                        <button key={x.id} className="btn btn-ghost" style={estilo} onClick={() => irA(x.id)}>{cara}</button>
                      );
                    })}
                  </div>
                )}
                <div className="exp-form">
                  {s.campos.filter(c => !esVinculada(c)).map(c => {
                    const v = valorDe(c);
                    const esAuto = !expediente[c.k] && !!auto[c.k];
                    const listo = listoDe(c);
                    const abiertoCampo = editando === c.k;
                    return (
                      /* FILA DE FORMULARIO: etiqueta a la izquierda en columna
                         fija, contenido a la derecha. La rejilla de tarjetas
                         que había antes obligaba al ojo a zigzaguear, y con
                         cuarenta y cuatro campos eso cansa; además los textos
                         largos —sinopsis, planteamiento— se leían apretados en
                         media columna. En una plataforma que se llena de
                         arriba abajo, la pantalla debe leerse igual. */
                      <div key={c.k} className={`exp-fila ${listo ? "ok" : v ? "borr" : ""} ${abiertoCampo ? "edit" : ""}`}>
                        <div className="exp-lbl">
                          <span className="exp-est">{listo ? "✅" : v ? "✏️" : "○"}</span>
                          <span>
                            {c.etiqueta}
                            {c.opcional && <i> (opc.)</i>}
                            {esAuto && <b className="exp-auto" title="Se llena solo desde la base">⚡</b>}
                          </span>
                        </div>
                        <div className="exp-val">
                          {c.ayuda && (!v || abiertoCampo) && (
                            <div className="exp-ayuda">💡 {c.ayuda}</div>
                          )}
                          {v && !abiertoCampo && (
                            <div className="exp-texto">
                              {v.length > 400 ? v.slice(0, 400) + "…" : v}
                            </div>
                          )}
                          {!v && !abiertoCampo && <div className="exp-vacio">— sin llenar</div>}
                          {/* Si este campo está encargado, el caso se ve aquí:
                              quien abre el expediente tiene que saber que
                              alguien ya está en ello antes de ponerse. */}
                          {casos?.[c.k] && (
                            <div className="exp-caso">
                              🗂 <a href={`/caso/${casos[c.k].id}`}>{casos[c.k].titulo}</a>
                              {casos[c.k].resp && <i> · {casos[c.k].resp}</i>}
                              <span className={`pill st-${claseEstado(casos[c.k].estado, "tarea")}`}>
                                {rotuloEstado(casos[c.k].estado, "tarea")}
                              </span>
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
                        {/* Las acciones, a la derecha del todo: son de este
                            campo, no del texto. Siempre en el mismo sitio,
                            así se pueden encadenar sin buscarlas. */}
                        <div className="exp-acc">
                          {(() => {
                            const url = (v.match(/https?:\/\/[^\s"<>]+/) || [])[0];
                            return url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                title="Abrir el archivo / link" onClick={e => e.stopPropagation()}>↗</a>
                            ) : null;
                          })()}
                          {v && (
                            <button title="Copiar para la plataforma DAFO"
                              style={{ color: copiado === c.k ? "var(--green)" : "var(--dim)" }}
                              onClick={() => copiar(c)}>{copiado === c.k ? "✓" : "📋"}</button>
                          )}
                          {v && !esAuto && (
                            <button title={listo ? "Volver a borrador" : "Marcar listo"}
                              style={{ color: listo ? "var(--yellow)" : "var(--green)" }}
                              onClick={() => marcarListo(c, !listo)}>{listo ? "↩" : "✓"}</button>
                          )}
                          {/* Encargar SOLO éste. Aparece donde hace falta: en
                              lo que no está listo y aún no tiene caso. Un
                              combo de diez segundos no necesita una tarea. */}
                          {!listo && !casos?.[c.k] && (
                            <button title="Convertir en caso, con responsable y plazo"
                              disabled={ocupado}
                              onClick={async () => {
                                setOcupado(true); setError("");
                                const r: any = await casoDeExpediente(postulacionId, c.k, `📋 ${c.etiqueta}`);
                                setOcupado(false);
                                if (r?.error) { setError(r.error); return; }
                                router.refresh();
                              }}>🗂</button>
                          )}
                          <button title={abiertoCampo ? "Cerrar" : "Redactar"}
                            onClick={() => { setEditando(abiertoCampo ? null : c.k); setTexto(v); }}>
                            {abiertoCampo ? "✕" : "✎"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pasar de sección sin volver arriba: el formulario real se
                    recorre en orden, y al terminar una parte lo que se quiere
                    es la siguiente. */}
                <div className="exp-nav">
                  <button className="btn btn-ghost" disabled={seguraP === 0}
                    onClick={() => setPestana(seguraP - 1)}>← {secciones[seguraP - 1] ? cortoDe(secciones[seguraP - 1]) : ""}</button>
                  <span style={{ flex: 1 }} />
                  <button className="btn btn-ghost" disabled={seguraP >= secciones.length - 1}
                    onClick={() => setPestana(seguraP + 1)}>{secciones[seguraP + 1] ? cortoDe(secciones[seguraP + 1]) : ""} →</button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
