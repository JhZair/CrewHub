"use client";
import { useEffect, useState } from "react";
import Portal from "@/components/Portal";

/* Imagen con visor: al hacer clic se abre a tamaño real en una capa
   sobre el caso (lightbox). Clic fuera o Esc para cerrar.

   ── EL VISOR SE CUELGA DE <body> ──
   Es `fixed` a pantalla completa, pero `fixed` no basta: la tarjeta de un caso
   RESUELTO lleva `.card-apagada{opacity:.55;filter:saturate(.75)}`, y ese
   `filter` convierte a la tarjeta en el bloque contenedor de todo `fixed` que
   haya dentro. El visor se encogía a la tarjeta —dejaba de ser una capa sobre
   la pantalla y pasaba a ser un recuadro dentro de una tarjeta— y salía al
   55 %. Lo bonito del fallo es que se escondía solo: la tarjeta se enciende
   con `:hover`, y al abrir el visor el ratón está justo encima. En cuanto lo
   movías para mirar la foto, el visor se apagaba y se recogía.
   El visor no está anclado a nada, así que el portal lo arregla entero. */
export default function Foto({ src, maxHeight = 260 }: { src: string; maxHeight?: number }) {
  const [abierto, setAbierto] = useState(false);

  /* ── ESC CIERRA EL VISOR, NO LO QUE HAY DETRÁS ──
     Una foto se abre a menudo DENTRO de otra cosa que también escucha Escape
     en `window`: la vista rápida de un caso, el hilo de un comentario. Sin
     cortar aquí, un solo Esc cerraba las dos capas — y el modal, al cerrarse,
     se lleva el comentario a medio escribir. Se escucha en CAPTURA y se corta
     ahí mismo: `stopImmediatePropagation` es lo único que frena a otro oyente
     del MISMO nodo, que es justo el del modal. Es el mismo arreglo que ya
     lleva PaletaRx, por lo mismo. */
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setAbierto(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = ""; };
  }, [abierto]);

  return (
    <>
      {/* `lazy`: el muro de la portada puede traer cincuenta fotos entre notas
          y respuestas, y todas se descargaban de golpe al abrir la pantalla —la
          primera de la mañana—. La del visor no lleva `lazy`: cuando se abre,
          se quiere YA. */}
      <img src={src} alt="" onClick={() => setAbierto(true)} loading="lazy" decoding="async"
        style={{ maxHeight, maxWidth: "100%", borderRadius: 10, border: "1px solid var(--border)", cursor: "zoom-in", display: "block" }} />
      {abierto && (
        <Portal>
        <div onClick={() => setAbierto(false)}
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.86)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          <img src={src} alt="" onClick={e => e.stopPropagation()}
            style={{ maxWidth: "96vw", maxHeight: "94vh", borderRadius: 10, boxShadow: "0 12px 48px rgba(0,0,0,.6)", cursor: "default" }} />
          <button onClick={() => setAbierto(false)} title="Cerrar (Esc)"
            style={{ position: "fixed", top: 16, right: 20, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.28)", color: "#fff", borderRadius: 9, width: 36, height: 36, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        </Portal>
      )}
    </>
  );
}
