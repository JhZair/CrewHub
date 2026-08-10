"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarSecuencia, moverSecuencia, borrarSecuencia, marcarHilo } from "@/app/guion/acciones";
import { palabras, minutosDe, minutosHum, MIN_PARA_ANALIZAR, VOZ, type ModoGuion } from "@/lib/guion";

/* EL TRATAMIENTO DE UNA SECUENCIA.
 *
 * Este textarea es el campo madre del guion entero: del prototipo, «todo lo
 * demás se deriva de él o se mide de las escenas». Así que aquí lo que
 * importa no es lo que hace, es lo que NO PUEDE hacer: perder texto.
 *
 * Cinco formas en que este componente podía perderlo, todas reales:
 *
 *  1. REMONTARSE. El padre definía el envoltorio de la lista dentro de su
 *     propio render; React veía un componente distinto en cada pasada y
 *     desmontaba esto entero —con su estado y su cola— en cuanto alguien
 *     abría un panel. Ahora la lista se pinta en línea, sin envoltorio.
 *  2. REFRESCARSE AL TECLEAR. `guardarSecuencia` ya no revalida: quien
 *     refresca es esta pantalla, al soltar el campo.
 *  3. REFRESCAR DESPUÉS DE UN FALLO. Si el guardado falla y aun así se
 *     refresca, el servidor devuelve el texto viejo y el párrafo
 *     desaparece de la vista. `guardar()` devuelve si fue bien, y solo
 *     entonces se refresca.
 *  4. IRSE SIN VOLCAR LA COLA. Mover, borrar, marcar un hilo o salir del
 *     nombre disparaban refresh con la cola llena. Ahora todo pasa por
 *     `volcar()` primero.
 *  5. PISARSE ENTRE DOS GUARDADOS. Si uno viejo fallaba mientras otro
 *     nuevo iba en camino, el viejo volvía a la cola y machacaba el texto
 *     nuevo con el suyo. Ahora los guardados son de uno en uno.
 *
 * Y el texto se manda TAL CUAL: sin trim, sin normalizar saltos. Cualquier
 * limpieza mientras alguien escribe le salta el cursor.
 */

type Sec = {
  id: string; nombre: string; texto?: string | null; minutos?: number | null;
  acto_id?: string | null; hilos: string[];
};
type Hilo = { id: string; nombre: string; color: string };
type Estado = "limpio" | "sucio" | "guardando" | "guardado" | "error";

export default function Tratamiento({ sec, proyectoId, hilos, modo, n, primera, ultima }: {
  sec: Sec; proyectoId: string; hilos: Hilo[]; modo: ModoGuion;
  /** Número visible (SEC 01) y si es la primera/última DE SU ACTO. */
  n: number; primera: boolean; ultima: boolean;
}) {
  const router = useRouter();
  const V = VOZ[modo];
  const [texto, setTexto] = useState(sec.texto || "");
  const [nombre, setNombre] = useState(sec.nombre);
  const [minutos, setMinutos] = useState(sec.minutos == null ? "" : String(sec.minutos));
  const [estado, setEstado] = useState<Estado>("limpio");
  const [err, setErr] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [pide, setPide] = useState<{ palabras: number } | null>(null);
  const reloj = useRef<any>(null);
  const cola = useRef<Record<string, any>>({});
  const enVuelo = useRef<Promise<boolean> | null>(null);

  /* Aviso del navegador antes de cerrar con algo sin guardar. Es la última
     red: un cierre accidental no puede llevarse el último párrafo. */
  useEffect(() => {
    const antes = (e: BeforeUnloadEvent) => {
      if (estado === "sucio" || estado === "guardando") { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, [estado]);

  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  function programar(campos: Record<string, any>) {
    cola.current = { ...cola.current, ...campos };
    setEstado("sucio"); setErr("");
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => { volcar(); }, 800);
  }

  /** Manda lo que haya en la cola. De uno en uno: dos guardados a la vez
   *  pueden terminar en orden inverso y el viejo pisar al nuevo.
   *  Devuelve si quedó todo guardado. */
  async function volcar(): Promise<boolean> {
    if (reloj.current) { clearTimeout(reloj.current); reloj.current = null; }
    if (enVuelo.current) await enVuelo.current;          // espera al anterior
    if (!Object.keys(cola.current).length) return estado !== "error";

    const campos = cola.current;
    cola.current = {};
    setEstado("guardando");
    const tarea = (async () => {
      const r: any = await guardarSecuencia(sec.id, proyectoId, campos);
      if (r?.error) {
        /* Vuelve a la cola lo que no entró, pero SIN pisar lo que se haya
           escrito mientras tanto: lo nuevo manda sobre lo reencolado. */
        cola.current = { ...campos, ...cola.current };
        setEstado("error"); setErr(r.error);
        return false;
      }
      setEstado("guardado");
      return true;
    })();
    enVuelo.current = tarea.then(v => v) as any;
    const ok = await tarea;
    enVuelo.current = null;
    return ok;
  }

  /** Volcar y, solo si fue bien, refrescar. Todo lo que provoque un refresh
   *  pasa por aquí: si no, el servidor devuelve el texto viejo. */
  async function volcarYRefrescar() {
    if (await volcar()) router.refresh();
  }

  const pal = palabras(texto);
  const { min, estimado } = minutosDe({ minutos: minutos === "" ? null : Number(minutos), texto });
  const corto = pal > 0 && texto.trim().length < MIN_PARA_ANALIZAR;

  const ROTULO: Record<Estado, string> = {
    limpio: "", sucio: "· sin guardar", guardando: "· guardando…",
    guardado: "· guardado", error: "· NO se guardó",
  };

  async function mover(dir: -1 | 1) {
    if (!(await volcar())) return;      // no se mueve nada con texto en el aire
    const r: any = await moverSecuencia(sec.id, proyectoId, dir);
    if (r?.error) setErr(r.error); else router.refresh();
  }

  async function borrar(confirmado = false) {
    const r: any = await borrarSecuencia(sec.id, proyectoId, confirmado);
    if (r?.confirmar) { setPide({ palabras: r.palabras }); return; }
    if (r?.error) { setErr(r.error); return; }
    cola.current = {};                  // ya no hay a dónde guardarlo
    setPide(null); router.refresh();
  }

  async function alternarHilo(h: Hilo, on: boolean) {
    if (!(await volcar())) return;
    const r: any = await marcarHilo(sec.id, h.id, proyectoId, !on);
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

        <span className={`gu-estado gu-${estado}`}>{ROTULO[estado]}</span>
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
