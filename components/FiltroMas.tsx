"use client";
import Link from "@/components/Enlace";
import { useState } from "react";

/* Desplegable "⋯ Más" para los filtros menos usados del feed
   (Pagos, Ideas, Archivos), para que la fila principal quepa en una línea. */
export default function FiltroMas({ v, items }: {
  v: string; items: { val: string; label: string; n: number }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const actual = items.find(i => i.val === v);
  const total = items.reduce((s, i) => s + i.n, 0);
  return (
    <span style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }}>
      <button className={`vtab ${actual ? "on" : ""}`} onClick={() => setAbierto(!abierto)}>
        {actual ? actual.label : "⋯ Más"} <span className="vtab-n">{actual ? actual.n : total}</span> ▾
      </button>
      {abierto && (
        <>
          <span className="rx-fondo" onClick={() => setAbierto(false)} />
          <div className="filtro-mas-menu">
            {items.map(i => (
              <Link key={i.val} href={`/?v=${i.val}`} onClick={() => setAbierto(false)}
                className={`filtro-mas-item ${i.val === v ? "on" : ""}`}>
                <span>{i.label}</span><span className="vtab-n">{i.n}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
