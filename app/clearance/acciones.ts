"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  META_TIPO_AUT, TIPOS_AUT, esMenor, MODELOS_DOC,
  type TipoAutorizacion, type CalidadFirmante, type EstadoAutorizacion,
  type ModeloDoc,
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

/* ⚠ SIN PARÁMETRO. Lo tenía, y desde que la ficha es una ruta con patrón ya no
   se usa: `revalidatePath("/clearance/[id]", "page")` revalida TODAS las fichas
   de una vez, que es lo correcto y lo único que Next permite aquí. Un parámetro
   que no hace nada es peor que ninguno — el siguiente lo vuelve a cablear
   creyendo que dirige el revalidado a una película. */
const revalidar = () => {
  revalidatePath("/clearance");
  revalidatePath("/musica");
  /* ⚠ El PATRÓN de ruta, no la ruta construida: con `/entidad/proyecto/<id>`
     Next arma un tag que no coincide con ninguna página y no revalida nada, sin
     dar error. Está contado en app/guion/acciones.ts. */
  revalidatePath("/entidad/[tipo]/[id]", "page");
  /* ⚠ EL PATRÓN, no la ruta construida. Con `/clearance/<uuid>` Next arma un
     tag que no coincide con ninguna página y no revalida nada, sin dar error:
     registras un permiso, vuelves y la ficha sigue enseñando lo de antes. Ya
     nos pasó en app/guion/acciones.ts. */
  revalidatePath("/clearance/[id]", "page");
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
  objetoLocacionId?: string | null;
  objetoActividadId?: string | null;
  objetoMaterialId?: string | null;
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
  const objLoc = (d.objetoLocacionId || "").trim() || null;
  const objAct = (d.objetoActividadId || "").trim() || null;
  const objMat = (d.objetoMaterialId || "").trim() || null;

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
  /* Los tres que hasta ayer no tenían dónde colgarse. Cada uno con su frase:
     un mensaje sobre una constraint no dice qué hacer. */
  if (tipo === "locacion" && !objLoc)
    return { error: "Un permiso de filmación va sobre un lugar. Da de alta la locación primero." };
  if (tipo === "actividad_organizada" && !objAct)
    return { error: "Un permiso de actividad va sobre la actividad. Dala de alta primero — y recuerda que cubre la actividad, no a cada persona que participa." };
  if (tipo === "material_aportado" && !objMat)
    return { error: "Va sobre el material concreto. Dalo de alta primero: quien lo presta y quien lo creó suelen ser personas distintas." };

  const cuantos = [objPersona, objObra, objGrab, objAgrup, objLoc, objAct, objMat].filter(Boolean).length;
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
    objeto_locacion_id: objLoc,
    objeto_actividad_id: objAct,
    objeto_material_id: objMat,
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
    revalidar();
    return { id: d.id };
  }

  const { data, error } = await supabase.from("autorizacion")
    .insert({ ...fila, creado_por: user.id }).select("id").single();
  if (error) return { error: faltaSql(error.message, "clearance-autorizacion.sql") };
  await bitacora(supabase, user.id, proyectoId, `registró una autorización de ${meta.corto}`);
  revalidar();
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
  revalidar();
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
  revalidar();
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
  revalidar();
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
  revalidar();
  return {};
}

async function bitacora(supabase: any, actorId: string, proyectoId: string, mensaje: string) {
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: actorId,
    tipo: "edicion", detalle: { mensaje },
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   LOS LUGARES: LOCACIÓN, ACTIVIDAD Y MATERIAL APORTADO
   ══════════════════════════════════════════════════════════════════════════ */

const TIPOS_LOC = ["espacio_publico", "espacio_privado", "privado_abierto_al_publico",
  "institucion_publica", "templo_religioso", "patrimonio_cultural"];

export async function guardarLocacion(d: {
  id?: string; nombre?: string; tipo?: string; responsableId?: string | null;
  entidadResponsable?: string; esPatrimonio?: string; direccion?: string; nota?: string;
}) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const nombre = texto(d.nombre, 200);
  if (!nombre) return { error: "Ponle nombre a la locación." };

  const fila = {
    nombre,
    tipo: TIPOS_LOC.includes(String(d.tipo || "")) ? String(d.tipo) : "espacio_publico",
    responsable_id: (d.responsableId || "").trim() || null,
    entidad_responsable: texto(d.entidadResponsable, 200),
    es_patrimonio_declarado: ["si", "no", "por_verificar"].includes(String(d.esPatrimonio || ""))
      ? String(d.esPatrimonio) : "por_verificar",
    direccion: texto(d.direccion, 300),
    nota: texto(d.nota, 1000),
  };

  if (d.id) {
    const { data, error } = await supabase.from("locacion").update(fila).eq("id", d.id).select("id");
    if (error) return { error: faltaSql(error.message, "clearance-lugares.sql") };
    if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no está." };
    revalidar(); return { id: d.id };
  }
  const { data, error } = await supabase.from("locacion")
    .insert({ ...fila, creado_por: user.id }).select("id").single();
  if (error) return { error: faltaSql(error.message, "clearance-lugares.sql") };
  revalidar();
  return { id: data.id as string };
}

export async function guardarActividad(proyectoId: string, d: {
  id?: string; nombre?: string; fechaInicio?: string; fechaFin?: string;
  locacionId?: string | null; organizadorPersonaId?: string | null;
  organizadorEntidad?: string; esInstitucional?: boolean;
  contenidoSensible?: boolean; nota?: string;
}) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!proyectoId) return { error: "Falta el proyecto." };
  const nombre = texto(d.nombre, 200);
  if (!nombre) return { error: "Ponle nombre a la actividad." };

  const { f: ini, error: e1 } = fecha(d.fechaInicio, "Empieza");
  if (e1) return { error: e1 };
  const { f: fin, error: e2 } = fecha(d.fechaFin, "Termina");
  if (e2) return { error: e2 };
  /* Una actividad que termina antes de empezar es un error de tecleo, y sin
     esto se guarda y luego nadie entiende por qué el orden sale raro. */
  if (ini && fin && fin < ini) return { error: "La actividad no puede terminar antes de empezar." };

  const fila = {
    proyecto_id: proyectoId, nombre,
    fecha_inicio: ini, fecha_fin: fin,
    locacion_id: (d.locacionId || "").trim() || null,
    organizador_persona_id: (d.organizadorPersonaId || "").trim() || null,
    organizador_entidad: texto(d.organizadorEntidad, 200),
    es_institucional: !!d.esInstitucional,
    contenido_sensible: !!d.contenidoSensible,
    nota: texto(d.nota, 1000),
  };

  if (d.id) {
    const { proyecto_id: _p, ...editable } = fila;
    const { data, error } = await supabase.from("actividad_rodaje")
      .update(editable).eq("id", d.id).eq("proyecto_id", proyectoId).select("id");
    if (error) return { error: faltaSql(error.message, "clearance-lugares.sql") };
    if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no está aquí." };
    revalidar(); return { id: d.id };
  }
  const { data, error } = await supabase.from("actividad_rodaje")
    .insert({ ...fila, creado_por: user.id }).select("id").single();
  if (error) return { error: faltaSql(error.message, "clearance-lugares.sql") };
  revalidar();
  return { id: data.id as string };
}

export async function guardarMaterial(proyectoId: string, d: {
  id?: string; descripcion?: string; tipo?: string;
  entregadoPorPersonaId?: string | null; autorConocido?: boolean; autorNombre?: string;
  anioAproximado?: number | null; origen?: string; devuelto?: boolean; nota?: string;
}) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!proyectoId) return { error: "Falta el proyecto." };
  const descripcion = texto(d.descripcion, 300);
  if (!descripcion) return { error: "Describe qué material es." };

  const anio = Number(d.anioAproximado);
  const fila = {
    proyecto_id: proyectoId, descripcion,
    tipo: ["fotografia", "video", "documento", "audio", "otro"].includes(String(d.tipo || ""))
      ? String(d.tipo) : "fotografia",
    entregado_por_persona_id: (d.entregadoPorPersonaId || "").trim() || null,
    /* ⚠ `autor_conocido` sale del NOMBRE, no de la casilla. Marcarla sin
       escribir a quién deja la fila diciendo que se sabe de quién es sin
       decirlo, y el aviso de «autor desconocido» se apaga sin que nadie lo
       haya averiguado. */
    autor_conocido: !!texto(d.autorNombre, 200),
    autor_nombre: texto(d.autorNombre, 200),
    anio_aproximado: Number.isFinite(anio) && anio > 1800 && anio < 2200 ? Math.floor(anio) : null,
    origen: ["archivo_familiar", "internet", "institucional", "prensa", "desconocido"]
      .includes(String(d.origen || "")) ? String(d.origen) : "desconocido",
    devuelto: !!d.devuelto,
    nota: texto(d.nota, 1000),
  };

  if (d.id) {
    const { proyecto_id: _p, ...editable } = fila;
    const { data, error } = await supabase.from("material_aportado")
      .update(editable).eq("id", d.id).eq("proyecto_id", proyectoId).select("id");
    if (error) return { error: faltaSql(error.message, "clearance-lugares.sql") };
    if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no está aquí." };
    revalidar(); return { id: d.id };
  }
  const { data, error } = await supabase.from("material_aportado")
    .insert({ ...fila, creado_por: user.id }).select("id").single();
  if (error) return { error: faltaSql(error.message, "clearance-lugares.sql") };
  revalidar();
  return { id: data.id as string };
}

/* ══════════════════════════════════════════════════════════════════════════
   LA BITÁCORA DE MONTAJE
   ══════════════════════════════════════════════════════════════════════════ */

const DEC_INC = ["pendiente", "usar", "reencuadrar", "desenfocar", "quitar_audio",
  "sustituir_plano", "pedir_release", "descartar"];
const DEC_MUS = ["pendiente", "licenciar", "atenuar", "sustituir", "cambiar_toma", "mantener"];
const MODOS_MUS = ["ejecucion_en_vivo_registrada", "ambiental_de_local_o_altavoz",
  "reproducida_por_organizador", "radio_o_television_en_escena",
  "musica_original_encargada", "libreria_licenciada", "generada_con_ia"];

export async function guardarIncidental(proyectoId: string, d: {
  id?: string; escenaOPlano?: string; descripcionPersona?: string;
  actividadId?: string | null; esIdentificable?: boolean; tieneProtagonismo?: boolean;
  esMenor?: string; contextoSensible?: boolean; avisoFilmacionColocado?: boolean;
  decisionMontaje?: string; resuelto?: boolean; nota?: string;
}) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!proyectoId) return { error: "Falta el proyecto." };

  const donde = texto(d.escenaOPlano, 200);
  if (!donde) return { error: "Di en qué plano o escena sale, aunque sea a tu manera." };
  const quien = texto(d.descripcionPersona, 300);
  if (!quien) return { error: "Describe a la persona lo justo para encontrarla en el plano." };

  const decision = DEC_INC.includes(String(d.decisionMontaje || ""))
    ? String(d.decisionMontaje) : "pendiente";
  const esMenor = ["si", "no", "por_revisar"].includes(String(d.esMenor || ""))
    ? String(d.esMenor) : "por_revisar";

  /* ⚠ NO SE PUEDE DAR POR RESUELTO SIN DECIDIR NADA. `resuelto` con la decisión
     en `pendiente` sería sacar del semáforo a alguien de quien no se decidió
     nada, que es exactamente lo que esta tabla existe para impedir. */
  const resuelto = !!d.resuelto;
  if (resuelto && decision === "pendiente")
    return { error: "Para darlo por resuelto hay que decir qué se hizo con ese plano." };

  /* ── R5 OTRA VEZ, AQUÍ ──
     Un menor identificable solo se resuelve quitándolo de en medio. `usar` no
     vale, y `pedir_release` tampoco lo RESUELVE: pedirla no es tenerla, y
     mientras no esté firmada por su representante legal el plano sigue dentro.
     Se enumeran las salidas válidas en positivo — la primera versión de esta
     guarda eran dos condiciones solapadas que se contradecían entre sí. */
  const SALIDAS_MENOR = ["desenfocar", "reencuadrar", "sustituir_plano", "descartar"];
  /* ⚠ `por_revisar` cuenta igual que `si`. `riesgoIncidental` lo trata como
     grave PRECISAMENTE porque no se sabe, y la guarda lo trataba como «no»: se
     podía dar por resuelto con «usar tal cual» sin que nadie hubiera revisado
     nada. Si de verdad no es menor, se marca «no» y la guarda se aparta. */
  if (resuelto && (esMenor === "si" || esMenor === "por_revisar")
      && d.esIdentificable !== false && !SALIDAS_MENOR.includes(decision))
    return {
      error: esMenor === "por_revisar"
        ? "Está sin revisar si es menor. Revísalo y márcalo «sí» o «no» antes de "
          + "darlo por resuelto: dar por bueno lo que no se ha mirado es el error "
          + "que esta bitácora existe para impedir."
        : "Un menor identificable no se puede dar por resuelto con esa decisión: "
          + "sin la firma de su representante legal, solo cabe desenfocar, reencuadrar, "
          + "sustituir el plano o descartarlo.",
    };

  const fila = {
    proyecto_id: proyectoId,
    escena_o_plano: donde,
    descripcion_persona: quien,
    actividad_id: (d.actividadId || "").trim() || null,
    es_identificable: d.esIdentificable !== false,
    tiene_protagonismo: !!d.tieneProtagonismo,
    es_menor: esMenor,
    contexto_sensible: !!d.contextoSensible,
    aviso_filmacion_colocado: !!d.avisoFilmacionColocado,
    decision_montaje: decision,
    resuelto,
    nota: texto(d.nota, 1000),
  };

  if (d.id) {
    const { proyecto_id: _p, ...editable } = fila;
    const { data, error } = await supabase.from("aparicion_incidental")
      .update(editable).eq("id", d.id).eq("proyecto_id", proyectoId).select("id");
    if (error) return { error: faltaSql(error.message, "clearance-montaje.sql") };
    if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no está aquí." };
    revalidar(); return { id: d.id };
  }
  const { data, error } = await supabase.from("aparicion_incidental")
    .insert({ ...fila, creado_por: user.id }).select("id").single();
  if (error) return { error: faltaSql(error.message, "clearance-montaje.sql") };
  revalidar();
  return { id: data.id as string };
}

export async function quitarIncidental(id: string, proyectoId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = await supabase.from("aparicion_incidental")
    .delete().eq("id", id).eq("proyecto_id", proyectoId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  revalidar();
  return {};
}

export async function guardarUsoMusical(proyectoId: string, d: {
  id?: string; timecodeInicio?: string; timecodeFin?: string; escena?: string;
  obraId?: string | null; grabacionId?: string | null; agrupacionId?: string | null;
  modoAparicion?: string; decisionMontaje?: string; resuelto?: boolean;
  autorizacionId?: string | null; nota?: string;
}) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!proyectoId) return { error: "Falta el proyecto." };

  const tcIni = texto(d.timecodeInicio, 40);
  const escena = texto(d.escena, 200);
  /* Uno de los dos, al menos: sin ninguno, la fila dice que suena algo pero no
     dónde, y entonces no se puede ir a mirarlo. */
  if (!tcIni && !escena)
    return { error: "Di al menos dónde suena: un timecode o el nombre de la escena." };

  const decision = DEC_MUS.includes(String(d.decisionMontaje || ""))
    ? String(d.decisionMontaje) : "pendiente";
  const resuelto = !!d.resuelto;
  if (resuelto && decision === "pendiente")
    return { error: "Para darlo por resuelto hay que decir qué se hizo con esa música." };

  /* ── LA GUARDA SIMÉTRICA A LA DE LOS MENORES ──
     ⚠ Lo ambiental, lo que pone el organizador y lo que suena de una radio en
     escena son casi siempre grabaciones comerciales, y son lo ÚNICO del
     proyecto que puede bloquear un vídeo sin que ninguna persona reclame: lo
     hace un sistema de identificación. Sin esta guarda se silenciaban con dos
     clics —`mantener` + resuelto— sin licencia, sin documento y sin nada.
     `licenciar` sí vale, pero entonces tiene que existir el papel: pedirla no
     es tenerla, igual que en las incidentales. */
  const modo = MODOS_MUS.includes(String(d.modoAparicion || ""))
    ? String(d.modoAparicion) : "ejecucion_en_vivo_registrada";
  const DE_TERCERO = ["ambiental_de_local_o_altavoz", "reproducida_por_organizador",
    "radio_o_television_en_escena"];
  const autId = (d.autorizacionId || "").trim() || null;
  if (resuelto && DE_TERCERO.includes(modo)) {
    if (decision === "mantener")
      return {
        error: "Esa música es de un tercero y suena tal cual: no se resuelve manteniéndola. "
          + "Atenúala, sustitúyela, cambia de toma — o licénciala y ata aquí la licencia.",
      };
    if (decision === "licenciar" && !autId)
      return {
        error: "Para darla por licenciada hay que atar la licencia de fonograma. "
          + "Pedirla no es tenerla, y esto es lo único que puede bloquear el vídeo solo.",
      };
  }
  if (autId) {
    const { data: aut } = await supabase.from("autorizacion")
      .select("id,proyecto_id,tipo,estado").eq("id", autId).maybeSingle();
    if (!aut) return { error: "Esa licencia ya no existe." };
    if (aut.proyecto_id !== proyectoId) return { error: "Esa licencia no es de este proyecto." };
    if (resuelto && aut.estado !== "firmada")
      return { error: "La licencia que atas todavía no está firmada, así que esto no está resuelto." };
  }

  const fila = {
    proyecto_id: proyectoId,
    autorizacion_id: autId,
    timecode_inicio: tcIni, timecode_fin: texto(d.timecodeFin, 40), escena,
    obra_id: (d.obraId || "").trim() || null,
    grabacion_id: (d.grabacionId || "").trim() || null,
    agrupacion_id: (d.agrupacionId || "").trim() || null,
    modo_aparicion: modo,
    decision_montaje: decision,
    resuelto,
    nota: texto(d.nota, 1000),
  };

  if (d.id) {
    const { proyecto_id: _p, ...editable } = fila;
    const { data, error } = await supabase.from("uso_musical_corte")
      .update(editable).eq("id", d.id).eq("proyecto_id", proyectoId).select("id");
    if (error) return { error: faltaSql(error.message, "clearance-montaje.sql") };
    if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no está aquí." };
    revalidar(); return { id: d.id };
  }
  const { data, error } = await supabase.from("uso_musical_corte")
    .insert({ ...fila, creado_por: user.id }).select("id").single();
  if (error) return { error: faltaSql(error.message, "clearance-montaje.sql") };
  revalidar();
  return { id: data.id as string };
}

export async function quitarUsoMusical(id: string, proyectoId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = await supabase.from("uso_musical_corte")
    .delete().eq("id", id).eq("proyecto_id", proyectoId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  revalidar();
  return {};
}

/* ══════════════════════════════════════════════════════════════════════════
   EL PAPEL FIRMADO

   ⚠ POR QUÉ ESTO NO EXISTÍA Y TENÍA QUE EXISTIR.

   `documento_firmado` se creó con la migración del clearance y NADIE la
   escribía. Ni una acción, ni un formulario. Era una tabla vacía que nadie
   llenaba — y eso no es una función a medias: es una promesa.

   Y no era inofensiva. Todo el módulo decide el verde con «firmada Y hay
   documento», porque una fila que dice «firmada» sin papel es alguien
   afirmando que existe una firma. Sin sitio donde subir el papel, ese verde
   era INALCANZABLE: podías registrar los cinco permisos de tu película,
   marcarlos todos firmados, y el semáforo seguiría en rojo para siempre sin
   decirte por qué. Un aviso que no se puede resolver se deja de leer, y detrás
   se van los que sí importan.

   ── EL ARCHIVO SE SUBE EN EL NAVEGADOR, NO AQUÍ ──
   `lib/subirImagen.ts` ya sube al bucket `adjuntos` (PDF hasta 15MB, imágenes
   hasta 5). Aquí llega la URL. Mandar el archivo entero a una server action
   sería pasarlo dos veces por la red.
   ══════════════════════════════════════════════════════════════════════════ */

export type DatosDocumento = {
  id?: string;
  /** El permiso que este papel prueba. */
  autorizacionId: string;
  modelo?: string;
  archivoUrl?: string;
  /** SHA-256 del archivo, calculado en el navegador. Para poder decir, meses
   *  después y ante una aseguradora, que es el mismo PDF que se firmó. */
  hashArchivo?: string;
  firmadoEl?: string;
  lugarFirma?: string;
  tieneHuellaDigital?: boolean;
  consentimientoGrabadoUrl?: string;
  testigos?: string;
  nota?: string;
};

/** Solo http(s). Sin esto, un `javascript:` pegado a mano se pinta como
 *  `<a href>` clicable. Misma guarda que en el guion y en la música. */
function urlLimpia(v?: string | null): { url: string | null; error?: string } {
  const u = (v || "").trim();
  if (!u) return { url: null };
  if (!/^https?:\/\//i.test(u))
    return { url: null, error: "El enlace tiene que empezar por http:// o https://" };
  return { url: u };
}

/**
 * Guardar el papel firmado de un permiso, y atarlo.
 *
 * Hace TRES cosas en una, y a propósito: crea el documento, lo ata a la
 * autorización y pone esta en `firmada`. Separarlas dejaría estados
 * intermedios que nadie querría —un papel huérfano, o un permiso con documento
 * pero en «en gestión»— y obligaría a acordarse de dar tres pasos para que la
 * fila se ponga verde. Acordarse es lo que no pasa.
 */
export async function guardarDocumentoFirmado(proyectoId: string, d: DatosDocumento) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!proyectoId) return { error: "Falta el proyecto." };
  if (!d.autorizacionId) return { error: "Falta a qué permiso pertenece este papel." };

  const modelo = MODELOS_DOC.includes(String(d.modelo || "") as ModeloDoc)
    ? String(d.modelo) : "otro";

  const { url: archivoUrl, error: eUrl } = urlLimpia(d.archivoUrl);
  if (eUrl) return { error: eUrl };
  const { url: grabadoUrl, error: eGrab } = urlLimpia(d.consentimientoGrabadoUrl);
  if (eGrab) return { error: eGrab };

  /* ⚠ Un documento sin archivo NI consentimiento grabado no prueba nada, y
     atarlo pondría el permiso en verde sobre la nada — exactamente el fallo
     que el `documento_id` viene a impedir. El grabado vale: en campo es a
     veces la única prueba que hay, y es consentimiento informado. */
  if (!archivoUrl && !grabadoUrl)
    return { error: "Sube el papel, o al menos el enlace al consentimiento grabado: sin uno de los dos, esto no prueba nada y el permiso no puede darse por bueno." };

  const { f: firmadoEl, error: eF } = fecha(d.firmadoEl, "Firmado el");
  if (eF) return { error: eF };

  /* ── EL PERMISO TIENE QUE SER DE ESTE PROYECTO ──
     El id llega del navegador. Sin esto se podría colgar un papel del permiso
     de otra película, y un `check` no puede consultar otra tabla. */
  const { data: aut } = await supabase.from("autorizacion")
    .select("id,proyecto_id,estado,firmado_el,documento_id,tipo")
    .eq("id", d.autorizacionId).maybeSingle();
  if (!aut) return { error: "Ese permiso ya no existe." };
  if (aut.proyecto_id !== proyectoId) return { error: "Ese permiso no es de este proyecto." };

  /* ── UN PAPEL NO RESUCITA UN RECHAZO ──
     ⚠ `aut.estado` se leía y se tiraba, y el update forzaba `firmada` viniera
     de donde viniera. Con eso, subir cualquier PDF a un permiso RECHAZADO lo
     sacaba de los bloqueos y el semáforo pasaba a verde: el estado que
     `semaforo` cuenta precisamente porque «nadie va a firmar y el material
     sigue dentro». Y desde `no_aplica` destruía una decisión analizada,
     dejando su nota justificando una fila que ahora decía «firmada». */
  const previo = String(aut.estado || "").toLowerCase();
  if (previo === "rechazada")
    return { error: "Este permiso está rechazado: quien tenía que firmar dijo que no. Un papel no lo revive — si la situación cambió, mueve antes el estado a mano y di por qué." };
  if (previo === "no_aplica")
    return { error: "Este permiso está marcado «no aplica», que es una decisión analizada y anotada. Si ahora sí hace falta, cámbiale el estado antes de colgarle un papel." };

  /* ── LA FECHA, COMPROBADA ANTES DE ESCRIBIR NADA ──
     ⚠ La base tiene un check —`autorizacion_firmada_con_fecha`— y sin esta
     guarda el orden era: se creaba el documento, se subía el archivo, y ENTONCES
     el update reventaba con «violates check constraint». Quedaba una fila
     huérfana, un archivo suelto en el almacén y un mensaje de Postgres que no
     dice ni qué pasó ni que algo sí se guardó. La base es la red de abajo;
     estas frases son lo que se lee. `cambiarEstadoAutorizacion` ya lo hacía
     bien y aquí se olvidó. */
  const fechaFinal = firmadoEl || (aut.firmado_el as string | null) || null;
  if (!fechaFinal)
    return { error: "Pon la fecha de firma. Una autorización firmada sin fecha es alguien diciendo que hay un papel, y el expediente se enseña meses después: «cuándo» es de lo primero que se pregunta." };

  const fila = {
    proyecto_id: proyectoId,
    modelo,
    archivo_url: archivoUrl,
    hash_archivo: texto(d.hashArchivo, 128),
    firmado_el: fechaFinal,
    lugar_firma: texto(d.lugarFirma, 120),
    tiene_huella_digital: !!d.tieneHuellaDigital,
    consentimiento_grabado_url: grabadoUrl,
    testigos: texto(d.testigos, 200),
    nota: texto(d.nota, 500),
  };

  /* ── EDITAR EL QUE YA HAY, NO CREAR OTRO ──
     ⚠ `d.id` viene del formulario, pero si el permiso YA tiene documento hay
     que editar ese aunque no llegue. Sin esta línea, cada pulsación de guardar
     insertaba una fila nueva y repuntaba `documento_id`, dejando la anterior
     huérfana y sin borrar — y cada reintento tras un error creaba otra. Es la
     tabla del expediente probatorio: llenarla de huérfanos indistinguibles de
     los buenos es peor que dejarla vacía. */
  let docId = d.id || (aut.documento_id as string | null) || "";
  if (docId) {
    const { data, error } = await supabase.from("documento_firmado")
      .update(fila).eq("id", docId).eq("proyecto_id", proyectoId).select("id");
    if (error) return { error: faltaSql(error.message, "clearance-autorizacion.sql") };
    /* ⚠ Un UPDATE bloqueado por RLS NO da error: devuelve cero filas. */
    if (!data?.length) return { error: "No se guardó: no tienes permiso, o ese papel ya no está." };
  } else {
    const { data, error } = await supabase.from("documento_firmado")
      .insert({ ...fila, creado_por: user.id }).select("id").single();
    if (error) return { error: faltaSql(error.message, "clearance-autorizacion.sql") };
    docId = data.id as string;
  }

  /* ── ATARLO, Y DAR EL PERMISO POR FIRMADO ──
     `firmado_el` sale del papel: son la misma fecha, y tenerla en dos sitios
     que puedan discrepar es lo que este módulo entero evita. */
  const { data: at, error: eAt } = await supabase.from("autorizacion")
    .update({ documento_id: docId, estado: "firmada", firmado_el: fechaFinal })
    .eq("id", d.autorizacionId).eq("proyecto_id", proyectoId).select("id");
  /* ⚠ Los dos caminos de fallo dicen que el papel SÍ se guardó. Callarlo
     mandaría a subirlo otra vez, y entonces sí habría dos. */
  if (eAt)
    return { error: `El papel se guardó, pero no se pudo atar al permiso: ${faltaSql(eAt.message, "clearance-autorizacion.sql")}` };
  if (!at?.length)
    return { error: "El papel se guardó, pero no se pudo atar al permiso: no tienes permiso para cambiarlo." };

  await bitacora(supabase, user.id, proyectoId,
    `adjuntó el papel firmado de ${META_TIPO_AUT[aut.tipo as TipoAutorizacion]?.corto || "un permiso"}`);
  revalidar();
  return { id: docId };
}

/** Soltar el papel de un permiso. No borra el archivo del almacén: el
 *  expediente se enseña meses después y un borrado no se deshace. */
export async function quitarDocumentoFirmado(id: string, proyectoId: string, autorizacionId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };

  /* ⚠ Primero se desata y DESPUÉS se borra. Al revés, el `on delete set null`
     de la FK haría el mismo trabajo pero dejaría el permiso en «firmada» sin
     documento, que es el estado que este módulo llama mentira.
     ⚠ Y con `.select("id")`: un UPDATE bloqueado por RLS devuelve cero filas
     SIN error. Sin comprobarlo, el borrado de abajo sí se ejecutaba —otra
     política—, la FK ponía `documento_id` a null y el permiso se quedaba
     «firmada» sin papel. En silencio, y por la puerta que este mismo párrafo
     dice estar cerrando.
     ⚠ Se limpia también `firmado_el`: un `en_gestion` que conserva la fecha
     hace que `vencimiento()` calcule caducidad sobre algo que ya no está
     firmado. */
  const { data: at, error: eAt } = await supabase.from("autorizacion")
    .update({ documento_id: null, estado: "en_gestion", firmado_el: null })
    .eq("id", autorizacionId).eq("proyecto_id", proyectoId).select("id");
  if (eAt) return { error: eAt.message };
  if (!at?.length)
    return { error: "No se quitó: no tienes permiso para cambiar ese permiso, o ya no está aquí." };

  const { data, error } = await supabase.from("documento_firmado")
    .delete().eq("id", id).eq("proyecto_id", proyectoId).select("id");
  if (error) return { error: error.message };
  /* ⚠ Aquí NO se dice «no se quitó»: el permiso ya se desató arriba. Decir que
     no pasó nada sería mentir sobre un cambio que sí ocurrió. */
  if (!data?.length)
    return { error: "El permiso se desató y volvió a «en gestión», pero el papel no se pudo borrar: no tienes permiso, o ya no estaba." };

  await bitacora(supabase, user.id, proyectoId, "quitó el papel firmado de un permiso");
  revalidar();
  return {};
}
