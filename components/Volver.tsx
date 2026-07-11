"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* Botón de regreso con memoria: vuelve a la pantalla anterior real
   (tablero, perfil, búsqueda...); si no hay historial, al feed.
   Acompañado siempre del ⬡ que lleva al inicio en un solo clic. */
export default function Volver({ etiqueta = "← Volver" }: { etiqueta?: string }) {
  const router = useRouter();
  const volver = () => {
    if (typeof window !== "undefined" && window.history.length > 2) router.back();
    else router.push("/");
  };
  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      <Link href="/" className="btn btn-ghost" title="Ir al inicio"
        style={{ fontWeight: 800, color: "var(--violet)" }}>⬡</Link>
      <button className="btn btn-ghost" onClick={volver}>{etiqueta}</button>
    </span>
  );
}
