import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import TarifasEditor from "@/components/TarifasEditor";
import BitacoraJornadas from "@/components/BitacoraJornadas";
import LiquidacionAdmin from "@/components/LiquidacionAdmin";
import BotonDestacar from "@/components/BotonDestacar";
import RheAdmin from "@/components/RheAdmin";
import { estado4ta } from "@/lib/cuarta";
import Link from "next/link";
import { redirect } from "next/navigation";

/* Administración — temas de gestión que el usuario común no toca:
   aprobar jornadas, liquidar el mes (recibos) y tarifas del personal. */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const TIPO_COL: Record<string, string> = {
  aviso: "#a78bfa", tarea: "#22c55e", problema: "#ff4d5e", consulta: "#60a5fa",
  pago: "#2dd4bf", idea: "#f4b400", archivo: "#3b82f6", conversacion: "#8b8ba3",
};

export default async function Admin({ searchParams }: { searchParams: { lm?: string; s?: string } }) {
  // Sección activa: por defecto lo más frecuente, aprobar jornadas
  const s = searchParams?.s || "jornadas";
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) {
    return (
      <div className="shell">
        <div className="topbar"><Volver /></div>
        <div className="empty">⚙ Esta sección es solo para administración.</div>
      </div>
    );
  }

  // Mes a liquidar (por defecto el actual; navegable)
  const lmOff = parseInt(searchParams?.lm || "0", 10) || 0;
  const hoy = new Date();
  const bl = new Date(hoy.getFullYear(), hoy.getMonth() + lmOff, 1);
  const lAnio = bl.getFullYear(); const lMes = bl.getMonth(); // 0-indexado
  const pad = (n: number) => String(n).padStart(2, "0");
  const lInicio = `${lAnio}-${pad(lMes + 1)}-01`;
  const lFin = `${lMes === 11 ? lAnio + 1 : lAnio}-${pad(lMes === 11 ? 1 : lMes + 2)}-01`;

  const [{ data: personas }, { data: cobrables }, { data: rhes }, { data: jornsPend },
         { data: proyectos }, { data: jornsMes }, { data: liqs }, { data: vivos }] = await Promise.all([
    supabase.from("personas").select("id,nombre,alias,tarifa_dia,tarifa_rodaje,tarifa_noche")
      .eq("tipo", "personal").order("nombre"),
    // A quién se le puede girar un RHE, y los del año en curso
    supabase.from("personas").select("id,nombre,alias,suspension_4ta_anio")
      .in("tipo", ["personal", "colaborador", "colaborador eventual", "independiente"])
      .eq("estado", "activo").order("nombre"),
    supabase.from("rhe").select("*")
      .gte("fecha", `${new Date().getFullYear()}-01-01`)
      .order("fecha", { ascending: false }).limit(400),
    supabase.from("jornadas")
      .select("id,persona_id,fecha,proyecto_id,tipo,fraccion,noche,monto,aprobada,per:personas(nombre,alias),proy:proyectos(nombre)")
      .eq("aprobada", false).order("fecha", { ascending: false }).limit(400),
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    supabase.from("jornadas").select("persona_id,fraccion,monto,aprobada,per:personas(nombre,alias)")
      .gte("fecha", lInicio).lt("fecha", lFin).limit(3000),
    supabase.from("liquidaciones").select("persona_id,estado").eq("anio", lAnio).eq("mes", lMes + 1),
    // Casos vivos, para elegir cuáles suben a la cabecera del feed
    supabase.from("publicaciones")
      .select("id,tipo,titulo,fecha_limite,destacado_hasta")
      .in("estado", ["abierta", "en_progreso", "seguimiento"])
      .order("creado_en", { ascending: false }).limit(60),
  ]);

  const tarifaLista = (personas || []).map((p: any) => ({
    id: p.id, nombre: p.alias || p.nombre, tarifa_dia: p.tarifa_dia, tarifa_rodaje: p.tarifa_rodaje, tarifa_noche: p.tarifa_noche,
  }));
  const porAprobar = (jornsPend || []).map((j: any) => ({
    id: j.id, persona_id: j.persona_id, proyecto_id: j.proyecto_id, aprobada: j.aprobada,
    fecha: j.fecha, persona: j.per?.alias || j.per?.nombre || "—",
    proyecto: j.proy?.nombre || null, tipo: j.tipo, fraccion: j.fraccion, noche: j.noche, monto: j.monto,
  }));

  const estadoDe = new Map((liqs || []).map((l: any) => [l.persona_id, l.estado]));
  const agg = new Map<string, { nombre: string; dias: number; pend: number; monto: number }>();
  (jornsMes || []).forEach((j: any) => {
    const a = agg.get(j.persona_id) || { nombre: j.per?.alias || j.per?.nombre || "—", dias: 0, pend: 0, monto: 0 };
    a.dias += Number(j.fraccion || 0);
    if (!j.aprobada) a.pend++;
    a.monto += j.aprobada ? Number(j.monto || 0) : 0;
    agg.set(j.persona_id, a);
  });
  const filasLiq = [...agg.entries()]
    .map(([personaId, a]) => ({ personaId, nombre: a.nombre, dias: a.dias, pend: a.pend, monto: a.monto, estado: estadoDe.get(personaId) || null }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre));

  // Cuántos rozan o pasaron el tope de 4ta: eso es lo que pide atención
  const anioHoy = new Date().getFullYear();
  const acum4ta = new Map<string, number>();
  (rhes || []).forEach((r: any) => acum4ta.set(r.persona_id, (acum4ta.get(r.persona_id) || 0) + Number(r.monto || 0)));
  const nCerca = [...acum4ta.values()].filter(v => {
    const e = estado4ta(v, anioHoy);
    return e.cerca || e.supero;
  }).length;

  // Menú: cada sección con su contador, para ver qué pide atención sin entrar
  const ahoraMs = Date.now();
  const nDestacados = (vivos || []).filter((p: any) =>
    p.destacado_hasta && new Date(p.destacado_hasta).getTime() > ahoraMs).length;
  const SECCIONES: [string, string, number | null][] = [
    ["destacados", "📌 Destacados", nDestacados || null],
    ["jornadas", "✅ Aprobar jornadas", porAprobar.length || null],
    ["liquidar", "🧾 Liquidar mes", filasLiq.filter(f => f.estado !== "liquidado").length || null],
    ["rhe", "🧾 RHE y tope 4ta", nCerca || null],
    ["tarifas", "💰 Tarifas", null],
  ];

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>solo administración</span>
      </div>
      <h1 className="title-lg">⚙ Administración</h1>

      <div className="adm-grid">
        <aside>
          <div className="card" style={{ padding: 6 }}>
            {SECCIONES.map(([k, label, n]) => (
              <Link key={k} href={`/admin?s=${k}`} className={`adm-nav${s === k ? " on" : ""}`}>
                <span style={{ flex: 1 }}>{label}</span>
                {n ? (
                  <span className="badge" style={{
                    color: k === "jornadas" ? "var(--yellow)" : "var(--muted)",
                    background: "#1c1c2c", fontSize: 10,
                  }}>{n}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </aside>

        <main>
      {s === "destacados" && (() => {
        const ahora = Date.now();
        const dias = (f: string) => Math.ceil((new Date(f + "T23:59:59").getTime() - ahora) / 86400000);
        const fijado = (p: any) => !!p.destacado_hasta && new Date(p.destacado_hasta).getTime() > ahora;
        // Los ya destacados primero; luego lo que vence antes
        const lista = [...(vivos || [])].sort((a: any, b: any) => {
          if (fijado(a) !== fijado(b)) return fijado(a) ? -1 : 1;
          if (!!a.fecha_limite !== !!b.fecha_limite) return a.fecha_limite ? -1 : 1;
          return (a.fecha_limite || "") < (b.fecha_limite || "") ? -1 : 1;
        });
        return (
          <>
            <div className="h4" style={{ marginTop: 0 }}>📌 Destacados del feed</div>
            <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
              Suben a la cabecera del feed. Los casos con fecha límite en 15 días o menos ya suben
              solos — aquí es para lo que no tiene fecha, o para adelantarse. El destacado
              <b> caduca solo</b>: con la fecha límite del caso, o a las 2 semanas.
            </p>
            <div className="card">
              {lista.map((p: any) => {
                const d = p.fecha_limite ? dias(p.fecha_limite) : null;
                return (
                  <div className="info-row" key={p.id} style={{ gap: 10, flexWrap: "wrap" }}>
                    <span className="badge" style={{
                      color: TIPO_COL[p.tipo] || "var(--muted)",
                      background: `${TIPO_COL[p.tipo] || "#8b8ba3"}22`,
                    }}>{p.tipo}</span>
                    <Link href={`/caso/${p.id}`} style={{ fontWeight: 600, fontSize: 12.5 }}>{p.titulo}</Link>
                    <span style={{ flex: 1 }} />
                    {d !== null && (
                      <span style={{ color: d <= 3 ? "var(--red)" : d <= 15 ? "var(--yellow)" : "var(--dim)", fontSize: 11.5, fontWeight: 700 }}>
                        {d < 0 ? `vencido hace ${-d} d` : d === 0 ? "vence hoy" : `en ${d} d`}
                        {d >= 0 && d <= 15 && " · sube solo"}
                      </span>
                    )}
                    <BotonDestacar pubId={p.id} hasta={p.destacado_hasta} />
                  </div>
                );
              })}
              {!lista.length && <div className="empty">No hay casos vivos.</div>}
            </div>
          </>
        );
      })()}

      {s === "jornadas" && (
        <>
          <div className="h4" style={{ marginTop: 0 }}>✅ Aprobar jornadas</div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Jornadas pendientes de aprobación. Al aprobar, entran al monto "a pagar". Puedes editar o borrar si hay un error.
          </p>
          <BitacoraJornadas items={porAprobar} esAdmin miPersonaId="" proyectos={proyectos || []} titulo="⏳ Por aprobar" />
        </>
      )}

      {s === "liquidar" && (
        <>
          <div className="h4" style={{ marginTop: 0 }}>🧾 Liquidar mes · <span style={{ textTransform: "capitalize" }}>{MESES[lMes]} {lAnio}</span></div>
          <div className="vtabs" style={{ alignItems: "center", marginBottom: 8 }}>
            <Link href={`/admin?s=liquidar&lm=${lmOff - 1}`} className="vtab">‹ mes anterior</Link>
            {lmOff !== 0 && <Link href="/admin?s=liquidar" className="vtab">actual</Link>}
            {lmOff < 0 && <Link href={`/admin?s=liquidar&lm=${lmOff + 1}`} className="vtab">siguiente ›</Link>}
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Liquidar genera el recibo interno (congela lo aprobado) y bloquea el mes de esa persona. Solo se puede si no quedan jornadas por aprobar.
          </p>
          <LiquidacionAdmin anio={lAnio} mes={lMes + 1} filas={filasLiq} />
        </>
      )}

      {s === "rhe" && (
        <>
          <div className="h4" style={{ marginTop: 0 }}>🧾 RHE y tope de 4ta · {anioHoy}</div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Los recibos que giramos por cuenta de quienes nos delegan su clave SOL.
            Importan por dos razones: la rendición del fondo, y sobre todo el <b>tope de 4ta</b> —
            si alguien lo supera, su suspensión se rompe y corresponde retenerle el 8%
            por el resto del año. Nadie más se va a dar cuenta.
          </p>
          <RheAdmin anio={anioHoy}
            personas={(cobrables || []).map((p: any) => ({ id: p.id, nombre: p.alias || p.nombre, suspension_4ta_anio: p.suspension_4ta_anio }))}
            proyectos={proyectos || []} rhes={(rhes || []) as any} />
        </>
      )}

      {s === "tarifas" && (
        <>
          <div className="h4" style={{ marginTop: 0 }}>💰 Tarifas del personal</div>
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
            Tarifas por día (S/ normal, rodaje y noche), usadas para calcular el pago de jornadas.
          </p>
          <TarifasEditor personas={tarifaLista} abierto />
        </>
      )}
        </main>
      </div>
    </div>
  );
}
