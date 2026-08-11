"use client";
import { useState } from "react";
import Link from "next/link";
import { NO_ENTREGABLE, porQueNo, nombraPieza, agruparPorCombo, agruparPorKit,
  valeAgrupar, type PiezaKit, type Grupo } from "@/lib/kits";

/* LAS PIEZAS DE UN KIT, CON SU FOTO.
 *
 * Sin componente compartido esto se escribiría dos veces —el panel de
 * /equipamiento y la ficha de cada equipo— y las dos copias divergirían: ya
 * pasó con el tipo de publicación, que acabó en diez sitios y en dos versiones
 * distintas (ver lib/tipos.ts). Una sola pieza pintada de una sola forma.
 *
 * Una pieza que hoy no puede salir se apaga, pero NO se esconde: el kit es la
 * lista de empaque completa. Y el motivo va con nombre —«lo tiene KatyP»— y no
 * «no disponible», porque lo que hace falta saber es a quién llamar.
 *
 * DOS EJES, UNO A LA VEZ.
 *   🧾 combo — de qué compra vino cada pieza. Contesta «¿está en garantía?»,
 *      «¿esto vino todo junto?».
 *   📦 kit — con qué otras piezas sale junta. Contesta «la gorra y el SmallRig
 *      son un kit», que la procedencia no puede contestar: no vinieron de la
 *      misma compra pero viajan en la misma bolsa.
 *
 * Uno a la vez, y dicho en pantalla. Mezclarlos —combo arriba, kit dentro de
 * «sin combo»— haría que la misma lista se leyera con dos criterios según por
 * dónde vayas, y no habría forma de saber cuál manda.
 *
 * El conmutador solo aparece si LOS DOS ejes dicen algo. Si solo uno agrupa se
 * usa ese sin preguntar; si ninguno, la lista va plana. Un botón que lleva a
 * una vista de un solo grupo es un botón que enseña a no pulsarlo.
 *
 * Ya no es componente de servidor: el conmutador es estado. Lo que se gana
 * —elegir el eje sin recargar— vale el peso, y las piezas que recibe son datos
 * planos, así que cruzan la frontera sin problema.
 */

type Eje = "kit" | "combo";

/* A nivel de módulo y no dentro del render: un componente definido dentro de
   otro es un TIPO nuevo en cada pintada, y React desmonta y vuelve a montar
   todo lo que cuelga de él. Aquí no hay estado que perder, pero es la misma
   trampa que vaciaba los editores del guion a media frase. */
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

function Cabecera({ g, eje }: { g: Grupo<PiezaKit>; eje: Eje }) {
  const parcial = eje === "combo" && !!g.total && g.total > g.items.length;
  return (
    <div className="kit-grupo-h">
      {g.nombre
        ? (eje === "combo"
            ? <>
                <span className="badge cmp-cod">🧾 {g.codigo || g.nombre}</span>
                {g.codigo && <span className="kit-grupo-n">{g.nombre}</span>}
              </>
            : <span className="badge eq-kit-chip" style={{ maxWidth: 260 }}>📦 {g.nombre}</span>)
        /* No es «ninguno»: es que no comparten nada más, o que entraron por
           separado. Decirlo evita que parezca un dato que falta por cargar. */
        : <span className="kit-grupo-n suelto">
            {eje === "combo" ? "sin combo — entraron por separado" : "sin otro kit — solo salen en este"}
          </span>}

      {/* «2 de 3»: el kit se lleva parte del combo. Un «2» a secas se lee como
          cuántas trajo la compra, y quien se sabe el combo lo toma por un
          error —«pero si compré tres»—. Lo que falta no falta por cargar:
          está en el inventario, fuera de este kit. */}
      {parcial
        ? <span className="kit-grupo-c parcial"
            title={`El combo tiene ${g.total} unidades. Este kit se lleva ${g.items.length}; las otras ${(g.total as number) - g.items.length} están en el inventario, fuera del kit.`}>
            {g.items.length} de {g.total}
          </span>
        : <span className="kit-grupo-c">{g.items.length}</span>}
    </div>
  );
}

export default function PiezasKit({ piezas, yo, kitActual }: {
  piezas: PiezaKit[];
  /** Id del equipo cuya ficha se está viendo: se marca y no se enlaza a sí mismo. */
  yo?: string;
  /** Id del kit que se está mirando: no se agrupa bajo su propio nombre. */
  kitActual?: string;
}) {
  const gCombo = agruparPorCombo(piezas);
  const gKit = agruparPorKit(piezas, kitActual);
  const diceCombo = valeAgrupar(gCombo);
  const diceKit = valeAgrupar(gKit);

  /* Arranca por KIT. Si por kit no hay nada que agrupar pero por combo sí,
     arranca por combo: el valor por defecto es una preferencia, no una
     obligación de enseñar una lista de un solo grupo. */
  const [eje, setEje] = useState<Eje>(diceKit ? "kit" : "combo");

  if (!piezas.length) {
    return <div style={{ color: "var(--dim)", fontSize: 11.5, padding: "4px 0" }}>sin equipos — edítalo para armarlo</div>;
  }

  if (!diceCombo && !diceKit) {
    return (
      <div className="kit-piezas">
        {piezas.map(p => <Pieza key={p.id} p={p} yo={yo} />)}
      </div>
    );
  }

  const conmutador = diceCombo && diceKit;
  const usado: Eje = conmutador ? eje : (diceKit ? "kit" : "combo");
  const grupos = usado === "kit" ? gKit : gCombo;

  return (
    <>
      {conmutador && (
        <div className="kit-eje">
          <span>agrupar por</span>
          <button type="button" aria-pressed={usado === "combo"} onClick={() => setEje("combo")}
            title="De qué compra vino cada pieza">🧾 combo</button>
          <button type="button" aria-pressed={usado === "kit"} onClick={() => setEje("kit")}
            title="Con qué otras piezas sale junta">📦 kit</button>
          {/* Una pieza en dos kits sale en los dos grupos, así que la suma
              puede pasar del total. Se avisa aquí, mientras se cuenta, y no
              en un pie que nadie lee después. */}
          {usado === "kit" && <span className="kit-eje-n">una pieza puede estar en varios kits</span>}
        </div>
      )}

      <div className="kit-grupos">
        {grupos.map(g => (
          <div key={g.clave} className="kit-grupo">
            <Cabecera g={g} eje={usado} />
            <div className="kit-piezas">
              {g.items.map(p => <Pieza key={p.id} p={p} yo={yo} />)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
