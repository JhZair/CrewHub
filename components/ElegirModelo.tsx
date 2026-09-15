"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { elegirPlantilla } from "@/app/guion/acciones";
import { PLANTILLAS, ACTOS_BASE, ICO_BEAT, VOZ, type ModoGuion } from "@/lib/guion";

/* ══════════════════════════════════════════════════════════════════════════
   ELEGIR EL MODELO NARRATIVO, DONDE SE DICE QUE HAY QUE ELEGIRLO

   ⚠ ESTE COMPONENTE EXISTE POR UN CALLEJÓN SIN SALIDA, NO POR ADORNO.

   La tarjeta de «Todavía no hay estructura» decía «elige ABAJO el modelo con
   el que quieres escribir»… y abajo no había nada que elegir: el desplegable
   de plantillas vive dentro de GuionEstructura, o sea en la vista ▤ Tarjetas,
   y un tratamiento recién creado abre en ⧉ Rejilla. Así que la pantalla daba
   una instrucción que no se podía obedecer sin adivinar que había que cambiar
   de pestaña primero.

   El resultado es el documento que la ficha de la película denuncia en rojo:
   creado, vigente y vacío. El peor de todos, porque la película se cuenta
   entre las que tienen documento y no tiene ni una secuencia dentro. O sea:
   un hueco de interfaz terminaba ensuciando el estado del proyecto.

   Así que la elección se pone AQUÍ, en el único momento en que hace falta y
   con la frase que la pide al lado. El desplegable de GuionEstructura se
   queda donde está: allí sirve para CAMBIAR de modelo con el guion ya
   escrito, que es otra conversación —y por eso allí va acompañado del aviso
   de qué se conserva—.
   ══════════════════════════════════════════════════════════════════════════ */

export default function ElegirModelo({ tratamientoId, modo }: {
  tratamientoId: string;
  modo: ModoGuion;
}) {
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const V = VOZ[modo];

  const elegir = async (clave: string) => {
    if (ocupado) return;
    setOcupado(clave); setError("");
    const r: any = await elegirPlantilla(tratamientoId, clave);
    setOcupado("");
    /* El error se ENSEÑA. `elegirPlantilla` distingue tres fallos distintos
       —la plantilla, los actos, la espina— y tragárselos dejaría la pantalla
       igual que antes de pulsar: indistinguible de «no pasó nada». */
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  return (
    <div className="gv-modelos">
      {PLANTILLAS.map(p => {
        const actos = (ACTOS_BASE[p.clave] || ACTOS_BASE["tres-actos"]).length;
        /* ⚠ Solo los `giro`, no «todo lo que no es estado». Contando también
           las inflexiones, el número decía «de giro» sobre puntos que no
           giran nada, y la diferencia entre las dos cosas es justo lo que
           este catálogo enseña. */
        const giros = p.beats.filter(b => b.tipo === "giro").length;
        return (
          <button key={p.clave} type="button" className="gv-modelo"
            disabled={!!ocupado} onClick={() => elegir(p.clave)}
            title={`Crea ${actos} actos y los ${p.beats.length} puntos de ${p.nombre}`
              + (p.nota ? `\n\nCómo se monta: ${p.nota}` : "")}>
            <b>{p.nombre}</b>
            <i>{p.fuente}</i>
            {/* Lo que se va a crear, en números, ANTES de pulsar. «Elegir un
                modelo» no dice si eso escribe algo en el documento; esto sí,
                y por eso se puede pulsar sin miedo. */}
            <span>
              {actos} actos · {p.beats.length} puntos
              {giros ? <> · {ICO_BEAT.giro} {giros} de giro</> : null}
            </span>
            {ocupado === p.clave && <em>creando…</em>}
          </button>
        );
      })}
      {error && <div className="err-inline" style={{ flexBasis: "100%" }}>⚠ {error}</div>}
      <div className="gv-modelos-pie">
        No es una jaula: la plantilla es una capa y se cambia más adelante sin
        perder una palabra de lo escrito. Lo que crea ahora son los actos y la
        espina —dónde se espera cada punto de giro—, para que las{" "}
        {V.secs.toLowerCase()} tengan de dónde colgar.
      </div>
    </div>
  );
}
