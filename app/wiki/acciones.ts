"use server";
/* ══════════════════════════════════════════════════════════════════════════
   📖 WIKI — ESCRITURAS (acciones de servidor)

   Todas comprueban sesión por su cuenta: el middleware redirige antes, pero
   una acción llega por POST y no se fía de nadie (ver middleware.ts).
   ══════════════════════════════════════════════════════════════════════════ */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { separarEncabezado, numeroDeSeccion } from "@/lib/wiki/encabezado";
import { buscarPaginas, listarAreas, listarSecciones, type ResultadoBusqueda } from "@/lib/wiki/datos";
import { extraerEnlaces, hoyISO, normalizar, slugificar } from "@/lib/wiki/util";
import { ESTADOS, TIPOS, TIPOS_ANOTACION } from "@/lib/wiki/tipos";

async function quienSoy() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sin sesión");
  return { supabase, user };
}

/* ── Búsqueda (la llama el buscador del cliente) ──────────────────────── */

export type ResultadoConRuta = ResultadoBusqueda & { areaNombre: string; areaColor: string; areaColorOscuro: string; seccion: string | null; numero: number | null };

export async function buscarWiki(q: string, areaId?: string | null): Promise<ResultadoConRuta[]> {
  await quienSoy();
  const [res, areas, secciones] = await Promise.all([
    buscarPaginas(q, areaId || undefined), listarAreas(), listarSecciones(),
  ]);
  return res.map(p => {
    const a = areas.find(x => x.id === p.area_id);
    const s = secciones.find(x => x.id === p.seccion_id);
    return {
      ...p,
      areaNombre: a?.nombre || p.area_id, areaColor: a?.color || "#888", areaColorOscuro: a?.color_oscuro || "#aaa",
      seccion: s?.nombre || null, numero: s?.numero ?? null,
    };
  });
}

/* ── Guardar una página (nueva o existente) ───────────────────────────── */

export type ResultadoGuardar = { error?: string; ruta?: string };

/**
 * Recibe el texto completo tal como lo entregan los hilos (encabezado 3.1 +
 * Markdown). Con `id`, actualiza esa página; sin `id`, crea una nueva.
 * Los campos del formulario, si vienen, mandan sobre los del encabezado (para
 * poder corregir sin reescribir el bloque).
 */
export async function guardarPagina(_prev: ResultadoGuardar | null, fd: FormData): Promise<ResultadoGuardar> {
  const { supabase, user } = await quienSoy();
  const id = String(fd.get("id") || "").trim() || null;
  const texto = String(fd.get("texto") || "");
  const { meta, contenido } = separarEncabezado(texto);

  const campo = (k: string) => { const v = fd.get(k); return v == null ? "" : String(v).trim(); };

  const area_id = campo("area") || meta.area || "";
  const titulo = campo("titulo") || meta.titulo || "";
  let slug = slugificar(campo("slug") || meta.slug || titulo);
  const tipo = (campo("tipo") || meta.tipo || "tecnica") as keyof typeof TIPOS;
  const estado = (campo("estado") || meta.estado || "pendiente") as keyof typeof ESTADOS;
  const nivel = parseInt(campo("nivel") || String(meta.nivel || 2), 10);
  const etapa = campo("etapa") || meta.etapa || null;
  const etiquetas = campo("etiquetas") ? campo("etiquetas").split(/[,;·]/).map(s => s.trim()).filter(Boolean) : (meta.etiquetas || []);
  const preguntas = campo("preguntas") ? campo("preguntas").split(/\n|\|/).map(s => s.trim()).filter(Boolean) : (meta.preguntas || []);
  const actualizado = campo("actualizado") || meta.actualizado || hoyISO();

  if (!area_id) return { error: "Falta el área (Área: documental, comun, …)." };
  if (!titulo) return { error: "Falta el título." };
  if (!slug) return { error: "No se pudo formar el slug a partir del título." };
  if (!TIPOS[tipo]) return { error: `Tipo desconocido: «${String(fd.get("tipo") || meta.tipo)}».` };
  if (!ESTADOS[estado]) return { error: `Estado desconocido: «${String(fd.get("estado") || meta.estado)}».` };
  if (!(nivel >= 1 && nivel <= 4)) return { error: "El nivel va de 1 a 4." };
  if (estado === "probado" || estado === "recomendado") {
    /* Esos dos los asigna solo el usuario (guía, sección 4). Aquí quien guarda
       ES el usuario, así que se permite; queda en el historial con su nombre. */
  }

  const areas = await listarAreas();
  const area = areas.find(a => a.id === area_id);
  if (!area) return { error: `El área «${area_id}» no existe. Áreas: ${areas.map(a => a.id).join(", ")}.` };

  const secciones = await listarSecciones(area_id);
  const numSec = campo("seccion") ? numeroDeSeccion(campo("seccion"), secciones) : numeroDeSeccion(meta.seccion, secciones);
  const seccion = numSec ? secciones.find(s => s.numero === numSec) : null;
  if (secciones.length && !seccion) {
    return { error: `No reconozco la sección «${campo("seccion") || meta.seccion || ""}» en ${area.nombre}. Usa el número (p. ej. «08 Entrevistas»).` };
  }

  // ¿Choca el slug con otra página del área?
  const { data: choque } = await supabase.from("wiki_paginas").select("id").eq("area_id", area_id).eq("slug", slug).maybeSingle();
  if (choque && choque.id !== id) {
    if (id) return { error: `Ya existe otra página con el slug «${slug}» en ${area.nombre}.` };
    return { error: `Ya existe «${slug}» en ${area.nombre}. Si quieres actualizarla, ábrela y usa Editar; si es otra página, cambia el slug.` };
  }

  const fila = {
    area_id, seccion_id: seccion?.id || null, slug, titulo, tipo, etiquetas, etapa, nivel, estado,
    preguntas, contenido, actualizado, editado_en: new Date().toISOString(),
  };

  let paginaId = id;
  let rutaVieja: string | null = null;
  if (id) {
    const { data: previa } = await supabase.from("wiki_paginas").select("area_id,slug").eq("id", id).maybeSingle();
    if (!previa) return { error: "La página que intentas editar ya no existe." };
    rutaVieja = `/wiki/${previa.area_id}/${previa.slug}`;
    const { error } = await supabase.from("wiki_paginas").update(fila).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase.from("wiki_paginas").insert({ ...fila, creado_por: user.id }).select("id").single();
    if (error) return { error: error.message };
    paginaId = data.id;
  }

  // Historial: lo que escriba quien guarda, o una línea automática.
  const cambio = campo("cambio") || (id ? "Página actualizada." : `Página creada con la plantilla de ${TIPOS[tipo].toLowerCase()}.`);
  await supabase.from("wiki_historial").insert({
    pagina_id: paginaId, fecha: actualizado, cambio, motivo: campo("motivo") || null,
    fuente: campo("fuente_nueva") || null, autor_id: user.id,
  });

  // Enlaces [[...]] salientes, para «Mencionada en».
  await supabase.from("wiki_enlaces").delete().eq("origen_id", paginaId);
  const enlaces = extraerEnlaces(contenido);
  if (enlaces.length) {
    const filas = new Map<string, { origen_id: string; destino_area: string; destino_clave: string }>();
    for (const e of enlaces) {
      let destArea = area_id;
      if (e.area) {
        const a = areas.find(x => normalizar(x.nombre) === normalizar(e.area!) || x.id === slugificar(e.area!));
        destArea = a ? a.id : slugificar(e.area);
      }
      const clave = normalizar(e.clave);
      filas.set(`${destArea}|${clave}`, { origen_id: paginaId!, destino_area: destArea, destino_clave: clave });
    }
    await supabase.from("wiki_enlaces").insert(Array.from(filas.values()));
  }

  const ruta = `/wiki/${area_id}/${slug}`;
  revalidatePath("/wiki");
  revalidatePath(`/wiki/${area_id}`);
  revalidatePath(ruta);
  if (rutaVieja && rutaVieja !== ruta) revalidatePath(rutaVieja);
  redirect(ruta);
}

/* ── Vínculo con un proyecto (guía, sección 5) ────────────────────────── */

export async function vincularProyecto(fd: FormData) {
  const { supabase, user } = await quienSoy();
  const pagina_id = String(fd.get("pagina_id") || "");
  const proyecto_id = String(fd.get("proyecto_id") || "");
  const ruta = String(fd.get("ruta") || "/wiki");
  if (!pagina_id || !proyecto_id) return;
  const fila = {
    pagina_id, proyecto_id,
    uso: String(fd.get("uso") || "").trim() || null,
    estado: String(fd.get("estado") || "evaluando"),
    nota: String(fd.get("nota") || "").trim() || null,
    fecha: String(fd.get("fecha") || "") || hoyISO(),
    creado_por: user.id,
  };
  await supabase.from("wiki_pagina_proyecto").upsert(fila, { onConflict: "pagina_id,proyecto_id" });
  revalidatePath(ruta);
}

export async function quitarVinculo(fd: FormData) {
  const { supabase } = await quienSoy();
  const id = String(fd.get("id") || "");
  const ruta = String(fd.get("ruta") || "/wiki");
  if (id) await supabase.from("wiki_pagina_proyecto").delete().eq("id", id);
  revalidatePath(ruta);
}

/* ── Anotaciones personales (3.7) ─────────────────────────────────────── */

export async function agregarAnotacion(fd: FormData) {
  const { supabase, user } = await quienSoy();
  const pagina_id = String(fd.get("pagina_id") || "");
  const tipo = String(fd.get("tipo") || "comentario");
  const texto = String(fd.get("texto") || "").trim();
  const ruta = String(fd.get("ruta") || "/wiki");
  if (!pagina_id || !texto || !(tipo in TIPOS_ANOTACION)) return;
  await supabase.from("wiki_anotaciones").insert({ pagina_id, tipo, texto, autor_id: user.id });
  revalidatePath(ruta);
}

export async function borrarAnotacion(fd: FormData) {
  const { supabase, user } = await quienSoy();
  const id = String(fd.get("id") || "");
  const ruta = String(fd.get("ruta") || "/wiki");
  // Cada quien borra las suyas.
  if (id) await supabase.from("wiki_anotaciones").delete().eq("id", id).eq("autor_id", user.id);
  revalidatePath(ruta);
}

/* ── Borrar una página ────────────────────────────────────────────────── */

export async function borrarPagina(fd: FormData) {
  const { supabase } = await quienSoy();
  const id = String(fd.get("id") || "");
  const area = String(fd.get("area") || "");
  if (!id) return;
  await supabase.from("wiki_paginas").delete().eq("id", id);
  revalidatePath("/wiki");
  revalidatePath(`/wiki/${area}`);
  redirect(area ? `/wiki/${area}` : "/wiki");
}
