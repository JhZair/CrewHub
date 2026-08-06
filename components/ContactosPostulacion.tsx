"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Copiar from "@/components/Copiar";
import { agregarDatoPostulacion, editarDato, verificarDato, borrarDato } from "@/app/actions";

/* CONTACTOS DECLARADOS EN LA POSTULACIÓN
 *
 * El formulario de DAFO pide móvil, fijo y hasta dos correos «vinculados a la
 * postulación», y avisa en rojo que mantenerlos habilitados es responsabilidad
 * del postulante. Son datos DEL EXPEDIENTE: en PO-012 el correo 2 es el
 * personal de Wilfredo, que no figura en ninguna credencial de la asociación.
 * Guardarlos como dato de la empresa los daría por comunes a todas sus
 * postulaciones, y no lo son.
 *
 * Una postulación no tiene credenciales de acceso —entrar a la plataforma le
 * toca a la empresa—, así que esto no es un bloque de accesos: es lo que
 * declaramos, con la fecha en que se confirmó por última vez.
 */

const SUG = ["teléfono móvil", "teléfono fijo", "correo electrónico 1", "correo electrónico 2"];
const STALE = 180;
const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px", fontSize: 12.5, outline: "none", color: "var(--text)" } as const;

const dias = (d?: string | null) => {
  const s = String(d ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Math.floor((Date.now() - new Date(s + "T12:00:00").getTime()) / 86400000);
};

export default function ContactosPostulacion({ postulacionId, datos }: {
  postulacionId: string; datos: any[];
}) {
  const router = useRouter();
  const [add, setAdd] = useState(false);
  const [et, setEt] = useState("");
  const [val, setVal] = useState("");
  const [edId, setEdId] = useState<string | null>(null);
  const [edEt, setEdEt] = useState(""); const [edVal, setEdVal] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");

  const correr = async (fn: () => Promise<any>) => {
    if (ocupado) return;
    setOcupado(true); setErr("");
    const r: any = await fn();
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    setAdd(false); setEdId(null); setEt(""); setVal("");
    router.refresh();
  };

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <b style={{ fontSize: 12.5 }}>📇 Contactos declarados</b>
        <span style={{ flex: 1 }} />
        <button className="dato-btn" title="Declarar un contacto" onClick={() => { setAdd(true); setEt(""); setVal(""); }}>＋</button>
      </div>
      <div style={{ color: "var(--dim)", fontSize: 11, marginBottom: 6, lineHeight: 1.45 }}>
        Lo que se puso en el formulario. DAFO avisa que mantenerlos habilitados
        es responsabilidad del postulante — por eso llevan fecha de confirmación.
      </div>

      {datos.length === 0 && !add && (
        <div style={{ color: "var(--dim)", fontSize: 12 }}>
          Nada declarado todavía. Sin esto, si DAFO llama o escribe no sabremos a quién le llegó.
        </div>
      )}

      {datos.map((d: any) => {
        const n = dias(d.verificado_en);
        return (
          <div key={d.id} className="dato-fila">
            {edId === d.id ? (
              <>
                <input value={edEt} onChange={e => setEdEt(e.target.value)} style={{ ...inp, width: 150 }} />
                <input value={edVal} onChange={e => setEdVal(e.target.value)} style={{ ...inp, flex: 1, minWidth: 140 }} />
                <button className="btn" style={{ padding: "5px 11px", fontSize: 11.5 }} disabled={ocupado}
                  onClick={() => correr(() => editarDato(d.id, "postulacion", postulacionId, edEt, edVal))}>Guardar</button>
                <button className="btn btn-ghost" style={{ padding: "5px 9px", fontSize: 11.5 }}
                  onClick={() => setEdId(null)}>Cancelar</button>
              </>
            ) : (
              <>
                <span className="dato-et">{d.etiqueta}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {d.valor ? <Copiar valor={d.valor} etiqueta={d.etiqueta} /> : <i style={{ color: "var(--dim)" }}>—</i>}
                </span>
                {/* Un contacto sin confirmar no está mal, pero tampoco está
                    comprobado: se dice cuál es cuál en vez de pintarlo todo igual. */}
                {n === null
                  ? <span className="badge" style={{ color: "var(--red)", background: "rgba(239,68,68,.12)" }}>sin confirmar</span>
                  : n > STALE
                    ? <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>hace {n} d</span>
                    : <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)" }}>confirmado</span>}
                <button className="dato-btn" title="Confirmar que sigue vigente" disabled={ocupado}
                  onClick={() => correr(() => verificarDato(d.id, "postulacion", postulacionId))}>✔</button>
                <button className="dato-btn" title="Editar" onClick={() => { setEdId(d.id); setEdEt(d.etiqueta || ""); setEdVal(d.valor || ""); }}>✎</button>
                <button className="dato-btn" title="Quitar" disabled={ocupado}
                  onClick={() => correr(() => borrarDato(d.id, "postulacion", postulacionId))}>🗑</button>
              </>
            )}
          </div>
        );
      })}

      {add && (
        <div className="dato-fila">
          <input list="sug-contacto-post" placeholder="Dato (ej. teléfono móvil)" value={et}
            onChange={e => setEt(e.target.value)} style={{ ...inp, width: 160 }} />
          <datalist id="sug-contacto-post">{SUG.map(x => <option key={x} value={x} />)}</datalist>
          <input placeholder="Valor" value={val} onChange={e => setVal(e.target.value)}
            style={{ ...inp, flex: 1, minWidth: 140 }} />
          <button className="btn" style={{ padding: "5px 11px", fontSize: 11.5 }}
            disabled={!et.trim() || ocupado}
            onClick={() => correr(() => agregarDatoPostulacion(postulacionId, et, val))}>Guardar</button>
          <button className="btn btn-ghost" style={{ padding: "5px 9px", fontSize: 11.5 }}
            onClick={() => setAdd(false)}>Cancelar</button>
        </div>
      )}
      {err && <div className="err-inline" style={{ marginTop: 6 }}>⚠ {err}</div>}
    </div>
  );
}
