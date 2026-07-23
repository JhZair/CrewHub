"use client";
import { type RefObject } from "react";

/* BARRA DE FORMATO MÍNIMA — negrita, cursiva, lista.

   Solo esas tres: son las que de verdad se usan para resaltar una idea o
   enumerar. Cada botón envuelve lo seleccionado con la marca de texto que
   `TextoRico` sabe pintar (**…**, _…_, «- »), sin editor rico ni HTML: lo que
   se guarda sigue siendo texto plano.

   Trabaja sobre el mismo textarea que ya existe —recibe su ref y el setter—,
   así no cambia nada de cómo se envía o guarda; solo mete caracteres, como si
   los tecleara el usuario. */
export default function BarraFormato({ areaRef, valor, setValor }: {
  areaRef: RefObject<HTMLTextAreaElement>;
  valor: string;
  setValor: (s: string) => void;
}) {
  const envolver = (marca: string) => {
    const el = areaRef.current;
    if (!el) return;
    const ini = el.selectionStart, fin = el.selectionEnd;
    const sel = valor.slice(ini, fin) || "texto";
    const nuevo = valor.slice(0, ini) + marca + sel + marca + valor.slice(fin);
    setValor(nuevo);
    // Deja seleccionado el texto para poder seguir escribiendo o encadenar.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length + sel.length);
    });
  };

  const lista = () => {
    const el = areaRef.current;
    if (!el) return;
    const ini = el.selectionStart, fin = el.selectionEnd;
    /* Prefija «- » a cada línea de la selección; si no hay selección, a la
       línea actual. Una lista es de líneas, no de un trozo suelto. */
    const desde = valor.lastIndexOf("\n", ini - 1) + 1;
    const hasta = valor.indexOf("\n", fin);
    const corte = hasta === -1 ? valor.length : hasta;
    const bloque = valor.slice(desde, corte)
      .split("\n").map(l => (l.startsWith("- ") ? l : "- " + l)).join("\n");
    const nuevo = valor.slice(0, desde) + bloque + valor.slice(corte);
    setValor(nuevo);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(desde, desde + bloque.length); });
  };

  return (
    <div className="fmt-bar" onMouseDown={e => e.preventDefault()}>
      <button type="button" title="Negrita (**texto**)" onClick={() => envolver("**")}><b>B</b></button>
      <button type="button" title="Cursiva (_texto_)" onClick={() => envolver("_")}><i>I</i></button>
      <button type="button" title="Lista" onClick={lista}>☰</button>
    </div>
  );
}
