import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function Proyectos() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: proys }, { data: vincs }] = await Promise.all([
    supabase.from("proyectos").select("*").order("folio"),
    supabase.from("publicacion_vinculos").select("entidad_id").eq("entidad_tipo", "proyecto"),
  ]);
  const conteo = new Map<string, number>();
  (vincs || []).forEach((v: any) => conteo.set(v.entidad_id, (conteo.get(v.entidad_id) || 0) + 1));

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="btn btn-ghost">← Feed</Link>
        <span className="spacer" />
        <Link href="/empresas" className="btn btn-ghost">🏢 Empresas</Link>
        <Link href="/entidad/proyecto/nuevo" className="btn">＋ Nuevo proyecto</Link>
      </div>
      <h1 className="title-lg">📁 Proyectos · {proys?.length || 0}</h1>
      {(proys || []).map((p: any) => (
        <Link key={p.id} href={`/entidad/proyecto/${p.id}`}>
          <div className="card link" style={{ cursor: "pointer" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span className="av" style={{ width: 14, height: 14, background: p.color || "#8b8ba3" }} />
              <b style={{ fontSize: 15 }}>{p.nombre}</b>
              {p.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.folio}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ color: "var(--muted)", fontSize: 12.5 }}>💬 {conteo.get(p.id) || 0} vinculadas</span>
              <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>
                {p.etapa || "—"}
              </span>
              <span className="badge" style={{
                color: p.estado_actividad === "activo" ? "var(--green)" : "var(--dim)",
                background: p.estado_actividad === "activo" ? "rgba(46,204,113,.12)" : "#1c1c2c",
              }}>{p.estado_actividad || "—"}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
