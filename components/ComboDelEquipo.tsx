"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { asignarACompra } from "@/app/compras/acciones";

/* DE QUÉ COMPRA VINO ESTE EQUIPO.
 *
 * La sección se ve SIEMPRE, tenga combo o no. Un panel que solo aparece
 * cuando el dato ya está no sirve para ponerlo: hay que saber que el hueco
 * existe para querer llenarlo, y «comprado en: MercadoLibre John» —un texto
 * suelto que no lleva a ninguna parte— era todo lo que había.
 *
 * Y se asigna desde aquí. El otro camino —abrir el combo y buscar el
 * equipo— sirve para cargar cinco de golpe; éste sirve para cuando estás
 * mirando la ficha y te acuerdas de dónde salió, que es cuando de verdad
 * ocurre.
 */

export type ComboOp = { id: string; codigo?: string | null; nombre: string };

export default function ComboDelEquipo({ equipoId, combo, compras }: {
  equipoId: string;
  combo: { id: string; codigo?: string | null; nombre: string; proveedor?: string | null;
    fecha?: string | null; total?: number | string | null; moneda?: string | null } | null;
  compras: ComboOp[];
}) {
  const router = useRouter();
  const [eligiendo, setEligiendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");

  async function asignar(compraId: string | null) {
    setOcupado(true); setErr("");
    const r: any = await asignarACompra([equipoId], compraId);
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    setEligiendo(false); router.refresh();
  }

  const fecha = combo?.fecha
    ? new Date(String(combo.fecha) + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h4 style={{ margin: "0 0 7px", fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
        🧾 Combo de compra
      </h4>

      {err && <div className="err-inline">⚠ {err}</div>}

      {combo ? (
        <>
          <Link href={`/entidad/compra/${combo.id}`} style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            {combo.codigo && <span className="badge cmp-cod">{combo.codigo}</span>}
            <b style={{ fontSize: 13, color: "var(--text)" }}>{combo.nombre}</b>
            {combo.total != null && (
              <span style={{ color: "var(--teal)", fontSize: 11.5 }}>
                {combo.moneda === "USD" ? "$" : "S/"} {Math.round(Number(combo.total)).toLocaleString("es-PE")}
              </span>
            )}
          </Link>
          {(combo.proveedor || fecha) && (
            <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 4 }}>
              {[combo.proveedor, fecha].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/entidad/compra/${combo.id}`} className="dato-btn" style={{ color: "var(--violet)", fontSize: 11.5 }}>
              Ver qué más vino →
            </Link>
            <button className="dato-btn" style={{ color: "var(--dim)", fontSize: 11.5 }}
              disabled={ocupado} onClick={() => asignar(null)}>Sacar del combo</button>
          </div>
        </>
      ) : eligiendo ? (
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          <select className="hf-sel" defaultValue="" disabled={ocupado}
            onChange={e => e.target.value && asignar(e.target.value)}>
            <option value="">— ¿de qué compra vino? —</option>
            {compras.map(c => (
              <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ""}{c.nombre}</option>
            ))}
          </select>
          <button className="dato-btn" onClick={() => setEligiendo(false)}>Cancelar</button>
          {!compras.length && (
            <span style={{ color: "var(--yellow)", fontSize: 11.5 }}>
              Todavía no hay compras registradas. Se crean en 🎥 Equipos.
            </span>
          )}
        </div>
      ) : (
        <>
          {/* El hueco se nombra. Sin decirlo, «no hay combo» y «no se ha
              rellenado» se ven exactamente igual. */}
          <div style={{ color: "var(--dim)", fontSize: 12, lineHeight: 1.55 }}>
            Sin compra registrada — no se sabe qué vino con él, ni si está en garantía.
          </div>
          <button className="btn btn-ghost" style={{ padding: "4px 11px", fontSize: 11.5, marginTop: 6 }}
            onClick={() => setEligiendo(true)}>＋ Decir de qué compra vino</button>
        </>
      )}
    </div>
  );
}
