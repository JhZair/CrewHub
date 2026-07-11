import { createClient } from "@/lib/supabase/server";
import Composer, { type Catalogos } from "@/components/Composer";
import Realtime from "@/components/Realtime";
import Campanita from "@/components/Campanita";
import PostCard from "@/components/PostCard";
import BuscadorGlobal from "@/components/BuscadorGlobal";
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
  abierta: "Sin Resolver", en_progreso: "En Progreso", en_pausa: "En Pausa",
  resuelta: "Resuelta", archivada: "Archivada",
};
const ENT_ICO: Record<string, string> = {
  proyecto: "📁", empresa: "🏢", persona: "👤", convocatoria: "📜",
  postulacion: "🎯", equipamiento: "🎥", lugar: "📍", etiqueta: "🏷️",
};

/* Cuenta regresiva de fecha límite: [texto, color] */
function vencimiento(fecha: string | null, estado: string): [string, string] | null {
  if (!fecha || ["resuelta", "archivada"].includes(estado)) return null;
  const d = Math.ceil((new Date(fecha + "T12:00:00").getTime() - Date.now()) / 86400000);
  if (d < 0) return [`⏱ VENCIDO hace ${Math.abs(d)} día${Math.abs(d) === 1 ? "" : "s"}`, "var(--red)"];
  if (d === 0) return ["⏱ VENCE HOY", "var(--red)"];
  if (d <= 2) return [`⏱ vence en ${d} día${d === 1 ? "" : "s"}`, "var(--red)"];
  if (d <= 7) return [`⏱ vence en ${d} días`, "var(--yellow)"];
  return [`⏱ vence en ${d} días`, "var(--dim)"];
}

const VISTAS: [string, string][] = [
  ["", "🌐 Todo"], ["mios", "🙋 Mis asuntos"], ["problema", "❗ Problemas"],
  ["tarea", "✅ Tareas"], ["pago", "💰 Pagos"], ["aviso", "📢 Avisos"],
];

export default async function Feed({ searchParams }: { searchParams: { v?: string; link?: string } }) {
  const v = searchParams?.v || "";
  const linkParam = searchParams?.link || "";
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const { data: perfil } = await supabase
    .from("perfiles").select("nombre,color,rol,avatar_url").eq("id", user.id).single();

  // "Mis asuntos" incluye también publicaciones vinculadas a MI PERSONA
  // (gracias al enlace personas.usuario_id ↔ perfil)
  let misVinculadas: string[] = [];
  if (v === "mios") {
    const { data: yo } = await supabase.from("personas")
      .select("id").eq("usuario_id", user.id).maybeSingle();
    if (yo) {
      const { data: vs } = await supabase.from("publicacion_vinculos")
        .select("publicacion_id")
        .eq("entidad_tipo", "persona").eq("entidad_id", yo.id)
        .limit(300);
      misVinculadas = (vs || []).map((x: any) => x.publicacion_id);
    }
  }


  // Catálogos (pequeños: una consulta cada uno, en paralelo)
  const [proy, emp, pers, conv, postu, equi, luga, etiq, perfs, postsQ] = await Promise.all([
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    supabase.from("empresas").select("id,nombre,codigo").order("codigo"),
    supabase.from("personas").select("id,nombre,tipo").order("nombre"),
    supabase.from("convocatorias").select("id,codigo,nombre").order("codigo"),
    supabase.from("postulaciones").select("id,codigo,proy:proyectos(nombre),conv:convocatorias(codigo)"),
    supabase.from("equipamiento").select("id,nombre").order("nombre"),
    supabase.from("lugares").select("id,nombre").order("nombre"),
    supabase.from("etiquetas").select("id,nombre").order("nombre"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
    (() => {
      let q = supabase.from("publicaciones")
        .select(`
          id, tipo, titulo, cuerpo, estado, prioridad, creado_en, fecha_limite,
          autor:perfiles!publicaciones_autor_id_fkey(nombre, color, avatar_url),
          resp:perfiles!publicaciones_responsable_fkey(nombre),
          comentarios(count),
          vinculos:publicacion_vinculos(entidad_tipo, entidad_id)
        `)
        .order("creado_en", { ascending: false })
        .limit(50);
      if (v === "mios") {
        const cond = [`autor_id.eq.${user.id}`, `responsable.eq.${user.id}`];
        if (misVinculadas.length) cond.push(`id.in.(${misVinculadas.join(",")})`);
        q = q.or(cond.join(","));
      }
      else if (v) q = q.eq("tipo", v);
      return q;
    })(),
  ]);

  // Notificaciones + actividad de Qhaway hoy
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [{ data: notifs }, { count: sinLeer }, { count: botHoy }] = await Promise.all([
    supabase.from("notificaciones")
      .select("id,tipo,mensaje,publicacion_id,leida,creado_en")
      .eq("usuario_id", user.id)
      .order("creado_en", { ascending: false }).limit(12),
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false),
    supabase.from("actividad").select("id", { count: "exact", head: true })
      .eq("tipo", "bot").gte("creado_en", hoy.toISOString()),
  ]);

  const FRASES = [
    "Nada se pierde mientras yo mire. 👁",
    "Un caso sin responsable es un caso huérfano — adopten uno hoy.",
    "Lo que mañana importa, hoy se publica.",
    "Vigilo los plazos para que ustedes vigilen el arte.",
    "Mi ronda fue tranquila. Sigan así, Kawsay.",
    "Recuerden: el chat coordina, CrewHub+ recuerda.",
    "Cada vínculo de hoy es una respuesta instantánea en el futuro.",
  ];
  const fraseQhaway = FRASES[new Date().getDay() % FRASES.length];

  const catalogos: Catalogos = {
    proyecto: proy.data || [],
    empresa: (emp.data || []).map((e: any) => ({ id: e.id, nombre: e.codigo ? `${e.codigo} · ${e.nombre}` : e.nombre })),
    persona: pers.data || [],
    convocatoria: (conv.data || []).map((c: any) => ({ id: c.id, nombre: `${c.codigo} · ${c.nombre}` })),
    postulacion: (postu.data || []).map((p: any) => ({
      id: p.id,
      nombre: `${p.codigo || p.conv?.codigo || "🎯"} · ${p.proy?.nombre || "postulación"}`,
    })),
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
      <Realtime tablas={["publicaciones", "comentarios", "publicacion_vinculos"]} token={session?.access_token} />
      <div className="topbar">
        <Link href="/" className="logo"><span className="ic">⬡</span><span>CrewHub<sup>+</sup></span></Link>
        <nav className="nav-icons">
          <Link href="/proyectos" className="btn btn-ghost" title="Proyectos">📁</Link>
          <Link href="/empresas" className="btn btn-ghost" title="Empresas">🏢</Link>
          <Link href="/personas" className="btn btn-ghost" title="Personas">👤</Link>
          <Link href="/equipamiento" className="btn btn-ghost" title="Equipos audiovisuales">🎥</Link>
          <Link href="/convocatorias" className="btn btn-ghost" title="Convocatorias y fondos">📜</Link>
          <Link href="/postulaciones" className="btn btn-ghost" title="Postulaciones">🎯</Link>
          <Link href="/importar" className="btn btn-ghost" title="Importar desde Seatable">⬆</Link>
        </nav>
        <span className="spacer" />
        <BuscadorGlobal />
        <Campanita items={notifs || []} sinLeer={sinLeer || 0} />
        <div className="userbox">
          <Avatar nombre={perfil?.nombre} color={perfil?.color} size={34} src={perfil?.avatar_url} />
          <span><b style={{ color: "var(--text)" }}>{perfil?.nombre}</b><br />{perfil?.rol || "Equipo"}</span>
        </div>
        <LogoutButton />
      </div>

      <div className="qhaway-tira">
        <span className="qa">🤖</span>
        <span style={{ flex: 1 }}>
          <b>Qhaway</b>: {botHoy ? `hoy dejé ${botHoy} apunte${botHoy === 1 ? "" : "s"} en mi ronda. ` : "ronda matutina al día. "}
          <i style={{ color: "var(--muted)" }}>{fraseQhaway}</i>
        </span>
        <Link href="/qhaway">ver mi bitácora →</Link>
      </div>

      <div className="vtabs">
        {VISTAS.map(([val, label]) => (
          <Link key={val} href={val ? `/?v=${val}` : "/"}
            className={`vtab ${v === val ? "on" : ""}`}>{label}</Link>
        ))}
        <Link href="/tablero" className="vtab" style={{ marginLeft: "auto" }}>🗂 Tablero</Link>
      </div>

      <Composer userId={user.id} catalogos={catalogos} perfiles={perfs.data || []}
        inicial={(() => {
          if (!linkParam) return undefined;
          const [t, i] = linkParam.split(":");
          const n = nombres.get(`${t}:${i}`);
          return n ? [{ tipo: t, id: i, nombre: n }] : undefined;
        })()} />

      {posts.map((p: any) => {
        const [tl, tc] = TIPO_META[p.tipo] || TIPO_META.conversacion;
        const nc = p.comentarios?.[0]?.count ?? 0;
        const chips = (p.vinculos || [])
          .map((v: any) => ({
            tipo: v.entidad_tipo, id: v.entidad_id,
            nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`),
            ico: ENT_ICO[v.entidad_tipo] || "🔗",
          }))
          .filter((v: any) => v.nombre);
        return (
          <PostCard key={p.id}
            href={`/caso/${p.id}`}
            titulo={p.titulo}
            tipoLabel={tl} tipoColor={tc}
            estado={p.estado} estadoTxt={ESTADOS[p.estado] || p.estado}
            autorNombre={p.autor?.nombre} autorColor={p.autor?.color} autorSrc={p.autor?.avatar_url}
            fechaStr={new Date(p.creado_en).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            respNombre={p.resp?.nombre || null}
            avisaSinResp={["tarea", "problema", "pago"].includes(p.tipo)}
            nc={nc}
            venc={vencimiento(p.fecha_limite, p.estado)}
            cuerpo={p.cuerpo}
            chips={chips}
          />
        );
      })}
      {!posts.length && <div className="empty">Nada en esta vista todavía.</div>}
    </div>
  );
}
