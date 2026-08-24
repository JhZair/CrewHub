"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { menciones, MencionesMenu } from "@/components/Menciones";
import LinkPreviews from "@/components/LinkPreviews";
import Avatar from "@/components/Avatar";
import PaletaRx from "@/components/PaletaRx";
import { agrupar } from "@/lib/reacciones";

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

/* La lista de emojis vivía aquí, con seis; la de los chips de siempre tenía
 * once. Como cada pantalla CONTABA recorriendo su propia lista, un ✔️ puesto
 * desde el caso no aparecía en este pop-up: no salía más pequeño, no salía.
 * La lista es una sola y está en lib/reacciones.ts. */

export const fechaHilo = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export type RxItem = { emoji: string; usuario_id: string; nombre?: string };

/* Barra de reacciones (chips con conteo + el ＋ para añadir). Se usa tanto en
 * cada comentario como a nivel del hilo.
 *
 * La paleta va EN FLUJO (`flotante={false}`) porque esto vive dentro de
 * `.vo-cuerpo`, que hace scroll: una paleta absoluta que sale por arriba la
 * recortaría el borde del contenedor, y el comentario más alto de la lista es
 * el que peor lo pasaría. */
function BarraRx({ rx, userId, ocupado, onReaccionar, titulo }: {
  rx: RxItem[]; userId: string; ocupado: boolean;
  onReaccionar: (emoji: string) => void; titulo?: string;
}) {
  const grupos = agrupar(rx, userId);
  const quienes = (g: { rs: RxItem[]; mia: boolean }) => {
    const txt = [
      ...(g.mia ? ["Tú"] : []),
      ...g.rs.filter(r => r.usuario_id !== userId).map(r => r.nombre).filter(Boolean),
    ].join(", ");
    if (!txt) return g.mia ? "Quitar mi reacción" : "Reaccionar igual";
    return g.mia ? `${txt} · toca para quitar la tuya` : `${txt} · toca para reaccionar igual`;
  };
  return (
    <div className="vo-rx">
      {grupos.map(g => (
        <button key={g.emoji} type="button" className={`rx-chip ${g.mia ? "mia" : ""}`}
          disabled={ocupado} title={quienes(g)}
          onClick={() => onReaccionar(g.emoji)}>{g.emoji} {g.n}</button>
      ))}
      {/* El 👀 fuera de la paleta: «lo vi» es el acuse que sostiene medio
          sistema y tiene que costar un toque. Solo mientras nadie lo haya
          puesto — en cuanto hay uno, su chip hace el mismo trabajo. */}
      <PaletaRx hayReacciones={grupos.length > 0} ocupado={ocupado}
        rapido={grupos.some(g => g.emoji === "👀") ? undefined : "👀"}
        titulo={titulo} flotante={false} onElegir={onReaccionar} />
    </div>
  );
}

export default function VistaHilo({
  children, tituloCab, abrirCompletoHref, abrirCompletoTitle, ariaLabel,
  cargar, listo, selComentarios, selReaccionesPorComentario, selPerfiles, selUserId,
  cabecera, onComentar, onReaccionarComentario,
  conHilo = true, claseCaja = "",
  permitirResponder = false, reaccionesHilo, onReaccionarHilo, onEditar,
  textoVacio = "Aún no hay comentarios.", placeholder = "Comentar al vuelo…  (@ para mencionar)",
}: {
  /** Disparador: recibe `abrir` y devuelve el elemento clicable de la superficie. */
  children: (abrir: (e?: any) => void) => ReactNode;
  /** Rótulo de la cabecera; función si depende de los datos cargados. */
  tituloCab: ReactNode | ((d: any) => ReactNode);
  /** A dónde lleva «Abrir completo». Opcional: hay vistas rápidas que no
   *  tienen página detrás —un combo de compra se ve entero de un vistazo y no
   *  necesita ficha—, y en ésas el enlace no se pinta. Poner uno falso sería
   *  peor: un botón que promete algo y lleva a un 404. */
  abrirCompletoHref?: string;
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
  /* Hay superficies que solo se MIRAN: la vista rápida de una persona o de una
     empresa orienta, no es un sitio de trabajo —y `comentarios` ni siquiera
     tiene de dónde colgar una persona—. Con `conHilo={false}` desaparecen la
     conversación y el composer, y el shell (portal, Esc, fondo, cargar al
     abrir, «abrir completo») se reusa tal cual en vez de copiarse. */
  conHilo?: boolean;
  /** Clase extra para la caja: una vista de datos necesita más ancho que un hilo. */
  claseCaja?: string;
  onComentar?: (texto: string, respondeA: string | null) => Promise<any>;
  onReaccionarComentario?: (comentarioId: string, emoji: string) => Promise<any>;
  permitirResponder?: boolean;
  /** Editar un comentario ya escrito. Si falta, el ✎ no aparece —una pantalla
   *  que no sabe editar no debe ofrecerlo—. La acción decide quién puede: aquí
   *  solo se enseña al autor, que es la misma regla, dicha antes de pulsar. */
  onEditar?: (comentarioId: string, texto: string) => Promise<any>;
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
  /* Qué comentario está en edición y con qué texto. Uno a la vez: dos cajas
     abiertas en un hilo largo es pedir que se guarde en la equivocada. */
  const [editando, setEditando] = useState<string | null>(null);
  const [txtEd, setTxtEd] = useState("");
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
    /* ── SI LA CARGA REVIENTA, SE DICE ──
       Sin este try, una acción que lanza —red caída, error no controlado en el
       servidor— dejaba la promesa rechazada y NADA cambiaba: el pop-up se
       quedaba en «Cargando…» indefinidamente, que es indistinguible de una
       consulta lenta. Quien lo ve espera, cierra, y vuelve a abrir. */
    let r: any;
    try {
      r = await cargar();
    } catch (e: any) {
      if (montado.current && id === reqRef.current) {
        setError(e?.message ? `No se pudo cargar: ${e.message}` : "No se pudo cargar. Revisa la conexión y vuelve a intentar.");
      }
      return;
    }
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
    if (!texto.trim() || !onComentar) return;
    correr(() => onComentar(texto.trim(), respondeA), () => {
      setTexto(""); setRespondeA(null);
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    });
  };
  const reaccionarCom = (comentarioId: string, emoji: string) =>
    onReaccionarComentario && correr(() => onReaccionarComentario(comentarioId, emoji));
  const reaccionarHilo = (emoji: string) => onReaccionarHilo && correr(() => onReaccionarHilo(emoji));

  return (
    <>
      {children(abrir)}

      {abierto && typeof document !== "undefined" && createPortal(
        <div className="modal-fondo"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) cerrar(); }}>
          <div className={`modal-caja vo-caja ${claseCaja}`} role="dialog" aria-modal="true"
            aria-label={ariaLabel || "Vista del hilo"} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-cab">
              <b>{typeof tituloCab === "function" ? (tituloCab as (d: any) => ReactNode)(data) : tituloCab}</b>
              <span style={{ flex: 1 }} />
              {abrirCompletoHref && (
                <a href={abrirCompletoHref} target="_blank" rel="noopener noreferrer"
                  className="vr-abrir" title={abrirCompletoTitle || "Abrir la página completa"}>Abrir completo ↗</a>
              )}
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
                {conHilo && <>
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
                            {/* ── CORREGIR LO ESCRITO ──
                                El hilo faltaba entero: se podía escribir y no
                                enmendar. En una conversación de trabajo eso
                                obliga a la corrección por segundo comentario
                                («*quise decir…»), que deja el error arriba y la
                                enmienda abajo — y quien lea dentro de un año
                                encontrará primero lo equivocado.
                                Solo al autor y solo si la pantalla sabe editar. */}
                            {onEditar && c.autor_id === userId && (
                              <button className="vo-com-resp-btn" title="Editar mi comentario"
                                onClick={() => { setEditando(c.id); setTxtEd(c.cuerpo || ""); }}>✎</button>
                            )}
                            {/* Que fue editado se DICE. Un texto que cambia sin
                                dejar rastro convierte el hilo en algo que no se
                                puede citar. */}
                            {c.editado_en && (
                              <span className="vo-com-t" title={`Editado ${fechaHilo(c.editado_en)}`}>· editado</span>
                            )}
                          </div>
                          {padre && (
                            <div className="vo-com-resp">↳ a <b>{(padre as any).autor?.nombre?.split(" ")[0] || "un comentario"}</b></div>
                          )}
                          {editando === c.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "4px 0" }}>
                              <textarea value={txtEd} onChange={e => setTxtEd(e.target.value)} rows={3} autoFocus
                                /* Esc cancela: es lo que hace todo lo demás que se
                                   abre encima en esta pantalla. */
                                onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setEditando(null); } }}
                                style={{ width: "100%", background: "var(--bg)", color: "var(--text)",
                                  border: "1px solid var(--accent)", borderRadius: 8, padding: "6px 9px",
                                  fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="btn" disabled={ocupado || !txtEd.trim()}
                                  style={{ fontSize: 11.5, padding: "4px 12px" }}
                                  onClick={async () => {
                                    const r: any = await onEditar!(c.id, txtEd);
                                    if (r?.error) { alert(r.error); return; }
                                    setEditando(null); recargar();
                                  }}>Guardar</button>
                                <button className="btn btn-ghost" style={{ fontSize: 11.5, padding: "4px 10px" }}
                                  onClick={() => setEditando(null)}>Cancelar</button>
                              </div>
                            </div>
                          ) : c.cuerpo ? <div className="vo-com-txt">{c.cuerpo}</div> : null}
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
                </>}
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
