import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import TarifasEditor from "@/components/TarifasEditor";
import BitacoraJornadas from "@/components/BitacoraJornadas";
import LiquidacionAdmin from "@/components/LiquidacionAdmin";
import Link from "next/link";
import { redirect } from "next/navigation";

/* Administración — temas de gestión que el usuario común no toca:
   aprobar jornadas, liquidar el mes (recibos) y tarifas del personal. */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default async function Admin({ searchParams }: { searchParams: { lm?: string } }) {
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

  const [{ data: personas }, { data: jornsPend }, { data: proyectos }, { data: jornsMes }, { data: liqs }] = await Promise.all([
    supabase.from("personas").select("id,nombre,alias,tarifa_dia,tarifa_rodaje,tarifa_noche")
      .eq("tipo", "personal").order("nombre"),
    supabase.from("jornadas")
      .select("id,persona_id,fecha,proyecto_id,tipo,fraccion,noche,monto,aprobada,per:personas(nombre,alias),proy:proyectos(nombre)")
      .eq("aprobada", false).order("fecha", { ascending: false }).limit(400),
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    supabase.from("jornadas").select("persona_id,fraccion,monto,aprobada,per:personas(nombre,alias)")
      .gte("fecha", lInicio).lt("fecha", lFin).limit(3000),
    supabase.from("liquidaciones").select("persona_id,estado").eq("anio", lAnio).eq("mes", lMes + 1),
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

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>solo administración</span>
      </div>
      <h1 className="title-lg">⚙ Administración</h1>

      <div className="h4" style={{ marginTop: 14 }}>✅ Aprobar jornadas</div>
      <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
        Jornadas pendientes de aprobación. Al aprobar, entran al monto "a pagar". Puedes editar o borrar si hay un error.
      </p>
      <BitacoraJornadas items={porAprobar} esAdmin miPersonaId="" proyectos={proyectos || []} titulo="⏳ Por aprobar" />

      <div className="h4" style={{ marginTop: 20 }}>🧾 Liquidar mes · <span style={{ textTransform: "capitalize" }}>{MESES[lMes]} {lAnio}</span></div>
      <div className="vtabs" style={{ alignItems: "center", marginBottom: 8 }}>
        <Link href={`/admin?lm=${lmOff - 1}`} className="vtab">‹ mes anterior</Link>
        {lmOff !== 0 && <Link href="/admin" className="vtab">actual</Link>}
        {lmOff < 0 && <Link href={`/admin?lm=${lmOff + 1}`} className="vtab">siguiente ›</Link>}
      </div>
      <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
        Liquidar genera el recibo interno (congela lo aprobado) y bloquea el mes de esa persona. Solo se puede si no quedan jornadas por aprobar.
      </p>
      <LiquidacionAdmin anio={lAnio} mes={lMes + 1} filas={filasLiq} />

      <div className="h4" style={{ marginTop: 20 }}>💰 Tarifas del personal</div>
      <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 0 }}>
        Tarifas por día (S/ normal, rodaje y noche), usadas para calcular el pago de jornadas.
      </p>
      <TarifasEditor personas={tarifaLista} abierto />
    </div>
  );
}
