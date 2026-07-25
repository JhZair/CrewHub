import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import BotonCasoUrgente from "@/components/BotonCasoUrgente";
import RondaLinks from "@/components/RondaLinks";
import TabsPanel from "@/components/TabsPanel";
import { alertaSunat, esProblematico, textoSunat } from "@/lib/sunat";
import { TIPOS_EQUIPO } from "@/lib/personas";
import { fmtVence, vigenciaVencida } from "@/lib/vigencia";
import { plazoRendicion } from "@/lib/fondos";
import { plazoDe, diasHasta } from "@/lib/plazo";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🤖 Bot Qhaway" };

// Qhaway — vista rediseñada: carné compacto + resumen + pestañas.
/* `diasHasta` era idéntica a la de lib/plazo —misma fórmula, mismo mediodía—
   así que se importa. Aquí sirve para DNIs y rendiciones además de casos:
   «cuántos días faltan para una fecha» es una sola cuenta. */
const diasDesde = (f: string) => -diasHasta(f);

/* El perfil de Qhaway — carné compacto a la izquierda; a la derecha,
   resumen de hallazgos + pestañas (Alertas · Postulaciones · Equipo · Higiene). */

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

export default async function Qhaway({ searchParams }: { searchParams: { bit?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const ahora = Date.now();
  const RANGOS: { k: string; label: string; desde: number | null }[] = [
    { k: "hoy", label: "Hoy", desde: hoy.getTime() },
    { k: "semana", label: "Semana", desde: ahora - 7 * 86400000 },
    { k: "mes", label: "Mes", desde: ahora - 30 * 86400000 },
    { k: "anio", label: "Año", desde: ahora - 365 * 86400000 },
    { k: "todo", label: "Todo", desde: null },
  ];
  const rango = RANGOS.find(r => r.k === searchParams?.bit) || RANGOS[0];
  let bitQuery = supabase.from("actividad")
    .select("tipo,detalle,creado_en,entidad_tipo,entidad_id")
    .eq("tipo", "bot")
    .order("creado_en", { ascending: false });
  if (rango.desde != null) bitQuery = bitQuery.gte("creado_en", new Date(rango.desde).toISOString());
  bitQuery = bitQuery.limit(1000);

  const [{ count: total }, { count: hoyCount }, { data: eventos }, { data: primero }] = await Promise.all([
    supabase.from("actividad").select("id", { count: "exact", head: true }).eq("tipo", "bot"),
    supabase.from("actividad").select("id", { count: "exact", head: true })
      .eq("tipo", "bot").gte("creado_en", hoy.toISOString()),
    bitQuery,
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

  // ===== HALLAZGOS EN VIVO =====
  const en60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const hace3d = new Date(Date.now() - 3 * 86400000).toISOString();

  const [{ data: porVencer }, { data: activasTodas }, { data: actividad3d },
         { data: activasSunat }, { count: sunatSinVerif }, { data: dniPorVencer },
         { data: vigenciasTodas }, { data: rendiciones },
         { data: nuestraGente }] = await Promise.all([
    supabase.from("publicaciones")
      .select("id,titulo,fecha_limite,estado,resp:perfiles!publicaciones_responsable_fkey(nombre)")
      .in("estado", ["abierta", "en_progreso"]).is("archivado_en", null).not("fecha_limite", "is", null)
      .neq("tipo", "bitacora")
      .lte("fecha_limite", en7).order("fecha_limite").limit(12),
    supabase.from("publicaciones").select("id,titulo,responsable,fecha_limite")
      .in("estado", ["abierta", "en_progreso"]).is("archivado_en", null).neq("tipo", "bitacora").limit(200),
    supabase.from("actividad").select("entidad_id").eq("entidad_tipo", "publicacion")
      .gte("creado_en", hace3d).limit(1000),
    /* Se filtra en JS con la regla compartida, no en la consulta. La versión
       anterior pedía `estado_sunat != activo` y con eso jamás veía a una
       empresa "activo · no habido" —que tampoco puede postular—, ni miraba
       la relación, así que podía alertarte de una externa. */
    supabase.from("empresas").select("id,nombre,codigo,estado,relacion,estado_sunat,condicion_sunat")
      .eq("estado", "activa"),
    supabase.from("empresas").select("id", { count: "exact", head: true })
      .eq("estado", "activa")
      .or(`fecha_verificacion_sunat.is.null,fecha_verificacion_sunat.lt.${new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)}`),
    supabase.from("personas").select("id,nombre,dni_vencimiento")
      .not("dni_vencimiento", "is", null).lte("dni_vencimiento", en60)
      .order("dni_vencimiento").limit(10),
    /* `renca` entra a la consulta porque decide si la vigencia importa: es
       el papel con que se pide el RENCA, no un requisito del fondo. */
    supabase.from("empresas").select("id,nombre,codigo,renca,vigencia_poder_fecha")
      .eq("estado", "activa").not("vigencia_poder_fecha", "is", null),
    /* Rendiciones pendientes de verdad: `fecha_rendicion_real` nula = no se
       ha entregado. Sin ese filtro, el vigía seguiría reclamando una
       rendición que ya se presentó — y a la tercera vez nadie le hace caso
       a nada de lo que dice. */
    supabase.from("postulaciones")
      .select("id,estado,fecha_limite_rendicion,fecha_prorroga,fecha_rendicion_real,proy:proyectos(nombre),conv:convocatorias(codigo)")
      .eq("estado", "ganadora").is("fecha_rendicion_real", null)
      .or("fecha_limite_rendicion.not.is.null,fecha_prorroga.not.is.null"),
    // Gente nuestra (lib/personas.ts). Lo demás se filtra abajo en JS: son
    // decenas de filas, y así el vigía y /personas usan la misma función en
    // vez de dos consultas que se contradicen.
    supabase.from("personas")
      .select("id,nombre,alias,tipo,estado,ruc_dni,fecha_verificacion_sunat,estado_sunat,condicion_sunat,suspension_4ta_anio")
      .in("tipo", TIPOS_EQUIPO).eq("estado", "activo").limit(300),
  ]);

  // Mal en SUNAT y nuestro: misma regla que /empresas y que el bot
  const sunatMal = (activasSunat || []).filter(alertaSunat);

  /* Gente de baja o no habida en SUNAT: no puede girarnos un RHE. El dato
     estaba desde siempre y nunca alertó en ninguna pantalla. */
  const personasSunatMal = (nuestraGente || [])
    .filter((p: any) => esProblematico(p.estado_sunat, p.condicion_sunat));

  /* Suspensiones de 4ta caducadas: mueren el 31 de diciembre, todas juntas.
     Sin este aviso, cada enero arranca con retenciones que nadie esperaba. */
  const suspCaducada = (nuestraGente || [])
    .filter((p: any) => p.suspension_4ta_anio && p.suspension_4ta_anio < new Date().getFullYear());

  /* Personas con su SUNAT rancio. Las empresas tienen cron semanal; las
     personas no —su estado cambia poco y la API de decolecta tiene cupo—,
     así que el único que avisa es este panel. Sin esto, el dato envejece
     callado hasta que lo necesitas para girar un RHE o armar la carpeta. */
  const sunatPersonaVieja = (nuestraGente || [])
    // Sin DNI no hay RUC que consultar: esa gente ya sale en "internos sin DNI"
    .filter((p: any) => !!p.ruc_dni)
    .filter((p: any) => !p.fecha_verificacion_sunat || diasDesde(p.fecha_verificacion_sunat) > 60)
    .sort((a: any, b: any) =>
      (a.fecha_verificacion_sunat || "").localeCompare(b.fecha_verificacion_sunat || ""));

  // ===== HIGIENE DE DATOS =====
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
      .in("tipo", TIPOS_EQUIPO).eq("estado", "activo")
      .is("dni_vencimiento", null)
      .order("tipo", { ascending: false })
      .order("nombre").limit(80),
    supabase.from("personas").select("id,nombre,alias")
      .eq("tipo", "personal").eq("estado", "activo")
      .is("usuario_id", null).order("nombre").limit(30),
    supabase.from("empresas").select("id,nombre,codigo")
      .eq("estado", "activa").is("renca", null).order("nombre").limit(30),
  ]);
  const { count: dniSinFechaTotal } = await supabase.from("personas")
    .select("id", { count: "exact", head: true })
    .in("tipo", TIPOS_EQUIPO).eq("estado", "activo")
    .is("dni_vencimiento", null);
  // Datos de credenciales sin verificar o con 180+ días sin reverificar
  const credCutoff = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const { data: datosViejos } = await supabase.from("credencial_datos")
    .select("id,etiqueta,verificado_en,cred:credenciales(plataforma,empresa_id,persona_id)")
    .or(`verificado_en.is.null,verificado_en.lt.${credCutoff}`).limit(40);
  const credDatosItems = (datosViejos || []).map((d: any) => {
    const cr = d.cred;
    const eid = cr?.empresa_id || cr?.persona_id;
    if (!eid) return null;
    return {
      href: `/entidad/${cr.empresa_id ? "empresa" : "persona"}/${eid}`,
      nombre: `${cr.plataforma || "cuenta"} · ${d.etiqueta}`,
      falta: d.verificado_en ? `sin reverificar hace ${diasDesde(d.verificado_en)} días` : "nunca verificado",
    };
  }).filter(Boolean);
  const grupoHigiene = (titulo: string, items: any[], total?: number) =>
    ({ titulo, items, total: total ?? items.length });
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
      falta: "registrar vencimiento de DNI" })), dniSinFechaTotal ?? undefined),
    grupoHigiene("🔗 Sin cuenta", (sinCuenta || []).map((x: any) => ({
      href: `/entidad/persona/${x.id}`,
      nombre: x.alias || x.nombre,
      falta: "enlazar su cuenta de acceso — su actividad no se ve en su perfil" }))),
    grupoHigiene("🔑 Datos por reverificar", credDatosItems),
  ].filter(g => g.items.length > 0);
  const higieneTotal = higieneGrupos.reduce((s, g) => s + (g.total ?? g.items.length), 0);

  // ===== SEMÁFORO PRE-POSTULACIÓN =====
  const { data: enPrep } = await supabase.from("postulaciones")
    .select(`id,codigo,estado,materiales,expediente,
      proy:proyectos(id,nombre,tipo,renca),
      emp:empresas(id,nombre,renca,estado_sunat,condicion_sunat,fecha_verificacion_sunat,vigencia_poder_fecha),
      conv:convocatorias(id,codigo,nombre,anio,plantilla_formulario),
      equipo:postulacion_equipo(persona:personas(id,nombre,alias,dni_vencimiento))`)
    .in("estado", ["en_preparacion", "enviada"]);

  const semaforo = (enPrep || []).map((p: any) => {
    const criticos: string[] = [];
    const avisos: string[] = [];
    if (!p.emp) criticos.push("sin empresa asignada");
    else {
      /* El RENCA es lo que exige el fondo. La vigencia de poder no: sirve
         para PEDIR el RENCA, y con el RENCA en mano ya cumplió.
         Por eso la vigencia solo se nombra cuando falta el RENCA — ahí es el
         papel que hay que sacar primero. Antes esto marcaba en rojo una
         postulación de empresa con RENCA porque su vigencia había vencido:
         reclamaba un trámite que no bloqueaba nada. */
      if (!p.emp.renca) {
        criticos.push("empresa sin RENCA — obligatorio para postular");
        if (!p.emp.vigencia_poder_fecha)
          avisos.push("sin vigencia de poder — es lo que se necesita para pedir el RENCA");
        else if (vigenciaVencida(p.emp.vigencia_poder_fecha))
          avisos.push(`vigencia vencida (${fmtVence(p.emp.vigencia_poder_fecha)}) — renovarla para pedir el RENCA`);
      }
      if (p.emp.estado_sunat && p.emp.estado_sunat !== "activo")
        criticos.push(`SUNAT: ${p.emp.estado_sunat.replace(/_/g, " ")}`);
      if (p.emp.condicion_sunat === "no_habido") criticos.push("empresa no habida");
      if (!p.emp.fecha_verificacion_sunat || diasDesde(p.emp.fecha_verificacion_sunat) > 60)
        avisos.push("SUNAT sin verificar");
    }
    // Con plantilla, el que manda es el expediente; sin ella, los materiales v1
    if (p.conv?.plantilla_formulario) {
      /* Excluir los campos vinculados (cronograma/presupuesto): no se llenan en
         el expediente sino en su sección, así que nunca marcan `listo` aquí —
         contarlos dejaría el % atascado. Mismo criterio que Expediente.tsx. */
      const oblig = (p.conv.plantilla_formulario as any[])
        .flatMap((s: any) => s.campos || [])
        .filter((c: any) => !c.opcional && !/cronograma|presupuesto|financiamiento|tipo de cambio/i.test(c.etiqueta || ""));
      const exp = p.expediente || {};
      const listos = oblig.filter((c: any) => exp[c.k]?.listo).length;
      if (listos < oblig.length)
        avisos.push(`expediente ${Math.round((listos / Math.max(1, oblig.length)) * 100)}%`);
    } else {
      const llenos = Object.values(p.materiales || {}).filter(Boolean).length;
      if (llenos < 10) avisos.push(`materiales ${llenos}/10`);
    }
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

  // (El "Pulso del equipo" se movió a la página /pulso)
  /* Solo las que además NO tienen RENCA. Antes salían todas, y el bot abría
     un caso pidiendo tramitar una vigencia nueva «antes de la próxima
     postulación» — a empresas que ya podían postular. Trabajo inventado a
     partir de una regla falsa, y firmado por el bot, que es peor: nadie
     discute con el bot. */
  const vigenciasAnejas = (vigenciasTodas || [])
    .filter((x: any) => !x.renca && vigenciaVencida(x.vigencia_poder_fecha));
  /* La consulta ya excluyó las entregadas. `plazoRendicion` respeta la
     prórroga sobre el límite original — vive en lib/fondos.ts porque
     /empresas decide lo mismo y antes cada uno lo escribía a su manera. */
  const rendPronto = (rendiciones || [])
    .map((r: any) => ({ ...r, f: plazoRendicion(r) }))
    .filter((r: any) => r.f && diasHasta(r.f) <= 90)
    .sort((a: any, b: any) => (a.f < b.f ? -1 : 1));
  const totalHallazgos = (porVencer?.length || 0) + dormidos.length + (sunatMal?.length || 0)
    + personasSunatMal.length + suspCaducada.length
    + (dniPorVencer?.length || 0) + vigenciasAnejas.length + rendPronto.length;

  // Chips de resumen (solo los que tienen algo)
  const resumen = [
    { ico: "⏰", n: (porVencer || []).length, label: "vencen", color: "var(--red)" },
    { ico: "💤", n: dormidos.length, label: "dormidos", color: "var(--yellow)" },
    { ico: "🏢", n: (sunatMal || []).length, label: "SUNAT", color: "var(--red)" },
    { ico: "🏛", n: personasSunatMal.length, label: "SUNAT personas", color: "var(--red)" },
    { ico: "📄", n: suspCaducada.length, label: "susp. caducada", color: "var(--red)" },
    { ico: "🪪", n: (dniPorVencer || []).length, label: "DNI", color: "var(--yellow)" },
    { ico: "📜", n: vigenciasAnejas.length, label: "vigencias", color: "var(--yellow)" },
    { ico: "🧾", n: rendPronto.length, label: "rendiciones", color: "var(--red)" },
    { ico: "🔍", n: sunatSinVerif || 0, label: "empresas s/ verif.", color: "var(--muted)" },
    { ico: "🔍", n: sunatPersonaVieja.length, label: "personas s/ verif.", color: "var(--muted)" },
  ].filter(r => r.n > 0);
  const sinAlertas = totalHallazgos === 0 && (sunatSinVerif || 0) === 0
    && sunatPersonaVieja.length === 0;

  // ===== PANELES =====
  const panelAlertas = (
    <div>
      {sinAlertas && (
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
            /* Aquí el color estaba INVERTIDO respecto a todo el sistema:
               `d <= 2` pintaba AMARILLO cuando el feed lo pinta ROJO. O sea
               que el panel del bot que vigila los vencimientos era el que
               peor los pintaba: marcaba tranquilo lo que el feed gritaba. */
            const pl = plazoDe(p.fecha_limite, p.estado);
            if (!pl) return null;
            return (
              <div className="info-row" key={p.id}>
                <Link href={`/caso/${p.id}`} style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{p.titulo} →</Link>
                {(p.resp as any)?.nombre && <span style={{ color: "var(--teal)", fontSize: 12 }}>{(p.resp as any).nombre.split(" ")[0]}</span>}
                <span style={{ color: pl.color, fontSize: 12, fontWeight: 700 }}>
                  {pl.vencido ? `vencido hace ${-pl.d}d` : pl.d === 0 ? "HOY" : `en ${pl.d}d`}
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
                {textoSunat(x)}
              </span>
              <span style={{ flex: 1 }} />
              <BotonCasoUrgente
                titulo={`⚠ SUNAT: ${x.nombre} en ${textoSunat(x)}`}
                cuerpo={`Hallazgo de Bot Qhaway: la empresa ${x.nombre} figura en SUNAT como «${textoSunat(x)}». Regularizar antes de postular, facturar o rendir con esta empresa.`}
                entTipo="empresa" entId={x.id} />
            </div>
          ))}
        </div>
      )}
      {personasSunatMal.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(255,77,94,.35)" }}>
          <div className="panel-h" style={{ color: "var(--red)" }}>🏛 Personas con problema SUNAT — no pueden girar RHE</div>
          {personasSunatMal.map((p: any) => (
            <div className="info-row" key={p.id}>
              <Link href={`/entidad/persona/${p.id}`} style={{ fontWeight: 600 }}>
                {p.alias || p.nombre} →
              </Link>
              <span style={{ color: "var(--red)", fontSize: 12, fontWeight: 700 }}>{textoSunat(p)}</span>
              <span style={{ flex: 1 }} />
              <BotonCasoUrgente
                titulo={`⚠ SUNAT: ${p.nombre} en ${textoSunat(p)}`}
                cuerpo={`Hallazgo de Bot Qhaway: ${p.nombre} figura en SUNAT como «${textoSunat(p)}». En ese estado no puede emitir recibos por honorarios. Regularizar antes de girarle un RHE o incluirlo en una carpeta de postulación.`}
                entTipo="persona" entId={p.id} />
            </div>
          ))}
        </div>
      )}
      {suspCaducada.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(255,77,94,.35)" }}>
          <div className="panel-h" style={{ color: "var(--red)" }}>
            📄 Suspensiones de 4ta caducadas — volver a tramitar
          </div>
          {suspCaducada.map((p: any) => (
            <div className="info-row" key={p.id}>
              <Link href={`/entidad/persona/${p.id}`} style={{ fontWeight: 600 }}>
                {p.alias || p.nombre} →
              </Link>
              <span style={{ color: "var(--red)", fontSize: 12, fontWeight: 700 }}>
                suspensión {p.suspension_4ta_anio} · venció el 31 dic
              </span>
              <span style={{ flex: 1 }} />
              <BotonCasoUrgente
                titulo={`📄 Suspensión 4ta ${new Date().getFullYear()}: ${p.nombre}`}
                cuerpo={`La suspensión de renta de 4ta de ${p.nombre} es del año ${p.suspension_4ta_anio} y caducó el 31 de diciembre. Sin renovarla, cada RHE que gire sobre el mínimo mensual sufre retención del 8%. Tramitar en SUNAT y cargar la constancia en su ficha.`}
                entTipo="persona" entId={p.id} />
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
                  cuerpo={`Hallazgo de Bot Qhaway: el DNI de ${p.nombre} ${d < 0 ? `venció hace ${-d} días` : `vence en ${d} días`}. Un DNI vencido invalida postulaciones, contratos y giros de RHE.`}
                  entTipo="persona" entId={p.id} />
              </div>
            );
          })}
        </div>
      )}
      {vigenciasAnejas.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(244,180,0,.3)" }}>
          <div className="panel-h" style={{ color: "var(--yellow)" }}>
            📜 Sin RENCA y con la vigencia vencida — no pueden ni pedirlo
          </div>
          {vigenciasAnejas.map((x: any) => (
            <div className="info-row" key={x.id}>
              <Link href={`/entidad/empresa/${x.id}`} style={{ fontWeight: 600 }}>
                {x.codigo ? `${x.codigo} · ` : ""}{x.nombre} →
              </Link>
              <span style={{ color: "var(--yellow)", fontSize: 12 }}>venció el {fmtVence(x.vigencia_poder_fecha)}</span>
              <span style={{ flex: 1 }} />
              <BotonCasoUrgente
                titulo={`📜 Renovar vigencia de poder de ${x.nombre}`}
                cuerpo={`Hallazgo de Bot Qhaway: ${x.nombre} no tiene RENCA, y su vigencia de poder venció el ${fmtVence(x.vigencia_poder_fecha)} (se emitió el ${x.vigencia_poder_fecha} y vale 90 días).\n\nSon dos trámites en fila: la vigencia se saca en SUNARP y con ella se pide el RENCA. Sin RENCA la empresa no puede postular a ningún fondo.`}
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
                  cuerpo={`Hallazgo de Bot Qhaway: la rendición de ${r.proy?.nombre} (${r.conv?.codigo || ""}) vence ${d < 0 ? `hace ${-d} días — URGENTE` : `en ${d} días`}. Reunir informe económico al 100%, comprobantes y presupuesto actualizado.`}
                  entTipo="postulacion" entId={r.id} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const panelPost = semaforo.length > 0 ? (
    <div className="card" style={{ borderColor: "rgba(167,139,250,.35)" }}>
      <div className="panel-h" style={{ color: "var(--violet)" }}>🚦 Semáforo pre-postulación — ¿listos para enviar?</div>
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
  ) : (
    <div className="empty">No hay postulaciones en preparación o enviadas.</div>
  );

  const panelHigiene = higieneTotal > 0 ? (
    <div className="card">
      <div className="panel-h">🧹 {higieneTotal} fichas incompletas</div>
      <TabsPanel
        labels={higieneGrupos.map(g => `${g.titulo} · ${g.total ?? g.items.length}`)}
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
  ) : (
    <div className="empty">Todas las fichas completas — datos impecables. ✨</div>
  );

  return (
    <div className="shell shell-ancho">
      <div className="topbar">
        <Volver />
        {/* El diario es de Qhaway: él escribe la mayor parte de esa bitácora */}
        <Link href="/historial" className="btn btn-ghost"
          title="El diario: todo lo que pasó en el sistema, con filtros">🕐 El diario</Link>
        <Link href="/importar" className="btn btn-ghost" title="Importar desde Seatable">⬆ Importar</Link>
        <Link href="/wiki" className="btn btn-ghost" title="Wiki: los flujos de trabajo">📖 Wiki</Link>
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          🤖 miembro no humano
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#7c5cff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 27 }}>🤖</span>
        <h1 className="title-lg" style={{ flex: 1, margin: 0 }}>Bot Qhaway</h1>
      </div>

      <div className="perfil-grid">
        {/* ===== Carné compacto ===== */}
        <aside>
          <div className="card">
            <div className="ficha-row"><span className="fk">Ronda diaria</span><span className="fv">7:30 a.m. 🌄</span></div>
            <div className="ficha-row"><span className="fk">Apuntes hoy</span><span className="fv">{hoyCount || 0}</span></div>
            <div className="ficha-row"><span className="fk">Apuntes en total</span><span className="fv" style={{ color: "var(--blue)", fontWeight: 800 }}>{total || 0}</span></div>
            <details style={{ marginTop: 4 }}>
              <summary style={{ color: "var(--muted)", fontSize: 12, cursor: "pointer", padding: "4px 0" }}>Ver bio y reglas de servicio</summary>
              <div style={{ marginTop: 4 }}>
                <div className="ficha-row"><span className="fk">Nombre corto</span><span className="fv" style={{ color: "var(--violet)", fontWeight: 800 }}>BQ</span></div>
                <div className="ficha-row"><span className="fk">Significado</span><span className="fv">«Qhaway»: mirar, observar, cuidar (quechua)</span></div>
                <div className="ficha-row"><span className="fk">Rol</span><span className="fv">Vigilante del equipo Kawsay</span></div>
                <div className="ficha-row"><span className="fk">En servicio desde</span><span className="fv">{nacimiento}</span></div>
                <div className="ficha-row"><span className="fk">Canales</span><span className="fv">Feed · Google Chat · 🔔</span></div>
                <div className="ficha-row"><span className="fk">Sueldo</span><span className="fv">S/ 0.00 (voluntario) 😄</span></div>
                <ul style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.8, paddingLeft: 18, marginTop: 10 }}>
                  <li>Despierto los casos sin actividad por 3 días — insisto, no ametrallo.</li>
                  <li>Vigilo vencimientos: 7 días antes, 2 antes, el día D, y no suelto lo vencido.</li>
                  <li>Canto las alertas SUNAT hasta que se resuelvan.</li>
                  <li>Todo lo que hago queda en la bitácora.</li>
                  <li>Propongo, nunca dispongo: jamás cierro ni borro por mi cuenta.</li>
                </ul>
              </div>
            </details>
          </div>

          {/* ===== Resumen informativo (debajo del carné) ===== */}
          {resumen.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="panel-h" style={{ marginBottom: 10 }}>
                👁 Lo que veo ahora · {totalHallazgos} hallazgo{totalHallazgos === 1 ? "" : "s"}
              </div>
              <div className="qh-resumen">
                {resumen.map((r, i) => (
                  <span key={i} className="qh-chip">
                    <span style={{ fontSize: 14 }}>{r.ico}</span>
                    <b style={{ color: r.color }}>{r.n}</b>
                    <span className="qh-chip-l">{r.label}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ===== Rondas de mantenimiento ===== */}
          <div className="panel-h" style={{ margin: "18px 0 8px" }}>🔁 Rondas de mantenimiento</div>
          {(sunatSinVerif || 0) > 0 && (
            <div className="card">
              <div className="info-row" style={{ borderBottom: "none", padding: "2px 0", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5 }}>🔍 <b>{sunatSinVerif}</b> empresas sin verificar en SUNAT (60+ días)</span>
                <span style={{ flex: 1 }} />
                <Link href="/empresas" className="btn btn-ghost" style={{ fontSize: 11.5, padding: "4px 11px" }}>
                  🔄 Correr ronda SUNAT →
                </Link>
              </div>
            </div>
          )}
          {/* En empresas basta el número: un botón las verifica todas. Aquí no
              hay ronda automática, así que el número solo no serviría —hay que
              entrar ficha por ficha— y para eso necesitas los nombres. */}
          {sunatPersonaVieja.length > 0 && (
            <div className="card">
              <div style={{ fontSize: 12.5, marginBottom: 7 }}>
                🔍 <b>{sunatPersonaVieja.length}</b> persona{sunatPersonaVieja.length > 1 ? "s" : ""} sin
                verificar en SUNAT (60+ días)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {sunatPersonaVieja.slice(0, 8).map((p: any) => (
                  <Link key={p.id} href={`/entidad/persona/${p.id}`}
                    style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 11.5 }}>
                    <span style={{ color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.alias || p.nombre}
                    </span>
                    <span style={{ color: "var(--dim)", fontSize: 10, whiteSpace: "nowrap" }}>
                      {p.fecha_verificacion_sunat ? `hace ${diasDesde(p.fecha_verificacion_sunat)}d` : "nunca"}
                    </span>
                  </Link>
                ))}
                {sunatPersonaVieja.length > 8 && (
                  <span style={{ color: "var(--dim)", fontSize: 10.5, marginTop: 2 }}>
                    +{sunatPersonaVieja.length - 8} más
                  </span>
                )}
              </div>
            </div>
          )}
          <RondaLinks />
        </aside>

        {/* ===== Pestañas ===== */}
        <main>
          <TabsPanel
            labels={[
              `🔥 Alertas${totalHallazgos ? ` · ${totalHallazgos}` : ""}`,
              `🚦 Postulaciones${semaforo.length ? ` · ${semaforo.length}` : ""}`,
              `🧹 Higiene${higieneTotal ? ` · ${higieneTotal}` : ""}`,
            ]}
            paneles={[panelAlertas, panelPost, panelHigiene]}
          />

          <details style={{ marginTop: 16 }} open={!!searchParams?.bit} id="bitacora">
            <summary style={{ color: "var(--muted)", fontSize: 13, cursor: "pointer", padding: "6px 0" }}>
              🕐 Mi bitácora · {rango.label.toLowerCase()} · {(eventos || []).length} intervención{(eventos || []).length === 1 ? "" : "es"}
            </summary>
            <div className="qh-rangos">
              {RANGOS.map(r => (
                <Link key={r.k} href={`/qhaway?bit=${r.k}#bitacora`}
                  className={`qh-rango${r.k === rango.k ? " on" : ""}`}>
                  {r.label}
                </Link>
              ))}
            </div>
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
              {!(eventos || []).length && <div className="empty">Sin intervenciones en este periodo.</div>}
            </div>
          </details>
        </main>
      </div>
    </div>
  );
}
