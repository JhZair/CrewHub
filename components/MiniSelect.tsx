"use client";
import { useRef, useState } from "react";

/* Desplegable propio (reemplaza al <select> nativo, cuyo menú no se puede
   estilizar y muestra un resaltado celeste ajeno a la paleta). Mantiene el
   look de badge/pill del disparador y abre un menú con la identidad del app. */
export default function MiniSelect({ value, options, onSelect, buttonClass, buttonStyle, block, error, etiqueta }: {
  value: string;
  options: string[][];
  onSelect: (v: string) => void;
  buttonClass?: string;
  buttonStyle?: React.CSSProperties;
  block?: boolean;   // ancho completo, con look de campo de formulario
  error?: boolean;
  /** Qué dice el BOTÓN, cuando no es lo mismo que dice el menú. En una lista
   *  de veinte sub-casos el botón necesita «MichelM» y un 👤 cuando está
   *  vacío; el menú, en cambio, necesita nombres que se puedan elegir. Sin
   *  esto habría que meter el ícono dentro de la opción y leerlo en los dos
   *  sitios. Si no se pasa, manda la opción — como siempre. */
  etiqueta?: string;
}) {
  const [open, setOpen] = useState(false);
  const [arriba, setArriba] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const label = etiqueta ?? (options.find(o => o[0] === value)?.[1] || value);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const alto = Math.min(options.length * 34 + 12, 280);
      setArriba(window.innerHeight - r.bottom < alto && r.top > alto);
    }
    setOpen(o => !o);
  };

  const estiloCampo: React.CSSProperties = block
    ? { width: "100%", justifyContent: "space-between", background: "var(--bg)",
        border: `1px solid ${error ? "var(--red)" : open ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 9, padding: "10px 12px", fontSize: 14,
        color: value ? "var(--text)" : "var(--dim)", fontWeight: 400,
        textTransform: "none", letterSpacing: 0 }
    : {};

  return (
    <span style={{ position: "relative", display: block ? "flex" : "inline-flex", width: block ? "100%" : undefined,
      ...(block ? { textTransform: "none" as const, letterSpacing: "normal", fontSize: 14 } : {}) }}
      onClick={e => e.stopPropagation()}>
      <button ref={btnRef} className={buttonClass} type="button"
        /* `buttonStyle` va AL FINAL: es lo que pide quien llama, y quien llama
           manda. Estaba en medio, así que el `gap:5` de aquí abajo ganaba
           siempre y nadie podía apretar el botón — un default que no se deja
           cambiar no es un default, es una imposición. */
        style={{ ...estiloCampo, cursor: "pointer", display: block ? "flex" : "inline-flex", alignItems: "center", gap: 5, ...buttonStyle }}
        onClick={toggle}>
        {label} <span style={{ fontSize: 9, opacity: .75 }}>▾</span>
      </button>
      {open && (
        <>
          <span className="rx-fondo" onClick={e => { e.stopPropagation(); setOpen(false); }} />
          <div className={`combo-menu${arriba ? " arriba" : ""}${block ? " block" : ""}`}>
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
