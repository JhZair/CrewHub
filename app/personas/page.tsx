import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Link from "next/link";
import { redirect } from "next/navigation";

const EST_META: Record<string, [string, string]> = {
  activo: ["Activos", "var(--green)"],
  potencial: ["Potenciales", "var(--yellow)"],
  inactivo: ["Inactivos", "var(--dim)"],
  vetado: ["Vetados", "var(--red)"],
};
const dias = (f: string) => Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

export default async function Personas({ searchParams }: {
  searchParams: { q?: string; e?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const listar = !!(q || e);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pers } = await supabase.from("personas")
    .select("id,nombre,alias,tipo,equipo,estado,rol,region,usuario_id,dni_vencimiento")
    .order("nombre");

  const todas = pers || [];
  const nrm = (s: any) => String(s || "").toLowerCase();
  const filtradas = todas.filter((p: any) =>
    (!e || p.estado === e) &&
    (!q || nrm(p.nombre).includes(nrm(q)) || nrm(p.alias).includes(nrm(q)) ||
      nrm(p.rol).includes(nrm(q)) || nrm(p.tipo).includes(nrm(q)) || nrm(p.equipo).includes(nrm(q)))
  ).slice(0, 150);

  const cnt = (est: string) => todas.filter((p: any) => p.estado === est).length;
  const equipoInterno = todas.filter((p: any) => p.usuario_id);
  const porTipo = new Map<string, number>();
  todas.forEach((p: any) => {
    const t = p.tipo || "contacto";
    porTipo.set(t, (porTipo.get(t) || 0) + 1);
  });
  const dniAlerta = todas
    .filter((p: any) => p.dni_vencimiento && dias(p.dni_vencimiento) <= 60)
    .sort((a: any, b: any) => (a.dni_vencimiento < b.dni_vencimiento ? -1 : 1)).slice(0, 8);

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/entidad/persona/nuevo" className="btn">＋ Nueva persona</Link>
      </div>
      <h1 className="title-lg">👤 Personas</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, alias, rol, tipo o equipo..."
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", outline: "none", fontSize: 13.5 }} />
        <button className="btn" type="submit">Buscar</button>
        {listar && <Link href="/personas" className="btn btn-ghost">✕ Panel</Link>}
      </form>

      {!listar && (
        <>
          <div className="stat-grid">
            {Object.entries(EST_META).map(([est, [lbl, col]]) => (
              <Link key={est} href={`/personas?e=${est}`} className="stat-card">
                <div className="stat-n" style={{ color: col }}>{cnt(est)}</div>
                <div className="stat-l">{lbl}</div>
              </Link>
            ))}
            <Link href="/personas?q=" className="stat-card">
              <div className="stat-n" style={{ color: "var(--violet)" }}>{equipoInterno.length}</div>
              <div className="stat-l">⬡ equipo interno</div>
            </Link>
          </div>

          {dniAlerta.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(244,180,0,.35)" }}>
              <div className="panel-h" style={{ color: "var(--yellow)" }}>🪪 DNI vencidos o por vencer (60 días)</div>
              {dniAlerta.map((p: any) => {
                const d = dias(p.dni_vencimiento);
                return (
                  <div className="info-row" key={p.id}>
                    <Link href={`/entidad/persona/${p.id}`} style={{ fontWeight: 600, flex: 1 }}>{p.nombre}</Link>
                    <span style={{ color: d < 0 ? "var(--red)" : "var(--yellow)", fontSize: 12.5, fontWeight: 700 }}>
                      {d < 0 ? `vencido hace ${-d} días` : `vence ${fmt(p.dni_vencimiento)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="card">
            <div className="panel-h">📇 Composición del padrón · {todas.length} personas</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[...porTipo.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <Link key={t} href={`/personas?q=${encodeURIComponent(t)}`} className="vtab">
                  {t} · {n}
                </Link>
              ))}
            </div>
          </div>

          <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", margin: "6px 0 14px" }}>
            Usa el buscador o un estado para ver la lista.
          </div>
        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: 13, margin: "2px 4px 10px" }}>
            {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}{q && ` · «${q}»`}
          </div>
          {filtradas.map((p: any) => (
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
                  <span className="badge" style={{ color: EST_META[p.estado]?.[1] || "var(--muted)", background: "#1c1c2c" }}>{p.estado}</span>
                </div>
              </div>
            </Link>
          ))}
          {!filtradas.length && <div className="empty">Sin resultados para «{q}».</div>}
          {filtradas.length === 150 && <div className="empty">Mostrando 150 — afina la búsqueda para ver más.</div>}
        </>
      )}
    </div>
  );
}
