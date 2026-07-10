"use client";
import { useEffect, useState } from "react";

export default function Reloj() {
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
        {ahora.toLocaleTimeString("es-PE", { hour12: false })}
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "capitalize" }}>
        {ahora.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
      </div>
    </div>
  );
}
