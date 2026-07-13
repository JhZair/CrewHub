import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Mantenimiento } from "@/components/EntidadForm";
import Miembros from "@/components/Miembros";
import Credenciales from "@/components/Credenciales";
import ClienteProyecto from "@/components/ClienteProyecto";
import Postulaciones from "@/components/Postulaciones";
import EquipoPostulacion from "@/components/EquipoPostulacion";
import PrestamoEquipo from "@/components/PrestamoEquipo";
import CuentaAcceso from "@/components/CuentaAcceso";
import { BotonVerificarRuc, BotonVerificarDni } from "@/components/VerificarSunat";
import Materiales from "@/components/Materiales";
import LineaTiempo from "@/components/LineaTiempo";
import CronogramaProyecto from "@/components/CronogramaProyecto";
import TabsPanel from "@/components/TabsPanel";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

/* PERFIL DE ENTIDAD VIVA — dos columnas:
   izquierda = el carné (datos estáticos, relaciones, credenciales)
   derecha  = la vida (publicaciones activas, cerradas, historial) */

const CONF: Record<string, { tabla: string; icono: string; campos: [string, string][] }> = {
  proyecto: { tabla: "proyectos", icono: "📁", campos: [["Folio", "folio"], ["Tipo", "tipo"], ["Modalidad", "modalidad"], ["Etapa", "etapa"], ["Actividad", "estado_actividad"], ["RENCA", "renca"]] },
  empresa: { tabla: "empresas", icono: "🏢", campos: [["Código", "codigo"], ["Razón social", "razon_social"], ["RUC", "ruc"], ["RENCA", "renca"], ["Región", "region"], ["Estado interno", "estado"], ["Constitución", "fecha_constitucion"], ["Domicilio fiscal", "domicilio_fiscal"], ["Estado SUNAT", "estado_sunat"], ["Condición SUNAT", "condicion_sunat"], ["Verificado SUNAT", "fecha_verificacion_sunat"]] },
  persona: { tabla: "personas", icono: "👤", campos: [["Alias", "alias"], ["Tipo", "tipo"], ["Equipo", "equipo"], ["Estado", "estado"], ["Región", "region"], ["Rol", "rol"], ["DNI", "ruc_dni"], ["DNI vence", "dni_vencimiento"]] },
  equipamiento: { tabla: "equipamiento", icono: "🎥", campos: [["Folio", "folio"], ["Categoría", "categoria"], ["Subcategoría", "subcategoria"], ["Estado", "estado"], ["Valor (S/)", "valor_compra"], ["Comprado en", "comprado_en"]] },
  lugar: { tabla: "lugares", icono: "📍", campos: [] },
  postulacion: { tabla: "postulaciones", icono: "🎯", campos: [["Código", "codigo"], ["Código plataforma DAFO", "codigo_plataforma"], ["Código del acta", "codigo_acta"], ["Estado", "estado"], ["Lenguas originarias", "lenguas_originarias"], ["Puntaje jurado", "puntaje_jurado"], ["Monto adjudicado (S/)", "monto_adjudicado"], ["Firma del acta", "fecha_firma_acta"], ["Límite de rendición", "fecha_limite_rendicion"], ["Prórroga", "fecha_prorroga"]] },
  convocatoria: { tabla: "convocatorias", icono: "📜", campos: [["Código", "codigo"], ["Institución", "institucion"], ["Año", "anio"], ["Estado", "estado"], ["Monto del estímulo (S/)", "monto_adjudicado"]] },
  etiqueta: { tabla: "etiquetas", icono: "🏷️", campos: [] },
};

const ESTADOS: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso", seguimiento: "🔭 Seguimiento",
  en_pausa: "En Pausa", resuelta: "Resuelta", archivada: "Archivada",
};
const TIPO_META: Record<string, string> = {
  aviso: "📢", tarea: "✅", problema: "❗", consulta: "❓", pago: "💰", idea: "💡", archivo: "📎",
};

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/* Presentación de valores en la ficha: dinero con miles, fechas legibles */
const CAMPOS_DINERO = ["monto_adjudicado", "valor_compra"];
const ICONO_ESTADO: Record<string, string> = {
  // postulaciones
  ganadora: "🏆", finalista: "⭐", finalista_no_ganadora: "🥈", enviada: "📨", no_seleccionada: "✖", retirada: "↩", en_preparacion: "🛠",
  // convocatorias
  postulacion: "📨", en_ejecucion: "🎬", rendicion_pendiente: "🧾", cerrada: "🗄",
  // empresas
  activa: "✅", en_constitucion: "🏗", inactiva: "💤",
};
const verFicha = (key: string, val: any) => {
  const s = String(val);
  if (CAMPOS_DINERO.includes(key)) {
    const n = parseFloat(s);
    if (!isNaN(n)) return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s))
    return new Date(s + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
  if (key === "estado" && ICONO_ESTADO[s]) return `${ICONO_ESTADO[s]} ${s.replace(/_/g, " ")}`;
  return s.replace(/_/g, " ");
};

export default async function Entidad({ params }: { params: { tipo: string; id: string } }) {
  const conf = CONF[params.tipo];
  if (!conf) notFound();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ent } = await supabase.from(conf.tabla).select("*").eq("id", params.id).single();
  if (!ent) notFound();

  const [{ data: vincs }, { data: eventos }] = await Promise.all([
    supabase.from("publicacion_vinculos")
      .select("publicacion_id")
      .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id)
      .limit(300),
    supabase.from("actividad")
      .select("tipo,detalle,creado_en,actor:perfiles(nombre)")
      .eq("entidad_tipo", params.tipo).eq("entidad_id", params.id)
      .order("creado_en", { ascending: false }).limit(30),
  ]);

  const ids = (vincs || []).map((v: any) => v.publicacion_id);
  const SEL_PUB = "id,titulo,tipo,estado,creado_en,fecha_limite,autor:perfiles!publicaciones_autor_id_fkey(nombre),resp:perfiles!publicaciones_responsable_fkey(nombre),comentarios(count)";
  // Si la persona tiene cuenta, su vida también son los casos que creó o le asignaron
  const uid = params.tipo === "persona" ? ent.usuario_id : null;
  const [porVinculo, porUsuario, misComs] = await Promise.all([
    ids.length
      ? supabase.from("publicaciones").select(SEL_PUB).in("id", ids)
      : Promise.resolve({ data: [] as any[] }),
    uid
      ? supabase.from("publicaciones").select(SEL_PUB)
          .or(`autor_id.eq.${uid},responsable.eq.${uid}`)
          .order("creado_en", { ascending: false }).limit(150)
      : Promise.resolve({ data: [] as any[] }),
    uid
      ? supabase.from("comentarios").select("publicacion_id")
          .eq("autor_id", uid).limit(400)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  // Casos donde solo participó comentando (ni autor ni responsable ni vinculado)
  const yaTraidos = new Set([...(porVinculo.data || []), ...(porUsuario.data || [])].map((p: any) => p.id));
  const idsComentados = [...new Set((misComs.data || []).map((c: any) => c.publicacion_id))]
    .filter((id: string) => !yaTraidos.has(id));
  const porComentario = idsComentados.length
    ? await supabase.from("publicaciones").select(SEL_PUB).in("id", idsComentados)
    : { data: [] as any[] };
  const vistosPub = new Set<string>();
  const pubs = [...(porVinculo.data || []), ...(porUsuario.data || []), ...(porComentario.data || [])]
    .filter((p: any) => vistosPub.has(p.id) ? false : (vistosPub.add(p.id), true))
    .sort((a: any, b: any) => (b.creado_en || "").localeCompare(a.creado_en || ""));

  // Los datos importantes de cada caso: sub-casos y reacciones
  const idsP = pubs.map((p: any) => p.id);
  const hijosDe = new Map<string, { total: number; ok: number }>();
  const reaccDe = new Map<string, Map<string, number>>();
  if (idsP.length) {
    const [hj, rc] = await Promise.all([
      supabase.from("publicaciones").select("padre_id,estado").in("padre_id", idsP),
      supabase.from("reacciones").select("publicacion_id,emoji").is("comentario_id", null).in("publicacion_id", idsP),
    ]);
    (hj.data || []).forEach((h: any) => {
      const m = hijosDe.get(h.padre_id) || { total: 0, ok: 0 };
      m.total++;
      if (["resuelta", "archivada"].includes(h.estado)) m.ok++;
      hijosDe.set(h.padre_id, m);
    });
    (rc.data || []).forEach((r: any) => {
      const m = reaccDe.get(r.publicacion_id) || new Map<string, number>();
      m.set(r.emoji, (m.get(r.emoji) || 0) + 1);
      reaccDe.set(r.publicacion_id, m);
    });
  }

  // Relaciones societarias
  let miembros: any[] = [], personasCat: any[] = [], cargosDe: any[] = [];
  let clienteDe: { id: string; nombre: string } | null = null;
  let cronoActs: any[] = [], perfilesCat: any[] = [];
  let postusProy: any[] = [];
  if (params.tipo === "proyecto") {
    const [pc, cl, ca, pf, pp] = await Promise.all([
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
      ent.cliente_id
        ? supabase.from("personas").select("id,nombre,alias").eq("id", ent.cliente_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("cronograma_actividades")
        .select("*, resp:perfiles(nombre)")
        .eq("proyecto_id", params.id).order("fecha_inicio"),
      supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("postulaciones")
        .select("id,codigo,estado,codigo_acta,monto_adjudicado,fecha_firma_acta,fecha_limite_rendicion,fecha_prorroga,acta_url,conv:convocatorias(id,codigo,nombre,anio)")
        .eq("proyecto_id", params.id).order("creado_en", { ascending: false }),
    ]);
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
    const _cl = (cl as any).data; clienteDe = _cl ? { id: _cl.id, nombre: _cl.alias || _cl.nombre } : null;
    cronoActs = ca.data || [];
    perfilesCat = pf.data || [];
    postusProy = pp.data || [];
  }
  let postus: any[] = [], proyectosCat: any[] = [], empresasCat: any[] = [];
  if (params.tipo === "convocatoria") {
    const [ca, pf, po, pr, em] = await Promise.all([
      supabase.from("cronograma_actividades")
        .select("*, resp:perfiles(nombre)")
        .eq("convocatoria_id", params.id).order("fecha_inicio"),
      supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("postulaciones")
        .select("*, proy:proyectos(id,nombre), emp:empresas(id,nombre,codigo)")
        .eq("convocatoria_id", params.id).order("creado_en"),
      supabase.from("proyectos").select("id,nombre").order("nombre"),
      supabase.from("empresas").select("id,nombre,codigo").order("codigo"),
    ]);
    cronoActs = ca.data || [];
    perfilesCat = pf.data || [];
    postus = po.data || [];
    proyectosCat = pr.data || [];
    empresasCat = (em.data || []).map((x: any) => ({ id: x.id, nombre: x.codigo ? `${x.codigo} · ${x.nombre}` : x.nombre }));
  }
  let prestamos: any[] = [], proyectosPrest: any[] = [];
  if (params.tipo === "equipamiento") {
    const [pr, pc, py] = await Promise.all([
      supabase.from("equipo_prestamos")
        .select("id,desde,hasta,nota,persona:personas(id,nombre,alias),proy:proyectos(id,nombre)")
        .eq("equipamiento_id", params.id).order("desde", { ascending: false }),
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
      supabase.from("proyectos").select("id,nombre").order("nombre"),
    ]);
    prestamos = pr.data || [];
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
    proyectosPrest = py.data || [];
  }

  let postCtx: any = null, equipoPost: any[] = [];
  if (params.tipo === "postulacion") {
    const [ctx, eq, pc] = await Promise.all([
      supabase.from("postulaciones")
        .select("proy:proyectos(id,nombre,tipo), emp:empresas(id,nombre,codigo), conv:convocatorias(id,codigo,nombre,anio,monto_adjudicado,bases_url,hitos:cronograma_actividades(id,nombre,fecha_inicio,estado,clase))")
        .eq("id", params.id).single(),
      supabase.from("postulacion_equipo")
        .select("id,cargo,persona:personas(id,nombre,alias)")
        .eq("postulacion_id", params.id).order("cargo"),
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
    ]);
    postCtx = ctx.data;
    equipoPost = eq.data || [];
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
  }
  if (params.tipo === "empresa") {
    const [m, pc] = await Promise.all([
      supabase.from("empresa_miembros")
        .select("id,cargo,fecha_inicio,fecha_fin,estado,persona:personas(id,nombre,alias)")
        .eq("empresa_id", params.id).order("cargo"),
      supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
    ]);
    miembros = m.data || [];
    personasCat = (pc.data || []).map((x: any) => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
  }
  let postDe: any[] = [], equiposEnMano: any[] = [], clienteEnProy: any[] = [];
  let cuentaDe: { id: string; nombre: string } | null = null;
  let cuentasLibres: { id: string; nombre: string }[] = [];
  if (params.tipo === "persona") {
    const [cg, pe, pr, cl] = await Promise.all([
      supabase.from("empresa_miembros")
        .select("id,cargo,estado,fecha_inicio,fecha_fin,empresa:empresas(id,nombre,codigo)")
        .eq("persona_id", params.id).order("estado"),
      supabase.from("postulacion_equipo")
        .select("id,cargo,post:postulaciones(id,codigo,estado,proy:proyectos(id,nombre),conv:convocatorias(anio))")
        .eq("persona_id", params.id),
      supabase.from("equipo_prestamos")
        .select("id,desde,equipo:equipamiento(id,folio,nombre)")
        .eq("persona_id", params.id).is("hasta", null).order("desde", { ascending: false }),
      supabase.from("proyectos")
        .select("id,nombre,tipo,estado")
        .eq("cliente_id", params.id).order("nombre"),
    ]);
    cargosDe = cg.data || [];
    postDe = (pe.data || []).sort((a: any, b: any) =>
      (b.post?.conv?.anio || 0) - (a.post?.conv?.anio || 0));
    equiposEnMano = pr.data || [];
    clienteEnProy = cl.data || [];

    // Cuenta de acceso: perfil enlazado + cuentas que aún no tienen persona
    const [pf, up] = await Promise.all([
      supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("personas").select("usuario_id").not("usuario_id", "is", null),
    ]);
    const usadas = new Set((up.data || []).map((x: any) => x.usuario_id));
    const perfilesAll = (pf.data || []).filter((p: any) => p.nombre !== "Qhaway");
    cuentaDe = ent.usuario_id ? perfilesAll.find((p: any) => p.id === ent.usuario_id) || null : null;
    cuentasLibres = perfilesAll.filter((p: any) => !usadas.has(p.id));
  }

  let creds: any[] = [];
  if (params.tipo === "empresa" || params.tipo === "persona") {
    const { data } = await supabase.from("credenciales")
      .select("*")
      .eq(params.tipo === "empresa" ? "empresa_id" : "persona_id", params.id)
      .order("plataforma");
    creds = data || [];
  }

  const nombre = params.tipo === "postulacion"
    ? `${ent.codigo || postCtx?.conv?.codigo || "Postulación"} · ${postCtx?.proy?.nombre || ""}`.replace(/ · $/, "")
    : ent.nombre || ent.codigo || "—";
  const activas = (pubs || []).filter((p: any) => ["abierta", "en_progreso", "seguimiento"].includes(p.estado));
  const cerradas = (pubs || []).filter((p: any) => !["abierta", "en_progreso", "seguimiento"].includes(p.estado));

  const cardPub = (p: any) => {
    const hj = hijosDe.get(p.id);
    const rx = reaccDe.get(p.id);
    const nComs = (p.comentarios as any)?.[0]?.count || 0;
    return (
      <Link key={p.id} href={`/caso/${p.id}`}>
        <div className="card link" style={{ cursor: "pointer", padding: "12px 15px" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>{TIPO_META[p.tipo] || "💬"}</span>
            <b style={{ flex: 1, fontSize: 13.5 }}>{p.titulo}</b>
            {(p.resp as any)?.nombre && <span className="tv-resp">{(p.resp as any).nombre.split(" ")[0]}</span>}
            <span className={`pill st-${p.estado}`}>{ESTADOS[p.estado] || p.estado}</span>
          </div>
          <div className="meta" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {(p.autor as any)?.nombre && <span>✍ {(p.autor as any).nombre.split(" ")[0]}</span>}
            <span>{fecha(p.creado_en)}</span>
            {nComs > 0 && <span>💬 {nComs}</span>}
            {hj && (
              <span style={{ color: hj.ok === hj.total ? "var(--green)" : "var(--yellow)" }}>
                🧩 {hj.ok}/{hj.total} sub-casos
              </span>
            )}
            {rx && (
              <span style={{ letterSpacing: .5 }}>
                {[...rx.entries()].map(([e, n]) => `${e}${n > 1 ? ` ${n}` : ""}`).join("  ")}
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="shell shell-ancho">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          {conf.icono} {params.tipo}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <h1 className="title-lg" style={{ flex: 1, margin: 0 }}>{conf.icono} {nombre}</h1>
        <Link href={`/?link=${params.tipo}:${params.id}`} className="btn">＋ Publicar</Link>
      </div>

      <div className="perfil-grid">
        {/* ===== COLUMNA IZQUIERDA: el carné ===== */}
        <aside>
          <div className="card">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: conf.campos.length ? 12 : 0 }}>
              {ent.carpeta_drive_url && (
                <a href={ent.carpeta_drive_url} target="_blank" rel="noopener noreferrer"
                  className="btn" style={{ background: "#1a73e8", fontSize: 12, padding: "7px 12px" }}>📂 Drive</a>
              )}
              {ent.bases_url && (
                <a href={ent.bases_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>📖 Bases</a>
              )}
              {ent.presupuesto_url && (
                <a href={ent.presupuesto_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>💰 Presupuesto</a>
              )}
              {ent.matriz_jurado_url && (
                <a href={ent.matriz_jurado_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>📊 Matriz jurado</a>
              )}
              {ent.acta_url && (
                <a href={ent.acta_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>🖋 Acta</a>
              )}
              {ent.ficha_ruc_url && (
                <a href={ent.ficha_ruc_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>📄 Ficha RUC</a>
              )}
              {ent.renca_url && (
                <a href={ent.renca_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>🎬 RENCA</a>
              )}
              {ent.vigencia_poder_url && (
                <a href={ent.vigencia_poder_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>📜 Vigencia</a>
              )}
              {ent.cv_url && (
                <a href={ent.cv_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>📋 CV</a>
              )}
              {ent.dni_url && (
                <a href={ent.dni_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>
                  🪪 DNI{ent.dni_vencimiento && new Date(ent.dni_vencimiento) < new Date() ? " ⚠" : ""}
                </a>
              )}
            </div>

            {conf.campos.map(([lbl, key]) =>
              ent[key] != null && ent[key] !== "" ? (
                <div className="ficha-row" key={key}>
                  <span className="fk">{lbl}</span>
                  <span className="fv" style={
                    key === "estado_sunat" && ent[key] !== "activo" ? { color: "var(--red)", fontWeight: 700 }
                      : CAMPOS_DINERO.includes(key) ? { color: "var(--teal)", fontWeight: 700 } : undefined
                  }>
                    {key === "rol" && String(ent[key]).split(",").length > 3 ? (
                      <details style={{ display: "inline" }}>
                        <summary style={{ cursor: "pointer", listStyle: "none" }}>
                          {String(ent[key]).split(",").slice(0, 3).map(s => s.trim()).join(", ")}
                          <i style={{ color: "var(--dim)" }}> … +{String(ent[key]).split(",").length - 3} ver más</i>
                        </summary>
                        {String(ent[key]).split(",").slice(3).map(s => s.trim()).join(", ")}
                      </details>
                    ) : verFicha(key, ent[key])}
                  </span>
                </div>
              ) : null
            )}
            {ent.descripcion && <p style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.5, marginTop: 10 }}>{ent.descripcion}</p>}
            {params.tipo === "postulacion" && ent.feedback_jurado && (
              ent.feedback_jurado.length > 220 ? (
                <details className="jurado-box">
                  <summary>
                    <b style={{ color: "var(--text)" }}>💬 Comentario del jurado</b>
                    <span className="jx"><br />{ent.feedback_jurado.slice(0, ent.feedback_jurado.lastIndexOf(" ", 200))}… <i>ver más</i></span>
                  </summary>
                  <div style={{ marginTop: 6 }}>{ent.feedback_jurado}</div>
                </details>
              ) : (
                <div className="jurado-box">
                  <b style={{ color: "var(--text)" }}>💬 Comentario del jurado</b><br />
                  {ent.feedback_jurado}
                </div>
              )
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Mantenimiento tipo={params.tipo} id={params.id} valores={ent} />
              {params.tipo === "empresa" && ent.ruc && <BotonVerificarRuc empresaId={params.id} />}
              {params.tipo === "persona" && ent.ruc_dni && <BotonVerificarDni personaId={params.id} />}
            </div>
          </div>

          {params.tipo === "proyecto" && postusProy.length > 0 && (
            <div className="linked" style={{ marginTop: 14 }}>
              <h4>🎯 Postulaciones y fondos · {postusProy.length}</h4>
              {postusProy.map((p: any) => (
                <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
                  {/* línea 1: el concurso */}
                  <Link href={`/entidad/postulacion/${p.id}`}
                    style={{ color: "var(--text)", fontWeight: 600, fontSize: 13, display: "block", lineHeight: 1.4 }}>
                    {ICONO_ESTADO[p.estado] || "🎯"} {p.conv?.nombre || p.codigo || "Postulación"} →
                  </Link>
                  {/* línea 2: año + estado */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                    {p.conv?.anio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.conv.anio}</span>}
                    <span className="badge" style={{
                      color: p.estado === "ganadora" ? "var(--green)" : "var(--muted)", background: "#1c1c2c",
                    }}>{(p.estado || "").replace(/_/g, " ")}</span>
                  </div>
                  {/* la ejecución, en su caja verde */}
                  {p.estado === "ganadora" && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg)", borderRadius: 9, borderLeft: "3px solid var(--green)", fontSize: 11.5, color: "var(--muted)" }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        {p.codigo_acta && <span style={{ color: "var(--green)", fontWeight: 700 }}>{p.codigo_acta}</span>}
                        {p.monto_adjudicado && (
                          <span style={{ color: "var(--teal)", fontWeight: 700 }}>
                            S/ {parseFloat(p.monto_adjudicado).toLocaleString("es-PE")}
                          </span>
                        )}
                        {p.fecha_firma_acta && <span>🖋 {verFicha("f", p.fecha_firma_acta)}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
                        {(p.fecha_prorroga || p.fecha_limite_rendicion) && (
                          <span style={{ color: "var(--yellow)" }}>
                            🧾 rinde: {verFicha("f", p.fecha_prorroga || p.fecha_limite_rendicion)}{p.fecha_prorroga ? " (prórroga)" : ""}
                          </span>
                        )}
                        {p.acta_url && (
                          <a href={p.acta_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--violet)" }}>📄 Acta</a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {params.tipo === "proyecto" && (
            <ClienteProyecto proyectoId={params.id} cliente={clienteDe} personas={personasCat} />
          )}

          {params.tipo === "convocatoria" && (
            <Postulaciones convocatoriaId={params.id} postulaciones={postus}
              proyectos={proyectosCat} empresas={empresasCat} />
          )}

          {params.tipo === "postulacion" && (
            <div style={{ marginTop: 14 }}>
              <TabsPanel
                labels={["🧭 Contexto", `👥 Equipo · ${equipoPost.length}`, "📎 Materiales"]}
                paneles={[
                  <div className="linked" key="ctx">
                    {postCtx?.proy && (
                      <div className="eq-row"><span className="cargo">Proyecto</span>
                        <span style={{ flex: 1, textAlign: "right" }}>
                          <Link href={`/entidad/proyecto/${postCtx.proy.id}`} style={{ color: "var(--text)" }}>📁 {postCtx.proy.nombre} →</Link>
                        </span></div>
                    )}
                    {postCtx?.emp && (
                      <div className="eq-row"><span className="cargo">Empresa</span>
                        <span style={{ flex: 1, textAlign: "right" }}>
                          <Link href={`/entidad/empresa/${postCtx.emp.id}`} style={{ color: "var(--text)" }}>🏢 {postCtx.emp.nombre} →</Link>
                        </span></div>
                    )}
                    {postCtx?.conv && (
                      <div className="eq-row"><span className="cargo">Concurso</span>
                        <span style={{ flex: 1, textAlign: "right" }}>
                          <Link href={`/entidad/convocatoria/${postCtx.conv.id}`} style={{ color: "var(--text)" }}>📜 {postCtx.conv.codigo} · {postCtx.conv.nombre} →</Link>
                        </span></div>
                    )}
                    {postCtx?.conv?.monto_adjudicado && (
                      <div className="eq-row"><span className="cargo">En juego</span>
                        <span style={{ flex: 1, textAlign: "right", color: "var(--teal)", fontWeight: 700 }}>
                          S/ {parseFloat(postCtx.conv.monto_adjudicado).toLocaleString("es-PE")}
                        </span></div>
                    )}
                    {postCtx?.conv?.bases_url && (
                      <div className="eq-row"><span className="cargo">Bases</span>
                        <span style={{ flex: 1, textAlign: "right" }}>
                          <a href={postCtx.conv.bases_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: "var(--violet)", fontWeight: 600 }}>📖 Bases del concurso ↗</a>
                        </span></div>
                    )}
                  </div>,
                  <EquipoPostulacion key="eq" postulacionId={params.id} equipo={equipoPost} personas={personasCat} />,
                  <Materiales key="mat" postulacionId={params.id} materiales={ent.materiales || {}} />,
                ]}
              />
            </div>
          )}

          {params.tipo === "empresa" && (
            <Miembros empresaId={params.id} miembros={miembros} personas={personasCat} />
          )}

          {params.tipo === "equipamiento" && (
            <PrestamoEquipo equipoId={params.id} prestamos={prestamos}
              personas={personasCat} proyectos={proyectosPrest} />
          )}

          {params.tipo === "persona" && cargosDe.length > 0 && (
            <div className="linked" style={{ marginTop: 14 }}>
              <h4>🏢 Cargos en empresas</h4>
              {cargosDe.map((c: any) => (
                <div key={c.id} className="eq-row" style={{ opacity: c.estado === "activo" ? 1 : .55 }}>
                  <span className="cargo">{c.cargo}</span>
                  <span style={{ flex: 1, textAlign: "right" }}>
                    <Link href={`/entidad/empresa/${c.empresa?.id}`} style={{ color: "var(--text)" }}>
                      {c.empresa?.nombre} →
                    </Link>
                  </span>
                </div>
              ))}
            </div>
          )}

          {params.tipo === "persona" && postDe.length > 0 && (() => {
            const ganadas = postDe.filter((r: any) => r.post?.estado === "ganadora");
            const finalistas = postDe.filter((r: any) =>
              ["finalista", "finalista_no_ganadora"].includes(r.post?.estado));
            const resto = postDe.filter((r: any) => r.post?.estado !== "ganadora");
            const fila = (r: any) => (
              <div key={r.id} className="eq-row" style={{ alignItems: "center" }}>
                <span className="cargo">{r.cargo || "—"}</span>
                <span style={{ flex: 1, textAlign: "right" }}>
                  <Link href={`/entidad/postulacion/${r.post?.id}`} style={{ color: "var(--text)" }}>
                    {ICONO_ESTADO[r.post?.estado] || "🎯"} {r.post?.proy?.nombre || r.post?.codigo} →
                  </Link>
                  {r.post?.conv?.anio && (
                    <span style={{ color: "var(--dim)", fontSize: 11, marginLeft: 8 }}>{r.post.conv.anio}</span>
                  )}
                </span>
              </div>
            );
            return (
              <>
                {ganadas.length > 0 && (
                  <div className="linked" style={{ marginTop: 14, borderLeft: "3px solid var(--green)" }}>
                    <h4 style={{ color: "var(--green)" }}>🏆 Palmarés · {ganadas.length}</h4>
                    <div style={{ color: "var(--muted)", fontSize: 11.5, marginBottom: 8 }}>
                      {ganadas.length} estímulo{ganadas.length === 1 ? "" : "s"} ganado{ganadas.length === 1 ? "" : "s"}
                      {finalistas.length > 0 && ` · ${finalistas.length} finalista${finalistas.length === 1 ? "" : "s"}`}
                      {` · ${postDe.length} postulaciones en total`}
                    </div>
                    {ganadas.map(fila)}
                  </div>
                )}
                {resto.length > 0 && (
                  <div className="linked" style={{ marginTop: 14 }}>
                    <h4>🎯 En postulaciones · {resto.length}</h4>
                    {resto.map(fila)}
                  </div>
                )}
              </>
            );
          })()}

          {params.tipo === "persona" && equiposEnMano.length > 0 && (
            <div className="linked" style={{ marginTop: 14, borderLeft: "3px solid var(--yellow)" }}>
              <h4>🎥 Equipos en su poder · {equiposEnMano.length}</h4>
              {equiposEnMano.map((r: any) => (
                <div key={r.id} className="eq-row" style={{ alignItems: "center" }}>
                  {r.equipo?.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{r.equipo.folio}</span>}
                  <span style={{ flex: 1, textAlign: "right" }}>
                    <Link href={`/entidad/equipamiento/${r.equipo?.id}`} style={{ color: "var(--text)" }}>
                      {r.equipo?.nombre} →
                    </Link>
                    <span style={{ color: "var(--dim)", fontSize: 11, marginLeft: 8 }}>
                      desde {new Date(r.desde + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {params.tipo === "persona" && clienteEnProy.length > 0 && (
            <div className="linked" style={{ marginTop: 14 }}>
              <h4>🤝 Cliente de proyectos · {clienteEnProy.length}</h4>
              {clienteEnProy.map((p: any) => (
                <div key={p.id} className="eq-row" style={{ alignItems: "center" }}>
                  {p.tipo && <span className="cargo">{p.tipo.replace(/_/g, " ")}</span>}
                  <span style={{ flex: 1, textAlign: "right" }}>
                    <Link href={`/entidad/proyecto/${p.id}`} style={{ color: "var(--text)" }}>📁 {p.nombre} →</Link>
                  </span>
                </div>
              ))}
            </div>
          )}

          {(params.tipo === "empresa" || params.tipo === "persona") && (
            <Credenciales dueno={params.tipo as "empresa" | "persona"} duenoId={params.id} credenciales={creds} />
          )}

          {params.tipo === "persona" && (ent.usuario_id || ent.tipo === "personal") && (
            <CuentaAcceso personaId={params.id} cuenta={cuentaDe} libres={cuentasLibres} />
          )}
        </aside>

        {/* ===== COLUMNA DERECHA: la vida ===== */}
        <main>
          {(() => {
            const vida = (
              <>
                <div className="h4" style={{ marginTop: 0 }}>
                  🔥 Activas · {activas.length}
                </div>
                {activas.map(cardPub)}
                {!activas.length && <div className="empty" style={{ padding: "18px 0" }}>Nada activo sobre esta entidad.</div>}

                {cerradas.length > 0 && (
                  <details style={{ marginTop: 16 }}>
                    <summary style={{ color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "6px 0" }}>
                      ✅ Resueltas y archivadas · {cerradas.length}
                    </summary>
                    <div style={{ marginTop: 10 }}>{cerradas.map(cardPub)}</div>
                  </details>
                )}

                {(eventos || []).length > 0 && (
                  <details style={{ marginTop: 16 }}>
                    <summary style={{ color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "6px 0" }}>
                      🕐 Historial de la entidad · {(eventos || []).length} eventos
                    </summary>
                    <div className="tl" style={{ marginTop: 12 }}>
                      {(eventos || []).map((e: any, i: number) => (
                        <div className={`tl-ev ${e.actor ? e.tipo : "bot"}`} key={i}>
                          <span>{e.tipo === "creado" ? "📝" : e.tipo === "estado" ? "🔄" : "🤖"}</span>
                          <span>
                            {e.tipo === "creado" && `${e.actor?.nombre || "Sistema"} registró esta entidad`}
                            {e.tipo === "estado" && `${e.actor?.nombre || "Qhaway"} · ${e.detalle?.campo}: ${String(e.detalle?.de ?? "—").replace(/_/g, " ")} → ${String(e.detalle?.a ?? "—").replace(/_/g, " ")}`}
                            {!["creado", "estado"].includes(e.tipo) && (e.detalle?.mensaje || e.tipo)}
                          </span>
                          <span className="t">{fecha(e.creado_en)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            );

            if (params.tipo === "postulacion") {
              const enJuego = ["en_preparacion", "enviada", "finalista"].includes(ent.estado);
              const hitosConc = (postCtx?.conv?.hitos || [])
                .filter((h: any) => h.clase === "hito_externo" && h.estado !== "cancelada")
                .sort((a: any, b: any) => (a.fecha_inicio < b.fecha_inicio ? -1 : 1));
              // Ganadora: su ruta ya no es el concurso, es la ejecución
              const rutaEjec = ent.estado === "ganadora" ? [
                ent.fecha_firma_acta && { fecha: ent.fecha_firma_acta, titulo: "Firma del acta de compromiso", icono: "🖋", color: "var(--green)" },
                ent.fecha_limite_rendicion && { fecha: ent.fecha_limite_rendicion, titulo: `Límite de rendición${ent.fecha_prorroga ? " (original)" : ""}`, icono: "🧾", color: ent.fecha_prorroga ? "#4a4a5e" : "var(--yellow)" },
                ent.fecha_prorroga && { fecha: ent.fecha_prorroga, titulo: "Límite de rendición (prórroga)", icono: "⏳", color: "var(--yellow)" },
              ].filter(Boolean) as any[] : [];
              return (
                <>
                  {enJuego && hitosConc.length > 0 && (
                    <div className="card" style={{ marginBottom: 16 }}>
                      <div className="panel-h">📅 Línea de tiempo del concurso — la carrera de esta postulación</div>
                      <LineaTiempo eventos={hitosConc.map((h: any) => ({
                        fecha: h.fecha_inicio, titulo: h.nombre, icono: "🏛",
                        color: h.estado === "finalizada" ? "#4a4a5e" : "var(--violet)",
                      }))} />
                    </div>
                  )}
                  {rutaEjec.length > 0 && (
                    <div className="card" style={{ marginBottom: 16, borderColor: "rgba(46,204,113,.3)" }}>
                      <div className="panel-h" style={{ color: "var(--green)" }}>🏆 Camino de ejecución — del acta a la rendición</div>
                      <LineaTiempo eventos={rutaEjec} />
                    </div>
                  )}
                  {ent.estado === "ganadora" && !rutaEjec.length && (
                    <div className="card" style={{ marginBottom: 16 }}>
                      <span style={{ color: "var(--yellow)", fontSize: 13 }}>
                        ⚠ Ganadora sin fechas de ejecución — registra acta y rendición en ✏️ Editar.
                      </span>
                    </div>
                  )}
                  {vida}
                </>
              );
            }
            if (params.tipo !== "proyecto" && params.tipo !== "convocatoria") return vida;

            const vivasCrono = cronoActs.filter((a: any) => a.estado !== "cancelada");
            const proxima = vivasCrono
              .filter((a: any) => a.estado === "planificada")
              .sort((a: any, b: any) => (a.fecha_inicio < b.fecha_inicio ? -1 : 1))[0];
            const etiquetaCrono = `📅 Cronograma · ${vivasCrono.length}` +
              (proxima ? ` · próx. ${new Date(proxima.fecha_inicio + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}` : "");

            return (
              <TabsPanel
                labels={[`🔥 Actividad viva · ${activas.length}`, etiquetaCrono]}
                paneles={[
                  vida,
                  <CronogramaProyecto key="crono" dueno={params.tipo as "proyecto" | "convocatoria"} duenoId={params.id} actividades={cronoActs} perfiles={perfilesCat} />,
                ]}
              />
            );
          })()}
        </main>
      </div>
    </div>
  );
}