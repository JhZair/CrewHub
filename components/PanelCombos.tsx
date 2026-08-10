"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AltaLote from "@/components/AltaLote";
import VistaCompra from "@/components/VistaCompra";
import AsignarACompra, { SacarDelCombo } from "@/components/AsignarACompra";
import { guardarCompra, borrarCompra } from "@/app/compras/acciones";
import { soles } from "@/lib/compras";
import type { EqLibre } from "@/components/AsignarACompra";

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
  /* La ficha del producto y la nota. Se podían ESCRIBIR al dar de alta el
     combo (components/AltaLote) y se leían en la vista al vuelo y en la
     búsqueda global… pero no se podían CORREGIR en ningún sitio: campos de
     una sola escritura. «llegó sin el cargador, reclamado» se queda dicho
     para siempre, aunque el cargador llegue. */
  link?: string | null;
  nota?: string | null;
  nUnidades: number; nVivas: number; nProblema: number;
};

export default function PanelCombos({ combos, categorias = [], inventario = [] }: {
  combos: ComboVista[]; categorias?: string[];
  /** Todo el inventario, para poder meter en un combo equipos que ya existen.
   *  Vivía en la ficha de la compra; la ficha se fue y esto se queda, que es
   *  lo que de verdad se usaba de ella. */
  inventario?: EqLibre[];
}) {
  const router = useRouter();
  /* Arranca CERRADO, y de una forma que el navegador no pueda deshacer.
     Antes era un `<details>` con `open={abierto}` y `useState(false)`. El
     estado inicial era correcto y aun así el panel aparecía abierto al
     volver a la página: Chrome RESTAURA el abierto/cerrado de un `<details>`
     junto con el scroll, y esa restauración ocurre fuera de React —el estado
     decía `false` y el DOM decía abierto—. Un fallo que no falla: el código
     leído era correcto.
     Con un botón y el cuerpo pintado condicionalmente no hay nada que
     restaurar: si el estado dice cerrado, el contenido no existe. */
  const [abierto, setAbierto] = useState(false);
  const [edita, setEdita] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const totalPEN = combos.filter(c => (c.moneda || "PEN") === "PEN")
    .reduce((a, c) => a + (Number(c.total) || 0), 0);
  /* Combos sin una sola unidad colgando: son una boleta registrada y nada
     más. Es el aviso útil, porque la compra que no se desglosa es la que
     luego nadie sabe en qué se convirtió. */
  const vacios = combos.filter(c => !c.nUnidades).length;

  return (
    <div className="card">
      <button className="panel-plegar" aria-expanded={abierto}
        style={{ color: "#d99a3f" }} onClick={() => setAbierto(!abierto)}>
        <span className="panel-flecha">{abierto ? "▾" : "▸"}</span>
        🧾 Combos de compra — lo que entró junto{combos.length ? ` · ${combos.length}` : ""}
        {vacios > 0 && <span style={{ color: "var(--yellow)", fontWeight: 400 }}> · {vacios} sin unidades</span>}
      </button>

      {abierto && (
        <div style={{ marginTop: 8 }}>
          <AltaLote categorias={categorias} />

          {!combos.length && (
            <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 8, lineHeight: 1.55 }}>
              Todavía no hay combos. Un combo es una compra —una boleta, un proveedor, una fecha— y
              de él cuelgan las unidades que trajo. No es un kit: las cinco radios de un combo pueden
              salir en cinco kits distintos.
            </div>
          )}

          {err && <div className="err-inline" style={{ marginTop: 8 }}>⚠ {err}</div>}

          {combos.map(c => {
            const fecha = c.fecha
              ? new Date(String(c.fecha) + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })
              : null;
            return (
              <div key={c.id} className="cbo-fila">
                <div className="cbo-l1">
                  {c.codigo && <span className="badge cmp-cod">{c.codigo}</span>}
                  {/* El nombre abre la vista al vuelo. Un combo se ve entero de
                      un vistazo: no necesita página, necesita no hacerte perder
                      el sitio. */}
                  <VistaCompra compraId={c.id}>
                    {abrir => (
                      <button className="cbo-nom" onClick={abrir} title="Ver el combo sin salir de aquí">
                        {c.nombre}
                      </button>
                    )}
                  </VistaCompra>
                  <span style={{ flex: 1 }} />
                  {c.total != null && (
                    <b style={{ color: "var(--teal)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {soles(Number(c.total), c.moneda || "PEN")}
                    </b>
                  )}
                  <button className="dato-btn" title="Editar el combo"
                    onClick={() => { setEdita(edita === c.id ? null : c.id); setErr(""); }}>✎</button>
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

                {edita === c.id && (
                  <EditorCombo c={c} inventario={inventario}
                    onErr={setErr} onListo={() => { setEdita(null); router.refresh(); }} />
                )}
              </div>
            );
          })}

          {combos.length > 0 && (
            <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 9, borderTop: "1px solid var(--border)", paddingTop: 7 }}>
              {soles(totalPEN)} invertido en soles · lo comprado en dólares va aparte, sin convertir.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Editar un combo y manejar sus unidades. Todo esto vivía en la ficha de la
   compra; la ficha se fue —una compra no tiene movimiento: se registra una
   vez y no se toca— y esto se queda, que es lo único que de verdad se usaba
   de ella. */
function EditorCombo({ c, inventario, onErr, onListo }: {
  c: ComboVista; inventario: EqLibre[];
  onErr: (s: string) => void; onListo: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [pide, setPide] = useState(false);
  const inp = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 9px", fontSize: 12.5, color: "var(--text)", fontFamily: "inherit", outline: "none",
  } as const;

  const suyas = inventario.filter(e => e.compra_id === c.id);

  return (
    <div className="cbo-editor" onClick={e => e.stopPropagation()}>
      <form className="cmp-form" onSubmit={async ev => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget as HTMLFormElement);
        setOcupado(true); onErr("");
        const r: any = await guardarCompra(c.id, Object.fromEntries(f.entries()));
        setOcupado(false);
        if (r?.error) { onErr(r.error); return; }
        onListo();
      }}>
        <div className="cmp-fila">
          <input name="nombre" defaultValue={c.nombre} style={{ ...inp, flex: 2, minWidth: 200 }} placeholder="Qué se compró" />
          <input name="proveedor" defaultValue={c.proveedor || ""} style={{ ...inp, flex: 1, minWidth: 130 }} placeholder="Proveedor" />
          <input name="fecha" type="date" defaultValue={c.fecha || ""} style={{ ...inp, width: 145 }} />
        </div>
        <div className="cmp-fila">
          <input name="total" defaultValue={c.total == null ? "" : String(c.total)} inputMode="decimal"
            style={{ ...inp, width: 120 }} placeholder="Total" />
          <select name="moneda" defaultValue={c.moneda || "PEN"} style={{ ...inp, width: 88 }}>
            <option value="PEN">S/ PEN</option><option value="USD">$ USD</option>
          </select>
          <input name="nota" defaultValue={c.nota || ""}
            style={{ ...inp, flex: 1, minWidth: 200 }} placeholder="Nota (opcional): «llegó sin el cargador, reclamado»" />
        </div>

        {/* LOS DOS LINKS, JUNTOS Y CON RÓTULO.
            Son dos papeles distintos —la boleta prueba que se pagó; la ficha
            del producto dice qué es y cuánto costaba— y por eso viven en dos
            columnas distintas desde el principio. Pero sueltos parecían el
            mismo campo repetido, y con razón: un `placeholder` DESAPARECE en
            cuanto el campo tiene valor. El de arriba estaba vacío y decía qué
            era; el de abajo, lleno, no decía nada. Dos cajas con una URL y
            ninguna pista de cuál es cuál.
            El rótulo no se va al escribir, y ponerlos lado a lado convierte
            la diferencia en lo primero que se ve. */}
        <div className="cmp-fila">
          <label className="cmp-campo" style={{ flex: 1, minWidth: 210 }}>
            <span className="cmp-lbl">🧾 Comprobante — la boleta o factura</span>
            <input name="comprobante_url" defaultValue={c.comprobante_url || ""}
              style={{ ...inp, width: "100%" }} placeholder="https://…" />
          </label>
          <label className="cmp-campo" style={{ flex: 1, minWidth: 210 }}>
            <span className="cmp-lbl">🔗 Producto — su ficha en la web del vendedor</span>
            <input name="link" defaultValue={c.link || ""}
              style={{ ...inp, width: "100%" }} placeholder="https://…" />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" style={{ padding: "5px 12px", fontSize: 12 }} disabled={ocupado}>
            {ocupado ? "…" : "Guardar"}
          </button>
          <span style={{ flex: 1 }} />
          {/* Borrar el combo NO borra sus equipos: quedan en el inventario sin
              procedencia. Se dice cuántos, o nadie los buscaría. */}
          {pide ? (
            <span style={{ fontSize: 11.5 }}>
              ¿quitar el combo? sus {c.nUnidades} equipo(s) se quedan, sin procedencia{" "}
              <button type="button" style={{ color: "var(--red)", fontWeight: 700 }} onClick={async () => {
                const r: any = await borrarCompra(c.id);
                if (r?.error) { onErr(r.error); return; }
                onListo();
              }}>sí</button>
              {" / "}<button type="button" style={{ color: "var(--dim)" }} onClick={() => setPide(false)}>no</button>
            </span>
          ) : (
            <button type="button" className="dato-btn" style={{ color: "var(--dim)" }}
              onClick={() => setPide(true)}>Quitar combo</button>
          )}
        </div>
      </form>

      {suyas.length > 0 && (
        <div style={{ marginTop: 9 }}>
          <div style={{ color: "var(--dim)", fontSize: 10.5, letterSpacing: .6, textTransform: "uppercase" }}>
            Unidades · {suyas.length}
          </div>
          {suyas.map(u => (
            <div key={u.id} className="info-row" style={{ padding: "3px 0" }}>
              {u.folio && <span className="kit-pz-folio">{u.folio}</span>}
              <a href={`/entidad/equipamiento/${u.id}`} style={{ flex: 1, fontSize: 12.5, minWidth: 0 }}>{u.nombre}</a>
              <span style={{ color: "var(--dim)", fontSize: 11 }}>{(u.estado || "").replace(/_/g, " ")}</span>
              <SacarDelCombo equipoId={u.id} />
            </div>
          ))}
        </div>
      )}

      <AsignarACompra compraId={c.id} equipos={inventario} />
    </div>
  );
}
