"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarBeat, borrarBeat, secuenciaDesdeBeat, restaurarBeat } from "@/app/guion/acciones";
import { ICO_BEAT, TXT_BEAT, type TipoBeat } from "@/lib/guion";

/* UN PUNTO DE LA ESPINA.
 *
 * El modelo estructural tiene que decir el ORDEN COMPLETO de la historia:
 * dónde va el detonante, dónde el punto medio, dónde la caída. Si solo
 * dice cómo se llama la plantilla, no guía nada.
 *
 * Cada punto lleva tres cosas, y las tres hacen falta:
 *   · QUÉ TIENE QUE CONSEGUIR — la guía del oficio, copiada del catálogo.
 *     «Catalizador» no le dice nada a quien está en la página en blanco;
 *     «la noticia que desordena su vida» sí.
 *   · QUÉ PASA AQUÍ EN ESTA HISTORIA — la nota del autor. Es el puente
 *     entre el modelo y el tratamiento, y es lo que nunca se puede perder
 *     al cambiar de plantilla.
 *   · QUÉ SECUENCIA LO CARGA — o que todavía no lo carga ninguna, que es
 *     el dato más útil de todos mientras se escribe.
 *
 * Misma disciplina de guardado que el tratamiento: cola, de uno en uno, y
 * refrescar solo si el guardado fue bien.
 */

export type BeatFila = {
  id: string; nombre: string; que?: string | null; tipo: TipoBeat;
  pos?: number | null; nota?: string | null; secuencia_id?: string | null;
  /** De qué entrada del catálogo salió, si salió de alguna. Solo con esto se
   *  puede volver a copiar de ella; los puntos inventados a mano la tienen
   *  nula y por eso no se les ofrece restaurar. */
  clave?: string | null;
};
type SecOp = { id: string; nombre: string; n: number };

export default function Espina({ beat, tratamientoId, secs, pctReal }: {
  beat: BeatFila; tratamientoId: string; secs: SecOp[];
  /** Dónde cae de verdad la secuencia que lo carga, en % de metraje. */
  pctReal?: number | null;
}) {
  const router = useRouter();
  const [nota, setNota] = useState(beat.nota || "");
  const [estado, setEstado] = useState<"limpio" | "sucio" | "guardando" | "guardado" | "error">("limpio");
  const [err, setErr] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [pide, setPide] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [aviso, setAviso] = useState("");
  const reloj = useRef<any>(null);
  const cola = useRef<Record<string, any>>({});
  const enVuelo = useRef<Promise<boolean> | null>(null);

  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  function programar(campos: Record<string, any>) {
    cola.current = { ...cola.current, ...campos };
    setEstado("sucio"); setErr("");
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => { volcar(); }, 800);
  }

  async function volcar(): Promise<boolean> {
    if (reloj.current) { clearTimeout(reloj.current); reloj.current = null; }
    if (enVuelo.current) await enVuelo.current;
    if (!Object.keys(cola.current).length) return estado !== "error";
    const campos = cola.current; cola.current = {};
    setEstado("guardando");
    const tarea = (async () => {
      const r: any = await guardarBeat(beat.id, tratamientoId, campos);
      if (r?.error) { cola.current = { ...campos, ...cola.current }; setEstado("error"); setErr(r.error); return false; }
      setEstado("guardado"); return true;
    })();
    enVuelo.current = tarea as any;
    const ok = await tarea; enVuelo.current = null;
    return ok;
  }
  const volcarYRefrescar = async () => { if (await volcar()) router.refresh(); };

  async function cambiar(campos: Record<string, any>) {
    if (!(await volcar())) return;
    const r: any = await guardarBeat(beat.id, tratamientoId, campos);
    if (r?.error) setErr(r.error); else router.refresh();
  }

  /* Volver a copiar del catálogo. NO toca la nota —eso es de esta película—
     y se dice qué cambió: «restaurado» sobre algo que ya estaba igual deja
     pensando si el botón hizo algo. */
  async function restaurar() {
    if (restaurando) return;
    if (!(await volcar())) return;
    setRestaurando(true); setErr(""); setAviso("");
    const r: any = await restaurarBeat(beat.id, tratamientoId);
    setRestaurando(false);
    if (r?.error) { setErr(r.error); return; }
    if (r?.igual) { setAviso("Ya estaba igual que en el catálogo."); return; }
    setAviso(`Se volvió a copiar ${(r.campos || []).join(", ")} del catálogo. Tu nota no se tocó.`);
    router.refresh();
  }

  /* ── LA SECUENCIA QUE FALTA ──
     Se vuelca antes lo que haya en la cola: crear dispara un `router.refresh()`
     y con la nota a medio guardar el refresco se la lleva por delante. */
  async function crearSuya() {
    if (creando) return;
    if (!(await volcar())) return;
    setCreando(true); setErr("");
    const r: any = await secuenciaDesdeBeat(beat.id, tratamientoId);
    setCreando(false);
    if (r?.error) { setErr(r.error); return; }
    router.refresh();
  }

  async function borrar(confirmado = false) {
    const r: any = await borrarBeat(beat.id, tratamientoId, confirmado);
    if (r?.confirmar) { setPide(r.nota); return; }
    if (r?.error) { setErr(r.error); return; }
    cola.current = {}; setPide(null); router.refresh();
  }

  const sec = secs.find(s => s.id === beat.secuencia_id);
  /* Desvío: dónde se esperaba vs dónde cayó. Ocho puntos es el umbral del
     prototipo; por debajo no significa nada y avisar de todo es no avisar. */
  const desvio = beat.pos != null && pctReal != null ? Math.round(pctReal - beat.pos) : null;
  const lejos = desvio != null && Math.abs(desvio) > 8;

  return (
    <div className={`es-beat es-${beat.tipo}`}>
      <div className="es-h">
        <span className="es-ico" title={TXT_BEAT[beat.tipo] || "punto de la estructura"}>{ICO_BEAT[beat.tipo]}</span>
        <b className="es-n">{beat.nombre}</b>
        {beat.tipo !== "estado" && <span className="es-tipo">{TXT_BEAT[beat.tipo]}</span>}
        {beat.pos != null && <span className="es-pos">{beat.pos}%</span>}

        <span style={{ flex: 1 }} />

        {/* Qué secuencia lo carga. Un punto de giro sin secuencia es un
            agujero en la estructura, y por eso se dice en ámbar en vez de
            dejar el hueco en blanco. */}
        {sec ? (
          <span className="es-sec">
            SEC {String(sec.n).padStart(2, "0")} · {sec.nombre}
            {lejos && (
              <span className="es-desvio" title={`Se espera al ${beat.pos}% y cae al ${Math.round(pctReal!)}%`}>
                {desvio! > 0 ? `+${desvio}` : desvio} pts
              </span>
            )}
            <button className="dato-btn" title="Desanclar" onClick={() => cambiar({ secuencia_id: null })}>✕</button>
          </span>
        ) : (
          <>
            <span className="es-vacio">sin secuencia</span>
            {/* ── ＋ LA CREA EN SU ACTO Y LA DEJA ANCLADA ──
                Junto al «sin secuencia» y no al final de la fila: el hueco y
                la forma de taparlo se leen del tirón. El desplegable de al
                lado sigue siendo para ANCLAR una que ya existe — son dos
                gestos distintos y por eso son dos controles.
                Nace vacía: el `que` de aquí arriba es la guía del catálogo, no
                el tratamiento de esta película, y copiarlo dentro haría que el
                diagnóstico la diera por escrita. */}
            <button className="es-crear" disabled={creando} onClick={crearSuya}
              title={`Crear la secuencia «${beat.nombre}» en este acto y anclarla a este punto`}>
              {creando ? "…" : "＋ secuencia"}
            </button>
          </>
        )}

        <select className="es-sel" value={beat.secuencia_id || ""}
          onChange={e => cambiar({ secuencia_id: e.target.value || null })}>
          <option value="">— anclar a…</option>
          {secs.map(s => <option key={s.id} value={s.id}>SEC {String(s.n).padStart(2, "0")} · {s.nombre}</option>)}
        </select>

        <span className={`gu-estado gu-${estado}`}>
          {estado === "sucio" ? "· sin guardar" : estado === "guardando" ? "· guardando…"
            : estado === "guardado" ? "· guardado" : estado === "error" ? "· NO se guardó" : ""}
        </span>
        <button className="dato-btn" onClick={() => setAbierto(!abierto)}
          title={abierto ? "Plegar" : "Qué tiene que conseguir"}>{abierto ? "▾" : "▸"}</button>
        <button className="dato-btn" style={{ color: "var(--dim)" }} title="Quitar el punto"
          onClick={() => borrar(false)}>✕</button>
      </div>

      {pide && (
        <div className="gu-borrar">
          ⚠ «{beat.nombre}» tiene escrito: <i>«{pide.slice(0, 120)}{pide.length > 120 ? "…" : ""}»</i>
          <button style={{ color: "var(--red)", fontWeight: 700, marginLeft: 8 }} onClick={() => borrar(true)}>Quitar igual</button>
          <button style={{ color: "var(--dim)", marginLeft: 8 }} onClick={() => setPide(null)}>Cancelar</button>
        </div>
      )}
      {err && <div className="err-inline">⚠ {err}</div>}
      {aviso && <div className="es-aviso">✓ {aviso}</div>}

      {/* La nota se ve SIEMPRE si está escrita: es lo que hay que tener
          delante mientras se escribe la secuencia. Lo que se pliega es la
          guía genérica, que se lee una vez. */}
      {abierto ? (
        <div className="es-cuerpo">
          {beat.que && <div className="es-que">{beat.que}</div>}
          <textarea className="es-nota" value={nota} rows={2}
            onChange={e => { setNota(e.target.value); programar({ nota: e.target.value }); }}
            onBlur={volcarYRefrescar}
            placeholder="Y aquí, en esta historia, ¿qué pasa exactamente?" />
          {/* ── LA AYUDA, FIJA Y NO EN EL PLACEHOLDER ──
              El placeholder decía lo mismo y desaparecía con la primera letra,
              o sea justo cuando empiezas a dudar de si esto era el sitio. El
              resultado es el que había que esperar: aquí dentro acababa el
              tratamiento entero, copiado de la secuencia de abajo.
              Dice las dos cosas que hay que saber —el tamaño y dónde va lo
              otro—, porque «la decisión» a secas no impide volver a pegar tres
              párrafos. */}
          <div className="es-ayuda">
            La <b>decisión</b>, en una o dos líneas: qué de esta película cumple
            este punto. El tratamiento en prosa va en la secuencia, no aquí.
          </div>
          <div className="es-fila">
            <select className="es-sel" value={beat.tipo} onChange={e => cambiar({ tipo: e.target.value })}>
              <option value="giro">◆ punto de giro</option>
              <option value="inflexion">◈ punto de inflexión</option>
              <option value="estado">· establece o cierra</option>
            </select>
            <input className="gu-min" defaultValue={beat.pos ?? ""} inputMode="decimal" placeholder="%"
              title="Dónde se espera, en % del metraje"
              onBlur={e => cambiar({ pos: e.target.value })} />
            <span style={{ flex: 1 }} />
            {/* ── VOLVER AL CATÁLOGO ──
                El nombre, la guía, el tipo y el `%` vienen COPIADOS de la
                plantilla, así que se tocan sin querer —el `%` y el tipo están
                aquí mismo, a un clic— y hasta hoy no había vuelta atrás.
                Solo para los puntos que salieron de una plantilla: los que
                inventas a mano no tienen original al que volver, y un botón
                que no puede hacer nada es peor que ninguno.
                ⚠ No se lleva tu nota. Se dice en el propio botón, porque si
                hay que probarlo para saberlo, no se prueba. */}
            {beat.clave && (
              <button className="es-rest" disabled={restaurando} onClick={restaurar}
                title="Vuelve a copiar el nombre, la guía, el tipo y el % de la plantilla. Tu nota no se toca.">
                {restaurando ? "…" : "↺ volver al original"}
              </button>
            )}
          </div>
        </div>
      ) : (
        nota.trim()
          ? <div className="es-nota-vista" onClick={() => setAbierto(true)}>{nota.trim()}</div>
          : <div className="es-nota-vista vacia" onClick={() => setAbierto(true)}>
              {beat.que || "Sin decidir qué pasa aquí."}
            </div>
      )}
    </div>
  );
}
