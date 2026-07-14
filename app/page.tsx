import { createClient } from "@/lib/supabase/server";
import Composer, { type Catalogos } from "@/components/Composer";
import Realtime from "@/components/Realtime";
import Campanita from "@/components/Campanita";
import PostCard from "@/components/PostCard";
import BuscadorGlobal from "@/components/BuscadorGlobal";
import MenuUsuario from "@/components/MenuUsuario";
import FiltroMas from "@/components/FiltroMas";
import Link from "next/link";
import { redirect } from "next/navigation";

const TIPO_META: Record<string, [string, string]> = {
  aviso: ["📢 Aviso", "#a78bfa"], tarea: ["✅ Tarea", "#22c55e"],
  problema: ["❗ Problema", "#ff4d5e"], consulta: ["❓ Consulta", "#60a5fa"],
  pago: ["💰 Pago", "#2dd4bf"], idea: ["💡 Idea", "#f4b400"],
  archivo: ["📎 Archivo", "#3b82f6"], conversacion: ["💬 Conversación", "#8b8ba3"],
};
const ESTADOS: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso", seguimiento: "🔭 Seguimiento",
  en_pausa: "En Pausa", resuelta: "Resuelta", archivada: "Archivada",
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
  ["mios", "🙋 Mis asuntos"], ["tarea", "✅ Tareas"], ["problema", "❗ Problemas"],
  ["consulta", "❓ Consultas"], ["aviso", "📢 Avisos"], ["todo", "🌐 Todo"],
];
// Filtros menos usados → van al desplegable "⋯ Más"
const VISTAS_MAS: [string, string][] = [
  ["pago", "💰 Pagos"], ["idea", "💡 Ideas"], ["archivo", "📎 Archivos"],
];

export default async function Feed({ searchParams }: { searchParams: { v?: string; link?: string } }) {
  const v = searchParams?.v || "mios";
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
  {
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

  // Casos que ESTE usuario ocultó de su feed (resueltos que ya no quiere ver)
  const { data: ocultosData } = await supabase.from("feed_ocultos")
    .select("publicacion_id").eq("usuario_id", user.id);
  const idsOcultos = (ocultosData || []).map((x: any) => x.publicacion_id);

  // Catálogos (pequeños: una consulta cada uno, en paralelo)
  const [proy, emp, pers, conv, postu, equi, luga, etiq, perfs, postsQ, univQ] = await Promise.all([
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    supabase.from("empresas").select("id,nombre,codigo").order("codigo"),
    supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
    supabase.from("convocatorias").select("id,codigo,nombre,anio")
      .order("anio", { ascending: false }).order("codigo"),
    supabase.from("postulaciones").select("id,codigo,proy:proyectos(nombre),conv:convocatorias(codigo)"),
    supabase.from("equipamiento").select("id,nombre,folio").order("folio"),
    supabase.from("lugares").select("id,nombre").order("nombre"),
    supabase.from("etiquetas").select("id,nombre").order("nombre"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
    (() => {
      let q = supabase.from("publicaciones")
        .select(`
          id, tipo, titulo, cuerpo, estado, prioridad, creado_en, fecha_limite, imagenes, padre_id,
          autor:perfiles!publicaciones_autor_id_fkey(nombre, color, avatar_url),
          resp:perfiles!publicaciones_responsable_fkey(nombre),
          comentarios(count),
          vinculos:publicacion_vinculos(entidad_tipo, entidad_id)
        `)
        .neq("estado", "archivada")   // lo archivado descansa fuera del feed
        .order("creado_en", { ascending: false })
        .limit(50);
      if (idsOcultos.length) q = q.not("id", "in", `(${idsOcultos.join(",")})`);
      if (v === "mios") {
        const cond = [`autor_id.eq.${user.id}`, `responsable.eq.${user.id}`];
        if (misVinculadas.length) cond.push(`id.in.(${misVinculadas.join(",")})`);
        q = q.or(cond.join(","));
      }
      else if (v && v !== "todo") q = q.eq("tipo", v);
      return q;
    })(),
    (() => {
      // Universo para los contadores de cada pestaña (independiente del filtro activo)
      let q = supabase.from("publicaciones").select("id,tipo,autor_id,responsable").neq("estado", "archivada");
      if (idsOcultos.length) q = q.not("id", "in", `(${idsOcultos.join(",")})`);
      return q.limit(2000);
    })(),
  ]);

  // Familia de cada caso visible: ¿tiene hijos? ¿tiene padre?
  const idsPubs = (postsQ.data || []).map((p: any) => p.id);
  const { data: hijosData } = idsPubs.length
    ? await supabase.from("publicaciones").select("padre_id,estado").in("padre_id", idsPubs)
    : { data: [] };
  const hijosDe = new Map<string, { total: number; ok: number }>();
  (hijosData || []).forEach((h: any) => {
    const m = hijosDe.get(h.padre_id) || { total: 0, ok: 0 };
    m.total++;
    if (["resuelta", "archivada"].includes(h.estado)) m.ok++;
    hijosDe.set(h.padre_id, m);
  });
  // Títulos de padres que no están en la página del feed
  const idsPadres = [...new Set((postsQ.data || [])
    .map((p: any) => p.padre_id).filter(Boolean)
    .filter((id: string) => !idsPubs.includes(id)))];
  const { data: padresExt } = idsPadres.length
    ? await supabase.from("publicaciones").select("id,titulo").in("id", idsPadres)
    : { data: [] };
  const tituloPadre = new Map<string, string>();
  (postsQ.data || []).forEach((p: any) => tituloPadre.set(p.id, p.titulo));
  (padresExt || []).forEach((p: any) => tituloPadre.set(p.id, p.titulo));
  const { data: reaccs } = idsPubs.length
    ? await supabase.from("reacciones")
        .select("publicacion_id,emoji,usuario_id")
        .is("comentario_id", null).in("publicacion_id", idsPubs)
    : { data: [] };
  const reaccsDe = new Map<string, any[]>();
  (reaccs || []).forEach((r: any) => {
    const l = reaccsDe.get(r.publicacion_id) || [];
    l.push(r); reaccsDe.set(r.publicacion_id, l);
  });

  // Notificaciones + actividad de Qhaway hoy
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [{ data: notifs }, { count: sinLeer }, { count: botHoy }] = await Promise.all([
    supabase.from("notificaciones")
      .select("id,tipo,mensaje,actor_nombre,publicacion_id,leida,creado_en")
      .eq("usuario_id", user.id)
      .order("creado_en", { ascending: false }).limit(12),
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false),
    supabase.from("actividad").select("id", { count: "exact", head: true })
      .eq("tipo", "bot").gte("creado_en", hoy.toISOString()),
  ]);

  // ── Mensaje de Qhaway: combina hallazgos reales + cumpleaños + frases decorativas,
  //    elegido al azar (los cumpleaños tienen prioridad). No crea tarjetas: solo informa. ──
  const hoyISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }); // YYYY-MM-DD
  const en60ISO = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const [{ count: cVencidos }, { count: cSinResp }, { count: cSunat }, { count: cDni }, { data: nacim }, { data: postAnio }] =
    await Promise.all([
      supabase.from("publicaciones").select("id", { count: "exact", head: true })
        .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"])
        .not("fecha_limite", "is", null).lt("fecha_limite", hoyISO),
      supabase.from("publicaciones").select("id", { count: "exact", head: true })
        .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"]).is("responsable", null),
      supabase.from("empresas").select("id", { count: "exact", head: true })
        .eq("estado", "activa").not("estado_sunat", "is", null).neq("estado_sunat", "activo"),
      supabase.from("personas").select("id", { count: "exact", head: true })
        .not("dni_vencimiento", "is", null).lte("dni_vencimiento", en60ISO),
      supabase.from("personas").select("nombre,alias,fecha_nacimiento")
        .in("tipo", ["personal", "colaborador"]).not("fecha_nacimiento", "is", null),
      supabase.from("postulaciones")
        .select("estado, proy:proyectos(nombre), conv:convocatorias(anio)")
        .in("estado", ["en_preparacion", "enviada", "finalista", "ganadora"]),
    ]);

  // 🎂 Cumpleaños de hoy (compara mes-día)
  const hoyMD = hoyISO.slice(5);
  const cumples: string[] = (nacim || [])
    .filter((p: any) => (p.fecha_nacimiento || "").slice(5) === hoyMD)
    .map((p: any) => `🎂 ¡Hoy cumple años ${p.alias || (p.nombre || "").split(" ")[0]}! Que no falte el saludo, Kawsay 🎉`);

  // 🔎 Hallazgos reales (solo los que existen)
  const hallazgos: string[] = [];
  if (cVencidos) hallazgos.push(`⏰ Hay ${cVencidos} caso${cVencidos === 1 ? "" : "s"} vencido${cVencidos === 1 ? "" : "s"} — un vistazo no cae mal.`);
  if (cSinResp) hallazgos.push(`🙋 ${cSinResp} caso${cSinResp === 1 ? "" : "s"} sin responsable — un caso huérfano es de todos.`);
  if (cSunat) hallazgos.push(`🏢 ${cSunat} empresa${cSunat === 1 ? "" : "s"} con alerta SUNAT — regularizar antes de postular.`);
  if (cDni) hallazgos.push(`🪪 ${cDni} DNI por vencer — renovar a tiempo evita sustos.`);
  if (botHoy) hallazgos.push(`📝 Hoy dejé ${botHoy} apunte${botHoy === 1 ? "" : "s"} en mi ronda.`);

  // 🍀 Buenas vibras a las postulaciones del año en curso (más ánimo mientras más avanzan)
  const anioActual = new Date().getFullYear();
  const vibras: string[] = [];
  for (const p of (postAnio || []) as any[]) {
    if (p.conv?.anio !== anioActual) continue;
    const nom = p.proy?.nombre || "un proyecto";
    if (p.estado === "ganadora") {
      const m = `🏆 ¡${nom} ganó su fondo ${anioActual}! Orgullo Kawsay — a celebrarlo. 🎉`;
      vibras.push(m, m, m); // los ganadores brillan más
    } else if (p.estado === "finalista") {
      const m = `🌟 ${nom} es finalista ${anioActual} — ya casi, un último empujón. 💪`;
      vibras.push(m, m);
    } else {
      vibras.push(`✨ ${nom} va por el fondo ${anioActual} — buenas vibras para esa postulación. 🍀`);
    }
  }

  // 💬 Frases decorativas (siempre presentes en la mezcla)
  const DECORATIVAS = [
    "Nada se pierde mientras yo mire. 👁",
    "Lo que mañana importa, hoy se publica.",
    "Vigilo los plazos para que ustedes vigilen el arte.",
    "Mi ronda fue tranquila. Sigan así, Kawsay.",
    "Recuerden: el chat coordina, CrewHub+ recuerda.",
    "Cada vínculo de hoy es una respuesta instantánea en el futuro.",
    "Menos tarjetas abiertas, más calma — cerrar también es avanzar.",
    "Un feed corto es un equipo tranquilo. No acumulen, resuelvan.",
  ];

  const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)];
  const fraseQhaway: string = cumples.length
    ? pick(cumples)                                              // el cumpleaños manda
    : pick([...hallazgos, ...hallazgos, ...vibras, ...DECORATIVAS]); // hallazgos y vibras con más peso

  const catalogos: Catalogos = {
    proyecto: proy.data || [],
    empresa: (emp.data || []).map((e: any) => ({ id: e.id, nombre: e.codigo ? `${e.codigo} · ${e.nombre}` : e.nombre })),
    persona: (pers.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre })),
    convocatoria: (conv.data || []).map((c: any) => ({
      id: c.id,
      nombre: `${c.anio ? `${c.anio} · ` : ""}${c.nombre} · ${c.codigo}`,
    })),
    postulacion: (postu.data || []).map((p: any) => ({
      id: p.id,
      nombre: `${p.codigo || p.conv?.codigo || "🎯"} · ${p.proy?.nombre || "postulación"}`,
    })),
    equipamiento: (equi.data || []).map((x: any) => ({
      id: x.id, nombre: x.folio ? `${x.folio} · ${x.nombre}` : x.nombre,
    })),
    lugar: luga.data || [],
    etiqueta: etiq.data || [],
  };

  // Resolver nombre de cada entidad vinculada: mapa "tipo:id" → nombre
  const nombres = new Map<string, string>();
  Object.entries(catalogos).forEach(([t, items]) =>
    items.forEach((it: any) => nombres.set(`${t}:${it.id}`, it.nombre))
  );
  // En los chips del feed, la persona se muestra con su nombre corto (alias)
  // para ocupar menos espacio; el buscador del compositor conserva el completo.
  (pers.data || []).forEach((x: any) => nombres.set(`persona:${x.id}`, x.alias || x.nombre));

  // Contexto para las notificaciones: vínculos de entidad de cada caso notificado
  const idsNotif = [...new Set((notifs || []).map((n: any) => n.publicacion_id).filter(Boolean))];
  const { data: vincNotif } = idsNotif.length
    ? await supabase.from("publicacion_vinculos")
        .select("publicacion_id,entidad_tipo,entidad_id").in("publicacion_id", idsNotif)
    : { data: [] };
  const vincDe = new Map<string, { tipo: string; nombre: string }[]>();
  (vincNotif || []).forEach((v: any) => {
    const nombre = nombres.get(`${v.entidad_tipo}:${v.entidad_id}`);
    if (!nombre) return;
    const l = vincDe.get(v.publicacion_id) || [];
    l.push({ tipo: v.entidad_tipo, nombre });
    vincDe.set(v.publicacion_id, l);
  });
  const notifsEnriq = (notifs || []).map((n: any) => ({
    ...n, vinculos: n.publicacion_id ? (vincDe.get(n.publicacion_id) || []) : [],
  }));

  const posts = postsQ.data || [];

  // Contadores por pestaña (sobre el universo no archivado y no oculto)
  const misSet = new Set(misVinculadas);
  const U = univQ.data || [];
  const conteo: Record<string, number> = {
    mios: U.filter((p: any) => p.autor_id === user.id || p.responsable === user.id || misSet.has(p.id)).length,
    todo: U.length,
    problema: U.filter((p: any) => p.tipo === "problema").length,
    tarea: U.filter((p: any) => p.tipo === "tarea").length,
    consulta: U.filter((p: any) => p.tipo === "consulta").length,
    pago: U.filter((p: any) => p.tipo === "pago").length,
    idea: U.filter((p: any) => p.tipo === "idea").length,
    archivo: U.filter((p: any) => p.tipo === "archivo").length,
    aviso: U.filter((p: any) => p.tipo === "aviso").length,
  };

  return (
    <div className="shell">
      <Realtime tablas={["publicaciones", "comentarios", "publicacion_vinculos", "reacciones", "notificaciones"]} token={session?.access_token} />
      <div className="topbar">
        <Link href="/" className="logo"><span className="ic">⬡</span><span>CrewHub<sup>+</sup></span></Link>
        <nav className="nav-icons">
          <Link href="/proyectos" className="btn btn-ghost" title="Proyectos">📁</Link>
          <Link href="/empresas" className="btn btn-ghost" title="Empresas">🏢</Link>
          <Link href="/personas" className="btn btn-ghost" title="Personas">👤</Link>
          <Link href="/postulaciones" className="btn btn-ghost" title="Postulaciones">🎯</Link>
          <Link href="/equipamiento" className="btn btn-ghost" title="Equipos audiovisuales">🎥</Link>
          <Link href="/convocatorias" className="btn btn-ghost" title="Convocatorias y fondos">📜</Link>
        </nav>
        <span className="spacer" />
        <BuscadorGlobal />
        <Campanita items={notifsEnriq} sinLeer={sinLeer || 0} />
        <MenuUsuario nombre={perfil?.nombre} rol={perfil?.rol}
          color={perfil?.color} src={perfil?.avatar_url} />
      </div>

      <Composer userId={user.id} catalogos={catalogos} perfiles={perfs.data || []}
        inicial={(() => {
          if (!linkParam) return undefined;
          const [t, i] = linkParam.split(":");
          const n = nombres.get(`${t}:${i}`);
          return n ? [{ tipo: t, id: i, nombre: n }] : undefined;
        })()} />

      <div className="qhaway-tira">
        <span className="qa">🤖</span>
        <span style={{ flex: 1 }}>
          <b>Bot Qhaway</b>: <i style={{ color: "var(--muted)" }}>{fraseQhaway}</i>
        </span>
        <Link href="/qhaway" title="Ver mi bitácora">bitácora →</Link>
      </div>

      <div className="vtabs vtabs-compacta">
        {VISTAS.map(([val, label]) => (
          <Link key={val} href={val === "mios" ? "/" : `/?v=${val}`}
            className={`vtab ${v === val ? "on" : ""}`}>
            {label} <span className="vtab-n">{conteo[val] ?? 0}</span>
          </Link>
        ))}
        <FiltroMas v={v} items={VISTAS_MAS.map(([val, label]) => ({ val, label, n: conteo[val] ?? 0 }))} />
      </div>

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
            tipo={p.tipo} tipoLabel={tl} tipoColor={tc}
            estado={p.estado} estadoTxt={ESTADOS[p.estado] || p.estado}
            autorNombre={p.autor?.nombre} autorColor={p.autor?.color} autorSrc={p.autor?.avatar_url}
            fechaStr={new Date(p.creado_en).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" })}
            respNombre={p.resp?.nombre || null}
            avisaSinResp={["tarea", "problema", "pago"].includes(p.tipo)}
            nc={nc}
            venc={vencimiento(p.fecha_limite, p.estado)}
            cuerpo={p.cuerpo}
            chips={chips}
            pubId={p.id} userId={user.id} reacciones={reaccsDe.get(p.id) || []}
            imagenes={p.imagenes || []}
            creadoEn={p.creado_en}
            fechaLimite={p.fecha_limite}
            equipoTotal={(perfs.data || []).filter((x: any) => x.nombre !== "Bot Qhaway").length}
            padreId={p.padre_id || null}
            padreTitulo={p.padre_id ? (tituloPadre.get(p.padre_id) || null) : null}
            hijos={hijosDe.get(p.id) || null}
          />
        );
      })}
      {!posts.length && <div className="empty">Nada en esta vista todavía.</div>}
    </div>
  );
}
