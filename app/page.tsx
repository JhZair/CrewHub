import { createClient } from "@/lib/supabase/server";
import Composer, { type Catalogos } from "@/components/Composer";
import Realtime from "@/components/Realtime";
import Campanita from "@/components/Campanita";
import PostCard from "@/components/PostCard";
import BuscadorGlobal from "@/components/BuscadorGlobal";
import NavIconos from "@/components/NavIconos";
import MenuUsuario from "@/components/MenuUsuario";
import { ICO_ENT } from "@/lib/secciones";
import { contarHijos } from "@/lib/familia";
import { plazoDe } from "@/lib/plazo";
import { rotuloTipo, colorTipo } from "@/lib/tipos";
import FiltroMas from "@/components/FiltroMas";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

/* El feed también se nombra, y no por simetría: es la pestaña que John tiene
   abierta SIEMPRE, así que es la que más se confunde con las otras nueve. Se
   quedó sin título en la primera pasada —hice 24 rutas y me salté la que
   originó el encargo—. El ⬡ es el logo: en una pestaña recortada al mínimo,
   ése es «la casa». */
export const metadata: Metadata = { title: "⬡ Feed" };

/* (TIPO_META salió a lib/tipos: era una de diez copias del mismo mapa.)

   El mismo mapa vivía dos veces con el nombre al revés: `ENT_ICO` aquí e
   `ICO_ENT` en lib/secciones.ts. Y no eran iguales — el de allá sabe que una
   publicación es 📌 y éste no, así que un caso vinculado a otro caso salía con
   el 🔗 de «no sé qué es esto». Se queda el de lib, que además se arma solo
   desde SECCIONES: agregar una entidad nueva no debería obligar a acordarse
   de un mapa de íconos en el feed. */
const ENT_ICO = ICO_ENT;

/* (La cuenta regresiva salió de aquí a lib/plazo: estaba escrita cuatro veces
   con tres umbrales distintos, y la barra del pie de la tarjeta ni miraba los
   días — medía cuánto hacía que se escribió el caso.) */

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
    .from("perfiles").select("nombre,color,rol,avatar_url,es_admin").eq("id", user.id).single();

  // "Mis asuntos" incluye también publicaciones vinculadas a MI PERSONA
  // (gracias al enlace personas.usuario_id ↔ perfil)
  let misVinculadas: string[] = [];
  let miPersonaId: string | null = null;   // para el enlace "Mi perfil"
  {
    const { data: yo } = await supabase.from("personas")
      .select("id").eq("usuario_id", user.id).maybeSingle();
    miPersonaId = yo?.id || null;
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
  const [proy, emp, pers, conv, postu, equi, luga, etiq, perfs, destQ, postsQ, univQ] = await Promise.all([
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
    /* Cabecera del feed: SOLO lo que administración clavó a mano.
       Antes también subía cualquier caso con la fecha límite a menos de 15
       días, y eso no destacaba nada: esos casos ya están en el feed, en el
       tablero, en el mensaje de Chat y con su chip rojo de vencimiento.
       Subirlos aquí era repetirlos, y de paso le quitaba peso al ⭐ para
       cuando de verdad hace falta clavar algo. Si todo destaca, nada destaca.
       Sigue caducando solo: nada que desdestacar. */
    /* `vinculos` es lo que le faltaba: sin ellos, «Cargar PDF de
       Observaciones» no dice de qué proyecto, y «Pampacucho» solo se entiende
       porque alguien tuvo el reflejo de escribirlo en el título. Un caso
       clavado en la cabecera del feed es justo el que menos puede depender de
       que el título esté bien redactado. */
    supabase.from("publicaciones")
      .select(`id,tipo,titulo,estado,fecha_limite,destacado_hasta,
        resp:perfiles!publicaciones_responsable_fkey(nombre),
        vinculos:publicacion_vinculos(entidad_tipo, entidad_id)`)
      .in("estado", ["abierta", "en_progreso", "seguimiento"])
      .gt("destacado_hasta", new Date().toISOString())
      .order("fecha_limite", { ascending: true, nullsFirst: false })
      .limit(5),
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
  const hijosDe = contarHijos(hijosData);
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
        <NavIconos />
        <span className="spacer" />
        <BuscadorGlobal />
        <Campanita items={notifsEnriq} sinLeer={sinLeer || 0} />
        <MenuUsuario nombre={perfil?.nombre} rol={perfil?.rol}
          color={perfil?.color} src={perfil?.avatar_url} esAdmin={perfil?.es_admin}
          personaId={miPersonaId} />
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

      {/* Lo que corre: lo clava administración, y baja solo al caducar.
          Vacío es el estado normal — solo aparece cuando alguien decidió
          que algo no se puede perder. */}
      {(destQ.data || []).length > 0 && (
        <div className="card" style={{ borderColor: "rgba(244,180,0,.35)", background: "rgba(244,180,0,.03)", padding: "8px 14px 10px" }}>
          <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--yellow)", fontWeight: 700, marginBottom: 2 }}>
            📌 Lo que corre
          </div>
          {(destQ.data || []).map((p: any) => {
            /* Este bloque tenía su propia cuenta —con T23:59:59 y el rojo a
               los 3 días— a trescientas líneas de la del feed, que usaba
               T12:00:00 y el rojo a los 2. El mismo caso, en la misma
               pantalla, con dos urgencias distintas según el bloque. */
            const pl = plazoDe(p.fecha_limite, p.estado);
            /* De qué habla. Mismo mecanismo que las tarjetas del feed —el mapa
               `nombres` y `ENT_ICO` ya estaban armados a diez líneas de aquí—,
               solo que este bloque no los usaba. */
            const chips = (p.vinculos || [])
              .map((v: any) => ({
                tipo: v.entidad_tipo, id: v.entidad_id,
                nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`),
                ico: ENT_ICO[v.entidad_tipo] || "🔗",
              }))
              .filter((v: any) => v.nombre);
            return (
              /* Dos líneas, como el buscador y los listados: arriba qué es y
                 cuándo vence; abajo, de qué habla. Los chips en la misma línea
                 competían con el título — que es lo que uno lee primero— y
                 empujaban la fecha al borde.
                 Enlace estirado: la fila entera abre el caso, y cada chip abre
                 su entidad. */
              <div key={p.id} className="info-row fila-cap"
                style={{ cursor: "pointer", flexDirection: "column", alignItems: "stretch", gap: 0 }}>
                <Link href={`/caso/${p.id}`} className="fila-cubre" aria-label={p.titulo} />
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="badge" style={{
                    color: colorTipo(p.tipo),
                    background: `${colorTipo(p.tipo)}22`,
                  }}>{rotuloTipo(p.tipo)}</span>
                  {/* El 📌 servía para separar lo clavado a mano de lo que
                      subía solo por fecha. Ya no sube nada solo: todo lo de
                      aquí lo puso administración, y marcarlo todo no marca. */}
                  <b style={{ fontSize: 13, color: "var(--text)" }}>{p.titulo}</b>
                  <span style={{ flex: 1 }} />
                  {(p.resp as any)?.nombre && (
                    <span className="tv-resp">{(p.resp as any).nombre.split(" ")[0]}</span>
                  )}
                  {pl && (
                    <span style={{ color: pl.color, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {pl.vencido ? `vencido hace ${-pl.d}d`
                        : pl.d === 0 ? "vence hoy" : pl.d === 1 ? "vence mañana" : `en ${pl.d} días`}
                    </span>
                  )}
                </div>
                {chips.length > 0 && (
                  <div className="fila-docs">
                    {chips.map((c: any) => (
                      <Link key={`${c.tipo}:${c.id}`}
                        href={c.tipo === "publicacion" ? `/caso/${c.id}` : `/entidad/${c.tipo}/${c.id}`}
                        className="badge fila-encima" title={`${c.tipo} · ${c.nombre}`}
                        style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)",
                          textTransform: "none", letterSpacing: 0, textDecoration: "none" }}>
                        {c.ico} {c.nombre}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
        const tl = rotuloTipo(p.tipo), tc = colorTipo(p.tipo);
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
            estado={p.estado}
            autorNombre={p.autor?.nombre} autorColor={p.autor?.color} autorSrc={p.autor?.avatar_url}
            fechaStr={new Date(p.creado_en).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" })}
            respNombre={p.resp?.nombre || null}
            avisaSinResp={["tarea", "problema", "pago"].includes(p.tipo)}
            nc={nc}
            plazo={plazoDe(p.fecha_limite, p.estado)}
            cuerpo={p.cuerpo}
            chips={chips}
            pubId={p.id} userId={user.id} reacciones={reaccsDe.get(p.id) || []}
            imagenes={p.imagenes || []}
            creadoEn={p.creado_en}
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
