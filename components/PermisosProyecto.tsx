"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import {
  guardarAgrupacion, guardarAutorizacion, cambiarEstadoAutorizacion,
  corregirAutorizacion, quitarAutorizacion, apuntarGestion,
} from "@/app/clearance/acciones";
import {
  TIPOS_AUT, META_TIPO_AUT, ROTULO_CALIDAD, ROTULO_ESTADO_AUT, COLOR_RIESGO,
  estaAbierta,
  type FilaAutorizacion, type TipoAutorizacion, type CalidadFirmante,
  type EstadoAutorizacion, type NivelRiesgo,
} from "@/lib/clearance";

/* ══════════════════════════════════════════════════════════════════════════
   REGISTRAR Y MOVER PERMISOS

   ── EL FORMULARIO CAMBIA SEGÚN QUÉ SE AUTORIZA ──
   Es lo único importante de este componente, y es R2 hecho interfaz: elegir
   «obra musical» deja de ofrecer personas como objeto y pide una obra, porque
   quien toca una canción no tiene derechos sobre la composición. Con un
   formulario plano, ese error se comete el primer día y no se ve nunca más.

   ── LA CALIDAD ESTÁ SIEMPRE A LA VISTA ──
   No escondida tras «avanzado». Es el campo que distingue «Jennifer firmó lo
   suyo» de «Jennifer firmó por las once», y esconderlo es volver al modelo que
   contaba una firma como once.

   ── LAS FILAS SE PINTAN CON FUNCIONES ──
   ⚠ Un componente definido dentro del render es un tipo nuevo en cada pasada:
   React desmonta y remonta, y el campo que se está escribiendo pierde el foco
   y lo escrito. Ya costó una tanda.
   ══════════════════════════════════════════════════════════════════════════ */

export type OpcionCatalogo = { id: string; nombre: string };

const CALIDADES: CalidadFirmante[] = [
  "titular", "representante_agrupacion", "representante_legal_menor",
  "heredero_o_causahabiente", "propietario_administrador",
  "organizador_actividad", "autoridad_comunal", "representante_entidad",
];
const ESTADOS: EstadoAutorizacion[] = [
  "no_iniciada", "en_gestion", "solicitada", "firmada",
  "rechazada", "no_ubicable", "no_aplica",
];
const CANALES = ["llamada", "whatsapp", "correo", "presencial", "carta", "intermediario"];
const RESULTADOS = ["sin_respuesta", "respondio", "acepto", "rechazo", "no_ubicable"];
const TIPOS_AGR: [string, string][] = [
  ["banda_musicos", "banda de músicos"], ["conjunto_danza", "conjunto de danza"],
  ["cuadrilla", "cuadrilla"], ["hermandad", "hermandad"], ["otro", "otro"],
];

type Nuevo = {
  tipo: TipoAutorizacion;
  otorganteTipo: "persona" | "agrupacion" | "entidad_externa";
  otorgantePersonaId: string; otorganteAgrupacionId: string; otorganteEntidadNombre: string;
  calidad: CalidadFirmante;
  objetoPersonaId: string; objetoObraId: string; objetoGrabacionId: string; objetoAgrupacionId: string;
  estado: EstadoAutorizacion; firmadoEl: string;
  permiteUsoPromocional: boolean; incluyeComercialFutura: boolean;
  notas: string;
};

const VACIO: Nuevo = {
  tipo: "imagen_voz_testimonio", otorganteTipo: "persona",
  otorgantePersonaId: "", otorganteAgrupacionId: "", otorganteEntidadNombre: "",
  calidad: "titular",
  objetoPersonaId: "", objetoObraId: "", objetoGrabacionId: "", objetoAgrupacionId: "",
  estado: "no_iniciada", firmadoEl: "",
  permiteUsoPromocional: true, incluyeComercialFutura: false, notas: "",
};

export default function PermisosProyecto({
  proyectoId, autorizaciones, personas, agrupaciones, obras, grabaciones, riesgos, hoy,
}: {
  proyectoId: string;
  autorizaciones: FilaAutorizacion[];
  personas: CatalogoItem[];
  agrupaciones: OpcionCatalogo[];
  obras: OpcionCatalogo[];
  grabaciones: OpcionCatalogo[];
  /** El riesgo de cada permiso por su id, CALCULADO EN EL SERVIDOR.
   *  ⚠ Aquí llegaba la función que lo calcula, y un closure no se puede
   *  serializar a un componente cliente: Next lanza «Functions cannot be passed
   *  directly to Client Components» al renderizar. `tsc` no lo veía. */
  riesgos: Record<string, NivelRiesgo>;
  hoy: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"" | "permiso" | "banda">("");
  const [n, setN] = useState<Nuevo>({ ...VACIO });
  const [ban, setBan] = useState({ nombre: "", tipo: "banda_musicos", procedencia: "", declarado: "" });
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [mov, setMov] = useState({ estado: "en_gestion", firmadoEl: "", notas: "" });
  const [corr, setCorr] = useState<{ calidad: CalidadFirmante; promo: boolean }>(
    { calidad: "titular", promo: true });
  const [gestion, setGestion] = useState<string | null>(null);
  const [ges, setGes] = useState({ canal: "llamada", resultado: "sin_respuesta", detalle: "" });
  const [quitando, setQuitando] = useState<string | null>(null);

  const set = (k: keyof Nuevo, v: any) => setN(x => ({ ...x, [k]: v }));

  const nombreDe = (lista: { id: string; nombre: string }[], id?: string | null) =>
    lista.find(x => x.id === id)?.nombre || null;

  const correr = async (fn: () => Promise<any>, alTerminar?: () => void) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    let r: any;
    try { r = await fn(); }
    catch (e: any) {
      /* Sin esto, un corte deja el botón en «…» para siempre y sin decir nada. */
      setOcupado(false);
      setError(`No hubo respuesta: ${e?.message || "se cortó"}. Recarga antes de repetir.`);
      return;
    }
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    alTerminar?.();
    router.refresh();
  };

  /* ── QUÉ OBJETO PIDE ESTE TIPO ──
     La lista sale de `META_TIPO_AUT`, no de un `if` aquí: es la misma regla que
     usa el recuento, y con dos copias el formulario y el riesgo acabarían
     discrepando sobre qué es válido. */
  const meta = META_TIPO_AUT[n.tipo];
  const pideAgrupacionOPersona = n.tipo === "interpretacion_musical" || n.tipo === "interpretacion_danza";
  const pideObra = meta.objeto === "obra";
  const pideGrabacion = meta.objeto === "grabacion";
  const pidePersona = meta.objeto === "persona";

  const guardarNuevo = () => correr(() => guardarAutorizacion(proyectoId, {
    tipo: n.tipo,
    otorganteTipo: n.otorganteTipo,
    otorgantePersonaId: n.otorgantePersonaId || null,
    otorganteAgrupacionId: n.otorganteAgrupacionId || null,
    otorganteEntidadNombre: n.otorganteEntidadNombre,
    calidadFirmante: n.calidad,
    objetoPersonaId: n.objetoPersonaId || null,
    objetoObraId: n.objetoObraId || null,
    objetoGrabacionId: n.objetoGrabacionId || null,
    objetoAgrupacionId: n.objetoAgrupacionId || null,
    estado: n.estado, firmadoEl: n.firmadoEl,
    permiteUsoPromocional: n.permiteUsoPromocional,
    incluyeExplotacionComercialFutura: n.incluyeComercialFutura,
    notas: n.notas,
  }), () => { setN({ ...VACIO }); setPanel(""); });

  const pintarFila = (a: FilaAutorizacion) => {
    const r = riesgos[a.id] || "bajo";
    const t = a.tipo as TipoAutorizacion;
    const cal = a.calidad_firmante as CalidadFirmante;
    const quien = nombreDe(personas as any, a.otorgante_persona_id)
      || nombreDe(agrupaciones, a.otorgante_agrupacion_id)
      || a.otorgante_entidad_nombre || "—";
    const sobre = nombreDe(personas as any, a.objeto_persona_id)
      || nombreDe(obras, a.objeto_obra_id)
      || nombreDe(grabaciones, a.objeto_grabacion_id)
      || nombreDe(agrupaciones, a.objeto_agrupacion_id);
    return (
      <div key={a.id} className="clr-fila">
        <span className="clr-ico">{META_TIPO_AUT[t]?.ico || "📄"}</span>
        <span className="clr-que" title={META_TIPO_AUT[t]?.largo}>{META_TIPO_AUT[t]?.corto || a.tipo}</span>
        <span className="clr-quien">{quien}{sobre && sobre !== quien ? ` → ${sobre}` : ""}</span>
        {cal && cal !== "titular" && (
          <span className="clr-cal" title={ROTULO_CALIDAD[cal]?.cubre}>{ROTULO_CALIDAD[cal]?.txt}</span>
        )}
        <span className="clr-est" style={{ color: COLOR_RIESGO[r] }}>
          {ROTULO_ESTADO_AUT[a.estado as EstadoAutorizacion] || a.estado}
        </span>
        {a.firmado_el && <span className="cesl-fecha">{a.firmado_el}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="trt-acc" disabled={ocupado}
          onClick={() => {
            setGestion(null); setQuitando(null); setError(""); setPanel("");
            setMoviendo(moviendo === a.id ? null : a.id);
            setMov({ estado: String(a.estado || "en_gestion"), firmadoEl: a.firmado_el || "", notas: "" });
            setCorr({ calidad: (a.calidad_firmante as CalidadFirmante) || "titular",
              promo: a.permite_uso_promocional !== false });
          }}>estado</button>
        {estaAbierta(a.estado) && (
          <button type="button" className="trt-acc" disabled={ocupado}
            title="Apuntar un intento de contacto. Si no se logra ubicar a quien firma, la prueba del intento razonable es parte de la defensa."
            /* ⚠ `ges` se reinicia al cambiar de fila. Sin esto, escribir «llamé
               al número que dejó» en la fila A y abrir la B dejaba ese detalle
               precargado, y se apuntaba contra la autorización equivocada. */
            onClick={() => { setMoviendo(null); setQuitando(null); setError(""); setPanel("");
              setGes({ canal: "llamada", resultado: "sin_respuesta", detalle: "" });
              setGestion(gestion === a.id ? null : a.id); }}>gestión</button>
        )}
        {/* ⚠ Solo las que NO están firmadas. Una firmada es la prueba de que
            alguien autorizó, y el expediente se enseña meses después. */}
        {a.estado !== "firmada" && (
          quitando === a.id ? (
            <span style={{ fontSize: 11 }}>
              ¿quitar? <button className="ces-si" onClick={() =>
                correr(() => quitarAutorizacion(a.id, proyectoId), () => setQuitando(null))}>sí</button>
              {" / "}<button className="ces-no" onClick={() => setQuitando(null)}>no</button>
            </span>
          ) : (
            <button type="button" className="cob-x" disabled={ocupado}
              onClick={() => { setMoviendo(null); setGestion(null); setQuitando(a.id); }}>✕</button>
          )
        )}

        {moviendo === a.id && (
          <div className="ces-panel mus-form" style={{ width: "100%", marginTop: 6 }}>
            <div className="ces-campos">
              <label>
                <span>Estado</span>
                <select value={mov.estado} onChange={e => setMov(m => ({ ...m, estado: e.target.value }))}>
                  {ESTADOS.map(e2 => <option key={e2} value={e2}>{ROTULO_ESTADO_AUT[e2]}</option>)}
                </select>
              </label>
              <label>
                <span>Firmado el</span>
                <input type="date" value={mov.firmadoEl}
                  onChange={e => setMov(m => ({ ...m, firmadoEl: e.target.value }))} />
              </label>
            </div>
            {mov.estado === "no_aplica" && (
              <label className="ces-l">
                <span>Por qué no aplica — obligatorio</span>
                <input value={mov.notas} maxLength={2000}
                  placeholder="se analizó y se decidió que no hace falta porque…"
                  onChange={e => setMov(m => ({ ...m, notas: e.target.value }))} />
              </label>
            )}
            {mov.estado === "firmada" && !mov.firmadoEl && (
              <div className="ces-aviso">⚠ Una firmada necesita la fecha de firma: sin ella es alguien diciendo que hay un papel.</div>
            )}
            {/* ── CORREGIR LO QUE ANTES ERA DE UNA SOLA ESCRITURA ──
                ⚠ La calidad y el uso promocional se elegían al crear y no se
                podían tocar nunca más. Una calidad mal puesta altera el «n de m»
                de R1 —es EL campo del módulo— y un promocional desmarcado por
                error dejaba el aviso «no pueden ir en tráiler» encendido para
                siempre, porque una firmada tampoco se puede borrar. */}
            <label className="ces-l">
              <span>En qué calidad firma</span>
              <select value={corr.calidad}
                onChange={e => setCorr(c => ({ ...c, calidad: e.target.value as CalidadFirmante }))}>
                {CALIDADES.map(c => <option key={c} value={c}>{ROTULO_CALIDAD[c].txt}</option>)}
              </select>
            </label>
            <div className="ces-ayuda">{ROTULO_CALIDAD[corr.calidad].cubre}</div>
            <label className="clr-check">
              <input type="checkbox" checked={corr.promo}
                onChange={e => setCorr(c => ({ ...c, promo: e.target.checked }))} />
              <span>Autoriza también <b>tráiler, afiche y miniaturas</b></span>
            </label>

            <div className="ces-pie">
              <span style={{ flex: 1 }} />
              <button className="btn" style={{ padding: "5px 12px", fontSize: 12 }} disabled={ocupado}
                onClick={() => correr(async () => {
                  /* Dos escrituras estrechas y no una ancha: `guardarAutorizacion`
                     con id escribe la fila ENTERA y borraría el plazo, los medios
                     y el documento de cualquier fila migrada que sí los tenía. */
                  const c1 = await corregirAutorizacion(a.id, proyectoId, {
                    calidadFirmante: corr.calidad, permiteUsoPromocional: corr.promo });
                  if ((c1 as any)?.error) return c1;
                  return cambiarEstadoAutorizacion(a.id, proyectoId, mov.estado, mov.firmadoEl, mov.notas);
                }, () => setMoviendo(null))}>{ocupado ? "…" : "Guardar"}</button>
            </div>
          </div>
        )}

        {gestion === a.id && (
          <div className="ces-panel mus-form" style={{ width: "100%", marginTop: 6 }}>
            <div className="ces-ayuda">
              Cuando no se logra ubicar a quien tiene que firmar, lo que vale es poder
              enseñar lo que se intentó y cuándo. Una autorización nunca se borra por
              no encontrar al titular: se documenta el intento.
            </div>
            <div className="ces-campos">
              <label>
                <span>Cómo</span>
                <select value={ges.canal} onChange={e => setGes(g => ({ ...g, canal: e.target.value }))}>
                  {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>
                <span>Qué pasó</span>
                <select value={ges.resultado} onChange={e => setGes(g => ({ ...g, resultado: e.target.value }))}>
                  {RESULTADOS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                </select>
              </label>
            </div>
            <label className="ces-l">
              <span>Detalle</span>
              <input value={ges.detalle} maxLength={1000}
                placeholder="llamé al número que dejó, no contesta desde el martes"
                onChange={e => setGes(g => ({ ...g, detalle: e.target.value }))} />
            </label>
            <div className="ces-pie">
              <span style={{ flex: 1 }} />
              <button className="btn" style={{ padding: "5px 12px", fontSize: 12 }} disabled={ocupado}
                onClick={() => correr(
                  () => apuntarGestion(a.id, proyectoId, { ...ges, fecha: hoy }),
                  () => { setGestion(null); setGes({ canal: "llamada", resultado: "sin_respuesta", detalle: "" }); })}>
                {ocupado ? "…" : "Apuntar"}</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const ordenadas = [...autorizaciones].sort((x, y) =>
    (estaAbierta(y.estado) ? 1 : 0) - (estaAbierta(x.estado) ? 1 : 0));

  return (
    <div className="clr-lista">
      <div className="trt-cab-t" style={{ marginTop: 12 }}>
        {autorizaciones.length
          ? (autorizaciones.length === 1
              ? "un permiso en esta película"
              : `los ${autorizaciones.length} permisos de esta película`)
          : "todavía no hay ningún permiso"}
      </div>

      {ordenadas.map(pintarFila)}

      <div className="cob-pie">
        <button type="button" className="cesl-mas" disabled={ocupado}
          /* ⚠ Cierra los paneles de fila. `error` es uno solo para las cinco
             operaciones, y con el alta abierta un fallo al guardar el estado de
             una fila de arriba se pintaba DENTRO de «Nuevo permiso»: se leía
             como si hubiera fallado el alta. */
          onClick={() => { setError(""); setMoviendo(null); setGestion(null); setQuitando(null);
            setPanel(panel === "permiso" ? "" : "permiso"); }}>
          ＋ permiso
        </button>
        <button type="button" className="cesl-mas" disabled={ocupado}
          title="Dar de alta una banda, conjunto o cuadrilla. Es catálogo global: sirve para todos los documentales."
          onClick={() => { setError(""); setMoviendo(null); setGestion(null); setQuitando(null);
            setPanel(panel === "banda" ? "" : "banda"); }}>
          ＋ agrupación
        </button>
      </div>

      {panel === "banda" && (
        <div className="ces-panel mus-form">
          <div className="ces-panel-h">
            <b>Nueva agrupación</b>
            <span style={{ flex: 1 }} />
            <button type="button" className="ces-x" onClick={() => setPanel("")}>✕</button>
          </div>
          <div className="ces-ayuda">
            Va al catálogo global, sin proyecto: la banda es la misma en todos los
            documentales y sus once nombres se consiguen una vez. Lo que sí es por
            película son las firmas.
          </div>
          <div className="ces-campos">
            <label>
              <span>Nombre</span>
              <input value={ban.nombre} maxLength={200} placeholder="Las Patronas"
                onChange={e => setBan(b => ({ ...b, nombre: e.target.value }))} />
            </label>
            <label>
              <span>Qué es</span>
              <select value={ban.tipo} onChange={e => setBan(b => ({ ...b, tipo: e.target.value }))}>
                {TIPOS_AGR.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
          </div>
          <div className="ces-campos">
            <label>
              <span>De dónde</span>
              <input value={ban.procedencia} maxLength={120} placeholder="Yaurisque"
                onChange={e => setBan(b => ({ ...b, procedencia: e.target.value }))} />
            </label>
            <label>
              <span>Cuántas dicen que son</span>
              <input value={ban.declarado} inputMode="numeric" placeholder="11"
                onChange={e => setBan(b => ({ ...b, declarado: e.target.value.replace(/\D/g, "") }))} />
            </label>
          </div>
          <div className="ces-pie">
            <span style={{ flex: 1 }} />
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} disabled={ocupado}
              onClick={() => correr(() => guardarAgrupacion({
                nombre: ban.nombre, tipo: ban.tipo, procedencia: ban.procedencia,
                numeroDeclarado: ban.declarado ? Number(ban.declarado) : null,
              }), () => { setBan({ nombre: "", tipo: "banda_musicos", procedencia: "", declarado: "" }); setPanel(""); })}>
              {ocupado ? "…" : "Crear"}</button>
          </div>
        </div>
      )}

      {panel === "permiso" && (
        <div className="ces-panel mus-form">
          <div className="ces-panel-h">
            <b>Nuevo permiso</b>
            <span style={{ flex: 1 }} />
            <button type="button" className="ces-x" onClick={() => setPanel("")}>✕</button>
          </div>

          <label className="ces-l">
            <span>Qué se autoriza</span>
            <select value={n.tipo} onChange={e => {
              /* ⚠ Al cambiar el tipo se limpian TODOS los objetos. Con dos
                 puestos, el check de la base tumba el guardado con un mensaje
                 sobre una constraint que quien escribe no ha visto nunca. */
              const t = e.target.value as TipoAutorizacion;
              setN(x => ({ ...x, tipo: t, objetoPersonaId: "", objetoObraId: "",
                objetoGrabacionId: "", objetoAgrupacionId: "" }));
            }}>
              {TIPOS_AUT.map(t => (
                <option key={t} value={t}>{META_TIPO_AUT[t].ico} {META_TIPO_AUT[t].corto}</option>
              ))}
            </select>
          </label>
          <div className="ces-ayuda">{meta.largo}</div>

          <div className="ces-campos">
            <label>
              <span>Quién firma</span>
              <select value={n.otorganteTipo} onChange={e => setN(x => ({
                ...x, otorganteTipo: e.target.value as Nuevo["otorganteTipo"],
                otorgantePersonaId: "", otorganteAgrupacionId: "", otorganteEntidadNombre: "",
              }))}>
                <option value="persona">una persona</option>
                <option value="agrupacion">una agrupación</option>
                <option value="entidad_externa">una entidad (parroquia, municipio…)</option>
              </select>
            </label>
            <label>
              <span>En qué calidad</span>
              <select value={n.calidad} onChange={e => set("calidad", e.target.value)}>
                {CALIDADES.map(c => <option key={c} value={c}>{ROTULO_CALIDAD[c].txt}</option>)}
              </select>
            </label>
          </div>
          {/* ⚠ Lo que esa calidad cubre, dicho entero y siempre. Es la frase que
              impide volver a contar una firma como once. */}
          <div className="ces-ayuda">{ROTULO_CALIDAD[n.calidad].cubre}</div>

          {n.otorganteTipo === "persona" && (
            <div className="cob-pie" style={{ border: 0, paddingTop: 0 }}>
              <EntPicker etiqueta={n.otorgantePersonaId
                ? `👤 ${nombreDe(personas as any, n.otorgantePersonaId)}` : "👤 elegir quién firma"}
                items={personas} onPick={id => set("otorgantePersonaId", id)} />
            </div>
          )}
          {n.otorganteTipo === "agrupacion" && (
            <label className="ces-l">
              <span>Qué agrupación</span>
              <select value={n.otorganteAgrupacionId} onChange={e => set("otorganteAgrupacionId", e.target.value)}>
                <option value="">— elige —</option>
                {agrupaciones.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </label>
          )}
          {n.otorganteTipo === "entidad_externa" && (
            <label className="ces-l">
              <span>Nombre de la entidad</span>
              <input value={n.otorganteEntidadNombre} maxLength={200}
                placeholder="Parroquia de San Esteban"
                onChange={e => set("otorganteEntidadNombre", e.target.value)} />
            </label>
          )}

          {/* ── SOBRE QUÉ RECAE, SEGÚN EL TIPO — R2 HECHO INTERFAZ ── */}
          {pidePersona && (
            <div className="cob-pie" style={{ border: 0, paddingTop: 0 }}>
              <EntPicker etiqueta={n.objetoPersonaId
                ? `🎯 sobre ${nombreDe(personas as any, n.objetoPersonaId)}` : "🎯 sobre quién recae"}
                items={personas} onPick={id => set("objetoPersonaId", id)} />
            </div>
          )}
          {pideObra && (
            <label className="ces-l">
              <span>Qué obra — la composición, no quien la toca</span>
              <select value={n.objetoObraId} onChange={e => set("objetoObraId", e.target.value)}>
                <option value="">— elige la obra —</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </label>
          )}
          {pideGrabacion && (
            <label className="ces-l">
              <span>Qué grabación</span>
              <select value={n.objetoGrabacionId} onChange={e => set("objetoGrabacionId", e.target.value)}>
                <option value="">— elige la grabación —</option>
                {grabaciones.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </label>
          )}
          {pideAgrupacionOPersona && (
            <label className="ces-l">
              <span>Qué agrupación toca — o déjalo vacío y elige persona, si es solista</span>
              <select value={n.objetoAgrupacionId} onChange={e => setN(x => ({
                ...x, objetoAgrupacionId: e.target.value, objetoPersonaId: "" }))}>
                <option value="">— es solista, sin agrupación —</option>
                {agrupaciones.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </label>
          )}
          {pideAgrupacionOPersona && !n.objetoAgrupacionId && (
            <div className="cob-pie" style={{ border: 0, paddingTop: 0 }}>
              <EntPicker etiqueta={n.objetoPersonaId
                ? `🎯 ${nombreDe(personas as any, n.objetoPersonaId)}` : "🎯 quién interpreta"}
                items={personas} onPick={id => set("objetoPersonaId", id)} />
            </div>
          )}
          {meta.objeto === "libre" && !pideAgrupacionOPersona && (
            <div className="ces-aviso">
              ⚠ Las locaciones y las actividades todavía no tienen tabla propia. Elige
              a la persona responsable como objeto y explica cuál es el lugar o la
              actividad en la nota, hasta que se levanten.
            </div>
          )}
          {meta.objeto === "libre" && !pideAgrupacionOPersona && (
            <div className="cob-pie" style={{ border: 0, paddingTop: 0 }}>
              <EntPicker etiqueta={n.objetoPersonaId
                ? `🎯 ${nombreDe(personas as any, n.objetoPersonaId)}` : "🎯 responsable"}
                items={personas} onPick={id => set("objetoPersonaId", id)} />
            </div>
          )}

          <div className="ces-campos">
            <label>
              <span>Cómo va</span>
              <select value={n.estado} onChange={e => set("estado", e.target.value)}>
                {ESTADOS.map(e2 => <option key={e2} value={e2}>{ROTULO_ESTADO_AUT[e2]}</option>)}
              </select>
            </label>
            <label>
              <span>Firmado el</span>
              <input type="date" value={n.firmadoEl} onChange={e => set("firmadoEl", e.target.value)} />
            </label>
          </div>

          {/* ── EL ALCANCE MÍNIMO ──
              Dos casillas y no el bloque entero: son las dos que se descubren
              tarde y obligan a rehacer todas las firmas. */}
          <label className="clr-check">
            <input type="checkbox" checked={n.permiteUsoPromocional}
              onChange={e => set("permiteUsoPromocional", e.target.checked)} />
            <span>Autoriza también <b>tráiler, afiche y miniaturas</b> — se publican
              antes que la película, a veces años antes</span>
          </label>
          <label className="clr-check">
            <input type="checkbox" checked={n.incluyeComercialFutura}
              onChange={e => set("incluyeComercialFutura", e.target.checked)} />
            <span>Cubre la <b>explotación comercial futura</b> — aunque hoy no se
              monetice. Sin esto hay que volver a firmar el día que la película se
              venda, y para entonces la gente ya no está localizable</span>
          </label>

          {n.estado === "no_aplica" && (
            <label className="ces-l">
              <span>Por qué no aplica — obligatorio</span>
              <input value={n.notas} maxLength={2000}
                onChange={e => set("notas", e.target.value)} />
            </label>
          )}

          {error && <div className="err-inline">⚠ {error}</div>}

          <div className="ces-pie">
            <span style={{ flex: 1 }} />
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }}
              disabled={ocupado} onClick={guardarNuevo}>{ocupado ? "…" : "Registrar"}</button>
          </div>
        </div>
      )}

      {error && panel !== "permiso" && <div className="err-inline">⚠ {error}</div>}
    </div>
  );
}
