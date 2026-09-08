"use client";
import { useRef, useState } from "react";
import Anclado from "@/components/Anclado";

/* Desplegable propio (reemplaza al <select> nativo, cuyo menú no se puede
   estilizar y muestra un resaltado celeste ajeno a la paleta). Mantiene el
   look de badge/pill del disparador y abre un menú con la identidad del app.

   ── EL MENÚ SE PINTA FUERA DE LA FILA ──
   Vive dentro de tarjetas y de filas, y ahí `absolute` no aguanta: basta un
   `.fila-encima{position:relative;z-index:2}` —que es como este sistema levanta
   lo interactivo por encima del enlace estirado— para encerrarlo. El `z-50`
   del menú pasaba a valer 2 y la tarjeta SIGUIENTE de la lista se le pintaba
   encima; con la tarjeta además apagada, el menú salía translúcido. Lo peor
   era que se escondía solo: el menú se abre con el ratón sobre la tarjeta,
   donde el `:hover` la enciende, y se metía debajo justo al bajar el ratón
   hacia la opción. `Anclado` lo mide y lo cuelga de <body>. El cálculo de si
   va arriba o abajo también se fue allí — aquí se estimaba a 34 px por fila,
   que es adivinar el alto de un texto. */
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const label = etiqueta ?? (options.find(o => o[0] === value)?.[1] || value);

  const toggle = (e: React.MouseEvent) => { e.stopPropagation(); setOpen(o => !o); };

  const estiloCampo: React.CSSProperties = block
    ? { width: "100%", justifyContent: "space-between", background: "var(--bg)",
        border: `1px solid ${error ? "var(--red)" : open ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 9, padding: "10px 12px", fontSize: 14,
        color: value ? "var(--text)" : "var(--dim)", fontWeight: 400,
        textTransform: "none", letterSpacing: 0 }
    : {};

  return (
    /* Sin `position:relative`: el menú ya no cuelga de aquí —lo coloca
       `Anclado` contra la ventana— y dejarlo escrito sugiere un anclaje que no
       existe. El `display` y el `width` sí siguen haciendo falta. */
    <span style={{ display: block ? "flex" : "inline-flex", width: block ? "100%" : undefined,
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
        /* `block` es el desplegable con look de campo de formulario: su menú
           tiene que medir lo que mide el campo, no lo que mida el texto más
           largo. Antes lo conseguía con `left:0;right:0`; ahora se le pide el
           ancho del ancla, que es lo mismo dicho donde se puede medir. */
        <Anclado ancla={btnRef} alCerrar={() => setOpen(false)} ancho={block ? "ancla" : undefined}>
          <div className={`combo-menu${block ? " block" : ""}`}>
            {options.map(o => (
              <button key={o[0]} type="button" className={`combo-item ${o[0] === value ? "on" : ""}`}
                onClick={e => { e.stopPropagation(); setOpen(false); if (o[0] !== value) onSelect(o[0]); }}>
                {o[1]}
              </button>
            ))}
          </div>
        </Anclado>
      )}
    </span>
  );
}
