"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import BotonDevolver from "@/components/BotonDevolver";
import DevolverLote from "@/components/DevolverLote";

/* EN USO AHORA — quién tiene qué, y cómo se devuelve rápido.
 *
 * Dos cosas que la lista plana hacía mal:
 *
 * 1. TODO EN UNA LÍNEA. Nombre del equipo, chip del proyecto, fecha y botón
 *    competían por el mismo renglón, así que «Gorra con Soporte para Cámara de
 *    Acción e Iluminación A» + «Puna Michiq: El pastor solitario» rompía la
 *    fila y el ↩ Devolver caía a un tercer renglón, desalineado. El ancho no
 *    era el problema: era meter dos cosas distintas —QUÉ es y PARA QUÉ salió—
 *    en la misma línea. Ahora el equipo va arriba y el proyecto abajo, con la
 *    fecha a su lado: la columna de la izquierda se lee de un vistazo.
 *
 * 2. DEVOLVER ERA TODO O UNO. Existía «Devolver los 7» (la persona entera) y
 *    el ↩ de cada fila, pero lo que pasa de verdad al volver de rodaje es que
 *    regresan NUEVE de doce —la cámara se queda para el respaldo, el trípode
 *    se lo llevó otro—. Sin punto medio, o se cerraba de más o no se cerraba
 *    nada, y el inventario decía «en uso» semanas después.
 *
 * La casilla de la cabecera marca a la persona completa; la selección cruza
 * personas a propósito, porque quien recibe está en la puerta recibiendo de
 * todos. Lo devuelto desaparece de `items` al refrescar, y la selección se
 * depura contra los ids vivos —no con un efecto—, así que no queda marcado
 * nada que ya no exista.
 */

export type UsoItem = {
  id: string;            // id del préstamo abierto
  desde: string;
  eqId: string; folio?: string | null; nombre: string; cartel?: string | null;
  perId: string; per: string; foto?: string | null;
  proyId?: string | null; proy?: string | null;
  /** De qué kit salió, si salió de uno, y de cuántas piezas es ese kit. */
  kitId?: string | null; kit?: string | null; kitTotal?: number;
};

/* Agrupa las piezas de un mismo kit dentro de una persona, respetando el orden
   en que llegaron. Lo que salió suelto no se inventa un kit: cae en un tramo
   final sin `kitId`, que se pinta plano. */
function subgrupos(items: UsoItem[]): { kitId: string | null; kit?: string | null; items: UsoItem[] }[] {
  const orden: string[] = [];
  const porKit = new Map<string, UsoItem[]>();
  const sueltos: UsoItem[] = [];
  items.forEach(it => {
    if (!it.kitId) { sueltos.push(it); return; }
    if (!porKit.has(it.kitId)) { porKit.set(it.kitId, []); orden.push(it.kitId); }
    porKit.get(it.kitId)!.push(it);
  });
  const out: { kitId: string | null; kit?: string | null; items: UsoItem[] }[] =
    orden.map(k => ({ kitId: k, kit: porKit.get(k)![0].kit, items: porKit.get(k)! }));
  if (sueltos.length) out.push({ kitId: null, kit: null, items: sueltos });
  return out;
}

const fechaCorta = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });

const mini = (url?: string | null, size = 40) => (
  <span className="eq-uso-mini" style={{ width: size, height: size }}>
    {url
      ? // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" />
      : <span style={{ fontSize: size * 0.5 }}>🎥</span>}
  </span>
);

const avatar = (url?: string | null, size = 28) => (
  <span className="eq-uso-avatar" style={{ width: size, height: size }}>
    {url
      ? // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" />
      : <span style={{ fontSize: size * 0.5 }}>👤</span>}
  </span>
);

export default function EnUsoAhora({ items }: { items: UsoItem[] }) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  /* Agrupado por PERSONA y no plano: la pregunta que se hace de verdad no es
     «dónde está la A-090», es «qué se llevó Michel» —y a la vuelta, qué tiene
     que devolver—. Doce filas sueltas obligan a leerlas todas para
     reconstruir eso a ojo. */
  const grupos = useMemo(() => {
    const m = new Map<string, { perId: string; per: string; foto?: string | null; items: UsoItem[] }>();
    items.forEach(it => {
      const g = m.get(it.perId) || { perId: it.perId, per: it.per, foto: it.foto, items: [] };
      g.items.push(it); m.set(it.perId, g);
    });
    return [...m.values()];
  }, [items]);

  /* La selección se lee contra lo que EXISTE. Después de devolver, el servidor
     manda la lista sin esos préstamos; si la selección se guardara tal cual, la
     barra seguiría ofreciendo devolver algo que ya volvió. */
  const vivos = useMemo(() => new Set(items.map(i => i.id)), [items]);
  const sel = useMemo(() => [...marcados].filter(id => vivos.has(id)), [marcados, vivos]);
  const marcado = (id: string) => marcados.has(id);

  const alterna = (id: string) =>
    setMarcados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const alternaGrupo = (ids: string[], todos: boolean) =>
    setMarcados(s => {
      const n = new Set(s);
      ids.forEach(id => todos ? n.delete(id) : n.add(id));
      return n;
    });

  return (
    <div className="card">
      <div className="panel-h" style={{ color: "var(--yellow)" }}>🤝 En uso ahora — quién tiene qué</div>

      {/* La barra solo aparece con algo marcado: una barra vacía permanente
          ocupa sitio y enseña a no mirarla. */}
      {sel.length > 0 && (
        <div className="eq-uso-barra">
          <b style={{ fontSize: 12.5 }}>✔ {sel.length} marcado{sel.length === 1 ? "" : "s"}</b>
          <span style={{ color: "var(--dim)", fontSize: 11.5 }}>de {items.length} en manos de alguien</span>
          <span style={{ flex: 1 }} />
          <DevolverLote prestamoIds={sel} min={1}
            etiqueta={`↩ Devolver ${sel.length === 1 ? "el marcado" : `los ${sel.length} marcados`}`}
            pregunta={`¿${sel.length === 1 ? "Volvió el equipo marcado" : `Volvieron los ${sel.length} equipos marcados`}?`} />
          <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11.5 }}
            onClick={() => setMarcados(new Set())}>Limpiar</button>
        </div>
      )}

      {grupos.map(g => {
        const ids = g.items.map(i => i.id);
        const nMarc = ids.filter(id => marcados.has(id)).length;
        const todos = nMarc === ids.length;
        return (
          <div key={g.perId} className="eq-uso-grupo">
            <div className="eq-uso-h">
              <input type="checkbox" checked={todos} onChange={() => alternaGrupo(ids, todos)}
                title={todos ? `Desmarcar lo de ${g.per}` : `Marcar los ${ids.length} de ${g.per}`}
                ref={el => { if (el) el.indeterminate = nMarc > 0 && !todos; }} />
              <Link href={`/entidad/persona/${g.perId}`} className="eq-uso-per">
                {avatar(g.foto)} {g.per}
              </Link>
              <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                {ids.length} equipo{ids.length === 1 ? "" : "s"}
                {nMarc > 0 && <span style={{ color: "var(--accent)" }}> · {nMarc} marcado{nMarc === 1 ? "" : "s"}</span>}
              </span>
            </div>

            {(() => {
              const fila = (p: UsoItem) => (
                <div key={p.id} className="eq-uso-fila" data-marcada={marcado(p.id) ? "1" : undefined}>
                  <input type="checkbox" checked={marcado(p.id)} onChange={() => alterna(p.id)}
                    title="Marcar para devolver" />
                  {mini(p.cartel)}
                  <div className="eq-uso-txt">
                    <div className="eq-uso-l1">
                      {p.folio && <span className="badge eq-uso-folio">{p.folio}</span>}
                      <Link href={`/entidad/equipamiento/${p.eqId}`} className="eq-uso-nom">{p.nombre}</Link>
                    </div>
                    <div className="eq-uso-l2">
                      {p.proy && p.proyId
                        ? <Link href={`/entidad/proyecto/${p.proyId}`} className="badge eq-uso-proy">📁 {p.proy}</Link>
                        /* Sin proyecto no se calla: un equipo fuera sin decir
                           para qué salió es justo el que nadie reclama. */
                        : <span className="eq-uso-sinproy">sin proyecto</span>}
                      <span className="eq-uso-desde">desde {fechaCorta(p.desde)}</span>
                    </div>
                  </div>
                  <BotonDevolver prestamoId={p.id} equipoId={p.eqId} />
                </div>
              );

              /* Dentro de la persona, por KIT. Roxana tenía tres equipos fuera
                 y los tres eran el mismo kit; la lista los daba como tres cosas
                 sin relación, así que a la vuelta había que acordarse de que
                 iban juntos. */
              return subgrupos(g.items).map(sg => {
                /* Fragment con clave: sin ella React trata este array anidado
                   como un hijo sin `key` y llena la consola de avisos. */
                if (!sg.kitId) return <Fragment key="_sueltos">{sg.items.map(fila)}</Fragment>;
                const idsK = sg.items.map(i => i.id);
                const nK = idsK.filter(id => marcados.has(id)).length;
                const todosK = nK === idsK.length;
                /* `kitTotal` es la composición del kit HOY, no la del día que
                   salió: si alguien le añade una pieza al kit, este «3 de 5»
                   pasa a «3 de 6» hacia atrás. Es a propósito —lo que importa
                   al recibir es qué falta ahora—, pero conviene saberlo. */
                const total = sg.items[0]?.kitTotal || sg.items.length;
                const cojo = sg.items.length < total;
                return (
                  <div key={sg.kitId} className="eq-uso-kit">
                    <div className="eq-uso-kit-h">
                      <input type="checkbox" checked={todosK} onChange={() => alternaGrupo(idsK, todosK)}
                        title={todosK ? "Desmarcar el kit" : `Marcar las ${idsK.length} piezas del kit`}
                        ref={el => { if (el) el.indeterminate = nK > 0 && !todosK; }} />
                      <span className="eq-uso-kit-n">📦 {sg.kit}</span>
                      {/* Un kit que salió cojo lo dice: si no, al devolverlo
                          nadie se entera de que hay otra pieza que cerrar. */}
                      <span style={{ fontSize: 11, color: cojo ? "var(--yellow)" : "var(--green)" }}>
                        {cojo ? `${sg.items.length} de ${total} piezas` : `completo · ${total} piezas`}
                      </span>
                    </div>
                    {sg.items.map(fila)}
                  </div>
                );
              });
            })()}
          </div>
        );
      })}
    </div>
  );
}
