import { SECCIONES, nombreDe } from "@/lib/secciones";
import { mapaAlias } from "@/lib/personas";

/* QUIÉNES PUEDEN SER DUEÑOS DE UN OBJETO, y sus catálogos para elegir.

   Lo piden dos pantallas: agregar desde /repositorio y cambiarle el dueño a un
   objeto. Se arma con `nombreDe` —el mismo resolvedor que ya traduce ids a
   nombres—, así que una sección nueva en SECCIONES queda habilitada sola. */

/** Todas las secciones menos el propio objeto: un objeto no cuelga de otro. */
export const DUENOS = SECCIONES.filter(s => s.tipo !== "objeto");

export type CatalogosDuenos = {
  catalogos: Record<string, { id: string; nombre: string }[]>;
  etiquetas: Record<string, string>;
};

/* EL CATÁLOGO DE OBJETOS PARA VINCULAR — con su dueño.

   El título no basta para elegir: dos fichas de exploración de personaje se
   llaman igual y el material de una productora se repite por naturaleza (cada
   proyecto tiene su «tratamiento», cada persona su «reel»). Lo que los
   distingue es de quién son, así que el dueño viaja como coletilla apagada.

   Lo comparten las tres puertas que ofrecen vincular —el feed, el «+»
   flotante y la ficha del caso—: si cada una arma su lista, la de un sitio
   desempata y la del otro no. */
export async function catalogoObjetos(supabase: any, limite = 300) {
  const { data: objs } = await supabase.from("objetos")
    .select("id,titulo,tipo,entidad_tipo,entidad_id")
    .neq("tipo", "cv")
    .order("creado_en", { ascending: false }).limit(limite);
  const filas = objs || [];
  if (!filas.length) return [] as { id: string; nombre: string; tipo?: string; sub?: string }[];

  // Los nombres de los dueños: una consulta por tabla, no una por objeto.
  const porTipo = new Map<string, Set<string>>();
  filas.forEach((o: any) => {
    const s = porTipo.get(o.entidad_tipo) || new Set<string>();
    s.add(o.entidad_id); porTipo.set(o.entidad_tipo, s);
  });
  const nombres = new Map<string, string>();
  await Promise.all([...porTipo.entries()].map(async ([tipo, ids]) => {
    const n = nombreDe(tipo);
    if (!n) return;
    const sel = ["id", n.campo, n.corto].filter(Boolean).join(",");
    const { data } = await supabase.from(n.tabla).select(sel).in("id", [...ids]);
    (data || []).forEach((r: any) =>
      nombres.set(`${tipo}:${r.id}`, (n.corto && r[n.corto]) || r[n.campo] || "—"));
  }));

  return filas.map((o: any) => ({
    id: o.id, nombre: o.titulo, tipo: o.tipo,
    sub: nombres.get(`${o.entidad_tipo}:${o.entidad_id}`) || undefined,
  }));
}

export type ItemCat = { id: string; nombre: string; tipo?: string; sub?: string };

/* CÓMO SE LEE CADA ENTIDAD EN UN DESPLEGABLE — en un solo sitio.

   Cuatro pantallas ofrecen elegir entidades: el compositor del feed, el «+»
   flotante, la ficha del caso y el «Agregar» del repositorio. Cada una armaba
   su lista, y salían distintas: en tres la persona era «Nombre · Alias» y en
   la cuarta SOLO el alias —«ABELCCAHUANA»—, que es un identificador de
   máquina, no un nombre. Elegir a alguien no puede depender de por qué puerta
   entraste.

   La regla es la misma en todas: `nombre` identifica, `sub` desempata en
   apagado, `tipo` clasifica como etiqueta. */
/* ── LAS FILAS EN CRUDO, QUE ES LO QUE DE VERDAD CUESTA ──
   ⚠ Esta función se separó de `catalogosEntidades` para que las mismas filas
   sirvan para DOS cosas distintas sin pedirlas dos veces.

   La ficha del caso necesitaba las dos: los desplegables de «vincular» —que
   dicen «PACHA APUS SAC · productora», con coletilla— y los rótulos de los
   chips ya puestos —que dicen solo «PACHA APUS SAC»—. Como los formatos son
   distintos, pedía `catalogosEntidades` Y, en la misma tanda, otras siete
   consultas a las MISMAS siete tablas. Catorce lecturas de tabla completa por
   visita para pintar una ficha, la mitad tiradas.

   Ahora se leen una vez y cada pantalla les da su forma:
     `catalogosDeFilas`  → cómo se ELIGE una entidad (con desempate).
     `nombresDeVinculos` → cómo se NOMBRA una ya elegida (a secas). Ésa no usa
                           estas filas: pide por id, que es mucho menos.

   `catalogosEntidades` sigue existiendo con la misma firma y el mismo
   resultado: quien solo quiere los desplegables no se entera de nada. */
export type FilasEntidades = Awaited<ReturnType<typeof filasEntidades>>;

export async function filasEntidades(supabase: any) {
  const [proy, emp, pers, conv, postu, equi, luga, comp] = await Promise.all([
    supabase.from("proyectos").select("id,nombre,nombre_corto,tipo").order("nombre"),
    supabase.from("empresas").select("id,nombre,codigo,tipo,relacion").order("codigo"),
    /* ⚠ `usuario_id` además del resto. No lo pide ningún desplegable: lo pide
       el cruce cuenta↔persona que da el nombre corto de un compañero
       («MichelM», no «Michel Oros»). Estaba en una octava consulta a esta
       misma tabla solo por este campo. Un campo de más en un `select` es
       gratis; una consulta entera, no. */
    supabase.from("personas").select("id,nombre,alias,tipo,usuario_id").order("nombre"),
    supabase.from("convocatorias").select("id,codigo,nombre,anio")
      .order("anio", { ascending: false }).order("codigo"),
    // `order` explícito: sin él Postgres devuelve el orden que le convenga, y
    // cambia entre cargas. Un desplegable que se reordena solo no se aprende.
    supabase.from("postulaciones")
      .select("id,codigo,proy:proyectos(nombre),conv:convocatorias(codigo,anio)")
      .order("codigo"),
    supabase.from("equipamiento").select("id,nombre,folio").order("folio"),
    supabase.from("lugares").select("id,nombre").order("nombre"),
    supabase.from("compras").select("id,codigo,nombre,proveedor")
      .order("fecha", { ascending: false, nullsFirst: false }),
  ]);
  /* ⚠ `comp` (compras) sale aquí porque lo pide el SELECTOR de vínculos del
     repositorio, no la ficha del caso: allí no hay ningún chip «compra:» y esa
     consulta es peso muerto. Se deja porque separar «qué tabla necesita cada
     pantalla» convertiría esta función en un mosaico de banderas, y una
     consulta de más en paralelo cuesta menos que eso. Queda dicho para que
     nadie la busque en los rótulos y no la encuentre. */
  return { proy, emp, pers, conv, postu, equi, luga, comp };
}

export async function catalogosEntidades(supabase: any): Promise<Record<string, ItemCat[]>> {
  return catalogosDeFilas(await filasEntidades(supabase));
}

/** Cómo se ELIGE cada entidad en un desplegable. Sin red: solo da forma. */
export function catalogosDeFilas(
  { proy, emp, pers, conv, postu, equi, luga, comp }: FilasEntidades,
): Record<string, ItemCat[]> {
  return {
    // Qué clase de proyecto: un documental y un videojuego se llaman parecido.
    // Nombre completo + el corto apagado: el equipo lo llama por el corto.
    proyecto: (proy.data || []).map((p: any) => ({
      id: p.id, nombre: p.nombre, sub: p.nombre_corto || undefined, tipo: p.tipo || undefined,
    })),
    // Forma societaria + de quién es.
    empresa: (emp.data || []).map((e: any) => ({
      id: e.id, nombre: e.codigo ? `${e.codigo} · ${e.nombre}` : e.nombre,
      sub: [e.tipo, e.relacion].filter(Boolean).join(" · ") || undefined,
    })),
    // Nombre completo para identificar, alias apagado para reconocer.
    persona: (pers.data || []).map((x: any) => ({
      id: x.id, nombre: x.nombre, sub: x.alias || undefined, tipo: x.tipo,
    })),
    convocatoria: (conv.data || []).map((c: any) => ({
      id: c.id, nombre: `${c.anio ? `${c.anio} · ` : ""}${c.nombre || ""} · ${c.codigo}`.replace(/^ · /, ""),
    })),
    // El año desempata: hay varias postulaciones del mismo proyecto.
    postulacion: (postu.data || []).map((p: any) => ({
      id: p.id, nombre: `${p.codigo || p.conv?.codigo || "🎯"} · ${p.proy?.nombre || "postulación"}`,
      sub: p.conv?.anio ? String(p.conv.anio) : undefined,
    })),
    equipamiento: (equi.data || []).map((x: any) => ({
      id: x.id, nombre: x.folio ? `${x.folio} · ${x.nombre}` : x.nombre,
    })),
    lugar: (luga.data || []).map((x: any) => ({ id: x.id, nombre: x.nombre })),
    /* El combo de compra. Sigue aquí aunque ya no esté en SECCIONES —vive
       plegado dentro de /equipamiento—: `catalogosEntidades` lo usa el
       selector de vínculos, y sin él no se podría colgar la boleta de una
       compra desde el repositorio, que es justo para lo que existe. */
    compra: (comp.data || []).map((x: any) => ({
      id: x.id, nombre: x.codigo ? `${x.codigo} · ${x.nombre}` : x.nombre,
      sub: x.proveedor || undefined,
    })),
  };
}

/* ── LOS MISMOS RÓTULOS, PERO SOLO DE LO QUE SE PIDE ──
   ⚠ Hasta hoy esto se resolvía leyendo las SIETE TABLAS ENTERAS y quedándose
   con dos o tres filas. La ficha lo hacía porque de todas formas las tenía
   cargadas para los desplegables; desde que los desplegables se piden al
   abrirlos, ya no había ninguna razón.

   Aquí se piden solo los ids que hacen falta, una consulta por TIPO presente
   (no por vínculo). Un caso con un proyecto y dos personas son dos consultas
   de tres filas, no siete de tabla completa.

   ⚠ Un chip puesto no desempata nada —ya se sabe cuál es—, así que estos
   rótulos son más cortos que los del desplegable: «PACHA APUS SAC», no
   «E-003 · PACHA APUS SAC · SAC · propia». Por eso son dos cosas y no una
   sobre las mismas filas.

   ⚠⚠ Y ESTO NO ES EL RESOLVEDOR CANÓNICO. `lib/nombres.ts` dice de sí mismo
   ser «cómo se llama cualquier cosa, en un solo sitio», y no coincide con esto
   en tres tipos:

       tipo          lib/nombres             aquí
       proyecto      nombre_corto || nombre  nombre
       persona       alias || nombre         nombre
       postulacion   «PO-040 · X · 2026»     «PO-040 · X»

   O sea que el mismo proyecto vinculado a un caso y a un objeto se lee con dos
   nombres distintos. La divergencia YA EXISTÍA —estos formatos son los que
   vivían escritos a mano en la ficha del caso, mudados sin tocarlos—, pero al
   ponerla en `lib/` al lado de la canónica deja de parecer un descuido y
   empieza a parecer una decisión, y no lo es. Converger es un cambio visible
   en los chips de todos los casos y se decide aparte; mientras tanto, queda
   escrito cuál de las dos manda. */
type Rotulador = {
  tabla: string;
  cols: string;
  rotulo: (x: any) => string;
};

const ROTULO_VINCULO: Record<string, Rotulador> = {
  proyecto:     { tabla: "proyectos",     cols: "id,nombre",       rotulo: x => x.nombre },
  empresa:      { tabla: "empresas",      cols: "id,nombre",       rotulo: x => x.nombre },
  persona:      { tabla: "personas",      cols: "id,nombre",       rotulo: x => x.nombre },
  lugar:        { tabla: "lugares",       cols: "id,nombre",       rotulo: x => x.nombre },
  convocatoria: { tabla: "convocatorias", cols: "id,codigo,nombre,anio",
    rotulo: x => (x.nombre ? `${x.nombre} ${x.anio || ""}`.trim() : x.codigo) },
  equipamiento: { tabla: "equipamiento",  cols: "id,nombre,folio",
    rotulo: x => (x.folio ? `${x.folio} · ${x.nombre}` : x.nombre) },
  postulacion:  { tabla: "postulaciones",
    cols: "id,codigo,proy:proyectos(nombre),conv:convocatorias(codigo,anio)",
    rotulo: x => `${x.codigo || x.conv?.codigo || "🎯"} · ${x.proy?.nombre || "postulación"}` },
  objeto:       { tabla: "objetos",       cols: "id,titulo",       rotulo: x => x.titulo },
  /* ⚠ La etiqueta está por completitud y hoy no la ejecuta nadie: su único
     llamador la filtra antes, porque la lista ENTERA de etiquetas ya viene
     pedida para el editor de etiquetas y sería la misma tabla dos veces. Se
     deja porque el día que otra pantalla pinte un chip de etiqueta sin esa
     lista, la respuesta tiene que estar aquí y no inventarse allá. */
  etiqueta:     { tabla: "etiquetas",     cols: "id,nombre",       rotulo: x => x.nombre },
};

/** Los rótulos de una lista de vínculos, pidiendo solo esas filas. */
export async function nombresDeVinculos(
  supabase: any,
  vinculos: { entidad_tipo?: string | null; entidad_id?: string | null }[] | null | undefined,
): Promise<Map<string, string>> {
  const porTipo = new Map<string, Set<string>>();
  (vinculos || []).forEach(v => {
    const t = (v.entidad_tipo || "").trim();
    if (!t || !v.entidad_id || !ROTULO_VINCULO[t]) return;
    const s = porTipo.get(t) || new Set<string>();
    s.add(v.entidad_id); porTipo.set(t, s);
  });
  const m = new Map<string, string>();
  await Promise.all([...porTipo.entries()].map(async ([tipo, ids]) => {
    const r = ROTULO_VINCULO[tipo];
    const { data } = await supabase.from(r.tabla).select(r.cols).in("id", [...ids]);
    (data || []).forEach((x: any) => m.set(`${tipo}:${x.id}`, r.rotulo(x)));
  }));
  return m;
}

/** El nombre corto de quien tiene cuenta: «MichelM», no «Michel Oros».
 *  ⚠ NO reimplementa el cruce: lo hace `mapaAlias`, que ya tiene siete
 *  llamadores. La primera versión de esta función lo copiaba —el mismo filtro,
 *  el mismo `usuario_id && alias`, con `Map` en vez de `Record`— y eso es un
 *  refactor que predica «en un solo sitio» creando un segundo sitio.
 *  Lo único que hace aquí es evitarle a la ficha una consulta a `personas` que
 *  ya viene en esta misma tanda. */
export const aliasPorCuenta = (f: FilasEntidades): Record<string, string> =>
  mapaAlias(f.pers.data);

export async function catalogosDuenos(supabase: any): Promise<CatalogosDuenos> {
  const todos = await catalogosEntidades(supabase);
  const catalogos: Record<string, ItemCat[]> = {};
  const etiquetas: Record<string, string> = {};
  // Solo las fichas que pueden tener repositorio, y en el orden de SECCIONES.
  DUENOS.forEach(s => {
    const items = todos[s.tipo];
    /* Antes esto se armaba solo desde SECCIONES vía `nombreDe`, así que una
       sección nueva quedaba habilitada sin tocar nada. Ahora las listas se
       escriben a mano en `catalogosEntidades` —para poder darle a cada tipo su
       coletilla— y el precio es este: si alguien agrega una sección y no la
       agrega allá, desaparece del selector sin decir nada. Que al menos grite
       en el log del servidor. */
    if (!items) { console.error(`catalogosEntidades no cubre «${s.tipo}»: no saldrá en el selector.`); return; }
    if (items.length) { catalogos[s.tipo] = items; etiquetas[s.tipo] = s.singular || s.plural; }
  });
  return { catalogos, etiquetas };
}
