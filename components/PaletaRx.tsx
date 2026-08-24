"use client";
import { useEffect, useRef, useState } from "react";
import { EMOJIS, LABEL } from "@/lib/reacciones";

/* ============================================================
 *  PaletaRx — EL ＋ QUE ABRE LA PALETA
 *
 *  Antes, en el hilo de un comentario y en la vista rápida, los seis emojis
 *  estaban SIEMPRE puestos debajo de cada mensaje, al 55 % de opacidad, y se
 *  encendían al pasar el ratón. Eso no es esconderlos: es dejarlos pegados y
 *  un poco borrosos. Con una reacción ya puesta la fila queda «👍 1 👀 👍 ❤️
 *  🔥 👏 🤔» y no se distingue lo que alguien votó de lo que se puede votar.
 *  Y en un teléfono no hay «pasar el ratón», así que la opacidad se quedaba
 *  a medias para siempre.
 *
 *  El ＋ que ya existía en los chips de siempre resuelve las dos cosas: en
 *  reposo hay un botón, y al abrirlo la paleta se ve entera y con su rótulo.
 *
 *  ── EL ATAJO NO SE PIERDE ──
 *  `rapido` deja fuera un emoji suelto —el 👀— para que el acuse de «lo vi»
 *  siga costando un toque. Es el dato que más se usa y el que más se pierde
 *  si hay que abrir algo para ponerlo: dos toques para decir «visto» es no
 *  decirlo. Se muestra solo mientras nadie lo haya puesto; en cuanto hay uno,
 *  su chip ya está ahí y sumarse es tocarlo.
 *
 *  ── POR QUÉ HAY DOS COLOCACIONES ──
 *  `flotante` (por defecto) la pone encima, sobre el resto: es lo correcto
 *  en una tarjeta del muro, donde nada la recorta.
 *  Dentro de un contenedor que hace scroll —`.vo-cuerpo` y `.vr-coms` tienen
 *  `overflow-y:auto`— un elemento absoluto que sale por arriba se CORTA por
 *  el borde del contenedor, y el comentario más alto de la lista es
 *  justamente el que más se corta. Ahí la paleta va en flujo: ocupa su sitio,
 *  estira la fila y el contenedor hace scroll. Quien decide es quien conoce
 *  su contenedor, o sea el que la usa.
 * ============================================================ */
export default function PaletaRx({
  hayReacciones, ocupado = false, onElegir, titulo, flotante = true, rapido,
}: {
  /** Con reacciones basta un ＋; sin ninguna, el botón tiene que decir de qué
   *  va, porque un botón que hay que descubrir no existe. */
  hayReacciones: boolean;
  ocupado?: boolean;
  onElegir: (emoji: string) => void;
  titulo?: string;
  /** false dentro de un contenedor con overflow: ver arriba. */
  flotante?: boolean;
  /** Emoji de un solo toque, fuera de la paleta. Pásalo solo si aún no tiene
   *  chip propio; si no, saldría dos veces. */
  rapido?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const cajaRef = useRef<HTMLSpanElement | null>(null);

  /* ── ESC CIERRA LA PALETA, NO EL MODAL ──
     Los pop-up que la contienen escuchan Escape en `window` para cerrarse, y
     al cerrarse BORRAN el comentario a medio escribir. Sin esto, abrir la
     paleta y arrepentirse te costaba el borrador. Se escucha en captura y se
     corta ahí mismo: `stopImmediatePropagation` es lo único que frena a otro
     oyente del MISMO nodo (window), que es justo el del modal. */
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setAbierto(false);
    };
    window.addEventListener("keydown", alPulsar, true);
    return () => window.removeEventListener("keydown", alPulsar, true);
  }, [abierto]);

  /* En flujo, abrir AÑADE alto: si el ＋ estaba al final de una lista que ya
     hace scroll, la paleta nace por debajo del pliegue y parece que el botón
     no hizo nada. `block:"nearest"` solo desplaza si de verdad no se ve. */
  useEffect(() => {
    if (abierto && !flotante) cajaRef.current?.scrollIntoView({ block: "nearest" });
  }, [abierto, flotante]);

  // `type="button"`: esto vive junto a cajas de comentario. Un botón sin tipo
  // dentro de un formulario lo ENVÍA, y reaccionar acabaría publicando.
  const elegir = (e: React.MouseEvent, emoji: string) => {
    e.preventDefault(); e.stopPropagation();
    setAbierto(false);
    onElegir(emoji);
  };

  return (
    <span ref={cajaRef} className="rx-pal"
      style={flotante ? { position: "relative", display: "inline-flex", flex: "none" } : undefined}>
      {rapido && (
        <button type="button" className="rx-rapido" disabled={ocupado}
          title={LABEL[rapido] || "Reaccionar"} aria-label={LABEL[rapido] || rapido}
          onClick={e => elegir(e, rapido)}>{rapido}</button>
      )}
      <button type="button" className="rx-mas" disabled={ocupado}
        title={titulo || "Reaccionar"} aria-label={titulo || "Reaccionar"} aria-expanded={abierto}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setAbierto(v => !v); }}>
        {hayReacciones ? "＋" : "☺＋"}
      </button>
      {abierto && (
        <>
          {/* Tocar fuera cierra. También en flujo: sin esto, bajar por una
              lista larga dejaba media docena de paletas abiertas y la primera
              solo se cerraba volviendo a su ＋, ya fuera de pantalla.
              El clic muere aquí: el fondo cubre la pantalla entera y sin
              cortarlo se colaría a la fila o al modal de debajo. */}
          <span className="rx-fondo"
            onClick={e => { e.preventDefault(); e.stopPropagation(); setAbierto(false); }} />
          <span className={flotante ? "rx-paleta" : "rx-paleta rx-paleta-flujo"}>
            {EMOJIS.map(e => (
              <button key={e} type="button" disabled={ocupado}
                title={LABEL[e] || ""} aria-label={LABEL[e] || e}
                onClick={ev => elegir(ev, e)}>{e}</button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}
