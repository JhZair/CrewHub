"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  cargarCasoRapido, comentar, toggleReaccion, toggleEnterado,
  cambiarEstado, asignarResponsable, cambiarFechaLimite,
} from "@/app/actions";
import { opcionesEstado, esAviso, claseEstado } from "@/lib/estados";
import { icoTipo } from "@/lib/tipos";
import { TXT } from "@/lib/texto";
import { ICO_ENT } from "@/lib/secciones";
import { opcionesResp } from "@/lib/personas";
import { menciones, MencionesMenu } from "@/components/Menciones";
import LinkPreviews from "@/components/LinkPreviews";

/* VISTA RÁPIDA — un caso en un pop-up, para interactuar sin abrir otra pestaña.
 *
 * Crear al vuelo ya existía (el compositor). Faltaba lo simétrico: RESPONDER al
 * vuelo. Antes había que abrir el caso completo en otra pestaña para no perder
 * lo que estabas haciendo. Aquí, un botón en cada tarjeta abre una versión
 * mínima del caso —leer, comentar, reaccionar, cambiar estado/responsable,
 * enterarse— y al cerrar sigues donde estabas.
 *
 * Reusa las MISMAS acciones de escritura de la página del caso; solo la lectura
 * es nueva (`cargarCasoRapido`). Tras cada cambio se vuelve a pedir el caso para
 * refrescarse solo (el `router.refresh` de los componentes normales no alcanza
 * a un modal que trae su propio estado). */

const EMOJIS = ["👀", "👍", "❤️", "🔥", "👏", "🤔"];

const fecha = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function VistaRapida({ pubId }: { pubId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const finRef = useRef<HTMLDivElement>(null);
  const montado = useRef(true);      // descarta setState tras desmontar
  const reqRef = useRef(0);          // descarta refetches tardíos (carrera)
  /* Se ENCIENDE al montar y se apaga al desmontar. Poner el `true` aquí (y no
     solo en la declaración) es clave con React StrictMode en desarrollo: monta,
     desmonta y vuelve a montar el componente; sin este `true` el ref quedaba en
     false tras el primer desmontaje simulado y toda carga se descartaba —el
     pop-up se quedaba en «Cargando…» para siempre—. */
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  const cargar = async () => {
    const id = ++reqRef.current;
    setCargando(true); setError("");
    const r: any = await cargarCasoRapido(pubId);
    // Si llegó tarde (hubo otra carga después) o el modal ya se cerró, se ignora.
    if (!montado.current || id !== reqRef.current) return;
    setCargando(false);
    if (r?.error) { setError(r.error); return; }
    setData(r);
  };

  const cerrar = () => { setAbierto(false); setData(null); setTexto(""); setError(""); setCargando(false); };

  useEffect(() => {
    if (!abierto) return;
    cargar();
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Tras cada acción: refrescar el pop-up Y la lista de fondo.
  const trasAccion = async () => { await cargar(); router.refresh(); };

  /* Runner único: un solo candado (`ocupado`) serializa TODAS las escrituras
     —comentar, reaccionar, estado, responsable, enterado— para que dos cambios
     rápidos no disparen refetches en carrera. try/catch por si una acción
     rechaza en vez de devolver {error}. */
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

  const caso = data?.caso;
  const perfiles: { id: string; nombre: string }[] = data?.perfiles || [];
  const userId: string = data?.userId || "";
  const esAv = caso ? esAviso(caso.tipo) : false;
  // Menciones @ en el comentario (misma ayuda que la caja del caso completo).
  const { enMencion, candidatos, aplicar } = menciones(texto, perfiles);
  const invocarMencion = (nombre: string) => setTexto(aplicar(nombre));

  const enviarComentario = () => {
    if (!texto.trim()) return;
    correr(() => comentar(pubId, texto.trim()), () => {
      setTexto("");
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    });
  };
  const reaccionar = (emoji: string) => correr(() => toggleReaccion(pubId, null, emoji, null));
  const marcarEnterado = () => correr(() => toggleEnterado(pubId));

  const rx: { emoji: string; usuario_id: string }[] = caso?.reacciones || [];
  const grupos = EMOJIS.map(e => ({
    emoji: e,
    n: rx.filter(r => r.emoji === e).length,
    mia: rx.some(r => r.emoji === e && r.usuario_id === userId),
  })).filter(g => g.n > 0);

  const vistos = new Set(rx.filter(r => r.emoji === "👀").map(r => r.usuario_id));
  if (esAv && caso?.autor_id) vistos.add(caso.autor_id);
  const esAutor = esAv && caso?.autor_id === userId;

  return (
    <>
      <button className="fila-encima vr-btn" title="Vista rápida (interactuar sin salir)"
        onClick={e => { e.stopPropagation(); e.preventDefault(); setAbierto(true); }}>
        ⚡
      </button>

      {/* Se dibuja con PORTAL en document.body: así el modal NO vive dentro de la
          tarjeta ni de la lista, y cuando esa lista se re-renderiza detrás (p. ej.
          un caso con sub-casos que recibe eventos en vivo) el pop-up no parpadea
          ni se mueve — queda fijo al viewport, independiente del reflujo.
          Cierra SOLO si el gesto empezó en el fondo mismo (arrastrar desde dentro
          y soltar fuera ya no lo cierra). */}
      {abierto && typeof document !== "undefined" && createPortal(
        <div className="modal-fondo"
          /* El portal renderiza en document.body, pero React propaga los eventos
             por el ÁRBOL DE COMPONENTES, no por el DOM: un clic dentro subía hasta
             la tarjeta que contiene <VistaRapida> y disparaba SU navegación (abría
             el caso). stopPropagation aquí corta esa fuga en el borde del modal. */
          onClick={e => e.stopPropagation()}
          onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) cerrar(); }}>
          <div className="modal-caja vr-caja" role="dialog" aria-modal="true"
            aria-label="Vista rápida del caso" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-cab">
              <b>⚡ Vista rápida</b>
              <span style={{ flex: 1 }} />
              <a href={`/caso/${pubId}`} target="_blank" rel="noopener noreferrer"
                className="vr-abrir" title="Abrir el caso completo en otra pestaña">Abrir completo ↗</a>
              <button className="modal-x" title="Cerrar (Esc)" onClick={cerrar}>✕</button>
            </div>

            {!caso ? (
              // Mientras no hay caso: cargando; solo si hubo un error real se muestra.
              <div className="modal-cargando">{error || "Cargando…"}</div>
            ) : (
              <div className="vr-cuerpo">
                {/* Encabezado del caso (el estado ya vive editable abajo, no se repite) */}
                {/* 1) Mini-cabecera: misma identidad de color por estado que el
                    caso completo (borde y tinte), con Estado / Responsable /
                    Fecha límite / Creado. */}
                <div className={`grid-meta est-${claseEstado(caso.estado, caso.tipo)}`}>
                  <div className="gm">
                    <span className="k">Estado</span>
                    <select value={caso.estado} disabled={ocupado}
                      onChange={e => { const v = e.target.value; correr(() => cambiarEstado(pubId, v)); }}>
                      {opcionesEstado(caso.tipo, caso.estado).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="gm">
                    <span className="k">Responsable</span>
                    <select value={caso.responsable || ""} disabled={ocupado}
                      onChange={e => { const v = e.target.value || null; correr(() => asignarResponsable(pubId, v)); }}>
                      {opcionesResp(perfiles, caso.responsable).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="gm">
                    <span className="k">Fecha límite</span>
                    <input type="date" disabled={ocupado}
                      value={caso.fecha_limite ? String(caso.fecha_limite).slice(0, 10) : ""}
                      onChange={e => { const v = e.target.value; correr(() => cambiarFechaLimite(pubId, v)); }} />
                  </div>
                  <div className="gm">
                    <span className="k">Creado</span>
                    <span className="v">
                      {fecha(caso.creado_en)}<br />
                      <span style={{ color: "var(--muted)", fontWeight: 400 }}>por {caso.autor?.nombre || "—"}</span>
                    </span>
                  </div>
                </div>

                {/* 2) Título del caso */}
                <div className="vr-head">
                  <span style={{ fontSize: 18 }}>{icoTipo(caso.tipo)}</span>
                  <b style={{ flex: 1, fontSize: TXT.titulo }}>{caso.titulo}</b>
                </div>

                {/* 3) Descripción del caso */}
                {caso.cuerpo && (
                  <div className="vr-body-txt">{caso.cuerpo}</div>
                )}
                <LinkPreviews texto={caso.cuerpo} />

                {/* 4) Chips de contexto (vinculaciones) */}
                {caso.vinculos?.length > 0 && (
                  <div className="vr-vinc">
                    {caso.vinculos.map((v: any) => (
                      <span key={`${v.tipo}:${v.id}`} className="echip"
                        style={v.color ? { borderColor: v.color, color: v.color } : undefined}>
                        {v.tipo === "etiqueta" ? "🏷️" : (ICO_ENT[v.tipo] || "🔗")} {v.nombre}
                      </span>
                    ))}
                  </div>
                )}

                {/* Aviso: enterarse */}
                {esAv && (
                  <div className="vr-aviso">
                    <span style={{ color: "var(--violet)", fontSize: TXT.micro }}>
                      👀 Enterados {vistos.size}/{data.equipoTotal || "—"}
                    </span>
                    {esAutor ? (
                      <span className="ae-mini ae-autor">✍ autor</span>
                    ) : (
                      <button className="ae-mini" disabled={ocupado} onClick={marcarEnterado}>
                        {vistos.has(userId) ? "✓ enterado" : "me enteré"}
                      </button>
                    )}
                  </div>
                )}

                {/* Reacciones */}
                <div className="vr-rx">
                  {grupos.map(g => (
                    <button key={g.emoji} className={`rx-chip ${g.mia ? "mia" : ""}`} disabled={ocupado}
                      onClick={() => reaccionar(g.emoji)}>{g.emoji} {g.n}</button>
                  ))}
                  <span className="vr-rx-pal">
                    {EMOJIS.map(e => (
                      <button key={e} className="vr-rx-add" disabled={ocupado} title="Reaccionar"
                        onClick={() => reaccionar(e)}>{e}</button>
                    ))}
                  </span>
                </div>

                {/* Comentarios */}
                <div className="vr-coms">
                  <div className="vr-coms-h">💬 Comentarios · {caso.comentarios.length}</div>
                  {caso.comentarios.length === 0 && (
                    <div style={{ color: "var(--dim)", fontSize: TXT.micro, padding: "4px 0" }}>Aún no hay comentarios.</div>
                  )}
                  {caso.comentarios.map((c: any) => (
                    <div key={c.id} className="vr-com">
                      <div className="vr-com-h">
                        <b style={{ fontSize: TXT.meta, color: c.autor?.color || "var(--text)" }}>
                          {c.autor?.nombre?.split(" ")[0] || "—"}
                        </b>
                        <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>{fecha(c.creado_en)}</span>
                      </div>
                      <div className="vr-com-txt">{c.cuerpo}</div>
                      <LinkPreviews texto={c.cuerpo} />
                    </div>
                  ))}
                  <div ref={finRef} />
                </div>

                {/* Escribir comentario (con @menciones, como en el caso completo) */}
                <div className="vr-escribir">
                  <div className="cbox" style={{ position: "relative", flex: 1 }}>
                    <MencionesMenu candidatos={candidatos} onElegir={invocarMencion} />
                    <textarea value={texto} onChange={e => setTexto(e.target.value)}
                      placeholder="Comentar al vuelo…  (@ para mencionar)" rows={2}
                      onKeyDown={e => {
                        // Enter con menú de mención abierto = elegir el primero.
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
