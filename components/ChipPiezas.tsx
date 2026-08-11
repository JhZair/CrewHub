"use client";
import { useState } from "react";
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
 */
export default function ChipPiezas({ piezas, titulo = "Va armado: lleva piezas montadas dentro" }: {
  piezas: PiezaMontada[];
  titulo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  if (!piezas.length) return null;

  return (
    <span className="ens-chip-wrap">
      <button type="button" className="ens-marca ens-marca-btn" title={titulo}
        aria-expanded={abierto}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setAbierto(v => !v); }}>
        🔩 {piezas.length} pieza{piezas.length === 1 ? "" : "s"}
      </button>

      {abierto && (
        <>
          {/* La capa que cierra al pulsar fuera. Sin ella el pop-up se queda
              abierto mientras se marca otra cosa y tapa la fila de abajo. */}
          <span className="ens-tapa" onClick={e => { e.preventDefault(); e.stopPropagation(); setAbierto(false); }} />
          <span className="ens-pop" onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
            <span className="ens-pop-h">
              🔩 Va con {piezas.length} pieza{piezas.length === 1 ? "" : "s"} montada{piezas.length === 1 ? "" : "s"}
              <button type="button" className="ens-pop-x" onClick={() => setAbierto(false)} title="Cerrar">✕</button>
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
