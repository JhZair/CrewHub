"use client";
import { useState } from "react";
import { moverSecuencia, borrarSecuencia, marcarHilo } from "@/app/guion/acciones";
import { usarGuardadoSecuencia, ROTULO_GUARDADO } from "@/lib/usarGuardadoSecuencia";
import { palabras, minutosDe, minutosHum, MIN_PARA_ANALIZAR, VOZ, ICO_BEAT, type ModoGuion } from "@/lib/guion";
import type { BeatFila } from "@/components/Espina";

/* EL TRATAMIENTO DE UNA SECUENCIA — la tarjeta de la vista «Cards».
 *
 * Este textarea es el campo madre del guion entero: del prototipo, «todo lo
 * demás se deriva de él o se mide de las escenas».
 *
 * ⚠ La maquinaria de guardado —cola, volcado de uno en uno, no refrescar tras
 * un fallo, aviso al cerrar— vive en `lib/usarGuardadoSecuencia.ts`, con las
 * cinco formas reales en que se perdía texto documentadas. Está ahí y no aquí
 * porque desde que existe la rejilla hay DOS sitios donde se escribe la misma
 * secuencia, y dos copias habrían acabado con protecciones distintas.
 *
 * El texto se manda TAL CUAL: sin trim, sin normalizar saltos. Cualquier
 * limpieza mientras alguien escribe le salta el cursor.
 */

type Sec = {
  id: string; nombre: string; texto?: string | null; minutos?: number | null;
  acto_id?: string | null; hilos: string[];
};
type Hilo = { id: string; nombre: string; color: string };

export default function Tratamiento({ sec, tratamientoId, hilos, modo, n, beats = [], primera, ultima }: {
  sec: Sec; tratamientoId: string; hilos: Hilo[]; modo: ModoGuion;
  /** Número visible (SEC 01) y si es la primera/última DE SU ACTO. */
  n: number; primera: boolean; ultima: boolean;
  /** Los puntos de la estructura que esta secuencia carga. */
  beats?: BeatFila[];
}) {
  const { estado, err, setErr, programar, volcar, volcarYRefrescar, olvidar, router } =
    usarGuardadoSecuencia(sec.id, tratamientoId);
  const V = VOZ[modo];
  const [texto, setTexto] = useState(sec.texto || "");
  const [nombre, setNombre] = useState(sec.nombre);
  const [minutos, setMinutos] = useState(sec.minutos == null ? "" : String(sec.minutos));
  const [abierto, setAbierto] = useState(false);
  const [pide, setPide] = useState<{ palabras: number } | null>(null);

  const pal = palabras(texto);
  const { min, estimado } = minutosDe({ minutos: minutos === "" ? null : Number(minutos), texto });
  const corto = pal > 0 && texto.trim().length < MIN_PARA_ANALIZAR;

  async function mover(dir: -1 | 1) {
    if (!(await volcar())) return;      // no se mueve nada con texto en el aire
    const r: any = await moverSecuencia(sec.id, tratamientoId, dir);
    if (r?.error) setErr(r.error); else router.refresh();
  }

  async function borrar(confirmado = false) {
    const r: any = await borrarSecuencia(sec.id, tratamientoId, confirmado);
    if (r?.confirmar) { setPide({ palabras: r.palabras }); return; }
    if (r?.error) { setErr(r.error); return; }
    olvidar();                          // ya no hay a dónde guardarlo
    setPide(null); router.refresh();
  }

  async function alternarHilo(h: Hilo, on: boolean) {
    if (!(await volcar())) return;
    const r: any = await marcarHilo(sec.id, h.id, tratamientoId, !on);
    if (r?.error) setErr(r.error); else router.refresh();
  }

  return (
    <div className="gu-sec">
      <div className="gu-sec-h">
        <span className="gu-sec-n">SEC {String(n).padStart(2, "0")}</span>
        <input className="gu-nombre" value={nombre}
          onChange={e => { setNombre(e.target.value); programar({ nombre: e.target.value }); }}
          onBlur={volcarYRefrescar}
          placeholder={`Nombre de la ${V.sec.toLowerCase()}`} />

        <span className={`gu-estado gu-${estado}`}>{ROTULO_GUARDADO[estado]}</span>
        <span style={{ flex: 1 }} />

        <span className="gu-peso" title={estimado
          ? `Estimado: ${pal} palabras ÷ 190 por minuto. Escribe los minutos para fijarlos.`
          : "Minutos puestos a mano"}>
          {minutosHum(min)}{estimado && min > 0 ? " aprox." : ""}
        </span>
        <input className="gu-min" value={minutos} inputMode="decimal"
          onChange={e => { setMinutos(e.target.value); programar({ minutos: e.target.value }); }}
          onBlur={volcarYRefrescar} placeholder="min"
          title="Minutos. Vacío = que los estime por palabras." />

        <button className="dato-btn" disabled={primera} title="Subir dentro del acto" onClick={() => mover(-1)}>↑</button>
        <button className="dato-btn" disabled={ultima} title="Bajar dentro del acto" onClick={() => mover(1)}>↓</button>
        <button className="dato-btn" title={abierto ? "Plegar" : "Desplegar"}
          onClick={() => setAbierto(!abierto)}>{abierto ? "▾" : "▸"}</button>
        <button className="dato-btn" style={{ color: "var(--dim)" }} title="Borrar"
          onClick={() => borrar(false)}>✕</button>
      </div>

      {/* Borrar con texto dentro dice CUÁNTO texto. «¿Borrar?» a secas no
          informa de que se van 620 palabras que no están en ningún otro
          sitio —ni en Drive, ni en el correo—. */}
      {pide && (
        <div className="gu-borrar">
          ⚠ «{nombre}» tiene <b>{pide.palabras} palabras</b> de tratamiento. Si la borras, se van con ella.
          <button style={{ color: "var(--red)", fontWeight: 700, marginLeft: 8 }} onClick={() => borrar(true)}>Borrar igual</button>
          <button style={{ color: "var(--dim)", marginLeft: 8 }} onClick={() => setPide(null)}>Cancelar</button>
        </div>
      )}
      {err && <div className="err-inline">⚠ {err}</div>}

      {/* Qué punto de la estructura carga esta secuencia. Va PEGADO al
          nombre y no en un panel aparte: es lo que hay que tener delante
          mientras se escribe, no algo que se consulta. */}
      {beats.length > 0 && (
        <div className="gu-beats">
          {beats.map(b => (
            <span key={b.id} className={`gu-beat es-${b.tipo}`} title={b.que || ""}>
              {ICO_BEAT[b.tipo]} {b.nombre}
              {b.nota?.trim() && <i> — {b.nota.trim()}</i>}
            </span>
          ))}
        </div>
      )}

      {abierto ? (
        <>
          <textarea className="gu-texto" value={texto} rows={10}
            onChange={e => { setTexto(e.target.value); programar({ texto: e.target.value }); }}
            onBlur={volcarYRefrescar}
            placeholder={V.ayudaTexto} />

          <div className="gu-pie">
            <span className={corto ? "gu-corto" : ""}>{pal} palabra{pal === 1 ? "" : "s"}</span>
            {corto && <span className="gu-corto">· demasiado poco para sostener una {V.sec.toLowerCase()}</span>}
            <span style={{ flex: 1 }} />
            {hilos.length > 0 && <span className="gu-hilos-t">Hilos de trama:</span>}
            {hilos.map(h => {
              const on = sec.hilos.includes(h.id);
              return (
                <button key={h.id} className={`gu-hilo${on ? " on" : ""}`}
                  style={on ? { background: h.color + "28", borderColor: h.color, color: h.color } : undefined}
                  onClick={() => alternarHilo(h, on)}>{h.nombre}</button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="gu-extracto" onClick={() => setAbierto(true)}>
          {texto.trim()
            ? <>{texto.trim().slice(0, 260)}{texto.trim().length > 260 ? "…" : ""}</>
            : <i style={{ color: "var(--dim)" }}>Sin tratamiento — pulsa para escribirlo.</i>}
          {sec.hilos.length > 0 && (
            <span className="gu-hilos-min">
              {hilos.filter(h => sec.hilos.includes(h.id)).map(h => (
                <span key={h.id} className="gu-punto" style={{ background: h.color }} title={h.nombre} />
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
