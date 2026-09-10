"use client";
import { useEffect, useState } from "react";
import { saltarA } from "./Salto";

/* «En esta página»: el índice de la columna derecha, con el apartado activo
   según el scroll. */
export default function Toc({ entradas }: { entradas: { id: string; label: string }[] }) {
  const [activo, setActivo] = useState(entradas[0]?.id || "");
  useEffect(() => {
    const onScroll = () => {
      let cur = entradas[0]?.id || "";
      for (const { id } of entradas) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 150) cur = id;
      }
      setActivo(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [entradas]);
  if (!entradas.length) return null;
  return (
    <div className="wk-rail-block wk-toc">
      <h3>En esta página</h3>
      {entradas.map(e => (
        <button key={e.id} type="button" className={activo === e.id ? "is-on" : ""} onClick={() => saltarA(e.id, "start")}>{e.label}</button>
      ))}
    </div>
  );
}
