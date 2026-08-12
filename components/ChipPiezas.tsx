"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { txtEstadoEq, colorEstadoEq } from "@/lib/estadosEquipo";

export type PiezaMontada = {
  id: string; folio?: string | null; nombre: string;
  cartel?: string | null; estado?: string | null;
};

/* «🔩 3 piezas», y al pulsarlo QUÉ tres.
 *
 * El número solo avisa; la lista es lo que se usa. Al recibir de vuelta un
 * monopod hay que contar contra algo, y ese algo son tres nombres con su
 * foto — no un número que obliga a abrir la ficha en otra pestaña justo
 * cuando tienes el equipo en la mano y a alguien esperando.
 *
 * Las piezas viajan con la fila y no se piden al pulsar: un ensamblado tiene
 * tres o diez, no doscientas, y la página ya las tiene en memoria. Cargarlas
 * al abrir sería una espera de red para enseñar algo que ya estaba aquí.
 *
 * El pop-up NO es un enlace a ningún sitio: se abre encima y se cierra. Ir a
 * la ficha del ensamblado desde la pantalla de entrega es perder lo que ya
 * llevabas marcado.
 *
 * ── POR QUÉ VA EN `position: fixed` Y NO `absolute` ──
 * Las listas que lo contienen tienen `overflow-y: auto` para poder desplazarse.
 * Un hijo `absolute` de un contenedor con overflow SE RECORTA por sus bordes:
 * el pop-up salía cortado por abajo, enseñando el título y ninguna pieza —o
 * sea, justo lo contrario de para lo que existe—. `fixed` se posiciona contra
 * la ventana y ningún overflow lo corta, pero entonces hay que decirle dónde:
 * se mide el botón al abrir y se coloca debajo, corrigiendo si se saldría por
 * el borde derecho o por abajo.
 * Se cierra al hacer scroll en vez de perseguir al botón: un pop-up que sigue
 * a su fila mientras la lista se mueve es peor que uno que se va. Y el cierre
 * escucha el scroll de TODA la página en captura, no la rueda sobre una capa:
 * con el puntero encima del propio pop-up la rueda no llegaba a esa capa, así
 * que el pop-up se quedaba clavado en pantalla mientras la lista se movía
 * debajo — apuntando a una fila que ya no estaba ahí.
 *
 * ── Y NUNCA MÁS ALTO QUE LA VENTANA ──
 * Nueve baterías no caben en un portátil. Se elige el lado con más sitio, se
 * limita el alto a lo que hay y la lista se desplaza por dentro. Antes se
 * estimaban 40 px por fila cuando cada una mide 68 —la miniatura sola son
 * 60—, así que «cabe debajo» daba que sí para algo que sobresalía media
 * pantalla: salía cortado por el borde inferior y las últimas piezas no
 * existían para quien miraba. El alto se CALCULA mal por definición (depende
 * de la fuente y del zoom); por eso el tope no depende de que la cuenta salga
 * bien: aunque sobre o falte, la lista se desplaza y todas las piezas se
 * alcanzan.
 */
export default function ChipPiezas({ piezas, titulo = "Va armado: lleva piezas montadas dentro" }: {
  piezas: PiezaMontada[];
  titulo?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; alto: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const abierto = !!pos;

  /* Cerrar al mover la página o cambiar su tamaño: el pop-up está anclado a
     una coordenada de PANTALLA, y en cuanto algo se mueve esa coordenada deja
     de ser la del botón. `capture` porque el scroll de un contenedor interno
     no burbujea hasta window. Y Escape, que es lo que uno pulsa. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = () => setPos(null);
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") setPos(null); };
    window.addEventListener("scroll", fuera, true);
    window.addEventListener("resize", fuera);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("scroll", fuera, true);
      window.removeEventListener("resize", fuera);
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  if (!piezas.length) return null;

  const ANCHO = 300;
  const MARGEN = 12;
  /* 68 px por fila —la miniatura son 60 más su relleno— y 34 de cabecera.
     Es una ESTIMACIÓN para decidir de qué lado abrir; el que la lista quepa
     no depende de que acierte. */
  const necesita = 34 + piezas.length * 68;

  function abrir() {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    /* Alineado por la DERECHA del botón, que es donde suele estar el borde de
       la lista; y si aun así se saldría, se empuja hacia dentro. */
    const left = Math.max(8, Math.min(r.right - ANCHO, window.innerWidth - ANCHO - 8));
    const debajo = window.innerHeight - r.bottom - MARGEN;
    const encima = r.top - MARGEN;
    if (necesita <= debajo) return setPos({ top: r.bottom + 5, left, alto: necesita });
    if (necesita <= encima) return setPos({ top: r.top - necesita - 5, left, alto: necesita });
    /* No cabe entero por ningún lado: se usa el lado más grande y la lista se
       desplaza por dentro. Recortar en silencio sería peor —las piezas que
       faltan no se echan en falta hasta el rodaje. */
    if (debajo >= encima) return setPos({ top: r.bottom + 5, left, alto: debajo });
    setPos({ top: MARGEN, left, alto: encima });
  }

  return (
    <span className="ens-chip-wrap">
      <button type="button" ref={btn} className="ens-marca ens-marca-btn" title={titulo}
        aria-expanded={abierto}
        onClick={e => { e.preventDefault(); e.stopPropagation(); abierto ? setPos(null) : abrir(); }}>
        🔩 {piezas.length} pieza{piezas.length === 1 ? "" : "s"}
      </button>

      {abierto && (
        <>
          {/* La capa que cierra al pulsar fuera —y al hacer scroll, porque el
              pop-up está anclado a una posición de pantalla que deja de ser la
              del botón en cuanto la lista se mueve. */}
          <span className="ens-tapa"
            onClick={e => { e.preventDefault(); e.stopPropagation(); setPos(null); }} />
          <span className="ens-pop"
            style={{ top: pos!.top, left: pos!.left, width: ANCHO, maxHeight: pos!.alto }}
            onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
            {/* La cabecera NO se desplaza: es donde está la ✕, y con nueve
                piezas desplazadas hacia abajo el botón de cerrar se iba de la
                vista justo cuando hace falta. */}
            <span className="ens-pop-h">
              🔩 Va con {piezas.length} pieza{piezas.length === 1 ? "" : "s"} montada{piezas.length === 1 ? "" : "s"}
              <button type="button" className="ens-pop-x" onClick={() => setPos(null)} title="Cerrar">✕</button>
            </span>
            <span className="ens-pop-lista">
            {piezas.map(p => (
              <Link key={p.id} href={`/entidad/equipamiento/${p.id}`} className="ens-pop-fila">
                <span className="kit-pz-img">
                  {p.cartel
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.cartel} alt="" referrerPolicy="no-referrer" />
                    : <span>🎥</span>}
                </span>
                {p.folio && <span className="kit-pz-folio">{p.folio}</span>}
                <span className="ens-pop-n">{p.nombre}</span>
                {/* El estado solo cuando NO es «ensamblado»: dentro de su
                    ensamblado eso es lo normal y decirlo en cada fila es
                    repetir el título del pop-up tres veces. Lo que sí importa
                    es la pieza que está rota o no aparece estando montada. */}
                {p.estado && p.estado !== "ensamblado" && (
                  <span style={{ fontSize: 10, color: colorEstadoEq(p.estado), whiteSpace: "nowrap" }}>
                    {txtEstadoEq(p.estado)}
                  </span>
                )}
              </Link>
            ))}
            </span>
          </span>
        </>
      )}
    </span>
  );
}
