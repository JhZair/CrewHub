import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Avatar from "@/components/Avatar";
import { EstadoSelect, CommentBox, RespSelect, FechaSelect } from "@/components/CaseActions";
import Reacciones from "@/components/Reacciones";
import AvisoEnterado from "@/components/AvisoEnterado";
import SubCasos from "@/components/SubCasos";
import TituloEditable from "@/components/TituloEditable";
import DescripcionEditable from "@/components/DescripcionEditable";
import EtiquetasEditor from "@/components/EtiquetasEditor";
import VinculosEditor from "@/components/VinculosEditor";
import ComentarioTexto from "@/components/ComentarioTexto";
import RespuestaBox from "@/components/RespuestaBox";
import Realtime from "@/components/Realtime";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

const TIPO_META: Record<string, [string, string]> = {
  aviso: ["📢 Aviso", "#a78bfa"], tarea: ["✅ Tarea", "#22c55e"],
  problema: ["❗ Problema", "#ff4d5e"], consulta: ["❓ Consulta", "#60a5fa"],
  pago: ["💰 Pago", "#2dd4bf"], idea: ["💡 Idea", "#f4b400"],
  archivo: ["📎 Archivo", "#3b82f6"], conversacion: ["💬 Conversación", "#8b8ba3"],
};
const EV_ICO: Record<string, string> = {
  creado: "📝", estado: "🔄", asignacion: "👤", archivo: "📎",
  prioridad: "⚡", tarea: "✅", bot: "🤖", cierre: "✔️", vinculo: "🔗", edicion: "✏️",
};
const ENT_ICO: Record<string, string> = {
  proyecto: "📁", empresa: "🏢", persona: "👤", convocatoria: "📜",
  postulacion: "🎯", equipamiento: "🎥", lugar: "📍", etiqueta: "🏷️",
};
const ESTADOS_TXT: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso", seguimiento: "🔭 Seguimiento",
  en_pausa: "En Pausa", resuelta: "Resuelta", archivada: "Archivada",
};

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

export default async function Caso({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

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
         proy, emp, pers, conv, equi, luga, etiq, postu] = await Promise.all([
    supabase.from("actividad")
      .select("*, actor:perfiles(nombre)")
      .eq("entidad_tipo", "publicacion").eq("entidad_id", p.id)
      .order("creado_en"),
    supabase.from("comentarios")
      .select("*, autor:perfiles(nombre, color, avatar_url)")
      .eq("publicacion_id", p.id)
      .order("creado_en"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
    supabase.from("proyectos").select("id,nombre"),
    supabase.from("empresas").select("id,nombre"),
    supabase.from("personas").select("id,nombre"),
    supabase.from("convocatorias").select("id,codigo"),
    supabase.from("equipamiento").select("id,nombre,folio"),
    supabase.from("lugares").select("id,nombre"),
    supabase.from("etiquetas").select("id,nombre"),
    supabase.from("postulaciones").select("id,codigo,proy:proyectos(nombre),conv:convocatorias(codigo)"),
  ]);

  // Familia: el padre (si soy sub-caso) y los hijos (si soy caso largo)
  const [{ data: padre }, { data: hijos }] = await Promise.all([
    p.padre_id
      ? supabase.from("publicaciones").select("id,titulo").eq("id", p.padre_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("publicaciones")
      .select("id,titulo,estado,resp:perfiles!publicaciones_responsable_fkey(nombre)")
      .eq("padre_id", p.id).order("creado_en"),
  ]);

  // Reacciones de la publicación y sus comentarios
  const { data: reaccs } = await supabase.from("reacciones")
    .select("publicacion_id,comentario_id,emoji,usuario_id")
    .eq("publicacion_id", p.id);
  const rxPub = (reaccs || []).filter((r: any) => !r.comentario_id);
  const rxCom = new Map<string, any[]>();
  (reaccs || []).forEach((r: any) => {
    if (!r.comentario_id) return;
    const l = rxCom.get(r.comentario_id) || [];
    l.push(r); rxCom.set(r.comentario_id, l);
  });

  // Resolver nombres de entidades vinculadas y de perfiles
  const nombres = new Map<string, string>();
  (proy.data || []).forEach((x: any) => nombres.set(`proyecto:${x.id}`, x.nombre));
  (emp.data || []).forEach((x: any) => nombres.set(`empresa:${x.id}`, x.nombre));
  (pers.data || []).forEach((x: any) => nombres.set(`persona:${x.id}`, x.nombre));
  (conv.data || []).forEach((x: any) => nombres.set(`convocatoria:${x.id}`, x.codigo));
  (equi.data || []).forEach((x: any) =>
    nombres.set(`equipamiento:${x.id}`, x.folio ? `${x.folio} · ${x.nombre}` : x.nombre));
  (luga.data || []).forEach((x: any) => nombres.set(`lugar:${x.id}`, x.nombre));
  (etiq.data || []).forEach((x: any) => nombres.set(`etiqueta:${x.id}`, x.nombre));
  (postu.data || []).forEach((x: any) =>
    nombres.set(`postulacion:${x.id}`, `${x.codigo || x.conv?.codigo || "🎯"} · ${x.proy?.nombre || "postulación"}`));
  const perfilNombre = new Map((perfiles || []).map((x: any) => [x.id, x.nombre]));

  const chips = (p.vinculos || [])
    .filter((v: any) => v.entidad_tipo !== "etiqueta")
    .map((v: any) => ({ ...v, nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`) }))
    .filter((v: any) => v.nombre);
  const etqTodas = (etiq.data || []) as { id: string; nombre: string }[];
  const etqMap = new Map(etqTodas.map(x => [x.id, x.nombre]));
  const etiquetasActuales = (p.vinculos || [])
    .filter((v: any) => v.entidad_tipo === "etiqueta")
    .map((v: any) => ({ id: v.entidad_id, nombre: etqMap.get(v.entidad_id) || "etiqueta" }));

  // Catálogos por tipo para el editor de vínculos + vínculos actuales (no-etiqueta)
  const catEnt: Record<string, { id: string; nombre: string }[]> = {
    proyecto: (proy.data || []).map((x: any) => ({ id: x.id, nombre: x.nombre })),
    empresa: (emp.data || []).map((x: any) => ({ id: x.id, nombre: x.nombre })),
    persona: (pers.data || []).map((x: any) => ({ id: x.id, nombre: x.nombre })),
    convocatoria: (conv.data || []).map((x: any) => ({ id: x.id, nombre: x.codigo })),
    postulacion: (postu.data || []).map((x: any) => ({
      id: x.id, nombre: `${x.codigo || x.conv?.codigo || "🎯"} · ${x.proy?.nombre || "postulación"}`,
    })),
    equipamiento: (equi.data || []).map((x: any) => ({ id: x.id, nombre: x.folio ? `${x.folio} · ${x.nombre}` : x.nombre })),
    lugar: (luga.data || []).map((x: any) => ({ id: x.id, nombre: x.nombre })),
  };
  const actualesVinc = chips.map((v: any) => ({ tipo: v.entidad_tipo, id: v.entidad_id, nombre: v.nombre }));

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
    const quien = e.actor?.nombre || "Bot Qhaway";
    if (e.tipo === "bot") return `Bot Qhaway: "${e.detalle?.mensaje || "evento automático"}"`;
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
    return `${quien} · ${e.detalle?.mensaje || e.tipo}`;
  };

  return (
    <div className="shell">
      <Realtime tablas={["actividad", "comentarios", "publicaciones", "reacciones"]} token={session?.access_token} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span className="badge" style={{ color: tc, background: `${tc}22`, fontSize: 12 }}>{tl}</span>
      </div>

      {padre && (
        <Link href={`/caso/${padre.id}`} style={{ color: "var(--muted)", fontSize: 12.5, display: "inline-block", marginBottom: 4 }}>
          ↑ Parte de: <b style={{ color: "var(--violet)" }}>{padre.titulo}</b>
        </Link>
      )}
      <TituloEditable pubId={p.id} titulo={p.titulo} />

      <div className={`grid-meta est-${p.estado}`}>
        <div className="gm"><span className="k">Estado</span><EstadoSelect pubId={p.id} estado={p.estado} tipo={p.tipo} /></div>
        <div className="gm"><span className="k">Responsable</span>
          <RespSelect pubId={p.id} actual={p.responsable} perfiles={perfiles || []} /></div>
        <div className="gm"><span className="k">Fecha límite</span>
          <FechaSelect pubId={p.id} fecha={p.fecha_limite} /></div>
        <div className="gm"><span className="k">Creado</span>
          <span className="v">{fecha(p.creado_en)}<br /><span style={{ color: "var(--muted)", fontWeight: 400 }}>por {p.autor?.nombre}</span></span></div>
      </div>

      <DescripcionEditable pubId={p.id} cuerpo={p.cuerpo || ""} />

      {(p.imagenes || []).length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "4px 0 12px" }}>
          {p.imagenes.map((u: string, i: number) => (
            <a key={i} href={u} target="_blank" rel="noopener noreferrer">
              <img src={u} alt="" style={{ maxHeight: 260, maxWidth: "100%", borderRadius: 12, border: "1px solid var(--border)" }} />
            </a>
          ))}
        </div>
      )}

      {p.tipo === "aviso" && (
        <AvisoEnterado
          pubId={p.id}
          userId={user.id}
          enteradosIds={rxPub.filter((r: any) => r.emoji === "👀").map((r: any) => r.usuario_id)}
          equipo={(perfiles || []).filter((x: any) => x.nombre !== "Bot Qhaway")}
        />
      )}

      <div style={{ margin: "4px 0 12px" }}>
        <Reacciones pubId={p.id} reacciones={rxPub} userId={user.id} />
      </div>

      <div className="linked" style={{ marginTop: 4 }}>
        <h4>🔗 Vínculos y etiquetas</h4>
        <VinculosEditor pubId={p.id} actuales={actualesVinc} catalogos={catEnt} />
        <div style={{ marginTop: 8 }}>
          <EtiquetasEditor pubId={p.id} actuales={etiquetasActuales} todas={etqTodas} />
        </div>
      </div>

      {(!p.padre_id || (hijos || []).length > 0) && (
        <SubCasos padreId={p.id} hijos={hijos || []} />
      )}

      <div className="h4">🕐 Actividad · {linea.length} eventos</div>
      <div className="tl">
        {linea.map((e: any, i: number) => {
          if (e.comentario) {
            const c = e.comentario;
            return (
              <div className="tl-com" key={i}>
                <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={32} src={c.autor?.avatar_url} />
                <div className="bubble">
                  <div className="who">{c.autor?.nombre}<span className="t">{fecha(c.creado_en)}</span></div>
                  {c.responde_a && comMap.get(c.responde_a) && (
                    <div style={{ fontSize: 11, color: "var(--dim)", margin: "1px 0 4px" }}>
                      ↳ en respuesta a <b style={{ color: "var(--violet)" }}>{(comMap.get(c.responde_a) as any)?.autor?.nombre || "un comentario"}</b>
                    </div>
                  )}
                  <ComentarioTexto comentarioId={c.id} pubId={p.id} cuerpo={c.cuerpo || ""}
                    esMio={c.autor_id === user.id} editadoEn={c.editado_en} />
                  {(c.imagenes || []).length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      {c.imagenes.map((u: string, j: number) => (
                        <a key={j} href={u} target="_blank" rel="noopener noreferrer">
                          <img src={u} alt="" style={{ maxHeight: 160, borderRadius: 10, border: "1px solid var(--border)" }} />
                        </a>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <Reacciones pubId={p.id} comentarioId={c.id} reacciones={rxCom.get(c.id) || []} userId={user.id} />
                    <RespuestaBox pubId={p.id} comentarioId={c.id} />
                  </div>
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

      <CommentBox pubId={p.id} userId={user.id} perfiles={perfiles || []} />
    </div>
  );
}
