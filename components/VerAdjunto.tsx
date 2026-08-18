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
  url, titulo = "Ver el comprobante", children = "📎", clase = "dato-btn",
}: {
  url: string;
  titulo?: string;
  children?: React.ReactNode;
  /** La clase del botón. Por defecto `dato-btn` —con borde y relleno—, que es
   *  lo correcto cuando el adjunto es una acción suelta en una fila.
   *  Se puede cambiar porque hay sitios donde el disparador NO es un botón
   *  sino un dato: los códigos de recibo de la pestaña Equipo se leen en
   *  hilera y monoespaciados, y convertir cada uno en una pastilla con borde
   *  rompería la hilera justo donde sirve para comparar de un vistazo. */
  clase?: string;
}) {
  const [ver, setVer] = useState(false);
  const s = (url || "").trim();
  if (!s) return null;
  return (
    <>
      {ver && <VisorArchivo url={s} onClose={() => setVer(false)} />}
      <button type="button" className={clase} title={titulo}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setVer(true); }}>
        {children}
      </button>
    </>
  );
}
