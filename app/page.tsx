import { createClient } from "@/lib/supabase/server";
import Composer, { type Catalogos } from "@/components/Composer";
import Realtime from "@/components/Realtime";
import Campanita from "@/components/Campanita";
import PostCard from "@/components/PostCard";
import BuscadorGlobal from "@/components/BuscadorGlobal";
import NavIconos from "@/components/NavIconos";
import MenuUsuario from "@/components/MenuUsuario";
import { ICO_ENT, rutaEntidad } from "@/lib/secciones";
import { catalogoObjetos, catalogosEntidades } from "@/lib/catalogos";
import { contarHijos } from "@/lib/familia";
import { plazoDe } from "@/lib/plazo";
import { progresoDe } from "@/lib/progreso";
import { rotuloTipo, colorTipo } from "@/lib/tipos";
import { avisoVencido } from "@/lib/estados";
import { sinBot } from "@/lib/personas";
import {
  COLS_NOTIF, COLS_NUEVAS, faltaAlguna, columnasQueFaltan, sinEstas,
} from "@/lib/notificaciones";
import FiltroMas from "@/components/FiltroMas";
import ListaFeed, { type CardFeed } from "@/components/ListaFeed";
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
/* Sin «📎 Archivos»: el tipo se retiró del compositor, así que ese filtro solo
   podía enseñar historia — y un filtro que siempre da cero enseña a no fiarse
   de los de al lado. Los archivos viejos que haya siguen saliendo en «🌐 Todo»
   y en «🙋 Mis asuntos», con su 📎 intacto. */
const VISTAS_MAS: [string, string][] = [
  ["pago", "💰 Pagos"], ["idea", "💡 Ideas"],
];

export default async function Feed({ searchParams }: { searchParams: { v?: string; link?: string } }) {
  const v = searchParams?.v || "mios";
  const linkParam = searchParams?.link || "";
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const { data: perfil } = await supabase
    .from("perfiles").select("nombre,color,rol,avatar_url,es_admin,es_finanzas").eq("id", user.id).single();

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

  // Avisos que ESTE usuario ya dio por leídos: "me enteré" = reacción 👀 suya.
  // Se ocultan de su feed (siguen visibles para quien aún no los vio, y el
  // aviso se archiva solo cuando lo ve la mayoría).
  const { data: enterData } = await supabase.from("reacciones")
    .select("publicacion_id").eq("usuario_id", user.id).eq("emoji", "👀").is("comentario_id", null);
  const misEnterados = new Set((enterData || []).map((x: any) => x.publicacion_id));

  // Catálogos (pequeños: una consulta cada uno, en paralelo)
  const [ents, pers, etiq, objs, perfs, destQ, postsQ, univQ] = await Promise.all([
    /* Cómo se lee cada entidad en un desplegable lo decide lib/catalogos, no
       esta página: el mismo compositor se abre desde aquí, desde el «+» y
       desde la ficha del caso. */
    catalogosEntidades(supabase),
    // Aparte: el feed necesita el alias suelto para los chips (ver más abajo).
    supabase.from("personas").select("id,nombre,alias").order("nombre"),
    supabase.from("etiquetas").select("id,nombre").order("nombre"),
    /* El repositorio, para poder decir «este caso trata sobre ESTE material».
       Trae el dueño como coletilla: dos objetos se llaman igual con facilidad
       y es de quién son lo que los distingue. */
    catalogoObjetos(supabase),
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
      .neq("tipo", "bitacora")   // las notas del muro solo viven en su proyecto
      .is("archivado_en", null)
      .gt("destacado_hasta", new Date().toISOString())
      .order("fecha_limite", { ascending: true, nullsFirst: false })
      .limit(5),
    (() => {
      let q = supabase.from("publicaciones")
        .select(`
          id, tipo, titulo, cuerpo, estado, prioridad, creado_en, fecha_limite, imagenes, padre_id,
          autor_id, responsable,
          autor:perfiles!publicaciones_autor_id_fkey(nombre, color, avatar_url),
          resp:perfiles!publicaciones_responsable_fkey(nombre),
          comentarios(count),
          vinculos:publicacion_vinculos(entidad_tipo, entidad_id)
        `)
        .is("archivado_en", null)   // lo archivado descansa fuera del feed (ya no es un estado)
        .neq("estado", "descartada") // "ya no aplica": terminó sin hacerse, fuera del feed
        .neq("tipo", "bitacora")     // las notas del muro solo viven en su proyecto
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
      // Universo para los contadores de cada pestaña (independiente del filtro activo).
      // `fecha_limite`: para excluir avisos vencidos igual que en la lista, y que
      // el número de la pestaña cuadre con lo que se ve.
      let q = supabase.from("publicaciones").select("id,tipo,autor_id,responsable,fecha_limite")
        .is("archivado_en", null).neq("estado", "descartada").neq("tipo", "bitacora");
      if (idsOcultos.length) q = q.not("id", "in", `(${idsOcultos.join(",")})`);
      return q.limit(2000);
    })(),
  ]);

  // Familia de cada caso visible: ¿tiene hijos? ¿tiene padre?
  const idsPubs = (postsQ.data || []).map((p: any) => p.id);
  const { data: hijosData } = idsPubs.length
    ? await supabase.from("publicaciones").select("padre_id,estado,archivado_en").in("padre_id", idsPubs)
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
  // El nombre de quién reaccionó, para el acuse en el tooltip. Se resuelve con el
  // mismo catálogo de perfiles ya cargado (perfs), sin otra consulta.
  const nombrePerfil = new Map((perfs.data || []).map((x: any) => [x.id, x.nombre]));
  const reaccsDe = new Map<string, any[]>();
  (reaccs || []).forEach((r: any) => {
    const l = reaccsDe.get(r.publicacion_id) || [];
    l.push({ emoji: r.emoji, usuario_id: r.usuario_id, nombre: nombrePerfil.get(r.usuario_id) }); reaccsDe.set(r.publicacion_id, l);
  });

  // Notificaciones + actividad de Qhaway hoy
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  // Recientes de cada tipo por separado (12 y 12), no 20 mezcladas: así la
  // pestaña "Del Bot" del desplegable tiene contenido aunque lo último sea
  // personal. Desempate por id (varias del mismo lote comparten creado_en).
  const NCAMP = 12;
  /* En función para poder repetirla sin `dafo_id` cuando esa columna todavía no
     existe: PostgREST rechaza la consulta entera, no la columna (ver
     lib/notificaciones.ts → COL_DAFO). */
  const tandaNotif = (cols: string, esBot: boolean) => {
    const q = supabase.from("notificaciones").select(cols).eq("usuario_id", user.id);
    return (esBot ? q.is("actor_nombre", null) : q.not("actor_nombre", "is", null))
      .order("creado_en", { ascending: false }).order("id", { ascending: false }).limit(NCAMP);
  };
  const [{ data: notifPersRaw, error: ePers }, { data: notifBotRaw, error: eBot }, { count: sinLeer }, { count: sinLeerBot }, { count: botHoy }] = await Promise.all([
    tandaNotif(COLS_NOTIF, false),
    tandaNotif(COLS_NOTIF, true),
    // Timbre = solo lo personal sin leer (lo que pide tu acción).
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false).not("actor_nombre", "is", null),
    // Contador propio de las automáticas del Bot sin leer.
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false).is("actor_nombre", null),
    supabase.from("actividad").select("id", { count: "exact", head: true })
      .eq("tipo", "bot").gte("creado_en", hoy.toISOString()),
  ]);
  /* ── SEGUNDO INTENTO, QUITANDO SOLO LO QUE FALTE ──
     Antes esto miraba una sola columna (`dafo_id`) y reintentaba una vez. Con
     once puertas eso ya no vale: si a la base le falta `comprobante_id` porque
     nadie corrió db/rendicion-interaccion.sql, PostgREST rechaza la consulta
     ENTERA y la campanita del feed se queda vacía con el timbre marcando tres.
     Una pantalla que ya funcionaba no puede caerse porque alguien no corrió un
     SQL de otro módulo — es la regla que lib/notificaciones.ts explica en
     `sinEstas`, y que aquí no se había aplicado.
     Se quita lo que la base nombró, no todo lo opcional: renunciar a `dafo_id`
     porque falta otra cosa deja los correos de la casilla sin destino, que fue
     el fallo original. */
  let notifPers: any = notifPersRaw, notifBot: any = notifBotRaw;
  {
    let err: any = ePers || eBot;
    let quitadas: string[] = [];
    for (let i = 0; i < COLS_NUEVAS.length && faltaAlguna(err); i++) {
      const nuevas = columnasQueFaltan(err).filter(c => !quitadas.includes(c));
      if (!nuevas.length) break;
      quitadas = [...quitadas, ...nuevas];
      const cols = sinEstas(COLS_NOTIF, quitadas);
      const [a, b] = await Promise.all([tandaNotif(cols, false), tandaNotif(cols, true)]);
      notifPers = a.data; notifBot = b.data;
      err = a.error || b.error;
    }
  }
  const notifs = [...(notifPers || []), ...(notifBot || [])];

  // ── Mensaje de Qhaway: combina hallazgos reales + cumpleaños + frases decorativas,
  //    elegido al azar (los cumpleaños tienen prioridad). No crea tarjetas: solo informa. ──
  const hoyISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }); // YYYY-MM-DD
  const en60ISO = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const [{ count: cVencidos }, { count: cSinResp }, { count: cSunat }, { count: cDni }, { data: nacim }, { data: postAnio }] =
    await Promise.all([
      supabase.from("publicaciones").select("id", { count: "exact", head: true })
        .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"])
        .is("archivado_en", null)   // un aviso archivado con fecha vencida NO es un vencido
        .not("fecha_limite", "is", null).lt("fecha_limite", hoyISO),
      supabase.from("publicaciones").select("id", { count: "exact", head: true })
        .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"])
        .is("archivado_en", null).is("responsable", null),
      supabase.from("empresas").select("id", { count: "exact", head: true })
        .eq("estado", "activa").not("estado_sunat", "is", null).neq("estado_sunat", "activo"),
      supabase.from("personas").select("id", { count: "exact", head: true })
        .not("dni_vencimiento", "is", null).lte("dni_vencimiento", en60ISO),
      supabase.from("personas").select("nombre,alias,fecha_nacimiento")
        .in("tipo", ["personal", "colaborador"]).not("fecha_nacimiento", "is", null),
      supabase.from("postulaciones")
        .select("estado, proy:proyectos(nombre), conv:convocatorias(anio)")
        .in("estado", ["en_preparacion", "enviada", "en_subsanacion", "finalista", "ganadora"]),
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

  /* Cada combo muestra lo mínimo para NO equivocarse de fila: el nombre, y al
     lado lo que desempata. Apagado (`sub`) cuando es una coletilla del mismo
     nombre —el alias, el año—; como etiqueta (`tipo`) cuando es una
     clasificación que además ordena la lectura. */
  const catalogos: Catalogos = {
    ...(ents as any),
    etiqueta: etiq.data || [],
    objeto: objs || [],
  };

  // Resolver nombre de cada entidad vinculada: mapa "tipo:id" → nombre
  const nombres = new Map<string, string>();
  Object.entries(catalogos).forEach(([t, items]) =>
    items.forEach((it: any) => nombres.set(`${t}:${it.id}`, it.nombre))
  );
  // En los chips del feed, la persona se muestra con su nombre corto (alias)
  // para ocupar menos espacio; el buscador del compositor conserva el completo.
  (pers.data || []).forEach((x: any) => nombres.set(`persona:${x.id}`, x.alias || x.nombre));

  /* Los objetos que el feed necesita NOMBRAR no son los mismos que ofrece para
     ELEGIR. El catálogo trae los 300 más recientes y sin CVs —para el
     desplegable sobra—, pero un caso puede estar vinculado a material más
     viejo: como los chips se filtran por «tiene nombre», ese vínculo
     desaparecía de la tarjeta sin decir nada. Se resuelven aparte, solo los
     que salen en pantalla. */
  {
    const idsObj = [...new Set(
      [...(postsQ.data || []), ...(destQ.data || [])]
        .flatMap((p: any) => p.vinculos || [])
        .filter((v: any) => v.entidad_tipo === "objeto")
        .map((v: any) => v.entidad_id)
        .filter((id: string) => !nombres.has(`objeto:${id}`))
    )];
    if (idsObj.length) {
      const { data } = await supabase.from("objetos").select("id,titulo").in("id", idsObj);
      (data || []).forEach((o: any) => nombres.set(`objeto:${o.id}`, o.titulo));
    }
  }

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

  // Fuera del feed los avisos que YO ya di por leídos (mi 👀). Solo avisos: un
  // 👀 en un caso normal es una reacción, no un acuse.
  const yaVisto = (p: any) => p.tipo === "aviso" && misEnterados.has(p.id);
  // Un aviso VENCIDO (pasó su fecha) ya no rige: fuera del feed, como en el muro.
  const fueraFeed = (p: any) => yaVisto(p) || avisoVencido(p.tipo, p.fecha_limite);
  const posts = (postsQ.data || []).filter((p: any) => !fueraFeed(p));

  /* En "Mis asuntos", igual que en el tablero: PRENDIDO lo que es mi
     responsabilidad, APAGADO lo que me incumbe pero trabaja otro (lo delegué,
     📤) o solo me menciona (👁). En las demás pestañas no aplica —ahí se ven
     casos de todos y apagar por "no es tuyo" apagaría casi todo—. */
  const marcaFoco = (p: any): "delegado" | "mencion" | null => {
    if (v !== "mios") return null;
    if (p.responsable === user.id) return null;   // soy responsable → prendido
    if (p.autor_id === user.id) return "delegado"; // lo pedí yo, lo hace otro
    return "mencion";                              // vinculado a mi persona
  };

  // Contadores por pestaña (sobre el universo no archivado y no oculto, y sin
  // los avisos que ya di por leídos, para que el número cuadre con la lista)
  const misSet = new Set(misVinculadas);
  const U = (univQ.data || []).filter((p: any) => !fueraFeed(p));
  const conteo: Record<string, number> = {
    mios: U.filter((p: any) => p.autor_id === user.id || p.responsable === user.id || misSet.has(p.id)).length,
    todo: U.length,
    problema: U.filter((p: any) => p.tipo === "problema").length,
    tarea: U.filter((p: any) => p.tipo === "tarea").length,
    consulta: U.filter((p: any) => p.tipo === "consulta").length,
    pago: U.filter((p: any) => p.tipo === "pago").length,
    idea: U.filter((p: any) => p.tipo === "idea").length,
    aviso: U.filter((p: any) => p.tipo === "aviso").length,
  };

  return (
    <div className="shell">
      <Realtime tablas={["publicaciones", "comentarios", "publicacion_vinculos", "reacciones", "notificaciones"]} token={session?.access_token} miId={user.id} />
      <div className="topbar">
        <Link href="/" className="logo"><span className="ic">⬡</span><span>CrewHub<sup>+</sup></span></Link>
        <NavIconos />
        <span className="spacer" />
        <BuscadorGlobal />
        <Campanita items={notifsEnriq} sinLeer={sinLeer || 0} sinLeerBot={sinLeerBot || 0} />
        <MenuUsuario nombre={perfil?.nombre} rol={perfil?.rol}
          color={perfil?.color} src={perfil?.avatar_url}
          /* También finanzas: /admin le enseña SOLO el panel de recibos (ver
             app/admin/page.tsx → soloFinanzas), pero sin este enlace no tiene
             por dónde llegar. Se le dio el permiso y se le dejó la pantalla sin
             puerta: el permiso existía, la puerta no, y el síntoma era «no lo
             veo» sin ningún error que lo explicara. */
          esAdmin={!!(perfil?.es_admin || (perfil as any)?.es_finanzas)}
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
                style={{
                  cursor: "pointer", flexDirection: "column", alignItems: "stretch", gap: 0,
                  // Línea de color por tipo: separa un ítem de otro y dice de un
                  // vistazo qué es cada uno (mismo color que su badge).
                  borderLeft: `3px solid ${colorTipo(p.tipo)}`,
                  paddingLeft: 10, borderRadius: 4,
                }}>
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
                        href={rutaEntidad(c.tipo, c.id) || `/entidad/${c.tipo}/${c.id}`}
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

      <ListaFeed items={posts.map((p: any): CardFeed => {
        const tl = rotuloTipo(p.tipo), tc = colorTipo(p.tipo);
        const nc = p.comentarios?.[0]?.count ?? 0;
        const chips = (p.vinculos || [])
          .map((v: any) => ({
            tipo: v.entidad_tipo, id: v.entidad_id,
            nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`),
            ico: ENT_ICO[v.entidad_tipo] || "🔗",
          }))
          .filter((v: any) => v.nombre);
        return {
          id: p.id,
          resuelto: p.estado === "resuelta",
          card: (
            <PostCard
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
              equipoTotal={sinBot(perfs.data).length}
              padreId={p.padre_id || null}
              padreTitulo={p.padre_id ? (tituloPadre.get(p.padre_id) || null) : null}
              hijos={hijosDe.get(p.id) || null}
              marca={marcaFoco(p)}
              /* Sin `ultimoMovimiento`: el feed no carga la bitácora por caso,
                 y no saberlo no es estar detenido (lib/progreso lo respeta). */
              prog={progresoDe({
                creado_en: p.creado_en, fecha_limite: p.fecha_limite,
                estado: p.estado, tipo: p.tipo, hijos: hijosDe.get(p.id) || null,
                // Cuántas hay, para que calle si su ficha usaría ese denominador
                vinculadasTotal: chips.length,
              })}
            />
          ),
        };
      })} />
    </div>
  );
}
