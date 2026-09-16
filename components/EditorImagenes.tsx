"use client";
import { useEffect, useRef, useState } from "react";
import { subirImagen, archivosDe } from "@/lib/subirImagen";

/* Mini-editor de imágenes reusable: miniaturas con ✕ para quitar + botón para
   adjuntar. La subida se comparte con `subir` (también la usa el pegado del
   textarea que lo envuelve). `imgs`/`setImgs` los maneja el padre.

   ── ⚠ PEGAR Y SOLTAR, QUE ESTABAN PROMETIDOS Y NO EXISTÍAN ──
   El botón decía «Agregar imagen (o pega con Ctrl+V)» desde el primer día y
   nadie había escrito el `onPaste`. Donde este editor vive dentro de un
   textarea —los comentarios— el pegado funcionaba por el textarea de fuera, y
   por eso el hueco tardó en verse: en la ficha de una secuencia no hay
   textarea alrededor, así que Ctrl+V no hacía absolutamente nada. Una etiqueta
   que promete algo que no pasa es peor que no prometer nada: quien lo intenta
   una vez y no funciona da por hecho que la aplicación no sabe hacerlo.

   El pegado se escucha en `window` y no en una caja: «abro el panel y pego» no
   puede exigir haber acertado antes con el ratón en un sitio concreto. Y
   arrastrar y soltar va al mismo sitio por las mismas razones — `archivosDe`
   existe justamente para que las tres puertas (pegar, soltar, el selector) no
   tengan tres copias del mismo bucle. */
/* ── ⚠ QUIÉN SE QUEDA EL PEGADO CUANDO HAY VARIOS ──
 * `activo` sola no basta. En la lista de Tarjetas cada secuencia monta su
 * propio editor, y nada impide abrir el panel de imagen de dos a la vez: los
 * dos escucharían el mismo Ctrl+V y la misma captura se subiría DOS VECES, una
 * a cada secuencia. Y no da error — aparece una foto de más en una secuencia
 * que nadie estaba mirando, que es el tipo de fallo que se descubre semanas
 * después sin poder reconstruir qué pasó.
 * Gana el ÚLTIMO que se activó, que es el que la persona acaba de abrir. Un
 * símbolo por instancia porque dos editores con el mismo contenido siguen
 * siendo dos, y comparar por contenido los confundiría. */
let duenoDelPegado: symbol | null = null;

export default function EditorImagenes({ imgs, setImgs, max = 6, onError, activo = true }: {
  imgs: string[]; setImgs: (v: string[]) => void; max?: number;
  /** Si se pasa, los errores (p. ej. «Máximo 5MB») se muestran por aquí en vez
   *  del `alert()` nativo del navegador. */
  onError?: (msg: string) => void;
  /** ⚠ Escuchar `paste` en `window` significa que TODOS los editores montados
   *  en la pantalla reciben el mismo pegado. En una lista de veinte secuencias
   *  eso serían veinte subidas de la misma captura. Quien monta varios pasa
   *  `activo` solo en el que está abierto. */
  activo?: boolean;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [zona, setZona] = useState(false);
  const avisar = (m: string) => (onError ? onError(m) : alert(m));

  /* ⚠ En una `ref` y no en una dependencia del efecto: `subir` se rehace en
     cada render —cierra sobre `imgs`— y con ella en las dependencias, el
     listener se quitaría y se volvería a poner en cada tecla. Con la ref, el
     listener se monta una vez y siempre llama a la versión de ahora. */
  const ref = useRef<(f: File[]) => void>(() => {});
  const yo = useRef<symbol>(Symbol("editor-imagenes"));

  useEffect(() => {
    if (!activo) return;
    const mio = yo.current;
    duenoDelPegado = mio;
    const alPegar = (e: ClipboardEvent) => {
      if (duenoDelPegado !== mio) return;
      const f = archivosDe(e.clipboardData).filter(x => x.type.startsWith("image/"));
      if (!f.length) return;
      /* Solo se intercepta si DE VERDAD venían imágenes: sin esta salida, pegar
         texto normal en cualquier campo de la pantalla dejaría de funcionar. */
      e.preventDefault();
      ref.current(f);
    };
    window.addEventListener("paste", alPegar);
    return () => {
      window.removeEventListener("paste", alPegar);
      /* Solo si sigo siendo el dueño: si otro editor se activó después, el
         turno es suyo y borrarlo al desmontarme dejaría la pantalla sin nadie
         escuchando. */
      if (duenoDelPegado === mio) duenoDelPegado = null;
    };
  }, [activo]);

  const subir = async (files: File[]) => {
    if (!files.length || subiendo || imgs.length >= max) return;
    setSubiendo(true);
    const nuevas: string[] = [];
    // Math.max(0,…): si por una carrera imgs ya excede el tope, slice(0,neg)
    // NO devuelve [] (recorta desde el final) y dejaría pasar de más.
    for (const f of files.slice(0, Math.max(0, max - imgs.length))) {
      const r = await subirImagen(f);
      if (r.error) { avisar(r.error); break; }
      if (r.url) nuevas.push(r.url);
    }
    if (nuevas.length) setImgs([...imgs, ...nuevas]);
    setSubiendo(false);
  };
  ref.current = subir;

  return (
    <div
      /* Soltar archivos encima. `onDragOver` con `preventDefault` es lo único
         que impide que el navegador ABRA la imagen en la pestaña, que es lo que
         hace por defecto y da mucho susto la primera vez. */
      onDragOver={e => { e.preventDefault(); setZona(true); }}
      onDragLeave={() => setZona(false)}
      onDrop={e => { e.preventDefault(); setZona(false); subir(archivosDe(e.dataTransfer)); }}
      style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 7,
        borderRadius: 8, outline: zona ? "2px dashed var(--violet)" : "none", outlineOffset: 4 }}>
      {imgs.map((u, i) => (
        <span key={i} style={{ position: "relative", display: "inline-flex" }}>
          <img src={u} alt="" style={{ height: 46, borderRadius: 6, border: "1px solid var(--border)" }} />
          <button title="Quitar" onClick={() => setImgs(imgs.filter((_, j) => j !== i))}
            style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "var(--card)", border: "1px solid var(--border2)", color: "var(--red)", fontSize: 11, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </span>
      ))}
      {imgs.length < max && (
        <label className="btn btn-ghost" title="Agregar imagen — o pégala con Ctrl+V, o suéltala aquí"
          style={{ padding: "5px 9px", fontSize: 11.5, cursor: "pointer" }}>
          📷 {subiendo ? "…" : "Imagen"}
          <input type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { subir(Array.from(e.target.files || [])); e.target.value = ""; }} />
        </label>
      )}
    </div>
  );
}
