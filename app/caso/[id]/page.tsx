import { createClient } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";
import { EstadoSelect, CommentBox, RespSelect } from "@/components/CaseActions";
import Realtime from "@/components/Realtime";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
const ENT_ICO: Record<string, string> = {
  proyecto: "📁", persona: "👤", convocatoria: "📜",
  equipamiento: "🎥", lugar: "📍", etiqueta: "🏷️",
};
const ESTADOS_TXT: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso",
  resuelta: "Resuelta", archivada: "Archivada",
};

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Caso({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: p } = await supabase
    .from("publicaciones")
    .select(`
      *,
      autor:perfiles!publicaciones_autor_id_fkey(nombre, color),
      resp:perfiles!publicaciones_responsable_fkey(nombre, color),
      vinculos:publicacion_vinculos(entidad_tipo, entidad_id)
    `)
    .eq("id", params.id).single();

  if (!p) notFound();

  const [{ data: eventos }, { data: comentarios }, { data: perfiles },
         proy, pers, conv, equi, luga, etiq] = await Promise.all([
    supabase.from("actividad")
      .select("*, actor:perfiles(nombre)")
      .eq("entidad_tipo", "publicacion").eq("entidad_id", p.id)
      .order("creado_en"),
    supabase.from("comentarios")
      .select("*, autor:perfiles(nombre, color)")
      .eq("publicacion_id", p.id)
      .order("creado_en"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
    supabase.from("proyectos").select("id,nombre"),
    supabase.from("personas").select("id,nombre"),
    supabase.from("convocatorias").select("id,codigo"),
    supabase.from("equipamiento").select("id,nombre"),
    supabase.from("lugares").select("id,nombre"),
    supabase.from("etiquetas").select("id,nombre"),
  ]);

  // Resolver nombres de entidades vinculadas y de perfiles
  const nombres = new Map<string, string>();
  (proy.data || []).forEach((x: any) => nombres.set(`proyecto:${x.id}`, x.nombre));
  (pers.data || []).forEach((x: any) => nombres.set(`persona:${x.id}`, x.nombre));
  (conv.data || []).forEach((x: any) => nombres.set(`convocatoria:${x.id}`, x.codigo));
  (equi.data || []).forEach((x: any) => nombres.set(`equipamiento:${x.id}`, x.nombre));
  (luga.data || []).forEach((x: any) => nombres.set(`lugar:${x.id}`, x.nombre));
  (etiq.data || []).forEach((x: any) => nombres.set(`etiqueta:${x.id}`, x.nombre));
  const perfilNombre = new Map((perfiles || []).map((x: any) => [x.id, x.nombre]));

  const chips = (p.vinculos || [])
    .map((v: any) => ({ ...v, nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`) }))
    .filter((v: any) => v.nombre);

  // Línea de tiempo unificada
  const comMap = new Map((comentarios || []).map((c: any) => [c.id, c]));
  const timeline = (eventos || []).map((e: any) => ({
    ...e,
    comentario: e.tipo === "comentario" ? comMap.get(e.detalle?.comentario_id) : null,
  }));
  const conEvento = new Set(timeline.filter((t: any) => t.comentario).map((t: any) => t.comentario.id));
  const sueltos = (comentarios || []).filter((c: any) => !conEvento.has(c.id))
    .map((c: any) => ({ tipo: "comentario", creado_en: c.creado_en, comentario: c }));
  const linea = [...timeline, ...sueltos].sort(
    (a: any, b: any) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime()
  );

  const [tl, tc] = TIPO_META[p.tipo] || TIPO_META.conversacion;

  const textoEvento = (e: any) => {
    const quien = e.actor?.nombre || "Qhaway 🤖";
    if (e.tipo === "creado") return `${quien} creó la publicación`;
    if (e.tipo === "estado") {
      const campo = e.detalle?.campo || "estado";
      if (campo === "responsable") {
        const a = e.detalle?.a ? (perfilNombre.get(e.detalle.a) || "alguien") : "sin asignar";
        return `${quien} cambió el responsable → ${a}`;
      }
      const de = ESTADOS_TXT[e.detalle?.de] || e.detalle?.de || "—";
      const a = ESTADOS_TXT[e.detalle?.a] || e.detalle?.a || "—";
      return `${quien} · ${campo}: ${de} → ${a}`;
    }
    return `${quien} · ${e.tipo}`;
  };

  return (
    <div className="shell">
      <Realtime tablas={["actividad", "comentarios", "publicaciones"]} />
      <div className="topbar">
        <Link href="/" className="btn btn-ghost">← Volver al feed</Link>
        <span className="spacer" />
        <span className="badge" style={{ color: tc, background: `${tc}22`, fontSize: 12 }}>{tl}</span>
      </div>

      <h1 className="title-lg">{p.titulo}</h1>

      <div className="grid-meta">
        <div className="gm"><span className="k">Estado</span><EstadoSelect pubId={p.id} estado={p.estado} /></div>
        <div className="gm"><span className="k">Responsable</span>
          <RespSelect pubId={p.id} actual={p.responsable} perfiles={perfiles || []} /></div>
        <div className="gm"><span className="k">Prioridad</span><span className="v">{p.prioridad || "—"}</span></div>
        <div className="gm"><span className="k">Creado</span>
          <span className="v">{fecha(p.creado_en)}<br /><span style={{ color: "var(--muted)", fontWeight: 400 }}>por {p.autor?.nombre}</span></span></div>
      </div>

      {p.cuerpo && <p className="desc">{p.cuerpo}</p>}

      {chips.length > 0 && (
        <div className="sel-chips" style={{ marginBottom: 6 }}>
          {chips.map((v: any, i: number) => (
            <span key={i} className="echip">{ENT_ICO[v.entidad_tipo] || "🔗"} {v.nombre}</span>
          ))}
        </div>
      )}

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
          return (
            <div className={`tl-ev ${e.actor ? e.tipo : "bot"}`} key={i}>
              <span>{EV_ICO[e.tipo] || "•"}</span>
              <span>{textoEvento(e)}</span>
              <span className="t">{fecha(e.creado_en)}</span>
            </div>
          );
        })}
      </div>

      <CommentBox pubId={p.id} userId={user.id} />
    </div>
  );
}
