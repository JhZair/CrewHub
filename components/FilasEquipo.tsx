"use client";
import { useState } from "react";
import { agruparUnidades, esGrupo, type Unidad, type GrupoUnidades } from "@/lib/compras";
import { colorEstadoEq } from "@/lib/estadosEquipo";

/* CINCO FILAS QUE DICEN LO MISMO NO INFORMAN CINCO VECES.
 *
 * Buscar «radio» devolvía cinco líneas idénticas —«Walkie-talkie Baofeng
 * BF-888S Radio»— y para saber cuántas hay y cómo están había que contarlas
 * a ojo. Con diez Claw Mini V-Rig la lista se vuelve un muro.
 *
 * Se agrupa por NOMBRE, no por combo: en el estante dos radios del mismo
 * modelo son lo mismo aunque se compraran con seis meses de diferencia. La
 * procedencia no se pierde —cada unidad sigue sabiendo de qué combo vino—,
 * simplemente no es lo que decide cómo se apilan.
 *
 * Y la cabecera del grupo dice el DESGLOSE por estado, no solo el total:
 * «5 unidades» esconde justo el dato que importa, que una está en
 * reparación. El grupo con algo que no está disponible arranca ABIERTO.
 */

export default function FilasEquipo({ unidades, filas }: {
  unidades: Unidad[];
  /** Las filas ya pintadas por el servidor, indexadas por id de equipo:
   *  así el grupo no tiene que saber cómo se dibuja un equipo, y no cruza
   *  ninguna función la frontera del servidor. */
  filas: Record<string, React.ReactNode>;
}) {
  const grupos = agruparUnidades(unidades);

  /* Arrancan ABIERTOS los grupos donde algo no está disponible: lo que hay
     que mirar no puede quedar detrás de un clic. Inicializador perezoso y
     no un efecto —con un efecto, el panel se abriría solo otra vez en cada
     refresco, deshaciendo lo que el usuario acabara de plegar—. */
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(
    grupos.filter(esGrupo).filter(g => g.unidades.some(u => u.estado !== "disponible")).map(g => g.k)));

  const alternar = (k: string) =>
    setAbiertos(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <>
      {grupos.map(g => {
        if (!esGrupo(g)) return <div key={g.id}>{filas[g.id]}</div>;
        const gr = g as GrupoUnidades;
        const abierto = abiertos.has(gr.k);
        return (
          <div key={gr.k} className="ug-caja">
            <button className="ug-h" onClick={() => alternar(gr.k)}>
              <span className="ug-flecha">{abierto ? "▾" : "▸"}</span>
              {/* Con foto, como cualquier otra fila de la lista. Plegadas, las
                  tres Aputure eran la unica linea sin imagen entre veinte que
                  si la tienen, y en una lista que se recorre MIRANDO —asi se
                  reconoce un equipo, no por el folio— el grupo desaparecia.
                  Da igual cual de las tres: son el mismo producto. */}
              <span className="mini-eq ug-img">
                {gr.cartel
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={gr.cartel} alt="" referrerPolicy="no-referrer" />
                  : <span>🎥</span>}
              </span>
              <b className="ug-nom">{gr.nombre}</b>
              <span className="ug-n">{gr.unidades.length} unidades</span>
              <span style={{ flex: 1 }} />
              {gr.porEstado.map(([e, n]) => (
                <span key={e} className="ug-est" style={{ color: colorEstadoEq(e) }}>
                  {n} {e.replace(/_/g, " ")}
                </span>
              ))}
            </button>
            {abierto && <div className="ug-cuerpo">{gr.unidades.map(u => <div key={u.id}>{filas[u.id]}</div>)}</div>}
          </div>
        );
      })}
    </>
  );
}
