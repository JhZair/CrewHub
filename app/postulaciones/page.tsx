import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import LineaTiempo, { type EventoLT } from "@/components/LineaTiempo";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { TIPO_COLOR } from "@/lib/entidades";
import { buscadorDe, pal } from "@/lib/buscar";
import Link from "next/link";
import { redirect } from "next/navigation";

const EST_META: Record<string, [string, string]> = {
  en_preparacion: ["🛠 En preparación", "var(--violet)"],
  enviada: ["📨 Enviadas", "var(--blue)"],
  finalista: ["⭐ Finalistas", "var(--yellow)"],
  ganadora: ["🏆 Ganadoras", "var(--green)"],
  finalista_no_ganadora: ["🥈 Finalistas (no ganaron)", "var(--yellow)"],
  no_seleccionada: ["✖ No seleccionadas", "var(--dim)"],
  retirada: ["↩ Retiradas", "var(--dim)"],
};
const dias = (f: string) => Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });
const colorD = (d: number) => (d <= 2 ? "var(--red)" : d <= 7 ? "var(--yellow)" : "var(--muted)");

const EN_JUEGO = ["en_preparacion", "enviada", "finalista"];
const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];

export default async function Postulaciones({ searchParams }: {
  searchParams: { q?: string; e?: string; a?: string; t?: string; f?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const a = searchParams?.a || "";
  const t = searchParams?.t || "";
  const f = searchParams?.f || "";
  const listar = !!(q || e || a || t || f);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: postsAll, error: qErr }, { data: vincs }, { data: coms }] = await Promise.all([
    supabase.from("postulaciones")
      .select("id,codigo,estado,monto_adjudicado,codigo_acta,fecha_limite_rendicion,fecha_prorroga,creado_en,conv:convocatorias(id,codigo,nombre,anio,estado,monto_adjudicado),proy:proyectos(id,nombre,tipo),emp:empresas(id,nombre)")
      .order("creado_en", { ascending: false }),
    supabase.from("publicacion_vinculos")
      .select("entidad_id,publicacion_id,pub:publicaciones(estado)").eq("entidad_tipo", "postulacion"),
    supabase.from("comentarios").select("publicacion_id"),
  ]);

  /* Su vida en CrewHub+: cuánto trabajo cuelga de cada postulación.
     Empresas y personas ya la muestran; aquí la fila terminaba en el estado
     y no decía si había algo sin resolver encima. */
  const comentPorPub = new Map<string, number>();
  (coms || []).forEach((c: any) => comentPorPub.set(c.publicacion_id, (comentPorPub.get(c.publicacion_id) || 0) + 1));

  type Act = { casos: number; abiertos: number; coments: number };
  const VACIO: Act = { casos: 0, abiertos: 0, coments: 0 };
  const act = new Map<string, Act>();
  (vincs || []).forEach((v: any) => {
    const x = act.get(v.entidad_id) || { ...VACIO };
    x.casos++;
    if (ABIERTOS.includes((v.pub as any)?.estado)) x.abiertos++;
    x.coments += comentPorPub.get(v.publicacion_id) || 0;
    act.set(v.entidad_id, x);
  });

  const posts = postsAll || [];
  const coincide = buscadorDe(q);   // el mismo motor que el buscador global

  /* Lo que hay que arreglar. Son las mismas reglas que ya avisan en la ficha
     y en el vigía: si el sistema sabe señalarlas de a una, tiene que saber
     listarlas todas juntas. */
  const PRUEBA_F: Record<string, (p: any) => boolean> = {
    sin_empresa: p => !p.emp,
    gan_incompleta: p => p.estado === "ganadora"
      && (!p.codigo_acta || !p.monto_adjudicado || !p.fecha_limite_rendicion),
    sin_rendicion: p => p.estado === "ganadora"
      && !p.fecha_limite_rendicion && !p.fecha_prorroga,
  };

  const filtradas = posts.filter((p: any) =>
    (!e || p.estado === e) &&
    // Año de verdad, del concurso. Antes esto se hacía buscando "2026" como
    // texto: una postulación con «CDO-P-2026-14» salía en cualquier año.
    (!a || String(p.conv?.anio || "") === a) &&
    (!t || p.proy?.tipo === t) &&
    (!f || PRUEBA_F[f]?.(p)) &&
    // El código del acta y el de la plataforma DAFO también: son los números
    // con los que llega un correo del Ministerio
    (!q || coincide(pal(
      p.codigo, p.codigo_plataforma, p.codigo_acta, p.proy?.nombre,
      p.emp?.nombre, p.conv?.codigo, p.conv?.nombre, p.conv?.anio, p.estado))));

  const cnt = (est: string) => posts.filter((p: any) => p.estado === est).length;
  const cntF = (k: string) => posts.filter(PRUEBA_F[k]).length;
  const tipos = [...new Set(posts.map((p: any) => p.proy?.tipo).filter(Boolean))];
  const ganas = posts.filter((p: any) => p.estado === "ganadora");
  const enJuego = posts.filter((p: any) => EN_JUEGO.includes(p.estado));
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

  const Fila = (p: any) => {
    const x = act.get(p.id) || VACIO;
    const rend = p.fecha_prorroga || p.fecha_limite_rendicion;
    const dRend = p.estado === "ganadora" && rend ? dias(rend) : null;
    return (
    <Link key={p.id} href={`/entidad/postulacion/${p.id}`}>
      <div className="card link" style={{ cursor: "pointer", padding: "12px 16px" }}>
        {/* línea 1: quién es */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 14.5 }}>🎯 {p.codigo ? `${p.codigo} · ` : ""}{p.proy?.nombre || "—"}</b>
          {p.proy?.tipo && (
            <span className="badge" style={{
              color: TIPO_COLOR[p.proy.tipo] || "var(--muted)",
              background: `${TIPO_COLOR[p.proy.tipo] || "#8b8ba3"}1c`,
            }}>{p.proy.tipo.replace(/_/g, " ")}</span>
          )}
          {/* La ausencia se dice. Antes la fila simplemente no mostraba nada
              y había que notar el hueco. */}
          {p.emp
            ? <span style={{ color: "var(--dim)", fontSize: 12 }}>🏢 {p.emp.nombre}</span>
            : <span className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.12)" }}>⚠ sin empresa</span>}
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

        {/* línea 2: su vida en CrewHub+ */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 7, fontSize: 11.5 }}>
          {/* La rendición manda: es la única fecha con consecuencia legal */}
          {dRend !== null && (
            <span style={{ fontWeight: 700,
              color: dRend < 0 ? "var(--red)" : dRend <= 60 ? "var(--yellow)" : "var(--dim)" }}>
              🧾 {dRend < 0 ? `rendición vencida hace ${-dRend}d` : `rinde en ${dRend}d`}
              {p.fecha_prorroga ? " (prórroga)" : ""}
            </span>
          )}
          {p.estado === "ganadora" && !rend && (
            <span style={{ color: "var(--yellow)", fontWeight: 700 }}>⚠ sin fecha de rendición</span>
          )}
          <span style={{ flex: 1 }} />
          {x.abiertos > 0 && <span style={{ color: "var(--red)" }}>❗ {x.abiertos} sin resolver</span>}
          <span style={{ color: "var(--dim)" }} title="Casos vinculados">📌 {x.casos}</span>
          <span style={{ color: "var(--muted)" }} title="Comentarios">💬 {x.coments}</span>
          {!x.casos && <span style={{ color: "var(--dim)" }}>sin actividad</span>}
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
        <Link href="/casos/postulacion" className="btn btn-ghost"
          title="Todos los casos, agrupados por postulación">🗂 Casos</Link>
        <Link href="/historial/postulacion" className="btn btn-ghost"
          title="Todo lo que se movió en las postulaciones, por periodo">🕐 Historial</Link>
      </div>
      <h1 className="title-lg">🎯 Postulaciones</h1>
      {qErr && (
        <div className="card" style={{ borderColor: "var(--red)", color: "var(--red)", fontSize: 13 }}>
          ⚠ Error al consultar postulaciones: {qErr.message}
        </div>
      )}

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        {a && <input type="hidden" name="a" value={a} />}
        {t && <input type="hidden" name="t" value={t} />}
        {f && <input type="hidden" name="f" value={f} />}
        <span className="buscador-lista">
          <span className="bg-lupa">🔍</span>
          <input name="q" defaultValue={q}
            placeholder="Proyecto, código, empresa, concurso, código de acta…" />
        </span>
        <button className="btn" type="submit">Buscar</button>
      </form>

      <PanelFiltros limpiar="/postulaciones" mostrarLimpiar={listar}>
        <FilaFiltro titulo="Estado">
          {Object.entries(EST_META).map(([k, [lbl, col]]) => {
            const n = cnt(k);
            return n === 0 ? null : (
              <Chip key={k} href={`/postulaciones?e=${k}`} on={e === k} color={col}>
                {lbl} · {n}
              </Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Año del concurso">
          {porAnio.map((y: any) => (
            <Chip key={y} href={`/postulaciones?a=${y}`} on={a === String(y)} color="var(--violet)">
              {y} · {anios.filter((x: any) => x === y).length}
            </Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Tipo de proyecto">
          {tipos.map((tt: any) => (
            <Chip key={tt} href={`/postulaciones?t=${tt}`} on={t === tt} color={TIPO_COLOR[tt]}>
              {tt.replace(/_/g, " ")} · {posts.filter((p: any) => p.proy?.tipo === tt).length}
            </Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Atención">
          <Chip href="/postulaciones?f=sin_empresa" on={f === "sin_empresa"} color="var(--red)"
            title="Sin empresa postulante: no puede firmar el acta ni cobrar">
            ⚠ sin empresa · {cntF("sin_empresa")}
          </Chip>
          <Chip href="/postulaciones?f=gan_incompleta" on={f === "gan_incompleta"} color="var(--yellow)"
            title="Ganadoras a las que les falta acta, monto o fecha de rendición">
            🏆 ganadoras incompletas · {cntF("gan_incompleta")}
          </Chip>
          <Chip href="/postulaciones?f=sin_rendicion" on={f === "sin_rendicion"} color="var(--yellow)"
            title="Ganó, pero nadie registró hasta cuándo hay que rendir">
            🧾 sin fecha de rendición · {cntF("sin_rendicion")}
          </Chip>
        </FilaFiltro>
      </PanelFiltros>

      {!listar && (
        <>
          {/* Solo lo que informa: los conteos por estado son filtros y viven
              arriba, en el panel. Esto no filtra nada — es el marcador. */}
          <div className="stat-grid">
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>
                {efectividad != null ? `${efectividad}%` : "—"}
              </span>
              <span className="stat-l">efectividad · {ganas.length} de {decididas} decididas</span>
            </span>
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>
                S/ {montoHist.toLocaleString("es-PE")}
              </span>
              <span className="stat-l">🏆 ganado en total</span>
            </span>
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--blue)", display: "block" }}>{enJuego.length}</span>
              <span className="stat-l">🎯 en juego ahora</span>
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

        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: 13, margin: "2px 4px 10px" }}>
            {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}
            {a && ` · ${a}`}{t && ` · ${t.replace(/_/g, " ")}`}
            {f && ` · ${f.replace(/_/g, " ")}`}{q && ` · «${q}»`}
          </div>
          {/* Agrupadas por año del concurso: una postulación se entiende
              dentro de su temporada — con qué compitió y contra qué. */}
          {(() => {
            const grupos = porAnio
              .map((y: any) => ({ y, filas: filtradas.filter((p: any) => p.conv?.anio === y) }))
              .filter(g => g.filas.length > 0);
            const sinAnio = filtradas.filter((p: any) => !p.conv?.anio);
            if (sinAnio.length) grupos.push({ y: null, filas: sinAnio });
            return grupos.map(({ y, filas }) => (
              <div key={y || "sin"} style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 4px 6px" }}>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
                    {y || "sin año"} · {filas.length}
                  </span>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
                {filas.map(Fila)}
              </div>
            ));
          })()}
          {!filtradas.length && <div className="empty">Sin resultados.</div>}
        </>
      )}
    </div>
  );
}
