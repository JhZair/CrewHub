"use client";
import { useRef, useState } from "react";
import VisorArchivo from "@/components/VisorArchivo";
import { subirAdjunto, imagenesDePaste, esPdfUrl } from "@/lib/subirImagen";
import { prepararImagen, MEDIDAS } from "@/lib/prepararImagen";

/* ── UN COMPROBANTE, SIN PASAR POR DRIVE ──
 *
 * El caso que lo pide: se paga un Yape, queda la captura en el celular, y hay
 * que apuntarlo. Con un campo de URL había que subir la imagen a Drive, sacar
 * el enlace, volver y pegarlo — cuatro pasos y otra aplicación para un gasto de
 * S/ 20. Nadie hace eso veinte veces al mes: se apunta el gasto sin
 * comprobante, y el comprobante es justo lo que hace que el apunte sirva.
 *
 * Aquí se pega con Ctrl+V, se arrastra o se elige, y sube solo. Es la misma
 * excepción que ya hace el resto del sistema con los pantallazos
 * (lib/subirImagen.ts): las capturas son comunicación efímera, no documentos
 * del archivo institucional — esos sí van a Drive.
 *
 * Y el campo sigue aceptando un enlace escrito a mano: quien ya tenga el
 * comprobante en Drive no debería tener que volver a subirlo.
 */
export default function CampoAdjunto({
  valor, onCambio, placeholder = "Pega la captura (Ctrl+V), arrástrala o escribe un enlace",
  ancho,
}: {
  valor: string;
  onCambio: (url: string) => void;
  placeholder?: string;
  ancho?: number | string;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [encima, setEncima] = useState(false);
  const [ver, setVer] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const subir = async (file: File) => {
    setError(""); setSubiendo(true);
    try {
      /* Se comprime antes de subir. Una foto de celular son 12 MB y el tope del
         bucket son 5: sin esto, el caso más común —fotografiar el recibo con el
         teléfono— fallaría con un «archivo muy grande» que no dice qué hacer. */
      const listo = file.type.startsWith("image/")
        ? await prepararImagen(file, MEDIDAS.adjunto)
        : file;
      const r = await subirAdjunto(listo);
      if (r.error) setError(r.error);
      else if (r.url) onCambio(r.url);
    } catch (e: any) {
      setError(e?.message || "No se pudo subir.");
    }
    setSubiendo(false);
  };

  /* Pegar: si viene una imagen, se sube; si viene texto, se deja escribir. Un
     solo Ctrl+V sirve para las dos cosas y no hay que elegir modo. */
  const alPegar = (e: React.ClipboardEvent) => {
    const imgs = imagenesDePaste(e);
    if (!imgs.length) return;          // era texto: que siga su curso normal
    e.preventDefault();
    subir(imgs[0]);
  };

  const inp = {
    background: "var(--bg)", border: `1px solid ${encima ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: "var(--text)",
    outline: "none", flex: 1, minWidth: 140,
  } as const;

  if (valor) {
    /* Con comprobante puesto: se VE, y al tocarlo se abre ENCIMA, no en otra
       pestaña. Comprobar que la captura es la correcta es una mirada de dos
       segundos; mandarla a otra pestaña obliga a volver, y volver a una lista
       larga es perder el sitio donde se estaba. */
    const pdf = esPdfUrl(valor);
    return (
      <span style={{ display: "inline-flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
        {ver && <VisorArchivo url={valor} onClose={() => setVer(false)} />}
        <button type="button" onClick={() => setVer(true)} title="Ver el comprobante"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none",
            border: "none", padding: 0, cursor: "pointer", font: "inherit" }}>
          {pdf ? (
            <span className="badge" style={{ background: "#1c1c2c", color: "var(--muted)" }}>📄 PDF</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={valor} alt="comprobante" style={{
              height: 34, width: 34, objectFit: "cover", borderRadius: 6,
              border: "1px solid var(--border)" }} />
          )}
          <span style={{ color: "var(--teal)", fontSize: 12 }}>comprobante ✓</span>
        </button>
        <button type="button" className="dato-btn" title="Quitar"
          onClick={() => { onCambio(""); setError(""); }}>✕</button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flex: 1,
      minWidth: 200, width: ancho }}>
      <input
        value={valor}
        onChange={e => onCambio(e.target.value)}
        onPaste={alPegar}
        /* Arrastrar y soltar sobre el campo: es lo que la mano hace con una
           captura que ya está en el escritorio. */
        onDragOver={e => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={e => {
          e.preventDefault(); setEncima(false);
          const f = e.dataTransfer?.files?.[0];
          if (f) subir(f);
        }}
        placeholder={subiendo ? "Subiendo…" : placeholder}
        disabled={subiendo}
        style={inp} />
      {/* El botón, para el celular: ahí no hay Ctrl+V ni arrastrar, y `capture`
          abre la cámara directamente — fotografiar el recibo en el momento es
          más probable que subirlo después. */}
      <button type="button" className="dato-btn" disabled={subiendo}
        title="Elegir o tomar una foto" onClick={() => fileRef.current?.click()}>
        {subiendo ? "…" : "📷"}
      </button>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = ""; }} />
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>{error}</span>}
    </span>
  );
}
