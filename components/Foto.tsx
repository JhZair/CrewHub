"use client";
import { useEffect, useState } from "react";

/* Imagen con visor: al hacer clic se abre a tamaño real en una capa
   sobre el caso (lightbox). Clic fuera o Esc para cerrar. */
export default function Foto({ src, maxHeight = 260 }: { src: string; maxHeight?: number }) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
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
        <div onClick={() => setAbierto(false)}
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.86)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          <img src={src} alt="" onClick={e => e.stopPropagation()}
            style={{ maxWidth: "96vw", maxHeight: "94vh", borderRadius: 10, boxShadow: "0 12px 48px rgba(0,0,0,.6)", cursor: "default" }} />
          <button onClick={() => setAbierto(false)} title="Cerrar (Esc)"
            style={{ position: "fixed", top: 16, right: 20, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.28)", color: "#fff", borderRadius: 9, width: 36, height: 36, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
      )}
    </>
  );
}
