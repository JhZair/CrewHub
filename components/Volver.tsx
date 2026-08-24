"use client";
import NavIconos from "@/components/NavIconos";
import Link from "@/components/Enlace";

/* El bloque de navegación de toda pantalla interna: el inicio y los accesos a
   las secciones.
   Los íconos viven aquí porque <Volver> ya está en las 19 pantallas: era eso, o
   pegar la misma nav en diecinueve archivos y que se fueran separando con el
   tiempo. Si algún día hay una cabecera de verdad, esto se muda entero.

   ── EL «← VOLVER» SE RETIRÓ ──
   Llevaba el nombre del componente y ya no está. Hacía exactamente lo que hace
   el botón de atrás del navegador, que está siempre a mano, no ocupa sitio en
   la página y todo el mundo sabe usar. Duplicarlo costaba una fila de la
   cabecera en las diecinueve pantallas.
   Se queda el ⬡ del inicio, que sí hace algo que el navegador no: llevar a un
   sitio concreto en un salto, en vez de deshacer la historia paso a paso.

   El nombre del archivo no cambia. Renombrarlo tocaría diecinueve imports para
   ganar exactitud en una palabra, y esa es la clase de cambio que rompe algo en
   la línea veinte que nadie miró. */
export default function Volver() {
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Link href="/" className="btn btn-ghost" title="Ir al inicio"
        style={{ fontWeight: 800, color: "var(--violet)" }}>⬡</Link>
      <NavIconos />
    </span>
  );
}
