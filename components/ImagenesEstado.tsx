"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { subirAdjunto, esPdfUrl } from "@/lib/subirImagen";
import { imagenesEstadoCuenta } from "@/app/actions";
import { useConfirmar, useAviso } from "@/components/useConfirmar";
import Foto from "@/components/Foto";

/* El comprobante físico de un mes: sus escaneos/fotos. Se ven como miniaturas
   (clic = zoom) y, si eres admin, se adjuntan y se quitan. Autoguarda: cada
   cambio persiste la lista de URLs en el estado de cuenta.

   ── TRES FORMAS DE TRAER EL PAPEL, Y NO UNA ──
   Empezó con un solo camino: el botón que abre el explorador de archivos. Y el
   gesto real es otro — se recorta el estado de cuenta de la web del banco y
   queda EN EL PORTAPAPELES. Con un solo camino había que pegarlo antes en
   Paint, guardarlo, buscarlo en Descargas y elegirlo: cuatro pasos por mes,
   diez meses. Eso no se hace; se deja para después y «después» no llega.

   Ahora: se suelta encima, se pega, o se elige. Las tres.

   ── POR QUÉ EL PEGAR ES UN BOTÓN Y NO UN Ctrl+V SUELTO ──
   Un Ctrl+V global tendría que adivinar a qué MES va la imagen, y en una lista
   de diez meses adivinar mal significa colgar el estado de agosto en el de
   enero, sin que nada falle. El botón dice a cuál: el que se toca.
   Lee del portapapeles con `navigator.clipboard.read`, que Chrome solo permite
   tras un gesto de la persona — que es justo lo que es un clic. */
export default function ImagenesEstado({ estadoId, postulacionId, esAdmin, inicial }: {
  estadoId: string; postulacionId: string; esAdmin: boolean; inicial: string[];
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();
  const [imgs, setImgs] = useState<string[]>(inicial || []);
  const [subiendo, setSubiendo] = useState(false);
  const [encima, setEncima] = useState(false);

  const guardar = async (next: string[]) => {
    setImgs(next);
    const r: any = await imagenesEstadoCuenta(estadoId, next, postulacionId);
    if (r?.error) { avisar(r.error); router.refresh(); }
  };

  const subir = async (files: File[]) => {
    if (!files.length || subiendo) return;
    setSubiendo(true);
    const nuevas: string[] = [];
    for (const f of files.slice(0, Math.max(0, 12 - imgs.length))) {
      const r = await subirAdjunto(f);
      if (r.error) { avisar(r.error); break; }
      if (r.url) nuevas.push(r.url);
    }
    setSubiendo(false);
    if (nuevas.length) guardar([...imgs, ...nuevas]);
  };

  /* Pegar lo que haya en el portapapeles. Falla de formas muy distintas —el
     navegador no lo soporta, el permiso está denegado, o simplemente no hay
     una imagen copiada— y cada una tiene un arreglo distinto, así que se dicen
     por separado en vez de un «no se pudo» que no lleva a ninguna parte. */
  const pegar = async () => {
    if (subiendo) return;
    try {
      const nav: any = navigator;
      if (!nav.clipboard?.read) {
        avisar("Este navegador no deja leer el portapapeles. Arrastra la imagen sobre el mes, o tócalo para elegir el archivo.");
        return;
      }
      const items = await nav.clipboard.read();
      const files: File[] = [];
      for (const it of items) {
        const tipo = (it.types || []).find((t: string) => t.startsWith("image/"));
        if (!tipo) continue;
        const blob = await it.getType(tipo);
        files.push(new File([blob], `estado-${Date.now()}.${tipo.split("/")[1] || "png"}`, { type: tipo }));
      }
      if (!files.length) {
        avisar("No hay ninguna imagen copiada. Recorta el estado de cuenta (Win+Shift+S) y vuelve a tocar Pegar.");
        return;
      }
      subir(files);
    } catch (e: any) {
      avisar(e?.name === "NotAllowedError"
        ? "El navegador no dio permiso para leer el portapapeles. Acéptalo en el candado de la barra de direcciones, o arrastra la imagen sobre el mes."
        : (e?.message || "No se pudo pegar."));
    }
  };

  const quitar = async (i: number) => {
    if (!(await pedir("¿Quitar este escaneo?", { peligro: true, aceptar: "Quitar" }))) return;
    guardar(imgs.filter((_, j) => j !== i));
  };

  if (!esAdmin && !imgs.length) return null;
  return (
    /* Soltar encima funciona en TODA la fila del mes, no solo sobre el botón:
       apuntar a un botón de 70 píxeles con un archivo en la mano es el tipo de
       precisión que sobra cuando lo que se quiere es «este papel, aquí». */
    <div style={{ marginTop: 4, borderRadius: 8,
      outline: encima ? "2px dashed var(--accent)" : undefined,
      outlineOffset: 3 }}
      onDragOver={esAdmin ? (e => { e.preventDefault(); setEncima(true); }) : undefined}
      onDragLeave={esAdmin ? (() => setEncima(false)) : undefined}
      onDrop={esAdmin ? (e => {
        e.preventDefault(); setEncima(false);
        subir(Array.from(e.dataTransfer?.files || []));
      }) : undefined}>
      {dialogo}
      {aviso}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {imgs.map((u, i) => (
        <span key={i} style={{ position: "relative", display: "inline-flex" }}>
          {esPdfUrl(u) ? (
            <a href={u} target="_blank" rel="noopener noreferrer" title="Abrir el PDF"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 74, padding: "0 14px",
                borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)",
                color: "var(--violet)", fontSize: 12.5, textDecoration: "none" }}>📄 PDF ↗</a>
          ) : (
            <Foto src={u} maxHeight={74} />
          )}
          {esAdmin && (
            <button onClick={() => quitar(i)} title="Quitar"
              style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%",
                background: "var(--card)", border: "1px solid var(--border2)", color: "var(--red)",
                fontSize: 11, lineHeight: 1, cursor: "pointer", zIndex: 2 }}>✕</button>
          )}
        </span>
      ))}
      {esAdmin && imgs.length < 12 && (
        <label className="btn btn-ghost" title="Adjuntar el comprobante del estado de cuenta (imagen o PDF)"
          style={{ padding: "4px 9px", fontSize: 11, cursor: "pointer" }}>
          📎 {subiendo ? "…" : "Adjuntar"}
          <input type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }}
            onChange={e => { subir(Array.from(e.target.files || [])); e.target.value = ""; }} />
        </label>
      )}
      {esAdmin && imgs.length < 12 && (
        <button className="btn btn-ghost" onClick={pegar} disabled={subiendo}
          title="Pegar la captura que tengas copiada (Win+Shift+S para recortar la pantalla). También puedes arrastrarla y soltarla aquí."
          style={{ padding: "4px 9px", fontSize: 11 }}>
          📋 Pegar
        </button>
      )}
      </div>
    </div>
  );
}
