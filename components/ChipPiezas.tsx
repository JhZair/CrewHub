"use client";
import { useRef, useState } from "react";
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
 * a su fila mientras la lista se mueve es peor que uno que se va.
 */
export default function ChipPiezas({ piezas, titulo = "Va armado: lleva piezas montadas dentro" }: {
  piezas: PiezaMontada[];
  titulo?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const abierto = !!pos;
  if (!piezas.length) return null;

  const ANCHO = 300;
  const alto = 44 + piezas.length * 40;

  function abrir() {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    /* Alineado por la DERECHA del botón, que es donde suele estar el borde de
       la lista; y si aun así se saldría, se empuja hacia dentro. Igual por
       abajo: si no cabe, se abre hacia arriba. */
    const left = Math.max(8, Math.min(r.right - ANCHO, window.innerWidth - ANCHO - 8));
    const cabeDebajo = r.bottom + alto + 8 < window.innerHeight;
    const top = cabeDebajo ? r.bottom + 5 : Math.max(8, r.top - alto - 5);
    setPos({ top, left });
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
            onClick={e => { e.preventDefault(); e.stopPropagation(); setPos(null); }}
            onWheel={() => setPos(null)} />
          <span className="ens-pop" style={{ top: pos!.top, left: pos!.left, width: ANCHO }}
            onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
            <span className="ens-pop-h">
              🔩 Va con {piezas.length} pieza{piezas.length === 1 ? "" : "s"} montada{piezas.length === 1 ? "" : "s"}
              <button type="button" className="ens-pop-x" onClick={() => setPos(null)} title="Cerrar">✕</button>
            </span>
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
        </>
      )}
    </span>
  );
}
