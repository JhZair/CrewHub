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
  /** Cuántos meses siguen faltando. NO decide si esto se ve —eso se probó y
   *  salió mal—: solo el TONO con que se ofrece. */
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

  /* ── SE OFRECE SIEMPRE, PERO NO SIEMPRE IGUAL ──
     La primera versión solo lo enseñaba cuando faltaban meses, con el
     argumento de que ahí la pregunta se hace sola. El resultado en pantalla
     fue otro: PO-005 tenía el control y PO-003 no, siendo dos fondos con la
     misma historia —el mismo estímulo, la misma asociación, la cuenta cerrada
     los dos—. Un control que aparece y desaparece según un cálculo que no se
     ve no se lee como criterio: se lee como que el sistema falla, y lo
     siguiente es no fiarse de lo que sí muestra.
     Que la serie esté completa no significa que la cuenta siga abierta. En
     PO-003 la serie la cerró el PLAZO del acta, que es otra cosa: el dato de
     cuándo se cerró la cuenta sigue faltando y sigue siendo verdad.
     Así que se ofrece siempre a administración, y lo que cambia es el tono:
     una pregunta cuando hay papeles en disputa, una línea discreta cuando no. */
  if (!esAdmin) return null;

  if (!abierto) {
    return faltan ? (
      <div className="cierre-cta">
        <span style={{ color: "var(--dim)" }}>
          ¿Ya no existen esos estados porque el banco cerró la cuenta?
        </span>
        <button className="dato-btn" onClick={() => setAbierto(true)}>
          🏦 Registrar el cierre de la cuenta
        </button>
      </div>
    ) : (
      /* Sin nada en disputa, esto es un dato que se carga sin prisa: va en un
         renglón pequeño, sin recuadro, para no competir con la lista. */
      <div style={{ margin: "0 0 8px" }}>
        <button className="dato-btn" style={{ fontSize: 11, color: "var(--dim)" }}
          title="Si el banco ya cerró la cuenta del fondo, regístralo: deja escrito por qué la serie termina donde termina."
          onClick={() => setAbierto(true)}>
          🏦 registrar el cierre de la cuenta
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
