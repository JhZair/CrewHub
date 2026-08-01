"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { devolverEquipos } from "@/app/actions";

/* DEVOLVER TODO LO DE UNA PERSONA — el reverso de la entrega en lote.
 * Si entregar de a uno no se hacía, devolver de a uno tampoco: el inventario
 * se quedaba diciendo «en uso» semanas después de que la camioneta volvió.
 * Confirma antes, porque cerrar un préstamo por error borra la fecha real de
 * salida de todo un rodaje. */
export default function DevolverLote({ prestamoIds, quien }: {
  prestamoIds: string[]; quien: string;
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

  if (n < 2) return null;   // con uno solo, el botón de la fila ya sirve

  if (!pide) {
    return (
      <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11.5 }}
        onClick={() => setPide(true)}>
        Devolver los {n}
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11.5 }}>
      <span style={{ color: "var(--yellow)" }}>¿{quien} devolvió los {n}?</span>
      <button className="btn" style={{ padding: "3px 10px", fontSize: 11 }}
        disabled={ocupado} onClick={devolver}>{ocupado ? "…" : "Sí"}</button>
      <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}
        onClick={() => { setPide(false); setErr(null); }}>No</button>
      {err && <span style={{ color: "var(--red)" }}>{err}</span>}
    </span>
  );
}
