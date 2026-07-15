import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import EventoHistorial, { icoDe, type Evento } from "@/components/EventoHistorial";
import { PERIODOS, desdeDe, diaLima, rotuloDia, type Periodo } from "@/lib/periodo";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

/* ACUMULADO — todo lo que pasó con las entidades de un tipo, junto y por
   periodo. La ficha responde "qué pasó con ESTA empresa"; esto responde
   "qué se ha estado moviendo en las empresas", que es la pregunta de quien
   coordina, no la de quien atiende un caso. */

/* `corto` es el campo que se muestra si existe; `campo` es el respaldo.
   En una lista de 263 movimientos, "Michael Net Oros Perez" repetido cuatro
   veces es puro ruido: el alias ya está cargado, hay que usarlo. */
const TIPOS: Record<string, { tabla: string; campo: string; corto?: string; ico: string; plural: string; volver: string }> = {
  // En empresas, `nombre` YA es el corto: el largo es `razon_social`
  empresa: { tabla: "empresas", campo: "nombre", ico: "🏢", plural: "empresas", volver: "/empresas" },
  persona: { tabla: "personas", campo: "nombre", corto: "alias", ico: "👤", plural: "personas", volver: "/personas" },
  proyecto: { tabla: "proyectos", campo: "nombre", corto: "nombre_corto", ico: "📁", plural: "proyectos", volver: "/proyectos" },
  postulacion: { tabla: "postulaciones", campo: "codigo", ico: "🎯", plural: "postulaciones", volver: "/postulaciones" },
  convocatoria: { tabla: "convocatorias", campo: "codigo", ico: "📜", plural: "convocatorias", volver: "/convocatorias" },
  equipamiento: { tabla: "equipamiento", campo: "nombre", ico: "🎥", plural: "equipos", volver: "/equipamiento" },
};

/* El actor también se repite hasta el cansancio ("Wilfredo pedíaz" nueve
   veces seguidas). Los perfiles no tienen alias, así que se recorta:
   "Wilfredo Pedíaz Quispe" → "Wilfredo P." */
const cortoActor = (n?: string | null) => {
  const p = (n || "").trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || "");
};

const ROTULO_EV: Record<string, string> = {
  creado: "altas", estado: "cambios de estado", editado: "ediciones",
  dato: "datos y verificaciones", miembro: "cargos", bot: "del bot",
};

export default async function HistorialTipo({ params, searchParams }: {
  params: { tipo: string };
  searchParams: { p?: string; e?: string };
}) {
  const conf = TIPOS[params.tipo];
  if (!conf) notFound();

  const p = (PERIODOS.some(([k]) => k === searchParams?.p) ? searchParams!.p : "mes") as Periodo;
  const filtroEv = searchParams?.e || "";

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const desde = desdeDe(p);
  let q = supabase.from("actividad")
    .select("tipo,detalle,creado_en,entidad_tipo,entidad_id,actor:perfiles(nombre)")
    .eq("entidad_tipo", params.tipo)
    .order("creado_en", { ascending: false })
    .limit(400);
  if (desde) q = q.gte("creado_en", desde);
  const { data: evs } = await q;

  /* Los nombres, en una sola consulta: el historial guarda ids, y una lista
     de "actualizó 1 campo" sin decir de quién no le sirve a nadie. */
  const ids = [...new Set((evs || []).map((e: any) => e.entidad_id))];
  const nombre = new Map<string, string>();
  const largo = new Map<string, string>();
  if (ids.length) {
    const sel = ["id", conf.campo, conf.corto].filter(Boolean).join(",");
    const { data: rows } = await supabase.from(conf.tabla).select(sel).in("id", ids);
    (rows || []).forEach((r: any) => {
      // El alias manda; si esa ficha no lo tiene, el nombre completo
      nombre.set(r.id, (conf.corto && r[conf.corto]) || r[conf.campo] || "—");
      largo.set(r.id, r[conf.campo] || "");
    });
  }

  const todos: Evento[] = (evs || []).map((e: any) => ({
    ...e,
    entidadNombre: nombre.get(e.entidad_id),
    // El nombre completo va al title: se acorta la vista, no el dato
    entidadTitulo: largo.get(e.entidad_id),
    actor: e.actor ? { ...e.actor, nombre: cortoActor(e.actor.nombre) } : e.actor,
  }));

  // El resumen cuenta el periodo entero; los chips filtran la lista
  const porTipo = new Map<string, number>();
  todos.forEach(e => porTipo.set(e.tipo, (porTipo.get(e.tipo) || 0) + 1));
  const activas = new Set(todos.map(e => e.entidad_id));

  const lista = filtroEv ? todos.filter(e => e.tipo === filtroEv) : todos;

  // Agrupado por día: el historial se lee por jornadas, no por 400 filas
  const dias: [string, Evento[]][] = [];
  lista.forEach(e => {
    const d = diaLima(e.creado_en);
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo[0] === d) ultimo[1].push(e);
    else dias.push([d, [e]]);
  });

  const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE",
    { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
  const url = (np: string, ne: string) =>
    `/historial/${params.tipo}?p=${np}${ne ? `&e=${ne}` : ""}`;

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href={conf.volver} className="btn btn-ghost">{conf.ico} Ver {conf.plural}</Link>
      </div>
      <h1 className="title-lg">🕐 Historial de {conf.plural}</h1>

      <PanelFiltros limpiar={`/historial/${params.tipo}`} mostrarLimpiar={!!filtroEv || p !== "mes"}>
        <FilaFiltro titulo="Periodo">
          {PERIODOS.map(([k, lbl]) => (
            <Chip key={k} href={url(k, filtroEv)} on={p === k} color="var(--violet)">{lbl}</Chip>
          ))}
        </FilaFiltro>
        {porTipo.size > 0 && (
          <FilaFiltro titulo="Qué pasó">
            {[...porTipo.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
              <Chip key={t} href={url(p, filtroEv === t ? "" : t)} on={filtroEv === t}>
                {icoDe(t)} {ROTULO_EV[t] || t} · {n}
              </Chip>
            ))}
          </FilaFiltro>
        )}
      </PanelFiltros>

      {/* El acumulado en una línea: cuántos movimientos y sobre cuántas fichas */}
      <div className="card" style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--violet)" }}>{todos.length}</span>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          movimiento{todos.length === 1 ? "" : "s"} sobre <b style={{ color: "var(--text)" }}>{activas.size}</b> de {conf.plural}
          {" · "}{(PERIODOS.find(([k]) => k === p)?.[1] || "").toLowerCase()}
        </span>
        <span style={{ flex: 1 }} />
        {todos.length === 400 && (
          <span style={{ color: "var(--yellow)", fontSize: 11.5 }}>
            ⚠ tope de 400 — acota el periodo para verlo completo
          </span>
        )}
      </div>

      {!todos.length && (
        <div className="empty">
          Nada se movió en {conf.plural} {(PERIODOS.find(([k]) => k === p)?.[1] || "").toLowerCase()}.
        </div>
      )}

      {dias.map(([dia, evs]) => (
        <div key={dia} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px 8px" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
              {rotuloDia(dia)} · {evs.length}
            </span>
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <div className="card">
            <div className="tl">
              {evs.map((e, i) => (
                <EventoHistorial key={i} e={e} hora={hora(e.creado_en)} conEntidad />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
