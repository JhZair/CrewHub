"use client";
import { comentarObjeto } from "@/app/actions";
import EditorImagenes from "@/components/EditorImagenes";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import { menciones, MencionesMenu, type Perfil } from "@/components/Menciones";
import BarraFormato from "@/components/BarraFormato";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/* Caja para comentar un objeto del repositorio. Usa el mismo motor que los
   comentarios de un caso —misma tabla, mismas menciones, mismos avisos—, así
   que escribir «@Jesús» aquí le llega igual que en cualquier caso. */
export default function ComentarObjeto({ objetoId, perfiles = [] }: {
  objetoId: string;
  /** Para el autocompletado del @: sin ellos el desplegable no puede salir. */
  perfiles?: Perfil[];
}) {
  const router = useRouter();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [texto, setTexto] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const pegar = async (files: File[]) => {
    for (const f of files.slice(0, Math.max(0, 6 - imgs.length))) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
  };

  const enviar = async () => {
    if (enviando) return;
    if (!texto.trim() && !imgs.length) return;
    setEnviando(true); setError("");
    const r: any = await comentarObjeto(objetoId, texto, imgs);
    setEnviando(false);
    if (r?.error) { setError(r.error); return; }
    setTexto(""); setImgs([]); router.refresh();
  };

  // 🪄 El mismo autocompletado que la caja del caso (components/Menciones).
  const { enMencion, candidatos, aplicar } = menciones(texto, perfiles);

  return (
    <div style={{ marginTop: 10, position: "relative" }}>
      {error && <div className="err-inline">⚠ {error}</div>}
      <MencionesMenu candidatos={candidatos} onElegir={n => setTexto(aplicar(n))} />
      <BarraFormato areaRef={areaRef} valor={texto} setValor={setTexto} />
      <textarea ref={areaRef} value={texto} rows={3}
        placeholder="Escribe un comentario… (Enter envía · Shift+Enter salto de línea · @nombre para invocar)"
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) {
            // Con la lista abierta, Enter elige — no envía a medio escribir.
            if (candidatos.length && enMencion) { e.preventDefault(); setTexto(aplicar(candidatos[0].nombre)); return; }
            e.preventDefault(); enviar();
          }
        }}
        onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); pegar(f); } }}
        style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", fontSize: 14.5, color: "var(--text)", outline: "none", resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }} />
      <EditorImagenes imgs={imgs} setImgs={setImgs} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn" disabled={enviando || (!texto.trim() && !imgs.length)} onClick={enviar}>
          {enviando ? "Enviando..." : "Comentar"}
        </button>
      </div>
    </div>
  );
}
