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
      .select("id,nombre,fecha_inicio,fecha_fin,etapa,estado,responsable,equipo,publicacion_id," +
        "proy:proyectos(id,nombre,nombre_corto),conv:convocatorias(id,codigo,nombre)," +
        "postu:postulaciones(id,codigo)")
      .neq("estado", "cancelada").not("fecha_inicio", "is", null),
    supabase.from("publicaciones")
      .select("id,titulo,tipo,estado,fecha_limite,responsable,creado_en")
      .in("estado", VIVOS).not("fecha_limite", "is", null).is("archivado_en", null),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
  ]);

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
    grupo: "Casos", grupoId: "__casos__", href: `/caso/${c.id}`,
  }; });

  return (
    <div className="shell" style={{ maxWidth: "min(1800px, 98vw)" }}>
      {/* Refresco en vivo: la agenda sale de cronograma + casos con fecha. */}
      <Realtime tablas={["cronograma_actividades", "publicaciones"]} token={session?.access_token} />
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
