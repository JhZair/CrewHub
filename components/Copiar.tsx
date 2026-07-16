"use client";
import { useState } from "react";

/* Copiar un dato sin perder un dígito por el camino.
 *
 * Nace de un problema real: al pasar un RUC a mano a un formulario de DAFO se
 * va un dígito, y un RUC con un dígito de menos no falla — valida como otro
 * RUC, o como ninguno, y el error aparece semanas después cuando ya no se
 * sabe de dónde vino.
 *
 * Tres decisiones, y las tres son por Wilfredo:
 *
 * 1. SE VE SIEMPRE. Lo normal sería que el botón aparezca al pasar el cursor.
 *    Un botón que hay que descubrir no existe para quien no sabe que está.
 *
 * 2. TODO EL VALOR ES EL BOTÓN. No un ícono de 12 px al que hay que apuntar:
 *    si el problema es la precisión al copiar, la solución no puede pedir
 *    precisión para copiar.
 *
 * 3. LO COPIADO NO ES LO QUE SE LEE. La pantalla dice «⚠ 15 oct. 2025 —
 *    venció hace 3 d» porque eso es lo útil de mirar; pegar eso en un
 *    formulario es pegar basura. Se copia el hecho pelado, y el tooltip
 *    muestra exactamente qué va a caer en el portapapeles — sin sorpresas.
 */
export default function Copiar({ valor, children, etiqueta }: {
  valor: string;                    // lo que se copia, tal cual
  children?: React.ReactNode;       // lo que se ve (puede venir formateado)
  etiqueta?: string;                // "RUC", "Domicilio fiscal"… para el aviso
}) {
  const [copiado, setCopiado] = useState(false);
  const [falló, setFalló] = useState(false);
  const v = String(valor ?? "").trim();
  if (!v) return <>{children}</>;

  const copiar = async (e: React.MouseEvent) => {
    /* Vive dentro de filas que son un <Link> entero: sin esto, copiar te
       lleva a otra página. */
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(v);
      setCopiado(true); setFalló(false);
      setTimeout(() => setCopiado(false), 4000);
    } catch {
      /* El portapapeles se puede negar (permisos, contexto no seguro). No se
         calla: se selecciona el texto para que quede un Ctrl+C de distancia.
         Fallar en silencio aquí sería lo peor — creería que copió y pegaría
         lo que tenía antes. */
      try {
        const r = document.createRange();
        r.selectNodeContents(e.currentTarget as HTMLElement);
        const sel = window.getSelection();
        sel?.removeAllRanges(); sel?.addRange(r);
      } catch {}
      setFalló(true);
      setTimeout(() => setFalló(false), 6000);
    }
  };

  return (
    <span
      onClick={copiar}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") copiar(e as any); }}
      title={falló ? "No pude copiar solo — ya te lo dejé seleccionado, haz Ctrl+C"
        : `Clic para copiar${etiqueta ? ` ${etiqueta}` : ""}:\n${v}`}
      className={`copiable${copiado ? " copiado" : ""}`}
    >
      {children ?? v}
      <span className="copiable-ico" aria-hidden>
        {copiado ? "✔" : falló ? "⌨" : "⧉"}
      </span>
      {copiado && <span className="copiable-ok">copiado</span>}
      {falló && <span className="copiable-ok" style={{ color: "var(--yellow)" }}>usa Ctrl+C</span>}
    </span>
  );
}
