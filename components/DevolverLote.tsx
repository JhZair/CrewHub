"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { devolverEquipos } from "@/app/actions";

/* CERRAR N PRÉSTAMOS DE UNA VEZ — el reverso de la entrega en lote.
 * Si entregar de a uno no se hacía, devolver de a uno tampoco: el inventario
 * se quedaba diciendo «en uso» semanas después de que la camioneta volvió.
 * Confirma antes, porque cerrar un préstamo por error borra la fecha real de
 * salida de todo un rodaje.
 *
 * Nació atado a UNA persona («¿Michel devolvió los 7?»). Ya no: quien recibe
 * está en la puerta recibiendo de todos a la vez, así que el lote lo decide
 * quien llama —una persona entera, o lo que se haya marcado a mano— y el
 * rótulo y la pregunta vienen con él. Lo que este componente sabe hacer
 * sigue siendo una sola cosa: cerrar estos ids, preguntando primero. */
export default function DevolverLote({ prestamoIds, etiqueta, pregunta, min = 2 }: {
  prestamoIds: string[];
  etiqueta?: string;
  pregunta?: string;
  /** Debajo de esto no se ofrece: con uno solo, el ↩ de la fila ya sirve. */
  min?: number;
}) {
  const router = useRouter();
  const [pide, setPide] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = prestamoIds.length;

  async function devolver() {
    setOcupado(true); setErr(null);
    const r: any = await devolverEquipos(prestamoIds);
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    setPide(false);
    router.refresh();
  }

  if (n < min) return null;

  if (!pide) {
    return (
      <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11.5 }}
        onClick={() => setPide(true)}>
        {etiqueta || `Devolver los ${n}`}
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11.5 }}>
      <span style={{ color: "var(--yellow)" }}>{pregunta || `¿Volvieron los ${n}?`}</span>
      <button className="btn" style={{ padding: "3px 10px", fontSize: 11 }}
        disabled={ocupado} onClick={devolver}>{ocupado ? "…" : "Sí"}</button>
      <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}
        onClick={() => { setPide(false); setErr(null); }}>No</button>
      {err && <span style={{ color: "var(--red)" }}>{err}</span>}
    </span>
  );
}
