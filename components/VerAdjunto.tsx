"use client";
import { useState } from "react";
import VisorArchivo from "@/components/VisorArchivo";

/* ── EL 📎 DE UNA LISTA, QUE ABRE ENCIMA ──
 *
 * Antes era un enlace a otra pestaña, y eso convertía una comprobación de dos
 * segundos —«¿esta captura es la del Yape de S/ 700?»— en salir de la lista y
 * volver. En una lista de treinta movimientos, volver es perder el sitio donde
 * se estaba mirando.
 *
 * Se apoya en VisorArchivo, que ya existe y ya resuelve lo difícil: cierra con
 * Esc, bloquea el scroll de detrás, y para un PDF muestra el visor real en vez
 * de la portada. Un lightbox propio habría sido la cuarta forma de mirar un
 * archivo en la misma aplicación.
 */
export default function VerAdjunto({
  url, titulo = "Ver el comprobante", children = "📎",
}: {
  url: string;
  titulo?: string;
  children?: React.ReactNode;
}) {
  const [ver, setVer] = useState(false);
  const s = (url || "").trim();
  if (!s) return null;
  return (
    <>
      {ver && <VisorArchivo url={s} onClose={() => setVer(false)} />}
      <button type="button" className="dato-btn" title={titulo}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setVer(true); }}>
        {children}
      </button>
    </>
  );
}
