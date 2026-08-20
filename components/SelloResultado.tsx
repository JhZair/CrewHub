"use client";
import { useState } from "react";

/* SELLO DE VEREDICTO — cuando un concurso terminó, el resultado se estampa
   grande sobre el bloque (la cancha o el carné). Es una capa que no captura
   clics (los enlaces de debajo siguen vivos), salvo su propia «✕» para
   cerrarlo y ver lo que tapa. Al recargar vuelve a aparecer: es el estado
   del concurso, no una notificación que se descarta para siempre. */
export default function SelloResultado({ titulo, sub, ico, tono, variante }: {
  titulo: string; sub: string; ico: string; tono: string;
  /** «cancha» (sobre el trío), «carne» (portada de la ficha), «fila» (una fila
   *  de la lista de participantes) o «ficha» (la tarjeta de datos de un caso).
   *  Solo cambia el tamaño del sello. */
  variante?: "cancha" | "carne" | "fila" | "ficha";
}) {
  const [cerrado, setCerrado] = useState(false);
  if (cerrado) return null;
  /* Un `Record` y no una escalera de ternarios: con cuatro variantes la
     escalera ya obligaba a leerla entera para saber qué hace la última, y la
     quinta se añade aquí sin tocar nada más. */
  const claseVar = ({ carne: "sr-carne", fila: "sr-fila", ficha: "sr-ficha" } as Record<string, string>)[variante || ""] || "";
  return (
    <div className={`post-resultado tono-${tono} ${claseVar}`}
      aria-label={`Resultado: ${titulo}`}>
      <button type="button" className="sr-x" title="Cerrar el sello" onClick={() => setCerrado(true)}>✕</button>
      <div className="pr-sello">
        <span className="pr-ico">{ico}</span>
        <span className="pr-tit">{titulo}</span>
        <span className="pr-sub">{sub}</span>
      </div>
    </div>
  );
}
