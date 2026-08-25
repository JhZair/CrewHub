import { createClient, usuarioActual } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Tablero from "@/components/Tablero";
import TableroTimeline from "@/components/TableroTimeline";
import ListaCasos from "@/components/ListaCasos";
import Realtime from "@/components/Realtime";
import FiltroTablero from "@/components/FiltroTablero";
import { contarHijos } from "@/lib/familia";
import { progresoDe } from "@/lib/progreso";
import { avisoVencido } from "@/lib/estados";
import { BOT } from "@/lib/personas";
import { TIPOS_CASO, rotuloMonton } from "@/lib/tipos";
import { TABLA_DE } from "@/lib/secciones";
import Link from "@/components/Enlace";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🗂 Tablero" };

/* `v` es SOLO el tipo. «Mis asuntos» salió de aquí: era el «de quién», y
   vivía en la misma variable que el «de qué» — por eso eran excluyentes y no
   existía «mis tareas». Ahora es un chip que toca el eje persona. */
/* ── SE DERIVAN, NO SE ESCRIBEN ──
   Eran cuatro a mano —tarea, problema, consulta, pago— y por eso Ideas,
   Avisos y Reuniones no se podían filtrar aquí: los casos SÍ estaban en el
   tablero, pero no había con qué pedirlos. Un tipo nuevo no puede depender de
   que alguien se acuerde de esta lista; es la misma trampa que el compositor
   ya había desarmado tirando de `TIPOS_CASO`.
   El plural sale de `rotuloMonton`, que también sabe que «Reunión» hace
   «Reuniones» y no «Reunións». */
const TIPOS_F: [string, string][] = TIPOS_CASO.map(t => [t.tipo, rotuloMonton(t.tipo)]);

/* Estados que viven en el tablero. Ya NO se excluye por estado —«archivada»
   dejó de ser uno—: lo archivado se filtra por `archivado_en`, abajo. Entra
   `descartada`: un caso que ya no aplica se ve hasta que se archiva, con su
   propia columna, para que arrastrar siga siendo «una columna = un estado». */
const ESTADOS = ["abierta", "en_progreso", "seguimiento", "en_pausa", "resuelta", "descartada"];

/* ⚠ EL TOPE, Y POR QUÉ ES UNO SOLO.
   Hoy son 169 casos vivos: el tablero entero cabe en una consulta. Tres cosas
   dependen de este número y TIENEN que verlo igual:
     · la consulta de las tarjetas
     · el universo de los contadores de los chips
     · la intersección de los filtros por vínculo, que se hace en memoria
   Estaban en 300 y 500 por separado. Con 169 no se nota, pero pasando de 300
   el tablero empezaría a mentir sin avisar: «🌐 Todo 169» diciendo un número
   que no cuadra con lo que hay en las columnas, y un filtro por etiqueta
   mirando solo los 300 más nuevos. Si algún día esto se queda corto, lo que
   toca no es subirlo: es paginar. */
const TOPE = 500;

/* Los cinco filtros por VÍNCULO. Los cinco salen del mismo sitio
   —`publicacion_vinculos`— así que son un mecanismo con cinco desplegables,
   no cinco filtros. Añadir uno nuevo es una línea aquí. */
const EJES_VINC: { param: string; tipo: string; ico: string; titulo: string }[] = [
  { param: "etq", tipo: "etiqueta", ico: "🏷", titulo: "Etiqueta" },
  { param: "proy", tipo: "proyecto", ico: "📁", titulo: "Proyecto" },
  { param: "emp", tipo: "empresa", ico: "🏢", titulo: "Empresa" },
  { param: "conv", tipo: "convocatoria", ico: "📜", titulo: "Convocatoria" },
  { param: "post", tipo: "postulacion", ico: "🎯", titulo: "Postulación" },
  /* Equipo y repositorio faltaban: se pueden VINCULAR desde el compositor —los
     dos están en su bandeja— pero no se podían PEDIR aquí, así que «todo lo de
     la Sony FX3» o «los casos de este documento» eran preguntas sin pantalla.
     Un vínculo que se puede poner y no se puede buscar es media función.
     Los desplegables solo ofrecen lo que TIENE casos en el tablero (ver
     `pDesplegables`), así que sumar ejes no llena la barra de opciones muertas:
     un eje sin nada sale vacío y se nota.
     Quedan fuera persona y lugar a propósito: «persona» ya tiene su propio eje
     —el 👤 de responsable, que es lo que se pregunta el 99 % de las veces— y
     dos controles para la misma palabra se contradicen. El día que haga falta,
     es una línea. */
  { param: "equi", tipo: "equipamiento", ico: "🎥", titulo: "Equipo" },
  { param: "obj", tipo: "objeto", ico: "📚", titulo: "Repositorio" },
  /* Y el LUGAR. Este tablero es donde se mira todo lo referido a casos, así
     que un vínculo que el compositor deja poner tiene que poderse pedir aquí:
     «qué hay pendiente en Pomacanchi» es una pregunta de rodaje, no un
     capricho. Queda fuera solo persona, que ya tiene su propio eje (el 👤 de
     responsable). */
  { param: "lug", tipo: "lugar", ico: "📍", titulo: "Lugar" },
];

export default async function TableroPage({ searchParams }: {
  searchParams: { v?: string; p?: string; modo?: string; arch?: string; ord?: string;
    /* Un parámetro por eje de vínculo. ⚠ Tiene que llevar el mismo `param` que
       `EJES_VINC`: si se añade un eje allá y no aquí, TypeScript no dice nada
       —`searchParams` es un objeto— y el filtro llega siempre vacío. */
    etq?: string; proy?: string; emp?: string; conv?: string; post?: string;
    equi?: string; obj?: string; lug?: string };
}) {
  /* Tres vistas de los MISMOS casos, ya filtrados: columnas (¿cómo va?),
     línea de tiempo (¿cuándo?) y lista (todo junto, en el orden que yo diga).
     `modo` se valida contra la lista y no se acepta en crudo: una URL con
     `modo=loquesea` tiene que caer en algo que exista. */
  const modoPedido = searchParams?.modo === "timeline" ? "timeline"
    : searchParams?.modo === "lista" ? "lista" : "columnas";
  /* Modo ARCHIVADAS: el mismo tablero, mirando lo guardado en vez de lo vivo.
     Las columnas siguen siendo el eje ESTADO —una archivada resuelta cae en
     Resueltas—; lo único que cambia es qué dataset se trae. `archivado_en is
     not null` en vez de `is null`. */
  const arch = searchParams?.arch === "1";
  /* ── EL ARCHIVO SE MIRA POR COLUMNAS ──
     El toggle de vista no se pinta en el archivo, pero eso solo impide ENTRAR:
     `modo` viaja en la URL y en todos los enlaces de filtro, así que un
     marcador o un enlace compartido dejaba a alguien en «lista + archivo» sin
     ningún control a la vista para salir. Y ahí la lista miente por partida
     doble: casi todo lo archivado está cerrado, así que la columna de plazo
     entera queda muda y el orden por defecto la usa.
     Se corrige el valor, no se esconde el problema: la URL puede pedir lo que
     quiera, la pantalla decide qué tiene sentido. */
  const modo = arch && modoPedido !== "columnas" ? "columnas" : modoPedido;
  const supabase = createClient();
  // Compartido con `QuienEstaGlobal` del layout: una verificación, no dos.
  const user = await usuarioActual();
  if (!user) redirect("/login");

  /* ── LOS EJES DEL TABLERO ──
     Siete, y todos se suman. Antes había uno solo: `v` guardaba a la vez «de
     quién» (mios) y «de qué tipo» (tarea), y encima cada control construía su
     href con SU parámetro y nada más —los chips sin `p`, FiltroPersona sin
     `v`—, así que elegir cualquier cosa borraba lo anterior. No era un
     descuido: el tablero nació de un eje. Con 169 casos, John no quiere
     elegir un eje: quiere cruzarlos.
       v · tipo    p · persona    etq/proy/emp/conv/post · vínculos
     `modo` no es un filtro (es la vista) pero viaja igual: perder la línea de
     tiempo al tocar un filtro era otra forma del mismo bicho. */
  const F: Record<string, string> = {
    v: searchParams?.v || "",
    p: searchParams?.p || "",
    /* Los ejes de vínculo se recogen DERIVANDO de `EJES_VINC`, no uno a uno:
       escritos a mano, añadir un eje pedía tocar tres sitios —la lista, este
       objeto y el tipo de `searchParams`— y olvidarse de este no da error: el
       desplegable se pinta, se puede elegir… y el filtro llega vacío. */
    ...Object.fromEntries(EJES_VINC.map(e =>
      [e.param, (searchParams as Record<string, string | undefined>)?.[e.param] || ""])),
    modo: modo === "columnas" ? "" : modo,
    /* El orden de la LISTA viaja como los demás ejes. Era estado del
       componente y se perdía en cuanto se tocaba un filtro —cada filtro es una
       navegación—, además de no poderse compartir. */
    ord: searchParams?.ord || "",
    arch: arch ? "1" : "",   // viaja en la URL como los demás, para preservarse
  };
  /* «Nunca lo toqué» y «quiero verlo TODO» son dos cosas, y una URL vacía
     solo sabe decir una. Sin un valor explícito para la segunda, el chip
     «🌐 Todo» llevaba a `/tablero`, el sistema lo leía como «recién llega» y
     le devolvía «Mis asuntos»: era IMPOSIBLE ver el tablero entero: el botón
     que existe justo para eso te regresaba a lo tuyo, sin decir nada. */
  const P_TODOS = "todos";
  /* ── SIN ASIGNAR ──
     Un caso sin responsable no se veía en NINGUNA pantalla: el eje persona
     solo sabía preguntar «¿de quién es?», y la respuesta «de nadie» no estaba
     entre las opciones. Es justo el caso que más merece salir solo: nadie lo
     está mirando por definición, así que no hay quien lo eche de menos.
     Va como un valor del MISMO eje y no como un chip aparte: «de quién es» es
     una pregunta con una respuesta, y dos controles para ella acabarían
     contradiciéndose (persona=Katy + sin asignar = ¿qué?). */
  const P_NADIE = "nadie";
  const enLimpio = !Object.entries(F).some(([k, x]) => k !== "modo" && k !== "arch" && x);
  /* El default depende de la VISTA:
     · vivo    → «Mis asuntos» (tu trabajo de hoy)
     · archivo → «Todo el equipo». El archivo es memoria compartida —«no soy
       el único que archiva», dijo John—, así que abrirlo mostrando solo lo
       tuyo esconde lo de los demás. */
  if (enLimpio) F.p = arch ? P_TODOS : user.id;
  const pFiltro = F.p;
  const v = F.v;

  /* El único constructor de URL del tablero: cambia lo que le pidas y
     conserva TODO lo demás. Cada control que se invente su URL es un eje que
     pisa a los otros — que es exactamente de lo que venimos. */
  const vivos = Object.fromEntries(Object.entries(F).filter(([, x]) => x));
  const urlCon = (cambios: Record<string, string>) => {
    const u = new URLSearchParams(vivos);
    Object.entries(cambios).forEach(([k, x]) => x ? u.set(k, x) : u.delete(k));
    const s = u.toString();
    return `/tablero${s ? "?" + s : ""}`;
  };

  // Persona en foco. `P_TODOS` es «el equipo entero», dicho a propósito.
  const uidFoco = (pFiltro === P_TODOS || pFiltro === P_NADIE) ? null : (pFiltro || null);
  const sinAsignar = pFiltro === P_NADIE;
  /* FILTROS POR VÍNCULO — la intersección.
     Un caso pasa si tiene TODOS los elegidos: «🏷 Subsanaciones DAFO» +
     «📁 Pampacucho» es lo que cuelga de las dos cosas, no de cualquiera. Y
     eso importa: en semana de subsanaciones un concurso genera veinte casos
     y la unión no filtraría nada.
     Cinco consultas como mucho, y solo de las que están puestas. */
  const ejesPuestos = EJES_VINC.filter(e => F[e.param]);

  /* ══════════════════════════════════════════════════════════════════════════
     ERA LA PANTALLA MÁS LENTA DEL SISTEMA: 2844 ms

     Medido con la mediana de cinco, contra un suelo de 195 ms. Y lo revelador
     es la comparación: la portada hace VEINTISÉIS consultas en seis olas y
     tarda 1657; esto hacía VEINTE en trece olas y tardaba casi el doble. Lo que
     cuesta no es cuántas consultas son — es cuántas veces se para a esperar.

     Casi ninguna de esas trece esperas hacía falta. El equipo, mi ficha, la
     ficha de la persona en foco, los filtros de la URL y el universo de los
     contadores no dependen unos de otros: dependen de la URL y de `user.id`,
     que se conocen antes de pedir nada.

     Cinco tandas, cada una porque la siguiente necesita algo suyo:
       1. lo que se sabe con la URL y `user.id`
       2. los vínculos de persona y los del universo  ← necesitan las fichas
       3. los casos del tablero y los desplegables    ← necesitan los vínculos
       4. hijos, reacciones y vínculos de las tarjetas ← necesitan los ids
       5. los nombres de las entidades vinculadas     ← necesitan esos vínculos
     ══════════════════════════════════════════════════════════════════════════ */

  /* Una FUNCIÓN y no un objeto compartido. Con un solo `{data:[]}` para las
     seis ramas, en un tablero vacío `hijosData`, `reaccs`, `vincs` y los demás
     serían LA MISMA instancia de array: el día que alguien le haga un `.sort()`
     a uno, corrompe los otros cinco — y solo cuando no hay casos, que es donde
     nadie mira. Cuesta un `()` evitarlo. */
  const SIN_FILAS = () => ({ data: [] as any[] });
  /* (Este mapa era una copia de `TABLA_DE` de lib/secciones — la tercera que
     aparece hoy: la otra vive en actions.ts como `ENT_TABLA`. Se importa.) */
  const TABLA_ENT = TABLA_DE;
  const [{ data: { session } }, { data: equipoPerf }, { data: yoUser },
    { data: yoFoco }, ejesData, { data: universo }] = await Promise.all([
    supabase.auth.getSession(),
    // El equipo, para poder mirar los asuntos de cada quien
    supabase.from("perfiles")
      .select("id,nombre").eq("activo", true).neq("nombre", BOT).order("nombre"),
    // Mi ficha de persona, y la de la persona en foco si es otra.
    supabase.from("personas").select("id").eq("usuario_id", user.id).maybeSingle(),
    uidFoco && uidFoco !== user.id
      ? supabase.from("personas").select("id").eq("usuario_id", uidFoco).maybeSingle()
      : Promise.resolve({ data: null as any }),
    /* Los ejes puestos, TODOS A LA VEZ.
       Estaban en un `for` con la consulta dentro, y ese bucle tenía un `break`:
       si la intersección se quedaba vacía, las siguientes no se pedían. Se
       pierde ese ahorro y se gana mucho más — eran hasta cinco esperas
       encadenadas para cruzar cinco listas que no se necesitan entre sí, y el
       `break` solo salta en el caso raro de cruzar filtros sin nada en común.
       Cambiar cinco esperas seguras por una posible de más es buen negocio. */
    Promise.all(ejesPuestos.map(e =>
      supabase.from("publicacion_vinculos").select("publicacion_id")
        .eq("entidad_tipo", e.tipo).eq("entidad_id", F[e.param]).limit(2000))),
    /* Universo para los contadores y los catálogos de filtros. Sigue al MODO:
       en archivadas cuenta lo archivado, o «Todo» y los desplegables de etiqueta
       mostrarían lo vivo mientras las columnas muestran lo guardado.
       No depende de ningún filtro, y estaba a mitad de la cascada. */
    (() => {
      const qu = supabase.from("publicaciones")
        .select("id,tipo,autor_id,responsable,fecha_limite")
        .in("estado", ESTADOS).neq("tipo", "bitacora").limit(TOPE);
      return arch ? qu.not("archivado_en", "is", null) : qu.is("archivado_en", null);
    })(),
  ]);

  /* La intersección se aplica en MEMORIA, no con `.in("id", [...])`.
     Cada uuid pesa ~39 bytes ya percent-encodeado; una etiqueta con 400 casos
     hace una query string de ~16 KB y PostgREST la corta con un 414 mucho
     antes del tope de 2000 que estas consultas piden. Y un 414 aquí no avisa:
     se ve un tablero vacío y parece que no hay nada con esa etiqueta.

     Sin `as any`: si el tipo de `ejesData` cambiara, el cast lo taparía y esto
     se degradaría a un conjunto vacío — o sea, a un tablero vacío sin error,
     que es exactamente el modo de fallo que el párrafo de arriba vigila. */
  let idsVinc: Set<string> | null = null;
  for (const r of ejesData) {
    const ids = new Set<string>((r.data || []).map(x => x.publicacion_id as string));
    idsVinc = idsVinc === null ? ids : new Set([...idsVinc].filter(x => ids.has(x)));
  }

  // Los avisos vencidos ya no cuentan en el tablero activo (igual que las columnas).
  const U = (universo || []).filter((p: any) => arch || !avisoVencido(p.tipo, p.fecha_limite));
  const idsUniv = U.map((p: any) => p.id);

  /* ── LOS DESPLEGABLES, EN UNA VÍA MUERTA A PROPÓSITO ──
     Salen del universo entero, no de lo filtrado —si no, elegir una etiqueta
     vaciaría los otros cuatro—, así que no dependen de los casos del tablero y
     los casos no dependen de ellos. Y son lo más caro de la página: un `.in()`
     de hasta 500 uuids con tope 4000, más una consulta por eje.
     Puestos en la misma tanda que los vínculos de persona, la consulta
     principal —la que marca el camino crítico— arrancaba cuando terminaba la
     más lenta que ni siquiera necesita. Aquí salen ya y se recogen al final.
     ⚠ Sin `await`: una promesa guardada, no una espera. */
  const pDesplegables = (async () => {
    const { data: vincUniv } = idsUniv.length
      ? await supabase.from("publicacion_vinculos").select("entidad_tipo,entidad_id")
          .in("publicacion_id", idsUniv).limit(4000)
      : SIN_FILAS();
    /* Solo lo que EXISTE en el tablero: ofrecer las 60 etiquetas del sistema
       cuando 8 tienen casos abiertos es hacerle buscar a alguien entre opciones
       que no llevan a ningún sitio. */
    const cat: Record<string, { id: string; nombre: string }[]> = {};
    await Promise.all(EJES_VINC.map(async e => {
      const ids = [...new Set((vincUniv || [])
        .filter((x: any) => x.entidad_tipo === e.tipo).map((x: any) => x.entidad_id))];
      if (!ids.length) { cat[e.param] = []; return; }
      /* Sin tabla conocida no se pide nada: un eje mal escrito daría
         `supabase.from(undefined)` y tumbaría los SEIS desplegables, no solo
         el suyo — están en el mismo `Promise.all`. */
      const t = TABLA_ENT[e.tipo];
      if (!t) { cat[e.param] = []; return; }
      const { data } = await supabase.from(t[0]).select(`id,${t[1]}`).in("id", ids);
      cat[e.param] = (data || [])
        .map((r: any) => ({ id: r.id, nombre: r[t[1]] }))
        .filter(r => r.nombre)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }));
    return cat;
  })();

  /* ══ TANDA 2 ══ los vínculos de persona: los míos y los de quien esté en
     foco. Es lo único que la consulta principal necesita esperar. */
  const [{ data: vsUser }, { data: vsFoco }] = await Promise.all([
    yoUser?.id
      ? supabase.from("publicacion_vinculos").select("publicacion_id")
          .eq("entidad_tipo", "persona").eq("entidad_id", yoUser.id).limit(300)
      : SIN_FILAS(),
    yoFoco?.id
      ? supabase.from("publicacion_vinculos").select("publicacion_id")
          .eq("entidad_tipo", "persona").eq("entidad_id", yoFoco.id).limit(300)
      : SIN_FILAS(),
  ]);
  // Vínculos de persona del USUARIO logueado (para "Mis asuntos" y su contador)
  const misVinc: string[] = (vsUser || []).map((x: any) => x.publicacion_id);
  /* Si la persona en foco soy yo, es la MISMA lista: no se vuelve a pedir. Esa
     rama ya existía; lo que cambia es que ahora tampoco cuesta una espera. */
  const vinculadas: string[] = uidFoco === user.id
    ? misVinc
    : (vsFoco || []).map((x: any) => x.publicacion_id);

  let q = supabase.from("publicaciones")
    .select("id,titulo,tipo,estado,fecha_inicio,fecha_limite,hora,creado_en,autor_id,responsable,comentarios(count),resp:perfiles!publicaciones_responsable_fkey(nombre,color,avatar_url)")
    .in("estado", ESTADOS)
    .neq("tipo", "bitacora")   // las notas del muro solo viven en su proyecto
    .order("creado_en", { ascending: false })
    .limit(TOPE);
  // El eje archivado: vivo (`is null`) o guardado (`not null`), según el modo.
  q = arch ? q.not("archivado_en", "is", null) : q.is("archivado_en", null);
  /* Los tres ejes se APILAN. Antes era `if (uidFoco) ... else if (v)`: el
     `else` es literalmente el motivo de que «mis tareas» no existiera. */
  if (uidFoco) {
    const cond = [`autor_id.eq.${uidFoco}`, `responsable.eq.${uidFoco}`];
    if (vinculadas.length) cond.push(`id.in.(${vinculadas.join(",")})`);
    q = q.or(cond.join(","));
  }
  if (v) q = q.eq("tipo", v);
  /* En la CONSULTA y no en memoria: el tablero trae como mucho `TOPE` filas
     ordenadas por fecha, así que filtrar después dejaría fuera lo viejo sin
     responsable — que es precisamente lo que se viene a buscar aquí. */
  if (sinAsignar) q = q.is("responsable", null);

  // ══ TANDA 3 ══ los casos del tablero.
  const { data: pubsCrudo } = await q;

  /* Aquí se APLICA la intersección que se calculó arriba (ver `idsVinc`).
     ⚠ Es exacta mientras `TOPE` cubra el tablero entero — hoy son 169 casos
     vivos contra un tope de 500. El día que se pase, el filtro por vínculo
     empezaría a mirar solo los más nuevos y a mentir en silencio. Ése es el
     número a vigilar, y está aquí escrito para que se note.
     (El comentario decía «el `.limit(300)` de arriba» y ese 300 ya no existe:
     `TOPE` unificó los tres números hace tiempo y esta frase se quedó atrás.) */
  const pubs = (idsVinc === null
    ? (pubsCrudo || [])
    : (pubsCrudo || []).filter((p: any) => idsVinc!.has(p.id)))
    // Un aviso VENCIDO ya no rige: fuera del tablero activo (en la vista de
    // archivadas no aplica —ahí solo hay `archivado_en`, no avisos vencidos—).
    .filter((p: any) => arch || !avisoVencido(p.tipo, p.fecha_limite));

  /* ══ TANDA 4 ══ lo que decora cada tarjeta. Las tres cuelgan del mismo
     `idsPubs` y ninguna del resultado de la anterior; eran tres esperas. */
  const idsPubs = (pubs || []).map((p: any) => p.id);
  const [{ data: hijosData }, { data: reaccs }, { data: vincs }] = await Promise.all([
    // `estado` faltaba: este era el conteo que había divergido — solo sabía
    // cuántos hijos hay, nunca cuántos están cerrados.
    idsPubs.length
      ? supabase.from("publicaciones").select("padre_id,estado,archivado_en").in("padre_id", idsPubs)
      : SIN_FILAS(),
    idsPubs.length
      ? supabase.from("reacciones").select("publicacion_id,emoji")
          .is("comentario_id", null).in("publicacion_id", idsPubs)
      : SIN_FILAS(),
    // Vínculos (entidades relacionadas) para dar contexto en cada tarjeta
    idsPubs.length
      ? supabase.from("publicacion_vinculos")
          .select("publicacion_id,entidad_tipo,entidad_id").in("publicacion_id", idsPubs)
      : SIN_FILAS(),
  ]);
  const subDe = contarHijos(hijosData);
  const reacDe = new Map<string, Record<string, number>>();
  (reaccs || []).forEach((r: any) => {
    const m = reacDe.get(r.publicacion_id) || {};
    m[r.emoji] = (m[r.emoji] || 0) + 1;
    reacDe.set(r.publicacion_id, m);
  });

  /* ══ TANDA 5 ══ el nombre de cada entidad vinculada, una consulta por tabla.
     Esta sí depende de la anterior: hasta que no se sabe QUÉ está vinculado no
     se puede preguntar cómo se llama. */
  const porTipo = new Map<string, Set<string>>();
  (vincs || []).forEach((vv: any) => {
    if (!porTipo.has(vv.entidad_tipo)) porTipo.set(vv.entidad_tipo, new Set());
    porTipo.get(vv.entidad_tipo)!.add(vv.entidad_id);
  });
  const nombreEnt = new Map<string, string>();
  await Promise.all([...porTipo.entries()].map(async ([tipo, idset]) => {
    const t = TABLA_ENT[tipo]; if (!t) return;
    const { data } = await supabase.from(t[0]).select(`id,${t[1]}`).in("id", [...idset]);
    (data || []).forEach((r: any) => nombreEnt.set(`${tipo}:${r.id}`, r[t[1]]));
  }));
  const vincDe = new Map<string, { tipo: string; id: string; nombre: string }[]>();
  (vincs || []).forEach((vv: any) => {
    const nombre = nombreEnt.get(`${vv.entidad_tipo}:${vv.entidad_id}`);
    if (!nombre) return;
    const l = vincDe.get(vv.publicacion_id) || [];
    l.push({ tipo: vv.entidad_tipo, id: vv.entidad_id, nombre });
    vincDe.set(vv.publicacion_id, l);
  });

  /* "Mis asuntos" es más ancho que el banco de trabajo a propósito: el banco
     es lo que TENGO QUE HACER (soy responsable) y esta pestaña es lo que ME
     INCUMBE, que además incluye lo que delegué y lo que me menciona.
     La regla estaba bien; lo que faltaba era decirlo. Sin la marca, ver 12
     aquí y 7 en el banco parece un error del sistema. */
  const marcaFoco = (p: any): "delegado" | "mencion" | null => {
    if (!uidFoco) return null;
    if (p.responsable === uidFoco) return null;         // es suyo: sin marca
    if (p.autor_id === uidFoco) return "delegado";      // lo pidió, lo hace otro
    return "mencion";                                    // solo lo mencionan
  };

  const pubsE = (pubs || []).map((p: any) => {
    const fam = subDe.get(p.id) || null;
    return {
      ...p,
      nc: p.comentarios?.[0]?.count ?? 0,
      sub: fam?.total || 0,
      reac: reacDe.get(p.id) || {},
      vinc: vincDe.get(p.id) || [],
      marca: marcaFoco(p),
      /* ⏳ vs ⚡ para la barrita de la tarjeta. Sin `ultimoMovimiento`: el
         tablero no carga la bitácora, y no saberlo no es estar detenido. */
      prog: progresoDe({
        creado_en: p.creado_en, fecha_inicio: p.fecha_inicio, fecha_limite: p.fecha_limite,
        estado: p.estado, tipo: p.tipo,
        hijos: fam && fam.total > 0 ? fam : null,
        vinculadasTotal: (vincDe.get(p.id) || []).length,
      }),
    };
  });

  // El universo y sus vínculos ya vinieron en las tandas 1 y 2.
  const misSet = new Set(misVinc);
  /* Los contadores son del UNIVERSO, no del filtro: dicen cuánto hay de cada
     tipo en el tablero entero. Con los ejes apilados eso podría confundir
     —«Tareas 142» y al tocarlo salen 12, porque sigue puesta una etiqueta—,
     pero la alternativa es peor: un contador que cambia con cada filtro no
     sirve para decidir a dónde ir. Es un mapa, no un resultado. */
  const conteo: Record<string, number> = {
    mios: U.filter((p: any) => p.autor_id === user.id || p.responsable === user.id || misSet.has(p.id)).length,
    todo: U.length,
    /* Uno por cada chip, y sacado de la MISMA lista que los pinta: con los
       cuatro conteos escritos a mano, un chip nuevo salía siempre con «0»
       —`conteo[val] ?? 0`— y parecía que no había nada de ese tipo. */
    ...Object.fromEntries(TIPOS_F.map(([t]) => [t, U.filter((p: any) => p.tipo === t).length])),
  };

  // Los desplegables ya se llenaron en la tanda 3, junto a los casos.
  /* Hay filtro si algo recorta el tablero. `p=todos` NO recorta: es la
     ausencia de filtro dicha en voz alta. */
  const hayFiltro = !!(v || ejesPuestos.length || uidFoco || sinAsignar);
  // La URL de «sin nada»: los siete ejes fuera y el «todo el equipo» explícito.
  // `modo` y `arch` se preservan: limpiar filtros no debe sacarte de la vista.
  const urlLimpia = (() => {
    const u = new URLSearchParams({ p: P_TODOS });
    if (modo !== "columnas") u.set("modo", modo);
    if (arch) u.set("arch", "1");
    return `/tablero?${u.toString()}`;
  })();

  const de = (estado: string, limite?: number) => {
    const lista = pubsE.filter((p: any) => p.estado === estado);
    return limite ? lista.slice(0, limite) : lista;
  };

  const columnas = [
    // 📥 entró y espera · 🛠 se trabaja · 🔭 se vigila — mismo vocabulario
    // que el banco de trabajo. Antes 🔴 y 🟡 solo repetían el color.
    { estado: "abierta", titulo: "📥 Sin Resolver", color: "var(--red)", items: de("abierta") },
    { estado: "en_progreso", titulo: "🛠 En Progreso", color: "var(--yellow)", items: de("en_progreso") },
    { estado: "seguimiento", titulo: "🔭 Seguimiento", color: "var(--teal)", items: de("seguimiento") },
    { estado: "en_pausa", titulo: "⏸ En Pausa", color: "var(--blue)", items: de("en_pausa") },
    // Resueltas SIN tope: para archivar en lote hay que verlas todas. El cap
    // de 12 escondía justo las que ibas a arrastrar a la zona. (Acotado por
    // TOPE=500 de la consulta, como todo el tablero.)
    { estado: "resuelta", titulo: "✅ Resueltas", color: "var(--green)", items: de("resuelta") },
    { estado: "descartada", titulo: "🚫 Descartadas", color: "var(--dim)", items: de("descartada") },
  ];
  /* En el archivo, ocultar las columnas vacías. Casi todo lo archivado es
     Resueltas/Descartadas/avisos Vigentes —«En Progreso» archivado no existe—,
     así que cinco columnas vacías hacían parecer roto el tablero. En la vista
     VIVA se quedan todas: ahí «En Progreso · 0» sí informa. */
  const columnasVista = arch ? columnas.filter(c => c.items.length > 0) : columnas;

  // Casos para la vista de línea de tiempo
  const casosTL = pubsE.map((p: any) => ({
    id: p.id, titulo: p.titulo, tipo: p.tipo, estado: p.estado,
    fecha_limite: p.fecha_limite, creado_en: p.creado_en, resp: (p.resp as any)?.nombre || null,
    nc: p.nc, sub: p.sub, reac: p.reac,
  }));

  // El toggle también pasa por `urlCon`: preservaba v/p a mano y se olvidaba
  // de los cinco ejes nuevos en cuanto existieran.
  const urlCols = urlCon({ modo: "" });
  const urlTime = urlCon({ modo: "timeline" });
  const urlLista = urlCon({ modo: "lista" });
  /* «plazo» es el defecto y por eso NO va en la URL: un parámetro que repite
     el valor por omisión ensucia todos los enlaces del tablero para no decir
     nada. Y se valida contra la lista de órdenes: `ord=loquesea` cae en el
     defecto en vez de dejar la tabla sin ordenar. */
  const ORDS = ["plazo", "estado", "responsable", "reciente"] as const;
  const ordenLista = (ORDS as readonly string[]).includes(F.ord)
    ? (F.ord as typeof ORDS[number]) : "plazo";
  /* Las cuatro URLs, ARMADAS AQUÍ. A un componente de cliente solo cruzan
     datos: mandarle la función que las arma compila igual y revienta en el
     navegador. Son cuatro cadenas; construirlas todas cuesta menos que la
     duda. */
  const hrefsOrden = Object.fromEntries(
    ORDS.map(o => [o, urlCon({ ord: o === "plazo" ? "" : o })]),
  ) as Record<typeof ORDS[number], string>;

  /* Los desplegables, recogidos al final. Llevan volando desde antes de la
     tanda 2, así que a estas alturas normalmente ya llegaron y este `await`
     no espera nada. Si llegara a esperar, sería lo único que falta. */
  const catalogos = await pDesplegables;

  return (
    <div className="shell" style={{ maxWidth: "96vw" }}>
      {/* Además de las publicaciones (estado, responsable, padre): sus vínculos
          —chips— y reacciones, que no tocan la fila del caso pero sí la tarjeta. */}
      <Realtime tablas={["publicaciones", "publicacion_vinculos", "reacciones"]} token={session?.access_token} miId={user.id} />
      <div className="topbar" style={{ gap: 10, flexWrap: "wrap" }}>
        <Volver />
        <h1 className="title-lg" style={{ margin: 0, fontSize: 20 }}>🗂 Tablero</h1>
        {/* El toggle de vista no aparece en el archivo: la línea de tiempo no
            tiene fila para Descartadas —las escondería— y el archivo se
            gestiona por columnas y la zona de arrastre. Sin esto, «Línea de
            tiempo» preservaba `arch` y te metía en la combinación prohibida. */}
        {!arch && (
          <div className="tl-toggle">
            <Link href={urlCols} className={modo === "columnas" ? "on" : ""}>🗂 Columnas</Link>
            <Link href={urlTime} className={modo === "timeline" ? "on" : ""}>🗓 Línea de tiempo</Link>
            <Link href={urlLista} className={modo === "lista" ? "on" : ""}>📋 Lista</Link>
          </div>
        )}
        {/* Vivo ↔ archivado. A PIZARRA LIMPIA en ambos sentidos, sin arrastrar
            los filtros de la otra vista: entrar al archivo con la etiqueta que
            usabas en el tablero vivo mostraba «1 de 16» y parecía roto. Entrar
            limpio + el default por vista (arriba) = el archivo entero del
            equipo de un vistazo. La línea de tiempo no aplica al archivo. */}
        <Link href={arch ? "/tablero" : "/tablero?arch=1"}
          className={`vtab ${arch ? "on" : ""}`}
          title={arch ? "Volver a lo vivo" : "Ver lo archivado: la memoria del equipo"}>
          🗄 Archivadas
        </Link>
        <span className="spacer" />
        {/* Persona, Pulso y TV suben aquí: en el topbar sobraba hueco y abajo
            costaban una fila entera. Y de paso el menú queda agrupado por
            naturaleza — arriba A DÓNDE VAS (otras páginas, otra vista), abajo
            QUÉ MIRAS (los filtros del tablero).
            El «arrastra a otra columna para cambiar el estado» se fue con
            ellos: se aprende una vez y ocupaba media fila para siempre. Lo
            dice el `title` del kanban, que es donde se pregunta. */}
        {/* «Sin asignar» va DENTRO del eje persona, arriba del equipo: es una
            respuesta a «¿de quién es?», no otra pregunta. */}
        <FiltroTablero ico="👤" titulo="Persona" param="p" vacio={P_TODOS}
          extra={[[P_NADIE, "— Sin asignar —"]]}
          actual={pFiltro} items={equipoPerf || []} vivos={vivos} ancho={150} />
        <Link href="/pulso" className="vtab"
          title="Pulso semanal del equipo — quién cerró qué, semana a semana">
          📊 Pulso
        </Link>
        <Link href="/pantalla" className="vtab"
          title="Pantalla para la TV de la oficina">
          📺 TV
        </Link>
      </div>

      {/* ── DOS LÍNEAS, Y CADA UNA UNA PREGUNTA ──
          Estuvo en una sola fila con `wrap` para ahorrarle alto al kanban, y
          con ocho ejes de vínculo eso dejó de funcionar: la fila se partía
          por donde cayera, así que un desplegable de «de qué trata» acababa
          pegado a los chips de «qué tipo es» y el corte se movía al cambiar
          el ancho de la ventana. Un grupo que cambia de forma no se aprende.
          Ahora el corte lo decide el SIGNIFICADO: arriba QUÉ ES —lo mío, todo,
          los tipos— y abajo DE QUÉ TRATA —los ocho vínculos—. Cuesta un
          renglón y lo devuelve en que se encuentra a la primera.
          «Mis asuntos» ya no es un tipo: toca el eje persona, así que puede
          estar encendido A LA VEZ que «Tareas». Eso es «mis tareas», que
          hasta hoy no se podía pedir. */}
      <div className="barra-filtros">
        <div className="bf-linea">
        {/* Apagar «lo mío» es pedir «el equipo entero», y hay que decirlo con
            una palabra: `p=""` deja la URL limpia y el default lo devuelve
            aquí mismo. */}
        <Link href={urlCon({ p: pFiltro === user.id ? P_TODOS : user.id })}
          className={`vtab ${pFiltro === user.id ? "on" : ""}`}
          title="Todo lo que te incumbe: lo que trabajas tú, lo que pediste y hace otro (📤) y lo que te menciona (👁). Tu banco de trabajo lateral muestra solo de lo que eres responsable, por eso su número es menor.">
          🙋 Mis asuntos <span className="vtab-n">{conteo.mios}</span>
        </Link>
        {/* «Todo» apaga los siete ejes y lo DICE (`p=todos`). Antes iba a
            `/tablero` a secas y el sistema lo leía como «recién llega»: el
            botón de ver todo te devolvía a Mis asuntos. */}
        <Link href={urlLimpia}
          className={`vtab ${!hayFiltro ? "on" : ""}`}
          title="Quita todos los filtros: el tablero entero, de todo el equipo">
          🌐 Todo <span className="vtab-n">{conteo.todo}</span>
        </Link>
        {TIPOS_F.map(([val, label]) => (
          <Link key={val} href={urlCon({ v: v === val ? "" : val })}
            className={`vtab ${v === val ? "on" : ""}`}>
            {label} <span className="vtab-n">{conteo[val] ?? 0}</span>
          </Link>
        ))}
        </div>

        {/* Segunda línea: de qué trata. La raya que separaba los dos grupos
            dentro de la misma fila ya no hace falta — la separación es el
            salto de línea, que además no se puede «cruzar» al reajustar. */}
        <div className="bf-linea">
        {EJES_VINC.map(e => (
          <FiltroTablero key={e.param} ico={e.ico} titulo={e.titulo} param={e.param}
            actual={F[e.param]} items={catalogos[e.param] || []} vivos={vivos} ancho={168} />
        ))}
        {hayFiltro && (
          // `urlLimpia`, no una URL a mano: preserva `modo` y `arch`. Escrito
          // a pelo, «limpiar» te sacaba del archivo —el mismo bicho de «cada
          // control se inventa su URL» que urlCon vino a matar—.
          <Link href={urlLimpia} className="barra-limpiar"
            title="Quitar todos los filtros">✕ limpiar</Link>
        )}
        <span className="spacer" />
        <span className="barra-cuenta">
          {pubsE.length} de {U.length}
        </span>
        </div>
      </div>

      {modo === "timeline" ? <TableroTimeline casos={casosTL} />
        /* La lista recibe los MISMOS casos ya filtrados y el orden de las
           columnas: ordenar por estado tiene que dar la misma secuencia que se
           ve en el kanban, o serían dos tableros distintos con los mismos
           datos. */
        : modo === "lista"
          ? <ListaCasos casos={pubsE} ordenEstados={columnas.map(c => c.estado)}
              orden={ordenLista} hrefs={hrefsOrden} />
        : <Tablero columnas={columnasVista} archivado={arch} />}
    </div>
  );
}
