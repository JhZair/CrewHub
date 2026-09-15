"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { crearSecuencia, moverSecuencia } from "@/app/guion/acciones";
import { usarGuardadoSecuencia, ROTULO_GUARDADO } from "@/lib/usarGuardadoSecuencia";
import { minutosDe, minutosHum, palabras, ICO_BEAT, VOZ, colorActo, type ModoGuion } from "@/lib/guion";
import {
  columnas, bandas, marcas, filasDeHilos, beatsEnColumnas, cuantasSinActo, tramosDeHilo,
  ANCHO_COL, ANCHO_ROTULO,
  type SecCol, type ActoMin,
} from "@/lib/timeline";

/* ══════════════════════════════════════════════════════════════════════════
   ⏱ LA LÍNEA DE TIEMPO — la vista principal del tratamiento

   Columnas = secuencias. Filas = capas de información sobre las mismas
   columnas. Y abajo, una regla numerada con el metraje.

   ── SE LLAMA «LÍNEA DE TIEMPO» Y NO «REJILLA» ──
   Rejilla describía el dibujo; línea de tiempo describe lo que se hace en
   ella. Quien monta documental lleva años mirando una línea de tiempo en
   Resolve o Premiere, y es la misma operación: bloques en orden, se arrastran,
   se miden. Poner otro nombre a lo mismo obliga a traducir cada vez, y una
   pantalla que hay que traducir se abre menos.

   ── POR QUÉ LAS COLUMNAS NO SON PROPORCIONALES ──
   Porque una secuencia de veinte segundos serían doce píxeles y no cabría ni
   su número; y como habría que ponerle un ancho mínimo, la banda dejaría de
   ser proporcional igualmente —pero sin decirlo, y entonces el ojo mide mal—.
   El ancho es fijo y la duración vive en la regla de abajo, donde sí se lee.
   Está razonado en lib/timeline.ts.
   ⚠ Es la diferencia con la línea de tiempo de un montador, y conviene tenerla
   clara antes de «arreglarla»: allí el ancho ES el tiempo porque el material
   ya está rodado y dura lo que dura. Aquí no hay material: hay una previsión
   de minutos que cambia cada vez que se escribe un párrafo, y un bloque que
   se encoge mientras escribes dentro es inmanejable.

   ── SE ESCRIBE EN LA CELDA ──
   El textarea del cuerpo se edita donde está, sin abrir nada. «⤢» despliega el
   cajón con el resto —minutos, hilos— debajo. Escribir sin cambiar de sitio es
   lo que hace que una herramienta de escritura se use; un panel que hay que
   abrir cuesta dos clics por frase.
   ⚠ El guardado es el MISMO que el de la vista Tarjetas
   (`usarGuardadoSecuencia`): cola, volcado de uno en uno, nada de refrescar
   tras un fallo y aviso al cerrar. Un textarea escrito «rápido, que es solo un
   campo» es exactamente cómo se perdió texto las cinco veces que documenta ese
   archivo.

   ── LA PRIMERA COLUMNA VA FIJA ──
   Con `sticky`, los rótulos de fila siguen a la vista al desplazar. Sin eso, a
   la tercera pantalla de scroll horizontal nadie sabe qué está leyendo.

   ── PREFIJO `.ltg-` ──
   Tercer intento, y la historia está en app/globals.css: `.tl-` era de la
   línea de actividad, `.rej-` es de RejillaSitio —y compartíamos con ella
   `.rej-cab`, `.rej-n`, `.rej-nom` y `.rej-cero` sin saberlo—, `.lt-` es de
   LineaTiempo.tsx. Un prefijo corto parece libre y casi nunca lo está.
   ══════════════════════════════════════════════════════════════════════════ */

type Hilo = { id: string; nombre: string; color: string };
type Beat = { id: string; nombre: string; tipo?: string | null; pos?: number | null; secuencia_id?: string | null };

/* ── LOS TRES ANCHOS ──
 * Con veinticuatro secuencias, el ancho cómodo para ESCRIBIR es incómodo para
 * ver la FORMA de la película, y al revés. Son dos trabajos distintos sobre la
 * misma pantalla y ninguno de los dos anchos sirve para el otro, así que se
 * elige. El del medio es `ANCHO_COL`, el de siempre.
 * El alto del cuerpo va con el ancho: una columna estrecha con un textarea de
 * 190 px de alto es un pozo. */
const DENSIDAD = [
  { k: "ver", txt: "Ver", col: 128, alto: 96, que: "Columnas estrechas: la forma de la película entera de un vistazo" },
  { k: "normal", txt: "Normal", col: ANCHO_COL, alto: 190, que: "El ancho de siempre" },
  { k: "escribir", txt: "Escribir", col: 320, alto: 300, que: "Columnas anchas, para redactar dentro de la celda" },
] as const;

export default function GuionTimeline({
  tratamientoId, modo, secs, actos, hilos, beats,
}: {
  tratamientoId: string;
  modo: ModoGuion;
  secs: SecCol[];
  actos: ActoMin[];
  hilos: Hilo[];
  beats: Beat[];
}) {
  const V = VOZ[modo];
  const router = useRouter();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [densidad, setDensidad] = useState<string>("normal");
  const D = DENSIDAD.find(d => d.k === densidad) || DENSIDAD[1];

  /* Las cuentas, memorizadas contra los repintados del padre —abrir el cajón,
     crear una secuencia—.
     ⚠ NO protegen de teclear: el texto vive en el `useState` de cada celda, así
     que escribir solo repinta esa celda. Y en el caso que de verdad importa
     —`router.refresh()`— las deps son arrays nuevos del payload RSC, así que
     el memo falla igualmente. Están porque no estorban, no porque salven nada:
     decir lo contrario en un comentario enseña algo falso al siguiente. */
  const cols = useMemo(() => columnas(secs, actos), [secs, actos]);
  const bnds = useMemo(() => bandas(cols, actos), [cols, actos]);
  const regla = useMemo(() => marcas(cols), [cols]);
  const fHilos = useMemo(() => filasDeHilos(cols, hilos), [cols, hilos]);
  const { colocados, sueltos } = useMemo(() => beatsEnColumnas(cols, beats), [cols, beats]);
  const sinActo = cuantasSinActo(cols, actos);
  const total = cols.length ? cols[cols.length - 1].hasta : 0;

  /* El color de cada COLUMNA, por el acto al que pertenece. Se calcula una vez
     y lo usan el número de la cabecera y la regla de abajo: el mismo reparto
     leído tres veces —banda, número, regla— es lo que deja ver de un golpe
     cuánto metraje se lleva cada acto.
     ⚠ Por la posición del acto en `actos`, igual que en Tarjetas. Si aquí se
     numerara de otra forma, el acto II sería verde en una vista y naranja en
     la otra, y el color dejaría de identificar nada. */
  const colorDe = useMemo(() => cols.map(c => {
    const i = actos.findIndex(a => a.id === c.sec.acto_id);
    return i < 0 ? null : colorActo(i);
  }), [cols, actos]);

  /* Los beats por columna, para pintarlos en la fila de estructura. */
  const beatsDe = useMemo(() => {
    const m = new Map<number, Beat[]>();
    for (const b of colocados) if (b.col !== null) m.set(b.col, [...(m.get(b.col) || []), b.beat]);
    return m;
  }, [colocados]);

  const nueva = async () => {
    if (creando) return;
    setCreando(true); setError("");
    /* Sin acto: aparece la primera, a la vista, y desde ahí se recoloca. Meterla
       en el último acto por comodidad la escondería al final de la película. */
    const r: any = await crearSecuencia(tratamientoId, null, "");
    setCreando(false);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  /* El ancho total del lienzo, para que la regla de abajo mida lo mismo que las
     columnas de arriba y las dos se desplacen juntas. */
  const anchoTotal = ANCHO_ROTULO + cols.length * D.col;
  const rejilla = { gridTemplateColumns: `repeat(${cols.length}, var(--col))` };
  const rot = { width: ANCHO_ROTULO, minWidth: ANCHO_ROTULO };

  if (!cols.length) {
    return (
      <div className="card" style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.6 }}>
        Todavía no hay {V.secs.toLowerCase()}. La línea de tiempo se dibuja sobre ellas: cada
        columna es una, y encima se van poniendo los actos, la espina, los hilos de trama y la
        regla de metraje.
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn" style={{ padding: "6px 14px", fontSize: 12 }}
            disabled={creando} onClick={nueva}>＋ Primera {V.sec.toLowerCase()}</button>
        </div>
        {error && <div className="err-inline" style={{ marginTop: 8 }}>⚠ {error}</div>}
      </div>
    );
  }

  return (
    <div className="ltg" style={{ ["--col" as any]: `${D.col}px`, ["--alto" as any]: `${D.alto}px` }}>
      <div className="ltg-cab">
        <span className="ltg-cab-t">
          {cols.length} {cols.length === 1 ? V.sec.toLowerCase() : V.secs.toLowerCase()}
          {" · "}{minutosHum(total)}
        </span>
        {/* ⚠ Se dice que la duración es ESTIMADA cuando lo es. Un número que
            parece un dato y es una cuenta nuestra a 190 palabras/minuto acaba
            usándose para decidir un plan de rodaje. */}
        {cols.some(c => c.estimado && c.min > 0) && (
          <span className="ltg-aviso" title="Los minutos que nadie fijó a mano se estiman a 190 palabras por minuto. En las secuencias con minutos puestos manda el autor.">
            estimado en parte
          </span>
        )}
        {sinActo > 0 && (
          <span className="ltg-aviso" title="Están al principio, antes de la primera banda de acto. No se esconden: hay que poder recolocarlas.">
            {sinActo} sin acto
          </span>
        )}
        {sueltos.length > 0 && (
          <span className="ltg-aviso" title={`Puntos de la estructura que ninguna ${V.sec.toLowerCase()} carga todavía: ${sueltos.map(b => b.beat.nombre).join(", ")}`}>
            {sueltos.length} punto{sueltos.length === 1 ? "" : "s"} sin {V.sec.toLowerCase()}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {/* ── DENSIDAD ──
            Mirar y escribir piden anchos distintos y no hay uno que sirva para
            los dos. En estado de cliente y no en la URL: es una preferencia de
            cómo se mira ahora mismo, no algo que tenga sentido enlazar —al
            revés que la vista, que sí va en la URL para poder decir «míralo en
            el diagnóstico»—. */}
        <span className="ltg-zoom" role="group" aria-label="Ancho de columna">
          {DENSIDAD.map(d => (
            <button key={d.k} type="button" title={d.que}
              className={densidad === d.k ? "on" : undefined}
              aria-pressed={densidad === d.k}
              onClick={() => setDensidad(d.k)}>{d.txt}</button>
          ))}
        </span>
        <button type="button" className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
          disabled={creando} onClick={nueva}>＋ {V.sec}</button>
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}

      {/* El scroll horizontal vive aquí, en un solo contenedor: así los actos,
          las columnas, los hilos y la regla se desplazan JUNTOS. Con un scroll
          por fila se desalinean al primer arrastre. */}
      <div className="ltg-scroll">
        <div style={{ width: anchoTotal, minWidth: "100%" }}>

          {/* ══ ACTOS: las bandas ══ */}
          <div className="ltg-fila ltg-actos">
            <div className="ltg-rot" style={rot}>Actos</div>
            <div className="ltg-cols" style={rejilla}>
              {/* Las bandas van en su propia capa, superpuestas a las columnas:
                  un acto abarca varias y con una celda por columna no se podría
                  dibujar como una sola banda con nombre. */}
              {bnds.map(b => (
                <div key={b.acto.id} className="ltg-banda"
                  style={{ gridColumn: `${b.desdeCol + 1} / span ${b.cols}`,
                    ["--ac" as any]: colorActo(actos.findIndex(a => a.id === b.acto.id)) }}
                  title={`${b.acto.nombre} · ${minutosHum(b.min)} en ${b.cols} ${b.cols === 1 ? "columna" : "columnas"}`}>
                  {b.acto.clave ? `${b.acto.clave} · ` : ""}{b.acto.nombre}
                </div>
              ))}
              {/* Las que no tienen acto: un hueco rotulado, no un hueco a secas.
                  Un tramo sin nombre se lee como que falta un dato; aquí falta
                  de verdad, y decirlo es lo que hace que alguien lo arregle. */}
              {sinActo > 0 && (
                <div className="ltg-banda es-suelta" style={{ gridColumn: `1 / span ${sinActo}` }}>
                  sin acto
                </div>
              )}
            </div>
          </div>

          {/* ══ ESTRUCTURA: los puntos de la espina, en su columna ══ */}
          <div className="ltg-fila ltg-espina">
            <div className="ltg-rot" style={rot}>Estructura</div>
            <div className="ltg-cols" style={rejilla}>
              {cols.map((c, i) => (
                <div key={c.sec.id} className="ltg-cel ltg-cel-beat">
                  {(beatsDe.get(i) || []).map(b => (
                    <span key={b.id} className={`ltg-beat es-${b.tipo || "estado"}`}
                      title={b.pos != null ? `«${b.nombre}» se espera hacia el ${b.pos}% del metraje` : b.nombre}>
                      {ICO_BEAT[(b.tipo as any) || "estado"]} {b.nombre}
                      {b.pos != null && <i>{b.pos}%</i>}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ══ LA CABECERA DE CADA COLUMNA ══ */}
          <div className="ltg-fila">
            <div className="ltg-rot es-fuerte" style={rot}>{V.sec}</div>
            <div className="ltg-cols" style={rejilla}>
              {cols.map((c, i) => (
                <Cabecera key={c.sec.id} col={c} tratamientoId={tratamientoId}
                  color={colorDe[i]}
                  primera={i === 0} ultima={i === cols.length - 1}
                  abierta={abierta === c.sec.id}
                  onAbrir={() => setAbierta(abierta === c.sec.id ? null : c.sec.id)} />
              ))}
            </div>
          </div>

          {/* ══ EL CUERPO: donde se escribe ══ */}
          <div className="ltg-fila">
            <div className="ltg-rot es-fuerte" style={rot}>{V.tratamiento}</div>
            <div className="ltg-cols" style={rejilla}>
              {cols.map(c => (
                <Celda key={c.sec.id} sec={c.sec} tratamientoId={tratamientoId} ayuda={V.ayudaTexto} />
              ))}
            </div>
          </div>

          {/* ══ HILOS DE TRAMA ══
              ⚠ BANDAS CONTINUAS y no una marca por celda, que es como estaba.
              Un hilo es algo que atraviesa la película y tiene que cerrarse:
              con marcas sueltas, un hilo tocado en las secuencias 2-3-4 se veía
              igual que uno tocado en la 2, la 9 y la 20 — y esa es la
              diferencia entre desarrollar un hilo y mencionarlo.
              ⚠ Es lo DECLARADO por el autor, no lo medido. Cuando lleguen las
              escenas se podrá contrastar con lo que la película hace de verdad;
              son dos cosas distintas y mezclarlas perdería el contraste. */}
          {fHilos.map(f => {
            const tramos = tramosDeHilo(f.en);
            return (
              <div key={f.hilo.id} className="ltg-fila ltg-hilo">
                <div className="ltg-rot" style={rot} title={f.cuantas
                  ? `${f.hilo.nombre} · en ${f.cuantas} ${f.cuantas === 1 ? V.sec.toLowerCase() : V.secs.toLowerCase()}, en ${tramos.length} tramo${tramos.length === 1 ? "" : "s"}`
                  : "Este hilo no está declarado en ninguna secuencia: existe, pero la película no lo toca en ninguna parte."}>
                  <span className="ltg-punto" style={{ background: f.hilo.color }} />
                  {f.hilo.nombre}
                  {!f.cuantas && <span className="ltg-cero"> · en ninguna</span>}
                </div>
                <div className="ltg-cols ltg-pista" style={{ ...rejilla, ["--h" as any]: f.hilo.color }}>
                  {/* ⚠ `desde + 1`: `grid-column` cuenta desde 1 y `tramosDeHilo`
                      devuelve índices desde 0. Un hilo corrido una columna es el
                      error que nadie ve hasta que lo compara con la cabecera. */}
                  {tramos.map(t => (
                    <div key={t.desde} className="ltg-tramo"
                      style={{ gridColumn: `${t.desde + 1} / span ${t.largo}` }}
                      title={`${f.hilo.nombre}: de la ${V.sec.toLowerCase()} ${cols[t.desde].n} a la ${cols[t.desde + t.largo - 1].n}`} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* ══ LA REGLA ══
              Cada marca va DEBAJO DE LA COLUMNA en la que cae ese minuto, no en
              una posición proporcional: las columnas no son proporcionales, así
              que una regla proporcional se desalinearía de lo que rotula. */}
          <div className="ltg-fila ltg-regla">
            <div className="ltg-rot" style={rot}>min</div>
            <div className="ltg-cols" style={rejilla}>
              {cols.map((c, i) => {
                const aqui = regla.filter(m => m.col === i);
                return (
                  <div key={c.sec.id} className="ltg-cel ltg-cel-regla"
                    style={colorDe[i] ? { ["--ac" as any]: colorDe[i] } : undefined}
                    title={`Del minuto ${Math.round(c.desde)} al ${Math.round(c.hasta)}${c.estimado ? " (estimado)" : ""}`}>
                    {aqui.map(m => <span key={m.min} className="ltg-marca">{m.min}</span>)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── EL CAJÓN ──
          Debajo de la línea de tiempo y no flotando: `.ltg-scroll` tiene
          overflow, así que un panel absoluto dentro se cortaría en su borde — la
          misma lección que el panel de papeles de la cláusula 5.4. */}
      {abierta && (() => {
        const c = cols.find(x => x.sec.id === abierta);
        if (!c) return null;
        return <Cajon key={c.sec.id} col={c} tratamientoId={tratamientoId} modo={modo}
          hilos={hilos} onCerrar={() => setAbierta(null)} />;
      })()}
    </div>
  );
}

/* ── LA CABECERA DE UNA COLUMNA ──
 * El número, el nombre editable, los minutos y los dos botones de mover. El
 * nombre se guarda con la misma cola que el cuerpo. */
function Cabecera({ col, tratamientoId, color, primera, ultima, abierta, onAbrir }: {
  col: ReturnType<typeof columnas>[number];
  tratamientoId: string; color: string | null;
  primera: boolean; ultima: boolean;
  abierta: boolean; onAbrir: () => void;
}) {
  const { estado, err, programar, volcar, volcarYRefrescar } =
    usarGuardadoSecuencia(col.sec.id, tratamientoId);
  const [nombre, setNombre] = useState(col.sec.nombre);
  const router = useRouter();

  const mover = async (dir: -1 | 1) => {
    /* Nada se mueve con texto en el aire: el servidor devolvería el orden
       nuevo con el texto viejo. */
    if (!(await volcar())) return;
    const r: any = await moverSecuencia(col.sec.id, tratamientoId, dir);
    if (!r?.error) router.refresh();
  };

  return (
    <div className={`ltg-cel ltg-cel-cab${abierta ? " es-abierta" : ""}`}>
      <div className="ltg-cab-n">
        {/* El número teñido del color de su acto: cuando la banda de arriba
            queda fuera de pantalla, esto es lo único que dice en qué tramo de
            la película está la columna que se está leyendo. */}
        <span className="ltg-n" style={color ? { ["--ac" as any]: color } : undefined}>
          {col.n}
        </span>
        <span style={{ flex: 1 }} />
        {!primera && <button type="button" className="ltg-mov" title="Mover antes" onClick={() => mover(-1)}>↑</button>}
        {!ultima && <button type="button" className="ltg-mov" title="Mover después" onClick={() => mover(1)}>↓</button>}
        <button type="button" className="ltg-mas" title="Abrir el resto: minutos, hilos"
          aria-expanded={abierta} onClick={onAbrir}>⤢</button>
      </div>
      <input className="ltg-nom" value={nombre} placeholder="Sin título"
        onChange={e => { setNombre(e.target.value); programar({ nombre: e.target.value }); }}
        onBlur={volcarYRefrescar} />
      <div className="ltg-min">
        {col.min ? minutosHum(col.min) : "—"}
        {col.estimado && col.min > 0 && <span className="ltg-est-mini" title="Estimado a 190 palabras por minuto. Ponle minutos a mano y manda el tuyo."> ~</span>}
        <span style={{ flex: 1 }} />
        <span className={`gu-estado gu-${estado}`}>{ROTULO_GUARDADO[estado]}</span>
      </div>
      {err && <div className="ltg-err">⚠ {err}</div>}
    </div>
  );
}

/* ── LA CELDA DONDE SE ESCRIBE ──
 * Un textarea a secas, con la misma cola de guardado que la vista Tarjetas. */
function Celda({ sec, tratamientoId, ayuda }: {
  sec: SecCol; tratamientoId: string; ayuda: string;
}) {
  const { estado, programar, volcarYRefrescar } = usarGuardadoSecuencia(sec.id, tratamientoId);
  const [texto, setTexto] = useState(sec.texto || "");
  const pal = palabras(texto);

  return (
    <div className="ltg-cel ltg-cel-cuerpo">
      <textarea className="ltg-txt" value={texto} placeholder={ayuda}
        onChange={e => { setTexto(e.target.value); programar({ texto: e.target.value }); }}
        onBlur={volcarYRefrescar} />
      <div className="ltg-pie">
        {/* «sin escribir» en vez de un hueco: el hueco se lee como que la
            pantalla no cargó el dato, y aquí el dato es que no hay ninguno. */}
        {pal ? `${pal} palabras` : <span className="es-vacio">sin escribir</span>}
        <span style={{ flex: 1 }} />
        <span className={`gu-estado gu-${estado}`}>{ROTULO_GUARDADO[estado]}</span>
      </div>
    </div>
  );
}

/* ── EL CAJÓN DE UNA COLUMNA ──
 * Lo que no cabe en la celda: los minutos a mano y los hilos. */
function Cajon({ col, tratamientoId, modo, hilos, onCerrar }: {
  col: ReturnType<typeof columnas>[number];
  tratamientoId: string; modo: ModoGuion; hilos: Hilo[]; onCerrar: () => void;
}) {
  const V = VOZ[modo];
  const { estado, err, programar, volcarYRefrescar } =
    usarGuardadoSecuencia(col.sec.id, tratamientoId);
  const [minutos, setMinutos] = useState(col.sec.minutos == null ? "" : String(col.sec.minutos));
  const est = minutosDe({ minutos: minutos === "" ? null : Number(minutos), texto: col.sec.texto });

  return (
    <div className="ltg-cajon">
      <div className="ltg-cajon-t">
        <b>{V.sec} {col.n}</b> · {col.sec.nombre || "sin título"}
        <span style={{ flex: 1 }} />
        <span className={`gu-estado gu-${estado}`}>{ROTULO_GUARDADO[estado]}</span>
        <button type="button" onClick={onCerrar} style={{ color: "var(--dim)" }}>✕</button>
      </div>
      {err && <div className="err-inline">⚠ {err}</div>}
      <div className="ltg-cajon-g">
        <label>
          <span>Minutos</span>
          {/* Vacío = «que lo estime»; cero = «esto no dura nada». No son lo
              mismo y hay que poder decir las dos cosas. */}
          <input value={minutos} placeholder={est.min > 0 ? `~ ${minutosHum(est.min)}` : "sin estimar"}
            onChange={e => { setMinutos(e.target.value); programar({ minutos: e.target.value }); }}
            onBlur={volcarYRefrescar} />
          <small>{est.estimado ? "estimado por palabras" : "puesto a mano"}</small>
        </label>
      </div>
      {/* Los hilos se marcan desde la vista Tarjetas, que es donde está el
          selector completo. Aquí se enseñan para no tener que cambiar de vista
          solo para saber cuáles toca. */}
      <div className="ltg-cajon-h">
        {hilos.length === 0
          ? <span style={{ color: "var(--dim)", fontSize: 11.5 }}>Sin hilos de trama definidos.</span>
          : hilos.map(h => {
            const on = (col.sec.hilos || []).includes(h.id);
            return (
              <span key={h.id} className={`ltg-chip${on ? " on" : ""}`}
                style={on ? { borderColor: h.color, color: h.color } : undefined}>
                {h.nombre}
              </span>
            );
          })}
      </div>
    </div>
  );
}
