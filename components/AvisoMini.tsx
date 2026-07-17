"use client";
import { toggleEnterado } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* EL PIE DE UN AVISO EN UNA TARJETA
   Cuántos se enteraron y el botón para enterarse al vuelo, sin abrir nada.

   Hay dos tamaños de lo mismo, a propósito:
     AvisoEnterado  → la página del caso. Barra de progreso, quiénes faltan,
                      el aviso de "tiene plazo, no se archiva". Ahí hay sitio.
     AvisoMini      → una tarjeta en una lista. Un número y un botón.
   Esto vivía suelto dentro de PostCard. Se saca porque la ficha de entidad
   necesita exactamente lo mismo, y la alternativa era una tercera copia de
   "me enteré" — que es como empiezan siempre las divergencias de este
   sistema: dos sitios que hacen lo mismo hasta que uno aprende algo.

   `stopPropagation` no es adorno: esto vive dentro de tarjetas que navegan
   al hacer clic (el feed con router.push, la ficha con enlace estirado). Sin
   él, marcar "me enteré" te saca de la página que estabas mirando. */
export default function AvisoMini({ pubId, enterados, total, mio }: {
  pubId: string;
  enterados: number;
  /** Cuántos deberían enterarse. Si no se sabe, se muestra "—": mejor un
   *  hueco visible que un denominador inventado. */
  total?: number;
  mio: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const tap = async () => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const res: any = await toggleEnterado(pubId);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
      onClick={e => e.stopPropagation()}>
      <span style={{ color: "var(--violet)", fontSize: 12 }}>
        👀 Enterados {enterados}/{total ?? "—"}
      </span>
      <button className="ae-mini" disabled={ocupado}
        title={mio ? "Ya te enteraste" : "Marcar que me enteré"}
        onClick={e => { e.stopPropagation(); tap(); }}>
        {ocupado ? "…" : mio ? "✓ enterado" : "me enteré"}
      </button>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>⚠ {error}</span>}
    </span>
  );
}
