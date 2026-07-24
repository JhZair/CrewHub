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
 * completo sigue en el tooltip. */
function parte(label: string) {
  const partes = String(label).split(" · ");
  const nombre = partes[0];
  const resto = partes.slice(1);
  const iNum = resto.findIndex(s => /^\d+$/.test(s.trim()));
  const n = iNum >= 0 ? resto[iNum].trim() : null;
  const nota = resto.filter((_, j) => j !== iNum).join(" · ") || null;
  return { nombre, n, nota };
}

export default function TabsPanel({ labels, paneles, inicial = 0, iconoSolo = [] }: {
  labels: string[]; paneles: ReactNode[]; inicial?: number; iconoSolo?: number[];
}) {
  const [i, setI] = useState(inicial);
  return (
    <div>
      <div className="vtabs" style={{ marginBottom: 14 }}>
        {labels.map((l, k) => {
          const { nombre, n, nota } = parte(l);
          const hay = n != null && Number(n) > 0;
          const solo = iconoSolo.includes(k);
          // En modo ícono-solo se muestra solo el emoji inicial del nombre.
          const emoji = nombre.split(" ")[0];
          return (
            <button key={k} className={`vtab ${i === k ? "on" : ""}`}
              title={nota ? `${nombre} · ${nota}` : nombre} onClick={() => setI(k)}>
              {solo ? emoji : nombre}
              {hay && <span className="vtab-n">{n}</span>}
              {/* Nota breve (p. ej. «próx. 1 set.»): señal de que hay algo en la
                  agenda, en tenue y sin romper la línea. No se muestra en modo
                  ícono-solo. */}
              {!solo && nota && <span className="vtab-nota">{nota}</span>}
            </button>
          );
        })}
      </div>
      {paneles.map((p, k) => (
        <div key={k} style={{ display: i === k ? "block" : "none" }}>{p}</div>
      ))}
    </div>
  );
}
