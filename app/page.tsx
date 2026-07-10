import { createClient } from "@/lib/supabase/server";
import Composer, { type Catalogos } from "@/components/Composer";
import Avatar from "@/components/Avatar";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";
import { redirect } from "next/navigation";

const TIPO_META: Record<string, [string, string]> = {
  aviso: ["📢 Aviso", "#a78bfa"], tarea: ["✅ Tarea", "#22c55e"],
  problema: ["❗ Problema", "#ff4d5e"], pago: ["💰 Pago", "#2dd4bf"],
  idea: ["💡 Idea", "#f4b400"], archivo: ["📎 Archivo", "#3b82f6"],
  conversacion: ["💬 Conversación", "#8b8ba3"],
};
const ESTADOS: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso",
  resuelta: "Resuelta", archivada: "Archivada",
};
const ENT_ICO: Record<string, string> = {
  proyecto: "📁", persona: "👤", convocatoria: "📜",
  equipamiento: "🎥", lugar: "📍", etiqueta: "🏷️",
};

const VISTAS: [string, string][] = [
  ["", "🌐 Todo"], ["mios", "🙋 Mis asuntos"], ["problema", "❗ Problemas"],
  ["tarea", "✅ Tareas"], ["pago", "💰 Pagos"], ["aviso", "📢 Avisos"],
];

export default async function Feed({ searchParams }: { searchParams: { v?: string } }) {
  const v = searchParams?.v || "";
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles").select("nombre,color,rol").eq("id", user.id).single();


  // Catálogos (pequeños: una consulta cada uno, en paralelo)
  const [proy, pers, conv, equi, luga, etiq, perfs, postsQ] = await Promise.all([
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    supabase.from("personas").select("id,nombre,tipo").order("nombre"),
    supabase.from("convocatorias").select("id,codigo,nombre").order("codigo"),
    supabase.from("equipamiento").select("id,nombre").order("nombre"),
    supabase.from("lugares").select("id,nombre").order("nombre"),
    supabase.from("etiquetas").select("id,nombre").order("nombre"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
    (() => {
      let q = supabase.from("publicaciones")
        .select(`
          id, tipo, titulo, cuerpo, estado, prioridad, creado_en,
          autor:perfiles!publicaciones_autor_id_fkey(nombre, color),
          resp:perfiles!publicaciones_responsable_fkey(nombre),
          comentarios(count),
          vinculos:publicacion_vinculos(entidad_tipo, entidad_id)
        `)
        .order("creado_en", { ascending: false })
        .limit(50);
      if (v === "mios") q = q.or(`autor_id.eq.${user.id},responsable.eq.${user.id}`);
      else if (v) q = q.eq("tipo", v);
      return q;
    })(),
  ]);

  const catalogos: Catalogos = {
    proyecto: proy.data || [],
    persona: pers.data || [],
    convocatoria: (conv.data || []).map((c: any) => ({ id: c.id, nombre: `${c.codigo} · ${c.nombre}` })),
    equipamiento: equi.data || [],
    lugar: luga.data || [],
    etiqueta: etiq.data || [],
  };

  // Resolver nombre de cada entidad vinculada: mapa "tipo:id" → nombre
  const nombres = new Map<string, string>();
  Object.entries(catalogos).forEach(([t, items]) =>
    items.forEach((it: any) => nombres.set(`${t}:${it.id}`, it.nombre))
  );

  const posts = postsQ.data || [];

  return (
    <div className="shell">
      <div className="topbar">
        <div className="logo"><span className="ic">⬡</span><span>CrewHub<sup>+</sup></span></div>
        <span className="spacer" />
        <div className="userbox">
          <Avatar nombre={perfil?.nombre} color={perfil?.color} size={32} />
          <span><b style={{ color: "var(--text)" }}>{perfil?.nombre}</b><br />{perfil?.rol || "Equipo"}</span>
        </div>
        <Link href="/importar" className="btn btn-ghost" title="Importar desde Seatable">⬆</Link>
        <LogoutButton />
      </div>

      <div className="vtabs">
        {VISTAS.map(([val, label]) => (
          <Link key={val} href={val ? `/?v=${val}` : "/"}
            className={`vtab ${v === val ? "on" : ""}`}>{label}</Link>
        ))}
      </div>

      <Composer userId={user.id} catalogos={catalogos} perfiles={perfs.data || []} />

      {posts.map((p: any) => {
        const [tl, tc] = TIPO_META[p.tipo] || TIPO_META.conversacion;
        const nc = p.comentarios?.[0]?.count ?? 0;
        const chips = (p.vinculos || [])
          .map((v: any) => ({ ...v, nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`) }))
          .filter((v: any) => v.nombre);
        return (
          <Link key={p.id} href={`/caso/${p.id}`}>
            <div className="card link" style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Avatar nombre={p.autor?.nombre} color={p.autor?.color} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 15 }}>{p.titulo}</b>
                    <span className="badge" style={{ color: tc, background: `${tc}22` }}>{tl}</span>
                    <span style={{ flex: 1 }} />
                    <span className={`pill st-${p.estado}`}>{ESTADOS[p.estado] || p.estado}</span>
                  </div>
                  <div className="meta">
                    <span>{new Date(p.creado_en).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span>•</span><span>Por <b>{p.autor?.nombre}</b></span>
                    {p.resp
                      ? <><span>•</span><span>→ Responsable: <b style={{ color: "var(--teal)" }}>{p.resp.nombre}</b></span></>
                      : ["tarea", "problema", "pago"].includes(p.tipo) &&
                        <><span>•</span><span style={{ color: "var(--yellow)" }}>⚠ sin responsable</span></>}
                    <span>•</span><span>💬 {nc}</span>
                  </div>
                  {p.cuerpo && <p style={{ color: "#c6c6da", fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{p.cuerpo.slice(0, 180)}{p.cuerpo.length > 180 ? "…" : ""}</p>}
                  {chips.length > 0 && (
                    <div className="sel-chips" style={{ marginTop: 9 }}>
                      {chips.map((v: any, i: number) => (
                        <span key={i} className="echip">
                          {ENT_ICO[v.entidad_tipo] || "🔗"} {v.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
      {!posts.length && <div className="empty">Nada en esta vista todavía.</div>}
    </div>
  );
}
