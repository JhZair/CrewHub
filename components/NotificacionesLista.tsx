"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { notificacionesTodas, marcarNotifLeida, marcarNotifsLeidas, actividadDeCaso } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { rutaNotif, esAutomatica, bucketFecha, CHIPS, CHIPS_BOT, ICONO, ETIQ, hace, tituloDe } from "@/lib/notificaciones";
import { ICO_ENT } from "@/lib/secciones";
import { rotuloEstado } from "@/lib/estados";
import { plazoDe } from "@/lib/plazo";
import NotifFila from "./NotifFila";

const fechaCorta = (iso: string) => new Date(iso).toLocaleString("es-PE",
  { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

/* HISTORIAL DE NOTIFICACIONES — dos columnas (maestro/detalle):
   IZQUIERDA: pestañas (👤 Para ti / 🤖 Del Bot) + chips (Todas · No leídas ·
     Menciones · …), lista agrupada por bloque de fecha (Hoy, Ayer, …).
   DERECHA: al seleccionar una, su detalle: mensaje completo, vínculos, la
     bitácora reciente del caso y el botón para abrirlo.
   Cada (pestaña, chip) es su propio flujo paginado ("ver más"). En vivo por su
   propio canal (la lista guarda estado propio; un refresh no la tocaría). */

type Tab = "mias" | "bot";
const filtroDe = (t: Tab) => (t === "bot" ? "bot" : "personal") as "bot" | "personal";
const corto = (s?: string) => (s || "").trim().split(/\s+/)[0] || "";

// Un evento de bitácora, en una línea legible.
function descEvento(e: any, tipoCaso?: string): string {
  const quien = corto(e.actor?.nombre);
  const d = e.detalle || {};
  if (e.tipo === "bot") return `🤖 ${d.mensaje || "evento automático"}`;
  if (e.tipo === "comentario") return `${quien || "Alguien"} comentó`;
  if (e.tipo === "estado") {
    const campo = d.campo || "estado";
    if (campo === "responsable") return `${quien} cambió el responsable`;
    if (campo === "prioridad") return `${quien} cambió la prioridad: ${d.de || "—"} → ${d.a || "—"}`;
    const de = d.de ? rotuloEstado(d.de, tipoCaso) : "—";
    const a = d.a ? rotuloEstado(d.a, tipoCaso) : "—";
    return `${quien} cambió el estado: ${de} → ${a}`;
  }
  return `${quien ? quien + " " : ""}${d.mensaje || e.tipo}`;
}

export default function NotificacionesLista({
  inicial, hayMas: hayMasIni, totalBot = 0, sinLeer = 0, sinLeerBot = 0, tabIni = "mias",
}: { inicial: any[]; hayMas: boolean; total: number; totalBot?: number; sinLeer?: number; sinLeerBot?: number; tabIni?: Tab }) {
  const [pestana, setPestana] = useState<Tab>(tabIni);
  const [chip, setChip] = useState("todas");
  const [items, setItems] = useState<any[]>(inicial);
  const [hayMas, setHayMas] = useState(hayMasIni);
  const [cargando, setCargando] = useState(false);
  const [sinLeerP, setSinLeerP] = useState(sinLeer);
  const [sinLeerB, setSinLeerB] = useState(sinLeerBot);
  // Selección + su detalle (caso + bitácora).
  const [sel, setSel] = useState<any>(null);
  const [detalle, setDetalle] = useState<any>(null);   // { caso, eventos, nComentarios, reacciones }
  const [detCargando, setDetCargando] = useState(false);

  const pestanaRef = useRef(pestana); pestanaRef.current = pestana;
  const chipRef = useRef(chip); chipRef.current = chip;
  const pedidoRef = useRef(0);   // token anti-carrera para el detalle

  // Bajo "No leídas", lo ya leído no debe seguir a la vista.
  const bajoChip = (list: any[]) => chipRef.current === "no_leidas" ? list.filter(x => !x.leida) : list;
  // Al Bot casi nunca le aplican menciones/comentarios/asignaciones.
  const chipsVisibles = pestana === "bot" ? CHIPS.filter(c => CHIPS_BOT.includes(c.clave)) : CHIPS;

  const traer = async (offset: number) =>
    notificacionesTodas(offset, filtroDe(pestanaRef.current), chipRef.current) as any;

  // Recargar desde cero (cambió pestaña o chip).
  const recargarReset = async () => {
    setCargando(true);
    const r = await traer(0);
    setItems(r.items || []); setHayMas(r.hayMas);
    setSinLeerP(r.sinLeer || 0); setSinLeerB(r.sinLeerBot || 0);
    setCargando(false);
  };

  // Al cambiar pestaña/chip, recargar. Se salta el primer render (ya viene del server).
  const primero = useRef(true);
  useEffect(() => {
    if (primero.current) { primero.current = false; return; }
    recargarReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pestana, chip]);

  // En vivo: canal propio (nombre único por montaje) → recarga la primera página
  // del combo actual, antepone lo nuevo y sincroniza contadores/leídas.
  useEffect(() => {
    const supabase = createClient();
    let vivo = true;
    const recargar = async () => {
      const r = await traer(0);
      if (!vivo) return;
      setSinLeerP(r.sinLeer || 0); setSinLeerB(r.sinLeerBot || 0);
      setItems(prev => {
        const ids = new Set(prev.map((n: any) => n.id));
        const nuevos = (r.items || []).filter((n: any) => !ids.has(n.id));
        const estados = new Map((r.items || []).map((n: any) => [n.id, n.leida]));
        const refrescadas = prev.map((n: any) => estados.has(n.id) ? { ...n, leida: estados.get(n.id) } : n);
        return bajoChip([...nuevos, ...refrescadas]);   // purga leídas bajo "No leídas"
      });
    };
    const canal = supabase.channel(`notif-pagina-${Math.random().toString(36).slice(2)}`);
    canal.on("postgres_changes", { event: "*", schema: "public", table: "notificaciones" }, () => recargar());
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!vivo) return;
      if (session) supabase.realtime.setAuth(session.access_token);
      canal.subscribe();
    })();
    return () => { vivo = false; supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verMas = async () => {
    if (cargando) return;
    setCargando(true);
    const r = await traer(items.length);
    setItems(prev => {
      const ids = new Set(prev.map((n: any) => n.id));
      return [...prev, ...(r.items || []).filter((n: any) => !ids.has(n.id))];
    });
    setHayMas(r.hayMas); setCargando(false);
  };

  const marcarLeida = (n: any) => {
    if (n.leida) return;
    setItems(prev => bajoChip(prev.map(x => x.id === n.id ? { ...x, leida: true } : x)));
    if (esAutomatica(n)) setSinLeerB(c => Math.max(0, c - 1)); else setSinLeerP(c => Math.max(0, c - 1));
    marcarNotifLeida(n.id);
  };

  const marcarTodas = async () => {
    const esBot = pestana === "bot";
    setItems(prev => bajoChip(prev.map(n => esAutomatica(n) === esBot ? { ...n, leida: true } : n)));
    if (esBot) setSinLeerB(0); else setSinLeerP(0);
    await marcarNotifsLeidas(esBot ? "bot" : "personal");
  };

  // Seleccionar: marca leída, muestra el detalle y trae la bitácora del caso.
  // Token anti-carrera: si llega otra selección mientras esta cargaba, se descarta.
  const seleccionar = async (n: any) => {
    setSel(n); marcarLeida(n);
    setDetalle(null);
    if (!n.publicacion_id) return;
    const mi = ++pedidoRef.current;
    setDetCargando(true);
    const r: any = await actividadDeCaso(n.publicacion_id);
    if (mi !== pedidoRef.current) return;   // hubo una selección más nueva
    setDetalle(r); setDetCargando(false);
  };

  const nSinLeer = pestana === "bot" ? sinLeerB : sinLeerP;

  // Lista agrupada por bloque de fecha.
  const filas: JSX.Element[] = [];
  let ub = "";
  for (const n of items) {
    const b = bucketFecha(n.creado_en);
    if (b !== ub) { ub = b; filas.push(<div key={`b-${b}`} className="notif-bloque">{b}</div>); }
    filas.push(
      <div key={n.id}
        className={`camp-item ${n.leida ? "leida" : "nueva"} ${sel?.id === n.id ? "sel" : ""}`}
        onClick={() => seleccionar(n)} style={{ cursor: "pointer" }}>
        <NotifFila n={n} />
      </div>
    );
  }

  return (
    <div className="notif-2col">
      {/* ── IZQUIERDA: filtros + lista ── */}
      <div className="notif-col-lista">
        <div className="camp-tabs">
          <button className={`camp-tab ${pestana === "mias" ? "on" : ""}`} onClick={() => setPestana("mias")}>
            👤 Para ti{sinLeerP > 0 && <span className="camp-tabn">{sinLeerP}</span>}
          </button>
          <button className={`camp-tab ${pestana === "bot" ? "on" : ""}`}
            onClick={() => { setPestana("bot"); if (!CHIPS_BOT.includes(chip)) setChip("todas"); }}>
            🤖 Del Bot{sinLeerB > 0 && <span className="camp-tabn">{sinLeerB}</span>}
          </button>
          {nSinLeer > 0 && <button className="camp-marcar" onClick={marcarTodas}>✓ marcar leídas</button>}
        </div>

        <div className="notif-chips">
          {chipsVisibles.map(c => (
            <button key={c.clave} className={`nchip ${chip === c.clave ? "on" : ""}`} onClick={() => setChip(c.clave)}>
              {c.label}
            </button>
          ))}
        </div>

        {cargando && items.length === 0 && <div className="notif-vacia">cargando…</div>}
        {!cargando && items.length === 0 && (
          <div className="notif-vacia">
            {chip !== "todas" ? "Nada con este filtro." : pestana === "bot" ? "Sin avisos del Bot aún. 🤖" : "Nada que requiera tu acción. ✨"}
          </div>
        )}

        {filas}

        {hayMas ? (
          <button className="notif-mas" onClick={verMas} disabled={cargando}>
            {cargando ? "cargando…" : "ver más"}
          </button>
        ) : items.length > 0 && <div className="notif-fin">— fin —</div>}
      </div>

      {/* ── DERECHA: detalle de la seleccionada ── */}
      <aside className="notif-col-detalle">
        {!sel ? (
          <div className="notif-det-vacio">👈 Selecciona una notificación para ver el detalle y la actividad del caso.</div>
        ) : (
          <div className="notif-det">
            <div className="notif-det-top">
              <span className="camp-tt" style={{ whiteSpace: "normal" }}>{ICONO[sel.tipo] || "•"} {tituloDe(sel.mensaje)}</span>
              <div className="cuando" style={{ marginTop: 4 }}>
                {sel.actor_nombre ? `${corto(sel.actor_nombre)} ${ETIQ[sel.tipo] || ""} · ` : ""}{hace(sel.creado_en)}
              </div>
            </div>

            {/* (El mensaje completo se quitó: el título ya es el caso y la línea
                de arriba dice "quién + acción" — mostrarlo de nuevo era repetir.) */}

            {/* Vínculos del caso */}
            {(sel.vinculos || []).length > 0 && (
              <div className="sel-chips" style={{ marginTop: 8 }}>
                {sel.vinculos.map((v: any, i: number) => (
                  <span key={i} className="echip">{ICO_ENT[v.tipo] || "🔗"} {v.nombre}</span>
                ))}
              </div>
            )}

            {/* Contexto del caso: quién/cuándo, plazo, comentarios, reacciones */}
            {detalle?.caso && (() => {
              const c = detalle.caso;
              const pl = c.fecha_limite ? plazoDe(c.fecha_limite, c.estado) : null;
              return (
                <div className="notif-det-ctx">
                  <div className="ndx"><span>🧑 Creado</span><b>{corto(c.autor?.nombre) || "—"}</b><span className="ndx-t">{fechaCorta(c.creado_en)}</span></div>
                  <div className="ndx"><span>📌 Estado</span><b>{rotuloEstado(c.estado, c.tipo)}</b></div>
                  {c.resp?.nombre && <div className="ndx"><span>👤 Responsable</span><b>{corto(c.resp.nombre)}</b></div>}
                  {pl && <div className="ndx"><span>📅 Vence</span><b style={{ color: pl.color }}>{pl.texto}</b></div>}
                  <div className="ndx"><span>💬 Comentarios</span><b>{detalle.nComentarios || 0}</b></div>
                  {(detalle.reacciones || []).length > 0 && (
                    <div className="ndx"><span>😊 Reacciones</span><span className="ndx-reac">{detalle.reacciones.map((r: any) => `${r.emoji} ${r.n}`).join("   ")}</span></div>
                  )}
                </div>
              );
            })()}

            {rutaNotif(sel) && (
              <Link href={rutaNotif(sel)!} className="btn btn-ghost notif-det-abrir">
                {sel.objeto_id ? "Abrir el objeto →" : sel.equipamiento_id ? "Abrir el equipo →" : "Abrir el caso →"}
              </Link>
            )}

            {/* Bitácora del caso */}
            {sel.publicacion_id && (
              <div className="notif-det-act">
                <div className="notif-det-h">🕐 Actividad del caso</div>
                {detCargando && <div className="notif-vacia" style={{ padding: "10px 0" }}>cargando…</div>}
                {!detCargando && detalle && (detalle.eventos || []).length === 0 && (
                  <div className="notif-vacia" style={{ padding: "10px 0" }}>Sin actividad registrada.</div>
                )}
                {!detCargando && detalle && (detalle.eventos || []).map((e: any) => (
                  <div key={e.id} className="notif-ev">
                    <span className="notif-ev-txt">{descEvento(e, detalle.caso?.tipo)}</span>
                    <span className="notif-ev-t">{hace(e.creado_en)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
