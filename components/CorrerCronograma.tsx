"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { correrCronograma } from "@/app/actions";
import { type Etapa, nombreEtapa } from "@/lib/etapas";
import {
  planear, rotuloDias, MOTIVO,
  type ActCorrer, type Alcance, type Plan,
} from "@/lib/correrCronograma";
/* `fechaCorta` y NO `fechaDia`: `fechaDia` es {día, mes} y se come el AÑO.
   Con un destino mal tecleado —el año 0007 sale de escribir «7» en ese segmento
   del calendario— la lista rotulaba «20 ago. → 12 sept.», que se lee
   perfectamente normal. El año no cambia nunca en un caso real; justo por eso,
   cuando cambia hay que verlo.
   `fechaCorta` y no `fechaDiaLima`: son columnas `date`, y `fechaDiaLima` las
   parsea como medianoche UTC y en Lima las devuelve un día antes. */
import { fechaCorta, hoyLima } from "@/lib/fechas";

/* ══════════════════════════════════════════════════════════════════════════
   ⏩ CORRER EL CRONOGRAMA — la previsualización manda

   Un desplazamiento en cascada reescribe las dos fechas de veintitantas filas
   de golpe y no hay «deshacer». Así que esta pantalla es, sobre todo, el sitio
   donde se MIRA antes: cuántos días, qué se mueve, qué se queda y por qué, y
   todos los avisos —el plazo del acta, los domingos, lo ya finalizado— antes de
   pulsar nada.

   ── LA CUENTA SE HACE DOS VECES, Y ESO ES A PROPÓSITO ──
   Aquí, para enseñarla, y otra vez en el servidor, para aplicarla. Entre mirar
   y pulsar, otro miembro del equipo puede haber movido una actividad. El plan
   que se aplica sale SIEMPRE de las filas de la base, nunca de este componente;
   si no coincidieran, manda el servidor y este cuadro solo era una promesa.

   ── POR QUÉ NO HAY «DESHACER» Y SÍ UNA VERSIÓN ──
   Al correr, la versión vigente del cronograma baja a histórico con las fechas
   viejas y entra una nueva con las corridas. Eso ES el deshacer: queda escrito
   lo que había, con su fecha y su motivo, y se puede leer un año después.
   ══════════════════════════════════════════════════════════════════════════ */

export default function CorrerCronograma({
  postulacionId, actividades, etapas, limite, limiteNombre, onCerrar,
}: {
  postulacionId: string;
  actividades: ActCorrer[];
  etapas: Etapa[];
  /** El plazo que manda, ya decidido por `plazoFondo`. */
  limite?: string | null;
  /** Sin artículo: «plazo del acta», «plazo con prórroga». */
  limiteNombre?: string;
  onCerrar: () => void;
}) {
  const router = useRouter();

  /* Las etapas que de verdad tienen actividades. Ofrecer «desde Postproducción»
     en un cronograma que no tiene ninguna actividad de postproducción es
     ofrecer un botón que no hace nada. */
  const conActs = useMemo(() => {
    const usadas = new Set(actividades.map(a => a.etapa || ""));
    return etapas.filter(e => usadas.has(e.clave));
  }, [actividades, etapas]);

  const [modo, setModo] = useState<"desde-etapa" | "solo-etapa" | "todo">("desde-etapa");
  /* Arranca en rodaje si lo hay —es la etapa que se corre nueve de cada diez
     veces— y si no, en la primera con actividades. */
  const [etapa, setEtapa] = useState(
    conActs.find(e => e.clave === "produccion")?.clave || conActs[0]?.clave || "");
  const [fecha, setFecha] = useState("");
  const [moverHechas, setMoverHechas] = useState(false);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [verQuietas, setVerQuietas] = useState(false);
  const [hecho, setHecho] = useState("");

  const alcance: Alcance = modo === "todo" ? { modo: "todo" } : { modo, etapa };

  /* El plan se recalcula con cada tecla de la fecha. Es aritmética sobre un
     array de decenas de filas: no hace falta memorizar nada, y memorizarlo
     escondería que depende de `moverHechas`. */
  const plan: Plan = planear(actividades, etapas, alcance, fecha,
    { limite, limiteNombre, moverHechas, hoy: hoyLima() });

  /* La fecha actual del ancla, para el «de … a …». Se enseña ANTES de que
     alguien elija fecha: sin ella, la caja de fecha está vacía y no se sabe
     desde dónde se está moviendo. */
  const anclaActual = useMemo(() => {
    /* Sin `hoy`: esta llamada solo saca el ancla y el aviso de las finalizadas
       futuras no pinta nada aquí. */
    const p = planear(actividades, etapas, alcance, "2099-12-31", { moverHechas });
    return p.ancla;
  }, [actividades, etapas, modo, etapa, moverHechas]);

  const aplicar = async () => {
    if (ocupado || !plan.viable) return;
    setOcupado(true); setError(""); setHecho("");
    let r: any;
    try {
      r = await correrCronograma({
        postulacionId, modo, etapa: modo === "todo" ? undefined : etapa,
        fecha, moverHechas, nota,
      });
    } catch (e: any) {
      /* ⚠ SIN ESTE CATCH EL BOTÓN SE QUEDABA EN «Corriendo…» PARA SIEMPRE.
         Si la acción lanza —corte de red, plazo de la función agotada—, la
         promesa rechaza y `setOcupado(false)` nunca corre: ni error, ni cierre,
         ni forma de saber qué pasó. Y como la escritura va fila por fila, en ese
         momento puede haber doce movidas y catorce no.
         Lo peor era volver a abrir: el ancla ya estaría movida, el plan diría
         «ya empieza ese día» y eso se lee como que todo salió bien. */
      setOcupado(false);
      setError(`Se cortó a mitad: ${e?.message || "no hubo respuesta"}. Cierra, vuelve a abrir y MIRA la previsualización antes de repetir — puede que parte ya se haya movido.`);
      router.refresh();
      return;
    }
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    /* Un aviso NO cierra el cuadro. Si tres filas no entraron, el cronograma
       está corrido a medias y cerrar con un «listo» lo escondería. */
    if (r?.aviso) { setError(r.aviso); router.refresh(); return; }
    /* Se confirma DENTRO del cuadro y en verde, no cerrándolo: cerrar de golpe
       deja la duda de si se aplicó lo que se estaba mirando. */
    setHecho(`${r?.movidas ?? 0} actividad${r?.movidas === 1 ? "" : "es"} movida${r?.movidas === 1 ? "" : "s"}`
      + (r?.casos ? ` · ${r.casos} caso${r.casos === 1 ? "" : "s"} de la agenda` : ""));
    router.refresh();
    setTimeout(onCerrar, 1600);
  };

  const nom = (c: string | null) =>
    etapas.find(e => e.clave === c)?.nombre || nombreEtapa(c || "") || "sin etapa";

  return (
    <div className="crr">
      <div className="crr-cab">
        <b>⏩ Correr el cronograma</b>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}
          onClick={onCerrar}>✕</button>
      </div>

      {/* ── QUÉ SE MUEVE ── */}
      <div className="crr-fila">
        <span className="crr-rot">Mover</span>
        <select className="crr-inp" value={modo} onChange={e => setModo(e.target.value as any)}>
          <option value="desde-etapa">esta etapa y todo lo posterior</option>
          <option value="solo-etapa">solo esta etapa</option>
          <option value="todo">el cronograma entero</option>
        </select>
        {modo !== "todo" && (
          <select className="crr-inp" value={etapa} onChange={e => setEtapa(e.target.value)}>
            {conActs.map(e => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
          </select>
        )}
      </div>

      {/* ── A QUÉ FECHA ──
          Se nombra la actividad ancla, no la etapa: lo que se lleva a esa fecha
          es una actividad concreta —la primera del bloque— y el resto se mueve
          lo mismo que ella. Decir «la etapa empieza el…» ocultaría que dentro
          de la etapa las distancias no cambian. */}
      <div className="crr-fila">
        <span className="crr-rot">Empieza el</span>
        <input type="date" className="crr-inp" value={fecha} onChange={e => setFecha(e.target.value)} />
        {anclaActual && (
          <span className="crr-nota">
            «{anclaActual.nombre}» empieza hoy el {fechaCorta(anclaActual.fecha_inicio!)}
          </span>
        )}
      </div>

      <label className="crr-check">
        <input type="checkbox" checked={moverHechas} onChange={e => setMoverHechas(e.target.checked)} />
        <span>
          Mover también las <b>finalizadas</b>
          <span className="crr-nota"> — por defecto se quedan: sus fechas cuadran con los RHE y los comprobantes, que no se mueven con esto.</span>
        </span>
      </label>

      {/* ══════════════ LA PREVISUALIZACIÓN ══════════════ */}
      {!fecha ? (
        <div className="crr-vacio">Elige la fecha nueva y aquí sale exactamente qué se mueve.</div>
      ) : !plan.viable ? (
        <div className="crr-alto">⚠ {plan.avisos.find(a => a.nivel === "alto")?.texto}</div>
      ) : (
        <>
          <div className="crr-titular">
            <b>{rotuloDias(plan.dias)}</b>
            {" · "}{plan.mueve.length} actividad{plan.mueve.length === 1 ? "" : "es"}
            {plan.quietas.length ? ` · ${plan.quietas.length} sin tocar` : ""}
          </div>

          {plan.antes && plan.despues && (
            <div className="crr-rango">
              <span>{fechaCorta(plan.antes.desde)} → {fechaCorta(plan.antes.hasta)}</span>
              <span className="crr-flecha">⇒</span>
              <b>{fechaCorta(plan.despues.desde)} → {fechaCorta(plan.despues.hasta)}</b>
            </div>
          )}

          {plan.avisos.map((a, i) => (
            <div key={i} className={a.nivel === "alto" ? "crr-alto" : "crr-aviso"}>⚠ {a.texto}</div>
          ))}

          <div className="crr-lista">
            {plan.mueve.map(m => (
              <div key={m.act.id} className="crr-mov">
                <span className="crr-pt" style={{ background: etapas.find(e => e.clave === m.act.etapa)?.color || "var(--dim)" }} />
                <span className="crr-nom">{m.act.nombre}</span>
                <span className="crr-vieja">{fechaCorta(m.iniViejo)}</span>
                <span className="crr-flecha">→</span>
                <b className="crr-nueva">{fechaCorta(m.ini)}</b>
                <span className="crr-fin">hasta {fechaCorta(m.fin)}</span>
              </div>
            ))}
          </div>

          {/* ── LO QUE NO SE MUEVE, Y POR QUÉ ──
              Plegado, pero presente. Un «3 sin tocar» sin la lista obliga a
              confiar; con la lista se puede discutir. */}
          {plan.quietas.length > 0 && (
            <div className="crr-quietas">
              <button type="button" className="crr-mas" onClick={() => setVerQuietas(v => !v)}>
                {verQuietas ? "▾" : "▸"} {plan.quietas.length} se quedan donde están
              </button>
              {verQuietas && plan.quietas.map(q => (
                <div key={q.act.id} className="crr-mov crr-quieta">
                  <span className="crr-nom">{q.act.nombre}</span>
                  <span className="crr-vieja">{nom(q.act.etapa)}</span>
                  <span className="crr-motivo">{MOTIVO[q.motivo]}</span>
                </div>
              ))}
            </div>
          )}

          <div className="crr-fila">
            <span className="crr-rot">Por qué</span>
            <input className="crr-inp" style={{ flex: 1 }} value={nota} maxLength={200}
              placeholder="se atrasó el permiso de filmación… (opcional, queda en la versión)"
              onChange={e => setNota(e.target.value)} />
          </div>
        </>
      )}

      {error && <div className="err-inline">⚠ {error}</div>}
      {hecho && <div className="crr-hecho">✓ {hecho}</div>}

      <div className="crr-pie">
        {/* Se dice lo que va a pasar con las versiones ANTES de pulsar, no
            después. Es la parte que no se ve en la lista de arriba. */}
        <span className="crr-nota">
          Las fechas de ahora quedan guardadas como versión histórica.
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }}
          onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn" style={{ padding: "7px 16px", fontSize: 12 }}
          disabled={!plan.viable || ocupado || !!hecho} onClick={aplicar}>
          {ocupado ? "Corriendo…" : hecho ? "✓ Hecho" : plan.viable ? `Correr ${plan.mueve.length}` : "Correr"}
        </button>
      </div>
    </div>
  );
}
