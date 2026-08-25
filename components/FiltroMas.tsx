"use client";
import Link from "@/components/Enlace";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* Desplegable "⋯ Más" para los filtros menos usados del feed, para que la fila
   principal quepa en UNA línea. */
export default function FiltroMas({ v, items }: {
  v: string; items: { val: string; label: string; n: number }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const actual = items.find(i => i.val === v);
  const total = items.reduce((s, i) => s + i.n, 0);

  /* ── EL MENÚ SE DIBUJA FUERA DE LA FILA ──
     La fila de pestañas es `overflow-x:auto` (para poder arrastrarla en un
     teléfono), y un contenedor con overflow RECORTA a sus hijos absolutos
     también por abajo: el menú se abría y no se veía nada. Parecía un
     desplegable roto y era la fila haciendo su trabajo.
     Con un portal el menú vive en `body` y se coloca en coordenadas de
     pantalla, tomadas del botón en el momento de abrir. */
  useEffect(() => {
    if (!abierto) return;
    const colocar = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };
    colocar();
    /* Si la página se mueve debajo, el menú se cierra en vez de perseguirla:
       un desplegable que flota lejos de su botón confunde más que uno que se
       cierra solo. */
    const cerrar = () => setAbierto(false);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  return (
    <>
      <button ref={btnRef} className={`vtab ${actual ? "on" : ""}`}
        aria-expanded={abierto} onClick={() => setAbierto(a => !a)}>
        {actual ? actual.label : "⋯ Más"} <span className="vtab-n">{actual ? actual.n : total}</span> ▾
      </button>
      {abierto && pos && typeof document !== "undefined" && createPortal(
        <>
          <span className="rx-fondo" onClick={() => setAbierto(false)} />
          <div className="filtro-mas-menu" style={{ top: pos.top, right: pos.right }}>
            {items.map(i => (
              <Link key={i.val} href={i.val === "mios" ? "/" : `/?v=${i.val}`}
                onClick={() => setAbierto(false)}
                className={`filtro-mas-item ${i.val === v ? "on" : ""}`}>
                <span>{i.label}</span><span className="vtab-n">{i.n}</span>
              </Link>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
