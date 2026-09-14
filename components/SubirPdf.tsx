"use client";
import { useRef, useState } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   📎 SOLTAR UN PDF, O ELEGIRLO

   Había un botón y nada más, y arrastrar el archivo encima —que es lo primero
   que hace cualquiera cuando ya lo tiene abierto en la carpeta de descargas—
   no solo no funcionaba: hacía algo PEOR que no hacer nada. Al soltar fuera de
   un sitio que lo acepte, el navegador ABRE el PDF en la pestaña, y con eso se
   pierde lo que hubiera en pantalla: las doscientas filas ya revisadas de la
   lista anterior, sin aviso y sin vuelta atrás.

   Uno solo para los dos cargadores —las bases y las listas de DAFO— porque las
   trampas de abajo hay que acertarlas en los dos sitios y son las mismas.

   ⚠ LAS TRES QUE FALLAN EN SILENCIO
    · `preventDefault()` en `dragOver` Y en `dragEnter`. Sin las dos, `drop`
      NUNCA se dispara: no hay error, simplemente el navegador se queda el
      archivo y lo abre. Es el fallo de arriba, y es el motivo de este archivo.
    · La cuenta de entradas y salidas. `dragLeave` salta también al pasar de la
      caja a CUALQUIER hijo suyo —el texto, el botón—, así que con un booleano
      el resaltado parpadea mientras se mueve el ratón por dentro. Se cuenta:
      se apaga cuando la cuenta vuelve a cero, no en el primer `dragLeave`.
    · Que sea un PDF se comprueba aquí. Soltar un .docx sin esto llega hasta el
      lector y vuelve como «no se pudo abrir el PDF», que hace pensar que el
      archivo está roto en vez de que es de otro tipo.
   ══════════════════════════════════════════════════════════════════════════ */

const esPdf = (f: File) =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name);

export default function SubirPdf({ leyendo, etiqueta, ayuda, onArchivo }: {
  leyendo: boolean;
  /** Qué dice el botón: «📎 Elegir el PDF de las bases». */
  etiqueta: string;
  /** La línea de debajo, para decir qué documento se espera. */
  ayuda?: string;
  onArchivo: (f: File) => void;
}) {
  const [dentro, setDentro] = useState(false);
  const [err, setErr] = useState("");
  const cuenta = useRef(0);

  function toma(fs: FileList | null) {
    setErr("");
    const arr = Array.from(fs || []);
    if (!arr.length) return;
    const pdf = arr.find(esPdf);
    if (!pdf) {
      setErr(`«${arr[0].name}» no es un PDF. Hace falta el documento original en PDF.`);
      return;
    }
    /* Se lee de uno en uno a propósito: cada documento se revisa y se confirma
       por separado, y encolar cuatro dejaría tres esperando detrás de una
       pantalla de confirmación. Se dice, en vez de tomar el primero callando. */
    if (arr.length > 1) setErr(`Se leerá «${pdf.name}». Los demás, uno a uno después.`);
    onArchivo(pdf);
  }

  return (
    <>
      <div
        className={`pdrop${dentro ? " on" : ""}${leyendo ? " leyendo" : ""}`}
        onDragEnter={e => {
          e.preventDefault(); e.stopPropagation();
          cuenta.current++; setDentro(true);
        }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
        onDragLeave={e => {
          e.preventDefault(); e.stopPropagation();
          cuenta.current--; if (cuenta.current <= 0) { cuenta.current = 0; setDentro(false); }
        }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation();
          cuenta.current = 0; setDentro(false);
          if (!leyendo) toma(e.dataTransfer?.files || null);
        }}
      >
        <div className="pdrop-ico">{leyendo ? "⏳" : dentro ? "📥" : "📄"}</div>
        <div className="pdrop-txt">
          {leyendo ? "Leyendo el PDF…" : dentro ? "Suelta el PDF aquí" : (
            <>
              Arrastra el PDF aquí
              {/* El `label` envuelve al input escondido: es lo que hace que el
                  texto entero abra el explorador, sin un botón aparte. */}
              <label className="pdrop-btn">
                {etiqueta}
                <input type="file" accept="application/pdf,.pdf" hidden disabled={leyendo}
                  onChange={e => { toma(e.target.files); e.target.value = ""; }} />
              </label>
            </>
          )}
        </div>
        {ayuda && !leyendo && <div className="pdrop-ayuda">{ayuda}</div>}
      </div>
      {err && <div className="cb-ayuda" style={{ color: "var(--yellow)" }}>⚠ {err}</div>}
    </>
  );
}
