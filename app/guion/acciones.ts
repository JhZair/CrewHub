"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ACTOS_BASE, plantillaDe, PLANTILLAS } from "@/lib/guion";

/* LAS ACCIONES DEL GUION.
 *
 * Viven en su propio archivo y no en app/actions.ts —que ya pasa de cuatro
 * mil líneas— porque son un módulo entero con su propio vocabulario.
 *
 * Regla que atraviesa todo esto: NADA borra texto escrito. Un tratamiento
 * es horas de trabajo que no están en ninguna otra parte; cualquier acción
 * que pudiera perderlo o lo impide, o mueve en vez de borrar.
 */

const revalidar = (proyectoId: string) => {
  revalidatePath(`/guion/${proyectoId}`);
  revalidatePath(`/entidad/proyecto/${proyectoId}`);
};

async function sesion() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Siguiente hueco de orden, para no depender de `creado_en` —dos filas
 *  creadas en el mismo milisegundo se ordenarían al azar y el guion
 *  cambiaría de orden solo. */
async function proximoOrden(supabase: any, tabla: string, proyectoId: string) {
  const { data } = await supabase.from(tabla)
    .select("orden").eq("proyecto_id", proyectoId)
    .order("orden", { ascending: false }).limit(1);
  return ((data?.[0]?.orden ?? -1) as number) + 1;
}

/* ══════════ PLANTILLA ══════════ */

/** Elegir la plantilla del proyecto. Si además no hay ni un acto, siembra
 *  los suyos: empezar con la pantalla en blanco es empezar dos veces. */
export async function elegirPlantilla(proyectoId: string, clave: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const p = plantillaDe(clave);

  const { error } = await supabase.from("proyectos")
    .update({ guion_plantilla: p.clave }).eq("id", proyectoId);
  if (error) return { error: error.message };

  /* Los actos, solo si está vacío. Sembrar sobre una estructura ya escrita
     duplicaría los actos —y el guion quedaría con dos «Planteamiento» sin
     que nadie hubiera pedido uno—. */
  const { count } = await supabase.from("guion_actos")
    .select("id", { count: "exact", head: true }).eq("proyecto_id", proyectoId);
  let sembrados = 0;
  if (!count) {
    const base = ACTOS_BASE[p.clave] || ACTOS_BASE["tres-actos"];
    const { error: e2 } = await supabase.from("guion_actos").insert(
      base.map((a, i) => ({ proyecto_id: proyectoId, clave: a.clave, nombre: a.nombre, orden: i })));
    if (e2) return { error: `Se guardó la plantilla, pero los actos no: ${e2.message}` };
    sembrados = base.length;
  }
  /* Y la espina. Elegir un modelo estructural y no recibir sus puntos de
     giro es quedarse con el nombre del modelo: lo que guía es saber dónde
     va el detonante, no que la plantilla se llame «Save the Cat». */
  const esp = await sembrarBeats(proyectoId, p.clave);

  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `eligió la plantilla narrativa «${p.nombre}»`
      + (sembrados ? ` · ${sembrados} actos` : "")
      + ((esp as any)?.nuevos ? ` · ${(esp as any).nuevos} puntos de estructura` : "") },
  });
  revalidar(proyectoId);
  return { sembrados, beats: (esp as any)?.nuevos || 0 };
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
export async function sembrarBeats(proyectoId: string, clave: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const p = plantillaDe(clave);

  const [{ data: actos }, { data: hay }] = await Promise.all([
    supabase.from("guion_actos").select("id,orden").eq("proyecto_id", proyectoId).order("orden"),
    supabase.from("guion_beats").select("clave,orden").eq("proyecto_id", proyectoId),
  ]);
  const yaEstan = new Set((hay || []).map((b: any) => b.clave).filter(Boolean));
  const desde = Math.max(-1, ...((hay || []).map((b: any) => b.orden ?? 0))) + 1;

  const slug = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const filas = p.beats
    .map((b, i) => ({ b, i, clave: `${p.clave}:${slug(b.n)}` }))
    .filter(x => !yaEstan.has(x.clave))
    .map((x, k) => ({
      proyecto_id: proyectoId, clave: x.clave, nombre: x.b.n, que: x.b.que,
      tipo: x.b.tipo, pos: x.b.pos,
      acto_id: (actos || [])[Math.min(x.b.acto, ((actos || []).length || 1) - 1)]?.id || null,
      orden: desde + k,
    }));

  if (!filas.length) return { nuevos: 0, yaEstaban: p.beats.length };
  const { error } = await supabase.from("guion_beats").insert(filas);
  if (error) return { error: error.message };
  revalidar(proyectoId);
  return { nuevos: filas.length, yaEstaban: p.beats.length - filas.length };
}

export async function crearBeat(proyectoId: string, actoId: string | null, nombre: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "El punto necesita un nombre." };
  const { error } = await supabase.from("guion_beats").insert({
    proyecto_id: proyectoId, acto_id: actoId || null, nombre: n, tipo: "giro",
    orden: await proximoOrden(supabase, "guion_beats", proyectoId),
  });
  if (error) return { error: error.message };
  revalidar(proyectoId);
  return {};
}

/** Guardar un beat. Igual que el tratamiento: no revalida —la nota se
 *  autoguarda mientras se escribe— y quien refresca es el cliente. */
export async function guardarBeat(
  id: string, proyectoId: string,
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
export async function borrarBeat(id: string, proyectoId: string, confirmado = false) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("guion_beats")
    .select("nombre,nota").eq("id", id).maybeSingle();
  if ((prev?.nota || "").trim() && !confirmado)
    return { confirmar: true, nombre: prev?.nombre, nota: (prev!.nota as string).trim() };
  const { error } = await supabase.from("guion_beats").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidar(proyectoId);
  return {};
}

/* ══════════ ACTOS ══════════ */

export async function crearActo(proyectoId: string, nombre: string, clave: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "El acto necesita un nombre." };
  const { error } = await supabase.from("guion_actos").insert({
    proyecto_id: proyectoId, nombre: n, clave: (clave || "").trim() || null,
    orden: await proximoOrden(supabase, "guion_actos", proyectoId),
  });
  if (error) return { error: error.message };
  revalidar(proyectoId);
  return {};
}

export async function guardarActo(id: string, proyectoId: string, nombre: string, clave: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "El acto necesita un nombre." };
  const { data, error } = await supabase.from("guion_actos")
    .update({ nombre: n, clave: (clave || "").trim() || null }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no existe." };
  revalidar(proyectoId);
  return {};
}

/** Borrar un acto NO borra sus secuencias: la FK es `set null` y quedan
 *  arriba, en «sin acto». Un tratamiento escrito no se puede perder por
 *  reorganizar la estructura que lo contiene. Se dice cuántas quedaron
 *  sueltas, o nadie las buscaría. */
export async function borrarActo(id: string, proyectoId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { count } = await supabase.from("guion_secuencias")
    .select("id", { count: "exact", head: true }).eq("acto_id", id);
  const { data, error } = await supabase.from("guion_actos").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  revalidar(proyectoId);
  return { sueltas: count || 0 };
}

/* ══════════ SECUENCIAS ══════════ */

export async function crearSecuencia(proyectoId: string, actoId: string | null, nombre: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = await supabase.from("guion_secuencias").insert({
    proyecto_id: proyectoId, acto_id: actoId || null,
    nombre: (nombre || "").trim() || "Secuencia sin título",
    orden: await proximoOrden(supabase, "guion_secuencias", proyectoId),
  }).select("id").single();
  if (error) return { error: error.message };
  revalidar(proyectoId);
  return { id: data.id };
}

/** Guardar el tratamiento. Se llama sola cada 800 ms mientras se escribe,
 *  así que no anota en el historial: una sesión de escritura dejaría
 *  cuarenta entradas idénticas y taparía todo lo demás. */
export async function guardarSecuencia(
  id: string, proyectoId: string,
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
export async function moverSecuencia(id: string, proyectoId: string, dir: -1 | 1) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: mia, error: e0 } = await supabase.from("guion_secuencias")
    .select("acto_id").eq("id", id).maybeSingle();
  if (e0) return { error: e0.message };
  if (!mia) return { error: "Esa secuencia ya no está." };

  let q = supabase.from("guion_secuencias").select("id,orden,creado_en")
    .eq("proyecto_id", proyectoId);
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
  revalidar(proyectoId);
  return {};
}

/** Borrar una secuencia. Con tratamiento escrito PIDE confirmación con el
 *  número de palabras: «¿borrar?» a secas no dice que se van 620 palabras
 *  que no están en ninguna otra parte. */
export async function borrarSecuencia(id: string, proyectoId: string, confirmado = false) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("guion_secuencias")
    .select("nombre,texto").eq("id", id).maybeSingle();
  const pal = (prev?.texto || "").trim() ? (prev!.texto as string).trim().split(/\s+/).length : 0;
  if (pal > 0 && !confirmado) return { confirmar: true, palabras: pal, nombre: prev?.nombre };

  const { data, error } = await supabase.from("guion_secuencias").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `borró la secuencia «${prev?.nombre || "sin título"}»${pal ? ` (${pal} palabras de tratamiento)` : ""}` },
  });
  revalidar(proyectoId);
  return {};
}

/* ══════════ HILOS DE TRAMA ══════════ */

export async function crearHilo(proyectoId: string, nombre: string, color: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "El hilo necesita un nombre." };
  const { error } = await supabase.from("guion_hilos").insert({
    proyecto_id: proyectoId, nombre: n, color: color || "#a78bfa",
    orden: await proximoOrden(supabase, "guion_hilos", proyectoId),
  });
  if (error) return { error: error.message };
  revalidar(proyectoId);
  return {};
}

export async function guardarHilo(id: string, proyectoId: string, nombre: string, color: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "El hilo necesita un nombre." };
  const { data, error } = await supabase.from("guion_hilos")
    .update({ nombre: n, color: color || "#a78bfa" }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
  revalidar(proyectoId);
  return {};
}

export async function borrarHilo(id: string, proyectoId: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("guion_hilos").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidar(proyectoId);
  return {};
}

/** Marcar o desmarcar un hilo en una secuencia. */
export async function marcarHilo(secuenciaId: string, hiloId: string, proyectoId: string, poner: boolean) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = poner
    ? await supabase.from("guion_secuencia_hilos")
        .upsert({ secuencia_id: secuenciaId, hilo_id: hiloId }, { onConflict: "secuencia_id,hilo_id" })
    : await supabase.from("guion_secuencia_hilos")
        .delete().eq("secuencia_id", secuenciaId).eq("hilo_id", hiloId);
  if (error) return { error: error.message };
  revalidar(proyectoId);
  return {};
}
