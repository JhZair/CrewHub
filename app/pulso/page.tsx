import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Link from "next/link";
import { redirect } from "next/navigation";
import { claseEstado, textoEstado } from "@/lib/estados";
import { icoTipo, rotuloMonton } from "@/lib/tipos";
import { BOT } from "@/lib/personas";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "📊 Pulso del equipo" };

/* ── PULSO ──────────────────────────────────────────────────────────
   El ritmo del equipo mes a mes, semana por semana. Detrás está
   Bot Qhaway: él vigila la bitácora (tabla `actividad`) y aquí su
   vigilancia se vuelve una lectura visual — quién cerró qué, cuándo,
   qué se abrió, qué queda pendiente. Cada número es clickeable: abre
   la lista exacta de casos detrás de esa cifra.
   Para coordinar y repartir la carga, no para auditar a nadie. */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/* (El mapa de tipos y los rótulos de la gráfica salieron a lib/tipos. Los
   rótulos, porque /jornadas tiene LA MISMA gráfica y había tomado la misma
   decisión por su cuenta, con su propio mapa. Ver `rotuloMonton`.) */
/* (El mapa de estados salió de aquí: era otra copia de lib/estados y no sabía
   que un aviso no se resuelve. Se importa.) */
const KIND_LBL: Record<string, string> = {
  cerr: "cerrados", creo: "abiertos", avanzo: "movidos a En Progreso",
  ab: "abiertos ahora", venc: "vencidos ahora",
};

// Semana del mes con corte en LUNES (0-indexada) para una fecha dada.
function semanaDelMes(fecha: Date, primerDia: Date): number {
  const diff = Math.floor((fecha.getTime() - primerDia.getTime()) / 86400000);
  const offsetLunes = (primerDia.getDay() + 6) % 7; // 0 si el día 1 es lunes
  return Math.floor((diff + offsetLunes) / 7);
}

type Celda = { cerr: number; creo: number; avanzo: number };

export default async function PulsoPage({ searchParams }: {
  searchParams: { m?: string; d?: string; k?: string; w?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Offset de mes: 0 = mes actual, -1 = anterior…
  const off = parseInt(searchParams?.m || "0", 10) || 0;
  // Drill-down: persona (d), tipo de cifra (k), alcance (w = semana | mes | now)
  const dPerson = searchParams?.d || "";
  const dKind = searchParams?.k || "";
  const dW = searchParams?.w || "";

  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth() + off, 1);
  const anio = base.getFullYear();
  const mes = base.getMonth();
  const inicioMes = new Date(anio, mes, 1);
  const finMes = new Date(anio, mes + 1, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();

  const pad = (n: number) => String(n).padStart(2, "0");
  const hoyStr = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;

  // Equipo (Qhaway fuera: él reparte, no carga casos)
  const { data: equipo } = await supabase.from("perfiles")
    .select("id,nombre").eq("activo", true).neq("nombre", BOT).order("nombre");

  // Bitácora del mes sobre publicaciones
  const { data: eventos } = await supabase.from("actividad")
    .select("actor_id,entidad_id,tipo,detalle,creado_en")
    .eq("entidad_tipo", "publicacion")
    .gte("creado_en", inicioMes.toISOString())
    .lt("creado_en", finMes.toISOString())
    .limit(6000);

  // Rango de días que abarca cada semana dentro del mes (para etiquetas)
  const semRango: { ini: number; fin: number }[] = [];
  for (let d = 1; d <= diasEnMes; d++) {
    const wi = semanaDelMes(new Date(anio, mes, d), inicioMes);
    if (!semRango[wi]) semRango[wi] = { ini: d, fin: d };
    else semRango[wi].fin = d;
  }
  const nSemanas = semRango.length;
  const nuevo = (): Celda[] =>
    Array.from({ length: nSemanas }, () => ({ cerr: 0, creo: 0, avanzo: 0 }));

  // Agregación persona × semana + ids de casos cerrados (para desglose por tipo)
  const matriz: Record<string, Celda[]> = {};
  const cerradosIds: string[] = [];
  for (const ev of eventos || []) {
    const a = ev.actor_id;
    const wi = semanaDelMes(new Date(ev.creado_en), inicioMes);
    if (wi < 0 || wi >= nSemanas) continue;
    const det: any = ev.detalle || {};
    const esCierre = ev.tipo === "estado" && det.campo === "estado" && det.a === "resuelta";
    if (esCierre && ev.entidad_id) cerradosIds.push(ev.entidad_id);
    if (!a) continue; // eventos automáticos del bot: no son trabajo de una persona
    if (!matriz[a]) matriz[a] = nuevo();
    const c = matriz[a][wi];
    if (ev.tipo === "creado") c.creo++;
    else if (ev.tipo === "estado" && det.campo === "estado") {
      if (det.a === "resuelta") c.cerr++;
      else if (det.a === "en_progreso") c.avanzo++;
    }
  }

  // Desglose por tipo de lo cerrado este mes
  const tipoCerr: Record<string, number> = {};
  if (cerradosIds.length) {
    const { data: tp } = await supabase.from("publicaciones")
      .select("id,tipo").in("id", Array.from(new Set(cerradosIds)));
    const tipoDe = new Map((tp || []).map((r: any) => [r.id, r.tipo]));
    for (const id of cerradosIds) {
      const t = tipoDe.get(id) || "otro";
      tipoCerr[t] = (tipoCerr[t] || 0) + 1;
    }
  }
  const tiposOrden = Object.entries(tipoCerr).sort((a, b) => b[1] - a[1]);
  const maxTipo = Math.max(1, ...tiposOrden.map(([, n]) => n));

  // Pendientes/vencidos AHORA (snapshot), por responsable
  const pend: Record<string, { ab: number; venc: number }> = {};
  let totAb = 0, totVenc = 0, sinResp = 0;
  {
    const { data: vivos } = await supabase.from("publicaciones")
      .select("responsable,fecha_limite,estado")
      .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"]).limit(1500);
    for (const p of vivos || []) {
      const r = (p as any).responsable as string | null;
      const venc = !!(p as any).fecha_limite && (p as any).fecha_limite < hoyStr;
      totAb++; if (venc) totVenc++;
      if (!r) { sinResp++; continue; }
      if (!pend[r]) pend[r] = { ab: 0, venc: 0 };
      pend[r].ab++; if (venc) pend[r].venc++;
    }
  }

  // Comentarios escritos este mes, por persona
  const comentDe = new Map<string, number>();
  {
    const { data: coms } = await supabase.from("comentarios").select("autor_id")
      .gte("creado_en", inicioMes.toISOString()).lt("creado_en", finMes.toISOString()).limit(6000);
    (coms || []).forEach((c: any) => { if (c.autor_id) comentDe.set(c.autor_id, (comentDe.get(c.autor_id) || 0) + 1); });
  }

  // ── Carga actual del equipo (bloque "Pulso del equipo", movido desde Qhaway) ──
  const hace3d = new Date(Date.now() - 3 * 86400000).toISOString();
  const hace7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const en7Str = (() => { const d = new Date(Date.now() + 7 * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
  const [{ data: vivosCarga }, { data: act3d }, { count: resueltosSemana }] = await Promise.all([
    supabase.from("publicaciones").select("id,titulo,responsable,fecha_limite")
      .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"]).limit(1500),
    supabase.from("actividad").select("entidad_id").eq("entidad_tipo", "publicacion")
      .gte("creado_en", hace3d).limit(4000),
    supabase.from("actividad").select("id", { count: "exact", head: true })
      .eq("entidad_tipo", "publicacion").eq("tipo", "estado")
      .eq("detalle->>a", "resuelta").gte("creado_en", hace7d),
  ]);
  const conActividad = new Set((act3d || []).map((a: any) => a.entidad_id));
  const cargaEquipo = (equipo || []).map((pf: any) => {
    const suyos = (vivosCarga || []).filter((c: any) => c.responsable === pf.id);
    return {
      nombre: pf.nombre,
      carga: suyos.length,
      dorm: suyos.filter((c: any) => !conActividad.has(c.id)).length,
      urgentes: suyos.filter((c: any) => c.fecha_limite && c.fecha_limite <= en7Str).length,
    };
  }).filter((p: any) => p.carga > 0).sort((a: any, b: any) => b.carga - a.carga);
  const maxCarga = Math.max(1, ...cargaEquipo.map((p: any) => p.carga));
  const huerfanosCarga = (vivosCarga || []).filter((c: any) => !c.responsable).slice(0, 8);

  // Filas: todo el equipo (orden estable por nombre, nunca por “rendimiento”)
  const filas = (equipo || []).map((pf: any) => {
    const celdas = matriz[pf.id] || nuevo();
    const totMes = celdas.reduce((s, c) => ({
      cerr: s.cerr + c.cerr, creo: s.creo + c.creo, avanzo: s.avanzo + c.avanzo,
    }), { cerr: 0, creo: 0, avanzo: 0 });
    const pp = pend[pf.id] || { ab: 0, venc: 0 };
    return { id: pf.id, nombre: pf.nombre, celdas, totMes, ab: pp.ab, venc: pp.venc, coment: comentDe.get(pf.id) || 0 };
  });

  // Totales y escalas para el heatmap
  const totSem = Array.from({ length: nSemanas }, (_, i) =>
    filas.reduce((s, f) => s + f.celdas[i].cerr, 0));
  const totMesGlobal = totSem.reduce((s, n) => s + n, 0);
  const creadosMes = filas.reduce((s, f) => s + f.totMes.creo, 0);
  const maxCelda = Math.max(1, ...filas.flatMap(f => f.celdas.map(c => c.cerr)));
  const maxMes = Math.max(1, ...filas.map(f => f.totMes.cerr));
  const maxSem = Math.max(1, ...totSem);
  const maxVenc = Math.max(1, ...filas.map(f => f.venc));

  // Persona más activa del mes (por cierres)
  const top = filas.reduce((best, f) =>
    f.totMes.cerr > best.cerr ? { nombre: f.nombre, cerr: f.totMes.cerr } : best,
    { nombre: "—", cerr: 0 });

  const neto = totMesGlobal - creadosMes;
  const alDia = neto >= 0;

  const heat = (n: number, max: number) =>
    n === 0 ? undefined : `rgba(46,204,113,${(0.12 + 0.6 * (n / max)).toFixed(2)})`;
  const heatRed = (n: number, max: number) =>
    n === 0 ? undefined : `rgba(255,77,94,${(0.12 + 0.6 * (n / max)).toFixed(2)})`;
  const drillHref = (persona: string, kind: string, w: string | number) =>
    `/pulso?m=${off}&d=${persona}&k=${kind}&w=${w}`;

  // ── Drill-down: lista exacta de casos detrás de una cifra ──
  let drillCasos: any[] = [];
  let drillTitulo = "";
  if (dPerson && dKind) {
    if (dKind === "cerr" || dKind === "creo" || dKind === "avanzo") {
      const ids = new Set<string>();
      for (const ev of eventos || []) {
        if (ev.actor_id !== dPerson || !ev.entidad_id) continue;
        const det: any = ev.detalle || {};
        const match =
          dKind === "creo" ? ev.tipo === "creado" :
          dKind === "cerr" ? (ev.tipo === "estado" && det.campo === "estado" && det.a === "resuelta") :
          (ev.tipo === "estado" && det.campo === "estado" && det.a === "en_progreso");
        if (!match) continue;
        if (dW !== "mes" && String(semanaDelMes(new Date(ev.creado_en), inicioMes)) !== String(dW)) continue;
        ids.add(ev.entidad_id);
      }
      if (ids.size) {
        const { data } = await supabase.from("publicaciones")
          .select("id,titulo,tipo,estado").in("id", Array.from(ids));
        drillCasos = data || [];
      }
    } else if (dKind === "ab" || dKind === "venc") {
      const { data } = await supabase.from("publicaciones")
        .select("id,titulo,tipo,estado,fecha_limite")
        .eq("responsable", dPerson)
        .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"]).limit(200);
      drillCasos = (data || []).filter((r: any) =>
        dKind === "ab" ? true : (r.fecha_limite && r.fecha_limite < hoyStr));
    }
    const persNom = (equipo || []).find((p: any) => p.id === dPerson)?.nombre || "—";
    const scope = dW === "mes" ? "· el mes" : dW === "now" ? "" : `· Semana ${Number(dW) + 1}`;
    drillTitulo = `Casos ${KIND_LBL[dKind] || ""} por ${persNom} ${scope}`.trim();
  }

  const etiquetaMes = `${MESES[mes]} ${anio}`;

  return (
    <div className="shell" style={{ maxWidth: "min(1040px, 96vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/tablero" className="btn btn-ghost">← Volver al tablero</Link>
      </div>

      <h1 className="title-lg">📊 Pulso · <span style={{ textTransform: "capitalize" }}>{etiquetaMes}</span></h1>

      <div className="vtabs" style={{ alignItems: "center" }}>
        <Link href={`/pulso?m=${off - 1}`} className="vtab">‹ mes anterior</Link>
        {off !== 0 && <Link href="/pulso" className="vtab">hoy</Link>}
        {off < 0 && <Link href={`/pulso?m=${off + 1}`} className="vtab">mes siguiente ›</Link>}
      </div>

      {/* ── Drill-down: casos detrás de la cifra clickeada ── */}
      {dPerson && dKind && (
        <div className="drill-panel">
          <div className="drill-head">
            <b>{drillTitulo}</b>
            <Link href={`/pulso?m=${off}`} className="drill-x">✕ cerrar</Link>
          </div>
          {drillCasos.length ? (
            <ul className="drill-list">
              {drillCasos.map((c: any) => (
                <li key={c.id}>
                  <Link href={`/caso/${c.id}`}>{icoTipo(c.tipo)} {c.titulo}</Link>
                  <span className={`drill-est st-${claseEstado(c.estado, c.tipo)}`}>{textoEstado(c.estado, c.tipo)}</span>
                  {c.fecha_limite && <span className="drill-fl">vence {c.fecha_limite}</span>}
                </li>
              ))}
            </ul>
          ) : <span className="drill-empty">— no hay casos para mostrar —</span>}
        </div>
      )}

      {/* ── Resumen ── */}
      <div className="pulso-kpis">
        <div className="kpi">
          <span className="l">Cerrados este mes</span>
          <span className="n" style={{ color: "var(--green)" }}>{totMesGlobal}</span>
          <span className="s">de {creadosMes} abiertos nuevos</span>
        </div>
        <div className="kpi">
          <span className="l">Balance del mes</span>
          <span className="n" style={{ color: alDia ? "var(--green)" : "var(--red)" }}>
            {neto > 0 ? "+" : ""}{neto}
          </span>
          <span className="s">{alDia ? "achicando pendientes 🟢" : "acumulando pendientes 🔴"}</span>
        </div>
        <div className="kpi">
          <span className="l">Pendientes ahora</span>
          <span className="n" style={{ color: "var(--text)" }}>{totAb}</span>
          <span className="s">
            {totVenc > 0 ? <b style={{ color: "var(--red)" }}>{totVenc} vencidos</b> : "0 vencidos"}
            {sinResp > 0 && <> · {sinResp} sin responsable</>}
          </span>
        </div>
        <div className="kpi">
          <span className="l">Más activo del mes</span>
          <span className="n" style={{ fontSize: 19, color: "var(--accent)" }}>
            {top.cerr > 0 ? top.nombre : "—"}
          </span>
          <span className="s">{top.cerr > 0 ? `${top.cerr} cerrados` : "aún sin cierres"}</span>
        </div>
      </div>

      {/* ── Tendencia semanal ── */}
      <div className="pulso-tend">
        <span className="tend-tit">Cierres por semana</span>
        <div className="tend-chart">
          {totSem.map((n, i) => (
            <div key={i} className="tend-col" title={`Semana ${i + 1}: ${n} cerrados`}>
              <span className="tend-val">{n}</span>
              <span className="tend-bar" style={{ height: `${8 + 62 * (n / maxSem)}px` }} />
              <span className="tend-lbl">S{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Matriz persona × semana (heatmap) + pendientes ── */}
      <div className="pulso-wrap">
        <table className="pulso">
          <thead>
            <tr>
              <th className="quien">Persona</th>
              {semRango.map((r, i) => (
                <th key={i}>
                  Sem {i + 1}
                  <span className="rng">{r.ini}–{r.fin} {MESES[mes].slice(0, 3)}</span>
                </th>
              ))}
              <th>Mes</th>
              <th className="sep">Abiertos<span className="rng">ahora</span></th>
              <th>Vencidos<span className="rng">ahora</span></th>
              <th className="sep">💬 Coment.<span className="rng">este mes</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="quien">{f.nombre}</td>
                {f.celdas.map((c, i) => (
                  <td key={i} className={c.cerr > 0 ? "heat" : ""} style={{ background: heat(c.cerr, maxCelda) }}>
                    <div className={`cerr ${c.cerr === 0 ? "cero" : ""}`}>
                      {c.cerr > 0
                        ? <Link className="drill" href={drillHref(f.id, "cerr", i)}>{c.cerr}</Link>
                        : 0}
                    </div>
                    {(c.creo > 0 || c.avanzo > 0) && (
                      <div className="sub">
                        {c.creo > 0 && <Link className="drill" href={drillHref(f.id, "creo", i)} title="casos que abrió">+{c.creo}</Link>}
                        {c.creo > 0 && c.avanzo > 0 && " · "}
                        {c.avanzo > 0 && <Link className="drill" href={drillHref(f.id, "avanzo", i)} title="casos que pasó a En Progreso">⟳{c.avanzo}</Link>}
                      </div>
                    )}
                  </td>
                ))}
                <td className={`tot ${f.totMes.cerr > 0 ? "heat" : ""}`} style={{ background: heat(f.totMes.cerr, maxMes) }}>
                  <div className={`cerr ${f.totMes.cerr === 0 ? "cero" : ""}`}>
                    {f.totMes.cerr > 0
                      ? <Link className="drill" href={drillHref(f.id, "cerr", "mes")}>{f.totMes.cerr}</Link>
                      : 0}
                  </div>
                </td>
                <td className="sep">
                  <span className={f.ab === 0 ? "pend cero" : "pend"}>
                    {f.ab > 0 ? <Link className="drill" href={drillHref(f.id, "ab", "now")}>{f.ab}</Link> : 0}
                  </span>
                </td>
                <td className={f.venc > 0 ? "heat-red" : ""} style={{ background: heatRed(f.venc, maxVenc) }}>
                  <span className={f.venc === 0 ? "pend cero" : "pend venc"}>
                    {f.venc > 0 ? <Link className="drill" href={drillHref(f.id, "venc", "now")}>{f.venc}</Link> : 0}
                  </span>
                </td>
                <td className="sep"><span style={{ color: f.coment > 0 ? "var(--violet)" : "var(--dim)", fontWeight: 700 }}>{f.coment}</span></td>
              </tr>
            ))}
            {!filas.length && (
              <tr><td className="quien" colSpan={nSemanas + 5} style={{ color: "var(--dim)" }}>
                — sin equipo activo —
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="quien">Total equipo</td>
              {totSem.map((n, i) => <td key={i}>{n}</td>)}
              <td>{totMesGlobal}</td>
              <td className="sep">{totAb}</td>
              <td>{totVenc}</td>
              <td className="sep">{filas.reduce((s, f) => s + f.coment, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Pulso del equipo · carga actual (movido desde Qhaway) ── */}
      <div className="pulso-tend" style={{ display: "block" }}>
        <span className="tend-tit" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          🫀 Pulso del equipo · carga actual
          <span style={{ color: "var(--dim)", fontSize: 11, fontWeight: 400 }}>carga y flujo — nunca un ranking</span>
        </span>
        {(resueltosSemana || 0) > 0 && (
          <div style={{ color: "var(--green)", fontSize: 13, margin: "10px 0 12px" }}>
            🎉 En los últimos 7 días el equipo resolvió <b>{resueltosSemana}</b> caso{resueltosSemana === 1 ? "" : "s"} — logro de todos.
          </div>
        )}
        {cargaEquipo.map((p: any) => (
          <div key={p.nombre} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0" }}>
            <span style={{ width: 140, fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</span>
            <span style={{ flex: 1, height: 8, background: "var(--bg)", borderRadius: 5, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", borderRadius: 5, width: `${Math.round((p.carga / maxCarga) * 100)}%`, background: "linear-gradient(90deg,#3b82f6,#7c5cff)" }} />
            </span>
            <span style={{ width: 20, textAlign: "right", fontSize: 12.5, fontWeight: 700, color: "var(--blue)" }}>{p.carga}</span>
            <span style={{ width: 110, fontSize: 11, color: "var(--dim)", textAlign: "right" }}>
              {p.dorm > 0 && <span style={{ color: "var(--yellow)" }}>😴 {p.dorm}</span>}
              {p.dorm > 0 && p.urgentes > 0 && " · "}
              {p.urgentes > 0 && <span style={{ color: "var(--red)" }}>⏰ {p.urgentes}</span>}
            </span>
          </div>
        ))}
        {!cargaEquipo.length && <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 8 }}>— sin carga asignada por ahora —</div>}
        {huerfanosCarga.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <div style={{ color: "var(--yellow)", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              🙋 Sin responsable · {huerfanosCarga.length} — trabajo de nadie es trabajo de todos
            </div>
            {huerfanosCarga.map((c: any) => (
              <div key={c.id} style={{ padding: "3px 0" }}>
                <Link href={`/caso/${c.id}`} style={{ fontWeight: 600, fontSize: 12.5 }}>{c.titulo} →</Link>
              </div>
            ))}
          </div>
        )}
        <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 12 }}>
          Una barra larga es señal para redistribuir, no un mérito ni una falta. 😴 = sin actividad 3+ días · ⏰ = vence en 7 días o menos.
        </div>
      </div>

      {/* ── Desglose por tipo de lo cerrado ── */}
      <div className="pulso-tipos">
        <span className="tend-tit">En qué se cerró el esfuerzo</span>
        {tiposOrden.length ? tiposOrden.map(([t, n]) => (
          <div key={t} className="tipo-row">
            <span className="tipo-lbl">{rotuloMonton(t)}</span>
            <span className="tipo-bar"><span className="tipo-fill" style={{ width: `${100 * (n / maxTipo)}%` }} /></span>
            <span className="tipo-n">{n}</span>
          </div>
        )) : <span style={{ color: "var(--dim)", fontSize: 12.5 }}>— nada cerrado este mes —</span>}
      </div>

      <div className="pulso-leyenda">
        <span><b style={{ color: "var(--green)" }}>número grande</b> = casos cerrados (celda más verde = más cierres)</span>
        <span>+N = casos que abrió</span>
        <span>⟳N = casos que pasó a En Progreso</span>
        <span style={{ color: "var(--accent)" }}>clic en cualquier número → ver esos casos</span>
      </div>

      <p style={{ color: "var(--dim)", fontSize: 12, marginTop: 16, display: "flex", gap: 6, alignItems: "center" }}>
        🤖 <span>Bot <b style={{ color: "var(--muted)" }}>Qhaway</b> vigila los cierres por ti y arma este pulso.</span>
        <Link href="/qhaway" style={{ color: "var(--violet)" }}>ver su bitácora →</Link>
      </p>
    </div>
  );
}
