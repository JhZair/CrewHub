"use client";
import { type ReactNode } from "react";
import VistaHilo from "@/components/VistaHilo";
import Copiar from "@/components/Copiar";
import { cargarCompraRapida } from "@/app/compras/acciones";
import { soles } from "@/lib/compras";
import { colorEstadoEq, txtEstadoEq } from "@/lib/estadosEquipo";
import { urlCorta } from "@/components/MasDatos";

/* VISTA RÁPIDA DE UN COMBO — qué se compró, cuánto costó y qué trajo.
 *
 * SIN página detrás, y es a propósito. Un combo tuvo ficha completa media
 * hora: repositorio, casos, historial, portada. Sobraba entero — una compra
 * no tiene movimiento: se registra una vez, se le cuelgan sus unidades y no
 * se vuelve a tocar. Lo que sí hace falta es poder mirarla sin perder el
 * sitio: desde el equipo que estás viendo, desde la lista de combos, desde
 * el buscador.
 *
 * Todo lo copiable es copiable: el código de la boleta y el total son
 * exactamente lo que uno viene a buscar para pegarlo en una rendición.
 */

function Fila({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="vp-fila">
      <span className="vp-lbl">{k}</span>
      <span className="vp-val">{children}</span>
    </div>
  );
}

export default function VistaCompra({ compraId, children }: {
  compraId: string;
  children: (abrir: (e?: any) => void) => ReactNode;
}) {
  return (
    <VistaHilo
      conHilo={false}
      claseCaja="vp-caja"
      ariaLabel="Vista rápida del combo de compra"
      cargar={() => cargarCompraRapida(compraId)}
      listo={(d: any) => !!d?.compra}
      tituloCab={(d: any) => (d?.compra ? `🧾 ${d.compra.codigo || ""} ${d.compra.nombre}`.trim() : "🧾 Combo de compra")}
      cabecera={(d: any) => {
        const c = d.compra;
        const us = d.unidades || [];
        const vivas = us.filter((u: any) => !["de_baja", "perdido"].includes(u.estado));
        const fecha = c.fecha
          ? new Date(String(c.fecha) + "T12:00:00").toLocaleDateString("es-PE",
              { day: "numeric", month: "long", year: "numeric" })
          : null;
        /* Lo que ya está valorado pieza por pieza. Si el total del combo y la
           suma de las piezas se separan mucho, alguien puso un precio mal —y
           eso solo se ve poniéndolos uno al lado del otro. */
        const conPrecio = us.filter((u: any) => Number(u.valor_compra) > 0);
        const sumaPiezas = conPrecio.reduce((a: number, u: any) => a + Number(u.valor_compra), 0);

        return (
          <div className="vp-cuerpo">
            <div className="vp-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="vp-nom">{c.nombre}</div>
                <div style={{ color: "var(--dim)", fontSize: 12 }}>
                  {[c.codigo, c.proveedor, fecha].filter(Boolean).join(" · ")}
                </div>
              </div>
              {c.total != null && (
                <Copiar valor={String(c.total)} etiqueta="total">
                  <b style={{ color: "var(--teal)", fontSize: 19, whiteSpace: "nowrap" }}>
                    {soles(Number(c.total), c.moneda || "PEN")}
                  </b>
                </Copiar>
              )}
            </div>

            <div className="vp-bloque">
              {c.codigo && <Fila k="Código"><Copiar valor={c.codigo} etiqueta="código">{c.codigo}</Copiar></Fila>}
              {c.proveedor && <Fila k="Proveedor"><Copiar valor={c.proveedor} etiqueta="proveedor">{c.proveedor}</Copiar></Fila>}
              {fecha && <Fila k="Fecha">{fecha}</Fila>}
              {c.link && (
                <Fila k="Producto">
                  <a href={c.link} target="_blank" rel="noopener noreferrer" className="fv-link" title={c.link}>
                    {urlCorta(c.link)} ↗
                  </a>
                </Fila>
              )}
              <Fila k="Comprobante">
                {c.comprobante_url
                  ? <a href={c.comprobante_url} target="_blank" rel="noopener noreferrer" className="fv-link">🧾 ver la boleta ↗</a>
                  /* El hueco se nombra: sin comprobante no hay garantía que
                     reclamar ni gasto que rendir, y eso no se descubre el día
                     que hace falta. */
                  : <span style={{ color: "var(--yellow)" }}>sin comprobante — sin él no hay garantía que reclamar ni gasto que rendir</span>}
              </Fila>
              {c.nota && <Fila k="Nota">{c.nota}</Fila>}
            </div>

            <div className="vp-bloque">
              <div className="vp-lbl">
                Unidades que trajo · {us.length}
                {us.length !== vivas.length && ` · ${vivas.length} en inventario`}
              </div>
              {!us.length && (
                <div style={{ color: "var(--yellow)", fontSize: 12.5, lineHeight: 1.5 }}>
                  Ninguna. Una boleta registrada y nada más es justo la compra que después
                  nadie sabe en qué se convirtió — cuélgale sus equipos desde 🎥 Equipos.
                </div>
              )}
              {/* En rejilla, que hay ancho de sobra: trece filas de un renglón
                  desperdiciaban mil píxeles de ancho para apilar mil de alto.
                  Conserva su desplazamiento vertical, pero alto —46vh— así que
                  con trece piezas no llega a aparecer; solo entra en juego si
                  un combo trae cuarenta, y entonces evita que la ficha crezca
                  hasta empujar el resumen del pie fuera de la pantalla. */}
              <div className="vc-lista">
                {us.map((u: any) => (
                  <a key={u.id} href={`/entidad/equipamiento/${u.id}`} className="vc-fila"
                    target="_blank" rel="noopener noreferrer">
                    {u.folio && <span className="kit-pz-folio">{u.folio}</span>}
                    <span className="vc-nom">{u.nombre}</span>
                    {Number(u.valor_compra) > 0 && (
                      <span style={{ color: "var(--dim)", fontSize: 11 }}>
                        {soles(Number(u.valor_compra), c.moneda || "PEN")}
                      </span>
                    )}
                    <span style={{ color: colorEstadoEq(u.estado), fontSize: 11, whiteSpace: "nowrap" }}>
                      {u.quien ? `lo tiene ${u.quien}` : txtEstadoEq(u.estado)}
                    </span>
                  </a>
                ))}
              </div>
              {sumaPiezas > 0 && c.total != null && (
                <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 6 }}>
                  {conPrecio.length} pieza(s) con precio propio suman {soles(sumaPiezas, c.moneda || "PEN")}
                  {" "}de los {soles(Number(c.total), c.moneda || "PEN")} de la boleta.
                </div>
              )}
            </div>
          </div>
        );
      }}
    >
      {children}
    </VistaHilo>
  );
}
