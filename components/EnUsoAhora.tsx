"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "@/components/Enlace";
import BotonDevolver from "@/components/BotonDevolver";
import DevolverLote from "@/components/DevolverLote";
import ChipPiezas, { type PiezaMontada } from "@/components/ChipPiezas";
import HojaEquipos from "@/components/HojaEquipos";
import { buscadorDe, pal } from "@/lib/buscar";

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
  /** Quién lo entregó. Una entrega la hacen DOS personas y hasta ahora solo
   *  se guardaba una: es la mitad que falta el día que algo no aparece y
   *  quien lo tiene dice que no se lo llevó. */
  entrego?: string | null; entregoFoto?: string | null;
  /* QUÉ ES la cosa, no solo por qué salió. Con la miniatura a 60 px sobra
     alto para una línea más, y la fila pasa de decir «una mochila que salió
     el 11» a decir «una mochila de cámara de 240 soles que salió el 11». Al
     recibir de vuelta es la diferencia entre reconocerla y creer
     reconocerla. */
  categoria?: string | null; subcategoria?: string | null;
  /** Piezas montadas dentro: lo que hay que contar al recibirlo de vuelta. */
  piezas?: PiezaMontada[];
  valor?: number | null;
  /** Código de su combo, para cuando el precio vive en la boleta y no aquí. */
  comboCodigo?: string | null;
};

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

/* Agrupa las piezas de un mismo kit dentro de una persona, respetando el orden
   en que llegaron. Lo que salió suelto no se inventa un kit: cae en un tramo
   final sin `kitId`, que se pinta plano. */
export function subgrupos(items: UsoItem[]): { kitId: string | null; kit?: string | null; items: UsoItem[] }[] {
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

/* ── LOS IGUALES, JUNTOS ──
 *
 * Tres «Lámpara lineal tipo barra WiZ» entraron sueltas y quedaron repartidas
 * entre los treinta y seis: una arriba, dos catorce filas más abajo. Leyéndolas
 * así no hay forma de saber que son tres de lo mismo — y eso es justo el dato
 * que hace falta al contar, porque lo que se cuenta son unidades de una cosa,
 * no cosas distintas que se llaman parecido.
 *
 * La clave incluye categoría y subcategoría además del nombre: dos equipos con
 * el mismo nombre y distinta categoría no son el mismo modelo, y juntarlos
 * mentiría sobre lo que hay.
 *
 * El orden es el de la PRIMERA aparición: los repetidos suben hasta su primer
 * hermano y el resto de la lista se queda donde estaba. Reordenar del todo
 * —por nombre, por ejemplo— movería de sitio cosas que la persona ya tenía
 * ubicadas de haber mirado la lista antes.
 */
const claveModelo = (i: UsoItem) =>
  [i.nombre.trim().toLowerCase(), i.categoria || "", i.subcategoria || ""].join("|");

export function iguales(items: UsoItem[]): { clave: string; nombre: string; items: UsoItem[] }[] {
  const orden: string[] = [];
  const m = new Map<string, UsoItem[]>();
  items.forEach(it => {
    const k = claveModelo(it);
    if (!m.has(k)) { m.set(k, []); orden.push(k); }
    m.get(k)!.push(it);
  });
  return orden.map(k => ({ clave: k, nombre: m.get(k)![0].nombre, items: m.get(k)! }));
}

const fechaCorta = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });

/* Sin tamaño: lo pone `--mini` en globals.css, que es el mismo para todas las
   miniaturas de equipo de la aplicación. Estaba a 40 aquí, a 30 en las piezas
   de un kit y a 60 en el listado — la misma cámara en tres tamaños según la
   pantalla, y las pequeñas no se reconocían. */
const mini = (url?: string | null) => (
  <span className="eq-uso-mini">
    {url
      ? // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" />
      : <span>🎥</span>}
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
  /* Cada persona arranca PLEGADA. Con nueve equipos de una y tres de otra,
     el panel abierto son cuarenta filas antes de llegar al inventario, que
     es a lo que se entra en esta página. Y la pregunta que se hace de
     verdad —«¿quién tiene cosas fuera?»— se contesta con la cabecera sola.
     Abrir es para cuando ya se sabe a quién mirar.
     La casilla de la cabecera sigue funcionando con el grupo cerrado: se
     puede marcar los nueve de KatyP sin desplegar nada. */
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const alternarGrupo = (id: string) =>
    setAbiertos(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* Quién está imprimiendo. La hoja se monta solo mientras dura la impresión y
     desaparece al terminar: dejarla en el documento la haría salir en cualquier
     Ctrl+P posterior, encima de lo que se quisiera imprimir de verdad. */
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);

  /* ══════════════════════════════════════════════════════════════════════
     EL BUSCADOR RÁPIDO

     Las personas arrancan PLEGADAS y con veintiséis equipos fuera repartidos
     entre cuatro personas, encontrar «¿dónde está la A-172?» es abrir grupo
     por grupo. Y la pregunta del día no siempre es «qué tiene Katy»: a veces
     es «esto que tengo en la mano, ¿de quién es?».

     Busca por PERSONA y también por equipo —folio, nombre, categoría—, por
     proyecto y por kit: una sola caja, porque quien está recibiendo material
     en la puerta no va a elegir primero en qué campo buscar.

     ⚠ Usa `buscadorDe` de lib/buscar, y no `coincide` de lib/texto. Los dos
     buscan sin tildes y por palabras sueltas, pero `buscadorDe` es el que usan
     la pestaña de INVENTARIO —la de al lado— y el buscador global, y trae dos
     cosas más: convierte los guiones bajos en espacios («no_aparece» se
     encuentra escribiendo «no aparece») y añade el esqueleto fonético quechua,
     con el que «mujunacuy» encuentra «Mujunakuy».
     Dos pestañas de la misma sección con dos ideas distintas de «parecido» es
     exactamente cómo se acaba con una que encuentra un equipo y otra que no.
     ══════════════════════════════════════════════════════════════════════ */
  const [q, setQ] = useState("");
  const hayFiltro = !!q.trim();

  /* El pajar de cada fila, armado una vez y no en cada tecla. `pal` es el
     mismo que usa el inventario: quita los nulos —que en una plantilla se
     convierten en el texto «undefined» y se quedan dentro— y cambia los
     guiones bajos por espacios. */
  const pajares = useMemo(() => new Map(items.map(i =>
    [i.id, pal(i.per, i.folio, i.nombre, i.categoria, i.subcategoria, i.proy, i.kit)])), [items]);
  const coincide = useMemo(() => buscadorDe(q), [q]);

  /* Agrupado por PERSONA y no plano: la pregunta que se hace de verdad no es
     «dónde está la A-090», es «qué se llevó Michel» —y a la vuelta, qué tiene
     que devolver—. Doce filas sueltas obligan a leerlas todas para
     reconstruir eso a ojo.
     ⚠ Cada grupo lleva DOS listas: `items` es todo lo que esa persona tiene
     —lo que se imprime, que no puede depender de lo que haya escrito en una
     caja de búsqueda— y `visibles` es lo que pasa el filtro, que es lo que se
     pinta y lo que marca la casilla de la cabecera. */
  const grupos = useMemo(() => {
    const m = new Map<string, { perId: string; per: string; foto?: string | null; items: UsoItem[]; visibles: UsoItem[] }>();
    items.forEach(it => {
      const g = m.get(it.perId) || { perId: it.perId, per: it.per, foto: it.foto, items: [], visibles: [] };
      g.items.push(it);
      if (!hayFiltro || coincide(pajares.get(it.id) || "")) g.visibles.push(it);
      m.set(it.perId, g);
    });
    /* Con filtro, quien no tiene nada que enseñar no ocupa sitio. Sin filtro
       no se cae nadie: un grupo vacío no existe. */
    return [...m.values()].filter(g => g.visibles.length > 0);
  }, [items, hayFiltro, coincide, pajares]);

  const nVisibles = useMemo(() => grupos.reduce((a, g) => a + g.visibles.length, 0), [grupos]);
  /** Los ids que el filtro deja ver. Sirve para decir cuántos de los marcados
   *  quedaron fuera de la pantalla. */
  const idsVisibles = useMemo(
    () => new Set(grupos.flatMap(g => g.visibles.map(i => i.id))), [grupos]);

  /* La selección se lee contra lo que EXISTE. Después de devolver, el servidor
     manda la lista sin esos préstamos; si la selección se guardara tal cual, la
     barra seguiría ofreciendo devolver algo que ya volvió. */
  const vivos = useMemo(() => new Set(items.map(i => i.id)), [items]);
  const sel = useMemo(() => [...marcados].filter(id => vivos.has(id)), [marcados, vivos]);
  const ocultosMarcados = useMemo(
    () => (hayFiltro ? sel.filter(id => !idsVisibles.has(id)).length : 0),
    [hayFiltro, sel, idsVisibles]);
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

      {/* ⚠ Con menos de diez fuera no hay caja: se ven todas de un vistazo y
          una caja que dice «busca entre las 4» es ruido. Con cero sería peor —
          «busca entre las 0» encima de «no hay nada fuera» se lee como avería.
          ⚠⚠ PERO SIEMPRE QUE HAYA FILTRO, cueste lo que cueste. Sin el
          `|| hayFiltro` se llegaba a un encierro: doce fuera, buscas «Katy»,
          devuelves los siete suyos, y al refrescar quedan cinco → la caja se
          desmonta CON EL TEXTO DENTRO, `q` sigue valiendo «Katy», el filtro
          sigue aplicándose y el panel esconde los cinco que quedan diciendo
          «nada coincide». Sin input, sin ✕ y sin Escape —vive en el input— no
          se salía sin recargar. Una caja que se lleva su propio botón de
          apagado es peor que no tenerla. */}
      {(items.length >= 10 || hayFiltro) && (
        <div className="clx-buscar" role="search">
          <span className="clx-lupa" aria-hidden="true">🔍</span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            /* Sin `autoFocus`: este panel está a media pantalla y el navegador
               saltaría hasta él al cargar, moviendo lo que se estaba mirando.
               Escape la vacía, que es lo que se busca al equivocarse. */
            onKeyDown={e => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }}
            placeholder={`Busca entre los ${items.length} que están fuera: persona, folio, equipo, proyecto…`}
            aria-label="Buscar entre los equipos que están fuera"
            className="clx-input" />
          {!!q && (
            <button type="button" className="clx-x" onClick={() => setQ("")}
              aria-label="Limpiar la búsqueda" title="Limpiar">✕</button>
          )}
        </div>
      )}

      {/* El recuento SIEMPRE que haya filtro, también cuando es cero: «nada se
          llama así» es una respuesta; un panel en blanco es un fallo aparente. */}
      {hayFiltro && (
        <div className="clx-cuenta" aria-live="polite">
          {nVisibles === 0
            ? <>Nada de lo que está fuera coincide con «{q.trim()}». Se busca por
                <b> persona, folio, equipo, categoría, proyecto o kit</b> — no por
                estado ni por fecha.</>
            : <>{nVisibles} de {items.length} · en {grupos.length} persona{grupos.length === 1 ? "" : "s"}</>}
        </div>
      )}

      {/* La barra solo aparece con algo marcado: una barra vacía permanente
          ocupa sitio y enseña a no mirarla. */}
      {sel.length > 0 && (
        <div className="eq-uso-barra">
          <b style={{ fontSize: 12.5 }}>✔ {sel.length} marcado{sel.length === 1 ? "" : "s"}</b>
          {/* ⚠ CUÁNTOS DE ELLOS NO SE VEN. La selección sobrevive al filtro a
              propósito —se marca a Katy, se busca a Piero y se devuelve todo
              junto en la puerta— pero entonces «Devolver los 5» cierra dos
              préstamos que no están en pantalla. Y en el caso peor —filtro sin
              resultados— la pantalla decía «nada coincide» y encima ofrecía
              devolver cinco de un clic. Eso no es memoria, es una trampa: se
              dice, y en ámbar. */}
          {ocultosMarcados > 0
            ? <span style={{ color: "var(--yellow)", fontSize: 11.5 }}>
                · {ocultosMarcados} fuera de la búsqueda
              </span>
            : <span style={{ color: "var(--dim)", fontSize: 11.5 }}>de {items.length} en manos de alguien</span>}
          <span style={{ flex: 1 }} />
          <DevolverLote prestamoIds={sel} min={1}
            etiqueta={`↩ Devolver ${sel.length === 1 ? "el marcado" : `los ${sel.length} marcados`}`}
            pregunta={`¿${sel.length === 1 ? "Volvió el equipo marcado" : `Volvieron los ${sel.length} equipos marcados`}?`} />
          <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11.5 }}
            onClick={() => setMarcados(new Set())}>Limpiar</button>
        </div>
      )}

      {grupos.map(g => {
        const ids = g.visibles.map(i => i.id);
        const nMarc = ids.filter(id => marcados.has(id)).length;
        const todos = nMarc === ids.length;
        /* ⚠ CON FILTRO, ABIERTO. Si al buscar se respetara el plegado, teclear
           «A-172» dejaría el resultado ESCONDIDO dentro de una cabecera
           cerrada y la pantalla parecería decir que no hay nada. Es la misma
           regla que `ListaPeliculas`: cuando hay filtro no hay grupos, hay
           coincidencias. */
        const abierto = hayFiltro || abiertos.has(g.perId);
        const proys = [...new Set(g.visibles.map(i => i.proy).filter(Boolean))] as string[];
        return (
          <div key={g.perId} className="eq-uso-grupo">
            <div className="eq-uso-h">
              <input type="checkbox" checked={todos} onChange={() => alternaGrupo(ids, todos)}
                title={todos ? `Desmarcar lo de ${g.per}` : `Marcar los ${ids.length} de ${g.per}`}
                ref={el => { if (el) el.indeterminate = nMarc > 0 && !todos; }} />
              {/* El desplegador es su propio botón y no la fila entera: la
                  fila lleva dentro un enlace a la persona y una casilla, y
                  hacerla toda pulsable convertiría cada intento de marcar en
                  un despliegue. */}
              {/* ⚠ Con filtro está DESACTIVADO, no solo inerte. Antes seguía
                  llamando a `alternarGrupo`: el clic no hacía nada visible —el
                  `hayFiltro ||` gana— pero apuntaba el grupo en `abiertos`, y
                  al borrar el filtro aparecía abierto. O sea que el botón no
                  obedecía cuando se le pedía y obedecía cuando ya no. */}
              <button className="dato-btn eq-uso-plegar" disabled={hayFiltro}
                onClick={() => { if (!hayFiltro) alternarGrupo(g.perId); }}
                title={hayFiltro ? "Con la búsqueda puesta, los grupos van abiertos"
                  : abierto ? "Plegar" : `Ver los ${ids.length} de ${g.per}`}>
                {abierto ? "▾" : "▸"}
              </button>
              <Link href={`/entidad/persona/${g.perId}`} className="eq-uso-per">
                {avatar(g.foto)} {g.per}
              </Link>
              <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                {/* Con filtro, «3 de 24»: decir «3 equipos» de quien tiene
                    veinticuatro es falso, y encima se lee como que devolvió
                    los otros veintiuno. */}
                {hayFiltro && g.visibles.length < g.items.length
                  ? <>{g.visibles.length} de {g.items.length}</>
                  : <>{ids.length} equipo{ids.length === 1 ? "" : "s"}</>}
                {nMarc > 0 && <span style={{ color: "var(--accent)" }}> · {nMarc} marcado{nMarc === 1 ? "" : "s"}</span>}
              </span>
              {/* Con el grupo plegado, PARA QUÉ los tiene. Es lo que convierte
                  la cabecera en información y no en un botón: «KatyP · 9
                  equipos» no dice nada que no se supiera. */}
              {!abierto && proys.length > 0 && (
                <span className="eq-uso-proys">
                  {proys.slice(0, 2).join(" · ")}
                  {proys.length > 2 && ` · +${proys.length - 2}`}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {/* ── EL PAPEL ──
                  Quien se lleva treinta y seis equipos a una zona sin señal no
                  puede contar contra la aplicación: allá no existe. El botón
                  está en la cabecera de la persona y funciona con el grupo
                  PLEGADO —imprime `g.items`, no lo que se vea—, porque si
                  obligara a desplegar primero sería un paso que se olvida el
                  día que hay prisa, que es justo el día que se sale a rodar. */}
              {/* ⚠ Imprime `g.items`: los de la persona, no los que el filtro
                  deje ver. El papel se lleva a una zona sin señal y allá no
                  hay caja de búsqueda que explique por qué faltan veintiuno. */}
              <button className="dato-btn eq-uso-print"
                title={`Imprimir la lista de los ${g.items.length} de ${g.per}`}
                onClick={() => setImprimiendo(g.perId)}>🖨</button>
            </div>

            {imprimiendo === g.perId && (
              <HojaEquipos per={g.per} items={g.items} grupos={subgrupos(g.items)}
                onCerrar={() => setImprimiendo(null)} />
            )}

            {abierto && (() => {
              const fila = (p: UsoItem) => (
                <div key={p.id} className="eq-uso-fila" data-marcada={marcado(p.id) ? "1" : undefined}>
                  <input type="checkbox" checked={marcado(p.id)} onChange={() => alterna(p.id)}
                    title="Marcar para devolver" />
                  {mini(p.cartel)}
                  <div className="eq-uso-txt">
                    <div className="eq-uso-l1">
                      {p.folio && <span className="badge eq-uso-folio">{p.folio}</span>}
                      {/* Salió armado. Al recibirlo, un monopod sin su cabezal
                          pesa casi lo mismo: si la fila no lo dice, la pieza
                          que falta se descubre el mes que viene. */}
                      <ChipPiezas piezas={p.piezas || []}
                        titulo="Salió armado: pulsa para ver qué piezas lleva dentro" />
                      <Link href={`/entidad/equipamiento/${p.eqId}`} className="eq-uso-nom">{p.nombre}</Link>
                    </div>
                    {/* QUÉ ES. Categoría, subcategoría y cuánto vale: el
                        contexto del equipo, separado del contexto del
                        préstamo que va debajo. Juntos en una línea, «cámara»
                        y «sin proyecto» se leían como si dijeran lo mismo. */}
                    <div className="eq-uso-l2 eq-uso-que">
                      {p.categoria && <span>{p.categoria}</span>}
                      {p.subcategoria && <><span className="eq-uso-sep">·</span><span>{p.subcategoria}</span></>}
                      {p.valor && p.valor > 0
                        ? <><span className="eq-uso-sep">·</span><span className="eq-uso-precio">{soles(p.valor)}</span></>
                        /* Sin precio propio pero con combo, el dato existe y
                           está en la boleta. Se dice así y no se repite el
                           código dos veces, igual que en el listado. */
                        : p.comboCodigo
                          ? <><span className="eq-uso-sep">·</span><span className="eq-uso-encombo">precio en {p.comboCodigo}</span></>
                          : null}
                    </div>
                    <div className="eq-uso-l2">
                      {p.proy && p.proyId
                        ? <Link href={`/entidad/proyecto/${p.proyId}`} className="badge eq-uso-proy">📁 {p.proy}</Link>
                        /* Sin proyecto no se calla: un equipo fuera sin decir
                           para qué salió es justo el que nadie reclama. */
                        : <span className="eq-uso-sinproy">sin proyecto</span>}
                      <span className="eq-uso-desde">desde {fechaCorta(p.desde)}</span>
                      {/* Quién lo dio. Los préstamos anteriores a que esto se
                          guardara no llevan nombre, y se DICE —«entregó: no se
                          registró»— en vez de callar: un hueco en blanco se
                          lee como que nadie lo entregó, que es otra cosa. */}
                      <span className="eq-uso-entrego"
                        title={p.entrego ? `Se lo entregó ${p.entrego}` : "Este préstamo es anterior a que se guardara quién entrega"}>
                        {p.entrego
                          ? <>{avatar(p.entregoFoto, 15)} entregó {p.entrego}</>
                          : <span className="sinreg">entregó: no se registró</span>}
                      </span>
                    </div>
                  </div>
                  <BotonDevolver prestamoId={p.id} equipoId={p.eqId} />
                </div>
              );

              /* Un tramo —lo que hay dentro de un kit, o lo suelto— con los
                 iguales recogidos. Uno solo no lleva cabecera: un «1 igual»
                 sobre cada fila sería ruido en treinta y seis renglones. */
              const tramo = (its: UsoItem[]) => iguales(its).map(gi => {
                if (gi.items.length === 1) return <Fragment key={gi.clave}>{fila(gi.items[0])}</Fragment>;
                const idsI = gi.items.map(i => i.id);
                const nI = idsI.filter(id => marcados.has(id)).length;
                const todosI = nI === idsI.length;
                return (
                  <div key={gi.clave} className="eq-uso-igual">
                    <div className="eq-uso-igual-h">
                      {/* Marcar los tres de una: se devuelven juntos porque
                          salieron juntos, y hacerlo de uno en uno es donde se
                          queda el tercero sin cerrar. */}
                      <input type="checkbox" checked={todosI} onChange={() => alternaGrupo(idsI, todosI)}
                        title={todosI ? "Desmarcar los iguales" : `Marcar las ${idsI.length} unidades`}
                        ref={el => { if (el) el.indeterminate = nI > 0 && !todosI; }} />
                      <span className="eq-uso-igual-n">×{gi.items.length}</span>
                      <span className="eq-uso-igual-t">{gi.nombre}</span>
                      {/* Los folios en la cabecera: es lo que se va a buscar
                          escrito en los equipos, y verlos de un vistazo evita
                          recorrer las tres filas para reunirlos. */}
                      <span className="eq-uso-igual-f">
                        {gi.items.map(i => i.folio).filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    {gi.items.map(fila)}
                  </div>
                );
              });

              /* Dentro de la persona, por KIT. Roxana tenía tres equipos fuera
                 y los tres eran el mismo kit; la lista los daba como tres cosas
                 sin relación, así que a la vuelta había que acordarse de que
                 iban juntos. */
              return subgrupos(g.visibles).map(sg => {
                /* Fragment con clave: sin ella React trata este array anidado
                   como un hijo sin `key` y llena la consola de avisos. */
                if (!sg.kitId) return <Fragment key="_sueltos">{tramo(sg.items)}</Fragment>;
                const idsK = sg.items.map(i => i.id);
                const nK = idsK.filter(id => marcados.has(id)).length;
                const todosK = nK === idsK.length;
                /* `kitTotal` es la composición del kit HOY, no la del día que
                   salió: si alguien le añade una pieza al kit, este «3 de 5»
                   pasa a «3 de 6» hacia atrás. Es a propósito —lo que importa
                   al recibir es qué falta ahora—, pero conviene saberlo. */
                const total = sg.items[0]?.kitTotal || sg.items.length;
                /* ⚠ «Cojo» se mide contra lo que esa persona TIENE FUERA, no
                   contra lo que el filtro deja ver. Con `sg.items.length` a
                   secas, buscar un folio dejaba una pieza visible de un kit de
                   dieciocho y la cabecera gritaba «1 de 18 piezas» en ámbar:
                   quien recibe en la puerta sale a buscar diecisiete que nunca
                   salieron. El aviso es accionable y por eso no puede
                   dispararse por teclear. */
                const salieron = sg.kitId
                  ? g.items.filter(i => i.kitId === sg.kitId).length
                  : sg.items.length;
                const cojo = salieron < total;
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
                        {cojo ? `${salieron} de ${total} piezas` : `completo · ${total} piezas`}
                      </span>
                      {/* Y si el filtro esconde piezas del kit, se dice aparte:
                          el número de arriba habla del kit, éste de la
                          pantalla. Mezclarlos era el fallo. */}
                      {hayFiltro && sg.items.length < salieron && (
                        <span style={{ fontSize: 11, color: "var(--dim)" }}>
                          · viendo {sg.items.length}
                        </span>
                      )}
                    </div>
                    {tramo(sg.items)}
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
