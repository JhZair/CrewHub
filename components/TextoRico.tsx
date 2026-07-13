"use client";

/* Renderiza texto convirtiendo URLs en enlaces clicables (abren en pestaña
   nueva) y resaltando @menciones. Usado en descripciones y comentarios. */
const PATRON = /(https?:\/\/[^\s]+|www\.[^\s]+|@[^\s@,;:!?]+)/g;

export default function TextoRico({ texto }: { texto: string }) {
  const partes = (texto || "").split(PATRON);
  return (
    <>
      {partes.map((parte, i) => {
        if (!parte) return null;
        if (/^https?:\/\//.test(parte) || /^www\./.test(parte)) {
          // Recorta puntuación final que no forma parte del enlace
          const m = parte.match(/[)\].,;:!?]+$/);
          const cola = m ? m[0] : "";
          const url = cola ? parte.slice(0, -cola.length) : parte;
          const href = url.startsWith("http") ? url : `https://${url}`;
          return (
            <span key={i}>
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="tx-link" onClick={e => e.stopPropagation()}>{url}</a>
              {cola}
            </span>
          );
        }
        if (parte.startsWith("@")) return <span key={i} className="mencion">{parte}</span>;
        return <span key={i}>{parte}</span>;
      })}
    </>
  );
}
