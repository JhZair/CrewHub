import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import LinkVerificable from "@/components/LinkVerificable";
import EventoHistorial from "@/components/EventoHistorial";
import EventoGrupo from "@/components/EventoGrupo";
import ObjetoVinculos from "@/components/ObjetoVinculos";
import ConversarObjeto from "@/components/ConversarObjeto";
import ComentarObjeto from "@/components/ComentarObjeto";
import ComentarioTexto from "@/components/ComentarioTexto";
import Avatar from "@/components/Avatar";
import MoverObjeto from "@/components/MoverObjeto";
import MiniObjeto from "@/components/MiniObjeto";
import { agruparEventos } from "@/lib/agrupar";
import { mapaAlias, conAlias } from "@/lib/personas";
import { icoObjeto, lblObjeto } from "@/lib/objetos";
import { ICO_ENT, SECCIONES, rutaEntidad, nombreDe } from "@/lib/secciones";
import { claseEstado, rotuloEstado } from "@/lib/estados";
import { icoTipo } from "@/lib/tipos";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

/* PÁGINA DE UN OBJETO DEL REPOSITORIO.
   Un objeto vive dentro de la ficha de su dueño, pero cuando se vincula a
   proyectos y junta conversaciones necesita sitio propio donde leerse entero:
   de quién es, a qué apunta, qué se ha hablado de él y qué le pasó. */

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
const fmtDia = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
/* `creado_en` es timestamp, no columna `date`: sin el T12:00 de las otras. */
const fmtHora = (d: string) =>
  new Date(d).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase.from("objetos").select("titulo,tipo").eq("id", params.id).single();
  return { title: data ? `${icoObjeto(data.tipo)} ${data.titulo}` : "Objeto" };
}

/** Nombre legible de una entidad cualquiera, para los chips de vínculo. */
async function nombresDe(supabase: any, pares: { tipo: string; id: string }[]) {
  const m = new Map<string, string>();
  const porTipo = new Map<string, string[]>();
  pares.forEach(p => porTipo.set(p.tipo, [...(porTipo.get(p.tipo) || []), p.id]));
  await Promise.all([...porTipo.entries()].map(async ([tipo, ids]) => {
    const n = nombreDe(tipo);
    if (!n) return;
    const sel = ["id", n.campo, n.corto].filter(Boolean).join(",");
    const { data } = await supabase.from(n.tabla).select(sel).in("id", ids);
    (data || []).forEach((r: any) =>
      m.set(`${tipo}:${r.id}`, (n.corto && r[n.corto]) || r[n.campo] || "—"));
  }));
  return m;
}

export default async function ObjetoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: o } = await supabase.from("objetos").select("*").eq("id", params.id).single();
  if (!o) notFound();

  const [{ data: vincs }, { data: casosVinc }, { data: eventos }, { data: verifs }, { data: aliasPers },
         { data: coments }] =
    await Promise.all([
      supabase.from("objeto_vinculos").select("entidad_tipo,entidad_id").eq("objeto_id", params.id),
      /* Las conversaciones: casos vinculados a este objeto. No hay hilo propio
         —se reusa el sistema de casos— así que esto ES la conversación. */
      supabase.from("publicacion_vinculos")
        .select("pub:publicaciones(id,titulo,tipo,estado,creado_en,autor:perfiles!publicaciones_autor_id_fkey(nombre),comentarios(count))")
        .eq("entidad_tipo", "objeto").eq("entidad_id", params.id),
      supabase.from("actividad")
        .select("tipo,detalle,creado_en,actor_id,actor:perfiles(nombre)")
        .eq("entidad_tipo", "objeto").eq("entidad_id", params.id)
        .order("creado_en", { ascending: false }).limit(30),
      // La verificación del link del objeto vive en la ficha de su DUEÑO,
      // con campo `objeto:<id>` (así se guardó desde el repositorio).
      supabase.from("link_verificaciones")
        .select("campo,url,correcto,verificado_en,por:perfiles(nombre)")
        .eq("entidad_tipo", o.entidad_tipo).eq("entidad_id", o.entidad_id)
        .eq("campo", `objeto:${params.id}`),
      supabase.from("personas").select("usuario_id,alias")
        .not("alias", "is", null).not("usuario_id", "is", null),
      /* Los comentarios del objeto: misma tabla que los de un caso. */
      supabase.from("comentarios")
        .select("id,cuerpo,imagenes,creado_en,editado_en,autor_id,autor:perfiles(nombre,color,avatar_url)")
        .eq("objeto_id", params.id).order("creado_en"),
    ]);

  // Dueño + entidades vinculadas, resueltos en una tanda
  const pares = [
    { tipo: o.entidad_tipo, id: o.entidad_id },
    ...(vincs || []).map((v: any) => ({ tipo: v.entidad_tipo, id: v.entidad_id })),
  ];
  const nombres = await nombresDe(supabase, pares);
  const dueno = {
    tipo: o.entidad_tipo, id: o.entidad_id,
    nombre: nombres.get(`${o.entidad_tipo}:${o.entidad_id}`) || "—",
  };
  const vinculadas = (vincs || []).map((v: any) => ({
    tipo: v.entidad_tipo, id: v.entidad_id,
    nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`) || "—",
  })).filter((v: any) => v.nombre !== "—");

  const casos = (casosVinc || []).map((r: any) => r.pub).filter(Boolean)
    .sort((a: any, b: any) => (b.creado_en || "").localeCompare(a.creado_en || ""));

  const v0: any = (verifs || [])[0];
  const verif = v0 ? { url: v0.url, por: v0.por?.nombre, en: v0.verificado_en, correcto: v0.correcto } : undefined;
  const alias = mapaAlias(aliasPers);
  const evs = conAlias((eventos || []) as any[], alias);
  // Nombre corto de quien comenta, igual que en el resto del sistema
  const aliasDe = new Map(Object.entries(alias));
  /* Quién lo trajo. Va dentro del sello: procedencia y veredicto contestan la
     misma pregunta —de dónde salió esto y me puedo fiar—. */
  const quienTrajo = (o.creado_por && alias[o.creado_por]) || null;

  /* Catálogos para vincular a proyectos, empresas, etc. Los mismos sirven para
     CAMBIARLE EL DUEÑO al objeto: son las fichas que pueden tener repositorio,
     y aquí las personas ya salen como «Nombre · alias», que es lo que hace
     falta para elegir bien entre treinta. */
  const [pr, em, pe, co, po] = await Promise.all([
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    supabase.from("empresas").select("id,nombre,codigo").order("codigo"),
    supabase.from("personas").select("id,nombre,alias").order("nombre"),
    supabase.from("convocatorias").select("id,codigo,nombre,anio").order("anio", { ascending: false }),
    supabase.from("postulaciones").select("id,codigo,proy:proyectos(nombre)"),
  ]);
  const catalogos: Record<string, { id: string; nombre: string }[]> = {
    proyecto: (pr.data || []).map((x: any) => ({ id: x.id, nombre: x.nombre })),
    empresa: (em.data || []).map((x: any) => ({ id: x.id, nombre: x.codigo ? `${x.codigo} · ${x.nombre}` : x.nombre })),
    persona: (pe.data || []).map((x: any) => ({ id: x.id, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre })),
    convocatoria: (co.data || []).map((x: any) => ({ id: x.id, nombre: `${x.anio || ""} ${x.nombre || x.codigo}`.trim() })),
    postulacion: (po.data || []).map((x: any) => ({ id: x.id, nombre: `${x.codigo || "🎯"} · ${x.proy?.nombre || ""}`.trim() })),
  };
  // Cómo se llama cada tipo en el botón del selector, sin escribirlo a mano.
  const ETIQ_ENT: Record<string, string> = Object.fromEntries(
    SECCIONES.map(s => [s.tipo, s.singular || s.plural]));

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          📚 {lblObjeto(o.tipo)}
        </span>
      </div>

      <h1 className="title-lg" style={{ margin: "0 0 6px" }}>
        {icoObjeto(o.tipo)} {o.titulo}
      </h1>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16, fontSize: 12.5, color: "var(--dim)" }}>
        {o.fecha && <span>{fmtDia(o.fecha)}</span>}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          de{" "}
          <Link href={rutaEntidad(dueno.tipo, dueno.id) || "#"} style={{ color: "var(--violet)", fontWeight: 700 }}>
            {ICO_ENT[dueno.tipo] || "🔗"} {dueno.nombre}
          </Link>
          {/* Quien trae el material no siempre es de quien trata. */}
          <MoverObjeto objetoId={params.id} catalogos={catalogos} etiquetas={ETIQ_ENT} />
        </span>
      </div>

      {/* PORTADA: la imagen manda. Esta página existe para ver el objeto
          completo, y hasta ahora su única imagen era una miniatura metida
          dentro de la franja de revisión —el archivo convertido en adorno de
          un control—. Aquí la portada abre el visor y la descripción va al
          lado; en pantalla angosta se apilan. */}
      {(o.url || o.notas) && (
        <div className="card obj-portada">
          {o.url && <MiniObjeto url={o.url} ico={icoObjeto(o.tipo)} ancho={900} />}
          {o.notas && <div className="obj-desc">{o.notas}</div>}
        </div>
      )}

      {o.url && (
        <div style={{ marginTop: 10 }}>
          <LinkVerificable tipo={o.entidad_tipo} id={o.entidad_id} campo={`objeto:${params.id}`}
            url={o.url} etiqueta={lblObjeto(o.tipo)} icono={icoObjeto(o.tipo)} verif={verif} franja
            origen={`agregado${quienTrajo ? ` por ${quienTrajo}` : ""}${o.creado_en ? ` · ${fmtHora(o.creado_en)}` : ""}`} />
        </div>
      )}

      {/* A qué apunta: el libro es de Jesús y es la base de Los Khipus */}
      <div className="linked" style={{ marginTop: 14 }}>
        <h4>🔗 Vinculado a</h4>
        <ObjetoVinculos objetoId={params.id} actuales={vinculadas} catalogos={catalogos} />
      </div>

      {/* 💬 Comentar aquí mismo. Mismo motor que los casos (menciones y avisos
          incluidos) pero SIN estado, responsable ni plazo: hablar de un libro
          no es una unidad de trabajo, y forzarlo dejaba casos «Sin Resolver»
          eternos en el tablero. */}
      <div className="linked" style={{ marginTop: 14 }} id="comentarios">
        <h4>💬 Comentarios · {(coments || []).length}</h4>
        <div className="tl">
          {(coments || []).map((c: any) => (
            <div className="tl-com" key={c.id}>
              <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={32} src={c.autor?.avatar_url} />
              <div className="bubble">
                <div className="who">
                  {aliasDe.get(c.autor_id) || c.autor?.nombre}
                  <span className="t">{fecha(c.creado_en)}</span>
                </div>
                <ComentarioTexto comentarioId={c.id} pubId="" cuerpo={c.cuerpo || ""}
                  imagenes={c.imagenes || []} esMio={c.autor_id === user.id} editadoEn={c.editado_en} />
              </div>
            </div>
          ))}
        </div>
        {!(coments || []).length && (
          <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "4px 0" }}>
            Nadie ha comentado todavía.
          </div>
        )}
        <ComentarObjeto objetoId={params.id} />
      </div>

      {/* Los CASOS son otra cosa: trabajo de verdad sobre el objeto —conseguir
          los derechos, pedir permiso al autor—. El botón de abrir uno va SIEMPRE
          visible: si vive dentro del `casos.length > 0`, el primer caso de un
          objeto no se puede abrir nunca. */}
      <div className="linked" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: casos.length ? 8 : 0 }}>
          <h4 style={{ margin: 0 }}>🗂 Casos · {casos.length}</h4>
          <span style={{ flex: 1 }} />
          <ConversarObjeto objetoId={params.id} />
        </div>
        {casos.map((c: any) => (
          <Link key={c.id} href={`/caso/${c.id}`} className="info-row" style={{ textDecoration: "none" }}>
            <span>{icoTipo(c.tipo)}</span>
            <b style={{ flex: 1, fontSize: 13.5, color: "var(--text)" }}>{c.titulo}</b>
            {(c.comentarios?.[0]?.count ?? 0) > 0 && (
              <span style={{ color: "var(--muted)", fontSize: 11.5 }}>💬 {c.comentarios[0].count}</span>
            )}
            <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{c.autor?.nombre?.split(" ")[0]}</span>
            <span className={`pill st-${claseEstado(c.estado, c.tipo)}`}>{rotuloEstado(c.estado, c.tipo)}</span>
          </Link>
        ))}
      </div>

      {/* Siempre visible: una sección que aparece y desaparece se lee como que
          no existe — que es justo lo que pasaba antes de que el objeto tuviera
          bitácora propia. */}
      <div className="linked" style={{ marginTop: 14 }}>
        <h4>🕐 Historial · {evs.length}</h4>
        {evs.length > 0 ? (
          <div className="tl">
            {agruparEventos(evs as any[]).map((f, i) =>
              f.grupo
                ? <EventoGrupo key={i} items={f.grupo} horaDe={(x: any) => fecha(x.creado_en)} />
                : <EventoHistorial key={i} e={f.solo} hora={fecha(f.solo.creado_en)} />
            )}
          </div>
        ) : (
          <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "4px 0" }}>
            Sin movimientos registrados. Los objetos cargados antes de que
            existiera esta bitácora empiezan a registrarse desde su próxima edición.
          </div>
        )}
      </div>
    </div>
  );
}
