import { TABLA_DE, tipoCanonico } from "@/lib/secciones";
import { mapaAlias } from "@/lib/personas";
import { diaLima } from "@/lib/periodo";
import type { Evento } from "@/components/EventoHistorial";

/* ══════════════════════════════════════════════════════════════════════════
   lib/eventos.ts — PONERLE NOMBRE A LO QUE PASÓ

   La tabla `actividad` guarda ids: quién (uuid), sobre qué (tipo + uuid) y, si
   cambió algo, el valor de antes y el de después — que en el caso del
   responsable también es un uuid. Una fila cruda no se puede leer.

   Traducirla es media pantalla de código: juntar los ids por tabla, resolver
   los nombres en una consulta por tabla (no una por evento), preferir el alias
   al nombre completo, y resolver aparte los uuid que viajan DENTRO de
   `detalle`. Estaba escrito en /historial, y la portada necesita exactamente lo
   mismo: dos copias que empiezan iguales y en tres meses cuentan cosas
   distintas sobre el mismo evento.

   Aquí, una vez. Ver components/EventoHistorial.tsx para cómo se pinta.
   ══════════════════════════════════════════════════════════════════════════ */

/** «John Oros Quispe» → «John O.». En una lista larga, el nombre completo
 *  repetido cuarenta veces es lo único que se ve. */
export const cortoActor = (n?: string | null) => {
  const p = (n || "").trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || "");
};

/**
 * Nombre de cada entidad de una lista de pares `{tipo, id}`, en un mapa
 * «tipo:id» → nombre.
 *
 * UNA consulta por tabla, no una por par: pintar cuarenta eventos que tocan
 * seis tablas son seis viajes, no cuarenta. Lo usan el feed de actividad y los
 * chips de los destacados, que antes lo resolvían cada uno a su manera — y por
 * eso un vínculo a material viejo salía sin nombre en un sitio y con nombre en
 * el otro.
 *
 * Un tipo que no está en `TABLA_DE` se queda fuera a propósito: no hay dónde
 * buscarle el nombre, y un uuid en pantalla es peor que nada.
 *
 * ⚠ LAS DOS GRAFÍAS. Los triggers de la base escriben `tg_table_name`, o sea
 * el PLURAL («publicaciones»), y el código a mano escribe el singular
 * («publicacion»). `TABLA_DE` solo conoce el singular, así que preguntando por
 * la grafía cruda la mitad del rastro se quedaba sin nombre — sin error, sin
 * hueco visible: la línea decía «creó» y nada más. Las claves del mapa que
 * sale de aquí son SIEMPRE canónicas; búscalas con `tipoCanonico`.
 */
export async function nombresDe(
  sb: any, pares: { tipo?: string | null; id?: string | null }[],
): Promise<Map<string, string>> {
  const porTipo = new Map<string, Set<string>>();
  for (const par of pares) {
    const tipo = par.tipo ? tipoCanonico(par.tipo) : "";
    if (!tipo || !par.id || !TABLA_DE[tipo]) continue;
    let s = porTipo.get(tipo);
    if (!s) { s = new Set(); porTipo.set(tipo, s); }
    s.add(par.id);
  }
  const nombre = new Map<string, string>();
  if (!porTipo.size) return nombre;

  const tandas = await Promise.all([...porTipo.entries()].map(([tipo, ids]) => {
    const [tabla, campo] = TABLA_DE[tipo];
    // El alias manda cuando existe: en una lista larga el nombre completo estorba.
    const sel = tipo === "persona" ? "id,nombre,alias"
      : tipo === "proyecto" ? "id,nombre,nombre_corto" : `id,${campo}`;
    return sb.from(tabla).select(sel).in("id", [...ids])
      .then((r: any) => ({ ...r, __tipo: tipo, __campo: campo }));
  }));

  for (const t of tandas as any[]) {
    /* Si una tabla falló —una migración a medias, un permiso— sus filas se
       quedan sin nombre y el resto de la lista se pinta igual. Con un `throw`
       aquí, un solo tipo roto dejaba la portada en blanco. */
    for (const r of (t.data || [])) {
      nombre.set(`${t.__tipo}:${r.id}`, r.alias || r.nombre_corto || r[t.__campo] || "—");
    }
  }
  return nombre;
}

export type EventosNombrados = {
  /** Los eventos listos para pintar, en el mismo orden que llegaron. */
  eventos: Evento[];
  /** Alias por id de cuenta (JohnO). Lo necesitan también los chips de «quién». */
  alias: Record<string, string>;
  /** Nombre completo por id de perfil, para los filtros. */
  nombreActor: Map<string, string>;
};

/**
 * Convierte filas crudas de `actividad` en eventos legibles.
 *
 * Las filas deben venir con al menos `tipo, detalle, creado_en, entidad_tipo,
 * entidad_id, actor_id` y el embebido `actor:perfiles(nombre)`.
 *
 * ⚠ Todas las consultas salen A LA VEZ. Ninguna necesita el resultado de otra
 * —los ids ya están en los eventos—, y encadenarlas era sumar cuatro idas y
 * vueltas a la pantalla que más se abre.
 *
 * `conActores` trae además la tabla `perfiles` entera para poder nombrar a
 * quien no aparece en esta página. Solo lo necesita /historial, que pinta un
 * chip por persona; la portada lo pedía y lo tiraba a la basura — una tabla
 * completa por render de la pantalla más abierta, para nada.
 */
export async function nombrarEventos(
  sb: any, crudos: any[] | null, { conActores = true }: { conActores?: boolean } = {},
): Promise<EventosNombrados> {
  const evs = crudos || [];
  /* ── SIN EVENTOS NO ES SIN NOMBRES ──
     Con la lista vacía se devolvía todo vacío, incluidos `alias` y
     `nombreActor`. Pero /historial pinta sus chips de «quién» con el CONTEO
     del periodo, que no está vacío aunque la página filtrada sí lo esté: al
     elegir una combinación sin resultados, los chips pasaban a decir «— · 212»
     y se perdía la forma de cambiar de persona. Quien pide actores, los recibe
     aunque no haya ni un evento que nombrar. */
  if (!evs.length) {
    if (!conActores) return { eventos: [], alias: {}, nombreActor: new Map() };
    const [pf, al] = await Promise.all([
      sb.from("perfiles").select("id,nombre"),
      sb.from("personas").select("usuario_id,alias")
        .not("alias", "is", null).not("usuario_id", "is", null),
    ]);
    return {
      eventos: [],
      alias: mapaAlias((al as any).data),
      nombreActor: new Map<string, string>(((pf as any).data || []).map((x: any) => [x.id, x.nombre])),
    };
  }

  /* Los cambios de RESPONSABLE los escribe el trigger con el id del perfil en
     `de`/`a`, no el nombre — antes salían como uuid crudo en pantalla. */
  const perfilIds = new Set<string>();
  for (const x of evs) {
    if (x.tipo === "estado" && x.detalle?.campo === "responsable") {
      if (x.detalle.de) perfilIds.add(x.detalle.de);
      if (x.detalle.a) perfilIds.add(x.detalle.a);
    }
  }

  const [perfilesTodos, aliasPers, resps, nombre] = await Promise.all([
    conActores ? sb.from("perfiles").select("id,nombre") : Promise.resolve({ data: [] }),
    sb.from("personas").select("usuario_id,alias")
      .not("alias", "is", null).not("usuario_id", "is", null),
    perfilIds.size
      ? sb.from("perfiles").select("id,nombre").in("id", [...perfilIds])
      : Promise.resolve({ data: [] }),
    nombresDe(sb, evs.map((x: any) => ({ tipo: x.entidad_tipo, id: x.entidad_id }))),
  ]);

  const nombreActor = new Map<string, string>(
    ((perfilesTodos as any).data || []).map((x: any) => [x.id, x.nombre]));
  const alias = mapaAlias((aliasPers as any).data);

  const perfilNom = new Map<string, string>();
  ((resps as any).data || []).forEach((r: any) => perfilNom.set(r.id, r.nombre));
  // Un id que ya no existe (perfil borrado) se muestra tal cual antes que romper.
  const persDe = (v: any) => v ? (perfilNom.get(v) || v) : "sin asignar";

  const eventos: Evento[] = evs.map((x: any) => ({
    ...x,
    detalle: x.tipo === "estado" && x.detalle?.campo === "responsable"
      ? { ...x.detalle, de: persDe(x.detalle.de), a: persDe(x.detalle.a) }
      : x.detalle,
    // Canónico: el evento puede venir en plural (trigger) o singular (a mano).
    entidadNombre: nombre.get(`${tipoCanonico(x.entidad_tipo || "")}:${x.entidad_id}`),
    actor: x.actor
      ? { ...x.actor, nombre: cortoActor(x.actor.nombre), alias: alias[x.actor_id] }
      : x.actor,
  }));

  return { eventos, alias, nombreActor };
}

/** Los eventos partidos por jornada, en el orden en que llegaron (más nuevo
 *  primero). Cuarenta líneas seguidas sin un corte de fecha no se leen: no se
 *  sabe si lo de arriba pasó hace diez minutos o hace tres semanas. */
export function porDias<T extends { creado_en: string }>(evs: T[]): [string, T[]][] {
  const dias: [string, T[]][] = [];
  for (const x of evs) {
    const d = diaLima(x.creado_en);
    const ult = dias[dias.length - 1];
    if (ult && ult[0] === d) ult[1].push(x); else dias.push([d, [x]]);
  }
  return dias;
}
