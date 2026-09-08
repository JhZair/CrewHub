"use client";
import { useRef } from "react";
import { useFechaDiferida } from "@/lib/fechaDiferida";
import { fechaDia, fechaLarga } from "@/lib/fechas";

/* Fecha «al vuelo» sin sacar un campo a la fila: el <input type="date"> vive
   escondido y el botón le abre el calendario nativo. Un input visible en veinte
   filas es un muro de «dd/mm/aaaa» que no dice nada; el 🕐 se lee como un hueco
   y la fecha puesta se lee como un dato.

   Nació dentro de SubCasos; ahora lo usa también el cronograma. La diferencia:
   en sub-casos la fecha es un PLAZO (rojo si venció) y en el cronograma es una
   fecha de inicio (no vence). Por eso el color NO se calcula aquí —eso metería
   la semántica de plazo donde no toca— sino que lo pasa quien llama. */
export default function FechaMini({ valor, onCambia, ocupado, color = null,
  tituloVacio = "Poner fecha", avisoAlBorrar }: {
  valor: string | null;
  onCambia: (v: string) => void;
  ocupado: boolean;
  /** Si borrar esta fecha se lleva algo más por delante, el texto que se
   *  pregunta antes. Sin él se borra sin preguntar: la del cronograma es una
   *  fecha suelta y no arrastra nada. */
  avisoAlBorrar?: string;
  /** Color del texto (lo decide quien llama: plazo en sub-casos, nada aquí). */
  color?: string | null;
  tituloVacio?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  /* ⚠ Diferido, no al vuelo: un campo de fecha emite un cambio por cada
     casilla que se toca, y guardarlos todos metía en la bitácora fechas que
     nadie eligió. Contado en lib/fechaDiferida.ts. */
  const f = useFechaDiferida(valor, onCambia, avisoAlBorrar ? { avisoAlBorrar } : undefined);
  const abrir = () => {
    const el = ref.current;
    if (!el) return;
    /* `showPicker` abre el calendario sin que el campo esté a la vista. Pide
       gesto del usuario —este clic lo es— y no está en todos los navegadores:
       si falta, se enfoca y se escribe con el teclado. Nunca se queda mudo. */
    /* ⚠ El foco PRIMERO, y luego el calendario. `showPicker` no enfoca: sin
       foco no hay `blur`, y `blur` es lo único que guarda esta fecha desde que
       se dejó de guardar en cada casilla. Sin esta línea, elegir un día y
       clicar en otro sitio no guardaba nada, en silencio. */
    el.focus();
    const abrePicker = (el as any).showPicker;
    if (typeof abrePicker === "function") {
      try { abrePicker.call(el); } catch { /* con el foco basta: se teclea */ }
    }
  };
  return (
    <span className="sc-fecha">
      <button type="button" className={`sc-btn${f.valor ? " puesto" : ""}`}
        disabled={ocupado} onClick={abrir}
        title={f.valor ? `${fechaLarga(f.valor)} — clic para cambiar` : tituloVacio}
        /* ⚠ El color solo cuando lo pintado ES lo guardado. `color` lo calcula
           quien llama a partir de la prop —«vencido» en rojo, por ejemplo—, y
           mientras hay un borrador sin mandar esa cuenta habla de OTRA fecha:
           se elegía el mes que viene y el botón lo enseñaba en rojo de vencido.
           Sin dato fiable, ninguno: el color vuelve en cuanto se guarda. */
        style={color && f.valor === (valor || "") ? { color } : undefined}>
        {/* ⚠ `f.valor` y no `valor`: lo que la persona acaba de elegir, no lo
            que el servidor todavía cree. El input está oculto, así que este
            botón es LO ÚNICO que se ve del campo — con la prop, el gesto no
            aparecía hasta que volvía el viaje. SubCasos tiene escrito por qué
            eso no vale: «la sensación de que el clic no entró». */}
        {f.valor ? fechaDia(f.valor) : "🕐"}
      </button>
      <input ref={ref} type="date" className="sc-fecha-inp" value={f.valor}
        onFocus={f.alEntrar} onKeyDown={f.alTecla}
        onChange={e => f.alTeclear(e.target.value)}
        onBlur={e => f.alSalir(e.target.value)} />
    </span>
  );
}
