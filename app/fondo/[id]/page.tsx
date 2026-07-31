import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Realtime from "@/components/Realtime";
import Plegable from "@/components/Plegable";
import TabsPanel from "@/components/TabsPanel";
import CronogramaPostulacion from "@/components/CronogramaPostulacion";
import Presupuesto from "@/components/Presupuesto";
import RendicionFondo from "@/components/RendicionFondo";
import MovimientosBanco from "@/components/MovimientosBanco";
import ConciliacionFondo from "@/components/ConciliacionFondo";
import AuditoriaFondo from "@/components/AuditoriaFondo";
import VersionesFondo from "@/components/VersionesFondo";
import { etapasDe, nombreEtapa } from "@/lib/etapas";
import { rubrosDe, nombreRubro } from "@/lib/rubros";
import { plazoRendicion, rendicionVencida } from "@/lib/fondos";

/* ── LA EJECUCIÓN DEL FONDO — la segunda vida de un proyecto ──
 *
 * Un proyecto tiene tres vidas: postularse, ejecutarse, distribuirse. La
 * página de Postulación es la primera —el expediente de cómo se pidió el
 * fondo—, y una vez ganado se vuelve un registro que ya no cambia. La
 * ejecución es otra cosa entera: dos años de presupuesto real, contratos,
 * rodajes, rendiciones e informes. Meterla en la misma página que el
 * expediente sería amontonar una promesa congelada con la vida real que vino
 * después.
 *
 * Por eso vive aparte, pero SIN una entidad nueva: el fondo ES la postulación
 * que ganó (misma acta, mismo presupuesto, mismo plazo), así que esta página
 * usa el MISMO id. Cero migración, cero doble verdad.
 *
 * Se organiza por las dos naturalezas del trabajo: FINANCIERA (la plata que
 * hay que rendir) y AUDIOVISUAL (la obra que hay que entregar). Más los
 * entregables del acta. La distribución —la tercera vida— vendrá después.
 */

async function cargarFondo(id: string) {
  const supabase = createClient();
  const { data } = await supabase.from("postulaciones")
    .select("*, proy:proyectos(id,nombre,tipo), emp:empresas(id,nombre), " +
      "conv:convocatorias(id,nombre,anio,categoria,monto_adjudicado)")
    .eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const f: any = await cargarFondo(params.id);
  if (!f) return { title: "🎬 Fondo" };
  const t = [f.codigo, f.proy?.nombre, f.conv?.anio].filter(Boolean).join(" · ");
  return { title: `🎬 ${t || "Fondo"}` };
}

const fmt = (n: number) => "S/ " + Number(n || 0).toLocaleString("es-PE");
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const masDosAnios = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${+m[1] + 2}-${m[2]}-${m[3]}` : null;
};

export default async function FondoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const ent: any = await cargarFondo(params.id);
  if (!ent) notFound();

  /* Esta página es SOLO para fondos ganados. Una postulación que aún está en
     juego no tiene ejecución que mostrar: se la manda a su expediente, que es
     donde vive su trabajo. */
  if (ent.estado !== "ganadora") {
    redirect(`/entidad/postulacion/${params.id}`);
  }

  const { data: perfilActual } = await supabase.from("perfiles")
    .select("es_admin").eq("id", user.id).maybeSingle();
  const esAdmin = !!perfilActual?.es_admin;

  const categoria = ent.conv?.categoria || null;

  const [cp, pl, pf, plPre, pc, ec, rf, mb, au, vf, eqp] = await Promise.all([
    supabase.from("cronograma_actividades").select("*, resp:perfiles(nombre)")
      .eq("postulacion_id", params.id)
      .order("etapa").order("orden").order("fecha_inicio").order("creado_en"),
    supabase.from("plantillas_cronograma")
      .select("id,nombre,tipo_proyecto,acts:plantilla_actividades(count)").order("nombre"),
    supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre"),
    supabase.from("plantillas_presupuesto").select("id,nombre,categoria,items").order("nombre"),
    supabase.from("personas").select("id,nombre,alias").order("nombre"),
    supabase.from("estado_cuenta")
      .select("id,periodo,url,saldo,intereses,nota,imagenes,creado_en,comprobante_en," +
        "creado:perfiles!creado_por(nombre),quien:perfiles!comprobante_por(nombre)")
      .eq("postulacion_id", params.id).order("periodo"),
    supabase.from("rhe")
      .select("id,persona_id,fecha,monto,numero,url,etapa,rubro_item,concepto,persona:personas(nombre,alias)")
      .eq("postulacion_id", params.id).order("fecha", { ascending: false }),
    supabase.from("movimiento_banco")
      .select("id,fecha,glosa,medio,tipo,monto,saldo,categoria,nota")
      .eq("postulacion_id", params.id).order("fecha").order("creado_en"),
    /* La bitácora inmutable de este fondo. Filtra por el postulacion_id que
       vive dentro del JSON (antes/después), así también captura los borrados. */
    supabase.from("auditoria_financiera")
      .select("id,tabla,fila_id,accion,creado_en,campos,antes,despues,actor_id")
      .or(`antes->>postulacion_id.eq.${params.id},despues->>postulacion_id.eq.${params.id}`)
      .order("creado_en", { ascending: false }).limit(80),
    supabase.from("version_fondo")
      .select("id,tipo,etiqueta,motivo,vigente,creado_en,datos,creado:perfiles!creado_por(nombre)")
      .eq("postulacion_id", params.id).order("creado_en", { ascending: false }),
    /* El equipo que se presentó: es la nómina del cronograma de esta
       postulación, aquí igual que en la ficha. Sin esto, la misma actividad
       ofrecería responsables distintos según por qué pantalla se entre. */
    supabase.from("postulacion_equipo")
      .select("cargo,persona:personas(id,nombre,alias,foto_url)")
      .eq("postulacion_id", params.id),
  ]);

  /* Responsable de actividad de postulación = persona del equipo
     (`responsable_persona`), no cuenta del sistema. Se normaliza a
     `responsable` al leer — ver db/crono-responsable-persona.sql. */
  const cronoPost = (cp.data || []).map((a: any) => ({ ...a, responsable: a.responsable_persona || null }));
  const perfilesCat = pf.data || [];
  const cargosF = new Map<string, string[]>();
  const nombresF = new Map<string, string>();
  const fotosF = new Map<string, string | null>();
  for (const m of (eqp.data || []) as any[]) {
    const p = m?.persona; if (!p?.id) continue;
    nombresF.set(p.id, p.alias || p.nombre || "—");
    fotosF.set(p.id, p.foto_url || null);
    cargosF.set(p.id, [...(cargosF.get(p.id) || []), m.cargo].filter(Boolean));
  }
  const plantelPost = [...nombresF].map(([id, n]) => ({
    id, nombre: (cargosF.get(id) || []).length ? `${n} · ${(cargosF.get(id) || []).join(" / ")}` : n,
    foto: fotosF.get(id) || null,
  }));
  const plantillas = (pl.data || []).map((x: any) => ({
    id: x.id, nombre: x.nombre, tipo_proyecto: x.tipo_proyecto, n: x.acts?.[0]?.count ?? 0,
  }));
  const plantillasPre = plPre.data || [];
  const personasCat = (pc.data || []).map((p: any) => ({ id: p.id, nombre: p.alias || p.nombre }));
  const estadosFondo: any[] = (ec.data as any) || [];
  const movBanco = mb.data || [];
  const rheFondo = (rf.data || []).map((r: any) => ({
    ...r, persona: r.persona?.alias || r.persona?.nombre || "—",
  }));
  const totComision = movBanco.filter((m: any) => m.categoria === "comision").reduce((s: number, m: any) => s + Number(m.monto || 0), 0);

  // Bitácora del fondo con el actor ya resuelto a nombre (perfilesCat).
  const nombrePerfil = (id: string | null) =>
    !id ? "sistema" : (perfilesCat.find((p: any) => p.id === id)?.nombre || "—");
  const auditoria = ((au?.data as any[]) || []).map((a: any) => ({ ...a, actor: nombrePerfil(a.actor_id) }));

  // Versiones del fondo (presupuesto · cronograma) con su autor resuelto.
  const versiones = ((vf?.data as any[]) || []).map((v: any) => ({ ...v, autor: v.creado?.nombre || null }));
  const versPresu = versiones.filter((v: any) => v.tipo === "presupuesto");
  const versCrono = versiones.filter((v: any) => v.tipo === "cronograma");
  const vigPresu = versPresu.find((v: any) => v.vigente) || null;
  const vigCrono = versCrono.find((v: any) => v.vigente) || null;

  // Datos de la rendición (ejes de cada gasto). El eje «etapa» = las etapas
  // DISTINTAS del cronograma del fondo (Pre / Prod / Post), en el orden del
  // preset de la categoría.
  const ordenEtapa = etapasDe(categoria).map((e: any) => e.clave);
  const etapasFondo = Array.from(new Set(cronoPost.filter((a: any) => a.estado !== "cancelada").map((a: any) => a.etapa).filter(Boolean)))
    .sort((a: any, b: any) => ordenEtapa.indexOf(a) - ordenEtapa.indexOf(b))
    .map((clave: any) => ({ id: clave, nombre: nombreEtapa(clave) }));
  /* Los rubros del fondo: si el presupuesto ya tiene ítems, se usan SUS rubros
     (los reales, resueltos a nombre), y si no, el catálogo de la categoría. Así
     no dependemos de que el nombre de la categoría calce exactamente con el
     catálogo — el presupuesto real manda. */
  const preItemsRaw = (((ent.presupuesto as any)?.items) || []) as any[];
  const rubrosDeItems = Array.from(new Set(preItemsRaw.map((i: any) => i.rubro).filter(Boolean)));
  const rubrosFondo = rubrosDeItems.length
    ? rubrosDeItems.map((clave: any) => ({ clave, nombre: nombreRubro(clave) }))
    : rubrosDe(categoria);
  const fondoRubros = rubrosFondo.map((r: any) => ({ id: r.clave, etiqueta: r.nombre }));

  // Estado de la ejecución, en una línea.
  const plazo = plazoRendicion(ent);
  const vencida = rendicionVencida(ent);
  const estadoEjec = ent.fecha_rendicion_real
    ? { ico: "✅", txt: "Rendido", col: "var(--green)" }
    : vencida
      ? { ico: "🔴", txt: `Debe rendición — venció ${dmy(plazo)}`, col: "var(--red)" }
      : { ico: "🎬", txt: plazo ? `En ejecución — rinde ${dmy(plazo)}` : "En ejecución", col: "var(--teal)" };

  const titulo = [ent.codigo, ent.proy?.nombre, ent.conv?.anio].filter(Boolean).join(" · ");
  const dim = (t: string) => <span style={{ color: "var(--dim)", fontWeight: 400 }}>{t}</span>;

  const totRhe = rheFondo.reduce((s: number, r: any) => s + Number(r.monto || 0), 0);
  const totInt = estadosFondo.reduce((s: number, e: any) => s + Number(e.intereses || 0), 0);
  const preItems = ((ent.presupuesto as any)?.items || []) as any[];
  const preCosto = preItems.reduce((s, i) => s + (i.cantidad || 0) * (i.costo_unit || 0), 0);
  // Conciliación: el presupuesto VIGENTE es la referencia (si no hay versión
  // vigente aún, se cae al presupuesto vivo). Costo vigente y % ejecutado (RHE).
  const vigItems = (((vigPresu?.datos as any)?.items) || preItems) as any[];
  const vigCosto = vigItems.reduce((s: number, i: any) => s + (i.cantidad || 0) * (i.costo_unit || 0), 0);
  const conPct = vigCosto ? Math.round((totRhe / vigCosto) * 100) : 0;

  return (
    <div className="shell" style={{ maxWidth: "min(1200px, 96vw)" }}>
      <Realtime tablas={["cronograma_actividades", "rhe", "estado_cuenta", "movimiento_banco", "auditoria_financiera", "version_fondo", "postulaciones"]}
        token={session?.access_token} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>🎬 EJECUCIÓN DEL FONDO</span>
      </div>

      {/* ── Cabecera del fondo ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0 2px" }}>
        <h1 className="title-lg" style={{ margin: 0 }}>🎬 {titulo}</h1>
        <Link href={`/entidad/postulacion/${params.id}`} className="btn btn-ghost"
          style={{ fontSize: 12, padding: "6px 12px" }}>📄 Ver expediente de postulación →</Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span className="badge" style={{ color: estadoEjec.col, background: "rgba(255,255,255,.05)", fontWeight: 700 }}>
            {estadoEjec.ico} {estadoEjec.txt}
          </span>
          {ent.emp?.nombre && <span style={{ color: "var(--dim)", fontSize: 12 }}>🏢 {ent.emp.nombre}</span>}
          {ent.conv?.nombre && <span style={{ color: "var(--dim)", fontSize: 12 }}>📜 {ent.conv.nombre}</span>}
        </div>
        <div className="fondo-cab">
          <Celda k="Estímulo" v={ent.monto_adjudicado ? fmt(parseFloat(ent.monto_adjudicado)) : "—"} destacado />
          <Celda k="Acta firmada" v={dmy(ent.fecha_firma_acta)} />
          <Celda k="Desembolso" v={ent.fecha_desembolso ? dmy(ent.fecha_desembolso) : "⚠ falta"}
            alerta={!ent.fecha_desembolso} />
          <Celda k="Plazo (2 años)" v={ent.fecha_desembolso ? dmy(masDosAnios(ent.fecha_desembolso)) : "—"} />
          <Celda k="Rinde" v={dmy(plazo)} />
        </div>
        {!ent.fecha_desembolso && (
          <p style={{ color: "var(--yellow)", fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.5 }}>
            ⚠ Falta la fecha de desembolso — el plazo de 2 años se cuenta desde que el dinero llega a la
            cuenta, no desde la firma del acta. Se edita en el expediente de postulación.
          </p>
        )}
      </div>

      {/* Las tres naturalezas del fondo, en pestañas: cada una va a crecer con
          su propia información, y apiladas se volverían un scroll interminable.
          Arranca en Financiera —el dinero es lo que tiene reloj—. */}
      <TabsPanel
        labels={["💰 Financiera", "🎥 Audiovisual", "📦 Entregables"]}
        paneles={[
          <div key="fin">
            <p className="fondo-nat-sub">La plata que hay que rendir a DAFO: presupuesto real, banco, pagos y rendiciones.</p>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:presu`} titulo="🧮 Presupuesto (ejecución)" abiertoPorDefecto={false}
                resumen={dim(preItems.length ? `costo ${fmt(preCosto)} · ${preItems.length} ítems${versPresu.length ? ` · ${versPresu.length} versión(es)` : ""}` : "sin ítems")}>
                <Presupuesto key={`pre-${params.id}`} postulacionId={params.id}
                  rubros={rubrosFondo} categoria={categoria}
                  inicial={ent.presupuesto || null} plantillas={plantillasPre}
                  postulado={vigPresu?.datos || null}
                  postuladoEn={vigPresu?.creado_en || null} ocultarFijar
                  estimuloConcurso={ent.conv?.monto_adjudicado ? parseFloat(ent.conv.monto_adjudicado) : null} />
                <Plegable nivel={2} id={`fondo:${params.id}:presu:versiones`} titulo="🕑 Historial de versiones"
                  abiertoPorDefecto={false}
                  resumen={dim(versPresu.length ? `${versPresu.length} versión(es)` : "sin versiones")}>
                  <VersionesFondo postulacionId={params.id} tipo="presupuesto" esAdmin={esAdmin} versiones={versPresu} />
                </Plegable>
              </Plegable>
            </div>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:movbanco`} titulo="🏦 Movimientos del banco" abiertoPorDefecto={false}
                resumen={dim(movBanco.length ? `${movBanco.length} movimientos · comisiones ${fmt(totComision)}` : "sin movimientos")}>
                <MovimientosBanco postulacionId={params.id} esAdmin={esAdmin} movimientos={movBanco} />
              </Plegable>
            </div>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:rendicion`} titulo="🧾 Rendición del fondo" abiertoPorDefecto={true}
                resumen={dim(`${rheFondo.length} RHE · ${fmt(totRhe)} · ${estadosFondo.length} estado(s)${totInt ? ` · interés ${fmt(totInt)}` : ""}`)}>
                <RendicionFondo postulacionId={params.id} esAdmin={esAdmin}
                  fechaDesembolso={ent.fecha_desembolso || null}
                  montoAdjudicado={ent.monto_adjudicado ? parseFloat(ent.monto_adjudicado) : null}
                  estados={estadosFondo} rhe={rheFondo}
                  empresa={ent.emp?.nombre || null}
                  etapas={etapasFondo} rubros={fondoRubros} personas={personasCat} />
              </Plegable>
            </div>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:concilia`} titulo="⚖️ Conciliación (ejecutado vs. presupuesto)" abiertoPorDefecto={false}
                resumen={dim(vigItems.length ? `${fmt(totRhe)} de ${fmt(vigCosto)} · ${conPct}%${vigPresu ? "" : " · sin versión vigente"}` : "sin presupuesto")}>
                <ConciliacionFondo items={vigItems} esVigente={!!vigPresu}
                  postuladoEn={vigPresu?.creado_en || null}
                  rhe={rheFondo} etapas={etapasFondo}
                  estimulo={ent.monto_adjudicado ? parseFloat(ent.monto_adjudicado) : null} />
              </Plegable>
            </div>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:auditoria`} titulo="🔍 Auditoría" abiertoPorDefecto={false}
                resumen={dim(auditoria.length ? `${auditoria.length} cambio(s) registrado(s)` : "sin cambios")}>
                <AuditoriaFondo filas={auditoria} />
              </Plegable>
            </div>
          </div>,

          <div key="av">
            <p className="fondo-nat-sub">La obra que hay que entregar: el rodaje de dos años y su registro.</p>
            <div style={{ scrollMarginTop: 12 }}>
              <Plegable id={`fondo:${params.id}:crono`} titulo="📅 Cronograma (2 años)" abiertoPorDefecto={true}
                resumen={dim(cronoPost.filter((a: any) => a.estado !== "cancelada").length
                  ? `${cronoPost.filter((a: any) => a.estado !== "cancelada").length} actividades` : "sin actividades")}>
                <CronogramaPostulacion key={`crono-${params.id}`} postulacionId={params.id}
                  actividades={cronoPost} perfiles={plantelPost}
                  plantillas={plantillas} tipoProyecto={ent.proy?.tipo || ""}
                  etapas={etapasDe(categoria)}
                  postulado={vigCrono?.datos || null}
                  postuladoEn={vigCrono?.creado_en || null} ocultarFijar />
                <Plegable nivel={2} id={`fondo:${params.id}:crono:versiones`} titulo="🕑 Historial de versiones"
                  abiertoPorDefecto={false}
                  resumen={dim(versCrono.length ? `${versCrono.length} versión(es)` : "sin versiones")}>
                  <VersionesFondo postulacionId={params.id} tipo="cronograma" esAdmin={esAdmin} versiones={versCrono} />
                </Plegable>
              </Plegable>
            </div>
            {/* Lo que el plan tiene mapeado pero aún no se construye: se anuncia
                para que se sepa dónde va a vivir, no para simular que ya está. */}
            <div className="fondo-pronto">
              <Pronto ico="📝" t="Contratos oficiales" d="Los contratos de personal de la ejecución (distintos de los precontratos de la postulación)." />
              <Pronto ico="©️" t="Derechos de autor" d="Cesiones y licencias de la obra y su material." />
              <Pronto ico="🎞️" t="Material de archivo (producción)" d="El registro que se genera durante el rodaje." />
              <Pronto ico="📖" t="Informes de ejecución" d="El informe narrativo por etapa — lo alimentan los casos del proyecto." />
            </div>
          </div>,

          <div key="ent">
            <p className="fondo-nat-sub">Lo que el acta obliga a entregar (5.3.1–5.3.8): catálogo + extras.</p>
            <div className="card" style={{ color: "var(--dim)", fontSize: 12.5 }}>
              Próximamente — el catálogo de entregables por categoría, con su estado y fecha, según el acta.
            </div>
          </div>,
        ]}
      />
    </div>
  );
}

function Celda({ k, v, destacado, alerta }: { k: string; v: string; destacado?: boolean; alerta?: boolean }) {
  return (
    <div className="fondo-celda">
      <span className="fondo-celda-k">{k}</span>
      <span className="fondo-celda-v" style={{
        color: alerta ? "var(--yellow)" : destacado ? "var(--teal)" : "var(--text)",
        fontWeight: destacado ? 700 : 600,
      }}>{v}</span>
    </div>
  );
}

function Pronto({ ico, t, d }: { ico: string; t: string; d: string }) {
  return (
    <div className="card fondo-pronto-card">
      <div style={{ fontWeight: 700, fontSize: 12.5 }}>{ico} {t} <span className="badge" style={{ marginLeft: 4, color: "var(--dim)", background: "rgba(255,255,255,.05)" }}>pronto</span></div>
      <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>{d}</div>
    </div>
  );
}
