import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { TIPO_COLOR, EST_CONVOCATORIA } from "@/lib/entidades";
import { TXT } from "@/lib/texto";
import CanchaTemporada, { type Frente } from "@/components/CanchaTemporada";
import { buscadorDe, pal } from "@/lib/buscar";
import { EN_JUEGO } from "@/lib/fondos";
import { ordenarEquipo } from "@/lib/rolesEquipo";
import { postApagada } from "@/lib/resultados";
import Avatar from "@/components/Avatar";
import Link from "@/components/Enlace";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { hoyLima } from "@/lib/fechas";

export const metadata: Metadata = { title: "📜 Convocatorias" };

/* Etiqueta + color por estado, desde el mapa central del ciclo de vida. */
const EST_META: Record<string, [string, string]> = Object.fromEntries(
  Object.entries(EST_CONVOCATORIA).map(([k, v]) => [k, [v.label, v.color] as [string, string]]));
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
  const hoyS = hoyLima();

  const [{ data: convs }, { data: postsAll }, { data: vincs }, { data: coms }, { data: hitosAll }] = await Promise.all([
    // `*`: para calcular la completitud de la ficha de cada convocatoria.
    supabase.from("convocatorias").select("*")
      .order("anio", { ascending: false }).order("codigo"),
    supabase.from("postulaciones")
      .select("id,codigo,estado,monto_adjudicado,fecha_limite_rendicion,fecha_prorroga,conv:convocatorias(id,codigo,nombre,estado,anio,categoria,monto_adjudicado),proy:proyectos(id,nombre,tipo,relacion),emp:empresas(id,nombre,relacion),equipo:postulacion_equipo(cargo,persona:personas(id,nombre,alias,foto_url))"),
    supabase.from("publicacion_vinculos")
      .select("entidad_id,publicacion_id,pub:publicaciones(estado)").eq("entidad_tipo", "convocatoria"),
    /* Solo los de caso: desde que los objetos del repositorio comentan en
       esta misma tabla, sin el filtro sus filas gastan el tope de PostgREST
       (1000) y el contador 💬 se queda corto en silencio. */
    supabase.from("comentarios").select("publicacion_id").not("publicacion_id", "is", null),
    /* Todos los hitos externos de cada convocatoria —pasados y futuros— para la
       mini línea de tiempo por concurso. */
    supabase.from("cronograma_actividades")
      .select("id,nombre,fecha_inicio,convocatoria_id")
      .not("convocatoria_id", "is", null)
      .eq("clase", "hito_externo").order("fecha_inicio"),
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
  // El marcador de Kawsay: las postulaciones son el partido,
  // la convocatoria es la cancha y el calendario
  const posts = postsAll || [];
  /* Logo (cartel) de cada empresa que postula, para el chip con imagen. */
  const logoEmpDe = new Map<string, string>();
  const idsEmp = [...new Set(posts.map((p: any) => p.emp?.id).filter(Boolean))] as string[];
  if (idsEmp.length) {
    const { data: mediaEmp } = await supabase.from("entidad_media")
      .select("entidad_id,cartel_url").eq("entidad_tipo", "empresa").in("entidad_id", idsEmp);
    (mediaEmp || []).forEach((m: any) => { if (m.cartel_url) logoEmpDe.set(m.entidad_id, m.cartel_url); });
  }
  /* Las postulaciones de cada convocatoria, para mostrar CON QUÉ presentamos
     —no solo cuántas— en su fila, como en el listado de empresas. */
  const postsPorConv = new Map<string, any[]>();
  posts.forEach((p: any) => {
    const cid = p.conv?.id; if (!cid) return;
    (postsPorConv.get(cid) || postsPorConv.set(cid, []).get(cid)!).push(p);
  });
  const colPost = (e: string) => e === "ganadora" ? "var(--green)"
    : e === "finalista" || e === "finalista_no_ganadora" ? "var(--yellow)"
    : e === "no_apta" || e === "no_seleccionada" ? "var(--red)"
    : e === "apta" ? "var(--teal)" : "var(--violet)";
  // Los hitos de cada convocatoria, en orden, para su mini línea de tiempo.
  const hitosPorConv = new Map<string, any[]>();
  (hitosAll || []).forEach((h: any) => {
    (hitosPorConv.get(h.convocatoria_id) || hitosPorConv.set(h.convocatoria_id, []).get(h.convocatoria_id)!).push(h);
  });
  const ganas = posts.filter((p: any) => p.estado === "ganadora");
  // «En juego» desde la fuente única (lib/fondos): incluye «apta» —una
  // postulación que pasó el filtro de DAFO y espera al jurado SIGUE jugando; la
  // lista propia de antes la omitía y su convocatoria no salía en la cancha.
  const enJuego = posts.filter((p: any) => EN_JUEGO.includes(p.estado));
  const decididas = posts.length - enJuego.length;
  const efectividad = decididas > 0 ? Math.round((ganas.length / decididas) * 100) : null;
  const montoHist = ganas.reduce((s: number, g: any) => s + (parseFloat(g.monto_adjudicado) || 0), 0);
  // Rutas activas: postulaciones aún en juego (el trabajo arduo de hoy)
  const rutas = enJuego
    .sort((a: any, b: any) => ((b.conv?.anio || 0) - (a.conv?.anio || 0)));
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
        /* Los indicadores de arriba son de la TEMPORADA actual: cuántos frentes
           y cuánto está en juego este año. El detalle por año va en el panel. */
        const anioActual = new Date().getFullYear();
        const frentesTemp = [...frentes.values()].filter(f => Number(f.conv.anio) === anioActual);
        const montoEnJuego = frentesTemp
          .reduce((s, { conv }) => s + (parseFloat(conv.monto_adjudicado) || 0), 0);
        /* La cancha va en un componente cliente (tiene el toggle Cancha/Lista):
           aplanamos cada frente a datos serializables —concurso, sus hitos y
           sus jugadores (postulaciones)—; el componente agrupa y ordena. */
        const frentesData: Frente[] = [...frentes.values()].map(({ conv }) => ({
          id: conv.id,
          codigo: conv.codigo,
          nombre: conv.nombre,
          categoria: conv.categoria ?? null,
          monto: conv.monto_adjudicado != null ? parseFloat(conv.monto_adjudicado) || null : null,
          estado: conv.estado,
          anio: conv.anio ?? null,
          posts: (postsPorConv.get(conv.id) || []).map((p: any) => ({
            id: p.id, codigo: p.codigo ?? null,
            nombre: p.proy?.nombre || p.codigo || "Postulación", estado: p.estado,
          })),
          hitos: (hitosPorConv.get(conv.id) || []).map((h: any) => ({
            id: h.id, nombre: h.nombre, fecha: h.fecha_inicio,
          })),
        }));
        return (
          <>
            {/* «temporada 2026» y «en proceso ahora» eran filtros disfrazados
                de tarjeta: ahora son chips en el panel, con el resto. Aquí
                queda lo que solo informa. */}
            <div className="stat-grid">
              <span className="stat-card" style={{ display: "block" }}>
                <span className="stat-n" style={{ color: "var(--yellow)", display: "block" }}>{frentesTemp.length}</span>
                <span className="stat-l">🎪 frentes donde jugamos · {anioActual}</span>
              </span>
              <span className="stat-card" style={{ display: "block" }}>
                <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>
                  S/ {montoEnJuego.toLocaleString("es-PE")}
                </span>
                <span className="stat-l">en juego · temporada {anioActual}</span>
              </span>
            </div>

            {frentes.size > 0 && (
              <CanchaTemporada frentes={frentesData} hoy={hoyS} />
            )}

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
              /* Enlace estirado: la tarjeta lleva a la convocatoria mediante una
                 capa invisible, y así los chips de postulación de dentro pueden
                 ser enlaces propios (a un <a> dentro de otro <a> revienta). */
              <div key={c.id} className="card link fila-cap" style={(() => {
                // Refuerzo tenue por «nuestra historia»: ganamos verde, rozamos
                // ámbar, postulamos azul —borde + degradado que se apaga.
                const col = ganamosEn.has(c.id) ? "var(--green)" : finalistasEn.has(c.id) ? "var(--yellow)" : "var(--blue)";
                return {
                  cursor: "pointer", padding: "12px 16px",
                  borderLeft: `3px solid ${col}`,
                  backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${col} 7%, transparent), transparent 58%)`,
                };
              })()}>
                <Link href={`/entidad/convocatoria/${c.id}`} className="fila-cubre" aria-label={c.nombre} />
                <div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 14.5 }}>{c.codigo}</b>
                    {/* En mayúsculas, como el código: el par código+nombre es UN
                        identificador («C-072 Documental Producción
                        largometrajes»), y con una mitad en versalitas y la otra
                        en texto corriente se leía como dos cosas pegadas.
                        Se hace en CSS y no cambiando el texto: así lo que se
                        copia, se busca y se lee en voz alta sigue siendo el
                        nombre tal como está escrito en la base. */}
                    <span className="conv-nombre">{c.nombre}</span>
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
                    {/* El chip «postulamos · N» se quitó: ahora los proyectos
                        con que postulamos salen como chips abajo, con nombre —
                        el número solo era redundante. */}
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
                  {/* CON QUÉ postulamos: cada postulación en SU PROPIA FILA —
                      proyecto (enlace a la postulación), la empresa con que se
                      presentó, y el equipo con solo su avatar (nombre al hover). */}
                  {(postsPorConv.get(c.id) || []).length > 0 && (
                    <div className="conv-posts">
                      {(postsPorConv.get(c.id) || []).map((p: any) => {
                        /* La MISMA regla que /postulaciones, no una versión de
                           aquí: aquí solo se apagaban las externas, así que una
                           «no apta» salía apagada en un listado y a pleno color
                           en el otro. Dos pantallas contestando distinto a «¿esto
                           sigue en carrera?» es peor que ninguna, porque las dos
                           parecen seguras. El estado del concurso es el de ESTA
                           fila —`c.estado`—, que es el mismo dato que allá viaja
                           embebido como `p.conv.estado`. */
                        const apagada = postApagada(p, c.estado);
                        return (
                        <div key={p.id} className={`conv-post-fila${apagada ? " conv-post-off" : ""}`}>
                          <Link href={`/entidad/postulacion/${p.id}`} className="badge fila-encima"
                            title={`${p.codigo || ""} · ${(p.estado || "").replace(/_/g, " ")}`}
                            style={{ color: colPost(p.estado), background: "#1c1c2c", textTransform: "none", letterSpacing: 0, textDecoration: "none", fontSize: 11.5 }}>
                            🎯 {p.proy?.nombre || p.codigo || "Postulación"} ↗
                          </Link>
                          {p.emp?.id && (
                            <Link href={`/entidad/empresa/${p.emp.id}`} className="post-proy-chip fila-encima" title={p.emp.nombre}>
                              {logoEmpDe.get(p.emp.id) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logoEmpDe.get(p.emp.id)} alt="" referrerPolicy="no-referrer" className="post-proy-chip-img" />
                              ) : (
                                <span className="post-proy-chip-ph">🏢</span>
                              )}
                              <span className="post-proy-chip-txt">{p.emp.nombre}</span>
                            </Link>
                          )}
                          {(p.equipo || []).length > 0 && (
                            <span className="conv-post-eq">
                              {ordenarEquipo(p.equipo).map((r: any, i: number) => (
                                <span key={i} className="post-eq-av fila-encima"
                                  title={`${r.persona?.alias || r.persona?.nombre}${r.cargo ? ` · ${r.cargo}` : ""}`}>
                                  <Avatar nombre={r.persona?.nombre} src={r.persona?.foto_url} size={28} />
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                  {/* La barra de completitud se retiró de convocatorias: son
                      pocos campos y no aporta al escaneo del listado. */}
                </div>
              </div>
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
                        <span className="conv-nombre" style={{ color: "var(--muted)" }}>{c.nombre}</span>
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
