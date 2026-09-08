"use client";
import { useRef } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   🔍 CAJA DE BUSCAR — LAS TRES PIEZAS, EN UN SOLO SITIO

   `.clx-buscar` no es una caja: es un PATRÓN de tres piezas que solo funciona
   si las tres llevan su clase. `.clx-buscar` es un contenedor flex sin nada
   dentro; `.clx-input` es lo que lleva el `flex:1`, el fondo transparente y
   el borde a cero; `.clx-x` es lo que quita el aspecto de botón a la ✕.

   Estaba escrito tres veces a mano —clearance, «en uso ahora» y asignados— y
   a la tercera salió mal: un `<input>` pelado dentro del contenedor no se
   estira, así que la caja aparecía estrecha con un recuadro dentro, y la ✕
   salía con el estilo de botón de formulario. No fallaba nada; simplemente se
   veía raro, que es la clase de fallo que nadie reporta como fallo.

   Aquí están las tres juntas, con lo que la copia a mano se olvidaba:
   · ESCAPE la vacía. Es lo que uno pulsa al equivocarse escribiendo.
   · La ✕ DEVUELVE EL FOCO al campo. Sin eso, limpiar te deja fuera y hay que
     volver a pulsar dentro para seguir escribiendo.
   · NUNCA `autoFocus`. Estas cajas están a media pantalla y el navegador
     salta hasta ellas al cargar, moviendo lo que se estaba mirando.
   ══════════════════════════════════════════════════════════════════════════ */
export default function CajaBuscar({ valor, alCambiar, placeholder, etiqueta }: {
  valor: string;
  alCambiar: (v: string) => void;
  placeholder: string;
  /** Para quien no ve la caja. El `placeholder` no cuenta como etiqueta. */
  etiqueta: string;
}) {
  const caja = useRef<HTMLInputElement>(null);
  return (
    <div className="clx-buscar" role="search">
      <span className="clx-lupa" aria-hidden="true">🔍</span>
      <input ref={caja} className="clx-input"
        value={valor}
        onChange={e => alCambiar(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") { alCambiar(""); e.currentTarget.blur(); } }}
        placeholder={placeholder}
        aria-label={etiqueta} />
      {!!valor && (
        <button type="button" className="clx-x"
          onClick={() => { alCambiar(""); caja.current?.focus(); }}
          aria-label="Limpiar la búsqueda" title="Limpiar (Esc)">✕</button>
      )}
    </div>
  );
}
