"use client";
import { misEnProgreso, comentar, cambiarEstado, muroMensajes } from "@/app/actions";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import { celebrarResuelto } from "@/lib/celebra";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
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
  const colapsadoRef = useRef(colapsado); colapsadoRef.current = colapsado;

  const enLogin = pathname.startsWith("/login");

  // Solo en la ventana principal (no en los paneles embebidos del Monitor)
  useEffect(() => { setEsTop(window.self === window.top); }, []);

  // Recuerda si lo dejaste abierto
  useEffect(() => {
    try { setColapsado(localStorage.getItem("banco") !== "abierto"); } catch {}
  }, []);
  const alternar = () => {
    const n = !colapsado;
    setColapsado(n);
    try { localStorage.setItem("banco", n ? "cerrado" : "abierto"); } catch {}
  };

  const cargar = useCallback(async () => {
    const r: any = await misEnProgreso();
    if (!r?.error) { setCasos(r.casos || []); setAbiertas(r.abiertas || []); setSegui(r.seguimiento || []); }
  }, []);

  /* Señal del muro: cuántos mensajes NUEVOS (de otros, después de la última vez
     que abrí el banco) hay sin ver. Con el banco abierto se marcan todos vistos.
     El marcador vive en localStorage; es por-navegador, sin campanita. */
  const cargarMuro = useCallback(async () => {
    const r: any = await muroMensajes();
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

  // Al montar y cada vez que cambias de página (pudo cambiar algo)
  useEffect(() => { if (esTop && !enLogin) { cargar(); cargarMuro(); } }, [esTop, enLogin, pathname, cargar, cargarMuro]);
  // Al abrir/cerrar el banco: abrir marca el muro como visto (apaga la señal).
  useEffect(() => { if (esTop && !enLogin) cargarMuro(); }, [colapsado, esTop, enLogin, cargarMuro]);

  // En vivo: si cambia una publicación (estado, responsable, nuevo caso) o llega
  // un comentario, recarga el banco; si llega un mensaje al muro, actualiza la
  // señal. Canal único por montaje.
  useEffect(() => {
    if (!esTop || enLogin) return;
    const supabase = createClient();
    let vivo = true;
    const canal = supabase.channel(`banco-${Math.random().toString(36).slice(2)}`);
    ["publicaciones", "comentarios"].forEach(t =>
      canal.on("postgres_changes", { event: "*", schema: "public", table: t }, () => { if (vivo) cargar(); }));
    canal.on("postgres_changes", { event: "*", schema: "public", table: "muro_mensajes" }, () => { if (vivo) cargarMuro(); });
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!vivo) return;
      if (session) supabase.realtime.setAuth(session.access_token);
      canal.subscribe();
    })();
    return () => { vivo = false; supabase.removeChannel(canal); };
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
                    <Link href={`/caso/${c.id}`} style={{ fontSize: 11.5, lineHeight: 1.3, color: "var(--muted)" }}>
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
                      href={v.tipo === "etiqueta" ? `/?e=${v.id}` : (rutaEntidad(v.tipo, v.id) || `/entidad/${v.tipo}/${v.id}`)}
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
                  <Link href={`/caso/${c.id}`}
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
                      <Link href={`/caso/${c.id}`} style={{ fontSize: 12, lineHeight: 1.35, color: "var(--muted)" }}>
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
