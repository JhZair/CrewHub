"use client";
import { useRef, useState } from "react";

/* Desplegable propio (reemplaza al <select> nativo, cuyo menú no se puede
   estilizar y muestra un resaltado celeste ajeno a la paleta). Mantiene el
   look de badge/pill del disparador y abre un menú con la identidad del app. */
export default function MiniSelect({ value, options, onSelect, buttonClass, buttonStyle }: {
  value: string;
  options: string[][];
  onSelect: (v: string) => void;
  buttonClass?: string;
  buttonStyle?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [arriba, setArriba] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const label = options.find(o => o[0] === value)?.[1] || value;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const alto = Math.min(options.length * 34 + 12, 280); // alto estimado del menú
      // Abre hacia arriba si abajo no cabe pero arriba sí
      setArriba(window.innerHeight - r.bottom < alto && r.top > alto);
    }
    setOpen(o => !o);
  };

  return (
    <span style={{ position: "relative", display: "inline-flex" }} onClick={e => e.stopPropagation()}>
      <button ref={btnRef} className={buttonClass}
        style={{ ...buttonStyle, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
        onClick={toggle}>
        {label} <span style={{ fontSize: 9, opacity: .75 }}>▾</span>
      </button>
      {open && (
        <>
          <span className="rx-fondo" onClick={e => { e.stopPropagation(); setOpen(false); }} />
          <div className={`combo-menu${arriba ? " arriba" : ""}`}>
            {options.map(o => (
              <button key={o[0]} className={`combo-item ${o[0] === value ? "on" : ""}`}
                onClick={e => { e.stopPropagation(); setOpen(false); if (o[0] !== value) onSelect(o[0]); }}>
                {o[1]}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
