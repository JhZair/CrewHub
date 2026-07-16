import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
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

const ACTIVIDAD: [string, string, string][] = [
  ["activo", "🟢 Activos", "var(--green)"],
  ["bloqueado", "🚧 Bloqueados", "var(--red)"],
  ["pausado", "⏸ Pausados", "var(--blue)"],
];
const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];

export default async function Proyectos({ searchParams }: {
  searchParams: { q?: string; et?: string; t?: string; ac?: string; f?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const et = searchParams?.et || "";
  const t = searchParams?.t || "";
  const ac = searchParams?.ac || "";
  const f = searchParams?.f || "";
  const listar = !!(q || et || t || ac || f);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: proys }, { data: vincs }, { data: coms }] = await Promise.all([
    supabase.from("proyectos").select("*").order("folio"),
    supabase.from("publicacion_vinculos")
      .select("entidad_id,publicacion_id,pub:publicaciones(estado)").eq("entidad_tipo", "proyecto"),
    supabase.from("comentarios").select("publicacion_id"),
  ]);

  /* Casos y comentarios son cosas distintas y se contaban como una sola:
     `conteo` salía de publicacion_vinculos —o sea, CASOS— y se pintaba como
     "💬", con un panel llamado "los más conversados". Un proyecto con diez
     casos y cero comentarios figuraba como el más conversado del equipo. */
  const comentPorPub = new Map<string, number>();
  (coms || []).forEach((c: any) => comentPorPub.set(c.publicacion_id, (comentPorPub.get(c.publicacion_id) || 0) + 1));

  type Act = { casos: number; abiertos: number; coments: number };
  const act = new Map<string, Act>();
  (vincs || []).forEach((v: any) => {
    const x = act.get(v.entidad_id) || { casos: 0, abiertos: 0, coments: 0 };
    x.casos++;
    if (ABIERTOS.includes((v.pub as any)?.estado)) x.abiertos++;
    x.coments += comentPorPub.get(v.publicacion_id) || 0;
    act.set(v.entidad_id, x);
  });
  const VACIO: Act = { casos: 0, abiertos: 0, coments: 0 };

  const todos = proys || [];
  const nrm = (s: any) => String(s || "").toLowerCase();
  const tipos = [...new Set(todos.map((p: any) => p.tipo).filter(Boolean))];

  const PRUEBA_F: Record<string, (p: any) => boolean> = {
    // El vigía ya reclama estos; aquí se pueden ver y arreglar de corrido
    sin_tipo: p => !p.tipo,
    sin_folio: p => !p.folio,
    trabados: p => (act.get(p.id)?.abiertos || 0) > 0
      && p.estado_actividad === "bloqueado",
  };

  const filtrados = todos.filter((p: any) =>
    (!et || p.etapa === et) &&
    (!t || p.tipo === t) &&
    (!ac || (p.estado_actividad || "") === ac) &&
    (!f || PRUEBA_F[f]?.(p)) &&
    (!q || nrm(p.nombre).includes(nrm(q)) || nrm(p.nombre_corto).includes(nrm(q)) || nrm(p.folio).includes(nrm(q))));
  const cntEt = (x: string) => todos.filter((p: any) => p.etapa === x).length;
  const cntF = (k: string) => todos.filter(PRUEBA_F[k]).length;

  const enMarcha = todos.filter((p: any) =>
    ["desarrollo", "preproduccion", "produccion", "postproduccion"].includes(p.etapa));
  const bloqueados = todos.filter((p: any) => p.estado_actividad === "bloqueado");
  // Ahora sí: los más conversados son los que tienen más comentarios
  const masConversados = [...todos]
    .map((p: any) => ({ ...p, ...(act.get(p.id) || VACIO) }))
    .filter((p: any) => p.coments > 0)
    .sort((a: any, b: any) => b.coments - a.coments).slice(0, 5);

  const Fila = (p: any) => {
    const x = act.get(p.id) || VACIO;
    return (
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
            {/* Lo sin resolver primero: es lo único accionable de la fila */}
            {x.abiertos > 0 && (
              <span style={{ color: "var(--red)", fontSize: 11.5, fontWeight: 700 }}>❗ {x.abiertos}</span>
            )}
            <span style={{ color: "var(--dim)", fontSize: 11.5 }} title="Casos vinculados">📌 {x.casos}</span>
            <span style={{ color: "var(--muted)", fontSize: 12.5 }} title="Comentarios">💬 {x.coments}</span>
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
    );
  };

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/casos/proyecto" className="btn btn-ghost"
          title="Todos los casos, agrupados por proyecto">🗂 Casos</Link>
        <Link href="/historial/proyecto" className="btn btn-ghost"
          title="Todo lo que se movió en los proyectos, por periodo">🕐 Historial</Link>
        <Link href="/entidad/proyecto/nuevo" className="btn">＋ Nuevo proyecto</Link>
      </div>
      <h1 className="title-lg">📁 Proyectos</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {et && <input type="hidden" name="et" value={et} />}
        {t && <input type="hidden" name="t" value={t} />}
        {ac && <input type="hidden" name="ac" value={ac} />}
        {f && <input type="hidden" name="f" value={f} />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre o folio..."
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", outline: "none", fontSize: 13.5 }} />
        <button className="btn" type="submit">Buscar</button>
      </form>

      <PanelFiltros limpiar="/proyectos" mostrarLimpiar={listar}>
        {/* La etapa es un filtro, así que vive aquí. Estaba arriba como
            tarjetas grandes: el mismo trabajo con otro idioma visual. */}
        <FilaFiltro titulo="Etapa">
          {ETAPAS.map(([x, lbl]) => {
            const n = cntEt(x);
            return n === 0 ? null : (
              <Chip key={x} href={`/proyectos?et=${x}`} on={et === x} color={ETAPA_COLOR[x]}>
                {lbl} · {n}
              </Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Tipo">
          {tipos.map((tt: any) => (
            <Chip key={tt} href={`/proyectos?t=${tt}`} on={t === tt} color={TIPO_COLOR[tt]}>
              {tt.replace(/_/g, " ")} · {todos.filter((p: any) => p.tipo === tt).length}
            </Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Actividad">
          {ACTIVIDAD.map(([k, lbl, col]) => {
            const n = todos.filter((p: any) => p.estado_actividad === k).length;
            return n === 0 ? null : (
              <Chip key={k} href={`/proyectos?ac=${k}`} on={ac === k} color={col}>{lbl} · {n}</Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Atención">
          <Chip href="/proyectos?f=trabados" on={f === "trabados"} color="var(--red)"
            title="Bloqueados y además con casos sin resolver: ahí está el nudo">
            🚧 trabados con casos · {cntF("trabados")}
          </Chip>
          <Chip href="/proyectos?f=sin_tipo" on={f === "sin_tipo"} color="var(--yellow)"
            title="Sin tipo no entran en los filtros ni en los colores del sistema">
            ⚠ sin tipo · {cntF("sin_tipo")}
          </Chip>
          <Chip href="/proyectos?f=sin_folio" on={f === "sin_folio"} color="var(--yellow)"
            title="Sin folio no se pueden citar en una carpeta">
            ⚠ sin folio · {cntF("sin_folio")}
          </Chip>
        </FilaFiltro>
      </PanelFiltros>

      {!listar && (
        <>
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
                  <span style={{ color: "var(--dim)", fontSize: 11.5 }}>📌 {p.casos}</span>
                  <span style={{ color: "var(--muted)", fontSize: 12.5 }}>💬 {p.coments}</span>
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
            {et && ` · ${et.replace(/_/g, " ")}`}{t && ` · ${t.replace(/_/g, " ")}`}
            {ac && ` · ${ac}`}{f && ` · ${f.replace(/_/g, " ")}`}{q && ` · «${q}»`}
          </div>
          {(() => {
            // Agrupados por tipo, igual que empresas: el documental con el
            // documental, la animación aparte — se leen por familia
            const orden = [...tipos, null];
            const grupos = orden
              .map((tt: any) => ({ tt, filas: filtrados.filter((p: any) => (p.tipo || null) === tt) }))
              .filter(g => g.filas.length > 0);
            return grupos.map(({ tt, filas }) => (
              <div key={tt || "sin"} style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 4px 6px" }}>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700,
                    color: tt ? (TIPO_COLOR[tt] || "var(--dim)") : "var(--dim)" }}>
                    {tt ? tt.replace(/_/g, " ") : "sin tipo"} · {filas.length}
                  </span>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
                {filas.map(Fila)}
              </div>
            ));
          })()}
          {!filtrados.length && <div className="empty">Sin resultados{q && ` para «${q}»`}.</div>}
        </>
      )}
    </div>
  );
}

