import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import LineaTiempo, { type EventoLT } from "@/components/LineaTiempo";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { TIPO_COLOR } from "@/lib/entidades";
// EN_JUEGO y la regla de ejecución viven en lib/fondos.ts: /empresas las
// tenía escritas aparte, y ya no decían lo mismo.
import { EN_JUEGO, ejecutando, rendicionVencida, plazoRendicion } from "@/lib/fondos";
import { buscadorDe, pal } from "@/lib/buscar";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🎯 Postulaciones" };

/* El camino tiene DOS jueces: primero DAFO revisa papeles y declara aptas
   (bases 5.2, administrativo), después el jurado elige. Por eso «apta» y
   «no apta» son estados propios: sacar a alguien por su RUC no es lo mismo
   que no elegirlo por su película. */
const EST_META: Record<string, [string, string]> = {
  en_preparacion: ["🛠 En preparación", "var(--violet)"],
  enviada: ["📨 Enviadas", "var(--blue)"],
  apta: ["✅ Aptas", "var(--teal)"],
  no_apta: ["🚫 No aptas", "var(--red)"],
  finalista: ["⭐ Finalistas", "var(--yellow)"],
  ganadora: ["🏆 Ganadoras", "var(--green)"],
  finalista_no_ganadora: ["🥈 Finalistas (no ganaron)", "var(--yellow)"],
  no_seleccionada: ["✖ No seleccionadas", "var(--dim)"],
  retirada: ["↩ Retiradas", "var(--dim)"],
};
const dias = (f: string) => Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });
const colorD = (d: number) => (d <= 2 ? "var(--red)" : d <= 7 ? "var(--yellow)" : "var(--muted)");

const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];

export default async function Postulaciones({ searchParams }: {
  searchParams: { q?: string; e?: string; a?: string; t?: string; f?: string; y?: string };
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
      .select("id,codigo,estado,monto_adjudicado,codigo_acta,fecha_limite_rendicion,fecha_prorroga,fecha_rendicion_real,creado_en,conv:convocatorias(id,codigo,nombre,anio,estado,monto_adjudicado),proy:proyectos(id,nombre,tipo),emp:empresas(id,nombre)")
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
    /* Debiendo: el plazo pasó y no hay entrega. Lo más grave que le puede
       pasar a la empresa ante DAFO, y hasta hoy no se podía listar porque el
       sistema lo daba por cerrado. */
    debiendo: rendicionVencida,
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
  /* Ejecución viva = ganó y todavía no entregó la rendición (lib/fondos.ts).
     Aquí había una tercera versión de la misma regla, y era la más rara: sin
     fecha de rendición miraba si la CONVOCATORIA estaba cerrada, como si el
     fondo se terminara porque el concurso terminó. Son cosas distintas — el
     concurso cierra cuando se anuncian los ganadores; el fondo, cuando
     rindes. Ninguna fecha ni ningún estado ajeno lo puede decir: lo dice la
     entrega, que ahora se registra. */
  const enEjecucion = ganas.filter(ejecutando);
  const anios = posts.map((p: any) => p.conv?.anio).filter(Boolean);
  const porAnio = [...new Set(anios)].sort((a: any, b: any) => b - a);

  /* ── El embudo del año ──
   *
   * «Entran varios, según las fechas del cronograma avanzan, solo algunos
   *  pasan, y al final unos cuantos ganan.»
   *
   * La lista de «rutas activas» no era eso: mostraba las 20 que siguen vivas
   * y escondía a las que quedaron en el camino. **Un embudo se entiende por lo
   * que se cae.** Sin los caídos es una lista con forma de lista.
   *
   * Los cuatro escalones son acumulativos y por eso se estrechan: toda
   * ganadora fue finalista, toda finalista fue enviada, toda enviada se
   * preparó. El número de cada banda cuenta a las que LLEGARON hasta ahí,
   * incluidas las que siguieron. Así el ancho significa algo.
   */
  const anioEmbudo = Number(searchParams?.y) || Math.max(...(anios.length ? anios : [new Date().getFullYear()]));
  const delAnio = posts.filter((p: any) => p.conv?.anio === anioEmbudo);

  /* Hasta dónde llegó cada una. Hay DOS jueces y no uno, y por eso son cinco
     escalones: primero DAFO revisa papeles y declara APTAS —un revisor,
     administrativo, antes de que nadie lea el tratamiento— y recién después
     el jurado elige. Sin ese paso, «no seleccionada» mezclaba al descartado
     por un RUC con el que no convenció con su película. */
  const LLEGO: Record<string, number> = {
    en_preparacion: 1, retirada: 1,
    enviada: 2, no_apta: 2,
    apta: 3, no_seleccionada: 3,
    finalista: 4, finalista_no_ganadora: 4,
    ganadora: 5,
  };
  const CAE: Record<string, string> = {
    retirada: "se retiraron",
    no_apta: "no aptas — DAFO las sacó por papeles",
    no_seleccionada: "no las eligió el jurado",
    finalista_no_ganadora: "finalistas que no ganaron",
  };
  /* Dos dineros distintos, y antes eran uno solo —por eso «S/ 400,000»
     aparecía en las cuatro bandas—: `monto_adjudicado` solo lo tienen las
     ganadoras, así que las trece preparadas «valían» los 400 mil de la única
     que ganó. Arriba lo que hay EN JUEGO (el estímulo de su convocatoria);
     abajo, lo GANADO. */
  const enJuegoDe = (l: any[]) => l.reduce((s, p) => s + (parseFloat(p.conv?.monto_adjudicado) || 0), 0);
  const monto = (l: any[]) => l.reduce((s, p) => s + (parseFloat(p.monto_adjudicado) || 0), 0);

  const ESCALONES: [number, string, string, string][] = [
    [1, "🛠", "Se prepararon", "var(--violet)"],
    [2, "📨", "Se enviaron", "var(--blue)"],
    [3, "✅", "Aptas — pasaron el filtro de DAFO", "var(--teal)"],
    [4, "⭐", "Finalistas", "var(--yellow)"],
    [5, "🏆", "Ganaron", "var(--green)"],
  ];
  const embudo = ESCALONES.map(([n, ico, txt, col]) => {
    const llegaron = delAnio.filter((p: any) => (LLEGO[p.estado] ?? 0) >= n);
    // Se cayeron EN este escalón: llegaron hasta aquí y no siguieron
    const caidos = delAnio.filter((p: any) => (LLEGO[p.estado] ?? 0) === n && !!CAE[p.estado]);
    const vivos = delAnio.filter((p: any) => (LLEGO[p.estado] ?? 0) === n && !CAE[p.estado]);
    return { n, ico, txt, col, llegaron, caidos, vivos };
  });
  const base = Math.max(1, embudo[0].llegaron.length);
  const ganaronAnio = delAnio.filter((p: any) => p.estado === "ganadora");
  const decidióAnio = delAnio.filter((p: any) => !EN_JUEGO.includes(p.estado)).length;

  const Fila = (p: any) => {
    const x = act.get(p.id) || VACIO;
    const rend = plazoRendicion(p);
    /* Solo cuenta los días de las que siguen abiertas: una ganadora ya
       rendida no «vence» nada, y pintarla en rojo por una fecha vieja manda
       a alguien a resolver algo que ya está hecho. */
    const dRend = ejecutando(p) && rend ? dias(rend) : null;
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
          {p.fecha_rendicion_real && (
            <span style={{ color: "var(--green)", fontWeight: 700 }}
              title="Fondo cerrado: la empresa vuelve a estar libre para postular">
              ✅ rendida el {p.fecha_rendicion_real}
            </span>
          )}
          {dRend !== null && (
            <span style={{ fontWeight: 700,
              color: dRend < 0 ? "var(--red)" : dRend <= 60 ? "var(--yellow)" : "var(--dim)" }}
              title={dRend < 0 ? "El plazo pasó y no hay entrega registrada. Si ya se entregó, ponle la fecha en «Rendición entregada el»." : undefined}>
              🧾 {dRend < 0 ? `rendición vencida hace ${-dRend}d` : `rinde en ${dRend}d`}
              {p.fecha_prorroga ? " (prórroga)" : ""}
            </span>
          )}
          {ejecutando(p) && !rend && (
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
          <Chip href="/postulaciones?f=debiendo" on={f === "debiendo"} color="var(--red)"
            title="El plazo de rendición pasó y no hay entrega registrada. Mientras siga así, la empresa no puede postular a nada.">
            🔴 rendición vencida · {cntF("debiendo")}
          </Chip>
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

          {/* ── El embudo del año ──
              Antes esto era «🎯 Rutas activas»: una lista plana de las 20 que
              siguen vivas. Un embudo se entiende por lo que se cae, y los
              caídos no estaban. Ahora el ancho de cada banda dice cuántas
              llegaron hasta ahí, y al costado, en gris, las que se quedaron. */}
          {delAnio.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(59,130,246,.35)" }}>
              <div className="panel-h" style={{ color: "var(--blue)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1 }}>🎯 Embudo {anioEmbudo} · {delAnio.length} postulaciones</span>
                {/* Navegar años: el embudo de un año es una historia cerrada */}
                {porAnio.filter((y: any) => y !== anioEmbudo).map((y: any) => (
                  <Link key={y} href={`/postulaciones?y=${y}`} className="badge"
                    style={{ color: "var(--dim)", background: "#1c1c2c", textDecoration: "none" }}>{y}</Link>
                ))}
              </div>

              {embudo.map(({ n, ico, txt, col, llegaron, caidos, vivos }) => {
                const pct = Math.round((llegaron.length / base) * 100);
                return (
                  <div key={n} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, marginBottom: 3 }}>
                      <b style={{ color: col }}>{ico} {llegaron.length}</b>
                      <span style={{ color: "var(--muted)" }}>{txt}</span>
                      <span style={{ color: "var(--dim)", fontSize: 11 }}>· {pct}%</span>
                      <span style={{ flex: 1 }} />
                      {/* En juego arriba, ganado abajo: no son lo mismo y
                          mezclarlos hacía que las trece preparadas «valieran»
                          los 400 mil de la única que ganó. */}
                      {n < 5 && enJuegoDe(llegaron) > 0 && (
                        <span style={{ color: "var(--dim)", fontSize: 11 }}>
                          S/ {enJuegoDe(llegaron).toLocaleString("es-PE")} en juego
                        </span>
                      )}
                      {n === 5 && monto(llegaron) > 0 && (
                        <span style={{ color: "var(--teal)", fontSize: 11.5, fontWeight: 700 }}>
                          S/ {monto(llegaron).toLocaleString("es-PE")} ganados
                        </span>
                      )}
                    </div>
                    {/* La barra ES el embudo: se estrecha sola porque toda
                        ganadora fue finalista, toda finalista fue enviada.
                        Por eso el CARRIL tiene que medir lo mismo en todas las
                        filas. Antes era `flex:1` y compartía la fila con el
                        texto de los caídos, así que una banda con caídos tenía
                        menos sitio: «Se enviaron · 100%» y «Aptas · 100%»
                        salían de distinto largo siendo las dos 100%. Un embudo
                        cuyo ancho no se puede comparar entre filas no es un
                        embudo, es un adorno.
                        La columna de la derecha va con ancho fijo y se reserva
                        aunque esté vacía. */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ flex: 1, height: 10, background: "var(--bg)", borderRadius: 5, overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", borderRadius: 5,
                          width: `${Math.max(pct, llegaron.length ? 3 : 0)}%`, background: col, opacity: .85 }} />
                      </span>
                      {/* Los que se cayeron aquí: el embudo se explica por ellos */}
                      <span style={{ width: 190, flex: "0 0 190px", color: "var(--dim)", fontSize: 11,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={caidos.length
                          ? caidos.map((p: any) => `${p.codigo || ""} ${p.proy?.nombre || ""}`.trim()).join("\n")
                          : undefined}>
                        {caidos.length > 0 && <>↘ {caidos.length} {CAE[caidos[0].estado]}</>}
                      </span>
                    </div>
                    {/* Quiénes están parados en este escalón ahora mismo */}
                    {vivos.length > 0 && (
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                        {vivos.map((p: any) => (
                          <Link key={p.id} href={`/entidad/postulacion/${p.id}`} className="badge"
                            title={`${p.conv?.nombre || ""} ${p.conv?.anio || ""} · ${p.emp?.nombre || "sin empresa"}`}
                            style={{ color: col, background: `color-mix(in srgb, ${col} 12%, transparent)`,
                              textTransform: "none", letterSpacing: 0, textDecoration: "none", fontSize: 11 }}>
                            {p.proy?.nombre || p.codigo}
                            {p.conv?.codigo && <i style={{ opacity: .55, fontStyle: "normal" }}> · {p.conv.codigo}</i>}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* El resultado, cuando ya se sabe */}
              {decidióAnio > 0 && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4,
                  fontSize: 11.5, color: "var(--dim)" }}>
                  {ganaronAnio.length > 0
                    ? <>🏆 <b style={{ color: "var(--green)" }}>{ganaronAnio.length} de {decidióAnio}</b> decididas
                        {monto(ganaronAnio) > 0 && <> · <b style={{ color: "var(--teal)" }}>S/ {monto(ganaronAnio).toLocaleString("es-PE")}</b> ganados</>}</>
                    : <>{decidióAnio} decididas, ninguna ganó todavía</>}
                </div>
              )}
            </div>
          )}

          {enEjecucion.length > 0 && (
            <div className="card">
              <div className="panel-h" style={{ color: "var(--green)" }}>🏆 Ganadoras en ejecución — camino a la rendición</div>
              <LineaTiempo eventos={enEjecucion
                .filter(plazoRendicion)
                .map((g: any): EventoLT => {
                  const f = plazoRendicion(g)!;
                  return {
                    fecha: f,
                    titulo: `Rendición: ${g.proy?.nombre || "Proyecto"}${g.monto_adjudicado ? ` · S/ ${parseFloat(g.monto_adjudicado).toLocaleString("es-PE")}` : ""}${g.fecha_prorroga ? " (prórroga)" : ""}`,
                    icono: "🧾",
                    color: dias(f) < 60 ? "var(--red)" : dias(f) < 180 ? "var(--yellow)" : "var(--green)",
                    chip: g.conv?.codigo,
                    href: `/entidad/postulacion/${g.id}`,
                  };
                })} />
              {enEjecucion.filter((g: any) => !plazoRendicion(g)).map((g: any) => (
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
