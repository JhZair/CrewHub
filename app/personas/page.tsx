import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { esDelEquipo } from "@/lib/personas";
import { CERRADOS } from "@/lib/familia";
import { esProblematico, textoSunat } from "@/lib/sunat";
import { rucDePersona } from "@/lib/ruc";
import { buscadorDe, pal } from "@/lib/buscar";
import { urlPlataforma, PLAT } from "@/lib/plataformas";
import BotonFichaSunat from "@/components/BotonFichaSunat";
import Completitud from "@/components/Completitud";
import { completitud } from "@/lib/entidades";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "👤 Personas" };

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

  const [{ data: pers }, { data: vincs }, { data: coms }, { data: equipoPost }, urlSunat,
         { data: equipoProy }] = await Promise.all([
    // `*`: el listado necesita todos los campos para calcular la completitud
    // de cada ficha (la barrita). La tabla es chica, no pesa.
    supabase.from("personas").select("*").order("nombre"),
    supabase.from("publicacion_vinculos")
      .select("entidad_id,publicacion_id,pub:publicaciones(estado)").eq("entidad_tipo", "persona"),
    /* Solo los de caso: desde que los objetos del repositorio comentan en
       esta misma tabla, sin el filtro sus filas gastan el tope de PostgREST
       (1000) y el contador 💬 se queda corto en silencio. */
    supabase.from("comentarios").select("publicacion_id").not("publicacion_id", "is", null),
    supabase.from("postulacion_equipo").select("persona_id"),
    // El link de SUNAT sale del admin, no del código: si SUNAT lo cambia
    // —lo ha hecho— se corrige ahí sin esperar un deploy.
    urlPlataforma(PLAT.sunatConsultaRuc),
    /* Qué películas hace cada quien. Este listado sabía el DNI, el RUC, el
       estado SUNAT y el tope de 4ta de cada persona — y no sabía que Yajaida
       dirige un documental. Sabía todo de su papelería y nada de su trabajo. */
    supabase.from("proyecto_equipo")
      .select("persona_id,cargo,proy:proyectos(id,nombre,nombre_corto,color,etapa)"),
  ]);

  const todas = pers || [];
  /* Mismo motor que el buscador global: sin tildes, por palabras y con
     fonética andina. Antes era un .includes() de la frase entera en
     minúsculas — «cespedes» no encontraba a Céspedes y «ugarte pavel» no
     encontraba nada. */
  const coincide = buscadorDe(q);

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
    else if (CERRADOS.includes(est)) x.cerradas++;   // resuelta | descartada
    x.coments += comentPorPub.get(v.publicacion_id) || 0;
    act.set(v.entidad_id, x);
  });

  // En cuántas postulaciones ha estado: su hoja de vida ante los fondos
  const postDe = new Map<string, number>();
  (equipoPost || []).forEach((r: any) => postDe.set(r.persona_id, (postDe.get(r.persona_id) || 0) + 1));

  /* Qué películas hace cada quien. Dirigir se separa del resto a propósito:
     un director no es «alguien más del equipo» — el proyecto nace con él, y
     ante el jurado da la cara por él. El resto de cargos van juntos. */
  const DIRIGE = /direc|codirec/i;
  const proysDe = new Map<string, any[]>();
  (equipoProy || []).forEach((r: any) => {
    if (!r.proy) return;
    const l = proysDe.get(r.persona_id) || [];
    l.push(r); proysDe.set(r.persona_id, l);
  });

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
    // El DNI, el RUC deducido y la clasificación también se buscan aquí
    (!q || coincide(pal(
      p.nombre, p.alias, p.rol, p.region,
      p.ruc_dni && `dni ${p.ruc_dni}`,
      rucDePersona(p.ruc_dni) && `ruc ${rucDePersona(p.ruc_dni)}`,
      p.tipo, p.estado, p.equipo,
      /* Y sus películas. Este buscador encontraba a alguien por su DNI y su
         RUC, y no por el documental que dirige — sabía su papelería y no su
         obra. «Mujeres del Ande» tiene que encontrar a Yajaida. */
      ...(proysDe.get(p.id) || []).map((r: any) =>
        pal(r.cargo, r.proy?.nombre, r.proy?.nombre_corto)))))
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
    const suyos = proysDe.get(p.id) || [];
    const dirige = suyos.filter((r: any) => DIRIGE.test(r.cargo || ""));
    const enOtros = suyos.filter((r: any) => !DIRIGE.test(r.cargo || ""));
    return (
      /* Enlace estirado: la tarjeta lleva a la persona por una capa
         invisible, para que sus películas sean enlaces propios. */
      <div key={p.id} className="card link fila-cap" style={{ cursor: "pointer", padding: "11px 16px" }}>
        <Link href={`/entidad/persona/${p.id}`} className="fila-cubre" aria-label={p.alias || p.nombre} />
        <div>
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
            {/* El RUC sale del DNI y solo se veía dentro de la ficha. Aquí es
                un clic: copia y abre SUNAT, sin entrar a cada persona. */}
            {rucDePersona(p.ruc_dni) && (
              <BotonFichaSunat numero={rucDePersona(p.ruc_dni)!} tipo="RUC"
                compacto nota="se calcula del DNI" url={urlSunat} />
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

          {/* línea 3: su obra. Este listado sabía el DNI, el RUC, el estado
              SUNAT y el tope de 4ta de cada persona — toda su papelería— y no
              sabía que Yajaida dirige un documental. Dirigir va aparte y en
              violeta: un director no es «alguien más del equipo». */}
          {suyos.length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
              marginTop: 7, paddingTop: 7, borderTop: "1px solid var(--border)", fontSize: 11.5 }}>
              {dirige.map((r: any) => (
                <Link key={r.proy.id} href={`/entidad/proyecto/${r.proy.id}`}
                  className="badge fila-encima" title={`${r.cargo} · ${(r.proy.etapa || "").replace(/_/g, " ")}`}
                  style={{ color: "var(--accent)", background: "rgba(124,92,255,.14)", fontWeight: 700,
                    textTransform: "none", letterSpacing: 0, textDecoration: "none" }}>
                  🎬 {r.proy.nombre_corto || r.proy.nombre} ↗
                </Link>
              ))}
              {enOtros.map((r: any) => (
                <Link key={`${r.proy.id}-${r.cargo}`} href={`/entidad/proyecto/${r.proy.id}`}
                  className="badge fila-encima" title={`${r.cargo} · ${(r.proy.etapa || "").replace(/_/g, " ")}`}
                  style={{ color: "var(--muted)", background: "#1c1c2c",
                    textTransform: "none", letterSpacing: 0, textDecoration: "none" }}>
                  {r.proy.nombre_corto || r.proy.nombre}
                  <i style={{ opacity: .6, fontStyle: "normal" }}> · {r.cargo}</i> ↗
                </Link>
              ))}
            </div>
          )}

          {/* Completitud de la ficha: barrita fina al pie, para ver de un
              vistazo a quién le faltan datos sin abrir la ficha. */}
          {(() => {
            const c = completitud("persona", p);
            return <Completitud mini pct={c.pct} llenos={c.llenos} total={c.total} faltan={c.faltan} />;
          })()}
        </div>
      </div>
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
        <span className="buscador-lista">
          <span className="bg-lupa">🔍</span>
          <input name="q" defaultValue={q}
            placeholder="Nombre, alias, rol, DNI, RUC, «colaborador», «vetado»…" />
        </span>
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
            /* TIPOS ya incluye «contacto», y las personas sin tipo caen ahí por
               el `|| "contacto"`. Antes se añadía un grupo extra «» que resolvía
               otra vez a «contacto»: como el dedup comparaba la clave cruda
               («» ≠ «contacto») no lo descartaba, y los contactos salían dos
               veces. Sin ese grupo redundante, cada persona aparece una sola. */
            const grupos = TIPOS
              .map(tt => ({ tt, filas: filtradas.filter((p: any) => (p.tipo || "contacto") === tt) }))
              .filter(g => g.filas.length > 0);
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
