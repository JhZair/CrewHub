import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { FUERA_DE_INVENTARIO, NECESITA_ATENCION } from "@/lib/estadosEquipo";
import { TOPE_API } from "@/lib/api";
import type { KitVista, EqBase } from "@/lib/kits";
/* El árbol vive en `lib/ensamblados`, que no toca la base: `PanelEnsamblados`
   es de cliente y usa sus funciones como valores, así que no puede colgar de
   un módulo que importe `lib/supabase/server`. Ver el aviso de allí. */
import { arbolDeEnsamblados } from "@/lib/ensamblados";
import { resolvedorDeGuardado, type Sitio } from "@/lib/sitios";

/* ══════════════════════════════════════════════════════════════════════════
   LOS DATOS DE 🎥 EQUIPOS, PEDIDOS UNA SOLA VEZ

   ── POR QUÉ EXISTE ESTE ARCHIVO ──
   `/equipamiento` era UNA pantalla de 1101 líneas con quince consultas y
   cuatro bloques dentro: el inventario con sus filtros, la entrega en lote,
   quién tiene qué, y los combos y kits. Se sentía cargada porque lo estaba.

   Y lo peor no eran las consultas: era el PAYLOAD. `EntregaLote`, `PanelKits`
   y `PanelCombos` son componentes de cliente, y los tres recibían el
   inventario COMPLETO como prop. La tabla de equipos —`select("*")`, más de
   quinientas filas— cruzaba al navegador tres veces en cada visita, para
   llenar dos paneles que además nacen PLEGADOS.

   Ahora son rutas hermanas —inventario · entrega · combos y kits—, y cada una
   pide lo suyo. Lo que comparten vive aquí para que no puedan discrepar: si el
   dueño de un equipo se calculara de dos maneras, una pestaña diría que la
   cámara la tiene Katy y la otra que está libre.

   ── `cache()` DEDUPLICA POR RENDER ──
   El layout pinta la cabecera y la pestaña pinta su contenido en el MISMO
   pase, así que dos llamadas con el mismo argumento hacen un solo viaje. Es el
   mismo mecanismo que `lib/fondoDatos.ts`, y valen sus dos avisos: no funciona
   dentro de una Server Action, y en navegación suave entre pestañas hermanas
   Next no repinta el layout, así que ahí no hay nada que deduplicar.

   ── FLACO O GORDO, SEGÚN QUIÉN PREGUNTE ──
   ⚠ `select("*")` solo lo pide el INVENTARIO, porque calcula la completitud de
   cada ficha y necesita todas las columnas. La entrega y los kits piden doce
   campos: un equipo tiene veintitantas columnas —serie, notas, fechas de
   compra, garantía— y ninguna se pinta ahí.
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo que la entrega y los kits necesitan de un equipo. Nada más. */
/* ⚠ `guardado_sitio` y `guardado_en_equipo` NO sobran. La cadena de «dónde se
   guarda» se resuelve con ESTAS filas, y sin las dos columnas el resolvedor
   corta en el primer eslabón: un kit guardado en el Bolso Tenba decía «Bolso
   Tenba» y nunca «Depósito › Cajón 08 › Bolso Tenba», con `roto: false` — o
   sea indistinguible de un bolso que de verdad no tiene sitio. Y la ficha del
   equipo, que sí las traía, decía la cadena entera: el mismo bolso, dos
   respuestas, que es exactamente lo que `lib/sitios` existe para impedir. */
const CAMPOS_FLACO =
  "id,folio,nombre,categoria,subcategoria,estado,valor_compra,compra_id,ensamblado_en"
  + ",guardado_sitio,guardado_en_equipo";

/* ── LAS FILAS EN CRUDO ────────────────────────────────────────────────── */

/** Cuántos equipos se pueden traer de verdad. `TOPE_API - 1` deja sitio a la
 *  fila de sonda: se pide uno más y, si vuelve, es que se cortó. Sin eso, mil
 *  filas y «hay exactamente mil» se ven igual — y todo lo que la pantalla
 *  calcula encima (los contadores de los filtros, el valor del inventario,
 *  dentro de qué va cada pieza) se quedaría corto en silencio. */
export const TOPE_EQUIPOS = TOPE_API - 1;

/** Los equipos con TODAS sus columnas: solo el inventario las necesita.
 *  ⚠ CON límite y sonda. Estaba sin `.limit()`, que no es «sin techo»: es el
 *  techo de PostgREST —mil— sin forma de saber que se tocó. Hoy son ~500, pero
 *  el día que se pasen, la pantalla habría seguido pintando totales y chips
 *  como si nada faltara. Quien lee esto mira `data.length > TOPE_EQUIPOS`. */
export const equiposGordos = cache(async () => {
  const supabase = createClient();
  // `*`: para calcular la completitud de la ficha de cada equipo.
  return supabase.from("equipamiento").select("*").order("folio")
    .limit(TOPE_EQUIPOS + 1);
});

/** Los equipos con lo justo para nombrarlos, valorarlos y agruparlos.
 *  ⚠ Con límite y sonda, igual que `equiposGordos`. Estaba sin `.limit()`, que
 *  no es «sin techo»: es el de PostgREST sin forma de saber que se tocó — y
 *  aquí eso hace algo peor que faltar filas, hace acusar. El chip «🔧 dentro de
 *  qué va» busca al anfitrión en esta misma lista: si el anfitrión no llegó, la
 *  pieza diría «apunta a un equipo que no está» sobre una base sana. */
export const equiposFlacos = cache(async () => {
  const supabase = createClient();
  return supabase.from("equipamiento").select(CAMPOS_FLACO).order("folio")
    .limit(TOPE_EQUIPOS + 1);
});

/* ── CUÁNTAS FOTOS TIENE CADA EQUIPO ──
   Solo el número: las URLs se piden al pulsar el chip. Quinientas filas × tres
   fotos son doscientos kilobytes de direcciones que casi nadie llega a abrir.

   ⚠ Devuelve `null` —y no un mapa vacío— si la consulta falla o si toca el
   tope. Un mapa vacío pinta cero chips y se lee como «ningún equipo tiene
   fotos», que sobre un inventario con fotos es la respuesta equivocada a algo
   que nadie preguntó. Con `null`, el chip no se pinta porque no se sabe. */
export const TOPE_FOTOS = TOPE_API - 1;

export const fotosPorEquipo = cache(async (): Promise<Map<string, number> | null> => {
  const supabase = createClient();
  const { data, error } = await supabase.from("entidad_foto")
    .select("entidad_id").eq("entidad_tipo", "equipamiento").limit(TOPE_FOTOS + 1);
  if (error || !data || data.length > TOPE_FOTOS) return null;
  const m = new Map<string, number>();
  data.forEach((f: any) => m.set(f.entidad_id, (m.get(f.entidad_id) || 0) + 1));
  return m;
});

/* ── LOS SITIOS DONDE SE GUARDA LO DEMÁS ──
   Muebles y estantes: `sitios`, no `lugares` —esos son locaciones de rodaje,
   con dirección y latitud—. El porqué entero, en db/sitios.sql.

   ⚠ Con límite y sonda como todo lo demás. Hoy son cuatro cajones; el día que
   sean mil, un `select` sin techo devolvería novecientos noventa y nueve y la
   cadena de los que faltan diría «apunta a un sitio que ya no está» sobre una
   base sana. Es el mismo fallo que ya pagó `equiposFlacos`. */
export const TOPE_SITIOS = TOPE_API - 1;

export const sitiosTodos = cache(async () => {
  const supabase = createClient();
  return supabase.from("sitios").select("id,nombre,dentro_de")
    .order("nombre").limit(TOPE_SITIOS + 1);
});

/** Carteles (miniatura) de cada equipo. Una lista sin foto obliga a leer folio
 *  por folio; con foto se reconoce de un vistazo cuál falta. */
export const cartelesEquipo = cache(async () => {
  const supabase = createClient();
  return supabase.from("entidad_media")
    .select("entidad_id,cartel_url").eq("entidad_tipo", "equipamiento");
});

/** Las compras: donde vive el precio de lo que se compró junto. Es lo que hace
 *  que el valor del inventario deje de ir corto. */
export const comprasCombo = cache(async () => {
  const supabase = createClient();
  return supabase.from("compras")
    .select("id,codigo,nombre,proveedor,total,moneda,fecha,comprobante_url,link,nota")
    .order("fecha", { ascending: false, nullsFirst: false });
});

/** Los kits y su tabla puente: qué sale junto. */
export const kitsCrudos = cache(async () => {
  const supabase = createClient();
  const [kits, puente] = await Promise.all([
    supabase.from("kits")
      .select("id,nombre,uso,descripcion,retirado_en,portada_equipo_id,guardado_sitio,guardado_en_equipo,autor:perfiles(nombre,avatar_url,color)")
      .order("nombre"),
    supabase.from("kit_equipos").select("kit_id,equipamiento_id"),
  ]);
  return { kits, puente };
});

/** Lo que está en manos de alguien AHORA. Sin esto, el panel de kits solo
 *  puede decir «no disponible», que no sirve: lo que hace falta saber es a
 *  quién llamar. */
/* `nota` y `reanuda_id` viajan aunque la pestaña de entrega no los use.
   · La nota es lo que distingue una asignación útil de una fila: «puesto de
     post», «dotación 2026». Es el único campo que dice POR QUÉ es suya.
   · `reanuda_id` es cómo se encuentra una asignación APARTADA. Una asignación
     suspendida por un rodaje está cerrada —tiene `hasta`—, así que no sale por
     `hasta is null`: se llega a ella desde el préstamo que la apartó. */
const CAMPOS_CUSTODIA =
  "id,desde,hasta,kit_id,tipo,nota,reanuda_id"
  + ",equipo:equipamiento(id,folio,nombre,categoria,subcategoria,estado,valor_compra,compra_id)"
  + ",persona:personas(id,nombre,alias,foto_url)"
  + ",proy:proyectos(id,nombre)"
  + ",entrego:perfiles!equipo_prestamos_entregado_por_fkey(id,nombre,avatar_url)";

export const enManosAhora = cache(async () => {
  const supabase = createClient();
  /* ⚠ `creado_en` desempata. `desde` es una FECHA suelta —db/prestamo-creado-en
     .sql— y las dos custodias abiertas de un equipo apartado se crean el MISMO
     día: empatan, y Postgres las devuelve en el orden que quiera. Quién sale
     como «lo tiene» cambiaba entre dos visitas sin que nada se hubiera tocado. */
  return supabase.from("equipo_prestamos").select(CAMPOS_CUSTODIA)
    .is("hasta", null)
    .order("desde", { ascending: false })
    .order("creado_en", { ascending: false, nullsFirst: false });
});

/** Las asignaciones que un préstamo abierto tiene APARTADAS. Segunda consulta
 *  y no un `or(...)`: se necesitan los ids de la primera para pedir estas, y un
 *  filtro compuesto sobre la misma tabla no puede expresar «las que apunta el
 *  otro lado». Son pocas —tantas como equipos asignados fuera ahora mismo— y
 *  solo se piden si hay alguna. */
export async function asignacionesApartadas(abiertas: any[]) {
  const ids = [...new Set(abiertas.map((p: any) => p.reanuda_id).filter(Boolean))] as string[];
  if (!ids.length) return { data: [] as any[], error: null };
  const supabase = createClient();
  return supabase.from("equipo_prestamos").select(CAMPOS_CUSTODIA).in("id", ids);
}

/** A quién y para qué proyecto se entrega. Personas —no perfiles—: quien se
 *  lleva una cámara puede no tener cuenta. */
export const catalogosEntrega = cache(async () => {
  const supabase = createClient();
  const [personas, proyectos] = await Promise.all([
    supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
    supabase.from("proyectos").select("id,nombre").order("nombre"),
  ]);
  return {
    /* El alias pegado al nombre: en el desplegable hay que reconocer a la
       persona, y media plantilla se llama por el alias. */
    personas: (personas.data || []).map((x: any) =>
      ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre })),
    proyectos: proyectos.data || [],
  };
});

/* ── LO DERIVADO ──────────────────────────────────────────────────────────
   Puro cálculo sobre lo que ya está en memoria. Ninguna de estas funciones
   viaja a la red, y ninguna cruza a un componente de cliente: lo que cruza son
   sus RESULTADOS, ya resueltos.
   ────────────────────────────────────────────────────────────────────────── */

/** Objeto o arreglo según cómo PostgREST resuelva la relación. Leer solo una
 *  de las dos formas deja el dato en blanco sin que nada falle. */
export const un1 = (v: any) => (Array.isArray(v) ? v[0] : v);

export function cartelPorEquipo(media: any): Map<string, string> {
  const m = new Map<string, string>();
  (media?.data || []).forEach((x: any) => { if (x.cartel_url) m.set(x.entidad_id, x.cartel_url); });
  return m;
}

/* ⚠ EL PRIMERO GANA, no el último.
   `enManosAhora` viene ordenada por `desde` DESCENDENTE, así que la primera
   fila de un equipo es su custodia más reciente. Esto hacía `m.set` en cada
   vuelta y se quedaba con la ÚLTIMA de una lista descendente — o sea con la
   más ANTIGUA. No debería haber dos custodias abiertas del mismo equipo, pero
   las hay: una asignación apartada por un préstamo es exactamente eso, y en
   esos equipos la fila decía el nombre de quien lo tenía antes.
   Y no se puede arreglar dando la vuelta al orden de la consulta: `desde` es
   una fecha suelta —lo dice db/prestamo-creado-en.sql— y las dos filas empatan
   el mismo día. Con `if (!m.has(...))` gana la primera, que con este orden es
   la buena, y el empate lo rompe `creado_en` en la propia consulta. */
export function quienTieneEquipo(enManos: any): Map<string, string> {
  const m = new Map<string, string>();
  (enManos?.data || []).forEach((p: any) => {
    const eq = un1(p.equipo), per = un1(p.persona);
    if (eq?.id && !m.has(eq.id)) m.set(eq.id, per?.alias || per?.nombre || "alguien");
  });
  return m;
}

/** Los kits tal como viajan a las pantallas, y en qué kits está cada equipo. */
export function contextoKits(crudos: { kits: any; puente: any }) {
  /* `equipoIds` en el orden en que se armó el kit, no el de la tabla puente:
     un kit se lee como una lista de empaque y el orden es parte de lo que
     alguien decidió. */
  const eqsDeKit = new Map<string, string[]>();
  (crudos.puente?.data || []).forEach((r: any) =>
    eqsDeKit.set(r.kit_id, [...(eqsDeKit.get(r.kit_id) || []), r.equipamiento_id]));

  const kits: KitVista[] = (crudos.kits?.data || []).map((k: any) => ({
    id: k.id, nombre: k.nombre, uso: k.uso, descripcion: k.descripcion,
    retirado: !!k.retirado_en, equipoIds: eqsDeKit.get(k.id) || [],
    portadaId: k.portada_equipo_id || null,
    autor: un1(k.autor) || null,
    guardadoSitio: k.guardado_sitio || null,
    guardadoEnEquipo: k.guardado_en_equipo || null,
  }));

  /* Con el id, no solo el nombre: el nombre basta para pintar el chip, pero
     para agrupar hace falta poder EXCLUIR el kit que se está mirando, y dos
     kits pueden llamarse parecido. */
  const kitsPorEq = new Map<string, { id: string; nombre: string }[]>();
  kits.filter(k => !k.retirado).forEach(k =>
    k.equipoIds.forEach(id => kitsPorEq.set(id, [...(kitsPorEq.get(id) || []), { id: k.id, nombre: k.nombre }])));

  return { kits, kitsPorEq, eqsDeKit, error: (crudos.kits as any)?.error?.message || null };
}

/** Los combos con lo que trajo cada uno, y cuánto le toca a cada pieza. */
/**
 * CUÁNTO LE TOCA A CADA PIEZA de un combo: el total de la boleta menos lo que
 * ya está valorado pieza a pieza, repartido entre las que no tienen precio
 * propio. Una pieza sola no puede calcularlo —no conoce a sus hermanas— y por
 * eso viaja ya resuelto.
 *
 * Aparte de `contextoCombos` a propósito: el inventario necesita ESTO para
 * pintar el precio de las piezas montadas, y no necesita nada más de allí.
 * Llamar a `contextoCombos` entero le costaría recorrer quinientos equipos
 * para armar `nUnidades`, `categorias`, `cartel`, `nVivas` y `nProblema` —los
 * cinco campos que se sacaron de esa pantalla justamente por eso—.
 */
export function repartoPorPieza(
  eqs: any[], compras: any, porCombo?: Map<string, any[]>,
): Map<string, number> {
  const grupos = porCombo ?? (() => {
    const m = new Map<string, any[]>();
    (eqs || []).forEach((e: any) => {
      if (e.compra_id) m.set(e.compra_id, [...(m.get(e.compra_id) || []), e]);
    });
    return m;
  })();
  const r = new Map<string, number>();
  ((compras?.data || []) as any[]).forEach((c: any) => {
    const us = grupos.get(c.id) || [];
    const total = Number(c.total) || 0;
    if (!total || !us.length) return;
    const yaValorado = us.reduce((a: number, u: any) => a + (Number(u.valor_compra) || 0), 0);
    const sinPrecio = us.filter((u: any) => !(Number(u.valor_compra) > 0)).length;
    if (!sinPrecio) return;
    r.set(c.id, Math.max(0, total - yaValorado) / sinPrecio);
  });
  return r;
}

export function contextoCombos(eqs: any[], compras: any, cartelPorEq: Map<string, string>) {
  /* Cada combo con sus unidades. Se cuenta aquí, sobre `eqs`, que ya está en
     memoria: una consulta por combo serían N viajes para un número. */
  const porCombo = new Map<string, any[]>();
  (eqs || []).forEach((e: any) => {
    if (e.compra_id) porCombo.set(e.compra_id, [...(porCombo.get(e.compra_id) || []), e]);
  });

  const combos = ((compras?.data || []) as any[]).map((c: any) => {
    const us = porCombo.get(c.id) || [];
    return {
      ...c,
      nUnidades: us.length,
      categorias: [...new Set(us.map((u: any) => (u.categoria || "").trim()).filter(Boolean))],
      /* La foto de la primera unidad que tenga una. Un combo no tiene imagen
         propia —no es una cosa, es una compra— pero SÍ tiene cara: la del
         aparato que se compró. */
      cartel: us.map((u: any) => cartelPorEq.get(u.id)).find(Boolean) || null,
      nVivas: us.filter((u: any) => !FUERA_DE_INVENTARIO.includes(u.estado)).length,
      nProblema: us.filter((u: any) => NECESITA_ATENCION.includes(u.estado) || u.estado === "de_baja").length,
    };
  });

  const porPiezaDeCombo = repartoPorPieza(eqs, compras, porCombo);

  const comboPorEq = new Map<string, any>();
  (eqs || []).forEach((x: any) => {
    if (x.compra_id) {
      const cb = combos.find((k: any) => k.id === x.compra_id);
      if (cb) comboPorEq.set(x.id, cb);
    }
  });

  return { combos, porCombo, porPiezaDeCombo, comboPorEq };
}

/** Qué piezas lleva montadas cada equipo, con su precio resuelto. */
export function piezasMontadas(
  eqs: any[], cartelPorEq: Map<string, string>,
  comboPorEq: Map<string, any>, porPiezaDeCombo: Map<string, number>,
) {
  const piezasDe = new Map<string, any[]>();
  (eqs || []).forEach((e: any) => {
    if (!e.ensamblado_en) return;
    /* Solo lo justo para la lista del pop-up: mandar el equipo entero sería
       repetir sus veinte columnas dentro de cada fila que lo menciona.
       Con su precio —propio o el que le toca de su combo— porque el total de
       un kit tiene que incluir lo que va atornillado dentro de sus piezas. */
    const cbm = comboPorEq.get(e.id);
    piezasDe.set(e.ensamblado_en, [...(piezasDe.get(e.ensamblado_en) || []), {
      id: e.id, folio: e.folio, nombre: e.nombre, estado: e.estado,
      cartel: cartelPorEq.get(e.id) || null,
      valor: e.valor_compra ? Number(e.valor_compra) : null,
      combo: cbm ? { codigo: cbm.codigo, nombre: cbm.nombre,
        total: cbm.total != null ? Number(cbm.total) : null,
        porPieza: porPiezaDeCombo.get(cbm.id) ?? null } : null,
    }]);
  });
  return piezasDe;
}

/* ══════════════════════════════════════════════════════════════════════════
   EL INVENTARIO COMO LO PIDEN LA ENTREGA Y LOS KITS

   ⚠ Esto es lo que CRUZA al navegador, así que cada campo se paga en cada
   visita. Lo que hay aquí es lo que los dos paneles pintan de verdad; nada
   más. Antes cruzaba `{...e}` —la fila entera de `select("*")`— por cada
   equipo y por cada uno de los dos paneles.
   ══════════════════════════════════════════════════════════════════════════ */
export type EquipoParaPanel = EqBase & {
  valor_compra?: number | string | null;
  compra_id?: string | null;
  piezas?: any[];
  /* ── DENTRO DE QUÉ VA, YA RESUELTO ──
     `ensamblado_en` ya se pedía en `CAMPOS_FLACO` y `piezasMontadas` lo usaba
     para mirar la relación DESDE EL ANFITRIÓN —qué lleva dentro—; lo que no
     cruzaba a los paneles era el otro sentido, dentro de qué va esta pieza.
     Se veía en
     el escogedor de kits, que decía «está montado en otro equipo» sin decir en
     cuál — y para averiguarlo había que cerrar el modal y perder lo marcado.
     Se resuelve aquí y no en el cliente: el anfitrión sale de estas mismas
     filas, y hacerlo allá obligaría a mandar el inventario entero dos veces. */
  anfitrion?: {
    id: string; folio: string | null; nombre: string;
    estado: string | null; cartel: string | null; quien: string | null;
  } | null;
  /** Si la fila SEÑALA a alguien, aunque no se haya encontrado. Distingue «no
   *  dice dentro de qué» de «señala a uno que no está en esta lista». */
  apunta?: boolean;
  /** Cuántas fotos tiene. `null` = no se sabe —la consulta falló o tocó el
   *  tope—, que no es lo mismo que cero. */
  nFotos?: number | null;
  /* ── DÓNDE SE GUARDA, EN CRUDO ──
     Los dos punteros y el del ensamblado viajan para que el selector de
     «dónde se guarda» pueda excluir a los descendientes: lo que va DENTRO de
     una cosa no puede contenerla, y ofrecerlo para luego rechazarlo con un
     error es peor que no ofrecerlo. La CADENA resuelta no viaja por equipo —se
     resuelve una vez en el servidor— pero estos tres campos son tres cadenas
     cortas por fila y ya estaban en `CAMPOS_FLACO`. */
  ensamblado_en?: string | null;
  guardado_sitio?: string | null;
  guardado_en_equipo?: string | null;
};

export function inventarioParaPaneles(
  eqs: any[],
  quienTiene: Map<string, string>,
  cartelPorEq: Map<string, string>,
  comboPorEq: Map<string, any>,
  porPiezaDeCombo: Map<string, number>,
  kitsPorEq: Map<string, { id: string; nombre: string }[]>,
  piezasDe: Map<string, any[]>,
  nFotosPorEq: Map<string, number> | null,
): EquipoParaPanel[] {
  const porId = new Map<string, any>((eqs || []).map((e: any) => [e.id, e]));
  return (eqs || []).map((e: any) => {
    const cb = comboPorEq.get(e.id);
    const anf = e.ensamblado_en ? porId.get(e.ensamblado_en) : null;
    return {
      id: e.id, folio: e.folio, nombre: e.nombre,
      categoria: e.categoria, subcategoria: e.subcategoria, estado: e.estado,
      valor_compra: e.valor_compra ?? null, compra_id: e.compra_id ?? null,
      ensamblado_en: e.ensamblado_en ?? null,
      guardado_sitio: e.guardado_sitio ?? null,
      guardado_en_equipo: e.guardado_en_equipo ?? null,
      quien: quienTiene.get(e.id) || null,
      cartel: cartelPorEq.get(e.id) || null,
      /* Solo lo justo para nombrarlo. El combo entero trae total, moneda,
         comprobante y proveedor; mandarlo repetido en doscientas filas sería
         mover el mismo objeto doscientas veces para pintar dos palabras. */
      /* ⚠ `moneda` también: sin ella el chip del combo formatea con «S/» por
         defecto y una boleta en dólares saldría con el símbolo equivocado. Es
         un escalar corto; el resto del combo sigue sin viajar. */
      combo: cb ? { codigo: cb.codigo, nombre: cb.nombre, nUnidades: cb.nUnidades,
        total: cb.total != null ? Number(cb.total) : null,
        moneda: cb.moneda ?? null,
        porPieza: porPiezaDeCombo.get(cb.id) ?? null } : null,
      kits: kitsPorEq.get(e.id) || [],
      /* Va con piezas dentro. Al entregar hay que decirlo: quien lo recibe
         firma por un monopod, no por un monopod y tres piezas sueltas — y a la
         vuelta es lo que hay que contar. */
      piezas: piezasDe.get(e.id) || [],
      /* Solo en las filas que son pieza de algo: un `null` por equipo en
         quinientas filas es medio kilobyte de decir «no». */
      ...(e.ensamblado_en || e.estado === "ensamblado" ? {
        apunta: !!e.ensamblado_en,
        anfitrion: anf ? {
          id: anf.id, folio: anf.folio || null, nombre: anf.nombre || "sin nombre",
          estado: anf.estado || null, cartel: cartelPorEq.get(anf.id) || null,
          quien: quienTiene.get(anf.id) || null,
        } : null,
      } : {}),
      /* Igual con las fotos: solo cuando hay alguna, o cuando no se sabe. */
      ...(nFotosPorEq === null ? { nFotos: null }
        : nFotosPorEq.get(e.id) ? { nFotos: nFotosPorEq.get(e.id) } : {}),
    };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE COMPARTEN LA ENTREGA Y LOS COMBOS

   Las dos pestañas necesitan exactamente lo mismo del inventario, así que
   pedirlo por separado sería escribir dos veces la misma cadena de cálculos —y
   que una se corrija y la otra no. Devuelve además `enManos` en crudo, que la
   entrega usa para pintar quién tiene qué.
   ══════════════════════════════════════════════════════════════════════════ */
export async function inventarioDePaneles() {
  const [eqs, media, compras, kitsRaw, manos, nFotosPorEq, sitios] = await Promise.all([
    equiposFlacos(), cartelesEquipo(), comprasCombo(), kitsCrudos(), enManosAhora(),
    fotosPorEquipo(), sitiosTodos(),
  ]);
  const filas = (eqs.data || []) as any[];
  const cartelPorEq = cartelPorEquipo(media);
  const { combos, porPiezaDeCombo, comboPorEq } = contextoCombos(filas, compras, cartelPorEq);
  const { kits, kitsPorEq, error: eKits } = contextoKits(kitsRaw);
  /* La ruta de cada kit, resuelta AQUÍ y no en el panel: el panel es de
     cliente y resolverla allí obligaría a mandarle los quinientos equipos y
     los sitios enteros para pintar catorce renglones de texto. */
  const listaSitios = ((sitios as any)?.data || []) as Sitio[];
  const dondeSeGuarda = resolvedorDeGuardado(listaSitios, filas as any);
  kits.forEach(k => {
    k.guardado = dondeSeGuarda.deKit({
      guardado_sitio: k.guardadoSitio, guardado_en_equipo: k.guardadoEnEquipo,
    });
  });
  const quienTiene = quienTieneEquipo(manos);
  const piezasDe = piezasMontadas(filas, cartelPorEq, comboPorEq, porPiezaDeCombo);
  return {
    equipos: inventarioParaPaneles(filas, quienTiene, cartelPorEq, comboPorEq,
      porPiezaDeCombo, kitsPorEq, piezasDe, nFotosPorEq),
    /* Si el inventario llegó al tope, quien pinte «🔧 dentro de qué va» tiene
       que saberlo: sin esto acusaría a la base de un puntero roto cuando lo que
       faltó fue la fila del anfitrión. */
    cortado: filas.length > TOPE_EQUIPOS,
    combos, kits, eKits,
    enManos: manos.data || [],
    /* Los tres mapas los usa la pestaña de entrega para aplanar «quién tiene
       qué»: la foto, de qué combo vino y qué lleva montado dentro. Van aquí
       —y no se recalculan allá— porque salen de las mismas filas. */
    cartelPorEq, comboPorEq, piezasDe,
    /* Los sitios y el resolvedor viajan para que los paneles no los pidan otra
       vez. `sitios` va a los selectores; `dondeSeGuarda` se queda en el
       servidor —es una función, no cruza— y aquí solo se usa para los kits. */
    sitios: listaSitios,
    sitiosCortados: listaSitios.length > TOPE_SITIOS,
    /* ⚠ El error de la lista de equipos se DEVUELVE, no se traga. Sin equipos,
       la entrega dice «no hay nada disponible» y el panel de kits dice que
       todas las piezas faltan: dos mentiras en la dirección que más alarma. */
    eEquipos: (eqs as any)?.error?.message || null,
    eManos: (manos as any)?.error?.message || null,
  };
}

/** Lo que necesita la pestaña 🔧 Ensamblados, y nada más. */
export const arbolEnsamblados = cache(async () => {
  const [eqs, media, manos] = await Promise.all([
    equiposFlacos(), cartelesEquipo(), enManosAhora(),
  ]);
  const filas = (eqs.data || []) as any[];
  const cartelPorEq = cartelPorEquipo(media);
  const quienTiene = quienTieneEquipo(manos);
  const { raices, sueltas } = arbolDeEnsamblados(filas, cartelPorEq, quienTiene);

  /* ── LOS CANDIDATOS A MONTAR ──
     ⚠ LISTA BLANCA, no una lista de exclusiones. Estuvo escrito al revés —«ni
     montado, ni prestado»— y la lista negra siempre olvida un caso: dejaba
     pasar `perdido`, `de_baja`, `asignado` y el estado vacío. Y `ensamblar`
     hace `update({ estado: "ensamblado" })`, o sea que montar un equipo perdido
     BORRA el único sitio donde constaba que estaba perdido, y montar la laptop
     asignada a Michel la desasigna sin decir nada. Son los mismos tres estados
     que ofrece la ficha del equipo (`app/entidad/[tipo]/[id]`), y por el mismo
     motivo: lo que está en la calle o de baja no se atornilla. */
  const MONTABLES = new Set(["disponible", "no_aparece", "en_reparacion"]);
  const candidatos = filas
    .filter(e => !e.ensamblado_en && MONTABLES.has(String(e.estado || "")))
    .map(e => ({
      id: e.id, folio: e.folio || null, nombre: e.nombre || "sin nombre",
      categoria: e.categoria || null, subcategoria: e.subcategoria || null,
      estado: e.estado || null, cartel: cartelPorEq.get(e.id) || null,
      valor: e.valor_compra != null ? Number(e.valor_compra) : null,
    }));

  return {
    raices, sueltas, candidatos,
    /* Si el inventario llegó al tope, una pieza «perdida» no acusa a la base:
       lo que falta es media lista. La pantalla lo dice con otras palabras. */
    cortado: filas.length > TOPE_EQUIPOS,
    eEquipos: (eqs as any)?.error?.message || null,
  };
});
