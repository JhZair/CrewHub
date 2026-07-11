import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import LineaTiempo, { type EventoLT } from "@/components/LineaTiempo";
import { TIPO_COLOR } from "@/lib/entidades";
import Link from "next/link";
import { redirect } from "next/navigation";

const EST_META: Record<string, [string, string]> = {
  en_preparacion: ["🛠 En preparación", "var(--violet)"],
  enviada: ["📨 Enviadas", "var(--blue)"],
  finalista: ["⭐ Finalistas", "var(--yellow)"],
  ganadora: ["🏆 Ganadoras", "var(--green)"],
  no_seleccionada: ["✖ No seleccionadas", "var(--dim)"],
  retirada: ["↩ Retiradas", "var(--dim)"],
};
const dias = (f: string) => Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });
const colorD = (d: number) => (d <= 2 ? "var(--red)" : d <= 7 ? "var(--yellow)" : "var(--muted)");

export default async function Postulaciones({ searchParams }: {
  searchParams: { q?: string; e?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const listar = !!(q || e);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: postsAll, error: qErr } = await supabase.from("postulaciones")
    .select("id,codigo,estado,monto_adjudicado,fecha_limite_rendicion,fecha_prorroga,creado_en,conv:convocatorias(id,codigo,nombre,anio,estado,monto_adjudicado),proy:proyectos(id,nombre,tipo),emp:empresas(id,nombre)")
    .order("creado_en", { ascending: false });

  const posts = postsAll || [];
  const nrm = (s: any) => String(s || "").toLowerCase();
  const filtradas = posts.filter((p: any) =>
    (!e || p.estado === e) &&
    (!q || nrm(p.codigo).includes(nrm(q)) || nrm(p.proy?.nombre).includes(nrm(q)) ||
      nrm(p.emp?.nombre).includes(nrm(q)) || nrm(p.conv?.codigo).includes(nrm(q)) ||
      nrm(p.conv?.nombre).includes(nrm(q)) || String(p.conv?.anio || "").includes(q)));

  const cnt = (est: string) => posts.filter((p: any) => p.estado === est).length;
  const ganas = posts.filter((p: any) => p.estado === "ganadora");
  const enJuego = posts.filter((p: any) => ["en_preparacion", "enviada", "finalista"].includes(p.estado));
  const decididas = posts.length - enJuego.length;
  const efectividad = decididas > 0 ? Math.round((ganas.length / decididas) * 100) : null;
  const montoHist = ganas.reduce((s: number, g: any) => s + (parseFloat(g.monto_adjudicado) || 0), 0);
  const rutas = enJuego.sort((a: any, b: any) => ((b.conv?.anio || 0) - (a.conv?.anio || 0)));
  // Ejecución viva = rendición aún no vencida (aunque el concurso esté cerrado)
  const hoyS = new Date().toISOString().slice(0, 10);
  const enEjecucion = ganas.filter((g: any) => {
    const f = g.fecha_prorroga || g.fecha_limite_rendicion;
    return f ? f >= hoyS : (g.conv && g.conv.estado !== "cerrada");
  });
  const anios = posts.map((p: any) => p.conv?.anio).filter(Boolean);
  const porAnio = [...new Set(anios)].sort((a: any, b: any) => b - a);

  const Fila = (p: any) => (
    <Link key={p.id} href={`/entidad/postulacion/${p.id}`}>
      <div className="card link" style={{ cursor: "pointer", padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 14.5 }}>🎯 {p.codigo ? `${p.codigo} · ` : ""}{p.proy?.nombre || "—"}</b>
          {p.proy?.tipo && (
            <span className="badge" style={{
              color: TIPO_COLOR[p.proy.tipo] || "var(--muted)",
              background: `${TIPO_COLOR[p.proy.tipo] || "#8b8ba3"}1c`,
            }}>{p.proy.tipo.replace(/_/g, " ")}</span>
          )}
          {p.emp && <span style={{ color: "var(--dim)", fontSize: 12 }}>🏢 {p.emp.nombre}</span>}
          {p.conv && (
            <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>
              📜 {p.conv.codigo}{p.conv.anio ? ` · ${p.conv.anio}` : ""}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {p.estado === "ganadora" && p.monto_adjudicado && (
            <span style={{ color: "var(--teal)", fontSize: 12.5 }}>
              S/ {parseFloat(p.monto_adjudicado).toLocaleString("es-PE")}
            </span>
          )}
          <span className="badge" style={{ color: EST_META[p.estado]?.[1] || "var(--muted)", background: "#1c1c2c" }}>
            {(EST_META[p.estado]?.[0] || p.estado).replace(/^\S+ /, "")}
          </span>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/convocatorias" className="btn btn-ghost">📜 Convocatorias</Link>
      </div>
      <h1 className="title-lg">🎯 Postulaciones</h1>
      {qErr && (
        <div className="card" style={{ borderColor: "var(--red)", color: "var(--red)", fontSize: 13 }}>
          ⚠ Error al consultar postulaciones: {qErr.message}
        </div>
      )}

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        <input name="q" defaultValue={q} placeholder="Buscar por proyecto, código, empresa, concurso o año..."
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", outline: "none", fontSize: 13.5 }} />
        <button className="btn" type="submit">Buscar</button>
        {listar && <Link href="/postulaciones" className="btn btn-ghost">✕ Panel</Link>}
      </form>

      {!listar && (
        <>
          <div className="stat-grid">
            {(["en_preparacion", "enviada", "finalista", "ganadora", "no_seleccionada"] as const).map(est => (
              <Link key={est} href={`/postulaciones?e=${est}`} className="stat-card">
                <div className="stat-n" style={{ color: EST_META[est][1] }}>{cnt(est)}</div>
                <div className="stat-l">{EST_META[est][0]}</div>
              </Link>
            ))}
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>
                {efectividad != null ? `${efectividad}%` : "—"}
              </span>
              <span className="stat-l">efectividad · S/ {montoHist.toLocaleString("es-PE")} ganado</span>
            </span>
          </div>

          {rutas.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(59,130,246,.35)" }}>
              <div className="panel-h" style={{ color: "var(--blue)" }}>🎯 Rutas activas — en juego ahora</div>
              {rutas.map((p: any) => (
                <div className="info-row" key={p.id}>
                  <Link href={`/entidad/postulacion/${p.id}`} style={{ fontWeight: 600 }}>
                    {p.codigo ? `${p.codigo} · ` : ""}{p.proy?.nombre || "Proyecto"} →
                  </Link>
                  {p.proy?.tipo && (
                    <span className="badge" style={{
                      color: TIPO_COLOR[p.proy.tipo] || "var(--muted)",
                      background: `${TIPO_COLOR[p.proy.tipo] || "#8b8ba3"}1c`,
                    }}>{p.proy.tipo.replace(/_/g, " ")}</span>
                  )}
                  {p.conv && (
                    <Link href={`/entidad/convocatoria/${p.conv.id}`} className="badge"
                      style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>
                      📜 {p.conv.codigo}
                    </Link>
                  )}
                  <span style={{ flex: 1 }} />
                  {p.conv?.monto_adjudicado && (
                    <span style={{ color: "var(--teal)", fontSize: 12.5, fontWeight: 700 }}>
                      S/ {parseFloat(p.conv.monto_adjudicado).toLocaleString("es-PE")} en juego
                    </span>
                  )}
                  <span className="badge" style={{
                    color: EST_META[p.estado]?.[1] || "var(--blue)", background: "#1c1c2c",
                  }}>{(EST_META[p.estado]?.[0] || p.estado).toLowerCase()}</span>
                </div>
              ))}
            </div>
          )}

          {enEjecucion.length > 0 && (
            <div className="card">
              <div className="panel-h" style={{ color: "var(--green)" }}>🏆 Ganadoras en ejecución — camino a la rendición</div>
              <LineaTiempo eventos={enEjecucion
                .filter((g: any) => g.fecha_prorroga || g.fecha_limite_rendicion)
                .map((g: any): EventoLT => {
                  const f = g.fecha_prorroga || g.fecha_limite_rendicion;
                  return {
                    fecha: f,
                    titulo: `Rendición: ${g.proy?.nombre || "Proyecto"}${g.monto_adjudicado ? ` · S/ ${parseFloat(g.monto_adjudicado).toLocaleString("es-PE")}` : ""}${g.fecha_prorroga ? " (prórroga)" : ""}`,
                    icono: "🧾",
                    color: dias(f) < 60 ? "var(--red)" : dias(f) < 180 ? "var(--yellow)" : "var(--green)",
                    chip: g.conv?.codigo,
                    href: `/entidad/postulacion/${g.id}`,
                  };
                })} />
              {enEjecucion.filter((g: any) => !g.fecha_prorroga && !g.fecha_limite_rendicion).map((g: any) => (
                <div className="info-row" key={g.id} style={{ marginTop: 6 }}>
                  <Link href={`/entidad/postulacion/${g.id}`} style={{ fontWeight: 600 }}>
                    🏆 {g.proy?.nombre || "Proyecto"} →
                  </Link>
                  <span style={{ color: "var(--yellow)", fontSize: 12 }}>⚠ sin fecha de rendición registrada</span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="panel-h">🗂 Historia · {posts.length} postulaciones</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {porAnio.map((a: any) => (
                <Link key={a} href={`/postulaciones?q=${a}`} className="vtab">
                  {a} · {anios.filter((x: any) => x === a).length}
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
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}{q && ` · «${q}»`}
          </div>
          {filtradas.map(Fila)}
          {!filtradas.length && <div className="empty">Sin resultados.</div>}
        </>
      )}
    </div>
  );
}
