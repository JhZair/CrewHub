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
import Reacciones from "@/components/Reacciones";
import RespuestaBox from "@/components/RespuestaBox";
import Realtime from "@/components/Realtime";
import { agruparEventos } from "@/lib/agrupar";
import { catalogosEntidades } from "@/lib/catalogos";
import { resolverNombres } from "@/lib/nombres";
import { mapaAlias, conAlias } from "@/lib/personas";
import { icoObjeto, lblObjeto } from "@/lib/objetos";
import { ICO_ENT, SECCIONES, rutaEntidad } from "@/lib/secciones";
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

/* (El resolvedor de nombres salió a lib/nombres: era el mismo bloque en
   cuatro pantallas, y en todas la postulación salía como «PO-047» a secas.) */

export default async function ObjetoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const { data: o } = await supabase.from("objetos").select("*").eq("id", params.id).single();
  if (!o) notFound();

  const [{ data: vincs }, { data: casosVinc }, { data: eventos }, { data: verifs }, { data: aliasPers },
         { data: coments }, { data: perfilesCat }] =
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
        .order("creado_en").limit(60),
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
        .select("id,cuerpo,imagenes,creado_en,editado_en,autor_id,responde_a,autor:perfiles(nombre,color,avatar_url)")
        .eq("objeto_id", params.id).order("creado_en"),
      /* Para el 🪄 del comentario: sin la lista de quién tiene cuenta, escribir
         «@j» no ofrecía nada y el invocar parecía roto —aunque el servidor sí
         reconocía la mención al enviar—. */
      supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
    ]);

  // Dueño + entidades vinculadas, resueltos en una tanda
  const pares = [
    { tipo: o.entidad_tipo, id: o.entidad_id },
    ...(vincs || []).map((v: any) => ({ tipo: v.entidad_tipo, id: v.entidad_id })),
  ];
  const nombres = await resolverNombres(supabase, pares);
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

  /* Las reacciones SOLO de los comentarios de ESTE objeto. Sin el `.in`, la
     consulta bajaba la tabla entera —reacciones de todos los casos y objetos
     del sistema, con su usuario_id— en cada visita. `rxCom` ya filtraba al
     pintar, así que el error no se veía, pero viajaba de todas formas. */
  const idsCom = (coments || []).map((c: any) => c.id);
  const { data: reaccs } = idsCom.length
    ? await supabase.from("reacciones").select("comentario_id,emoji,usuario_id").in("comentario_id", idsCom)
    : { data: [] as any[] };

  const v0: any = (verifs || [])[0];
  const verif = v0 ? { url: v0.url, por: v0.por?.nombre, en: v0.verificado_en, correcto: v0.correcto } : undefined;
  const alias = mapaAlias(aliasPers);
  const evs = conAlias((eventos || []) as any[], alias);
  // Nombre corto de quien comenta, igual que en el resto del sistema
  const aliasDe = new Map(Object.entries(alias));

  /* UNA SOLA LÍNEA DE ACTIVIDAD, como en el caso.
     Antes el objeto tenía tres cajas —Comentarios, Historial— y el evento de
     «comentario» salía en el historial como texto pelado: «comentario ·
     comentario · comentario», sin decir de qué. Aquí los eventos y los
     comentarios se tejen en orden: el evento de tipo `comentario` se cambia
     por la burbuja real, con su reacción y su responder. */
  const comMap = new Map((coments || []).map((c: any) => [c.id, c]));
  const rxCom = new Map<string, any[]>();
  (reaccs || []).forEach((r: any) => {
    const l = rxCom.get(r.comentario_id) || [];
    l.push({ emoji: r.emoji, usuario_id: r.usuario_id }); rxCom.set(r.comentario_id, l);
  });
  const conEvento = new Set<string>();
  const timeline = (evs as any[]).map((e: any) => {
    const c = e.tipo === "comentario" ? comMap.get(e.detalle?.comentario_id) : null;
    if (c) conEvento.add((c as any).id);
    return { ...e, comentario: c };
  });
  /* Los comentarios sin evento —los cargados antes de que el objeto registrara
     bitácora— entran igual, por su fecha, para que ninguno se pierda. */
  const sueltos = (coments || []).filter((c: any) => !conEvento.has(c.id))
    .map((c: any) => ({ tipo: "comentario", creado_en: c.creado_en, actor_id: c.autor_id, comentario: c }));
  const linea = [...timeline, ...sueltos]
    .sort((a: any, b: any) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime());
  /* Quién lo trajo. Va dentro del sello: procedencia y veredicto contestan la
     misma pregunta —de dónde salió esto y me puedo fiar—. */
  const quienTrajo = (o.creado_por && alias[o.creado_por]) || null;

  /* Catálogos para vincular a proyectos, empresas, etc., y para CAMBIARLE EL
     DUEÑO al objeto. Misma función que el feed, el «+» y la ficha del caso:
     ésta era la quinta puerta que armaba su propia lista, y era la que peor
     mostraba a las personas. */
  const catalogos = await catalogosEntidades(supabase);
  // Cómo se llama cada tipo en el botón del selector, sin escribirlo a mano.
  const ETIQ_ENT: Record<string, string> = Object.fromEntries(
    SECCIONES.map(s => [s.tipo, s.singular || s.plural]));

  return (
    <div className="shell">
      {/* En vivo, como el caso: si otro comenta o reacciona sobre este objeto,
          la página se refresca sola sin tener que recargar. */}
      <Realtime tablas={["actividad", "comentarios", "reacciones", "objetos"]} token={session?.access_token} />
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

      {/* 🕐 ACTIVIDAD — historial y comentarios en una sola línea, como el
          caso. Comentar sigue siendo lo de siempre: mismo motor, menciones y
          avisos, pero SIN estado ni plazo —hablar de un libro no es una unidad
          de trabajo—. Para eso están los casos de arriba. */}
      <div className="linked" style={{ marginTop: 14 }} id="comentarios">
        <h4>🕐 Actividad · {linea.length}</h4>
        {linea.length > 0 && (
          <div className="tl">
            {agruparEventos(linea as any[]).map((f: any, i: number) => {
              // Ráfaga de eventos iguales del mismo actor: se pliega.
              if (f.grupo)
                return <EventoGrupo key={i} items={f.grupo} horaDe={(x: any) => fecha(x.creado_en)} />;
              const e: any = f.solo;
              // El evento de «comentario» se cambia por la burbuja real.
              if (e.comentario) {
                const c = e.comentario;
                const padre = c.responde_a ? comMap.get(c.responde_a) : null;
                return (
                  <div className="tl-com" key={i}>
                    <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={32} src={c.autor?.avatar_url} />
                    <div className="bubble">
                      <div className="who">
                        {aliasDe.get(c.autor_id) || c.autor?.nombre}
                        <span className="t">{fecha(c.creado_en)}</span>
                      </div>
                      {padre && (
                        <div style={{ fontSize: 11, color: "var(--dim)", margin: "1px 0 4px" }}>
                          ↳ en respuesta a <b style={{ color: "var(--violet)" }}>
                            {aliasDe.get((padre as any).autor_id) || (padre as any).autor?.nombre || "un comentario"}
                          </b>
                        </div>
                      )}
                      <ComentarioTexto comentarioId={c.id} pubId="" cuerpo={c.cuerpo || ""}
                        imagenes={c.imagenes || []} esMio={c.autor_id === user.id} editadoEn={c.editado_en} />
                      <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <Reacciones pubId={null} objetoId={params.id} comentarioId={c.id}
                          reacciones={rxCom.get(c.id) || []} userId={user.id} />
                        <RespuestaBox objetoId={params.id} comentarioId={c.id} />
                      </div>
                    </div>
                  </div>
                );
              }
              return <EventoHistorial key={i} e={e} hora={fecha(e.creado_en)} />;
            })}
          </div>
        )}
        {/* La caja de comentar cierra la línea, como en el caso. */}
        <ComentarObjeto objetoId={params.id} perfiles={perfilesCat || []} />
      </div>
    </div>
  );
}
