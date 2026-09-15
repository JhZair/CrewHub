/* ══════════════════════════════════════════════════════════════════════════
   LEER UNA TABLA DE UN PDF POR DONDE ESTÁ PINTADA, NO POR LO QUE PARECE

   `lib/resolucionDafo` lee el texto plano de estos PDFs y lo va desenredando a
   base de anclas: el RUC, la región, el orden alfabético, el eco… Funciona —486
   filas de doce documentos— pero es reconstruir una tabla a partir de sus
   escombros, y hay cosas que ahí ya no están: cuál de esas palabras es el
   título del proyecto y cuál el nombre de su director. Van pegadas porque el
   texto plano no sabe que eran dos columnas.

   Pero el PDF sí lo sabe. Cada trozo de texto viene con su posición, y las
   columnas están donde siempre estuvieron:

     x= 95│ALHE ENTERPRISE    x233│LIMA   x300│ANTES NADIE     x391│ALANYA HUAMAN
     x=108│GROUP S.A.C.                  x295│LLORABA SOLO    x425│ERIK ALBERTO
     x=110│(20610212752)
     └── PERSONA JURÍDICA ──┘  └REGIÓN┘  └── PROYECTO ──┘    └── DIRECTOR ──┘

   Esto convierte todo el problema en aritmética: qué columna, qué fila. Y hace
   innecesarias las adivinanzas — el título sale limpio porque el director está
   en otra columna, no porque hayamos acertado dónde cortar.

   ══ LAS TRES MEDIDAS QUE HAY QUE SACAR DEL PROPIO DOCUMENTO ══
   No se puede fijar ninguna a mano: cambian con la maquetación de cada
   convocatoria. Las tres se deducen, y las tres se comprueban:

    1 · DÓNDE ESTÁN LAS COLUMNAS → lo dice la fila de rótulos, que además se lee
        y sirve para saber QUÉ es cada columna. Un documento con columna
        CATEGORÍA se lee solo.
    2 · DÓNDE ACABA CADA FILA → el salto de línea dentro de una fila es más
        pequeño que el que hay entre dos filas, pero cuánto cambia con el
        documento. Se prueban los saltos que aparecen y gana el que deja tantas
        filas como anclas hay —el RUC, o el N° de orden donde no hay RUC—, con
        una en cada fila (ver `umbralDeFila`).
    3 · QUÉ ES MEMBRETE Y QUÉ ES TABLA → el membrete y el sello de copia
        auténtica se localizan por su texto y se recorta por su ALTURA, que se
        lleva de paso los trozos sueltos que no casan con ningún patrón.

   Y si algo de esto no cuadra —un PDF con otra maquetación, uno sin rótulos
   reconocibles— esto devuelve vacío y manda el trabajo al lector de texto, que
   sigue ahí. Este módulo es el camino bueno, no el único.
   ══════════════════════════════════════════════════════════════════════════ */

/** Un trozo de texto tal como lo entrega el PDF: su posición, su ancho y el
 *  ALTO de su letra.
 *  ⚠ El alto es opcional porque a este lector de tablas no le hace falta —una
 *  celda es una celda escriba como escriba—, pero al de sumillas de jurado sí:
 *  ahí lo único que separa un nombre de la línea de biografía que va debajo es
 *  el cuerpo de la letra. Va en el MISMO tipo para que el extractor sea uno
 *  solo: dos extractores casi iguales es la forma de que un arreglo entre por
 *  una puerta y no por la otra. */
export type Trozo = { x: number; y: number; w: number; s: string; h?: number };

export type FilaTabla = {
  /** Una celda por columna. */
  celdas: string[];
  /** La modalidad bajo la que va esta fila, cuando el documento parte su tabla
   *  en varias con un «MODALIDAD: …» delante de cada una. */
  modalidad: string | null;
  /** ⚠ Esta fila está bajo el «Artículo Segundo.- CONSIGNAR la siguiente
   *  relación como Lista de espera»: NO ganó. Va en la misma tabla, con las
   *  mismas columnas y hasta con su monto, y leerla como beneficiaria le suma
   *  un ganador al concurso que nunca existió. */
  espera: boolean;
};

export type TablaPdf = {
  /** Los rótulos de la cabecera, en orden. Dicen qué es cada columna. */
  rotulos: string[];
  filas: FilaTabla[];
};

/* ⚠ Los rótulos vienen partidos por líneas, y hay que reconocer cada trozo por
   separado: en las relaciones, «PERSONA» está en una línea y «JURÍDICA» en la
   de abajo. Sin reconocer los dos, esa columna no existe para el lector — y es
   la de la razón social, así que la tabla entera sale corrida. */
/* ⚠ Y hay que reconocerlos de TODAS las cosechas. DAFO cambia los rótulos de
   un año a otro sin avisar: donde 2026 dice «PERSONA JURÍDICA / REGIÓN /
   DIRECTOR(A/ES/RAS) DEL PROYECTO», 2025 dice «Postulante / Departamento /
   Representante Legal / Directores». Un rótulo que no se reconoce no es un
   detalle: la columna desaparece, las rayas caen donde no deben y el documento
   entero se lee por el camino de texto —con los nombres pegados al título—,
   que es justo lo que este lector existe para evitar. */
const ROTULOS = /^(PERSONA|JUR[ÍI]DICA|POSTULANTE|\(?RUC\)?|REGI[ÓO]N|DEPARTAMENTO|PROYECTO|T[ÍI]TULO|CATEGOR[ÍI]A|DIRECTOR|REPRESENTANTE|LEGAL|RESPONSAB|MONTO|N°|DEL PROYECTO|LE\(S\))/i;
/** El membrete de la Dirección y el encabezado bilingüe: siempre arriba. */
const CABEZA = /^(DIRECCI[ÓO]N (GENERAL|DEL)|DESPACHO VICEMINISTERIAL|PATRIMONIO CULTURAL|INDUSTRIAS CULTURALES|FONOGRAF[ÍI]A|MEDIOS$|ARTES$)|Decenio de la|Año de la|qamaña|kananpaq|jiwasana/i;
/** El sello de copia auténtica y la firma: siempre abajo. */
const PIE = /Esta es una copia|Art\. 25 de D\.S\.|validadorDocumental|tramitedocumentario|ingresando la|contrastadas|Documento f|irmado d|^DIRECTOR[A]? DE LA DIRECCI/i;
const RUC = /\(\s*\d[\d\s]{6,12}\d\s*\)/;

/* ── LOS 25 DEPARTAMENTOS, CON SUS DOS GRAFÍAS ──
   Viven aquí, y no en `resolucionDafo`, porque este módulo los necesita para
   algo estructural: son el ANCLA DE RESERVA. Las listas de 2022 no publican ni
   RUC ni número de orden —«PERSONA JURÍDICA / PROYECTO / DEPARTAMENTO /
   DIRECTORES»— y sin nada que aparezca una vez por fila no hay forma de saber
   dónde acaba una y empieza la otra. El departamento sí: uno por fila, escrito
   de una lista cerrada de veinticinco. Con acento y sin él, porque DAFO las
   escribe de las dos maneras en el mismo documento. */
export const REGIONES = [
  "LA LIBERTAD", "MADRE DE DIOS", "SAN MARTIN", "SAN MARTÍN",
  "AMAZONAS", "ANCASH", "ÁNCASH", "APURIMAC", "APURÍMAC", "AREQUIPA",
  "AYACUCHO", "CAJAMARCA", "CALLAO", "CUSCO", "CUZCO", "HUANCAVELICA",
  "HUANUCO", "HUÁNUCO", "ICA", "JUNIN", "JUNÍN", "LAMBAYEQUE", "LIMA",
  "LORETO", "MOQUEGUA", "PASCO", "PIURA", "PUNO", "TACNA", "TUMBES", "UCAYALI",
];
/** La celda ES un departamento (para contar filas).
 *  ⚠ SIN el flag `i`, y por eso se escriben las dos grafías a mano. Con él,
 *  «ica» —el final de «Cinematográf ica», que el PDF parte en dos— es la región
 *  de Ica y contaba como una fila más en mitad de la parte considerativa. Y no
 *  vale arreglarlo con un «que no sea todo minúsculas» dentro de la misma
 *  expresión: con `i`, `[a-z]` también casa las mayúsculas y la condición
 *  rechazaba TODAS las regiones —la tabla entera se quedaba sin ancla—. */
const TITULO = (r: string) =>
  r.split(" ").map(w => w[0] + w.slice(1).toLowerCase()).join(" ");
const RE_SOLO_REGION = new RegExp(
  `^\\s*(?:${REGIONES.join("|")}|${REGIONES.map(TITULO).join("|")})`
  + `(?:\\s+(?:REGI[ÓO]N|Regi[óo]n|METROPOLITANA|Metropolitana|PROVINCIAS|Provincias))?\\s*$`);
/** La celda EMPIEZA por un departamento (para reconocerla ya montada). */
const RE_EMPIEZA_REGION = new RegExp(`^\\s*(?:${REGIONES.join("|")})\\b`, "i");

/* ── QUÉ ES PROSA Y QUÉ ES UNA CELDA ──
   Hay que echar los párrafos de la resolución antes de armar filas, o cada
   párrafo se convierte en una fila fantasma. La señal es que van en minúscula
   mientras las celdas van en mayúsculas… salvo que NO es verdad: los títulos de
   los proyectos vienen tal como los escribió cada postulante, y muchos van en
   minúscula —«Cartografías del despojo», «caminos del agua»—.

   Por eso no basta el idioma: se mira también el TAMAÑO. Un párrafo ocupa el
   ancho de la caja de texto —trescientos, cuatrocientos puntos— o trae seis y
   siete palabras seguidas; una celda vive dentro de una columna de noventa
   puntos y cabe en tres o cuatro. Con la regla vieja se perdían trozos de
   título sin dejar rastro: la fila salía con media frase y nadie sabía por qué.

   ⚠ Y las palabras se cuentan con `\p{L}`, no con `\b`. El límite de palabra de
   JavaScript es ASCII, así que en «Cartografías» ve un límite justo antes de la
   «í» y cuenta «ías» como una palabra en minúscula: dos palabras y a la basura
   media línea. Es un fallo que solo aparece con tildes, o sea, en castellano. */
const PALABRAS = /[^\p{L}]+/u;
function esProsa(l: string, ancho = 0): boolean {
  const ps = l.split(PALABRAS).filter(Boolean);
  const min = ps.filter(p => p.length >= 3 && p === p.toLowerCase()).length;
  return min >= 2 && (ps.length >= 6 || ancho >= 200);
}

/**
 * Junta los trozos que el PDF partió dentro de una misma palabra.
 * «PRODUCCIONES S» y «.A.C.» llegan separados y pegados en la página; si el
 * corte de columna cae justo entre ellos, media razón social se va a la columna
 * de al lado. Se juntan por su geometría —se tocan— y se les pone un espacio
 * solo si lo había.
 */
/* ── LA MISMA LÍNEA ES LA MISMA `y` ──
   Los trozos de un renglón pueden llegar con la base a una décima unos de
   otros, y todo el módulo compara la altura por igualdad exacta —qué trozos
   forman una línea, dónde está la cabecera, cuánto hay de una línea a la
   siguiente—. Se agrupan por cercanía y se les iguala la altura.
   ⚠ Lo que NO se puede hacer es redondear las coordenadas al entrar, que es lo
   que parecía razonable: el hueco DENTRO de una fila y el hueco ENTRE dos filas
   miden trece puntos los dos en el fallo de 2023 y solo se distinguen por los
   decimales. Redondeando, la fila que hay que partir y la que no se vuelven
   indistinguibles. Aquí se igualan las líneas y se conservan las distancias. */
function alineaY(its: Trozo[], tol = 1.2): Trozo[] {
  const ys = [...new Set(its.map(i => i.y))].sort((a, b) => b - a);
  const rep = new Map<number, number>();
  let base = ys[0];
  for (const y of ys) {
    if (base - y > tol) base = y;
    rep.set(y, base);
  }
  return its.map(i => (rep.get(i.y) === i.y ? i : { ...i, y: rep.get(i.y)! }));
}

function juntaTrozos(its: Trozo[]): Trozo[] {
  const orden = [...its].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const out: Trozo[] = [];
  for (const i of orden) {
    const u = out[out.length - 1];
    const hueco = u ? i.x - (u.x + u.w) : Infinity;
    if (u && u.y === i.y && hueco < 4) {
      u.s += (hueco >= 1 ? " " : "") + i.s;
      u.w = i.x + i.w - u.x;
    } else out.push({ ...i });
  }
  return out;
}

/** Los rótulos de la cabecera se agrupan por cercanía en x: «PERSONA JURÍDICA»
 *  y «(RUC)» son dos rótulos de la MISMA columna, uno debajo del otro. */
function columnasDeCabecera(cab: Trozo[]): { cortes: number[]; rotulos: string[]; grupos: number[][] } {
  const xs = [...new Set(cab.map(i => i.x))].sort((a, b) => a - b);
  /* ⚠ EL «N°» NUNCA COMPARTE COLUMNA CON NADIE. Se agrupa por cercanía porque
     «PERSONA JURÍDICA» y «(RUC)» son dos rótulos de la misma columna, pero en
     el fallo de 2024 el «N°» va a veinte puntos de «PERSONA JURÍDICA» —menos
     que esos dos entre sí— y se los tragaba juntos: una columna menos y el
     número de orden metido dentro del nombre, «T.V. CULTURA 2», «ASOCIACION
     CULTURAL DE 4 INTEGRACION». Y no se puede arreglar bajando el umbral, que
     partiría en dos las cabeceras de todos los demás. El «N°» es reconocible
     por sí mismo, así que se le respeta su columna. */
  const esN = (x: number) => cab.some(i => i.x === x && /^n\s*°$/i.test(i.s.trim()));
  const grupos: number[][] = [];
  for (const x of xs) {
    const u = grupos[grupos.length - 1];
    const soloN = !!u && u.length === 1 && esN(u[0]);
    if (u && !soloN && !esN(x) && x - u[u.length - 1] < 40) u.push(x);
    else grupos.push([x]);
  }
  return {
    grupos,
    cortes: grupos.slice(1).map((g, i) => (Math.max(...grupos[i]) + Math.min(...g)) / 2),
    rotulos: grupos.map(g =>
      cab.filter(i => g.includes(i.x)).sort((a, b) => b.y - a.y).map(i => i.s).join(" ")),
  };
}

/* ── DÓNDE ESTÁ EXACTAMENTE LA RAYA ENTRE DOS COLUMNAS ──
   La cabecera dice CUÁNTAS columnas hay y qué es cada una, pero no dónde acaba
   una y empieza la otra: los rótulos van centrados y las celdas son mucho más
   anchas que ellos. En una relación, «N°» está en x=47 y «PERSONA JURÍDICA» en
   x=117, así que su punto medio cae en 82 — y la razón social empieza en x=71.
   Con ese corte, media tabla se metía en la columna del número.

   Lo que sí lo dice es el cuerpo: entre dos columnas hay una franja vertical
   por la que no pasa NINGÚN texto, y es la más ancha de la zona. Se buscan las
   k-1 franjas más anchas y el corte va en medio de cada una.
   ⚠ Y se comprueba: cada rótulo tiene que caer en una banda distinta y en
   orden. Si no —un documento con una columna vacía, una maquetación rara—, se
   vuelve al punto medio de los rótulos, que al menos nunca inventa una columna. */
function cortesDeCuerpo(xs: number[], k: number): number[] {
  const u = [...new Set(xs)].sort((a, b) => a - b);
  if (u.length < k) return [];
  const huecos = u.slice(1).map((x, i) => ({ c: (x + u[i]) / 2, d: x - u[i] }));
  return huecos.sort((a, b) => b.d - a.d).slice(0, k - 1).map(h => h.c).sort((a, b) => a - b);
}

type Pagina = { cuerpo: Trozo[]; cortes: number[]; marcas: Trozo[] };

/* ── UN DOCUMENTO, VARIAS TABLAS ──
   Una relación de recibidas trae la lista de cada modalidad una detrás de otra,
   con un «MODALIDAD: DESARROLLO DE LARGOMETRAJES» delante. Esa línea va ARRIBA
   de la cabecera de su tabla, así que no es cuerpo y hay que recogerla aparte:
   sin ella, las filas de las dos modalidades llegan indistinguibles y se cargan
   todas juntas en una convocatoria que es UNA de las dos. */
const RE_MODALIDAD = /^MODALIDAD\s*:\s*(.*)$/i;
/* La frase con la que el fallo abre la tabla de los que no ganaron. Se pide la
   fórmula entera —«relación como "Lista de espera"»— y no las tres palabras
   sueltas, porque la parte considerativa las repite media docena de veces
   («…recursos que son destinados a la "Lista de espera"…») y ahí no abren
   ninguna tabla. */
const RE_ESPERA = /relaci[óo]n\s+como\s*[«"'‘“]?\s*lista\s+de\s+espera/i;

/* ── QUÉ ANCLA UNA FILA ──
   En las resoluciones, su RUC: uno por fila y nada más se le parece. Pero las
   RELACIONES DE RECIBIDAS no traen RUC —DAFO no lo publica en esa lista— y sin
   ancla no hay forma de saber si el umbral de fila acertó. Lo que sí traen es
   el N° de orden en su primera columna, que hace exactamente el mismo papel.
   Se elige mirando los rótulos: si hay columna de N°, manda el N°. */
type Ancla = {
  col: number;
  /** Reconoce el ancla dentro de la celda ya montada. */
  re: RegExp;
  /** Y reconoce el trozo suelto que la lleva, para poder CONTAR cuántas filas
   *  debería haber antes de montarlas. */
  suelta: RegExp;
};
function anclaDe(rotulos: string[]): Ancla {
  const n = rotulos.findIndex(r => /^n\s*°/i.test(r.trim()));
  /* ⚠ Con el N° hacen falta las dos formas, y no es lo mismo. En una relación,
     el rótulo suele venir «N° PERSONA» en una línea y «JURÍDICA REGIÓN…» en la
     siguiente, así que el número y la razón social acaban en la MISMA columna y
     la celda montada dice «1 ANGULO CERO E.I.R.L.»: para reconocerla vale que
     EMPIECE por el número. Para contar, en cambio, hay que exigir el número
     solo — si no, «3 PECADOS PRODUCCIONES S.A.C.», que es el nombre de la
     empresa de la fila 1, se contaría como una fila más. */
  return n >= 0
    ? { col: n, re: /^\s*\d{1,3}(\s|$)/, suelta: /^\s*\d{1,3}\s*$/ }
    : { col: 0, re: RUC, suelta: RUC };
}

/* ── EL ANCLA DE RESERVA: EL DEPARTAMENTO ──
   Solo se usa cuando la de verdad no aparece ni una vez, que es lo que pasa con
   las listas de 2022: no traen RUC ni N° y el lector devolvía «aquí no hay
   tabla» para tres documentos con sus tablas perfectamente pintadas.
   ⚠ Es peor ancla que las otras dos y por eso va la última: un departamento
   partido en dos líneas —«MADRE DE» / «DIOS»— no se reconoce, y esa fila se
   pierde. Vale para saber DÓNDE se corta cada fila, no para fiarse de ella. */
function anclaDeRegion(rotulos: string[]): Ancla | null {
  const i = rotulos.findIndex(r => /regi[óo]n|departamento/i.test(r));
  return i >= 0 ? { col: i, re: RE_EMPIEZA_REGION, suelta: RE_SOLO_REGION } : null;
}
/* Si esta fila trae su ancla se sabe contando TROZOS al armarla (`n`), no
   buscándola en el texto: una celda puede llevar delante un cacho de la columna
   vecina y entonces ya no empieza por su número. */
const tieneAncla = (r: FilaArmada) => r.n > 0;

/** Reparte los trozos de una página en filas, con el umbral dado.
 *  ⚠ Se guardan las LÍNEAS, no el texto ya montado: hasta el final no se sabe
 *  dónde acaba cada fila, y una vez pegadas las celdas ya no hay forma de
 *  volver a separarlas (ver `parteDobles`). */
type Linea = { y: number; its: Trozo[] };
type FilaArmada = { u: number; ls: Linea[]; cortes: number[]; n: number; mod: string | null; esp: boolean };

const esAncla = (i: Trozo, cortes: number[], ancla: Ancla) =>
  cortes.filter(z => i.x > z).length === ancla.col && ancla.suelta.test(i.s);

/** Las celdas de una fila: cada trozo en su columna, de arriba abajo y de
 *  izquierda a derecha, que es como se lee. */
const celdasDe = (r: FilaArmada): string[] => {
  const c: string[] = Array(r.cortes.length + 1).fill("");
  for (const l of r.ls) {
    for (const i of [...l.its].sort((a, b) => a.x - b.x)) {
      const k = r.cortes.filter(z => i.x > z).length;
      c[k] = c[k] ? `${c[k]} ${i.s}` : i.s;
    }
  }
  return c;
};

const cuentaAnclas = (ls: Linea[], cortes: number[], ancla: Ancla) =>
  ls.reduce((n, l) => n + l.its.filter(i => esAncla(i, cortes, ancla)).length, 0);

/* ══════════════════════════════════════════════════════════════════════════
   DOS ANCLAS EN UNA FILA SON DOS FILAS

   El umbral no siempre puede separarlas, y no por estar mal elegido: en el
   fallo de 2023 el hueco ENTRE dos filas mide trece puntos y el hueco entre dos
   líneas DENTRO de una fila mide también trece. No hay ningún umbral que corte
   por un sitio y no por el otro, y las filas salían de dos en dos —ocho
   ganadoras leídas como siete, con dos razones sociales y dos RUC en la misma—.

   Lo que sí es seguro es que cada fila tiene UN ancla. Así que una fila con dos
   se parte por el hueco más ancho que haya entre ellas: entre dos filas siempre
   hay al menos tanto aire como dentro de una, y si empatan —que es justo lo que
   pasa aquí— manda el primero, que es el que separa la fila que ya se cerró de
   la que empieza.

   ⚠ Y esto se hace SOLO al final, nunca mientras se busca el umbral: ahí lo que
   se mide es cuántas filas salen con dos anclas, y arreglarlas antes de contar
   dejaría siempre cero y el umbral se elegiría a ciegas.
   ══════════════════════════════════════════════════════════════════════════ */
function parteUna(r: FilaArmada, ancla: Ancla): FilaArmada[] {
  const conAncla = r.ls
    .map((l, k) => (l.its.some(i => esAncla(i, r.cortes, ancla)) ? k : -1))
    .filter(k => k >= 0);
  if (conAncla.length < 2) return [r];
  let corte = -1, mayor = -Infinity;
  for (let k = conAncla[0]; k < conAncla[conAncla.length - 1]; k++) {
    const hueco = r.ls[k].y - r.ls[k + 1].y;
    if (hueco > mayor) { mayor = hueco; corte = k; }
  }
  if (corte < 0) return [r];
  const uno: FilaArmada = { ...r, ls: r.ls.slice(0, corte + 1), n: 0 };
  const dos: FilaArmada = { ...r, ls: r.ls.slice(corte + 1), n: 0 };
  uno.n = cuentaAnclas(uno.ls, r.cortes, ancla);
  dos.n = cuentaAnclas(dos.ls, r.cortes, ancla);
  return [...parteUna(uno, ancla), ...parteUna(dos, ancla)];
}

function armaFilas(paginas: Pagina[], umbral: number, ancla: Ancla, unir = true, espera0 = false): FilaArmada[] {
  const out: FilaArmada[] = [];
  /* ⚠ Las marcas se reinician AQUÍ, no al final: el umbral se prueba una docena
     de veces y cada pasada tiene que ver el documento entero desde el
     principio. Limpiándolas al salir, la primera pasada se las quedaba y en
     todas las demás el documento parecía tener una sola modalidad. */
  for (const pg of paginas) for (const m of pg.marcas) delete (m as any)._usada;
  /* La modalidad se arrastra entre páginas: la tabla de una sigue en la
     siguiente sin repetir su rótulo. */
  let modalidad: string | null = null;
  /* Y la lista de espera igual: empieza en su artículo y ya no se acaba —lo que
     viene detrás en el documento son los artículos de cierre, no otra tabla—. */
  let espera = espera0;
  for (const pg of paginas) {
    let act: FilaArmada | null = null;
    for (const y of [...new Set(pg.cuerpo.map(i => i.y))].sort((a, b) => b - a)) {
      /* Toda marca de modalidad que quede POR ENCIMA de esta línea ya se aplicó:
         a partir de aquí manda la última. */
      for (const m of pg.marcas.filter(m => m.y >= y && !(m as any)._usada)) {
        if (RE_ESPERA.test(m.s)) espera = true;
        else modalidad = m.s.replace(RE_MODALIDAD, "$1").trim() || modalidad;
        (m as any)._usada = true;
        act = null;
      }
      if (!act || act.u - y > umbral) {
        act = { u: y, ls: [], cortes: pg.cortes, n: 0, mod: modalidad, esp: espera };
        out.push(act);
      }
      act.u = y;
      const its = pg.cuerpo.filter(j => j.y === y);
      act.ls.push({ y, its });
      /* Cuántas anclas cayeron en esta fila, contadas por TROZO de la página y
         no buscándolas en el texto ya montado: «1 3 PECADOS PRODUCCIONES» son
         dos números y una sola fila, y contando letras no hay forma de saberlo. */
      act.n += its.filter(i => esAncla(i, pg.cortes, ancla)).length;
    }
  }
  /* ⚠ Sin unir mientras se busca el umbral. Unir es lo que arregla las filas
     que parte el salto de página, pero si se hace ANTES de saber cuál es el
     umbral bueno, tapa el error que hay que medir: con un umbral diminuto cada
     fila se rompe en cuatro trozos, la unión los vuelve a pegar de cualquier
     manera y la cuenta sale casi bien. Se mide sin unir y se une al final. */
  if (!unir) return out;

  const sueltas = out.flatMap(r => (r.n > 1 ? parteUna(r, ancla) : [r]));

  /* ── LO QUE EL SALTO DE PÁGINA PARTIÓ ──
     Una fila puede quedarse a medias al pie de una página y seguir en la
     siguiente. Se reconoce sin ambigüedad porque le falta su ancla —o porque lo
     que viene detrás es SOLO el ancla, que es la cola de la anterior—, y las dos
     mitades se juntan. Con esto el pie de página se cae solo al filtrar por
     ancla: nunca trae una. */
  const unidas: FilaArmada[] = [];
  for (const r of sueltas) {
    const ant = unidas[unidas.length - 1];
    const cr = celdasDe(r);
    const sola = tieneAncla(r)
      && !(cr[ancla.col] || "").replace(ancla.re, "").trim()
      && !cr.filter((_, i) => i !== ancla.col).some(Boolean);
    const ca = ant ? celdasDe(ant) : [];
    if (ant && !tieneAncla(ant) && (sola || !ca.filter((_, i) => i !== ancla.col).some(Boolean))) {
      ant.ls.push(...r.ls);
      ant.n += r.n;
      continue;
    }
    unidas.push(r);
  }
  return unidas.filter(r => tieneAncla(r));
}

/**
 * El umbral que separa «salto dentro de una fila» de «salto entre filas».
 *
 * No se puede fijar: en el documento de prueba los saltos internos son de 6, 12
 * y 13 puntos y los de fila de 16 y 17, pero eso es de ESA maquetación. Y no se
 * puede sacar de la estadística de los saltos, porque los dos grupos se tocan.
 *
 * Lo dice el propio documento: cada fila tiene UN ancla —su RUC, o su N° de
 * orden donde no hay RUC—, así que el umbral bueno es el que deja tantas filas
 * como anclas hay, con exactamente una en cada fila.
 * Se prueban de mayor a menor los saltos que de verdad aparecen — un umbral
 * grande junta filas y uno pequeño las parte, y los dos errores se compensan en
 * la cuenta, así que la condición del «un RUC por fila» es la que decide.
 */
function umbralDeFila(paginas: Pagina[], nAnclas: number, ancla: Ancla, espera0 = false): { umbral: number; filas: FilaTabla[] } {
  const todos = paginas.flatMap(pg => {
    const ys = [...new Set(pg.cuerpo.map(i => i.y))].sort((a, b) => b - a);
    return ys.slice(1).map((y, i) => ys[i] - y);
  }).filter(g => g >= 5 && g <= 40).sort((a, b) => a - b);
  /* ⚠ Y UN TECHO, sacado del propio documento. Detrás de la última fila sigue
     la prosa —«Artículo Tercero.- Remitir…»— separada por treinta puntos, y con
     un umbral así de grande esa prosa entra dentro de la última fila: la cuenta
     de anclas sale perfecta y la fila acaba con media resolución dentro de la
     columna de la región. Ninguna fila tiene sus líneas al triple de lo que
     mide un renglón: esa es la medida que sobra, y la da la mediana. */
  const mediana = todos.length ? todos[Math.floor(todos.length / 2)] : 14;
  const saltos = [...new Set(todos)].filter(g => g <= mediana * 3 + 1);

  let mejor = { umbral: 14, mal: Infinity };
  for (let i = saltos.length - 1; i >= 0; i--) {
    const umbral = saltos[i] + 0.5;
    const filas = armaFilas(paginas, umbral, ancla, false);
    /* Lo que se mide, sin unir todavía:
        · que haya tantas filas CON su ancla como anclas hay;
        · que ninguna traiga dos —eso es que se juntaron dos filas—;
        · y que haya pocas sin ninguna: alguna habrá, la que parte cada salto de
          página, pero si hay muchas es que el umbral está partiendo de más. */
    const conUna = filas.filter(r => r.n === 1).length;
    const conDos = filas.filter(r => r.n > 1).length;
    const sinNinguna = filas.filter(r => r.n === 0).length;
    const mal = Math.abs(conUna - nAnclas) + conDos * 3 + sinNinguna;
    if (mal < mejor.mal) mejor = { umbral, mal };
    if (mal === 0) break;
  }
  return {
    umbral: mejor.umbral,
    filas: armaFilas(paginas, mejor.umbral, ancla, true, espera0).map(r => ({ celdas: celdasDe(r), modalidad: r.mod, espera: r.esp })),
  };
}

/** Un tramo de documento leído con UNAS columnas concretas: una tabla. */
type Segmento = {
  rotulos: string[];
  cortes: number[];
  /** Dónde empieza cada columna de su cabecera: es la HUELLA de la tabla. */
  xs: number[];
  partes: Pagina[];
  /** ⚠ Nació DESPUÉS del «…como Lista de espera», aunque esa línea se quedara
   *  en la página anterior. En el fallo de 2023 el artículo va al pie de una
   *  hoja y su tabla empieza en la siguiente: la marca no llegaba nunca y cinco
   *  suplentes se contaban como ganadoras. */
  espera0: boolean;
};

/** La línea de una marca es un TÍTULO, no una fila: fuera del cuerpo entera —no
 *  solo el trozo que casó—, o el «Artículo Segundo.- CONSIGNAR» se pega delante
 *  del nombre de la primera empresa de su tabla. */
const parte = (cuerpo: Trozo[], cortes: number[], marcas: Trozo[], todas = marcas): Pagina => ({
  /* Se quitan las líneas de TODAS las marcas de la página, no solo las de esta
     parte: la que presenta a la tabla de abajo está, por definición, encima. */
  cuerpo: cuerpo.filter(i => !todas.some(m => Math.abs(i.y - m.y) <= 2)),
  cortes: [...cortes], marcas,
});

/**
 * Arma LAS TABLAS de un documento a partir de los trozos de cada página.
 *
 * ── POR QUÉ VARIAS Y NO UNA ──
 * Porque una resolución trae más de una, y no siempre iguales. El fallo de
 * Documental 2024 pone primero las BENEFICIARIAS —persona jurídica, región,
 * proyecto, director, monto— y debajo la LISTA DE ESPERA, que además lleva
 * columna de N°. Son dos tablas distintas en el mismo papel.
 *
 * ⚠ Leyendo el documento como una sola tabla, la última cabecera pisaba a la
 * primera: las rayas y —peor— el ANCLA pasaban a ser las de la segunda, y como
 * las beneficiarias no tienen N° se quedaban sin ancla y desaparecían enteras.
 * De un fallo con doce ganadoras se leían seis filas, que eran justo las que no
 * habían ganado. Cada tabla se lee ahora con sus propias columnas y su propio
 * ancla, y el documento devuelve todas.
 *
 * @param paginas un arreglo de trozos por página, tal como los da el PDF.
 * @returns una entrada por tabla reconocida, en el orden en que aparecen.
 */
export function armarTablas(paginas: Trozo[][]): TablaPdf[] {
  const segs: Segmento[] = [];
  let act: Segmento | null = null;
  /* Una vez abierta la lista de espera, lo que queda del documento es suya.
     Se lleva en dos pasos —lo visto en páginas ANTERIORES y lo visto en esta—
     porque una marca al pie de una página abre la tabla que empieza en la
     siguiente, y una marca de esta página ya la recogen sus propios segmentos. */
  let esperaPrevia = false, esperaEstaPag = false;

  for (const cruda of paginas) {
    esperaPrevia = esperaPrevia || esperaEstaPag;
    esperaEstaPag = false;
    /* ⚠ TODO A NFC, LO PRIMERO DE TODO. Estos PDF no traen el texto de una sola
       manera: unos entregan «relación» con la ó de una pieza (NFC) y otros
       —el fallo de Documental 2025, sin ir más lejos— la entregan
       descompuesta, «relacio» + una tilde suelta encima (NFD). Se ven igual en
       pantalla y NO son la misma cadena: cualquier expresión con tilde
       —`REGI[ÓO]N`, `CATEGOR[ÍI]A`, la marca de la lista de espera— deja de
       casar en la mitad de los documentos, y no falla con un error sino
       callándose. Normalizar aquí, una vez, es lo que hace que el resto del
       módulo pueda escribir castellano sin pensarlo. */
    let its = juntaTrozos(alineaY(cruda.filter(i => i.s.trim())
      .map(i => (i.s.normalize("NFC") === i.s ? i : { ...i, s: i.s.normalize("NFC") }))));
    /* Las marcas de modalidad, antes de recortar nada: viven fuera de la tabla. */
    const marcas = its.filter(i => RE_MODALIDAD.test(i.s) || RE_ESPERA.test(i.s));
    esperaEstaPag = marcas.some(m => RE_ESPERA.test(m.s));
    /* ── FUERA EL MEMBRETE Y EL SELLO, POR ALTURA ──
       ⚠ Y cada uno buscado SOLO EN SU MITAD DE LA PÁGINA. Las dos frases que
       marcan el membrete vuelven a aparecer, palabra por palabra, en el bloque
       de firma del final —«DIRECCIÓN DEL AUDIOVISUAL…» va arriba en todas las
       páginas y otra vez abajo, debajo del nombre de quien firma—, y el sello
       digital se estampa arriba del todo, encima del membrete. Buscando el
       mínimo y el máximo en la página entera los dos recortes se CRUZAN —hay
       que estar por debajo de 274 y por encima de 308 a la vez— y la página
       sale vacía sin un solo error: en este documento se perdían así las cinco
       últimas filas de la tabla. */
    const alturas = its.map(i => i.y);
    const medio = (Math.max(...alturas) + Math.min(...alturas)) / 2;
    /* ⚠ El membrete se busca PEGADO AL BORDE DE ARRIBA, no «en la mitad
       superior». La última página de una resolución es corta —dos párrafos y la
       firma— así que su mitad cae muy abajo y el bloque de firma, que repite
       «DIRECCIÓN GENERAL DE INDUSTRIAS CULTURALES Y ARTES» palabra por palabra,
       quedaba del lado del membrete: la página entera se recortaba y con ella
       la tabla de una fila que el artículo segundo incorpora. Cien puntos desde
       el trozo más alto es todo lo que ocupa un membrete de estos. */
    const yTope = Math.max(...alturas);
    const yCab = Math.min(...its.filter(i => i.y > yTope - 120 && CABEZA.test(i.s)).map(i => i.y), Infinity);
    const yPie = Math.max(...its.filter(i => i.y < medio && PIE.test(i.s)).map(i => i.y), -Infinity);
    its = its.filter(i => i.y < yCab && i.y > yPie && !esProsa(i.s, i.w));
    /* ── Y FUERA LAS LÍNEAS DE ARTÍCULO, ENTERAS ──
       «Artículo Tercero. - Remitir la presente Resolución…» cierra la
       resolución justo debajo de la última fila. El párrafo se cae solo por
       largo, pero el encabezado —«Artículo Tercero.», dos palabras— no lo
       parece, y la última fila acababa con «LIMA General, aprobado la presente
       resolución» en la columna del departamento. Un renglón que empieza por
       «Artículo» no es una fila de ninguna tabla: nunca. */
    const yArt = its.filter(i => /^art[íi]culo\s/i.test(i.s)).map(i => i.y);
    if (yArt.length) its = its.filter(i => !yArt.some(y => Math.abs(i.y - y) <= 2));

    /* La cabecera de la tabla: la banda de altura con tres o más rótulos. Solo
       la primera página de la tabla la trae; las demás heredan sus columnas. */
    /* ⚠ TRES O MÁS RÓTULOS NO BASTAN PARA QUE UNA LÍNEA SEA LA CABECERA. En
       estas resoluciones la parte considerativa cita otras resoluciones —«Que,
       mediante Resolución Directoral N° 000408-2025-DGIA…»— y el PDF la trae
       palabra por palabra en trozos sueltos: «Directoral» y «N°» pican en la
       lista de rótulos, dos veces cada uno, y esa línea de prosa se colaba como
       cabecera de una tabla que no existe. Peor aún: al traer un «N°», el
       lector cambiaba el ancla de las filas del RUC al número de orden, se
       quedaba sin anclas que contar y devolvía «aquí no hay tabla» para un
       documento que sí la tenía.
       Se pide, además, que la línea sea CASI TODA rótulos. Una cabecera lo es
       al cien por cien; una línea de prosa que pica en dos palabras, no. */
    let cab: { y: number; its: Trozo[] } | null = null;
    for (const y of [...new Set(its.map(i => i.y))].sort((a, b) => b - a)) {
      const banda = its.filter(i => Math.abs(i.y - y) <= 14);
      const rot = banda.filter(i => ROTULOS.test(i.s));
      /* Y la cabecera se hace con TODA la banda, no solo con lo que se
         reconoció: un rótulo nuevo que no esté en la lista —y los hay cada año—
         se lleva por delante su columna entera si no se cuenta. Con la banda
         completa, la columna existe aunque no sepamos aún cómo se llama. */
      if (rot.length >= 3 && rot.length >= banda.length * 0.6) { cab = { y, its: banda }; break; }
    }
    /* ── UNA CABECERA PUEDE TENER TRES LÍNEAS ──
       «PERSONA JURÍDICA / (RUC)» son dos, y con «DIRECTOR(A/ES/ AS) / DEL
       PROYECTO» se van a tres. La banda de ±14 puntos coge dos; la tercera se
       queda fuera, entra en el cuerpo y se pega delante de la primera fila:
       «(RUC) ARTESANO FILMS…», «mismo concurso: PERSONA JURÍDICA (RUC) BRANDED
       DOCUMENTARIES…». Así que la banda se estira hacia abajo mientras lo que
       venga siga siendo rótulos y no una fila. */
    if (cab) {
      for (;;) {
        const c0 = columnasDeCabecera(cab.its);
        const suelo = Math.min(...cab.its.map(i => i.y));
        const siguiente = [...new Set(its.filter(i => i.y < suelo - 0.5).map(i => i.y))]
          .sort((a, b) => b - a)[0];
        /* Las líneas de una cabecera van pegadas —seis puntos— y las filas de
           datos al doble. Ese hueco es lo que separa «sigue la cabecera» de
           «empieza la tabla», y no hay que adivinarlo. */
        if (siguiente === undefined || suelo - siguiente > 9) break;
        const linea = its.filter(i => Math.abs(i.y - siguiente) <= 2);
        /* ⚠ Y no vale pedirle que sean rótulos reconocibles: la tercera línea de
           una cabecera suele ser el FINAL de las palabras de arriba —«PROYECT»
           / «O», «MONTO» / «OTORGADO»—, que no significan nada por su cuenta.
           Lo que sí se puede exigir es que caigan dentro de las columnas que ya
           marcó la cabecera: un renglón de cabecera no estrena columnas. */
        const cabe = linea.length <= c0.grupos.length;
        if (!cabe || !linea.some(i => ROTULOS.test(i.s))) break;
        cab = { y: cab.y, its: [...cab.its, ...linea] };
      }
    }
    /* ── ¿ESTA PÁGINA SIGUE LA TABLA DE ANTES O EMPIEZA OTRA? ──
       Sin cabecera, sigue la de antes. Con una cabecera igual a la que traemos
       —las relaciones repiten la suya en cada página— también. Con una
       cabecera DISTINTA empieza una tabla nueva, con sus columnas y su ancla. */
    if (!cab) {
      if (act) act.partes.push(parte(its, act.cortes, marcas));
      continue;
    }
    const c = columnasDeCabecera(cab.its);
    /* Los bordes REALES de la banda: la cabecera puede haberse estirado. */
    const techo = Math.max(...cab.its.map(i => i.y));
    const suelo = Math.min(...cab.its.map(i => i.y));
    const arriba = its.filter(i => i.y > techo + 2);
    const debajo = its.filter(i => i.y < suelo - 2);

    /* ── LO QUE HAY ENCIMA DE UNA CABECERA A MITAD DE PÁGINA ──
       Es el final de la tabla ANTERIOR: el fallo de 2025 pone cuatro
       beneficiarias y, en la misma hoja, la cabecera de la lista de espera.
       Cortando por debajo de la cabecera esas cuatro desaparecían —el concurso
       decía cinco ganadoras cuando fueron ocho, sin un solo aviso—. */
    /* ⚠ La frontera entre las dos tablas se mide con la ÚLTIMA ANCLA de la de
       arriba —su último RUC, su último N°— y no con «lo más bajo que haya».
       Entre una tabla y la siguiente cabecera quedan restos de la prosa que no
       llegaron a parecerlo (un guion suelto, un «Artículo Segundo.»), y basta
       uno para que la línea que presenta la tabla de abajo caiga del lado
       equivocado: la lista de espera volvía a leerse como beneficiarias. El
       ancla, en cambio, es lo último que de verdad pertenece a la tabla de
       arriba. */
    const anc0 = act ? anclaDe(act.rotulos) : null;
    const ultAncla = anc0
      ? Math.min(...arriba.filter(i => anc0.suelta.test(i.s)).map(i => i.y), Infinity)
      : Infinity;
    /* Lo de arriba es el final de la tabla anterior, y solo si trae anclas: los
       restos de prosa —«SE RESUELVE:», «Jurídicas:»— no traen ninguna, y sin
       esta comprobación se colaban delante de la primera empresa. */
    if (act && ultAncla < Infinity)
      act.partes.push(parte(arriba, act.cortes, marcas.filter(m => m.y >= ultAncla), marcas));
    /* Una marca por debajo de esa frontera es de la tabla NUEVA: es la línea
       que la presenta —«MODALIDAD: …», «…como Lista de espera»—. */
    const marcasAqui = marcas.filter(m => m.y < ultAncla);

    /* ── ¿ES LA MISMA TABLA O UNA NUEVA? ──
       Por su GEOMETRÍA antes que por sus palabras. Una relación repite su
       cabecera en cada página y no siempre se lee igual —una línea que se pega
       distinto, un rótulo que se parte— y comparando el texto, la misma tabla
       se rompía en dos a mitad de documento: la segunda mitad estrenaba
       columnas medidas con cuatro renglones y salía con el N° dentro del
       nombre. Las columnas, en cambio, están donde estaban.
       ⚠ Y al revés también: en el «Aptos con nulidad» de 2022, el artículo
       segundo incorpora UNA empresa más con una tabla de rótulos idénticos pero
       veinte puntos más estrecha. Dándola por la misma, su única fila se leía
       con las rayas de la otra, su departamento caía en la columna de al lado
       y la fila se perdía entera —sin aviso, porque para el lector nunca
       existió—. Manda la geometría, no el texto. */
    const xsNueva = c.grupos.map(g => Math.min(...g));
    const mismaTabla = !!act && act.xs.length === xsNueva.length
      && act.xs.every((x, i) => Math.abs(x - xsNueva[i]) <= 10);
    if (act && mismaTabla) {
      act.partes.push(parte(debajo, act.cortes, marcasAqui, marcas));
      continue;
    }

    /* ── DÓNDE VAN LAS RAYAS DE LA TABLA NUEVA ──
       Se sacan de lo que va DEBAJO de la cabecera, que es su tabla: encima
       puede haber filas de otra tabla o restos de prosa, y sus x caen justo
       donde tiene que haber hueco. Y si debajo apenas hay tres renglones no hay
       con qué medir: se usan los puntos medios de los rótulos, que nunca
       inventan una columna aunque afinen menos. */
    const xsRotulo = c.grupos.map(g => Math.min(...g));
    /* ⚠ Y midiendo SOLO dentro del ancho de la tabla. En el margen derecho de
       estas páginas aparecen trozos sueltos —un número de página, un resto del
       sello— y el hueco que dejan es más ancho que el que separa el N° de la
       razón social: la raya se iba allí, la primera columna se quedaba sin
       partir y el número de orden acababa dentro del nombre de la empresa.
       Fuera del primer y el último rótulo no puede haber ninguna raya, así que
       lo de fuera no tiene voz en la medición. */
    const xIni = Math.min(...xsRotulo), xFin = Math.max(...xsRotulo);
    const porCuerpo = cortesDeCuerpo(
      debajo.map(i => i.x).filter(x => x >= xIni - 6 && x <= xFin + 6), c.rotulos.length);
    const bandaDe = (x: number, cs: number[]) => cs.filter(z => x > z).length;
    const cuadra = porCuerpo.length === c.cortes.length
      && xsRotulo.every((x, i) => bandaDe(x, porCuerpo) === i);
    const suficiente = debajo.length >= (c.rotulos.length + 1) * 3;
    const cortes = cuadra && suficiente ? porCuerpo : c.cortes;

    act = { rotulos: c.rotulos, cortes, xs: xsNueva, espera0: esperaPrevia,
      partes: [parte(debajo, cortes, marcasAqui, marcas)] };
    segs.push(act);
  }

  /* Cada tabla, con SU ancla: tantas filas como anclas hay —el RUC, o el N° de
     orden donde no hay RUC—, con una en cada fila. Lo de contar la columna
     importa: un «12» suelto dentro del título de un proyecto no es el número de
     ninguna fila. */
  const cuantas = (sg: Segmento, a: Ancla) => sg.partes.reduce((n, pg) => n + pg.cuerpo.filter(i =>
    a.suelta.test(i.s) && pg.cortes.filter(c => i.x > c).length === a.col).length, 0);

  return segs.map(sg => {
    let ancla = anclaDe(sg.rotulos);
    let nAnclas = cuantas(sg, ancla);
    /* Ni un RUC ni un número: será una lista de las que no los publican, y
       entonces manda el departamento (ver `anclaDeRegion`). */
    if (!nAnclas) {
      const alt = anclaDeRegion(sg.rotulos);
      if (alt) { ancla = alt; nAnclas = cuantas(sg, alt); }
    }
    if (!nAnclas) return null;
    const { filas } = umbralDeFila(sg.partes, nAnclas, ancla, sg.espera0);
    return filas.length ? { rotulos: sg.rotulos, filas } : null;
  }).filter((t): t is TablaPdf => !!t);
}

/** La tabla más grande del documento, para quien solo espera una. */
export function armarTabla(paginas: Trozo[][]): TablaPdf | null {
  return [...armarTablas(paginas)].sort((a, b) => b.filas.length - a.filas.length)[0] || null;
}
