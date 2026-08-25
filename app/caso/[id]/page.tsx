import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Avatar from "@/components/Avatar";
import { EstadoSelect, CommentBox, RespSelect, FechaSelect, HoraSelect, BotonArchivar } from "@/components/CaseActions";
import Reacciones from "@/components/Reacciones";
import AvisoEnterado from "@/components/AvisoEnterado";
import SubCasos from "@/components/SubCasos";
import TituloEditable from "@/components/TituloEditable";
import DescripcionEditable from "@/components/DescripcionEditable";
import BotonDestacar from "@/components/BotonDestacar";
import EtiquetasEditor from "@/components/EtiquetasEditor";
import VinculosEditor from "@/components/VinculosEditor";
import EventoHistorial from "@/components/EventoHistorial";
import BarrasProgreso from "@/components/BarrasProgreso";
import { progresoDe, esMovimientoReal } from "@/lib/progreso";
import { tipoCanonico, grafiasDe } from "@/lib/secciones";
import { agruparEventos } from "@/lib/agrupar";
import ComentarioTexto from "@/components/ComentarioTexto";
import { ANCLA_COM } from "@/lib/notificaciones";
import RespuestaBox from "@/components/RespuestaBox";
import Realtime from "@/components/Realtime";
import Link from "@/components/Enlace";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { claseEstado, rotuloEstado, selloDeCaso, llevaEnterado } from "@/lib/estados";
import SelloResultado from "@/components/SelloResultado";
import { BOT, sinBot } from "@/lib/personas";
import { CERRADOS } from "@/lib/familia";
import { rotuloTipo, colorTipo, icoTipo, llevaHora } from "@/lib/tipos";
import { TXT } from "@/lib/texto";
import { catalogoObjetos, catalogosEntidades } from "@/lib/catalogos";

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
      autor:perfiles!publicaciones_autor_id_fkey(nombre, color, avatar_url),
      resp:perfiles!publicaciones_responsable_fkey(nombre, color),
      vinculos:publicacion_vinculos(entidad_tipo, entidad_id)
    `)
    .eq("id", params.id).single();

  if (!p) notFound();

  /* UNA NOTA DEL MURO NO ES UN CASO, Y ESTA PÁGINA NO ES SU SITIO.
     Comparten la tabla `publicaciones` —lo que hizo que el muro naciera con
     comentarios, reacciones y menciones gratis— pero una nota no tiene estado
     que resolver, ni responsable, ni plazo, ni sub-casos. Abierta aquí sale
     con «Sin asignar», «Publicado» y «5 días sin movimiento real»: tres
     reproches sobre algo que nadie prometió resolver.
     El arreglo va AQUÍ y no solo en el enlace de la notificación: los enlaces
     viejos ya están repartidos por avisos, historiales y pestañas abiertas, y
     corregir el que se genera hoy no arregla ninguno de esos. Esta puerta los
     cubre todos.
     Sin vínculo no hay muro al que ir —una nota cuyo insert de vínculo falló—:
     ahí es mejor esta ficha imperfecta que un callejón sin salida. */
  if (p.tipo === "bitacora") {
    const v0 = (p.vinculos || [])[0];
    if (v0?.entidad_tipo && v0?.entidad_id) {
      redirect(`/entidad/${v0.entidad_tipo}/${v0.entidad_id}#pub-${p.id}`);
    }
  }

  const [{ data: eventos }, { data: comentarios }, { data: perfiles }, { data: miPerfil },
         ents, proy, emp, pers, conv, equi, luga, etiq, postu] = await Promise.all([
    supabase.from("actividad")
      .select("*, actor:perfiles(nombre)")
      /* Igual que en la ficha de entidad: «publicacion» a mano, «publicaciones»
         del trigger. Sin las dos, el caso no muestra ni su propia creación. */
      .in("entidad_tipo", grafiasDe("publicacion")).eq("entidad_id", p.id)
      .order("creado_en"),
    supabase.from("comentarios")
      .select("*, autor:perfiles(nombre, color, avatar_url)")
      .eq("publicacion_id", p.id)
      .order("creado_en"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
    supabase.from("perfiles").select("es_admin").eq("id", user.id).single(),
    /* Los catálogos de los desplegables se arman en lib/catalogos, igual que
       en el feed y en el «+». Las consultas sueltas de abajo siguen porque
       resuelven otra cosa: los NOMBRES de los chips (formato corto) y el
       cruce alias↔cuenta. Elegir y etiquetar no piden lo mismo. */
    catalogosEntidades(supabase),
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
    supabase.from("postulaciones").select("id,codigo,proy:proyectos(nombre),conv:convocatorias(codigo,anio)"),
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
      .select("id,titulo,estado,tipo,archivado_en,responsable,fecha_limite,resp:perfiles!publicaciones_responsable_fkey(nombre)")
      .eq("padre_id", p.id).order("creado_en"),
  ]);

  // Reacciones de la publicación y sus comentarios
  const { data: reaccs } = await supabase.from("reacciones")
    .select("publicacion_id,comentario_id,emoji,usuario_id")
    .eq("publicacion_id", p.id);
  // Nombre de quién reaccionó (acuse en el tooltip), del catálogo ya cargado.
  const nombrePerfil = new Map((perfiles || []).map((x: any) => [x.id, x.nombre]));
  const conNombre = (r: any) => ({ emoji: r.emoji, usuario_id: r.usuario_id, comentario_id: r.comentario_id, nombre: nombrePerfil.get(r.usuario_id) });
  const rxPub = (reaccs || []).filter((r: any) => !r.comentario_id).map(conNombre);
  const rxCom = new Map<string, any[]>();
  (reaccs || []).forEach((r: any) => {
    if (!r.comentario_id) return;
    const l = rxCom.get(r.comentario_id) || [];
    l.push(conNombre(r)); rxCom.set(r.comentario_id, l);
  });

  /* Los OBJETOS del repositorio se resuelven aparte y solo los vinculados a
     este caso: el catálogo puede tener miles y no hay razón de traerlos todos
     —a diferencia de proyectos o empresas, un objeto no se elige de una lista.
     Sin esto el vínculo existía en la base pero el chip se filtraba por no
     tener nombre: el caso decía estar vinculado a nada. */
  const idsObj = (p.vinculos || [])
    .filter((v: any) => v.entidad_tipo === "objeto").map((v: any) => v.entidad_id);
  const { data: objs } = idsObj.length
    ? await supabase.from("objetos").select("id,titulo,tipo").in("id", idsObj)
    : { data: [] as any[] };

  // Resolver nombres de entidades vinculadas y de perfiles
  const nombres = new Map<string, string>();
  (objs || []).forEach((x: any) => nombres.set(`objeto:${x.id}`, x.titulo));
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

  /* Los objetos del repositorio también se pueden vincular desde aquí: un caso
     puede tratar sobre un material concreto. Los más recientes, con techo —es
     el único catálogo que crece sin límite. */
  const objsCat = await catalogoObjetos(supabase);

  // Catálogos por tipo para el editor de vínculos + vínculos actuales (no-etiqueta)
  const catEnt: Record<string, { id: string; nombre: string; tipo?: string; sub?: string }[]> = {
    ...ents, objeto: objsCat,
  };
  /* Cartel (póster/logo) de los proyectos y empresas vinculados, para que su
     chip muestre la imagen en vez del ícono genérico. */
  const cartelVinc = new Map<string, string>();
  {
    const idsMedia = chips
      .filter((v: any) => v.entidad_tipo === "proyecto" || v.entidad_tipo === "empresa")
      .map((v: any) => v.entidad_id);
    if (idsMedia.length) {
      const { data: mm } = await supabase.from("entidad_media")
        .select("entidad_tipo,entidad_id,cartel_url").in("entidad_id", idsMedia);
      (mm || []).forEach((m: any) => {
        if (m.cartel_url) cartelVinc.set(`${m.entidad_tipo}:${m.entidad_id}`, m.cartel_url);
      });
    }
  }
  const actualesVinc = chips.map((v: any) => ({
    tipo: v.entidad_tipo, id: v.entidad_id, nombre: v.nombre,
    cartel: cartelVinc.get(`${v.entidad_tipo}:${v.entidad_id}`) || null,
  }));

  /* 🧰 TRABAJO RELACIONADO — lo que se editó en las entidades vinculadas
     mientras este caso estuvo abierto. Reúne bajo la orden de trabajo las
     ediciones que igual se guardaron en cada ficha (firma, DNI…), que sin esto
     quedaban desperdigadas y el caso salía «sin actividad». Ventana =
     [creado_en, cierre/archivo, o ahora si sigue vivo]. */
  const idsVinc = [...new Set(chips.map((v: any) => v.entidad_id))] as string[];
  let trabajoRel: any[] = [];
  if (idsVinc.length) {
    /* Fin de ventana: solo se cierra si el caso está cerrado AHORA. Un caso
       reabierto y vivo sigue hasta hoy —tomar su cierre viejo perdía todo el
       trabajo del periodo reabierto—. */
    const cerrado = (eventos || [])
      .filter((e: any) => e.tipo === "estado" && e.detalle?.campo === "estado" && ["resuelta", "descartada"].includes(e.detalle?.a))
      .map((e: any) => e.creado_en as string);
    const fin = CERRADOS.includes(p.estado)
      ? ([...cerrado, p.archivado_en].filter(Boolean).sort().slice(-1)[0] || new Date().toISOString())
      : new Date().toISOString();
    const { data: rel } = await supabase.from("actividad")
      .select("tipo,detalle,creado_en,entidad_tipo,entidad_id,actor_id,actor:perfiles(nombre)")
      .in("entidad_id", idsVinc)
      .gte("creado_en", p.creado_en).lte("creado_en", fin)
      // La ventana ya acota la actividad; 300 da margen de sobra para el ruido
      // SUNAT (que se filtra abajo) sin recurrir a filtros json frágiles.
      .order("creado_en", { ascending: false }).limit(300);
    trabajoRel = (rel || [])
      /* Solo trabajo HUMANO: fuera el ruido de la verificación SUNAT y todo lo
         que escribe el bot. Si contara, la ronda automática mantendría vivo
         cualquier caso con una empresa vinculada y nada parecería detenido. */
      .filter((e: any) => esMovimientoReal(e.tipo)
        && !(e.tipo === "estado" && ["estado_sunat", "condicion_sunat"].includes(e.detalle?.campo)))
      .map((e: any) => ({
        ...e,
        /* `tipoCanonico`: el trigger escribe el nombre de la TABLA («personas»)
           y el mapa de nombres está en singular («persona»). Sin esto, toda
           fila de trigger salía sin nombre de entidad. */
        entidadNombre: nombres.get(`${tipoCanonico(e.entidad_tipo)}:${e.entidad_id}`),
        actor: e.actor ? { ...e.actor, alias: aliasDe.get(e.actor_id) } : e.actor,
      }));
  }

  /* ¿QUÉ DE ESO ES TRABAJO DE ESTE CASO?
     Coincidir en el tiempo y en la entidad no es lo mismo que trabajar para el
     caso: en «alistar los estados de cuenta» salían seis ediciones sobre el
     proyecto y la persona vinculados —renombrar el proyecto, cargar un CV—
     hechas por otras tres personas y para otra cosa. Sin este cruce, el
     denominador habría dicho «2 de 2 vinculadas = 100%» de una tarea que nadie
     empezó. Se cruza con QUIÉN: gente del caso = responsable, autor y quien
     comentó ahí. Lo demás se muestra como contexto, pero no cuenta. */
  const genteCaso = new Set<string>(
    [p.autor_id, p.responsable, ...(comentarios || []).map((c: any) => c.autor_id)].filter(Boolean));
  const esDelCaso = (e: any) => !!e.actor_id && genteCaso.has(e.actor_id);
  const relDelCaso = trabajoRel.filter(esDelCaso);
  const relContexto = trabajoRel.filter((e: any) => !esDelCaso(e));

  /* ⏳ Tiempo vs ⚡ Trabajo. El denominador del trabajo sale de lo que el caso
     tenga: sub-casos primero, si no las entidades vinculadas que ya muestran
     trabajo, si no la escalera del estado. El cálculo vive en lib/progreso. */
  const totalHijos = (hijos || []).length;
  /* El desenlace, si lo hay. La regla vive en lib/estados junto al resto de
     lo que significa un estado, no aquí. */
  const sello = selloDeCaso(p.estado, p.archivado_en);

  const progreso = progresoDe({
    creado_en: p.creado_en, fecha_inicio: p.fecha_inicio, fecha_limite: p.fecha_limite,
    estado: p.estado, tipo: p.tipo,
    /* Archivar TAMBIÉN cierra el asunto: el bot archiva avisos vencidos
       dejándolos en «abierta», y contarlos como pendientes hacía que un padre
       nunca llegara al 100%. */
    hijos: totalHijos
      ? { ok: (hijos || []).filter((h: any) => CERRADOS.includes(h.estado) || h.archivado_en).length, total: totalHijos }
      : null,
    // Solo lo atribuible al caso cuenta como «vinculada trabajada».
    vinculadas: idsVinc.length
      ? { conTrabajo: new Set(relDelCaso.map((e: any) => e.entidad_id)).size, total: idsVinc.length }
      : null,
    // Último movimiento REAL: del propio caso o el trabajo suyo sobre las vinculadas.
    ultimoMovimiento: [
      ...(eventos || []).filter((e: any) => esMovimientoReal(e.tipo)).map((e: any) => e.creado_en as string),
      ...relDelCaso.map((e: any) => e.creado_en as string),
    ].sort().slice(-1)[0] || p.creado_en,
  });

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
    // `aliasDe` (usuario_id → alias) es la única llave fiable: la cuenta y la
    // ficha pueden llamarse distinto. Mapear por nombre dejaba a Wilfredo sin
    // alias («Wilfredo pediáz» la cuenta, «Wilfredo Perez Diaz» la ficha).
    const quien = aliasDe.get(e.actor_id) || e.actor?.nombre || BOT;
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
    /* `caso-pg` no pinta nada: es el gancho para apretar los huecos entre
       bloques SOLO en esta pantalla. Bajar los márgenes de `.card` o `.linked`
       en general habría apretado también el feed, las fichas y los listados,
       que no tienen el mismo problema —esta página encadena ocho bloques
       seguidos y ninguna otra—. */
    <div className="shell caso-pg" style={{ paddingBottom: 64 }}>
      {/* ── ESCUCHAR SOLO LO DE ESTE CASO, DONDE SE PUEDE ──
          Antes escuchaba las cinco tablas ENTERAS: un comentario de Katy en
          otro caso, o una línea que el bot escribiera en `actividad`,
          recargaban esta página con sus diecinueve consultas. Con varias
          personas trabajando a la vez eso se realimenta solo.
          Tres se pueden acotar sin perder nada, porque la página consulta
          exactamente ese mismo filtro:
            · comentarios → los de esta publicación
            · actividad → los eventos de esta entidad
            · publicacion_vinculos → los vínculos de esta publicación
          Las otras dos NO se acotan, y es deliberado:
            · `publicaciones` — los sub-casos son otras publicaciones y
              cambiarles el estado tiene que refrescar el resumen «2/3».
            · `reacciones` — las de los comentarios no llevan `publicacion_id`,
              así que filtrar por él perdería justo esas.
          Cuando la duda es «¿me pierdo un cambio real?», se escucha de más:
          quedarse viejo en silencio es peor que un refresco de sobra. */}
      <Realtime
        tablas={[
          { tabla: "comentarios", filtro: `publicacion_id=eq.${p.id}` },
          { tabla: "actividad", filtro: `entidad_id=eq.${p.id}` },
          { tabla: "publicacion_vinculos", filtro: `publicacion_id=eq.${p.id}` },
          "publicaciones",
          "reacciones",
        ]}
        token={session?.access_token} miId={user.id} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        {/* Subirlo a la cabecera del feed: solo administración */}
        {miPerfil?.es_admin && <BotonDestacar pubId={p.id} hasta={p.destacado_hasta} />}
        {/* El chip del tipo se fue de aquí al final del título: en esta barra
            se leía junto a los controles y no junto a lo que nombra. */}
      </div>

      {padre && (
        <Link href={`/caso/${padre.id}`} style={{ color: "var(--muted)", fontSize: TXT.micro, display: "inline-block", marginBottom: 4 }}>
          ↑ Parte de: <b style={{ color: "var(--violet)" }}>{padre.titulo}</b>
        </Link>
      )}
      <TituloEditable pubId={p.id} titulo={p.titulo}
        chip={
          <>
            <span className="badge" style={{ color: tc, background: `${tc}22`, fontSize: TXT.chip }}>{tl}</span>
            {/* Archivar solo se ofrece si el caso ya está cerrado (resuelta o
                descartada) — no se guarda algo vivo. Si ya está archivado, el
                aviso de arriba lleva el «despertar»; aquí no se repite. */}
            {!p.archivado_en && (
              <BotonArchivar pubId={p.id} archivado={false} cerrado={CERRADOS.includes(p.estado)} />
            )}
          </>
        } />

      {/* Si está archivado, decirlo antes que nada: quien llega aquí desde el
          buscador tiene que saber que esto NO está en el feed ni el tablero,
          y poder traerlo de vuelta de un clic. */}
      {p.archivado_en && (
        <div className="err-inline" style={{ background: "#1c1c2c", borderColor: "var(--border2)", color: "var(--muted)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          🗄 Archivado el {fecha(p.archivado_en)} — fuera del feed y del tablero, pero en la memoria.
          <BotonArchivar pubId={p.id} archivado cerrado />
        </div>
      )}

      {/* ── EL DESENLACE, ESTAMPADO ──
          El sello va sobre la ficha de datos y no sobre la página entera: es
          el bloque que lleva el estado, así que tapar justo eso es coherente
          —lo que queda debajo es el dato que el sello ya está diciendo—, y
          deja legible la descripción y la conversación, que es a lo que se
          entra aunque el caso esté cerrado.
          No captura clics: el desplegable de estado sigue usable por debajo
          para reabrirlo, y el ✕ del sello lo aparta si estorba. Al recargar
          vuelve, porque es el estado del caso y no un aviso que se descarta. */}
      <div className={`grid-meta grid-meta-5 est-${claseEstado(p.estado, p.tipo)}`}>
        {sello && <SelloResultado {...sello} variante="ficha" />}
        <div className="gm"><span className="k">Estado</span><EstadoSelect pubId={p.id} estado={p.estado} tipo={p.tipo} /></div>
        <div className="gm"><span className="k">Responsable</span>
          <RespSelect pubId={p.id} actual={p.responsable} perfiles={perfiles || []} /></div>
        {/* ── LA VENTANA, SIEMPRE VISIBLE ──
            Estuvo escondida cuando el caso no tenía inicio, para no gastar una
            celda en una pregunta que casi nadie contesta. Era una trampilla:
            al borrar el inicio, el campo desaparecía en el mismo render y
            volver a ponerlo obligaba a salir a buscar el caso en otra pantalla
            y abrir la vista rápida. Y en un caso ARCHIVADO —que no sale del
            feed, ni del tablero, ni de la agenda— esta ficha es la única
            puerta: escondido aquí, no había ninguna. */}
        <div className="gm"><span className="k">Empieza</span>
          <FechaSelect pubId={p.id} fecha={p.fecha_inicio} cual="inicio" tope={p.fecha_limite} /></div>
        {/* En una reunión la fecha no es un plazo: es cuándo ocurre. El rótulo
            cambia con el tipo porque leerla como «límite» es leerla mal. */}
        <div className="gm"><span className="k">{llevaHora(p.tipo) ? "Cuándo es" : "Fecha límite"}</span>
          <FechaSelect pubId={p.id} fecha={p.fecha_limite} tope={p.fecha_inicio} /></div>
        {llevaHora(p.tipo) && (
          <div className="gm"><span className="k">Hora</span>
            <HoraSelect pubId={p.id} hora={p.hora} /></div>
        )}
        <div className="gm"><span className="k">Creado</span>
          {/* Con cara. Las otras tres celdas de esta ficha ya identifican a
              alguien por su nombre en un desplegable; esta es la única donde
              el nombre iba solo, y en un equipo de siete el «por Michel Oros»
              se lee más rápido si primero se reconoce la foto.
              El tamaño es el del texto de al lado, no el de un avatar de
              perfil: aquí acompaña a un dato, no encabeza nada. */}
          <span className="v">{fecha(p.creado_en)}<br />
            {/* Sin el «por»: con la cara delante del nombre ya no hace falta
                una palabra que diga que eso es una persona. */}
            <span className="gm-autor">
              <Avatar nombre={p.autor?.nombre} src={p.autor?.avatar_url}
                color={p.autor?.color} size={17} />
              {p.autor?.nombre}
            </span>
          </span></div>
      </div>

      {/* Las barras de progreso se fueron al final de la página. Ver el
          comentario de allí abajo: mientras no midan bien, no pueden ocupar el
          sitio que se lee primero. */}
      <DescripcionEditable pubId={p.id} cuerpo={p.cuerpo || ""} estado={p.estado} tipo={p.tipo}
        imagenes={p.imagenes || []}
        pie={<Reacciones pubId={p.id} reacciones={rxPub} userId={user.id} />} />

      {/* En una reunión, «me enteré» es «confirmo que voy». */}
      {llevaEnterado(p.tipo) && (
        <AvisoEnterado
          pubId={p.id}
          userId={user.id}
          enteradosIds={rxPub.filter((r: any) => r.emoji === "👀").map((r: any) => r.usuario_id)}
          equipo={sinBot(perfiles)}
          fechaLimite={p.fecha_limite}
        />
      )}

      {/* Aquí vivían las reacciones y el botón de archivar, compartiendo una
          fila porque las dos sobraban donde estaban. Archivar subió junto al
          tipo, con las demás decisiones sobre el caso; las reacciones entraron
          en la tarjeta de la descripción, que es a lo que se reacciona. La
          fila entera —y sus dos huecos— desaparece. */}

      <div className="linked">
        <h4>🔗 Vínculos y etiquetas</h4>
        <VinculosEditor pubId={p.id} actuales={actualesVinc} catalogos={catEnt} />
        <div style={{ marginTop: 8 }}>
          <EtiquetasEditor pubId={p.id} actuales={etiquetasActuales} todas={etqTodas} />
        </div>
      </div>

      {/* Plegado: con 15 personas la lista alarga muchísimo la página. El
          conteo en el resumen ya dice cuánto trabajo cuelga del caso. */}
      {trabajoRel.length > 0 && (
        <details className="linked trabajo-rel">
          <summary>
            🧰 Trabajo relacionado <span className="tr-n">{relDelCaso.length}</span>
            <i>lo que hizo la gente de este caso sobre las entidades vinculadas</i>
          </summary>
          <div style={{ marginTop: 8 }}>
            {relDelCaso.length > 0 ? (
              <div className="tl">
                {relDelCaso.map((e: any, i: number) => (
                  <EventoHistorial key={i} e={e} hora={fecha(e.creado_en)} conEntidad />
                ))}
              </div>
            ) : (
              <div className="empty" style={{ padding: "6px 0" }}>
                Nadie del caso ha tocado aún las entidades vinculadas.
              </div>
            )}

            {/* Contexto: pasó sobre las mismas entidades y en la misma ventana,
                pero lo hizo otra gente y para otra cosa. Se muestra atenuado
                porque ayuda a entender, y NO cuenta para el avance. */}
            {relContexto.length > 0 && (
              <div className="tr-contexto">
                <div className="tr-ctx-h">Contexto · otras manos, no cuenta para el avance · {relContexto.length}</div>
                <div className="tl">
                  {relContexto.map((e: any, i: number) => (
                    <EventoHistorial key={i} e={e} hora={fecha(e.creado_en)} conEntidad />
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {(!p.padre_id || (hijos || []).length > 0) && (
        <SubCasos padreId={p.id} hijos={hijos || []} perfiles={perfilesCortos} />
      )}

      <div className="h4">🕐 Actividad · {linea.length} eventos</div>
      <div className="tl">
        {agruparEventos(linea as any[]).map((f: any, i: number) => {
          /* Ráfaga: nueve «vinculó persona: X» del mismo actor en el mismo
             minuto son un solo hecho. Se pliega, y adentro está el detalle. */
          if (f.grupo) {
            const g = f.grupo, e0 = g[0], eN = g[g.length - 1];
            return (
              <details className="ev-grupo" key={i}>
                <summary>
                  <span className="eg-ico">{EV_ICO[e0.tipo] || "•"}</span>
                  <span className="eg-txt">
                    {textoEvento(e0)}<b className="eg-n">+{g.length - 1} más</b>
                  </span>
                  <span className="eg-t">{fecha(e0.creado_en)} — {fecha(eN.creado_en)}</span>
                </summary>
                <div className="tl eg-detalle">
                  {g.map((x: any, j: number) => (
                    <div className={`tl-ev ${x.actor ? x.tipo : "bot"}`} key={j}>
                      <span>{EV_ICO[x.tipo] || "•"}</span>
                      <span>{textoEvento(x)}</span>
                      <span className="t">{fecha(x.creado_en)}</span>
                    </div>
                  ))}
                </div>
              </details>
            );
          }
          const e: any = f.solo;
          if (e.comentario) {
            const c = e.comentario;
            const padreC = c.responde_a ? (comMap.get(c.responde_a) as any) : null;
            return (
              <div className="tl-com" id={ANCLA_COM(c.id)} key={i}>
                <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={32} src={c.autor?.avatar_url} />
                <div className="bubble">
                  <div className="who">{c.autor?.nombre}<span className="t">{fecha(c.creado_en)}</span></div>
                  {padreC && (() => {
                    /* En vez de solo «↳ en respuesta a X», citamos el comentario
                       padre (autor + un extracto) y lo hacemos un enlace-ancla:
                       al pulsarlo salta y resalta el original, así el hilo se
                       sigue sin perderse aunque estén separados en el tiempo. */
                    const cita = (padreC.cuerpo || "").replace(/\s+/g, " ").trim();
                    return (
                      <a href={`#com-${padreC.id}`} className="tl-resp-cita" title="Ir al comentario original">
                        <span className="tl-resp-cab">↳ en respuesta a <b>{padreC.autor?.nombre?.split(" ")[0] || "un comentario"}</b></span>
                        {cita && <span className="tl-resp-txt">{cita.length > 90 ? cita.slice(0, 90) + "…" : cita}</span>}
                      </a>
                    );
                  })()}
                  <ComentarioTexto comentarioId={c.id} pubId={p.id} cuerpo={c.cuerpo || ""}
                    imagenes={c.imagenes || []} esMio={c.autor_id === user.id} editadoEn={c.editado_en} />
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
          Iba en el ÚLTIMO elemento a propósito —sin nada debajo, el navegador
          scrollea hasta el tope y deja a la vista la cola de la conversación
          con el cuadro de responder—. Ahora tiene debajo las barras de
          progreso, que son cortas: el efecto se mantiene porque lo que queda
          por debajo cabe de sobra en la pantalla. Si algún día crece lo de
          abajo, esto vuelve a ser el último. */}
      <div id="comentarios" style={{ scrollMarginTop: 16 }}>
        <CommentBox pubId={p.id} userId={user.id} perfiles={perfiles || []} />
      </div>

      {/* ── ⏳ TIEMPO VS ⚡ TRABAJO, AL FINAL MIENTRAS NO SEA DE FIAR ──
          Vivía justo debajo de la cabecera, en el sitio que se lee primero. Ese
          sitio es una promesa: lo que está ahí es lo que hay que mirar antes
          que nada, y estas barras todavía no miden bien —un caso descartado
          aparece al 100 %—.
          No se retira, porque la idea es buena y el trabajo de afinarla está
          pendiente, no descartado. Se baja: una medida en la que aún no se
          confía puede estar disponible sin encabezar la página, y así nadie
          toma una decisión mirándola de reojo. Cuando cuadre, vuelve arriba. */}
      {progreso && (
        <div className="card" style={{ padding: "12px 15px", marginTop: 14 }}>
          <BarrasProgreso p={progreso} />
        </div>
      )}
    </div>
  );
}
