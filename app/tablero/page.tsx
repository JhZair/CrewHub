import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Tablero from "@/components/Tablero";
import TableroTimeline from "@/components/TableroTimeline";
import Realtime from "@/components/Realtime";
import FiltroPersona from "@/components/FiltroPersona";
import { contarHijos } from "@/lib/familia";
import Link from "next/link";
import { redirect } from "next/navigation";

const TIPOS_F: [string, string][] = [
  ["mios", "🙋 Mis asuntos"], ["todo", "🌐 Todo"], ["tarea", "✅ Tareas"],
  ["problema", "❗ Problemas"], ["consulta", "❓ Consultas"], ["pago", "💰 Pagos"],
];

// Estados que viven en el tablero (archivadas quedan fuera).
const ESTADOS = ["abierta", "en_progreso", "seguimiento", "en_pausa", "resuelta"];

export default async function TableroPage({ searchParams }: {
  searchParams: { v?: string; p?: string; modo?: string };
}) {
  const pFiltro = searchParams?.p || "";
  // Al ingresar sin filtros, la pestaña marcada es "Mis asuntos".
  const v = searchParams?.v || (pFiltro ? "" : "mios");
  const modo = searchParams?.modo === "timeline" ? "timeline" : "columnas";
  const sufijo = modo === "timeline" ? "modo=timeline" : "";
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  // El equipo, para poder mirar los asuntos de cada quien
  const { data: equipoPerf } = await supabase.from("perfiles")
    .select("id,nombre").eq("activo", true).neq("nombre", "Bot Qhaway").order("nombre");

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

  // Persona en foco: yo ("Mis asuntos") o alguien del equipo (dropdown)
  const uidFoco = v === "mios" ? user.id : pFiltro || null;
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

  let q = supabase.from("publicaciones")
    .select("id,titulo,tipo,estado,fecha_limite,creado_en,autor_id,responsable,comentarios(count),resp:perfiles!publicaciones_responsable_fkey(nombre)")
    .in("estado", ESTADOS)
    .order("creado_en", { ascending: false })
    .limit(300);
  if (uidFoco) {
    const cond = [`autor_id.eq.${uidFoco}`, `responsable.eq.${uidFoco}`];
    if (vinculadas.length) cond.push(`id.in.(${vinculadas.join(",")})`);
    q = q.or(cond.join(","));
  } else if (v && v !== "todo") q = q.eq("tipo", v);

  const { data: pubs } = await q;

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
  const TABLA_ENT: Record<string, [string, string]> = {
    proyecto: ["proyectos", "nombre"], empresa: ["empresas", "nombre"],
    persona: ["personas", "nombre"], convocatoria: ["convocatorias", "codigo"],
    postulacion: ["postulaciones", "codigo"], equipamiento: ["equipamiento", "nombre"],
    lugar: ["lugares", "nombre"], etiqueta: ["etiquetas", "nombre"],
  };
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

  // Universo para los contadores de cada pestaña (independiente del filtro activo)
  const { data: universo } = await supabase.from("publicaciones")
    .select("id,tipo,autor_id,responsable")
    .in("estado", ESTADOS).limit(500);
  const U = universo || [];
  const misSet = new Set(misVinc);
  const conteo: Record<string, number> = {
    mios: U.filter((p: any) => p.autor_id === user.id || p.responsable === user.id || misSet.has(p.id)).length,
    todo: U.length,
    tarea: U.filter((p: any) => p.tipo === "tarea").length,
    problema: U.filter((p: any) => p.tipo === "problema").length,
    consulta: U.filter((p: any) => p.tipo === "consulta").length,
    pago: U.filter((p: any) => p.tipo === "pago").length,
  };

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
  ];

  // Casos para la vista de línea de tiempo
  const casosTL = pubsE.map((p: any) => ({
    id: p.id, titulo: p.titulo, tipo: p.tipo, estado: p.estado,
    fecha_limite: p.fecha_limite, creado_en: p.creado_en, resp: (p.resp as any)?.nombre || null,
    nc: p.nc, sub: p.sub, reac: p.reac,
  }));

  // URLs del toggle, preservando filtros v/p
  const preserva = () => {
    const u = new URLSearchParams();
    if (searchParams?.v) u.set("v", searchParams.v);
    if (pFiltro) u.set("p", pFiltro);
    return u;
  };
  const urlCols = (() => { const s = preserva().toString(); return `/tablero${s ? "?" + s : ""}`; })();
  const urlTime = (() => { const u = preserva(); u.set("modo", "timeline"); return `/tablero?${u.toString()}`; })();

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
        <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
          {modo === "timeline"
            ? "arrastra a otra fila para cambiar el estado"
            : "arrastra a otra columna para cambiar el estado"}
        </span>
      </div>

      {/* Una sola fila: tipos a la izquierda; persona + Pulso + TV en la otra esquina.
          Mirar los asuntos de cada quien es para coordinar y repartir, no para auditar. */}
      <div className="vtabs vtabs-compacta" style={{ alignItems: "center" }}>
        {TIPOS_F.map(([val, label]) => (
          <Link key={val}
            href={val === "mios"
              ? (sufijo ? `/tablero?${sufijo}` : "/tablero")
              : `/tablero?v=${val}${sufijo ? "&" + sufijo : ""}`}
            className={`vtab ${v === val && !pFiltro ? "on" : ""}`}
            title={val === "mios"
              ? "Todo lo que te incumbe: lo que trabajas tú, lo que pediste y hace otro (📤) y lo que te menciona (👁). Tu banco de trabajo lateral muestra solo de lo que eres responsable, por eso su número es menor."
              : undefined}>
            {label} <span className="vtab-n">{conteo[val] ?? 0}</span>
          </Link>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <FiltroPersona equipo={equipoPerf || []}
            actual={pFiltro || (v === "mios" ? user.id : "")} sufijo={sufijo} />
          <Link href="/pulso" className="vtab"
            title="Pulso semanal del equipo — quién cerró qué, semana a semana">
            📊 Pulso
          </Link>
          <Link href="/pantalla" className="vtab"
            title="Pantalla para la TV de la oficina">
            📺 TV
          </Link>
        </span>
      </div>

      {modo === "timeline"
        ? <TableroTimeline casos={casosTL} />
        : <Tablero columnas={columnas} />}
    </div>
  );
}
