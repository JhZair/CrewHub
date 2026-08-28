"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { crearSecuencia, moverSecuencia } from "@/app/guion/acciones";
import { usarGuardadoSecuencia, ROTULO_GUARDADO } from "@/lib/usarGuardadoSecuencia";
import { minutosDe, minutosHum, palabras, ICO_BEAT, VOZ, type ModoGuion } from "@/lib/guion";
import {
  columnas, bandas, marcas, filasDeHilos, beatsEnColumnas, cuantasSinActo,
  ANCHO_COL, ANCHO_ROTULO,
  type SecCol, type ActoMin,
} from "@/lib/timeline";

/* ══════════════════════════════════════════════════════════════════════════
   ⧉ LA REJILLA — la vista principal del tratamiento

   Columnas = secuencias. Filas = capas de información sobre las mismas
   columnas. Y abajo, una regla numerada con el metraje.

   ── POR QUÉ LAS COLUMNAS NO SON PROPORCIONALES ──
   Porque una secuencia de veinte segundos serían doce píxeles y no cabría ni
   su número; y como habría que ponerle un ancho mínimo, la banda dejaría de
   ser proporcional igualmente —pero sin decirlo, y entonces el ojo mide mal—.
   El ancho es fijo y la duración vive en la regla de abajo, donde sí se lee.
   Está razonado en lib/timeline.ts.

   ── SE ESCRIBE EN LA CELDA ──
   El textarea del cuerpo se edita donde está, sin abrir nada. «⤢» despliega el
   cajón con el resto —nombre, minutos, hilos— debajo de la rejilla. Escribir
   sin cambiar de sitio es lo que hace que una herramienta de escritura se use;
   un panel que hay que abrir cuesta dos clics por frase.
   ⚠ El guardado es el MISMO que el de la vista Cards (`usarGuardadoSecuencia`):
   cola, volcado de uno en uno, nada de refrescar tras un fallo y aviso al
   cerrar. Un textarea escrito «rápido, que es solo un campo» es exactamente
   cómo se perdió texto las cinco veces que documenta ese archivo.

   ── LA PRIMERA COLUMNA VA FIJA ──
   Con `sticky`, los rótulos de fila —estructura, cuerpo, hilos— siguen a la
   vista al desplazar. Sin eso, a la tercera pantalla de scroll horizontal
   nadie sabe qué está leyendo.
   ══════════════════════════════════════════════════════════════════════════ */

type Hilo = { id: string; nombre: string; color: string };
type Beat = { id: string; nombre: string; tipo?: string | null; pos?: number | null; secuencia_id?: string | null };

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

  /* Los beats por columna, para pintarlos sobre la banda de estructura. */
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

  /* El ancho total de la rejilla, para que la regla de abajo mida lo mismo que
     las columnas de arriba y las dos se desplacen juntas. */
  const anchoTotal = ANCHO_ROTULO + cols.length * ANCHO_COL;

  if (!cols.length) {
    return (
      <div className="card" style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.6 }}>
        Todavía no hay {V.secs.toLowerCase()}. La rejilla se dibuja sobre ellas: cada columna es
        una, y encima se van poniendo la estructura, los hilos de trama y la regla de metraje.
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn" style={{ padding: "6px 14px", fontSize: 12 }}
            disabled={creando} onClick={nueva}>＋ Primera {V.sec.toLowerCase()}</button>
        </div>
        {error && <div className="err-inline" style={{ marginTop: 8 }}>⚠ {error}</div>}
      </div>
    );
  }

  return (
    <div className="rej">
      <div className="rej-cab">
        <span className="rej-cab-t">
          {cols.length} {cols.length === 1 ? V.sec.toLowerCase() : V.secs.toLowerCase()}
          {" · "}{minutosHum(total)}
        </span>
        {/* ⚠ Se dice que la duración es ESTIMADA cuando lo es. Un número que
            parece un dato y es una cuenta nuestra a 190 palabras/minuto acaba
            usándose para decidir un plan de rodaje. */}
        {cols.some(c => c.estimado && c.min > 0) && (
          <span className="rej-est" title="Los minutos que nadie fijó a mano se estiman a 190 palabras por minuto. En las secuencias con minutos puestos manda el autor.">
            estimado en parte
          </span>
        )}
        {sinActo > 0 && (
          <span className="rej-suelto" title="Están al principio, antes de la primera banda de acto. No se esconden: hay que poder recolocarlas.">
            {sinActo} sin acto
          </span>
        )}
        {sueltos.length > 0 && (
          <span className="rej-suelto" title={`Puntos de la estructura que ninguna ${V.sec.toLowerCase()} carga todavía: ${sueltos.map(b => b.beat.nombre).join(", ")}`}>
            {sueltos.length} punto{sueltos.length === 1 ? "" : "s"} sin {V.sec.toLowerCase()}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
          disabled={creando} onClick={nueva}>＋ {V.sec}</button>
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}

      {/* El scroll horizontal vive aquí, en un solo contenedor: así la banda de
          estructura, las columnas, los hilos y la regla se desplazan JUNTOS. Con
          un scroll por fila se desalinean al primer arrastre. */}
      <div className="rej-scroll">
        <div style={{ width: anchoTotal, minWidth: "100%" }}>

          {/* ── ESTRUCTURA: las bandas de acto, con sus marcas encima ── */}
          <div className="rej-fila rej-estructura">
            <div className="rej-rot" style={{ width: ANCHO_ROTULO, minWidth: ANCHO_ROTULO }}>Estructura</div>
            <div className="rej-cols" style={{ gridTemplateColumns: `repeat(${cols.length}, ${ANCHO_COL}px)` }}>
              {/* Las bandas van en su propia capa, superpuestas a las columnas:
                  un acto abarca varias y con una celda por columna no se podría
                  dibujar como una sola banda con nombre. */}
              {bnds.map(b => (
                <div key={b.acto.id} className="rej-banda"
                  style={{ gridColumn: `${b.desdeCol + 1} / span ${b.cols}` }}
                  title={`${b.acto.nombre} · ${minutosHum(b.min)} en ${b.cols} ${b.cols === 1 ? "columna" : "columnas"}`}>
                  {b.acto.clave ? `${b.acto.clave} · ` : ""}{b.acto.nombre}
                </div>
              ))}
              {/* Las que no tienen acto: un hueco rotulado, no un hueco a secas.
                  Un tramo sin nombre se lee como que falta un dato; aquí falta
                  de verdad, y decirlo es lo que hace que alguien lo arregle. */}
              {sinActo > 0 && (
                <div className="rej-banda es-suelta" style={{ gridColumn: `1 / span ${sinActo}` }}>
                  sin acto
                </div>
              )}
            </div>
          </div>

          {/* ── LOS PUNTOS DE LA ESTRUCTURA, en la columna que los carga ── */}
          <div className="rej-fila rej-beats">
            <div className="rej-rot" style={{ width: ANCHO_ROTULO, minWidth: ANCHO_ROTULO }} />
            <div className="rej-cols" style={{ gridTemplateColumns: `repeat(${cols.length}, ${ANCHO_COL}px)` }}>
              {cols.map((c, i) => (
                <div key={c.sec.id} className="rej-cel rej-cel-beat">
                  {(beatsDe.get(i) || []).map(b => (
                    <span key={b.id} className="rej-beat" title={b.pos != null ? `Se espera hacia el ${b.pos}% del metraje` : undefined}>
                      {ICO_BEAT[(b.tipo as any) || "estado"]} {b.nombre}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── LA CABECERA DE CADA COLUMNA: número, nombre y minutos ── */}
          <div className="rej-fila">
            <div className="rej-rot" style={{ width: ANCHO_ROTULO, minWidth: ANCHO_ROTULO }}>{V.sec}</div>
            <div className="rej-cols" style={{ gridTemplateColumns: `repeat(${cols.length}, ${ANCHO_COL}px)` }}>
              {cols.map((c, i) => (
                <Cabecera key={c.sec.id} col={c} tratamientoId={tratamientoId}
                  primera={i === 0} ultima={i === cols.length - 1}
                  abierta={abierta === c.sec.id}
                  onAbrir={() => setAbierta(abierta === c.sec.id ? null : c.sec.id)} />
              ))}
            </div>
          </div>

          {/* ── EL CUERPO: donde se escribe ── */}
          <div className="rej-fila">
            <div className="rej-rot" style={{ width: ANCHO_ROTULO, minWidth: ANCHO_ROTULO }}>{V.tratamiento}</div>
            <div className="rej-cols" style={{ gridTemplateColumns: `repeat(${cols.length}, ${ANCHO_COL}px)` }}>
              {cols.map(c => (
                <Celda key={c.sec.id} sec={c.sec} tratamientoId={tratamientoId} ayuda={V.ayudaTexto} />
              ))}
            </div>
          </div>

          {/* ── LOS HILOS DE TRAMA ──
              ⚠ Es lo DECLARADO por el autor, no lo medido. Cuando lleguen las
              escenas se podrá contrastar con lo que la película hace de verdad;
              son dos cosas distintas y mezclarlas perdería el contraste. */}
          {fHilos.map(f => (
            <div key={f.hilo.id} className="rej-fila rej-hilo">
              <div className="rej-rot" style={{ width: ANCHO_ROTULO, minWidth: ANCHO_ROTULO }} title={f.cuantas ? undefined
                : "Este hilo no está declarado en ninguna secuencia: existe, pero la película no lo toca en ninguna parte."}>
                <span className="rej-punto" style={{ background: f.hilo.color }} />
                {f.hilo.nombre}
                {!f.cuantas && <span className="rej-cero"> · en ninguna</span>}
              </div>
              <div className="rej-cols" style={{ gridTemplateColumns: `repeat(${cols.length}, ${ANCHO_COL}px)` }}>
                {cols.map((c, i) => (
                  <div key={c.sec.id} className="rej-cel rej-cel-hilo">
                    {f.en[i] && <span className="rej-barra" style={{ background: f.hilo.color }} />}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* ── LA REGLA ──
              Cada marca va DEBAJO DE LA COLUMNA en la que cae ese minuto, no en
              una posición proporcional: las columnas no son proporcionales, así
              que una regla proporcional se desalinearía de lo que rotula. */}
          <div className="rej-fila rej-regla">
            <div className="rej-rot" style={{ width: ANCHO_ROTULO, minWidth: ANCHO_ROTULO }}>min</div>
            <div className="rej-cols" style={{ gridTemplateColumns: `repeat(${cols.length}, ${ANCHO_COL}px)` }}>
              {cols.map((c, i) => {
                const aqui = regla.filter(m => m.col === i);
                return (
                  <div key={c.sec.id} className="rej-cel rej-cel-regla"
                    title={`Del minuto ${Math.round(c.desde)} al ${Math.round(c.hasta)}${c.estimado ? " (estimado)" : ""}`}>
                    {aqui.map(m => <span key={m.min} className="rej-marca">{m.min}</span>)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── EL CAJÓN ──
          Debajo de la rejilla y no flotando: `.rej-scroll` tiene overflow, así
          que un panel absoluto dentro se cortaría en su borde — la misma
          lección que el panel de papeles de la cláusula 5.4. */}
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
function Cabecera({ col, tratamientoId, primera, ultima, abierta, onAbrir }: {
  col: ReturnType<typeof columnas>[number];
  tratamientoId: string; primera: boolean; ultima: boolean;
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
    <div className={`rej-cel rej-cel-cab${abierta ? " es-abierta" : ""}`}>
      <div className="rej-cab-n">
        <span className="rej-n">{col.n}</span>
        <span style={{ flex: 1 }} />
        {!primera && <button type="button" className="rej-mov" title="Mover antes" onClick={() => mover(-1)}>↑</button>}
        {!ultima && <button type="button" className="rej-mov" title="Mover después" onClick={() => mover(1)}>↓</button>}
        <button type="button" className="rej-mas" title="Abrir el resto: minutos, acto, hilos"
          aria-expanded={abierta} onClick={onAbrir}>⤢</button>
      </div>
      <input className="rej-nom" value={nombre} placeholder="Sin título"
        onChange={e => { setNombre(e.target.value); programar({ nombre: e.target.value }); }}
        onBlur={volcarYRefrescar} />
      <div className="rej-min">
        {col.min ? minutosHum(col.min) : "—"}
        {col.estimado && col.min > 0 && <span className="rej-est-mini" title="Estimado a 190 palabras por minuto. Ponle minutos a mano y manda el tuyo."> ~</span>}
        <span className={`gu-estado gu-${estado}`}>{ROTULO_GUARDADO[estado]}</span>
      </div>
      {err && <div className="rej-err">⚠ {err}</div>}
    </div>
  );
}

/* ── LA CELDA DONDE SE ESCRIBE ──
 * Un textarea a secas, con la misma cola de guardado que la vista Cards. */
function Celda({ sec, tratamientoId, ayuda }: {
  sec: SecCol; tratamientoId: string; ayuda: string;
}) {
  const { estado, programar, volcarYRefrescar } = usarGuardadoSecuencia(sec.id, tratamientoId);
  const [texto, setTexto] = useState(sec.texto || "");
  const pal = palabras(texto);

  return (
    <div className="rej-cel rej-cel-cuerpo">
      <textarea className="rej-txt" value={texto} placeholder={ayuda}
        onChange={e => { setTexto(e.target.value); programar({ texto: e.target.value }); }}
        onBlur={volcarYRefrescar} />
      <div className="rej-pie">
        {pal ? `${pal} palabras` : ""}
        <span className={`gu-estado gu-${estado}`}>{ROTULO_GUARDADO[estado]}</span>
      </div>
    </div>
  );
}

/* ── EL CAJÓN DE UNA COLUMNA ──
 * Lo que no cabe en la celda: los minutos a mano, el acto y los hilos. */
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
    <div className="rej-cajon">
      <div className="rej-cajon-t">
        <b>{V.sec} {col.n}</b> · {col.sec.nombre || "sin título"}
        <span style={{ flex: 1 }} />
        <span className={`gu-estado gu-${estado}`}>{ROTULO_GUARDADO[estado]}</span>
        <button type="button" onClick={onCerrar} style={{ color: "var(--dim)" }}>✕</button>
      </div>
      {err && <div className="err-inline">⚠ {err}</div>}
      <div className="rej-cajon-g">
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
      {/* Los hilos se marcan desde la vista Cards, que es donde está el
          selector completo. Aquí se enseñan para no tener que cambiar de vista
          solo para saber cuáles toca. */}
      <div className="rej-cajon-h">
        {hilos.length === 0
          ? <span style={{ color: "var(--dim)", fontSize: 11.5 }}>Sin hilos de trama definidos.</span>
          : hilos.map(h => {
            const on = (col.sec.hilos || []).includes(h.id);
            return (
              <span key={h.id} className={`rej-chip${on ? " on" : ""}`}
                style={on ? { borderColor: h.color, color: h.color } : undefined}>
                {h.nombre}
              </span>
            );
          })}
      </div>
    </div>
  );
}
