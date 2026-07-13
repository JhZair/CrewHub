"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── MONITOR (cockpit) — SOLO para la app instalada ─────────────────
   Dos vistas a la vez en una sola ventana: navegación para trabajar +
   Tablero Kanban, cada una en vivo (cada panel es la página real
   embebida, con su propio Realtime).
   En navegador web o en móvil NO se muestra: redirige a "/".
   Para previsualizar en desarrollo: localhost o añadir ?force=1. */

const PANES = [
  { titulo: "🧭 Navegación", src: "/", nota: "trabaja aquí" },
  { titulo: "🗂 Tablero Kanban", src: "/tablero", nota: "en vivo" },
];

export default function MonitorPage() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const enApp =
      !window.matchMedia("(display-mode: browser)").matches ||
      (navigator as any).standalone === true;
    const previa =
      window.location.hostname === "localhost" ||
      new URLSearchParams(window.location.search).has("force");
    const ancho = window.innerWidth >= 900;
    if ((enApp || previa) && ancho) setOk(true);
    else router.replace("/"); // web o móvil → vista normal
  }, [router]);

  if (!ok) return null;

  return (
    <div className="monitor">
      <Link href="/" className="mon-exit" title="Salir del monitor">✕</Link>
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
