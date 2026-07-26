"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cargarObjetoRapido, comentarObjeto, toggleReaccion } from "@/app/actions";
import { icoObjeto, lblObjeto } from "@/lib/objetos";
import { icoTipo } from "@/lib/tipos";
import { ICO_ENT, rutaEntidad } from "@/lib/secciones";
import { claseEstado, rotuloEstado } from "@/lib/estados";
import { menciones, MencionesMenu } from "@/components/Menciones";
import MiniObjeto from "@/components/MiniObjeto";
import Avatar from "@/components/Avatar";

/* VISTA OBJETO — un objeto del repositorio en un pop-up, para verlo e
 * interactuar SIN salir de la página de trabajo. Así es como se trabaja un
 * repositorio: se abre el material, se lee, se comenta y se reacciona al vuelo,
 * y al cerrar sigues donde estabas.
 *
 * Reusa las MISMAS escrituras del objeto (comentarObjeto, toggleReaccion); solo
 * la lectura es nueva (cargarObjetoRapido). Tras cada cambio re-pide el objeto
 * para refrescarse solo (el router.refresh de la página no alcanza a un modal
 * con su propio estado). El disparador lo pone cada superficie vía render-prop. */

const EMOJIS = ["👀", "👍", "❤️", "🔥", "👏", "🤔"];

const fecha = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function VistaObjeto({ objetoId, children }: {
  objetoId: string;
  /** Disparador: recibe `abrir` y devuelve el elemento clicable de la superficie. */
  children: (abrir: (e?: any) => void) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [data, setData] = useState<any>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const finRef = useRef<HTMLDivElement>(null);
  const montado = useRef(true);
  const reqRef = useRef(0);

  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const cargar = async () => {
    const id = ++reqRef.current;
    setError("");
    const r: any = await cargarObjetoRapido(objetoId);
    if (!montado.current || id !== reqRef.current) return;
    if (r?.error) { setError(r.error); return; }
    setData(r);
  };

  const cerrar = () => { setAbierto(false); setData(null); setTexto(""); setError(""); };
  const abrir = (e?: any) => { if (e) { e.stopPropagation?.(); e.preventDefault?.(); } setAbierto(true); };

  useEffect(() => {
    if (!abierto) return;
    cargar();
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const trasAccion = async () => { await cargar(); router.refresh(); };

  const correr = async (accion: () => Promise<any>, alTerminar?: () => void) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    try {
      const r: any = await accion();
      if (r?.error) { setError(r.error); return; }
      await trasAccion();
      alTerminar?.();
    } catch {
      if (montado.current) setError("No se pudo completar la acción.");
    } finally {
      if (montado.current) setOcupado(false);
    }
  };

  const o = data?.objeto;
  const perfiles: { id: string; nombre: string }[] = data?.perfiles || [];
  const userId: string = data?.userId || "";
  const comentarios: any[] = data?.comentarios || [];
  const rxPorCom: Record<string, any[]> = data?.reaccionesPorComentario || {};
  const comMap = new Map(comentarios.map((c: any) => [c.id, c]));

  const { enMencion, candidatos, aplicar } = menciones(texto, perfiles);
  const invocarMencion = (nombre: string) => setTexto(aplicar(nombre));

  const enviarComentario = () => {
    if (!texto.trim()) return;
    correr(() => comentarObjeto(objetoId, texto.trim()), () => {
      setTexto("");
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    });
  };
  const reaccionar = (comentarioId: string, emoji: string) =>
    correr(() => toggleReaccion(null, comentarioId, emoji, objetoId));

  return (
    <>
      {children(abrir)}

      {abierto && typeof document !== "undefined" && createPortal(
        <div className="modal-fondo"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) cerrar(); }}>
          <div className="modal-caja vo-caja" role="dialog" aria-modal="true"
            aria-label="Vista del objeto" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-cab">
              <b>📚 {o ? lblObjeto(o.tipo) : "Repositorio"}</b>
              <span style={{ flex: 1 }} />
              <a href={`/objeto/${objetoId}`} target="_blank" rel="noopener noreferrer"
                className="vr-abrir" title="Abrir la página completa del objeto">Abrir completo ↗</a>
              <button className="modal-x" title="Cerrar (Esc)" onClick={cerrar}>✕</button>
            </div>

            {!o ? (
              <div className="modal-cargando">{error || "Cargando…"}</div>
            ) : (
              <div className="vo-cuerpo">
                {/* Título + dueño */}
                <div className="vo-head">
                  <span style={{ fontSize: 20 }}>{icoObjeto(o.tipo)}</span>
                  <b style={{ flex: 1, fontSize: 17 }}>{o.titulo}</b>
                </div>
                <div className="vo-meta">
                  {o.fecha && <span>{new Date(o.fecha + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}</span>}
                  <span>de{" "}
                    <Link href={rutaEntidad(data.dueno.tipo, data.dueno.id) || "#"} className="vo-dueno" onClick={cerrar}>
                      {ICO_ENT[data.dueno.tipo] || "🔗"} {data.dueno.nombre}
                    </Link>
                  </span>
                  {data.verif && (
                    <span className={`vo-verif ${data.verif.correcto ? "ok" : "warn"}`}>
                      {data.verif.correcto ? "✓ verificado" : "⚠ por reverificar"}{data.verif.por ? ` · ${data.verif.por}` : ""}
                    </span>
                  )}
                </div>

                {/* Portada: la imagen manda, como en la página completa. */}
                {o.url && (
                  <div className="vo-portada">
                    <MiniObjeto url={o.url} ico={icoObjeto(o.tipo)} ancho={900} />
                  </div>
                )}
                {o.notas && <div className="vo-notas">{o.notas}</div>}
                {o.url && (
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost vo-abrir-link">
                    {icoObjeto(o.tipo)} Abrir el archivo ↗
                  </a>
                )}

                {/* Vinculado a */}
                {data.vinculadas.length > 0 && (
                  <div className="vo-vinc">
                    <span className="vo-lbl">🔗 Vinculado a</span>
                    {data.vinculadas.map((v: any) => (
                      <Link key={`${v.tipo}:${v.id}`} href={rutaEntidad(v.tipo, v.id) || "#"} className="echip" onClick={cerrar}>
                        {ICO_ENT[v.tipo] || "🔗"} {v.nombre}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Casos (trabajo real sobre el objeto) */}
                {data.casos.length > 0 && (
                  <div className="vo-casos">
                    <span className="vo-lbl">🗂 Casos · {data.casos.length}</span>
                    {data.casos.map((c: any) => (
                      <a key={c.id} href={`/caso/${c.id}`} target="_blank" rel="noopener noreferrer" className="vo-caso">
                        <span>{icoTipo(c.tipo)}</span>
                        <b style={{ flex: 1 }}>{c.titulo}</b>
                        {(c.comentarios?.[0]?.count ?? 0) > 0 && <span className="vo-caso-n">💬 {c.comentarios[0].count}</span>}
                        <span className={`pill st-${claseEstado(c.estado, c.tipo)}`}>{rotuloEstado(c.estado, c.tipo)}</span>
                      </a>
                    ))}
                  </div>
                )}

                {/* Conversación: comentarios con reacciones */}
                <div className="vo-coms">
                  <div className="vo-coms-h">💬 Conversación · {comentarios.length}</div>
                  {comentarios.length === 0 && (
                    <div style={{ color: "var(--dim)", fontSize: 12, padding: "4px 0" }}>Aún no se ha hablado de este material.</div>
                  )}
                  {comentarios.map((c: any) => {
                    const padre = c.responde_a ? comMap.get(c.responde_a) : null;
                    const rx = rxPorCom[c.id] || [];
                    const grupos = EMOJIS.map(e => ({
                      emoji: e, n: rx.filter((r: any) => r.emoji === e).length,
                      mia: rx.some((r: any) => r.emoji === e && r.usuario_id === userId),
                    })).filter(g => g.n > 0);
                    return (
                      <div key={c.id} className="vo-com">
                        <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={30} src={c.autor?.avatar_url} />
                        <div className="vo-bubble">
                          <div className="vo-com-h">
                            <b style={{ color: c.autor?.color || "var(--text)" }}>{c.autor?.nombre?.split(" ")[0] || "—"}</b>
                            <span className="vo-com-t">{fecha(c.creado_en)}</span>
                          </div>
                          {padre && (
                            <div className="vo-com-resp">↳ a <b>{(padre as any).autor?.nombre?.split(" ")[0] || "un comentario"}</b></div>
                          )}
                          {c.cuerpo && <div className="vo-com-txt">{c.cuerpo}</div>}
                          {(c.imagenes || []).length > 0 && (
                            <div className="vo-com-imgs">
                              {c.imagenes.map((src: string, i: number) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={i} src={src} alt="" referrerPolicy="no-referrer" />
                              ))}
                            </div>
                          )}
                          <div className="vo-rx">
                            {grupos.map(g => (
                              <button key={g.emoji} className={`rx-chip ${g.mia ? "mia" : ""}`} disabled={ocupado}
                                onClick={() => reaccionar(c.id, g.emoji)}>{g.emoji} {g.n}</button>
                            ))}
                            <span className="vo-rx-pal">
                              {EMOJIS.map(e => (
                                <button key={e} className="vo-rx-add" disabled={ocupado} title="Reaccionar"
                                  onClick={() => reaccionar(c.id, e)}>{e}</button>
                              ))}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={finRef} />
                </div>

                {/* Comentar al vuelo (con @menciones) */}
                <div className="vo-escribir">
                  <div className="cbox" style={{ position: "relative", flex: 1 }}>
                    <MencionesMenu candidatos={candidatos} onElegir={invocarMencion} />
                    <textarea value={texto} onChange={e => setTexto(e.target.value)}
                      placeholder="Comentar al vuelo…  (@ para mencionar)" rows={2}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey && enMencion && candidatos.length) {
                          e.preventDefault(); invocarMencion(candidatos[0].nombre); return;
                        }
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviarComentario();
                      }} />
                  </div>
                  <button className="btn" disabled={ocupado || !texto.trim()} onClick={enviarComentario}>
                    {ocupado ? "…" : "Comentar"}
                  </button>
                </div>
                {error && <div className="err-inline" style={{ marginTop: 6 }}>⚠ {error}</div>}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
