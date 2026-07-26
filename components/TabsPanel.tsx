"use client";
import { useState, type ReactNode } from "react";

/* Pestañas con contador en burbuja.
 *
 * Las etiquetas llegan como texto («📅 Cronograma · 25 · próx. 1 set.») porque
 * así es cómodo armarlas en el servidor. Aquí se parten: el nombre queda como
 * título de la pestaña, el primer número pasa a una burbuja compacta —como el
 * contador de la campanita— y cualquier nota extra (una fecha próxima) va a una
 * pastilla tenue y al tooltip. Sin esto, una etiqueta larga ensanchaba su
 * pestaña y descuadraba toda la fila.
 *
 * La burbuja solo aparece si hay algo que contar (> 0): una pestaña vacía no
 * necesita gritar un cero.
 *
 * `iconoSolo` recorta pestañas a «ícono + número» (sin el nombre) para ahorrar
 * ancho donde el texto se sobreentiende —Historial, típicamente—; el nombre
 * completo sigue en el tooltip.
 *
 * `extra` es un elemento que NO es panel (un enlace externo, la carpeta Drive):
 * se cuela en la fila, antes del botón «⋯ Más».
 *
 * `masUltima` manda la ÚLTIMA pestaña (el Historial) a un menú «⋯ Más», para
 * que la fila no se desborde cuando hay muchas pestañas. */
function parte(label: string) {
  const partes = String(label).split(" · ");
  const nombre = partes[0];
  const resto = partes.slice(1);
  const iNum = resto.findIndex(s => /^\d+$/.test(s.trim()));
  const n = iNum >= 0 ? resto[iNum].trim() : null;
  const nota = resto.filter((_, j) => j !== iNum).join(" · ") || null;
  return { nombre, n, nota };
}

export default function TabsPanel({ labels, paneles, inicial = 0, iconoSolo = [], extra, masUltima = false }: {
  labels: string[]; paneles: ReactNode[]; inicial?: number; iconoSolo?: number[];
  /** Elemento(s) que NO son panel —típicamente un enlace externo, como la
   *  carpeta Drive— y se pintan en la fila de pestañas antes del «⋯ Más». */
  extra?: ReactNode;
  /** Manda la última pestaña (Historial) al menú «⋯ Más». */
  masUltima?: boolean;
}) {
  const [i, setI] = useState(inicial);
  const [masOpen, setMasOpen] = useState(false);
  // Índices que viven en el menú «⋯ Más». Por ahora, solo la última (Historial).
  const enMas = masUltima && labels.length > 1 ? [labels.length - 1] : [];
  const activoEnMas = enMas.includes(i);

  const tabBtn = (k: number) => {
    const { nombre, n, nota } = parte(labels[k]);
    const hay = n != null && Number(n) > 0;
    const solo = iconoSolo.includes(k);
    // En modo ícono-solo se muestra solo el emoji inicial del nombre.
    const emoji = nombre.split(" ")[0];
    return (
      <button key={k} className={`vtab ${i === k ? "on" : ""}`}
        title={nota ? `${nombre} · ${nota}` : nombre} onClick={() => setI(k)}>
        {solo ? emoji : nombre}
        {hay && <span className="vtab-n">{n}</span>}
        {!solo && nota && <span className="vtab-nota">{nota}</span>}
      </button>
    );
  };

  const actNom = parte(labels[i]);
  return (
    <div>
      <div className="vtabs vtabs-nav" style={{ marginBottom: 14 }}>
        {labels.map((_, k) => (enMas.includes(k) ? null : tabBtn(k)))}
        {/* El extra (Drive) va después de las pestañas, antes del «⋯ Más». */}
        {extra}
        {enMas.length > 0 && (
          <div className="vtab-mas-wrap">
            <button className={`vtab vtab-mas ${activoEnMas ? "on" : ""}`}
              title="Más" aria-haspopup="menu" aria-expanded={masOpen}
              onClick={() => setMasOpen(o => !o)}>
              {/* Si hay una pestaña oculta activa, se ve su emoji + contador; si
                  no, los tres puntos VERTICALES (menú de más opciones). */}
              {activoEnMas ? actNom.nombre.split(" ")[0] : "⋮"}
              {activoEnMas && actNom.n && Number(actNom.n) > 0 && <span className="vtab-n">{actNom.n}</span>}
              <span className="vtab-mas-flecha">▾</span>
            </button>
            {masOpen && (
              <>
                {/* Fondo invisible: un clic afuera cierra el menú. */}
                <div className="vtab-mas-bg" onClick={() => setMasOpen(false)} />
                <div className="vtab-mas-menu" role="menu">
                  {enMas.map(k => {
                    const { nombre, n } = parte(labels[k]);
                    const hay = n != null && Number(n) > 0;
                    return (
                      <button key={k} role="menuitem" className={`vtab-mas-item ${i === k ? "on" : ""}`}
                        onClick={() => { setI(k); setMasOpen(false); }}>
                        <span>{nombre}</span>
                        {hay && <span className="vtab-n">{n}</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {paneles.map((p, k) => (
        <div key={k} style={{ display: i === k ? "block" : "none" }}>{p}</div>
      ))}
    </div>
  );
}
