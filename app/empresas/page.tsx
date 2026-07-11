import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Link from "next/link";
import { redirect } from "next/navigation";

const EST_META: Record<string, [string, string]> = {
  activa: ["Activas", "var(--green)"],
  en_constitucion: ["En constitución", "var(--yellow)"],
  inactiva: ["Inactivas", "var(--dim)"],
  cerrada: ["Cerradas", "var(--dim)"],
};

export default async function Empresas({ searchParams }: {
  searchParams: { q?: string; e?: string; sunat?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const sunat = searchParams?.sunat === "1";
  const listar = !!(q || e || sunat);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: emps }, { data: vincs }] = await Promise.all([
    supabase.from("empresas").select("*").order("codigo"),
    supabase.from("publicacion_vinculos").select("entidad_id").eq("entidad_tipo", "empresa"),
  ]);
  const conteo = new Map<string, number>();
  (vincs || []).forEach((v: any) => conteo.set(v.entidad_id, (conteo.get(v.entidad_id) || 0) + 1));

  const todas = emps || [];
  const nrm = (s: any) => String(s || "").toLowerCase();
  const alertas = todas.filter((x: any) => x.estado_sunat && x.estado_sunat !== "activo");
  const filtradas = todas.filter((x: any) =>
    (!e || x.estado === e) &&
    (!sunat || (x.estado_sunat && x.estado_sunat !== "activo")) &&
    (!q || nrm(x.nombre).includes(nrm(q)) || nrm(x.razon_social).includes(nrm(q)) ||
      nrm(x.codigo).includes(nrm(q)) || nrm(x.ruc).includes(nrm(q))));
  const cnt = (est: string) => todas.filter((x: any) => x.estado === est).length;

  const Fila = (emp: any) => (
    <Link key={emp.id} href={`/entidad/empresa/${emp.id}`}>
      <div className="card link" style={{ cursor: "pointer", padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 15 }}>{emp.nombre}</b>
          {emp.razon_social && <span style={{ color: "var(--dim)", fontSize: 12 }}>{emp.razon_social}</span>}
          {emp.codigo && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{emp.codigo}</span>}
          {emp.ruc && <span style={{ color: "var(--dim)", fontSize: 12 }}>RUC {emp.ruc}</span>}
          {emp.estado_sunat && emp.estado_sunat !== "activo" && (
            <span className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.12)" }}>
              ⚠ SUNAT: {emp.estado_sunat.replace(/_/g, " ")}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ color: "var(--muted)", fontSize: 12.5 }}>💬 {conteo.get(emp.id) || 0}</span>
          <span className="badge" style={{
            color: EST_META[emp.estado]?.[1] || "var(--dim)", background: "#1c1c2c",
          }}>{(emp.estado || "—").replace(/_/g, " ")}</span>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/proyectos" className="btn btn-ghost">📁 Proyectos</Link>
        <Link href="/entidad/empresa/nuevo" className="btn">＋ Nueva empresa</Link>
      </div>
      <h1 className="title-lg">🏢 Empresas</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        {sunat && <input type="hidden" name="sunat" value="1" />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, razón social, código o RUC..."
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", outline: "none", fontSize: 13.5 }} />
        <button className="btn" type="submit">Buscar</button>
        {listar && <Link href="/empresas" className="btn btn-ghost">✕ Panel</Link>}
      </form>

      {!listar && (
        <>
          <div className="stat-grid">
            {Object.entries(EST_META).map(([est, [lbl, col]]) => (
              <Link key={est} href={`/empresas?e=${est}`} className="stat-card">
                <div className="stat-n" style={{ color: col }}>{cnt(est)}</div>
                <div className="stat-l">{lbl}</div>
              </Link>
            ))}
            <Link href="/empresas?sunat=1" className="stat-card">
              <div className="stat-n" style={{ color: alertas.length ? "var(--red)" : "var(--green)" }}>
                {alertas.length}
              </div>
              <div className="stat-l">⚠ alertas SUNAT</div>
            </Link>
          </div>

          {alertas.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>⚠ Salud SUNAT — requiere atención</div>
              {alertas.map((x: any) => (
                <div className="info-row" key={x.id}>
                  <Link href={`/entidad/empresa/${x.id}`} style={{ fontWeight: 600 }}>
                    {x.codigo ? `${x.codigo} · ` : ""}{x.nombre}
                  </Link>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>
                    {x.estado_sunat.replace(/_/g, " ")}
                    {x.condicion_sunat && x.condicion_sunat !== "habido" ? ` · ${x.condicion_sunat.replace(/_/g, " ")}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="panel-h">🏢 Las {todas.length} empresas del grupo</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {todas.map((x: any) => (
                <Link key={x.id} href={`/entidad/empresa/${x.id}`} className="vtab"
                  style={x.estado_sunat && x.estado_sunat !== "activo" ? { borderColor: "var(--red)" } : undefined}>
                  {x.nombre}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: 13, margin: "2px 4px 10px" }}>
            {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}{sunat && " · con alerta SUNAT"}{q && ` · «${q}»`}
          </div>
          {filtradas.map(Fila)}
          {!filtradas.length && <div className="empty">Sin resultados{q && ` para «${q}»`}.</div>}
        </>
      )}
    </div>
  );
}
