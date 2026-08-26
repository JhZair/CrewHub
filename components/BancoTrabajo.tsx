"use client";
import { misEnProgreso, comentar, cambiarEstado, muroMensajes } from "@/app/actions";
import { destinoPanel } from "@/lib/panel";
import { pedirZocalo } from "@/lib/zocalo";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import { celebrarResuelto } from "@/lib/celebra";
import { usePathname, useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { plazoDe } from "@/lib/plazo";
import { icoTipo } from "@/lib/tipos";
import { ICO_ENT, rutaEntidad } from "@/lib/secciones";
import MuroPanel from "@/components/MuroPanel";
import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useRef, useState } from "react";

/* Banco de trabajo: lo que tengo EN PROGRESO, siempre a mano.
   Vive en el layout, así que sobrevive a la navegación: puedes moverte
   por el sistema y seguir cargando avances sin perder el caso de vista.
   Se vacía solo — al resolver un caso, sale. */

type Ctx = { tipo: string; id: string; nombre: string };
type Caso = { id: string; tipo: string; titulo: string; fecha_limite: string | null; nComs: number; ctx: Ctx[]; pidio: string | null };

/* (Dos mapas copiados salieron de aquí: el de tipos a lib/tipos, y el de
   entidades a lib/secciones. El de entidades ya había divergido: aquí la
   convocatoria era 📋 y en todo el resto del sistema es 📜.) */

export default function BancoTrabajo() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [esTop, setEsTop] = useState(false);
  const [colapsado, setColapsado] = useState(true);
  const [casos, setCasos] = useState<Caso[]>([]);
  const [abiertas, setAbiertas] = useState<Caso[]>([]);
  const [segui, setSegui] = useState<Caso[]>([]);
  const [verPend, setVerPend] = useState(false);   // la bandeja de sin resolver
  const [verSeg, setVerSeg] = useState(false);     // los de seguimiento
  const [abierto, setAbierto] = useState<string | null>(null);
  const [txt, setTxt] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [guardado, setGuardado] = useState(false);   // acuse tras enviar
  const [muroNuevos, setMuroNuevos] = useState(0);   // señal: mensajes del muro sin ver
  const taRef = useRef<HTMLTextAreaElement>(null);
  /* Quién soy y qué casos tengo a la vista. Los usa el filtro del realtime de
     más abajo; van en refs y no en estado porque los lee un manejador de
     eventos, no el render. */
  const yoRef = useRef<string | null>(null);
  const misIdsRef = useRef<Set<string>>(new Set());
  const colapsadoRef = useRef(colapsado); colapsadoRef.current = colapsado;

  const enLogin = pathname.startsWith("/login");

  // Solo en la ventana principal (no en los paneles embebidos del Monitor)
  /* ── ESTAS DOS SÍ LAS PINTA EL MARCO DEL MONITOR ──
     `window.self === window.top` a secas, y NO `esVentanaDeTrabajo()`: esa
     función apaga el marco del Monitor a propósito —los ＋, la campanita y el
     buscador los pone cada panel—, pero el banco de trabajo y «quién está» no
     los pone nadie dentro de los paneles (son franjas de pantalla completa y
     duplicadas serían dos veces lo mismo). Al usar allí el mismo criterio
     desaparecieron de TODAS partes: en la aplicación de escritorio la ventana
     principal ES el Monitor.
     Regla: lo que se duplica, lo pone el panel; lo que ocupa toda la pantalla,
     el marco. */
  useEffect(() => { setEsTop(window.self === window.top); }, []);
  /* ── DESDE EL MONITOR, AL PANEL DE AL LADO ──
     Pinchar un caso aquí navegaba la ventana de arriba, o sea tiraba abajo la
     pantalla partida y dejaba el caso ocupándolo todo. El `target` manda el
     enlace al panel izquierdo —el que está pegado al banco— y los dos lados
     siguen en pie. Fuera del Monitor vale `undefined` y el enlace navega como
     siempre. Ver lib/panel.ts. */
  const [aPanel, setAPanel] = useState<string | undefined>(undefined);
  useEffect(() => { setAPanel(destinoPanel()); }, []);

  // Recuerda si lo dejaste abierto
  useEffect(() => {
    try { setColapsado(localStorage.getItem("banco") !== "abierto"); } catch {}
  }, []);
  const alternar = () => {
    const n = !colapsado;
    setColapsado(n);
    try { localStorage.setItem("banco", n ? "cerrado" : "abierto"); } catch {}
  };

  /* `pintar` separado de `cargar`: el mismo dato llega por dos caminos —al
     navegar viene dentro del zócalo compartido, y en vivo lo trae la acción
     suelta— y quién lo pinta tiene que ser uno solo. */
  const pintar = useCallback((r: any) => {
    if (!r?.error) { setCasos(r.casos || []); setAbiertas(r.abiertas || []); setSegui(r.seguimiento || []); }
  }, []);
  const cargar = useCallback(async () => { pintar(await misEnProgreso()); }, [pintar]);

  /* Señal del muro: cuántos mensajes NUEVOS (de otros, después de la última vez
     que abrí el banco) hay sin ver. Con el banco abierto se marcan todos vistos.
     El marcador vive en localStorage; es por-navegador, sin campanita. */
  const pintarMuro = useCallback((r: any) => {
    /* Quién soy, de paso. El muro ya lo devuelve para saber qué mensajes son
       míos, y el filtro del realtime de más abajo lo necesita para reconocer
       un caso que acaba de pasar a ser mío. Pedirlo aparte sería una consulta
       para un dato que ya está en la respuesta. */
    if (r?.yo) yoRef.current = r.yo;
    const msgs = r?.mensajes || [];
    if (!colapsadoRef.current) {   // banco abierto → todo visto
      try { localStorage.setItem("muro-visto", String(Date.now())); } catch {}
      setMuroNuevos(0);
      return;
    }
    let vistoMs = 0;
    try { vistoMs = Number(localStorage.getItem("muro-visto") || 0); } catch {}
    setMuroNuevos(msgs.filter((m: any) => m.autor_id !== r.yo && new Date(m.creado_en).getTime() > vistoMs).length);
  }, []);
  const cargarMuro = useCallback(async () => { pintarMuro(await muroMensajes()); }, [pintarMuro]);

  // Activar = ponerlo En Progreso: pasa de la bandeja a la mesa
  const activar = async (id: string) => {
    if (ocupado) return;
    setOcupado(true);
    const r: any = await cambiarEstado(id, "en_progreso");
    setOcupado(false);
    if (r?.error) { alert(r.error); return; }
    setAbierto(id); setVerPend(false);
    cargar(); router.refresh();
  };

  /* Al montar y cada vez que cambias de página (pudo cambiar algo).
     Los dos datos vienen del zócalo COMPARTIDO: eran dos acciones de servidor
     —de las cuatro que Next encolaba en cada navegación, 4772 ms medidos— y
     ahora viajan dentro de la misma llamada que el menú y la campanita.
     Ver lib/zocalo.ts. */
  useEffect(() => {
    if (!esTop || enLogin) return;
    let vivo = true;
    pedirZocalo(pathname).then(z => {
      if (!vivo) return;
      pintar(z.banco); pintarMuro(z.muro);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [esTop, enLogin, pathname, pintar, pintarMuro]);
  /* Al abrir/cerrar el banco: abrir marca el muro como visto (apaga la señal).
     ⚠ SOLO cuando `colapsado` CAMBIA de verdad, no al montar. Sin la guarda,
     este efecto disparaba `muroMensajes()` en el montaje —y otra vez si el
     banco venía abierto de localStorage—, o sea una o dos acciones de servidor
     encoladas DETRÁS del zócalo, pidiendo un dato que el zócalo ya trae. La
     primera pintura pagaba entera esa latencia por nada. */
  const primerColapso = useRef(true);
  useEffect(() => {
    if (primerColapso.current) { primerColapso.current = false; return; }
    if (esTop && !enLogin) cargarMuro();
  }, [colapsado, esTop, enLogin, cargarMuro]);

  /* ══════════════════════════════════════════════════════════════════════════
     EL MULTIPLICADOR DEL SISTEMA

     Esto escuchaba `publicaciones` y `comentarios` ENTERAS, sin filtro, sin
     retardo y sin mirar si el cambio tenía algo que ver contigo. Y el banco
     vive en el layout, o sea en toda pantalla de toda pestaña abierta.

     Cuentas: un comentario de cualquiera, en cualquier caso, hacía que TODAS
     las pestañas del equipo llamaran a `misEnProgreso()` — diez consultas cada
     una. Con siete personas y dos pestañas, **140 consultas por comentario**, y
     ninguna sobre el caso comentado. Nadie lo notaba en su pantalla; lo notaba
     la base, y se lo devolvía a todos como lentitud de fondo.

     ── SE FILTRA AQUÍ Y NO EN LA SUSCRIPCIÓN ──
     Lo obvio sería `filter: "responsable=eq.<yo>"`. Y sería un fallo: el filtro
     de Supabase mira la fila NUEVA, así que un caso que te QUITAN deja de
     casar y no te llega el evento — se quedaría en tu banco hasta que
     navegaras. Justo el caso que más importa que llegue.

     Se escucha todo y se decide en memoria, que es gratis: ya se sabe qué casos
     hay en el banco. Un comentario importa si es de uno de ellos; una
     publicación importa si YA está en el banco (te la quitaron, se resolvió) o
     si acaba de pasar a ser tuya. Las dos direcciones, sin consultar nada.

     Y con los mismos 600 ms de retardo que `Realtime.tsx`, para que una ráfaga
     —una importación, el bot escribiendo diez filas— sea una recarga y no diez.
     ══════════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    misIdsRef.current = new Set([...casos, ...abiertas, ...segui].map(c => c.id));
  }, [casos, abiertas, segui]);

  useEffect(() => {
    if (!esTop || enLogin) return;
    const supabase = createClient();
    let vivo = true;
    /* UN temporizador por cada cosa que se recarga, no uno compartido. Con uno
       solo, un mensaje del muro llegado dentro de la misma ventana de 600 ms
       cancelaba la recarga del banco —y al revés—: el retardo que existe para
       agrupar ráfagas se habría comido eventos de otra clase. */
    const temps: Record<string, ReturnType<typeof setTimeout> | null> = {};
    const recargarPronto = (k: string, fn: () => void) => {
      if (temps[k]) clearTimeout(temps[k]!);
      temps[k] = setTimeout(() => { if (vivo) fn(); }, 600);
    };
    /* ¿Este cambio puede mover MI banco? Sin la fila no se puede saber, y ante
       la duda se recarga: perder un caso de vista es peor que una consulta. */
    const meToca = (tabla: string, payload: any) => {
      const fila = payload?.new && Object.keys(payload.new).length ? payload.new : payload?.old;
      if (!fila) return true;
      if (tabla === "comentarios") {
        return !!fila.publicacion_id && misIdsRef.current.has(fila.publicacion_id);
      }
      return misIdsRef.current.has(fila.id)
        || (!!yoRef.current && fila.responsable === yoRef.current);
    };
    const canal = supabase.channel(`banco-${Math.random().toString(36).slice(2)}`);
    ["publicaciones", "comentarios"].forEach(t =>
      canal.on("postgres_changes", { event: "*", schema: "public", table: t },
        (payload: any) => { if (vivo && meToca(t, payload)) recargarPronto("banco", cargar); }));
    canal.on("postgres_changes", { event: "*", schema: "public", table: "muro_mensajes" },
      () => { if (vivo) recargarPronto("muro", cargarMuro); });
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!vivo) return;
      if (session) supabase.realtime.setAuth(session.access_token);
      canal.subscribe();
    })();
    return () => {
      vivo = false;
      // ningún retardo en vuelo sobrevive al desmontaje
      Object.values(temps).forEach(t => { if (t) clearTimeout(t); });
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esTop, enLogin]);

  // Auto-crecer el cuadro de comentario
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [txt, abierto]);

  const subir = async (files: File[]) => {
    if (!files.length || ocupado) return;
    setOcupado(true);
    for (const f of files.slice(0, 4 - imgs.length)) {
      const r = await subirImagen(f);
      if (r.error) break;
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
    setOcupado(false);
  };

  const enviar = async (id: string) => {
    if ((!txt.trim() && !imgs.length) || ocupado) return;
    setOcupado(true);
    const res: any = await comentar(id, txt.trim() || "📷", imgs);
    setOcupado(false);
    if (res?.error) { alert(res.error); return; }
    setTxt(""); setImgs([]);
    // Acuse: el contador 💬 sube y además lo decimos, para no escribir a ciegas
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2200);
    cargar(); router.refresh();
  };

  const resolver = async (id: string) => {
    if (ocupado) return;
    setOcupado(true);
    const r: any = await cambiarEstado(id, "resuelta");
    setOcupado(false);
    if (r?.error) { alert(r.error); return; }
    celebrarResuelto();
    setAbierto(null);
    cargar(); router.refresh();
  };

  if (!esTop || enLogin) return null;

  // Colapsado: una pestaña discreta con el contador
  if (colapsado) {
    return (
      <button className="banco-tab" onClick={alternar}
        title={`${casos.length} en progreso · ${abiertas.length} sin resolver${muroNuevos ? ` · ${muroNuevos} nuevo(s) en el muro` : ""} — tu banco de trabajo`}>
        🛠 {casos.length > 0 && <b>{casos.length}</b>}
        {abiertas.length > 0 && <span style={{ fontSize: 9, color: "var(--dim)" }}>+{abiertas.length}</span>}
        {/* Señal sutil del muro: algo nuevo que mirar */}
        {muroNuevos > 0 && <span className="banco-muro-dot">🧱{muroNuevos}</span>}
      </button>
    );
  }

  return (
    <div className="banco">
      <div className="banco-h">
        <b style={{ fontSize: 12.5 }}>🛠 Banco de trabajo</b>
        <span style={{ flex: 1 }} />
        <button onClick={alternar} title="Colapsar" style={{ color: "var(--dim)", fontSize: 14 }}>‹</button>
      </div>

      <div className="banco-body">
        {/* Muro de oficina (mensajes efímeros): un solo panel lateral, arriba. */}
        <MuroPanel />

        {/* Bandeja: lo que espera turno. Se activa de un clic y baja a la mesa. */}
        {abiertas.length > 0 && (
          <div style={{ marginBottom: 6, paddingBottom: 4, borderLeft: "3px solid var(--red)", paddingLeft: 5, borderRadius: "5px 0 0 5px", background: "rgba(255,90,90,.05)" }}>
            <button onClick={() => setVerPend(!verPend)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "6px 9px", borderRadius: 8, color: "var(--red)", fontSize: 11, fontWeight: 600, background: verPend ? "#1c1c2c" : "transparent" }}>
              <span>{verPend ? "▾" : "▸"}</span>
              <span style={{ flex: 1, textAlign: "left" }}>📥 Sin resolver · {abiertas.length}</span>
            </button>
            {verPend && abiertas.map(c => (
              <div key={c.id} className="banco-item" style={{ paddingLeft: 14 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 11 }}>{icoTipo(c.tipo)}</span>
                  <span style={{ flex: 1 }}>
                    <Link target={aPanel} href={`/caso/${c.id}`} style={{ fontSize: 11.5, lineHeight: 1.3, color: "var(--muted)" }}>
                      {c.titulo}
                    </Link>
                    {/* Contexto en una línea: sin esto la bandeja son títulos
                        sueltos y hay que abrir cada uno para saber de qué va */}
                    {(c.pidio || c.ctx.length > 0) && (
                      <span style={{ color: "var(--dim)", fontSize: 10, display: "block", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[c.pidio && `✍ ${c.pidio}`, ...c.ctx.map(v => `${ICO_ENT[v.tipo] || "🔗"} ${v.nombre}`)]
                          .filter(Boolean).join("  ")}
                      </span>
                    )}
                  </span>
                  <button onClick={() => activar(c.id)} disabled={ocupado}
                    title="Ponerlo En Progreso y trabajarlo aquí"
                    style={{ color: "var(--accent)", fontSize: 13, flex: "none" }}>▶</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* En progreso — la mesa, en amarillo (identidad del estado) */}
        <div style={{ borderLeft: "3px solid var(--yellow)", paddingLeft: 5, borderRadius: "5px 0 0 5px", background: "rgba(244,180,0,.04)", marginBottom: 6 }}>
          <div style={{ padding: "6px 9px 3px", color: "var(--yellow)", fontSize: 11, fontWeight: 600 }}>🛠 En progreso · {casos.length}</div>
        {!casos.length && (
          <div style={{ color: "var(--dim)", fontSize: 11.5, padding: "8px 10px 12px", textAlign: "center", lineHeight: 1.5 }}>
            {abiertas.length
              ? <>Nada en la mesa.<br />Activa uno con <b style={{ color: "var(--accent)" }}>▶</b> desde la bandeja.</>
              : <>Nada en progreso.<br />Pon un caso <b>En Progreso</b> y aparecerá aquí, listo para trabajar.</>}
          </div>
        )}

        {casos.map(c => {
          const pl = plazoDe(c.fecha_limite);
          const activo = abierto === c.id;
          return (
            <div key={c.id} className={`banco-item${activo ? " on" : ""}`}>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}
                onClick={() => { setAbierto(activo ? null : c.id); setTxt(""); setImgs([]); }}>
                <span style={{ fontSize: 12 }}>{icoTipo(c.tipo)}</span>
                <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.4, color: "var(--text)" }}>{c.titulo}</span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  {pl && (
                    <span style={{ fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", color: pl.color }}>
                      {pl.vencido ? `${-pl.d}d ⚠` : pl.d === 0 ? "hoy" : `${pl.d}d`}
                    </span>
                  )}
                  {/* El contador es el acuse: si sube, tu avance quedó */}
                  <span style={{ fontSize: 10, color: c.nComs ? "var(--muted)" : "var(--dim)", whiteSpace: "nowrap" }}
                    title={`${c.nComs} comentario(s)`}>💬 {c.nComs}</span>
                </span>
              </div>

              {/* De qué va: sin esto, "Girar RHE" no dice de quién ni para qué */}
              {(c.ctx.length > 0 || c.pidio) && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, paddingLeft: 18 }}>
                  {c.pidio && (
                    <span title={`Lo pidió ${c.pidio}`}
                      style={{ fontSize: 9.5, color: "var(--muted)", background: "#1c1c2c", borderRadius: 5, padding: "1px 5px", whiteSpace: "nowrap" }}>
                      ✍ {c.pidio}
                    </span>
                  )}
                  {c.ctx.map((v, i) => (
                    <Link key={i} title={`${v.tipo}: ${v.nombre}`}
                      /* La etiqueta llevaba a `/?e=…`, un filtro que la portada
                         NUNCA leyó —ni antes ni ahora—: el chip parecía un
                         enlace y dejaba en la pantalla de inicio sin filtrar
                         nada. El eje real de etiquetas es el tablero. */
                      target={aPanel}
                      href={v.tipo === "etiqueta" ? `/tablero?p=todos&etq=${v.id}` : (rutaEntidad(v.tipo, v.id) || `/entidad/${v.tipo}/${v.id}`)}
                      style={{
                        fontSize: 10, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap",
                        maxWidth: 152, overflow: "hidden", textOverflow: "ellipsis",
                        // La etiqueta matiza: va en violeta, como en el resto del app
                        color: v.tipo === "etiqueta" ? "var(--violet)" : "var(--dim)",
                        background: v.tipo === "etiqueta" ? "rgba(167,139,250,.10)" : "#1c1c2c",
                      }}>
                      {ICO_ENT[v.tipo] || "🔗"} {v.nombre}
                    </Link>
                  ))}
                </div>
              )}

              {activo && (
                <div style={{ marginTop: 7 }}>
                  {imgs.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
                      {imgs.map((u, i) => (
                        <img key={i} src={u} alt="" style={{ height: 34, borderRadius: 5, border: "1px solid var(--border)" }} />
                      ))}
                    </div>
                  )}
                  <textarea ref={taRef} value={txt} rows={1} autoFocus
                    placeholder="Avance… (Enter envía · pega una imagen)"
                    onChange={e => setTxt(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(c.id); } }}
                    onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); subir(f); } }}
                    style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px", fontSize: 11.5, color: "var(--text)", outline: "none", resize: "none", lineHeight: 1.4, maxHeight: 120 }} />
                  <div style={{ display: "flex", gap: 5, marginTop: 5, alignItems: "center" }}>
                    <button className="btn" style={{ padding: "3px 9px", fontSize: 10.5 }}
                      disabled={(!txt.trim() && !imgs.length) || ocupado} onClick={() => enviar(c.id)}>➤</button>
                    <label className="btn btn-ghost" title="Adjuntar" style={{ padding: "3px 7px", fontSize: 10.5, cursor: "pointer" }}>
                      📷
                      <input type="file" accept="image/*" multiple style={{ display: "none" }}
                        onChange={e => { subir(Array.from(e.target.files || [])); e.target.value = ""; }} />
                    </label>
                    {guardado && (
                      <span style={{ color: "var(--green)", fontSize: 10.5, fontWeight: 700 }}>✓ guardado</span>
                    )}
                    <span style={{ flex: 1 }} />
                    <button className="btn btn-ghost" title="Marcar como resuelta"
                      style={{ padding: "3px 8px", fontSize: 10.5, color: "var(--green)" }}
                      disabled={ocupado} onClick={() => resolver(c.id)}>✓ resolver</button>
                  </div>
                  <Link target={aPanel} href={`/caso/${c.id}`}
                    style={{ display: "block", marginTop: 6, color: "var(--dim)", fontSize: 10.5, textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                    abrir el caso →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
        </div>

        {/* Seguimiento: casos largos que no se cierran hoy, pero que no hay
            que perder de vista. Abajo y plegados: vigilar no es trabajar. */}
        {segui.length > 0 && (
          <div style={{ marginTop: 4, paddingBottom: 4, borderLeft: "3px solid var(--teal)", paddingLeft: 5, borderRadius: "5px 0 0 5px", background: "rgba(45,212,191,.05)" }}>
            <button onClick={() => setVerSeg(!verSeg)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "6px 9px", borderRadius: 8, color: "var(--teal)", fontSize: 11, fontWeight: 600, background: verSeg ? "#1c1c2c" : "transparent" }}>
              <span>{verSeg ? "▾" : "▸"}</span>
              <span style={{ flex: 1, textAlign: "left" }}>🔭 En seguimiento · {segui.length}</span>
            </button>
            {verSeg && segui.map(c => {
              const pl = plazoDe(c.fecha_limite);
              return (
                <div key={c.id} className="banco-item" style={{ paddingLeft: 14 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11 }}>{icoTipo(c.tipo)}</span>
                    <span style={{ flex: 1 }}>
                      <Link target={aPanel} href={`/caso/${c.id}`} style={{ fontSize: 12, lineHeight: 1.35, color: "var(--muted)" }}>
                        {c.titulo}
                      </Link>
                      {c.ctx.length > 0 && (
                        <span style={{ display: "block", color: "var(--dim)", fontSize: 9.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.ctx.map(v => `${ICO_ENT[v.tipo] || "🔗"} ${v.nombre}`).join("  ")}
                        </span>
                      )}
                    </span>
                    {pl && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, whiteSpace: "nowrap", color: pl.color }}>
                        {pl.vencido ? `${-pl.d}d ⚠` : pl.d === 0 ? "hoy" : `${pl.d}d`}
                      </span>
                    )}
                    <button onClick={() => activar(c.id)} disabled={ocupado}
                      title="Traerlo a la mesa: ponerlo En Progreso"
                      style={{ color: "var(--accent)", fontSize: 13, flex: "none" }}>▶</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
