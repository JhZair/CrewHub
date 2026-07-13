"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/* Botón "🖥 Monitor" que SOLO aparece dentro de la app instalada
   (display-mode ≠ browser). En navegador web o móvil no se renderiza,
   para que ahí la navegación quede normal. */
export default function MonitorLink() {
  const [enApp, setEnApp] = useState(false);
  useEffect(() => {
    setEnApp(
      !window.matchMedia("(display-mode: browser)").matches ||
      (navigator as any).standalone === true
    );
  }, []);
  if (!enApp) return null;
  return (
    <Link href="/monitor" className="vtab"
      title="Ver Navegación + Kanban + TV a la vez, en vivo"
      style={{ borderColor: "var(--accent)", color: "var(--text)" }}>
      🖥 Monitor
    </Link>
  );
}
