"use client";
import { useState } from "react";
import VisorFotos, { type FotoVista } from "@/components/VisorFotos";
import { fotosDeEntidad } from "@/app/actions";

/* «📷 3», y al pulsarlo CUÁLES.
 *
 * Desde el listado del inventario, las fotos de un equipo estaban a una ficha
 * de distancia: buscas «maleta», te salen ocho, y para ver cuál es cuál hay
 * que abrir ocho fichas y volver ocho veces — perdiendo el filtro cada vez.
 * La miniatura de la fila no basta: es la misma foto de 40 px que ya no
 * distingue dos maletines negros.
 *
 * ── EL NÚMERO VIAJA, LAS FOTOS NO ──
 * La fila sabe cuántas tiene —una cifra, que es barata— y pide las URLs al
 * pulsar. Mandarlas todas serían doscientos kilobytes de direcciones en una
 * lista de quinientas filas para algo que casi nadie llega a abrir. Es el
 * mismo criterio de `VinculosEditor` con sus catálogos.
 *
 * ── VIVE DENTRO DE UNA FILA QUE ES UN ENLACE ──
 * Por eso el clic se corta aquí: sin `preventDefault` + `stopPropagation`,
 * pulsar el chip abriría además la ficha del equipo, que es exactamente el
 * viaje que este chip existe para ahorrar.
 */
export default function ChipFotos({ tipo, id, n }: {
  tipo: string; id: string;
  /** Cuántas tiene. Si es 0 no se pinta: un chip que abre una galería vacía
   *  es peor que ningún chip. */
  n: number;
}) {
  const [fotos, setFotos] = useState<FotoVista[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!n) return null;

  const abrir = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (cargando) return;
    /* Ya cargadas: se reabren sin volver a pedirlas. Mirar dos maletines y
       volver al primero no puede costar dos viajes. */
    if (fotos) { setFotos([...fotos]); return; }
    setCargando(true); setErr(null);
    const r: any = await fotosDeEntidad(tipo, id);
    setCargando(false);
    if (r?.error) { setErr(r.error); return; }
    /* Puede volver vacío si alguien las quitó desde otra pestaña. Se dice, en
       vez de abrir un visor negro. */
    if (!r.fotos?.length) { setErr("Ya no tiene fotos."); return; }
    setFotos(r.fotos.map((f: any) => ({ url: f.url, pie: f.pie })));
  };

  return (
    <>
      <button type="button" className="ens-marca ens-marca-btn chip-fotos"
        title={`Ver las ${n} foto${n === 1 ? "" : "s"} de este equipo`}
        onClick={abrir}>
        📷 {cargando ? "…" : n}
      </button>
      {/* El fallo se dice EN la fila, no en un aviso lejano: quien pulsó está
          mirando aquí. */}
      {err && (
        <span className="chip-fotos-err" title={err}
          onClick={e => { e.preventDefault(); e.stopPropagation(); setErr(null); }}>
          ⚠ {err}
        </span>
      )}
      {fotos && <VisorFotos fotos={fotos} alCerrar={() => setFotos(null)} />}
    </>
  );
}
