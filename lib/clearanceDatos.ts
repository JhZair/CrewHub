import { createClient } from "@/lib/supabase/server";
import { techo } from "@/lib/api";
import {
  riesgoDe, semaforo, motivosRiesgo, META_TIPO_AUT,
  type FilaAutorizacion, type FilaIncidental, type FilaUsoMusical,
  type ContextoRiesgo, type NivelRiesgo, type Semaforo,
  type Bloqueo, type TipoAutorizacion,
} from "@/lib/clearance";

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE LEEN LAS DOS PANTALLAS DE CLEARANCE

   ── POR QUÉ ESTE ARCHIVO ──
   /clearance dejó de ser una sola pantalla. Ahora hay un ÍNDICE —una línea por
   película con su semáforo— y una FICHA por película con todo el detalle. Las
   dos tienen que calcular el mismo veredicto sobre la misma película, y si
   cada una arma su propio contexto acabarán diciendo cosas distintas: el
   índice en verde y la ficha en rojo, o al revés.

   Ya sabemos cómo termina eso. Es literalmente el fallo que este módulo
   entero existe para impedir, y lo cometimos hace dos días con la ficha del
   proyecto. Así que el contexto del riesgo se arma AQUÍ, una vez, y las dos lo
   piden.

   ── QUÉ NO ESTÁ AQUÍ ──
   Los catálogos de los desplegables —agrupaciones, locaciones, actividades,
   materiales— no. Solo hacen falta para REGISTRAR, y registrar solo se hace en
   la ficha. Traerlos en el índice era pedir cinco consultas por una pantalla
   que no las pinta.
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo que la regla de riesgo necesita mirar, y nada más. Traer la ficha entera
 *  de cada obra para calcular un color sería pedir de más en cada carga. */
export type CatalogosRiesgo = {
  /** Las listas ya recortadas, para los desplegables. */
  obras: any[]; grabaciones: any[]; personas: any[];
  obraDe: Map<string, any>;
  grabDe: Map<string, any>;
  persDe: Map<string, any>;
  /** ⚠ El mensaje del fallo, no un booleano: si el catálogo no se pudo leer,
   *  el riesgo se calcula A CIEGAS —sin saber si alguien es menor ni si una
   *  obra está verificada— y el veredicto tiene que degradarse a «no se puede
   *  decir». Un `✓ se puede publicar` sobre un cálculo ciego es la mentira más
   *  cara que puede decir este módulo. */
  error: string | null;
  /** Las listas que se cortaron en el tope de la API. */
  cortado: string[];
};

/** Los tres catálogos que entran en el cálculo del riesgo. Globales: una obra
 *  y una persona no son de una película. */
export async function catalogosDeRiesgo(): Promise<CatalogosRiesgo> {
  const supabase = createClient();
  const [obras, grabs, pers] = await Promise.all([
    supabase.from("obra")
      .select("id,titulo,autor_conocido,iswc,estado_dominio_publico,es_tradicional_o_anonima")
      .limit(techo(900) + 1),
    supabase.from("grabacion")
      .select("id,descripcion,origen,plan_ia,productor_fonografico,reconocida_por_sistemas_automaticos")
      .limit(techo(900) + 1),
    supabase.from("personas")
      .select("id,nombre,alias,es_menor_de_edad,fecha_nacimiento,representante_legal_id")
      .order("nombre").limit(techo(900) + 1),
  ]);

  const cortado = [
    [(obras.data || []).length, techo(900), "obras"],
    [(grabs.data || []).length, techo(900), "grabaciones"],
    [(pers.data || []).length, techo(900), "personas"],
  ].filter(([n, t]) => (n as number) > (t as number)).map(([, , q]) => q as string);

  /* ⚠ SE RECORTA LA FILA DE SONDA antes de construir nada. Se pide una de más
     para saber si la lista está cortada; si esa fila se queda dentro, el «5 de
     11» de una agrupación pasa a decir «5 de 12» y un número equivocado no da
     error: se lee y se cree. Recortar es la otra mitad de la sonda, y sin ella
     la sonda empeora las cosas en vez de arreglarlas. */
  const lObras = ((obras.data || []) as any[]).slice(0, techo(900));
  const lGrabs = ((grabs.data || []) as any[]).slice(0, techo(900));
  const lPers = ((pers.data || []) as any[]).slice(0, techo(900));

  return {
    obras: lObras, grabaciones: lGrabs, personas: lPers,
    obraDe: new Map(lObras.map(o => [o.id, o])),
    grabDe: new Map(lGrabs.map(g => [g.id, g])),
    persDe: new Map(lPers.map(p => [p.id, p])),
    error: [obras, grabs, pers].map(r => (r as any)?.error?.message).find(Boolean) || null,
    cortado,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   LOS DESPLEGABLES, DERIVADOS DEL MISMO CATÁLOGO

   ⚠ Y NO DE UNA SEGUNDA CONSULTA. La ficha pedía `obra` y `grabacion` otra vez
   «porque necesita columnas distintas», y era falso: las de arriba son un
   superset exacto de las de abajo. Dos viajes de red tirados, sí — pero lo
   grave es otro: pasado el techo, las dos copias traen filas DISTINTAS. El
   desplegable ofrecería obras que no están en el mapa de riesgo, y el riesgo de
   esas filas se calcularía con `ctx.obra = undefined`: más bajo del real, en
   silencio. Es la puerta del `select`, otra vez.
   ══════════════════════════════════════════════════════════════════════════ */

/** El nombre con que se elige a alguien en un desplegable. */
export const catalogoDePersonas = (cat: CatalogosRiesgo) =>
  cat.personas.map(p => ({ id: p.id, nombre: p.alias || p.nombre || "(sin nombre)" }));

/** La obra se nombra con su ISWC cuando lo tiene: hay QUINCE «Fatal Destino»
 *  en el catálogo de APDAYC y el título solo no distingue ninguno. */
export const catalogoDeObras = (cat: CatalogosRiesgo) =>
  cat.obras
    .map(o => ({ id: o.id, nombre: o.iswc ? `${o.titulo} · ${o.iswc}` : o.titulo }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));

export const catalogoDeGrabaciones = (cat: CatalogosRiesgo) =>
  cat.grabaciones.map(g => ({
    id: g.id,
    nombre: g.productor_fonografico
      ? `${g.descripcion || g.id.slice(0, 8)} · ${g.productor_fonografico}`
      : (g.descripcion || g.id.slice(0, 8)),
  }));

/** El contexto de cada permiso, a partir de los catálogos.
 *
 *  ⚠ ESTA FUNCIÓN NO CRUZA A UN COMPONENTE CLIENTE. Se usa para calcular en el
 *  servidor, y lo que viaja es el RESULTADO —un mapa de id→nivel—, nunca ella.
 *  Pasar un closure a un `"use client"` revienta en runtime con «Functions
 *  cannot be passed directly to Client Components», y `tsc` no lo ve porque
 *  tipar la prop como función es válido: la pantalla compilaba limpia y daba
 *  500 con la primera película. */
export function contextoDe(cat: CatalogosRiesgo, hoy: string) {
  return (a: FilaAutorizacion): ContextoRiesgo => ({
    hoy,
    obra: a.objeto_obra_id ? cat.obraDe.get(a.objeto_obra_id) : null,
    grabacion: a.objeto_grabacion_id ? cat.grabDe.get(a.objeto_grabacion_id) : null,
    persona: a.objeto_persona_id ? cat.persDe.get(a.objeto_persona_id) : null,
  });
}

/** El nombre con que se conoce a alguien, que es el alias cuando lo hay. */
export const nombrePersonaDe = (cat: CatalogosRiesgo, id?: string | null) => {
  const p = id ? cat.persDe.get(id) : null;
  return p ? (p.alias || p.nombre || "(sin nombre)") : null;
};

/** Agrupa por película en un solo recorrido. Un `filter` por fila dentro del
 *  render sería recorrer la lista entera una vez por proyecto. */
export function porProyecto<T extends { proyecto_id?: string | null }>(filas: T[]) {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const k = String(f.proyecto_id || "");
    m.set(k, [...(m.get(k) || []), f]);
  }
  return m;
}

/* ══════════════════════════════════════════════════════════════════════════
   EL VEREDICTO DE UNA PELÍCULA, EN UN SOLO SITIO
   ══════════════════════════════════════════════════════════════════════════ */

export type FilaSemaforo = {
  p: any;
  s: Semaforo;
  suyas: FilaAutorizacion[];
  incidentales: FilaIncidental[];
  usos: FilaUsoMusical[];
};

/** El semáforo de cada película, y las peores arriba: es a lo que se entra.
 *
 *  ⚠ El orden también vive aquí. Si el índice ordenara por urgencia y la ficha
 *  contara los bloqueos de otra manera, el número de la lista y el de dentro
 *  no cuadrarían — y el usuario no tiene forma de saber cuál de los dos miente. */
export function semaforosDe(
  peliculas: any[],
  auts: Map<string, FilaAutorizacion[]>,
  incs: Map<string, FilaIncidental[]>,
  usos: Map<string, FilaUsoMusical[]>,
  ctxDe: (a: FilaAutorizacion) => ContextoRiesgo,
): FilaSemaforo[] {
  return peliculas.map(p => {
    const suyas = auts.get(p.id) || [];
    const mIncs = incs.get(p.id) || [];
    const mUsos = usos.get(p.id) || [];
    return {
      p, suyas, incidentales: mIncs, usos: mUsos,
      s: semaforo(suyas, ctxDe, { incidentales: mIncs, usosMusicales: mUsos }),
    };
  }).sort((a, b) =>
    (b.s.criticos - a.s.criticos)
    || (b.s.altos - a.s.altos)
    || (a.p.nombre_corto || a.p.nombre || "").localeCompare(
       b.p.nombre_corto || b.p.nombre || "", "es"));
}

/** El riesgo de cada permiso como CADENAS, que es lo único que puede cruzar a
 *  un componente cliente. */
export function riesgosDe(
  auts: FilaAutorizacion[],
  ctxDe: (a: FilaAutorizacion) => ContextoRiesgo,
): Record<string, NivelRiesgo> {
  return Object.fromEntries(auts.map(a => [a.id, riesgoDe(a, ctxDe(a))]));
}

/* ══════════════════════════════════════════════════════════════════════════
   CÓMO SE NOMBRA UN BLOQUEO

   ⚠ EN UN SOLO SITIO. El índice y la ficha pintan la misma lista de bloqueos, y
   cada uno tenía su propia cadena de respaldo para el «de quién». El índice se
   dejaba la agrupación —no carga esa tabla— así que el bloqueo de Las Patronas,
   que es EL caso central de este módulo, salía en la lista como «interpretación
   musical» a secas y en la ficha como «interpretación musical · Las Patronas».
   El mismo bloqueo descrito de dos maneras.

   `nombreAgrupacion` llega aparte y puede ser `null`: el índice no tiene por qué
   cargar el catálogo entero de bandas para pintar una línea. Lo que no puede es
   inventarse otro orden de respaldo.
   ══════════════════════════════════════════════════════════════════════════ */
export function rotuloBloqueo(
  b: Bloqueo,
  suyas: FilaAutorizacion[],
  cat: CatalogosRiesgo,
  nombreAgrupacion?: (id?: string | null) => string | null,
): { que: string; quien: string | null } {
  /* ⚠ Solo cuando VIENE de un permiso. `suyas.find` nunca encuentra un
     incidental ni una música —son otras tablas— así que el ternario caía
     siempre en «permiso» y rotulaba como tal una decisión de montaje, borrando
     la distinción que las dos tablas existen para mantener. */
  const a = b.origen === "permiso" ? suyas.find(x => x.id === b.id) : null;
  const que = a
    ? (META_TIPO_AUT[a.tipo as TipoAutorizacion]?.corto || "permiso")
    : b.origen === "incidental" ? "sale sin firmar"
    : b.origen === "musica" ? "música del corte" : "permiso";
  const quien = a
    ? (nombrePersonaDe(cat, a.otorgante_persona_id)
      || (nombreAgrupacion?.(a.otorgante_agrupacion_id) ?? null)
      || a.otorgante_entidad_nombre
      || nombrePersonaDe(cat, a.objeto_persona_id))
    : null;
  return { que, quien: quien || null };
}

/**
 * POR QUÉ cada permiso tiene el color que tiene.
 *
 * ⚠ El color de una fila es su RIESGO y el texto es su ESTADO: dos permisos que
 * ponen «firmada» salían uno en ámbar y otro no, sin nada que explicara la
 * diferencia. Hubo que preguntarlo — y esa pregunta es la prueba del fallo. Un
 * color sin motivo es un aviso que no se puede resolver, y esos se dejan de
 * mirar con todos los demás detrás.
 *
 * Se calcula AQUÍ porque los motivos necesitan el catálogo —si la obra está
 * verificada, si la persona es menor— que solo el servidor tiene. Lo que cruza
 * son CADENAS ya resueltas: ni el catálogo ni `ctxDe` viajan.
 */
export function motivosDe(
  auts: FilaAutorizacion[],
  ctxDe: (a: FilaAutorizacion) => ContextoRiesgo,
): Record<string, { nivel: NivelRiesgo; txt: string }[]> {
  return Object.fromEntries(auts.map(a => [
    a.id,
    motivosRiesgo(a, ctxDe(a)).map(m => ({ nivel: m.nivel, txt: m.txt })),
  ]));
}

/** El nombre corto de una película, con respaldo. Se repite en las dos
 *  pantallas y en los títulos de página. */
export const nombrePeli = (p: any) =>
  p?.nombre_corto || p?.nombre || "(sin nombre)";

/* ══════════════════════════════════════════════════════════════════════════
   LOS CAMPOS QUE PIDE CADA CONSULTA

   En constantes y no escritos a mano en cada pantalla: el índice y la ficha
   leen la MISMA tabla para calcular el MISMO veredicto, y si una pide un campo
   que la otra no, `riesgoDe` mira un `undefined` y devuelve un riesgo más bajo
   sin que nada avise. Es un cero que en realidad es «no lo sé», por la puerta
   del `select`.
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo que `riesgoDe` y `semaforo` leen de verdad. Ni un campo más. */
export const CAMPOS_AUT_SEMAFORO =
  "id,proyecto_id,tipo,estado,calidad_firmante,documento_id,medios," +
  "riesgo_manual,permite_uso_promocional,tipo_plazo,plazo_anios,plazo_hasta," +
  "firmado_el,objeto_persona_id,objeto_obra_id,objeto_grabacion_id," +
  "objeto_agrupacion_id,otorgante_persona_id,otorgante_agrupacion_id," +
  "otorgante_entidad_nombre,notas";

/** Y lo que además hace falta para PINTAR y editar un permiso en la ficha. */
export const CAMPOS_AUT_FICHA = CAMPOS_AUT_SEMAFORO +
  ",naturaleza,otorgante_tipo,objeto_locacion_id,objeto_actividad_id," +
  "objeto_material_id,incluye_explotacion_comercial_futura,prioridad";

export const CAMPOS_INCIDENTAL =
  "id,proyecto_id,escena_o_plano,descripcion_persona,es_identificable," +
  "tiene_protagonismo,es_menor,contexto_sensible,aviso_filmacion_colocado," +
  "decision_montaje,resuelto,nota";

export const CAMPOS_USO_MUSICAL =
  "id,proyecto_id,timecode_inicio,timecode_fin,escena,obra_id," +
  "grabacion_id,agrupacion_id,modo_aparicion,decision_montaje,resuelto," +
  "autorizacion_id,nota";
