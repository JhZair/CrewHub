"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import {
  guardarAgrupacion, guardarAutorizacion, cambiarEstadoAutorizacion,
  corregirAutorizacion, quitarAutorizacion, apuntarGestion,
  guardarLocacion, guardarActividad, guardarMaterial,
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
  objetoLocacionId: string; objetoActividadId: string; objetoMaterialId: string;
  estado: EstadoAutorizacion; firmadoEl: string;
  permiteUsoPromocional: boolean; incluyeComercialFutura: boolean;
  notas: string;
};

const VACIO: Nuevo = {
  tipo: "imagen_voz_testimonio", otorganteTipo: "persona",
  otorgantePersonaId: "", otorganteAgrupacionId: "", otorganteEntidadNombre: "",
  calidad: "titular",
  objetoPersonaId: "", objetoObraId: "", objetoGrabacionId: "", objetoAgrupacionId: "",
  objetoLocacionId: "", objetoActividadId: "", objetoMaterialId: "",
  estado: "no_iniciada", firmadoEl: "",
  permiteUsoPromocional: true, incluyeComercialFutura: false, notas: "",
};

export default function PermisosProyecto({
  proyectoId, autorizaciones, personas, agrupaciones, obras, grabaciones,
  locaciones = [], actividades = [], materiales = [], riesgos, hoy,
}: {
  proyectoId: string;
  autorizaciones: FilaAutorizacion[];
  personas: CatalogoItem[];
  agrupaciones: OpcionCatalogo[];
  obras: OpcionCatalogo[];
  grabaciones: OpcionCatalogo[];
  /** Los tres objetos que hasta ayer no existían y obligaban a la pantalla a
   *  pedir «elige al responsable y explica el resto en la nota», que es el
   *  dato-en-texto que este modelo entero existe para no tener. */
  locaciones?: OpcionCatalogo[];
  actividades?: OpcionCatalogo[];
  materiales?: OpcionCatalogo[];
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
  const [panel, setPanel] = useState<"" | "permiso" | "banda" | "lugar">("");
  /* El alta de los tres objetos que no son personas ni obras. Un solo panel con
     un selector: son formularios de tres campos y separarlos en tres botones
     llena la barra de ＋ que nadie distingue. */
  const [lug, setLug] = useState({
    que: "locacion" as "locacion" | "actividad" | "material",
    nombre: "", tipo: "espacio_publico", extra: "",
    /* ⚠ Los campos que la migración crea y ningún formulario escribía. Media
       tabla nacía muerta: `es_patrimonio_declarado` se quedaba en «por
       verificar» para siempre —con su aviso sobre el Ministerio de Cultura sin
       llegar a ninguna pantalla—, `contenido_sensible` estaba documentado como
       «se decide una vez y se ve siempre» y no se veía nunca, y `devuelto`, el
       campo cuya razón es «no devolverlo rompe una relación que cuesta años»,
       no se podía marcar. Una columna que nadie escribe es una promesa falsa. */
    patrimonio: "por_verificar", entidad: "",
    sensible: false, institucional: false,
    entregadoPor: "", devuelto: false, origenMat: "archivo_familiar",
  });
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
    objetoLocacionId: n.objetoLocacionId || null,
    objetoActividadId: n.objetoActividadId || null,
    objetoMaterialId: n.objetoMaterialId || null,
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
    /* ⚠ Los SIETE objetos. Con solo los cuatro primeros, un permiso de locación
       se pintaba «🏛 locación · Parroquia de San Esteban» sin decir de qué
       templo — el dato salía de la nota y entraba en su columna, y la pantalla
       seguía sin enseñarlo. Que es la mitad exacta de para qué se hizo. */
    const sobre = nombreDe(personas as any, a.objeto_persona_id)
      || nombreDe(obras, a.objeto_obra_id)
      || nombreDe(grabaciones, a.objeto_grabacion_id)
      || nombreDe(agrupaciones, a.objeto_agrupacion_id)
      || nombreDe(locaciones, a.objeto_locacion_id)
      || nombreDe(actividades, a.objeto_actividad_id)
      || nombreDe(materiales, a.objeto_material_id);
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
        <button type="button" className="cesl-mas" disabled={ocupado}
          title="Un lugar, una actividad de la fiesta o un material que alguien presta. Sin darlos de alta no se puede decir sobre qué recae su permiso."
          onClick={() => { setError(""); setMoviendo(null); setGestion(null); setQuitando(null);
            setPanel(panel === "lugar" ? "" : "lugar"); }}>
          ＋ lugar, actividad o material
        </button>
      </div>

      {panel === "lugar" && (
        <div className="ces-panel mus-form">
          <div className="ces-panel-h">
            <b>Dar de alta {lug.que === "locacion" ? "una locación"
              : lug.que === "actividad" ? "una actividad" : "un material"}</b>
            <span style={{ flex: 1 }} />
            <button type="button" className="ces-x" onClick={() => setPanel("")}>✕</button>
          </div>
          <label className="ces-l">
            <span>Qué doy de alta</span>
            <select value={lug.que} onChange={e => setLug(l => ({
              ...l, que: e.target.value as typeof lug.que,
              tipo: e.target.value === "locacion" ? "espacio_publico"
                : e.target.value === "material" ? "fotografia" : "",
              extra: "" }))}>
              <option value="locacion">🏛 una locación — un lugar donde se rueda</option>
              <option value="actividad">🎪 una actividad — la procesión, la misa, la corrida</option>
              <option value="material">📦 un material — una foto o un vídeo que alguien presta</option>
            </select>
          </label>
          <div className="ces-ayuda">
            {lug.que === "locacion"
              ? "Va al catálogo GLOBAL: quién administra un templo no cambia con el documental."
              : lug.que === "actividad"
              ? "Del proyecto: la procesión de este año no es la del que viene. ⚠ El permiso de quien la organiza cubre la actividad, NO a cada persona que participa."
              : "Del proyecto. ⚠ Tener el material no es tener sus derechos: quien lo presta y quien lo hizo suelen ser personas distintas, y quien sale retratado tiene además lo suyo."}
          </div>

          <label className="ces-l">
            <span>{lug.que === "material" ? "Qué material es" : "Cómo se llama"}</span>
            <input value={lug.nombre} maxLength={300}
              placeholder={lug.que === "locacion" ? "Templo de San Esteban"
                : lug.que === "actividad" ? "Procesión del Patrón, 2026"
                : "Álbum de fotos de la familia Huamani"}
              onChange={e => setLug(l => ({ ...l, nombre: e.target.value }))} />
          </label>

          {lug.que === "locacion" && (
            <>
            <label className="ces-l">
              <span>Qué clase de lugar — decide a quién se le pide</span>
              <select value={lug.tipo} onChange={e => setLug(l => ({ ...l, tipo: e.target.value }))}>
                <option value="espacio_publico">plaza o calle — suele bastar el permiso municipal</option>
                <option value="espacio_privado">casa o chacra — su propietario</option>
                <option value="privado_abierto_al_publico">mercado, restaurante — su administrador</option>
                <option value="institucion_publica">institución — trámite escrito</option>
                <option value="templo_religioso">templo — la parroquia o la hermandad, no el municipio</option>
                <option value="patrimonio_cultural">patrimonio — ⚠ puede pedir además al Ministerio de Cultura</option>
              </select>
            </label>
            <div className="ces-campos">
              <label>
                <span>Quién lo administra, si es una entidad</span>
                <input value={lug.entidad} maxLength={200} placeholder="Parroquia de San Esteban"
                  onChange={e => setLug(l => ({ ...l, entidad: e.target.value }))} />
              </label>
              <label>
                <span>¿Es patrimonio declarado?</span>
                <select value={lug.patrimonio}
                  onChange={e => setLug(l => ({ ...l, patrimonio: e.target.value }))}>
                  <option value="por_verificar">está sin verificar</option>
                  <option value="no">no</option>
                  <option value="si">sí</option>
                </select>
              </label>
            </div>
            {lug.patrimonio === "si" && (
              <div className="ces-aviso">
                ⚠ Si es patrimonio declarado, además del propietario puede hacer falta
                autorización del Ministerio de Cultura. Es otro trámite y otro plazo:
                cuéntalo desde ahora, no la semana del rodaje.
              </div>
            )}
            </>
          )}
          {lug.que === "actividad" && (
            <>
            <label className="ces-l">
              <span>Cuándo empieza</span>
              <input type="date" value={lug.extra}
                onChange={e => setLug(l => ({ ...l, extra: e.target.value }))} />
            </label>
            <label className="clr-check">
              <input type="checkbox" checked={lug.institucional}
                onChange={e => setLug(l => ({ ...l, institucional: e.target.checked }))} />
              <span>La organiza una <b>institución</b> —parroquia, municipio— y no una
                persona o familia. Cambia a quién se dirige el permiso</span>
            </label>
            <label className="clr-check">
              <input type="checkbox" checked={lug.sensible}
                onChange={e => setLug(l => ({ ...l, sensible: e.target.checked }))} />
              <span>Contenido <b>sensible</b> — una corrida, un rito con animales, algo
                que una plataforma o un festival puedan restringir. Se decide una vez y
                se ve siempre, en vez de descubrirlo cuando lo rechazan</span>
            </label>
            </>
          )}
          {lug.que === "material" && (
            <>
              <label className="ces-l">
                <span>Qué es</span>
                <select value={lug.tipo} onChange={e => setLug(l => ({ ...l, tipo: e.target.value }))}>
                  <option value="fotografia">fotografía</option>
                  <option value="video">vídeo</option>
                  <option value="documento">documento</option>
                  <option value="audio">audio</option>
                  <option value="otro">otro</option>
                </select>
              </label>
              <label className="ces-l">
                <span>Quién lo CREÓ — no quien lo presta</span>
                <input value={lug.extra} maxLength={200}
                  placeholder="déjalo vacío si no se sabe: el vacío es el dato"
                  onChange={e => setLug(l => ({ ...l, extra: e.target.value }))} />
              </label>
              <div className="ces-campos">
                <label>
                  <span>De dónde salió</span>
                  <select value={lug.origenMat}
                    onChange={e => setLug(l => ({ ...l, origenMat: e.target.value }))}>
                    <option value="archivo_familiar">archivo familiar</option>
                    <option value="institucional">institucional</option>
                    <option value="prensa">prensa</option>
                    <option value="internet">internet</option>
                    <option value="desconocido">no se sabe</option>
                  </select>
                </label>
                <label>
                  <span>Quién lo prestó</span>
                  <select value={lug.entregadoPor}
                    onChange={e => setLug(l => ({ ...l, entregadoPor: e.target.value }))}>
                    <option value="">— sin registrar —</option>
                    {personas.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </label>
              </div>
              <label className="clr-check">
                <input type="checkbox" checked={lug.devuelto}
                  onChange={e => setLug(l => ({ ...l, devuelto: e.target.checked }))} />
                <span><b>Ya se devolvió</b> — un álbum familiar prestado hay que
                  devolverlo, y no hacerlo rompe una relación que cuesta años construir</span>
              </label>
            </>
          )}

          {error && <div className="err-inline">⚠ {error}</div>}
          <div className="ces-pie">
            <span style={{ flex: 1 }} />
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} disabled={ocupado}
              onClick={() => correr(() =>
                lug.que === "locacion"
                  ? guardarLocacion({ nombre: lug.nombre, tipo: lug.tipo,
                      entidadResponsable: lug.entidad, esPatrimonio: lug.patrimonio })
                  : lug.que === "actividad"
                  ? guardarActividad(proyectoId, { nombre: lug.nombre, fechaInicio: lug.extra,
                      esInstitucional: lug.institucional, contenidoSensible: lug.sensible })
                  : guardarMaterial(proyectoId, {
                      descripcion: lug.nombre, tipo: lug.tipo, autorNombre: lug.extra,
                      entregadoPorPersonaId: lug.entregadoPor || null,
                      origen: lug.origenMat, devuelto: lug.devuelto }),
                /* Se limpia lo escrito y se conserva la CLASE: quien acaba de
                   dar de alta una locación probablemente vaya a dar de alta
                   otra, y volver a elegir «locación» cada vez es fricción. */
                () => { setLug(l => ({ ...l, nombre: "", extra: "", entidad: "",
                  entregadoPor: "", devuelto: false })); setPanel(""); })}>
              {ocupado ? "…" : "Crear"}</button>
          </div>
        </div>
      )}

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
                objetoGrabacionId: "", objetoAgrupacionId: "",
                objetoLocacionId: "", objetoActividadId: "", objetoMaterialId: "" }));
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
          {meta.objeto === "locacion" && (
            <label className="ces-l">
              <span>Qué lugar</span>
              <select value={n.objetoLocacionId} onChange={e => set("objetoLocacionId", e.target.value)}>
                <option value="">— elige la locación —</option>
                {locaciones.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </label>
          )}
          {meta.objeto === "actividad" && (
            <label className="ces-l">
              <span>Qué actividad</span>
              <select value={n.objetoActividadId} onChange={e => set("objetoActividadId", e.target.value)}>
                <option value="">— elige la actividad —</option>
                {actividades.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </label>
          )}
          {meta.objeto === "material" && (
            <label className="ces-l">
              <span>Qué material</span>
              <select value={n.objetoMaterialId} onChange={e => set("objetoMaterialId", e.target.value)}>
                <option value="">— elige el material —</option>
                {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
          )}
          {/* ⚠ Cuando el catálogo correspondiente está vacío, se dice qué hay que
              crear primero en vez de dejar un desplegable con una sola opción
              que no se puede elegir. */}
          {((meta.objeto === "locacion" && !locaciones.length)
            || (meta.objeto === "actividad" && !actividades.length)
            || (meta.objeto === "material" && !materiales.length)) && (
            <div className="ces-aviso">
              ⚠ No hay ninguna {meta.objeto === "locacion" ? "locación" :
                meta.objeto === "actividad" ? "actividad" : "material"} dada de alta
              todavía. Créala primero: sin ella no se puede decir sobre qué recae este
              permiso, y apuntarlo en la nota lo deja fuera de cualquier recuento.
            </div>
          )}
          {meta.objeto === "libre" && !pideAgrupacionOPersona && (
            <div className="cob-pie" style={{ border: 0, paddingTop: 0 }}>
              <EntPicker etiqueta={n.objetoPersonaId
                ? `🎯 ${nombreDe(personas as any, n.objetoPersonaId)}` : "🎯 sobre quién recae"}
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
