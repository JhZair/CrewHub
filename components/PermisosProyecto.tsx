"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { subirAdjunto, esPdfUrl, huellaDe, archivosDe } from "@/lib/subirImagen";
import { destinoPaste } from "@/lib/destinoPaste";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import {
  guardarAgrupacion, guardarAutorizacion, cambiarEstadoAutorizacion,
  guardarDocumentoFirmado, quitarDocumentoFirmado,
  corregirAutorizacion, quitarAutorizacion, apuntarGestion,
  guardarLocacion, guardarActividad, guardarMaterial,
} from "@/app/clearance/acciones";
import {
  TIPOS_AUT, META_TIPO_AUT, ROTULO_CALIDAD, ROTULO_ESTADO_AUT, COLOR_RIESGO,
  MODELOS_DOC, ROTULO_MODELO, modeloSugerido, permisoResuelto, personaDeAutorizacion,
  MEDIOS, ROTULO_MEDIO, MEDIOS_RELEASE_ESTANDAR, ROTULO_PLAZO, esMedio,
  estaAbierta,
  type FilaAutorizacion, type TipoAutorizacion, type CalidadFirmante,
  type EstadoAutorizacion, type NivelRiesgo, type Medio, type TipoPlazo,
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
  /** ⚠ Para qué medios vale. La columna existe, `motivosRiesgo` la mira, y
   *  ningún formulario la escribía: cada permiso firmado se quedaba con
   *  «firmada sin decir para qué medios vale» en ámbar, sin clic que lo
   *  apagara. */
  medios: Medio[];
  tipoPlazo: "indefinido" | "anios" | "hasta_fecha";
  plazoAnios: string; plazoHasta: string;
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
  /* ⚠ Vacío, no el paquete entero. Un permiso nace sin saber para qué vale, y
     rellenarlo por defecto convertiría «nadie lo dijo» en una afirmación —el
     mismo cero que no es un cero, por la puerta de un valor inicial. El botón
     «los del release» está a un clic para quien firma el modelo de siempre. */
  medios: [],
  tipoPlazo: "indefinido", plazoAnios: "", plazoHasta: "",
  permiteUsoPromocional: true, incluyeComercialFutura: false, notas: "",
};

export default function PermisosProyecto({
  proyectoId, autorizaciones, personas, agrupaciones, obras, grabaciones,
  locaciones = [], actividades = [], materiales = [], reparto = [],
  documentos = {}, riesgos, motivos = {}, hoy,
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
  /** Los actores sociales CONFIRMADOS de esta película, para no obligar a
   *  buscarlos en un desplegable de todas las personas del sistema. */
  reparto?: { id: string; nombre: string; papel?: string | null; menor?: boolean }[];
  /** Los papeles firmados por su id, para verlos y editarlos en vez de subir
   *  otro encima. Objetos planos: esto es un componente cliente. */
  documentos?: Record<string, {
    id: string; modelo?: string | null; archivo_url?: string | null;
    hash_archivo?: string | null; firmado_el?: string | null;
    es_original_digital?: boolean | null; ubicacion_original?: string | null;
    lugar_firma?: string | null; tiene_huella_digital?: boolean | null;
    consentimiento_grabado_url?: string | null;
    testigos?: string | null; nota?: string | null;
  }>;
  /** El riesgo de cada permiso por su id, CALCULADO EN EL SERVIDOR.
   *  ⚠ Aquí llegaba la función que lo calcula, y un closure no se puede
   *  serializar a un componente cliente: Next lanza «Functions cannot be passed
   *  directly to Client Components» al renderizar. `tsc` no lo veía. */
  riesgos: Record<string, NivelRiesgo>;
  /** ⚠ POR QUÉ tiene ese color. Sin esto, dos filas que ponen «firmada» salían
   *  una en ámbar y otra no, y no había forma de saber cuál era la diferencia
   *  sin abrir el panel a adivinar. Cadenas ya resueltas en el servidor. */
  motivos?: Record<string, { nivel: NivelRiesgo; txt: string }[]>;
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
  const [corr, setCorr] = useState<{
    calidad: CalidadFirmante; promo: boolean; comercial: boolean; medios: Medio[];
    tipoPlazo: TipoPlazo; plazoAnios: string; plazoHasta: string;
  }>({ calidad: "titular", promo: true, comercial: false, medios: [],
    tipoPlazo: "indefinido", plazoAnios: "", plazoHasta: "" });
  const [gestion, setGestion] = useState<string | null>(null);
  const [ges, setGes] = useState({ canal: "llamada", resultado: "sin_respuesta", detalle: "" });
  const [quitando, setQuitando] = useState<string | null>(null);
  /* El papel de una fila. `papel` es el id de la autorización cuyo panel está
     abierto, no un booleano: con dos filas se abrían las dos a la vez. */
  const [papel, setPapel] = useState<string | null>(null);
  const [doc, setDoc] = useState({
    modelo: "otro", archivoUrl: "", firmadoEl: "", lugarFirma: "",
    huella: false, grabadoUrl: "", testigos: "", nota: "", hash: "",
    esOriginal: false, ubicacion: "",
  });
  const [subiendo, setSubiendo] = useState(false);
  /** El id del papel que se está editando, si ya existía. */
  const [docId, setDocId] = useState("");
  const [soltando, setSoltando] = useState(false);
  const [encima, setEncima] = useState(false);

  /* ── SUBIR EL PAPEL: UNA SOLA FUNCIÓN PARA LAS TRES PUERTAS ──
     Elegir el archivo, pegarlo con Ctrl+V y soltarlo encima acaban aquí. Con
     tres copias, la que se arregla es la que se usó ese día y las otras dos se
     quedan atrás — y la que se queda atrás es la que no calcula la huella. */
  const subirPapel = async (f: File, aviso = "") => {
    /* ⚠ `aviso` entra POR PARÁMETRO y no se pone antes de llamar: este
       `setError("")` limpiaría el mensaje de quien lo hubiera puesto justo
       antes —React agrupa los dos cambios y gana el último—, así que «soltaste
       tres archivos» desaparecía sin llegar a verse. */
    setError(aviso); setSubiendo(true);
    /* La huella, del MISMO objeto que se sube: calcularla de otra lectura del
       disco sería poder firmar una y guardar otra. */
    /* 15MB también para las fotos: esto es la foto de un papel firmado, no un
       pantallazo, y la cámara de un móvil de hoy pasa de 5 con facilidad. */
    const [r, hash] = await Promise.all([subirAdjunto(f, 15), huellaDe(f)]);
    setSubiendo(false);
    /* ⚠ El error se ENSEÑA. Un archivo que no subió con una caja que se queda
       igual se lee como que sí subió, y el permiso acabaría en verde sin papel. */
    if (r.error) { setError(r.error); return; }
    setDoc(d2 => ({ ...d2, archivoUrl: r.url || "", hash: hash || "" }));
  };

  /* ── PEGAR CON Ctrl+V, EN TODO EL PANEL ──
     ⚠ Un listener de `window` y no un `onPaste` en una caja. La foto del papel
     llega por WhatsApp: se copia de la conversación y se pega. Obligar a
     acertar primero el foco en un recuadro concreto es el paso que hace que no
     se pegue — y no hay ninguna caja obvia donde hacer clic, porque un
     `<input type="file">` no acepta pegar.
     Solo mientras el panel está abierto, y solo si el portapapeles trae un
     ARCHIVO: pegar texto en el campo de la ubicación tiene que seguir
     funcionando. */
  useEffect(() => {
    if (!papel) return;
    const alPegar = (e: ClipboardEvent) => {
      /* ⚠ El semáforo de lib/destinoPaste. Cuando el ratón está sobre un
         destino que RECLAMA el pegado —la foto de una persona—, ese destino
         manda y los oyentes generales ceden. Hoy ninguno de esos vive en esta
         pantalla, pero un oyente de `window` que no mira la bandera es el que
         rompe al siguiente que la use, y romperlo desde otra pantalla es
         imposible de encontrar. */
      if (destinoPaste.reclamado) return;
      const fs = archivosDe(e.clipboardData);
      if (!fs.length) return;
      e.preventDefault();
      void subirPapel(fs[0]);
    };
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
    /* `papel` y nada más: `subirPapel` se recrea en cada render y meterla en las
       dependencias volvería a colgar y descolgar el listener sin parar. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papel]);

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
    /* ⚠ Los tres que la base guardaba y el formulario no mandaba. Sin ellos,
       `guardarAutorizacion` escribía `medios: []` y `tipo_plazo: 'indefinido'`
       por defecto — o sea, la columna existía, se rellenaba con el silencio, y
       la regla de riesgo leía ese silencio como una afirmación. */
    medios: n.medios,
    tipoPlazo: n.tipoPlazo,
    plazoAnios: n.plazoAnios ? Number(n.plazoAnios) : null,
    plazoHasta: n.plazoHasta,
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
        {/* ── EL MOTIVO, AL LADO DEL COLOR ──
            ⚠ El primero, que es el peor: con los cuatro, la lista vuelve a ser
            un muro. Los demás están en el panel de estado, a un clic. */}
        {(motivos[a.id] || [])[0] && (
          <span className="clr-mot" style={{ color: COLOR_RIESGO[(motivos[a.id] || [])[0].nivel] }}
            title={(motivos[a.id] || []).map(m => m.txt).join(" · ")}>
            — {(motivos[a.id] || [])[0].txt}
            {(motivos[a.id] || []).length > 1
              ? ` (+${(motivos[a.id] || []).length - 1})` : ""}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="trt-acc" disabled={ocupado}
          onClick={() => {
            setGestion(null); setQuitando(null); setError(""); setPanel("");
            setMoviendo(moviendo === a.id ? null : a.id);
            setMov({ estado: String(a.estado || "en_gestion"), firmadoEl: a.firmado_el || "", notas: "" });
            setCorr({
              calidad: (a.calidad_firmante as CalidadFirmante) || "titular",
              promo: a.permite_uso_promocional !== false,
              comercial: !!a.incluye_explotacion_comercial_futura,
              medios: (a.medios || []).filter(esMedio),
              tipoPlazo: (a.tipo_plazo as TipoPlazo) || "indefinido",
              plazoAnios: a.plazo_anios ? String(a.plazo_anios) : "",
              plazoHasta: a.plazo_hasta || "",
            });
          }}>estado</button>
        {/* ── EL PAPEL ──
            ⚠ En TODAS las filas, firmadas o no. La que dice «firmada» sin
            documento es justo la que necesita esto: hasta hoy no había forma de
            subirlo y ese permiso no podía ponerse verde nunca. Y en las
            firmadas con papel sirve para verlo y para cambiarlo. */}
        <button type="button" className="trt-acc" disabled={ocupado}
          title={a.documento_id
            ? "Ver o cambiar el papel firmado"
            : "Subir el papel firmado. Sin él, «firmada» es solo alguien diciendo que hay una firma."}
          onClick={() => {
            /* ⚠ Cerrar NO reinicia. Antes, volver a pulsar el mismo 📎 pasaba
               por el `setDoc({…vacío})` de abajo ANTES de cerrar: un clic de
               más borraba en silencio la URL ya subida, la fecha y las notas
               escritas. Cerrar es cerrar. */
            if (papel === a.id) { setPapel(null); setSoltando(false); return; }
            setMoviendo(null); setGestion(null); setQuitando(null); setError(""); setPanel("");
            /* ⚠ Se reinicia al cambiar de fila. Sin esto, escribir el lugar de
               firma en la fila A y abrir la B lo dejaba precargado, y se
               guardaba contra el permiso equivocado. Ya pasó con `ges`. */
            /* ⚠ Y con lo que YA hay dentro. Antes arrancaba vacío siempre, así
               que el botón decía «ver o cambiar» y abría un formulario en
               blanco: el papel se subía y no se recuperaba nunca. */
            const y = a.documento_id ? documentos[a.documento_id] : null;
            setDoc(y ? {
              modelo: String(y.modelo || "otro"),
              archivoUrl: y.archivo_url || "",
              firmadoEl: y.firmado_el || a.firmado_el || "",
              lugarFirma: y.lugar_firma || "",
              huella: !!y.tiene_huella_digital, hash: y.hash_archivo || "",
              esOriginal: !!y.es_original_digital,
              ubicacion: y.ubicacion_original || "",
              grabadoUrl: y.consentimiento_grabado_url || "",
              testigos: y.testigos || "",
              nota: y.nota || "",
            } : {
              modelo: modeloSugerido(a.tipo, a.calidad_firmante,
                !!(a.objeto_agrupacion_id || a.otorgante_agrupacion_id)),
              archivoUrl: "", firmadoEl: a.firmado_el || "", lugarFirma: "",
              huella: false, grabadoUrl: "", testigos: "", nota: "", hash: "",
              esOriginal: false, ubicacion: "",
            });
            setDocId(y?.id || "");
            setPapel(a.id);
          }}>{a.documento_id ? "📎 papel" : "📎 subir el papel"}</button>
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

        {papel === a.id && (
          <div className="ces-panel mus-form" style={{ width: "100%", marginTop: 6 }}>
            {docId && (
              <div className="ces-ayuda">
                Este permiso ya tiene su papel.{" "}
                {doc.archivoUrl && (
                  <a href={doc.archivoUrl} target="_blank" rel="noopener noreferrer"
                    className="trt-doc">📎 abrirlo</a>
                )}
                {" "}Lo que guardes aquí lo corrige; subir otro archivo lo
                sustituye — el anterior no se borra del almacén.
              </div>
            )}
            <div className={encima ? "papel-soltar encima" : "papel-soltar"}
              onDragOver={e => { e.preventDefault(); setEncima(true); }}
              onDragLeave={() => setEncima(false)}
              onDrop={e => {
                e.preventDefault(); setEncima(false);
                const fs = archivosDe(e.dataTransfer);
                if (!fs.length) return;
                /* ⚠ Uno solo, y se dice. Soltar tres y ver que sube uno sin
                   ninguna explicación se lee como que subieron los tres. */
                void subirPapel(fs[0], fs.length > 1
                  ? `Soltaste ${fs.length} archivos y este permiso lleva un papel: se subió «${fs[0].name}». Los demás, de uno en uno o en otro permiso.`
                  : "");
              }}>
              <label className="ces-l">
                <span>El archivo — PDF o foto del papel</span>
                <input type="file" accept="application/pdf,image/*" disabled={subiendo || ocupado}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    /* ⚠ Se limpia el input SIEMPRE, y ANTES de subir. Sin esto,
                       si la subida falla —15MB, un corte— y eliges EL MISMO
                       archivo otra vez, el evento `change` no se dispara y no
                       pasa nada: te quedas atascado sin explicación. */
                    e.target.value = "";
                    if (f) void subirPapel(f);
                  }} />
              </label>
              <div className="ces-ayuda">
                O <b>pega la foto con Ctrl+V</b> —la que te mandaron por
                WhatsApp, copiada de la conversación— o suéltala aquí encima.
              </div>
            </div>
            {subiendo && <div className="ces-ayuda">subiendo…</div>}
            {doc.archivoUrl && (
              <div className="ces-ayuda">
                ✅ {esPdfUrl(doc.archivoUrl) ? "PDF" : "imagen"} listo —{" "}
                <a href={doc.archivoUrl} target="_blank" rel="noopener noreferrer"
                  className="trt-doc">verlo</a>
              </div>
            )}

            <div className="ces-campos">
              <label>
                <span>Qué papel es</span>
                <select value={doc.modelo}
                  onChange={e => setDoc(d2 => ({ ...d2, modelo: e.target.value }))}>
                  {MODELOS_DOC.map(m => (
                    <option key={m} value={m}>{ROTULO_MODELO[m]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Firmado el</span>
                <input type="date" value={doc.firmadoEl}
                  onChange={e => setDoc(d2 => ({ ...d2, firmadoEl: e.target.value }))} />
              </label>
              <label>
                <span>Dónde se firmó</span>
                <input value={doc.lugarFirma} maxLength={120}
                  placeholder="Yaurisque, casa de Lino"
                  onChange={e => setDoc(d2 => ({ ...d2, lugarFirma: e.target.value }))} />
              </label>
            </div>

            <label className="clr-check">
              <input type="checkbox" checked={doc.huella}
                onChange={e => setDoc(d2 => ({ ...d2, huella: e.target.checked }))} />
              <span>Firmó con huella digital — en campo pasa tanto como con firma, y conviene que conste</span>
            </label>

            {/* ── DÓNDE ESTÁ EL PAPEL DE VERDAD ──
                ⚠ Lo que se sube es casi siempre una FOTO hecha con el móvil en
                la casa donde se firmó. Vale como prueba, pero no es el
                documento: el original con la huella y el DNI escritos está en
                un archivador. El día que hay una disputa piden ese, y si nadie
                apuntó dónde está hay que buscarlo por la oficina meses después
                — puede que quien lo archivó ya no esté.
                Hasta hoy solo cabía en la nota, que es texto libre: no se puede
                listar «qué originales me faltan archivar». */}
            <label className="clr-check">
              <input type="checkbox" checked={doc.esOriginal}
                onChange={e => setDoc(d2 => ({ ...d2, esOriginal: e.target.checked }))} />
              <span>Lo subido <b>es</b> el documento — firmado digitalmente, o el
                escaneo que hace de ejemplar. Si es una foto o una copia, déjalo
                sin marcar y di abajo dónde está el original</span>
            </label>
            {/* ⚠ El campo se ENSEÑA SIEMPRE, marcada o no la casilla. Antes se
                escondía al marcarla, y como el servidor borra la ubicación
                cuando lo subido es el original, un clic por error hacía
                desaparecer de la vista —y luego de la base— un dato que costó
                una llamada a la oficina. Sin aviso y sin rastro: la bitácora
                solo dice «adjuntó el papel firmado». Lo que se ve tiene que ser
                lo que se guarda. */}
            <label className="ces-l">
              <span>Dónde está el original</span>
              <input value={doc.ubicacion} maxLength={200} disabled={doc.esOriginal}
                placeholder="archivador PACHA APUS · carpeta En busca del oro"
                onChange={e => setDoc(d2 => ({ ...d2, ubicacion: e.target.value }))} />
            </label>
            {doc.esOriginal && doc.ubicacion.trim() && (
              <div className="ces-aviso">
                ⚠ Al guardar se borrará «{doc.ubicacion.trim()}», porque has
                dicho que lo subido <b>es</b> el documento. Si es una foto,
                desmarca la casilla de arriba.
              </div>
            )}
            {!doc.esOriginal && !doc.ubicacion.trim() && doc.archivoUrl && (
              <div className="ces-ayuda">
                Se puede guardar sin esto —en campo se firma de noche y ya se
                apuntará—, pero el papel quedará en la lista de originales sin
                archivar.
              </div>
            )}

            {/* ── EL CONSENTIMIENTO GRABADO ──
                El «¿me autoriza a grabarlo?» dicho a cámara. No sustituye al
                papel, pero en un documental de campo es a veces la única prueba
                que hay, y vale: es consentimiento informado y grabado. */}
            <label className="ces-l">
              <span>Enlace al consentimiento grabado — si lo hay</span>
              <input value={doc.grabadoUrl} maxLength={500} placeholder="https://…"
                onChange={e => setDoc(d2 => ({ ...d2, grabadoUrl: e.target.value }))} />
            </label>
            <div className="ces-campos">
              <label>
                <span>Testigos</span>
                <input value={doc.testigos} maxLength={200}
                  onChange={e => setDoc(d2 => ({ ...d2, testigos: e.target.value }))} />
              </label>
              <label>
                <span>Nota</span>
                <input value={doc.nota} maxLength={500}
                  onChange={e => setDoc(d2 => ({ ...d2, nota: e.target.value }))} />
              </label>
            </div>

            {!doc.archivoUrl && !doc.grabadoUrl.trim() && (
              <div className="ces-aviso">
                ⚠ Sube el papel, o al menos el enlace al consentimiento grabado.
                Sin uno de los dos esto no prueba nada, y atarlo pondría el
                permiso en verde sobre la nada.
              </div>
            )}
            {doc.archivoUrl && !doc.firmadoEl && (
              <div className="ces-aviso">
                ⚠ Falta la fecha de firma. El expediente se enseña meses después
                y «cuándo» es de lo primero que se pregunta.
              </div>
            )}

            {/* ⚠ El error, AQUÍ. `error` es uno solo para las seis operaciones
                y se pinta al final de la lista: con diez permisos, pulsabas
                «guardar», el panel no se cerraba y no veías por qué. */}
            {error && <div className="err-inline">⚠ {error}</div>}

            <div className="cob-pie">
              <button type="button" className="btn" style={{ padding: "5px 12px", fontSize: 12 }}
                /* ⚠ Sin fecha no se deja guardar. La base la exige con un check
                   y el error que devolvería habla de una constraint que quien
                   escribe no ha visto nunca. */
                disabled={ocupado || subiendo || !doc.firmadoEl
                  || (!doc.archivoUrl && !doc.grabadoUrl.trim())}
                onClick={() => correr(
                  () => guardarDocumentoFirmado(proyectoId, {
                    id: docId || undefined,
                    autorizacionId: a.id,
                    modelo: doc.modelo,
                    archivoUrl: doc.archivoUrl,
                    hashArchivo: doc.hash,
                    firmadoEl: doc.firmadoEl,
                    lugarFirma: doc.lugarFirma,
                    tieneHuellaDigital: doc.huella,
                    consentimientoGrabadoUrl: doc.grabadoUrl,
                    testigos: doc.testigos,
                    nota: doc.nota,
                    esOriginalDigital: doc.esOriginal,
                    ubicacionOriginal: doc.ubicacion,
                  }),
                  () => setPapel(null),
                )}>Guardar el papel y dar por firmado</button>
              <button type="button" className="cesl-mas" onClick={() => setPapel(null)}>cancelar</button>
              <span style={{ flex: 1 }} />
              {/* ── SOLTAR EL PAPEL ──
                  ⚠ La acción existía y no la llamaba nadie: una server action
                  exportada —o sea, un endpoint— sin botón. Es la misma falta
                  que esta tanda vino a arreglar.
                  El archivo NO se borra del almacén: el expediente se enseña
                  meses después y un borrado no se deshace. */}
              {docId && (
                soltando ? (
                  <span style={{ fontSize: 11 }}>
                    ¿soltar el papel? el permiso vuelve a «en gestión» ·{" "}
                    <button className="ces-si" onClick={() => correr(
                      () => quitarDocumentoFirmado(docId, proyectoId, a.id),
                      () => { setSoltando(false); setPapel(null); },
                    )}>sí</button>
                    {" / "}<button className="ces-no" onClick={() => setSoltando(false)}>no</button>
                  </span>
                ) : (
                  <button type="button" className="cesl-mas" disabled={ocupado}
                    onClick={() => setSoltando(true)}>soltar el papel</button>
                )
              )}
            </div>
          </div>
        )}

        {moviendo === a.id && (
          <div className="ces-panel mus-form" style={{ width: "100%", marginTop: 6 }}>
            {/* ── TODO LO QUE LE FALTA A ESTE PERMISO ──
                ⚠ Arriba del formulario y no debajo: se abre este panel PARA
                arreglar algo, y lo primero que hay que leer es qué. Con la
                lista al final, se corrige el estado y se sale sin haber visto
                que además faltaban los medios. */}
            {(motivos[a.id] || []).length > 0 && (
              <div className="clr-bloq">
                <div className="trt-cab-t">por qué está en ese color</div>
                {(motivos[a.id] || []).map((m, i) => (
                  <div key={i} className="clr-bl">
                    <span className="clr-pt" style={{ color: COLOR_RIESGO[m.nivel] }}>
                      {m.nivel === "critico" ? "🚫" : m.nivel === "alto" ? "🔶" : "▪"}
                    </span>
                    <span className="clr-mot" style={{ color: COLOR_RIESGO[m.nivel] }}>{m.txt}</span>
                  </div>
                ))}
              </div>
            )}
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
            {/* ── LOS MEDIOS, TAMBIÉN AQUÍ ──
                ⚠ Los permisos registrados antes de hoy nacieron con la lista
                vacía porque nadie los preguntaba. Sin este camino habría que
                borrarlos y rehacerlos para apagar su ámbar — y una firmada no
                se puede borrar, con razón: es la prueba de que alguien
                autorizó. */}
            <div className="ces-l">
              <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                Para qué medios vale
                <button type="button" className="cesl-mas"
                  title="Los nueve que concede la cláusula TERCERA del release estándar. El tráiler y el afiche van aparte."
                  onClick={() => setCorr(c => ({ ...c, medios: [...MEDIOS_RELEASE_ESTANDAR] }))}>
                  los del release →
                </button>
                {corr.medios.length > 0 && (
                  <button type="button" className="cesl-mas"
                    onClick={() => setCorr(c => ({ ...c, medios: [] }))}>ninguno</button>
                )}
              </span>
              <div className="med-rej">
                {MEDIOS.map(m => (
                  <label key={m} className="clr-check" title={ROTULO_MEDIO[m].largo}>
                    <input type="checkbox" checked={corr.medios.includes(m)}
                      onChange={e => setCorr(c => ({ ...c, medios: e.target.checked
                        ? [...c.medios, m] : c.medios.filter(x => x !== m) }))} />
                    <span>{ROTULO_MEDIO[m].corto}</span>
                  </label>
                ))}
              </div>
            </div>
            {mov.estado === "firmada" && !corr.medios.length && (
              <div className="ces-aviso">
                ⚠ Sin medios, este permiso se queda en ámbar y no hay clic que lo
                apague. El papel los dice — cópialos.
              </div>
            )}

            {/* ── EL PLAZO, TAMBIÉN CORREGIBLE ──
                ⚠ `tipo_plazo` nace en «indefinido» por defecto en la base, así
                que TODAS las filas migradas afirman «por el máximo que permita
                la ley» sin que nadie lo dijera. Y hasta hoy no había ningún
                camino para arreglarlo salvo entrando a la base — que es el
                argumento con el que existe este panel. */}
            <div className="ces-campos">
              <label>
                <span>Hasta cuándo vale</span>
                <select value={corr.tipoPlazo} onChange={e => setCorr(c => ({
                  ...c, tipoPlazo: e.target.value as TipoPlazo,
                  plazoAnios: "", plazoHasta: "",
                }))}>
                  {Object.entries(ROTULO_PLAZO).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              {corr.tipoPlazo === "anios" && (
                <label>
                  <span>Cuántos años</span>
                  <input type="number" min={1} max={99} value={corr.plazoAnios}
                    onChange={e => setCorr(c => ({ ...c, plazoAnios: e.target.value }))} />
                </label>
              )}
              {corr.tipoPlazo === "hasta_fecha" && (
                <label>
                  <span>Hasta el</span>
                  <input type="date" value={corr.plazoHasta}
                    onChange={e => setCorr(c => ({ ...c, plazoHasta: e.target.value }))} />
                </label>
              )}
            </div>

            <label className="clr-check">
              <input type="checkbox" checked={corr.comercial}
                onChange={e => setCorr(c => ({ ...c, comercial: e.target.checked }))} />
              <span>Cubre la <b>explotación comercial futura</b> — aunque hoy no se
                monetice. Sin esto hay que volver a firmar el día que la película
                se venda, y para entonces la gente ya no está localizable</span>
            </label>

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
                    calidadFirmante: corr.calidad, permiteUsoPromocional: corr.promo,
                    incluyeExplotacionComercialFutura: corr.comercial,
                    medios: corr.medios, tipoPlazo: corr.tipoPlazo,
                    plazoAnios: corr.plazoAnios ? Number(corr.plazoAnios) : null,
                    plazoHasta: corr.plazoHasta });
                  if ((c1 as any)?.error) return c1;
                  const c2 = await cambiarEstadoAutorizacion(
                    a.id, proyectoId, mov.estado, mov.firmadoEl, mov.notas);
                  /* ⚠ Si la primera fue bien y la segunda falla —pasar a
                     «firmada» sin fecha es frecuente—, el mensaje tiene que
                     decir que el alcance SÍ se guardó. Callarlo hace pensar que
                     no se guardó nada, y se vuelve a intentar sobre una fila
                     que ya cambió. Mismo criterio que en el panel del papel. */
                  if ((c2 as any)?.error)
                    return { error: `El alcance del permiso SÍ se guardó. El estado no: ${(c2 as any).error}` };
                  return c2;
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

  /* ── ABRIR EL ALTA CON LA PERSONA YA PUESTA ──
     El desplegable de «quién firma» tiene todas las personas del sistema, y
     buscar ahí a alguien que está listado dos centímetros más arriba es la
     clase de paso que hace que el papel no se registre. Aquí se elige desde la
     fila.
     ⚠ Si es menor, la calidad arranca en `representante_legal_menor`: R5 dice
     que su firma no vale, y arrancar en «titular» es ofrecer el camino
     equivocado por defecto. */
  const altaPara = (r: { id: string; menor?: boolean }) => {
    setError(""); setMoviendo(null); setGestion(null); setQuitando(null);
    setN({
      ...VACIO,
      tipo: "imagen_voz_testimonio",
      otorganteTipo: "persona",
      /* Si es menor, quien firma es su representante y hay que elegirlo: el
         campo se deja vacío a propósito para que se vea que falta. */
      otorgantePersonaId: r.menor ? "" : r.id,
      objetoPersonaId: r.id,
      calidad: r.menor ? "representante_legal_menor" : "titular",
      estado: "en_gestion",
    });
    setPanel("permiso");
  };

  /* Qué tiene ya cada persona del reparto. Un solo recorrido: un `find` por
     fila sería recorrer los permisos una vez por actor. */
  const releaseDe = new Map<string, FilaAutorizacion>();
  for (const a of autorizaciones) {
    if (a.tipo !== "imagen_voz_testimonio") continue;
    /* ⚠ `personaDeAutorizacion` y no un `||` escrito aquí: es la función que
       existe justamente para que no haya dos criterios, y esto era la tercera
       copia. Y `set` solo si no hay: con DOS releases de la misma persona,
       aquí ganaba el último y en `ActoresProyecto` —que usa `.find`— el
       primero. Uno rechazado y otro firmado, y cada pantalla pintaba un color.
       El primero en las dos. */
    const k = personaDeAutorizacion(a);
    if (k && !releaseDe.has(k)) releaseDe.set(k, a);
  }

  return (
    <div className="clr-lista">
      {/* ── EL REPARTO, ANTES QUE NADA ──
          ⚠ Esta lista es el motivo de que la pantalla se sintiera vacía: la
          película tenía cinco actores sociales y el clearance decía «todavía no
          hay ningún permiso» sin nombrar a ninguno. Cierto, y también inútil:
          lo que hace falta saber es a QUIÉN le falta. */}
      {reparto.length > 0 && (
        <>
          <div className="trt-cab-t" style={{ marginTop: 12 }}>
            el reparto de esta película · {reparto.length}
          </div>
          {reparto.map(r => {
            const a = releaseDe.get(r.id);
            const rg = a ? riesgos[a.id] : null;
            /* Una sola definición de «resuelto», en lib/clearance: había tres
               copiadas a mano en tres pantallas, y una cuarta distinta en
               `estaResuelta` que sí cuenta `no_aplica`. Un permiso bien marcado
               «no aplica» salía en ámbar para siempre. */
            const bien = !!a && permisoResuelto(a, rg);
            return (
              <div key={r.id} className="clr-fila">
                <span className="clr-ico">{bien ? "✅" : a ? "🔶" : "▫"}</span>
                <span className="clr-que">{r.nombre}</span>
                {r.papel && <span className="clr-quien">{r.papel}</span>}
                {r.menor && <span className="clr-cal" title="R5: su firma no vale; firma su representante legal">menor de edad</span>}
                <span style={{ flex: 1 }} />
                {a ? (
                  <span className="clr-est" style={{
                    color: bien ? "var(--green)" : rg ? COLOR_RIESGO[rg] : "var(--yellow)",
                  }}>
                    {a.estado === "firmada" && !a.documento_id
                      ? "firmada, falta el papel"
                      : ROTULO_ESTADO_AUT[a.estado as EstadoAutorizacion] || String(a.estado)}
                  </span>
                ) : (
                  <button type="button" className="cesl-mas" disabled={ocupado}
                    onClick={() => altaPara(r)}>
                    registrar su imagen, voz y testimonio →
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}

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

          {/* ── PARA QUÉ MEDIOS VALE ──
              ⚠ Esto no estaba, y era el ámbar que no se podía apagar. Los
              nombres salen de la cláusula TERCERA del release, no de una lista
              inventada: un vocabulario que no coincide con el papel obliga a
              traducir en la cabeza cada vez, y entonces se rellena mal. */}
          <div className="ces-l" style={{ marginTop: 4 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              Para qué medios vale
              <button type="button" className="cesl-mas"
                title="Marca los nueve que concede la cláusula TERCERA del release estándar. El tráiler y el afiche van aparte, en la casilla de abajo. Quien firme un papel recortado desmarca lo que sobre."
                onClick={() => set("medios", [...MEDIOS_RELEASE_ESTANDAR])}>
                los del release →
              </button>
              {n.medios.length > 0 && (
                <button type="button" className="cesl-mas"
                  onClick={() => set("medios", [])}>ninguno</button>
              )}
            </span>
            <div className="med-rej">
              {MEDIOS.map(m => (
                <label key={m} className="clr-check" title={ROTULO_MEDIO[m].largo}>
                  <input type="checkbox" checked={n.medios.includes(m)}
                    onChange={e => set("medios", e.target.checked
                      ? [...n.medios, m]
                      : n.medios.filter(x => x !== m))} />
                  <span>{ROTULO_MEDIO[m].corto}</span>
                </label>
              ))}
            </div>
          </div>
          {/* ⚠ Solo cuando está firmada. En una que aún no lo está, la lista
              vacía es lo normal —nadie ha firmado nada todavía— y acusar por
              eso llena la pantalla de avisos que no se pueden resolver. */}
          {n.estado === "firmada" && !n.medios.length && (
            <div className="ces-aviso">
              ⚠ Sin medios, este permiso sale en ámbar y no hay clic que lo
              apague: no se sabrá si vale para el festival al que ya se
              inscribió la película. El papel los dice — cópialos.
            </div>
          )}

          {/* ── HASTA CUÁNDO ──
              El release estándar dice «indefinido, por el máximo tiempo
              permitido». Una licencia a plazo es lo raro, pero cuando la hay,
              olvidarla significa descubrir que caducó al ir a estrenar. */}
          <div className="ces-campos">
            <label>
              <span>Hasta cuándo vale</span>
              <select value={n.tipoPlazo} onChange={e => setN(x => ({
                ...x, tipoPlazo: e.target.value as TipoPlazo,
                /* Se limpia lo del otro modo: con «indefinido» y una fecha
                   puesta, la fila diría dos cosas a la vez. */
                plazoAnios: "", plazoHasta: "",
              }))}>
                {Object.entries(ROTULO_PLAZO).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            {n.tipoPlazo === "anios" && (
              <label>
                <span>Cuántos años</span>
                <input type="number" min={1} max={99} value={n.plazoAnios}
                  onChange={e => set("plazoAnios", e.target.value)} />
              </label>
            )}
            {n.tipoPlazo === "hasta_fecha" && (
              <label>
                <span>Hasta el</span>
                <input type="date" value={n.plazoHasta}
                  onChange={e => set("plazoHasta", e.target.value)} />
              </label>
            )}
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
