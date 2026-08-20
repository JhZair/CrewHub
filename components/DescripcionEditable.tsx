"use client";
import { editarCuerpo } from "@/app/actions";
import TextoRico from "@/components/TextoRico";
import LinkPreviews from "@/components/LinkPreviews";
import Foto from "@/components/Foto";
import EditorImagenes from "@/components/EditorImagenes";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import BarraFormato from "@/components/BarraFormato";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { claseEstado } from "@/lib/estados";

/* Descripción del caso con lápiz: clic, corriges, Guardar. Si está vacía,
   muestra "+ Agregar descripción". Enter hace salto de línea (no guarda),
   Escape cancela. La bitácora recuerda la edición. */
export default function DescripcionEditable({ pubId, cuerpo, estado, tipo, imagenes, pie }: {
  /* `tipo` solo sirve para el filete de color de la izquierda: el cuerpo de un
     aviso vigente no se ribetea de rojo, que aquí significa "resuelve esto". */
  pubId: string; cuerpo: string; estado?: string; tipo?: string; imagenes?: string[];
  /* ── LO QUE VA PEGADO AL TEXTO ──
   * Hoy son las reacciones. Vivían en una fila propia debajo de la tarjeta y
   * esa fila casi nunca se llena: un 👀 y un «+» ocupaban un renglón entero
   * con su hueco arriba y su hueco abajo, o sea unos 40 px de página para dos
   * botones pequeños.
   * Van dentro porque es donde tienen sentido: se reacciona AL TEXTO, no al
   * caso en abstracto. Pegadas, además, se leen como parte de él y no como
   * otro bloque más de la pantalla. */
  pie?: React.ReactNode;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(cuerpo);
  const [imgs, setImgs] = useState<string[]>(imagenes || []);
  const [guardando, setGuardando] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const imgsBase = JSON.stringify(imagenes || []);
  const abrir = () => { setValor(cuerpo); setImgs(imagenes || []); setEditando(true); };
  const cancelar = () => { setEditando(false); setValor(cuerpo); setImgs(imagenes || []); };

  const pegar = async (files: File[]) => {
    for (const f of files.slice(0, Math.max(0, 6 - imgs.length))) {
      const r = await subirImagen(f);
      if (r.error) { alert(r.error); break; }
      if (r.url) setImgs(prev => [...prev, r.url!]);
    }
  };

  const guardar = async () => {
    if (guardando) return;
    if (valor.trim() === cuerpo.trim() && JSON.stringify(imgs) === imgsBase) { setEditando(false); return; }
    setGuardando(true);
    const res: any = await editarCuerpo(pubId, valor, imgs);
    setGuardando(false);
    if (res?.error) { alert(res.error); return; }
    setEditando(false);
    router.refresh();
  };

  if (!editando) {
    const imgsVista = imagenes || [];
    return (cuerpo || imgsVista.length > 0) ? (
      <div className={`desc est-${estado ? claseEstado(estado, tipo) : ""}`}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>
            {cuerpo ? <TextoRico texto={cuerpo} /> : <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Sin texto</span>}
          </span>
          <button title="Editar descripción" onClick={abrir}
            style={{ color: "var(--dim)", fontSize: 13, flex: "none" }}>✎</button>
        </div>
        <LinkPreviews texto={cuerpo} />
        {imgsVista.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: cuerpo ? 12 : 2 }}>
            {imgsVista.map((u, i) => <Foto key={i} src={u} />)}
          </div>
        )}
        {pie && <div className="desc-pie">{pie}</div>}
      </div>
    ) : (
      /* Sin descripción no hay tarjeta donde meter el pie, pero las reacciones
         tienen que seguir estando: un caso sin texto se reacciona igual. Van
         en la misma línea que el «+ Agregar», que es lo que había que evitar
         —una fila entera para dos botones— resuelto de la otra manera. */
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 10px" }}>
        <button className="desc-add" onClick={abrir}>+ Agregar descripción</button>
        {pie}
      </div>
    );
  }

  return (
    <div style={{ margin: "4px 0 12px" }}>
      <BarraFormato areaRef={areaRef} valor={valor} setValor={setValor} />
      <textarea ref={areaRef} autoFocus rows={4} value={valor}
        onChange={e => setValor(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") cancelar(); }}
        onPaste={e => { const f = imagenesDePaste(e); if (f.length) { e.preventDefault(); pegar(f); } }}
        style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--violet)", borderRadius: 12, padding: "10px 14px", fontSize: 14, color: "var(--text)", outline: "none", resize: "vertical", lineHeight: 1.5 }} />
      <EditorImagenes imgs={imgs} setImgs={setImgs} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn" style={{ padding: "5px 14px", fontSize: 12 }} disabled={guardando} onClick={guardar}>
          {guardando ? "..." : "Guardar"}
        </button>
        <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
          onClick={cancelar}>Cancelar (Esc)</button>
      </div>
    </div>
  );
}
