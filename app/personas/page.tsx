import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

const EST_COLOR: Record<string, string> = {
  activo: "var(--green)", potencial: "var(--yellow)",
  vetado: "var(--red)", inactivo: "var(--dim)",
};

export default async function Personas({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams?.q || "").trim();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let query = supabase.from("personas")
    .select("id,nombre,alias,tipo,equipo,estado,rol,region,usuario_id")
    .order("nombre").limit(150);
  if (q) query = query.or(`nombre.ilike.%${q}%,alias.ilike.%${q}%,rol.ilike.%${q}%`);
  const [{ data: pers }, { count: total }] = await Promise.all([
    query,
    supabase.from("personas").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="btn btn-ghost">← Feed</Link>
        <span className="spacer" />
        <Link href="/entidad/persona/nuevo" className="btn">＋ Nueva persona</Link>
      </div>
      <h1 className="title-lg">👤 Personas · {total || 0}</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, alias o rol..."
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", outline: "none", fontSize: 13.5 }} />
        <button className="btn" type="submit">Buscar</button>
      </form>

      {(pers || []).map((p: any) => (
        <Link key={p.id} href={`/entidad/persona/${p.id}`}>
          <div className="card link" style={{ cursor: "pointer", padding: "12px 16px" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 14.5 }}>{p.nombre}</b>
              {p.usuario_id && <span title="Usuario del sistema">⬡</span>}
              {p.alias && <span style={{ color: "var(--dim)", fontSize: 12 }}>({p.alias})</span>}
              {p.rol && <span style={{ color: "var(--muted)", fontSize: 12 }}>{p.rol.slice(0, 40)}</span>}
              <span style={{ flex: 1 }} />
              {p.equipo && <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>{p.equipo}</span>}
              <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.tipo || "contacto"}</span>
              <span className="badge" style={{ color: EST_COLOR[p.estado] || "var(--muted)", background: "#1c1c2c" }}>{p.estado}</span>
            </div>
          </div>
        </Link>
      ))}
      {!pers?.length && <div className="empty">Sin resultados para «{q}».</div>}
      {(pers || []).length === 150 && <div className="empty">Mostrando 150 — afina la búsqueda para ver más.</div>}
    </div>
  );
}
