"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarBeat, borrarBeat } from "@/app/guion/acciones";
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
};
type SecOp = { id: string; nombre: string; n: number };

export default function Espina({ beat, proyectoId, secs, pctReal }: {
  beat: BeatFila; proyectoId: string; secs: SecOp[];
  /** Dónde cae de verdad la secuencia que lo carga, en % de metraje. */
  pctReal?: number | null;
}) {
  const router = useRouter();
  const [nota, setNota] = useState(beat.nota || "");
  const [estado, setEstado] = useState<"limpio" | "sucio" | "guardando" | "guardado" | "error">("limpio");
  const [err, setErr] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [pide, setPide] = useState<string | null>(null);
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
      const r: any = await guardarBeat(beat.id, proyectoId, campos);
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
    const r: any = await guardarBeat(beat.id, proyectoId, campos);
    if (r?.error) setErr(r.error); else router.refresh();
  }

  async function borrar(confirmado = false) {
    const r: any = await borrarBeat(beat.id, proyectoId, confirmado);
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
          <span className="es-vacio">sin secuencia</span>
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
          <div className="es-fila">
            <select className="es-sel" value={beat.tipo} onChange={e => cambiar({ tipo: e.target.value })}>
              <option value="giro">◆ punto de giro</option>
              <option value="inflexion">◈ punto de inflexión</option>
              <option value="estado">· establece o cierra</option>
            </select>
            <input className="gu-min" defaultValue={beat.pos ?? ""} inputMode="decimal" placeholder="%"
              title="Dónde se espera, en % del metraje"
              onBlur={e => cambiar({ pos: e.target.value })} />
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
