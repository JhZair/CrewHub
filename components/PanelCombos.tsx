"use client";
import { useState } from "react";
import Link from "next/link";
import AltaLote from "@/components/AltaLote";
import { soles } from "@/lib/compras";

/* LOS COMBOS — cómo entró cada cosa.
 *
 * Vive plegado dentro de /equipamiento, junto a los kits, porque son las dos
 * caras de la misma pregunta: el kit dice qué sale junto, el combo dice qué
 * entró junto. Tenerlos en la misma pantalla es lo que hace visible que NO
 * son lo mismo — las cinco radios entraron en un combo y pueden salir en
 * cinco kits distintos.
 *
 * Tuvo un listado propio en /compras durante media hora. Sobraba: nadie
 * piensa «voy a compras», piensa «¿de dónde salió esta radio?», y eso se
 * pregunta desde los equipos.
 */

export type ComboVista = {
  id: string; codigo?: string | null; nombre: string;
  proveedor?: string | null; fecha?: string | null;
  total?: number | string | null; moneda?: string | null;
  comprobante_url?: string | null;
  nUnidades: number; nVivas: number; nProblema: number;
};

export default function PanelCombos({ combos, categorias = [] }: {
  combos: ComboVista[]; categorias?: string[];
}) {
  const [abierto, setAbierto] = useState(false);

  const totalPEN = combos.filter(c => (c.moneda || "PEN") === "PEN")
    .reduce((a, c) => a + (Number(c.total) || 0), 0);
  /* Combos sin una sola unidad colgando: son una boleta registrada y nada
     más. Es el aviso útil, porque la compra que no se desglosa es la que
     luego nadie sabe en qué se convirtió. */
  const vacios = combos.filter(c => !c.nUnidades).length;

  return (
    <div className="card">
      <details open={abierto} onToggle={ev => setAbierto((ev.target as HTMLDetailsElement).open)}>
        <summary className="panel-h" style={{ cursor: "pointer", color: "#d99a3f", listStyle: "revert" }}>
          🧾 Combos de compra — lo que entró junto{combos.length ? ` · ${combos.length}` : ""}
          {vacios > 0 && <span style={{ color: "var(--yellow)", fontWeight: 400 }}> · {vacios} sin unidades</span>}
        </summary>

        <div style={{ marginTop: 8 }}>
          <AltaLote categorias={categorias} />

          {!combos.length && (
            <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 8, lineHeight: 1.55 }}>
              Todavía no hay combos. Un combo es una compra —una boleta, un proveedor, una fecha— y
              de él cuelgan las unidades que trajo. No es un kit: las cinco radios de un combo pueden
              salir en cinco kits distintos.
            </div>
          )}

          {combos.map(c => {
            const fecha = c.fecha
              ? new Date(String(c.fecha) + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })
              : null;
            return (
              <Link key={c.id} href={`/entidad/compra/${c.id}`} className="cbo-fila">
                <div className="cbo-l1">
                  {c.codigo && <span className="badge cmp-cod">{c.codigo}</span>}
                  <b className="cbo-nom">{c.nombre}</b>
                  <span style={{ flex: 1 }} />
                  {c.total != null && (
                    <b style={{ color: "var(--teal)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {soles(Number(c.total), c.moneda || "PEN")}
                    </b>
                  )}
                </div>
                <div className="cbo-l2">
                  {c.proveedor && <span>{c.proveedor}</span>}
                  {fecha && <span>{fecha}</span>}
                  {/* Cuántas unidades y cuántas siguen vivas. Un combo de 13
                      piezas con 11 en inventario dice que dos se cayeron, y
                      eso es lo que se viene a mirar meses después. */}
                  <span style={{ color: c.nUnidades ? "var(--muted)" : "var(--yellow)" }}>
                    {c.nUnidades
                      ? `${c.nUnidades} unidad(es)${c.nVivas !== c.nUnidades ? ` · ${c.nVivas} en inventario` : ""}`
                      : "sin unidades cargadas"}
                  </span>
                  {c.nProblema > 0 && <span style={{ color: "var(--yellow)" }}>⚠ {c.nProblema} con problema</span>}
                  <span style={{ color: c.comprobante_url ? "var(--green)" : "var(--dim)" }}>
                    {c.comprobante_url ? "🧾 con comprobante" : "sin comprobante"}
                  </span>
                </div>
              </Link>
            );
          })}

          {combos.length > 0 && (
            <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 9, borderTop: "1px solid var(--border)", paddingTop: 7 }}>
              {soles(totalPEN)} invertido en soles · lo comprado en dólares va aparte, sin convertir.
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
