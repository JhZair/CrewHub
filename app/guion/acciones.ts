"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ACTOS_BASE, plantillaDe, PLANTILLAS } from "@/lib/guion";
import { techo } from "@/lib/api";

/* LAS ACCIONES DEL GUION.
 *
 * Viven en su propio archivo y no en app/actions.ts —que ya pasa de cuatro
 * mil líneas— porque son un módulo entero con su propio vocabulario.
 *
 * Regla que atraviesa todo esto: NADA borra texto escrito. Un tratamiento
 * es horas de trabajo que no están en ninguna otra parte; cualquier acción
 * que pudiera perderlo o lo impide, o mueve en vez de borrar.
 */

/* ── QUÉ SE REVALIDA ──
 * La página del guion es la del TRATAMIENTO. Pero la lista de tratamientos —con
 * su recuento de secuencias— se pinta en la ficha del proyecto y en la pestaña
 * Audiovisual del fondo, y esas dos no saben el id del tratamiento.
 *
 * ⚠ Se revalida el PATRÓN de ruta, no una instancia. La alternativa era
 * consultar a qué proyecto pertenece el tratamiento en cada acción, y eso es un
 * viaje a la base por cada pulsación — incluidas las que dispara el autoguardado
 * cada 800 ms. `revalidatePath` con `"page"` sobre una ruta dinámica invalida
 * la caché de todas sus instancias: no recalcula nada, solo marca para
 * recalcular a quien entre después. El precio es que la ficha de otro proyecto
 * se rehaga la próxima vez que alguien la abra; el precio de la otra opción era
 * un viaje por tecla. */
const revalidar = (tratamientoId: string) => {
  revalidatePath(`/guion/${tratamientoId}`);
  revalidatePath("/guion");
  /* ⚠ `/entidad/[tipo]/[id]`, que es la ruta del ARCHIVO. Con
     «/entidad/proyecto/[id]» Next construye un tag que no coincide con
     ninguna ruta existente: no da error, simplemente no revalida nada. */
  revalidatePath("/entidad/[tipo]/[id]", "page");
  revalidatePath("/fondo/[id]/audiovisual", "page");
};

/** A qué proyecto pertenece un tratamiento. Solo lo llaman las acciones que
 *  ANOTAN EN EL HISTORIAL —la actividad cuelga del proyecto, no del documento—
 *  y esas son puntuales: elegir plantilla, borrar una secuencia. Nunca el
 *  autoguardado. */
async function proyectoDe(supabase: any, tratamientoId: string): Promise<string | null> {
  const { data } = await supabase.from("tratamiento")
    .select("proyecto_id").eq("id", tratamientoId).maybeSingle();
  return data?.proyecto_id || null;
}

async function sesion() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Siguiente hueco de orden, para no depender de `creado_en` —dos filas
 *  creadas en el mismo milisegundo se ordenarían al azar y el guion
 *  cambiaría de orden solo. */
async function proximoOrden(supabase: any, tabla: string, tratamientoId: string) {
  const { data } = await supabase.from(tabla)
    .select("orden").eq("tratamiento_id", tratamientoId)
    .order("orden", { ascending: false }).limit(1);
  return ((data?.[0]?.orden ?? -1) as number) + 1;
}

/* ══════════ PLANTILLA ══════════ */

/** Elegir la plantilla del proyecto. Si además no hay ni un acto, siembra
 *  los suyos: empezar con la pantalla en blanco es empezar dos veces. */
export async function elegirPlantilla(tratamientoId: string, clave: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const p = plantillaDe(clave);

  /* La plantilla vive en el TRATAMIENTO, no en el proyecto: dos documentos de
     la misma película pueden usar modelos estructurales distintos —es justo lo
     que se hace al reestructurar— y con la columna en `proyectos`, cambiarla en
     uno la cambiaba en todos. */
  const { data: ok, error } = await supabase.from("tratamiento")
    .update({ plantilla: p.clave, editado_en: new Date().toISOString() })
    .eq("id", tratamientoId).select("id,proyecto_id");
  if (error) return { error: error.message };
  if (!ok?.length) return { error: "Ese tratamiento ya no existe." };
  const proyectoId = ok[0].proyecto_id as string;

  /* Los actos, solo si está vacío. Sembrar sobre una estructura ya escrita
     duplicaría los actos —y el guion quedaría con dos «Planteamiento» sin
     que nadie hubiera pedido uno—. */
  const { count } = await supabase.from("guion_actos")
    .select("id", { count: "exact", head: true }).eq("tratamiento_id", tratamientoId);
  let sembrados = 0;
  if (!count) {
    const base = ACTOS_BASE[p.clave] || ACTOS_BASE["tres-actos"];
    const { error: e2 } = await supabase.from("guion_actos").insert(
      base.map((a, i) => ({ tratamiento_id: tratamientoId, clave: a.clave, nombre: a.nombre, orden: i })));
    if (e2) return { error: `Se guardó la plantilla, pero los actos no: ${e2.message}` };
    sembrados = base.length;
  }
  /* Y la espina. Elegir un modelo estructural y no recibir sus puntos de
     giro es quedarse con el nombre del modelo: lo que guía es saber dónde
     va el detonante, no que la plantilla se llame «Save the Cat». */
  const esp: any = await sembrarBeats(tratamientoId, p.clave);
  /* ⚠ El error de la espina NO se traga. Sin esto, `sembrarBeats` podía
     fallar entero —y con `proyecto_id not null` fallaba SIEMPRE— y la acción
     devolvía éxito con «0 puntos de estructura»: elegir un modelo y no recibir
     sus puntos de giro es quedarse con el nombre del modelo, y encima sin
     saber por qué. */
  if (esp?.error) return { error: `Se guardó la plantilla, pero la espina no: ${esp.error}` };

  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `eligió la plantilla narrativa «${p.nombre}»`
      + (sembrados ? ` · ${sembrados} actos` : "")
      + (esp?.nuevos ? ` · ${esp.nuevos} puntos de estructura` : "") },
  });
  revalidar(tratamientoId);
  return { sembrados, beats: esp?.nuevos || 0 };
}

/* ══════════ LA ESPINA — puntos de giro y de inflexión ══════════ */

/** Baja al proyecto los beats de una plantilla.
 *
 *  AÑADE, nunca reemplaza. Los que ya están (misma `clave`) se dejan
 *  intactos: pueden llevar dentro la nota de qué pasa ahí en ESTA
 *  historia, y eso es trabajo del autor, no de la plantilla. Cambiar de
 *  modelo estructural no puede costar lo escrito —es justo lo que hace
 *  que nadie se atreva a probar otro—.
 *
 *  Los actos se emparejan por posición: el beat que el catálogo pone en el
 *  acto 1 va al segundo acto del proyecto, se llame como se llame. Si el
 *  proyecto tiene menos actos, cae en el último. */
export async function sembrarBeats(tratamientoId: string, clave: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const p = plantillaDe(clave);

  const [{ data: actos }, { data: hay }] = await Promise.all([
    supabase.from("guion_actos").select("id,orden").eq("tratamiento_id", tratamientoId).order("orden"),
    supabase.from("guion_beats").select("clave,orden").eq("tratamiento_id", tratamientoId),
  ]);
  const yaEstan = new Set((hay || []).map((b: any) => b.clave).filter(Boolean));
  const desde = Math.max(-1, ...((hay || []).map((b: any) => b.orden ?? 0))) + 1;

  const slug = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const filas = p.beats
    .map((b, i) => ({ b, i, clave: `${p.clave}:${slug(b.n)}` }))
    .filter(x => !yaEstan.has(x.clave))
    .map((x, k) => ({
      tratamiento_id: tratamientoId, clave: x.clave, nombre: x.b.n, que: x.b.que,
      tipo: x.b.tipo, pos: x.b.pos,
      acto_id: (actos || [])[Math.min(x.b.acto, ((actos || []).length || 1) - 1)]?.id || null,
      orden: desde + k,
    }));

  if (!filas.length) return { nuevos: 0, yaEstaban: p.beats.length };
  const { error } = await supabase.from("guion_beats").insert(filas);
  if (error) return { error: error.message };
  revalidar(tratamientoId);
  return { nuevos: filas.length, yaEstaban: p.beats.length - filas.length };
}

export async function crearBeat(tratamientoId: string, actoId: string | null, nombre: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "El punto necesita un nombre." };
  const { error } = await supabase.from("guion_beats").insert({
    tratamiento_id: tratamientoId, acto_id: actoId || null, nombre: n, tipo: "giro",
    orden: await proximoOrden(supabase, "guion_beats", tratamientoId),
  });
  if (error) return { error: error.message };
  revalidar(tratamientoId);
  return {};
}

/** Guardar un beat. Igual que el tratamiento: no revalida —la nota se
 *  autoguarda mientras se escribe— y quien refresca es el cliente. */
export async function guardarBeat(
  id: string, tratamientoId: string,
  campos: { nombre?: string; nota?: string; tipo?: string; pos?: string | number | null; secuencia_id?: string | null; acto_id?: string | null },
) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const patch: Record<string, any> = {};
  if (campos.nombre !== undefined) {
    const n = campos.nombre.trim();
    if (!n) return { error: "El punto necesita un nombre." };
    patch.nombre = n;
  }
  if (campos.nota !== undefined) patch.nota = campos.nota;   // tal cual, sin trim
  if (campos.tipo !== undefined) patch.tipo = ["giro", "inflexion", "estado"].includes(campos.tipo) ? campos.tipo : "estado";
  if (campos.acto_id !== undefined) patch.acto_id = campos.acto_id || null;
  if (campos.secuencia_id !== undefined) patch.secuencia_id = campos.secuencia_id || null;
  if (campos.pos !== undefined) {
    const v = Number(String(campos.pos ?? "").replace(",", "."));
    patch.pos = String(campos.pos ?? "").trim() === "" ? null
      : (Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);
  }
  if (!Object.keys(patch).length) return { error: "No hay nada que guardar." };

  const { data, error } = await supabase.from("guion_beats").update(patch).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no existe." };
  return { ok: true };
}

/** Quitar un beat. Con nota escrita pide confirmación diciendo qué se va:
 *  la nota es lo único de aquí que no está en ninguna otra parte. */
export async function borrarBeat(id: string, tratamientoId: string, confirmado = false) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("guion_beats")
    .select("nombre,nota").eq("id", id).maybeSingle();
  if ((prev?.nota || "").trim() && !confirmado)
    return { confirmar: true, nombre: prev?.nombre, nota: (prev!.nota as string).trim() };
  const { error } = await supabase.from("guion_beats").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidar(tratamientoId);
  return {};
}

/* ══════════ ACTOS ══════════ */

export async function crearActo(tratamientoId: string, nombre: string, clave: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "El acto necesita un nombre." };
  const { error } = await supabase.from("guion_actos").insert({
    tratamiento_id: tratamientoId, nombre: n, clave: (clave || "").trim() || null,
    orden: await proximoOrden(supabase, "guion_actos", tratamientoId),
  });
  if (error) return { error: error.message };
  revalidar(tratamientoId);
  return {};
}

export async function guardarActo(id: string, tratamientoId: string, nombre: string, clave: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "El acto necesita un nombre." };
  const { data, error } = await supabase.from("guion_actos")
    .update({ nombre: n, clave: (clave || "").trim() || null }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no existe." };
  revalidar(tratamientoId);
  return {};
}

/** Borrar un acto NO borra sus secuencias: la FK es `set null` y quedan
 *  arriba, en «sin acto». Un tratamiento escrito no se puede perder por
 *  reorganizar la estructura que lo contiene. Se dice cuántas quedaron
 *  sueltas, o nadie las buscaría. */
export async function borrarActo(id: string, tratamientoId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { count } = await supabase.from("guion_secuencias")
    .select("id", { count: "exact", head: true }).eq("acto_id", id);
  const { data, error } = await supabase.from("guion_actos").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  revalidar(tratamientoId);
  return { sueltas: count || 0 };
}

/* ══════════ SECUENCIAS ══════════ */

export async function crearSecuencia(tratamientoId: string, actoId: string | null, nombre: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = await supabase.from("guion_secuencias").insert({
    tratamiento_id: tratamientoId, acto_id: actoId || null,
    nombre: (nombre || "").trim() || "Secuencia sin título",
    orden: await proximoOrden(supabase, "guion_secuencias", tratamientoId),
  }).select("id").single();
  if (error) return { error: error.message };
  revalidar(tratamientoId);
  return { id: data.id };
}

/** Guardar el tratamiento. Se llama sola cada 800 ms mientras se escribe,
 *  así que no anota en el historial: una sesión de escritura dejaría
 *  cuarenta entradas idénticas y taparía todo lo demás. */
export async function guardarSecuencia(
  id: string, tratamientoId: string,
  campos: { nombre?: string; texto?: string; minutos?: string | number | null; acto_id?: string | null },
) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };

  const patch: Record<string, any> = { editado_en: new Date().toISOString() };
  if (campos.nombre !== undefined) {
    const n = campos.nombre.trim();
    if (!n) return { error: "La secuencia necesita un nombre." };
    patch.nombre = n;
  }
  /* El texto se guarda TAL CUAL, sin `|| null` y sin recortar: los saltos
     de línea y los espacios finales son del autor. Un `trim()` aquí le
     movería el cursor a quien está escribiendo. */
  if (campos.texto !== undefined) patch.texto = campos.texto;
  if (campos.acto_id !== undefined) patch.acto_id = campos.acto_id || null;
  if (campos.minutos !== undefined) {
    const m = Number(String(campos.minutos ?? "").replace(",", "."));
    /* Vacío = «que lo estime». Cero = «esto no dura nada», que no es lo
       mismo y hay que poder decirlo. */
    patch.minutos = String(campos.minutos ?? "").trim() === "" ? null
      : (Number.isFinite(m) && m >= 0 ? m : null);
  }

  const { data, error } = await supabase.from("guion_secuencias")
    .update(patch).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no existe." };
  /* ⚠ NO se revalida aquí, y es a propósito. `revalidatePath` devuelve el
     árbol RSC nuevo y el router vuelve a renderizar la página: llamándolo
     desde un autoguardado que dispara cada 800 ms, el textarea se refresca
     en mitad de la frase. Quien refresca es el cliente, al soltar el campo.
     Los totales de arriba se ponen al día entonces. */
  return { ok: true };
}

/** Mover una secuencia dentro de SU acto.
 *
 *  Dos cosas que parecían detalles y no lo son:
 *
 *  · Se mueve entre HERMANAS, no en la lista global. Los botones ↑↓ están
 *    dentro de un acto, así que intercambiar con la última del acto
 *    anterior no mueve nada a la vista: solo cambia la numeración, y el
 *    usuario pulsa otra vez creyendo que no funcionó.
 *
 *  · Renumera el grupo entero en vez de intercambiar dos filas. El
 *    intercambio parecía más barato —dos escrituras en vez de N— hasta que
 *    dos secuencias comparten `orden` (el `default 0`, o dos creaciones a
 *    la vez que leen el mismo máximo): entonces intercambiar escribe los
 *    mismos dos números y el botón no hace nada, para siempre y sin decirlo.
 *    Renumerar arregla el empate al pasar. N son ocho o treinta filas.
 */
export async function moverSecuencia(id: string, tratamientoId: string, dir: -1 | 1) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: mia, error: e0 } = await supabase.from("guion_secuencias")
    .select("acto_id").eq("id", id).maybeSingle();
  if (e0) return { error: e0.message };
  if (!mia) return { error: "Esa secuencia ya no está." };

  let q = supabase.from("guion_secuencias").select("id,orden,creado_en")
    .eq("tratamiento_id", tratamientoId);
  q = mia.acto_id ? q.eq("acto_id", mia.acto_id) : q.is("acto_id", null);
  /* `creado_en` como desempate: con `orden` empatado, el orden que devuelve
     Postgres no está definido, y la lista cambiaría sola entre recargas. */
  const { data: grupo, error } = await q.order("orden").order("creado_en");
  if (error) return { error: error.message };

  const lista = [...(grupo || [])];
  const i = lista.findIndex((s: any) => s.id === id);
  const j = i + dir;
  if (i < 0) return { error: "Esa secuencia ya no está." };
  if (j < 0 || j >= lista.length) return { error: "Ya está en el extremo de su acto." };
  const [x] = lista.splice(i, 1);
  lista.splice(j, 0, x);

  /* Se comprueba CADA escritura. Sin esto, si una falla el guion queda con
     el orden a medias y la pantalla dice que todo fue bien. */
  for (let k = 0; k < lista.length; k++) {
    const f: any = lista[k];
    if (f.orden === k) continue;
    const { error: eK } = await supabase.from("guion_secuencias")
      .update({ orden: k }).eq("id", f.id);
    if (eK) return { error: `El orden quedó a medias: ${eK.message}` };
  }
  revalidar(tratamientoId);
  return {};
}

/** Borrar una secuencia. Con tratamiento escrito PIDE confirmación con el
 *  número de palabras: «¿borrar?» a secas no dice que se van 620 palabras
 *  que no están en ninguna otra parte. */
export async function borrarSecuencia(id: string, tratamientoId: string, confirmado = false) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("guion_secuencias")
    .select("nombre,texto").eq("id", id).maybeSingle();
  const pal = (prev?.texto || "").trim() ? (prev!.texto as string).trim().split(/\s+/).length : 0;
  if (pal > 0 && !confirmado) return { confirmar: true, palabras: pal, nombre: prev?.nombre };

  const { data, error } = await supabase.from("guion_secuencias").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  /* La actividad cuelga del PROYECTO —es donde se lee la historia de la
     película—, así que aquí sí se paga la consulta. Es una acción puntual. */
  const proyectoId = await proyectoDe(supabase, tratamientoId);
  if (proyectoId) await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `borró la secuencia «${prev?.nombre || "sin título"}»${pal ? ` (${pal} palabras de tratamiento)` : ""}` },
  });
  revalidar(tratamientoId);
  return {};
}

/* ══════════ HILOS DE TRAMA ══════════ */

export async function crearHilo(tratamientoId: string, nombre: string, color: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "El hilo necesita un nombre." };
  const { error } = await supabase.from("guion_hilos").insert({
    tratamiento_id: tratamientoId, nombre: n, color: color || "#a78bfa",
    orden: await proximoOrden(supabase, "guion_hilos", tratamientoId),
  });
  if (error) return { error: error.message };
  revalidar(tratamientoId);
  return {};
}

export async function guardarHilo(id: string, tratamientoId: string, nombre: string, color: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "El hilo necesita un nombre." };
  const { data, error } = await supabase.from("guion_hilos")
    .update({ nombre: n, color: color || "#a78bfa" }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
  revalidar(tratamientoId);
  return {};
}

export async function borrarHilo(id: string, tratamientoId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("guion_hilos").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidar(tratamientoId);
  return {};
}

/** Marcar o desmarcar un hilo en una secuencia. */
export async function marcarHilo(secuenciaId: string, hiloId: string, tratamientoId: string, poner: boolean) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = poner
    ? await supabase.from("guion_secuencia_hilos")
        .upsert({ secuencia_id: secuenciaId, hilo_id: hiloId }, { onConflict: "secuencia_id,hilo_id" })
    : await supabase.from("guion_secuencia_hilos")
        .delete().eq("secuencia_id", secuenciaId).eq("hilo_id", hiloId);
  if (error) return { error: error.message };
  revalidar(tratamientoId);
  return {};
}

/* ══════════════════════════════════════════════════════════════════════════
   EL TRATAMIENTO — la cabecera del documento

   Una película no tiene UN guion: tiene una sucesión de documentos. El que se
   presentó al concurso, el reescrito con las notas del jurado, el que se usa
   para rodar. Razonado en db/tratamiento.sql.
   ══════════════════════════════════════════════════════════════════════════ */

const revalidarTrat = (proyectoId: string, tratamientoId?: string) => {
  /* El índice también. Crear o borrar desde la ficha del proyecto y navegar a
     `/guion` con `<Link>` sirve el Router Cache del cliente —treinta segundos
     en Next 14.2 para rutas dinámicas— y la lista sale desactualizada. */
  revalidatePath("/guion");
  revalidatePath(`/entidad/proyecto/${proyectoId}`);
  revalidatePath("/entidad/[tipo]/[id]", "page");
  revalidatePath("/fondo/[id]/audiovisual", "page");
  if (tratamientoId) revalidatePath(`/guion/${tratamientoId}`);
};

/** ⚠ Solo http(s). Sin esto, un `javascript:` pegado en el campo se pinta como
 *  `<a href>` clicable en dos pantallas. El campo lo escribe el equipo, así que
 *  el riesgo es bajo — y la guarda cuesta una línea. */
function urlLimpia(v?: string | null): { url: string | null; error?: string } {
  const u = (v || "").trim();
  if (!u) return { url: null };
  if (!/^https?:\/\//i.test(u)) return { url: null, error: "El enlace tiene que empezar por http:// o https://" };
  return { url: u };
}

const NIVELES_OK = ["sinopsis", "secuenciado", "guion"];
const ESTADOS_OK = ["borrador", "presentado", "descartado"];

export async function crearTratamiento(
  proyectoId: string,
  d: { nombre?: string; version?: string; nivel?: string; url?: string;
       postulacionId?: string | null; nota?: string },
) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!proyectoId) return { error: "Falta el proyecto." };

  /* ⚠ Que el fondo marcado sea EL de este proyecto no lo puede comprobar un
     `check` —en Postgres un check no consulta otra tabla— así que se valida
     aquí. Sin esto, un tratamiento de ROBOTRASH podría aparecer en la pestaña
     Audiovisual de KAWSAY WARMI. */
  const post = (d.postulacionId || "").trim() || null;
  if (post) {
    const { data: p } = await supabase.from("postulaciones")
      .select("proyecto_id").eq("id", post).maybeSingle();
    if (!p) return { error: "Ese fondo ya no existe." };
    if (p.proyecto_id !== proyectoId) return { error: "Ese fondo no es de este proyecto." };
  }

  const nivel = NIVELES_OK.includes(String(d.nivel || "").toLowerCase())
    ? String(d.nivel).toLowerCase() : "secuenciado";
  const { url, error: eUrl } = urlLimpia(d.url);
  if (eUrl) return { error: eUrl };

  /* El primero de una película nace VIGENTE: si es el único, es el que manda,
     y obligar a marcarlo a mano dejaría a la película sin documento vigente
     hasta que alguien se acordara. Los siguientes, no: cambiar cuál manda es
     una decisión, no un efecto secundario de crear un borrador. */
  const { count } = await supabase.from("tratamiento")
    .select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId);

  const { data, error } = await supabase.from("tratamiento").insert({
    proyecto_id: proyectoId,
    postulacion_id: post,
    nombre: (d.nombre || "").trim() || "Tratamiento",
    version: (d.version || "").trim() || null,
    nivel,
    url,
    nota: (d.nota || "").trim() || null,
    vigente: !count,
    creado_por: user.id,
  }).select("id").single();
  if (error) {
    return { error: /schema cache|does not exist|PGRST20[45]/i.test(error.message)
      ? `${error.message} — falta correr db/tratamiento.sql en Supabase.`
      : error.message };
  }

  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `creó el tratamiento «${(d.nombre || "Tratamiento").trim()}»`
      + ((d.version || "").trim() ? ` · ${(d.version || "").trim()}` : "")
      + ((d.url || "").trim() ? " (enlazado, vive fuera)" : "") },
  });
  revalidarTrat(proyectoId, data.id);
  return { id: data.id as string };
}

const CAMPOS_TRAT = [
  "nombre", "version", "nivel", "estado", "presentado_en", "url", "nota", "postulacion_id",
] as const;

export async function editarTratamiento(
  id: string, proyectoId: string, campos: Record<string, any>,
) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!id || !proyectoId) return { error: "Falta el tratamiento o el proyecto." };

  const patch: Record<string, any> = {};
  for (const k of CAMPOS_TRAT) {
    if (!(k in campos)) continue;
    const v = campos[k];
    patch[k] = typeof v === "string" ? (v.trim() || null) : (v ?? null);
  }
  /* Vocabularios cerrados, normalizados aquí y no confiando en el formulario:
     el CHECK de la base los rechazaría, pero con un mensaje sobre una
     constraint que quien escribe no ha visto nunca. */
  if ("nivel" in patch) {
    patch.nivel = NIVELES_OK.includes(String(patch.nivel || "").toLowerCase())
      ? String(patch.nivel).toLowerCase() : "secuenciado";
  }
  if ("estado" in patch) {
    patch.estado = ESTADOS_OK.includes(String(patch.estado || "").toLowerCase())
      ? String(patch.estado).toLowerCase() : "borrador";
  }
  /* El fondo, otra vez contra el proyecto: es la única guarda que hay. */
  if ("postulacion_id" in patch && patch.postulacion_id) {
    const { data: p } = await supabase.from("postulaciones")
      .select("proyecto_id").eq("id", patch.postulacion_id).maybeSingle();
    if (!p) return { error: "Ese fondo ya no existe." };
    if (p.proyecto_id !== proyectoId) return { error: "Ese fondo no es de este proyecto." };
  }
  if ("url" in patch) {
    const { url, error } = urlLimpia(patch.url);
    if (error) return { error };
    patch.url = url;
  }
  /* ⚠ DESCARTAR APAGA EL VIGENTE. Nada en la base lo impedía —el índice único
     es parcial sobre `vigente` y no mira el estado— así que un documento podía
     quedar `vigente = true` y `estado = 'descartado'` a la vez. El diagnóstico
     lo deja fuera (se hace sobre los vivos) y dice «sin vigente», mientras la
     fila de al lado sigue luciendo su insignia «vigente»: dos afirmaciones
     contrarias en la misma pantalla. Se corrige el dato, que es donde nace. */
  if (patch.estado === "descartado") patch.vigente = false;
  if (!Object.keys(patch).length) return { error: "No hay nada que guardar." };
  patch.editado_en = new Date().toISOString();

  /* `.eq("proyecto_id")` además del id: sin él, un id de otro proyecto se
     editaría desde aquí. RLS deja escribir todo al equipo. */
  const { data, error } = await supabase.from("tratamiento")
    .update(patch).eq("id", id).eq("proyecto_id", proyectoId).select("id,nombre");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no existe." };

  revalidarTrat(proyectoId, id);
  return {};
}

/** Cuál manda hoy. Dos pasos y no un upsert: el índice único es PARCIAL
 *  (`where vigente`) y PostgREST no acepta índices parciales en `on conflict`
 *  —da 42P10, la lección de `postulacion_reparto_persona_unica`—.
 *  ⚠ Y APAGAR VA PRIMERO. Al revés, el `update` que enciende chocaría con el
 *  vigente que todavía está encendido y fallaría por el índice único: el
 *  botón no haría nada y el mensaje hablaría de una constraint. */
export async function marcarVigente(id: string, proyectoId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!id || !proyectoId) return { error: "Falta el tratamiento o el proyecto." };

  const { error: e1 } = await supabase.from("tratamiento")
    .update({ vigente: false }).eq("proyecto_id", proyectoId).eq("vigente", true).neq("id", id);
  if (e1) return { error: e1.message };

  /* ⚠ Poner como vigente uno DESCARTADO lo reabre. Es la misma decisión dicha
     de otra manera —«este es el que vale»— y dejarlo descartado y vigente a la
     vez es el estado contradictorio que se cierra en `editarTratamiento`: el
     diagnóstico lo daría por muerto y la fila luciría su insignia «vigente».
     Una lectura previa para saberlo; es una acción puntual, no un
     autoguardado. */
  const { data: antes } = await supabase.from("tratamiento")
    .select("estado").eq("id", id).eq("proyecto_id", proyectoId).maybeSingle();
  const patch: Record<string, any> = { vigente: true };
  if (antes?.estado === "descartado") patch.estado = "borrador";

  const { data, error } = await supabase.from("tratamiento")
    .update(patch).eq("id", id).eq("proyecto_id", proyectoId).select("id,nombre,version");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Ese tratamiento ya no está en este proyecto." };

  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `puso como vigente el tratamiento «${data[0].nombre}»`
      + (data[0].version ? ` · ${data[0].version}` : "")
      + (antes?.estado === "descartado" ? " (estaba descartado; vuelve a borrador)" : "") },
  });
  revalidarTrat(proyectoId, id);
  return {};
}

/* ── DUPLICAR ──
 *
 * El gesto de reescribir: se copia el documento entero y se trabaja sobre la
 * copia, dejando intacto el que se presentó. Sin esto, «hacer la versión 2»
 * significa editar la 1 encima, y entonces nadie puede volver a leer lo que
 * vio el jurado.
 *
 * ⚠ SE COPIA TODO Y EN ORDEN: actos → secuencias → hilos → beats → marcas. Los
 * tres últimos apuntan a los dos primeros, así que hacen falta los mapas de
 * viejo→nuevo. Copiar los beats sin remapear `acto_id` los dejaría colgando de
 * los actos del ORIGINAL: editar la copia movería la estructura del documento
 * presentado, y sin ningún aviso.
 *
 * ⚠ EL EMPAREJADO VA POR UN ORDEN REINDEXADO, NO POR NOMBRE. La primera
 * versión buscaba la fila nueva por `orden` + `nombre`, y eso COLISIONA: el
 * nombre por defecto de una secuencia es «Secuencia sin título» y `orden` tiene
 * `default 0`, así que dos secuencias podían mapear al MISMO id nuevo. Lo que
 * salía de ahí no era un error sino una copia corrupta en silencio —beats
 * apuntando a la secuencia equivocada— y, peor, dos marcas de hilo colapsadas
 * en el mismo par violando la clave primaria de `guion_secuencia_hilos`, con la
 * copia ya escrita a medias y sin vuelta atrás.
 * Reindexar a 0..n-1 antes de insertar da una clave única de verdad. El orden
 * relativo se conserva —las filas vienen ya ordenadas— y de paso la copia
 * arranca sin los empates de `orden` que arrastrara el original.
 *
 * ⚠ La copia NO nace vigente. Duplicar es empezar a trabajar, no publicar.
 */
export async function duplicarTratamiento(id: string, proyectoId: string, nombre?: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!id || !proyectoId) return { error: "Falta el tratamiento o el proyecto." };

  const { data: orig, error: eO } = await supabase.from("tratamiento")
    .select("*").eq("id", id).eq("proyecto_id", proyectoId).maybeSingle();
  if (eO) return { error: eO.message };
  if (!orig) return { error: "Ese tratamiento ya no está en este proyecto." };

  const { data: nuevo, error: eN } = await supabase.from("tratamiento").insert({
    proyecto_id: proyectoId,
    /* El fondo NO se copia: la copia es un documento nuevo y todavía no se ha
       presentado a nadie. Heredar la marca haría que la pestaña Audiovisual de
       PO-001 enseñara dos «el que vio el jurado». */
    postulacion_id: null,
    nombre: (nombre || "").trim() || `${orig.nombre} (copia)`,
    version: null,
    nivel: orig.nivel,
    estado: "borrador",
    plantilla: orig.plantilla,
    url: null,
    nota: `Copia de «${orig.nombre}${orig.version ? ` · ${orig.version}` : ""}».`,
    vigente: false,
    creado_por: user.id,
  }).select("id").single();
  if (eN) return { error: eN.message };
  const nid = nuevo.id as string;

  /* ── 1. ACTOS ── */
  const { data: actos } = await supabase.from("guion_actos")
    .select("id,clave,nombre,orden").eq("tratamiento_id", id).order("orden");
  const mapaActo = new Map<string, string>();
  if (actos?.length) {
    const { data: nuevosActos, error } = await supabase.from("guion_actos").insert(
      actos.map((a: any, i: number) => ({ tratamiento_id: nid, clave: a.clave, nombre: a.nombre, orden: i })),
    ).select("id,orden");
    if (error) return { error: `Se creó la copia, pero los actos no: ${error.message}` };
    /* Se emparejan por el índice reindexado, y se comprueba el RECUENTO: si
       volvieran menos filas de las mandadas, el mapa quedaría incompleto, los
       hijos caerían con `acto_id: null` y la acción diría que todo fue bien. */
    if ((nuevosActos || []).length !== actos.length) {
      return { error: `La copia de los actos quedó a medias (${(nuevosActos || []).length} de ${actos.length}). Borra la copia y vuelve a intentarlo.` };
    }
    for (let i = 0; i < actos.length; i++) {
      const n = (nuevosActos || []).find((x: any) => x.orden === i);
      if (n) mapaActo.set((actos as any[])[i].id, n.id);
    }
  }

  /* ── 2. SECUENCIAS — aquí va el texto, que es lo que de verdad se copia ── */
  const { data: secs } = await supabase.from("guion_secuencias")
    .select("id,acto_id,nombre,texto,minutos,orden").eq("tratamiento_id", id).order("orden");
  const mapaSec = new Map<string, string>();
  if (secs?.length) {
    const { data: nuevasSecs, error } = await supabase.from("guion_secuencias").insert(
      secs.map((s: any, i: number) => ({
        tratamiento_id: nid,
        acto_id: s.acto_id ? (mapaActo.get(s.acto_id) || null) : null,
        nombre: s.nombre, texto: s.texto, minutos: s.minutos, orden: i,
      })),
    ).select("id,orden");
    if (error) return { error: `Se creó la copia, pero el tratamiento no: ${error.message}` };
    if ((nuevasSecs || []).length !== secs.length) {
      return { error: `La copia del tratamiento quedó a medias (${(nuevasSecs || []).length} de ${secs.length} secuencias). Borra la copia y vuelve a intentarlo.` };
    }
    for (let i = 0; i < secs.length; i++) {
      const n = (nuevasSecs || []).find((x: any) => x.orden === i);
      if (n) mapaSec.set((secs as any[])[i].id, n.id);
    }
  }

  /* ── 3. HILOS ── */
  const { data: hilos } = await supabase.from("guion_hilos")
    .select("id,nombre,color,orden").eq("tratamiento_id", id).order("orden");
  const mapaHilo = new Map<string, string>();
  if (hilos?.length) {
    const { data: nuevosHilos, error } = await supabase.from("guion_hilos").insert(
      hilos.map((h: any, i: number) => ({ tratamiento_id: nid, nombre: h.nombre, color: h.color, orden: i })),
    ).select("id,orden");
    if (error) return { error: `Se creó la copia, pero los hilos no: ${error.message}` };
    if ((nuevosHilos || []).length !== hilos.length) {
      return { error: `La copia de los hilos quedó a medias (${(nuevosHilos || []).length} de ${hilos.length}). Borra la copia y vuelve a intentarlo.` };
    }
    for (let i = 0; i < hilos.length; i++) {
      const n = (nuevosHilos || []).find((x: any) => x.orden === i);
      if (n) mapaHilo.set((hilos as any[])[i].id, n.id);
    }
  }

  /* ── 4. BEATS — con su nota, que es la historia de ESTA película ── */
  const { data: beats } = await supabase.from("guion_beats")
    .select("clave,nombre,que,tipo,pos,nota,acto_id,secuencia_id,orden")
    .eq("tratamiento_id", id).order("orden");
  if (beats?.length) {
    const { error } = await supabase.from("guion_beats").insert(
      beats.map((b: any) => ({
        tratamiento_id: nid, clave: b.clave, nombre: b.nombre, que: b.que,
        tipo: b.tipo, pos: b.pos, nota: b.nota, orden: b.orden,
        acto_id: b.acto_id ? (mapaActo.get(b.acto_id) || null) : null,
        secuencia_id: b.secuencia_id ? (mapaSec.get(b.secuencia_id) || null) : null,
      })),
    );
    if (error) return { error: `Se creó la copia, pero la espina no: ${error.message}` };
  }

  /* ── 5. QUÉ HILOS TOCA CADA SECUENCIA ── */
  const idsSec = [...mapaSec.keys()];
  if (idsSec.length && mapaHilo.size) {
    /* `.limit(techo())` explícito: sin él PostgREST recorta en mil filas SIN
       AVISAR y la copia perdería marcas de hilo en silencio. */
    const { data: marcas } = await supabase.from("guion_secuencia_hilos")
      .select("secuencia_id,hilo_id").in("secuencia_id", idsSec).limit(techo(5000));
    const vistas = new Set<string>();
    const filas = (marcas || [])
      .map((m: any) => ({
        secuencia_id: mapaSec.get(m.secuencia_id),
        hilo_id: mapaHilo.get(m.hilo_id),
      }))
      .filter(f => f.secuencia_id && f.hilo_id)
      /* `guion_secuencia_hilos` tiene clave primaria (secuencia_id, hilo_id):
         un par repetido tumbaría el insert entero. No debería haberlos con el
         emparejado arreglado, pero el precio de comprobarlo es un `Set`. */
      .filter(f => {
        const k = `${f.secuencia_id}|${f.hilo_id}`;
        if (vistas.has(k)) return false;
        vistas.add(k); return true;
      });
    if (filas.length) {
      const { error } = await supabase.from("guion_secuencia_hilos").insert(filas);
      if (error) return { error: `Se creó la copia, pero las marcas de hilo no: ${error.message}` };
    }
  }

  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `duplicó el tratamiento «${orig.nombre}»`
      + ` (${secs?.length || 0} secuencias, ${beats?.length || 0} puntos de estructura)` },
  });
  revalidarTrat(proyectoId, nid);
  return { id: nid, secuencias: secs?.length || 0 };
}

/** Borrar un tratamiento ENTERO. Pide confirmación diciendo cuántas palabras
 *  se van: «¿borrar?» a secas no dice que se van 4.200 palabras que no están
 *  en ninguna otra parte. Misma regla que `borrarSecuencia`. */
export async function borrarTratamiento(id: string, proyectoId: string, confirmado = false) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  if (!id || !proyectoId) return { error: "Falta el tratamiento o el proyecto." };

  const { data: t } = await supabase.from("tratamiento")
    .select("nombre,version,vigente").eq("id", id).eq("proyecto_id", proyectoId).maybeSingle();
  if (!t) return { error: "Ese tratamiento ya no está en este proyecto." };

  const { data: secs } = await supabase.from("guion_secuencias")
    .select("texto").eq("tratamiento_id", id);
  const palabras = (secs || []).reduce((n: number, s: any) =>
    n + ((s.texto || "").trim() ? (s.texto as string).trim().split(/\s+/).length : 0), 0);

  if (!confirmado) {
    return { confirmar: true, nombre: t.nombre, palabras, secuencias: (secs || []).length, vigente: !!t.vigente };
  }

  /* Las cuatro tablas tienen `on delete cascade` sobre el tratamiento, así que
     esto se lleva actos, secuencias, hilos, beats y marcas. Por eso la
     confirmación cuenta palabras: es lo único irreversible de este módulo. */
  const { data, error } = await supabase.from("tratamiento")
    .delete().eq("id", id).eq("proyecto_id", proyectoId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se borró: no tienes permiso, o ya no estaba." };

  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `borró el tratamiento «${t.nombre}${t.version ? ` · ${t.version}` : ""}»`
      + (palabras ? ` (${palabras} palabras)` : "") },
  });
  revalidarTrat(proyectoId);
  return {};
}
