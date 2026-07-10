import { createClient } from "@/lib/supabase/server";
import Realtime from "@/components/Realtime";
import Reloj from "@/components/Reloj";
import { redirect } from "next/navigation";

/* MODO PANTALLA — information radiator para la TV de la oficina.
   Solo lectura, tipografía grande, se actualiza sola (Realtime).
   Uso: iniciar sesión una vez en el navegador de la TV y dejar
   abierta esta ruta en pantalla completa (F11). */

export const dynamic = "force-dynamic";

const ESTADOS_TXT: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso",
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

  const [pubsQ, actQ] = await Promise.all([
    supabase.from("publicaciones")
      .select("id,titulo,tipo,estado,fecha_limite,resp:perfiles!publicaciones_responsable_fkey(nombre)")
      .in("estado", ["abierta", "en_progreso"])
      .order("creado_en", { ascending: false }).limit(200),
    supabase.from("actividad")
      .select("tipo,detalle,creado_en,entidad_tipo,entidad_id,actor:perfiles(nombre)")
      .eq("entidad_tipo", "publicacion")
      .order("creado_en", { ascending: false }).limit(8),
  ]);

  const abiertos = pubsQ.data || [];
  const sinres = abiertos.filter(p => p.estado === "abierta");
  const enprog = abiertos.filter(p => p.estado === "en_progreso");
  const conFecha = abiertos.filter(p => p.fecha_limite).sort(
    (a, b) => (a.fecha_limite! < b.fecha_limite! ? -1 : 1)
  );
  const vencidos = conFecha.filter(p => dias(p.fecha_limite!) < 0);
  const porVencer = conFecha.filter(p => { const d = dias(p.fecha_limite!); return d >= 0 && d <= 7; });

  // Títulos para el ticker de actividad
  const ids = Array.from(new Set((actQ.data || []).map((a: any) => a.entidad_id)));
  const { data: titulos } = ids.length
    ? await supabase.from("publicaciones").select("id,titulo").in("id", ids)
    : { data: [] };
  const tituloDe = new Map((titulos || []).map((t: any) => [t.id, t.titulo]));

  const textoAct = (a: any) => {
    const quien = a.actor?.nombre?.split(" ")[0] || "Qhaway 🤖";
    const sobre = tituloDe.get(a.entidad_id) || "";
    if (a.tipo === "bot") return `Qhaway en «${sobre}»: ${a.detalle?.mensaje || ""}`;
    if (a.tipo === "comentario") return `${quien} comentó en «${sobre}»`;
    if (a.tipo === "creado") return `${quien} publicó «${sobre}»`;
    if (a.tipo === "estado") {
      const campo = a.detalle?.campo;
      if (campo === "responsable") return `${quien} asignó responsable en «${sobre}»`;
      return `${quien} · «${sobre}» → ${ESTADOS_TXT[a.detalle?.a] || a.detalle?.a}`;
    }
    return `${quien} · ${a.tipo} en «${sobre}»`;
  };

  return (
    <div className="tv">
      <Realtime tablas={["publicaciones", "actividad", "comentarios"]} token={session?.access_token} />
      <div className="tv-top">
        <div className="logo" style={{ fontSize: 26 }}>
          <span className="ic" style={{ width: 46, height: 46, fontSize: 24 }}>⬡</span>
          <span>CrewHub<sup>+</sup> <small style={{ color: "var(--dim)", fontSize: 13 }}>· Kawsay en vivo</small></span>
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

      <div className="tv-cols">
        <div>
          <div className="tv-h">⏰ Plazos más cercanos</div>
          {conFecha.slice(0, 6).map(p => {
            const d = dias(p.fecha_limite!);
            const col = d < 0 || d <= 2 ? "var(--red)" : d <= 7 ? "var(--yellow)" : "var(--muted)";
            return (
              <div className="tv-row" key={p.id}>
                <span className="tv-tit">{p.titulo}</span>
                {(p.resp as any)?.nombre && <span className="tv-resp">{(p.resp as any).nombre.split(" ")[0]}</span>}
                <b style={{ color: col, whiteSpace: "nowrap" }}>
                  {d < 0 ? `vencido ${Math.abs(d)}d` : d === 0 ? "HOY" : `${d} días`}
                </b>
              </div>
            );
          })}
          {!conFecha.length && <div className="empty">Sin plazos registrados</div>}

          <div className="tv-h" style={{ marginTop: 26 }}>🔴 Sin resolver</div>
          {sinres.slice(0, 5).map(p => (
            <div className="tv-row" key={p.id}>
              <span className="tv-tit">{p.titulo}</span>
              {(p.resp as any)?.nombre
                ? <span className="tv-resp">{(p.resp as any).nombre.split(" ")[0]}</span>
                : <span style={{ color: "var(--yellow)", fontSize: 13 }}>⚠ sin responsable</span>}
            </div>
          ))}
          {!sinres.length && <div className="empty">Nada sin resolver 🎉</div>}
        </div>

        <div>
          <div className="tv-h">⚡ Actividad en vivo</div>
          {(actQ.data || []).map((a: any, i: number) => (
            <div className="tv-act" key={i}>
              <span className="tv-dot" style={{ background: a.actor ? "var(--accent)" : "var(--blue)" }} />
              <span style={{ flex: 1 }}>{textoAct(a)}</span>
              <span className="tv-hora">
                {new Date(a.creado_en).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
