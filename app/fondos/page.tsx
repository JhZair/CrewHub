import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { ejecutando, plazoRendicion, rendicionVencida, rendicionSinPlazo } from "@/lib/fondos";

export const metadata: Metadata = { title: "🎬 Fondos en ejecución" };

/* ── FONDOS EN EJECUCIÓN — el panel de los proyectos ganados ──
   Las postulaciones que ganaron dejan de ser expediente y pasan a ser dinero
   y obra en marcha. Aquí están todas juntas, con su reloj: cuándo rinden, si
   van tarde, si falta cargarles el desembolso. Cada una lleva a su página de
   ejecución. */

const fmt = (n: any) => "S/ " + Number(n || 0).toLocaleString("es-PE");
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

export default async function FondosPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.from("postulaciones")
    .select("id,codigo,estado,monto_adjudicado,fecha_desembolso,fecha_limite_rendicion," +
      "fecha_prorroga,fecha_rendicion_real,proy:proyectos(nombre),conv:convocatorias(nombre,anio),emp:empresas(nombre)")
    .eq("estado", "ganadora");

  const fondos = (data || []) as any[];
  // En ejecución primero (los que aún deben algo), luego los rendidos.
  const vivos = fondos.filter(f => ejecutando(f));
  const rendidos = fondos.filter(f => !ejecutando(f));
  vivos.sort((a, b) => (plazoRendicion(a) || "9999") < (plazoRendicion(b) || "9999") ? -1 : 1);

  const ficha = (f: any) => {
    const vencida = rendicionVencida(f);
    const sinPlazo = rendicionSinPlazo(f);
    const rendido = !ejecutando(f);
    const chip = rendido
      ? { ico: "✅", txt: "Rendido", col: "var(--green)" }
      : vencida
        ? { ico: "🔴", txt: `Venció ${dmy(plazoRendicion(f))}`, col: "var(--red)" }
        : sinPlazo
          ? { ico: "⚠", txt: "Sin plazo cargado", col: "var(--yellow)" }
          : { ico: "🎬", txt: `Rinde ${dmy(plazoRendicion(f))}`, col: "var(--teal)" };
    return (
      <Link key={f.id} href={`/fondo/${f.id}`} className="card fondo-fila">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            🎬 {f.codigo}{f.proy?.nombre ? ` · ${f.proy.nombre}` : ""}
            {f.conv?.anio ? <span style={{ color: "var(--dim)", fontWeight: 400 }}> · {f.conv.anio}</span> : null}
          </div>
          <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 2 }}>
            {f.emp?.nombre ? `🏢 ${f.emp.nombre}` : ""}{f.conv?.nombre ? ` · ${f.conv.nombre}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: "var(--teal)", fontWeight: 700, fontSize: 13 }}>
            {f.monto_adjudicado ? fmt(f.monto_adjudicado) : "—"}
          </div>
          <div style={{ color: chip.col, fontSize: 11.5, marginTop: 2 }}>{chip.ico} {chip.txt}</div>
          {!f.fecha_desembolso && !rendido && (
            <div style={{ color: "var(--yellow)", fontSize: 10.5, marginTop: 1 }}>sin desembolso</div>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className="shell" style={{ maxWidth: "min(900px, 96vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>proyectos ganados, en marcha</span>
      </div>
      <h1 className="title-lg">🎬 Fondos en ejecución · {vivos.length}</h1>

      {vivos.length === 0 && rendidos.length === 0 && (
        <div className="empty">Aún no hay fondos ganados registrados.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {vivos.map(ficha)}
      </div>

      {rendidos.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: "var(--dim)", margin: "22px 0 8px", letterSpacing: .5 }}>
            ✅ Rendidos · {rendidos.length}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rendidos.map(ficha)}
          </div>
        </>
      )}
    </div>
  );
}
