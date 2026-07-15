import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import BotonComprobar from "@/components/BotonComprobar";
import BotonDevolver from "@/components/BotonDevolver";
import Link from "next/link";
import { redirect } from "next/navigation";

const diasDesde = (f: string) => Math.floor((Date.now() - new Date(f + "T12:00:00").getTime()) / 86400000);

const EST_META: Record<string, [string, string]> = {
  disponible: ["Disponibles", "var(--green)"],
  en_uso: ["En uso", "var(--yellow)"],
  en_reparacion: ["En reparación", "#f59e0b"],
  perdido: ["Perdidos", "var(--red)"],
  de_baja: ["De baja", "var(--dim)"],
};

export default async function Equipamiento({ searchParams }: {
  searchParams: { q?: string; e?: string; ronda?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const ronda = searchParams?.ronda === "1";
  const listar = !!(q || e || ronda);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: eqs }, { data: enManos }] = await Promise.all([
    supabase.from("equipamiento")
      .select("id,folio,nombre,categoria,subcategoria,estado,valor_compra,ultima_comprobacion")
      .order("folio"),
    supabase.from("equipo_prestamos")
      .select("id,desde,equipo:equipamiento(id,folio,nombre),persona:personas(id,nombre,alias),proy:proyectos(id,nombre)")
      .is("hasta", null).order("desde", { ascending: false }),
  ]);

  const todos = eqs || [];
  const nrm = (s: any) => String(s || "").toLowerCase();
  const porComprobar = (x: any) =>
    !["de_baja"].includes(x.estado) &&
    (!x.ultima_comprobacion || diasDesde(x.ultima_comprobacion) > 90);
  const filtrados = todos.filter((x: any) =>
    (!e || x.estado === e) &&
    (!ronda || porComprobar(x)) &&
    (!q || nrm(x.nombre).includes(nrm(q)) || nrm(x.folio).includes(nrm(q)) ||
      nrm(x.categoria).includes(nrm(q)) || nrm(x.subcategoria).includes(nrm(q)))
  ).slice(0, 200);
  const pendientesRonda = todos.filter(porComprobar).length;

  const cnt = (est: string) => todos.filter((x: any) => x.estado === est).length;
  const valorTotal = todos
    .filter((x: any) => !["de_baja", "perdido"].includes(x.estado))
    .reduce((s: number, x: any) => s + (parseFloat(x.valor_compra) || 0), 0);
  const atencion = todos.filter((x: any) => ["en_reparacion", "perdido"].includes(x.estado));
  const porCat = new Map<string, number>();
  todos.forEach((x: any) => {
    const c = x.categoria || "sin categoría";
    porCat.set(c, (porCat.get(c) || 0) + 1);
  });

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/historial/equipamiento" className="btn btn-ghost"
          title="Todo lo que se movió en los equipos, por periodo">🕐 Historial</Link>
        <Link href="/entidad/equipamiento/nuevo" className="btn">＋ Nuevo equipo</Link>
      </div>
      <h1 className="title-lg">🎥 Equipos audiovisuales</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, folio o categoría..."
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", outline: "none", fontSize: 13.5 }} />
        <button className="btn" type="submit">Buscar</button>
        {listar && <Link href="/equipamiento" className="btn btn-ghost">✕ Panel</Link>}
      </form>

      {!listar && (
        <>
          <div className="stat-grid">
            {Object.entries(EST_META).map(([est, [lbl, col]]) => (
              <Link key={est} href={`/equipamiento?e=${est}`} className="stat-card">
                <div className="stat-n" style={{ color: col }}>{cnt(est)}</div>
                <div className="stat-l">{lbl}</div>
              </Link>
            ))}
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>
                S/ {Math.round(valorTotal).toLocaleString("es-PE")}
              </span>
              <span className="stat-l">valor del inventario activo</span>
            </span>
            <Link href="/equipamiento?ronda=1" className="stat-card"
              style={pendientesRonda > 0 ? { borderColor: "rgba(244,180,0,.4)" } : undefined}>
              <div className="stat-n" style={{ color: pendientesRonda > 0 ? "var(--yellow)" : "var(--green)" }}>
                {pendientesRonda}
              </div>
              <div className="stat-l">🔍 por comprobar (90+ días)</div>
            </Link>
          </div>

          {(enManos || []).length > 0 && (
            <div className="card">
              <div className="panel-h" style={{ color: "var(--yellow)" }}>🤝 En uso ahora — quién tiene qué</div>
              {(enManos || []).map((p: any) => (
                <div className="info-row" key={p.id}>
                  {p.equipo?.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.equipo.folio}</span>}
                  <Link href={`/entidad/equipamiento/${p.equipo?.id}`} style={{ fontWeight: 600 }}>
                    {p.equipo?.nombre} →
                  </Link>
                  <span style={{ color: "var(--dim)", fontSize: 12 }}>en manos de</span>
                  <Link href={`/entidad/persona/${p.persona?.id}`} style={{ color: "var(--teal)", fontWeight: 600, fontSize: 12.5 }}>
                    👤 {p.persona?.alias || p.persona?.nombre}
                  </Link>
                  {p.proy && (
                    <Link href={`/entidad/proyecto/${p.proy.id}`} className="badge"
                      style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>📁 {p.proy.nombre}</Link>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                    desde {new Date(p.desde + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                  </span>
                  <BotonDevolver prestamoId={p.id} equipoId={p.equipo?.id} />
                </div>
              ))}
            </div>
          )}

          {atencion.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>🔧 Requieren atención</div>
              {atencion.map((x: any) => (
                <div className="info-row" key={x.id}>
                  {x.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{x.folio}</span>}
                  <Link href={`/entidad/equipamiento/${x.id}`} style={{ fontWeight: 600, flex: 1 }}>{x.nombre}</Link>
                  <span style={{ color: x.estado === "perdido" ? "var(--red)" : "#f59e0b", fontSize: 12.5, fontWeight: 700 }}>
                    {x.estado.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="panel-h">📦 Inventario por categoría · {todos.length} activos</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[...porCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                <Link key={c} href={`/equipamiento?q=${encodeURIComponent(c)}`} className="vtab">
                  {c} · {n}
                </Link>
              ))}
            </div>
          </div>

          <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", margin: "6px 0 14px" }}>
            Usa el buscador, un estado o una categoría para ver la lista.
          </div>
        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: 13, margin: "2px 4px 10px" }}>
            {ronda && <b style={{ color: "var(--yellow)" }}>🔍 MODO RONDA — marca cada equipo que veas físicamente · </b>}
            {filtrados.length} resultado{filtrados.length === 1 ? "" : "s"}
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}{q && ` · «${q}»`}
          </div>
          {filtrados.map((x: any) => (
            <Link key={x.id} href={`/entidad/equipamiento/${x.id}`}>
              <div className="card link" style={{ cursor: "pointer", padding: "12px 16px" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  {x.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{x.folio}</span>}
                  <b style={{ fontSize: 14.5, flex: 1 }}>{x.nombre}</b>
                  {x.categoria && <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>{x.categoria}</span>}
                  {x.subcategoria && <span style={{ color: "var(--dim)", fontSize: 12 }}>{x.subcategoria}</span>}
                  <BotonComprobar equipoId={x.id} ultima={x.ultima_comprobacion} compacto={!ronda} />
                  <span className="badge" style={{ color: EST_META[x.estado]?.[1] || "var(--muted)", background: "#1c1c2c" }}>
                    {(x.estado || "").replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {!filtrados.length && <div className="empty">Sin equipos {q && `para «${q}»`}.</div>}
          {filtrados.length === 150 && <div className="empty">Mostrando 150 — afina la búsqueda.</div>}
        </>
      )}
    </div>
  );
}
