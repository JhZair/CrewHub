"use client";
import { useMemo } from "react";
import ChipPop from "@/components/ChipPop";
import FilaPop from "@/components/FilaPop";
import { iconoDeSitio, type Sitio } from "@/lib/sitios";

/* ══════════════════════════════════════════════════════════════════════════
   ▦ EL MUEBLE, DIBUJADO

   Esto es lo que `fila` y `columna` vinieron a pagar, y lo dice
   db/sitios-detalle.sql: «Fila 1 · Columna 1», «Nivel superior» y «Superior
   izquierdo» son la misma cosa dicha de tres maneras —una posición en una
   rejilla—, y como NÚMEROS se pueden dibujar. Abrir el Mueble 01 y ver sus
   doce cajones en 3×4 con lo que hay en cada uno, en vez de leer doce
   renglones ordenados alfabéticamente, que es como se leían.

   ── UNA FILA Y UNA COLUMNA DE MÁS, SIEMPRE ──
   ⚠ La rejilla se dibuja con un hueco de sobra abajo y otro a la derecha. Sin
   eso, un mueble cuyos cajones están todos en la fila 1 se dibuja de una sola
   fila y NO HAY DÓNDE SOLTAR el segundo nivel: la rejilla solo puede crecer si
   ya hay algo en el sitio al que hay que crecer, que es un huevo y su gallina.
   El hueco de sobra es lo que hace que colocar sea posible la primera vez.

   ── LOS QUE NO ESTÁN COLOCADOS SIGUEN EN EL ÁRBOL ──
   La posición es opcional a propósito —un cajón suelto en un almacén no está en
   ninguna rejilla—, así que un mueble de doce con cuatro dibujados no dice que
   estén todos: los ocho restantes salen como renglones debajo, con su botón
   «colocar». Aquí llegó a haber una TIRA con esos ocho en chips, y era la
   tercera copia del mismo cajón en la misma pantalla.

   Se coloca en dos toques: «colocar» en el renglón, y el hueco. No hay arrastre
   porque esto se usa con el mueble abierto delante y una mano ocupada, y porque
   un arrastre que falla en un móvil no dice por qué.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── QUÉ HAY EN UNA CASILLA, Y NO CUÁNTO ──
   ⚠ Esto eran tres números. La rejilla decía «C07 · 1» y ahí se acababa: para
   saber QUÉ era ese 1 había que bajar a la lista, buscar el Cajón 07 entre
   doce renglones y desplegarlo — o sea salir del dibujo que se estaba mirando.
   Un número que no lleva a ninguna parte es peor que no ponerlo, porque ocupa
   el sitio de la respuesta.

   Es la misma lección que ya está escrita en `ChipPiezas`: «el número solo
   avisa; la lista es lo que se usa». Y como allí, el contenido VIAJA con la
   casilla en vez de pedirse al abrir: el panel ya lo tiene en memoria para
   pintar el árbol de abajo, y pedirlo otra vez sería una espera de red para
   enseñar algo que ya está aquí. */
/** Lo que va DENTRO de una cosa, sea la lleve un cajón o un kit. */
export type Metida = {
  id: string; nombre: string;
  folio?: string | null; cartel?: string | null;
  estado?: string | null; quien?: string | null;
  /** `montada` va atornillada —no se presta suelta—; `guardada` solo va metida
   *  en su bolso y sale sola perfectamente. Son dos relaciones que se comportan
   *  al revés y db/sitios.sql las separó por eso. */
  como: "montada" | "guardada";
};

/** Una cosa del cajón, con lo que lleva dentro.
 *  ⚠ Es el MISMO tipo para lo que cuelga del sitio y para las piezas de un kit:
 *  las dos son equipos y las dos pueden llevar cosas montadas. Con dos tipos,
 *  el rig de un kit salía plano —sin sus cuatro piezas— y el mismo rig fuera
 *  del kit salía con ellas. */
export type CosaEnSitio = {
  id: string; nombre: string;
  folio?: string | null; cartel?: string | null;
  estado?: string | null; quien?: string | null;
  /* ── LO QUE LLEVA DENTRO ──
     ⚠ La segunda cifra las CONTABA y el pop-up no las enseñaba: el Cajón 09
     decía «1 aquí · 5 dentro» y listaba un solo equipo. Las otras cuatro son
     las piezas atornilladas dentro del Osmo, y abrir un cajón para contar
     contra una lista a la que le faltan cuatro es peor que no abrirlo.
     Aquí no hay ambigüedad ninguna —al revés que con los kits—: una pieza
     montada NO PUEDE tener sitio propio, el check de la base lo impide, así
     que está donde su anfitrión y punto. */
  dentro: Metida[];
};

export type ContenidoSitio = {
  /** Lo que cuelga directamente, sin un bolso de por medio. */
  directo: CosaEnSitio[];
  kits: {
    id: string; nombre: string;
    /* ── LAS PIEZAS DEL KIT, Y DÓNDE ESTÁ CADA UNA ──
       ⚠ Un kit es una LISTA, no una cosa: que el kit se guarde aquí quiere
       decir que su bolso está aquí, no que sus dieciséis piezas lo estén. Cada
       una tiene su propio sitio, y alguna puede estar en otro cajón.
       Listarlas a secas bajo este cajón sería afirmar dieciséis veces algo que
       no se ha comprobado — y en el momento exacto en que alguien está contando
       contra la pantalla. Por eso cada una trae `otroSitio`: null cuando va con
       el kit, y el código del suyo cuando dice otra cosa. */
    piezas: (CosaEnSitio & { otroSitio: string | null })[];
  }[];
  /** Contando lo que va dentro de los bolsos que hay aquí. */
  total: number;
};

/* ── UNA COSA Y LO QUE LLEVA DENTRO ──
   Escrito una vez y usado en los dos sitios —lo que cuelga del cajón y las
   piezas de un kit— porque son lo mismo: un equipo que puede llevar otros
   encima. Duplicarlo es cómo un rig salía con sus cuatro piezas en un renglón
   y plano en el de al lado. */
function Cosa({ c, aviso }: { c: CosaEnSitio; aviso?: React.ReactNode }) {
  return (
    <span className="rej-kit">
      <FilaPop id={c.id} folio={c.folio} nombre={c.nombre} cartel={c.cartel}
        estado={c.estado && c.estado !== "disponible" ? c.estado : null}
        quien={c.quien} />
      {aviso}
      {c.dentro.length > 0 && (
        /* Sangrado: es lo que dice que van DENTRO de esa cosa y no sueltas en
           el cajón. */
        <span className="rej-kit-piezas">
          {c.dentro.map(d => (
            <span key={d.id} className="rej-kit-pieza">
              <FilaPop id={d.id} folio={d.folio} nombre={d.nombre} cartel={d.cartel}
                estado={d.estado && d.estado !== "disponible" ? d.estado : null}
                quien={d.quien} />
              <span className="rej-kit-como"
                title={d.como === "montada"
                  ? "Atornillada dentro: no se presta suelta y no puede tener sitio propio — está donde esté su anfitrión."
                  : "Metida en él, no atornillada: se presta sola perfectamente, y sacarla del bolso no es desarmar nada."}>
                {d.como === "montada" ? "🔩 montada" : "🎒 dentro"}
              </span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/* ⚠ SIN ESTADO PROPIO. Qué se está colocando y si la rejilla está plegada
   viven en `PanelSitios`, y no por gusto: es ÉL quien decide qué hijos pinta
   como renglones debajo, y esa decisión depende de las dos cosas. Con el estado
   aquí dentro, el árbol no podía saber si un cajón ya se estaba enseñando en el
   dibujo — y por eso el mismo Compartimiento 01 salía dos veces a dos
   centímetros, en la rejilla y como renglón. */
export default function RejillaSitio({
  hijos, contenido, codigos, ocupado, colocando, abiertos,
  onColocar, onElegir, onAbrir, oculta, onOcultar,
}: {
  hijos: Sitio[];
  contenido: Map<string, ContenidoSitio>;
  codigos: Map<string, string | null>;
  ocupado: boolean;
  /** Qué hijo se está colocando ahora mismo, si alguno. */
  colocando: string | null;
  /** Cuáles están desplegados en el árbol: una casilla abierta se marca, porque
   *  su contenido está saliendo como renglón justo debajo. */
  abiertos: Set<string>;
  onColocar: (id: string, fila: number | null, columna: number | null) => void;
  onElegir: (id: string | null) => void;
  onAbrir: (id: string) => void;
  oculta: boolean;
  onOcultar: () => void;
}) {
  const elegido = colocando;
  const setElegido = onElegir;

  const colocados = useMemo(
    () => hijos.filter(h => h.fila != null && h.columna != null),
    [hijos],
  );

  /* ── EL HUECO DE SOBRA, SOLO MIENTRAS SE COLOCA ──
     ⚠ La fila y la columna de más estaban SIEMPRE, y con un mueble de 3×4 eso
     son nueve casillas punteadas vacías alrededor de lo que sí hay: la mitad
     del dibujo es marco. Existen por un motivo real —sin ellas no hay dónde
     soltar el primer cajón de una fila nueva, y la rejilla solo podría crecer
     donde ya hay algo—, pero ese motivo solo aplica MIENTRAS se está colocando.
     Sin nada elegido, la rejilla es exactamente lo que hay.

     ── Y SIN NADA COLOCADO, NO HAY REJILLA ──
     Un marco 2×2 entero vacío no dice nada que la tira de abajo no diga mejor.
     Aparece en cuanto se elige algo de la tira, que es cuando sirve. */
  const sobra = elegido ? 1 : 0;
  const nFilas = Math.max(1, ...colocados.map(h => h.fila || 1)) + sobra;
  const nCols = Math.max(1, ...colocados.map(h => h.columna || 1)) + sobra;
  const hayMalla = colocados.length > 0 || !!elegido;

  /* ⚠ Una casilla puede tener MÁS DE UNO. Nada en la base impide que dos
     cajones digan fila 2 columna 1 —y no debería: es un dato que se rellena a
     mano y a medias—. Se pintan los dos apilados en la casilla en vez de
     quedarse uno oculto detrás del otro, que es como se pierde un cajón. */
  const enCasilla = useMemo(() => {
    const m = new Map<string, Sitio[]>();
    colocados.forEach(h => {
      const k = `${h.fila}:${h.columna}`;
      m.set(k, [...(m.get(k) || []), h]);
    });
    return m;
  }, [colocados]);

  const casillas: React.ReactNode[] = [];
  for (let f = 1; f <= nFilas; f++) {
    for (let c = 1; c <= nCols; c++) {
      const aqui = enCasilla.get(`${f}:${c}`) || [];
      const vacia = !aqui.length;
      casillas.push(
        <div key={`${f}:${c}`}
          className={`rej-casilla${vacia ? " rej-vacia" : ""}${elegido && vacia ? " rej-diana" : ""}`}
          /* Solo las vacías aceptan el toque: soltar encima de un cajón que ya
             está pondría dos en la misma casilla sin querer, y deshacerlo
             pediría averiguar cuál de los dos se acaba de mover. */
          onClick={() => {
            if (!elegido || !vacia || ocupado) return;
            onColocar(elegido, f, c);
            setElegido(null);
          }}
          title={vacia ? `Fila ${f} · Columna ${c}` : undefined}>
          {aqui.map(h => {
            const n = contenido.get(h.id);
            const cod = codigos.get(h.id);
            const nAqui = (n?.directo.length || 0) + (n?.kits.length || 0);
            /* Mismo criterio que el árbol de abajo: el cero a secas no se
               pinta si hay algo debajo —«· 8» ya lo dice— y las dos cifras
               tienen que decir lo mismo aquí y allí, o la casilla y su renglón
               se contradicen a cinco centímetros. */
            const cifras = (
              <>
                {nAqui > 0 && nAqui}
                {n && n.total !== nAqui && (
                  <span className="rej-dentro">{nAqui > 0 ? " · " : ""}{n.total}</span>
                )}
              </>
            );
            return (
              <div key={h.id} className={`rej-cosa${abiertos.has(h.id) ? " rej-abierta" : ""}`}
                title={cod || undefined}>
                {/* ── LA CASILLA ES EL SITIO PLEGADO, Y ABRE ──
                    ⚠ Antes cada cajón salía DOS veces: dibujado aquí y otra vez
                    como renglón debajo, con sus mismos botones. Ahora la casilla
                    es su forma cerrada y al tocarla se despliega abajo con todo
                    lo suyo. Una cosa, un sitio en la pantalla. */}
                <button type="button" className="rej-abrir"
                  onClick={e => { e.stopPropagation(); onAbrir(h.id); }}
                  title={abiertos.has(h.id)
                    ? `Plegar «${h.nombre}» (está desplegado abajo)`
                    : `Abrir «${h.nombre}» y ver lo que tiene dentro`}>
                  <span className="rej-ico" aria-hidden>{iconoDeSitio(h.tipo)}</span>
                  {h.clave && <span className="badge rej-clave">{h.clave}</span>}
                  <span className="rej-nom">{h.nombre}</span>
                </button>
                {/* ⚠ El cero NO se hace pulsable. Un chip que abre para decir
                    «aquí no hay nada» en once de doce cajones es once promesas
                    incumplidas; y la rejilla se recorre buscando lo que SÍ
                    tiene algo, así que solo eso tiene que llamar. */}
                {nAqui === 0 && !n?.total ? (
                  <span className="rej-n rej-cero">0</span>
                ) : (
                  <ChipPop
                    titulo={`Ver qué hay en «${h.nombre}»`}
                    clase="chip-sitio"
                    ancho={390}
                    etiqueta={cifras}
                    cabecera={
                      <>
                        <span className="chip-gr-h">
                          {iconoDeSitio(h.tipo)} {cod ? `${cod} · ` : ""}{h.nombre}
                        </span>
                        {/* Las dos cifras dichas con palabras, que es lo que el
                            «1 · 5» del chip no puede decir en dos caracteres. */}
                        <span style={{ color: "var(--dim)", fontWeight: 400, flex: "none" }}>
                          · {nAqui} aquí
                          {n && n.total !== nAqui && ` · ${n.total} contando lo que va dentro`}
                        </span>
                      </>
                    }>
                    {!nAqui && (
                      <span className="ens-pop-aviso">
                        Aquí no cuelga nada directamente: lo que se cuenta va dentro
                        de un bolso que está en otro sitio de esta cadena.
                      </span>
                    )}
                    {(n?.kits || []).map(k => {
                      const fuera = k.piezas.filter(p => p.otroSitio).length;
                      return (
                        <span key={k.id} className="rej-kit">
                          <span className="sit-cosa">
                            <span aria-hidden>🧰</span>
                            <span className="sit-cosa-n">{k.nombre}</span>
                            <span className="sit-cosa-t">
                              kit · {k.piezas.length} equipo{k.piezas.length === 1 ? "" : "s"}
                              {fuera > 0 && <span className="rej-kit-fuera"> · {fuera} en otro sitio</span>}
                            </span>
                          </span>
                          {/* Las piezas del kit con EL MISMO componente que lo
                              que cuelga del cajón, y por eso cada una enseña
                              además lo suyo montado: el rig de un kit lleva sus
                              cuatro piezas igual que fuera de él, y salía plano
                              solo porque aquí se pintaba a mano. */}
                          <span className="rej-kit-piezas">
                            {k.piezas.map(pz => (
                              <Cosa key={pz.id} c={pz}
                                aviso={pz.otroSitio && (
                                  <span className="rej-kit-otro"
                                    title="Su sitio anotado NO es este cajón: el kit se guarda aquí, pero esta pieza dice que está en otro sitio.">
                                    ⚠ en {pz.otroSitio}
                                  </span>
                                )} />
                            ))}
                            {!k.piezas.length && (
                              <span className="sit-cosa-t">Este kit no tiene ningún equipo dentro.</span>
                            )}
                          </span>
                        </span>
                      );
                    })}
                    {/* La misma fila que pintan el chip de piezas y el del kit,
                        con su miniatura, su estado y —lo que de verdad importa
                        aquí— QUIÉN lo tiene. Abrir un cajón y ver que algo está
                        en Puno con alguien es media respuesta. */}
                    {(n?.directo || []).map(e => <Cosa key={e.id} c={e} />)}
                  </ChipPop>
                )}
                <button type="button" className="rej-quitar" disabled={ocupado}
                  title="Sacarlo de la rejilla (se queda en este sitio, solo pierde la posición)"
                  onClick={e => { e.stopPropagation(); onColocar(h.id, null, null); }}>
                  ✕
                </button>
              </div>
            );
          })}
          {vacia && <span className="rej-hueco" aria-hidden>{f}·{c}</span>}
        </div>,
      );
    }
  }

  return (
    <div className="rej">
      {hayMalla && (
        <>
          {/* El plegado va ARRIBA y en pequeño: es una preferencia, no una
              acción del inventario, y con la rejilla oculta tiene que quedar el
              rastro de que existe — si no, el dato de fila y columna se vuelve
              invisible y nadie lo mantiene. */}
          <div className="rej-cab">
            <button type="button" className="dato-btn"
              onClick={onOcultar}
              title={oculta ? "Ver el mueble dibujado" : "Plegar el dibujo y dejar solo la lista de abajo"}>
              ▦ {oculta ? `ver la rejilla (${colocados.length})` : "ocultar la rejilla"}
            </button>
          </div>
          {!oculta && (
            <div className="rej-malla" style={{ gridTemplateColumns: `repeat(${nCols}, minmax(0, 1fr))` }}>
              {casillas}
            </div>
          )}
        </>
      )}

      {/* ── LA TIRA DE «SIN COLOCAR» SE FUE ──
          ⚠ Eran los mismos sitios que el árbol ya pinta como renglones justo
          debajo: la tercera copia del mismo cajón en la misma pantalla. Colocar
          se pide ahora desde el renglón de cada uno, con su botón «colocar», y
          lo que enciende los huecos es eso. Aquí solo queda el dibujo. */}
    </div>
  );
}
