"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* Acceso rápido global al buscador: botón flotante 🔍 que abre una caja de
   búsqueda ahí mismo; Enter (o →) manda la consulta a /buscar. Atajo Ctrl/⌘+K.
   Oculto en el feed (que ya tiene su caja), en /buscar, login e iframes. */
export default function BuscadorFlotante() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [esTop, setEsTop] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const oculto = pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/buscar");

  useEffect(() => { setEsTop(window.self === window.top); }, []);

  useEffect(() => {
    if (oculto || !esTop) return;
    const atajo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setAbierto(true); }
    };
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, [oculto, esTop]);

  useEffect(() => { if (abierto) inputRef.current?.focus(); }, [abierto]);

  if (oculto || !esTop) return null;

  /* Este componente vive en el layout: no se desmonta al navegar, así que
     su estado sobrevive a todo. Si no vaciamos la caja al cerrarla, la
     próxima vez que la abras te recibe con la búsqueda de hace media hora. */
  const cerrar = () => { setAbierto(false); setQ(""); };

  const buscar = () => {
    const t = q.trim();
    if (!t) return;
    cerrar();
    router.push(`/buscar?q=${encodeURIComponent(t)}`);
  };

  return (
    <>
      {abierto && <div className="bf-fondo" onClick={cerrar} />}
      <div className="buscar-flot-wrap">
        {abierto && (
          <div className="bf-caja">
            <span style={{ color: "var(--dim)" }}>🔍</span>
            <input ref={inputRef} value={q} placeholder="Buscar en todo…"
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") buscar(); if (e.key === "Escape") cerrar(); }} />
            <button className="btn" style={{ padding: "5px 11px", fontSize: 13 }} onClick={buscar} disabled={!q.trim()}>→</button>
          </div>
        )}
        <button className="buscar-flot" title="Buscar (Ctrl K)"
          onClick={() => (abierto ? cerrar() : setAbierto(true))}>🔍</button>
      </div>
    </>
  );
}
