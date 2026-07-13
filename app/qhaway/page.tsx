import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import BotonCasoUrgente from "@/components/BotonCasoUrgente";
import RondaLinks from "@/components/RondaLinks";
import TabsPanel from "@/components/TabsPanel";
import Link from "next/link";
import { redirect } from "next/navigation";

const diasHasta = (f: string) => Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);
const diasDesde = (f: string) => -diasHasta(f);

/* El perfil de Qhaway — mismo diseño que toda entidad viva:
   carné a la izquierda, vida a la derecha. */

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Qhaway() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  // Solo la voz de Qhaway: eventos tipo 'bot' (su ronda).
  // Los eventos sin autor de otras clases son del Sistema (SQL/semillas).
  const [{ count: total }, { count: hoyCount }, { data: eventos }, { data: primero }] = await Promise.all([
    supabase.from("actividad").select("id", { count: "exact", head: true }).eq("tipo", "bot"),
    supabase.from("actividad").select("id", { count: "exact", head: true })
      .eq("tipo", "bot").gte("creado_en", hoy.toISOString()),
    supabase.from("actividad")
      .select("tipo,detalle,creado_en,entidad_tipo,entidad_id")
      .eq("tipo", "bot")
      .order("creado_en", { ascending: false }).limit(20),
    supabase.from("actividad").select("creado_en").eq("tipo", "bot")
      .order("creado_en", { ascending: true }).limit(1),
  ]);

  const ids = Array.from(new Set((eventos || [])
    .filter((e: any) => e.entidad_tipo === "publicacion").map((e: any) => e.entidad_id)));
  const { data: titulos } = ids.length
    ? await supabase.from("publicaciones").select("id,titulo").in("id", ids)
    : { data: [] };
  const tituloDe = new Map((titulos || []).map((t: any) => [t.id, t.titulo]));

  const nacimiento = primero?.[0]?.creado_en
    ? new Date(primero[0].creado_en).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  // ===== HALLAZGOS EN VIVO: lo que Qhaway está viendo AHORA =====
  const hoyS = new Date().toISOString().slice(0, 10);
  const en60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const hace3d = new Date(Date.now() - 3 * 86400000).toISOString();

  const [{ data: porVencer }, { data: activasTodas }, { data: actividad3d },
         { data: sunatMal }, { count: sunatSinVerif }, { data: dniPorVencer },
         { data: vigenciasTodas }, { data: rendiciones }] = await Promise.all([
    supabase.from("publicaciones")
      .select("id,titulo,fecha_limite,estado,resp:perfiles!publicaciones_responsable_fkey(nombre)")
      .in("estado", ["abierta", "en_progreso"]).not("fecha_limite", "is", null)
      .lte("fecha_limite", en7).order("fecha_limite").limit(12),
    supabase.from("publicaciones").select("id,titulo,responsable,fecha_limite")
      .in("estado", ["abierta", "en_progreso"]).limit(200),
    supabase.from("actividad").select("entidad_id").eq("entidad_tipo", "publicacion")
      .gte("creado_en", hace3d).limit(1000),
    supabase.from("empresas").select("id,nombre,codigo,estado_sunat,condicion_sunat")
      .eq("estado", "activa").not("estado_sunat", "is", null).neq("estado_sunat", "activo"),
    supabase.from("empresas").select("id", { count: "exact", head: true })
      .eq("estado", "activa")
      .or(`fecha_verificacion_sunat.is.null,fecha_verificacion_sunat.lt.${new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)}`),
    supabase.from("personas").select("id,nombre,dni_vencimiento")
      .not("dni_vencimiento", "is", null).lte("dni_vencimiento", en60)
      .order("dni_vencimiento").limit(10),
    supabase.from("empresas").select("id,nombre,codigo,vigencia_poder_fecha")
      .eq("estado", "activa").not("vigencia_poder_fecha", "is", null),
    supabase.from("postulaciones")
      .select("id,fecha_limite_rendicion,fecha_prorroga,proy:proyectos(nombre),conv:convocatorias(codigo)")
      .eq("estado", "ganadora").or("fecha_limite_rendicion.not.is.null,fecha_prorroga.not.is.null"),
  ]);

  // ===== HIGIENE DE DATOS: registros incompletos que degradan los paneles =====
  const [{ data: proySinTipo }, { data: postSinEmp }, { data: ganIncompletas },
         { data: empSinRuc }, { data: internosSinDni }, { data: sinCuenta },
         { data: empSinRenca }] = await Promise.all([
    supabase.from("proyectos").select("id,nombre,folio").is("tipo", null).limit(30),
    supabase.from("postulaciones")
      .select("id,codigo,estado,proy:proyectos(nombre)")
      .is("empresa_id", null)
      .in("estado", ["en_preparacion", "enviada", "finalista", "ganadora"]).limit(30),
    supabase.from("postulaciones")
      .select("id,codigo,monto_adjudicado,codigo_acta,fecha_limite_rendicion,proy:proyectos(nombre)")
      .eq("estado", "ganadora")
      .or("monto_adjudicado.is.null,codigo_acta.is.null,fecha_limite_rendicion.is.null").limit(30),
    supabase.from("empresas").select("id,nombre,codigo").eq("estado", "activa").is("ruc", null).limit(30),
    supabase.from("personas").select("id,nombre,tipo")
      .or("tipo.in.(personal,colaborador),usuario_id.not.is.null")
      .is("dni_vencimiento", null)
      .order("tipo", { ascending: false })  // personal primero, colaborador después
      .order("nombre").limit(80),
    supabase.from("personas").select("id,nombre,alias")
      .eq("tipo", "personal").eq("estado", "activo")
      .is("usuario_id", null).order("nombre").limit(30),
    supabase.from("empresas").select("id,nombre,codigo")
      .eq("estado", "activa").is("renca", null).order("nombre").limit(30),
  ]);
  const grupoHigiene = (titulo: string, items: any[]) => ({ titulo, items });
  const higieneGrupos = [
    grupoHigiene("📁 Sin tipo", (proySinTipo || []).map((x: any) => ({
      href: `/entidad/proyecto/${x.id}`, nombre: `${x.folio ? x.folio + " · " : ""}${x.nombre}`, falta: "definir tipo (documental, animación...)" }))),
    grupoHigiene("🎯 Sin empresa", (postSinEmp || []).map((x: any) => ({
      href: `/entidad/postulacion/${x.id}`, nombre: `${x.codigo || "🎯"} · ${x.proy?.nombre || ""}`, falta: "asignar la empresa que postuló" }))),
    grupoHigiene("🏆 Ganadoras", (ganIncompletas || []).map((x: any) => ({
      href: `/entidad/postulacion/${x.id}`, nombre: `${x.codigo || ""} · ${x.proy?.nombre || ""}`,
      falta: "falta " + [!x.monto_adjudicado && "monto", !x.codigo_acta && "código de acta", !x.fecha_limite_rendicion && "fecha de rendición"].filter(Boolean).join(", ") }))),
    grupoHigiene("🏢 Sin RUC", (empSinRuc || []).map((x: any) => ({
      href: `/entidad/empresa/${x.id}`, nombre: `${x.codigo ? x.codigo + " · " : ""}${x.nombre}`, falta: "registrar RUC (11 dígitos)" }))),
    grupoHigiene("🎬 Sin RENCA", (empSinRenca || []).map((x: any) => ({
      href: `/entidad/empresa/${x.id}`, nombre: `${x.codigo ? x.codigo + " · " : ""}${x.nombre}`, falta: "registrar RENCA — sin él no se puede postular" }))),
    grupoHigiene("🪪 DNI", (internosSinDni || []).map((x: any) => ({
      href: `/entidad/persona/${x.id}`,
      nombre: x.nombre,
      chip: x.tipo === "personal" ? "⬡ personal" : (x.tipo || "—"),
      falta: "registrar vencimiento de DNI" }))),
    grupoHigiene("🔗 Sin cuenta", (sinCuenta || []).map((x: any) => ({
      href: `/entidad/persona/${x.id}`,
      nombre: x.alias || x.nombre,
      falta: "enlazar su cuenta de acceso — su actividad no se ve en su perfil" }))),
  ].filter(g => g.items.length > 0);
  const higieneTotal = higieneGrupos.reduce((s, g) => s + g.items.length, 0);

  // ===== SEMÁFORO PRE-POSTULACIÓN: ¿listos para enviar? =====
  const { data: enPrep } = await supabase.from("postulaciones")
    .select(`id,codigo,estado,materiales,
      proy:proyectos(id,nombre,tipo,renca),
      emp:empresas(id,nombre,renca,estado_sunat,condicion_sunat,fecha_verificacion_sunat,vigencia_poder_fecha),
      conv:convocatorias(id,codigo,nombre,anio),
      equipo:postulacion_equipo(persona:personas(id,nombre,alias,dni_vencimiento))`)
    .in("estado", ["en_preparacion", "enviada"]);

  const semaforo = (enPrep || []).map((p: any) => {
    const criticos: string[] = [];
    const avisos: string[] = [];
    if (!p.emp) criticos.push("sin empresa asignada");
    else {
      if (!p.emp.renca) criticos.push("empresa sin RENCA — obligatorio para postular");
      if (p.emp.estado_sunat && p.emp.estado_sunat !== "activo")
        criticos.push(`SUNAT: ${p.emp.estado_sunat.replace(/_/g, " ")}`);
      if (p.emp.condicion_sunat === "no_habido") criticos.push("empresa no habida");
      if (!p.emp.fecha_verificacion_sunat || diasDesde(p.emp.fecha_verificacion_sunat) > 60)
        avisos.push("SUNAT sin verificar");
      if (!p.emp.vigencia_poder_fecha) avisos.push("vigencia de poder sin registrar");
      else if (diasDesde(p.emp.vigencia_poder_fecha) > 90) criticos.push("vigencia de poder con 90+ días");
    }
    const llenos = Object.values(p.materiales || {}).filter(Boolean).length;
    if (llenos < 10) avisos.push(`materiales ${llenos}/10`);
    const equipo = (p.equipo || []).map((e: any) => e.persona).filter(Boolean);
    if (!equipo.length) avisos.push("sin equipo registrado");
    equipo.forEach((per: any) => {
      if (!per.dni_vencimiento) avisos.push(`DNI sin fecha: ${per.alias || per.nombre.split(" ")[0]}`);
      else if (diasHasta(per.dni_vencimiento) < 0) criticos.push(`DNI vencido: ${per.alias || per.nombre.split(" ")[0]}`);
    });
    if (!p.proy?.tipo) avisos.push("proyecto sin tipo");
    if (p.proy && !p.proy.renca) avisos.push("obra sin RENCA (opcional, pero suma)");
    return { ...p, criticos, avisos, luz: criticos.length ? "🔴" : avisos.length ? "🟡" : "🟢" };
  }).sort((a: any, b: any) => (a.luz === "🔴" ? -1 : a.luz === "🟡" && b.luz === "🟢" ? -1 : 1));

  const conActividad = new Set((actividad3d || []).map((a: any) => a.entidad_id));
  const dormidos = (activasTodas || []).filter((p: any) => !conActividad.has(p.id)).slice(0, 10);

  // ===== PULSO DEL EQUIPO: carga y flujo — nunca ranking =====
  const hace7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const [{ data: equipoPerf }, { count: resueltosSemana }] = await Promise.all([
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
    supabase.from("actividad").select("id", { count: "exact", head: true })
      .eq("entidad_tipo", "publicacion").eq("tipo", "estado")
      .eq("detalle->>a", "resuelta").gte("creado_en", hace7d),
  ]);
  const pulso = (equipoPerf || [])
    .filter((p: any) => p.nombre !== "Qhaway")
    .map((p: any) => {
      const suyos = (activasTodas || []).filter((c: any) => c.responsable === p.id);
      return {
        nombre: p.nombre.split(" ")[0],
        carga: suyos.length,
        dorm: suyos.filter((c: any) => !conActividad.has(c.id)).length,
        urgentes: suyos.filter((c: any) => c.fecha_limite && diasHasta(c.fecha_limite) <= 7).length,
      };
    })
    .filter((p: any) => p.carga > 0)
    .sort((a: any, b: any) => b.carga - a.carga);
  const maxCarga = Math.max(1, ...pulso.map((p: any) => p.carga));
  const huerfanos = (activasTodas || []).filter((c: any) => !c.responsable).slice(0, 8);
  const vigenciasAnejas = (vigenciasTodas || [])
    .filter((x: any) => diasDesde(x.vigencia_poder_fecha) > 90);
  const rendPronto = (rendiciones || [])
    .map((r: any) => ({ ...r, f: r.fecha_prorroga || r.fecha_limite_rendicion }))
    .filter((r: any) => r.f && diasHasta(r.f) <= 90)
    .sort((a: any, b: any) => (a.f < b.f ? -1 : 1));
  const totalHallazgos = (porVencer?.length || 0) + dormidos.length + (sunatMal?.length || 0)
    + (dniPorVencer?.length || 0) + vigenciasAnejas.length + rendPronto.length;

  return (
    <div className="shell shell-ancho">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          🤖 miembro no humano
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#7c5cff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 27 }}>🤖</span>
        <h1 className="title-lg" style={{ flex: 1, margin: 0 }}>Qhaway</h1>
      </div>

      <div className="perfil-grid">
        {/* ===== El carné ===== */}
        <aside>
          <div className="card">
            <div className="ficha-row"><span className="fk">Significado</span><span className="fv">"El que observa y cuida"</span></div>
            <div className="ficha-row"><span className="fk">Rol</span><span className="fv">Vigilante del equipo</span></div>
            <div className="ficha-row"><span className="fk">En servicio desde</span><span className="fv">{nacimiento}</span></div>
            <div className="ficha-row"><span className="fk">Ronda diaria</span><span className="fv">7:30 a.m. 🌄</span></div>
            <div className="ficha-row"><span className="fk">Canales</span><span className="fv">Feed · Google Chat · 🔔</span></div>
            <div className="ficha-row"><span className="fk">Apuntes en total</span><span className="fv" style={{ color: "var(--blue)", fontWeight: 800 }}>{total || 0}</span></div>
            <div className="ficha-row"><span className="fk">Apuntes hoy</span><span className="fv">{hoyCount || 0}</span></div>
            <div className="ficha-row"><span className="fk">Sueldo</span><span className="fv">S/ 0.00 (voluntario) 😄</span></div>
          </div>

          <div className="linked" style={{ marginTop: 14 }}>
            <h4>📜 Mis reglas de servicio</h4>
            <ul style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.9, paddingLeft: 18 }}>
              <li>Despierto los casos sin actividad por 3 días — insisto cada 3, no ametrallo.</li>
              <li>Vigilo los vencimientos: 7 días antes, 2 antes, el día D, y no suelto lo vencido.</li>
              <li>Canto las alertas SUNAT de las empresas activas hasta que se resuelvan.</li>
              <li>Todo lo que hago queda en la bitácora — rindo cuentas como cualquiera.</li>
              <li>Propongo, nunca dispongo: jamás cierro ni borro nada por mi cuenta.</li>
            </ul>
          </div>
        </aside>

        {/* ===== CENTRO DE ACCIONES: lo que estoy viendo AHORA ===== */}
        <main>
          <div className="h4" style={{ marginTop: 0 }}>
            👁 Lo que estoy viendo ahora · {totalHallazgos} hallazgo{totalHallazgos === 1 ? "" : "s"}
          </div>
          {totalHallazgos === 0 && (
            <div className="card" style={{ borderColor: "rgba(46,204,113,.35)" }}>
              <span style={{ color: "var(--green)", fontSize: 13.5 }}>
                ✅ Horizonte despejado — nada requiere acción inmediata. Sigan filmando.
              </span>
            </div>
          )}

          {(porVencer || []).length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.35)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>⏰ Vencidos y por vencer (7 días)</div>
              {(porVencer || []).map((p: any) => {
                const d = diasHasta(p.fecha_limite);
                return (
                  <div className="info-row" key={p.id}>
                    <Link href={`/caso/${p.id}`} style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{p.titulo} →</Link>
                    {(p.resp as any)?.nombre && <span style={{ color: "var(--teal)", fontSize: 12 }}>{(p.resp as any).nombre.split(" ")[0]}</span>}
                    <span style={{ color: d < 0 ? "var(--red)" : d <= 2 ? "var(--yellow)" : "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                      {d < 0 ? `vencido hace ${-d}d` : d === 0 ? "HOY" : `en ${d}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {dormidos.length > 0 && (
            <div className="card">
              <div className="panel-h">💤 Dormidos — 3+ días sin actividad</div>
              {dormidos.map((p: any) => (
                <div className="info-row" key={p.id}>
                  <Link href={`/caso/${p.id}`} style={{ fontWeight: 600 }}>{p.titulo} →</Link>
                </div>
              ))}
            </div>
          )}

          {(sunatMal || []).length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.35)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>🏢 Empresas con problema SUNAT</div>
              {(sunatMal || []).map((x: any) => (
                <div className="info-row" key={x.id}>
                  <Link href={`/entidad/empresa/${x.id}`} style={{ fontWeight: 600 }}>
                    {x.codigo ? `${x.codigo} · ` : ""}{x.nombre} →
                  </Link>
                  <span style={{ color: "var(--red)", fontSize: 12, fontWeight: 700 }}>
                    {(x.estado_sunat || "").replace(/_/g, " ")}{x.condicion_sunat && x.condicion_sunat !== "habido" ? ` · ${x.condicion_sunat.replace(/_/g, " ")}` : ""}
                  </span>
                  <span style={{ flex: 1 }} />
                  <BotonCasoUrgente
                    titulo={`⚠ SUNAT: ${x.nombre} en ${(x.estado_sunat || "").replace(/_/g, " ")}`}
                    cuerpo={`Hallazgo de Qhaway: la empresa ${x.nombre} figura en SUNAT como «${(x.estado_sunat || "").replace(/_/g, " ")}». Regularizar antes de postular, facturar o rendir con esta empresa.`}
                    entTipo="empresa" entId={x.id} />
                </div>
              ))}
            </div>
          )}

          {(dniPorVencer || []).length > 0 && (
            <div className="card" style={{ borderColor: "rgba(244,180,0,.3)" }}>
              <div className="panel-h" style={{ color: "var(--yellow)" }}>🪪 DNI vencidos o por vencer (60 días)</div>
              {(dniPorVencer || []).map((p: any) => {
                const d = diasHasta(p.dni_vencimiento);
                return (
                  <div className="info-row" key={p.id}>
                    <Link href={`/entidad/persona/${p.id}`} style={{ fontWeight: 600 }}>{p.nombre} →</Link>
                    <span style={{ color: d < 0 ? "var(--red)" : "var(--yellow)", fontSize: 12, fontWeight: 700 }}>
                      {d < 0 ? `vencido hace ${-d}d` : `vence en ${d}d`}
                    </span>
                    <span style={{ flex: 1 }} />
                    <BotonCasoUrgente
                      titulo={`🪪 Renovar DNI de ${p.nombre}`}
                      cuerpo={`Hallazgo de Qhaway: el DNI de ${p.nombre} ${d < 0 ? `venció hace ${-d} días` : `vence en ${d} días`}. Un DNI vencido invalida postulaciones, contratos y giros de RHE.`}
                      entTipo="persona" entId={p.id} />
                  </div>
                );
              })}
            </div>
          )}

          {vigenciasAnejas.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(244,180,0,.3)" }}>
              <div className="panel-h" style={{ color: "var(--yellow)" }}>📜 Vigencias de poder con 90+ días</div>
              {vigenciasAnejas.map((x: any) => (
                <div className="info-row" key={x.id}>
                  <Link href={`/entidad/empresa/${x.id}`} style={{ fontWeight: 600 }}>
                    {x.codigo ? `${x.codigo} · ` : ""}{x.nombre} →
                  </Link>
                  <span style={{ color: "var(--yellow)", fontSize: 12 }}>emitida hace {diasDesde(x.vigencia_poder_fecha)}d</span>
                  <span style={{ flex: 1 }} />
                  <BotonCasoUrgente
                    titulo={`📜 Renovar vigencia de poder de ${x.nombre}`}
                    cuerpo={`Hallazgo de Qhaway: la vigencia de poder de ${x.nombre} fue emitida hace ${diasDesde(x.vigencia_poder_fecha)} días. DAFO suele exigirla con menos de 3 meses — tramitar una nueva en SUNARP antes de la próxima postulación.`}
                    entTipo="empresa" entId={x.id} />
                </div>
              ))}
            </div>
          )}

          {rendPronto.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.35)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>🧾 Rendiciones en el horizonte (90 días)</div>
              {rendPronto.map((r: any) => {
                const d = diasHasta(r.f);
                return (
                  <div className="info-row" key={r.id}>
                    <Link href={`/entidad/postulacion/${r.id}`} style={{ fontWeight: 600 }}>
                      🏆 {r.proy?.nombre || "Proyecto"} →
                    </Link>
                    {r.conv && <span style={{ color: "var(--dim)", fontSize: 12 }}>📜 {r.conv.codigo}</span>}
                    <span style={{ color: d < 30 ? "var(--red)" : "var(--yellow)", fontSize: 12, fontWeight: 700 }}>
                      {d < 0 ? `VENCIDA hace ${-d}d` : `en ${d}d`}
                    </span>
                    <span style={{ flex: 1 }} />
                    <BotonCasoUrgente
                      titulo={`🧾 Preparar rendición de ${r.proy?.nombre || "proyecto"}`}
                      cuerpo={`Hallazgo de Qhaway: la rendición de ${r.proy?.nombre} (${r.conv?.codigo || ""}) vence ${d < 0 ? `hace ${-d} días — URGENTE` : `en ${d} días`}. Reunir informe económico al 100%, comprobantes y presupuesto actualizado.`}
                      entTipo="postulacion" entId={r.id} />
                  </div>
                );
              })}
            </div>
          )}

          {(sunatSinVerif || 0) > 0 && (
            <div className="card">
              <div className="info-row" style={{ borderBottom: "none", padding: "2px 0" }}>
                <span style={{ fontSize: 13 }}>🔍 <b>{sunatSinVerif}</b> empresas sin verificar en SUNAT (60+ días)</span>
                <span style={{ flex: 1 }} />
                <Link href="/empresas" className="btn btn-ghost" style={{ fontSize: 11.5, padding: "3px 10px" }}>
                  🔄 Correr ronda SUNAT →
                </Link>
              </div>
            </div>
          )}

          {semaforo.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(167,139,250,.35)" }}>
              <div className="panel-h" style={{ color: "var(--violet)" }}>
                🚦 Semáforo pre-postulación — ¿listos para enviar?
              </div>
              {semaforo.map((p: any) => (
                <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "9px 0" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16 }}>{p.luz}</span>
                    <Link href={`/entidad/postulacion/${p.id}`} style={{ fontWeight: 700, fontSize: 13 }}>
                      {p.codigo ? `${p.codigo} · ` : ""}{p.proy?.nombre || "Postulación"} →
                    </Link>
                    {p.conv && (
                      <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>
                        📜 {p.conv.codigo}{p.conv.anio ? ` · ${p.conv.anio}` : ""}
                      </span>
                    )}
                    <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>
                      {p.estado === "en_preparacion" ? "🛠 en preparación" : "📨 enviada"}
                    </span>
                  </div>
                  {(p.criticos.length > 0 || p.avisos.length > 0) && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, paddingLeft: 26 }}>
                      {p.criticos.map((c: string, i: number) => (
                        <span key={`c${i}`} className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.1)", fontSize: 10.5 }}>✖ {c}</span>
                      ))}
                      {p.avisos.map((a: string, i: number) => (
                        <span key={`a${i}`} className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.1)", fontSize: 10.5 }}>△ {a}</span>
                      ))}
                    </div>
                  )}
                  {p.luz === "🟢" && (
                    <div style={{ marginTop: 5, paddingLeft: 26, color: "var(--green)", fontSize: 12 }}>
                      Todo en orden — lista para la plataforma.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {(pulso.length > 0 || huerfanos.length > 0) && (
            <div className="card">
              <div className="panel-h" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                🫀 Pulso del equipo
                <span style={{ color: "var(--dim)", fontSize: 11, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  carga y flujo — nunca un ranking
                </span>
              </div>

              {(resueltosSemana || 0) > 0 && (
                <div style={{ color: "var(--green)", fontSize: 13, marginBottom: 12 }}>
                  🎉 Esta semana el equipo resolvió <b>{resueltosSemana}</b> caso{resueltosSemana === 1 ? "" : "s"} — logro de todos.
                </div>
              )}

              {pulso.map((p: any) => (
                <div key={p.nombre} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0" }}>
                  <span style={{ width: 74, fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{p.nombre}</span>
                  <span style={{ flex: 1, height: 8, background: "var(--bg)", borderRadius: 5, overflow: "hidden" }}>
                    <span style={{
                      display: "block", height: "100%", borderRadius: 5,
                      width: `${Math.round((p.carga / maxCarga) * 100)}%`,
                      background: "linear-gradient(90deg,#3b82f6,#7c5cff)",
                    }} />
                  </span>
                  <span style={{ width: 20, textAlign: "right", fontSize: 12.5, fontWeight: 700, color: "var(--blue)" }}>{p.carga}</span>
                  <span style={{ width: 110, fontSize: 11, color: "var(--dim)", textAlign: "right" }}>
                    {p.dorm > 0 && <span style={{ color: "var(--yellow)" }}>😴 {p.dorm}</span>}
                    {p.dorm > 0 && p.urgentes > 0 && " · "}
                    {p.urgentes > 0 && <span style={{ color: "var(--red)" }}>⏰ {p.urgentes}</span>}
                  </span>
                </div>
              ))}

              {huerfanos.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <div style={{ color: "var(--yellow)", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    🙋 Sin responsable · {huerfanos.length} — trabajo de nadie es trabajo de todos
                  </div>
                  {huerfanos.map((c: any) => (
                    <div className="info-row" key={c.id}>
                      <Link href={`/caso/${c.id}`} style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{c.titulo} →</Link>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 12 }}>
                Una barra larga es señal para redistribuir, no un mérito ni una falta.
                😴 = sin actividad 3+ días · ⏰ = vence en 7 días o menos.
              </div>
            </div>
          )}

          {higieneTotal > 0 && (
            <div className="card">
              <div className="panel-h">🧹 Higiene de datos · {higieneTotal} fichas incompletas</div>
              <TabsPanel
                labels={higieneGrupos.map(g => `${g.titulo} · ${g.items.length}`)}
                paneles={higieneGrupos.map((g, gi) => (
                  <div key={gi}>
                    {g.items.map((h: any, i: number) => (
                      <div className="info-row" key={i}>
                        <Link href={h.href} style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{h.nombre} →</Link>
                        {h.chip && (
                          <span className="badge" style={{
                            color: h.chip.startsWith("⬡") ? "var(--violet)" : "var(--muted)",
                            background: "#1c1c2c", fontSize: 10.5,
                          }}>{h.chip}</span>
                        )}
                        <span style={{ color: "var(--yellow)", fontSize: 11.5 }}>{h.falta}</span>
                      </div>
                    ))}
                  </div>
                ))}
              />
            </div>
          )}

          <RondaLinks />

          <details style={{ marginTop: 16 }}>
            <summary style={{ color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "6px 0" }}>
              🕐 Mi bitácora — últimas intervenciones · {(eventos || []).length}
            </summary>
            <div className="tl" style={{ marginTop: 10 }}>
              {(eventos || []).map((e: any, i: number) => (
                <div className="tl-ev bot" key={i}>
                  <span>🤖</span>
                  <span style={{ flex: 1 }}>
                    {e.detalle?.mensaje || e.tipo}
                    {tituloDe.get(e.entidad_id) && (
                      <> — <Link href={`/caso/${e.entidad_id}`} style={{ color: "var(--blue)" }}>
                        «{tituloDe.get(e.entidad_id)}»</Link></>
                    )}
                  </span>
                  <span className="t">{fecha(e.creado_en)}</span>
                </div>
              ))}
              {!(eventos || []).length && <div className="empty">Aún sin intervenciones — mi primera ronda llega a las 7:30.</div>}
            </div>
          </details>
        </main>
      </div>
    </div>
  );
}