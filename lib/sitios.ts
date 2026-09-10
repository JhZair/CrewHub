/* ══════════════════════════════════════════════════════════════════════════
   📍 DÓNDE SE GUARDA CADA COSA — la cadena, resuelta en un solo sitio

   La respuesta a «¿dónde se guarda la cámara?» no está en una columna: está
   en una cadena. La cámara va en el Bolso Tenba, el Bolso Tenba está en el
   Cajón 08, el Cajón 08 está en el Depósito. Lo que se lee es
   «Depósito › Cajón 08 › Bolso Tenba», y sale de subir esa cadena — no de un
   texto que alguien mantiene al día en catorce descripciones.

   El porqué del modelo está en db/sitios.sql. Aquí solo la regla, y vive en un
   módulo aparte por dos motivos:

   · UNA SOLA VEZ. La van a preguntar la ficha del equipo, el inventario, la
     pestaña de ensamblados, el panel de kits y la vista por sitio. Escrita en
     cinco, la ficha diría «Cajón 08» y la lista «Bolso Tenba» del mismo
     equipo, y las dos tendrían razón a medias.
   · SIN SERVIDOR. No importa nada: los paneles que la usan son de cliente, y
     colgar de un módulo que importe `lib/supabase/server` rompe el build de
     Next sin que `tsc` diga una palabra. Es lo que ya pasó con
     `lib/ensamblados`.

   ── LAS TRES FORMAS DE ESTAR MAL, OTRA VEZ ──
   Un puntero suelto siempre tiene las mismas: apuntar a algo que no está
   (ROTO), dar vueltas (BUCLE), o no apuntar a nada (SIN SITIO). Las tres se
   devuelven con nombre en vez de resolverse en un `null` que la pantalla no
   puede distinguir de «todavía no lo he anotado».
   ══════════════════════════════════════════════════════════════════════════ */

export type Sitio = {
  id: string;
  nombre: string;
  dentro_de?: string | null;
  /* Los cuatro de db/sitios-detalle.sql. Opcionales de verdad y no por
     comodidad: un sitio SIN tipo y SIN clave es válido —«Depósito» no tiene
     número que deducir— y la pantalla tiene que saber pintarlo. */
  tipo?: string | null;
  /** Solo SU tramo: «C01», no «OF01-M01-C01». El código entero se arma
   *  subiendo la cadena con `codigoDeRuta`, para que no pueda contradecirla. */
  clave?: string | null;
  fila?: number | null;
  columna?: number | null;
};

/* ══════════════════════════════════════════════════════════════════════════
   LOS TIPOS DE SITIO

   Aquí y no en un enum de Postgres, por lo que dice db/sitios-detalle.sql:
   añadir «vitrina» tiene que ser esta línea y no una migración. El tipo decide
   tres cosas —el ícono, el prefijo que se sugiere para la clave, y qué se
   ofrece crear dentro— y las tres viven juntas porque se leen juntas.

   ⚠ `prefijo` TIENE que decir lo mismo que el `case` de db/sitios-detalle.sql.
   Son los dos únicos sitios donde está escrito. Si aquí un cajón sugiere «CJ»
   y allí el traslado escribió «C», el mismo cajón tendría dos claves según
   quién lo mirara — y la segunda se descubriría al chocar contra el índice.

   Cajón y compartimiento comparten «C», y estante y espacio comparten «E», a
   propósito: el nivel de la cadena ya los separa. OF01-M01-C01 es el cajón del
   mueble; OF01-C01-E01, el compartimiento de la oficina.
   ══════════════════════════════════════════════════════════════════════════ */
export type TipoSitio = {
  etiqueta: string;
  icono: string;
  prefijo: string;
  /* ── QUÉ SE SUGIERE CREAR DENTRO ──
     ⚠ SUGIERE, NO PROHÍBE. Esta lista decide qué sale PRIMERO en el desplegable
     de «＋ dentro de», no qué se puede crear: la pantalla ofrece el resto de
     tipos debajo, en su propio grupo.

     El motivo es un fallo que costó una pantalla muerta: `espacio` tenía la
     lista vacía —«es el último nivel»— y dentro de un «Espacio 3» el
     desplegable salía con el «— tipo —» y NADA más. Un control sin una sola
     opción no se lee como «aquí no va nada»: se lee como que la pantalla está
     rota, y encima la premisa era falsa —un espacio de una oficina lleva
     muebles perfectamente—.

     Una taxonomía escrita de antemano no puede saber cómo es el almacén de
     nadie. Lo que sabe es qué es lo HABITUAL, y eso es lo que ordena la lista. */
  dentro: string[];
};

export const TIPOS_SITIO: Record<string, TipoSitio> = {
  oficina:        { etiqueta: "Oficina",        icono: "🏢", prefijo: "OF", dentro: ["mueble", "estante", "compartimiento", "espacio"] },
  almacen:        { etiqueta: "Almacén",        icono: "🏬", prefijo: "AL", dentro: ["mueble", "estante", "cajon", "espacio"] },
  mueble:         { etiqueta: "Mueble",         icono: "🗄️", prefijo: "M",  dentro: ["cajon", "estante"] },
  estante:        { etiqueta: "Estante",        icono: "📚", prefijo: "E",  dentro: ["compartimiento", "espacio"] },
  cajon:          { etiqueta: "Cajón",          icono: "📦", prefijo: "C",  dentro: ["compartimiento", "espacio"] },
  compartimiento: { etiqueta: "Compartimiento", icono: "🗃️", prefijo: "C",  dentro: ["espacio"] },
  /* Un «espacio» es una zona —«Espacio 3» de una oficina—, no el hueco de un
     cajón: lo normal es que lleve muebles. Estaba con la lista vacía por
     confundirlo con lo segundo. */
  espacio:        { etiqueta: "Espacio",        icono: "⬜", prefijo: "E",  dentro: ["mueble", "estante", "cajon", "compartimiento"] },
};

/** El ícono de un sitio. 📍 para el que no tiene tipo: es el que ya usaba la
 *  pantalla, así que un sitio sin tipo se sigue viendo igual que ayer en vez
 *  de aparecer roto. */
export const iconoDeSitio = (tipo?: string | null) =>
  (tipo && TIPOS_SITIO[tipo]?.icono) || "📍";

export const etiquetaDeTipo = (tipo?: string | null) =>
  (tipo && TIPOS_SITIO[tipo]?.etiqueta) || "sin tipo";

/** La clave que le tocaría a un nombre por su tipo: «Cajón 07» → «C07».
 *  ⚠ Es la misma regla que el traslado de db/sitios-detalle.sql, incluido el
 *  `\d+` y no `\d{1,3}`: con tope, «Cajón 1024» daba «C024». Se SUGIERE, no se
 *  impone — quien crea el sitio la puede cambiar antes de guardar. */
export function claveSugerida(tipo?: string | null, nombre?: string | null): string {
  const t = tipo ? TIPOS_SITIO[tipo] : null;
  if (!t) return "";
  const n = String(nombre || "").match(/(\d+)\s*$/)?.[1];
  return n ? t.prefijo + n : "";
}

/** Lo mínimo de un equipo para saber dónde se guarda. Lo cumplen las filas
 *  flacas del inventario sin tocar nada. */
export type EqGuardable = {
  id: string;
  nombre?: string | null;
  folio?: string | null;
  /** Atornillado dentro de otro: entonces NO tiene sitio propio. */
  ensamblado_en?: string | null;
  guardado_sitio?: string | null;
  guardado_en_equipo?: string | null;
};

/** Un kit, con lo justo para saber dónde se guarda y a quién arrastra. */
export type KitGuardable = {
  id: string;
  nombre: string;
  guardado_sitio?: string | null;
  guardado_en_equipo?: string | null;
  /** Los equipos que lo componen. Es lo que hace que el kit responda por
   *  ellos: donde está el kit están sus piezas. */
  equipoIds?: string[];
};

/** Un eslabón de la cadena, de fuera hacia dentro. */
export type Tramo = {
  tipo: "sitio" | "equipo";
  id: string;
  nombre: string;
  folio?: string | null;
  /** Solo en los tramos de tipo «sitio», y solo si lo tienen. Viaja EN el
   *  tramo y no se busca aparte porque el código se arma de la cadena: quien
   *  tiene la cadena tiene ya todo lo que hace falta. */
  clave?: string | null;
};

export type Guardado = {
  /** De FUERA a DENTRO: [Depósito, Cajón 08, Bolso Tenba]. Vacía = no se sabe. */
  ruta: Tramo[];
  /** De dónde sale la respuesta. Cambia la frase que pinta la pantalla y si se
   *  puede editar ahí mismo: lo heredado se cambia en quien lo contiene. */
  origen:
    | "propio"       // tiene su sitio anotado
    | "contenedor"   // está metido en otro equipo (su bolso, su maleta)
    | "ensamblado"   // está atornillado dentro de otro: no puede tener el suyo
    | "kit"          // es parte de un kit y se guarda donde se guarde el kit
    | "ninguno";     // nadie lo ha anotado
  /* ── DE QUÉ KIT LO HEREDA ──
     El kit NO es un tramo de la ruta: sus equipos no están «dentro del kit»,
     están donde esté el kit —un kit es una lista, no una caja—. Pero la
     pantalla tiene que poder decir de dónde sale la respuesta y a dónde ir a
     cambiarla, y para eso hace falta su nombre.
     Se rellena SOLO con `origen: "kit"`, y también cuando hay disputa: ahí es
     lo único que se puede ofrecer para ir a arreglarla. */
  porKit?: { id: string; nombre: string } | null;
  /* ── DOS KITS QUE NO SE PONEN DE ACUERDO ──
     Un equipo puede salir en varios kits, y nada impide que dos de ellos se
     guarden en cajones distintos. La cosa está en UNO de los dos, y elegir por
     nuestra cuenta sería inventarse cuál: con esto la ruta va vacía y la
     pantalla lo dice, que es lo único cierto.
     Distinto de `roto` a propósito: ahí falta un dato; aquí sobran. */
  disputa?: boolean;
  /** La cadena daba vueltas y se cortó. Lo de la ruta es cierto hasta el corte. */
  bucle: boolean;
  /** Apunta a un sitio o a un equipo que no está en las listas cargadas. Puede
   *  ser un borrado a medias… o que la lista venía cortada por el tope de la
   *  API, que es muy distinto — por eso se dice y no se traga. */
  roto: boolean;
};

const VACIO: Guardado = { ruta: [], origen: "ninguno", bucle: false, roto: false };

/** ¿No se sabe dónde está? Es la pregunta que hacen las tres listas para
 *  pintar el aviso, y escrita a mano en cada una divergiría a la primera: hay
 *  CUATRO formas de no saberlo —nadie lo anotó, la cadena da vueltas, apunta a
 *  algo que no está, o dos kits no se ponen de acuerdo— y `!ruta.length` a
 *  secas las junta todas, que para avisar es justo lo que se quiere. */
export const sinSitio = (g?: Guardado | null) => !g || !g.ruta.length;

/** «Depósito › Cajón 08 › Bolso Tenba». Sin ruta, cadena vacía: quien la pinte
 *  decide qué decir cuando no se sabe, que no es lo mismo en una ficha que en
 *  una fila de lista. */
export const textoDeRuta = (r: Tramo[]) => r.map(t => t.nombre).join(" › ");

/* ══════════════════════════════════════════════════════════════════════════
   EL CÓDIGO — «OF01-M01-C01»

   ⚠ ESTO ES LO QUE db/sitios-detalle.sql SE NEGÓ A GUARDAR EN UNA COLUMNA, y
   la razón está allí entera: un código escrito en cada fila es una segunda
   verdad que se rompe SIN DAR ERROR —mueves el Mueble 01 a otra oficina y sus
   doce cajones siguen diciendo OF01 para siempre—. Se arma de la cadena, que
   es la única que sabe la respuesta, y por eso vive aquí, al lado de la
   función que resuelve la cadena, y no en la pantalla que lo pinta.

   ── Y POR QUÉ DEVUELVE NULL EN VEZ DE UN CÓDIGO CORTO ──
   Si el Mueble 01 no tiene clave, la cadena Oficina › Mueble › Cajón daría
   «OF01-C01» saltándose un nivel — que es un código VÁLIDO de otra cosa: el
   compartimiento 01 de la oficina. Un código que señala a un sitio distinto
   del que se está mirando es peor que no tener código, porque se copia, se
   pega en una etiqueta y se pega en un cajón que no es. Sin todos los
   eslabones no hay código, y la pantalla dice que falta poner la clave.
   ══════════════════════════════════════════════════════════════════════════ */
export function codigoDeRuta(r: Tramo[]): string | null {
  const sitios = r.filter(t => t.tipo === "sitio");
  if (!sitios.length) return null;
  if (sitios.some(t => !t.clave)) return null;
  return sitios.map(t => t.clave).join("-");
}

/* ══════════════════════════════════════════════════════════════════════════
   QUÉ HAY EN CADA SITIO, Y CUÁNTO

   Devuelve por sitio DOS cosas que se pintan juntas y que hay que definir
   juntas, o se separan:

     · las LISTAS —`directo` y `kits`— de lo que cuelga de ESE sitio y de nadie
       más. Es la primera cifra: lo que se ve al abrir el cajón.
     · `total`: todo lo que hay en él y en los sitios que lleva dentro, contando
       además lo metido en un bolso y lo atornillado. Es la segunda cifra.

   ⚠ POR QUÉ ESTÁ AQUÍ Y NO EN LA PANTALLA. Hubo un `contarPorSitio` que
   devolvía solo las cifras y se quitó con razón —tener las cuentas por un lado
   y las listas por otro es tener dos criterios de «qué cuenta como estar aquí»
   que se van a separar—. Se separaron igual, dentro de la pantalla: `total`
   contaba equipos y NO kits mientras la primera cifra sí los sumaba, así que el
   Espacio 4 decía «0» teniendo tres kits en sus compartimientos y el Mueble 01
   decía «5» donde había ocho. Un sitio que dice cero sobre un compartimiento
   lleno es la mentira en la dirección que más tranquiliza.

   Así que un solo recorrido devuelve las dos cosas —un criterio— y vive aquí,
   donde se puede probar con un árbol de tres niveles sin montar la pantalla.
   ══════════════════════════════════════════════════════════════════════════ */
export function contenidoPorSitio<E extends { id: string }, K>(
  sitios: { id: string }[],
  equipos: E[],
  kits: K[],
  resolver: {
    de: (id: string) => Guardado;
    deKit: (k: any) => Guardado;
  },
): Map<string, { directo: E[]; kits: K[]; total: number }> {
  const m = new Map<string, { directo: E[]; kits: K[]; total: number }>();
  sitios.forEach(s => m.set(s.id, { directo: [], kits: [], total: 0 }));

  const sube = (ruta: Tramo[]) => {
    const enRuta = ruta.filter(t => t.tipo === "sitio");
    enRuta.forEach(t => { const x = m.get(t.id); if (x) x.total++; });
    return enRuta;
  };

  for (const e of equipos) {
    const g = resolver.de(e.id);
    /* ⚠ Directo solo si NO hay un equipo de por medio: en el cajón está el
       bolso, y dentro del bolso la cámara. Vale igual para lo atornillado —la
       pieza está dentro del rig, no suelta en el cajón—, y por eso la condición
       mira la RUTA y no los punteros: los dos casos dejan un tramo de tipo
       «equipo» en ella. */
    const hayEquipo = g.ruta.some(t => t.tipo === "equipo");
    const enRuta = sube(g.ruta);
    if (!enRuta.length) continue;
    if (!hayEquipo) m.get(enRuta[enRuta.length - 1].id)?.directo.push(e);
  }

  for (const k of kits) {
    const g = resolver.deKit(k);
    const enRuta = sube(g.ruta);
    if (!enRuta.length) continue;
    /* El kit cuelga del sitio más hondo de su cadena, esté guardado en un sitio
       o dentro de un bolso que está en un sitio. */
    m.get(enRuta[enRuta.length - 1].id)?.kits.push(k);
  }

  return m;
}

/* ══════════════════════════════════════════════════════════════════════════
   QUÉ RAMAS ENSEÑA UNA BÚSQUEDA

   Filtrar un ÁRBOL no es filtrar una lista: un nodo se enseña si casa él, y
   TAMBIÉN si casa cualquiera de sus descendientes, porque si no el que casa no
   tiene por dónde salir a la pantalla.

   ⚠ La vista por sitio miraba un solo nivel —`casa(s) || hijos.some(casa)`— y
   con tres —Oficina › Mueble › Cajón— buscar el código de un cajón dejaba la
   pantalla VACÍA sobre treinta y tres sitios y un acierto exacto: ni el cajón
   se pintaba (su padre no se pintaba), ni el padre, ni el abuelo. Y era el caso
   normal, porque es adonde lleva el chip 📍 del inventario.

   Vive aquí y no en la pantalla por lo mismo que el resto de este archivo: es
   una regla con una forma fácil de equivocar, la van a querer el árbol de
   ensamblados y cualquier otra lista con jerarquía, y escrita dos veces se
   arregla una sola.
   ══════════════════════════════════════════════════════════════════════════ */
export function ramasQueCasan<T extends { id: string }>(
  nodos: T[],
  /** Los hijos de cada nodo, por id de padre. La raíz cuelga de `null`. */
  hijosDe: Map<string | null, T[]>,
  casa: (n: T) => boolean,
): Map<string, boolean> {
  const m = new Map<string, boolean>();
  /* ⚠ `visto` corta los bucles. Un ciclo A→B→A colgaría el recorrido para
     siempre en vez de dar un resultado incompleto, y una pantalla que no
     responde no dice cuál es el sitio que está mal. */
  const visto = new Set<string>();
  const calc = (n: T): boolean => {
    const hecho = m.get(n.id);
    if (hecho !== undefined) return hecho;
    if (visto.has(n.id)) return false;
    visto.add(n.id);
    let r = casa(n);
    /* Sin cortocircuito a propósito: se recorren TODOS los hijos aunque uno ya
       haya dado positivo, para que cada uno quede memorizado. Con `some`, los
       hermanos posteriores al primer acierto se recalcularían al pintarlos. */
    for (const h of hijosDe.get(n.id) || []) if (calc(h)) r = true;
    m.set(n.id, r);
    return r;
  };
  nodos.forEach(calc);
  return m;
}

/* ══════════════════════════════════════════════════════════════════════════
   QUÉ ARCHIVO FALTA CORRER

   ⚠ SON DOS MIGRACIONES Y DAN ERRORES DISTINTOS. Hasta ahora cualquier «does
   not exist» sobre `sitios` se rotulaba «falta correr db/sitios.sql», y con la
   tabla ya creada esa frase manda a correr un archivo que no arregla nada: lo
   que falta es `db/sitios-detalle.sql`, y quien lea el aviso lo correrá dos
   veces y seguirá viendo lo mismo.

     · falta la TABLA   → `relation "sitios" does not exist`  → db/sitios.sql
     · falta la COLUMNA → `column sitios.clave does not exist`→ db/sitios-detalle.sql

   Devuelve el nombre del archivo o `null`, y `null` significa «este error no es
   una migración que falta»: rotular CUALQUIER fallo como migración convierte
   una FK rota o un permiso en una instrucción que no arregla nada, que es
   exactamente lo que `traducir()` ya evitaba en las acciones.
   ══════════════════════════════════════════════════════════════════════════ */
export function faltaCorrer(msg?: string | null): string | null {
  const m = String(msg || "");
  if (!m) return null;
  /* Primero el detalle: su mensaje también contiene «does not exist» y con el
     orden al revés se lo tragaría siempre la regla de la tabla. */
  if (/column\s+"?(sitios\.)?(tipo|clave|fila|columna)"?\s+does not exist/i.test(m)
    || /find the '(tipo|clave|fila|columna)' column/i.test(m)) {
    return "db/sitios-detalle.sql";
  }
  if (/relation "?sitios"?.*does not exist|'sitios'.*schema cache|PGRST20/i.test(m)) {
    return "db/sitios.sql";
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   EL RESOLVEDOR

   Se construye una vez por pantalla con las dos listas y contesta por id. Con
   memoria: en un inventario de quinientos equipos guardados en veinte bolsos,
   sin ella la cadena del bolso se recorre quinientas veces.
   ══════════════════════════════════════════════════════════════════════════ */
export function resolvedorDeGuardado(
  sitios: Sitio[], equipos: EqGuardable[],
  /* ── LOS KITS, OPCIONALES ──
     Sin ellos el resolvedor se comporta EXACTAMENTE como antes, y eso es a
     propósito: lo llaman seis pantallas y solo tres saben de kits. La ficha de
     un equipo no carga la tabla de kits, y obligarla a cargarla para resolver
     una cadena sería un viaje por pantalla para un dato que casi nunca cambia
     la respuesta. Donde sí se pasan, mandan. */
  kits: KitGuardable[] = [],
) {
  const porSitio = new Map<string, Sitio>((sitios || []).map(s => [s.id, s]));
  const porEq = new Map<string, EqGuardable>((equipos || []).map(e => [e.id, e]));
  const memoSitio = new Map<string, { ruta: Tramo[]; bucle: boolean; roto: boolean }>();
  const memoEq = new Map<string, Guardado>();
  const memoKit = new Map<string, Guardado>();

  /** En qué kits está cada equipo. Al revés que `equipoIds`, que es como
   *  viajan los kits. */
  const kitsDeEq = new Map<string, KitGuardable[]>();
  (kits || []).forEach(k => (k.equipoIds || []).forEach(
    eq => kitsDeEq.set(eq, [...(kitsDeEq.get(eq) || []), k])));

  /** La cadena de un SITIO, de fuera a dentro, él incluido. */
  function rutaDeSitio(id: string): { ruta: Tramo[]; bucle: boolean; roto: boolean } {
    const hecho = memoSitio.get(id);
    if (hecho) return hecho;
    const dentroAfuera: Tramo[] = [];
    const vistos = new Set<string>();
    let cursor: string | null = id;
    let bucle = false, roto = false;
    while (cursor) {
      if (vistos.has(cursor)) { bucle = true; break; }
      vistos.add(cursor);
      const s = porSitio.get(cursor);
      /* ⚠ Un `dentro_de` que no lleva a ninguna parte también es ROTO, y no
         solo cuando el roto es el primer eslabón. Se devolvía la ruta a medias
         sin marca: «Cajón 07» a secas, idéntico a un cajón sano que está en la
         raíz. El aviso desaparecía justo en el caso en que hace falta. */
      if (!s) { if (cursor !== id) roto = true; break; }
      dentroAfuera.push({ tipo: "sitio", id: s.id, nombre: s.nombre, clave: s.clave || null });
      cursor = s.dentro_de || null;
    }
    /* ⚠ Con bucle NO se devuelve la ruta a medias. Recorrer una cadena
       circular da un trozo que depende de por dónde se entró —«Bucle B ›
       Bucle A» pedido desde uno y al revés desde el otro—, y pintar eso es
       enseñar una ubicación inventada al lado de un icono de aviso. Lo único
       cierto es que no se sabe. */
    const r = bucle
      ? { ruta: [] as Tramo[], bucle: true, roto }
      : { ruta: dentroAfuera.reverse(), bucle: false, roto };
    memoSitio.set(id, r);
    return r;
  }

  /* ⚠ `enCurso` y no solo la memoria: un bucle de equipos —A guardado en B y B
     en A— se detecta porque se vuelve a pedir uno que todavía se está
     resolviendo. Con la memoria sola la llamada se repetiría para siempre,
     porque el resultado aún no está escrito cuando vuelve a pedirse. */
  const enCurso = new Set<string>();

  function de(id: string): Guardado {
    const hecho = memoEq.get(id);
    if (hecho) return hecho;
    if (enCurso.has(id)) return { ...VACIO, bucle: true };

    const e = porEq.get(id);
    if (!e) return VACIO;

    enCurso.add(id);
    let out: Guardado;

    /* El orden importa y es el del check de la base: atornillado gana, porque
       una pieza montada NO PUEDE tener sitio propio. Si aun así lo tuviera
       —una fila anterior a la migración—, se ignora en vez de enseñar dos
       respuestas: la de la base es la que manda. */
    const padre = e.ensamblado_en
      ? { id: e.ensamblado_en, origen: "ensamblado" as const }
      : e.guardado_en_equipo
      ? { id: e.guardado_en_equipo, origen: "contenedor" as const }
      : null;

    /* Lo que dicen sus kits, si es que está en alguno y alguno tiene sitio.
       Se pide antes del `if` para no llamarlo dos veces —resolver un kit
       resuelve una cadena entera— y `null` cuando no hay nada que heredar. */
    const delKit = padre ? null : porKitDe(id);

    if (padre) {
      const cont = porEq.get(padre.id);
      if (!cont) {
        out = { ruta: [], origen: padre.origen, bucle: false, roto: true };
      } else {
        const arriba = de(padre.id);
        /* ⚠ Con bucle, ruta VACÍA. Sin esto, A guardado en B y B en A daban
           «Bolso A › Bolso B» para A: la cadena pasaba por el propio A y la
           pantalla decía que A se guarda dentro de A. Lo único cierto de un
           bucle es que no se sabe dónde está nada de lo que cuelga de él. */
        out = arriba.bucle
          ? { ruta: [], origen: padre.origen, bucle: true, roto: arriba.roto }
          : {
            /* La ruta del contenedor MÁS el contenedor: lo que se busca al
               final es el bolso, y decir solo «Cajón 08» manda a abrir el
               cajón entero. */
            ruta: [...arriba.ruta, {
              tipo: "equipo", id: cont.id,
              nombre: cont.nombre || "sin nombre", folio: cont.folio || null,
            }],
            origen: padre.origen, bucle: false, roto: arriba.roto,
          };
      }
    } else if (delKit) {
      /* ── EL KIT MANDA SOBRE EL SITIO PROPIO ──
         Y va ANTES de `guardado_sitio`, no después: un equipo que sale en un
         kit está donde esté el kit, y anotarle uno propio no lo mueve — deja
         dos respuestas para la misma pregunta y la lista de empaque repartida
         en dos cajones.
         Detrás de anfitrión y contenedor, en cambio: lo atornillado y lo
         metido en un bolso es dónde está la cosa FÍSICAMENTE, y ese bolso ya
         sube por su cuenta hasta el kit si es que va en él. */
      out = delKit;
    } else if (e.guardado_sitio) {
      const s = rutaDeSitio(e.guardado_sitio);
      out = { ruta: s.ruta, origen: "propio", bucle: s.bucle,
        /* Roto si el sitio al que apunta no existe —ruta vacía sin bucle— o si
           lo que no existe es alguno de sus padres. */
        roto: s.roto || (!s.ruta.length && !s.bucle) };
    } else {
      out = VACIO;
    }

    enCurso.delete(id);
    memoEq.set(id, out);
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     LO QUE DICEN LOS KITS DE UN EQUIPO

     Devuelve `null` si no hay nada que heredar —no está en ningún kit, o
     ninguno de sus kits tiene sitio anotado—, y entonces el equipo sigue con
     lo suyo. No es lo mismo «este kit no lo guarda en ninguna parte» que
     «este equipo no tiene sitio»: lo primero es un kit al que le falta el
     dato, y quien lo arregla es el kit.

     ⚠ EL CASO DE LOS DOS KITS. Un equipo puede salir en varios, y nada impide
     que dos de ellos vivan en cajones distintos. La cosa está en UNO, y elegir
     por nuestra cuenta —el primero de la lista, que es el orden en que se
     crearon los kits— sería inventarse cuál y enseñarlo con la misma cara que
     un dato cierto. Si coinciden, se hereda; si no, se dice.
     ══════════════════════════════════════════════════════════════════════ */
  function porKitDe(eqId: string): Guardado | null {
    const suyos = kitsDeEq.get(eqId);
    if (!suyos || !suyos.length) return null;

    /* Solo los kits que contestan algo. Uno sin sitio no descarta al hermano
       que sí lo tiene: no hay disputa entre un dato y su ausencia. */
    const conRespuesta = suyos
      .map(k => ({ k, g: deKit(k) }))
      .filter(x => x.g.ruta.length > 0);
    if (!conRespuesta.length) return null;

    const primero = conRespuesta[0];
    const marca = (g: Guardado) => textoDeRuta(g.ruta);
    const todosIgual = conRespuesta.every(x => marca(x.g) === marca(primero.g));
    const kit = { id: primero.k.id, nombre: primero.k.nombre };

    if (!todosIgual) {
      return { ruta: [], origen: "kit", bucle: false, roto: false,
        porKit: kit, disputa: true };
    }
    return { ...primero.g, origen: "kit", porKit: kit };
  }

  /* ⚠ Los kits también pueden encadenarse en círculo: un kit guardado dentro
     de un bolso que es miembro de ese mismo kit. `de()` tiene su `enCurso`,
     pero sin este el ciclo entra por el otro lado —kit → equipo → kit— y la
     recursión no ve el `Set` del vecino. */
  const enCursoKit = new Set<string>();

  /** Igual, para un KIT: los mismos dos punteros, sin `ensamblado_en`. */
  function deKit(k: { id?: string; guardado_sitio?: string | null; guardado_en_equipo?: string | null }): Guardado {
    /* Memoria e id son opcionales porque este resolvedor se llamaba —y se
       sigue llamando— con un objeto suelto de dos punteros, sin id. Sin id no
       hay memoria y tampoco corte de ciclo, que era exactamente el
       comportamiento de antes: no se empeora nada, y se mejora en cuanto la
       llamada trae el id. */
    if (k.id) {
      const hecho = memoKit.get(k.id);
      if (hecho) return hecho;
      if (enCursoKit.has(k.id)) return { ...VACIO, bucle: true };
      enCursoKit.add(k.id);
    }
    const out = deKitCrudo(k);
    if (k.id) { enCursoKit.delete(k.id); memoKit.set(k.id, out); }
    return out;
  }

  function deKitCrudo(k: { guardado_sitio?: string | null; guardado_en_equipo?: string | null }): Guardado {
    if (k.guardado_en_equipo) {
      const cont = porEq.get(k.guardado_en_equipo);
      if (!cont) return { ruta: [], origen: "contenedor", bucle: false, roto: true };
      const arriba = de(cont.id);
      if (arriba.bucle) return { ruta: [], origen: "contenedor", bucle: true, roto: arriba.roto };
      return {
        ruta: [...arriba.ruta, {
          tipo: "equipo", id: cont.id,
          nombre: cont.nombre || "sin nombre", folio: cont.folio || null,
        }],
        origen: "contenedor", bucle: false, roto: arriba.roto,
      };
    }
    if (k.guardado_sitio) {
      const s = rutaDeSitio(k.guardado_sitio);
      return { ruta: s.ruta, origen: "propio", bucle: s.bucle,
        roto: s.roto || (!s.ruta.length && !s.bucle) };
    }
    return VACIO;
  }

  return { de, deKit, rutaDeSitio };
}

/* ══════════════════════════════════════════════════════════════════════════
   BUSCAR UN SITIO ESCRIBIENDO COMO SE HABLA

   Un árbol de sitios se nombra a medias con letras y a medias con números
   —«Compartimiento 03», «Nivel 01», «Espacio 2»— y ahí una búsqueda de
   «cada palabra tiene que estar en alguna parte del renglón» miente de dos
   formas a la vez. Las dos pasaron, escribiendo «espacio 02»:

   1. NO SALÍA lo que se buscaba. «Compartimiento 03 · Espacio 2 · Nivel 01»
      no contiene «02» por ninguna parte, así que quedaba fuera — aunque está
      en el Espacio 2, que es lo único que se preguntó. Los sitios se llamaron
      «Espacio 2» y «Nivel 01» el mismo día y nadie decidió esa diferencia.
   2. SALÍA lo que NO se buscaba. «Compartimiento 01 · Espacio 2 · Nivel 02»
      sí contenía «02»… en «Nivel 02». El número de una palabra contestaba por
      otra, y en pantalla las dos filas se veían igual de legítimas.

   Dos reglas, y con estas dos «espacio 02», «Espacio 2» y «espacio 2» son la
   misma pregunta y ninguna de las tres trae niveles:

   · «02» y «2» SON EL MISMO NÚMERO. Se quitan los ceros de delante a los dos
     lados, así que da igual cómo lo escribiera quien creó el sitio y cómo lo
     escriba quien lo busca.
   · UN NÚMERO SUELTO SE PEGA A SU PALABRA. «espacio 2» se busca entero, no
     «espacio» por un lado y «2» por otro. Es lo que evita que el «2» de
     «Nivel 2» dé por buena una fila del espacio equivocado.

   Lo que se escribe suelto sigue funcionando como siempre: «compartimiento»
   trae todos, «OF01-E02-N01-C03» trae uno, y «nivel 1 compartimiento 3» pide
   las dos cosas a la vez sin importar en qué orden se escribieron.
   ══════════════════════════════════════════════════════════════════════════ */

/** Sin tildes, en minúsculas y con los números sin ceros de relleno.
 *  Se aplica IGUAL al texto y a la consulta: si solo se hiciera de un lado,
 *  «C03» dejaría de encontrar a `C03`. */
export function normalizaBusqueda(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    /* `\d+` entero y no `0+` al principio: reemplazar solo los ceros dejaría
       «0» a secas convertido en cadena vacía, y «Nivel 0» —que existe— se
       volvería imposible de escribir. Así «007»→«7» y «0»→«0». */
    .replace(/\d+/g, d => String(Number(d)));
}

/* Palabras que se escriben al hablar y no están escritas en ningún sitio.
   «compartimiento 3, del nivel 1» es como se dice en voz alta, y ese «del» no
   aparece en «Compartimiento 03 · Espacio 2 · Nivel 01»: exigirlo devolvía
   CERO resultados por una palabra que no significaba nada. Un buscador que se
   queda mudo porque sobró un artículo se lee como «eso no existe».
   Cortísima y solo artículos y preposiciones: cuanto más larga, más cerca está
   el día que se coma una palabra que sí distinguía dos sitios. */
const RELLENO = new Set(["de", "del", "la", "el", "los", "las", "en", "y", "a", "al"]);

/** Los trozos que hay que encontrar, ya con los números pegados a su palabra.
 *  Separado de `casaConsulta` porque es lo único que hay que mirar cuando algo
 *  no aparece: dice exactamente qué se está buscando. */
export function trozosDeConsulta(consulta: string): string[] {
  /* Comas, puntos y comas y los separadores de ruta también parten: se
     escribe «compartimiento 3, del nivel 1» tal cual, y con solo espacios el
     término quedaba «3,» y no casaba con nada. */
  const todos = normalizaBusqueda(consulta).split(/[\s,;·›>/]+/).filter(Boolean);
  /* ⚠ El relleno se quita ANTES de pegar los números: con «del» en medio,
     «del nivel 1» habría dejado «nivel» y «1» separados por él y el número no
     se habría pegado a su palabra.
     Y solo si queda algo: quien escriba «el» a secas está buscando eso, y
     dejarle la lista entera es mejor que dejársela vacía. */
  const utiles = todos.filter(t => !RELLENO.has(t));
  const brutos = utiles.length ? utiles : todos;
  const out: string[] = [];
  for (const t of brutos) {
    const soloNumero = /^\d+$/.test(t);
    /* Se pega al anterior solo si el anterior NO es también un número: «nivel
       1 2» son dos números seguidos y nadie quiso decir «nivel 1 2». */
    if (soloNumero && out.length && !/^\d+$/.test(out[out.length - 1].split(" ").pop() || "")) {
      out[out.length - 1] = `${out[out.length - 1]} ${t}`;
    } else {
      out.push(t);
    }
  }
  return out;
}

/** ¿Este renglón contesta a lo que se escribió? `texto` es todo lo que se
 *  puede escribir para llegar a él: su nombre, su clave, su código y su ruta. */
export function casaConsulta(texto: string, consulta: string): boolean {
  const trozos = trozosDeConsulta(consulta);
  if (!trozos.length) return true;
  const t = normalizaBusqueda(texto);
  return trozos.every(p => t.includes(p));
}
