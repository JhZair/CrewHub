"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* `grande` es para /buscar, donde el buscador ES la pantalla. En la barra
   del feed es un accesorio y va angosto: ahí el ancho de 280px tiene sentido
   y aquí lo dejaba encogido en medio de una página vacía. */
export default function BuscadorGlobal({ inicial = "", autoEnfoque = false, grande = false }: {
  inicial?: string; autoEnfoque?: boolean; grande?: boolean;
}) {
  const [q, setQ] = useState(inicial);
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (autoEnfoque) { ref.current?.focus(); ref.current?.select(); }
    const atajo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, [autoEnfoque]);

  const buscar = () => {
    if (q.trim()) router.push(`/buscar?q=${encodeURIComponent(q.trim())}`);
  };
  const limpiar = () => { setQ(""); ref.current?.focus(); };

  return (
    <div className={`buscador-glob${grande ? " grande" : ""}`}>
      <span className="bg-lupa">🔍</span>
      <input ref={ref} value={q}
        placeholder={grande ? "Busca en todo: un nombre, un RUC, «cv investigadora», «renca»…" : "Buscar..."}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") buscar();
          // Escape limpia sin salir del campo: reintentar es lo normal aquí
          if (e.key === "Escape" && q) { e.preventDefault(); limpiar(); }
        }} />
      {/* Borrar sin barrer con la tecla: con «ruc john oros» escrito, volver
          a empezar costaba diecisiete pulsaciones */}
      {q && (
        <button className="bg-x" onClick={limpiar} title="Limpiar (Esc)" aria-label="Limpiar">✕</button>
      )}
      {/* El atajo sobra cuando ya estás escribiendo aquí */}
      {!q && <span className="kbd">Ctrl K</span>}
      {grande && q && (
        <button className="bg-ir" onClick={buscar} title="Buscar (Enter)">Buscar</button>
      )}
    </div>
  );
}
