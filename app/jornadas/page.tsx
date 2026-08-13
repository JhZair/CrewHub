import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import MiJornada from "@/components/MiJornada";
import BitacoraJornadas from "@/components/BitacoraJornadas";
import CicloMes from "@/components/CicloMes";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { rotuloMonton } from "@/lib/tipos";

export const metadata: Metadata = { title: "⏱ Jornadas" };

/* JORNADAS — el cuaderno de Katy, hecho entidad. Registro personal,
   panel "Mi trabajo" (por semana), matriz del equipo por semana, y
   bitácora con estados de aprobación. */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TIPO_LBL: [string, string][] = [["rodaje", "🎬 Rodaje"], ["oficina", "🏢 Oficina"], ["scouting", "🚙 Scouting"]];
/* (Los rótulos de la gráfica salieron a lib/tipos: `rotuloMonton`. Esta era
   la copia ONCE del mapa de tipos, y /pulso tiene la MISMA gráfica con el
   mismo mapa. `TIPO_LBL` de arriba se queda: son los tipos de JORNADA
   —rodaje, oficina, scouting—, que no tienen nada que ver.) */
const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const heat = (n: number, max: number) => n === 0 ? undefined : `rgba(46,204,113,${(0.12 + 0.6 * (n / max)).toFixed(2)})`;
const heatRed = (n: number, max: number) => n === 0 ? undefined : `rgba(255,77,94,${(0.12 + 0.6 * (n / max)).toFixed(2)})`;

// Semana del mes con corte en lunes (0-indexada)
function semanaDelMes(f: Date, primerDia: Date): number {
  const diff = Math.floor((f.getTime() - primerDia.getTime()) / 86400000);
  const offsetLunes = (primerDia.getDay() + 6) % 7;
  return Math.floor((diff + offsetLunes) / 7);
}

export default async function Jornadas({ searchParams }: { searchParams: { m?: string } }) {
  const off = parseInt(searchParams?.m || "0", 10) || 0;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth() + off, 1);
  const anio = base.getFullYear(); const mes = base.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const inicio = `${anio}-${pad(mes + 1)}-01`;
  const fin = `${mes === 11 ? anio + 1 : anio}-${pad(mes === 11 ? 1 : mes + 2)}-01`;

  const inicioMes = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const semRango: { ini: number; fin: number }[] = [];
  for (let d = 1; d <= diasEnMes; d++) {
    const wi = semanaDelMes(new Date(anio, mes, d), inicioMes);
    if (!semRango[wi]) semRango[wi] = { ini: d, fin: d }; else semRango[wi].fin = d;
  }
  const nSem = semRango.length;

  /* Quién soy, ANTES de pedir las jornadas: esta página es personal y sin saber
     a qué persona corresponde la cuenta no se puede acotar la consulta. */
  const [{ data: miData }, { data: proyectos }, { data: perfilData }] = await Promise.all([
    supabase.from("personas").select("id,nombre,alias,tarifa_dia,tarifa_rodaje,tarifa_noche").eq("usuario_id", user.id).maybeSingle(),
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    supabase.from("perfiles").select("es_admin").eq("id", user.id).single(),
  ]);
  const miPersonaIdRaw = (miData as any)?.id || "";

  /* SOLO LO MÍO. Esta página mostraba las jornadas de todo el equipo: cualquiera
     veía cuántos días trabajó cada quien y —peor— a cuánto le pagan, porque el
     monto por jornada revela la tarifa. Nadie lo pidió; simplemente la consulta
     no filtraba y la tabla agrupaba por persona porque los datos venían así.
     El filtro va en la CONSULTA y no al pintar: filtrar en el navegador manda
     igual los sueldos ajenos al cliente, donde se leen en dos clics.
     La vista de equipo vive en /admin, que ya comprueba `es_admin`. */
  const { data: jorns } = miPersonaIdRaw
    ? await supabase.from("jornadas")
        .select("id,persona_id,fecha,proyecto_id,tipo,fraccion,noche,monto,aprobada,per:personas(nombre,alias),proy:proyectos(nombre)")
        .eq("persona_id", miPersonaIdRaw)
        .gte("fecha", inicio).lt("fecha", fin).order("fecha", { ascending: false })
    : { data: [] };
  const mi = miData ? { nombre: (miData as any).alias || (miData as any).nombre, tarifa_dia: (miData as any).tarifa_dia, tarifa_rodaje: (miData as any).tarifa_rodaje, tarifa_noche: (miData as any).tarifa_noche } : null;
  const miPersonaId = miPersonaIdRaw;
  const esAdmin = !!(perfilData as any)?.es_admin;
  /* ── MIS DOS SILUETAS: A QUÉ HORA Y QUÉ DÍAS ──
     Las mismas que ve el admin bajo cada nombre, pero aquí solo la mía. No es
     vigilancia mirada desde dentro: es el recordatorio de qué días toqué el
     sistema, que es justo lo que uno necesita cuando llega a registrar la
     semana y no se acuerda si el jueves trabajó.
     La función devuelve el mes de TODOS, y aquí se queda con una sola persona
     antes de pintar. El descarte ocurre en el servidor —esto es un componente
     de servidor, al navegador solo llega lo dibujado—, así que las cuentas
     ajenas no salen de la base de datos: la misma regla que ya obliga a
     filtrar `jornadas` en la consulta y no al pintar. */
  const horasPorPersona: Record<string, number[]> = {};
  const diasPorPersona: Record<string, number[]> = {};
  if (miPersonaId) {
    const { data: fr } = await supabase.rpc("franjas_actividad", {
      p_desde: `${inicio}T00:00:00-05:00`,
      p_hasta: `${fin}T00:00:00-05:00`,
    });
    (fr || []).forEach((f: any) => {
      if (f.usuario_id !== user.id) return;
      const h = Number(f.hora), d = Number(f.dia), n = Number(f.n) || 0;
      if (h >= 0 && h < 24) (horasPorPersona[miPersonaId] ||= Array(24).fill(0))[h] += n;
      if (d >= 1 && d <= diasEnMes) (diasPorPersona[miPersonaId] ||= Array(diasEnMes).fill(0))[d - 1] += n;
    });
  }

  const mesNum = mes + 1; // 1-12 para liquidaciones
  const { data: miLiq } = miPersonaId
    ? await supabase.from("liquidaciones").select("*").eq("persona_id", miPersonaId).eq("anio", anio).eq("mes", mesNum).maybeSingle()
    : { data: null };

  /* Mis recibos de ESTE mes. Se piden solo cuando el mes ya está liquidado:
     antes de eso no hay importe que girar, así que no hay recibo posible y
     preguntar sería una consulta por nada en cada carga de la página. */
  const { data: misRhes } = (miLiq as any)?.id && (miLiq as any)?.estado === "liquidado"
    ? await supabase.from("rhe")
        .select("id,numero,fecha,monto,url,pagado_en,pagado_url,pagado_medio")
        .eq("liquidacion_id", (miLiq as any).id).order("fecha")
    : { data: null };

  // ── Agregación persona × semana + panel personal ──
  const nombreP = new Map<string, string>();
  const semPer = new Map<string, number[]>();
  const totPer = new Map<string, { dias: number; aprob: number; pend: number }>();
  const miSem = new Array(nSem).fill(0);
  const miTipo: Record<string, number> = { rodaje: 0, oficina: 0, scouting: 0 };
  let miDias = 0, miAprob = 0, miPend = 0;

  (jorns || []).forEach((j: any) => {
    const pid = j.persona_id;
    nombreP.set(pid, j.per?.alias || j.per?.nombre || "—");
    const wi = semanaDelMes(new Date(j.fecha + "T12:00:00"), inicioMes);
    const d = Number(j.fraccion || 0), s = Number(j.monto || 0);
    const arr = semPer.get(pid) || new Array(nSem).fill(0);
    if (wi >= 0 && wi < nSem) arr[wi] += d;
    semPer.set(pid, arr);
    const tp = totPer.get(pid) || { dias: 0, aprob: 0, pend: 0 };
    tp.dias += d; tp.aprob += j.aprobada ? s : 0; tp.pend += j.aprobada ? 0 : s;
    totPer.set(pid, tp);
    if (pid === miPersonaId) {
      if (wi >= 0 && wi < nSem) miSem[wi] += d;
      miTipo[j.tipo] = (miTipo[j.tipo] || 0) + d;
      miDias += d; if (j.aprobada) miAprob += s; else miPend += s;
    }
  });
  const filas = [...nombreP.entries()].map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const totalDias = [...totPer.values()].reduce((s, x) => s + x.dias, 0);
  const totalAprob = [...totPer.values()].reduce((s, x) => s + x.aprob, 0);
  const totSem = Array.from({ length: nSem }, (_, i) => filas.reduce((s, f) => s + (semPer.get(f.id)?.[i] || 0), 0));
  const maxMiSem = Math.max(1, ...miSem);
  const maxTipo = Math.max(1, ...Object.values(miTipo));

  const bitacora = (jorns || []).map((j: any) => ({
    id: j.id, persona_id: j.persona_id, proyecto_id: j.proyecto_id, aprobada: j.aprobada,
    fecha: j.fecha, persona: j.per?.alias || j.per?.nombre || "—",
    proyecto: j.proy?.nombre || null, tipo: j.tipo, fraccion: j.fraccion, noche: j.noche, monto: j.monto,
  }));

  // ── Mi actividad en CrewHub+ (trabajo de casos del logueado) ──
  const finMes = new Date(anio, mes + 1, 1);
  const desdeISO = inicioMes.toISOString(), hastaISO = finMes.toISOString();
  const hoyStr = hoy.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [{ data: misCierres }, { data: misCreadosEv }, { data: misMovidosEv }, { data: misVivos }, { count: misComentarios }] = await Promise.all([
    supabase.from("actividad").select("creado_en,entidad_id")
      .eq("entidad_tipo", "publicacion").eq("tipo", "estado").eq("detalle->>a", "resuelta")
      .eq("actor_id", user.id).gte("creado_en", desdeISO).lt("creado_en", hastaISO).limit(1000),
    supabase.from("actividad").select("creado_en")
      .eq("tipo", "creado").eq("actor_id", user.id).gte("creado_en", desdeISO).lt("creado_en", hastaISO).limit(1000),
    supabase.from("actividad").select("creado_en")
      .eq("entidad_tipo", "publicacion").eq("tipo", "estado").eq("detalle->>a", "en_progreso")
      .eq("actor_id", user.id).gte("creado_en", desdeISO).lt("creado_en", hastaISO).limit(1000),
    supabase.from("publicaciones").select("fecha_limite")
      .eq("responsable", user.id).in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"]).is("archivado_en", null).limit(1000),
    supabase.from("comentarios").select("id", { count: "exact", head: true })
      .eq("autor_id", user.id).gte("creado_en", desdeISO).lt("creado_en", hastaISO),
  ]);
  const bucket = (arr: number[], ts: string) => { const wi = semanaDelMes(new Date(ts), inicioMes); if (wi >= 0 && wi < nSem) arr[wi]++; };
  const cierreSem = new Array(nSem).fill(0), creadoSem = new Array(nSem).fill(0), movidoSem = new Array(nSem).fill(0);
  (misCierres || []).forEach((e: any) => bucket(cierreSem, e.creado_en));
  (misCreadosEv || []).forEach((e: any) => bucket(creadoSem, e.creado_en));
  (misMovidosEv || []).forEach((e: any) => bucket(movidoSem, e.creado_en));
  const misCerr = (misCierres || []).length;
  const misAbiertos = (misCreadosEv || []).length;
  const maxCierreSem = Math.max(1, ...cierreSem);
  const misPend = (misVivos || []).length;
  const misVenc = (misVivos || []).filter((p: any) => p.fecha_limite && p.fecha_limite < hoyStr).length;

  // En qué cerré el esfuerzo (por tipo de caso)
  const cerrIds = [...new Set((misCierres || []).map((e: any) => e.entidad_id).filter(Boolean))];
  const { data: tpCerr } = cerrIds.length
    ? await supabase.from("publicaciones").select("id,tipo").in("id", cerrIds) : { data: [] };
  const tipoDeCaso = new Map((tpCerr || []).map((r: any) => [r.id, r.tipo]));
  const tipoCerr: Record<string, number> = {};
  (misCierres || []).forEach((e: any) => { const t = tipoDeCaso.get(e.entidad_id) || "otro"; tipoCerr[t] = (tipoCerr[t] || 0) + 1; });
  const tiposOrden = Object.entries(tipoCerr).sort((a, b) => b[1] - a[1]);
  const maxTipoCerr = Math.max(1, ...tiposOrden.map(([, n]) => n));

  // Mi participación (cerrados vs abiertos vs comentarios) para barras comparables
  const participacion: [string, number][] = [
    ["✅ Casos cerrados", misCerr],
    ["📝 Casos abiertos", misAbiertos],
    ["💬 Comentarios", misComentarios || 0],
  ];
  const maxPart = Math.max(1, ...participacion.map(([, n]) => n));

  return (
    <div className="shell" style={{ maxWidth: "min(1040px, 96vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>el registro de campo — quién trabajó, cuándo y en qué</span>
      </div>

      <h1 className="title-lg">📓 Jornadas · <span style={{ textTransform: "capitalize" }}>{MESES[mes]} {anio}</span></h1>

      <div className="vtabs" style={{ alignItems: "center" }}>
        <Link href={`/jornadas?m=${off - 1}`} className="vtab">‹ mes anterior</Link>
        {off !== 0 && <Link href="/jornadas" className="vtab">hoy</Link>}
        {off < 0 && <Link href={`/jornadas?m=${off + 1}`} className="vtab">mes siguiente ›</Link>}
      </div>

      <MiJornada proyectos={proyectos || []} mi={mi} />

      {mi && (
        <CicloMes anio={anio} mes={mesNum} mesNombre={MESES[mes]} liq={miLiq}
          personaId={miPersonaId} rhes={(misRhes || []) as any} />
      )}

      {/* ══ PAGO (foco) ══ */}
      {mi && (
        <>
          <div className="h4" style={{ marginTop: 16 }}>💰 Mi pago · <span style={{ textTransform: "capitalize" }}>{MESES[mes]}</span></div>
          <div className="pulso-kpis">
            <div className="kpi"><span className="l">Mis jornadas</span><span className="n" style={{ color: "var(--blue)" }}>{miDias}</span><span className="s">este mes</span></div>
            <div className="kpi"><span className="l">A pagar · aprobado</span><span className="n" style={{ color: "var(--teal)" }}>{soles(miAprob)}</span><span className="s">de {soles(miAprob + miPend)}</span></div>
            <div className="kpi"><span className="l">⏳ Pendiente</span><span className="n" style={{ color: miPend > 0 ? "var(--yellow)" : "var(--dim)" }}>{soles(miPend)}</span><span className="s">por aprobar</span></div>
          </div>
        </>
      )}

      {/* Una cuenta sin ficha de persona no tiene jornadas que mostrar. Sin
          decirlo, la página sale vacía y parece que no se registró nada. */}
      {!miPersonaId && (
        <div className="card" style={{ borderColor: "rgba(244,180,0,.4)", color: "var(--yellow)", fontSize: 13 }}>
          ⚠ Tu cuenta no está vinculada a una ficha de persona, así que aquí no hay jornadas que mostrar.
          Pídele a administración que la vincule.
        </div>
      )}

      {/* Detalle del pago por semana (foco) */}
      <div className="h4" style={{ marginTop: 14 }}>📅 Detalle del pago por semana</div>
      <div className="pulso-wrap">
        <table className="pulso">
          <thead>
            <tr>
              <th className="quien">Quién</th>
              {semRango.map((r, i) => <th key={i}>Sem {i + 1}<span className="rng">{r.ini}–{r.fin} {MESES[mes].slice(0, 3)}</span></th>)}
              <th>Mes</th>
              <th className="sep">A pagar</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const arr = semPer.get(f.id) || [];
              const tp = totPer.get(f.id) || { dias: 0, aprob: 0, pend: 0 };
              return (
                <tr key={f.id}>
                  <td className="quien">{f.nombre}</td>
                  {semRango.map((_, i) => (
                    <td key={i} style={{ textAlign: "center" }}>
                      {arr[i] ? <span style={{ color: "var(--blue)", fontWeight: 700 }}>{arr[i]}</span> : <span style={{ color: "var(--dim)" }}>—</span>}
                    </td>
                  ))}
                  <td style={{ textAlign: "center", fontWeight: 700 }}>{tp.dias}</td>
                  <td className="sep" style={{ textAlign: "center", color: "var(--teal)", fontWeight: 700 }}>
                    {soles(tp.aprob)}
                    {tp.pend > 0 && <span style={{ display: "block", color: "var(--yellow)", fontSize: 10.5, fontWeight: 600 }}>⏳ {soles(tp.pend)}</span>}
                  </td>
                </tr>
              );
            })}
            {!filas.length && (
              <tr><td className="quien" colSpan={nSem + 3} style={{ color: "var(--dim)" }}>— sin jornadas este mes —</td></tr>
            )}
          </tbody>
          {/* La fila «Total» solo suma si hay algo que sumar. Desde que esta
              página es personal, `filas` trae exactamente una persona y el pie
              repetía la fila de arriba cifra por cifra: un total de una sola
              cosa no es un total, es la misma línea dos veces. */}
          {filas.length > 1 && (
            <tfoot>
              <tr>
                <td className="quien">Total</td>
                {totSem.map((n, i) => <td key={i} style={{ textAlign: "center" }}>{n}</td>)}
                <td style={{ textAlign: "center" }}>{totalDias}</td>
                <td className="sep" style={{ textAlign: "center" }}>{soles(totalAprob)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{ color: "var(--dim)", fontSize: 12, margin: "8px 2px" }}>
        Los números son jornadas por semana (½ = 0.5, día y medio = 1.5). "A pagar" cuenta solo lo aprobado; ⏳ es lo pendiente.
      </div>

      {/* Detalle diario (pegado al pago) */}
      {/* `diasVacios` pinta en 0 los días sin registrar. Su condición —que
          `items` traiga el mes COMPLETO— se cumple aquí: `jorns` es todo el mes
          de esta persona, sin filtrar por aprobada. El hueco es el dato: sin él
          no se distingue «descansé» de «se me olvidó anotarlo», y una vez
          liquidado el mes corregirlo ya cuesta. */}
      <BitacoraJornadas items={bitacora} esAdmin={false} miPersonaId={miPersonaId} proyectos={proyectos || []} titulo="🗒 Detalle diario del mes" bloqueado={!!miLiq} porMes diasVacios
        horasPorPersona={horasPorPersona} diasPorPersona={diasPorPersona} mesFranja={inicio} />

      {/* ══ CONTEXTO (abajo, ordenado) ══ */}
      <div className="h4" style={{ marginTop: 22, color: "var(--dim)", letterSpacing: 1, textTransform: "uppercase", fontSize: 12 }}>Contexto adicional</div>

      {mi && miDias > 0 && (
        <div className="pulso-tipos">
          <span className="tend-tit">En qué trabajé (jornadas)</span>
          {TIPO_LBL.filter(([t]) => miTipo[t] > 0).map(([t, l]) => (
            <div key={t} className="tipo-row">
              <span className="tipo-lbl">{l}</span>
              <span className="tipo-bar"><span className="tipo-fill" style={{ width: `${100 * (miTipo[t] / maxTipo)}%` }} /></span>
              <span className="tipo-n">{miTipo[t]}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Mi actividad en CrewHub+ (casos) ── */}
      <div className="h4" style={{ marginTop: 16 }}>🗂 Mi actividad en CrewHub+</div>
      <div className="pulso-wrap">
        <table className="pulso">
          <thead>
            <tr>
              <th className="quien">Mis casos</th>
              {semRango.map((r, i) => <th key={i}>Sem {i + 1}<span className="rng">{r.ini}–{r.fin} {MESES[mes].slice(0, 3)}</span></th>)}
              <th>Mes</th>
              <th className="sep">Abiertos<span className="rng">ahora</span></th>
              <th>Vencidos<span className="rng">ahora</span></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="quien">Cerrados</td>
              {cierreSem.map((n: number, i: number) => (
                <td key={i} className={n > 0 ? "heat" : ""} style={{ background: heat(n, maxCierreSem) }}>
                  <div className={`cerr ${n === 0 ? "cero" : ""}`}>{n}</div>
                  {(creadoSem[i] > 0 || movidoSem[i] > 0) && (
                    <div className="sub">
                      {creadoSem[i] > 0 && `+${creadoSem[i]}`}
                      {creadoSem[i] > 0 && movidoSem[i] > 0 && " · "}
                      {movidoSem[i] > 0 && `⟳${movidoSem[i]}`}
                    </div>
                  )}
                </td>
              ))}
              <td className={`tot ${misCerr > 0 ? "heat" : ""}`} style={{ background: heat(misCerr, Math.max(1, misCerr)) }}>
                <div className={`cerr ${misCerr === 0 ? "cero" : ""}`}>{misCerr}</div>
              </td>
              <td className="sep"><span className={misPend === 0 ? "pend cero" : "pend"}>{misPend}</span></td>
              <td className={misVenc > 0 ? "heat-red" : ""} style={{ background: heatRed(misVenc, Math.max(1, misVenc)) }}>
                <span className={misVenc === 0 ? "pend cero" : "pend venc"}>{misVenc}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ color: "var(--dim)", fontSize: 11.5, margin: "6px 2px 0" }}>
        Número grande = casos cerrados por semana · +N = que abrí · ⟳N = que pasé a En Progreso.
      </div>
      <div className="pulso-tipos" style={{ marginTop: 12 }}>
        <span className="tend-tit">Mi participación este mes</span>
        {participacion.map(([l, n], i) => (
          <div key={i} className="tipo-row">
            <span className="tipo-lbl">{l}</span>
            <span className="tipo-bar"><span className="tipo-fill" style={{ width: `${100 * (n / maxPart)}%` }} /></span>
            <span className="tipo-n">{n}</span>
          </div>
        ))}
      </div>

      <div className="pulso-tipos" style={{ marginTop: 12 }}>
        <span className="tend-tit">Casos que cerré · por tipo</span>
        {tiposOrden.length ? tiposOrden.map(([t, n]) => (
          <div key={t} className="tipo-row">
            <span className="tipo-lbl">{rotuloMonton(t)}</span>
            <span className="tipo-bar"><span className="tipo-fill" style={{ width: `${100 * (n / maxTipoCerr)}%` }} /></span>
            <span className="tipo-n">{n}</span>
          </div>
        )) : <span style={{ color: "var(--dim)", fontSize: 12.5 }}>— nada cerrado este mes —</span>}
      </div>

    </div>
  );
}
