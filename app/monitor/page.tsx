"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NOMBRE_PANEL } from "@/lib/panel";

/* ══════════════════════════════════════════════════════════════════════════
   EL MONITOR — dos ventanas de trabajo en una pantalla

   Cada panel es la aplicación entera, en vivo, con su propio Realtime. Se abre
   en pantalla ANCHA (escritorio / app); en móvil redirige a «/». La app arranca
   aquí por su `start_url`; para salir se cierra la ventana.

   ── LOS DOS LADOS SON IGUALES, Y ESO ES EL DISEÑO ──
   Nació como «izquierda para navegar, derecha el tablero», con su rótulo cada
   uno. No sobrevive al primer clic: en cuanto entras a un caso desde el
   tablero, ese lado deja de ser el tablero y el rótulo miente. Así que fuera
   los rótulos —dos barras que ocupaban sitio para nombrar algo que cambia— y
   cada panel lleva su ＋, su campanita y su buscador, como cualquier ventana.
   Lo único que queda de aquella idea es POR DÓNDE EMPIEZA cada uno: la portada
   a la izquierda, el tablero a la derecha. Un punto de partida, no una
   etiqueta.

   `name` en el iframe: es la marca que dice «esto es un panel, no una vista
   previa» y sobrevive a las navegaciones de dentro. Ver lib/panel.ts.
   ══════════════════════════════════════════════════════════════════════════ */

/* El `title` describe lo ESTABLE de cada panel —dónde empieza—, no dónde está
   en la pantalla: es lo único que sigue siendo cierto tres clics después, y es
   lo que anuncia un lector de pantalla. */
const PANES = [
  { src: "/", titulo: "Ventana de trabajo 1 · empieza en la portada" },
  { src: "/tablero", titulo: "Ventana de trabajo 2 · empieza en el tablero" },
];

export default function MonitorPage() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (window.innerWidth >= 760) setOk(true);
    else router.replace("/");
  }, [router]);

  if (!ok) return null;

  return (
    <div className="monitor">
      <div className="mon-grid">
        {PANES.map((p, i) => (
          <section key={p.src} className="mon-pane">
            <iframe src={p.src} name={`${NOMBRE_PANEL}-${i}`} className="mon-frame" title={p.titulo} />
            {/* Sacar el panel a su propia ventana —otra pantalla, la TV—
                seguía haciendo falta, pero no una barra entera para él: se
                queda como un tirador en la esquina, apagado hasta que el ratón
                entra en ese lado. */}
            <a href={p.src} target="_blank" rel="noreferrer" className="mon-pop"
              aria-label={`Abrir en una ventana aparte: ${p.titulo}`}
              title="Abrir este panel en una ventana aparte">↗</a>
          </section>
        ))}
      </div>
    </div>
  );
}
