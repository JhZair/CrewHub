import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { BotonVerificarLote } from "@/components/VerificarSunat";
import Link from "next/link";
import { redirect } from "next/navigation";

const diasDesde = (f: string) => Math.floor((Date.now() - new Date(f + "T12:00:00").getTime()) / 86400000);

const EST_META: Record<string, [string, string]> = {
  activa: ["Activas", "var(--green)"],
  en_constitucion: ["En constitución", "var(--yellow)"],
  inactiva: ["Inactivas", "var(--dim)"],
  en_proceso_de_cierre: ["En cierre", "var(--dim)"],
  cerrada: ["Cerradas", "var(--dim)"],
};

const TIPOS = ["eirl", "sac", "asociacion", "ong", "municipalidad", "otro"];
const ICONO_POST: Record<string, string> = {
  en_preparacion: "🛠", enviada: "📨", finalista: "⭐",
};
const REL_META: Record<string, [string, string]> = {
  propia: ["propia", "var(--violet)"],
  aliada: ["aliada", "var(--teal)"],
  externa: ["externa", "var(--dim)"],
};

/* Solo somos responsables de las propias y activas: son las únicas que
   deben exigir acción. El resto es contexto, no tarea. */
const nosCompete = (x: any) => x.estado === "activa" && (x.relacion || "propia") === "propia";

/* Un solo estilo de filtro para todas las dimensiones */
const Chip = ({ href, on, color, children }: {
  href: string; on?: boolean; color?: string; children: React.ReactNode;
}) => (
  <Link href={href} className={`vtab${on ? " on" : ""}`}
    style={!on && color ? { color } : undefined}>{children}</Link>
);

const FilaFiltro = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "5px 0" }}>
    <span style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, color: "var(--dim)", width: 58, flex: "none" }}>
      {titulo}
    </span>
    {children}
  </div>
);

export default async function Empresas({ searchParams }: {
  searchParams: { q?: string; e?: string; sunat?: string; t?: string; r?: string; f?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const t = searchParams?.t || "";
  const r = searchParams?.r || "";
  const f = searchParams?.f || "";
  const sunat = searchParams?.sunat === "1";
  const listar = !!(q || e || sunat || t || r || f);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: emps }, { data: vincs }, { data: postsEmp }, { data: coms }] = await Promise.all([
    supabase.from("empresas").select("*").order("codigo"),
    supabase.from("publicacion_vinculos")
      .select("entidad_id,publicacion_id,pub:publicaciones(estado)").eq("entidad_tipo", "empresa"),
    supabase.from("postulaciones")
      .select("id,empresa_id,estado,monto_adjudicado,proy:proyectos(nombre),conv:convocatorias(nombre,anio)")
      .not("empresa_id", "is", null),
    supabase.from("comentarios").select("publicacion_id"),
  ]);

  // Actividad real en CrewHub+: en qué estado están sus casos y cuánto se conversó
  const comentPorPub = new Map<string, number>();
  (coms || []).forEach((c: any) => comentPorPub.set(c.publicacion_id, (comentPorPub.get(c.publicacion_id) || 0) + 1));

  type Act = { abiertas: number; progreso: number; cerradas: number; coments: number; total: number };
  const act = new Map<string, Act>();
  (vincs || []).forEach((v: any) => {
    const a = act.get(v.entidad_id) || { abiertas: 0, progreso: 0, cerradas: 0, coments: 0, total: 0 };
    const est = (v.pub as any)?.estado;
    a.total++;
    if (est === "abierta") a.abiertas++;
    else if (["en_progreso", "seguimiento", "en_pausa"].includes(est)) a.progreso++;
    else if (["resuelta", "archivada"].includes(est)) a.cerradas++;
    a.coments += comentPorPub.get(v.publicacion_id) || 0;
    act.set(v.entidad_id, a);
  });
  const VACIO: Act = { abiertas: 0, progreso: 0, cerradas: 0, coments: 0, total: 0 };

  const todas = emps || [];
  const nrm = (s: any) => String(s || "").toLowerCase();

  // En concurso = la partida sigue viva (mismo criterio que la ficha)
  const EN_JUEGO = ["en_preparacion", "enviada", "finalista"];
  const marca = new Map<string, { total: number; ganadas: number; casi: number; monto: number; juego: number }>();
  (postsEmp || []).forEach((p: any) => {
    const m = marca.get(p.empresa_id) || { total: 0, ganadas: 0, casi: 0, monto: 0, juego: 0 };
    m.total++;
    if (p.estado === "ganadora") { m.ganadas++; m.monto += parseFloat(p.monto_adjudicado) || 0; }
    if (p.estado === "finalista_no_ganadora") m.casi++;
    if (EN_JUEGO.includes(p.estado)) m.juego++;
    marca.set(p.empresa_id, m);
  });
  const enConcurso = (postsEmp || []).filter((p: any) => EN_JUEGO.includes(p.estado));
  const empDe = new Map(todas.map((x: any) => [x.id, x]));

  // Filtro por fondos: cada opción con su prueba
  const PRUEBA_F: Record<string, (x: any) => boolean> = {
    juego: x => (marca.get(x.id)?.juego || 0) > 0,
    ganadoras: x => (marca.get(x.id)?.ganadas || 0) > 0,
    postularon: x => marca.has(x.id),
    nunca: x => !marca.has(x.id),
  };

  // Requiere atención = mal en SUNAT Y es nuestra responsabilidad
  const alertas = todas.filter((x: any) =>
    nosCompete(x) && ((x.estado_sunat && x.estado_sunat !== "activo") || x.condicion_sunat === "no_habido"));
  const filtradas = todas.filter((x: any) =>
    (!e || x.estado === e) &&
    (!t || x.tipo === t) &&
    (!r || (x.relacion || "externa") === r) &&
    (!f || PRUEBA_F[f]?.(x)) &&
    (!sunat || (x.estado_sunat && x.estado_sunat !== "activo")) &&
    (!q || nrm(x.nombre).includes(nrm(q)) || nrm(x.razon_social).includes(nrm(q)) ||
      nrm(x.codigo).includes(nrm(q)) || nrm(x.ruc).includes(nrm(q))));
  const cnt = (est: string) => todas.filter((x: any) => x.estado === est).length;
  const cntF = (k: string) => todas.filter(PRUEBA_F[k]).length;

  // Palmarés competitivo: qué empresa gana, roza y persiste
  const palmares = todas
    .filter((x: any) => marca.has(x.id))
    .map((x: any) => ({ emp: x, ...marca.get(x.id)! }))
    .sort((a, b) => b.ganadas - a.ganadas || b.casi - a.casi || b.total - a.total)
    .slice(0, 10);

  const Fila = (emp: any) => {
    const a = act.get(emp.id) || VACIO;
    const m = marca.get(emp.id);
    const alerta = nosCompete(emp)
      && ((emp.estado_sunat && emp.estado_sunat !== "activo") || emp.condicion_sunat === "no_habido");
    return (
      <Link key={emp.id} href={`/entidad/empresa/${emp.id}`}>
        <div className="card link" style={{ cursor: "pointer", padding: "11px 16px" }}>
          {/* línea 1: quién es */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14.5 }}>{emp.nombre}</b>
            {emp.relacion && (
              <span className="badge" style={{ color: REL_META[emp.relacion]?.[1] || "var(--dim)", background: "#1c1c2c" }}>
                {emp.relacion}
              </span>
            )}
            {emp.tipo && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{emp.tipo}</span>}
            {/* En concurso: la partida sigue viva, es lo más accionable */}
            {m && m.juego > 0 && (
              <span className="badge" title={`${m.juego} postulación(es) en curso`}
                style={{ color: "var(--violet)", background: "rgba(167,139,250,.14)", fontWeight: 700 }}>
                ⏳ {m.juego} en concurso
              </span>
            )}
            {/* Palmarés: lo que ha logrado ante los fondos */}
            {m && m.ganadas > 0 && (
              <span className="badge" title={`${m.ganadas} fondo(s) ganado(s)`}
                style={{ color: "var(--green)", background: "rgba(46,204,113,.12)" }}>🏆 {m.ganadas}</span>
            )}
            {m && m.casi > 0 && (
              <span className="badge" title={`${m.casi} vez/veces finalista sin ganar`}
                style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>🥈 {m.casi}</span>
            )}
            {m && m.total > 0 && (
              <span className="badge" title={`${m.total} postulación(es) en total`}
                style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)" }}>🎯 {m.total}</span>
            )}
            {alerta && (
              <span className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.12)" }}>
                ⚠ {(emp.estado_sunat || emp.condicion_sunat || "").replace(/_/g, " ")}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <span className="badge" style={{
              color: EST_META[emp.estado]?.[1] || "var(--dim)", background: "#1c1c2c",
            }}>{(emp.estado || "—").replace(/_/g, " ")}</span>
          </div>

          {/* línea 2: su vida en CrewHub+ */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 7, fontSize: 11.5 }}>
            {emp.codigo && <span style={{ color: "var(--dim)" }}>{emp.codigo}</span>}
            {/* Sin RUC solo alarma si figura activa: en constitución es normal */}
            {emp.ruc ? (
              <span style={{ color: "var(--dim)" }}>RUC {emp.ruc}</span>
            ) : nosCompete(emp) ? (
              <span style={{ color: "var(--red)", fontWeight: 700 }}>⚠ sin RUC</span>
            ) : null}
            {emp.razon_social && (
              <span style={{ color: "var(--dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {emp.razon_social}
              </span>
            )}
            <span style={{ flex: 1 }} />
            {m && m.monto > 0 && (
              <span style={{ color: "var(--teal)", fontWeight: 700 }}>
                S/ {m.monto.toLocaleString("es-PE")} ganado
              </span>
            )}
            {a.abiertas > 0 && <span style={{ color: "var(--red)" }}>❗ {a.abiertas} sin resolver</span>}
            {a.progreso > 0 && <span style={{ color: "var(--yellow)" }}>🔄 {a.progreso} en progreso</span>}
            {a.cerradas > 0 && <span style={{ color: "var(--green)" }}>✅ {a.cerradas}</span>}
            {a.coments > 0 && <span style={{ color: "var(--muted)" }}>💬 {a.coments}</span>}
            {!a.total && <span style={{ color: "var(--dim)" }}>sin actividad</span>}
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
        <Link href="/proyectos" className="btn btn-ghost">📁 Proyectos</Link>
        <Link href="/entidad/empresa/nuevo" className="btn">＋ Nueva empresa</Link>
      </div>
      <h1 className="title-lg">🏢 Empresas</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        {t && <input type="hidden" name="t" value={t} />}
        {r && <input type="hidden" name="r" value={r} />}
        {f && <input type="hidden" name="f" value={f} />}
        {sunat && <input type="hidden" name="sunat" value="1" />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, razón social, código o RUC..."
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", outline: "none", fontSize: 13.5 }} />
        <button className="btn" type="submit">Buscar</button>
      </form>

      {/* Todo esto son filtros: un solo estilo, agrupados por dimensión */}
      <div className="card" style={{ padding: "8px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4, borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
            Filtros
          </span>
          <span style={{ flex: 1 }} />
          {listar && (
            <Link href="/empresas" className="vtab" style={{ padding: "2px 9px", fontSize: 11 }}>
              ✕ limpiar filtros
            </Link>
          )}
        </div>
        <FilaFiltro titulo="Relación">
          {Object.entries(REL_META).map(([k, [lbl, col]]) => (
            <Chip key={k} href={`/empresas?r=${k}`} on={r === k} color={col}>
              {lbl} · {todas.filter((x: any) => (x.relacion || "externa") === k).length}
            </Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Estado">
          {Object.entries(EST_META).map(([k, [lbl, col]]) => (
            <Chip key={k} href={`/empresas?e=${k}`} on={e === k} color={col}>
              {lbl} · {cnt(k)}
            </Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Tipo">
          {TIPOS.map(tt => {
            const n = todas.filter((x: any) => x.tipo === tt).length;
            return n === 0 ? null : (
              <Chip key={tt} href={`/empresas?t=${tt}`} on={t === tt}>{tt} · {n}</Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Fondos">
          <Chip href="/empresas?f=juego" on={f === "juego"} color="var(--violet)">
            ⏳ en concurso · {cntF("juego")}
          </Chip>
          <Chip href="/empresas?f=ganadoras" on={f === "ganadoras"} color="var(--green)">
            🏆 ganadoras · {cntF("ganadoras")}
          </Chip>
          <Chip href="/empresas?f=postularon" on={f === "postularon"} color="var(--blue)">
            🎯 postularon · {cntF("postularon")}
          </Chip>
          <Chip href="/empresas?f=nunca" on={f === "nunca"}>
            nunca postuló · {cntF("nunca")}
          </Chip>
        </FilaFiltro>
        {/* Para limpiar ya está "✕ Panel" arriba: no duplicamos el botón */}
        <FilaFiltro titulo="Atención">
          <Chip href="/empresas?sunat=1" on={sunat}
            color={alertas.length ? "var(--red)" : "var(--green)"}>
            ⚠ SUNAT · {alertas.length}
          </Chip>
        </FilaFiltro>
      </div>

      {!listar && (
        <>
          <div className="card">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div className="panel-h" style={{ margin: 0 }}>🔄 Ronda SUNAT</div>
              <span style={{ flex: 1 }} />
              <BotonVerificarLote />
            </div>
            <p style={{ color: "var(--dim)", fontSize: 12, margin: "8px 0 0" }}>
              Consulta el RUC de todas las activas y actualiza estado, condición y fecha de verificación.
              Bot Qhaway deja de contar "sin verificar" por 60 días.
            </p>
          </div>

          {(() => {
            // Activa y propia pero sin RUC: no puede verificarse ni postular
            const sinRuc = todas.filter((x: any) => nosCompete(x) && !x.ruc);
            return sinRuc.length > 0 && (
              <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
                <div className="panel-h" style={{ color: "var(--red)" }}>
                  🏛 Sin RUC registrado — no pueden verificarse ni postular
                </div>
                {sinRuc.map((x: any) => (
                  <div className="info-row" key={x.id}>
                    <Link href={`/entidad/empresa/${x.id}`} style={{ fontWeight: 600 }}>
                      {x.codigo ? `${x.codigo} · ` : ""}{x.nombre} →
                    </Link>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: "var(--red)", fontSize: 12, fontWeight: 700 }}>falta el RUC</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {alertas.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>⚠ Salud SUNAT — requiere atención</div>
              {alertas.map((x: any) => (
                <div className="info-row" key={x.id}>
                  <Link href={`/entidad/empresa/${x.id}`} style={{ fontWeight: 600 }}>
                    {x.codigo ? `${x.codigo} · ` : ""}{x.nombre}
                  </Link>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>
                    {x.estado_sunat.replace(/_/g, " ")}
                    {x.condicion_sunat && x.condicion_sunat !== "habido" ? ` · ${x.condicion_sunat.replace(/_/g, " ")}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(() => {
            // Vigencia de poder: DAFO suele exigirla con < 3 meses de emisión
            const anejas = todas.filter((x: any) =>
              nosCompete(x) && x.vigencia_poder_fecha && diasDesde(x.vigencia_poder_fecha) > 90);
            return anejas.length > 0 && (
              <div className="card" style={{ borderColor: "rgba(244,180,0,.35)" }}>
                <div className="panel-h" style={{ color: "var(--yellow)" }}>
                  📜 Vigencias de poder con 90+ días — renovar antes de postular
                </div>
                {anejas.map((x: any) => (
                  <div className="info-row" key={x.id}>
                    <Link href={`/entidad/empresa/${x.id}`} style={{ fontWeight: 600 }}>
                      {x.codigo ? `${x.codigo} · ` : ""}{x.nombre} →
                    </Link>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: "var(--yellow)", fontSize: 12, fontWeight: 700 }}>
                      emitida hace {diasDesde(x.vigencia_poder_fecha)} días
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}

          {enConcurso.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(167,139,250,.35)" }}>
              <div className="panel-h" style={{ color: "var(--violet)" }}>
                ⏳ En concurso ahora · {enConcurso.length}
              </div>
              {enConcurso.map((p: any) => {
                const emp = empDe.get(p.empresa_id) as any;
                return (
                  <div className="info-row" key={p.id}>
                    <Link href={`/entidad/postulacion/${p.id}`} style={{ fontWeight: 600 }}>
                      {ICONO_POST[p.estado] || "🎯"} {p.proy?.nombre || "Postulación"} →
                    </Link>
                    {emp && (
                      <Link href={`/entidad/empresa/${emp.id}`} className="badge"
                        style={{ color: REL_META[emp.relacion]?.[1] || "var(--muted)", background: "#1c1c2c" }}>
                        {emp.nombre}
                      </Link>
                    )}
                    <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                      {p.conv?.nombre}{p.conv?.anio ? ` · ${p.conv.anio}` : ""}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: "var(--violet)", fontSize: 12, fontWeight: 700 }}>
                      {(p.estado || "").replace(/_/g, " ")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {palmares.length > 0 && (
            <div className="card">
              <div className="panel-h" style={{ color: "var(--yellow)" }}>🏅 Palmarés — quién gana, quién roza, quién persiste</div>
              {palmares.map(({ emp, total, ganadas, casi, monto }) => (
                <div className="info-row" key={emp.id}>
                  <Link href={`/entidad/empresa/${emp.id}`} style={{ fontWeight: 600 }}>
                    {emp.codigo ? `${emp.codigo} · ` : ""}{emp.nombre} →
                  </Link>
                  {ganadas > 0 && (
                    <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)" }}>
                      🏆 {ganadas}
                    </span>
                  )}
                  {casi > 0 && (
                    <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>
                      🥈 {casi}
                    </span>
                  )}
                  <span className="badge" style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)" }}>
                    🎯 {total} intento{total === 1 ? "" : "s"}
                  </span>
                  <span style={{ flex: 1 }} />
                  {monto > 0 && (
                    <span style={{ color: "var(--teal)", fontSize: 12.5, fontWeight: 700 }}>
                      S/ {monto.toLocaleString("es-PE")} ganado
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="card">
            {/* "Del grupo" era mentira: la mayoría son terceros. El color
                dice de quién es cada una; el borde rojo, solo lo que nos toca. */}
            <div className="panel-h">🏢 Todas las empresas · {todas.length}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {todas.map((x: any) => {
                const alerta = nosCompete(x)
                  && ((x.estado_sunat && x.estado_sunat !== "activo") || x.condicion_sunat === "no_habido");
                const col = REL_META[x.relacion]?.[1];
                return (
                  <Link key={x.id} href={`/entidad/empresa/${x.id}`} className="vtab"
                    title={`${x.relacion || "externa"}${x.tipo ? ` · ${x.tipo}` : ""}`}
                    style={alerta ? { borderColor: "var(--red)", color: "var(--red)" }
                      : x.relacion === "propia" || x.relacion === "aliada" ? { color: col } : undefined}>
                    {x.nombre}
                  </Link>
                );
              })}
            </div>
            <p style={{ color: "var(--dim)", fontSize: 11.5, margin: "10px 0 0" }}>
              <span style={{ color: "var(--violet)" }}>propias</span> ·{" "}
              <span style={{ color: "var(--teal)" }}>aliadas</span> · externas ·{" "}
              <span style={{ color: "var(--red)" }}>requiere atención</span>
            </p>
          </div>
        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: 13, margin: "2px 4px 10px" }}>
            {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}
            {r && ` · ${r}`}{t && ` · ${t}`}
            {f === "juego" ? " · en concurso" : f === "ganadoras" ? " · ganadoras"
              : f === "postularon" ? " · postularon" : f === "nunca" ? " · nunca postuló" : ""}
            {sunat && " · con alerta SUNAT"}{q && ` · «${q}»`}
          </div>
          {/* Agrupadas por tipo: las eirl con las eirl, las asociaciones juntas */}
          {(() => {
            const orden = [...TIPOS, ""];   // "" recoge las que no tienen tipo
            const grupos = orden
              .map(tt => ({ tt, filas: filtradas.filter((x: any) => (x.tipo || "") === tt) }))
              .filter(g => g.filas.length > 0);
            return grupos.map(({ tt, filas }) => (
              <div key={tt || "sin"} style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 4px 6px" }}>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
                    {tt || "sin tipo"} · {filas.length}
                  </span>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
                {filas.map(Fila)}
              </div>
            ));
          })()}
          {!filtradas.length && <div className="empty">Sin resultados{q && ` para «${q}»`}.</div>}
        </>
      )}
    </div>
  );
}
