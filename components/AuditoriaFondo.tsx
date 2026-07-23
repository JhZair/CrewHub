"use client";
import { useState } from "react";

/* 🔍 El rastro de la plata: cada cambio en RHE, estados de cuenta y
   movimientos, con quién lo hizo, cuándo, y el antes→después. Sale de la
   bitácora inmutable `auditoria_financiera` (la escribe un trigger; nadie la
   edita). Aquí solo se lee y se ordena para que sea legible. */

type Fila = {
  id: string; tabla: string; fila_id: string | null; accion: string;
  creado_en: string; campos: string[] | null;
  antes: any; despues: any; actor: string;
};

const ACCION: Record<string, { ico: string; txt: string; col: string }> = {
  insert: { ico: "➕", txt: "registró", col: "var(--green)" },
  update: { ico: "✏️", txt: "editó", col: "var(--yellow)" },
  delete: { ico: "🗑", txt: "borró", col: "var(--red)" },
};
const TABLA: Record<string, string> = {
  rhe: "RHE", estado_cuenta: "estado de cuenta", movimiento_banco: "movimiento",
};
const MONETARIOS = new Set(["monto", "saldo", "intereses", "retencion"]);
// Campos de ruido: no aportan a una auditoría de plata.
const OCULTOS = new Set(["id", "creado_en", "creado_por", "postulacion_id"]);

const num = (v: any) => Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtVal = (campo: string, v: any) => {
  if (v === null || v === undefined || v === "") return "—";
  if (MONETARIOS.has(campo) && !isNaN(Number(v))) return "S/ " + num(v);
  if (Array.isArray(v)) return `${v.length} elemento(s)`;
  if (typeof v === "object") return "…";
  const s = String(v);
  return s.length > 44 ? s.slice(0, 44) + "…" : s;
};
const fechaHora = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("es-PE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Un rótulo para saber DE QUÉ fila se habla, sin abrir nada.
const resumenFila = (f: Fila) => {
  const r = f.despues || f.antes || {};
  if (f.tabla === "movimiento_banco") return `${r.glosa || "movimiento"}${r.monto != null ? ` · S/ ${num(r.monto)}` : ""}`;
  if (f.tabla === "rhe") return `RHE${r.numero ? ` ${r.numero}` : ""}${r.monto != null ? ` · S/ ${num(r.monto)}` : ""}`;
  if (f.tabla === "estado_cuenta") return `${(r.periodo || "").slice(0, 7)}${r.saldo != null ? ` · saldo S/ ${num(r.saldo)}` : ""}`;
  return TABLA[f.tabla] || f.tabla;
};

export default function AuditoriaFondo({ filas }: { filas: Fila[] }) {
  const [verTodo, setVerTodo] = useState(false);
  if (!filas.length) {
    return <div className="empty" style={{ margin: 0 }}>Sin cambios registrados todavía. Cada edición futura quedará aquí, con su antes → después.</div>;
  }
  const muestra = verTodo ? filas : filas.slice(0, 12);

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {muestra.map(f => {
          const a = ACCION[f.accion] || { ico: "•", txt: f.accion, col: "var(--dim)" };
          // En un update, solo los campos que de verdad cambiaron y que no son ruido.
          const campos = (f.campos || []).filter(c => !OCULTOS.has(c));
          return (
            <div key={f.id} style={{ borderLeft: `2px solid ${a.col}`, paddingLeft: 10 }}>
              <div style={{ fontSize: 12.5 }}>
                <span style={{ color: a.col, fontWeight: 700 }}>{a.ico} {a.txt}</span>
                {" "}<span style={{ color: "var(--dim)" }}>{TABLA[f.tabla] || f.tabla}</span>
                {" — "}<b>{resumenFila(f)}</b>
              </div>
              <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 1 }}>
                {f.actor} · {fechaHora(f.creado_en)}
              </div>
              {f.accion === "update" && campos.length > 0 && (
                <div style={{ marginTop: 3, display: "flex", flexDirection: "column", gap: 1 }}>
                  {campos.map(c => (
                    <div key={c} style={{ fontSize: 11.5 }}>
                      <span style={{ color: "var(--dim)" }}>{c}: </span>
                      <span style={{ color: "var(--muted)", textDecoration: "line-through" }}>{fmtVal(c, f.antes?.[c])}</span>
                      <span style={{ color: "var(--dim)" }}> → </span>
                      <b style={{ color: "var(--text)" }}>{fmtVal(c, f.despues?.[c])}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filas.length > 12 && (
        <button className="btn btn-ghost" onClick={() => setVerTodo(v => !v)}
          style={{ fontSize: 11.5, padding: "5px 12px", marginTop: 8 }}>
          {verTodo ? "Ver menos" : `Ver los ${filas.length} cambios`}
        </button>
      )}
    </div>
  );
}
