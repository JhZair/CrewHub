"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  cargarCasoRapido, toggleReaccion, toggleEnterado,
  cambiarEstado, asignarResponsable, cambiarFechaLimite, cambiarFechaInicio, cambiarHora,
} from "@/app/actions";
import { opcionesEstado, llevaEnterado, claseEstado } from "@/lib/estados";
import { icoTipo, llevaHora } from "@/lib/tipos";
import { TXT } from "@/lib/texto";
import { ICO_ENT } from "@/lib/secciones";
import { opcionesResp } from "@/lib/personas";
import LinkPreviews from "@/components/LinkPreviews";
import TextoRico from "@/components/TextoRico";
import ComentarioTexto from "@/components/ComentarioTexto";
import RespuestaBox from "@/components/RespuestaBox";
import Reacciones from "@/components/Reacciones";
import { CommentBox } from "@/components/CaseActions";
import PaletaRx from "@/components/PaletaRx";
import { agrupar } from "@/lib/reacciones";

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

/* La paleta y el agrupado son los mismos de todo el sistema (lib/reacciones):
 * aquí había una lista corta propia, y lo que no estaba en ella no se veía. */

const fecha = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function VistaRapida({ pubId }: { pubId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
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

  const cerrar = () => { setAbierto(false); setData(null); setError(""); setCargando(false); };

  useEffect(() => {
    if (!abierto) return;
    cargar();
    /* ── ESC NO TIRA UN BORRADOR ──
       Si el foco está en un campo con algo escrito, Esc es «cancelar lo que
       estoy haciendo», no «cerrar el pop-up»: cerrarlo perdería el comentario
       a medias sin preguntar. Vacío, cierra como siempre. */
    const onEsc = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const campo = t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT");
      if (campo && (t as HTMLInputElement).value) return;
      if (e.key === "Escape") cerrar();
    };
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
  /* Cada comentario con `responde_a` buscaba a su padre recorriendo la lista
     entera, en cada render. Un mapa, una vez. */
  const comPorId = useMemo(
    () => new Map<string, any>(((caso?.comentarios || []) as any[]).map((c: any) => [c.id, c])),
    [caso]);
  const perfiles: { id: string; nombre: string }[] = data?.perfiles || [];
  const userId: string = data?.userId || "";
  const esAv = caso ? llevaEnterado(caso.tipo) : false;
  const reaccionar = (emoji: string) => correr(() => toggleReaccion(pubId, null, emoji, null));
  const marcarEnterado = () => correr(() => toggleEnterado(pubId));

  const rx: { emoji: string; usuario_id: string }[] = caso?.reacciones || [];
  const grupos = agrupar(rx, userId);

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
              {/* «del caso»: este pop-up también existe para un objeto del
                  repositorio y para una fila de la rendición, y los tres decían
                  «Vista rápida» a secas. */}
              <b>⚡ Vista rápida del caso</b>
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
                {/* ── LAS CELDAS QUE HAYA, EN UNA SOLA FILA ──
                    La rejilla base es de CUATRO columnas y aquí hay cinco
                    —Estado, Responsable, Empieza, Fecha límite, Creado— o seis
                    con la hora de una reunión. «Creado» se caía sola a un
                    segundo renglón, con su raya izquierda puesta, y parecía un
                    bloque aparte. Es el mismo remiendo que ya llevaba la ficha
                    del caso (`grid-meta-5`), ahora también para seis. */}
                <div className={`grid-meta grid-meta-${llevaHora(caso.tipo) ? 6 : 5} est-${claseEstado(caso.estado, caso.tipo)}`}>
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
                  {/* ── LA VENTANA SE EDITA AQUÍ ──
                      Este pop-up sale de la agenda, del tablero y del feed, o
                      sea desde donde se está MIRANDO el calendario: es el
                      sitio natural para decir «esto empieza el 3». A un caso
                      que ya existe no se le puede poner el inicio desde el
                      compositor —ese ya se cerró—, así que si no estuviera
                      aquí solo se podría abriendo la ficha entera.
                      A diferencia de la ficha, el campo se ve SIEMPRE aunque
                      esté vacío: aquí es donde se viene a ponerlo. */}
                  <div className="gm">
                    <span className="k">Empieza</span>
                    <input type="date" disabled={ocupado}
                      title="Cuándo empieza. Vacío si el caso no dura."
                      value={caso.fecha_inicio ? String(caso.fecha_inicio).slice(0, 10) : ""}
                      max={caso.fecha_limite ? String(caso.fecha_limite).slice(0, 10) : undefined}
                      onChange={e => { const v = e.target.value; correr(() => cambiarFechaInicio(pubId, v)); }} />
                  </div>
                  {/* En una reunión la fecha es cuándo OCURRE, no un plazo:
                      el rótulo lo dice, igual que en la ficha. Y la hora se
                      edita aquí porque este pop-up sale de la agenda — el
                      sitio desde donde se está mirando el calendario. */}
                  {llevaHora(caso.tipo) && (
                    <div className="gm">
                      <span className="k">Hora</span>
                      <input type="time" disabled={ocupado}
                        defaultValue={String(caso.hora || "").slice(0, 5)}
                        onBlur={e => { const v = e.target.value; correr(() => cambiarHora(pubId, v)); }} />
                    </div>
                  )}
                  <div className="gm">
                    <span className="k">{llevaHora(caso.tipo) ? "Cuándo es" : "Fecha límite"}</span>
                    <input type="date" disabled={ocupado}
                      value={caso.fecha_limite ? String(caso.fecha_limite).slice(0, 10) : ""}
                      min={caso.fecha_inicio ? String(caso.fecha_inicio).slice(0, 10) : undefined}
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

                {/* 3) Descripción del caso.
                    ── EL MISMO TEXTO QUE EN LA FICHA ──
                    Se pintaba a pelo, como texto plano: una url quedaba
                    escrita pero muerta —«este link no funciona», y funcionaba
                    en la ficha— y una @mención era texto gris. `TextoRico` es
                    lo que usan el caso, el muro y los comentarios: enlaces,
                    menciones y las marcas de siempre. */}
                {caso.cuerpo && (
                  <div className="vr-body-txt"><TextoRico texto={caso.cuerpo} /></div>
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
                    <button key={g.emoji} type="button" className={`rx-chip ${g.mia ? "mia" : ""}`}
                      disabled={ocupado} title={g.mia ? "Quitar mi reacción" : "Reaccionar igual"}
                      onClick={() => reaccionar(g.emoji)}>{g.emoji} {g.n}</button>
                  ))}
                  {/* ── EN FLUJO, NO FLOTANDO ──
                      Antes flotaba porque este bloque quedaba FUERA de la caja
                      con scroll. Ahora el scroll es de todo el cuerpo del
                      pop-up, así que una paleta absoluta la recortaría el borde
                      del scrollport — el mismo motivo por el que ya va en flujo
                      dentro de VistaHilo. */}
                  <PaletaRx hayReacciones={grupos.length > 0} ocupado={ocupado}
                    onElegir={reaccionar} flotante={false} />
                </div>

                {/* Comentarios */}
                <div className="vr-coms">
                  <div className="vr-coms-h">💬 Comentarios · {caso.comentarios.length}</div>
                  {caso.comentarios.length === 0 && (
                    <div style={{ color: "var(--dim)", fontSize: TXT.micro, padding: "4px 0" }}>Aún no hay comentarios.</div>
                  )}
                  {/* ── EL MISMO HILO QUE LA FICHA, PIEZA POR PIEZA ──
                      Aquí se pintaba a mano: el texto y nada más. Ni editar el
                      propio comentario, ni reaccionar a uno, ni responder, ni
                      pegar una imagen — cosas que sí están en /caso, así que el
                      pop-up obligaba a abrir el caso justo cuando se quería
                      contestar, que es lo único que viene a evitar.
                      Ahora monta LOS MISMOS componentes que la ficha
                      (`ComentarioTexto`, `Reacciones`, `RespuestaBox`), no una
                      versión parecida: lo que se arregle en uno vale para los
                      dos. `onListo` recarga el hilo del pop-up — `router.refresh`
                      solo repinta la página de detrás. */}
                  {caso.comentarios.map((c: any) => {
                    const padre = c.responde_a ? comPorId.get(c.responde_a) : null;
                    return (
                      <div key={c.id} className="vr-com">
                        <div className="vr-com-h">
                          <b style={{ fontSize: TXT.meta, color: c.autor?.color || "var(--text)" }}>
                            {c.autor?.nombre?.split(" ")[0] || "—"}
                          </b>
                          <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>{fecha(c.creado_en)}</span>
                        </div>
                        {/* A quién contesta, citado: sin esto un hilo de cinco
                            respuestas se lee como cinco monólogos. */}
                        {padre && (() => {
                          const cita = String(padre.cuerpo || "").replace(/\s+/g, " ").trim();
                          return (
                            <div className="tl-resp-cita" style={{ cursor: "default" }}>
                              <span className="tl-resp-cab">↳ en respuesta a <b>{padre.autor?.nombre?.split(" ")[0] || "un comentario"}</b></span>
                              {cita && <span className="tl-resp-txt">{cita.length > 90 ? cita.slice(0, 90) + "…" : cita}</span>}
                            </div>
                          );
                        })()}
                        <ComentarioTexto comentarioId={c.id} pubId={pubId} cuerpo={c.cuerpo || ""}
                          imagenes={c.imagenes || []} esMio={c.autor_id === userId}
                          editadoEn={c.editado_en} onListo={cargar} />
                        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          {/* La paleta EN FLUJO: esto vive dentro del cuerpo con
                              scroll del pop-up y flotando la recortaría el borde. */}
                          <Reacciones pubId={pubId} comentarioId={c.id}
                            reacciones={c.reacciones || []} userId={userId}
                            flotante={false} onListo={cargar} />
                          <RespuestaBox pubId={pubId} comentarioId={c.id} onListo={cargar} />
                        </div>
                      </div>
                    );
                  })}
                  <div ref={finRef} />
                </div>
              </div>
            )}
            {/* Escribir comentario (con @menciones, como en el caso completo).
                    ── FUERA DEL SCROLL ──
                    Vive detrás del cuerpo y no dentro: comentar al vuelo ES lo
                    que hace este pop-up, y con el hilo largo había que bajar
                    hasta el final para encontrar dónde escribir. Ahora el
                    contenido se desplaza y la caja se queda. */}
            {caso && (
              /* La MISMA caja del caso (`CommentBox`): pegar con Ctrl+V,
                 adjuntar, barra de formato y @menciones. La de antes era un
                 textarea con menciones y ya está — el mismo gesto daba un
                 resultado distinto según por dónde entraras. */
              <div className="vr-escribir">
                <CommentBox pubId={pubId} userId={userId} perfiles={perfiles}
                  /* Primero llega el comentario y DESPUÉS se baja: con un
                     `setTimeout` fijo se bajaba antes de que existiera, el
                     contenido crecía por debajo y lo recién escrito quedaba
                     fuera de la pantalla — justo lo que se quería evitar. */
                  onListo={async () => {
                    await cargar();
                    requestAnimationFrame(() =>
                      finRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
                  }}
                  placeholder="Comentar al vuelo… (Enter envía · @nombre para invocar · Ctrl+V pega una imagen)" />
              </div>
            )}
            {/* El error, con la caja: es de lo que se acaba de intentar
                escribir, no del contenido de arriba. */}
            {caso && error && <div className="err-inline" style={{ marginTop: 6 }}>⚠ {error}</div>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
