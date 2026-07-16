import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { ESTADO_ICO, ESTADO_TXT, ESTADO_COL } from "@/lib/estados";
import { PERIODOS, desdeDe, type Periodo } from "@/lib/periodo";
import { seccionDe } from "@/lib/secciones";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

/* CASOS POR ENTIDAD — el flujo de trabajo completo de cada ficha, junto.
   La ficha responde "qué pasa con ESTA empresa" y hay que entrar una por
   una; el tablero ordena por estado y mezcla a todo el mundo. Esto ordena
   por entidad: de un vistazo se ve quién acumula trabajo sin resolver. */

const TIPO_ICO: Record<string, string> = {
  aviso: "📢", tarea: "✅", problema: "❗", consulta: "❓",
  pago: "💰", idea: "💡", archivo: "📎", conversacion: "💬",
};
const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];

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
      .order("creado_en", { ascending: false })
      .limit(1000);
    const desde = desdeDe(p);
    if (desde) q = q.gte("creado_en", desde);
    const { data } = await q;
    pubs = data || [];
  }
  const pubDe = new Map(pubs.map((x: any) => [x.id, x]));

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
  const dias = (f: string | null) => f
    ? Math.ceil((new Date(f + "T23:59:59").getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href={`/historial/${params.tipo}`} className="btn btn-ghost">🕐 Historial</Link>
        <Link href={conf.ruta} className="btn btn-ghost">{conf.ico} Ver {conf.plural}</Link>
      </div>
      <h1 className="title-lg">🗂 Casos por {conf.plural.replace(/s$/, "")}</h1>

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
              const d = ABIERTOS.includes(c.estado) ? dias(c.fecha_limite) : null;
              const nc = c.comentarios?.[0]?.count || 0;
              return (
                <Link key={c.id} href={`/caso/${c.id}`}>
                  <div className="info-row" style={{ cursor: "pointer", padding: "7px 14px" }}>
                    <span style={{ fontSize: 12 }}>{TIPO_ICO[c.tipo] || "💬"}</span>
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
                    {d !== null && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap",
                        color: d < 0 ? "var(--red)" : d <= 3 ? "var(--yellow)" : "var(--dim)" }}>
                        {d < 0 ? `${-d}d ⚠` : d === 0 ? "hoy" : `${d}d`}
                      </span>
                    )}
                    <span className={`pill st-${c.estado}`} style={{ fontSize: 10 }}>
                      {ESTADO_ICO[c.estado]} {ESTADO_TXT[c.estado]}
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
