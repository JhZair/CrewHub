"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Tratamiento from "@/components/Tratamiento";
import { crearActo, guardarActo, borrarActo, crearSecuencia,
  elegirPlantilla, crearHilo, borrarHilo } from "@/app/guion/acciones";
import { PLANTILLAS, plantillaDe, VOZ, minutosHum, repartoActos,
  diagnosticar, type ModoGuion } from "@/lib/guion";

/* LA ESTRUCTURA: actos con sus secuencias.
 *
 * Vuelta 1 del guion. Se escribe el tratamiento por secuencias y se ve, a
 * la vez, cómo va repartido el metraje —que es la pregunta que un
 * tratamiento contesta mal si no se mide: todo el mundo escribe un primer
 * acto de media película sin darse cuenta—.
 *
 * La plantilla narrativa es una CAPA: elegirla no crea ni borra
 * secuencias, solo cambia contra qué se compara. Por eso se puede pasar
 * de Save the Cat a Truby con el tratamiento entero escrito.
 */

type Acto = { id: string; clave?: string | null; nombre: string; orden: number };
type Sec = { id: string; nombre: string; texto?: string | null; minutos?: number | null; acto_id?: string | null; orden: number; hilos: string[] };
type Hilo = { id: string; nombre: string; color: string };

const COLORES = ["#a78bfa", "#2dd4bf", "#f4b400", "#ff4d5e", "#84cc16", "#06b6d4", "#ec4899"];

export default function GuionEstructura({ proyectoId, modo, plantilla, actos, secs, hilos }: {
  proyectoId: string; modo: ModoGuion; plantilla?: string | null;
  actos: Acto[]; secs: Sec[]; hilos: Hilo[];
}) {
  const router = useRouter();
  const V = VOZ[modo];
  const P = plantillaDe(plantilla);
  const [err, setErr] = useState("");
  const [nuevoActo, setNuevoActo] = useState(false);
  const [editActo, setEditActo] = useState<string | null>(null);
  const [panelHilos, setPanelHilos] = useState(false);

  const ok = (r: any) => { if (r?.error) { setErr(r.error); return false; } setErr(""); router.refresh(); return true; };

  const { total, filas } = repartoActos(actos, secs);
  const sueltas = secs.filter(s => !s.acto_id || !actos.some(a => a.id === s.acto_id));
  const avisos = diagnosticar(secs, hilos.length > 0);

  /* Los grupos EN EL ORDEN EN QUE SE VEN: primero las sueltas, luego cada
     acto con las suyas. La numeración «SEC 05» se saca de aquí y no del
     array plano: si se numerara por `orden` global, una secuencia del acto
     III podría llevar el número 2 solo porque se creó antes, y ese es el
     número con el que se habla en una reunión. */
  const grupos: { key: string; lista: Sec[] }[] = [
    ...(sueltas.length ? [{ key: "_sueltas", lista: sueltas }] : []),
    ...actos.map(a => ({ key: a.id, lista: secs.filter(s => s.acto_id === a.id) })),
  ];
  const nDe = new Map<string, number>();
  let k = 0;
  grupos.forEach(g => g.lista.forEach(s => nDe.set(s.id, ++k)));

  /* ⚠ Esto NO puede ser un componente declarado aquí dentro.
     Lo era, y en cada render el padre creaba una función nueva: React la
     veía como un componente DISTINTO y desmontaba todos los `Tratamiento`
     de golpe —con su texto sin guardar y su cola dentro—. Bastaba abrir el
     panel de hilos para perder el párrafo que estabas escribiendo.
     Es una función que devuelve una lista, no un componente: se llama, no
     se monta, y el estado de cada `Tratamiento` sobrevive. */
  const filasDe = (lista: Sec[]) => lista.map((s, i) => (
    <Tratamiento key={s.id} sec={s} proyectoId={proyectoId} hilos={hilos} modo={modo}
      n={nDe.get(s.id) || 0}
      primera={i === 0} ultima={i === lista.length - 1} />
  ));

  return (
    <>
      {/* ── Cabecera: plantilla y totales ── */}
      <div className="card gu-cab">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Modelo estructural:</span>
          <select className="hf-sel" value={P.clave}
            onChange={async e => ok(await elegirPlantilla(proyectoId, e.target.value))}>
            {PLANTILLAS.map(p => <option key={p.clave} value={p.clave}>{p.nombre} · {p.fuente}</option>)}
          </select>
          {/* Se dice qué hace y qué no hace elegir plantilla: si no, cambiarla
              da miedo cuando ya hay tratamiento escrito, y ese miedo es el que
              hace que nadie pruebe otra estructura. */}
          <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
            {P.beats.length} beats · cambiarlo no toca lo escrito
          </span>
          <span style={{ flex: 1 }} />
          <b style={{ fontSize: 13 }}>
            {actos.length} actos · {secs.length} {V.secs.toLowerCase()} · {minutosHum(total)}
          </b>
        </div>

        {/* Reparto del metraje. Es lo que un tratamiento no puede ver solo. */}
        {total > 0 && (
          <div className="gu-barra">
            {filas.filter(f => f.min > 0).map((f, i) => (
              <span key={f.id} className="gu-tramo" style={{ width: `${f.pct}%`, opacity: 1 - i * 0.14 }}
                title={`${f.nombre}: ${minutosHum(f.min)} · ${Math.round(f.pct)}%`}>
                <b>{f.nombre}</b> {Math.round(f.pct)}%
              </span>
            ))}
          </div>
        )}
      </div>

      {err && <div className="err-inline">⚠ {err}</div>}

      {/* ── Hilos de trama ── */}
      <div className="card">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 11.5, letterSpacing: 1, textTransform: "uppercase", color: "var(--dim)" }}>🧵 Hilos de trama</b>
          {hilos.map(h => (
            <span key={h.id} className="gu-hilo on"
              style={{ background: h.color + "22", borderColor: h.color, color: h.color }}>
              {h.nombre}
              {panelHilos && (
                <button style={{ marginLeft: 6, color: "var(--dim)" }} title="Quitar"
                  onClick={async () => ok(await borrarHilo(h.id, proyectoId))}>✕</button>
              )}
            </span>
          ))}
          {!hilos.length && <span style={{ color: "var(--dim)", fontSize: 12 }}>Ninguno todavía — un hilo es algo que atraviesa la película y tiene que cerrarse.</span>}
          <span style={{ flex: 1 }} />
          <button className="dato-btn" onClick={() => setPanelHilos(!panelHilos)}>{panelHilos ? "listo" : "editar"}</button>
        </div>
        {panelHilos && (
          <form className="gu-form" onSubmit={async e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget as HTMLFormElement);
            const r = await crearHilo(proyectoId, String(f.get("n") || ""), COLORES[hilos.length % COLORES.length]);
            if (ok(r)) (e.target as HTMLFormElement).reset();
          }}>
            <input name="n" className="gu-inp" placeholder="Nuevo hilo — «La deuda del agua»" />
            <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }}>＋ Añadir</button>
          </form>
        )}
      </div>

      {/* ── Secuencias sin acto ── */}
      {sueltas.length > 0 && (
        <div className="card gu-acto">
          <div className="gu-acto-h">
            <b style={{ color: "var(--yellow)" }}>Sin acto · {sueltas.length}</b>
            {/* Aquí caen las secuencias de un acto borrado. No se pierden, se
                quedan a la vista hasta que alguien las recoloque. */}
            <span style={{ color: "var(--dim)", fontSize: 11.5 }}>quedaron sueltas al borrar su acto</span>
          </div>
          {filasDe(sueltas)}
        </div>
      )}

      {/* ── Actos ── */}
      {actos.map(a => {
        const suyas = secs.filter(s => s.acto_id === a.id);
        const f = filas.find(x => x.id === a.id);
        return (
          <div key={a.id} className="card gu-acto">
            <div className="gu-acto-h">
              {editActo === a.id ? (
                <form className="gu-form" onSubmit={async e => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget as HTMLFormElement);
                  if (ok(await guardarActo(a.id, proyectoId, String(fd.get("n") || ""), String(fd.get("c") || "")))) setEditActo(null);
                }}>
                  <input name="c" className="gu-inp" defaultValue={a.clave || ""} placeholder="I" style={{ width: 60 }} />
                  <input name="n" className="gu-inp" defaultValue={a.nombre} placeholder="Nombre del acto" />
                  <button className="btn" style={{ padding: "5px 11px", fontSize: 12 }}>Guardar</button>
                  <button type="button" className="dato-btn" onClick={() => setEditActo(null)}>Cancelar</button>
                </form>
              ) : (
                <>
                  {a.clave && <span className="gu-acto-c">{a.clave}</span>}
                  <b style={{ fontSize: 14 }}>{a.nombre}</b>
                  <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                    {suyas.length} {suyas.length === 1 ? V.sec.toLowerCase() : V.secs.toLowerCase()}
                    {f && f.min > 0 && ` · ${minutosHum(f.min)} · ${Math.round(f.pct)}%`}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button className="dato-btn" title="Editar" onClick={() => setEditActo(a.id)}>✎</button>
                  <button className="dato-btn" style={{ color: "var(--dim)" }} title="Quitar el acto (sus secuencias no se borran)"
                    onClick={async () => {
                      const r: any = await borrarActo(a.id, proyectoId);
                      if (r?.error) { setErr(r.error); return; }
                      if (r?.sueltas) setErr(`Acto quitado. Sus ${r.sueltas} secuencia(s) quedaron arriba, en «sin acto» — el tratamiento no se borra.`);
                      router.refresh();
                    }}>✕</button>
                </>
              )}
            </div>

            {filasDe(suyas)}

            <button className="btn btn-ghost gu-mas"
              onClick={async () => ok(await crearSecuencia(proyectoId, a.id, ""))}>
              ＋ {V.sec}
            </button>
          </div>
        );
      })}

      {/* ── Nuevo acto ── */}
      {nuevoActo ? (
        <form className="card gu-form" onSubmit={async e => {
          e.preventDefault();
          const f = new FormData(e.currentTarget as HTMLFormElement);
          if (ok(await crearActo(proyectoId, String(f.get("n") || ""), String(f.get("c") || "")))) setNuevoActo(false);
        }}>
          <input name="c" className="gu-inp" placeholder="IV" style={{ width: 70 }} />
          <input name="n" className="gu-inp" placeholder="Nombre del acto" autoFocus />
          <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }}>Crear acto</button>
          <button type="button" className="dato-btn" onClick={() => setNuevoActo(false)}>Cancelar</button>
        </form>
      ) : (
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setNuevoActo(true)}>＋ Acto</button>
      )}

      {/* ── Diagnóstico ── */}
      {avisos.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="panel-h" style={{ color: "var(--yellow)" }}>🔍 Diagnóstico · {avisos.length}</div>
          {/* Cada aviso NOMBRA la secuencia. «Hay 3 secuencias sin hilo» obliga
              a buscarlas a mano, y entonces no se mira. */}
          {avisos.map((a, i) => (
            <div key={i} className="gu-aviso">
              <span style={{ color: a.grave ? "var(--red)" : "var(--yellow)" }}>{a.grave ? "●" : "○"}</span>
              {a.txt}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
