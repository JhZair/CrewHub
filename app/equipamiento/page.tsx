import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import BotonComprobar from "@/components/BotonComprobar";
import BotonDevolver from "@/components/BotonDevolver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { buscadorDe, pal } from "@/lib/buscar";
import { completitud } from "@/lib/entidades";
import { TXT } from "@/lib/texto";
import Completitud from "@/components/Completitud";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🎥 Equipos" };

const diasDesde = (f: string) => Math.floor((Date.now() - new Date(f + "T12:00:00").getTime()) / 86400000);

const EST_META: Record<string, [string, string]> = {
  disponible: ["Disponibles", "var(--green)"],
  en_uso: ["En uso", "var(--yellow)"],
  en_reparacion: ["En reparación", "#f59e0b"],
  perdido: ["Perdidos", "var(--red)"],
  de_baja: ["De baja", "var(--dim)"],
};

const TOPE = 200;
const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];

export default async function Equipamiento({ searchParams }: {
  searchParams: { q?: string; e?: string; c?: string; f?: string; ronda?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const c = searchParams?.c || "";
  const f = searchParams?.f || "";
  const ronda = searchParams?.ronda === "1";
  const listar = !!(q || e || c || f || ronda);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: eqs }, { data: enManos }, { data: vincs }, { data: coms }, { data: media }, comsBita, comsUso, usosRec] = await Promise.all([
    // `*`: para calcular la completitud de la ficha de cada equipo.
    supabase.from("equipamiento").select("*").order("folio"),
    supabase.from("equipo_prestamos")
      .select("id,desde,equipo:equipamiento(id,folio,nombre),persona:personas(id,nombre,alias,foto_url),proy:proyectos(id,nombre)")
      .is("hasta", null).order("desde", { ascending: false }),
    supabase.from("publicacion_vinculos")
      .select("entidad_id,publicacion_id,pub:publicaciones(estado)").eq("entidad_tipo", "equipamiento"),
    /* Solo los de caso: desde que los objetos del repositorio comentan en
       esta misma tabla, sin el filtro sus filas gastan el tope de PostgREST
       (1000) y el contador 💬 se queda corto en silencio. */
    supabase.from("comentarios").select("publicacion_id").not("publicacion_id", "is", null),
    // Carteles (miniatura) de cada equipo, para las listas y las tarjetas.
    supabase.from("entidad_media").select("entidad_id,cartel_url").eq("entidad_tipo", "equipamiento"),
    // Última actividad — tres fuentes que se fusionan y ordenan por fecha:
    //  (a) comentarios de la bitácora general (equipamiento_id),
    //  (b) comentarios de un uso concreto (prestamo_id),
    //  (c) eventos de uso (puesto en uso / liberado), de equipo_prestamos.
    supabase.from("comentarios")
      .select("id,cuerpo,es_dano,creado_en,autor:perfiles(nombre,avatar_url,color),equipo:equipamiento(id,folio,nombre)")
      .not("equipamiento_id", "is", null).order("creado_en", { ascending: false }).limit(12),
    supabase.from("comentarios")
      .select("id,cuerpo,es_dano,creado_en,autor:perfiles(nombre,avatar_url,color),prestamo:equipo_prestamos(id,equipo:equipamiento(id,folio,nombre))")
      .not("prestamo_id", "is", null).order("creado_en", { ascending: false }).limit(12),
    supabase.from("equipo_prestamos")
      .select("id,desde,hasta,equipo:equipamiento(id,folio,nombre),persona:personas(id,nombre,alias)")
      .order("desde", { ascending: false }).limit(12),
  ]);
  const un1 = (v: any) => (Array.isArray(v) ? v[0] : v);
  const cartelPorEq = new Map<string, string>();
  (media || []).forEach((m: any) => { if (m.cartel_url) cartelPorEq.set(m.entidad_id, m.cartel_url); });

  // Fusiona las tres fuentes en una sola línea de actividad (descendente).
  const actItems: any[] = [];
  (comsBita?.data || []).forEach((c: any) => actItems.push({ at: c.creado_en, tipo: "com", eq: un1(c.equipo), autor: un1(c.autor), cuerpo: c.cuerpo, es_dano: c.es_dano }));
  (comsUso?.data || []).forEach((c: any) => actItems.push({ at: c.creado_en, tipo: "com", eq: un1(un1(c.prestamo)?.equipo), autor: un1(c.autor), cuerpo: c.cuerpo, es_dano: c.es_dano, uso: true }));
  (usosRec?.data || []).forEach((p: any) => {
    const eq = un1(p.equipo), per = un1(p.persona);
    actItems.push({ at: p.desde + "T12:00:00", tipo: "uso_ini", eq, persona: per });
    if (p.hasta) actItems.push({ at: p.hasta + "T12:00:00", tipo: "uso_fin", eq, persona: per });
  });
  // En árbol: agrupada por equipo. Cada equipo es un nodo; debajo, sus últimos
  // movimientos. Los equipos se ordenan por su actividad más reciente.
  const grupoAct = new Map<string, { eq: any; items: any[] }>();
  actItems.filter((x: any) => x.eq?.id).forEach((x: any) => {
    const g = grupoAct.get(x.eq.id) || { eq: x.eq, items: [] };
    g.items.push(x); grupoAct.set(x.eq.id, g);
  });
  const gruposAct = [...grupoAct.values()]
    .map(g => ({ eq: g.eq, items: g.items.sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5) }))
    .sort((a, b) => new Date(b.items[0].at).getTime() - new Date(a.items[0].at).getTime())
    .slice(0, 8);

  // Su vida en CrewHub+, igual que en empresas, personas y proyectos
  const comentPorPub = new Map<string, number>();
  (coms || []).forEach((x: any) => comentPorPub.set(x.publicacion_id, (comentPorPub.get(x.publicacion_id) || 0) + 1));
  type Act = { casos: number; abiertos: number; coments: number };
  const VACIO: Act = { casos: 0, abiertos: 0, coments: 0 };
  const act = new Map<string, Act>();
  (vincs || []).forEach((v: any) => {
    const a = act.get(v.entidad_id) || { ...VACIO };
    a.casos++;
    if (ABIERTOS.includes((v.pub as any)?.estado)) a.abiertos++;
    a.coments += comentPorPub.get(v.publicacion_id) || 0;
    act.set(v.entidad_id, a);
  });

  const todos = eqs || [];
  const coincide = buscadorDe(q);   // el mismo motor que el buscador global
  const porComprobar = (x: any) =>
    !["de_baja"].includes(x.estado) &&
    (!x.ultima_comprobacion || diasDesde(x.ultima_comprobacion) > 90);

  const PRUEBA_F: Record<string, (x: any) => boolean> = {
    // Sin valor no suma al inventario: el total de arriba miente por omisión
    sin_valor: x => !["de_baja", "perdido"].includes(x.estado) && !x.valor_compra,
    sin_folio: x => !x.folio,
    sin_categoria: x => !x.categoria,
  };

  const filtradosTodos = todos.filter((x: any) =>
    (!e || x.estado === e) &&
    // Categoría de verdad. Antes los chips buscaban la categoría como TEXTO,
    // así que "cámara" traía también "Cuerpo de cámara" de subcategoría y
    // cualquier nombre que la mencionara: el número del chip nunca cuadraba
    // con lo que salía al hacer clic.
    (!c || (x.categoria || "") === c) &&
    (!f || PRUEBA_F[f]?.(x)) &&
    (!ronda || porComprobar(x)) &&
    (!q || coincide(pal(x.nombre, x.folio, x.categoria, x.subcategoria, x.estado))));
  const filtrados = filtradosTodos.slice(0, TOPE);
  const pendientesRonda = todos.filter(porComprobar).length;
  const cntF = (k: string) => todos.filter(PRUEBA_F[k]).length;

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

  // Miniatura del equipo (cartel) y avatar de una persona, con placeholder.
  const miniEquipo = (url: string | undefined, size = 46) => (
    <span style={{ width: size, height: size, borderRadius: 8, flexShrink: 0, background: "var(--bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {url
        ? // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: size * 0.5 }}>🎥</span>}
    </span>
  );
  const avatarPersona = (url: string | undefined, size = 24) => (
    <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: "var(--bg)", border: "1px solid var(--border2)", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", verticalAlign: "middle" }}>
      {url
        ? // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: size * 0.5 }}>👤</span>}
    </span>
  );

  const Fila = (x: any) => {
    const a = act.get(x.id) || VACIO;
    return (
      <Link key={x.id} href={`/entidad/equipamiento/${x.id}`}>
        <div className="card link" style={{ cursor: "pointer", padding: "12px 16px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {miniEquipo(cartelPorEq.get(x.id))}
            {x.folio
              ? <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{x.folio}</span>
              : <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>⚠ sin folio</span>}
            <b style={{ fontSize: TXT.base, flex: 1 }}>{x.nombre}</b>
            {x.subcategoria && <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>{x.subcategoria}</span>}
            {/* Lo que cuelga del equipo: una cámara con un caso abierto
                puede ser una reparación a medias, y eso decide si sale a rodaje */}
            {a.abiertos > 0 && (
              <span style={{ color: "var(--red)", fontSize: TXT.chip, fontWeight: 700 }}>❗ {a.abiertos}</span>
            )}
            {a.casos > 0 && (
              <span style={{ color: "var(--dim)", fontSize: TXT.chip }} title="Casos vinculados">📌 {a.casos}</span>
            )}
            {a.coments > 0 && (
              <span style={{ color: "var(--muted)", fontSize: TXT.chip }} title="Comentarios">💬 {a.coments}</span>
            )}
            <BotonComprobar equipoId={x.id} ultima={x.ultima_comprobacion} compacto={!ronda} />
            <span className="badge" style={{ color: EST_META[x.estado]?.[1] || "var(--muted)", background: "#1c1c2c", fontSize: TXT.chip }}>
              {(x.estado || "").replace(/_/g, " ")}
            </span>
          </div>
          {(() => {
            const c = completitud("equipamiento", x);
            return <Completitud mini pct={c.pct} llenos={c.llenos} total={c.total} faltan={c.faltan} />;
          })()}
        </div>
      </Link>
    );
  };

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/casos/equipamiento" className="btn btn-ghost"
          title="Todos los casos, agrupados por equipo">🗂 Casos</Link>
        <Link href="/historial/equipamiento" className="btn btn-ghost"
          title="Todo lo que se movió en los equipos, por periodo">🕐 Historial</Link>
        <Link href="/entidad/equipamiento/nuevo" className="btn">＋ Nuevo equipo</Link>
      </div>
      <h1 className="title-lg">🎥 Equipos audiovisuales</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        {c && <input type="hidden" name="c" value={c} />}
        {f && <input type="hidden" name="f" value={f} />}
        {ronda && <input type="hidden" name="ronda" value="1" />}
        <span className="buscador-lista">
          <span className="bg-lupa">🔍</span>
          <input name="q" defaultValue={q}
            placeholder="Nombre, folio, categoría, «en reparación», «perdido»…" />
        </span>
        <button className="btn" type="submit">Buscar</button>
      </form>

      <PanelFiltros limpiar="/equipamiento" mostrarLimpiar={listar}>
        <FilaFiltro titulo="Estado">
          {Object.entries(EST_META).map(([est, [lbl, col]]) => {
            const n = cnt(est);
            return n === 0 ? null : (
              <Chip key={est} href={`/equipamiento?e=${est}`} on={e === est} color={col}>
                {lbl} · {n}
              </Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Categoría">
          {[...porCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
            <Chip key={cat} href={`/equipamiento?c=${encodeURIComponent(cat)}`}
              on={c === cat} color="var(--violet)">{cat} · {n}</Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Atención">
          <Chip href="/equipamiento?ronda=1" on={ronda} color="var(--yellow)"
            title="Nadie los ha visto físicamente en 90+ días">
            🔍 por comprobar · {pendientesRonda}
          </Chip>
          <Chip href="/equipamiento?f=sin_valor" on={f === "sin_valor"} color="var(--yellow)"
            title="Sin precio no suman al valor del inventario">
            ⚠ sin precio · {cntF("sin_valor")}
          </Chip>
          <Chip href="/equipamiento?f=sin_folio" on={f === "sin_folio"} color="var(--yellow)"
            title="Sin folio no se puede citar en un acta ni etiquetar">
            ⚠ sin folio · {cntF("sin_folio")}
          </Chip>
          <Chip href="/equipamiento?f=sin_categoria" on={f === "sin_categoria"} color="var(--dim)"
            title="Sin categoría no entra en el inventario por categoría">
            ⚠ sin categoría · {cntF("sin_categoria")}
          </Chip>
        </FilaFiltro>
      </PanelFiltros>

      {!listar && (
        <>
          {/* Solo lo que informa: los conteos por estado y la ronda son
              filtros y viven arriba, en el panel.
              El total suma únicamente lo que tiene precio cargado; si faltan
              muchos, el número es una fracción y hay que decirlo. */}
          <div className="stat-grid">
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>
                S/ {Math.round(valorTotal).toLocaleString("es-PE")}
              </span>
              <span className="stat-l">
                valor del inventario activo
                {cntF("sin_valor") > 0 && (
                  <b style={{ color: "var(--yellow)", display: "block" }}>
                    ⚠ {cntF("sin_valor")} sin precio — el total va corto
                  </b>
                )}
              </span>
            </span>
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--yellow)", display: "block" }}>{(enManos || []).length}</span>
              <span className="stat-l">🤝 en manos de alguien ahora</span>
            </span>
          </div>

          {(enManos || []).length > 0 && (
            <div className="card">
              <div className="panel-h" style={{ color: "var(--yellow)" }}>🤝 En uso ahora — quién tiene qué</div>
              {(enManos || []).map((p: any) => (
                <div className="info-row" key={p.id}>
                  {miniEquipo(cartelPorEq.get(un1(p.equipo)?.id), 42)}
                  {p.equipo?.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: TXT.chip }}>{p.equipo.folio}</span>}
                  <Link href={`/entidad/equipamiento/${p.equipo?.id}`} style={{ fontWeight: 600, fontSize: TXT.base }}>
                    {p.equipo?.nombre} →
                  </Link>
                  <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>en manos de</span>
                  <Link href={`/entidad/persona/${p.persona?.id}`} style={{ color: "var(--teal)", fontWeight: 600, fontSize: TXT.micro, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {avatarPersona(un1(p.persona)?.foto_url, 28)} {p.persona?.alias || p.persona?.nombre}
                  </Link>
                  {p.proy && (
                    <Link href={`/entidad/proyecto/${p.proy.id}`} className="badge"
                      style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)", fontSize: TXT.chip }}>📁 {p.proy.nombre}</Link>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "var(--dim)", fontSize: TXT.chip }}>
                    desde {new Date(p.desde + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                  </span>
                  <BotonDevolver prestamoId={p.id} equipoId={p.equipo?.id} />
                </div>
              ))}
            </div>
          )}

          {gruposAct.length > 0 && (
            <div className="card">
              <div className="panel-h">🗒 Última actividad de los equipos</div>
              {gruposAct.map((g: any, gi: number) => (
                <div key={g.eq.id} style={{ padding: "10px 0 4px", borderTop: gi ? "1px solid var(--border)" : "none" }}>
                  {/* Nodo raíz: el equipo */}
                  <Link href={`/entidad/equipamiento/${g.eq.id}`} style={{ display: "flex", gap: 9, alignItems: "center" }}>
                    {miniEquipo(cartelPorEq.get(g.eq.id), 42)}
                    <b style={{ fontSize: TXT.base, color: "var(--text)" }}>{g.eq.nombre}</b>
                    {g.eq.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: TXT.chip }}>{g.eq.folio}</span>}
                  </Link>
                  {/* Ramas: sus últimos movimientos */}
                  <div style={{ marginLeft: 16, borderLeft: "1px solid var(--border)", paddingLeft: 14, marginTop: 7, display: "flex", flexDirection: "column", gap: 7 }}>
                    {g.items.map((it: any, i: number) => {
                      const per = it.persona?.alias || it.persona?.nombre || "alguien";
                      const fecha = <span style={{ color: "var(--dim)", fontSize: TXT.chip, whiteSpace: "nowrap", flexShrink: 0 }}>{new Date(it.at).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</span>;
                      if (it.tipo === "uso_ini" || it.tipo === "uso_fin") {
                        const ini = it.tipo === "uso_ini";
                        return (
                          <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: TXT.micro }}>
                              <span style={{ color: ini ? "var(--yellow)" : "var(--dim)", fontWeight: 700 }}>{ini ? "🤝 Puesto en uso" : "↩ Liberado"}</span>
                              <span style={{ color: "var(--muted)" }}> — {per}</span>
                            </span>
                            {fecha}
                          </div>
                        );
                      }
                      const cuerpo = (it.cuerpo === "📷" ? "📷 (foto)" : (it.cuerpo || "")).replace(/\s+/g, " ").slice(0, 110);
                      return (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: TXT.micro }}>
                              <b>{it.autor?.nombre || "Alguien"}</b>
                              {it.uso && <span style={{ color: "var(--dim)" }}> · sobre un uso</span>}
                              {it.es_dano && <span style={{ marginLeft: 6, color: "var(--dano)", fontWeight: 700, fontSize: TXT.chip }}>🔧 daño</span>}
                            </span>
                            <span style={{ display: "block", color: "var(--muted)", fontSize: TXT.chip, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cuerpo}</span>
                          </span>
                          {fecha}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {atencion.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>🔧 Requieren atención</div>
              {atencion.map((x: any) => (
                <div className="info-row" key={x.id}>
                  {miniEquipo(cartelPorEq.get(x.id), 38)}
                  {x.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: TXT.chip }}>{x.folio}</span>}
                  <Link href={`/entidad/equipamiento/${x.id}`} style={{ fontWeight: 600, flex: 1, fontSize: TXT.base }}>{x.nombre}</Link>
                  <span style={{ color: x.estado === "perdido" ? "var(--red)" : "#f59e0b", fontSize: TXT.micro, fontWeight: 700 }}>
                    {x.estado.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ color: "var(--dim)", fontSize: TXT.micro, textAlign: "center", margin: "6px 0 14px" }}>
            {todos.length} equipos en total — usa el buscador, un estado o una categoría para ver la lista.
          </div>
        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: TXT.micro, margin: "2px 4px 10px" }}>
            {ronda && <b style={{ color: "var(--yellow)" }}>🔍 MODO RONDA — marca cada equipo que veas físicamente · </b>}
            {filtradosTodos.length} resultado{filtradosTodos.length === 1 ? "" : "s"}
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}
            {c && ` · ${c}`}{f && ` · ${f.replace(/_/g, " ")}`}{q && ` · «${q}»`}
          </div>
          {/* Agrupados por categoría: los lentes con los lentes */}
          {(() => {
            const cats = [...new Set(filtrados.map((x: any) => x.categoria || ""))]
              .sort((a: any, b: any) => (a ? 0 : 1) - (b ? 0 : 1) || String(a).localeCompare(String(b)));
            return cats.map((cat: any) => {
              const filas = filtrados.filter((x: any) => (x.categoria || "") === cat);
              return (
                <div key={cat || "sin"} style={{ marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 4px 6px" }}>
                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
                      {cat || "sin categoría"} · {filas.length}
                    </span>
                    <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>
                  {filas.map(Fila)}
                </div>
              );
            });
          })()}
          {!filtrados.length && <div className="empty">Sin equipos {q && `para «${q}»`}.</div>}
          {/* Antes el aviso saltaba en 150 pero el corte era 200: pasando de
              200 la lista se recortaba en silencio y nadie se enteraba. */}
          {filtradosTodos.length > TOPE && (
            <div className="empty" style={{ color: "var(--yellow)" }}>
              ⚠ Mostrando {TOPE} de {filtradosTodos.length} — afina la búsqueda o filtra por categoría.
            </div>
          )}
        </>
      )}
    </div>
  );
}
