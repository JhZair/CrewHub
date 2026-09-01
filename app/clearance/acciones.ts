"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  META_TIPO_AUT, TIPOS_AUT, esMenor,
  type TipoAutorizacion, type CalidadFirmante, type EstadoAutorizacion,
} from "@/lib/clearance";

/* ══════════════════════════════════════════════════════════════════════════
   LAS ACCIONES DEL CLEARANCE

   En archivo aparte, como el guion y la música: `app/actions.ts` ya pasa de
   doce mil líneas y esto es un módulo con su propio vocabulario.

   ── LAS GUARDAS VIVEN AQUÍ, CON PALABRAS ──
   Postgres rechaza lo mismo con sus checks, pero devolviendo un mensaje sobre
   una constraint que quien escribe no ha visto nunca. La base es la red de
   abajo; estas frases son lo que se lee.
   ══════════════════════════════════════════════════════════════════════════ */

async function sesion() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

const revalidar = (proyectoId?: string) => {
  revalidatePath("/clearance");
  revalidatePath("/musica");
  /* ⚠ El PATRÓN de ruta, no la ruta construida: con `/entidad/proyecto/<id>`
     Next arma un tag que no coincide con ninguna página y no revalida nada, sin
     dar error. Está contado en app/guion/acciones.ts. */
  revalidatePath("/entidad/[tipo]/[id]", "page");
  if (proyectoId) revalidatePath(`/clearance/${proyectoId}`);
};

const texto = (v: string | null | undefined, max = 300) => {
  const s = (v || "").trim();
  return s ? s.slice(0, max) : null;
};

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Una fecha o null. Lo que no tenga la forma exacta se rechaza en vez de
 *  guardarse: Postgres aceptaría «31/08/26» a su manera y el año 0026 pasaría
 *  sin que nadie lo viera. Ya ocurrió con el cronograma. */
function fecha(v: string | null | undefined, campo: string): { f: string | null; error?: string } {
  const s = (v || "").trim();
  if (!s) return { f: null };
  if (!ES_FECHA.test(s)) return { f: null, error: `${campo}: la fecha tiene que ser AAAA-MM-DD.` };
  return { f: s };
}

const faltaSql = (m: string, archivo: string) =>
  /schema cache|does not exist|PGRST20[45]/i.test(m)
    ? `${m} — falta correr db/${archivo} en Supabase.` : m;

/* ══════════════════════════════════════════════════════════════════════════
   LA AGRUPACIÓN Y SUS INTEGRANTES — catálogo global, sin proyecto
   ══════════════════════════════════════════════════════════════════════════ */

const TIPOS_AGR = ["banda_musicos", "conjunto_danza", "cuadrilla", "hermandad", "otro"];

export async function guardarAgrupacion(d: {
  id?: string; nombre?: string; tipo?: string; procedencia?: string;
  representanteId?: string | null; numeroDeclarado?: number | null;
  contactoTelefono?: string; nota?: string;
}) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };

  const nombre = texto(d.nombre, 200);
  if (!nombre) return { error: "Ponle nombre a la agrupación." };
  const tipo = TIPOS_AGR.includes(String(d.tipo || "")) ? String(d.tipo) : "otro";

  /* El número declarado es lo que dice quien representa, y puede no coincidir
     con los nombres que hayamos conseguido. Esa diferencia ES el dato: «dice
     que son once y tenemos cuatro» es una tarea, no un error. */
  const n = Number(d.numeroDeclarado);
  const declarado = Number.isFinite(n) && n >= 0 && n < 1000 ? Math.floor(n) : null;

  const fila = {
    nombre, tipo,
    procedencia: texto(d.procedencia, 120),
    representante_id: (d.representanteId || "").trim() || null,
    numero_integrantes_declarado: declarado,
    contacto_telefono: texto(d.contactoTelefono, 60),
    nota: texto(d.nota, 1000),
  };

  if (d.id) {
    const { data, error } = await supabase.from("agrupacion")
      .update(fila).eq("id", d.id).select("id");
    if (error) return { error: faltaSql(error.message, "clearance-agrupacion.sql") };
    /* ⚠ Un UPDATE bloqueado por RLS NO da error: devuelve cero filas. */
    if (!data?.length) return { error: "No se guardó: no tienes permiso, o esa agrupación ya no está." };
    revalidar();
    return { id: d.id };
  }

  const { data, error } = await supabase.from("agrupacion")
    .insert({ ...fila, creado_por: user.id }).select("id").single();
  if (error) return { error: faltaSql(error.message, "clearance-agrupacion.sql") };
  revalidar();
  return { id: data.id as string };
}

/**
 * Sumar a alguien a una agrupación. Es catálogo: no dice nada de si firmó —eso
 * es por proyecto y vive en `autorizacion`— solo que toca en esa banda.
 */
export async function sumarIntegrante(
  agrupacionId: string, personaId: string, instrumentoRol?: string,
) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!agrupacionId || !personaId) return { error: "Falta la agrupación o la persona." };

  /* El único es TOTAL (no parcial), así que aquí sí sirve `on conflict`: la
     misma persona dos veces en la misma banda sería contarla dos veces en el
     «n de m» y pedirle dos firmas por lo mismo. */
  const { data, error } = await supabase.from("agrupacion_integrante")
    .upsert({
      agrupacion_id: agrupacionId, persona_id: personaId,
      instrumento_rol: texto(instrumentoRol, 120), creado_por: user.id,
    }, { onConflict: "agrupacion_id,persona_id" }).select("id");
  if (error) return { error: faltaSql(error.message, "clearance-agrupacion.sql") };
  /* ⚠ Con `.select()`, porque un insert bloqueado por RLS NO da error: devuelve
     cero filas. Sin esto la pantalla cerraba el panel, refrescaba, no aparecía
     nadie y no decía por qué. */
  if (!data?.length) return { error: "No se sumó: no tienes permiso." };
  revalidar();
  return {};
}

export async function quitarIntegrante(agrupacionId: string, personaId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };

  const { data, error } = await supabase.from("agrupacion_integrante")
    .delete().eq("agrupacion_id", agrupacionId).eq("persona_id", personaId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  /* ⚠ Lo que NO se toca son sus autorizaciones: si firmó, el papel sigue
     valiendo aunque haya dejado la banda. Sacarla de la lista cambia el
     denominador del «n de m», no borra lo que autorizó. */
  revalidar();
  return {};
}

/* ══════════════════════════════════════════════════════════════════════════
   LA AUTORIZACIÓN
   ══════════════════════════════════════════════════════════════════════════ */

const CALIDADES: CalidadFirmante[] = [
  "titular", "representante_agrupacion", "representante_legal_menor",
  "heredero_o_causahabiente", "propietario_administrador",
  "organizador_actividad", "autoridad_comunal", "representante_entidad",
];
const ESTADOS: EstadoAutorizacion[] = [
  "no_iniciada", "en_gestion", "solicitada", "firmada",
  "rechazada", "no_ubicable", "no_aplica",
];

export type DatosAutorizacion = {
  id?: string;
  tipo?: string;
  naturaleza?: string;
  otorganteTipo?: string;
  otorgantePersonaId?: string | null;
  otorganteAgrupacionId?: string | null;
  otorganteEntidadNombre?: string;
  calidadFirmante?: string;
  objetoPersonaId?: string | null;
  objetoObraId?: string | null;
  objetoGrabacionId?: string | null;
  objetoAgrupacionId?: string | null;
  estado?: string;
  firmadoEl?: string;
  documentoId?: string | null;
  medios?: string[];
  permiteUsoPromocional?: boolean;
  incluyeExplotacionComercialFutura?: boolean;
  tipoPlazo?: string;
  plazoAnios?: number | null;
  plazoHasta?: string;
  riesgoManual?: string | null;
  prioridad?: string;
  notas?: string;
};

export async function guardarAutorizacion(proyectoId: string, d: DatosAutorizacion) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!proyectoId) return { error: "Falta el proyecto." };

  const tipo = String(d.tipo || "") as TipoAutorizacion;
  if (!TIPOS_AUT.includes(tipo)) return { error: "Elige qué se autoriza." };
  const meta = META_TIPO_AUT[tipo];

  const calidad = (CALIDADES.includes(String(d.calidadFirmante || "") as CalidadFirmante)
    ? String(d.calidadFirmante) : "titular") as CalidadFirmante;
  const estado = (ESTADOS.includes(String(d.estado || "") as EstadoAutorizacion)
    ? String(d.estado) : "no_iniciada") as EstadoAutorizacion;

  /* ── EL OTORGANTE: EXACTAMENTE UNO ──
     Con dos, el expediente diría que alguien firmó sin decir quién. */
  const oTipo = ["persona", "agrupacion", "entidad_externa"].includes(String(d.otorganteTipo || ""))
    ? String(d.otorganteTipo) : "persona";
  const oPersona = oTipo === "persona" ? ((d.otorgantePersonaId || "").trim() || null) : null;
  const oAgrup = oTipo === "agrupacion" ? ((d.otorganteAgrupacionId || "").trim() || null) : null;
  const oEntidad = oTipo === "entidad_externa" ? texto(d.otorganteEntidadNombre, 200) : null;
  if (oTipo === "persona" && !oPersona) return { error: "Di quién firma." };
  if (oTipo === "agrupacion" && !oAgrup) return { error: "Di qué agrupación firma." };
  if (oTipo === "entidad_externa" && !oEntidad) return { error: "Escribe el nombre de la entidad que firma." };

  /* ── EL OBJETO: TAMBIÉN EXACTAMENTE UNO ──
     Se limpia según el tipo, y no se deja al formulario: cambiar el tipo y
     guardar dejaría dos objetos puestos y el check tumbaría el guardado con un
     mensaje que no explica nada. */
  const objPersona = (d.objetoPersonaId || "").trim() || null;
  const objObra = (d.objetoObraId || "").trim() || null;
  const objGrab = (d.objetoGrabacionId || "").trim() || null;
  const objAgrup = (d.objetoAgrupacionId || "").trim() || null;

  /* ── R2 · LA OBRA NO CUELGA DEL INTÉRPRETE ──
     Quien toca una canción no tiene derechos sobre la composición. Es el error
     que todo este modelo existe para impedir, así que se dice entero. */
  if ((tipo === "obra_musical" || tipo === "obra_no_musical") && !objObra)
    return {
      error: "Quien toca una canción no tiene derechos sobre la composición. "
        + "Registra la obra y su autor, y apunta esta autorización a la obra.",
    };
  if (tipo === "fonograma" && !objGrab)
    return { error: "Una licencia de fonograma va sobre una grabación concreta, no sobre una persona." };
  if ((tipo === "interpretacion_musical" || tipo === "interpretacion_danza")
      && !objAgrup && !objPersona)
    return { error: "Di sobre qué recae: la agrupación que toca, o la persona si es solista." };
  if (meta.objeto === "persona" && !objPersona)
    return { error: `«${meta.corto}» va sobre una persona. Elige a quién.` };

  const cuantos = [objPersona, objObra, objGrab, objAgrup].filter(Boolean).length;
  if (cuantos !== 1)
    return { error: cuantos ? "Solo puede recaer sobre una cosa." : "Falta decir sobre qué recae." };

  /* ── R5 · MENORES ──
     Sin la firma de su representante legal no hay autorización válida, y la
     aparición solo se resuelve desenfocando o descartando. Se comprueba contra
     la ficha real, no contra lo que diga el formulario. */
  if (objPersona) {
    const { data: p } = await supabase.from("personas")
      .select("id,nombre,es_menor_de_edad,fecha_nacimiento,representante_legal_id,solicito_no_ser_contactada")
      .eq("id", objPersona).maybeSingle();
    if (!p) return { error: "Esa persona ya no existe." };

    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    /* ⚠ CUALQUIER tipo que recaiga sobre esa persona, no solo la imagen. La
       guarda era más estrecha que la regla de riesgo: el formulario obliga a
       elegir persona también en `aporte_de_equipo`, en las locaciones y
       actividades —donde se pide un «responsable»— y en la interpretación de
       un solista. Con `imagen_voz_testimonio` a secas, se podía guardar sin un
       solo aviso una fila que la propia pantalla iba a pintar en rojo crítico. */
    if (esMenor(p as any, hoy)) {
      if (calidad !== "representante_legal_menor")
        return {
          error: `${p.nombre || "Esa persona"} es menor de edad: solo su representante `
            + "legal puede autorizar por ella. Cambia la calidad del firmante, "
            + "o resuelve la aparición desenfocando o descartando el plano.",
        };
      if (!p.representante_legal_id && !oPersona)
        return { error: "Falta registrar quién representa legalmente a ese menor." };
    }
    /* La voluntad de la persona cruza TODOS los proyectos. No es el estado de un
       expediente: es que pidió que no se la contacte. */
    if (p.solicito_no_ser_contactada && !d.id)
      return {
        error: `${p.nombre || "Esa persona"} pidió no ser contactada. Se respeta en `
          + "todos los proyectos. Si cambió de opinión, quita esa marca en su ficha primero.",
      };
  }

  const { f: firmadoEl, error: eF } = fecha(d.firmadoEl, "Firmado el");
  if (eF) return { error: eF };
  const { f: plazoHasta, error: eP } = fecha(d.plazoHasta, "Vale hasta");
  if (eP) return { error: eP };

  /* Una firmada tiene fecha: sin ella, «firmada» es alguien diciendo que hay un
     papel. Se avisa antes de que lo diga el check. */
  if (estado === "firmada" && !firmadoEl)
    return { error: "Una autorización firmada necesita la fecha de firma." };
  const notas = texto(d.notas, 2000);
  if (estado === "no_aplica" && !notas)
    return {
      error: "«No aplica» necesita el motivo escrito: sin él es indistinguible de un olvido.",
    };

  const tipoPlazo = ["indefinido", "anios", "hasta_fecha"].includes(String(d.tipoPlazo || ""))
    ? String(d.tipoPlazo) : "indefinido";
  const nA = Number(d.plazoAnios);
  const plazoAnios = tipoPlazo === "anios" && Number.isFinite(nA) && nA > 0 ? Math.floor(nA) : null;
  if (tipoPlazo === "anios" && !plazoAnios) return { error: "Di a cuántos años es el plazo." };
  if (tipoPlazo === "hasta_fecha" && !plazoHasta) return { error: "Di hasta qué fecha vale." };

  const fila = {
    proyecto_id: proyectoId,
    tipo,
    naturaleza: ["consentimiento", "licencia", "cesion"].includes(String(d.naturaleza || ""))
      ? String(d.naturaleza) : meta.naturaleza,
    otorgante_tipo: oTipo,
    otorgante_persona_id: oPersona,
    otorgante_agrupacion_id: oAgrup,
    otorgante_entidad_nombre: oEntidad,
    calidad_firmante: calidad,
    objeto_persona_id: objPersona,
    objeto_obra_id: objObra,
    objeto_grabacion_id: objGrab,
    objeto_agrupacion_id: objAgrup,
    estado,
    firmado_el: firmadoEl,
    documento_id: (d.documentoId || "").trim() || null,
    medios: Array.isArray(d.medios) ? d.medios.slice(0, 20) : [],
    permite_uso_promocional: d.permiteUsoPromocional !== false,
    incluye_explotacion_comercial_futura: !!d.incluyeExplotacionComercialFutura,
    tipo_plazo: tipoPlazo,
    plazo_anios: plazoAnios,
    plazo_hasta: tipoPlazo === "hasta_fecha" ? plazoHasta : null,
    riesgo_manual: ["bajo", "medio", "alto", "critico"].includes(String(d.riesgoManual || ""))
      ? String(d.riesgoManual) : null,
    prioridad: ["urgente", "alta", "media", "baja"].includes(String(d.prioridad || ""))
      ? String(d.prioridad) : "media",
    notas,
  };

  if (d.id) {
    /* Lista blanca: `proyecto_id` no se manda. Cambiarlo movería el permiso a
       otra película saltándose todas las comprobaciones de arriba — y sobre
       todo, saltándose R10, que es la barrera del modelo entero. */
    const { proyecto_id: _p, ...editable } = fila;
    const { data, error } = await supabase.from("autorizacion")
      .update(editable).eq("id", d.id).eq("proyecto_id", proyectoId).select("id");
    if (error) return { error: faltaSql(error.message, "clearance-autorizacion.sql") };
    if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no está aquí." };
    await bitacora(supabase, user.id, proyectoId, `editó una autorización de ${meta.corto}`);
    revalidar(proyectoId);
    return { id: d.id };
  }

  const { data, error } = await supabase.from("autorizacion")
    .insert({ ...fila, creado_por: user.id }).select("id").single();
  if (error) return { error: faltaSql(error.message, "clearance-autorizacion.sql") };
  await bitacora(supabase, user.id, proyectoId, `registró una autorización de ${meta.corto}`);
  revalidar(proyectoId);
  return { id: data.id as string };
}

/**
 * Cambiar solo el estado. Existe aparte del guardado entero porque es el gesto
 * que más se repite —«ya firmó»— y obligar a abrir el formulario completo para
 * mover una casilla hace que no se mueva.
 */
export async function cambiarEstadoAutorizacion(
  id: string, proyectoId: string, estado: string, firmadoEl?: string, notas?: string,
) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!ESTADOS.includes(estado as EstadoAutorizacion)) return { error: "Ese estado no existe." };

  const { data: prev } = await supabase.from("autorizacion")
    .select("id,estado,firmado_el,notas,tipo").eq("id", id).eq("proyecto_id", proyectoId).maybeSingle();
  if (!prev) return { error: "Esa autorización ya no está en este proyecto." };

  const { f, error: eF } = fecha(firmadoEl, "Firmado el");
  if (eF) return { error: eF };
  /* Se conserva la fecha que ya tenía si no llega una nueva: cambiar de
     «solicitada» a «firmada» y de vuelta no puede perder el dato. */
  const fin = f || prev.firmado_el || null;
  if (estado === "firmada" && !fin)
    return { error: "Una autorización firmada necesita la fecha de firma." };

  const nota = texto(notas, 2000) || prev.notas || null;
  if (estado === "no_aplica" && !nota)
    return { error: "«No aplica» necesita el motivo escrito: sin él es indistinguible de un olvido." };

  const { data, error } = await supabase.from("autorizacion")
    .update({ estado, firmado_el: fin, notas: nota })
    .eq("id", id).eq("proyecto_id", proyectoId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no está aquí." };

  await bitacora(supabase, user.id, proyectoId,
    `cambió una autorización de «${prev.estado}» a «${estado}»`);
  revalidar(proyectoId);
  return {};
}

/**
 * Corregir la calidad del firmante y el alcance promocional.
 *
 * ⚠ EXISTE PORQUE SIN ELLA HABÍA AVISOS QUE NADIE PODÍA APAGAR.
 * Todo lo demás de una autorización era de una sola escritura: se elegía al
 * crearla y no se podía tocar nunca más. Dos consecuencias reales:
 *   · Un permiso creado con «tráiler, afiche y miniaturas» desmarcado por error
 *     y luego firmado dejaba el aviso «⚠ no pueden aparecer en promoción» para
 *     siempre — y `quitarAutorizacion` se niega a borrar una firmada.
 *   · Una `calidad_firmante` puesta mal es peor: es EL campo de este módulo. Una
 *     fila creada como `titular` en vez de `representante_agrupacion` altera el
 *     «n de m» de R1, y no había forma de arreglarla salvo entrando a la base.
 *
 * ⚠ Y ES ESTRECHA A PROPÓSITO. `guardarAutorizacion` con `id` escribe la fila
 * ENTERA: usarla para corregir dos campos pondría `tipo_plazo='indefinido'`,
 * `medios=[]`, `documento_id=null` y `riesgo_manual=null` en cualquier fila
 * migrada que sí los tenía. Un editor parcial que escribe el todo borra en
 * silencio lo que no le preguntó.
 */
export async function corregirAutorizacion(
  id: string, proyectoId: string,
  d: { calidadFirmante?: string; permiteUsoPromocional?: boolean },
) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: prev } = await supabase.from("autorizacion")
    .select("id,calidad_firmante,permite_uso_promocional,objeto_persona_id,tipo")
    .eq("id", id).eq("proyecto_id", proyectoId).maybeSingle();
  if (!prev) return { error: "Esa autorización ya no está en este proyecto." };

  const calidad = CALIDADES.includes(String(d.calidadFirmante || "") as CalidadFirmante)
    ? String(d.calidadFirmante) : prev.calidad_firmante;

  /* R5 otra vez: bajar la calidad de `representante_legal_menor` a `titular`
     sobre un menor deja la fila diciendo que el menor firmó por sí mismo, que
     es nulo. Se comprueba aquí también — corregir es otro camino de escritura,
     y una guarda que solo está en el alta no es una guarda. */
  if (prev.objeto_persona_id && calidad !== "representante_legal_menor") {
    const { data: p } = await supabase.from("personas")
      .select("nombre,es_menor_de_edad,fecha_nacimiento")
      .eq("id", prev.objeto_persona_id).maybeSingle();
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    if (p && esMenor(p as any, hoy))
      return {
        error: `${p.nombre || "Esa persona"} es menor de edad: solo su representante `
          + "legal puede autorizar por ella.",
      };
  }

  const { data, error } = await supabase.from("autorizacion")
    .update({
      calidad_firmante: calidad,
      permite_uso_promocional: typeof d.permiteUsoPromocional === "boolean"
        ? d.permiteUsoPromocional : prev.permite_uso_promocional,
    })
    .eq("id", id).eq("proyecto_id", proyectoId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no está aquí." };

  await bitacora(supabase, user.id, proyectoId,
    `corrigió la calidad del firmante de una autorización a «${calidad}»`);
  revalidar(proyectoId);
  return {};
}

/**
 * Apuntar un intento de contacto. Cuando no se logra ubicar a un titular, la
 * prueba del intento razonable es parte de la defensa: una autorización nunca
 * se borra por no encontrar a quien firma, se documenta lo que se intentó.
 */
export async function apuntarGestion(
  autorizacionId: string, proyectoId: string,
  d: { fecha?: string; canal?: string; resultado?: string; detalle?: string; evidenciaUrl?: string },
) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: a } = await supabase.from("autorizacion")
    .select("id").eq("id", autorizacionId).eq("proyecto_id", proyectoId).maybeSingle();
  if (!a) return { error: "Esa autorización no es de este proyecto." };

  const canales = ["llamada", "whatsapp", "correo", "presencial", "carta", "intermediario"];
  const resultados = ["sin_respuesta", "respondio", "acepto", "rechazo", "no_ubicable"];
  const { f, error: eF } = fecha(d.fecha, "Fecha");
  if (eF) return { error: eF };

  const url = (d.evidenciaUrl || "").trim();
  if (url && !/^https?:\/\//i.test(url))
    return { error: "El enlace tiene que empezar por http:// o https://" };

  const { data, error } = await supabase.from("gestion_contacto").insert({
    autorizacion_id: autorizacionId,
    fecha: f || new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
    canal: canales.includes(String(d.canal || "")) ? String(d.canal) : "llamada",
    resultado: resultados.includes(String(d.resultado || "")) ? String(d.resultado) : "sin_respuesta",
    detalle: texto(d.detalle, 1000),
    evidencia_url: url || null,
    creado_por: user.id,
  }).select("id");
  if (error) return { error: faltaSql(error.message, "clearance-autorizacion.sql") };
  /* Misma razón que en `sumarIntegrante`: RLS devuelve cero filas sin error. */
  if (!data?.length) return { error: "No se apuntó: no tienes permiso." };
  revalidar(proyectoId);
  return {};
}

export async function quitarAutorizacion(id: string, proyectoId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: a } = await supabase.from("autorizacion")
    .select("tipo,estado").eq("id", id).eq("proyecto_id", proyectoId).maybeSingle();
  if (!a) return { error: "Esa autorización ya no está en este proyecto." };
  /* ⚠ Una FIRMADA no se borra desde aquí. Es la prueba de que alguien autorizó,
     y el expediente se enseña meses después a un fondo o a una aseguradora.
     Si de verdad hay que quitarla, primero se cambia de estado a conciencia. */
  if (a.estado === "firmada")
    return {
      error: "Esa autorización está firmada y es la prueba de que alguien autorizó. "
        + "Si hay que retirarla, cámbiale antes el estado y explica por qué.",
    };

  const { data, error } = await supabase.from("autorizacion")
    .delete().eq("id", id).eq("proyecto_id", proyectoId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  await bitacora(supabase, user.id, proyectoId, "quitó una autorización sin firmar");
  revalidar(proyectoId);
  return {};
}

async function bitacora(supabase: any, actorId: string, proyectoId: string, mensaje: string) {
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: actorId,
    tipo: "edicion", detalle: { mensaje },
  });
}
