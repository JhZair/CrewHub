"use client";
import { comentar } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Responder a un comentario concreto: botón "↩ Responder" que abre una
   caja inline; al enviar, el comentario queda enlazado al padre (responde_a). */
export default function RespuestaBox({ pubId, comentarioId }: {
  pubId: string; comentarioId: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [txt, setTxt] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  const enviar = async () => {
    if (!txt.trim() || enviando) return;
    setEnviando(true);
    const res: any = await comentar(pubId, txt.trim(), [], comentarioId);
    setEnviando(false);
    if (res?.error) { alert(res.error); return; }
    setTxt(""); setAbierto(false);
    router.refresh();
  };

  if (!abierto) {
    return (
      <button className="btn-responder" onClick={e => { e.stopPropagation(); setAbierto(true); }}>
        ↩ Responder
      </button>
    );
  }
  return (
    <div className="resp-box">
      <textarea autoFocus rows={2} value={txt}
        placeholder="Tu respuesta… (Enter envía · Shift+Enter salto de línea)"
        onChange={e => setTxt(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
          if (e.key === "Escape") { setAbierto(false); setTxt(""); }
        }} />
      <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
        <button className="btn" style={{ padding: "4px 12px", fontSize: 11.5 }}
          disabled={!txt.trim() || enviando} onClick={enviar}>
          {enviando ? "..." : "Responder"}
        </button>
        <button className="btn btn-ghost" style={{ padding: "4px 9px", fontSize: 11.5 }}
          onClick={() => { setAbierto(false); setTxt(""); }}>Cancelar</button>
      </div>
    </div>
  );
}
