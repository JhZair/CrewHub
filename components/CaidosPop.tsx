"use client";
import Link from "@/components/Enlace";
import ChipPop from "@/components/ChipPop";

/* ══════════════════════════════════════════════════════════════════════════
   QUIÉNES SE CAYERON EN ESTE ESCALÓN DEL EMBUDO

   «↘ 5 no aptas — DAFO las sacó por papeles» era un número y un motivo, con
   los nombres escondidos en el `title` del navegador: había que acertar a
   dejar el ratón quieto encima para verlos, no se podía pulsar ninguno, y en
   una pantalla táctil no existían.
   Y es justo la pregunta que hace el embudo: se mira para saber CUÁLES.

   ── SIN PEDIR NADA AL SERVIDOR ──
   Al revés que `ChipGrupo` —que trae el contenido del kit al pulsarlo—, aquí
   las postulaciones ya están en la página: el embudo las tuvo que agrupar para
   contarlas. Por eso `ChipPop` va sin `cargar` y el pop-up abre instantáneo,
   sin estado de espera ni un viaje por cada banda.

   ── FILAS PROPIAS Y NO `FilaPop` ──
   `FilaPop` es la fila de este mismo pop-up en el resto de la app, pero enlaza
   a `/entidad/equipamiento/${id}` escrito a fuego: usarla aquí llevaría a la
   ficha de un EQUIPO con el id de una postulación —una página de «no
   encontrado», o peor, la de otra cosa que exista con ese id—. Se reusan sus
   clases, que es lo que hace que se vean igual, y no su destino.
   ══════════════════════════════════════════════════════════════════════════ */

export type CaidaPost = {
  id: string;
  codigo?: string | null;
  proyecto?: string | null;
  empresa?: string | null;
  /** El código de su convocatoria: dos «no aptas» del mismo año pueden ser de
   *  concursos distintos, y eso cambia a quién preguntarle. */
  conv?: string | null;
  /** Y su nombre, ya sin el prefijo que comparten las de esta lista. El código
   *  solo —«C-068»— es una etiqueta que hay que ir a buscar a otra pantalla. */
  convNombre?: string | null;
  /** Código y nombre completos, para el `title`: lo recortado se comprueba
   *  contra lo entero sin salir de aquí. */
  convEntera?: string | null;
};

export default function CaidosPop({ n, motivo, caidos }: {
  n: number;
  /** «no aptas — DAFO las sacó por papeles», tal cual se lee en la banda. */
  motivo: string;
  caidos: CaidaPost[];
}) {
  return (
    <ChipPop
      titulo={`Ver cuáles son las ${n}`}
      clase="chip-caido"
      ancho={420}
      etiqueta={<>↘ {n} {motivo}</>}
      cabecera={<span className="chip-gr-h">↘ {n} · {motivo}</span>}
    >
      {caidos.map(c => (
        <Link key={c.id} href={`/entidad/postulacion/${c.id}`} className="ens-pop-fila">
          <span className="fpop-txt">
            <span className="fpop-l1">
              {c.codigo && <span className="kit-pz-folio">{c.codigo}</span>}
              {c.conv && (
                <span className="cpop-conv" style={{ color: "var(--violet)" }}
                  title={c.convEntera || undefined}>
                  {c.conv}{c.convNombre ? ` · ${c.convNombre}` : ""}
                </span>
              )}
            </span>
            <span className="fpop-nom">{c.proyecto || "sin proyecto"}</span>
            {/* La empresa, porque una no apta se arregla hablando con ELLA:
                es quien tiene el RUC observado o el papel que faltó. */}
            {c.empresa && <span className="fpop-l1" style={{ color: "var(--dim)" }}>{c.empresa}</span>}
          </span>
        </Link>
      ))}
    </ChipPop>
  );
}
