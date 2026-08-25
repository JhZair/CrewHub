"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fijarCierreCuenta } from "@/app/actions";

/* ══════════════════════════════════════════════════════════════════════════
   LA CUENTA DEL FONDO SE CERRÓ

   PO-005 gastó el fondo entero y el banco cerró la cuenta exclusiva. La ficha
   seguía pidiendo cinco estados mensuales, porque la serie solo sabía terminar
   por dos motivos: rendición entregada, o plazo del acta vencido. Este es el
   tercero y el más definitivo — sin cuenta no hay estado que emitir.

   ── POR QUÉ NO SE REGISTRAN ESOS MESES EN CERO ──
   Era la salida rápida. Un estado en cero AFIRMA que el banco reportó saldo
   cero ese mes; lo que pasó es que la cuenta ya no existía. Son hechos
   distintos y el falso es el que queda guardado: dentro de dos años nadie
   sabrá si esos ceros son un dato o un relleno. Y serían cinco filas sin PDF,
   así que la burbuja de comprobantes que faltan subiría a cinco — se cambia un
   aviso correcto por uno falso.

   Aquí se guarda el hecho y la cuenta de meses sale sola.
   ══════════════════════════════════════════════════════════════════════════ */
export default function CierreCuenta({ postulacionId, esAdmin, fecha, faltan }: {
  postulacionId: string;
  esAdmin: boolean;
  fecha: string | null;
  /** Cuántos meses siguen faltando. Solo para decidir si vale la pena ofrecer
   *  esto: sin nada que falte, es un dato que se puede cargar sin prisa. */
  faltan: number;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [val, setVal] = useState(fecha || "");
  const [err, setErr] = useState("");
  const [ocupado, correr] = useTransition();

  const guardar = (f: string) => {
    setErr("");
    correr(async () => {
      const r: any = await fijarCierreCuenta(postulacionId, f);
      if (r?.error) setErr(r.error);
      else { setAbierto(false); router.refresh(); }
    });
  };

  const dmy = (iso: string) => iso.split("-").reverse().join("/");

  /* Ya registrado: se DICE, siempre. Es la explicación de por qué la serie es
     más corta de lo que uno esperaría, y si no está escrita, dentro de un año
     alguien la va a tomar por un fallo de la cuenta y va a «arreglarla». */
  if (fecha && !abierto) {
    return (
      <div className="cierre-cta">
        <span>🏦 La cuenta se cerró el <b>{dmy(fecha)}</b> — desde ahí no hay más estados que pedir.</span>
        {esAdmin && (
          <button className="dato-btn" onClick={() => { setVal(fecha); setAbierto(true); }}>✎</button>
        )}
      </div>
    );
  }

  /* Sin registrar: solo se ofrece a administración, y solo cuando hay meses
     faltando — que es cuando la pregunta «¿y estos papeles?» se hace sola.
     Ofrecerlo siempre sería invitar a cerrar la serie de un fondo en marcha. */
  if (!esAdmin || !faltan) return null;

  if (!abierto) {
    return (
      <div className="cierre-cta">
        <span style={{ color: "var(--dim)" }}>
          ¿Ya no existen esos estados porque el banco cerró la cuenta?
        </span>
        <button className="dato-btn" onClick={() => setAbierto(true)}>
          🏦 Registrar el cierre de la cuenta
        </button>
      </div>
    );
  }

  return (
    <div className="cierre-cta">
      <span>🏦 La cuenta se cerró el</span>
      <input type="date" value={val} onChange={e => setVal(e.target.value)}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "5px 8px", fontSize: 12.5, color: "var(--text)" }} />
      <button className="btn" style={{ fontSize: 12, padding: "5px 12px" }}
        disabled={ocupado || !val} onClick={() => guardar(val)}>
        {ocupado ? "…" : "Guardar"}
      </button>
      <button className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 12px" }}
        disabled={ocupado} onClick={() => { setAbierto(false); setErr(""); }}>Cancelar</button>
      {/* Quitar el dato es tan legítimo como ponerlo —un dedazo en el año deja
          la serie en dos meses— y tiene que poder deshacerse desde el mismo
          sitio, sin buscar dónde. */}
      {fecha && (
        <button className="dato-btn" disabled={ocupado} title="La cuenta sigue abierta: quitar esta fecha"
          onClick={() => guardar("")}>✕ quitar</button>
      )}
      <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
        El mes del cierre sí cuenta: ese estado existe y es el que lo prueba.
      </span>
      {err && <span className="err-inline">⚠ {err}</span>}
    </div>
  );
}
