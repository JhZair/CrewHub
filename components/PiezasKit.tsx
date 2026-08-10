import Link from "next/link";
import { NO_ENTREGABLE, porQueNo, nombraPieza, type PiezaKit } from "@/lib/kits";

/* LAS PIEZAS DE UN KIT, CON SU FOTO.
 *
 * Sin componente compartido esto se escribiría dos veces —el panel de
 * /equipamiento y la ficha de cada equipo— y las dos copias divergirían: ya
 * pasó con el tipo de publicación, que acabó en diez sitios y en dos versiones
 * distintas (ver lib/tipos.ts). Una sola pieza pintada de una sola forma.
 *
 * Deliberadamente SIN "use client": no tiene estado ni manejadores, así que el
 * servidor la renderiza en la ficha del equipo y el bundle del navegador la
 * incluye cuando la usa el panel. La misma fila en los dos lados.
 *
 * Una pieza que hoy no puede salir se apaga, pero NO se esconde: el kit es la
 * lista de empaque completa. Y el motivo va con nombre —«lo tiene KatyP»— y no
 * «no disponible», porque lo que hace falta saber es a quién llamar.
 */
export default function PiezasKit({ piezas, yo }: {
  piezas: PiezaKit[];
  /** Id del equipo cuya ficha se está viendo: se marca y no se enlaza a sí mismo. */
  yo?: string;
}) {
  if (!piezas.length) {
    return <div style={{ color: "var(--dim)", fontSize: 11.5, padding: "4px 0" }}>sin equipos — edítalo para armarlo</div>;
  }
  return (
    <div className="kit-piezas">
      {piezas.map(p => {
        const libre = !p.quien && !NO_ENTREGABLE[p.estado || ""];
        const soyYo = !!yo && p.id === yo;
        const dentro = (
          <>
            <span className="kit-pz-img">
              {p.cartel
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.cartel} alt="" referrerPolicy="no-referrer" />
                : <span>🎥</span>}
            </span>
            {p.folio && <span className="kit-pz-folio">{p.folio}</span>}
            <span className="kit-pz-n">{p.nombre}</span>
            {!libre && <span className="kit-pz-por">{porQueNo(p)}</span>}
          </>
        );
        const clase = `kit-pz${libre ? "" : " ocupada"}${soyYo ? " yo" : ""}`;
        return soyYo
          ? <span key={p.id} className={clase} title="este equipo">{dentro}</span>
          : <Link key={p.id} href={`/entidad/equipamiento/${p.id}`} className={clase}
              title={libre ? `${nombraPieza(p)} · disponible` : `${nombraPieza(p)} · ${porQueNo(p)}`}>
              {dentro}
            </Link>;
      })}
    </div>
  );
}
