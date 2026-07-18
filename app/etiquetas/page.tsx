import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import EtiquetaBorrable from "@/components/EtiquetaBorrable";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🏷 Etiquetas" };

/* Índice de etiquetas: todas las etiquetas con su conteo de casos.
   Cada chip lleva a /entidad/etiqueta/{id}, donde viven sus casos. */
export default async function Etiquetas({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams?.q || "").trim();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: etqs }, { data: vincs }] = await Promise.all([
    supabase.from("etiquetas").select("id,nombre").order("nombre"),
    supabase.from("publicacion_vinculos").select("entidad_id").eq("entidad_tipo", "etiqueta"),
  ]);
  const conteo = new Map<string, number>();
  (vincs || []).forEach((v: any) => conteo.set(v.entidad_id, (conteo.get(v.entidad_id) || 0) + 1));

  const nrm = (s: any) => String(s || "").toLowerCase();
  const lista = (etqs || [])
    .map((e: any) => ({ ...e, n: conteo.get(e.id) || 0 }))
    .filter((e: any) => !q || nrm(e.nombre).includes(nrm(q)))
    .sort((a: any, b: any) => b.n - a.n || nrm(a.nombre).localeCompare(nrm(b.nombre)));
  const usadas = lista.filter((e: any) => e.n > 0);
  const sinUso = lista.filter((e: any) => e.n === 0);

  const chip = (e: any, tenue = false) => (
    <Link key={e.id} href={`/entidad/etiqueta/${e.id}`} className="echip echip-link"
      style={tenue ? { opacity: 0.6 } : undefined}>
      🏷️ {e.nombre}
      <span style={{ marginLeft: 5, color: "var(--muted)", fontSize: 11, fontWeight: 700 }}>{e.n}</span>
    </Link>
  );

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
      </div>
      <h1 className="title-lg">🏷️ Etiquetas</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        <input name="q" defaultValue={q} placeholder="Buscar etiqueta…"
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", outline: "none", fontSize: 13.5 }} />
        <button className="btn" type="submit">Buscar</button>
        {q && <Link href="/etiquetas" className="btn btn-ghost">✕</Link>}
      </form>

      <div className="card">
        <div className="panel-h">🏷️ En uso · {usadas.length}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {usadas.map((e: any) => chip(e))}
          {!usadas.length && (
            <span style={{ color: "var(--dim)", fontSize: 13 }}>
              Ninguna etiqueta con casos{q && " para esa búsqueda"}.
            </span>
          )}
        </div>
      </div>

      {sinUso.length > 0 && (
        <div className="card">
          <div className="panel-h" style={{ color: "var(--dim)" }}>Sin casos · {sinUso.length} — puedes eliminarlas (×)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {sinUso.map((e: any) => <EtiquetaBorrable key={e.id} id={e.id} nombre={e.nombre} />)}
          </div>
        </div>
      )}

      <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", margin: "6px 0 14px" }}>
        {(etqs || []).length} etiquetas en total · clic en una para ver sus casos.
      </div>
    </div>
  );
}
