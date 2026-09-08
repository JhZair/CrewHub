"use client";
import { useState } from "react";
import VisorFotos from "@/components/VisorFotos";

/* Imagen con visor: al hacer clic se abre a tamaño real en una capa sobre lo
   que haya (lightbox). Clic fuera o Esc para cerrar.

   ── EL VISOR VIVE EN `components/VisorFotos` ──
   Estaba escrito aquí dentro y solo sabía abrir UNA imagen: sin flechas, sin
   contador, sin miniaturas. Al aparecer la galería de un equipo hacía falta
   uno que supiera pasar de una a otra, y tener DOS lightbox distintos en la
   misma aplicación es cómo se acaba con dos que se cierran de forma distinta,
   uno que respeta el Escape de la capa de detrás y otro que no.
   Así que el visor se fue a su fichero y aquí queda lo que este componente
   siempre fue: una miniatura que lo abre. Con una sola foto no se pinta ni la
   flecha ni el contador ni la tira, así que los ocho sitios que ya usan `Foto`
   no cambian ni de API ni de aspecto.

   Lo que sí se hereda de allí, y conviene no perder de vista: el visor se
   cuelga de <body> con un portal —`fixed` no basta cuando un antepasado tiene
   `filter`, que lo convierte en su bloque contenedor— y su Escape se corta en
   captura, para no cerrar además el modal que hubiera debajo llevándose el
   comentario a medio escribir. Está contado en VisorFotos. */
export default function Foto({ src, alt, maxHeight = 260 }: {
  src: string;
  /** Qué se ve, para quien no ve la imagen. Sin esto el lector de pantalla
   *  anuncia «imagen» y nada más. */
  alt?: string;
  maxHeight?: number;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {/* `lazy`: el muro de la portada puede traer cincuenta fotos entre notas
          y respuestas, y todas se descargaban de golpe al abrir la pantalla —la
          primera de la mañana—. La del visor no lleva `lazy`: cuando se abre,
          se quiere YA. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt || ""} onClick={() => setAbierto(true)} loading="lazy" decoding="async"
        style={{ maxHeight, maxWidth: "100%", borderRadius: 10, border: "1px solid var(--border)", cursor: "zoom-in", display: "block" }} />
      {abierto && (
        <VisorFotos fotos={[{ url: src, pie: alt || null }]} alCerrar={() => setAbierto(false)} />
      )}
    </>
  );
}
