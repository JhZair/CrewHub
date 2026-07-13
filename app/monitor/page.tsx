"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* ── MONITOR (cockpit) ──────────────────────────────────────────────
   Dos vistas a la vez en una sola ventana: navegación para trabajar +
   Tablero Kanban, cada una en vivo (cada panel es la página real
   embebida, con su propio Realtime).
   Se muestra en pantalla ANCHA (escritorio / app). En móvil o ventanas
   angostas redirige a la vista normal ("/"). La app abre aquí por su
   start_url; para salir se cierra la ventana de la app. */

const PANES = [
  { titulo: "🧭 Navegación", src: "/", nota: "trabaja aquí" },
  { titulo: "🗂 Tablero Kanban", src: "/tablero", nota: "en vivo" },
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
        {PANES.map((p) => (
          <section key={p.src} className="mon-pane">
            <header className="mon-h">
              <span>{p.titulo} <em className="mon-vivo">{p.nota}</em></span>
              <a href={p.src} target="_blank" rel="noreferrer" className="mon-pop"
                title="Abrir en ventana aparte (para otra pantalla o la TV)">abrir ↗</a>
            </header>
            <iframe src={p.src} className="mon-frame" title={p.titulo} />
          </section>
        ))}
      </div>
    </div>
  );
}
