import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { esDelEquipo } from "@/lib/personas";
import { esProblematico, textoSunat } from "@/lib/sunat";
import Link from "next/link";
import { redirect } from "next/navigation";

const EST_META: Record<string, [string, string]> = {
  activo: ["Activos", "var(--green)"],
  potencial: ["Potenciales", "var(--yellow)"],
  inactivo: ["Inactivos", "var(--dim)"],
  vetado: ["Vetados", "var(--red)"],
};
const TIPOS = ["personal", "colaborador", "colaborador eventual", "independiente", "contacto"];
const EQUIPOS = ["creativo", "tecnico", "artistico", "administrativo"];

const dias = (f: string) => Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

export default async function Personas({ searchParams }: {
  searchParams: { q?: string; e?: string; t?: string; eq?: string; a?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const t = searchParams?.t || "";
  const eq = searchParams?.eq || "";
  const a = searchParams?.a || "";
  const listar = !!(q || e || t || eq || a);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: pers }, { data: vincs }, { data: coms }, { data: equipoPost }] = await Promise.all([
    supabase.from("personas")
      .select("id,nombre,alias,tipo,equipo,estado,rol,region,usuario_id,ruc_dni,dni_vencimiento,estado_sunat,condicion_sunat,suspension_4ta_anio")
      .order("nombre"),
    supabase.from("publicacion_vinculos")
      .select("entidad_id,publicacion_id,pub:publicaciones(estado)").eq("entidad_tipo", "persona"),
    supabase.from("comentarios").select("publicacion_id"),
    supabase.from("postulacion_equipo").select("persona_id"),
  ]);

  const todas = pers || [];
  const nrm = (s: any) => String(s || "").toLowerCase();

  // Actividad real en CrewHub+
  const comentPorPub = new Map<string, number>();
  (coms || []).forEach((c: any) => comentPorPub.set(c.publicacion_id, (comentPorPub.get(c.publicacion_id) || 0) + 1));

  type Act = { abiertas: number; progreso: number; cerradas: number; coments: number; total: number };
  const VACIO: Act = { abiertas: 0, progreso: 0, cerradas: 0, coments: 0, total: 0 };
  const act = new Map<string, Act>();
  (vincs || []).forEach((v: any) => {
    const x = act.get(v.entidad_id) || { ...VACIO };
    const est = (v.pub as any)?.estado;
    x.total++;
    if (est === "abierta") x.abiertas++;
    else if (["en_progreso", "seguimiento", "en_pausa"].includes(est)) x.progreso++;
    else if (["resuelta", "archivada"].includes(est)) x.cerradas++;
    x.coments += comentPorPub.get(v.publicacion_id) || 0;
    act.set(v.entidad_id, x);
  });

  // En cuántas postulaciones ha estado: su hoja de vida ante los fondos
  const postDe = new Map<string, number>();
  (equipoPost || []).forEach((r: any) => postDe.set(r.persona_id, (postDe.get(r.persona_id) || 0) + 1));

  // Atención: solo exigimos papeles a quien trabaja con nosotros (lib/personas.ts)
  const delEquipo = esDelEquipo;
  const dniVence = (p: any) => p.dni_vencimiento ? dias(p.dni_vencimiento) : null;
  const anio = new Date().getFullYear();

  const PRUEBA_A: Record<string, (p: any) => boolean> = {
    dni_vencido: p => delEquipo(p) && (dniVence(p) ?? 1) < 0,
    dni_pronto: p => delEquipo(p) && (dniVence(p) ?? 999) >= 0 && (dniVence(p) ?? 999) <= 60,
    sin_dni: p => delEquipo(p) && !p.ruc_dni,
    // El dato existía, se verificaba y se pintaba en la ficha — pero nadie
    // avisaba. Alguien de baja en SUNAT no puede girarte un RHE.
    sunat_mal: p => delEquipo(p) && esProblematico(p.estado_sunat, p.condicion_sunat),
    // La suspensión muere el 31 de diciembre. Si no se avisa, el 1 de enero
    // caducan todas de golpe y te enteras cuando alguien gire con retención.
    susp_vencida: p => delEquipo(p) && !!p.suspension_4ta_anio && p.suspension_4ta_anio < anio,
    interno: p => !!p.usuario_id,
  };

  const filtradas = todas.filter((p: any) =>
    (!e || p.estado === e) &&
    (!t || (p.tipo || "contacto") === t) &&
    (!eq || p.equipo === eq) &&
    (!a || PRUEBA_A[a]?.(p)) &&
    (!q || nrm(p.nombre).includes(nrm(q)) || nrm(p.alias).includes(nrm(q)) ||
      nrm(p.rol).includes(nrm(q)) || nrm(p.region).includes(nrm(q)))
  ).slice(0, 150);

  const cnt = (est: string) => todas.filter((p: any) => p.estado === est).length;
  const cntT = (tt: string) => todas.filter((p: any) => (p.tipo || "contacto") === tt).length;
  const cntEq = (ee: string) => todas.filter((p: any) => p.equipo === ee).length;
  const cntA = (k: string) => todas.filter(PRUEBA_A[k]).length;

  const dniAlerta = todas
    .filter((p: any) => delEquipo(p) && p.dni_vencimiento && dias(p.dni_vencimiento) <= 60)
    .sort((x: any, y: any) => (x.dni_vencimiento < y.dni_vencimiento ? -1 : 1));
  const sinDni = todas.filter(PRUEBA_A.sin_dni);
  const sunatMalPers = todas.filter(PRUEBA_A.sunat_mal);
  const suspVencida = todas.filter(PRUEBA_A.susp_vencida);

  const Fila = (p: any) => {
    const x = act.get(p.id) || VACIO;
    const d = dniVence(p);
    const nPost = postDe.get(p.id) || 0;
    return (
      <Link key={p.id} href={`/entidad/persona/${p.id}`}>
        <div className="card link" style={{ cursor: "pointer", padding: "11px 16px" }}>
          {/* línea 1: quién es */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14.5 }}>{p.alias || p.nombre}</b>
            {p.usuario_id && <span title="Tiene cuenta en CrewHub+">⬡</span>}
            <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.tipo || "contacto"}</span>
            {p.equipo && (
              <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>{p.equipo}</span>
            )}
            {nPost > 0 && (
              <span className="badge" title={`Participó en ${nPost} postulación(es)`}
                style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)" }}>🎯 {nPost}</span>
            )}
            {delEquipo(p) && !p.ruc_dni && (
              <span className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.12)" }}>⚠ sin DNI</span>
            )}
            {d !== null && d < 0 && (
              <span className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.12)" }}>
                🪪 vencido hace {-d} d
              </span>
            )}
            {d !== null && d >= 0 && d <= 60 && (
              <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>
                🪪 vence en {d} d
              </span>
            )}
            <span style={{ flex: 1 }} />
            <span className="badge" style={{
              color: EST_META[p.estado]?.[1] || "var(--muted)", background: "#1c1c2c",
            }}>{p.estado}</span>
          </div>

          {/* línea 2: su vida en CrewHub+ */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 7, fontSize: 11.5 }}>
            {p.rol && (
              <span style={{ color: "var(--dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.rol}
              </span>
            )}
            {p.region && <span style={{ color: "var(--dim)" }}>📍 {p.region}</span>}
            <span style={{ flex: 1 }} />
            {x.abiertas > 0 && <span style={{ color: "var(--red)" }}>❗ {x.abiertas} sin resolver</span>}
            {x.progreso > 0 && <span style={{ color: "var(--yellow)" }}>🔄 {x.progreso} en progreso</span>}
            {x.cerradas > 0 && <span style={{ color: "var(--green)" }}>✅ {x.cerradas}</span>}
            {x.coments > 0 && <span style={{ color: "var(--muted)" }}>💬 {x.coments}</span>}
            {!x.total && <span style={{ color: "var(--dim)" }}>sin actividad</span>}
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
        <Link href="/casos/persona" className="btn btn-ghost"
          title="Todos los casos, agrupados por persona">🗂 Casos</Link>
        <Link href="/historial/persona" className="btn btn-ghost"
          title="Todo lo que se movió en las personas, por periodo">🕐 Historial</Link>
        <Link href="/entidad/persona/nuevo" className="btn">＋ Nueva persona</Link>
      </div>
      <h1 className="title-lg">👤 Personas</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        {t && <input type="hidden" name="t" value={t} />}
        {eq && <input type="hidden" name="eq" value={eq} />}
        {a && <input type="hidden" name="a" value={a} />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, alias, rol o región..."
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", outline: "none", fontSize: 13.5 }} />
        <button className="btn" type="submit">Buscar</button>
      </form>

      <PanelFiltros limpiar="/personas" mostrarLimpiar={listar}>
        <FilaFiltro titulo="Estado">
          {Object.entries(EST_META).map(([k, [lbl, col]]) => (
            <Chip key={k} href={`/personas?e=${k}`} on={e === k} color={col}>{lbl} · {cnt(k)}</Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Tipo">
          {TIPOS.map(tt => {
            const n = cntT(tt);
            return n === 0 ? null : (
              <Chip key={tt} href={`/personas?t=${encodeURIComponent(tt)}`} on={t === tt}>{tt} · {n}</Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Equipo">
          {EQUIPOS.map(ee => {
            const n = cntEq(ee);
            return n === 0 ? null : (
              <Chip key={ee} href={`/personas?eq=${ee}`} on={eq === ee} color="var(--violet)">{ee} · {n}</Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Atención">
          <Chip href="/personas?a=dni_vencido" on={a === "dni_vencido"} color="var(--red)"
            title="DNI ya vencido — no sirve para trámites">
            🪪 DNI vencido · {cntA("dni_vencido")}
          </Chip>
          <Chip href="/personas?a=dni_pronto" on={a === "dni_pronto"} color="var(--yellow)"
            title="Vence dentro de 60 días">
            🪪 por vencer · {cntA("dni_pronto")}
          </Chip>
          <Chip href="/personas?a=sin_dni" on={a === "sin_dni"} color="var(--red)"
            title="Del equipo pero sin DNI registrado">
            ⚠ sin DNI · {cntA("sin_dni")}
          </Chip>
          <Chip href="/personas?a=sunat_mal" on={a === "sunat_mal"} color="var(--red)"
            title="De baja o no habido en SUNAT — no puede girar RHE">
            🏛 SUNAT · {cntA("sunat_mal")}
          </Chip>
          <Chip href="/personas?a=susp_vencida" on={a === "susp_vencida"} color="var(--red)"
            title="Su suspensión de 4ta es de un año anterior: caducó el 31 de diciembre">
            📄 suspensión caducada · {cntA("susp_vencida")}
          </Chip>
          <Chip href="/personas?a=interno" on={a === "interno"} color="var(--violet)"
            title="Tienen cuenta en CrewHub+">
            ⬡ con cuenta · {cntA("interno")}
          </Chip>
        </FilaFiltro>
      </PanelFiltros>

      {!listar && (
        <>
          {sinDni.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>
                ⚠ Sin DNI registrado — no se puede verificar ni contratar
              </div>
              {sinDni.map((p: any) => (
                <div className="info-row" key={p.id}>
                  <Link href={`/entidad/persona/${p.id}`} style={{ fontWeight: 600, flex: 1 }}>
                    {p.nombre} →
                  </Link>
                  <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{p.tipo}</span>
                  <span style={{ color: "var(--red)", fontSize: 12, fontWeight: 700 }}>falta el DNI</span>
                </div>
              ))}
            </div>
          )}

          {sunatMalPers.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>
                🏛 Con problema en SUNAT — no pueden girar RHE
              </div>
              {sunatMalPers.map((p: any) => (
                <div className="info-row" key={p.id}>
                  <Link href={`/entidad/persona/${p.id}`} style={{ fontWeight: 600, flex: 1 }}>
                    {p.nombre} →
                  </Link>
                  <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{p.tipo}</span>
                  <span style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>
                    {textoSunat(p)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {suspVencida.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>
                📄 Suspensión de 4ta caducada — hay que volver a tramitarla
              </div>
              {suspVencida.map((p: any) => (
                <div className="info-row" key={p.id}>
                  <Link href={`/entidad/persona/${p.id}`} style={{ fontWeight: 600, flex: 1 }}>
                    {p.nombre} →
                  </Link>
                  <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{p.tipo}</span>
                  <span style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>
                    suspensión {p.suspension_4ta_anio} · venció el 31 dic
                  </span>
                </div>
              ))}
            </div>
          )}

          {dniAlerta.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(244,180,0,.35)" }}>
              <div className="panel-h" style={{ color: "var(--yellow)" }}>
                🪪 DNI vencidos o por vencer (60 días) · {dniAlerta.length}
              </div>
              {dniAlerta.map((p: any) => {
                const d = dias(p.dni_vencimiento);
                return (
                  <div className="info-row" key={p.id}>
                    <Link href={`/entidad/persona/${p.id}`} style={{ fontWeight: 600, flex: 1 }}>{p.nombre} →</Link>
                    <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{p.tipo}</span>
                    <span style={{ color: d < 0 ? "var(--red)" : "var(--yellow)", fontSize: 12.5, fontWeight: 700 }}>
                      {d < 0 ? `vencido hace ${-d} días` : `vence ${fmt(p.dni_vencimiento)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", margin: "6px 0 14px" }}>
            Elige un filtro o busca para ver el padrón ({todas.length} personas).
          </div>
        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: 13, margin: "2px 4px 10px" }}>
            {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}
            {t && ` · ${t}`}{eq && ` · ${eq}`}
            {a && ` · ${a.replace(/_/g, " ")}`}{q && ` · «${q}»`}
          </div>

          {/* Agrupadas por tipo: el personal con el personal, los contactos aparte */}
          {(() => {
            const grupos = [...TIPOS, ""]
              .map(tt => ({ tt, filas: filtradas.filter((p: any) => (p.tipo || "contacto") === (tt || "contacto")) }))
              .filter((g, i, arr) => g.filas.length > 0 && arr.findIndex(z => z.tt === g.tt) === i);
            return grupos.map(({ tt, filas }) => (
              <div key={tt || "sin"} style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 4px 6px" }}>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
                    {tt || "contacto"} · {filas.length}
                  </span>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
                {filas.map(Fila)}
              </div>
            ));
          })()}

          {!filtradas.length && <div className="empty">Sin resultados{q && ` para «${q}»`}.</div>}
          {filtradas.length === 150 && <div className="empty">Mostrando 150 — afina la búsqueda para ver más.</div>}
        </>
      )}
    </div>
  );
}
