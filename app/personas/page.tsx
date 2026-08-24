import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import ComboFiltro from "@/components/ComboFiltro";
import { esDelEquipo } from "@/lib/personas";
import { CERRADOS } from "@/lib/familia";
import { esProblematico, textoSunat } from "@/lib/sunat";
import { rucDePersona } from "@/lib/ruc";
import { buscadorDe, pal } from "@/lib/buscar";
import Avatar from "@/components/Avatar";
import { OjoPersona } from "@/components/Ojo";
import Completitud from "@/components/Completitud";
import { completitud, EQUIPOS_PERSONA, ESPECIALIDADES } from "@/lib/entidades";
import TablaVistas from "@/components/TablaVistas";
import Link from "@/components/Enlace";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "👤 Personas" };

const EST_META: Record<string, [string, string]> = {
  activo: ["Activos", "var(--green)"],
  potencial: ["Potenciales", "var(--yellow)"],
  inactivo: ["Inactivos", "var(--dim)"],
  vetado: ["Vetados", "var(--red)"],
};
const TIPOS = ["personal", "colaborador", "actor social", "colaborador eventual", "independiente", "contacto"];
// Fuente única (lib/entidades): sumar un equipo ahí lo trae solo a este filtro.
const EQUIPOS = EQUIPOS_PERSONA;

const dias = (f: string) => Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

export default async function Personas({ searchParams }: {
  searchParams: { q?: string; e?: string; t?: string; eq?: string; a?: string; r?: string; g?: string; v?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const t = searchParams?.t || "";
  const eq = searchParams?.eq || "";
  const a = searchParams?.a || "";
  const r = searchParams?.r || "";
  const g = searchParams?.g || "";
  const vistaTabla = searchParams?.v === "tabla";
  const listar = !!(q || e || t || eq || a || r || g);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: pers }, { data: vincs }, { data: equipoPost },
         { data: vistasT }, { data: equipoProy }, { data: actoresProy }] = await Promise.all([
    // `*`: el listado necesita todos los campos para calcular la completitud
    // de cada ficha (la barrita). La tabla es chica, no pesa.
    supabase.from("personas").select("*").order("nombre"),
    supabase.from("publicacion_vinculos")
      /* ⚠ EL CONTADOR 💬 YA NO SE CUENTA A MANO.
       Aquí había una consulta que se traía la tabla `comentarios` ENTERA —solo
       la columna del caso, pero entera— para contar cuántos tiene cada uno. Sin
       `.limit()` y sin `.order()`, contra un techo real de mil filas
       (Supabase → Max rows). Hoy son 989 y entran ~450 al mes: en días, los
       SEIS listados que hacían esto se habrían quedado cortos a la vez, cada
       uno enseñando un número menor que el de verdad y ninguno dando error.
       `comentarios(count)` es un agregado: lo cuenta Postgres y vuelve un
       número por fila. Ni techo que sortear, ni una consulta más. */
      .select("entidad_id,publicacion_id,pub:publicaciones(estado,comentarios(count))").eq("entidad_tipo", "persona"),
    // Su palmarés ante los fondos: en cuántas estuvo (🎯), cuántas ganó (🏆) y
    // en cuántas fue finalista sin ganar (🥈). Antes solo se contaba el total.
    /* `limit` explícito: sin él manda el tope por defecto de PostgREST (1000),
       que no avisa. Con ~10 personas por postulación se cruza a las cien
       postulaciones, y a partir de ahí el 🎯/🏆 de esta lista empieza a perder
       gente EN SILENCIO mientras la ficha y la vista rápida —que consultan por
       persona— siguen contando bien. Dos pantallas, dos números, sin error. */
    supabase.from("postulacion_equipo")
      .select("persona_id,post:postulaciones(id,estado,proy:proyectos(nombre,nombre_corto),conv:convocatorias(anio))")
      .limit(20000),
    /* Las vistas de tabla guardadas. Van en el mismo Promise.all aunque solo
       las use una de las dos pestañas: son pocas filas y pedirlas aparte
       añadiría un viaje al servidor al cambiar de pestaña. */
    supabase.from("vistas_guardadas").select("id,nombre,icono,usuario_id,config")
      .eq("entidad", "persona").order("orden").order("nombre"),
    /* Qué películas hace cada quien. Este listado sabía el DNI, el RUC, el
       estado SUNAT y el tope de 4ta de cada persona — y no sabía que Yajaida
       dirige un documental. Sabía todo de su papelería y nada de su trabajo. */
    supabase.from("proyecto_equipo")
      .select("persona_id,cargo,proy:proyectos(id,nombre,nombre_corto,color,etapa)"),
    /* Y en qué obras aparece como ACTOR SOCIAL (comunero, protagonista): su
       palmarés no está en `proyecto_equipo` (el crew) sino en `proyecto_actores`.
       Sin esto, un actor social salía sin obra —solo se le veía la ficha. */
    /* `personaje`: en ficción el chip tiene que decir a QUIÉN interpretó, no
       solo en qué obra salió. Y `not.is.null` sobre la persona porque desde que
       un personaje puede no tener intérprete, esas filas viajarían hasta aquí
       para no pintarse nunca —y de paso gastan el tope de PostgREST—. */
    supabase.from("proyecto_actores")
      .select("persona_id,rol,personaje,proy:proyectos(id,nombre,nombre_corto,color,etapa)")
      .not("persona_id", "is", null),
  ]);

  const todas = pers || [];
  /* Mismo motor que el buscador global: sin tildes, por palabras y con
     fonética andina. Antes era un .includes() de la frase entera en
     minúsculas — «cespedes» no encontraba a Céspedes y «ugarte pavel» no
     encontraba nada. */
  const coincide = buscadorDe(q);

  // Actividad real en CrewHub+

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
    x.coments += ((v.pub as any)?.comentarios?.[0]?.count ?? 0);
    act.set(v.entidad_id, x);
  });

  // En cuántas postulaciones ha estado: su hoja de vida ante los fondos.
  // t = total (🎯) · g = ganadas (🏆) · c = finalista sin ganar (🥈).
  const postDe = new Map<string, number>();
  const palmar = new Map<string, { t: number; g: number; c: number }>();
  // Nombres de proyecto por grupo (con año, para ordenar), para el tooltip.
  type Det = { etq: string; anio: number };
  const palmarDet = new Map<string, { g: Det[]; c: Det[]; t: Det[] }>();
  /* Una persona puede tener VARIAS filas en la misma postulación (Director +
     Autor): se cuenta cada postulación UNA vez por persona, si no el palmarés
     se infla (4 ganadas cuando eran 3). Dedup por (persona, postulación). */
  const vistoPost = new Set<string>();
  (equipoPost || []).forEach((r: any) => {
    const post = Array.isArray(r.post) ? r.post[0] : r.post;
    const clave = `${r.persona_id}:${post?.id || ""}`;
    if (post?.id && vistoPost.has(clave)) return;
    if (post?.id) vistoPost.add(clave);
    postDe.set(r.persona_id, (postDe.get(r.persona_id) || 0) + 1);
    const s = palmar.get(r.persona_id) || { t: 0, g: 0, c: 0 };
    s.t++;
    const est = post?.estado;
    if (est === "ganadora") s.g++;
    if (est === "finalista_no_ganadora") s.c++;
    palmar.set(r.persona_id, s);
    // Etiqueta legible del proyecto: nombre (corto si hay) + año.
    const proy = Array.isArray(post?.proy) ? post.proy[0] : post?.proy;
    const conv = Array.isArray(post?.conv) ? post.conv[0] : post?.conv;
    const nom = proy?.nombre_corto || proy?.nombre;
    if (nom) {
      const anio = Number(conv?.anio) || 0;
      const it = { etq: `${nom}${anio ? ` (${anio})` : ""}`, anio };
      const d = palmarDet.get(r.persona_id) || { g: [], c: [], t: [] };
      d.t.push(it);
      if (est === "ganadora") d.g.push(it);
      if (est === "finalista_no_ganadora") d.c.push(it);
      palmarDet.set(r.persona_id, d);
    }
  });

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

  /* Las ESPECIALIDADES/roles de cada persona salen de su propio campo `rol`
     (el del formulario de alta: opciones de ESPECIALIDADES, guardado como texto
     separado por comas porque es múltiple). Ese es «su rol». */
  const rolesPersona = (p: any): string[] =>
    (p.rol || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  // Cuántas personas tienen cada rol (para el conteo del chip).
  const cntR = (rol: string) => todas.filter((p: any) => rolesPersona(p).includes(rol)).length;
  // Género (del formulario de alta): femenino / masculino / no binario / otro.
  const GENEROS: [string, string, string][] = [
    ["femenino", "♀ Femenino", "#ec4899"],
    ["masculino", "♂ Masculino", "var(--blue)"],
    ["no binario", "⚧ No binario", "var(--violet)"],
    ["otro", "Otro", "var(--dim)"],
  ];
  const cntG = (gen: string) => todas.filter((p: any) => (p.genero || "") === gen).length;

  // En qué obras figura como actor social (comunero, protagonista, sujeto).
  const actorEn = new Map<string, any[]>();
  (actoresProy || []).forEach((r: any) => {
    const proy = Array.isArray(r.proy) ? r.proy[0] : r.proy;
    if (!proy) return;
    const l = actorEn.get(r.persona_id) || [];
    l.push({ ...r, proy }); actorEn.set(r.persona_id, l);
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
    (!r || rolesPersona(p).includes(r)) &&
    (!g || (p.genero || "") === g) &&
    (!a || PRUEBA_A[a]?.(p)) &&
    // El DNI, el RUC deducido y la clasificación también se buscan aquí
    (!q || coincide(pal(
      p.nombre, p.alias, p.rol, p.region, p.email,
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
    const pal = palmar.get(p.id);   // palmarés: 🎯 total · 🏆 ganadas · 🥈 finalista
    const suyos = proysDe.get(p.id) || [];
    const dirige = suyos.filter((r: any) => DIRIGE.test(r.cargo || ""));
    const enOtros = suyos.filter((r: any) => !DIRIGE.test(r.cargo || ""));
    const comoActor = actorEn.get(p.id) || [];   // obras donde figura como actor social
    return (
      /* Enlace estirado: la tarjeta lleva a la persona por una capa
         invisible, para que sus películas sean enlaces propios. */
      <div key={p.id} className="card link fila-cap" style={{ cursor: "pointer", padding: "11px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Link href={`/entidad/persona/${p.id}`} className="fila-cubre" aria-label={p.alias || p.nombre} />
        {/* Su cara: la propia si la subió; si no, Avatar cae a las iniciales. */}
        <Avatar nombre={p.nombre} src={p.foto_url} size={66} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* línea 1: quién es */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* El nombre COMPLETO manda —es el listado de personas, se busca por
                nombre—; el alias va al lado, tenue, para quien lo reconoce así. */}
            <b style={{ fontSize: 14.5 }}>{p.nombre}</b>
            <OjoPersona id={p.id} />
            {p.alias && p.alias !== p.nombre && (
              <span style={{ color: "var(--dim)", fontSize: 12.5, fontWeight: 500 }}>{p.alias}</span>
            )}
            {p.usuario_id && <span title="Tiene cuenta en CrewHub+">⬡</span>}
            <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.tipo || "contacto"}</span>
            {p.equipo && (
              <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>{p.equipo}</span>
            )}
            {/* Palmarés ante los fondos: intentos (🎯), y de ellos los que ganó
                (🏆) y en los que quedó finalista sin ganar (🥈). Cada chip lleva
                en su tooltip la lista de proyectos de ese grupo —para ver al
                vuelo cuáles son sin abrir la ficha. */}
            {pal && pal.t > 0 && (() => {
              const det = palmarDet.get(p.id) || { g: [], c: [], t: [] };
              // Más reciente primero.
              const lista = (arr: { etq: string; anio: number }[]) =>
                [...arr].sort((a, b) => b.anio - a.anio).map(x => x.etq).join("\n");
              return (
                <span className="fila-encima" style={{ display: "inline-flex", gap: 5 }}>
                  {pal.g > 0 && <span className="badge" title={`Ganó:\n${lista(det.g)}`} style={{ color: "var(--green)", background: "rgba(46,204,113,.12)", cursor: "help" }}>🏆 {pal.g}</span>}
                  {pal.c > 0 && <span className="badge" title={`Finalista sin ganar:\n${lista(det.c)}`} style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)", cursor: "help" }}>🥈 {pal.c}</span>}
                  <span className="badge" title={`Postuló en:\n${lista(det.t)}`} style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)", cursor: "help" }}>🎯 {pal.t}</span>
                </span>
              );
            })()}
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

          {/* línea 2: su vida en CrewHub+. Abre con el DNI —para una persona es
              el dato clave (verifica en RENIEC, deduce el RUC)—; antes se veía el
              RUC en la fila 1, pero el DNI manda y va primero aquí. */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 7, fontSize: 11.5 }}>
            {p.ruc_dni
              ? <span style={{ color: "var(--muted)", fontWeight: 600 }}>🪪 {p.ruc_dni}</span>
              : delEquipo(p) && <span style={{ color: "var(--red)" }}>🪪 sin DNI</span>}
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
          {(suyos.length > 0 || comoActor.length > 0) && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
              marginTop: 7, paddingTop: 7, borderTop: "1px solid var(--border)", fontSize: 11.5 }}>
              {/* Como actor social: su obra ante la cámara —comunero, protagonista—.
                  Va con 🎭 en teal, aparte del crew, porque es otro tipo de aporte. */}
              {comoActor.map((r: any) => (
                <Link key={`act-${r.proy.id}`} href={`/entidad/proyecto/${r.proy.id}`}
                  className="badge fila-encima" title={`${r.personaje ? `Interpretó a ${r.personaje}` : "Actor social"}${r.rol ? ` · ${r.rol}` : ""} · ${(r.proy.etapa || "").replace(/_/g, " ")}`}
                  style={{ color: "var(--teal)", background: "rgba(45,212,191,.12)", fontWeight: 700,
                    textTransform: "none", letterSpacing: 0, textDecoration: "none" }}>
                  🎭 {r.proy.nombre_corto || r.proy.nombre}{(r.personaje || r.rol) ? <i style={{ opacity: .6, fontStyle: "normal" }}> · {r.personaje || r.rol}</i> : null} ↗
                </Link>
              ))}
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

      {/* Dos maneras de mirar lo mismo, no una en lugar de la otra: la ficha
          enseña cara, palmarés y completitud —cosas calculadas—; la tabla sirve
          para comparar muchas filas por pocos campos, que es lo que hasta hoy
          obligaba a exportar a mano. */}
      <div className="tv-pestanas">
        <Link href="/personas" className={`vtab${vistaTabla ? "" : " on"}`}>🗂 Fichas</Link>
        <Link href="/personas?v=tabla" className={`vtab${vistaTabla ? " on" : ""}`}>📊 Tabla</Link>
      </div>

      {vistaTabla ? (
        <TablaVistas entidad="persona" filas={todas} vistas={(vistasT as any[]) || []} />
      ) : (
      <>
      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        {t && <input type="hidden" name="t" value={t} />}
        {eq && <input type="hidden" name="eq" value={eq} />}
        {r && <input type="hidden" name="r" value={r} />}
        {g && <input type="hidden" name="g" value={g} />}
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
        <FilaFiltro titulo="Rol / especialidad">
          <ComboFiltro value={r} placeholder="Todos los roles" emptyHref="/personas"
            options={ESPECIALIDADES.filter(rr => cntR(rr) > 0).map(rr => ({
              val: rr, label: `${rr} · ${cntR(rr)}`, href: `/personas?r=${encodeURIComponent(rr)}`,
            }))} />
        </FilaFiltro>
        <FilaFiltro titulo="Género">
          {GENEROS.map(([k, lbl, col]) => {
            const n = cntG(k);
            return n === 0 ? null : (
              <Chip key={k} href={`/personas?g=${encodeURIComponent(k)}`} on={g === k} color={col}>{lbl} · {n}</Chip>
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
            {t && ` · ${t}`}{eq && ` · ${eq}`}{r && ` · ${r}`}{g && ` · ${g}`}
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
      </>
      )}
    </div>
  );
}
