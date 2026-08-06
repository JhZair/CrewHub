import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import EventoHistorial, { icoDe, ROTULO_EV, ROTULO_ENT, type Evento } from "@/components/EventoHistorial";
import EventoGrupo from "@/components/EventoGrupo";
import { agruparEventos } from "@/lib/agrupar";
import { PERIODOS, rangoDe, diaLima, horaLima, rotuloDia, type Periodo } from "@/lib/periodo";
import { ICO_ENT, TABLA_DE, grafiasDe, tipoCanonico } from "@/lib/secciones";
import { BOT, mapaAlias } from "@/lib/personas";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🕐 Historial" };

/* EL DIARIO — todo lo que pasó en el sistema, de todo, junto.
   El historial por tipo responde "qué se movió en las empresas"; la ficha,
   "qué pasó con ESTA empresa". Esto responde "qué pasó, a secas": el rastro
   completo, para cuando hay que reconstruir cómo se llegó a algo.
   Es la bitácora de Qhaway, por eso se entra desde su perfil. */

const TOPE = 500;
/* Los conteos de los chips van con su propio tope, más alto: son tres columnas
   por fila y lo que se muestra es un número del PERIODO, no de la página. */
const TOPE_CUENTA = 20000;

/** Consulta mínima para contar: sin los filtros de tipo/actor (ver abajo). */
const conteoBase = (sb: any, desde: string | null, hasta: string | null) => {
  let x = sb.from("actividad").select("tipo,entidad_tipo,actor_id")
    .order("creado_en", { ascending: false });
  if (desde) x = x.gte("creado_en", desde);
  if (hasta) x = x.lt("creado_en", hasta);
  return x;
};

const cortoActor = (n?: string | null) => {
  const p = (n || "").trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || "");
};

export default async function HistorialTodo({ searchParams }: {
  searchParams: { p?: string; e?: string; t?: string; a?: string };
}) {
  const p = (PERIODOS.some(([k]) => k === searchParams?.p) ? searchParams!.p : "semana") as Periodo;
  const filtroEv = searchParams?.e || "";     // tipo de evento
  const filtroEnt = searchParams?.t || "";    // tipo de entidad
  const filtroActor = searchParams?.a || "";  // quién

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { desde, hasta } = rangoDe(p);

  /* DOS consultas, y no una filtrada en memoria.
   *
   * Antes se traían los últimos 500 eventos del sistema y los filtros se
   * aplicaban sobre ese montón. Con «Todo», los chips repartían exactamente
   * 500 entre los actores —212 + 208 + 58 + 21 + 1— y «Michel · 21» se leía
   * como «Michel ha hecho 21 cosas» cuando significaba «21 de los últimos 500
   * del equipo». Peor: al pulsar el chip no se iba a buscar más, así que la
   * historia de Michel era inalcanzable por diseño.
   *
   * Ahora los filtros van a la BASE. La lista es de lo filtrado, así que el
   * tope de 500 se gasta en Michel y no en el equipo entero.
   */
  const conFiltros = (b: any) => {
    let x = b;
    if (desde) x = x.gte("creado_en", desde);
    if (hasta) x = x.lt("creado_en", hasta);
    if (filtroEv) x = x.eq("tipo", filtroEv);
    if (filtroEnt) x = x.in("entidad_tipo", grafiasDe(filtroEnt));
    if (filtroActor) x = filtroActor === "bot" ? x.is("actor_id", null) : x.eq("actor_id", filtroActor);
    return x;
  };
  /* Los CHIPS se cuentan aparte y sin los filtros de tipo/actor: si salieran
     de la lista ya filtrada, al elegir a Michel desaparecerían los demás y no
     habría cómo cambiar de persona. Solo tres columnas y tope alto: contar es
     barato, y el número que se enseña debe ser del periodo, no de la página. */
  const qCuenta = conteoBase(supabase, desde, hasta);
  const [{ data: evs }, { data: crudos }] = await Promise.all([
    conFiltros(supabase.from("actividad")
      .select("tipo,detalle,creado_en,entidad_tipo,entidad_id,actor_id,actor:perfiles(nombre)")
      .order("creado_en", { ascending: false })).limit(TOPE),
    qCuenta.limit(TOPE_CUENTA),
  ]);
  /* Nombre de cada actor para los chips: el conteo solo trae `actor_id`. */
  const { data: perfilesTodos } = await supabase.from("perfiles").select("id,nombre");
  const nomActor = new Map<string, string>((perfilesTodos || []).map((x: any) => [x.id, x.nombre]));

  // Alias del actor (JohnO): manda sobre el nombre corto derivado (cortoActor).
  const { data: aliasPers } = await supabase.from("personas").select("usuario_id,alias")
    .not("alias", "is", null).not("usuario_id", "is", null);
  const alias = mapaAlias(aliasPers);

  /* Los nombres de TODO lo tocado, agrupando por tabla: una consulta por
     tipo de entidad, no una por evento. */
  const porTipo = new Map<string, Set<string>>();
  (evs || []).forEach((x: any) => {
    if (!TABLA_DE[x.entidad_tipo]) return;
    (porTipo.get(x.entidad_tipo) || porTipo.set(x.entidad_tipo, new Set()).get(x.entidad_tipo)!)
      .add(x.entidad_id);
  });
  const nombre = new Map<string, string>();
  await Promise.all([...porTipo.entries()].map(async ([tipo, ids]) => {
    const [tabla, campo] = TABLA_DE[tipo];
    // El alias manda cuando existe: en una lista larga, el nombre completo estorba
    const sel = tipo === "persona" ? "id,nombre,alias"
      : tipo === "proyecto" ? "id,nombre,nombre_corto" : `id,${campo}`;
    const { data } = await supabase.from(tabla).select(sel).in("id", [...ids]);
    (data || []).forEach((r: any) =>
      nombre.set(`${tipo}:${r.id}`, r.alias || r.nombre_corto || r[campo] || "—"));
  }));

  /* Los cambios de RESPONSABLE los escribe el trigger con el id del perfil en
     `de`/`a`, no el nombre — antes salían como UUID crudo. Se resuelven aquí,
     igual que los nombres de entidad: se juntan los ids y una sola consulta. */
  const perfilIds = new Set<string>();
  (evs || []).forEach((x: any) => {
    if (x.tipo === "estado" && x.detalle?.campo === "responsable") {
      if (x.detalle.de) perfilIds.add(x.detalle.de);
      if (x.detalle.a) perfilIds.add(x.detalle.a);
    }
  });
  const perfilNom = new Map<string, string>();
  if (perfilIds.size) {
    const { data } = await supabase.from("perfiles").select("id,nombre").in("id", [...perfilIds]);
    (data || []).forEach((r: any) => perfilNom.set(r.id, r.nombre));
  }
  // Un id que ya no existe (perfil borrado) se muestra tal cual antes que romper.
  const persDe = (v: any) => v ? (perfilNom.get(v) || v) : "sin asignar";

  const todos: Evento[] = (evs || []).map((x: any) => ({
    ...x,
    detalle: x.tipo === "estado" && x.detalle?.campo === "responsable"
      ? { ...x.detalle, de: persDe(x.detalle.de), a: persDe(x.detalle.a) }
      : x.detalle,
    entidadNombre: nombre.get(`${x.entidad_tipo}:${x.entidad_id}`),
    actor: x.actor ? { ...x.actor, nombre: cortoActor(x.actor.nombre), alias: alias[x.actor_id] } : x.actor,
  }));

  /* Los conteos salen de `crudos` —todo el periodo—, no de la página traída.
     Un chip que dice «21» sobre una muestra de 500 no es un dato, es el tamaño
     de la muestra disfrazado de dato. */
  const cuenta = (f: (x: any) => any) => {
    const m = new Map<string, number>();
    (crudos || []).forEach((x: any) => { const k = f(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const porEvento = cuenta((x: any) => x.tipo);
  const porEntidad = cuenta((x: any) => tipoCanonico(x.entidad_tipo || ""));
  /* Por id y no por nombre: dos personas pueden llamarse igual, y el filtro
     viaja en la URL —un nombre con espacios y tildes es frágil ahí. */
  const porActor = cuenta((x: any) => x.actor_id || "bot");

  // La lista ya viene filtrada de la base.
  const lista = todos;
  const topeCuenta = (crudos || []).length >= TOPE_CUENTA;
  /* Cuántos hay DE VERDAD con los filtros puestos: se cuenta sobre `crudos`,
     que es el periodo entero, y no sobre la página. */
  const nFiltrado = (crudos || []).filter((x: any) =>
    (!filtroEv || x.tipo === filtroEv)
    && (!filtroEnt || tipoCanonico(x.entidad_tipo || "") === filtroEnt)
    && (!filtroActor || (x.actor_id || "bot") === filtroActor)).length;

  /* A qué hora se trabaja. El bot va aparte dentro de cada barra: escribe
     decenas de eventos de una sentada en su ronda de las 7:30, y mezclado
     dibujaría un pico que nadie trabajó. Separarlo hace que la barra diga
     dos cosas ciertas en vez de una falsa. */
  const HORAS = Array.from({ length: 24 }, (_, h) => h);
  const porHora = HORAS.map(h => ({ h, humano: 0, bot: 0 }));
  lista.forEach((x: any) => {
    const c = porHora[horaLima(x.creado_en)];
    if (x.actor) c.humano++; else c.bot++;
  });
  const pico = Math.max(1, ...porHora.map(x => x.humano + x.bot));
  const horaAhora = horaLima(new Date().toISOString());
  const totalHum = porHora.reduce((s, x) => s + x.humano, 0);
  // La hora más viva del equipo (sin contar al bot): el dato que cuenta algo
  const horaTop = [...porHora].sort((a, b) => b.humano - a.humano)[0];

  // Por jornadas, no 500 filas seguidas
  const dias: [string, Evento[]][] = [];
  lista.forEach(x => {
    const d = diaLima(x.creado_en);
    const ult = dias[dias.length - 1];
    if (ult && ult[0] === d) ult[1].push(x); else dias.push([d, [x]]);
  });

  const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE",
    { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
  const url = (np: Periodo | string, ne: string, nt: string, na: string) =>
    `/historial?p=${np}${ne ? `&e=${ne}` : ""}${nt ? `&t=${nt}` : ""}${na ? `&a=${encodeURIComponent(na)}` : ""}`;
  const filtrado = !!(filtroEv || filtroEnt || filtroActor) || p !== "semana";

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/qhaway" className="btn btn-ghost">🤖 Bot Qhaway</Link>
      </div>
      <h1 className="title-lg">🕐 El diario — todo lo que pasó</h1>

      <PanelFiltros limpiar="/historial" mostrarLimpiar={filtrado}>
        <FilaFiltro titulo="Periodo">
          {PERIODOS.map(([k, lbl]) => (
            <Chip key={k} href={url(k, filtroEv, filtroEnt, filtroActor)} on={p === k} color="var(--violet)">
              {lbl}
            </Chip>
          ))}
        </FilaFiltro>
        {porEntidad.length > 0 && (
          <FilaFiltro titulo="Sobre qué">
            {porEntidad.map(([t, n]) => (
              <Chip key={t} href={url(p, filtroEv, filtroEnt === t ? "" : t, filtroActor)} on={filtroEnt === t}>
                {ICO_ENT[t] || "🔗"} {ROTULO_ENT[t] || t} · {n}
              </Chip>
            ))}
          </FilaFiltro>
        )}
        {porEvento.length > 0 && (
          <FilaFiltro titulo="Qué pasó">
            {porEvento.map(([t, n]) => (
              <Chip key={t} href={url(p, filtroEv === t ? "" : t, filtroEnt, filtroActor)} on={filtroEv === t}>
                {icoDe(t)} {ROTULO_EV[t] || t} · {n}
              </Chip>
            ))}
          </FilaFiltro>
        )}
        {porActor.length > 0 && (
          <FilaFiltro titulo="Quién">
            {porActor.map(([a, n]) => {
              const esBot = a === "bot";
              const nom = esBot ? `🤖 ${BOT}` : (alias[a] || cortoActor(nomActor.get(a)) || "—");
              return (
                <Chip key={a} href={url(p, filtroEv, filtroEnt, filtroActor === a ? "" : a)}
                  on={filtroActor === a} color={esBot ? "var(--dim)" : "var(--teal)"}>
                  {nom} · {n}
                </Chip>
              );
            })}
          </FilaFiltro>
        )}
      </PanelFiltros>

      <div className="card" style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
        {/* El número grande es el TOTAL del periodo con los filtros puestos, no
            el de las filas traídas: si el tope recorta, se dice aparte en vez
            de rebajar el total y hacerlo pasar por completo. */}
        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--violet)" }}>{nFiltrado}</span>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          movimiento{nFiltrado === 1 ? "" : "s"}
          {" · "}{(PERIODOS.find(([k]) => k === p)?.[1] || "").toLowerCase()}
        </span>
        <span style={{ flex: 1 }} />
        {lista.length < nFiltrado && (
          <span style={{ color: "var(--yellow)", fontSize: 11.5 }}>
            ⚠ se listan los {lista.length} más recientes de {nFiltrado} — acota el periodo
          </span>
        )}
        {topeCuenta && (
          <span style={{ color: "var(--yellow)", fontSize: 11.5 }}>
            ⚠ hay más de {TOPE_CUENTA} eventos en el periodo: los conteos van cortos
          </span>
        )}
      </div>

      {lista.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
              🕗 A qué hora se trabaja
            </span>
            {totalHum > 0 && horaTop.humano > 0 && (
              <span style={{ color: "var(--muted)", fontSize: 11.5 }}>
                más movimiento a las <b style={{ color: "var(--teal)" }}>{String(horaTop.h).padStart(2, "0")}:00</b>
              </span>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ display: "flex", gap: 10, fontSize: 10.5, color: "var(--dim)" }}>
              <span><i className="hg-mx hg-hum" /> equipo</span>
              <span><i className="hg-mx hg-bot" /> Qhaway</span>
            </span>
          </div>
          <div className="hg">
            {porHora.map(({ h, humano, bot }) => {
              const total = humano + bot;
              return (
                <span key={h} className={`hg-col${h === horaAhora ? " ahora" : ""}`}
                  title={`${String(h).padStart(2, "0")}:00 — ${humano} del equipo${bot ? ` · ${bot} de Qhaway` : ""}`}>
                  <span className="hg-barra">
                    {/* El bot abajo, el equipo arriba: lo que importa queda a la vista */}
                    <span className="hg-bot" style={{ height: `${(bot / pico) * 100}%` }} />
                    <span className="hg-hum" style={{ height: `${(humano / pico) * 100}%` }} />
                  </span>
                  {/* Solo cada 3 horas: 24 números no se leen */}
                  <span className="hg-h">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {!lista.length && (
        <div className="empty">
          Nada con estos filtros {(PERIODOS.find(([k]) => k === p)?.[1] || "").toLowerCase()}.
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
              {agruparEventos(evs as any[]).map((f, i) =>
                f.grupo
                  ? <EventoGrupo key={i} items={f.grupo} horaDe={(x: any) => hora(x.creado_en)} conEntidad />
                  : <EventoHistorial key={i} e={f.solo} hora={hora(f.solo.creado_en)} conEntidad />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
