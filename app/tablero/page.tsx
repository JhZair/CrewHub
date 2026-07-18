import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Tablero from "@/components/Tablero";
import TableroTimeline from "@/components/TableroTimeline";
import Realtime from "@/components/Realtime";
import FiltroTablero from "@/components/FiltroTablero";
import { contarHijos } from "@/lib/familia";
import { BOT } from "@/lib/personas";
import { TABLA_DE } from "@/lib/secciones";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🗂 Tablero" };

/* `v` es SOLO el tipo. «Mis asuntos» salió de aquí: era el «de quién», y
   vivía en la misma variable que el «de qué» — por eso eran excluyentes y no
   existía «mis tareas». Ahora es un chip que toca el eje persona. */
const TIPOS_F: [string, string][] = [
  ["tarea", "✅ Tareas"], ["problema", "❗ Problemas"],
  ["consulta", "❓ Consultas"], ["pago", "💰 Pagos"],
];

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
];

export default async function TableroPage({ searchParams }: {
  searchParams: { v?: string; p?: string; modo?: string;
    etq?: string; proy?: string; emp?: string; conv?: string; post?: string };
}) {
  const modo = searchParams?.modo === "timeline" ? "timeline" : "columnas";
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

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
    etq: searchParams?.etq || "",
    proy: searchParams?.proy || "",
    emp: searchParams?.emp || "",
    conv: searchParams?.conv || "",
    post: searchParams?.post || "",
    modo: modo === "timeline" ? "timeline" : "",
  };
  /* «Nunca lo toqué» y «quiero verlo TODO» son dos cosas, y una URL vacía
     solo sabe decir una. Sin un valor explícito para la segunda, el chip
     «🌐 Todo» llevaba a `/tablero`, el sistema lo leía como «recién llega» y
     le devolvía «Mis asuntos»: era IMPOSIBLE ver el tablero entero: el botón
     que existe justo para eso te regresaba a lo tuyo, sin decir nada. */
  const P_TODOS = "todos";
  // ¿Se entró en limpio? Entonces «Mis asuntos», como siempre. `modo` no cuenta.
  const enLimpio = !Object.entries(F).some(([k, x]) => k !== "modo" && x);
  if (enLimpio) F.p = user.id;   // el default, y `vivos` lo tiene que llevar
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

  // El equipo, para poder mirar los asuntos de cada quien
  const { data: equipoPerf } = await supabase.from("perfiles")
    .select("id,nombre").eq("activo", true).neq("nombre", BOT).order("nombre");

  // Vínculos de persona del USUARIO logueado (para "Mis asuntos" y su contador)
  let misVinc: string[] = [];
  {
    const { data: yo } = await supabase.from("personas")
      .select("id").eq("usuario_id", user.id).maybeSingle();
    if (yo) {
      const { data: vs } = await supabase.from("publicacion_vinculos")
        .select("publicacion_id")
        .eq("entidad_tipo", "persona").eq("entidad_id", yo.id).limit(300);
      misVinc = (vs || []).map((x: any) => x.publicacion_id);
    }
  }

  // Persona en foco. `P_TODOS` es «el equipo entero», dicho a propósito.
  const uidFoco = pFiltro === P_TODOS ? null : (pFiltro || null);
  let vinculadas: string[] = [];
  if (uidFoco === user.id) {
    vinculadas = misVinc;
  } else if (uidFoco) {
    const { data: yo } = await supabase.from("personas")
      .select("id").eq("usuario_id", uidFoco).maybeSingle();
    if (yo) {
      const { data: vs } = await supabase.from("publicacion_vinculos")
        .select("publicacion_id")
        .eq("entidad_tipo", "persona").eq("entidad_id", yo.id).limit(300);
      vinculadas = (vs || []).map((x: any) => x.publicacion_id);
    }
  }

  /* FILTROS POR VÍNCULO — la intersección.
     Un caso pasa si tiene TODOS los elegidos: «🏷 Subsanaciones DAFO» +
     «📁 Pampacucho» es lo que cuelga de las dos cosas, no de cualquiera. Y
     eso importa: en semana de subsanaciones un concurso genera veinte casos
     y la unión no filtraría nada.
     Cinco consultas como mucho, y solo de las que están puestas. */
  const ejesPuestos = EJES_VINC.filter(e => F[e.param]);
  let idsVinc: Set<string> | null = null;
  for (const e of ejesPuestos) {
    // Si ya no queda nada que cruzar, las consultas siguientes son de más
    if (idsVinc && idsVinc.size === 0) break;
    const { data } = await supabase.from("publicacion_vinculos")
      .select("publicacion_id")
      .eq("entidad_tipo", e.tipo).eq("entidad_id", F[e.param]).limit(2000);
    const ids = new Set((data || []).map((x: any) => x.publicacion_id as string));
    idsVinc = idsVinc === null ? ids : new Set([...idsVinc].filter(x => ids.has(x)));
  }

  let q = supabase.from("publicaciones")
    .select("id,titulo,tipo,estado,fecha_limite,creado_en,autor_id,responsable,comentarios(count),resp:perfiles!publicaciones_responsable_fkey(nombre)")
    .in("estado", ESTADOS)
    .is("archivado_en", null)   // lo archivado es memoria, no vive en el tablero
    .order("creado_en", { ascending: false })
    .limit(TOPE);
  /* Los tres ejes se APILAN. Antes era `if (uidFoco) ... else if (v)`: el
     `else` es literalmente el motivo de que «mis tareas» no existiera. */
  if (uidFoco) {
    const cond = [`autor_id.eq.${uidFoco}`, `responsable.eq.${uidFoco}`];
    if (vinculadas.length) cond.push(`id.in.(${vinculadas.join(",")})`);
    q = q.or(cond.join(","));
  }
  if (v) q = q.eq("tipo", v);

  const { data: pubsCrudo } = await q;

  /* La intersección se aplica en MEMORIA, no con `.in("id", [...])`.
     Cada uuid pesa ~39 bytes ya percent-encodeado; una etiqueta con 400 casos
     hace una query string de ~16 KB y PostgREST la corta con un 414 mucho
     antes del tope de 2000 que este código pedía. Y un 414 aquí no avisa: se
     ve un tablero vacío y parece que no hay nada con esa etiqueta.
     ⚠ Esto es exacto mientras el `.limit(300)` de arriba cubra el tablero
     entero — hoy son 169 casos vivos. El día que pase de 300, el filtro
     empezaría a mirar solo los 300 más nuevos y a mentir en silencio. Ése es
     el número a vigilar, y está aquí escrito para que se note. */
  const pubs = idsVinc === null
    ? (pubsCrudo || [])
    : (pubsCrudo || []).filter((p: any) => idsVinc!.has(p.id));

  // Indicadores sociales: sub-casos (hijos) y reacciones (comentarios ya vienen en el select)
  const idsPubs = (pubs || []).map((p: any) => p.id);
  const { data: hijosData } = idsPubs.length
    // `estado` faltaba: este era el conteo que había divergido — solo sabía
    // cuántos hijos hay, nunca cuántos están cerrados.
    ? await supabase.from("publicaciones").select("padre_id,estado").in("padre_id", idsPubs)
    : { data: [] };
  const subDe = contarHijos(hijosData);
  const { data: reaccs } = idsPubs.length
    ? await supabase.from("reacciones").select("publicacion_id,emoji").is("comentario_id", null).in("publicacion_id", idsPubs)
    : { data: [] };
  const reacDe = new Map<string, Record<string, number>>();
  (reaccs || []).forEach((r: any) => {
    const m = reacDe.get(r.publicacion_id) || {};
    m[r.emoji] = (m[r.emoji] || 0) + 1;
    reacDe.set(r.publicacion_id, m);
  });

  // Vínculos (entidades relacionadas) para dar contexto en cada tarjeta
  const { data: vincs } = idsPubs.length
    ? await supabase.from("publicacion_vinculos")
        .select("publicacion_id,entidad_tipo,entidad_id").in("publicacion_id", idsPubs)
    : { data: [] };
  /* (Este mapa era una copia de `TABLA_DE` de lib/secciones — la tercera que
     aparece hoy: la otra vive en actions.ts como `ENT_TABLA`. Se importa.) */
  const TABLA_ENT = TABLA_DE;
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

  const pubsE = (pubs || []).map((p: any) => ({
    ...p,
    nc: p.comentarios?.[0]?.count ?? 0,
    // El kanban sigue mostrando solo el total, como siempre: cambiar la
    // tarjeta del tablero no toca hoy. Pero `ok` ya está calculado aquí.
    sub: subDe.get(p.id)?.total || 0,
    reac: reacDe.get(p.id) || {},
    vinc: vincDe.get(p.id) || [],
    marca: marcaFoco(p),
  }));

  // Universo para los contadores de cada pestaña (independiente del filtro activo).
  // Mismo filtro que las tarjetas: sin lo archivado, o «Todo 170» mentiría.
  const { data: universo } = await supabase.from("publicaciones")
    .select("id,tipo,autor_id,responsable")
    .in("estado", ESTADOS).is("archivado_en", null).limit(TOPE);
  const U = universo || [];
  const misSet = new Set(misVinc);
  /* Los contadores son del UNIVERSO, no del filtro: dicen cuánto hay de cada
     tipo en el tablero entero. Con los ejes apilados eso podría confundir
     —«Tareas 142» y al tocarlo salen 12, porque sigue puesta una etiqueta—,
     pero la alternativa es peor: un contador que cambia con cada filtro no
     sirve para decidir a dónde ir. Es un mapa, no un resultado. */
  const conteo: Record<string, number> = {
    mios: U.filter((p: any) => p.autor_id === user.id || p.responsable === user.id || misSet.has(p.id)).length,
    todo: U.length,
    tarea: U.filter((p: any) => p.tipo === "tarea").length,
    problema: U.filter((p: any) => p.tipo === "problema").length,
    consulta: U.filter((p: any) => p.tipo === "consulta").length,
    pago: U.filter((p: any) => p.tipo === "pago").length,
  };

  /* Catálogos de los desplegables. Solo lo que EXISTE en el tablero: ofrecer
     las 60 etiquetas del sistema cuando 8 tienen casos abiertos es hacerle
     buscar a alguien entre opciones que no llevan a ningún sitio. Sale de los
     vínculos de todo el universo, no de los filtrados — si no, elegir una
     etiqueta vaciaría los otros cuatro desplegables. */
  const idsUniv = U.map((p: any) => p.id);
  const { data: vincUniv } = idsUniv.length
    ? await supabase.from("publicacion_vinculos")
        .select("entidad_tipo,entidad_id").in("publicacion_id", idsUniv).limit(4000)
    : { data: [] };
  const catalogos: Record<string, { id: string; nombre: string }[]> = {};
  await Promise.all(EJES_VINC.map(async e => {
    const ids = [...new Set((vincUniv || [])
      .filter((x: any) => x.entidad_tipo === e.tipo).map((x: any) => x.entidad_id))];
    if (!ids.length) { catalogos[e.param] = []; return; }
    const t = TABLA_ENT[e.tipo];
    const { data } = await supabase.from(t[0]).select(`id,${t[1]}`).in("id", ids);
    catalogos[e.param] = (data || [])
      .map((r: any) => ({ id: r.id, nombre: r[t[1]] }))
      .filter(r => r.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }));
  /* Hay filtro si algo recorta el tablero. `p=todos` NO recorta: es la
     ausencia de filtro dicha en voz alta. */
  const hayFiltro = !!(v || ejesPuestos.length || uidFoco);
  // La URL de «sin nada»: los siete ejes fuera y el «todo el equipo» explícito
  const urlLimpia = (() => {
    const u = new URLSearchParams({ p: P_TODOS });
    if (modo === "timeline") u.set("modo", "timeline");
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
    { estado: "resuelta", titulo: "✅ Resueltas", color: "var(--green)", items: de("resuelta", 12) },
    // Descartadas: se hicieron humo, no se hicieron. Última columna, gris y
    // corta —12— porque lo normal es archivarlas; ésta es la sala de espera.
    { estado: "descartada", titulo: "🚫 Descartadas", color: "var(--dim)", items: de("descartada", 12) },
  ];

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

  return (
    <div className="shell" style={{ maxWidth: "96vw" }}>
      <Realtime tablas={["publicaciones"]} token={session?.access_token} />
      <div className="topbar" style={{ gap: 10, flexWrap: "wrap" }}>
        <Volver />
        <h1 className="title-lg" style={{ margin: 0, fontSize: 20 }}>🗂 Tablero</h1>
        <div className="tl-toggle">
          <Link href={urlCols} className={modo === "columnas" ? "on" : ""}>🗂 Columnas</Link>
          <Link href={urlTime} className={modo === "timeline" ? "on" : ""}>🗓 Línea de tiempo</Link>
        </div>
        <span className="spacer" />
        {/* Persona, Pulso y TV suben aquí: en el topbar sobraba hueco y abajo
            costaban una fila entera. Y de paso el menú queda agrupado por
            naturaleza — arriba A DÓNDE VAS (otras páginas, otra vista), abajo
            QUÉ MIRAS (los filtros del tablero).
            El «arrastra a otra columna para cambiar el estado» se fue con
            ellos: se aprende una vez y ocupaba media fila para siempre. Lo
            dice el `title` del kanban, que es donde se pregunta. */}
        <FiltroTablero ico="👤" titulo="Persona" param="p" vacio={P_TODOS}
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

      {/* UNA SOLA FILA DE FILTROS: los tipos y los cinco ejes de vínculo.
          Eran dos y el kanban vive de su alto — cada línea que le quitas
          arriba es una tarjeta más que se ve sin scroll, y ése es todo el
          negocio de un tablero.
          «Mis asuntos» ya no es un tipo: toca el eje persona, así que puede
          estar encendido A LA VEZ que «Tareas». Eso es «mis tareas», que
          hasta hoy no se podía pedir.
          Mirar los asuntos de cada quien es para coordinar y repartir, no
          para auditar. */}
      <div className="barra-filtros">
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
        {/* La raya separa QUÉ TIPO de DE QUÉ TRATA sin costar una fila */}
        <span className="barra-sep" />
        {EJES_VINC.map(e => (
          <FiltroTablero key={e.param} ico={e.ico} titulo={e.titulo} param={e.param}
            actual={F[e.param]} items={catalogos[e.param] || []} vivos={vivos} ancho={168} />
        ))}
        {hayFiltro && (
          <Link href={`/tablero${modo === "timeline" ? "?modo=timeline" : ""}`}
            className="barra-limpiar" title="Quitar todos los filtros">✕ limpiar</Link>
        )}
        <span className="spacer" />
        <span className="barra-cuenta">
          {pubsE.length} de {U.length}
        </span>
      </div>

      {modo === "timeline"
        ? <TableroTimeline casos={casosTL} />
        : <Tablero columnas={columnas} />}
    </div>
  );
}
