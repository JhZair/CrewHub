"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/* Botón "🖥 Monitor" que aparece cuando la app corre instalada
   (standalone / minimal-ui / window-controls-overlay), no en un
   navegador normal. Detección positiva por display-mode. */
export default function MonitorLink() {
  const [enApp, setEnApp] = useState(false);
  useEffect(() => {
    const m = (q: string) => window.matchMedia(q).matches;
    setEnApp(
      m("(display-mode: standalone)") ||
      m("(display-mode: minimal-ui)") ||
      m("(display-mode: window-controls-overlay)") ||
      (navigator as any).standalone === true
    );
  }, []);
  if (!enApp) return null;
  return (
    <Link href="/monitor" className="vtab"
      title="Ver Navegación + Kanban a la vez, en vivo"
      style={{ borderColor: "var(--accent)", color: "var(--text)" }}>
      🖥 Monitor
    </Link>
  );
}
