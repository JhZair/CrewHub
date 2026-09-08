"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/* ══════════════════════════════════════════════════════════════════════════
   🪟 PORTAL — LA CAPA QUE SE CUELGA DE <body>

   Ocho componentes escribían la misma línea a mano (Agenda, DiaContexto,
   HojaEquipos, LinkPreview, VisorArchivo, VistaRapida, VistaHilo, ChipPiezas).
   Aquí está una vez, con el porqué al lado — que es lo que no cabía en cada
   copia y lo que hace falta para saber cuándo usarla.

   ── QUÉ ESCAPA, Y POR QUÉ NO BASTA `position:fixed` ──
   `fixed` esquiva el `overflow` de los contenedores que hacen scroll. NO
   esquiva estas tres cosas del antepasado:

   · `opacity < 1`. Se HEREDA. Un pop-up dentro de una fila apagada al 30 %
     sale al 30 %, y no hay `opacity:1` que lo deshaga desde dentro. Es un
     grupo de composición: se pinta entero y luego se mezcla.
   · `transform`, `filter`, `backdrop-filter`, `perspective`, `contain`,
     `will-change`. Crean BLOQUE CONTENEDOR. Un `inset:0` deja de ser la
     ventana y pasa a ser la caja del antepasado: el telón que cierra al
     pulsar fuera se encoge a la tarjeta, y un modal se centra dentro de ella.
     Ojo: `position:relative` NO hace esto. Solo esa lista.
   · El contexto de apilamiento. Cualquiera de los dos casos anteriores lo
     crea, y entonces el `z-index` deja de competir con la página: la tarjeta
     de más abajo se pinta encima del pop-up.

   Colgado de `<body>` no hereda ninguna de las tres.

   ── LO QUE NO CAMBIA, Y LO QUE SÍ ──
   Los eventos de React siguen burbujeando por el árbol de REACT, no por el
   del DOM: un `onClick` en un antepasado sigue recibiendo los clics de aquí
   dentro, y los `stopPropagation` siguen funcionando igual.
   Lo que deja de llegar es lo NATIVO. Si esta capa vivía dentro de un
   `<label>` o de un `<a>`, su activación —marcar la casilla, navegar— ya no
   se dispara. Suele ser lo que se quería; conviene mirarlo al mover algo aquí
   dentro, porque puede haber un `preventDefault` puesto justo para eso que
   pase de ser imprescindible a ser un cinturón de seguridad.
   Y el foco: la capa pasa al final del documento, así que el Tab desde el
   botón que la abre ya no entra en ella. Hace falta que haya Escape.

   ── CUÁNDO NO USARLO ──
   Si la capa está ANCLADA a algo —un menú `absolute` colgado de su botón—,
   sacarla de ahí la manda a la esquina de la página. Esas hay que medirlas y
   pintarlas con coordenadas de pantalla, como hace `ChipPiezas`. Y ojo: no
   sirve portalizar SOLO el telón de un menú anclado. El telón se iría a la
   raíz por encima de todo y el menú se quedaría dentro del contexto de la
   tarjeta, o sea DEBAJO del telón: dejaría de poder pulsarse. Es todo o nada.

   ── LO QUE SE IMPRIME ──
   `@media print` hace `body > *{display:none}` y solo reenciende `.hoja`.
   Todo lo que viva aquí es hijo de <body>, así que NO sale en el papel. Hoy
   es lo que se quiere —nadie imprime un menú abierto—, pero si alguna vez hay
   que imprimir algo que viva en un portal, hay que darle su propia excepción.
   ══════════════════════════════════════════════════════════════════════════ */
export default function Portal({ children }: { children: React.ReactNode }) {
  /* ⚠ UN INTERRUPTOR DE MONTADO, no un `typeof document !== "undefined"`.
     El servidor no tiene `body` y devolvería nada; el cliente, en su PRIMER
     render, ya tiene `document` y devolvería el portal. Eso es un desajuste
     de hidratación en toda capa que se renderice desde el principio —una hoja
     de impresión, un aviso que nace abierto—, y React reconstruye el árbol
     entero cuando se topa con uno.
     Con el interruptor los dos primeros renders coinciden en «nada» y la capa
     entra en el efecto, que solo corre en el cliente. Cuesta un render de más
     y sirve para todos los casos, no solo para los que se abren con un clic.
     Es lo que `HojaEquipos` ya hacía a mano. */
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  return createPortal(children, document.body);
}
