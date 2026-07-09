import { createClient } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";
import { EstadoSelect, CommentBox } from "@/components/CaseActions";
import Link from "next/link";
import { notFound } from "next/navigation";

const TIPO_META: Record<string, [string, string]> = {
  aviso: ["📢 Aviso", "#a78bfa"], tarea: ["✅ Tarea", "#22c55e"],
  problema: ["❗ Problema", "#ff4d5e"], pago: ["💰 Pago", "#2dd4bf"],
  idea: ["💡 Idea", "#f4b400"], archivo: ["📎 Archivo", "#3b82f6"],
  conversacion: ["💬 Conversación", "#8b8ba3"],
};
const EV_ICO: Record<string, string> = {
  creado: "📝", estado: "🔄", asignacion: "👤", archivo: "📎",
  prioridad: "⚡", tarea: "✅", bot: "🤖", cierre: "✔️", vinculo: "🔗",
};

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Caso({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: p } = await supabase
    .from("publicaciones")
    .select(`
      *,
      autor:perfiles!publicaciones_autor_id_fkey(nombre, color),
      resp:perfiles!publicaciones_responsable_fkey(nombre, color)
    `)
    .eq("id", params.id).single();

  if (!p) notFound();

  const [{ data: eventos }, { data: comentarios }] = await Promise.all([
    supabase.from("actividad")
      .select("*, actor:perfiles(nombre)")
      .eq("entidad_tipo", "publicacion").eq("entidad_id", p.id)
      .order("creado_en"),
    supabase.from("comentarios")
      .select("*, autor:perfiles(nombre, color)")
      .eq("publicacion_id", p.id)
      .order("creado_en"),
  ]);

  // Línea de tiempo unificada: eventos + comentarios, cronológica
  const comMap = new Map((comentarios || []).map((c: any) => [c.id, c]));
  const timeline = (eventos || []).map((e: any) => ({
    ...e,
    comentario: e.tipo === "comentario" ? comMap.get(e.detalle?.comentario_id) : null,
  }));
  // Comentarios sin evento (por si acaso): agregarlos igualmente
  const conEvento = new Set(timeline.filter(t => t.comentario).map(t => t.comentario.id));
  const sueltos = (comentarios || []).filter((c: any) => !conEvento.has(c.id))
    .map((c: any) => ({ tipo: "comentario", creado_en: c.creado_en, comentario: c }));
  const linea = [...timeline, ...sueltos].sort(
    (a: any, b: any) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime()
  );

  const [tl, tc] = TIPO_META[p.tipo] || TIPO_META.conversacion;

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="btn btn-ghost">← Volver al feed</Link>
        <span className="spacer" />
        <span className="badge" style={{ color: tc, background: `${tc}22`, fontSize: 12 }}>{tl}</span>
      </div>

      <h1 className="title-lg">{p.titulo}</h1>

      <div className="grid-meta">
        <div className="gm"><span className="k">Estado</span><EstadoSelect pubId={p.id} estado={p.estado} /></div>
        <div className="gm"><span className="k">Responsable</span>
          <span className="v">{p.resp ? <><Avatar nombre={p.resp.nombre} color={p.resp.color} size={20} /> {p.resp.nombre}</> : <span style={{ color: "var(--dim)" }}>Sin asignar</span>}</span></div>
        <div className="gm"><span className="k">Prioridad</span><span className="v">{p.prioridad || "—"}</span></div>
        <div className="gm"><span className="k">Creado</span>
          <span className="v">{fecha(p.creado_en)}<br /><span style={{ color: "var(--muted)", fontWeight: 400 }}>por {p.autor?.nombre}</span></span></div>
      </div>

      {p.cuerpo && <p className="desc">{p.cuerpo}</p>}

      <div className="h4">🕐 Actividad · {linea.length} eventos</div>
      <div className="tl">
        {linea.map((e: any, i: number) => {
          if (e.comentario) {
            const c = e.comentario;
            return (
              <div className="tl-com" key={i}>
                <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={32} />
                <div className="bubble">
                  <div className="who">{c.autor?.nombre}<span className="t">{fecha(c.creado_en)}</span></div>
                  <div className="tx">{c.cuerpo}</div>
                </div>
              </div>
            );
          }
          const quien = e.actor?.nombre || "Qhaway 🤖";
          let txt = e.tipo;
          if (e.tipo === "creado") txt = `${quien} creó la publicación`;
          else if (e.tipo === "estado") txt = `${quien} · ${e.detalle?.campo || "estado"}: ${e.detalle?.de ?? "—"} → ${e.detalle?.a ?? "—"}`;
          else txt = `${quien} · ${e.tipo}`;
          return (
            <div className={`tl-ev ${e.actor ? e.tipo : "bot"}`} key={i}>
              <span>{EV_ICO[e.tipo] || "•"}</span>
              <span>{txt}</span>
              <span className="t">{fecha(e.creado_en)}</span>
            </div>
          );
        })}
      </div>

      <CommentBox pubId={p.id} userId={user!.id} />
    </div>
  );
}
