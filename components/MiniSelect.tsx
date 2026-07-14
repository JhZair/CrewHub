"use client";
import { useRef, useState } from "react";

/* Desplegable propio (reemplaza al <select> nativo, cuyo menú no se puede
   estilizar y muestra un resaltado celeste ajeno a la paleta). Mantiene el
   look de badge/pill del disparador y abre un menú con la identidad del app. */
export default function MiniSelect({ value, options, onSelect, buttonClass, buttonStyle, block, error }: {
  value: string;
  options: string[][];
  onSelect: (v: string) => void;
  buttonClass?: string;
  buttonStyle?: React.CSSProperties;
  block?: boolean;   // ancho completo, con look de campo de formulario
  error?: boolean;
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

  const estiloCampo: React.CSSProperties = block
    ? { width: "100%", justifyContent: "space-between", background: "var(--bg)",
        border: `1px solid ${error ? "var(--red)" : open ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 9, padding: "9px 12px", fontSize: 13,
        color: value ? "var(--text)" : "var(--dim)", fontWeight: 400,
        textTransform: "none", letterSpacing: 0 }
    : {};

  return (
    <span style={{ position: "relative", display: block ? "flex" : "inline-flex", width: block ? "100%" : undefined,
      ...(block ? { textTransform: "none" as const, letterSpacing: "normal", fontSize: 13 } : {}) }}
      onClick={e => e.stopPropagation()}>
      <button ref={btnRef} className={buttonClass} type="button"
        style={{ ...estiloCampo, ...buttonStyle, cursor: "pointer", 