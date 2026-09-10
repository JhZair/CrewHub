/* ══════════════════════════════════════════════════════════════════════════
   📖 WIKI — LECTURAS (servidor)

   Todo lo que las páginas de /wiki leen de Supabase pasa por aquí. Las
   escrituras están en app/wiki/acciones.ts (acciones de servidor).

   Los proyectos se leen SIEMPRE de `proyectos` mediante el join de
   `wiki_pagina_proyecto`; nada de esto copia datos de proyectos.
   ══════════════════════════════════════════════════════════════════════════ */
import { createClient } from "@/lib/supabase/server";
import { normalizar, slugificar } from "./util";
import type {
  Anotacion, Area, Historial, Pagina, PaginaResumen, Seccion, VinculoProyecto,
} from "./tipos";

const CAMPOS_RESUMEN = "id,area_id,seccion_id,slug,titulo,tipo,etiquetas,etapa,nivel,estado,preguntas,actualizado";

export async function listarAreas(): Promise<Area[]> {
  const supabase = createClient();
  const { data } = await supabase.from("wiki_areas").select("*").order("orden").order("nombre");
  return (data || []) as Area[];
}

export async function listarSecciones(areaId?: string): Promise<Seccion[]> {
  const supabase = createClient();
  let q = supabase.from("wiki_secciones").select("*").order("area_id").order("numero");
  if (areaId) q = q.eq("area_id", areaId);
  const { data } = await q;
  return (data || []) as Seccion[];
}

/** Resúmenes (sin contenido) de todas las páginas, o de un área. */
export async function listarPaginas(areaId?: string): Promise<PaginaResumen[]> {
  const supabase = createClient();
  let q = supabase.from("wiki_paginas").select(CAMPOS_RESUMEN).order("titulo");
  if (areaId) q = q.eq("area_id", areaId);
  const { data } = await q;
  return (data || []) as PaginaResumen[];
}

export async function paginasRecientes(n = 6): Promise<PaginaResumen[]> {
  const supabase = createClient();
  const { data } = await supabase.from("wiki_paginas").select(CAMPOS_RESUMEN)
    .order("editado_en", { ascending: false }).limit(n);
  return (data || []) as PaginaResumen[];
}

export async function paginasEnInvestigacion(n = 6): Promise<PaginaResumen[]> {
  const supabase = createClient();
  const { data } = await supabase.from("wiki_paginas").select(CAMPOS_RESUMEN)
    .eq("estado", "investigacion").order("editado_en", { ascending: false }).limit(n);
  return (data || []) as PaginaResumen[];
}

export async function obtenerPagina(areaId: string, slug: string): Promise<Pagina | null> {
  const supabase = createClient();
  const { data } = await supabase.from("wiki_paginas").select("*")
    .eq("area_id", areaId).eq("slug", slug).maybeSingle();
  return (data as Pagina) || null;
}

export async function obtenerPaginaPorId(id: string): Promise<Pagina | null> {
  const supabase = createClient();
  const { data } = await supabase.from("wiki_paginas").select("*").eq("id", id).maybeSingle();
  return (data as Pagina) || null;
}

export async function historialDe(paginaId: string): Promise<Historial[]> {
  const supabase = createClient();
  const { data } = await supabase.from("wiki_historial").select("*")
    .eq("pagina_id", paginaId).order("fecha", { ascending: false }).order("creado_en", { ascending: false });
  return (data || []) as Historial[];
}

export async function vinculosDe(paginaId: string): Promise<VinculoProyecto[]> {
  const supabase = createClient();
  const { data } = await supabase.from("wiki_pagina_proyecto")
    .select("id,pagina_id,proyecto_id,uso,estado,nota,fecha,proyecto:proyectos(id,nombre,nombre_corto,folio,tipo,etapa)")
    .eq("pagina_id", paginaId).order("fecha", { ascending: false });
  return (data || []) as unknown as VinculoProyecto[];
}

/** Para la ficha de un proyecto: «Conocimientos de la wiki». */
export async function paginasDeProyecto(proyectoId: string) {
  const supabase = createClient();
  const { data } = await supabase.from("wiki_pagina_proyecto")
    .select(`id,uso,estado,fecha,pagina:wiki_paginas(${CAMPOS_RESUMEN})`)
    .eq("proyecto_id", proyectoId).order("fecha", { ascending: false });
  return (data || []) as unknown as { id: string; uso: string | null; estado: string; fecha: string; pagina: PaginaResumen | null }[];
}

export async function anotacionesDe(paginaId: string): Promise<Anotacion[]> {
  const supabase = createClient();
  const { data } = await supabase.from("wiki_anotaciones")
    .select("id,pagina_id,tipo,texto,autor_id,creado_en,autor:perfiles(nombre)")
    .eq("pagina_id", paginaId).order("creado_en");
  return (data || []) as unknown as Anotacion[];
}

/** Páginas que enlazan a esta con [[...]] (también desde otras áreas). */
export async function mencionadaEn(pagina: { id: string; area_id: string; slug: string; titulo: string }): Promise<PaginaResumen[]> {
  const supabase = createClient();
  const claves = Array.from(new Set([normalizar(pagina.titulo), pagina.slug, slugificar(pagina.titulo)]));
  const { data: enlaces } = await supabase.from("wiki_enlaces").select("origen_id")
    .eq("destino_area", pagina.area_id).in("destino_clave", claves).neq("origen_id", pagina.id);
  const ids = Array.from(new Set((enlaces || []).map((e: any) => e.origen_id)));
  if (!ids.length) return [];
  const { data } = await supabase.from("wiki_paginas").select(CAMPOS_RESUMEN).in("id", ids).order("titulo");
  return (data || []) as PaginaResumen[];
}

/** Lo mínimo para resolver [[enlaces]] al renderizar. */
export async function titulosEnlazables(): Promise<{ area_id: string; slug: string; titulo: string }[]> {
  const supabase = createClient();
  const { data } = await supabase.from("wiki_paginas").select("area_id,slug,titulo");
  return (data || []) as any;
}

/** Proyectos de CrewHUB+ para el selector de vínculos. Solo lectura. */
export async function listarProyectos() {
  const supabase = createClient();
  const { data } = await supabase.from("proyectos").select("id,nombre,nombre_corto,folio,tipo").order("folio");
  return (data || []) as { id: string; nombre: string; nombre_corto: string | null; folio: string | null; tipo: string | null }[];
}

/* ── Búsqueda ─────────────────────────────────────────────────────────── */

const STOP = new Set(["como", "una", "uno", "que", "con", "para", "los", "las", "del", "por", "mucho", "mucha",
  "cuando", "hacer", "esta", "este", "sin", "hay", "donde", "quiero", "existe", "puedo", "debo", "tengo"]);

export type ResultadoBusqueda = PaginaResumen & { pregunta: string | null };

/** Busca títulos, preguntas, etiquetas y contenido. Primero full-text en
 *  español (`busqueda`), y si no hay nada, por palabras en título/preguntas. */
export async function buscarPaginas(q: string, areaId?: string, limite = 12): Promise<ResultadoBusqueda[]> {
  const texto = (q || "").trim();
  if (texto.length < 2) return [];
  const supabase = createClient();

  let query = supabase.from("wiki_paginas").select(CAMPOS_RESUMEN)
    .textSearch("busqueda", texto, { config: "spanish", type: "websearch" }).limit(limite);
  if (areaId) query = query.eq("area_id", areaId);
  let { data } = await query;

  if (!data || !data.length) {
    const palabras = normalizar(texto).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w));
    if (palabras.length) {
      const or = palabras.map(w => `titulo.ilike.%${w}%`).join(",");
      let q2 = supabase.from("wiki_paginas").select(CAMPOS_RESUMEN).or(or).limit(limite);
      if (areaId) q2 = q2.eq("area_id", areaId);
      data = (await q2).data;
    }
  }
  const palabras = normalizar(texto).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w));
  return ((data || []) as PaginaResumen[]).map(p => ({
    ...p,
    pregunta: (p.preguntas || []).find(x => palabras.some(w => normalizar(x).includes(w))) || null,
  }));
}
