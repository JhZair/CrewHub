import { createClient } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";
import { Mantenimiento } from "@/components/EntidadForm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

/* PERFIL DE ENTIDAD VIVA — la biografía de un proyecto, empresa,
   persona, equipo, lugar o convocatoria: sus datos + todas sus
   publicaciones vinculadas + su historial de eventos. */

const CONF: Record<string, { tabla: string; icono: string; campos: [string, string][] }> = {
  proyecto: { tabla: "proyectos", icono: "📁", campos: [["Folio", "folio"], ["Tipo", "tipo"], ["Etapa", "etapa"], ["Actividad", "estado_actividad"]] },
  empresa: { tabla: "empresas", icono: "🏢", campos: [["Código", "codigo"], ["Tipo", "tipo"], ["RUC", "ruc"], ["Estado", "estado"]] },
  persona: { tabla: "personas", icono: "👤", campos: [["Alias", "alias"], ["Tipo", "tipo"], ["Equipo", "equipo"], ["Estado", "estado"], ["Región", "region"], ["Rol", "rol"]] },
  equipamiento: { tabla: "equipamiento", icono: "🎥", campos: [["Folio", "folio"], ["Categoría", "categoria"], ["Estado", "estado"]] },
  lugar: { tabla: "lugares", icono: "📍", campos: [] },
  convocatoria: { tabla: "convocatorias", icono: "📜", campos: [["Código", "codigo"], ["Institución", "institucion"], ["Año", "anio"], ["Estado", "estado"]] },
  etiqueta: { tabla: "etiquetas", icono: "🏷️", campos: [] },
};

const ESTADOS: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso",
  resuelta: "Resuelta", archivada: "Archivada",
};
const TIPO_META: Record<string, string> = {
  aviso: "📢", tarea: "✅", problema: "❗", pago: "💰", idea: "💡", archivo: "📎",
};

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Entidad({ params }: { params: { tipo: string; id: string } }) {
  const conf = CONF[params.tipo];
  if (!conf) notFound();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ent } = await supabase.from(conf.tabla).select("*").eq("id", params.id).single();
  if (!ent) notFound();

  const [{ data: vincs }, { data: eventos }] = await Promise.all([
    supabase.from("publicacion_vinculos")
      .select("publicacion_id")
      .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id)
      .limit(200),
    supabase.from("actividad")
      .select("tipo,detalle,creado_en,actor:perfiles(nombre)")
      .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id)
      .order("creado_en", { ascending: false }).limit(10),
  ]);

  const ids = (vincs || []).map((v: any) => v.publicacion_id);
  const { data: pubs } = ids.length
    ? await supabase.from("publicaciones")
        .select("id,titulo,tipo,estado,creado_en,fecha_limite,resp:perfiles!publicaciones_responsable_fkey(nombre)")
        .in("id", ids).order("creado_en", { ascending: false })
    : { data: [] };

  const nombre = ent.nombre || ent.codigo || "—";
  const abiertas = (pubs || []).filter((p: any) => ["abierta", "en_progreso"].includes(p.estado));

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="btn btn-ghost">← Feed</Link>
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          {conf.icono} {params.tipo}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <h1 className="title-lg" style={{ flex: 1 }}>{conf.icono} {nombre}</h1>
        <Mantenimiento tipo={params.tipo} id={params.id} valores={ent} />
      </div>

      {conf.campos.length > 0 && (
        <div className="grid-meta" style={{ gridTemplateColumns: `repeat(${Math.min(conf.campos.length, 4)},1fr)` }}>
          {conf.campos.map(([lbl, key]) => (
            <div className="gm" key={key}>
              <span className="k">{lbl}</span>
              <span className="v">{ent[key] ?? "—"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="h4">🔗 Publicaciones vinculadas · {pubs?.length || 0} en total, {abiertas.length} activas</div>
      {(pubs || []).map((p: any) => (
        <Link key={p.id} href={`/caso/${p.id}`}>
          <div className="card link" style={{ cursor: "pointer", padding: "13px 16px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span>{TIPO_META[p.tipo] || "💬"}</span>
              <b style={{ flex: 1, fontSize: 14 }}>{p.titulo}</b>
              {(p.resp as any)?.nombre && <span className="tv-resp">{(p.resp as any).nombre.split(" ")[0]}</span>}
              <span className={`pill st-${p.estado}`}>{ESTADOS[p.estado] || p.estado}</span>
            </div>
            <div className="meta">{fecha(p.creado_en)}</div>
          </div>
        </Link>
      ))}
      {!pubs?.length && <div className="empty">Aún nada vinculado. La biografía empieza con la primera publicación.</div>}

      {(eventos || []).length > 0 && (
        <>
          <div className="h4">🕐 Historial de la entidad</div>
          <div className="tl">
            {(eventos || []).map((e: any, i: number) => (
              <div className={`tl-ev ${e.actor ? e.tipo : "bot"}`} key={i}>
                <span>{e.tipo === "creado" ? "📝" : e.tipo === "estado" ? "🔄" : "🤖"}</span>
                <span>
                  {e.tipo === "creado" && `${e.actor?.nombre || "Sistema"} registró esta entidad`}
                  {e.tipo === "estado" && `${e.actor?.nombre || "Qhaway"} · ${e.detalle?.campo}: ${e.detalle?.de ?? "—"} → ${e.detalle?.a ?? "—"}`}
                  {!["creado", "estado"].includes(e.tipo) && (e.detalle?.mensaje || e.tipo)}
                </span>
                <span className="t">{fecha(e.creado_en)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
