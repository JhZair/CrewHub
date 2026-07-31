import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Agenda, { type ItemAgenda } from "@/components/Agenda";
import Realtime from "@/components/Realtime";
import { sinBot } from "@/lib/personas";
import { avisoVencido } from "@/lib/estados";

export const metadata: Metadata = { title: "📅 Agenda" };

/* AGENDA — todo lo que tiene fecha, en un solo sitio.
   Junta dos cosas que hasta ahora vivían separadas: las actividades de TODOS
   los cronogramas (de cada proyecto/convocatoria) y los casos vivos con fecha
   límite. Dos vistas: línea de tiempo (barras por proyecto) y calendario
   mensual. Se carga todo y se filtra en el cliente —es poca data (unas
   decenas de actividades y ~25 casos) y así el filtro por persona y el cambio
   de vista son instantáneos. */

const VIVOS = ["abierta", "en_progreso", "seguimiento", "en_pausa"];

export default async function AgendaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const [{ data: acts }, { data: casos }, { data: perfs }] = await Promise.all([
    supabase.from("cronograma_actividades")
      /* `orden` y `creado_en` viajan porque la agenda tiene que ordenar
         EXACTAMENTE igual que el cronograma de donde salen las actividades;
         y `categoria` (de la convocatoria, propia o vía postulación) porque el
         orden de las FASES sale del preset de esa categoría, no del calendario:
         un documental empieza por Investigación aunque su primera fecha caiga
         después de algo de Preproducción. */
      .select("id,nombre,fecha_inicio,fecha_fin,etapa,estado,responsable,equipo,publicacion_id,orden,creado_en," +
        "proy:proyectos(id,nombre,nombre_corto),conv:convocatorias(id,codigo,nombre,categoria)," +
        "postu:postulaciones(id,codigo,conv:convocatorias(categoria))")
      .neq("estado", "cancelada").not("fecha_inicio", "is", null),
    supabase.from("publicaciones")
      .select("id,titulo,tipo,estado,fecha_limite,responsable,creado_en")
      .in("estado", VIVOS).not("fecha_limite", "is", null).is("archivado_en", null)
      .neq("tipo", "bitacora"),   // las notas del muro solo viven en su proyecto
    supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre"),
  ]);

  // ── Cuántos comentarios tiene cada caso ──
  // Las dos mitades de la agenda desembocan en el mismo sitio: un caso es una
  // publicación, y una actividad de cronograma ya materializada TIENE una
  // (`publicacion_id`). Así que se pregunta una sola vez, por id de publicación,
  // y sirve a las dos. Se usa el agregado embebido en vez de traer la tabla
  // `comentarios` entera y contar en memoria: los comentarios de objetos,
  // préstamos, equipamiento y postulaciones viven en esa misma tabla y gastarían
  // el tope de filas de PostgREST, dejando el contador corto EN SILENCIO.
  // El `limit` explícito es por lo mismo: el default (1000) truncaría sin avisar.
  const idsPub = [...new Set([
    ...(acts || []).map((a: any) => a.publicacion_id),
    ...(casos || []).map((c: any) => c.id),
  ].filter(Boolean))] as string[];
  const { data: conteos } = idsPub.length
    ? await supabase.from("publicaciones").select("id,comentarios(count)").in("id", idsPub).limit(5000)
    : { data: [] as any[] };
  const nComs = new Map<string, number>();
  (conteos || []).forEach((p: any) => nComs.set(p.id, p.comentarios?.[0]?.count ?? 0));

  // ── Actividades → items. Grupo = su proyecto/convocatoria. ──
  const itemsAct: ItemAgenda[] = (acts || []).map((a: any) => {
    const proy = a.proy as any, conv = a.conv as any, postu = a.postu as any;
    const grupo = proy ? { id: `p:${proy.id}`, label: proy.nombre_corto || proy.nombre }
      : postu ? { id: `postu:${postu.id}`, label: `🎯 ${postu.codigo || "Postulación"}` }
      : conv ? { id: `c:${conv.id}`, label: [conv.codigo, conv.nombre].filter(Boolean).join(" · ") }
      : { id: "sin", label: "Sin proyecto" };
    const href = a.publicacion_id ? `/caso/${a.publicacion_id}`
      : proy ? `/entidad/proyecto/${proy.id}`
      : postu ? `/entidad/postulacion/${postu.id}`
      : conv ? `/entidad/convocatoria/${conv.id}` : "#";
    return {
      id: a.id, kind: "act", titulo: a.nombre,
      ini: a.fecha_inicio, fin: a.fecha_fin || a.fecha_inicio,
      estado: a.estado, etapa: a.etapa || "",
      respId: a.responsable || null,
      personas: [a.responsable, ...((a.equipo as string[]) || [])].filter(Boolean) as string[],
      nc: a.publicacion_id ? nComs.get(a.publicacion_id) || 0 : 0,
      orden: a.orden ?? 0, creado: a.creado_en || "",
      // Sin categoría (los cronogramas de proyecto) manda el preset de cine,
      // que es justo lo que `etapasDe` devuelve cuando no reconoce nada.
      cat: conv?.categoria || (postu?.conv as any)?.categoria || "",
      grupo: grupo.label, grupoId: grupo.id, href,
    };
  });

  // ── Casos vivos con fecha límite → items. Grupo único "Casos". ──
  // Un aviso VENCIDO ya no rige (misma regla que feed/kanban/muro): sale de la
  // agenda solo, sin esperar a que se archive a mano. Los casos normales y los
  // avisos aún vigentes se quedan.
  const itemsCaso: ItemAgenda[] = (casos || [])
    .filter((c: any) => !avisoVencido(c.tipo, c.fecha_limite))
    .map((c: any) => {
    // El caso «dura» desde que se creó hasta su fecha límite: ese tramo se
    // dibuja tenue y punteado en la línea de tiempo, con la marca en el límite.
    // Si nació el mismo día del límite (o después), no hay tramo: solo la marca.
    const creado = String(c.creado_en || "").slice(0, 10);
    const ini = creado && creado < c.fecha_limite ? creado : c.fecha_limite;
    return {
    id: c.id, kind: "caso" as const, titulo: c.titulo,
    ini, fin: c.fecha_limite,
    estado: c.estado, tipo: c.tipo,
    respId: c.responsable || null,
    personas: [c.responsable].filter(Boolean) as string[],
    nc: nComs.get(c.id) || 0,
    creado: c.creado_en || "",
    grupo: "Casos", grupoId: "__casos__", href: `/caso/${c.id}`,
  }; });

  return (
    <div className="shell" style={{ maxWidth: "min(1800px, 98vw)" }}>
      {/* Refresco en vivo: la agenda sale de cronograma + casos con fecha. */}
      {/* «comentarios» entra a la lista porque ahora la agenda muestra su
          conteo: sin eso el 💬 se quedaría congelado hasta recargar. */}
      <Realtime tablas={["cronograma_actividades", "publicaciones", "comentarios"]} token={session?.access_token} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>todo lo que tiene fecha, junto</span>
      </div>
      <h1 className="title-lg">📅 Agenda</h1>
      <Agenda items={[...itemsAct, ...itemsCaso]} perfiles={sinBot(perfs || [])} miId={user.id} />
    </div>
  );
}
