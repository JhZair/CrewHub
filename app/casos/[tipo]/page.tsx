import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { ESTADO_ICO, ESTADO_TXT, ESTADO_COL, claseEstado, rotuloEstado } from "@/lib/estados";
import { contarHijos, colorFamilia } from "@/lib/familia";
import { plazoDe } from "@/lib/plazo";
import { icoTipo } from "@/lib/tipos";
import { PERIODOS, rangoDe, type Periodo } from "@/lib/periodo";
import { seccionDe } from "@/lib/secciones";
import Link from "@/components/Enlace";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

/* CASOS POR ENTIDAD — el flujo de trabajo completo de cada ficha, junto.
   La ficha responde "qué pasa con ESTA empresa" y hay que entrar una por
   una; el tablero ordena por estado y mezcla a todo el mundo. Esto ordena
   por entidad: de un vistazo se ve quién acumula trabajo sin resolver. */

/* (El mapa de tipos salió a lib/tipos.) */
const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];

export function generateMetadata({ params }: { params: { tipo: string } }): Metadata {
  const s = seccionDe(params.tipo);
  // Mismo texto que el h1 de la página: la pestaña dice lo que vas a leer
  return { title: `🗂 Casos por ${s ? s.singular : params.tipo}` };
}

export default async function CasosPorEntidad({ params, searchParams }: {
  params: { tipo: string };
  searchParams: { e?: string; p?: string };
}) {
  const conf = seccionDe(params.tipo);
  if (!conf) notFound();

  const filtroEst = searchParams?.e || "";
  const p = (PERIODOS.some(([k]) => k === searchParams?.p) ? searchParams!.p : "todo") as Periodo;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Los vínculos primero: son los que dicen qué caso es de qué ficha
  const { data: vincs } = await supabase.from("publicacion_vinculos")
    .select("entidad_id,publicacion_id")
    .eq("entidad_tipo", params.tipo).limit(2000);

  const idsPub = [...new Set((vincs || []).map((v: any) => v.publicacion_id))];
  let pubs: any[] = [];
  if (idsPub.length) {
    let q = supabase.from("publicaciones")
      .select("id,titulo,tipo,estado,fecha_limite,creado_en,comentarios(count),resp:perfiles!publicaciones_responsable_fkey(nombre)")
      .in("id", idsPub)
      // Vista operativa: quién acumula trabajo. Lo archivado no es trabajo —y
      // un aviso archivado sumaba a «sin cerrar». La memoria está en la ficha.
      .is("archivado_en", null)
      .neq("tipo", "bitacora")   // las notas del muro solo viven en su proyecto
      .order("creado_en", { ascending: false })
      .limit(1000);
    // Las dos puntas: un periodo cerrado sin `hasta` no está cerrado.
    const { desde, hasta } = rangoDe(p);
    if (desde) q = q.gte("creado_en", desde);
    if (hasta) q = q.lt("creado_en", hasta);
    const { data } = await q;
    pubs = data || [];
  }
  const pubDe = new Map(pubs.map((x: any) => [x.id, x]));

  /* Que un caso tenga sub-casos cambia lo que es: no es una fila suelta, es
     trabajo repartido. Este listado no lo decía. */
  const idsPub2 = pubs.map((x: any) => x.id);
  const { data: hijosData } = idsPub2.length
    ? await supabase.from("publicaciones").select("padre_id,estado,archivado_en").in("padre_id", idsPub2)
    : { data: [] };
  const hijosDe = contarHijos(hijosData);

  // Nombres de las fichas (solo las que tienen casos)
  const idsEnt = [...new Set((vincs || []).map((v: any) => v.entidad_id))];
  const nombre = new Map<string, string>();
  if (idsEnt.length) {
    const sel = ["id", conf.campo, conf.corto].filter(Boolean).join(",");
    const { data: rows } = await supabase.from(conf.tabla).select(sel).in("id", idsEnt);
    (rows || []).forEach((r: any) =>
      nombre.set(r.id, (conf.corto && r[conf.corto]) || r[conf.campo] || "—"));
  }

  // Armar los grupos: una entidad, sus casos
  type Grupo = { id: string; nombre: string; casos: any[]; abiertos: number };
  const grupos = new Map<string, Grupo>();
  (vincs || []).forEach((v: any) => {
    const pub = pubDe.get(v.publicacion_id);
    if (!pub) return;                                  // cayó por el periodo
    if (filtroEst && pub.estado !== filtroEst) return;
    const n = nombre.get(v.entidad_id);
    if (!n) return;                                    // ficha borrada: vínculo huérfano
    const g = grupos.get(v.entidad_id)
      || { id: v.entidad_id, nombre: n, casos: [], abiertos: 0 };
    g.casos.push(pub);
    if (ABIERTOS.includes(pub.estado)) g.abiertos++;
    grupos.set(v.entidad_id, g);
  });

  /* Ordenado por trabajo sin cerrar, no alfabético: la pregunta que trae
     aquí es "¿dónde se está acumulando?", y esa respuesta va arriba. */
  const lista = [...grupos.values()].sort((a, b) =>
    b.abiertos - a.abiertos || b.casos.length - a.casos.length
    || a.nombre.localeCompare(b.nombre));

  const totalCasos = lista.reduce((s, g) => s + g.casos.length, 0);
  const totalAbiertos = lista.reduce((s, g) => s + g.abiertos, 0);

  // Conteo por estado del universo (sin el filtro de estado, con el de periodo)
  const porEstado = new Map<string, number>();
  (vincs || []).forEach((v: any) => {
    const pub = pubDe.get(v.publicacion_id);
    if (!pub || !nombre.get(v.entidad_id)) return;
    porEstado.set(pub.estado, (porEstado.get(pub.estado) || 0) + 1);
  });

  const url = (ne: string, np: string) =>
    `/casos/${params.tipo}?${ne ? `e=${ne}&` : ""}p=${np}`;
  /* (`dias()` vivía aquí, con `T23:59:59` y su propio umbral —amarillo a los
     3 días, cuando el feed lo pone a los 7—. Ahora sale de lib/plazo: el
     mismo caso ya no puede ser urgente en una pantalla y tranquilo en otra.) */

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href={`/historial/${params.tipo}`} className="btn btn-ghost">🕐 Historial</Link>
        <Link href={conf.ruta} className="btn btn-ghost">{conf.ico} Ver {conf.plural}</Link>
      </div>
      {/* `plural.replace(/s$/,"")` decía «Casos por postulacione» */}
      <h1 className="title-lg">🗂 Casos por {conf.singular}</h1>

      <PanelFiltros limpiar={`/casos/${params.tipo}`}
        mostrarLimpiar={!!filtroEst || p !== "todo"}>
        <FilaFiltro titulo="Estado">
          {Object.keys(ESTADO_TXT).map(k => {
            const n = porEstado.get(k) || 0;
            return n === 0 ? null : (
              <Chip key={k} href={url(filtroEst === k ? "" : k, p)} on={filtroEst === k}
                color={ESTADO_COL[k]}>
                {ESTADO_ICO[k]} {ESTADO_TXT[k]} · {n}
              </Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Abiertos en">
          {PERIODOS.map(([k, lbl]) => (
            <Chip key={k} href={url(filtroEst, k)} on={p === k} color="var(--violet)">{lbl}</Chip>
          ))}
        </FilaFiltro>
      </PanelFiltros>

      <div className="card" style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--violet)" }}>{totalCasos}</span>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          caso{totalCasos === 1 ? "" : "s"} repartidos en <b style={{ color: "var(--text)" }}>{lista.length}</b> de {conf.plural}
          {totalAbiertos > 0 && <> · <b style={{ color: "var(--red)" }}>{totalAbiertos}</b> sin cerrar</>}
        </span>
      </div>

      {!lista.length && (
        <div className="empty">Ningún caso vinculado a {conf.plural} con estos filtros.</div>
      )}

      {lista.map(g => (
        <div key={g.id} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px 6px" }}>
            <Link href={`/entidad/${params.tipo}/${g.id}`}
              style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
              {conf.ico} {g.nombre} →
            </Link>
            {/* El número que importa es lo que sigue vivo, no el total */}
            {g.abiertos > 0 && (
              <span className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.12)" }}>
                {g.abiertos} sin cerrar
              </span>
            )}
            <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{g.casos.length} en total</span>
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <div className="card" style={{ padding: "6px 0" }}>
            {g.casos.map((c: any) => {
              // plazoDe ya devuelve null si el caso está cerrado
              const pl = plazoDe(c.fecha_limite, c.estado);
              const nc = c.comentarios?.[0]?.count || 0;
              return (
                <Link key={c.id} href={`/caso/${c.id}`}>
                  <div className="info-row" style={{ cursor: "pointer", padding: "7px 14px" }}>
                    <span style={{ fontSize: 12 }}>{icoTipo(c.tipo)}</span>
                    <span style={{ flex: 1, fontSize: 12.5,
                      // Lo cerrado se apaga: el ojo va a lo que sigue vivo
                      color: ABIERTOS.includes(c.estado) ? "var(--text)" : "var(--dim)" }}>
                      {c.titulo}
                    </span>
                    {(c.resp as any)?.nombre && (
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>
                        {(c.resp as any).nombre.split(" ")[0]}
                      </span>
                    )}
                    {nc > 0 && <span style={{ color: "var(--dim)", fontSize: 11 }}>💬 {nc}</span>}
                    {hijosDe.get(c.id) && (() => {
                      const h = hijosDe.get(c.id)!;
                      return <span style={{ color: colorFamilia(h), fontSize: 11, whiteSpace: "nowrap" }}
                        title={`${h.ok} de ${h.total} sub-casos cerrados`}>🧩 {h.ok}/{h.total}</span>;
                    })()}
                    {pl && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", color: pl.color }}>
                        {pl.vencido ? `${-pl.d}d ⚠` : pl.d === 0 ? "hoy" : `${pl.d}d`}
                      </span>
                    )}
                    {/* c.tipo es el tipo de la publicación (params.tipo es la
                        entidad): un aviso de esta lista dice «Vigente». */}
                    <span className={`pill st-${claseEstado(c.estado, c.tipo)}`} style={{ fontSize: 10 }}>
                      {rotuloEstado(c.estado, c.tipo)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
