import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { TIPO_COLOR } from "@/lib/entidades";
import Link from "next/link";
import { redirect } from "next/navigation";

const ETAPAS: [string, string][] = [
  ["idea", "💡 Idea"], ["en_carpeta", "🗂 En carpeta"], ["desarrollo", "✍ Desarrollo"],
  ["preproduccion", "📋 Preproducción"], ["produccion", "🎬 Producción"],
  ["postproduccion", "🎞 Postproducción"], ["finalizado", "✅ Finalizados"],
];
const ETAPA_COLOR: Record<string, string> = {
  idea: "var(--dim)", en_carpeta: "var(--dim)", desarrollo: "var(--violet)",
  preproduccion: "var(--blue)", produccion: "var(--yellow)",
  postproduccion: "var(--teal)", finalizado: "var(--green)",
};

export default async function Proyectos({ searchParams }: {
  searchParams: { q?: string; et?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const et = searchParams?.et || "";
  const listar = !!(q || et);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: proys }, { data: vincs }] = await Promise.all([
    supabase.from("proyectos").select("*").order("folio"),
    supabase.from("publicacion_vinculos").select("entidad_id").eq("entidad_tipo", "proyecto"),
  ]);
  const conteo = new Map<string, number>();
  (vincs || []).forEach((v: any) => conteo.set(v.entidad_id, (conteo.get(v.entidad_id) || 0) + 1));

  const todos = proys || [];
  const nrm = (s: any) => String(s || "").toLowerCase();
  const filtrados = todos.filter((p: any) =>
    (!et || p.etapa === et) &&
    (!q || nrm(p.nombre).includes(nrm(q)) || nrm(p.nombre_corto).includes(nrm(q)) || nrm(p.folio).includes(nrm(q))));
  const cntEt = (x: string) => todos.filter((p: any) => p.etapa === x).length;

  const enMarcha = todos.filter((p: any) =>
    ["desarrollo", "preproduccion", "produccion", "postproduccion"].includes(p.etapa));
  const bloqueados = todos.filter((p: any) => p.estado_actividad === "bloqueado");
  const masConversados = [...todos]
    .map((p: any) => ({ ...p, nc: conteo.get(p.id) || 0 }))
    .filter((p: any) => p.nc > 0)
    .sort((a: any, b: any) => b.nc - a.nc).slice(0, 5);

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/empresas" className="btn btn-ghost">🏢 Empresas</Link>
        <Link href="/entidad/proyecto/nuevo" className="btn">＋ Nuevo proyecto</Link>
      </div>
      <h1 className="title-lg">📁 Proyectos</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {et && <input type="hidden" name="et" value={et} />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre o folio..."
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", outline: "none", fontSize: 13.5 }} />
        <button className="btn" type="submit">Buscar</button>
        {listar && <Link href="/proyectos" className="btn btn-ghost">✕ Panel</Link>}
      </form>

      {!listar && (
        <>
          <div className="stat-grid">
            {ETAPAS.map(([x, lbl]) => (
              <Link key={x} href={`/proyectos?et=${x}`} className="stat-card">
                <div className="stat-n" style={{ color: ETAPA_COLOR[x] }}>{cntEt(x)}</div>
                <div className="stat-l">{lbl}</div>
              </Link>
            ))}
          </div>

          {bloqueados.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>🚧 Bloqueados — necesitan destrabe</div>
              {bloqueados.map((p: any) => (
                <div className="info-row" key={p.id}>
                  <Link href={`/entidad/proyecto/${p.id}`} style={{ fontWeight: 600 }}>
                    {p.folio ? `${p.folio} · ` : ""}{p.nombre}
                  </Link>
                  <span style={{ flex: 1 }} />
                  <span className="badge" style={{ color: ETAPA_COLOR[p.etapa] || "var(--dim)", background: "#1c1c2c" }}>
                    {(p.etapa || "—").replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="panel-h">🎬 En marcha ahora · {enMarcha.length}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {enMarcha.map((p: any) => (
                <Link key={p.id} href={`/entidad/proyecto/${p.id}`} className="vtab"
                  style={{ borderColor: "transparent", borderLeft: `3px solid ${p.color || ETAPA_COLOR[p.etapa] || "var(--border)"}` }}>
                  {p.nombre_corto || p.nombre}
                </Link>
              ))}
              {!enMarcha.length && <span style={{ color: "var(--dim)", fontSize: 13 }}>Ninguno en etapas activas.</span>}
            </div>
          </div>

          {masConversados.length > 0 && (
            <div className="card">
              <div className="panel-h">💬 Los más conversados</div>
              {masConversados.map((p: any) => (
                <div className="info-row" key={p.id}>
                  <Link href={`/entidad/proyecto/${p.id}`} style={{ fontWeight: 600, flex: 1 }}>
                    {p.folio ? `${p.folio} · ` : ""}{p.nombre}
                  </Link>
                  <span style={{ color: "var(--muted)", fontSize: 12.5 }}>💬 {p.nc}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", margin: "6px 0 14px" }}>
            {todos.length} proyectos en total — usa el buscador o una etapa para ver la lista.
          </div>
        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: 13, margin: "2px 4px 10px" }}>
            {filtrados.length} resultado{filtrados.length === 1 ? "" : "s"}
            {et && ` · ${et.replace(/_/g, " ")}`}{q && ` · «${q}»`}
          </div>
          {filtrados.map((p: any) => (
            <Link key={p.id} href={`/entidad/proyecto/${p.id}`}>
              <div className="card link" style={{ cursor: "pointer", padding: "12px 16px" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="av" style={{ width: 14, height: 14, background: p.color || "#8b8ba3" }} />
                  <b style={{ fontSize: 15 }}>{p.nombre}</b>
                  {p.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.folio}</span>}
                  {p.tipo && (
                    <span className="badge" style={{
                      color: TIPO_COLOR[p.tipo] || "var(--muted)",
                      background: `${TIPO_COLOR[p.tipo] || "#8b8ba3"}1c`,
                    }}>{p.tipo.replace(/_/g, " ")}</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "var(--muted)", fontSize: 12.5 }}>💬 {conteo.get(p.id) || 0}</span>
                  <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>
                    {(p.etapa || "—").replace(/_/g, " ")}
                  </span>
                  <span className="badge" style={{
                    color: p.estado_actividad === "activo" ? "var(--green)" : p.estado_actividad === "bloqueado" ? "var(--red)" : "var(--dim)",
                    background: "#1c1c2c",
                  }}>{(p.estado_actividad || "—").replace(/_/g, " ")}</span>
                </div>
              </div>
            </Link>
          ))}
          {!filtrados.length && <div className="empty">Sin resultados{q && ` para «${q}»`}.</div>}
        </>
      )}
    </div>
  );
}
