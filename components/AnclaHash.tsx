"use client";
import { useEffect } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   LLEGAR A LA FILA CORRECTA, Y QUE SE VEA

   Un aviso sobre un comentario en una factura lleva a
   `/fondo/<id>/financiera#comprobante-<uuid>`. El navegador sabe saltar a un
   ancla él solo — pero solo si el elemento está VISIBLE, y en esta pantalla
   casi nunca lo está: las filas viven dentro de secciones plegadas, y varias
   arrancan cerradas. Un elemento dentro de un `hidden` no tiene caja, así que
   `scrollIntoView` sobre él no hace absolutamente nada, y sin dar error.

   ── EL FALLO QUE ESTO ARREGLA YA EXISTÍA, Y EL PRIMER ARREGLO TAMPOCO IBA ──
   `TabsPanel` hacía este trabajo y gritaba `plg:abrir` con el ancla de la
   FILA, mientras que `Plegable` solo reacciona a SU propia prop `ancla` — que
   ninguno de los de esta ficha recibía. El evento salía y no lo escuchaba
   nadie.
   El primer intento de arreglarlo fue un mapa «prefijo de fila → secciones que
   abrir». Dos problemas: se queda desactualizado al primer cambio, y no puede
   nombrar los grupos por persona de la rendición, que son dinámicos. Además
   gritaba en el efecto de montaje, o sea ANTES de que los plegables hubieran
   registrado sus oyentes: otra vez el evento sin nadie escuchando.

   ── LO QUE HACE AHORA: SUBIR POR EL DOM ──
   Encuentra la fila, y desde ella sube abriendo cada sección plegada que se
   encuentre por el camino. No hay mapa que mantener: la respuesta a «¿dentro
   de qué está esto?» la tiene el documento, que es donde no puede
   desactualizarse.

   ⚠ El primer intento va con un `setTimeout(0)` y no directo: los efectos de
   React corren de hijo a padre y por orden de árbol, así que gritar dentro del
   efecto de montaje es gritar antes de que los plegables escuchen. Con la cola
   de tareas de por medio, ya están todos montados.

   ⚠ Y se escucha `hashchange`: si el lector YA está en esta pantalla, un
   enlace a la misma ruta con otro hash no remonta nada y React no se entera.
   ══════════════════════════════════════════════════════════════════════════ */

export default function AnclaHash() {
  useEffect(() => {
    const aplica = () => {
      const ancla = decodeURIComponent(String(window.location.hash || "").replace(/^#/, ""));
      if (!ancla) return;
      const el = document.getElementById(ancla);
      if (!el) return;

      /* Abrir de FUERA ADENTRO: los plegables anidan y abrir el de dentro
         mientras el de fuera sigue cerrado no enseña nada. Se recogen subiendo
         y se despachan al revés. */
      const ids: string[] = [];
      for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) {
        const id = n.getAttribute?.("data-plg");
        if (id) ids.push(id);
      }
      for (const id of ids.reverse()) {
        window.dispatchEvent(new CustomEvent("plg:abrir-id", { detail: id }));
      }

      /* En el fotograma siguiente: las secciones se acaban de abrir en este
         mismo render y el navegador todavía no ha rehecho el layout, así que
         la fila aún no tiene caja a la que desplazarse. */
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        /* Un resalte que se apaga solo. Sin él, llegar al comentario correcto
           en un hilo de treinta iguales no se distingue de llegar a otro. */
        el.classList.add("ancla-hit");
        window.setTimeout(() => el.classList.remove("ancla-hit"), 2600);
      });
    };

    const t = window.setTimeout(aplica, 0);
    window.addEventListener("hashchange", aplica);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", aplica);
    };
  }, []);

  return null;
}
