"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarComprobante, borrarComprobante } from "@/app/actions";
import { useConfirmar, useAviso } from "@/components/useConfirmar";
import { money } from "@/lib/dj";
import { hoyLima } from "@/lib/fechas";

/* ── FACTURAS Y BOLETAS DEL FONDO ──
 *
 * La tercera pata de la rendición, y la que faltaba. Sin ella, una factura de
 * proveedor no tenía dónde ir y la salida a mano era meterla como declaración
 * jurada — consumiendo un tope que no le tocaba, y el tope de DJ es lo que
 * obliga a devolver plata si se pasa. Un hueco en el sistema no es solo algo
 * que falta: es una presión para usar mal lo que sí está.
 *
 * A diferencia del bloque de DJ, aquí NO hay saldo ni semáforo. Los
 * comprobantes formales no tienen tope: mientras más gasto se respalde así,
 * mejor. Poner una barra de progreso habría inventado un límite que no existe.
 */

const TIPOS: [string, string][] = [
  ["factura", "Factura"],
  ["boleta", "Boleta"],
  ["recibo_servicio", "Recibo de servicio"],
  ["otro", "Otro"],
];
const rotuloTipo = (t?: string | null) => TIPOS.find(([k]) => k === t)?.[1] || "Comprobante";

type Cmp = {
  id: string; tipo: string; proveedor: string; ruc: string | null;
  serie: string | null; numero: string | null;
  fecha: string; importe: number; igv: number | null;
  concepto: string | null; etapa: string | null; rubro_item: string | null; url: string | null;
};
type Opcion = { id: string; nombre: string };

const dmy = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });

export default function Comprobantes({
  postulacionId, comprobantes, etapas, rubros, esAdmin, error,
}: {
  postulacionId: string; comprobantes: Cmp[];
  etapas: Opcion[]; rubros: { id: string; etiqueta: string }[];
  esAdmin: boolean; error?: string | null;
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const vacio = {
    id: null as string | null, tipo: "factura", proveedor: "", ruc: "",
    serie: "", numero: "", fecha: hoyLima(), importe: "", igv: "",
    concepto: "", etapa: "", rubroItem: "", url: "",
  };
  const [f, setF] = useState(vacio);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  const total = comprobantes.reduce((s, c) => s + Number(c.importe || 0), 0);
  const sinPdf = comprobantes.filter(c => !c.url).length;

  const guardar = async () => {
    if (ocupado) return;
    avisar(""); setOcupado(true);
    const r: any = await guardarComprobante({ ...f, postulacionId });
    setOcupado(false);
    if (r?.error) { avisar(r.error); return; }
    setF(vacio); setAbierto(false); router.refresh();
  };

  const editar = (c: Cmp) => {
    setF({
      id: c.id, tipo: c.tipo, proveedor: c.proveedor, ruc: c.ruc || "",
      serie: c.serie || "", numero: c.numero || "", fecha: c.fecha,
      importe: String(c.importe), igv: c.igv ? String(c.igv) : "",
      concepto: c.concepto || "", etapa: c.etapa || "", rubroItem: c.rubro_item || "",
      url: c.url || "",
    });
    setAbierto(true);
  };

  const quitar = async (c: Cmp) => {
    if (!(await pedir(
      <>Se quitará el comprobante de <b>{c.proveedor}</b> por {money(c.importe)}.</>,
      { titulo: "Borrar comprobante", aceptar: "Borrar", peligro: true }))) return;
    avisar(""); setOcupado(true);
    const r: any = await borrarComprobante(c.id, postulacionId);
    setOcupado(false);
    if (r?.error) avisar(r.error); else router.refresh();
  };

  const inp = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 9px", fontSize: 12.5, color: "var(--text)", outline: "none",
  } as const;

  if (error) {
    return (
      <div className="empty" style={{ color: "var(--yellow)" }}>
        {/does not exist|42P01/.test(error)
          ? "Falta correr db/facturas.sql en Supabase."
          : `No se pudieron leer los comprobantes: ${error}`}
      </div>
    );
  }

  return (
    <>
      {dialogo}{aviso}

      <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap", marginBottom: 9 }}>
        <span style={{ color: "var(--teal)", fontWeight: 800, fontSize: 20 }}>{money(total)}</span>
        <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
          {comprobantes.length} comprobante{comprobantes.length === 1 ? "" : "s"}
        </span>
        {/* El PDF que falta se dice, aunque no bloquee: un comprobante sin
            escanear cuenta en el ejecutado pero no se puede presentar, y esa
            diferencia solo aparece el día de la rendición si nadie la cuenta. */}
        {sinPdf > 0 && (
          <span style={{ color: "var(--yellow)", fontSize: 12 }}>⚠ {sinPdf} sin PDF adjunto</span>
        )}
        <span style={{ flex: 1 }} />
        {esAdmin && !abierto && (
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => { setF(vacio); setAbierto(true); }}>＋ Registrar comprobante</button>
        )}
      </div>

      {abierto && esAdmin && (
        <div className="card" style={{ marginBottom: 10, borderColor: "var(--accent)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select value={f.tipo} onChange={e => set("tipo", e.target.value)} style={{ ...inp, width: 150 }}>
              {TIPOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            <input value={f.proveedor} onChange={e => set("proveedor", e.target.value)}
              placeholder="Proveedor — quién emitió" style={{ ...inp, flex: 1, minWidth: 180 }} />
            {/* El RUC va aparte del nombre porque es columna obligatoria del
                informe de DAFO. Sacarlo después de un texto libre es donde se
                pierde un dígito — y un RUC con un dígito de menos no falla:
                valida como otro, o como ninguno, y lo rebotan al rendir. */}
            <input value={f.ruc} onChange={e => set("ruc", e.target.value)}
              placeholder="RUC (11 dígitos)" inputMode="numeric" style={{ ...inp, width: 140 }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <input value={f.serie} onChange={e => set("serie", e.target.value)}
              placeholder="Serie (F001)" style={{ ...inp, width: 110 }} />
            <input value={f.numero} onChange={e => set("numero", e.target.value)}
              placeholder="Número" style={{ ...inp, width: 110 }} />
            <input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)}
              style={{ ...inp, width: 145 }} />
            <input value={f.importe} onChange={e => set("importe", e.target.value)}
              placeholder="Total S/" inputMode="decimal" style={{ ...inp, width: 110 }} />
            {/* El IGV se guarda, no se calcula: el informe lo pide desglosado y
                deducirlo de un total redondeado da céntimos que no cuadran con
                el papel que se adjunta. */}
            <input value={f.igv} onChange={e => set("igv", e.target.value)}
              placeholder="IGV S/" inputMode="decimal"
              title="Tal como lo dice el comprobante. Vacío si no lo desglosa."
              style={{ ...inp, width: 100 }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <select value={f.etapa} onChange={e => set("etapa", e.target.value)} style={{ ...inp, width: 175 }}>
              <option value="">Etapa…</option>
              {etapas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <select value={f.rubroItem} onChange={e => set("rubroItem", e.target.value)} style={{ ...inp, width: 175 }}>
              <option value="">Rubro…</option>
              {rubros.map(r => <option key={r.id} value={r.id}>{r.etiqueta}</option>)}
            </select>
            <input value={f.concepto} onChange={e => set("concepto", e.target.value)}
              placeholder="Concepto — qué se compró" style={{ ...inp, flex: 1, minWidth: 160 }} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <input value={f.url} onChange={e => set("url", e.target.value)}
              placeholder="Link del PDF o la foto del comprobante"
              style={{ ...inp, flex: 1, minWidth: 200 }} />
            <button className="btn" disabled={ocupado} style={{ fontSize: 12, padding: "6px 14px" }}
              onClick={guardar}>{ocupado ? "…" : f.id ? "Actualizar" : "Guardar"}</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}
              onClick={() => { setAbierto(false); setF(vacio); }}>Cancelar</button>
          </div>
        </div>
      )}

      {comprobantes.length === 0 ? (
        <div className="empty" style={{ fontSize: 12.5 }}>
          Sin comprobantes cargados. Aquí van las facturas y boletas de proveedor —
          alquiler, hospedaje, combustible, imprenta—, que se rinden sin tope.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {comprobantes.map(c => (
            <div key={c.id} className="info-row" style={{ gap: 9, flexWrap: "wrap", fontSize: 12.5 }}>
              <span style={{ color: "var(--dim)", fontSize: 11.5, minWidth: 52 }}>{dmy(c.fecha)}</span>
              <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: 10.5 }}>
                {rotuloTipo(c.tipo)}
              </span>
              <span style={{ fontWeight: 600, minWidth: 130 }}>{c.proveedor}</span>
              {(c.serie || c.numero) && (
                <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                  {[c.serie, c.numero].filter(Boolean).join("-")}
                </span>
              )}
              {/* El RUC que falta se marca: es columna obligatoria del informe y
                  conseguirlo después, con la factura ya archivada, cuesta. */}
              {!c.ruc && (
                <span style={{ color: "var(--yellow)", fontSize: 11 }} title="El informe de DAFO lo pide">
                  sin RUC
                </span>
              )}
              {c.concepto && (
                <span style={{ color: "var(--muted)", fontSize: 11.5, flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.concepto}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ color: "var(--teal)", fontWeight: 700 }}>{money(c.importe)}</span>
              {c.url
                ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="dato-btn"
                    title="Ver el comprobante">📎</a>
                : <span style={{ color: "var(--yellow)", fontSize: 11 }}>sin PDF</span>}
              {esAdmin && (
                <>
                  <button className="dato-btn" onClick={() => editar(c)} disabled={ocupado}>✎</button>
                  <button onClick={() => quitar(c)} disabled={ocupado} title="Borrar"
                    style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
