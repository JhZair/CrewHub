/* ══════════════════════════════════════════════════════════════════════════
   🏁 QUIÉN ES QUIÉN ENTRE LOS RIVALES, DE UN CONCURSO A OTRO

   Una lista de competidores de UN concurso ya dice bastante. Seis ediciones
   puestas una al lado de la otra dicen otra cosa distinta y más útil: quién
   vuelve a intentarlo cada año, quién entró tres veces y nunca pasó de apta,
   quién ganó y volvió al año siguiente, y —lo que no se ve de ninguna otra
   manera— qué director aparece con dos productoras diferentes.

   Todo eso depende de una sola pregunta que hay que contestar bien: ¿esta
   fila de 2024 y esta de 2026 son el MISMO competidor? Aquí está esa
   respuesta, y está aquí y no dentro de una pantalla porque la usan tres:
   la pestaña de cada convocatoria, la matriz general y cualquier cosa que
   venga después.

   ⚠ EL ERROR QUE HAY QUE EVITAR NO ES EL QUE PARECE. Dejar dos filas del
   mismo competidor sin juntar se nota enseguida —salen dos líneas con el
   mismo nombre—. Juntar dos competidores DISTINTOS no se nota nunca: sale
   una línea sola diciendo «lo intentó cuatro veces» y nadie sospecha de un
   número. Por eso todo lo de aquí es conservador y por eso el RUC manda
   siempre que exista.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── LAS CUATRO LISTAS DE UN CONCURSO ──
   DAFO publica recibidas → aptas → finalistas → fallo, y una fila guarda solo
   hasta dónde llegó. El orden es el que permite decir «mejor etapa». */
export const ETAPAS: { k: string; txt: string; ico: string }[] = [
  { k: "recibida", txt: "se presentaron", ico: "📨" },
  { k: "apta", txt: "aptas", ico: "✅" },
  { k: "finalista", txt: "finalistas", ico: "🏅" },
  { k: "beneficiaria", txt: "ganaron", ico: "🏆" },
];
export const ORDEN: Record<string, number> = { recibida: 1, apta: 2, finalista: 3, beneficiaria: 4 };
export const icoEtapa = (k: string) => ETAPAS.find(e => e.k === k)?.ico || "•";
export const txtEtapa = (k: string) => ETAPAS.find(e => e.k === k)?.txt || k;

/* ══════════════════════════════════════════════════════════════════════════
   CASAR NOMBRES DE EMPRESA CON LO QUE ESCRIBE EL MINISTERIO

   El sistema y DAFO casi nunca escriben el mismo nombre igual, y no por
   descuido: son dos nombres distintos de la misma empresa. En `empresas`,
   `nombre` es el nombre CORTO de trabajo —«PukllaychaF»— y la razón social
   completa vive en su propio campo; la resolución, en cambio, solo puede usar
   el legal, «PUKLLAYCHA FILMS E.I.R.L.». Comparar cadenas enteras, o incluso
   pedir que una contenga a la otra, deja esa pareja sin casar: la «f» final
   del nombre corto rompe la subcadena.

   Y entre dos convocatorias pasa lo mismo con la forma jurídica, que unas
   veces va abreviada —«E.I.R.L.»— y otras entera —«EMPRESA INDIVIDUAL DE
   RESPONSABILIDAD LIMITADA»—. Son la misma empresa escrita de dos maneras
   igual de legales.

   Se compara el NÚCLEO: el nombre sin la forma jurídica y sin las palabras de
   figura —«asociación», «cultural», «sociedad»…—, que están en media lista y
   por tanto no distinguen a nadie. Lo que queda es lo que de verdad nombra.
   ⚠ Lo que NO se quita son las palabras del oficio —films, producciones, cine,
   audiovisual—: ahí sí hay identidad, y quitarlas convertiría «PRODUCCIONES
   ANDINAS» y «ANDINAS FILMS» en la misma empresa.
   ══════════════════════════════════════════════════════════════════════════ */

export const nrm = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").replace(/\s+/g, " ").trim();

/* Al quitar los puntos, «E.I.R.L.» llega deletreada —«e i r l»—. Se vuelven a
   juntar las tiras de letras sueltas para poder reconocerlas como una sigla.
   Solo tiras de dos o más, para no tocar la «y» de «cine y video». */
const pegaSiglas = (s: string) => s.replace(/\b[a-z](?: [a-z])+\b/g, m => m.replace(/ /g, ""));

const FORMA = new Set([
  "sac", "sa", "saa", "srl", "eirl", "scrl", "srltda", "ltda", "eu", "sas",
  "sociedad", "anonima", "cerrada", "limitada", "responsabilidad", "individual",
  "empresa", "asociacion", "asoc", "civil", "cultural", "fundacion", "organizacion",
  "colectivo", "ong", "sin", "fines", "lucro",
  "de", "del", "la", "el", "los", "las", "y", "e",
]);

/** El nombre reducido a lo que identifica. Si al quitar el ruido no queda nada
 *  de sustancia (una empresa que se llame literalmente «Asociación Cultural»),
 *  se devuelve el nombre entero: mejor comparar de más que quedarse sin nada. */
export function nucleo(s: string): string {
  const limpio = pegaSiglas(nrm(s));
  const resto = limpio.split(" ").filter(p => p && !FORMA.has(p)).join(" ");
  return resto.length >= 4 ? resto : limpio;
}

/** ⚠ Los umbrales son el equilibrio entre no marcarnos y marcar a un rival como
 *  nuestro, que es el error peor de los dos porque nadie lo sospecha. Por eso
 *  el prefijo —que es el caso real, «pukllaychaf» ⊂ «pukllaychafilms»— pide
 *  ocho letras, y la coincidencia por dentro, que es mucho más fácil de dar por
 *  casualidad, pide doce.
 *
 *  ⚠ Y por eso esto se usa SOLO contra nuestros propios nombres, que son diez y
 *  se conocen. Entre rivales se casa por núcleo exacto (ver `agrupaRivales`):
 *  aplicar el parecido a dos mil nombres encadenaría fusiones —A se parece a B,
 *  B a C— y acabaría inventando un competidor con quince intentos. */
export function casanNombres(a: string, b: string): boolean {
  const na = nucleo(a), nb = nucleo(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const pa = na.replace(/ /g, ""), pb = nb.replace(/ /g, "");
  if (pa === pb) return true;
  const corto = pa.length <= pb.length ? pa : pb;
  const largo = pa.length <= pb.length ? pb : pa;
  if (corto.length >= 8 && largo.startsWith(corto)) return true;
  return corto.length >= 12 && largo.includes(corto);
}

/* ══════════════════════════════════════════════════════════════════════════
   LOS DATOS
   ══════════════════════════════════════════════════════════════════════════ */

export type FilaRival = {
  id: string;
  convocatoria_id: string;
  ruc: string | null;
  empresa: string;
  region: string | null;
  etapa: string;
  categoria: string | null;
  modalidad: string | null;
  titulo: string | null;
  personas: string | null;
  monto: number | string | null;
  fuente: string | null;
};

export type ConvRival = { id: string; codigo: string | null; nombre: string; anio: number | null };

/** Una aparición: una fila con la convocatoria a la que pertenece ya resuelta. */
export type Intento = { fila: FilaRival; conv: ConvRival | null };

export type Rival = {
  clave: string;
  /** El nombre más completo de todos los que se le vieron. */
  nombre: string;
  /** Los demás, para que se vea que son la misma y no se dude del cruce. */
  alias: string[];
  ruc: string | null;
  regiones: string[];
  intentos: Intento[];
  /** Convocatorias DISTINTAS en las que aparece: es el número de la matriz. */
  veces: number;
  mejor: string;
  gano: number;
  soles: number;
  proyectos: string[];
  directores: string[];
  nuestra: boolean;
  /** ⚠ Su nombre coincidía con el de dos empresas con RUC distinto, así que no
   *  se pegó a ninguna: se cuenta aparte y se avisa en pantalla. */
  ambiguo: boolean;
};

export type Director = {
  clave: string;
  nombre: string;
  alias: string[];
  intentos: Intento[];
  veces: number;
  empresas: string[];
  proyectos: string[];
  mejor: string;
  gano: number;
  nuestro: boolean;
};

const mejorDe = (etapas: string[]) =>
  etapas.reduce((a, b) => ((ORDEN[b] || 0) > (ORDEN[a] || 0) ? b : a), "recibida");

const unicos = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.filter(Boolean) as string[])];

/* ══════════════════════════════════════════════════════════════════════════
   AGRUPAR LAS FILAS EN COMPETIDORES

   ── POR QUÉ NO ES UN «GROUP BY» ──
   Porque no hay una columna por la que agrupar. El RUC solo está en tres de
   las cuatro listas: las RELACIONES DE RECIBIDAS —justo la lista donde están
   TODOS, que es la que interesa para contar intentos— DAFO las publica sin
   RUC. Agrupar por RUC pierde a todos los que nunca pasaron de recibidos, que
   son la mayoría; agrupar por nombre junta lo que no debe.

   ── EL ORDEN EN QUE SE DECIDE ──
   1. Quien tiene RUC forma su grupo por RUC. Es el único dato que no admite
      discusión y ninguna otra regla lo puede romper después.
   2. Cada grupo con RUC apunta los NÚCLEOS de nombre con los que se le ha
      visto escrito.
   3. Las filas sin RUC se pegan al grupo cuyo núcleo coincide, PERO solo si
      hay exactamente uno. Si dos empresas con RUC distinto se escriben con el
      mismo núcleo, la fila sin RUC no se pega a ninguna —no se puede saber
      cuál es— y se queda aparte marcada `ambiguo`.
   4. Las que no casan con ningún RUC se agrupan entre ellas por núcleo: es lo
      único que se puede hacer y, entre recibidas de años distintos, funciona.

   ⚠ De ahí que un competidor pueda salir dos veces en la matriz: uno con RUC y
   otro sin él, si el Ministerio le cambió el nombre entre listas. Es el precio
   de no inventar cruces, y se ve —dos líneas parecidas— en vez de esconderse
   dentro de un número inflado.
   ══════════════════════════════════════════════════════════════════════════ */
export function agrupaRivales(
  filas: FilaRival[],
  convs: Map<string, ConvRival>,
  esNuestra: (f: FilaRival) => boolean,
): Rival[] {
  /* 1 y 2 · Los grupos con RUC y los núcleos con los que se les vio. */
  const porRuc = new Map<string, FilaRival[]>();
  const rucsDeNucleo = new Map<string, Set<string>>();
  for (const f of filas) {
    if (!f.ruc) continue;
    if (!porRuc.has(f.ruc)) porRuc.set(f.ruc, []);
    porRuc.get(f.ruc)!.push(f);
    const n = nucleo(f.empresa);
    if (!n) continue;
    if (!rucsDeNucleo.has(n)) rucsDeNucleo.set(n, new Set());
    rucsDeNucleo.get(n)!.add(f.ruc);
  }

  /* 3 y 4 · Las filas sin RUC. */
  const sueltas = new Map<string, FilaRival[]>();
  const ambiguas = new Set<string>();
  for (const f of filas) {
    if (f.ruc) continue;
    const n = nucleo(f.empresa) || `id:${f.id}`;
    const cand = rucsDeNucleo.get(n);
    if (cand && cand.size === 1) {
      porRuc.get([...cand][0])!.push(f);
      continue;
    }
    if (cand && cand.size > 1) ambiguas.add(n);
    if (!sueltas.has(n)) sueltas.set(n, []);
    sueltas.get(n)!.push(f);
  }

  const arma = (clave: string, fs: FilaRival[], ambiguo: boolean): Rival => {
    const intentos: Intento[] = fs
      .map(f => ({ fila: f, conv: convs.get(f.convocatoria_id) || null }))
      /* Lo más reciente arriba: la pregunta es «¿sigue viniendo?». */
      .sort((a, b) => (b.conv?.anio || 0) - (a.conv?.anio || 0)
        || String(a.conv?.codigo || "").localeCompare(String(b.conv?.codigo || "")));
    /* ⚠ VECES = CONVOCATORIAS DISTINTAS, no filas. Una empresa que presenta
       dos proyectos al mismo concurso son dos filas y UN intento de ese año;
       contar filas diría «lo intentó seis veces» de quien fue a dos concursos
       con tres proyectos cada uno. */
    const veces = new Set(fs.map(f => f.convocatoria_id)).size;
    /* El nombre que se enseña es el más largo de los vistos: entre «PUKLLAYCHA
       FILMS» y «PUKLLAYCHA FILMS E.I.R.L.», el segundo es el que se reconoce
       en un documento. */
    const nombres = unicos(fs.map(f => f.empresa.trim()))
      .sort((a, b) => b.length - a.length);
    return {
      clave,
      nombre: nombres[0] || "—",
      alias: nombres.slice(1),
      ruc: fs.find(f => f.ruc)?.ruc || null,
      regiones: unicos(fs.map(f => f.region)),
      intentos,
      veces,
      mejor: mejorDe(fs.map(f => f.etapa)),
      gano: fs.filter(f => f.etapa === "beneficiaria").length,
      soles: fs.reduce((s, f) => s + (Number(f.monto) || 0), 0),
      proyectos: unicos(fs.map(f => f.titulo)),
      directores: unicos(fs.flatMap(f => partePersonas(f.personas))),
      nuestra: fs.some(esNuestra),
      ambiguo,
    };
  };

  const out: Rival[] = [];
  porRuc.forEach((fs, ruc) => out.push(arma(`ruc:${ruc}`, fs, false)));
  sueltas.forEach((fs, n) => out.push(arma(`nom:${n}`, fs, ambiguas.has(n))));
  return out.sort(porVeces);
}

/** El orden por defecto de la matriz: quien más lo intenta, arriba; a igualdad,
 *  quien llegó más lejos; y luego alfabético para que la lista no baile entre
 *  recargas. */
export const porVeces = (a: Rival, b: Rival) =>
  b.veces - a.veces
  || (ORDEN[b.mejor] || 0) - (ORDEN[a.mejor] || 0)
  || a.nombre.localeCompare(b.nombre);

/* ══════════════════════════════════════════════════════════════════════════
   LOS DIRECTORES

   Es el cruce que no se puede hacer de ninguna otra forma: la misma persona
   presentándose con dos productoras distintas, o el director que aparece cada
   año con proyecto nuevo. La empresa cambia de nombre y de RUC; la persona no.

   ⚠ EL ORDEN DE LOS APELLIDOS. Unas listas escriben «ROSAS MUJICA, JOSEFINA
   MILAGROS» y otras «JOSEFINA ROSAS MUJICA»: comparar las cadenas daría dos
   personas donde hay una. Se compara el CONJUNTO de palabras ordenado
   alfabéticamente, que sobrevive a la coma y al orden.
   ⚠ Lo que no sobrevive es un nombre incompleto: «JOSEFINA ROSAS» y «ROSAS
   MUJICA, JOSEFINA MILAGROS» quedan como dos. Se prefiere eso a juntar por
   parecido a dos tocayos, que en una matriz de intentos sería mentira.
   ══════════════════════════════════════════════════════════════════════════ */

/** Un campo `personas` puede traer varios nombres. Se parte por «/», «;» y por
 *  « y » cuando separa dos nombres completos. */
export function partePersonas(s: string | null): string[] {
  if (!s) return [];
  return s.split(/\s*[\/;]\s*/).map(x => x.trim().replace(/\s+/g, " "))
    .filter(x => x.length >= 5);
}

const clavePersona = (nombre: string) =>
  nrm(nombre).split(" ").filter(p => p.length > 1).sort().join(" ");

export function agrupaDirectores(
  filas: FilaRival[],
  convs: Map<string, ConvRival>,
  esNuestra: (f: FilaRival) => boolean,
): Director[] {
  const grupos = new Map<string, { nombres: string[]; filas: FilaRival[] }>();
  for (const f of filas) {
    for (const p of partePersonas(f.personas)) {
      const k = clavePersona(p);
      /* Menos de dos palabras no es un nombre: es lo que quedó de una lectura
         a medias, y contarlo como persona ensucia toda la matriz. */
      if (k.split(" ").length < 2) continue;
      if (!grupos.has(k)) grupos.set(k, { nombres: [], filas: [] });
      const g = grupos.get(k)!;
      g.nombres.push(p);
      g.filas.push(f);
    }
  }

  const out: Director[] = [];
  grupos.forEach((g, k) => {
    const nombres = unicos(g.nombres).sort((a, b) => b.length - a.length);
    const intentos: Intento[] = g.filas
      .map(f => ({ fila: f, conv: convs.get(f.convocatoria_id) || null }))
      .sort((a, b) => (b.conv?.anio || 0) - (a.conv?.anio || 0));
    out.push({
      clave: k,
      nombre: nombres[0] || "—",
      alias: nombres.slice(1),
      intentos,
      veces: new Set(g.filas.map(f => f.convocatoria_id)).size,
      /* Por núcleo y no por el nombre tal cual: la misma productora escrita de
         dos maneras contaría como dos, que es justo lo que este número no
         debe decir. */
      empresas: unicos(g.filas.map(f => f.empresa))
        .filter((e, i, arr) => arr.findIndex(x => nucleo(x) === nucleo(e)) === i),
      proyectos: unicos(g.filas.map(f => f.titulo)),
      mejor: mejorDe(g.filas.map(f => f.etapa)),
      gano: g.filas.filter(f => f.etapa === "beneficiaria").length,
      nuestro: g.filas.some(esNuestra),
    });
  });
  return out.sort((a, b) =>
    b.veces - a.veces
    || b.empresas.length - a.empresas.length
    || (ORDEN[b.mejor] || 0) - (ORDEN[a.mejor] || 0)
    || a.nombre.localeCompare(b.nombre));
}

/* ══════════════════════════════════════════════════════════════════════════
   EL HISTORIAL DE UN RIVAL, DENTRO DE SU CONCURSO

   La matriz de /rivales contesta «¿quién repite?» mirando todos los años a la
   vez. Pero la pregunta se hace casi siempre en el otro sitio: uno está viendo
   la lista de aptas de ESTE concurso y quiere saber si el que tiene al lado es
   nuevo o lleva cuatro años intentándolo. Ir a otra pantalla a buscarlo es
   perder el hilo, y con cincuenta rivales no se hace.

   Esto devuelve, para cada fila de una convocatoria, lo que esa misma empresa
   hizo en las demás. La agrupación es LA MISMA que la de la matriz —el mismo
   `agrupaRivales`— porque si aquí saliera «3ª vez» y allí «2ª», una de las dos
   pantallas estaría mintiendo y no habría forma de saber cuál.
   ══════════════════════════════════════════════════════════════════════════ */

export type Historial = {
  /** Convocatorias distintas en las que aparece, esta incluida. */
  veces: number;
  /** Lo más lejos que llegó en cualquiera de ellas. */
  mejor: string;
  /** Cuántas veces ganó, en total. */
  gano: number;
  /** Lo que hizo en las OTRAS, de lo más reciente a lo más antiguo. */
  otras: { anio: number | null; codigo: string | null; etapa: string }[];
};

export function historialDeConvocatoria(
  filas: FilaRival[],
  convs: Map<string, ConvRival>,
  convocatoriaId: string,
): Record<string, Historial> {
  const out: Record<string, Historial> = {};
  /* `esNuestra` no pinta nada aquí: lo que se quiere es el agrupamiento. */
  for (const r of agrupaRivales(filas, convs, () => false)) {
    if (r.veces < 2) continue;
    const otras = r.intentos
      .filter(i => i.fila.convocatoria_id !== convocatoriaId)
      /* Una empresa puede llevar dos proyectos a un mismo concurso: en su
         historial eso es UNA línea, con lo más lejos que llegó ese año. */
      .reduce((acc: Intento[], i) => {
        const ya = acc.find(a => a.fila.convocatoria_id === i.fila.convocatoria_id);
        if (!ya) acc.push(i);
        else if ((ORDEN[i.fila.etapa] || 0) > (ORDEN[ya.fila.etapa] || 0)) {
          acc[acc.indexOf(ya)] = i;
        }
        return acc;
      }, [])
      .map(i => ({ anio: i.conv?.anio ?? null, codigo: i.conv?.codigo ?? null, etapa: i.fila.etapa }));
    if (!otras.length) continue;
    for (const i of r.intentos) {
      if (i.fila.convocatoria_id !== convocatoriaId) continue;
      out[i.fila.id] = { veces: r.veces, mejor: r.mejor, gano: r.gano, otras };
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   TODA LA COMPETENCIA CARGADA, SIN TECHO

   ⚠ PostgREST devuelve como mucho `Max rows` por consulta (mil en este
   proyecto) y NO avisa: una consulta que se pasa devuelve mil filas y un 200.
   Con cinco ediciones de un concurso grande se pasa —solo las recibidas de un
   año ya son doscientas— y las cuentas empezarían a salir cortas sin que nada
   fallara, que es la peor forma de estar mal.
   El cliente se recibe por parámetro para que este módulo lo pueda usar tanto
   la matriz como la ficha de una convocatoria sin duplicar la paginación… ni
   el fallo, si algún día hay que arreglarlo.
   ══════════════════════════════════════════════════════════════════════════ */
const PAGINA = 1000;
/** Lo mínimo para agrupar y contar: sin `crudo`, que es el texto entero del
 *  PDF de cada fila y multiplicaría por cinco lo que viaja. */
export const COLUMNAS_RIVAL =
  "id,convocatoria_id,ruc,empresa,region,etapa,categoria,modalidad,titulo,personas,monto,fuente";

export async function todaLaCompetencia(supabase: any, columnas = COLUMNAS_RIVAL) {
  const filas: FilaRival[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase.from("convocatoria_competencia")
      .select(columnas).order("empresa").range(desde, desde + PAGINA - 1);
    if (error) return { filas, error };
    filas.push(...((data || []) as FilaRival[]));
    if (!data || data.length < PAGINA) return { filas, error: null };
  }
}
