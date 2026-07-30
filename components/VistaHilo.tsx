"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { menciones, MencionesMenu } from "@/components/Menciones";
import LinkPreviews from "@/components/LinkPreviews";
import Avatar from "@/components/Avatar";

/* VISTA HILO — base compartida de los pop-up interactivos (objeto del
 * repositorio, postulación…). Aporta todo lo común: shell del modal, ciclo
 * cargar→refrescar, lista de comentarios con respuestas/imágenes, reacciones
 * por comentario y (opcional) a nivel del hilo, y el composer con @menciones y
 * respuesta opcional. Cada superficie sólo pone su CABECERA y sus ACCIONES.
 *
 * Reusa las escrituras propias de cada dueño; sólo la lectura la inyecta el
 * llamador vía `cargar`. Tras cada cambio re-pide los datos para refrescarse
 * solo (el router.refresh de la página no alcanza a un modal con su propio
 * estado). El disparador lo pone cada superficie vía render-prop. */

export const EMOJIS = ["👀", "👍", "❤️", "🔥", "👏", "🤔"];

export const fechaHilo = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export type RxItem = { emoji: string; usuario_id: string; nombre?: string };

/* Barra de reacciones (chips con conteo + paleta para añadir). Se usa tanto en
 * cada comentario como a nivel del hilo. */
function BarraRx({ rx, userId, ocupado, onReaccionar, titulo }: {
  rx: RxItem[]; userId: string; ocupado: boolean;
  onReaccionar: (emoji: string) => void; titulo?: string;
}) {
  const grupos = EMOJIS.map(e => ({
    emoji: e, n: rx.filter(r => r.emoji === e).length,
    mia: rx.some(r => r.emoji === e && r.usuario_id === userId),
  })).filter(g => g.n > 0);
  return (
    <div className="vo-rx">
      {grupos.map(g => (
        <button key={g.emoji} className={`rx-chip ${g.mia ? "mia" : ""}`} disabled={ocupado}
          onClick={() => onReaccionar(g.emoji)}>{g.emoji} {g.n}</button>
      ))}
      <span className="vo-rx-pal">
        {EMOJIS.map(e => (
          <button key={e} className="vo-rx-add" disabled={ocupado} title={titulo || "Reaccionar"}
            onClick={() => onReaccionar(e)}>{e}</button>
        ))}
      </span>
    </div>
  );
}

export default function VistaHilo({
  children, tituloCab, abrirCompletoHref, abrirCompletoTitle, ariaLabel,
  cargar, listo, selComentarios, selReaccionesPorComentario, selPerfiles, selUserId,
  cabecera, onComentar, onReaccionarComentario,
  permitirResponder = false, reaccionesHilo, onReaccionarHilo,
  textoVacio = "Aún no hay comentarios.", placeholder = "Comentar al vuelo…  (@ para mencionar)",
}: {
  /** Disparador: recibe `abrir` y devuelve el elemento clicable de la superficie. */
  children: (abrir: (e?: any) => void) => ReactNode;
  /** Rótulo de la cabecera; función si depende de los datos cargados. */
  tituloCab: ReactNode | ((d: any) => ReactNode);
  abrirCompletoHref: string;
  abrirCompletoTitle?: string;
  ariaLabel?: string;
  /** Lectura: devuelve los datos crudos, o `{ error }`. */
  cargar: () => Promise<any>;
  /** ¿Ya cargó lo esencial para pintar? (p. ej. `d?.objeto` / `d?.postulacion`) */
  listo: (d: any) => boolean;
  selComentarios?: (d: any) => any[];
  selReaccionesPorComentario?: (d: any) => Record<string, RxItem[]>;
  selPerfiles?: (d: any) => { id: string; nombre: string }[];
  selUserId?: (d: any) => string;
  /** Cabecera propia de cada dueño (título, portada, contexto…). */
  cabecera: (d: any, cerrar: () => void) => ReactNode;
  onComentar: (texto: string, respondeA: string | null) => Promise<any>;
  onReaccionarComentario: (comentarioId: string, emoji: string) => Promise<any>;
  permitirResponder?: boolean;
  /** Si se pasa, muestra una fila de reacciones al HILO (p. ej. la postulación). */
  reaccionesHilo?: (d: any) => RxItem[];
  onReaccionarHilo?: (emoji: string) => Promise<any>;
  textoVacio?: string;
  placeholder?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [data, setData] = useState<any>(null);
  const [texto, setTexto] = useState("");
  const [respondeA, setRespondeA] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const finRef = useRef<HTMLDivElement>(null);
  const montado = useRef(true);
  const reqRef = useRef(0);

  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const recargar = async () => {
    const id = ++reqRef.current;
    setError("");
    const r: any = await cargar();
    if (!montado.current || id !== reqRef.current) return;
    if (r?.error) { setError(r.error); return; }
    setData(r);
  };

  const cerrar = () => { setAbierto(false); setData(null); setTexto(""); setRespondeA(null); setError(""); };
  const abrir = (e?: any) => { if (e) { e.stopPropagation?.(); e.preventDefault?.(); } setAbierto(true); };

  useEffect(() => {
    if (!abierto) return;
    recargar();
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const correr = async (accion: () => Promise<any>, alTerminar?: () => void) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    try {
      const r: any = await accion();
      if (r?.error) { setError(r.error); return; }
      await recargar(); router.refresh();
      alTerminar?.();
    } catch {
      if (montado.current) setError("No se pudo completar la acción.");
    } finally {
      if (montado.current) setOcupado(false);
    }
  };

  const perfiles = (selPerfiles?.(data) as { id: string; nombre: string }[]) || [];
  const userId = selUserId?.(data) || "";
  const comentarios = (selComentarios?.(data) as any[]) || [];
  const rxPorCom = (selReaccionesPorComentario?.(data) as Record<string, RxItem[]>) || {};
  const rxHilo = reaccionesHilo ? (reaccionesHilo(data) || []) : null;
  const comMap = new Map(comentarios.map((c: any) => [c.id, c]));

  const { enMencion, candidatos, aplicar } = menciones(texto, perfiles);
  const invocarMencion = (nombre: string) => setTexto(aplicar(nombre));

  const enviarComentario = () => {
    if (!texto.trim()) return;
    correr(() => onComentar(texto.trim(), respondeA), () => {
      setTexto(""); setRespondeA(null);
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    });
  };
  const reaccionarCom = (comentarioId: string, emoji: string) => correr(() => onReaccionarComentario(comentarioId, emoji));
  const reaccionarHilo = (emoji: string) => onReaccionarHilo && correr(() => onReaccionarHilo(emoji));

  return (
    <>
      {children(abrir)}

      {abierto && typeof document !== "undefined" && createPortal(
        <div className="modal-fondo"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) cerrar(); }}>
          <div className="modal-caja vo-caja" role="dialog" aria-modal="true"
            aria-label={ariaLabel || "Vista del hilo"} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-cab">
              <b>{typeof tituloCab === "function" ? (tituloCab as (d: any) => ReactNode)(data) : tituloCab}</b>
              <span style={{ flex: 1 }} />
              <a href={abrirCompletoHref} target="_blank" rel="noopener noreferrer"
                className="vr-abrir" title={abrirCompletoTitle || "Abrir la página completa"}>Abrir completo ↗</a>
              <button className="modal-x" title="Cerrar (Esc)" onClick={cerrar}>✕</button>
            </div>

            {!listo(data) ? (
              <div className="modal-cargando">{error || "Cargando…"}</div>
            ) : (
              <div className="vo-cuerpo">
                {cabecera(data, cerrar)}

                {rxHilo && onReaccionarHilo && (
                  <div style={{ marginTop: 2 }}>
                    <BarraRx rx={rxHilo} userId={userId} ocupado={ocupado}
                      onReaccionar={reaccionarHilo} titulo="Reaccionar" />
                  </div>
                )}

                {/* Conversación: comentarios con reacciones */}
                <div className="vo-coms">
                  <div className="vo-coms-h">💬 Conversación · {comentarios.length}</div>
                  {comentarios.length === 0 && (
                    <div style={{ color: "var(--dim)", fontSize: 12, padding: "4px 0" }}>{textoVacio}</div>
                  )}
                  {comentarios.map((c: any) => {
                    const padre = c.responde_a ? comMap.get(c.responde_a) : null;
                    return (
                      <div key={c.id} className="vo-com">
                        <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={30} src={c.autor?.avatar_url} />
                        <div className="vo-bubble">
                          <div className="vo-com-h">
                            <b style={{ color: c.autor?.color || "var(--text)" }}>{c.autor?.nombre?.split(" ")[0] || "—"}</b>
                            <span className="vo-com-t">{fechaHilo(c.creado_en)}</span>
                            {permitirResponder && (
                              <button className="vo-com-resp-btn" title="Responder"
                                onClick={() => { setRespondeA(c.id); setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 40); }}>↳</button>
                            )}
                          </div>
                          {padre && (
                            <div className="vo-com-resp">↳ a <b>{(padre as any).autor?.nombre?.split(" ")[0] || "un comentario"}</b></div>
                          )}
                          {c.cuerpo && <div className="vo-com-txt">{c.cuerpo}</div>}
                          <LinkPreviews texto={c.cuerpo} />
                          {(c.imagenes || []).length > 0 && (
                            <div className="vo-com-imgs">
                              {c.imagenes.map((src: string, i: number) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={i} src={src} alt="" referrerPolicy="no-referrer" />
                              ))}
                            </div>
                          )}
                          <BarraRx rx={rxPorCom[c.id] || []} userId={userId} ocupado={ocupado}
                            onReaccionar={(emoji) => reaccionarCom(c.id, emoji)} />
                        </div>
                      </div>
                    );
                  })}
                  <div ref={finRef} />
                </div>

                {/* Comentar al vuelo (con @menciones y respuesta opcional) */}
                {permitirResponder && respondeA && (
                  <div className="vo-respondiendo">
                    ↳ Respondiendo a <b>{(comMap.get(respondeA) as any)?.autor?.nombre?.split(" ")[0] || "un comentario"}</b>
                    <button className="vo-resp-x" title="Cancelar respuesta" onClick={() => setRespondeA(null)}>✕</button>
                  </div>
                )}
                <div className="vo-escribir">
                  <div className="cbox" style={{ position: "relative", flex: 1 }}>
                    <MencionesMenu candidatos={candidatos} onElegir={invocarMencion} />
                    <textarea value={texto} onChange={e => setTexto(e.target.value)}
                      placeholder={placeholder} rows={2}
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
