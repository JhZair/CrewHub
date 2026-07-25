"use client";
import { toggleReaccion } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EMOJIS = ["👀", "👍", "✔️", "❤️", "🔥", "👏", "😂", "😮", "🤔", "😕", "😢"];
const LABEL: Record<string, string> = {
  "👀": "Visto — lo leí y lo tengo presente",
  "👍": "De acuerdo",
  "✔️": "Revisado — lo verifiqué y está conforme",
  "❤️": "Me encanta", "🔥": "Genial",
  "👏": "Aplausos", "😂": "Me dio risa", "😮": "Me sorprendió",
  "🤔": "Estoy pensando / déjame revisarlo",
  "😕": "No entendí / estoy confundido", "😢": "Triste",
};

/* Cada reacción trae, si el server la embebió, el nombre de quién la puso
   (`perfil.nombre`): así el tooltip dice QUIÉN reaccionó —el acuse de haber
   visto el mensaje— en vez de un genérico «Reaccionar igual». */
export type Reaccion = { emoji: string; usuario_id: string; nombre?: string | null; perfil?: any };

/* Chips de reacción con toggle: clic en un chip = sumar/quitar la mía.
   El ＋ abre la paleta. Funciona en publicaciones y comentarios. */
export default function Reacciones({ pubId, comentarioId = null, reacciones, userId, objetoId = null }: {
  pubId: string | null;
  comentarioId?: string | null;
  reacciones: Reaccion[];
  userId: string;
  /** Cuando el comentario es de un objeto del repositorio, no de un caso. */
  objetoId?: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // PostgREST devuelve la relación como objeto o como arreglo según cardinalidad;
  // se contemplan ambos para sacar el nombre del autor de la reacción.
  const nombreDe = (r: Reaccion): string | null => {
    if (r.nombre) return r.nombre;
    const p = r.perfil;
    if (!p) return null;
    return (Array.isArray(p) ? p[0]?.nombre : p?.nombre) ?? null;
  };
  const grupos = EMOJIS
    .map(e => {
      const rs = reacciones.filter(r => r.emoji === e);
      // Quiénes reaccionaron: «Tú» primero, luego los demás por nombre. Es el
      // acuse de lectura —quién ya lo vio—, no un botón anónimo.
      const quien = [
        ...(rs.some(r => r.usuario_id === userId) ? ["Tú"] : []),
        ...rs.filter(r => r.usuario_id !== userId).map(nombreDe).filter(Boolean) as string[],
      ];
      return { emoji: e, n: rs.length, mia: rs.some(r => r.usuario_id === userId), quien };
    })
    .filter(g => g.n > 0);

  const tituloDe = (g: { mia: boolean; quien: string[] }) => {
    const txt = g.quien.join(", ");
    if (!txt) return g.mia ? "Quitar mi reacción" : "Reaccionar igual";
    return g.mia ? `${txt} · toca para quitar la tuya` : `${txt} · toca para reaccionar igual`;
  };

  const tap = async (emoji: string) => {
    if (ocupado) return;
    setOcupado(true); setAbierto(false); setError("");
    const res = await toggleReaccion(pubId, comentarioId, emoji, objetoId);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };

  return (
    <span className="rx" onClick={e => e.stopPropagation()}>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>⚠ {error}</span>}
      {grupos.map(g => (
        <button key={g.emoji} className={`rx-chip ${g.mia ? "mia" : ""}`}
          title={tituloDe(g)}
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
                <button key={e} title={LABEL[e] || ""} onClick={() => tap(e)}>{e}</button>
              ))}
            </span>
          </>
        )}
      </span>
    </span>
  );
}
