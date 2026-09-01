"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  guardarIncidental, quitarIncidental, guardarUsoMusical, quitarUsoMusical,
} from "@/app/clearance/acciones";
import {
  DECISIONES_INCIDENTAL, ROTULO_DECISION_INC,
  DECISIONES_MUSICAL, ROTULO_DECISION_MUS,
  MODOS_MUSICAL, META_MODO_MUSICAL, esModoDeTercero,
  riesgoIncidental, riesgoUsoMusical, COLOR_RIESGO,
  type FilaIncidental, type FilaUsoMusical,
  type DecisionIncidental, type DecisionMusical, type ModoAparicionMusical,
} from "@/lib/clearance";

/* ══════════════════════════════════════════════════════════════════════════
   LA BITÁCORA DE MONTAJE — quién sale sin firmar, y qué suena

   ── EL CASO QUE LA PIDIÓ ──
   Al cargo del Patrón San Esteban acudió mucha gente. En la procesión y en la
   misa sale un montón de personas junto al mayordomo, y de ellas no tenemos ni
   los nombres. No se les puede pedir un release —no se sabe quiénes son— y
   tampoco se puede fingir que no salen.

   Lo que sí se puede es decidir, plano por plano, qué se hace: usarlo,
   reencuadrar, desenfocar, quitar el audio, sustituir el plano o descartarlo. Y
   dejarlo escrito, que es lo que convierte «no lo miramos» en «lo miramos y
   decidimos esto».

   ── ESTO NO SON AUTORIZACIONES ──
   Una autorización dice «esta persona firmó». Una aparición incidental dice
   «esta persona sale, NO firmó, y esto es lo que hicimos». Meter lo segundo en
   la tabla de permisos con estado «no aplica» sería un permiso que no existe, y
   perdería lo único que importa: qué se hizo.

   ── `resuelto` ES APARTE DE LA DECISIÓN ──
   ⚠ Decidir «desenfocar» y haberlo hecho en el corte son dos cosas, y entre
   ellas pasan semanas. El semáforo mira `resuelto`: una decisión tomada y no
   aplicada sigue siendo una persona sin desenfocar en la película.

   ── LAS FILAS SE PINTAN CON FUNCIONES ──
   ⚠ Un componente definido dentro del render es un tipo nuevo en cada pasada:
   React desmonta y remonta, y el campo que se escribe pierde foco y contenido.
   ══════════════════════════════════════════════════════════════════════════ */

export type OpcionCat = { id: string; nombre: string };

const VACIA_INC = {
  escenaOPlano: "", descripcionPersona: "",
  esIdentificable: true, tieneProtagonismo: false,
  esMenor: "por_revisar", contextoSensible: false, avisoFilmacionColocado: false,
  decisionMontaje: "pendiente" as DecisionIncidental, resuelto: false, nota: "",
};
const VACIO_USO = {
  timecodeInicio: "", timecodeFin: "", escena: "",
  obraId: "", grabacionId: "", agrupacionId: "",
  modoAparicion: "ejecucion_en_vivo_registrada" as ModoAparicionMusical,
  decisionMontaje: "pendiente" as DecisionMusical, autorizacionId: "",
  resuelto: false, nota: "",
};

export default function MontajeProyecto({
  proyectoId, incidentales, usos, obras, grabaciones, agrupaciones, licencias = [],
}: {
  proyectoId: string;
  incidentales: FilaIncidental[];
  usos: FilaUsoMusical[];
  obras: OpcionCat[];
  grabaciones: OpcionCat[];
  agrupaciones: OpcionCat[];
  /** Las licencias de fonograma FIRMADAS de este proyecto: lo único que puede
   *  dar por resuelta una música de tercero. */
  licencias?: OpcionCat[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"" | "inc" | "uso">("");
  const [inc, setInc] = useState({ ...VACIA_INC, id: "" });
  const [uso, setUso] = useState({ ...VACIO_USO, id: "" });
  const [quitando, setQuitando] = useState<string | null>(null);
  /* ⚠ Solo lo pendiente, por defecto. Lo resuelto se acumula y no se consulta:
     una lista con doscientas filas resueltas arriba esconde las cinco que hay
     que atender, que es como mueren estas bitácoras. */
  const [verTodo, setVerTodo] = useState(false);

  const correr = async (fn: () => Promise<any>, alTerminar?: () => void) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    let r: any;
    try { r = await fn(); }
    catch (e: any) {
      setOcupado(false);
      setError(`No hubo respuesta: ${e?.message || "se cortó"}. Recarga antes de repetir.`);
      return;
    }
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    alTerminar?.();
    router.refresh();
  };

  const abrirInc = (i?: FilaIncidental) => {
    setError(""); setQuitando(null); setPanel("inc");
    setInc(i ? {
      id: i.id,
      escenaOPlano: i.escena_o_plano || "", descripcionPersona: i.descripcion_persona || "",
      esIdentificable: i.es_identificable !== false,
      tieneProtagonismo: !!i.tiene_protagonismo,
      esMenor: String(i.es_menor || "por_revisar"),
      contextoSensible: !!i.contexto_sensible,
      avisoFilmacionColocado: !!i.aviso_filmacion_colocado,
      decisionMontaje: (i.decision_montaje as DecisionIncidental) || "pendiente",
      /* ⚠ LA NOTA, CARGADA. Se inicializaba a "" siempre y el panel no tenía
         campo para ella: abrir «editar», tocar una casilla y guardar la
         BORRABA, porque la acción manda `nota` y el update la pisa. Ahora se
         carga y se puede escribir. */
      resuelto: !!i.resuelto, nota: i.nota || "",
    } : { ...VACIA_INC, id: "" });
  };

  const abrirUso = (u?: FilaUsoMusical) => {
    setError(""); setQuitando(null); setPanel("uso");
    setUso(u ? {
      id: u.id,
      timecodeInicio: u.timecode_inicio || "", timecodeFin: u.timecode_fin || "",
      escena: u.escena || "",
      obraId: u.obra_id || "", grabacionId: u.grabacion_id || "",
      agrupacionId: u.agrupacion_id || "",
      modoAparicion: (u.modo_aparicion as ModoAparicionMusical) || "ejecucion_en_vivo_registrada",
      decisionMontaje: (u.decision_montaje as DecisionMusical) || "pendiente",
      autorizacionId: u.autorizacion_id || "",
      resuelto: !!u.resuelto, nota: u.nota || "",
    } : { ...VACIO_USO, id: "" });
  };

  const nombreDe = (l: OpcionCat[], id?: string | null) => l.find(x => x.id === id)?.nombre || null;

  /* Lo pendiente arriba y lo peor primero: es a lo que se entra. */
  const ordenInc = [...incidentales].sort((a, b) => {
    const ra = riesgoIncidental(a), rb = riesgoIncidental(b);
    const p = (r: typeof ra) => !r ? 9 : r.nivel === "critico" ? 0 : r.nivel === "alto" ? 1 : r.nivel === "medio" ? 2 : 3;
    return p(ra) - p(rb);
  }).filter(i => verTodo || !i.resuelto);
  const ordenUso = [...usos].sort((a, b) => {
    const ra = riesgoUsoMusical(a), rb = riesgoUsoMusical(b);
    const p = (r: typeof ra) => !r ? 9 : r.nivel === "critico" ? 0 : r.nivel === "alto" ? 1 : 2;
    return p(ra) - p(rb) || (a.timecode_inicio || "").localeCompare(b.timecode_inicio || "");
  }).filter(u => verTodo || !u.resuelto);

  const ocultasInc = incidentales.filter(i => i.resuelto).length;
  const ocultosUso = usos.filter(u => u.resuelto).length;

  const pintarInc = (i: FilaIncidental) => {
    const r = riesgoIncidental(i);
    const d = (i.decision_montaje as DecisionIncidental) || "pendiente";
    return (
      <div key={i.id} className="clr-fila">
        <span className="clr-ico">{i.resuelto ? "✓" : r?.nivel === "critico" ? "🚫" : r?.nivel === "alto" ? "🔶" : "·"}</span>
        <span className="clr-que">{i.escena_o_plano}</span>
        <span className="clr-quien">{i.descripcion_persona}</span>
        {i.es_menor === "si" && <span className="clr-cal">menor</span>}
        {i.es_menor === "por_revisar" && <span className="clr-cal">¿menor?</span>}
        {i.contexto_sensible && <span className="clr-cal">sensible</span>}
        <span className="clr-est" style={{ color: i.resuelto ? "var(--green)" : r ? COLOR_RIESGO[r.nivel] : undefined }}>
          {i.resuelto ? `resuelto · ${ROTULO_DECISION_INC[d]}` : ROTULO_DECISION_INC[d]}
        </span>
        {!i.resuelto && r && <span className="clr-mot" style={{ color: COLOR_RIESGO[r.nivel] }}>{r.txt}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="trt-acc" disabled={ocupado} onClick={() => abrirInc(i)}>editar</button>
        {quitando === i.id ? (
          <span style={{ fontSize: 11 }}>
            ¿quitar? <button className="ces-si" onClick={() => correr(() => quitarIncidental(i.id, proyectoId), () => setQuitando(null))}>sí</button>
            {" / "}<button className="ces-no" onClick={() => setQuitando(null)}>no</button>
          </span>
        ) : (
          /* ⚠ Cierra el panel y limpia el error. Con el formulario abierto, un
             fallo al quitar otra fila se pintaba DENTRO, como si hubiera
             fallado el guardado. Es el mismo fallo que PermisosProyecto ya
             documenta haber arreglado, reintroducido aquí. */
          <button type="button" className="cob-x" disabled={ocupado}
            onClick={() => { setError(""); setPanel(""); setQuitando(i.id); }}>✕</button>
        )}
      </div>
    );
  };

  const pintarUso = (u: FilaUsoMusical) => {
    const r = riesgoUsoMusical(u);
    const d = (u.decision_montaje as DecisionMusical) || "pendiente";
    const m = (u.modo_aparicion as ModoAparicionMusical) || "ejecucion_en_vivo_registrada";
    const qué = nombreDe(obras, u.obra_id) || nombreDe(grabaciones, u.grabacion_id)
      || nombreDe(agrupaciones, u.agrupacion_id) || "sin identificar";
    return (
      <div key={u.id} className="clr-fila">
        <span className="clr-ico">{u.resuelto ? "✓" : r?.nivel === "critico" ? "🚫" : r?.nivel === "alto" ? "🔶" : "·"}</span>
        <span className="clr-que">{u.timecode_inicio || u.escena}</span>
        <span className="clr-quien">{qué}</span>
        <span className="clr-cal" title={META_MODO_MUSICAL[m]?.ayuda}>{META_MODO_MUSICAL[m]?.txt}</span>
        <span className="clr-est" style={{ color: u.resuelto ? "var(--green)" : r ? COLOR_RIESGO[r.nivel] : undefined }}>
          {u.resuelto ? `resuelto · ${ROTULO_DECISION_MUS[d]}` : ROTULO_DECISION_MUS[d]}
        </span>
        {!u.resuelto && r && <span className="clr-mot" style={{ color: COLOR_RIESGO[r.nivel] }}>{r.txt}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="trt-acc" disabled={ocupado} onClick={() => abrirUso(u)}>editar</button>
        {quitando === u.id ? (
          <span style={{ fontSize: 11 }}>
            ¿quitar? <button className="ces-si" onClick={() => correr(() => quitarUsoMusical(u.id, proyectoId), () => setQuitando(null))}>sí</button>
            {" / "}<button className="ces-no" onClick={() => setQuitando(null)}>no</button>
          </span>
        ) : (
          <button type="button" className="cob-x" disabled={ocupado}
            onClick={() => { setError(""); setPanel(""); setQuitando(u.id); }}>✕</button>
        )}
      </div>
    );
  };

  return (
    <div className="clr-lista">
      <div className="trt-cab-t" style={{ marginTop: 14 }}>
        quién sale sin firmar · {incidentales.filter(i => !i.resuelto).length} sin resolver
      </div>
      {ordenInc.length ? ordenInc.map(pintarInc) : (
        <div className="trt-vacio">
          {incidentales.length
            ? "Todo lo apuntado está resuelto."
            : "Nadie apuntado todavía. Va aquí la gente que sale y no firmó —la multitud de la procesión, quien pasa por detrás— con la decisión que se tomó sobre cada plano."}
        </div>
      )}

      <div className="trt-cab-t" style={{ marginTop: 14 }}>
        qué suena en el corte · {usos.filter(u => !u.resuelto).length} sin resolver
      </div>
      {ordenUso.length ? ordenUso.map(pintarUso) : (
        <div className="trt-vacio">
          {usos.length
            ? "Todo lo apuntado está resuelto."
            : "Nada apuntado todavía. Va aquí cada música audible con su timecode, para poder recorrer la película sin abrir el montaje."}
        </div>
      )}

      <div className="cob-pie">
        <button type="button" className="cesl-mas" disabled={ocupado}
          onClick={() => abrirInc()}>＋ alguien que sale sin firmar</button>
        <button type="button" className="cesl-mas" disabled={ocupado}
          onClick={() => abrirUso()}>＋ música en el corte</button>
        {(ocultasInc + ocultosUso) > 0 && (
          <button type="button" className="gx-filtro" onClick={() => setVerTodo(v => !v)}>
            {verTodo ? "ocultar lo resuelto" : `ver también lo resuelto (${ocultasInc + ocultosUso})`}
          </button>
        )}
      </div>

      {panel === "inc" && (
        <div className="ces-panel mus-form">
          <div className="ces-panel-h">
            <b>{inc.id ? "Editar" : "Apuntar"} a alguien que sale sin firmar</b>
            <span style={{ flex: 1 }} />
            <button type="button" className="ces-x" onClick={() => setPanel("")}>✕</button>
          </div>
          <div className="ces-ayuda">
            El art. 15 del Código Civil admite excepciones al consentimiento cuando la
            imagen se capta en un lugar público y la persona no es el objeto principal
            del plano. Por eso lo que decide aquí no es «¿sale?» sino si es
            identificable y si tiene protagonismo — y por eso el menor y el contexto
            sensible van aparte: ahí no hay excepción que valga.
          </div>
          <div className="ces-campos">
            <label>
              <span>En qué plano o escena</span>
              <input value={inc.escenaOPlano} maxLength={200} placeholder="PL-12, o «salida de la procesión»"
                onChange={e => setInc(x => ({ ...x, escenaOPlano: e.target.value }))} />
            </label>
            <label>
              <span>Quién — lo justo para encontrarla</span>
              <input value={inc.descripcionPersona} maxLength={300}
                placeholder="señora de pollera roja, a la izquierda"
                onChange={e => setInc(x => ({ ...x, descripcionPersona: e.target.value }))} />
            </label>
          </div>
          {/* ⚠ SIN DATO IDENTIFICATIVO INNECESARIO. Apuntar un nombre a medias o
              un parentesco es recoger un dato personal de alguien que no lo dio,
              para una finalidad que no lo necesita. */}
          <div className="ces-ayuda">
            No hace falta —ni conviene— apuntar su nombre ni su parentesco: con
            encontrarla en el plano basta.
          </div>

          <label className="clr-check">
            <input type="checkbox" checked={inc.esIdentificable}
              onChange={e => setInc(x => ({ ...x, esIdentificable: e.target.checked }))} />
            <span>Se le <b>reconoce la cara</b> — de espaldas o de lejos, desmárcalo</span>
          </label>
          <label className="clr-check">
            <input type="checkbox" checked={inc.tieneProtagonismo}
              onChange={e => setInc(x => ({ ...x, tieneProtagonismo: e.target.checked }))} />
            <span>Es <b>el objeto del plano</b> — un primer plano, o el plano existe por ella.
              Entonces ya no es incidental y necesita firma</span>
          </label>
          <label className="clr-check">
            <input type="checkbox" checked={inc.contextoSensible}
              onChange={e => setInc(x => ({ ...x, contextoSensible: e.target.checked }))} />
            <span>Contexto <b>sensible</b> — puede afectar a su honor, su intimidad o su
              seguridad. El lugar público no excusa nada de eso</span>
          </label>
          <label className="clr-check">
            <input type="checkbox" checked={inc.avisoFilmacionColocado}
              onChange={e => setInc(x => ({ ...x, avisoFilmacionColocado: e.target.checked }))} />
            <span>Había <b>cartel de «se está filmando»</b> en el acceso — no es un
              consentimiento, pero es diligencia y baja el riesgo</span>
          </label>

          <div className="ces-campos">
            <label>
              <span>¿Es menor de edad?</span>
              <select value={inc.esMenor} onChange={e => setInc(x => ({ ...x, esMenor: e.target.value }))}>
                <option value="por_revisar">está sin revisar</option>
                <option value="no">no</option>
                <option value="si">sí</option>
              </select>
            </label>
            <label>
              <span>Qué se hace con el plano</span>
              <select value={inc.decisionMontaje}
                onChange={e => setInc(x => ({ ...x, decisionMontaje: e.target.value as DecisionIncidental }))}>
                {DECISIONES_INCIDENTAL.map(d => (
                  <option key={d} value={d}>{ROTULO_DECISION_INC[d]}</option>
                ))}
              </select>
            </label>
          </div>

          {inc.esMenor === "si" && inc.esIdentificable && (
            <div className="ces-aviso">
              ⚠ Un menor identificable sin la firma de su representante legal solo se
              resuelve desenfocando, reencuadrando, sustituyendo el plano o
              descartándolo. «Usar tal cual» no es una salida.
            </div>
          )}

          <label className="ces-l">
            <span>Nota</span>
            <input value={inc.nota} maxLength={1000} placeholder="opcional"
              onChange={e => setInc(x => ({ ...x, nota: e.target.value }))} />
          </label>

          <label className="clr-check">
            <input type="checkbox" checked={inc.resuelto}
              onChange={e => setInc(x => ({ ...x, resuelto: e.target.checked }))} />
            <span><b>Ya está hecho en el corte</b> — ⚠ no lo marques al decidirlo, sino
              al aplicarlo. Decidir desenfocar y haberlo desenfocado son dos cosas, y
              el semáforo mira esta</span>
          </label>

          {error && <div className="err-inline">⚠ {error}</div>}
          <div className="ces-pie">
            <span style={{ flex: 1 }} />
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} disabled={ocupado}
              onClick={() => correr(
                () => guardarIncidental(proyectoId, { ...inc, id: inc.id || undefined }),
                () => setPanel(""))}>{ocupado ? "…" : "Guardar"}</button>
          </div>
        </div>
      )}

      {panel === "uso" && (
        <div className="ces-panel mus-form">
          <div className="ces-panel-h">
            <b>{uso.id ? "Editar" : "Apuntar"} música del corte</b>
            <span style={{ flex: 1 }} />
            <button type="button" className="ces-x" onClick={() => setPanel("")}>✕</button>
          </div>
          <div className="ces-campos">
            <label>
              <span>Empieza en</span>
              <input value={uso.timecodeInicio} maxLength={40} placeholder="00:14:20"
                onChange={e => setUso(x => ({ ...x, timecodeInicio: e.target.value }))} />
            </label>
            <label>
              <span>Termina en</span>
              <input value={uso.timecodeFin} maxLength={40} placeholder="00:16:05"
                onChange={e => setUso(x => ({ ...x, timecodeFin: e.target.value }))} />
            </label>
          </div>
          <label className="ces-l">
            <span>O la escena, si no hay timecode todavía</span>
            <input value={uso.escena} maxLength={200} placeholder="la procesión, al salir del templo"
              onChange={e => setUso(x => ({ ...x, escena: e.target.value }))} />
          </label>

          <label className="ces-l">
            <span>Cómo aparece</span>
            <select value={uso.modoAparicion}
              onChange={e => setUso(x => ({ ...x, modoAparicion: e.target.value as ModoAparicionMusical }))}>
              {MODOS_MUSICAL.map(m => <option key={m} value={m}>{META_MODO_MUSICAL[m].txt}</option>)}
            </select>
          </label>
          <div className={esModoDeTercero(uso.modoAparicion) ? "ces-aviso" : "ces-ayuda"}>
            {META_MODO_MUSICAL[uso.modoAparicion].ayuda}
          </div>

          <div className="ces-campos">
            <label>
              <span>Qué obra</span>
              <select value={uso.obraId} onChange={e => setUso(x => ({ ...x, obraId: e.target.value }))}>
                <option value="">— sin identificar —</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </label>
            <label>
              <span>Qué grabación</span>
              <select value={uso.grabacionId} onChange={e => setUso(x => ({ ...x, grabacionId: e.target.value }))}>
                <option value="">— ninguna —</option>
                {grabaciones.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </label>
          </div>
          <label className="ces-l">
            <span>Quién la toca, si es en vivo</span>
            <select value={uso.agrupacionId} onChange={e => setUso(x => ({ ...x, agrupacionId: e.target.value }))}>
              <option value="">— ninguna —</option>
              {agrupaciones.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>

          <label className="ces-l">
            <span>Qué se hace con ella</span>
            <select value={uso.decisionMontaje}
              onChange={e => setUso(x => ({ ...x, decisionMontaje: e.target.value as DecisionMusical }))}>
              {DECISIONES_MUSICAL.map(d => <option key={d} value={d}>{ROTULO_DECISION_MUS[d]}</option>)}
            </select>
          </label>
          {uso.decisionMontaje === "licenciar" && (
            <label className="ces-l">
              <span>Qué licencia lo cubre</span>
              <select value={uso.autorizacionId}
                onChange={e => setUso(x => ({ ...x, autorizacionId: e.target.value }))}>
                <option value="">— todavía ninguna —</option>
                {licencias.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </label>
          )}
          {esModoDeTercero(uso.modoAparicion) && (
            <div className="ces-aviso">
              ⚠ Es de un tercero: no se resuelve manteniéndola. Atenúala, sustitúyela,
              cambia de toma — o licénciala y ata aquí la licencia firmada. Pedirla no
              es tenerla, y esto es lo único que puede bloquear el vídeo solo.
            </div>
          )}

          <label className="ces-l">
            <span>Nota</span>
            <input value={uso.nota} maxLength={1000} placeholder="opcional"
              onChange={e => setUso(x => ({ ...x, nota: e.target.value }))} />
          </label>

          <label className="clr-check">
            <input type="checkbox" checked={uso.resuelto}
              onChange={e => setUso(x => ({ ...x, resuelto: e.target.checked }))} />
            <span><b>Ya está hecho en el corte</b> — al aplicarlo, no al decidirlo</span>
          </label>

          {error && <div className="err-inline">⚠ {error}</div>}
          <div className="ces-pie">
            <span style={{ flex: 1 }} />
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} disabled={ocupado}
              onClick={() => correr(
                () => guardarUsoMusical(proyectoId, { ...uso, id: uso.id || undefined }),
                () => setPanel(""))}>{ocupado ? "…" : "Guardar"}</button>
          </div>
        </div>
      )}

      {error && !panel && <div className="err-inline">⚠ {error}</div>}
    </div>
  );
}
