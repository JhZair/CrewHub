"use client";

/* La barra de navegación temporal: Hoy · ‹ › · ir a una fecha · zoom · rango.
   Vivía dentro de Agenda.tsx y el Gantt del cronograma necesitaba la misma.
   Copiarla habría sido la segunda: dos barras que empiezan idénticas y a los
   tres meses tienen distintos atajos, distinto orden y un bicho arreglado solo
   en una. Es el mismo motivo por el que NotifFila salió de las campanitas.

   Es SOLO presentación: no sabe qué es una ventana ni cómo se mueve. Cada
   pantalla hace su cálculo —la Agenda mira días desde hoy, el Gantt un rango
   con principio y fin— y le pasa qué pintar y a quién avisar. Meter aquí la
   aritmética habría obligado a las dos a compartir también su noción de tiempo,
   que no es la misma. */
export default function NavFechas({
  onHoy, onPrev, onNext, fecha, onFecha, zooms, zoom, onZoom, rango, tituloPrev = "Un mes antes", tituloNext = "Un mes después",
}: {
  onHoy: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Fecha del selector, en ISO (yyyy-mm-dd). */
  fecha: string;
  onFecha: (iso: string) => void;
  zooms: { lbl: string }[];
  zoom: number;
  onZoom: (i: number) => void;
  /** Texto del rango visible, alineado a la derecha. */
  rango?: string;
  tituloPrev?: string;
  tituloNext?: string;
}) {
  return (
    <div className="ag-tl-nav">
      <button className="vtab" onClick={onHoy}>Hoy</button>
      <button className="vtab" title={tituloPrev} onClick={onPrev}>‹</button>
      <button className="vtab" title={tituloNext} onClick={onNext}>›</button>
      <label className="ag-tl-ir" title="Ir a una fecha">
        📅
        <input type="date" value={fecha} onChange={e => onFecha(e.target.value)} />
      </label>
      <span className="ag-tl-zoom">
        {zooms.map((z, i) => (
          <button key={i} className={`vtab ${zoom === i ? "on" : ""}`} onClick={() => onZoom(i)}>{z.lbl}</button>
        ))}
      </span>
      {rango && (
        <span style={{ color: "var(--muted)", fontSize: 10.5, marginLeft: "auto" }}>{rango}</span>
      )}
    </div>
  );
}
