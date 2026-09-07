"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { esOrigen, esPlan, llevaPersona, MAX_CAMPO, META_ORIGEN, type Origen } from "@/lib/obrasMusicales";

/* ══════════════════════════════════════════════════════════════════════════
   LAS ACCIONES DE LAS OBRAS MUSICALES

   En archivo aparte y no en `app/actions.ts`, que ya pasa de doce mil líneas.
   Mismo criterio que `app/guion/acciones.ts` y `app/casilla/acciones.ts`: esto
   es un módulo con su propio vocabulario —origen, ISWC, plan— y no se mezcla.
   ══════════════════════════════════════════════════════════════════════════ */

async function sesion() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

const revalidarObras = () => {
  revalidatePath("/musica");
  /* ⚠ El PATRÓN de ruta del archivo, no la ruta construida: con
     `/entidad/proyecto/<id>` Next arma un tag que no coincide con ninguna
     página y no revalida nada, sin dar error. Está contado en
     app/guion/acciones.ts.
     Hoy ninguna ficha pinta obras —solo /musica—, pero se deja puesto para el
     día que se pegue un bloque ahí: acordarse entonces es lo que no pasa. */
  revalidatePath("/entidad/[tipo]/[id]", "page");
};

/** ⚠ Solo http(s). Sin esto, un `javascript:` pegado en el campo se pinta como
 *  `<a href>` clicable. Misma guarda que en el guion. */
function urlLimpia(v?: string | null): { url: string | null; error?: string } {
  const u = (v || "").trim();
  if (!u) return { url: null };
  if (!/^https?:\/\//i.test(u)) return { url: null, error: "El enlace tiene que empezar por http:// o https://" };
  return { url: u };
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Una fecha o null. Cualquier cosa que no tenga la forma exacta se rechaza en
 *  vez de guardarse: Postgres aceptaría «31/08/26» interpretándola a su manera
 *  y el año 0026 pasaría sin que nadie lo viera. Ya pasó con el cronograma. */
function fechaLimpia(v: string | null | undefined, campo: string):
  { f: string | null; error?: string } {
  const s = (v || "").trim();
  if (!s) return { f: null };
  if (!ES_FECHA.test(s)) return { f: null, error: `${campo}: la fecha tiene que ser AAAA-MM-DD.` };
  return { f: s };
}

/** El texto recortado a SU tope, el mismo que enseña el formulario. El número
 *  sale de `MAX_CAMPO` y no se escribe aquí: con dos listas, la pantalla dejaba
 *  escribir 2000 caracteres y el servidor guardaba 500, sin error. */
const texto = (v: string | null | undefined, campo: string) => {
  const s = (v || "").trim();
  return s ? s.slice(0, MAX_CAMPO[campo] ?? 200) : null;
};

export type DatosObra = {
  id?: string;
  titulo?: string;
  origen?: string;
  personaId?: string | null;
  autorizacionId?: string | null;
  autor?: string;
  iswc?: string;
  consultadoEn?: string;
  consultadoNota?: string;
  pruebaUrl?: string;
  vigenteHasta?: string;
  herramienta?: string;
  planIa?: string;
  prompt?: string;
  aporteHumano?: string;
  resueltoComo?: string;
  donde?: string;
  nota?: string;
};

/**
 * Registrar o editar una obra. Una sola acción para los dos porque los campos
 * y las comprobaciones son idénticos; separarlas duplicaba las quince
 * validaciones de abajo y la copia se queda atrás a la primera.
 */
export async function guardarObraMusical(proyectoId: string, d: DatosObra) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!proyectoId) return { error: "Falta el proyecto." };

  const titulo = texto(d.titulo, "titulo");
  if (!titulo) return { error: "Ponle un título, aunque sea provisional." };

  /* ── EL VOCABULARIO, COMPROBADO AQUÍ ──
     El `check` de la base los rechazaría igual, pero con un mensaje sobre una
     constraint que quien escribe no ha visto nunca. Mismo criterio que
     `NIVELES_OK` en el guion. */
  if (!esOrigen(d.origen)) return { error: "Elige de dónde sale esa música." };
  const origen = String(d.origen).toLowerCase() as Origen;

  const plan = (d.planIa || "").trim().toLowerCase();
  if (plan && !esPlan(plan)) return { error: "Ese plan no está en la lista." };
  /* El plan solo tiene sentido en la música generada. Si el origen cambió de
     `ia_generada` a otro y el campo se quedó puesto, la fila diría que un
     huayno tradicional se hizo con el plan Pro. Se limpia aquí y no en la
     pantalla: la acción es lo único por lo que pasan todos los caminos. */
  const planFinal = origen === "ia_generada" ? (plan || null) : null;

  const { url: pruebaUrl, error: eUrl } = urlLimpia(d.pruebaUrl);
  if (eUrl) return { error: eUrl };

  const { f: consultadoEn, error: eC } = fechaLimpia(d.consultadoEn, "Consultado el");
  if (eC) return { error: eC };
  const { f: vigenteHasta, error: eV } = fechaLimpia(d.vigenteHasta, "Vale hasta");
  if (eV) return { error: eV };

  /* ── LA PERSONA TIENE QUE ESTAR EN EL REPARTO DE ESTE PROYECTO ──
     No basta con que exista: el id llega del navegador y sin esto se podría
     atar la música a alguien de otra película. Un `check` no puede consultar
     otra tabla, así que se valida aquí, con palabras.
     Y solo en los orígenes que tienen a alguien detrás: si el origen cambió de
     `preexistente_cedida` a `ia_generada` y el campo se quedó puesto, la fila
     diría que un tema de Suno lo aporta Jennifer. Se limpia aquí, igual que el
     plan — la acción es lo único por lo que pasan todos los caminos. */
  const personaId = llevaPersona(origen) ? ((d.personaId || "").trim() || null) : null;
  if (personaId) {
    const { data: enReparto } = await supabase.from("proyecto_actores")
      .select("id").eq("proyecto_id", proyectoId).eq("persona_id", personaId).limit(1);
    if (!enReparto?.length)
      return { error: "Esa persona no está en el reparto de este proyecto. Añádela primero." };
  }

  /* ── Y EL PERMISO TIENE QUE SER DE ESA PERSONA Y DE ESTE PROYECTO ──
     Es el puente entre las dos tablas y el único sitio donde se puede
     comprobar. Sin esto, la obra podría apuntar al permiso de otra persona y
     las dos pantallas dirían cosas distintas sobre el mismo papel — que es
     justamente lo que atarlas venía a evitar. */
  const autorizacionId = llevaPersona(origen) ? ((d.autorizacionId || "").trim() || null) : null;
  if (autorizacionId) {
    if (!personaId) return { error: "Para atar un permiso hay que decir de quién es la obra." };
    /* ⚠ De `autorizacion`, no de la `proyecto_cesion` obsoleta. */
    const { data: ces } = await supabase.from("autorizacion")
      .select("id,proyecto_id,otorgante_persona_id,objeto_persona_id,tipo")
      .eq("id", autorizacionId).maybeSingle();
    if (!ces) return { error: "Ese permiso ya no existe." };
    if (ces.proyecto_id !== proyectoId) return { error: "Ese permiso no es de este proyecto." };
    if (ces.otorgante_persona_id !== personaId && ces.objeto_persona_id !== personaId)
      return { error: "Ese permiso es de otra persona." };
    /* ⚠ Y tiene que ser DE INTERPRETACIÓN. El de imagen, voz y testimonio
       autoriza que se le grabe y que hable, no que su tema suene: son dos
       papeles distintos y ese es el motivo entero de que existan los dos. Sin
       esta comprobación, atar el de imagen dejaba la obra en verde diciendo que
       la música está autorizada. */
    if (!["interpretacion_musical", "interpretacion_danza"].includes(String(ces.tipo || "")))
      return { error: "Ese permiso es de imagen, voz y testimonio, no de interpretación: autoriza que se le grabe y que hable, no que suene su tema." };
  }

  const fila = {
    proyecto_id: proyectoId,
    titulo,
    origen,
    persona_id: personaId,
    autorizacion_id: autorizacionId,
    autor: texto(d.autor, "autor"),
    iswc: texto(d.iswc, "iswc"),
    consultado_en: consultadoEn,
    consultado_nota: texto(d.consultadoNota, "consultado_nota"),
    prueba_url: pruebaUrl,
    vigente_hasta: vigenteHasta,
    herramienta: texto(d.herramienta, "herramienta"),
    plan_ia: planFinal,
    prompt: texto(d.prompt, "prompt"),
    aporte_humano: texto(d.aporteHumano, "aporte_humano"),
    resuelto_como: texto(d.resueltoComo, "resuelto_como"),
    donde: texto(d.donde, "donde"),
    nota: texto(d.nota, "nota"),
  };

  /* ⚠ SIN la alternativa `proyecto_obra`: matcheaba también «new row for
     relation "proyecto_obra" violates check constraint», y entonces la pantalla
     mandaba a correr una migración que ya estaba puesta. Las tres que quedan
     son las que de verdad significan «falta la tabla». */
  /* ⚠ Y CUÁL falta, que no es siempre la misma. Si el error habla de
     `autorizacion_id`, la que falta es la que crea esa columna —
     db/clearance-obra-cesion.sql—, no la que creó la tabla. Mandar a correr la
     de siempre es el mismo fallo que el párrafo de arriba presume de haber
     arreglado, cometido por el otro lado: un mensaje que manda a mirar donde no
     es se deja de leer igual que uno que no se puede apagar. */
  const faltaSql = (m: string) =>
    /schema cache|does not exist|PGRST20[45]/i.test(m)
      ? `${m} — falta correr ${/autorizacion_id/i.test(m)
          ? "db/clearance-obra-cesion.sql" : "db/proyecto-obra.sql"} en Supabase.`
      : m;

  if (d.id) {
    /* ── LISTA BLANCA EN EL UPDATE ──
       `proyecto_id` no se manda: cambiarlo movería la obra a otra película
       saltándose todas las comprobaciones de arriba, que hablan del proyecto
       que llegó por parámetro. Misma guarda que en los permisos. */
    const { proyecto_id: _p, ...editable } = fila;
    const { data, error } = await supabase.from("proyecto_obra")
      .update(editable).eq("id", d.id).eq("proyecto_id", proyectoId).select("id");
    if (error) return { error: faltaSql(error.message) };
    /* ⚠ Un UPDATE bloqueado por RLS NO da error: devuelve cero filas. Sin esta
       comprobación la pantalla diría «guardado» sobre algo que no se guardó. */
    if (!data?.length) return { error: "No se guardó: no tienes permiso, o esa obra ya no está aquí." };

    await supabase.from("actividad").insert({
      entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
      detalle: { mensaje: `editó la obra musical «${titulo}» (${META_ORIGEN[origen].corto})` },
    });
    revalidarObras();
    return { id: d.id };
  }

  const { data, error } = await supabase.from("proyecto_obra")
    .insert({ ...fila, creado_por: user.id }).select("id").single();
  if (error) return { error: faltaSql(error.message) };

  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `registró la obra musical «${titulo}» (${META_ORIGEN[origen].corto})` },
  });
  revalidarObras();
  return { id: data.id as string };
}

/**
 * Quitar una obra. Sin doble paso de confirmación: la pantalla ya pregunta en
 * línea, como en las cesiones, y un pop-up para una fila de una lista es más
 * ceremonia que la que merece. Se lee antes de borrar para poder nombrarla en
 * la bitácora: después ya no se sabe qué se quitó.
 */
export async function quitarObraMusical(id: string, proyectoId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!id || !proyectoId) return { error: "Falta la obra o el proyecto." };

  const { data: o } = await supabase.from("proyecto_obra")
    .select("titulo,origen").eq("id", id).eq("proyecto_id", proyectoId).maybeSingle();
  if (!o) return { error: "Esa obra ya no está en este proyecto." };

  const { data, error } = await supabase.from("proyecto_obra")
    .delete().eq("id", id).eq("proyecto_id", proyectoId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };

  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `quitó la obra musical «${o.titulo}»` },
  });
  revalidarObras();
  return {};
}
