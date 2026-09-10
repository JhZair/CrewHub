"use client";
import { useState, type ReactNode } from "react";
import { Check } from "./Iconos";

/* Checklist marcable. El estado es de la sesión de quien mira: sirve para
   recorrer la lista en rodaje, no para guardar nada. Los nodos llegan ya
   renderizados desde el servidor (lib/wiki/markdown.tsx). */
export default function Checklist({ items }: { items: { hecho: boolean; nodo: ReactNode }[] }) {
  const [marcas, setMarcas] = useState<boolean[]>(() => items.map(i => i.hecho));
  const listos = marcas.filter(Boolean).length;
  return (
    <div className="wk-checklist">
      <p className="wk-muted wk-check-count">{listos} de {items.length} listos</p>
      {items.map((it, i) => (
        <button key={i} type="button" className={`wk-check ${marcas[i] ? "is-done" : ""}`} aria-pressed={marcas[i]}
          onClick={() => setMarcas(m => m.map((v, j) => (j === i ? !v : v)))}>
          <span className="wk-box">{marcas[i] && <Check size={13} strokeWidth={3} />}</span>
          <span className="wk-check-t">{it.nodo}</span>
        </button>
      ))}
    </div>
  );
}
