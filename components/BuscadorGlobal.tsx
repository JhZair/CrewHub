"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function BuscadorGlobal({ inicial = "", autoEnfoque = false }: { inicial?: string; autoEnfoque?: boolean }) {
  const [q, setQ] = useState(inicial);
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (autoEnfoque) { ref.current?.focus(); ref.current?.select(); }
    const atajo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, [autoEnfoque]);

  const buscar = () => {
    if (q.trim()) router.push(`/buscar?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="buscador-glob">
      <span style={{ color: "var(--dim)" }}>🔍</span>
      <input ref={ref} value={q} placeholder="Buscar..."
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") buscar(); }} />
      <span className="kbd">Ctrl K</span>
    </div>
  );
}
