"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearCompra, altaEnLote } from "@/app/compras/acciones";

/* DAR DE ALTA UNA COMPRA ENTERA.
 *
 * Registrar diez Claw Mini V-Rig de a uno son diez fichas abiertas, y lo
 * que pasa de verdad es que se registran dos: las otras ocho viven en el
 * estante sin existir en ninguna parte, y cuando una se malogra no hay
 * dónde anotarlo.
 *
 * Se crea el combo —la boleta— y dentro se dan de alta sus unidades por
 * tandas: «1 DJI Action 5 Pro», «3 baterías», «1 hub de carga», «1 jaula»,
 * «1 palo selfie». Cada tanda son N unidades REALES con folio propio, no
 * una fila con cantidad: la batería que falle tiene que poder decirlo sola.
 */

export default function AltaLote({ categorias = [] }: { categorias?: string[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [compra, setCompra] = useState<{ id: string; codigo: string; nombre: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<string[]>([]);

  const inp = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 10px", fontSize: 13, color: "var(--text)", fontFamily: "inherit", outline: "none",
  } as const;

  async function nuevaCompra(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setOcupado(true); setErr("");
    const r: any = await crearCompra({
      nombre: String(f.get("nombre") || ""), proveedor: String(f.get("proveedor") || ""),
      fecha: String(f.get("fecha") || ""), total: String(f.get("total") || ""),
      moneda: String(f.get("moneda") || "PEN"), link: String(f.get("link") || ""),
      nota: String(f.get("nota") || ""),
    });
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    setCompra({ id: r.id, codigo: r.codigo, nombre: String(f.get("nombre") || "") });
    router.refresh();
  }

  async function tanda(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setOcupado(true); setErr("");
    const r: any = await altaEnLote(compra?.id || null, {
      nombre: String(f.get("nombre") || ""), cantidad: Number(f.get("cantidad") || 1),
      categoria: String(f.get("categoria") || ""), valorUnitario: String(f.get("valor") || ""),
      link: String(f.get("link") || ""),
    });
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    /* Se dice el rango de folios que salió: es lo que hay que escribir en
       las etiquetas físicas, y si no se dice hay que ir a buscarlo. */
    setMsg(m => [...m, `✔ ${r.creadas} × ${f.get("nombre")} → ${r.desde}${r.creadas > 1 ? ` … ${r.hasta}` : ""}`]);
    form.reset();
    router.refresh();
  }

  if (!abierto) {
    return (
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-ghost" onClick={() => setAbierto(true)}>＋ Nuevo combo</button>
        <span style={{ color: "var(--dim)", fontSize: 12, marginLeft: 10 }}>
          una compra con varias unidades, foliadas de golpe
        </span>
      </div>
    );
  }

  return (
    <div className="cbo-alta">
      {err && <div className="err-inline">⚠ {err}</div>}

      {!compra ? (
        <form onSubmit={nuevaCompra} className="cmp-form">
          <div className="cmp-fila">
            <input name="nombre" style={{ ...inp, flex: 2, minWidth: 220 }} autoFocus
              placeholder="Qué se compró — «Combo DJI Action 5 Pro»" />
            <input name="proveedor" style={{ ...inp, flex: 1, minWidth: 140 }} placeholder="Proveedor / tienda" />
            <input name="fecha" type="date" style={{ ...inp, width: 150 }} />
          </div>
          <div className="cmp-fila">
            <input name="total" inputMode="decimal" style={{ ...inp, width: 130 }} placeholder="Total de la boleta" />
            <select name="moneda" style={{ ...inp, width: 90 }}>
              <option value="PEN">S/ PEN</option>
              <option value="USD">$ USD</option>
            </select>
            <input name="link" style={{ ...inp, flex: 1, minWidth: 200 }} placeholder="Link del producto (opcional)" />
          </div>
          <input name="nota" style={{ ...inp, width: "100%" }} placeholder="Nota (opcional): «llegó sin el cargador, reclamado»" />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" disabled={ocupado}>{ocupado ? "…" : "Crear el combo"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setAbierto(false)}>Cancelar</button>
            {/* El precio del combo es la verdad de la boleta. Se dice aquí
                para que nadie sienta que tiene que repartirlo a mano. */}
            <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
              El total va aquí, en la compra. Las unidades solo llevan precio si lo sabes.
            </span>
          </div>
        </form>
      ) : (
        <>
          <div className="cmp-cab">
            <b>{compra.codigo} · {compra.nombre}</b>
            <span style={{ color: "var(--dim)", fontSize: 11.5 }}>Ahora, qué unidades trajo</span>
            <span style={{ flex: 1 }} />
            <a className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11.5 }}
              href={`/entidad/compra/${compra.id}`}>Ver la ficha ↗</a>
            <button className="dato-btn" onClick={() => { setCompra(null); setMsg([]); setAbierto(false); }}>Terminar</button>
          </div>

          <form onSubmit={tanda} className="cmp-form">
            <div className="cmp-fila">
              <input name="cantidad" type="number" min={1} max={50} defaultValue={1}
                style={{ ...inp, width: 74 }} title="Cuántas unidades" />
              <input name="nombre" style={{ ...inp, flex: 2, minWidth: 200 }} required
                placeholder="Nombre del equipo — «Batería DJI Action 5»" />
              <input name="categoria" list="cats-lote" style={{ ...inp, flex: 1, minWidth: 130 }} placeholder="Categoría" />
              <datalist id="cats-lote">{categorias.map(c => <option key={c} value={c} />)}</datalist>
              <input name="valor" inputMode="decimal" style={{ ...inp, width: 120 }}
                placeholder="Precio c/u" title="Solo si lo sabes. Vacío = lo cubre el total del combo." />
            </div>
            <input name="link" style={{ ...inp, width: "100%" }} placeholder="Link de esta pieza (opcional)" />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn" disabled={ocupado}>{ocupado ? "Dando de alta…" : "＋ Dar de alta la tanda"}</button>
              <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                Los folios salen correlativos del último que exista. Cada unidad tendrá su ficha y su bitácora.
              </span>
            </div>
          </form>

          {msg.length > 0 && (
            <div className="cmp-hecho">
              {msg.map((m, i) => <div key={i}>{m}</div>)}
              <div style={{ color: "var(--dim)", marginTop: 4 }}>
                Anota esos folios en las etiquetas físicas: es lo que hará que una unidad rota se pueda nombrar.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
