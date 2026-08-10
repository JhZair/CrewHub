"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { asignarACompra } from "@/app/compras/acciones";
import PiezasKit from "@/components/PiezasKit";
import VistaCompra from "@/components/VistaCompra";
import type { PiezaKit } from "@/lib/kits";

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

export default function ComboDelEquipo({ equipoId, combo, compras, hermanas = [] }: {
  equipoId: string;
  combo: { id: string; codigo?: string | null; nombre: string; proveedor?: string | null;
    fecha?: string | null; total?: number | string | null; moneda?: string | null } | null;
  compras: ComboOp[];
  /** Lo demás que vino en la misma compra. Se lista aquí y no detrás de un
   *  enlace: «¿qué más vino con esto?» es la pregunta, y hacerla costar un
   *  clic es dejarla sin contestar. Se pinta con el mismo componente que las
   *  piezas de un kit —es la misma fila: foto, folio, nombre y por qué no
   *  está disponible—. */
  hermanas?: PiezaKit[];
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
          {/* Abre la vista al vuelo, no una página. Un combo se ve entero de
              un vistazo —qué se compró, cuánto costó, qué trajo— y no tiene
              movimiento que justifique sacarte de aquí. */}
          <VistaCompra compraId={combo.id}>
            {abrir => (
              <button onClick={abrir} title="Ver el combo sin salir de la ficha"
                style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap",
                  background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", font: "inherit" }}>
                {combo.codigo && <span className="badge cmp-cod">{combo.codigo}</span>}
                <b style={{ fontSize: 13, color: "var(--text)" }}>{combo.nombre}</b>
                {combo.total != null && (
                  <span style={{ color: "var(--teal)", fontSize: 11.5 }}>
                    {combo.moneda === "USD" ? "$" : "S/"} {Math.round(Number(combo.total)).toLocaleString("es-PE")}
                  </span>
                )}
                <span style={{ color: "var(--dim)", fontSize: 11 }}>⚡</span>
              </button>
            )}
          </VistaCompra>
          {(combo.proveedor || fecha) && (
            <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 4 }}>
              {[combo.proveedor, fecha].filter(Boolean).join(" · ")}
            </div>
          )}
          {/* Qué más vino, aquí mismo. El propio equipo va marcado dentro de
              la lista: sin la marca hay que buscar el folio propio entre
              seis para saber cuál eres. */}
          {hermanas.length > 1 && (
            <>
              <div style={{ color: "var(--dim)", fontSize: 10.5, letterSpacing: .6,
                textTransform: "uppercase", margin: "9px 0 2px" }}>
                Vino con {hermanas.length - 1} cosa{hermanas.length - 1 === 1 ? "" : "s"} más
              </div>
              <PiezasKit piezas={hermanas} yo={equipoId} />
            </>
          )}
          {hermanas.length === 1 && (
            <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 7 }}>
              Es lo único que cuelga de esta compra.
            </div>
          )}

          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
