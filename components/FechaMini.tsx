"use client";
import { useRef } from "react";
import { fechaDia, fechaLarga } from "@/lib/fechas";

/* Fecha «al vuelo» sin sacar un campo a la fila: el <input type="date"> vive
   escondido y el botón le abre el calendario nativo. Un input visible en veinte
   filas es un muro de «dd/mm/aaaa» que no dice nada; el 🕐 se lee como un hueco
   y la fecha puesta se lee como un dato.

   Nació dentro de SubCasos; ahora lo usa también el cronograma. La diferencia:
   en sub-casos la fecha es un PLAZO (rojo si venció) y en el cronograma es una
   fecha de inicio (no vence). Por eso el color NO se calcula aquí —eso metería
   la semántica de plazo donde no toca— sino que lo pasa quien llama. */
export default function FechaMini({ valor, onCambia, ocupado, color = null, tituloVacio = "Poner fecha" }: {
  valor: string | null;
  onCambia: (v: string) => void;
  ocupado: boolean;
  /** Color del texto (lo decide quien llama: plazo en sub-casos, nada aquí). */
  color?: string | null;
  tituloVacio?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const abrir = () => {
    const el = ref.current;
    if (!el) return;
    /* `showPicker` abre el calendario sin que el campo esté a la vista. Pide
       gesto del usuario —este clic lo es— y no está en todos los navegadores:
       si falta, se enfoca y se escribe con el teclado. Nunca se queda mudo. */
    const abrePicker = (el as any).showPicker;
    if (typeof abrePicker === "function") {
      try { abrePicker.call(el); return; } catch { /* cae al focus */ }
    }
    el.focus();
  };
  return (
    <span className="sc-fecha">
      <button type="button" className={`sc-btn${valor ? " puesto" : ""}`}
        disabled={ocupado} onClick={abrir}
        title={valor ? `${fechaLarga(valor)} — clic para cambiar` : tituloVacio}
        style={color ? { color } : undefined}>
        {valor ? fechaDia(valor) : "🕐"}
      </button>
      <input ref={ref} type="date" className="sc-fecha-inp" value={valor || ""}
        onChange={e => onCambia(e.target.value)} />
    </span>
  );
}
