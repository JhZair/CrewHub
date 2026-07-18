import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Avatar from "@/components/Avatar";
import { EstadoSelect, CommentBox, RespSelect, FechaSelect, BotonArchivar } from "@/components/CaseActions";
import Reacciones from "@/components/Reacciones";
import AvisoEnterado from "@/components/AvisoEnterado";
import SubCasos from "@/components/SubCasos";
import TituloEditable from "@/components/TituloEditable";
import DescripcionEditable from "@/components/DescripcionEditable";
import Foto from "@/components/Foto";
import BotonDestacar from "@/components/BotonDestacar";
import EtiquetasEditor from "@/components/EtiquetasEditor";
import VinculosEditor from "@/components/VinculosEditor";
import ComentarioTexto from "@/components/ComentarioTexto";
import RespuestaBox from "@/components/RespuestaBox";
import Realtime from "@/components/Realtime";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { claseEstado, rotuloEstado } from "@/lib/estados";
import { BOT, sinBot } from "@/lib/personas";
import { CERRADOS } from "@/lib/familia";
import { rotuloTipo, colorTipo, icoTipo } from "@/lib/tipos";

/* EV_ICO es de aquí: son los eventos de la bitácora de un caso, no los tipos
   de publicación. Los que SÍ eran copias —el mapa de tipos y el de entidades—
   salieron a lib/tipos y lib/secciones. */
const EV_ICO: Record<string, string> = {
  creado: "📝", estado: "🔄", asignacion: "👤", archivo: "🗄",   // archivar/despertar
  prioridad: "⚡", tarea: "✅", bot: "🤖", cierre: "✔️", vinculo: "🔗", edicion: "✏️",
};
/* (Aquí había un ENT_ICO copiado. Lo apunté a ICO_ENT y resultó que no lo
   usaba nadie: los chips de esta página los pinta VinculosEditor. Fuera.) */
/* El mapa de estados salió de aquí: era otra copia divergente de lib/estados
   (le faltaban íconos) y encima no sabía que un aviso no se resuelve. */

/* EL NOMBRE DE LA PESTAÑA
   John trabaja con tres ventanas y ~10 pestañas: mientras está en un caso
   tiene que mirar la ficha de su empresa, el buscador y otro caso a la vez.
   Todas se llamaban «CrewHub+ by KAWSAY», así que había que hacer clic para
   acordarse de cuál era cuál. El ícono va PRIMERO porque Chrome recorta por
   el final: en una pestaña estrecha lo único que sobrevive es «📢 Llegó…»,
   y con eso ya sabes que ésa es la del aviso.

   Cuesta una consulta de dos campos. Vale la pena: es el único sitio del
   sistema que se lee sin abrirlo. */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase.from("publicaciones")
    .select("titulo,tipo").eq("id", params.id).single();
  // Sin sesión o con un id inventado, `data` es null: no reventar por un título
  return { title: data ? `${icoTipo(data.tipo)} ${data.titulo}` : "Caso" };
}

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

export default async function Caso({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const { data: p } = await supabase
    .from("publicaciones")
    .select(`
      *,
      autor:perfiles!publicaciones_autor_id_fkey(nombre, color),
      resp:perfiles!publicaciones_responsable_fkey(nombre, color),
      vinculos:publicacion_vinculos(entidad_tipo, entidad_id)
    `)
    .eq("id", params.id).single();

  if (!p) notFound();

  const [{ data: eventos }, { data: comentarios }, { data: perfiles }, { data: miPerfil },
         proy, emp, pers, conv, equi, luga, etiq, postu] = await Promise.all([
    supabase.from("actividad")
      .select("*, actor:perfiles(nombre)")
      .eq("entidad_tipo", "publicacion").eq("entidad_id", p.id)
      .order("creado_en"),
    supabase.from("comentarios")
      .select("*, autor:perfiles(nombre, color, avatar_url)")
      .eq("publicacion_id", p.id)
      .order("creado_en"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
    supabase.from("perfiles").select("es_admin").eq("id", user.id).single(),
    supabase.from("proyectos").select("id,nombre"),
    supabase.from("empresas").select("id,nombre"),
    /* `usuario_id,alias` además del catálogo: es el único cruce que da el
       nombre corto de quien tiene cuenta. Ver `perfilesCortos` más abajo. */
    supabase.from("personas").select("id,nombre,usuario_id,alias"),
    supabase.from("convocatorias").select("id,codigo,nombre,anio")
      .order("anio", { ascending: false }).order("codigo"),
    supabase.from("equipamiento").select("id,nombre,folio"),
    supabase.from("lugares").select("id,nombre"),
    supabase.from("etiquetas").select("id,nombre"),
    supabase.from("postulaciones").select("id,codigo,proy:proyectos(nombre),conv:convocatorias(codigo)"),
  ]);

  // Familia: el padre (si soy sub-caso) y los hijos (si soy caso largo)
  const [{ data: padre }, { data: hijos }] = await Promise.all([
    p.padre_id
      ? supabase.from("publicaciones").select("id,titulo").eq("id", p.padre_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("publicaciones")
      /* `tipo` va aquí porque SubCasos rotula el estado, y sin el tipo un
         sub-aviso volvería a decir "Sin Resolver": el campo que no se pide
         llega undefined y se lee como "no es aviso". Mismo agujero que el
         `region` que faltaba en los miembros. */
      /* `responsable` y `fecha_limite` en crudo: la fila ya no solo los
         muestra, los EDITA. Sin el id del responsable el combo no sabe qué
         tiene puesto, y `resp:perfiles(nombre)` solo trae el nombre. */
      .select("id,titulo,estado,tipo,responsable,fecha_limite,resp:perfiles!publicaciones_responsable_fkey(nombre)")
      .eq("padre_id", p.id).order("creado_en"),
  ]);

  // Reacciones de la publicación y sus comentarios
  const { data: reaccs } = await supabase.from("reacciones")
    .select("publicacion_id,comentario_id,emoji,usuario_id")
    .eq("publicacion_id", p.id);
  const rxPub = (reaccs || []).filter((r: any) => !r.comentario_id);
  const rxCom = new Map<string, any[]>();
  (reaccs || []).forEach((r: any) => {
    if (!r.comentario_id) return;
    const l = rxCom.get(r.comentario_id) || [];
    l.push(r); rxCom.set(r.comentario_id, l);
  });

  // Resolver nombres de entidades vinculadas y de perfiles
  const nombres = new Map<string, string>();
  (proy.data || []).forEach((x: any) => nombres.set(`proyecto:${x.id}`, x.nombre));
  (emp.data || []).forEach((x: any) => nombres.set(`empresa:${x.id}`, x.nombre));
  (pers.data || []).forEach((x: any) => nombres.set(`persona:${x.id}`, x.nombre));
  (conv.data || []).forEach((x: any) =>
    nombres.set(`convocatoria:${x.id}`, x.nombre ? `${x.nombre} ${x.anio || ""}`.trim() : x.codigo));
  (equi.data || []).forEach((x: any) =>
    nombres.set(`equipamiento:${x.id}`, x.folio ? `${x.folio} · ${x.nombre}` : x.nombre));
  (luga.data || []).forEach((x: any) => nombres.set(`lugar:${x.id}`, x.nombre));
  (etiq.data || []).forEach((x: any) => nombres.set(`etiqueta:${x.id}`, x.nombre));
  (postu.data || []).forEach((x: any) =>
    nombres.set(`postulacion:${x.id}`, `${x.codigo || x.conv?.codigo || "🎯"} · ${x.proy?.nombre || "postulación"}`));
  const perfilNombre = new Map((perfiles || []).map((x: any) => [x.id, x.nombre]));

  /* EL NOMBRE CORTO DE UN COMPAÑERO — «MichelM», no «Michel Oros».
     Vive en `personas.alias`, y `perfiles` (la cuenta) solo guarda el nombre
     largo. Nadie había cruzado las dos tablas, así que cada pantalla se
     inventó su abreviatura: el historial recorta a mano —«Wilfredo P.», y su
     comentario dice «los perfiles no tienen alias» dando el alias por
     inexistente— y el feed muestra el primer nombre. Tres formas de decir lo
     mismo, y ninguna es la que el equipo usa de verdad.
     Aquí se cruza. `usuario_id` es la única llave entre cuenta y persona. */
  const aliasDe = new Map((pers.data || [])
    .filter((x: any) => x.usuario_id && x.alias)
    .map((x: any) => [x.usuario_id, x.alias]));
  const perfilesCortos = (perfiles || []).map((x: any) => ({
    ...x,
    // Sin alias cargado, el primer nombre: mejor «Michel» que «Michel Oros»
    corto: aliasDe.get(x.id) || String(x.nombre || "").split(" ")[0],
  }));

  const chips = (p.vinculos || [])
    .filter((v: any) => v.entidad_tipo !== "etiqueta")
    .map((v: any) => ({ ...v, nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`) }))
    .filter((v: any) => v.nombre);
  const etqTodas = (etiq.data || []) as { id: string; nombre: string }[];
  const etqMap = new Map(etqTodas.map(x => [x.id, x.nombre]));
  const etiquetasActuales = (p.vinculos || [])
    .filter((v: any) => v.entidad_tipo === "etiqueta")
    .map((v: any) => ({ id: v.entidad_id, nombre: etqMap.get(v.entidad_id) || "etiqueta" }));

  // Catálogos por tipo para el editor de vínculos + vínculos actuales (no-etiqueta)
  const catEnt: Record<string, { id: string; nombre: string }[]> = {
    proyecto: (proy.data || []).map((x: any) => ({ id: x.id, nombre: x.nombre })),
    empresa: (emp.data || []).map((x: any) => ({ id: x.id, nombre: x.nombre })),
    persona: (pers.data || []).map((x: any) => ({ id: x.id, nombre: x.nombre })),
    convocatoria: (conv.data || []).map((x: any) => ({
      id: x.id,
      nombre: `${x.anio ? `${x.anio} · ` : ""}${x.nombre || ""} · ${x.codigo}`.replace(/^ · /, ""),
    })),
    postulacion: (postu.data || []).map((x: any) => ({
      id: x.id, nombre: `${x.codigo || x.conv?.codigo || "🎯"} · ${x.proy?.nombre || "postulación"}`,
    })),
    equipamiento: (equi.data || []).map((x: any) => ({ id: x.id, nombre: x.folio ? `${x.folio} · ${x.nombre}` : x.nombre })),
    lugar: (luga.data || []).map((x: any) => ({ id: x.id, nombre: x.nombre })),
  };
  const actualesVinc = chips.map((v: any) => ({ tipo: v.entidad_tipo, id: v.entidad_id, nombre: v.nombre }));

  // Línea de tiempo unificada
  const comMap = new Map((comentarios || []).map((c: any) => [c.id, c]));
  const timeline = (eventos || []).map((e: any) => ({
    ...e,
    comentario: e.tipo === "comentario" ? comMap.get(e.detalle?.comentario_id) : null,
  }));
  const conEvento = new Set(timeline.filter((t: any) => t.comentario).map((t: any) => t.comentario.id));
  const sueltos = (comentarios || []).filter((c: any) => !conEvento.has(c.id))
    .map((c: any) => ({ tipo: "comentario", creado_en: c.creado_en, comentario: c }));
  const linea = [...timeline, ...sueltos].sort(
    (a: any, b: any) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime()
  );

  const tl = rotuloTipo(p.tipo), tc = colorTipo(p.tipo);

  const textoEvento = (e: any) => {
    const quien = e.actor?.nombre || BOT;
    if (e.tipo === "bot") return `Bot Qhaway: "${e.detalle?.mensaje || "evento automático"}"`;
    if (e.tipo === "creado") return `${quien} creó la publicación`;
    if (e.tipo === "estado") {
      const campo = e.detalle?.campo || "estado";
      if (campo === "responsable") {
        const a = e.detalle?.a ? (perfilNombre.get(e.detalle.a) || "alguien") : "sin asignar";
        return `${quien} cambió el responsable → ${a}`;
      }
      /* El historial de un aviso también habla su idioma: «Vigente →
         Archivada», no «Sin Resolver → Archivada» de algo que nadie resolvió. */
      const de = e.detalle?.de ? rotuloEstado(e.detalle.de, p.tipo) : "—";
      const a = e.detalle?.a ? rotuloEstado(e.detalle.a, p.tipo) : "—";
      return `${quien} · ${campo}: ${de} → ${a}`;
    }
    // Archivar/despertar: el bot trae su mensaje; una persona, solo `a`.
    if (e.tipo === "archivo")
      return `${quien} ${e.detalle?.mensaje
        || (e.detalle?.a === "despertado" ? "despertó este caso del archivo" : "archivó este caso")}`;
    return `${quien} · ${e.detalle?.mensaje || e.tipo}`;
  };

  return (
    <div className="shell">
      <Realtime tablas={["actividad", "comentarios", "publicaciones", "reacciones"]} token={session?.access_token} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        {/* Subirlo a la cabecera del feed: solo administración */}
        {miPerfil?.es_admin && <BotonDestacar pubId={p.id} hasta={p.destacado_hasta} />}
        <span className="badge" style={{ color: tc, background: `${tc}22`, fontSize: 12 }}>{tl}</span>
      </div>

      {padre && (
        <Link href={`/caso/${padre.id}`} style={{ color: "var(--muted)", fontSize: 12.5, display: "inline-block", marginBottom: 4 }}>
          ↑ Parte de: <b style={{ color: "var(--violet)" }}>{padre.titulo}</b>
        </Link>
      )}
      <TituloEditable pubId={p.id} titulo={p.titulo} />

      {/* Si está archivado, decirlo antes que nada: quien llega aquí desde el
          buscador tiene que saber que esto NO está en el feed ni el tablero,
          y poder traerlo de vuelta de un clic. */}
      {p.archivado_en && (
        <div className="err-inline" style={{ background: "#1c1c2c", borderColor: "var(--border2)", color: "var(--muted)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          🗄 Archivado el {fecha(p.archivado_en)} — fuera del feed y del tablero, pero en la memoria.
          <BotonArchivar pubId={p.id} archivado cerrado />
        </div>
      )}

      <div className={`grid-meta est-${claseEstado(p.estado, p.tipo)}`}>
        <div className="gm"><span className="k">Estado</span><EstadoSelect pubId={p.id} estado={p.estado} tipo={p.tipo} /></div>
        <div className="gm"><span className="k">Responsable</span>
          <RespSelect pubId={p.id} actual={p.responsable} perfiles={perfiles || []} /></div>
        <div className="gm"><span className="k">Fecha límite</span>
          <FechaSelect pubId={p.id} fecha={p.fecha_limite} /></div>
        <div className="gm"><span className="k">Creado</span>
          <span className="v">{fecha(p.creado_en)}<br /><span style={{ color: "var(--muted)", fontWeight: 400 }}>por {p.autor?.nombre}</span></span></div>
      </div>

      <DescripcionEditable pubId={p.id} cuerpo={p.cuerpo || ""} estado={p.estado} tipo={p.tipo} imagenes={p.imagenes || []} />

      {p.tipo === "aviso" && (
        <AvisoEnterado
          pubId={p.id}
          userId={user.id}
          enteradosIds={rxPub.filter((r: any) => r.emoji === "👀").map((r: any) => r.usuario_id)}
          equipo={sinBot(perfiles)}
          fechaLimite={p.fecha_limite}
        />
      )}

      <div style={{ margin: "4px 0 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Reacciones pubId={p.id} reacciones={rxPub} userId={user.id} />
        <span style={{ flex: 1 }} />
        {/* Archivar solo se ofrece si el caso ya está cerrado (resuelta o
            descartada) — no se guarda algo vivo. Si ya está archivado, el
            aviso de arriba lleva el «despertar»; aquí no se repite. */}
        {!p.archivado_en && (
          <BotonArchivar pubId={p.id} archivado={false} cerrado={CERRADOS.includes(p.estado)} />
        )}
      </div>

      <div className="linked" style={{ marginTop: 4 }}>
        <h4>🔗 Vínculos y etiquetas</h4>
        <VinculosEditor pubId={p.id} actuales={actualesVinc} catalogos={catEnt} />
        <div style={{ marginTop: 8 }}>
          <EtiquetasEditor pubId={p.id} actuales={etiquetasActuales} todas={etqTodas} />
        </div>
      </div>

      {(!p.padre_id || (hijos || []).length > 0) && (
        <SubCasos padreId={p.id} hijos={hijos || []} perfiles={perfilesCortos} />
      )}

      <div className="h4">🕐 Actividad · {linea.length} eventos</div>
      <div className="tl">
        {linea.map((e: any, i: number) => {
          if (e.comentario) {
            const c = e.comentario;
            return (
              <div className="tl-com" key={i}>
                <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={32} src={c.autor?.avatar_url} />
                <div className="bubble">
                  <div className="who">{c.autor?.nombre}<span className="t">{fecha(c.creado_en)}</span></div>
                  {c.responde_a && comMap.get(c.responde_a) && (
                    <div style={{ fontSize: 11, color: "var(--dim)", margin: "1px 0 4px" }}>
                      ↳ en respuesta a <b style={{ color: "var(--violet)" }}>{(comMap.get(c.responde_a) as any)?.autor?.nombre || "un comentario"}</b>
                    </div>
                  )}
                  <ComentarioTexto comentarioId={c.id} pubId={p.id} cuerpo={c.cuerpo || ""}
                    esMio={c.autor_id === user.id} editadoEn={c.editado_en} />
                  {(c.imagenes || []).length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      {c.imagenes.map((u: string, j: number) => (
                        <Foto key={j} src={u} maxHeight={160} />
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <Reacciones pubId={p.id} comentarioId={c.id} reacciones={rxCom.get(c.id) || []} userId={user.id} />
                    <RespuestaBox pubId={p.id} comentarioId={c.id} />
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div className={`tl-ev ${e.actor ? e.tipo : "bot"}`} key={i}>
              <span>{EV_ICO[e.tipo] || "•"}</span>
              <span>{textoEvento(e)}</span>
              <span className="t">{fecha(e.creado_en)}</span>
            </div>
          );
        })}
      </div>

      {/* Ancla del final. Las notificaciones de comentario y mención enlazan
          a /caso/{id}#comentarios: el aviso dice «Michel comentó» y ahora
          entrega el comentario, no la cabecera de un caso largo.
          Va en el ÚLTIMO elemento a propósito: al no haber nada debajo, el
          navegador scrollea hasta el tope y deja a la vista la cola de la
          conversación —lo nuevo está abajo— con el cuadro de responder. */}
      <div id="comentarios" style={{ scrollMarginTop: 16 }}>
        <CommentBox pubId={p.id} userId={user.id} perfiles={perfiles || []} />
      </div>
    </div>
  );
}
