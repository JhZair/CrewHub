import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function Empresas() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: emps }, { data: vincs }] = await Promise.all([
    supabase.from("empresas").select("*").order("codigo"),
    supabase.from("publicacion_vinculos").select("entidad_id").eq("entidad_tipo", "empresa"),
  ]);
  const conteo = new Map<string, number>();
  (vincs || []).forEach((v: any) => conteo.set(v.entidad_id, (conteo.get(v.entidad_id) || 0) + 1));

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="btn btn-ghost">← Feed</Link>
        <span className="spacer" />
        <Link href="/proyectos" className="btn btn-ghost">📁 Proyectos</Link>
        <Link href="/entidad/empresa/nuevo" className="btn">＋ Nueva empresa</Link>
      </div>
      <h1 className="title-lg">🏢 Empresas · {emps?.length || 0}</h1>
      {(emps || []).map((e: any) => (
        <Link key={e.id} href={`/entidad/empresa/${e.id}`}>
          <div className="card link" style={{ cursor: "pointer" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>{e.nombre}</b>
              {e.codigo && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{e.codigo}</span>}
              {e.ruc && <span style={{ color: "var(--dim)", fontSize: 12 }}>RUC {e.ruc}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ color: "var(--muted)", fontSize: 12.5 }}>💬 {conteo.get(e.id) || 0} vinculadas</span>
              <span className="badge" style={{
                color: e.estado === "activa" ? "var(--green)" : "var(--dim)",
                background: e.estado === "activa" ? "rgba(46,204,113,.12)" : "#1c1c2c",
              }}>{e.estado || "—"}</span>
            </div>
          </div>
        </Link>
      ))}
      {!emps?.length && <div className="empty">Sin empresas aún — ejecuta la semilla SQL que te pasé.</div>}
    </div>
  );
}
