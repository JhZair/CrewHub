"use client";
import { toggleReaccion } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EMOJIS = ["👍", "❤️", "🔥", "👏", "😂", "😢"];

export type Reaccion = { emoji: string; usuario_id: string };

/* Chips de reacción con toggle: clic en un chip = sumar/quitar la mía.
   El ＋ abre la paleta. Funciona en publicaciones y comentarios. */
export default function Reacciones({ pubId, comentarioId = null, reacciones, userId }: {
  pubId: string;
  comentarioId?: string | null;
  reacciones: Reaccion[];
  userId: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const grupos = EMOJIS
    .map(e => ({
      emoji: e,
      n: reacciones.filter(r => r.emoji === e).length,
      mia: reacciones.some(r => r.emoji === e && r.usuario_id === userId),
    }))
    .filter(g => g.n > 0);

  const tap = async (emoji: string) => {
    if (ocupado) return;
    setOcupado(true); setAbierto(false); setError("");
    const res = await toggleReaccion(pubId, comentarioId, emoji);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };

  return (
    <span className="rx" onClick={e => e.stopPropagation()}>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>⚠ {error}</span>}
      {grupos.map(g => (
        <button key={g.emoji} className={`rx-chip ${g.mia ? "mia" : ""}`}
          title={g.mia ? "Quitar mi reacción" : "Reaccionar igual"}
          onClick={() => tap(g.emoji)}>
          {g.emoji} {g.n}
        </button>
      ))}
      <span style={{ position: "relative", display: "inline-flex" }}>
        <button className="rx-mas" title="Reaccionar" onClick={() => setAbierto(!abierto)}>
          {grupos.length ? "＋" : "☺＋"}
        </button>
        {abierto && (
          <>
            <span className="rx-fondo" onClick={() => setAbierto(false)} />
            <span className="rx-paleta">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => tap(e)}>{e}</button>
              ))}
            </span>
          </>
        )}
      </span>
    </span>
  );
}
