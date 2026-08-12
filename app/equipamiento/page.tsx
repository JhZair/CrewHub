import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import BotonComprobar from "@/components/BotonComprobar";
import EntregaLote from "@/components/EntregaLote";
import PanelKits from "@/components/PanelKits";
import PanelCombos from "@/components/PanelCombos";
import FilasEquipo from "@/components/FilasEquipo";
import { valorInventario, soles } from "@/lib/compras";
import { ESTADOS_EQUIPO, NECESITA_ATENCION, FUERA_DE_INVENTARIO, metaEstado, txtEstadoEq } from "@/lib/estadosEquipo";
import type { KitVista } from "@/lib/kits";
import EnUsoAhora, { type UsoItem } from "@/components/EnUsoAhora";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { buscadorDe, pal } from "@/lib/buscar";
import { completitud, AYUDA_CATEGORIA, CATEGORIAS_EQUIPO, SUBCATS_EQUIPO } from "@/lib/entidades";
import { TXT } from "@/lib/texto";
import Completitud from "@/components/Completitud";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🎥 Equipos" };

const diasDesde = (f: string) => Math.floor((Date.now() - new Date(f + "T12:00:00").getTime()) / 86400000);

/* Los rótulos y colores salen de lib/estadosEquipo. Esta copia decía que
   «en uso» era amarillo y todas las demás pantallas lo pintaban azul. */
const EST_META: Record<string, [string, string]> = Object.fromEntries(
  ESTADOS_EQUIPO.map(e => [e.k, [e.plural, e.color] as [string, string]]));

/* ── LA CATEGORÍA DE UN EQUIPO, UNA SOLA VEZ ──
   El chip contaba `x.categoria || "sin categoría"` y el filtro comparaba
   `(x.categoria || "") === c`. Las dos líneas parecen decir lo mismo y no lo
   dicen: el chip decía «sin categoría · 9» y al pulsarlo la lista salía con
   «0 resultados», porque el filtro comparaba «» contra «sin categoría».
   Ni el contador ni el filtro fallaban por su cuenta —cada uno era correcto
   consigo mismo—; fallaba que fueran dos. */
const SIN_CAT = "sin categoría";
const SIN_SUB = "sin subcategoría";
const catDe = (x: any) => (x?.categoria || "").trim() || SIN_CAT;
const subDe = (x: any) => (x?.subcategoria || "").trim() || SIN_SUB;

/* ESCRITO A MANO: un valor que el desplegable no ofrece.
 *
 * No es un error —hasta que alguien añade la palabra a lib/entidades, es la
 * única forma de decir lo que una cosa es— pero es un valor con fecha de
 * caducidad: en cuanto la lista gana el término bueno, el siguiente equipo
 * igual se clasifica con el de la lista y el mismo tipo de cosa queda
 * repartido en dos subcategorías. «Luz Continua» y «Panel LED», el mismo
 * panel en dos sitios, sin que nada falle.
 *
 * Una sola definición porque la usan tres lectores —el chip del filtro, la
 * fila del listado y el aviso de la fila de subcategorías— y tres criterios
 * distintos de «esto está a mano» serían tres respuestas distintas.
 */
const catAMano = (x: any) => {
  const cat = catDe(x);
  return cat !== SIN_CAT && !CATEGORIAS_EQUIPO.includes(cat);
};
const subAMano = (x: any) => {
  const sub = subDe(x);
  if (sub === SIN_SUB) return false;
  /* Sin categoría no hay lista contra la que comparar, así que la
     subcategoría no se puede validar: cuenta como a mano. Y en «otro» la
     lista está vacía a propósito, así que TODA subcategoría suya es a mano
     —que es verdad, y además señala al equipo que necesita categoría de
     verdad. */
  return !(SUBCATS_EQUIPO[catDe(x)] || []).includes(sub);
};
const aMano = (x: any) => catAMano(x) || subAMano(x);

const TOPE = 200;
const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];

export default async function Equipamiento({ searchParams }: {
  searchParams: { q?: string; e?: string; c?: string; sc?: string; f?: string; ronda?: string; kit?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const c = searchParams?.c || "";
  const f = searchParams?.f || "";
  const sc = searchParams?.sc || "";   // subcategoría
  const ronda = searchParams?.ronda === "1";
  const kitPre = searchParams?.kit || "";   // llegó desde «🤝 Entregar» de un kit
  const listar = !!(q || e || c || sc || f || ronda);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: eqs }, { data: enManos, error: eManos }, { data: vincs }, { data: coms }, { data: media }, comsBita, comsUso, usosRec, { data: comBita }, { data: prestAll }, personasRaw, proyectosRaw, { data: kitsRaw, error: eKits }, { data: kitEqs }, { data: comprasRaw }] = await Promise.all([
    // `*`: para calcular la completitud de la ficha de cada equipo.
    supabase.from("equipamiento").select("*").order("folio"),
    supabase.from("equipo_prestamos")
      .select("id,desde,kit_id,equipo:equipamiento(id,folio,nombre,categoria,subcategoria,valor_compra,compra_id),persona:personas(id,nombre,alias,foto_url),proy:proyectos(id,nombre),entrego:perfiles!equipo_prestamos_entregado_por_fkey(id,nombre,avatar_url)")
      .is("hasta", null).order("desde", { ascending: false }),
    supabase.from("publicacion_vinculos")
      .select("entidad_id,publicacion_id,pub:publicaciones(estado)").eq("entidad_tipo", "equipamiento"),
    /* Solo los de caso: desde que los objetos del repositorio comentan en
       esta misma tabla, sin el filtro sus filas gastan el tope de PostgREST
       (1000) y el contador 💬 se queda corto en silencio. */
    supabase.from("comentarios").select("publicacion_id").not("publicacion_id", "is", null),
    // Carteles (miniatura) de cada equipo, para las listas y las tarjetas.
    supabase.from("entidad_media").select("entidad_id,cartel_url").eq("entidad_tipo", "equipamiento"),
    // Última actividad — tres fuentes que se fusionan y ordenan por fecha:
    //  (a) comentarios de la bitácora general (equipamiento_id),
    //  (b) comentarios de un uso concreto (prestamo_id),
    //  (c) eventos de uso (puesto en uso / liberado), de equipo_prestamos.
    supabase.from("comentarios")
      .select("id,cuerpo,es_dano,creado_en,autor:perfiles(nombre,avatar_url,color),equipo:equipamiento(id,folio,nombre)")
      .not("equipamiento_id", "is", null).order("creado_en", { ascending: false }).limit(12),
    supabase.from("comentarios")
      .select("id,cuerpo,es_dano,creado_en,autor:perfiles(nombre,avatar_url,color),prestamo:equipo_prestamos(id,equipo:equipamiento(id,folio,nombre))")
      .not("prestamo_id", "is", null).order("creado_en", { ascending: false }).limit(12),
    supabase.from("equipo_prestamos")
      .select("id,desde,hasta,equipo:equipamiento(id,folio,nombre),persona:personas(id,nombre,alias)")
      .order("desde", { ascending: false }).limit(12),
    // Para el contador de interacción en la bitácora de cada equipo: solo los FK
    // (livianos), sean de la bitácora suelta (equipamiento_id) o de un uso
    // (prestamo_id, que se resuelve al equipo con la tabla de préstamos).
    supabase.from("comentarios").select("equipamiento_id,prestamo_id")
      .or("equipamiento_id.not.is.null,prestamo_id.not.is.null"),
    supabase.from("equipo_prestamos").select("id,equipamiento_id"),
    /* Catálogos para la entrega en lote: a quién y para qué proyecto. Personas
       —no perfiles—: quien se lleva una cámara puede no tener cuenta. */
    supabase.from("personas").select("id,nombre,alias,tipo").order("nombre"),
    supabase.from("proyectos").select("id,nombre").order("nombre"),
    /* Los kits: qué sale junto. Dos tablas que llevaban un año en el schema
       sin una sola línea que las nombrara (ver db/kits.sql). */
    supabase.from("kits")
      .select("id,nombre,uso,descripcion,retirado_en,autor:perfiles(nombre,avatar_url,color)")
      .order("nombre"),
    supabase.from("kit_equipos").select("kit_id,equipamiento_id"),
    /* Los combos de compra: donde vive el precio de lo que se compró junto.
       Es lo que hace que el valor del inventario deje de ir corto. */
    supabase.from("compras").select("id,codigo,nombre,proveedor,total,moneda,fecha,comprobante_url,link,nota")
      .order("fecha", { ascending: false, nullsFirst: false }),
  ]);
  const personasCat = ((personasRaw as any)?.data || []).map((x: any) =>
    ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));
  const proyectosCat = (proyectosRaw as any)?.data || [];
  const un1 = (v: any) => (Array.isArray(v) ? v[0] : v);
  const cartelPorEq = new Map<string, string>();
  (media || []).forEach((m: any) => { if (m.cartel_url) cartelPorEq.set(m.entidad_id, m.cartel_url); });

  /* ── KITS ──
     `equipoIds` en el orden en que se armó el kit, no el de la tabla puente:
     un kit se lee como una lista de empaque y el orden es parte de lo que
     alguien decidió. */
  const eqsDeKit = new Map<string, string[]>();
  (kitEqs || []).forEach((r: any) =>
    eqsDeKit.set(r.kit_id, [...(eqsDeKit.get(r.kit_id) || []), r.equipamiento_id]));
  const kits: KitVista[] = (kitsRaw || []).map((k: any) => ({
    id: k.id, nombre: k.nombre, uso: k.uso, descripcion: k.descripcion,
    retirado: !!k.retirado_en, equipoIds: eqsDeKit.get(k.id) || [],
    /* Objeto o arreglo según cómo PostgREST resuelva la relación. Leer solo
       una de las dos formas deja el autor en blanco sin que nada falle. */
    autor: un1(k.autor) || null,
  }));
  const kitPorId = new Map(kits.map(k => [k.id, k]));

  /* Quién tiene cada equipo AHORA. Sin esto, el panel de kits solo puede
     decir «no disponible», que no sirve para nada: lo que hace falta saber
     es a quién llamar. */
  const quienTiene = new Map<string, string>();
  (enManos || []).forEach((p: any) => {
    const eq = un1(p.equipo), per = un1(p.persona);
    if (eq?.id) quienTiene.set(eq.id, per?.alias || per?.nombre || "alguien");
  });
  /* Cada combo con lo que trajo. Se cuenta aquí, sobre `eqs`, que ya está en
     memoria: una consulta por combo serían N viajes para un número. */
  const porCombo = new Map<string, any[]>();
  (eqs || []).forEach((e: any) => {
    if (e.compra_id) porCombo.set(e.compra_id, [...(porCombo.get(e.compra_id) || []), e]);
  });
  const combos = ((comprasRaw as any) || []).map((c: any) => {
    const us = porCombo.get(c.id) || [];
    return {
      ...c,
      nUnidades: us.length,
      /* De qué es lo que trajo, sin repetir. Se calcula aquí sobre `eqs`, que
         ya está en memoria: una consulta por combo serían N viajes para tres
         palabras. */
      categorias: [...new Set(us.map((u: any) => (u.categoria || "").trim()).filter(Boolean))],
      /* La foto de la primera unidad que tenga una. Un combo no tiene imagen
         propia —no es una cosa, es una compra— pero SÍ tiene cara: la del
         aparato que se compró. «C-004 DJI Air 3S Fly More» se reconoce por el
         drone mucho antes que por el código. */
      cartel: us.map((u: any) => cartelPorEq.get(u.id)).find(Boolean) || null,
      nVivas: us.filter((u: any) => !FUERA_DE_INVENTARIO.includes(u.estado)).length,
      nProblema: us.filter((u: any) => NECESITA_ATENCION.includes(u.estado) || u.estado === "de_baja").length,
    };
  });

  /* De qué combo y de qué kits es cada equipo, para la lista. Se arma sobre
     lo que ya está en memoria —`combos` y `eqsDeKit`—: una consulta por fila
     serían doscientos viajes para dos etiquetas. */
  /* CUÁNTO LE TOCA A CADA PIEZA de un combo. Se calcula una vez por combo,
     aquí, donde se conocen TODAS sus unidades: el total de la boleta menos lo
     que ya está valorado pieza a pieza, repartido entre las que no tienen
     precio propio. Una pieza sola no puede calcularlo —no conoce a sus
     hermanas— y por eso viaja ya resuelto. */
  const porPiezaDeCombo = new Map<string, number>();
  combos.forEach((c: any) => {
    const us = porCombo.get(c.id) || [];
    const total = Number(c.total) || 0;
    if (!total || !us.length) return;
    const yaValorado = us.reduce((a: number, u: any) => a + (Number(u.valor_compra) || 0), 0);
    const sinPrecio = us.filter((u: any) => !(Number(u.valor_compra) > 0)).length;
    if (!sinPrecio) return;
    porPiezaDeCombo.set(c.id, Math.max(0, total - yaValorado) / sinPrecio);
  });

  const comboPorEq = new Map<string, any>();
  (eqs || []).forEach((x: any) => {
    if (x.compra_id) {
      const cb = combos.find((k: any) => k.id === x.compra_id);
      if (cb) comboPorEq.set(x.id, cb);
    }
  });
  /* Con el id, no solo el nombre: el nombre basta para pintar el chip, pero
     para agrupar hace falta poder EXCLUIR el kit que se está mirando, y dos
     kits pueden llamarse parecido. */
  const kitsPorEq = new Map<string, { id: string; nombre: string }[]>();
  kits.filter(k => !k.retirado).forEach(k =>
    k.equipoIds.forEach(id => kitsPorEq.set(id, [...(kitsPorEq.get(id) || []), { id: k.id, nombre: k.nombre }])));

  /* Cuántas piezas lleva montadas cada equipo. Se cuenta sobre `eqs`, que ya
     está entero en memoria —`select("*")`—: una consulta por equipo serían
     doscientos viajes para un número. */
  const piezasDe = new Map<string, any[]>();
  (eqs || []).forEach((e: any) => {
    if (!e.ensamblado_en) return;
    /* Solo lo justo para la lista del pop-up. Mandar el equipo entero sería
       repetir sus veinte columnas dentro de cada fila que lo menciona. */
    piezasDe.set(e.ensamblado_en, [...(piezasDe.get(e.ensamblado_en) || []), {
      id: e.id, folio: e.folio, nombre: e.nombre, estado: e.estado,
      cartel: cartelPorEq.get(e.id) || null,
    }]);
  });

  const eqsConDueno = (eqs || []).map((e: any) => {
    const cb = comboPorEq.get(e.id);
    return {
      ...e, quien: quienTiene.get(e.id) || null, cartel: cartelPorEq.get(e.id) || null,
      /* Solo lo justo para nombrarlo. El combo entero trae total, moneda,
         comprobante y proveedor; mandarlo repetido en doscientas filas sería
         mover el mismo objeto doscientas veces para pintar dos palabras. */
      combo: cb ? { codigo: cb.codigo, nombre: cb.nombre, nUnidades: cb.nUnidades,
        total: cb.total != null ? Number(cb.total) : null,
        porPieza: porPiezaDeCombo.get(cb.id) ?? null } : null,
      kits: kitsPorEq.get(e.id) || [],
      /* Va con piezas dentro. Al entregar hay que decirlo: quien lo recibe
         firma por un monopod, no por un monopod y tres piezas sueltas — y a
         la vuelta es lo que hay que contar. */
      piezas: piezasDe.get(e.id) || [],
    };
  });

  /* Interacción en la bitácora de cada equipo: comentarios sueltos
     (equipamiento_id) + comentarios de sus usos (prestamo_id → equipo). */
  const prestEq = new Map<string, string>();
  (prestAll || []).forEach((p: any) => { if (p.equipamiento_id) prestEq.set(p.id, p.equipamiento_id); });
  const bitaCount = new Map<string, number>();
  (comBita || []).forEach((c: any) => {
    const eid = c.equipamiento_id || (c.prestamo_id ? prestEq.get(c.prestamo_id) : null);
    if (eid) bitaCount.set(eid, (bitaCount.get(eid) || 0) + 1);
  });

  // Fusiona las tres fuentes en una sola línea de actividad (descendente).
  const actItems: any[] = [];
  (comsBita?.data || []).forEach((c: any) => actItems.push({ at: c.creado_en, tipo: "com", eq: un1(c.equipo), autor: un1(c.autor), cuerpo: c.cuerpo, es_dano: c.es_dano }));
  (comsUso?.data || []).forEach((c: any) => actItems.push({ at: c.creado_en, tipo: "com", eq: un1(un1(c.prestamo)?.equipo), autor: un1(c.autor), cuerpo: c.cuerpo, es_dano: c.es_dano, uso: true }));
  (usosRec?.data || []).forEach((p: any) => {
    const eq = un1(p.equipo), per = un1(p.persona);
    actItems.push({ at: p.desde + "T12:00:00", tipo: "uso_ini", eq, persona: per });
    if (p.hasta) actItems.push({ at: p.hasta + "T12:00:00", tipo: "uso_fin", eq, persona: per });
  });
  // En árbol: agrupada por equipo. Cada equipo es un nodo; debajo, sus últimos
  // movimientos. Los equipos se ordenan por su actividad más reciente.
  const grupoAct = new Map<string, { eq: any; items: any[] }>();
  actItems.filter((x: any) => x.eq?.id).forEach((x: any) => {
    const g = grupoAct.get(x.eq.id) || { eq: x.eq, items: [] };
    g.items.push(x); grupoAct.set(x.eq.id, g);
  });
  const gruposAct = [...grupoAct.values()]
    .map(g => ({ eq: g.eq, items: g.items.sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5) }))
    .sort((a, b) => new Date(b.items[0].at).getTime() - new Date(a.items[0].at).getTime())
    .slice(0, 8);

  // Su vida en CrewHub+, igual que en empresas, personas y proyectos
  const comentPorPub = new Map<string, number>();
  (coms || []).forEach((x: any) => comentPorPub.set(x.publicacion_id, (comentPorPub.get(x.publicacion_id) || 0) + 1));
  type Act = { casos: number; abiertos: number; coments: number };
  const VACIO: Act = { casos: 0, abiertos: 0, coments: 0 };
  const act = new Map<string, Act>();
  (vincs || []).forEach((v: any) => {
    const a = act.get(v.entidad_id) || { ...VACIO };
    a.casos++;
    if (ABIERTOS.includes((v.pub as any)?.estado)) a.abiertos++;
    a.coments += comentPorPub.get(v.publicacion_id) || 0;
    act.set(v.entidad_id, a);
  });

  const todos = eqs || [];
  const coincide = buscadorDe(q);   // el mismo motor que el buscador global
  const porComprobar = (x: any) =>
    x.estado !== "de_baja" &&
    (!x.ultima_comprobacion || diasDesde(x.ultima_comprobacion) > 90);

  const PRUEBA_F: Record<string, (x: any) => boolean> = {
    // Sin valor no suma al inventario: el total de arriba miente por omisión
    sin_valor: x => !FUERA_DE_INVENTARIO.includes(x.estado) && !x.valor_compra,
    sin_folio: x => !x.folio,
    /* Con `catDe` y no con `!x.categoria`: una categoría que es un espacio en
       blanco NO es falsy pero sí es «sin categoría» para el chip de arriba,
       que usa `catDe`. Contar de dos maneras es lo que hacía que el chip
       dijera 9 y el listado 0 resultados. */
    sin_categoria: x => catDe(x) === SIN_CAT,
    /* SIN SUBCATEGORÍA, que es distinto de sin categoría y hasta ahora no se
       podía pedir: la fila de subcategorías solo aparece con una categoría
       elegida, así que para encontrar los sueltos había que entrar categoría
       por categoría y mirar si asomaba el chip amarillo. Ocho vueltas para
       una pregunta que se hace de una.
       Solo los que TIENEN categoría —los otros ya están en el chip de al
       lado, y contarlos dos veces haría que la suma no cuadre— y solo si su
       categoría ofrece alguna: en «otro» la lista está vacía a propósito, así
       que pedir subcategoría ahí sería marcar un deber que no se puede
       cumplir. */
    /* Categorías y subcategorías que el desplegable no ofrece. Hasta ahora
       solo se veían entrando categoría por categoría y mirando el final de
       la fila de subcategorías: nueve vueltas para saber qué hay fuera de la
       lista. Y es justo lo que hay que revisar de vez en cuando, porque cada
       una acaba partiendo en dos un tipo de equipo. */
    a_mano: aMano,
    sin_subcategoria: x => {
      const cat = catDe(x);
      return cat !== SIN_CAT && (SUBCATS_EQUIPO[cat] || []).length > 0 && subDe(x) === SIN_SUB;
    },
  };

  const filtradosTodos = todos.filter((x: any) =>
    (!e || x.estado === e) &&
    // Categoría de verdad. Antes los chips buscaban la categoría como TEXTO,
    // así que "cámara" traía también "Cuerpo de cámara" de subcategoría y
    // cualquier nombre que la mencionara: el número del chip nunca cuadraba
    // con lo que salía al hacer clic.
    (!c || catDe(x) === c) &&
    (!sc || subDe(x) === sc) &&
    (!f || PRUEBA_F[f]?.(x)) &&
    (!ronda || porComprobar(x)) &&
    /* `txtEstadoEq` además del `estado` crudo: la columna guarda
       «no_aparece» y nadie escribe eso en el buscador. Sin el rótulo
       humano, buscar «no aparece» no encontraría nada y parecería que no
       hay ninguno. */
    (!q || coincide(pal(x.nombre, x.folio, x.categoria, x.subcategoria, x.estado, txtEstadoEq(x.estado)))));
  const filtrados = filtradosTodos.slice(0, TOPE);
  const pendientesRonda = todos.filter(porComprobar).length;
  const cntF = (k: string) => todos.filter(PRUEBA_F[k]).length;

  const cnt = (est: string) => todos.filter((x: any) => x.estado === est).length;
  const valorTotal = todos
    .filter((x: any) => !FUERA_DE_INVENTARIO.includes(x.estado))
    .reduce((s: number, x: any) => s + (parseFloat(x.valor_compra) || 0), 0);
  void valorTotal;   // (lo sustituye `inv`; se conserva el cálculo por si vuelve a hacer falta)
  /* DOS cifras que no se mezclan. Lo que tiene precio propio suma por su
     cuenta; lo que no lo tiene pero vino en un combo con total, suma por el
     combo entero y una sola vez. Nunca se reparte: 1200 entre 6 piezas da
     200 por una batería que costó 60, y esa cifra inventada acabaría en un
     inventario para un seguro o para rendir un fondo. */
  const inv = valorInventario(todos as any, (comprasRaw as any) || []);
  /* «Requieren atención»: ahora incluye lo que no aparece, que es justo
     donde sirve —un equipo que nadie busca acaba perdido de verdad—. */
  const atencion = todos.filter((x: any) => NECESITA_ATENCION.includes(x.estado));
  const porCat = new Map<string, number>();
  todos.forEach((x: any) => {
    const k = catDe(x);
    porCat.set(k, (porCat.get(k) || 0) + 1);
  });

  /* Las subcategorías de la categoría elegida. Se cuentan sobre TODOS los
     equipos de esa categoría y no sobre lo ya filtrado, igual que los chips
     de categoría: un chip que cambia de número según lo que ya filtraste no
     sirve para decidir a dónde ir. */
  const porSub = new Map<string, number>();
  if (c) {
    todos.filter((x: any) => catDe(x) === c).forEach((x: any) => {
      const k = subDe(x);
      porSub.set(k, (porSub.get(k) || 0) + 1);
    });
  }

  // Miniatura del equipo (cartel) y avatar de una persona, con placeholder.
  /* La miniatura, con la clase compartida y sin tamaño propio: lo pone
     `--mini` en globals.css. Aquí venía dibujada a mano con estilos en línea y
     un `size` por llamada, que es como se llega a cuatro tamaños distintos
     para la misma cosa sin que nadie lo decida. */
  const miniEquipo = (url: string | undefined) => (
    <span className="mini-eq">
      {url
        ? // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" referrerPolicy="no-referrer" />
        : <span>🎥</span>}
    </span>
  );
  const avatarPersona = (url: string | undefined, size = 24) => (
    <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: "var(--bg)", border: "1px solid var(--border2)", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", verticalAlign: "middle" }}>
      {url
        ? // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: size * 0.5 }}>👤</span>}
    </span>
  );

  // Resaltado tenue por estado: el que lo tenga definido en lib/estadosEquipo.
  const RES_EST: Record<string, [string, string]> = Object.fromEntries(
    ESTADOS_EQUIPO.filter(e => e.tinte).map(e => [e.k, [e.color, e.tinte] as [string, string]]));
  const Fila = (x: any) => {
    const a = act.get(x.id) || VACIO;
    const nBita = bitaCount.get(x.id) || 0;
    const res = RES_EST[x.estado];
    const cb = comboPorEq.get(x.id);
    const misKits = kitsPorEq.get(x.id) || [];
    const propio = Number(x.valor_compra);
    /* El total del combo SOLO se enseña cuando el equipo no tiene precio
       propio: ahí informa —«el dato está en la boleta»—. Con precio propio
       al lado serían dos cifras distintas para la misma fila, y quien la
       lea rápido se llevará la que no era. */
    const totalCombo = !(propio > 0) && cb && Number(cb.total) > 0 ? Number(cb.total) : 0;

    return (
      <Link key={x.id} href={`/entidad/equipamiento/${x.id}`}>
        <div className="card link eqx-card" style={res ? { borderLeft: `3px solid ${res[0]}`, background: res[1] } : undefined}>
          <div className="eqx-fila">
            {miniEquipo(cartelPorEq.get(x.id))}

            {/* DOS LÍNEAS. Arriba, QUÉ es —folio y nombre, que es lo que se
                busca—. Abajo, todo lo que lo describe. En una sola línea, el
                nombre competía con seis etiquetas y era lo primero que se
                recortaba, justo lo único que no se puede recortar. */}
            <div className="eqx-txt">
              <div className="eqx-l1">
                {x.folio
                  ? <span className="badge eqx-folio">{x.folio}</span>
                  : <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>⚠ sin folio</span>}
                <b className="eqx-nom">{x.nombre}</b>
              </div>

              <div className="eqx-l2">
                {/* Con la marca ✍ cuando el valor no está en la lista. Sin
                    ella, al filtrar «escritas a mano» sale un listado
                    correcto en el que no se ve QUÉ tiene de raro cada fila,
                    y hay que abrir ficha por ficha para averiguarlo. */}
                {x.subcategoria && (
                  subAMano(x)
                    ? <span className="eqx-sub a-mano" title="Subcategoría escrita a mano: no está en la lista de esta categoría">
                        ✍ {x.subcategoria}
                      </span>
                    : <span className="eqx-sub">{x.subcategoria}</span>
                )}
                {catAMano(x) && (
                  <span className="eqx-sub a-mano" title="Categoría antigua o escrita a mano: ya no se ofrece al crear un equipo">
                    ✍ {catDe(x)}
                  </span>
                )}

                {/* Los dos ejes: lo que ENTRÓ junto y lo que SALE junto. No se
                    pueden deducir mirando la cámara. */}
                {cb && (
                  <span className="badge cmp-cod" title={`Vino en ${cb.codigo || ""} ${cb.nombre}`.trim()}>
                    🧾 {cb.codigo || cb.nombre}
                    {totalCombo > 0 && <span style={{ opacity: .75, fontWeight: 400 }}> · {soles(totalCombo, cb.moneda)}</span>}
                  </span>
                )}
                {misKits.map((k: any) => (
                  <span key={k.id} className="badge eq-kit-chip" title={`Sale en el kit «${k.nombre}»`}>📦 {k.nombre}</span>
                ))}

                {/* El precio propio. Si no lo tiene pero vino en un combo, no
                    se repite el código —ya está en el chip de al lado, y
                    «🧾 C-006 · en C-006» decía dos veces lo mismo—: lo que se
                    dice es que el precio vive en la boleta. */}
                {propio > 0 ? (
                  <span className="eqx-precio">{soles(propio)}</span>
                ) : cb ? (
                  <span className="eqx-precio-combo" title="No tiene precio propio: lo cubre el total de su compra.">
                    precio en la boleta
                  </span>
                ) : (
                  <span className="eqx-sin-precio" title="Sin precio propio y sin combo: este equipo no suma al valor del inventario.">
                    ⚠ sin precio
                  </span>
                )}

                <span style={{ flex: 1 }} />

                {/* Lo que cuelga del equipo: una cámara con un caso abierto
                    puede ser una reparación a medias, y eso decide si sale a
                    rodaje. */}
                {a.abiertos > 0 && <span style={{ color: "var(--red)", fontSize: TXT.chip, fontWeight: 700 }}>❗ {a.abiertos}</span>}
                {a.casos > 0 && <span style={{ color: "var(--dim)", fontSize: TXT.chip }} title="Casos vinculados">📌 {a.casos}</span>}
                {nBita > 0 && <span style={{ color: "var(--muted)", fontSize: TXT.chip }} title="Notas y comentarios en su bitácora">🗒 {nBita}</span>}
                {a.coments > 0 && <span style={{ color: "var(--muted)", fontSize: TXT.chip }} title="Comentarios en casos">💬 {a.coments}</span>}
              </div>
            </div>

            <BotonComprobar equipoId={x.id} ultima={x.ultima_comprobacion} compacto={!ronda} />
            <span className="badge eqx-estado" style={{ color: metaEstado(x.estado).color }}>
              {metaEstado(x.estado).txt}
            </span>
          </div>

          {(() => {
            const c = completitud("equipamiento", x);
            return <Completitud mini pct={c.pct} llenos={c.llenos} total={c.total} faltan={c.faltan} />;
          })()}
        </div>
      </Link>
    );
  };

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/casos/equipamiento" className="btn btn-ghost"
          title="Todos los casos, agrupados por equipo">🗂 Casos</Link>
        <Link href="/historial/equipamiento" className="btn btn-ghost"
          title="Todo lo que se movió en los equipos, por periodo">🕐 Historial</Link>
        <Link href="/entidad/equipamiento/nuevo" className="btn">＋ Nuevo equipo</Link>
      </div>
      <h1 className="title-lg">🎥 Equipos audiovisuales</h1>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        {c && <input type="hidden" name="c" value={c} />}
        {f && <input type="hidden" name="f" value={f} />}
        {ronda && <input type="hidden" name="ronda" value="1" />}
        <span className="buscador-lista">
          <span className="bg-lupa">🔍</span>
          <input name="q" defaultValue={q}
            placeholder="Nombre, folio, categoría, «en reparación», «no aparece»…" />
        </span>
        <button className="btn" type="submit">Buscar</button>
      </form>

      <PanelFiltros limpiar="/equipamiento" mostrarLimpiar={listar}>
        <FilaFiltro titulo="Estado">
          {Object.entries(EST_META).map(([est, [lbl, col]]) => {
            const n = cnt(est);
            return n === 0 ? null : (
              <Chip key={est} href={`/equipamiento?e=${est}`} on={e === est} color={col}>
                {lbl} · {n}
              </Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Categoría">
          {/* `title` con qué es cada categoría: la duda entre «soporte» y
              «cámara» para una jaula se resuelve leyendo, no adivinando. */}
          {[...porCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
            <Chip key={cat} href={`/equipamiento?c=${encodeURIComponent(cat)}`}
              on={c === cat} color="var(--violet)"
              title={AYUDA_CATEGORIA[cat] || (CATEGORIAS_EQUIPO.includes(cat) ? "" : "Categoría antigua: ya no se ofrece al crear un equipo. Ver db/categorias-equipo.sql")}>
              {cat} · {n}
            </Chip>
          ))}
        </FilaFiltro>

        {/* ── SUBCATEGORÍA ──
            Solo con una categoría elegida. Sin ella serían más de cien chips
            —la suma de todas las listas— y una fila de cien chips no es un
            filtro, es un muro. Aquí el orden NO es por cantidad sino el de
            la lista de lib/entidades: esa lista está ordenada por lo que se
            hace con cada cosa, y esa agrupación es la que ayuda a encontrar.
            Lo que exista en los datos y no esté en la lista va al final: es
            lo que alguien escribió a mano, y verlo junto es lo que permite
            decidir si merece entrar en la lista o corregirse. */}
        {c && porSub.size > 1 && (() => {
          const canon = SUBCATS_EQUIPO[c] || [];
          const enOrden = [
            ...canon.filter(k => porSub.has(k)),
            ...[...porSub.keys()].filter(k => k !== SIN_SUB && !canon.includes(k)).sort(),
            ...(porSub.has(SIN_SUB) ? [SIN_SUB] : []),
          ];
          return (
            <FilaFiltro titulo="Subcat.">
              {enOrden.map(sub => (
                <Chip key={sub}
                  href={`/equipamiento?c=${encodeURIComponent(c)}${sc === sub ? "" : `&sc=${encodeURIComponent(sub)}`}`}
                  on={sc === sub} color={sub === SIN_SUB ? "var(--yellow)" : "var(--teal)"}
                  title={sc === sub ? "Quitar este filtro"
                    : !canon.includes(sub) && sub !== SIN_SUB
                      ? "Escrita a mano: no está en la lista sugerida de esta categoría" : ""}>
                  {/* La misma ✍ que en la fila del listado. El aviso estaba
                      solo en el `title`, o sea escondido detrás del cursor:
                      había que pasar por encima de cada chip para descubrir
                      cuál era el raro. */}
                  {!canon.includes(sub) && sub !== SIN_SUB ? "✍ " : ""}{sub} · {porSub.get(sub)}
                </Chip>
              ))}
            </FilaFiltro>
          );
        })()}

        <FilaFiltro titulo="Atención">
          <Chip href="/equipamiento?ronda=1" on={ronda} color="var(--yellow)"
            title="Nadie los ha visto físicamente en 90+ días">
            🔍 por comprobar · {pendientesRonda}
          </Chip>
          <Chip href="/equipamiento?f=sin_valor" on={f === "sin_valor"} color="var(--yellow)"
            title="Sin precio propio. Los que vinieron en un combo con total SÍ suman al inventario, por el combo — por eso este número es mayor que el aviso de arriba.">
            ⚠ sin precio propio · {cntF("sin_valor")}
          </Chip>
          <Chip href="/equipamiento?f=sin_folio" on={f === "sin_folio"} color="var(--yellow)"
            title="Sin folio no se puede citar en un acta ni etiquetar">
            ⚠ sin folio · {cntF("sin_folio")}
          </Chip>
          <Chip href="/equipamiento?f=sin_categoria" on={f === "sin_categoria"} color="var(--dim)"
            title="Sin categoría no entra en el inventario por categoría">
            ⚠ sin categoría · {cntF("sin_categoria")}
          </Chip>
          <Chip href="/equipamiento?f=a_mano" on={f === "a_mano"} color="var(--teal)"
            title="Categoría o subcategoría escrita a mano: no está en la lista que ofrece el formulario. No es un error —a veces es la única forma de decir lo que algo es— pero en cuanto la lista gane esa palabra, el siguiente equipo igual se clasificará con la de la lista y el mismo tipo de cosa quedará en dos sitios. Revisarlas es cómo crece la lista.">
            ✍ escritas a mano · {cntF("a_mano")}
          </Chip>
          <Chip href="/equipamiento?f=sin_subcategoria" on={f === "sin_subcategoria"} color="var(--yellow)"
            title="Tienen categoría pero no subcategoría, y su categoría sí ofrece alguna. Sin ella un equipo solo se encuentra por su nombre: no sale al filtrar «Batería de drone» ni «Micrófono corbatero». No cuenta los que no tienen categoría —esos son el chip de al lado— ni los de «otro», que no tiene lista.">
            ⚠ sin subcategoría · {cntF("sin_subcategoria")}
          </Chip>
        </FilaFiltro>
      </PanelFiltros>

      {!listar && (
        <>
          {/* Solo lo que informa: los conteos por estado y la ronda son
              filtros y viven arriba, en el panel.
              El total suma únicamente lo que tiene precio cargado; si faltan
              muchos, el número es una fracción y hay que decirlo. */}
          <div className="stat-grid">
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>
                {soles(inv.total)}
              </span>
              <span className="stat-l">
                valor del inventario activo
                {/* Se dice de qué está hecho el número. Un total que mezcla
                    precios exactos con totales de combo sin decirlo es un
                    total en el que no se puede confiar para un seguro. */}
                <span style={{ display: "block", color: "var(--dim)", fontSize: 10.5, lineHeight: 1.5 }}>
                  {soles(inv.propio)} de {inv.nConPrecio} con precio propio
                  {inv.nCombos > 0 && <> · {soles(inv.porCombo)} de {inv.nCombos} combo(s), sin desglosar</>}
                </span>
                {inv.sinValorar > 0 && (
                  <b style={{ color: "var(--yellow)", display: "block" }}>
                    ⚠ {inv.sinValorar} sin precio ni combo — el total va corto
                  </b>
                )}
              </span>
            </span>
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--yellow)", display: "block" }}>{(enManos || []).length}</span>
              <span className="stat-l">🤝 en manos de alguien ahora</span>
            </span>
          </div>

          {/* La salida a rodaje: una persona, un proyecto, N equipos, un botón.
              Va ANTES del panel de «en uso» porque el orden de la página sigue
              el orden del día: primero se entrega, después se mira quién tiene
              qué. */}
          {/* `key` CON EL KIT DENTRO. «🤝 Entregar» de un kit navega a
              ?kit=…#entregar, y el panel se abre solo si `kitInicial` llega
              en el PRIMER pintado — es el valor inicial de un useState.
              Sin la key, Next reusa el componente ya montado al cambiar de
              parametro: llegaba el kit, el estado seguía cerrado, y el boton
              del kit acababa en un segundo clic sobre «Entregar equipos a
              alguien». No fallaba nada; simplemente no pasaba nada. */}
          <EntregaLote key={kitPre || "_"} equipos={eqsConDueno as any}
            personas={personasCat} proyectos={proyectosCat}
            kits={kits} kitInicial={kitPre} />

          {/* Los combos, junto a los kits, porque son las dos caras de la
              misma pregunta: el kit dice qué SALE junto, el combo qué ENTRÓ
              junto. Verlos en la misma pantalla es lo que hace evidente que
              no son lo mismo. */}
          <PanelCombos combos={combos} categorias={[...porCat.keys()].filter(c => c !== "sin categoría")}
            inventario={(eqs || []).map((e: any) => ({
              id: e.id, folio: e.folio, nombre: e.nombre, categoria: e.categoria,
              estado: e.estado, compra_id: e.compra_id,
              compra: e.compra_id ? (combos.find((c: any) => c.id === e.compra_id)?.nombre || null) : null,
            }))} />

          {/* Los kits van DESPUÉS de la entrega: primero se entrega —es lo del
              día— y armar el kit es mantenimiento, se hace de vez en cuando. */}
          {/* Un `select` con un embed que el servidor no resuelve devuelve
              data:null y error, y `|| []` lo convierte en «no hay kits»: el
              panel entero desaparece y parece que nadie ha armado ninguno.
              Es la misma forma de fallar que dejó el panel de préstamos en
              blanco, así que se dice en voz alta. */}
          {eKits && (
            <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
              <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ No se pudieron leer los kits</b>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
                {/(perfiles|autor|creado_por)/.test(eKits.message)
                  ? <>Falta correr <code>db/kits.sql</code> en Supabase: sin <code>kits.creado_por</code> no se puede leer quién armó cada kit. Los kits existen — lo que no se puede es pintarlos.</>
                  : eKits.message}
              </div>
            </div>
          )}
          <PanelKits kits={kits} equipos={eqsConDueno as any} />

          {/* Quién tiene qué —y la devolución a media vuelta de rodaje—.
              El panel entero es cliente porque las casillas son estado, así
              que aquí solo se aplana lo que la consulta ya trajo: nada de
              funciones cruzando la frontera, que es donde esto se rompe. */}
          {/* Si la consulta falla, se DICE. Sin esto, un error de PostgREST
              —por ejemplo, que falte correr db/prestamo-entregado-por.sql—
              devuelve `data: null`, el `|| []` lo convierte en «no hay nada»
              y el panel entero desaparece: la aplicación juraría que no hay
              ningún equipo prestado con doce en la calle. Es el mismo fallo
              que dejó sin personajes a los proyectos. */}
          {eManos && (
            <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
              <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ No se pudo leer quién tiene qué</b>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
                {/(entregado_por|entrego)/.test(eManos.message)
                  ? <>Falta correr <code>db/prestamo-entregado-por.sql</code> en Supabase. Hasta entonces este panel no puede pintarse — y hay equipos prestados, no es que no haya.</>
                  : eManos.message}
              </div>
            </div>
          )}

          {(enManos || []).length > 0 && (
            <EnUsoAhora items={(enManos || []).map((p: any): UsoItem => {
              const eq = un1(p.equipo), per = un1(p.persona), pr = un1(p.proy), ent = un1(p.entrego);
              return {
                id: p.id, desde: p.desde,
                entrego: ent?.nombre || null, entregoFoto: ent?.avatar_url || null,
                categoria: eq?.categoria || null, subcategoria: eq?.subcategoria || null,
                valor: eq?.valor_compra ? Number(eq.valor_compra) : null,
                /* Solo el código, no el combo entero: la fila necesita dos
                   palabras, no un objeto con total, moneda y comprobante
                   repetido en cada préstamo. */
                comboCodigo: eq?.compra_id ? (comboPorEq.get(eq.id)?.codigo || null) : null,
                piezas: piezasDe.get(eq?.id) || [],
                eqId: eq?.id, folio: eq?.folio, nombre: eq?.nombre || "sin nombre",
                cartel: cartelPorEq.get(eq?.id) || null,
                perId: per?.id || "_", per: per?.alias || per?.nombre || "sin registrar",
                foto: per?.foto_url || null,
                proyId: pr?.id || null, proy: pr?.nombre || null,
                kitId: p.kit_id || null,
                kit: p.kit_id ? kitPorId.get(p.kit_id)?.nombre || null : null,
                kitTotal: p.kit_id ? kitPorId.get(p.kit_id)?.equipoIds.length || 0 : 0,
              };
            })} />
          )}

          {gruposAct.length > 0 && (
            <div className="card">
              <div className="panel-h">🗒 Última actividad de los equipos</div>
              {gruposAct.map((g: any, gi: number) => (
                <div key={g.eq.id} style={{ padding: "10px 0 4px", borderTop: gi ? "1px solid var(--border)" : "none" }}>
                  {/* Nodo raíz: el equipo */}
                  <Link href={`/entidad/equipamiento/${g.eq.id}`} style={{ display: "flex", gap: 9, alignItems: "center" }}>
                    {miniEquipo(cartelPorEq.get(g.eq.id))}
                    <b style={{ fontSize: TXT.base, color: "var(--text)" }}>{g.eq.nombre}</b>
                    {g.eq.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: TXT.chip }}>{g.eq.folio}</span>}
                  </Link>
                  {/* Ramas: sus últimos movimientos */}
                  <div style={{ marginLeft: 16, borderLeft: "1px solid var(--border)", paddingLeft: 14, marginTop: 7, display: "flex", flexDirection: "column", gap: 7 }}>
                    {g.items.map((it: any, i: number) => {
                      const per = it.persona?.alias || it.persona?.nombre || "alguien";
                      const fecha = <span style={{ color: "var(--dim)", fontSize: TXT.chip, whiteSpace: "nowrap", flexShrink: 0 }}>{new Date(it.at).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</span>;
                      if (it.tipo === "uso_ini" || it.tipo === "uso_fin") {
                        const ini = it.tipo === "uso_ini";
                        return (
                          <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: TXT.micro }}>
                              <span style={{ color: ini ? "var(--yellow)" : "var(--dim)", fontWeight: 700 }}>{ini ? "🤝 Puesto en uso" : "↩ Liberado"}</span>
                              <span style={{ color: "var(--muted)" }}> — {per}</span>
                            </span>
                            {fecha}
                          </div>
                        );
                      }
                      const cuerpo = (it.cuerpo === "📷" ? "📷 (foto)" : (it.cuerpo || "")).replace(/\s+/g, " ").slice(0, 110);
                      return (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: TXT.micro }}>
                              <b>{it.autor?.nombre || "Alguien"}</b>
                              {it.uso && <span style={{ color: "var(--dim)" }}> · sobre un uso</span>}
                              {it.es_dano && <span style={{ marginLeft: 6, color: "var(--dano)", fontWeight: 700, fontSize: TXT.chip }}>🔧 daño</span>}
                            </span>
                            <span style={{ display: "block", color: "var(--muted)", fontSize: TXT.chip, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cuerpo}</span>
                          </span>
                          {fecha}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {atencion.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(255,77,94,.4)" }}>
              <div className="panel-h" style={{ color: "var(--red)" }}>🔧 Requieren atención</div>
              {atencion.map((x: any) => (
                <div className="info-row" key={x.id}>
                  {miniEquipo(cartelPorEq.get(x.id))}
                  {x.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: TXT.chip }}>{x.folio}</span>}
                  <Link href={`/entidad/equipamiento/${x.id}`} style={{ fontWeight: 600, flex: 1, fontSize: TXT.base }}>{x.nombre}</Link>
                  {/* Ícono + rótulo + color del estado, de una sola fuente.
                      Aquí «perdido» era rojo y todo lo demás ámbar; con el
                      estado nuevo eso habría pintado igual «no aparece» y «en
                      reparación», que es justo lo que hay que distinguir. */}
                  <span style={{ color: metaEstado(x.estado).color, fontSize: TXT.micro, fontWeight: 700, whiteSpace: "nowrap" }}
                    title={metaEstado(x.estado).ayuda || ""}>
                    {metaEstado(x.estado).ico} {metaEstado(x.estado).txt}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ color: "var(--dim)", fontSize: TXT.micro, textAlign: "center", margin: "6px 0 14px" }}>
            {todos.length} equipos en total — usa el buscador, un estado o una categoría para ver la lista.
          </div>
        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: TXT.micro, margin: "2px 4px 10px" }}>
            {ronda && <b style={{ color: "var(--yellow)" }}>🔍 MODO RONDA — marca cada equipo que veas físicamente · </b>}
            {filtradosTodos.length} resultado{filtradosTodos.length === 1 ? "" : "s"}
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}
            {c && ` · ${c}`}{sc && ` › ${sc}`}{f && ` · ${f.replace(/_/g, " ")}`}{q && ` · «${q}»`}
          </div>
          {/* Agrupados: por categoría, o por subcategoría si ya hay una
              categoría elegida. Los lentes con los lentes. */}
          {(() => {
            /* Con una categoría elegida, el listado agrupa por SUBCATEGORÍA:
               ver los 34 soportes en un solo montón no ayuda —trípodes,
               placas y ventosas son cosas distintas— y el encabezado de
               grupo pasa a decir algo que no estaba ya en el filtro de
               arriba. Sin categoría, se agrupa por categoría como siempre.
               Mismos `catDe`/`subDe` que el contador y el filtro. */
            const porSubcat = !!c && !sc;
            const clave = porSubcat ? subDe : catDe;
            const VACIO = porSubcat ? SIN_SUB : SIN_CAT;
            const canon = porSubcat ? (SUBCATS_EQUIPO[c] || []) : [];
            const cats = [...new Set(filtrados.map(clave))].sort((a: any, b: any) => {
              /* Lo que falta por clasificar, al final. Y dentro del orden, el
                 de la lista sugerida antes que lo escrito a mano: la lista
                 está ordenada por lo que se hace con cada cosa. */
              const vac = (a === VACIO ? 1 : 0) - (b === VACIO ? 1 : 0);
              if (vac) return vac;
              const ia = canon.indexOf(a), ib = canon.indexOf(b);
              if (ia !== ib) return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
              return String(a).localeCompare(String(b));
            });
            return cats.map((cat: any) => {
              const filas = filtrados.filter((x: any) => clave(x) === cat);
              return (
                <div key={cat || "sin"} style={{ marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 4px 6px" }}>
                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
                      {cat} · {filas.length}
                    </span>
                    <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>
                  {/* Las unidades iguales se apilan en una fila desplegable.
                      Las filas las sigue pintando el servidor y viajan ya
                      dibujadas: así el agrupador no necesita saber cómo se
                      dibuja un equipo, y ninguna función cruza la frontera
                      —que es donde esto se nos ha roto tres veces—. */}
                  {/* `key` con los filtros dentro: sin ella, React reusa la
                      instancia al cambiar de filtro y el estado de plegado se
                      queda con las claves viejas —los grupos nuevos con algo
                      en reparación arrancarían cerrados, que es justo lo que
                      el inicializador quiere evitar—. */}
                  {/* El cartel viaja CON la unidad: el agrupador vive en
                      lib/compras y no conoce `cartelPorEq`, que solo existe
                      en esta pagina. */}
                  <FilasEquipo key={`${cat}|${e}|${c}|${f}|${q}`}
                    unidades={filas.map((x: any) => ({ ...x, cartel: cartelPorEq.get(x.id) || null })) as any}
                    filas={Object.fromEntries(filas.map((x: any) => [x.id, Fila(x)]))} />
                </div>
              );
            });
          })()}
          {!filtrados.length && <div className="empty">Sin equipos {q && `para «${q}»`}.</div>}
          {/* Antes el aviso saltaba en 150 pero el corte era 200: pasando de
              200 la lista se recortaba en silencio y nadie se enteraba. */}
          {filtradosTodos.length > TOPE && (
            <div className="empty" style={{ color: "var(--yellow)" }}>
              ⚠ Mostrando {TOPE} de {filtradosTodos.length} — afina la búsqueda o filtra por categoría.
            </div>
          )}
        </>
      )}
    </div>
  );
}
