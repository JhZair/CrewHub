import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import EventoHistorial, { icoDe, type Evento } from "@/components/EventoHistorial";
import { PERIODOS, desdeDe, diaLima, horaLima, rotuloDia, type Periodo } from "@/lib/periodo";
import { ICO_ENT, TABLA_DE } from "@/lib/secciones";
import { BOT } from "@/lib/personas";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🕐 Historial" };

/* EL DIARIO — todo lo que pasó en el sistema, de todo, junto.
   El historial por tipo responde "qué se movió en las empresas"; la ficha,
   "qué pasó con ESTA empresa". Esto responde "qué pasó, a secas": el rastro
   completo, para cuando hay que reconstruir cómo se llegó a algo.
   Es la bitácora de Qhaway, por eso se entra desde su perfil. */

const ROTULO_EV: Record<string, string> = {
  creado: "altas", estado: "cambios de estado", editado: "ediciones",
  dato: "datos y verificaciones", miembro: "cargos", bot: "del bot",
};
const ROTULO_ENT: Record<string, string> = {
  publicacion: "casos", proyecto: "proyectos", empresa: "empresas",
  persona: "personas", postulacion: "postulaciones", convocatoria: "convocatorias",
  equipamiento: "equipos", lugar: "lugares", etiqueta: "etiquetas",
  empresa_miembro: "cargos de empresa",
};
const TOPE = 500;

const cortoActor = (n?: string | null) => {
  const p = (n || "").trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || "");
};

export default async function HistorialTodo({ searchParams }: {
  searchParams: { p?: string; e?: string; t?: string; a?: string };
}) {
  const p = (PERIODOS.some(([k]) => k === searchParams?.p) ? searchParams!.p : "semana") as Periodo;
  const filtroEv = searchParams?.e || "";     // tipo de evento
  const filtroEnt = searchParams?.t || "";    // tipo de entidad
  const filtroActor = searchParams?.a || "";  // quién

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const desde = desdeDe(p);
  let q = supabase.from("actividad")
    .select("tipo,detalle,creado_en,entidad_tipo,entidad_id,actor_id,actor:perfiles(nombre)")
    .order("creado_en", { ascending: false })
    .limit(TOPE);
  if (desde) q = q.gte("creado_en", desde);
  const { data: evs } = await q;

  /* Los nombres de TODO lo tocado, agrupando por tabla: una consulta por
     tipo de entidad, no una por evento. */
  const porTipo = new Map<string, Set<string>>();
  (evs || []).forEach((x: any) => {
    if (!TABLA_DE[x.entidad_tipo]) return;
    (porTipo.get(x.entidad_tipo) || porTipo.set(x.entidad_tipo, new Set()).get(x.entidad_tipo)!)
      .add(x.entidad_id);
  });
  const nombre = new Map<string, string>();
  await Promise.all([...porTipo.entries()].map(async ([tipo, ids]) => {
    const [tabla, campo] = TABLA_DE[tipo];
    // El alias manda cuando existe: en una lista larga, el nombre completo estorba
    const sel = tipo === "persona" ? "id,nombre,alias"
      : tipo === "proyecto" ? "id,nombre,nombre_corto" : `id,${campo}`;
    const { data } = await supabase.from(tabla).select(sel).in("id", [...ids]);
    (data || []).forEach((r: any) =>
      nombre.set(`${tipo}:${r.id}`, r.alias || r.nombre_corto || r[campo] || "—"));
  }));

  const todos: Evento[] = (evs || []).map((x: any) => ({
    ...x,
    entidadNombre: nombre.get(`${x.entidad_tipo}:${x.entidad_id}`),
    actor: x.actor ? { ...x.actor, nombre: cortoActor(x.actor.nombre) } : x.actor,
  }));

  // Los conteos salen del periodo completo; los chips filtran la lista
  const cuenta = (f: (x: any) => any) => {
    const m = new Map<string, number>();
    todos.forEach(x => { const k = f(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const porEvento = cuenta((x: any) => x.tipo);
  const porEntidad = cuenta((x: any) => x.entidad_tipo);
  const porActor = cuenta((x: any) => (x as any).actor?.nombre || `🤖 ${BOT}`);

  const lista = todos.filter((x: any) =>
    (!filtroEv || x.tipo === filtroEv) &&
    (!filtroEnt || x.entidad_tipo === filtroEnt) &&
    (!filtroActor || (x.actor?.nombre || `🤖 ${BOT}`) === filtroActor));

  /* A qué hora se trabaja. El bot va aparte dentro de cada barra: escribe
     decenas de eventos de una sentada en su ronda de las 7:30, y mezclado
     dibujaría un pico que nadie trabajó. Separarlo hace que la barra diga
     dos cosas ciertas en vez de una falsa. */
  const HORAS = Array.from({ length: 24 }, (_, h) => h);
  const porHora = HORAS.map(h => ({ h, humano: 0, bot: 0 }));
  lista.forEach((x: any) => {
    const c = porHora[horaLima(x.creado_en)];
    if (x.actor) c.humano++; else c.bot++;
  });
  const pico = Math.max(1, ...porHora.map(x => x.humano + x.bot));
  const horaAhora = horaLima(new Date().toISOString());
  const totalHum = porHora.reduce((s, x) => s + x.humano, 0);
  // La hora más viva del equipo (sin contar al bot): el dato que cuenta algo
  const horaTop = [...porHora].sort((a, b) => b.humano - a.humano)[0];

  // Por jornadas, no 500 filas seguidas
  const dias: [string, Evento[]][] = [];
  lista.forEach(x => {
    const d = diaLima(x.creado_en);
    const ult = dias[dias.length - 1];
    if (ult && ult[0] === d) ult[1].push(x); else dias.push([d, [x]]);
  });

  const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE",
    { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
  const url = (np: Periodo | string, ne: string, nt: string, na: string) =>
    `/historial?p=${np}${ne ? `&e=${ne}` : ""}${nt ? `&t=${nt}` : ""}${na ? `&a=${encodeURIComponent(na)}` : ""}`;
  const filtrado = !!(filtroEv || filtroEnt || filtroActor) || p !== "semana";

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/qhaway" className="btn btn-ghost">🤖 Bot Qhaway</Link>
      </div>
      <h1 className="title-lg">🕐 El diario — todo lo que pasó</h1>

      <PanelFiltros limpiar="/historial" mostrarLimpiar={filtrado}>
        <FilaFiltro titulo="Periodo">
          {PERIODOS.map(([k, lbl]) => (
            <Chip key={k} href={url(k, filtroEv, filtroEnt, filtroActor)} on={p === k} color="var(--violet)">
              {lbl}
            </Chip>
          ))}
        </FilaFiltro>
        {porEntidad.length > 0 && (
          <FilaFiltro titulo="Sobre qué">
            {porEntidad.map(([t, n]) => (
              <Chip key={t} href={url(p, filtroEv, filtroEnt === t ? "" : t, filtroActor)} on={filtroEnt === t}>
                {ICO_ENT[t] || "🔗"} {ROTULO_ENT[t] || t} · {n}
              </Chip>
            ))}
          </FilaFiltro>
        )}
        {porEvento.length > 0 && (
          <FilaFiltro titulo="Qué pasó">
            {porEvento.map(([t, n]) => (
              <Chip key={t} href={url(p, filtroEv === t ? "" : t, filtroEnt, filtroActor)} on={filtroEv === t}>
                {icoDe(t)} {ROTULO_EV[t] || t} · {n}
              </Chip>
            ))}
          </FilaFiltro>
        )}
        {porActor.length > 0 && (
          <FilaFiltro titulo="Quién">
            {porActor.map(([a, n]) => (
              <Chip key={a} href={url(p, filtroEv, filtroEnt, filtroActor === a ? "" : a)}
                on={filtroActor === a} color={a.startsWith("🤖") ? "var(--dim)" : "var(--teal)"}>
                {a} · {n}
              </Chip>
            ))}
          </FilaFiltro>
        )}
      </PanelFiltros>

      <div className="card" style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--violet)" }}>{lista.length}</span>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          movimiento{lista.length === 1 ? "" : "s"}
          {lista.length !== todos.length && <> de {todos.length}</>}
          {" · "}{(PERIODOS.find(([k]) => k === p)?.[1] || "").toLowerCase()}
        </span>
        <span style={{ flex: 1 }} />
        {/* Si hay tope, la pantalla lo dice cuando lo toca */}
        {todos.length >= TOPE && (
          <span style={{ color: "var(--yellow)", fontSize: 11.5 }}>
            ⚠ tope de {TOPE} — acota el periodo para verlo completo
          </span>
        )}
      </div>

      {lista.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
              🕗 A qué hora se trabaja
            </span>
            {totalHum > 0 && horaTop.humano > 0 && (
              <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
                más movimiento a las <b style={{ color: "var(--teal)" }}>{String(horaTop.h).padStart(2, "0")}:00</b>
              </span>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ display: "flex", gap: 10, fontSize: 10.5, color: "var(--dim)" }}>
              <span><i className="hg-mx hg-hum" /> equipo</span>
              <span><i className="hg-mx hg-bot" /> Qhaway</span>
            </span>
          </div>
          <div className="hg">
            {porHora.map(({ h, humano, bot }) => {
              const total = humano + bot;
              return (
                <span key={h} className={`hg-col${h === horaAhora ? " ahora" : ""}`}
                  title={`${String(h).padStart(2, "0")}:00 — ${humano} del equipo${bot ? ` · ${bot} de Qhaway` : ""}`}>
                  <span className="hg-barra">
                    {/* El bot abajo, el equipo arriba: lo que importa queda a la vista */}
                    <span className="hg-bot" style={{ height: `${(bot / pico) * 100}%` }} />
                    <span className="hg-hum" style={{ height: `${(humano / pico) * 100}%` }} />
                  </span>
                  {/* Solo cada 3 horas: 24 números no se leen */}
                  <span className="hg-h">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {!lista.length && (
        <div className="empty">
          Nada con estos filtros {(PERIODOS.find(([k]) => k === p)?.[1] || "").toLowerCase()}.
        </div>
      )}

      {dias.map(([dia, evs]) => (
        <div key={dia} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px 8px" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
              {rotuloDia(dia)} · {evs.length}
            </span>
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <div className="card">
            <div className="tl">
              {evs.map((x, i) => (
                <EventoHistorial key={i} e={x} hora={hora(x.creado_en)} conEntidad />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
