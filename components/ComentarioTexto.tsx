"use client";
import { editarComentario } from "@/app/actions";
import TextoRico from "@/components/TextoRico";
import LinkPreviews from "@/components/LinkPreviews";
import Foto from "@/components/Foto";
import EditorImagenes from "@/components/EditorImagenes";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import BarraFormato from "@/components/BarraFormato";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* Texto de un comentario: resalta @menciones y, si es mío, se edita en línea —
   texto E imágenes (miniaturas con ✕, adjuntar, pegar). Las imágenes se muestran
   aquí (vista y edición) para que editarlas no dependa de otro bloque. */
export default function ComentarioTexto({ comentarioId, pubId, cuerpo, imagenes, esMio, editadoEn, sinRed, onListo }: {
  comentarioId: string;
  pubId: string;
  cuerpo: string;
  imagenes?: string[];
  esMio: boolean;
  editadoEn?: string | null;
  /** Sin consultar las Open Graph de los enlaces. Para listas largas. */
  sinRed?: boolean;
  /** Además del refresco de la página: cuando esto vive dentro de un pop-up
   *  con su propio estado, `router.refresh()` recarga lo de DETRÁS y deja el
   *  hilo del modal como estaba. */
  onListo?: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(cuerpo);
  const [imgs, setImgs] = useState<string[]>(imagenes || []);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  /* La caja crece con lo escrito: contar saltos de línea no bastaba —un párrafo
     largo sin saltos se envolvía y quedaba oculto tras el scroll—. Se mide el
     alto real del contenido y se ajusta, hasta 320px; a partir de ahí, scroll. */
  useEffect(() => {
    const el = areaRef.current;
    if (!el || !editando) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 320) + "px";
  }, [texto, editando]);

  const imgsBase = JSON.stringify(imagenes || []);
  const abrir = () => { setTexto(cuerpo); setImgs(imagenes || []); setError(""); setEditando(true); };
  const cancelar = () => { setEditando(false); setTexto(cuerpo); setImgs(imagenes || []); setError(""); };

  const pegar = async (files: File[]) => {
    for (const f of files.slice(0, Math.max(0, 6 - imgs.length))) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
  };

  const guardar = async () => {
    if (ocupado) return;
    if (!texto.trim() && imgs.length === 0) { setError("El comentario no puede quedar vacío."); return; }
    if (texto.trim() === cuerpo.trim() && JSON.stringify(imgs) === imgsBase) { setEditando(false); return; }
    setOcupado(true); setError("");
    const res: any = await editarComentario(comentarioId, pubId, texto, imgs);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    setEditando(false);
    router.refresh(); onListo?.();
  };

  if (editando) {
    return (
      <div>
        {error && <div className="err-inline">⚠ {error}</div>}
        <BarraFormato areaRef={areaRef} valor={texto} setValor={setTexto} />
        <textarea ref={areaRef} value={texto} autoFocus rows={2}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") cancelar(); }}
          onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); pegar(f); } }}
          style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 14.5, color: "var(--text)", outline: "none", resize: "none", overflowY: "auto", lineHeight: 1.6 }} />
        <EditorImagenes imgs={imgs} setImgs={setImgs} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn" style={{ padding: "5px 14px", fontSize: 12 }}
            disabled={ocupado} onClick={guardar}>
            {ocupado ? "..." : "Guardar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
            onClick={cancelar}>Cancelar</button>
        </div>
      </div>
    );
  }

  const imgsVista = imagenes || [];
  // Un comentario solo-imagen guarda "📷" como cuerpo; no lo mostramos como texto.
  const soloFoto = (cuerpo || "").trim() === "📷" && imgsVista.length > 0;
  return (
    <div className="tx" style={{ position: "relative" }}>
      {!soloFoto && <TextoRico texto={cuerpo} />}
      {editadoEn && (
        <span style={{ color: "var(--dim)", fontSize: 10.5, marginLeft: 6 }}
          title={new Date(editadoEn).toLocaleString("es-PE")}>(editado)</span>
      )}
      {esMio && (
        <button title="Editar mi comentario"
          style={{ color: "var(--dim)", fontSize: 11.5, marginLeft: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          onClick={abrir}>✎</button>
      )}
      {/* `sinRed` en listas largas: cada tarjeta de enlace consulta las Open
          Graph con una acción de servidor, y Next las encola de una en una.
          Ver components/LinkPreviews.tsx. */}
      {!soloFoto && <LinkPreviews texto={cuerpo} sinRed={sinRed} />}
      {imgsVista.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {imgsVista.map((u, j) => <Foto key={j} src={u} maxHeight={160} />)}
        </div>
      )}
    </div>
  );
}
