import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { soles } from "@/lib/compras";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🧾 Compras" };

/* LOS COMBOS DE COMPRA — cómo entró cada cosa.
 *
 * Un combo no es un kit y no es una unidad: es una compra. Guarda lo que
 * dice la boleta —proveedor, fecha, total, comprobante— y de él cuelgan las
 * unidades que trajo. Las cinco radios entraron en un combo y pueden salir
 * en cinco kits distintos: por eso son ejes separados.
 */
export default async function Compras() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: compras, error }, { data: eqs }] = await Promise.all([
    supabase.from("compras").select("id,codigo,nombre,proveedor,fecha,total,moneda,comprobante_url,nota")
      .order("fecha", { ascending: false, nullsFirst: false }),
    supabase.from("equipamiento").select("id,compra_id,estado,valor_compra")
      .not("compra_id", "is", null),
  ]);
  const fallo = (error as any)?.message || "";

  const porCompra = new Map<string, any[]>();
  (eqs || []).forEach((e: any) => porCompra.set(e.compra_id, [...(porCompra.get(e.compra_id) || []), e]));

  const totalPEN = (compras || [])
    .filter((c: any) => (c.moneda || "PEN") === "PEN")
    .reduce((a: number, c: any) => a + (Number(c.total) || 0), 0);

  return (
    <main className="wrap">
      <Volver />
      <h1 className="title-lg">🧾 Combos de compra</h1>
      <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "-6px 0 14px", lineHeight: 1.55 }}>
        Cómo <b>entró</b> cada equipo. Un combo es una compra —una boleta, un proveedor, una fecha— y
        de él cuelgan las unidades que trajo. No es un kit: las cinco radios de un combo pueden salir
        en cinco kits distintos.
      </div>

      {fallo && (
        <div className="err-inline" style={{ lineHeight: 1.5 }}>
          ⚠ No se pudo leer las compras.
          <br /><code style={{ fontSize: 11, opacity: .85 }}>{fallo}</code>
          {/relation|does not exist|schema cache/i.test(fallo) && (
            <><br /><b>Falta correr <code>db/compras.sql</code> en Supabase.</b></>
          )}
        </div>
      )}

      {!fallo && !(compras || []).length && (
        <div className="card" style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
          Todavía no hay compras registradas. Se crean desde{" "}
          <Link href="/equipamiento" style={{ color: "var(--violet)" }}>🎥 Equipos</Link>, con
          «🧾 Registrar una compra»: ahí se da de alta el combo y sus unidades de golpe, con folios
          correlativos.
        </div>
      )}

      {(compras || []).length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 12 }}>
          <span className="stat-card" style={{ display: "block" }}>
            <span className="stat-n" style={{ color: "#d99a3f", display: "block" }}>{(compras || []).length}</span>
            <span className="stat-l">compras registradas</span>
          </span>
          <span className="stat-card" style={{ display: "block" }}>
            <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>{soles(totalPEN)}</span>
            <span className="stat-l">invertido en soles
              <span style={{ display: "block", color: "var(--dim)", fontSize: 10.5 }}>
                lo comprado en dólares va aparte, sin convertir
              </span>
            </span>
          </span>
        </div>
      )}

      {(compras || []).map((c: any) => {
        const us = porCompra.get(c.id) || [];
        const vivas = us.filter((u: any) => !["de_baja", "perdido"].includes(u.estado));
        const rotas = us.filter((u: any) => ["en_reparacion", "perdido", "de_baja"].includes(u.estado));
        return (
          <Link key={c.id} href={`/entidad/compra/${c.id}`} className="card cmp-item">
            <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
              {c.codigo && <span className="badge cmp-cod">{c.codigo}</span>}
              <b style={{ fontSize: 14, color: "var(--text)" }}>{c.nombre}</b>
              {c.proveedor && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>· {c.proveedor}</span>}
              <span style={{ flex: 1 }} />
              {c.total != null && (
                <b style={{ color: "var(--teal)", fontSize: 13 }}>{soles(Number(c.total), c.moneda)}</b>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 5, fontSize: 11.5 }}>
              {c.fecha && <span style={{ color: "var(--dim)" }}>
                {new Date(c.fecha + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}
              </span>}
              <span style={{ color: us.length ? "var(--muted)" : "var(--yellow)" }}>
                {us.length ? `${us.length} unidad(es) · ${vivas.length} en inventario` : "sin unidades cargadas"}
              </span>
              {/* Lo que se malogró de esta compra: es el dato que dice si el
                  proveedor o el modelo dieron problemas, y no está en ningún
                  otro sitio. */}
              {rotas.length > 0 && <span style={{ color: "var(--yellow)" }}>⚠ {rotas.length} con problema</span>}
              {c.comprobante_url && <span style={{ color: "var(--green)" }}>🧾 con comprobante</span>}
              {!c.comprobante_url && <span style={{ color: "var(--dim)" }}>sin comprobante</span>}
            </div>
            {c.nota && <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 4 }}>{c.nota}</div>}
          </Link>
        );
      })}
    </main>
  );
}
