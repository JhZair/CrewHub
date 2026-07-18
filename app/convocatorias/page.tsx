import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import LineaTiempo, { type EventoLT } from "@/components/LineaTiempo";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { TIPO_COLOR } from "@/lib/entidades";
import { buscadorDe, pal } from "@/lib/buscar";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "📜 Convocatorias" };

const EST_META: Record<string, [string, string]> = {
  postulacion: ["En postulación", "var(--blue)"],
  en_ejecucion: ["En ejecución", "var(--green)"],
  rendicion_pendiente: ["Rendición pendiente", "var(--red)"],
  cerrada: ["Cerradas", "var(--dim)"],
};
const dias = (f: string) => Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });
const colorD = (d: number) => (d <= 2 ? "var(--red)" : d <= 7 ? "var(--yellow)" : "var(--muted)");

const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];

export default async function Convocatorias({ searchParams }: {
  searchParams: { q?: string; e?: string; a?: string; j?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const a = searchParams?.a || "";
  const j = searchParams?.j || "";
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const hoyS = new Date().toISOString().slice(0, 10);

  const [{ data: convs }, { data: hitos }, { data: postsAll }, { data: vincs }, { data: coms }] = await Promise.all([
    supabase.from("convocatorias")
      .select("id,codigo,nombre,anio,estado,monto_adjudicado,fecha_limite_rendicion")
      .order("anio", { ascending: false }).order("codigo"),
    supabase.from("cronograma_actividades")
      .select("id,nombre,fecha_inicio,convocatoria_id,conv:convocatorias(id,codigo,anio)")
      .not("convocatoria_id", "is", null)
      .eq("clase", "hito_externo").eq("estado", "planificada")
      .gte("fecha_inicio", hoyS)
      .order("fecha_inicio").limit(10),
    supabase.from("postulaciones")
      .select("id,codigo,estado,monto_adjudicado,fecha_limite_rendicion,fecha_prorroga,conv:convocatorias(id,codigo,nombre,estado,anio,monto_adjudicado),proy:proyectos(id,nombre,tipo)"),
    supabase.from("publicacion_vinculos")
      .select("entidad_id,publicacion_id,pub:publicaciones(estado)").eq("entidad_tipo", "convocatoria"),
    supabase.from("comentarios").select("publicacion_id"),
  ]);

  // Su vida en CrewHub+, igual que en el resto de los listados
  const comentPorPub = new Map<string, number>();
  (coms || []).forEach((x: any) => comentPorPub.set(x.publicacion_id, (comentPorPub.get(x.publicacion_id) || 0) + 1));
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

  const todas = convs || [];
  const listar = !!(q || e || a || j);
  const coincide = buscadorDe(q);   // el mismo motor que el buscador global

  const cnt = (est: string) => todas.filter((c: any) => c.estado === est).length;
  const enEjec = todas.filter((c: any) => ["en_ejecucion", "rendicion_pendiente"].includes(c.estado));
  // El marcador de Kawsay: las postulaciones son el partido,
  // la convocatoria es la cancha y el calendario
  const posts = postsAll || [];
  const ganas = posts.filter((p: any) => p.estado === "ganadora");
  const enJuego = posts.filter((p: any) => ["en_preparacion", "enviada", "finalista"].includes(p.estado));
  const decididas = posts.length - enJuego.length;
  const efectividad = decididas > 0 ? Math.round((ganas.length / decididas) * 100) : null;
  const montoHist = ganas.reduce((s: number, g: any) => s + (parseFloat(g.monto_adjudicado) || 0), 0);
  // Rutas activas: postulaciones aún en juego (el trabajo arduo de hoy)
  const rutas = enJuego
    .sort((a: any, b: any) => ((b.conv?.anio || 0) - (a.conv?.anio || 0)));
  // Ganadoras vivas: su EJECUCIÓN sigue abierta (rendición aún no vence),
  // aunque el concurso ya esté cerrado
  const gansVivas = ganas.filter((g: any) => {
    const f = g.fecha_prorroga || g.fecha_limite_rendicion;
    return f ? f >= hoyS : (g.conv && g.conv.estado !== "cerrada");
  });
  const montoVivo = gansVivas.reduce((s: number, g: any) => s + (parseFloat(g.monto_adjudicado) || 0), 0)
    || enEjec.reduce((s: number, c: any) => s + (parseFloat(c.monto_adjudicado) || 0), 0);
  // Rendiciones: de las postulaciones ganadoras (la prórroga manda si existe)
  // + legado directo en convocatorias antiguas
  const rendiciones = [
    ...gansVivas
      .filter((g: any) => g.fecha_limite_rendicion || g.fecha_prorroga)
      .map((g: any) => ({
        id: `p${g.id}`, href: `/entidad/convocatoria/${g.conv.id}`,
        fecha: g.fecha_prorroga || g.fecha_limite_rendicion,
        label: `🏆 ${g.proy?.nombre || "Proyecto"} · ${g.conv.codigo}`,
      })),
    ...enEjec
      .filter((c: any) => c.fecha_limite_rendicion)
      .map((c: any) => ({
        id: `c${c.id}`, href: `/entidad/convocatoria/${c.id}`,
        fecha: c.fecha_limite_rendicion, label: `${c.codigo} · ${c.nombre}`,
      })),
  ].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).slice(0, 6);
  const anios = todas.map((c: any) => c.anio).filter(Boolean);
  const desde = anios.length ? Math.min(...anios) : null;
  const porAnio = [...new Set(anios)].sort((a: any, b: any) => b - a);

  // Nuestra historia en cada concurso: ¿postulamos? ¿ganamos? ¿rozamos?
  const postulamosEn = new Map<string, number>();
  const ganamosCnt = new Map<string, number>();
  const finalistasEn = new Map<string, number>();
  posts.forEach((p: any) => {
    const cid = p.conv?.id;
    if (!cid) return;
    postulamosEn.set(cid, (postulamosEn.get(cid) || 0) + 1);
    if (p.estado === "ganadora") ganamosCnt.set(cid, (ganamosCnt.get(cid) || 0) + 1);
    if (p.estado === "finalista_no_ganadora")
      finalistasEn.set(cid, (finalistasEn.get(cid) || 0) + 1);
  });
  const ganamosEn = { has: (id: string) => ganamosCnt.has(id) };

  /* Nuestra relación con cada concurso. Va después de los mapas porque los
     necesita: "dónde ganamos" no se puede saber mirando la convocatoria. */
  const PRUEBA_J: Record<string, (c: any) => boolean> = {
    ganamos: c => ganamosCnt.has(c.id),
    finalistas: c => finalistasEn.has(c.id),
    postulamos: c => postulamosEn.has(c.id),
    nunca: c => !postulamosEn.has(c.id),
  };
  const cntJ = (k: string) => todas.filter(PRUEBA_J[k]).length;

  const filtradas = todas.filter((c: any) =>
    (!e || c.estado === e) &&
    // Año de verdad. La tarjeta de "temporada 2026" y los chips de año iban
    // a ?q=2026, o sea buscaban el texto: el contador salía de c.anio y la
    // lista de una búsqueda. Nunca podían coincidir.
    (!a || String(c.anio || "") === a) &&
    (!j || PRUEBA_J[j]?.(c)) &&
    (!q || coincide(pal("convocatoria concurso", c.codigo, c.nombre, c.anio, c.estado))));

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/casos/convocatoria" className="btn btn-ghost"
          title="Todos los casos, agrupados por convocatoria">🗂 Casos</Link>
        <Link href="/historial/convocatoria" className="btn btn-ghost"
          title="Todo lo que se movió en las convocatorias, por periodo">🕐 Historial</Link>
        <Link href="/entidad/convocatoria/nuevo" className="btn">＋ Nueva convocatoria</Link>
      </div>
      <h1 className="title-lg">📜 Convocatorias y fondos</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        {a && <input type="hidden" name="a" value={a} />}
        {j && <input type="hidden" name="j" value={j} />}
        <span className="buscador-lista">
          <span className="bg-lupa">🔍</span>
          <input name="q" defaultValue={q}
            placeholder="Concurso, código, año, «en ejecución», «cerrada»…" />
        </span>
        <button className="btn" type="submit">Buscar</button>
      </form>

      <PanelFiltros limpiar="/convocatorias" mostrarLimpiar={listar}>
        <FilaFiltro titulo="Temporada">
          {porAnio.map((y: any) => (
            <Chip key={y} href={`/convocatorias?a=${y}`} on={a === String(y)} color="var(--violet)">
              {y} · {anios.filter((x: any) => x === y).length}
            </Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Estado">
          {Object.entries(EST_META).map(([est, [lbl, col]]) => {
            const n = cnt(est);
            return n === 0 ? null : (
              <Chip key={est} href={`/convocatorias?e=${est}`} on={e === est} color={col}>
                {lbl} · {n}
              </Chip>
            );
          })}
        </FilaFiltro>
        {/* Lo que hace única a esta página: el catálogo DAFO es enorme y lo
            que importa es dónde jugamos nosotros */}
        <FilaFiltro titulo="Nuestra historia">
          <Chip href="/convocatorias?j=ganamos" on={j === "ganamos"} color="var(--green)">
            🏆 ganamos · {cntJ("ganamos")}
          </Chip>
          <Chip href="/convocatorias?j=finalistas" on={j === "finalistas"} color="var(--yellow)"
            title="Llegamos a finalistas pero no ganamos">
            🥈 rozamos · {cntJ("finalistas")}
          </Chip>
          <Chip href="/convocatorias?j=postulamos" on={j === "postulamos"} color="var(--blue)">
            🎯 postulamos · {cntJ("postulamos")}
          </Chip>
          <Chip href="/convocatorias?j=nunca" on={j === "nunca"}
            title="Del catálogo DAFO, los que nunca tocamos">
            nunca postulamos · {cntJ("nunca")}
          </Chip>
        </FilaFiltro>
      </PanelFiltros>

      {!listar && (() => {
        // La cancha, no el partido: temporada actual y frentes por CONCURSO
        // (el detalle por postulación vive en 🎯)
        const frentes = new Map<string, { conv: any; n: number }>();
        enJuego.forEach((p: any) => {
          if (!p.conv) return;
          const f = frentes.get(p.conv.id) || { conv: p.conv, n: 0 };
          f.n++;
          frentes.set(p.conv.id, f);
        });
        const proxHitoDe = (cid: string) =>
          (hitos || []).find((h: any) => h.convocatoria_id === cid)?.fecha_inicio;
        return (
          <>
            {/* «temporada 2026» y «en proceso ahora» eran filtros disfrazados
                de tarjeta: ahora son chips en el panel, con el resto. Aquí
                queda lo que solo informa. */}
            <div className="stat-grid">
              <span className="stat-card" style={{ display: "block" }}>
                <span className="stat-n" style={{ color: "var(--yellow)", display: "block" }}>{frentes.size}</span>
                <span className="stat-l">🎪 frentes donde jugamos</span>
              </span>
              <span className="stat-card" style={{ display: "block" }}>
                <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>
                  S/ {montoVivo.toLocaleString("es-PE")}
                </span>
                <span className="stat-l">en ejecución</span>
              </span>
              <Link href="/postulaciones" className="stat-card" style={{ borderColor: "rgba(167,139,250,.4)" }}>
                <div className="stat-n" style={{ fontSize: 19, color: "var(--violet)" }}>🎯 →</div>
                <div className="stat-l">marcador y rutas, en Postulaciones</div>
              </Link>
            </div>

            {frentes.size > 0 && (
              <div className="card" style={{ borderColor: "rgba(244,180,0,.3)" }}>
                <div className="panel-h" style={{ color: "var(--yellow)" }}>🎪 Frentes de la temporada — concursos donde jugamos</div>
                {[...frentes.values()]
                  .sort((a, b) => (parseFloat(b.conv.monto_adjudicado) || 0) - (parseFloat(a.conv.monto_adjudicado) || 0))
                  .map(({ conv, n }) => {
                    const prox = proxHitoDe(conv.id);
                    return (
                      <div key={conv.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 2px" }}>
                        <Link href={`/entidad/convocatoria/${conv.id}`} style={{ fontWeight: 600, fontSize: 13.5, display: "block", marginBottom: 6 }}>
                          📜 {conv.codigo} · {conv.nombre} →
                        </Link>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingLeft: 2 }}>
                          <span className="badge" style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)" }}>
                            🎯 {n} postulaci{n === 1 ? "ón" : "ones"}
                          </span>
                          {prox ? (
                            <span style={{ color: colorD(dias(prox)), fontSize: 12, fontWeight: 700 }}>
                              ⏱ próx. hito: {fmt(prox)} · en {dias(prox)} días
                            </span>
                          ) : (
                            <span style={{ color: "var(--dim)", fontSize: 12 }}>⏱ sin hitos cargados</span>
                          )}
                          <span style={{ flex: 1 }} />
                          {conv.monto_adjudicado && (
                            <span style={{ color: "var(--teal)", fontSize: 12.5, fontWeight: 700 }}>
                              S/ {parseFloat(conv.monto_adjudicado).toLocaleString("es-PE")} en juego
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

          <div className="card">
            <div className="panel-h">📅 Línea de tiempo DAFO — hitos y rendiciones</div>
            <LineaTiempo eventos={[
              ...(hitos || []).map((h: any): EventoLT => ({
                fecha: h.fecha_inicio, titulo: h.nombre, icono: "🏛",
                color: "var(--violet)", chip: h.conv?.codigo,
                href: h.conv ? `/entidad/convocatoria/${h.conv.id}` : undefined,
              })),
              ...rendiciones.map((r: any): EventoLT => ({
                fecha: r.fecha, titulo: r.label, icono: "🧾",
                color: dias(r.fecha) < 7 ? "var(--red)" : "var(--yellow)",
                href: r.href,
              })),
            ]} />
          </div>

          <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", margin: "6px 0 14px" }}>
            {todas.length} concursos{desde ? ` desde ${desde}` : ""} — filtra arriba para ver la lista.
          </div>
        </>
        );
      })()}

      {listar && (() => {
        // Primero lo nuestro; el catálogo donde no jugamos, en penumbra
        const nuestras = filtradas.filter((c: any) => ganamosEn.has(c.id) || postulamosEn.has(c.id));
        const resto = filtradas.filter((c: any) => !ganamosEn.has(c.id) && !postulamosEn.has(c.id));
        return (
          <>
            <div style={{ color: "var(--muted)", fontSize: 13, margin: "2px 4px 10px" }}>
              {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
              {e && ` · ${EST_META[e]?.[0] || e}`}{q && ` · «${q}»`}
              {nuestras.length > 0 && ` — en ${nuestras.length} participamos`}
            </div>

            {nuestras.map((c: any) => (
              <Link key={c.id} href={`/entidad/convocatoria/${c.id}`}>
                <div className="card link" style={{
                  cursor: "pointer", padding: "12px 16px",
                  borderLeft: `3px solid ${ganamosEn.has(c.id) ? "var(--green)" : finalistasEn.has(c.id) ? "var(--yellow)" : "var(--blue)"}`,
                }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 14.5 }}>{c.codigo}</b>
                    <span style={{ color: "var(--text)", fontSize: 13 }}>{c.nombre}</span>
                    {c.anio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{c.anio}</span>}
                    {ganamosEn.has(c.id) && (
                      <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)" }}>
                        🏆 ganamos{(ganamosCnt.get(c.id) || 0) > 1 ? ` · ${ganamosCnt.get(c.id)}` : ""}
                      </span>
                    )}
                    {finalistasEn.has(c.id) && (
                      <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>
                        🥈 finalista{(finalistasEn.get(c.id) || 0) > 1 ? `s · ${finalistasEn.get(c.id)}` : ""}
                      </span>
                    )}
                    {!ganamosEn.has(c.id) && (
                      <span className="badge" style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)" }}>
                        🎯 postulamos · {postulamosEn.get(c.id)}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    {(act.get(c.id)?.abiertos || 0) > 0 && (
                      <span style={{ color: "var(--red)", fontSize: 11.5, fontWeight: 700 }}>
                        ❗ {act.get(c.id)!.abiertos}
                      </span>
                    )}
                    {(act.get(c.id)?.casos || 0) > 0 && (
                      <span style={{ color: "var(--dim)", fontSize: 11.5 }} title="Casos vinculados">
                        📌 {act.get(c.id)!.casos}
                      </span>
                    )}
                    {(act.get(c.id)?.coments || 0) > 0 && (
                      <span style={{ color: "var(--muted)", fontSize: 11.5 }} title="Comentarios">
                        💬 {act.get(c.id)!.coments}
                      </span>
                    )}
                    {c.monto_adjudicado && (
                      <span style={{ color: "var(--teal)", fontSize: 12.5 }}>
                        S/ {parseFloat(c.monto_adjudicado).toLocaleString("es-PE")}
                      </span>
                    )}
                    <span className="badge" style={{ color: EST_META[c.estado]?.[1] || "var(--muted)", background: "#1c1c2c" }}>
                      {(c.estado || "—").replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              </Link>
            ))}

            {resto.length > 0 && (
              <>
                {nuestras.length > 0 && (
                  <div className="panel-h" style={{ margin: "16px 4px 8px" }}>
                    Otros concursos del catálogo DAFO · {resto.length} — no postulamos
                  </div>
                )}
                {resto.map((c: any) => (
                  <Link key={c.id} href={`/entidad/convocatoria/${c.id}`}>
                    {/* fila-tenue: apagado, y se prende al pasar el cursor —
                        el mismo gesto de las empresas candidatas */}
                    <div className="card link fila-tenue" style={{ cursor: "pointer", padding: "8px 16px", marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                        <b>{c.codigo}</b>
                        <span style={{ color: "var(--muted)" }}>{c.nombre}</span>
                        {c.anio && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{c.anio}</span>}
                        <span style={{ flex: 1 }} />
                        {c.monto_adjudicado && (
                          <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                            S/ {parseFloat(c.monto_adjudicado).toLocaleString("es-PE")}
                          </span>
                        )}
                        <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{(c.estado || "—").replace(/_/g, " ")}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </>
            )}
            {!filtradas.length && <div className="empty">Sin resultados.</div>}
          </>
        );
      })()}
    </div>
  );
}
