"use client";
import Link from "@/components/Enlace";
import ChipPiezas from "@/components/ChipPiezas";
import { porQueNo, nombraPieza, valorPieza, type PiezaKit } from "@/lib/kits";
import { entregableEq } from "@/lib/estadosEquipo";

/* LAS PIEZAS DE UN KIT (O DE UN ENSAMBLADO), CON SU FOTO.
 *
 * Sin componente compartido esto se escribiría en cuatro sitios —el panel de
 * kits, la ficha del equipo, el bloque del combo y el ensamblado— y las copias
 * divergirían: ya pasó con el tipo de publicación, que acabó en diez archivos
 * y en dos versiones distintas (ver lib/tipos.ts).
 *
 * Una pieza que hoy no puede salir se apaga, pero NO se esconde: el kit es la
 * lista de empaque completa. Y el motivo va con nombre —«lo tiene KatyP»— y no
 * «no disponible», porque lo que hace falta saber es a quién llamar.
 *
 * ── LISTA PLANA ──
 * Tuvo un conmutador para agrupar por combo o por kit. Se fue: los ENSAMBLADOS
 * absorben las piezas pequeñas —la varilla, el cabezal, los tornillos dejan de
 * ser filas y pasan a estar dentro de una— y eran justamente ellas las que
 * hacían la lista tan larga que había que partirla. Resuelto el problema, la
 * agrupación era andamio: dos filas de chips y un encabezado por grupo para
 * ordenar ocho cosas.
 * La procedencia no se pierde: cada pieza dice su combo en el precio
 * («precio en C-011») y el listado de /equipamiento sigue agrupando.
 */

function Pieza({ p, yo, enCasa, onQuitar }: {
  p: PiezaKit; yo?: string; enCasa?: boolean;
  /** Sacar ESTA pieza. Solo lo pasa quien puede deshacerlo —el ensamblado—;
   *  en un kit o en un combo la lista es de lectura. */
  onQuitar?: (id: string) => void;
}) {
  /* `enCasa`: esta lista es la del equipo que CONTIENE la pieza. Ahí estar
     «ensamblado» no es un impedimento, es el estado normal, y decir «está
     montado en otro equipo» en la ficha del equipo que la monta es circular.
     En un kit sí es un veto: la pieza no puede salir y el kit tiene que
     decirlo. La misma fila, dos contextos. */
  const veto = !entregableEq(p.estado) && !(enCasa && p.estado === "ensamblado");
  const libre = !p.quien && !veto;
  const soyYo = !!yo && p.id === yo;
  const sub = (p.subcategoria || "").trim() || (p.categoria || "").trim();
  const val = valorPieza(p);

  const dentro = (
    <>
      <span className="kit-pz-img">
        {p.cartel
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.cartel} alt="" referrerPolicy="no-referrer" />
          : <span>🎥</span>}
      </span>
      <span className="kit-pz-txt">
        <span className="kit-pz-l1">
          {p.folio && <span className="kit-pz-folio">{p.folio}</span>}
          <span className="kit-pz-n">{p.nombre}</span>
        </span>
        <span className="kit-pz-l2">
          {sub && <span>{sub}</span>}
          {/* El `~` no es decoración: dice que ese número salió de repartir una
              boleta entre varias piezas, no de lo que costó ESTA. */}
          {val.valor > 0
            ? <span className={`kit-pz-precio${val.estimado ? " esti" : ""}`}
                title={val.estimado
                  ? `Parte que le toca del combo ${p.combo?.codigo || ""}, repartido entre las piezas sin precio propio. No es lo que costó esta pieza.`
                  : undefined}>
                {val.estimado ? "~" : ""}S/ {Math.round(val.valor).toLocaleString("es-PE")}
              </span>
            : p.combo ? <span className="kit-pz-encombo">precio en {p.combo.codigo || p.combo.nombre}</span> : null}
          {!libre && <span className="kit-pz-por">{porQueNo(p)}</span>}
          {enCasa && p.estado === "ensamblado" && <span className="kit-pz-aqui">montada</span>}
          {/* Esta pieza es a su vez un ensamblado: al devolver el kit hay que
              contar lo que lleva dentro, no solo las filas. */}
          <ChipPiezas piezas={p.montadas || []}
            titulo="Este equipo va armado: pulsa para ver qué piezas lleva dentro" />
        </span>
      </span>
    </>
  );

  const clase = `kit-pz${libre ? "" : " ocupada"}${soyYo ? " yo" : ""}`;
  const fila = soyYo
    ? <span className={clase} title="este equipo">{dentro}</span>
    : <Link href={`/entidad/equipamiento/${p.id}`} className={clase}
        title={libre ? `${nombraPieza(p)} · disponible` : `${nombraPieza(p)} · ${porQueNo(p)}`}>
        {dentro}
      </Link>;
  if (!onQuitar) return fila;
  /* La ✕ va FUERA del enlace: dentro sería un botón dentro de un <a>, que el
     navegador reacomoda al parsear y React falla la hidratación. Y así el
     nombre sigue llevando a la ficha, que es lo que se espera de él. */
  return (
    <span className="kit-pz-con-x">
      {fila}
      <button type="button" className="ens-quita" title={`Sacar ${nombraPieza(p)} del ensamblado`}
        onClick={() => onQuitar(p.id)}>✕</button>
    </span>
  );
}

export default function PiezasKit({ piezas, yo, enCasa, onQuitar }: {
  piezas: PiezaKit[];
  /** Id del equipo cuya ficha se está viendo: se marca y no se enlaza a sí mismo. */
  yo?: string;
  /** Esta lista es la del equipo que contiene las piezas: aquí «ensamblado»
   *  es el estado normal y no se pinta como impedimento. */
  enCasa?: boolean;
  /** Si se pasa, cada pieza lleva una ✕ para sacarla. */
  onQuitar?: (id: string) => void;
}) {
  if (!piezas.length) {
    return <div style={{ color: "var(--dim)", fontSize: 11.5, padding: "4px 0" }}>sin equipos — edítalo para armarlo</div>;
  }
  return (
    <div className="kit-piezas">
      {piezas.map(p => <Pieza key={p.id} p={p} yo={yo} enCasa={enCasa} onQuitar={onQuitar} />)}
    </div>
  );
}
