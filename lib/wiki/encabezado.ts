/* ══════════════════════════════════════════════════════════════════════════
   EL ENCABEZADO DE METADATOS (guía, 3.1) → campos de la página

   Las páginas llegan de los hilos del proyecto de Claude así:

       Título:  Entrevista caminada
       Área:    documental
       Sección: 08 Entrevistas
       Slug:    entrevista-caminada
       Tipo:    técnica
       Etiquetas: entrevista, movimiento, locación
       Etapa:   Rodaje
       Nivel:   2
       Estado:  en investigación
       Última actualización: 2026-09-10
       Preguntas: ¿Cómo hacer una entrevista caminada?

       ## ¿Qué es?
       ...

   Se pega TODO en el formulario y esta función separa el encabezado del
   Markdown. Acepta el bloque con o sin la cerca ```text, con los dos puntos
   pegados o con espacios, y con las claves en cualquier orden. Lo que no
   reconoce lo deja en el Markdown.
   ══════════════════════════════════════════════════════════════════════════ */
import { normalizar, slugificar } from "./util";
import type { EstadoPagina, TipoPagina } from "./tipos";

export type Encabezado = {
  titulo?: string;
  area?: string;
  seccion?: string;          // texto tal cual: "08 Entrevistas" o "8" o "Entrevistas"
  slug?: string;
  tipo?: TipoPagina;
  etiquetas?: string[];
  etapa?: string;
  nivel?: number;
  estado?: EstadoPagina;
  actualizado?: string;
  preguntas?: string[];
};

const CLAVES: Record<string, keyof Encabezado> = {
  "titulo": "titulo", "title": "titulo",
  "area": "area",
  "seccion": "seccion",
  "slug": "slug",
  "tipo": "tipo",
  "etiquetas": "etiquetas", "tags": "etiquetas",
  "etapa": "etapa",
  "nivel": "nivel",
  "estado": "estado",
  "ultima actualizacion": "actualizado", "actualizado": "actualizado", "actualizada": "actualizado",
  "fecha": "actualizado",
  "preguntas": "preguntas", "pregunta": "preguntas", "responde a": "preguntas",
};

const TIPO_ALIAS: Record<string, TipoPagina> = {
  "tecnica": "tecnica", "concepto": "concepto", "problema": "problema",
  "caso": "caso", "caso de estudio": "caso", "fuente": "fuente", "ficha de fuente": "fuente",
  "profesional": "profesional", "autor": "profesional", "herramienta": "herramienta",
  "experiencia": "experiencia", "registro de experiencia": "experiencia",
};

const ESTADO_ALIAS: Record<string, EstadoPagina> = {
  "pendiente": "pendiente",
  "en investigacion": "investigacion", "investigacion": "investigacion",
  "verificado": "verificado", "verificada": "verificado",
  "probado en produccion": "probado", "probado": "probado", "probada en produccion": "probado",
  "recomendado": "recomendado", "recurso recomendado": "recomendado",
  "archivado": "archivado", "archivada": "archivado",
};

function limpiar(v: string) {
  return v.replace(/^\s*[:：]\s*/, "").replace(/^[*_`]+|[*_`]+$/g, "").trim();
}

/** Separa el encabezado del contenido. Solo mira las líneas ANTES del primer
 *  encabezado Markdown (`#`) o de la primera línea vacía tras el bloque. */
export function separarEncabezado(texto: string): { meta: Encabezado; contenido: string } {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n");
  const meta: Encabezado = {};
  let i = 0;
  // Saltar cercas ```text y líneas vacías iniciales.
  while (i < lineas.length && (/^\s*```/.test(lineas[i]) || !lineas[i].trim())) i++;

  let leyoAlgo = false;
  for (; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^\s*```/.test(l)) { i++; break; }          // fin de la cerca
    if (!l.trim()) { if (leyoAlgo) { i++; break; } else continue; }
    if (/^\s*#/.test(l)) break;                      // empezó el Markdown
    const m = l.match(/^\s*([^:：]{2,40})\s*[:：]\s*(.*)$/);
    if (!m) { if (leyoAlgo) break; else continue; }
    const clave = CLAVES[normalizar(m[1])];
    if (!clave) { if (leyoAlgo) break; else continue; }
    leyoAlgo = true;
    const v = limpiar(m[2]);
    switch (clave) {
      case "etiquetas":
        meta.etiquetas = v.split(/[,;·]/).map(s => s.trim()).filter(Boolean); break;
      case "preguntas":
        meta.preguntas = v.split(/\s*(?:\||;|\s\/\s)\s*/).map(s => s.trim()).filter(Boolean); break;
      case "nivel": {
        const n = parseInt(v, 10); if (n >= 1 && n <= 4) meta.nivel = n; break;
      }
      case "tipo":
        meta.tipo = TIPO_ALIAS[normalizar(v)]; break;
      case "estado":
        meta.estado = ESTADO_ALIAS[normalizar(v.replace(/^[^\wáéíóúñ]+/i, ""))]; break;
      case "area":
        meta.area = slugificar(v); break;
      case "slug":
        meta.slug = slugificar(v); break;
      case "actualizado": {
        const f = v.match(/\d{4}-\d{2}-\d{2}/); if (f) meta.actualizado = f[0]; break;
      }
      default:
        (meta as any)[clave] = v;
    }
  }
  const contenido = lineas.slice(i).join("\n").replace(/^\s*```\s*\n?/, "").trim();
  return { meta, contenido };
}

/** Número de sección a partir de "08 Entrevistas", "8", "Sección 08", o el
 *  nombre. Devuelve null si no lo encuentra. */
export function numeroDeSeccion(
  texto: string | undefined,
  secciones: { numero: number; nombre: string }[],
): number | null {
  if (!texto) return null;
  const m = texto.match(/\d{1,2}/);
  if (m) {
    const n = parseInt(m[0], 10);
    if (secciones.some(s => s.numero === n)) return n;
  }
  const t = normalizar(texto).replace(/^seccion\s*/, "").replace(/^\d+\s*[-–—.·]?\s*/, "");
  const s = secciones.find(x => normalizar(x.nombre) === t)
    || secciones.find(x => t && normalizar(x.nombre).includes(t));
  return s ? s.numero : null;
}
