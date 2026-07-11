import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Mantenimiento } from "@/components/EntidadForm";
import Miembros from "@/components/Miembros";
import Credenciales from "@/components/Credenciales";
import ClienteProyecto from "@/components/ClienteProyecto";
import Postulaciones from "@/components/Postulaciones";
import EquipoPostulacion from "@/components/EquipoPostulacion";
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
  proyecto: { tabla: "proyectos", icono: "📁", campos: [["Folio", "folio"], ["Tipo", "tipo"], ["Modalidad", "modalidad"], ["Etapa", "etapa"], ["Actividad", "estado_actividad"]] },
  empresa: { tabla: "empresas", icono: "🏢", campos: [["Código", "codigo"], ["Razón social", "razon_social"], ["RUC", "ruc"], ["Región", "region"], ["Estado interno", "estado"], ["Constitución", "fecha_constitucion"], ["Domicilio fiscal", "domicilio_fiscal"], ["Estado SUNAT", "estado_sunat"], ["Condición SUNAT", "condicion_sunat"], ["Verificado SUNAT", "fecha_verificacion_sunat"]] },
  persona: { tabla: "personas", icono: "👤", campos: [["Alias", "alias"], ["Tipo", "tipo"], ["Equipo", "equipo"], ["Estado", "estado"], ["Región", "region"], ["Rol", "rol"], ["RUC/DNI", "ruc_dni"], ["DNI vence", "dni_vencimiento"]] },
  equipamiento: { tabla: "equipamiento", icono: "🎥", campos: [["Folio", "folio"], ["Categoría", "categoria"], ["Subcategoría", "subcategoria"], ["Estado", "estado"], ["Valor (S/)", "valor_compra"], ["Comprado en", "comprado_en"]] },
  lugar: { tabla: "lugares", icono: "📍", campos: [] },
  postulacion: { tabla: "postulaciones", icono: "🎯", campos: [["Código", "codigo"], ["Código plataforma DAFO", "codigo_plataforma"], ["Código del acta", "codigo_acta"], ["Estado", "estado"], ["Lenguas originarias", "lenguas_originarias"], ["Puntaje jurado", "puntaje_jurado"], ["Monto adjudicado (S/)", "monto_adjudicado"], ["Firma del acta", "fecha_firma_acta"], ["Límite de rendición", "fecha_limite_rendicion"], ["Prórroga", "fecha_prorroga"]] },
  convocatoria: { tabla: "convocatorias", icono: "📜", campos: [["Código", "codigo"], ["Institución", "institucion"], ["Año", "anio"], ["Estado", "estado"], ["Monto del estímulo (S/)", "monto_adjudicado"]] },
  etiqueta: { tabla: "etiquetas", icono: "🏷️", campos: [] },
};

const ESTADOS: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso", en_pausa: "En Pausa",
  resuelta: "Resuelta", archivada: "Archivada",
};
const TIPO_META: Record<string, string> = {
  aviso: "📢", tarea: "✅", problema: "❗", pago: "💰", idea: "💡", archivo: "📎",
};

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/* Presentación de valores en la ficha: dinero con miles, fechas legibles */
const CAMPOS_DINERO = ["monto_adjudicado", "valor_compra"];
const ICONO_ESTADO: Record<string, string> = {
  // postulaciones
  ganadora: "🏆", finalista: "⭐", enviada: "📨", no_seleccionada: "✖", retirada: "↩", en_preparacion: "🛠",
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
  const { data: pubs } = ids.length
    ? await supabase.from("publicaciones")
        .select("id,titulo,tipo,estado,creado_en,fecha_limite,resp:perfiles!publicaciones_responsable_fkey(nombre)")
        .in("id", ids).order("creado_en", { ascending: false })
    : { data: [] };

  // Relaciones societarias
  let miembros: any[] = [], personasCat: any[] = [], cargosDe: any[] = [];
  let clienteDe: { id: string; nombre: string } | null = null;
  let cronoActs: any[] = [], perfilesCat: any[] = [];
  let postusProy: any[] = [];
  if (params.tipo === "proyecto") {
    const [pc, cl, ca, pf, pp] = await Promise.all([
      supabase.from("personas").select("id,nombre,tipo").order("nombre"),
      ent.cliente_id
        ? supabase.from("personas").select("id,nombre").eq("id", ent.cliente_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("cronograma_actividades")
        .select("*, resp:perfiles(nombre)")
        .eq("proyecto_id", params.id).order("fecha_inicio"),
      supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("postulaciones")
        .select("id,codigo,estado,codigo_acta,monto_adjudicado,fecha_firma_acta,fecha_limite_rendicion,fecha_prorroga,acta_url,conv:convocatorias(id,codigo,nombre,anio)")
        .eq("proyecto_id", params.id).order("creado_en", { ascending: false }),
    ]);
    personasCat = pc.data || [];
    clienteDe = (cl as any).data || null;
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
  let postCtx: any = null, equipoPost: any[] = [];
  if (params.tipo === "postulacion") {
    const [ctx, eq, pc] = await Promise.all([
      supabase.from("postulaciones")
        .select("proy:proyectos(id,nombre,tipo), emp:empresas(id,nombre,codigo), conv:convocatorias(id,codigo,nombre,anio,monto_adjudicado,bases_url,hitos:cronograma_actividades(id,nombre,fecha_inicio,estado,clase))")
        .eq("id", params.id).single(),
      supabase.from("postulacion_equipo")
        .select("id,cargo,persona:personas(id,nombre)")
        .eq("postulacion_id", params.id).order("cargo"),
      supabase.from("personas").select("id,nombre,tipo").order("nombre"),
    ]);
    postCtx = ctx.data;
    equipoPost = eq.data || [];
    personasCat = pc.data || [];
  }
  if (params.tipo === "empresa") {
    const [m, pc] = await Promise.all([
      supabase.from("empresa_miembros")
        .select("id,cargo,fecha_inicio,fecha_fin,estado,persona:personas(id,nombre)")
        .eq("empresa_id", params.id).order("cargo"),
      supabase.from("personas").select("id,nombre,tipo").order("nombre"),
    ]);
    miembros = m.data || [];
    personasCat = pc.data || [];
  }
  if (params.tipo === "persona") {
    const { data } = await supabase.from("empresa_miembros")
      .select("id,cargo,estado,fecha_inicio,fecha_fin,empresa:empresas(id,nombre,codigo)")
      .eq("persona_id", params.id).order("estado");
    cargosDe = data || [];
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
  const activas = (pubs || []).filter((p: any) => ["abierta", "en_progreso"].includes(p.estado));
  const cerradas = (pubs || []).filter((p: any) => !["abierta", "en_progreso"].includes(p.estado));

  const cardPub = (p: any) => (
    <Link key={p.id} href={`/caso/${p.id}`}>
      <div className="card link" style={{ cursor: "pointer", padding: "12px 15px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{TIPO_META[p.tipo] || "💬"}</span>
          <b style={{ flex: 1, fontSize: 13.5 }}>{p.titulo}</b>
          {(p.resp as any)?.nombre && <span className="tv-resp">{(p.resp as any).nombre.split(" ")[0]}</span>}
          <span className={`pill st-${p.estado}`}>{ESTADOS[p.estado] || p.estado}</span>
        </div>
        <div className="meta">{fecha(p.creado_en)}</div>
      </div>
    </Link>
  );

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
                  }>{verFicha(key, ent[key])}</span>
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
            <div style={{ marginTop: 12 }}>
              <Mantenimiento tipo={params.tipo} id={params.id} valores={ent} />
            </div>
          </div>

          {params.tipo === "proyecto" && (
            <ClienteProyecto proyectoId={params.id} cliente={clienteDe} personas={personasCat} />
          )}

          {params.tipo === "proyecto" && postusProy.length > 0 && (
            <div className="linked" style={{ marginTop: 14 }}>
              <h4>🎯 Postulaciones y fondos · {postusProy.length}</h4>
              {postusProy.map((p: any) => (
                <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "8px 0" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                    <Link href={`/entidad/postulacion/${p.id}`} style={{ color: "var(--text)", fontWeight: 600 }}>
                      {ICONO_ESTADO[p.estado] || "🎯"} {p.conv?.nombre || p.codigo || "Postulación"} →
                    </Link>
                    {p.conv?.anio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.conv.anio}</span>}
                  </div>
                  {p.estado === "ganadora" && (
                    <div style={{ marginTop: 5, fontSize: 12, color: "var(--muted)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      {p.codigo_acta && <span style={{ color: "var(--green)", fontWeight: 700 }}>{p.codigo_acta}</span>}
                      {p.monto_adjudicado && (
                        <span style={{ color: "var(--teal)", fontWeight: 700 }}>
                          S/ {parseFloat(p.monto_adjudicado).toLocaleString("es-PE")}
                        </span>
                      )}
                      {p.fecha_firma_acta && <span>🖋 {verFicha("f", p.fecha_firma_acta)}</span>}
                      {(p.fecha_prorroga || p.fecha_limite_rendicion) && (
                        <span style={{ color: "var(--yellow)" }}>
                          🧾 rinde: {verFicha("f", p.fecha_prorroga || p.fecha_limite_rendicion)}{p.fecha_prorroga ? " (prórroga)" : ""}
                        </span>
                      )}
                      {p.acta_url && (
                        <a href={p.acta_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--violet)" }}>📄 Acta</a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
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

          {(params.tipo === "empresa" || params.tipo === "persona") && (
            <Credenciales dueno={params.tipo as "empresa" | "persona"} duenoId={params.id} credenciales={creds} />
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
              const hitosConc = (postCtx?.conv?.hitos || [])
                .filter((h: any) => h.clase === "hito_externo" && h.estado !== "cancelada")
                .sort((a: any, b: any) => (a.fecha_inicio < b.fecha_inicio ? -1 : 1));
              return (
                <>
                  {hitosConc.length > 0 && (
                    <div className="card" style={{ marginBottom: 16 }}>
                      <div className="panel-h">📅 Línea de tiempo del concurso — la carrera de esta postulación</div>
                      <LineaTiempo eventos={hitosConc.map((h: any) => ({
                        fecha: h.fecha_inicio, titulo: h.nombre, icono: "🏛",
                        color: h.estado === "finalizada" ? "#4a4a5e" : "var(--violet)",
                      }))} />
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
