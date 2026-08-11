import Link from "next/link";
import { NO_ENTREGABLE, porQueNo, nombraPieza, agruparPorCombo, valeAgrupar,
  type PiezaKit } from "@/lib/kits";

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
 *
 * POR PROCEDENCIA cuando hay más de una. Quince miniaturas seguidas son una
 * pared: partidas por el combo del que vinieron contestan lo que uno se
 * pregunta mirándolas —«esto vino todo junto», «la batería de repuesto, ¿de
 * qué compra salió?»—. Con un solo combo no se agrupa: un único encabezado
 * repitiendo lo que ya se sabe del conjunto entero es ruido, y por eso la
 * ficha del equipo y el bloque del combo siguen viéndose planos sin pedir
 * nada.
 */

/* A nivel de módulo y no dentro del render: un componente definido dentro de
   otro es un TIPO nuevo en cada pintada, y React desmonta y vuelve a montar
   todo lo que cuelga de él. Aquí no hay estado que perder, pero es la misma
   trampa que vació los editores del guion a media frase. */
function Pieza({ p, yo }: { p: PiezaKit; yo?: string }) {
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
    ? <span className={clase} title="este equipo">{dentro}</span>
    : <Link href={`/entidad/equipamiento/${p.id}`} className={clase}
        title={libre ? `${nombraPieza(p)} · disponible` : `${nombraPieza(p)} · ${porQueNo(p)}`}>
        {dentro}
      </Link>;
}

export default function PiezasKit({ piezas, yo }: {
  piezas: PiezaKit[];
  /** Id del equipo cuya ficha se está viendo: se marca y no se enlaza a sí mismo. */
  yo?: string;
}) {
  if (!piezas.length) {
    return <div style={{ color: "var(--dim)", fontSize: 11.5, padding: "4px 0" }}>sin equipos — edítalo para armarlo</div>;
  }

  const grupos = agruparPorCombo(piezas);
  if (!valeAgrupar(grupos)) {
    return (
      <div className="kit-piezas">
        {piezas.map(p => <Pieza key={p.id} p={p} yo={yo} />)}
      </div>
    );
  }

  return (
    <div className="kit-grupos">
      {grupos.map(g => (
        <div key={g.clave} className="kit-grupo">
          <div className="kit-grupo-h">
            {g.nombre
              ? <>
                  <span className="badge cmp-cod">🧾 {g.codigo || g.nombre}</span>
                  {g.codigo && <span className="kit-grupo-n">{g.nombre}</span>}
                </>
              /* No es «ninguno»: es que entraron por separado, o de antes de
                 que se registraran las compras. Decirlo evita que parezca un
                 dato que falta por cargar. */
              : <span className="kit-grupo-n suelto">sin combo — entraron por separado</span>}
            <span className="kit-grupo-c">{g.items.length}</span>
          </div>
          <div className="kit-piezas">
            {g.items.map(p => <Pieza key={p.id} p={p} yo={yo} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
