import { createClient } from "@/lib/supabase/server";
import Realtime from "@/components/Realtime";
import Reloj from "@/components/Reloj";
import { redirect } from "next/navigation";

/* MODO PANTALLA — information radiator para la TV de la oficina.
   Solo lectura, tipografía grande, se actualiza sola (Realtime).
   Tres actos: marcador de temporada 🎯 arriba, cuenta regresiva
   DAFO 🏛 como protagonista, kanban vivo + pulso del equipo.
   Uso: iniciar sesión una vez en el navegador de la TV y dejar
   abierta esta ruta en pantalla completa (F11). */

export const dynamic = "force-dynamic";

const ESTADOS_TXT: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso",
  seguimiento: "Seguimiento", en_pausa: "En Pausa",
  resuelta: "Resuelta", archivada: "Archivada",
};

function dias(fecha: string) {
  return Math.ceil((new Date(fecha + "T12:00:00").getTime() - Date.now()) / 86400000);
}

export default async function Pantalla() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const hoyS = new Date().toISOString().slice(0, 10);

  const [pubsQ, actQ, postQ, perfQ] = await Promise.all([
    supabase.from("publicaciones")
      .select("id,titulo,tipo,estado,fecha_limite,responsable,resp:perfiles!publicaciones_responsable_fkey(nombre)")
      .in("estado", ["abierta", "en_progreso"])
      .order("creado_en", { ascending: false }).limit(200),
    supabase.from("actividad")
      .select("tipo,detalle,creado_en,entidad_tipo,entidad_id,actor:perfiles(nombre)")
      .eq("entidad_tipo", "publicacion")
      .order("creado_en", { ascending: false }).limit(7),
    supabase.from("postulaciones")
      .select("id,estado,conv:convocatorias(id,anio,monto_adjudicado)"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
  ]);

  const abiertos = pubsQ.data || [];
  const sinres = abiertos.filter(p => p.estado === "abierta");
  const enprog = abiertos.filter(p => p.estado === "en_progreso");
  const conFecha = abiertos.filter(p => p.fecha_limite).sort(
    (a, b) => (a.fecha_limite! < b.fecha_limite! ? -1 : 1)
  );
  const vencidos = conFecha.filter(p => dias(p.fecha_limite!) < 0);
  const porVencer = conFecha.filter(p => { const d = dias(p.fecha_limite!); return d >= 0 && d <= 7; });

  // ===== MARCADOR 🎯: la temporada de un vistazo =====
  const posts = postQ.data || [];
  const enJuego = posts.filter((p: any) => ["en_preparacion", "enviada", "finalista"].includes(p.estado));
  const ganadas = posts.filter((p: any) => p.estado === "ganadora");
  const montoJuego = enJuego.reduce((s: number, p: any) =>
    s + (parseFloat(p.conv?.monto_adjudicado) || 0), 0);

  // ===== CUENTA REGRESIVA 🏛: hitos DAFO de concursos donde jugamos =====
  const convIds = [...new Set(enJuego.map((p: any) => p.conv?.id).filter(Boolean))];
  const { data: hitosQ } = convIds.length
    ? await supabase.from("cronograma_actividades")
        .select("id,nombre,fecha_inicio,conv:convocatorias(codigo,nombre,anio)")
        .in("convocatoria_id", convIds).eq("clase", "hito_externo")
        .gte("fecha_inicio", hoyS).order("fecha_inicio").limit(4)
    : { data: [] };
  const hitos = hitosQ || [];

  // ===== PULSO 🫀: carga por persona — para repartir, nunca ranking =====
  const pulso = (perfQ.data || [])
    .filter((pf: any) => pf.nombre !== "Qhaway")
    .map((pf: any) => ({
      nombre: pf.nombre.split(" ")[0],
      carga: abiertos.filter((p: any) => p.responsable === pf.id).length,
    }))
    .filter((x: any) => x.carga > 0)
    .sort((a: any, b: any) => b.carga - a.carga);
  const maxCarga = Math.max(1, ...pulso.map((x: any) => x.carga));

  // Títulos para el ticker de actividad
  const ids = Array.from(new Set((actQ.data || []).map((a: any) => a.entidad_id)));
  const { data: titulos } = ids.length
    ? await supabase.from("publicaciones").select("id,titulo").in("id", ids)
    : { data: [] };
  const tituloDe = new Map((titulos || []).map((t: any) => [t.id, t.titulo]));

  const textoAct = (a: any) => {
    const quien = a.actor?.nombre?.split(" ")[0] || "Bot Qhaway 🤖";
    const sobre = tituloDe.get(a.entidad_id) || "";
    if (a.tipo === "bot") return `Bot Qhaway en «${sobre}»: ${a.detalle?.mensaje || ""}`;
    if (a.tipo === "comentario") return `${quien} comentó en «${sobre}»`;
    if (a.tipo === "creado") return `${quien} publicó «${sobre}»`;
    if (a.tipo === "estado") {
      const campo = a.detalle?.campo;
      if (campo === "responsable") return `${quien} asignó responsable en «${sobre}»`;
      return `${quien} · «${sobre}» → ${ESTADOS_TXT[a.detalle?.a] || a.detalle?.a}`;
    }
    return `${quien} · ${a.tipo} en «${sobre}»`;
  };

  const filaCaso = (p: any) => (
    <div className="tv-row" key={p.id}>
      <span className="tv-tit">{p.titulo}</span>
      {(p.resp as any)?.nombre
        ? <span className="tv-resp">{(p.resp as any).nombre.split(" ")[0]}</span>
        : <span style={{ color: "var(--yellow)", fontSize: 13 }}>⚠ sin responsable</span>}
      {p.fecha_limite && (() => {
        const d = dias(p.fecha_limite);
        const col = d < 0 || d <= 2 ? "var(--red)" : d <= 7 ? "var(--yellow)" : "var(--muted)";
        return <b style={{ color: col, whiteSpace: "nowrap", fontSize: 14 }}>
          {d < 0 ? `vencido ${Math.abs(d)}d` : d === 0 ? "HOY" : `${d}d`}
        </b>;
      })()}
    </div>
  );

  return (
    <div className="tv">
      <Realtime tablas={["publicaciones", "actividad", "comentarios", "postulaciones", "cronograma_actividades"]}
        token={session?.access_token} cadaSegundos={60} />

      {/* ===== CABECERA: logo · marcador de temporada · reloj ===== */}
      <div className="tv-top">
        <div className="logo" style={{ fontSize: 26 }}>
          <span className="ic" style={{ width: 46, height: 46, fontSize: 24 }}>⬡</span>
          <span>CrewHub<sup>+</sup> <small style={{ color: "var(--dim)", fontSize: 13 }}>· Kawsay en vivo</small></span>
        </div>
        <span className="spacer" />
        <div className="tv-marc">
          <span className="m-item" style={{ color: "var(--green)" }}>🏆 <b>{ganadas.length}</b> ganadas</span>
          <span className="m-sep" />
          <span className="m-item" style={{ color: "var(--blue)" }}>🎯 <b>{enJuego.length}</b> en juego</span>
          {montoJuego > 0 && (
            <>
              <span className="m-sep" />
              <span className="m-item" style={{ color: "var(--teal)" }}>
                S/ <b>{Math.round(montoJuego).toLocaleString("es-PE")}</b> en disputa
              </span>
            </>
          )}
        </div>
        <span className="spacer" />
        <Reloj />
      </div>

      <div className="tv-stats">
        <div className="tv-stat s-red"><b>{sinres.length}</b><span>Sin resolver</span></div>
        <div className="tv-stat s-yel"><b>{enprog.length}</b><span>En progreso</span></div>
        <div className="tv-stat s-yel"><b>{porVencer.length}</b><span>Vencen en 7 días</span></div>
        <div className="tv-stat s-red"><b>{vencidos.length}</b><span>Vencidos</span></div>
      </div>

      <div className="tv-cols3">
        {/* ===== ACTO 1: la cuenta regresiva DAFO ===== */}
        <div>
          <div className="tv-h">🏛 Cuenta regresiva DAFO</div>
          {hitos.map((h: any) => {
            const d = dias(h.fecha_inicio);
            const col = d <= 2 ? "var(--red)" : d <= 7 ? "var(--yellow)" : "var(--violet)";
            return (
              <div className="tv-hito" key={h.id} style={{ borderLeftColor: col }}>
                <div className="dias" style={{ color: col }}>
                  {d === 0 ? "HOY" : d}
                  {d > 0 && <small>días</small>}
                </div>
                <div className="que">
                  <b>{h.nombre}</b>
                  <span>{h.conv?.nombre || h.conv?.codigo} · {new Date(h.fecha_inicio + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "long" })}</span>
                </div>
              </div>
            );
          })}
          {!hitos.length && <div className="empty">Sin hitos DAFO por delante — a filmar tranquilos 🎬</div>}

          <div className="tv-h" style={{ marginTop: 24 }}>⏰ Plazos más cercanos</div>
          {conFecha.slice(0, 4).map(filaCaso)}
          {!conFecha.length && <div className="empty">Sin plazos registrados</div>}
        </div>

        {/* ===== ACTO 2: el kanban vivo ===== */}
        <div>
          <div className="tv-h" style={{ color: "var(--red)" }}>🔴 Sin resolver · {sinres.length}</div>
          {sinres.slice(0, 5).map(filaCaso)}
          {!sinres.length && <div className="empty">Nada sin resolver 🎉</div>}

          <div className="tv-h" style={{ marginTop: 24, color: "var(--yellow)" }}>🟡 En progreso · {enprog.length}</div>
          {enprog.slice(0, 5).map(filaCaso)}
          {!enprog.length && <div className="empty">Nada en progreso</div>}
        </div>

        {/* ===== ACTO 3: el equipo ===== */}
        <div>
          <div className="tv-h">🫀 Pulso del equipo <small style={{ textTransform: "none", letterSpacing: 0, color: "var(--dim)" }}>· carga, no ranking</small></div>
          {pulso.map((x: any) => (
            <div className="tv-pulso" key={x.nombre}>
              <span className="n">{x.nombre}</span>
              <span className="bar"><i style={{ width: `${Math.round((x.carga / maxCarga) * 100)}%` }} /></span>
              <b style={{ color: "var(--blue)", width: 24, textAlign: "right" }}>{x.carga}</b>
            </div>
          ))}
          {!pulso.length && <div className="empty">Sin casos asignados</div>}

          <div className="tv-h" style={{ marginTop: 24 }}>⚡ Actividad en vivo</div>
          {(actQ.data || []).map((a: any, i: number) => (
            <div className="tv-act" key={i}>
              <span className="tv-dot" style={{ background: a.actor ? "var(--accent)" : "var(--blue)" }} />
              <span style={{ flex: 1 }}>{textoAct(a)}</span>
              <span className="tv-hora">
                {new Date(a.creado_en).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
