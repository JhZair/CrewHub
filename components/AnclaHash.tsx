"use client";
import { useEffect } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   LLEGAR A LA FILA CORRECTA, Y QUE SE VEA

   Un aviso sobre un comentario en una factura lleva a
   `/fondo/<id>/financiera#comprobante-<uuid>`. El navegador sabe saltar a un
   ancla él solo — pero solo si el elemento está VISIBLE, y en esta pantalla
   casi nunca lo está: las filas viven dentro de secciones plegadas, y
   «Facturas y boletas» arranca cerrada. Un `display:none` no se salta.

   ── EL FALLO QUE ESTO ARREGLA YA EXISTÍA ──
   `TabsPanel` hacía este trabajo y emitía `plg:abrir` con el ancla de la FILA
   (`comprobante-<uuid>`), mientras que `Plegable` solo reacciona si el detalle
   coincide con SU propia prop `ancla`… que ninguno de los plegables de esta
   ficha recibía. O sea: el evento se emitía, nadie lo escuchaba, y el aviso
   aterrizaba en una fila oculta dentro de una sección cerrada. No daba error
   —el elemento existe en el documento— así que nadie lo notó.

   Aquí se traduce: del prefijo de la fila se deduce QUÉ sección hay que abrir,
   y a esa se le grita. Tres cosas que el navegador no hace solo:
     1. abrir la sección plegada,
     2. bajar con calma (el salto seco no dice de dónde vienes),
     3. y resaltar la fila — sin eso, llegar al comentario correcto en un hilo
        de treinta iguales no se distingue de llegar a otro.

   ⚠ Se escucha también `hashchange`: si el lector YA está en esta pantalla, un
   enlace a la misma ruta con otro hash no remonta nada y React no se entera.
   Sin esto, el aviso de algo que tienes abierto se pulsa y no pasa nada — que
   es justo el caso más frecuente.
   ══════════════════════════════════════════════════════════════════════════ */

export default function AnclaHash({ secciones }: {
  /** prefijo de la fila → las secciones que hay que abrir para verla, DE FUERA
   *  ADENTRO. Son varias porque los plegables anidan: «Facturas y boletas»
   *  vive dentro de «Rendición», y abrir solo la de dentro deja la fila igual
   *  de escondida.
   *  Ej.: `{ comprobante: ["fondo:<id>:rendicion", "fondo:<id>:comprobantes"] }`. */
  secciones: Record<string, string[]>;
}) {
  useEffect(() => {
    const aplica = () => {
      const ancla = decodeURIComponent(String(window.location.hash || "").replace(/^#/, ""));
      if (!ancla) return;
      /* El prefijo es lo que va antes del primer guion: `comprobante-<uuid>`.
         Los uuid llevan guiones, así que se corta por el PRIMERO y no se
         parte por todos. */
      const prefijo = ancla.split("-")[0];
      for (const seccion of secciones[prefijo] || []) {
        window.dispatchEvent(new CustomEvent("plg:abrir", { detail: seccion }));
      }
      /* En el fotograma siguiente: la sección se acaba de abrir en este mismo
         render y su contenido todavía no está en el documento. */
      requestAnimationFrame(() => {
        const el = document.getElementById(ancla);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ancla-hit");
        window.setTimeout(() => el.classList.remove("ancla-hit"), 2600);
      });
    };
    aplica();
    window.addEventListener("hashchange", aplica);
    return () => window.removeEventListener("hashchange", aplica);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(secciones)]);

  return null;
}
