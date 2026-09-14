/* ══════════════════════════════════════════════════════════════════════════
   LAS LISTAS QUE PUBLICA DAFO — QUIÉN MÁS POSTULÓ

   Cada concurso deja un rastro público de cuatro documentos: la relación de
   RECIBIDAS, la resolución de APTAS, la de FINALISTAS y el fallo que declara
   BENEFICIARIAS. Entre los cuatro está la respuesta a «con quién compito», que
   hoy solo se puede leer abriendo PDFs de cuarenta páginas.

   Esto LEE, no guarda. Entra el texto ya extraído y salen filas, para poder
   probarlo contra doce documentos reales sin abrir un PDF ni tocar la base.

   ══ LO QUE SE MIDIÓ EN LOS DOCE, Y POR QUÉ MANDA EL DISEÑO ══
   El texto extraído PIERDE las columnas: no hay coordenadas y el detector de
   tablas no ve ninguna tabla. Pero NO llega todo pegado: cada celda conserva
   sus saltos de línea, así que la razón social de una fila sigue siendo un
   grupo de líneas propio. Eso es lo que se aprovecha para cortar (ver
   `partirBloque`), y es la diferencia entre «CAMPESINA GALACTICA S.A.C.» y
   «SALAVERRY CONCHA VALCARCEL GABRIELA CAMPESINA GALACTICA S.A.C.».

   Anclas que sí sobreviven, y por eso son las que se leen:
    · El RUC entre paréntesis. 200 en las diez resoluciones y no hay ni un
      falso positivo en 300 KB de base legal: ninguna otra cosa tiene su forma.
      ⚠ Uno viene como «( 20612491527)», con espacio; por eso el paréntesis se
      lee con holgura y los dígitos se limpian después.
    · La REGIÓN detrás del RUC — vocabulario cerrado de 25 departamentos.
    · La CATEGORÍA («Ópera prima», «Nuevos realizadores») donde existe columna:
      vocabulario cerrado y, sobre todo, va ENTRE el título y las personas, así
      que ahí —y solo ahí— el título se corta exacto.
    · El MONTO en los fallos, con su «S/».
    · La frase de apertura, que declara etapa, concurso, año y modalidad.

    · El ECO. Las listas de finalistas y los fallos traen DOS columnas de
      personas —responsable y director— y casi siempre es la misma, así que la
      fila acaba repitiendo el bloque entero. Un título no repite sus últimas
      cuatro palabras: donde hay eco, el corte también es exacto (`cortaEco`).

   Lo que NO se puede separar cuando no hay ni categoría ni eco es el TÍTULO del
   proyecto de los NOMBRES de sus responsables: van pegados, los dos en
   mayúsculas, y el número de apellidos cambia por fila — «MARMANILLO BARRIO DE
   MENDOZA, PAVEL» son cuatro y «CONCHA VALCARCEL, GABRIELA» dos—. No hay
   regla; solo hay suposiciones. Se devuelve el trozo entero, marcado `pegado`.

   ══ Y POR ESO NO SE GUARDAN LAS PERSONAS ══
   La decisión que sale de ahí es la que además prefiero por otro motivo: el
   competidor se identifica por su RUC —que es su identificador legal y no
   cambia con cómo escriban su nombre— y para «con quién compito» no hace falta
   ni un nombre propio más. Donde la categoría permite cortar, los nombres se
   descartan aquí mismo; donde no, el aviso dice que hay que recortar antes de
   guardar. Lo que no se puede leer con certeza, se dice.

   ══ UN PDF PUEDE TRAER VARIAS RESOLUCIONES ══
   `2026-CPF-R-AptosAct.pdf` son TRES: la lista de aptas y dos recursos de
   reconsideración declarados fundados, cada uno con su «INCORPORAR como apta» y
   su tabla de una fila. Esas dos empresas compiten igual que las diecisiete
   primeras y perderlas sería contar mal el concurso. Por eso se parte el texto
   en resoluciones por «SE RESUELVE» y se lee cada una por separado.
   ⚠ Y por eso NO se corta la lista en «Artículo Segundo»: en cinco de los doce
   la tabla sigue DESPUÉS de los artículos de cierre —el extractor saca el pie
   de página antes del resto de la tabla— y cortar ahí perdía filas. Lo que se
   hace es tirar la prosa (ver `esProsa`), que es lo que estorba de verdad.
   ══════════════════════════════════════════════════════════════════════════ */

import type { FilaTabla } from "@/lib/tablaPdf";
/* Los ejes del concurso viven aparte: los comparte con la matriz de rivales,
   que no puede importar este módulo. Ver `lib/concursos.ts`. */
import { EJES, ejes } from "@/lib/concursos";

/** En qué punto del concurso está esta lista. */
export type EtapaRes = "recibida" | "apta" | "finalista" | "beneficiaria";

export const ETAPA_TXT: Record<EtapaRes, string> = {
  recibida: "recibidas — todas las que postularon",
  apta: "aptas — pasaron la revisión de papeles",
  finalista: "finalistas — pasan al encuentro con el jurado",
  beneficiaria: "beneficiarias — ganaron el estímulo",
};

/* Los 25 departamentos, con y sin tilde: DAFO escribe «JUNIN» y «JUNÍN» en el
   mismo año. Y «LA LIBERTAD» y «MADRE DE DIOS» llevan espacio, así que la
   alternancia va con los compuestos DELANTE — si no, «LA» nunca casaría y
   «MADRE DE DIOS» se leería como región «MADRE» y título «DE DIOS…». */
const REGIONES = [
  "LA LIBERTAD", "MADRE DE DIOS", "SAN MARTIN", "SAN MARTÍN",
  "AMAZONAS", "ANCASH", "ÁNCASH", "APURIMAC", "APURÍMAC", "AREQUIPA",
  "AYACUCHO", "CAJAMARCA", "CALLAO", "CUSCO", "CUZCO", "HUANCAVELICA",
  "HUANUCO", "HUÁNUCO", "ICA", "JUNIN", "JUNÍN", "LAMBAYEQUE", "LIMA",
  "LORETO", "MOQUEGUA", "PASCO", "PIURA", "PUNO", "TACNA", "TUMBES", "UCAYALI",
];
const RE_REGION = new RegExp(`^\\s*(${REGIONES.join("|")})\\b`, "i");

/** Comillas tipográficas y rectas: DAFO usa ‘ ’ “ ” y ' " sin criterio, a
 *  veces las dos en la misma frase. */
const C = "['‘’“”\"]";
/** Las mismas, sin corchetes, para poder negarlas: `[^${SIN_C}]`. */
const SIN_C = "'‘’“”\"";

/* ── LAS CATEGORÍAS ──
   Vocabulario cerrado y cortísimo, y la única columna de la tabla que separa el
   título de los nombres. Se acepta con saltos de línea en medio («OPERA\nPRIMA»
   sale así cuando la columna es estrecha) y con o sin tilde en «Ópera». */
const CATEGORIAS: { re: RegExp; txt: string }[] = [
  { txt: "Ópera prima", re: /[ÓO]PERA\s+PRIMA/i },
  /* La pareja de «Ópera prima» en ficción, y la que más filas limpia: veinte de
     las 53 de desarrollo. Viene partida en tres líneas y con acento grave
     («SEGUNDA / OBRA A / MÀS»), de ahí las dos holguras. */
  { txt: "Segunda obra a más", re: /(SEGUNDA|2DA\.?)\s+OBRA\s+A\s+M[ÁA]S/i },
  { txt: "Nuevos realizadores", re: /NUEVOS\s+REALIZADORES/i },
  { txt: "Realizadores con experiencia", re: /REALIZADORES\s+CON\s+EXPERIENCIA/i },
];

/* ── ¿ESTE DOCUMENTO ES DE ESTA CONVOCATORIA? ──
   Un concurso de DAFO se nombra por dos ejes —de qué es y en qué fase— y los dos
   hacen falta: «documental» casa con las dos convocatorias de documental que hay
   en el sistema, y lo que las distingue es justo el segundo eje. Cargar los
   finalistas de Desarrollo dentro de la convocatoria de Producción no da ningún
   error nunca: las filas entran bien, solo que en el concurso de al lado.

   ⚠ Dentro de cada eje el orden importa: «postproducción» contiene
   «producción», así que si se preguntara primero por la corta, una convocatoria
   de postproducción se leería como una de producción y casarían mal. */

const sinTilde = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();



/**
 * Si el documento y la convocatoria se contradicen, devuelve «lo que dice ella /
 * lo que dice él»; si no, cadena vacía.
 * Solo hay contradicción cuando los DOS lo dicen y dicen cosas distintas: una
 * convocatoria que no menciona la modalidad en su nombre no contradice a nadie.
 */
export function chocaCon(dice: string, nombre: string): string {
  const a = ejes(nombre), b = ejes(dice);
  for (let i = 0; i < EJES.length; i++) {
    if (a[i] >= 0 && b[i] >= 0 && a[i] !== b[i]) return `${EJES[i][a[i]][0]} / ${EJES[i][b[i]][0]}`;
  }
  return "";
}

/**
 * Cuál de las modalidades del documento es la de esta convocatoria.
 * Una relación de recibidas trae DOS tablas —«DESARROLLO DE LARGOMETRAJES» y
 * «PRODUCCIÓN DE LARGOMETRAJES»— en el mismo PDF, y una convocatoria de aquí es
 * UNA de las dos: cargarlas todas metería 30 competidores de otro concurso.
 * @returns el índice de la que casa, o -1 si ninguna o si empatan varias.
 */
export function modalidadQueCasa(mods: (string | null)[], nombre: string): number {
  const eN = ejes(nombre);
  const casan = mods
    .map((m, i) => ({ i, m: m || "" }))
    .filter(x => x.m && ejes(x.m)[1] >= 0 && ejes(x.m)[1] === eN[1] && !chocaCon(x.m, nombre));
  if (casan.length === 1) return casan[0].i;
  if (!casan.length) return -1;
  /* ── EL DESEMPATE ──
     La relación de ficción trae DOS modalidades de producción —«a nivel
     nacional» y «exclusivo para las regiones del país»—, así que el eje no basta
     y hay que mirar el resto del nombre: gana la que comparte más palabras con
     el de la convocatoria. Si hay empate también ahí, se devuelve -1 y elige la
     persona: entre dos concursos hermanos, adivinar es peor que preguntar. */
  const pal = (s: string) => new Set(sinTilde(s).match(/[a-z0-9]{4,}/g) || []);
  const mias = pal(nombre);
  const punt = casan.map(x => [...pal(x.m)].filter(w => mias.has(w)).length);
  const alto = Math.max(...punt);
  return punt.filter(p => p === alto).length === 1 ? casan[punt.indexOf(alto)].i : -1;
}

export type CabeceraRes = {
  etapa: EtapaRes | null;
  concurso: string | null;
  anio: number | null;
  modalidad: string | null;
  /** Cuando el concurso entero es de una categoría, lo dice la frase de
   *  apertura («categoría ‘Nuevos realizadores’») y no hay columna. */
  categoria: string | null;
};

/* ── QUÉ LISTA ES ESTA ──
   La primera frase del artículo lo dice todo, y por eso se lee de ahí y no del
   nombre del archivo: «2026-CDO-D-Aptos.pdf» es una convención de quien lo
   descargó, no del documento. Un PDF renombrado seguiría leyéndose bien.
   ⚠ El orden importa: «INCORPORAR como apta» va antes que las demás porque un
   recurso fundado puede citar la resolución de aptas que revoca. */
/* ══════════════════════════════════════════════════════════════════════════
   QUÉ LISTA ES ESTE DOCUMENTO

   ⚠ NO SE MIRA EL VERBO. Se hacía, y cada año hay que arreglarlo: donde 2026
   dice «DECLARAR como beneficiarias», 2023 dice «Declárese»; donde 2024 dice
   «Consígnese como finalistas», 2023 dice «Desígnese». El Ministerio conjuga a
   su gusto y el lector contestaba «este PDF no parece una de las listas de
   DAFO» a un fallo perfectamente normal.

   Lo que no cambia es el COMPLEMENTO —«como beneficiarias», «como finalistas»,
   «como aptas»— y el sitio donde aparece: el ARTÍCULO PRIMERO, que es lo que la
   resolución es. Buscarlo solo ahí es lo que permite ignorar el verbo sin
   confundirse: en los considerandos las cuatro palabras salen todas, y el
   artículo segundo de un fallo habla de la lista de espera.
   ══════════════════════════════════════════════════════════════════════════ */
const FRASES: { re: RegExp; etapa: EtapaRes }[] = [
  /* La relación de recibidas no es una resolución: no tiene artículos. */
  { etapa: "recibida", re: /RELACI[ÓO]N\s+DE\s+POSTULACIONES\s+RECIBIDAS/i },
  { etapa: "beneficiaria", re: /como\s+(?:las\s+)?beneficiari/i },
  { etapa: "finalista", re: /como\s+finalistas/i },
  { etapa: "apta", re: /como\s+(?:la\s+|una\s+)?aptas?\b/i },
];

/** El artículo primero de una resolución, que es donde dice qué resuelve. Si no
 *  hay «SE RESUELVE» —una relación de recibidas— vale el documento entero. */
function primerArticulo(t: string): string {
  const i = t.search(/SE\s+RESUELVE/i);
  if (i < 0) return t;
  const resto = t.slice(i);
  const j = resto.search(/Art[íi]culo\s+Segundo/i);
  return j > 0 ? resto.slice(0, j) : resto.slice(0, 900);
}

const limpia = (s: string) => s.replace(/\s+/g, " ").trim();

/* ── DAFO ESCRIBE «JUNÌN» Y «A MÀS» ──
   Con acento GRAVE, veintiún veces en un mismo documento. En castellano no
   existe el grave, así que cambiarlo por agudo no puede romper una palabra
   buena — y sin cambiarlo, «JUNÌN» no es ninguna de las 25 regiones y su fila se
   queda sin región, y la categoría «SEGUNDA OBRA A MÀS» no casa con nada. */
const aAgudo = (s: string) =>
  s.replace(/[ÀÈÌÒÙ]/g, m => "ÁÉÍÓÚ"["ÀÈÌÒÙ".indexOf(m)])
    .replace(/[àèìòù]/g, m => "áéíóú"["àèìòù".indexOf(m)]);

/* ── LETRAS QUE EL EXTRACTOR DEJA SUELTAS ──
   «Concurso de Proyectos de Ficció n», «PROYECT O»: el extractor mete un
   espacio antes de la última letra de una palabra cuando el PDF la pinta como
   un trozo aparte. Se vuelve a pegar, con dos frenos:
    · La letra suelta tiene que ser MINÚSCULA. Sin eso, «TIERRA FILMS S.A.C.»
      se convertía en «TIERRA FILMSS.A.C.» y «S. CIVIL DE R.L» en «DER.L»: las
      iniciales de las formas jurídicas son letras sueltas legítimas, y son
      justo lo que hay que respetar en una razón social.
    · Y no puede ser una palabra de una letra que existe en castellano (a, y,
      o, e, u), para no convertir «Ficción a nivel» en «Ficcióna nivel». */
const pegaLetraSuelta = (s: string) =>
  aAgudo(s).replace(/([A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}) ([b-df-hj-np-tv-xzñ])(?=$|[\s,.;:)'‘’“”"])/g,
    (_m, a, b) => a + b)
    /* Y las dos excepciones de arriba se juntan en la peor: «CAJAMARC A» —letra
       suelta, mayúscula y encima una «a»—, que dejaba la fila sin región y por
       tanto sin leer (cuatro de las 202 de la relación de ficción). Aquí sí se
       puede pegar sin inventar nada, porque hay con qué comprobarlo: solo se
       junta si lo que sale es uno de los 25 departamentos. Y por lo mismo se
       admite un trozo de hasta tres letras: «LAMBAYEQ UE» también se rompe. */
    .replace(/([A-ZÁÉÍÓÚÑ]{2,}) ([A-ZÁÉÍÓÚÑ]{1,3})\b/g,
      (m, a, b) => (esRegion(a + b) ? a + b : m));

const esRegion = (s: string) => REGIONES.includes(s.toUpperCase());

/* ── PROSA CONTRA CELDA DE TABLA ──
   Todo el contenido de estas tablas va en MAYÚSCULAS: razones sociales,
   regiones, títulos y nombres. La prosa que las rodea —artículos de cierre,
   base legal, el sello de copia auténtica— va en minúsculas normales. Dos
   palabras enteras en minúscula de tres letras o más es, sin excepción en los
   doce documentos, prosa; y es la regla que permite NO cortar la lista en
   «Artículo Segundo» (donde en cinco de ellos la tabla todavía continúa).
   ⚠ El umbral son palabras de ≥3 letras a propósito: «de», «la», «y» aparecen
   dentro de razones sociales y de títulos. */
function esProsa(l: string): boolean {
  const minus = l.match(/\b[a-záéíóúñ]{3,}\b/g);
  return !!minus && minus.length >= 2;
}

/* Basura de página que NO es prosa —va en mayúsculas o en quechua, y `esProsa`
   no la ve— y hay que nombrar a mano: el separador del extractor, el membrete
   de la Dirección, el encabezado bilingüe y los rótulos de la cabecera de la
   tabla. Sin quitarla se pega al nombre de la siguiente empresa.
   ⚠ Los rótulos hay que anclarlos y cerrarlos: la columna es estrecha y parte
   «RESPONSAB LE(S)» en dos líneas, pero un `^RESPONSAB` suelto se come también
   la línea «RESPONSABILIDAD» de «EMPRESA INDIVIDUAL DE RESPONSABILIDAD
   LIMITADA», que es media razón social. */
const BASURA = [
  /^--\s*\d+\s+of\s+\d+\s*--$/i,
  /^DIRECCI[ÓO]N (GENERAL DE|DEL AUDIOVISUAL)/i,
  /^INDUSTRIAS CULTURALES/i,
  /^(ARTES|MEDIOS|PROYECTO|JUR[ÍI]DICA|CATEGOR[ÍI]A|RESPONSAB|PROYECT O)$/i,
  /^JUR[ÍI]DICA\s+(REGI[ÓO]N|PROYECTO)/i,
  /^LE\(S\)/i,
  /^FONOGRAF[ÍI]A Y LOS NUEVOS/i,
  /^(PERSONA JUR|POSTULANTE|\(RUC\)|REGI[ÓO]N|T[ÍI]TULO|RESPONSABLE\b|MONTO|DEL PROYECTO|N°)/i,
  /* «DIRECTOR» y «(A/ES/AS)» vienen en LÍNEAS DISTINTAS, así que el rótulo hay
     que reconocerlo partido: entero se colaba dentro del nombre de la modalidad
     de la tabla que encabeza. */
  /^DIRECTOR(\s*\(|A?\s*$)/i,
  /^\(A\/ES\/AS\)/i,
  /^Documento firmado digitalmente$/i,
  /^DIRECTOR[A]? DE LA DIRECCI[ÓO]N/i,
  /Decenio de la Igualdad/i,
  /Año de la Esperanza/i,
  /qamaña|kananpaq|jiwasana|ch.amañchatapxana/i,
];

/**
 * Las líneas que sirven, en orden, sin tocar los saltos: son los saltos los que
 * marcan dónde acaba una celda (ver `partirBloque`).
 * @param conNumeros deja pasar las líneas que son solo un número. En las
 *   relaciones el N° de orden viene en su propia línea y es el ancla de la fila;
 *   en las resoluciones un número suelto solo puede ser el número de página.
 */
function lineasUtiles(texto: string, conNumeros = false): string[] {
  const fuera: string[] = [];
  /* Quien firma va en MAYÚSCULAS y con nombre propio: no es prosa, no es un
     rótulo y cambia con la persona, así que no hay patrón que la reconozca. Lo
     que sí es fijo es su SITIO —la línea justo detrás de «Documento firmado
     digitalmente»— y por eso se descarta por posición y no por contenido. Sin
     esto, la directora que firma se mete dentro del proyecto de la última fila. */
  let firma = false;
  for (const bruto of String(texto || "").split("\n")) {
    const l = pegaLetraSuelta(bruto.replace(/[ \t ]+/g, " ").trim());
    if (!l) continue;
    if (firma) { firma = false; continue; }
    if (/^Documento firmado digitalmente$/i.test(l)) { firma = true; continue; }
    if (/^\d{1,3}$/.test(l)) { if (conNumeros) fuera.push(l); continue; }
    if (BASURA.some(re => re.test(l))) continue;
    if (esProsa(l)) continue;
    fuera.push(l);
  }
  return fuera;
}

export type FilaRes = {
  /** Razón social, tal cual la escribe el documento. */
  empresa: string;
  /** Su RUC. Es la CLAVE del competidor: no cambia aunque el nombre se escriba
   *  de tres formas distintas entre un año y otro. `null` en las relaciones de
   *  recibidas, que no lo publican. */
  ruc: string | null;
  region: string | null;
  /** Título del proyecto. Limpio cuando había columna CATEGORÍA de la que
   *  colgarse; con los nombres de los responsables pegados detrás cuando no —y
   *  entonces `avisos` lo dice. */
  titulo: string;
  categoria: string | null;
  /** La etapa de ESTA fila, no la del PDF: un mismo archivo puede traer la
   *  lista de aptas y dos incorporaciones posteriores. */
  etapa: EtapaRes;
  /** Y su modalidad, por lo mismo: la relación de recibidas de ficción trae dos
   *  tablas —desarrollo y producción— con la numeración corrida. */
  modalidad: string | null;
  /** N° de orden en las relaciones; `null` en las resoluciones, que no lo usan. */
  n: number | null;
  /** Solo en los fallos: lo que se le otorgó. */
  monto: number | null;
  /** Qué NO se pudo asegurar DE ESTA FILA, en castellano y para enseñarlo. Una
   *  fila sin avisos se leyó entera; con ellos, hay que mirarla antes de
   *  guardar. Lo que le pasa a todas las filas del documento no entra aquí
   *  (ver `pegado`): un aviso que sale siempre no avisa de nada. */
  avisos: string[];
  /** El título trae detrás los nombres de sus responsables. Es cosa del
   *  documento —no traía columna de categoría y tampoco hubo eco del que
   *  cortar—, así que se dice una vez y no fila por fila. */
  pegado: boolean;
  /** Quien dirige o responde por el proyecto, tal como lo escribe el documento.
   *  Vacío cuando el texto no dejó separarlo del título: entonces está DENTRO de
   *  `titulo`, que es justo lo que dice `pegado`. */
  personas: string;
  /** La fila entera como se leyó, para comprobarla sin abrir el PDF al lado —el
   *  mismo recurso que el «así lo decía el PDF» del cronograma de las bases. */
  crudo: string;
};

export type LecturaRes = {
  /** La del documento: la de su primera resolución con lista. */
  cabecera: CabeceraRes;
  filas: FilaRes[];
  /** Trozos de la tabla en los que no se reconoció una fila. Se devuelven: es
   *  lo único que distingue «no había nada» de «no lo supe leer». */
  sinLeer: string[];
  /** Lo que el propio documento delata sobre la lectura: sobre todo, cuando su
   *  numeración dice que tenía más filas de las que salieron. Sin esto, unas
   *  filas fundidas dentro de otra se ven como una lista perfecta más corta. */
  notas: string[];
};

/** El monto de un fallo: «S/ 39,995.00», «S/. 378,000.00», «S/.313.200,00».
 *  ⚠ El punto después de «S/» y el espacio que a veces le sigue son parte del
 *  problema: con la expresión vieja, «S/. 378,000.00» capturaba solo el punto y
 *  el fallo entero de 2023 se guardaba sin un solo monto. */
const RE_MONTO = /S\/\.?\s*(\d[\d.,]*)/;
function leeMonto(s: string): number | null {
  const m = s.match(RE_MONTO);
  if (!m) return null;
  /* ⚠ Y DAFO escribe la cifra de las dos maneras: «313,200.00» en unos
     documentos y «313.200,00» en otros —a veces en el mismo año—. Adivinar por
     el símbolo daría trescientos trece soles donde hay trescientos trece mil.
     El separador que manda es el ÚLTIMO: lo que va detrás son los céntimos y
     todo lo de delante son miles. */
  const b = m[1].replace(/[.,]$/, "");
  const corte = Math.max(b.lastIndexOf("."), b.lastIndexOf(","));
  const decimales = corte >= 0 && b.length - corte - 1 <= 2;
  const n = decimales
    ? Number(`${b.slice(0, corte).replace(/[.,]/g, "")}.${b.slice(corte + 1)}`)
    : Number(b.replace(/[.,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* El RUC, con holgura: en `2026-CDO-P-Aptos` uno viene «( 20612491527)» y con
   el paréntesis pegado se perdía esa fila entera —y, peor, su empresa se iba
   dentro del título de la anterior—. Se admiten espacios y saltos dentro y se
   comprueban los dígitos después. */
const RE_RUC = /\(\s*(\d[\d\s]{6,12}\d)\s*\)/g;

/* ── FORMA JURÍDICA: LO ÚNICO QUE DISTINGUE UNA RAZÓN SOCIAL ──
   Entre dos RUC hay el final de la fila de arriba (título y personas) y el
   nombre de la empresa de abajo, las dos cosas en mayúsculas y sin separador.
   Lo que solo tiene una razón social es su forma jurídica. */
const RE_FORMA = /(S\.?\s?A\.?\s?C\.?S?|E\.?\s?I\.?\s?R\.?\s?L\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?A?\.?|ASOCIACI[ÓO]N|EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA|SOCIEDAD (AN[ÓO]NIMA|COMERCIAL|CIVIL)|S\.\s?CIVIL|PRODUCCIONES|FILMS?|CINE)\b/i;
/** Palabras que no bastan para dar por empezado un nombre: son parte de la
 *  forma o conectores. Sin esto, «S. CIVIL DE R.L» se tomaría por el nombre
 *  entero y dejaría fuera «FERNANDEZ & ASOCIADOS». */
const RE_RELLENO = /^([A-ZÑ]|DE|DEL|LA|EL|LOS|LAS|Y|E|R\.?L\.?|S\.?A\.?C?\.?|CIVIL|LIMITADA|RESPONSABILIDAD|INDIVIDUAL|EMPRESA|SOCIEDAD|AN[ÓO]NIMA|CERRADA|&)$/i;
/** Cuántas líneas puede ocupar una razón social. Cinco cubre la más larga de
 *  los doce documentos; más allá, lo que se estaría comiendo es la fila de
 *  arriba. */
const MAX_LINEAS_EMPRESA = 5;

/**
 * Dónde acaba una fila y empieza la siguiente, contando LÍNEAS y no palabras.
 *
 * El trozo entre dos RUC es: la cola de la fila de arriba (su título y sus
 * responsables) y, al final, la razón social de la de abajo. Como cada celda
 * conserva sus saltos, la razón social son las ÚLTIMAS líneas del trozo — y se
 * toman las menos posibles que ya formen un nombre: una forma jurídica más, por
 * lo menos, una palabra que no sea relleno.
 *
 *   …GABRIELA / CAMPESINA GALACTICA / S.A.C.   → «S.A.C.» solo es relleno, así
 *   que sigue hacia atrás y para en «CAMPESINA GALACTICA S.A.C.». ✔
 *
 * ⚠ Si la empresa no lleva forma jurídica («COAST 2 COAST» existe), no hay nada
 * que buscar: se toma su última línea —que es su celda— y se avisa. Preferible
 * a partir por una posición inventada, y el aviso manda mirar la fila.
 */
type Bloque = { colaL: string[]; empresaL: string[]; sinForma: boolean };
const colaDe = (b: Bloque) => limpia(b.colaL.join(" "));
const empresaDe = (b: Bloque) => limpia(b.empresaL.join(" "));

/* ── «X SOCIEDAD ANONIMA CERRADA - X S.A.C.» ──
   La forma más común de razón social peruana en estos documentos: el nombre
   entero, un guion, y el mismo nombre con la forma abreviada. «INKART DIGITAL
   EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA - INKART DIGITAL EIRL».
   Eso es una repetición, o sea una prueba: lo que va detrás del guion vuelve a
   aparecer más arriba, y ahí empieza el nombre. Sin alfabeto y sin suposiciones.
   @returns cuántas líneas ocupa el nombre, o 0 si aquí no hay guion que valga. */
function largoPorGuion(lineas: string[]): number {
  const ventana = lineas.slice(Math.max(0, lineas.length - MAX_LINEAS_EMPRESA));
  const t = clave(ventana.join(" "));
  const g = t.lastIndexOf(" ");
  const m = ventana.join(" ").match(/[-–]\s*([^-–]{3,})$/);
  if (!m || g < 0) return 0;
  /* La marca: las dos primeras palabras con fondo de lo que sigue al guion. */
  const marca = clave(m[1]).split(" ").filter(w => !RE_RELLENO.test(w)).slice(0, 2).join(" ");
  if (marca.length < 4) return 0;
  for (let j = 0; j < ventana.length; j++) {
    if (clave(ventana.slice(j).join(" ")).startsWith(marca)) {
      const largo = ventana.length - j;
      /* Tiene que aparecer DOS veces: si la única es la de detrás del guion, no
         hay repetición y no se ha probado nada. */
      return clave(ventana.slice(j).join(" ")).split(marca).length > 2 ? largo : 0;
    }
  }
  return 0;
}

function partirBloque(trozo: string): Bloque {
  const lineas = trozo.split("\n").map(l => l.trim()).filter(Boolean);
  if (!lineas.length) return { colaL: [], empresaL: [], sinForma: true };

  for (let k = 1; k <= Math.min(MAX_LINEAS_EMPRESA, lineas.length); k++) {
    const cand = lineas.slice(lineas.length - k);
    const t = cand.join(" ");
    if (!RE_FORMA.test(t)) continue;
    /* Con forma, pero ¿hay nombre? Se quita la forma y se mira si queda alguna
       palabra que no sea relleno. */
    const resto = t.replace(new RegExp(RE_FORMA.source, "gi"), " ")
      .split(/[\s,.\-&]+/).filter(w => w && !RE_RELLENO.test(w));
    if (!resto.length) continue;
    /* Y antes de darlo por bueno: si el nombre lleva su propio eco detrás de un
       guion, él mismo dice dónde empieza. */
    const g = largoPorGuion(lineas);
    const kk = g > k ? g : k;
    return {
      colaL: lineas.slice(0, lineas.length - kk),
      empresaL: lineas.slice(lineas.length - kk),
      sinForma: false,
    };
  }
  return {
    colaL: lineas.slice(0, lineas.length - 1),
    empresaL: [lineas[lineas.length - 1]],
    sinForma: true,
  };
}

/* ══ ESTIRAR LOS NOMBRES QUE SE QUEDARON CORTOS ══
   `partirBloque` se queda con las MENOS líneas que ya formen un nombre, y eso
   deja corta a toda razón social que ocupe varias:

     ALHE ENTERPRISE            → se lee «GROUP S.A.C.»
     GROUP S.A.C.
     CRIOYO PRODUCCIONES        → se lee «AUDIOVISUALES SOCIEDAD ANONIMA CERRADA»
     AUDIOVISUALES
     SOCIEDAD ANONIMA
     CERRADA

   Quedarse corto era el error prudente —el nombre sale incompleto pero no lleva
   dentro datos de otra fila— y hasta aquí solo se avisaba. Pero la lista viene
   ORDENADA, y eso convierte el aviso en instrucción: «GROUP» detrás de nada y
   delante de «AYNICHAFILMS» es imposible en una lista alfabética, y añadirle la
   línea de arriba la vuelve posible. Ahí ya no se adivina: se comprueba.

   Se estira línea a línea mientras el orden siga roto y SOLO se conserva el
   estirón si acaba arreglándolo; si no, se deshace y la fila se queda como
   estaba, con su aviso. Cada línea que se lleva el nombre se la quita al título
   de la fila de arriba — que es de donde nunca debió salir.

   ⚠ Todo esto solo si el documento demuestra estar ordenado: en una lista que
   no lo está, «romper el orden» no significa nada y esto movería texto a ciegas. */
/* ── HASTA DÓNDE SE PUEDE ESTIRAR SIN ROBARLE AL VECINO ──
   Lo que hay delante del nombre es la cola de la fila de arriba: su título y
   sus responsables. Estirar a ciegas se come esos nombres, y el orden
   alfabético no siempre lo nota — «DEL ROSARIO DUTHILLEUL ROMINA HUAYCO FILMS
   E.I.R.L.» cae por casualidad entre COAST y ENTERTAINMENT, así que pasaba el
   examen estando mal.

   Pero cuando esa cola trae ECO, el eco dice exactamente dónde acaban las
   personas: solo se puede tocar lo que viene DESPUÉS de él. Si el eco cierra la
   cola, no hay nada que coger y la fila se queda como está. Sin eco no hay
   restricción, que es el caso de las listas de aptas —una sola columna de
   personas— donde este estirado es justo el que hace falta. */
function topeEstirable(colaL: string[]): number {
  const eco = cortaEco(limpia(colaL.join(" ")));
  if (!eco) return colaL.length;
  if (!eco.sobra) return 0;
  let n = 0, acc = "";
  for (let i = colaL.length - 1; i >= 0; i--) {
    acc = acc ? `${colaL[i]} ${acc}` : colaL[i];
    if (limpia(acc).length > eco.sobra.length) break;
    n++;
  }
  return n;
}

function estiraNombres(partes: Bloque[], n: number): void {
  const k = (i: number) => (i < 0 ? "" : i >= n ? "\uffff" : clave(empresaDe(partes[i])));
  let malos = 0;
  for (let i = 1; i < n; i++) if (k(i - 1) > k(i)) malos++;
  if (n < 4 || 1 - malos / (n - 1) < ORDEN_MINIMO) return;

  /* Estira la fila `j` y se queda con el estirón MÁS LARGO que quepa entre sus
     dos vecinas. Largo y no corto: «DE CALA CALA S.A.C.» cabe detrás de FILMICO
     ya con dos líneas —«PATRIMONIO CULTURAL VICUÑITAS DE CALA CALA S.A.C.»— y el
     nombre de verdad tiene cuatro. Pasarse tampoco cuela: la quinta línea es el
     apellido de la directora de la fila de arriba y con ella el nombre se va
     detrás de su vecina de abajo, así que se descarta sola.
     Y el tope de `topeEstirable` sigue mandando: donde hay eco, las personas no
     se tocan. */
  const intenta = (j: number, izq: string, der: string): boolean => {
    const base = { ...partes[j], colaL: [...partes[j].colaL], empresaL: [...partes[j].empresaL] };
    const tope = Math.min(topeEstirable(base.colaL), MAX_LINEAS_EMPRESA - base.empresaL.length);
    /* ⚠ ÚNICO O NADA. Ni el estirón más corto ni el más largo valen como regla:
       «DE CALA CALA S.A.C.» ya cabe detrás de FILMICO con dos líneas y su nombre
       tiene cuatro, y a «PELIKAN PICTURES ENTERTAINMENT E.I.R.L.» le sobran las
       cuatro porque con una ya está entero. Cuando el alfabeto deja pasar varias
       posibilidades es que no lo ha demostrado, y entonces no se toca nada: la
       fila se queda como vino y se avisa, que para eso está la pantalla de
       confirmar. Mover texto entre filas sin prueba estropea dos a la vez. */
    const caben: number[] = [];
    for (let t = 1; t <= tope; t++) {
      const cand = [...base.colaL.slice(base.colaL.length - t), ...base.empresaL];
      const k = clave(limpia(cand.join(" ")));
      if (izq <= k && k <= der) caben.push(t);
    }
    if (caben.length !== 1) return false;
    const mejor = caben[0];
    partes[j] = {
      ...base,
      colaL: base.colaL.slice(0, base.colaL.length - mejor),
      empresaL: [...base.colaL.slice(base.colaL.length - mejor), ...base.empresaL],
    };
    return true;
  };

  /* ── DE ABAJO ARRIBA ──
     Porque el tope de la derecha es la fila siguiente, y si esa también está
     corta no sirve de tope: GUARDIANES DEL PATRIMONIO… no cabía «antes de
     INKART DIGITAL…» mientras INKART se leía «DIGITAL EIRL». Arreglada la de
     abajo, la de arriba tiene contra qué medirse. */
  if (n > 1 && k(0) > k(1)) { /* la primera se mira al final, ya con su vecina buena */ }
  for (let i = n - 1; i >= 1; i--) {
    if (k(i - 1) <= k(i)) continue;
    /* ⚠ DOS CULPABLES POSIBLES para el mismo desorden:
        · esta se leyó corta y se quedó atrás — «CRIOYO PRODUCCIONES
          AUDIOVISUALES…» leída «AUDIOVISUALES…» se pone delante de CHOLA;
        · o la de ARRIBA se leyó corta y por eso se pasó de sitio — «CINE LIBRE
          PRODUCCIONES FERNANDEZ & ASOCIADOS» leída «FERNANDEZ & ASOCIADOS» se
          va detrás de COAST 2 COAST.
       Se prueban las dos y solo cuela la que encaja entre sus dos vecinas: la
       que no era culpable no encuentra ningún estirón que cumpla y se deshace. */
    if (intenta(i, k(i - 1), k(i + 1))) continue;
    intenta(i - 1, k(i - 2), k(i));
  }
  /* La primera fila no tiene vecina de arriba: su único testigo es la de abajo.
     «GROUP S.A.C.» delante de «AYNICHAFILMS» es imposible; «ALHE ENTERPRISE
     GROUP S.A.C.» no lo es. */
  if (n > 1 && k(0) > k(1)) intenta(0, "", k(1));
}



/* ── EL ECO: CUANDO LA MISMA PERSONA VIENE DOS VECES ──
   Las listas de finalistas y los fallos traen DOS columnas de personas —
   «RESPONSABLE(S) DEL PROYECTO» y «DIRECTOR(A/ES/AS) DEL PROYECTO»— y en la
   mayoría de los proyectos es la misma persona. Reflowado sale así:

     INVENTARIO · PATRIAU HILDEBRANDT ANDREA CAROLINA · PATRIAU HILDEBRANDT ANDREA CAROLINA
     └ título ─┘ └────────── el mismo bloque, dos veces ──────────────────────┘

   Y ese eco es EVIDENCIA, no una suposición: un título no acaba repitiendo sus
   últimas cuatro palabras. Donde aparece, el corte es exacto y sale un título
   limpio sin columna de categoría de la que colgarse — que es el único sitio
   donde hasta ahora se podía cortar.

   Se busca la repetición MÁS LARGA y se exigen dos palabras como mínimo: con
   una, «LA CASA DE LA» cortaría por el segundo «LA» y se llevaría medio título.
   ⚠ Cuando el responsable y el director son personas DISTINTAS no hay eco y no
   se corta nada: aquí no se adivina, se corta solo donde el texto lo demuestra.

   ── Y LO QUE VIENE DESPUÉS DEL ECO ──
   El bloque repetido no siempre cierra la fila:

     INVENTARIO · PATRIAU … CAROLINA · PATRIAU … CAROLINA · CINE LIBRE PRODUCCIONES FERNANDEZ &
     └ título ─┘ └────────── eco ──────────────────────┘ └──── esto no es de esta fila ────┘

   Eso de la derecha es el principio de la razón social de la fila SIGUIENTE, la
   que `partirBloque` dejó corta. Se devuelve aparte como `sobra` y quien decide
   qué hacer con ella es `filasPorRuc`, que tiene el segundo testigo: el orden
   alfabético. */
function cortaEco(t: string): { titulo: string; sobra: string; repetido: string } | null {
  const p = t.split(" ").filter(Boolean);
  for (let k = Math.floor(p.length / 2); k >= 2; k--) {
    for (let s = 0; s + 2 * k <= p.length; s++) {
      const uno = p.slice(s, s + k).join(" ");
      if (uno !== p.slice(s + k, s + 2 * k).join(" ")) continue;
      return {
        titulo: limpia(p.slice(0, s).join(" ")),
        sobra: limpia(p.slice(s + 2 * k).join(" ")),
        repetido: uno,
      };
    }
  }
  return null;
}

/**
 * Parte la cola en título y categoría, y dice si el título quedó limpio.
 * Dos formas de saber dónde acaba el título, las dos exactas:
 *  · la columna CATEGORÍA, cuando el documento la trae;
 *  · el eco de la persona repetida (ver `cortaEco`).
 * Si no hay ninguna, el título llega con los nombres detrás y `pegado` lo dice.
 */
function partirPorCategoria(cola: string): {
  titulo: string; categoria: string | null; pegado: boolean; sobra: string; personas: string;
} {
  for (const c of CATEGORIAS) {
    const m = cola.match(c.re);
    if (m && m.index !== undefined && m.index > 0) {
      /* Detrás de la categoría vienen las personas, y el corte es exacto: lo de
         un lado es el título y lo del otro quien lo dirige. */
      return {
        titulo: limpia(cola.slice(0, m.index)), categoria: c.txt, pegado: false, sobra: "",
        personas: limpia(cola.slice(m.index + m[0].length)),
      };
    }
  }
  const eco = cortaEco(limpia(cola));
  /* Y el eco ES el nombre, repetido en las dos columnas de personas: una copia
     es exactamente lo que hay que guardar. */
  if (eco) return { titulo: eco.titulo, categoria: null, pegado: false, sobra: eco.sobra, personas: eco.repetido };
  return { titulo: limpia(cola), categoria: null, pegado: !!limpia(cola), sobra: "", personas: "" };
}

/* ⚠ Este NO es un aviso de fila y por eso no vive en `avisos`: cuando el
   documento no trae columna de categoría le pasa a TODAS sus filas, y una
   alarma que sale en las siete de siete no señala nada — solo hace que la
   pantalla parezca rota y que los tres avisos que sí son de una fila concreta
   se pierdan entre el ruido. Va como `pegado`, y la pantalla lo dice una vez
   arriba: es una propiedad del documento, no un defecto de la fila. */
export const TXT_PEGADO =
  "este documento no trae columna de categoría, así que los títulos vienen con los nombres de sus responsables pegados detrás: recórtalos antes de guardar";
const AVISO_SIN_FORMA =
  "la razón social no trae forma jurídica (S.A.C., E.I.R.L.…): puede llevar pegado el final de la fila anterior";
const AVISO_SIN_REGION = "no se le encontró la región";
/** No es una duda del lector: es un hecho del documento, y hay que verlo antes
 *  de guardar porque cambia lo que significa la fila. */
const AVISO_ESPERA = "estaba en la LISTA DE ESPERA, no entre las beneficiarias: se guarda como finalista y sin monto";
const AVISO_PARTIDA =
  "esta fila venía partida por un salto de página y se recompuso por su región: compruébala entera";
const AVISO_ORDEN =
  "la lista viene en orden alfabético y esta fila lo rompe: al nombre puede faltarle el principio, y estará al final del proyecto de la fila de arriba";

/* ── EL ORDEN ALFABÉTICO COMO TESTIGO ──
   Estas tablas van ordenadas por razón social: las tres relaciones de recibidas
   —donde el N° y la región acorralan el nombre y no hay nada que adivinar— salen
   29/29, 43/43 y 76/77 en orden. Es decir: el orden es real, y donde se rompe es
   porque el nombre se leyó corto.

   Y se leyó corto SIEMPRE por lo mismo: `partirBloque` se queda con las menos
   líneas que ya formen un nombre, así que de «ALHE ENTERPRISE / GROUP S.A.C.» se
   trae «GROUP S.A.C.» y deja «ALHE ENTERPRISE» en el título de la fila de
   arriba. Quedarse corto es el error bueno —el nombre es incompleto, pero no
   lleva dentro datos de otra fila— y por eso NO se arregla moviendo texto sola:
   se avisa, con la fila de arriba a la vista, que es donde está lo que falta.

   ⚠ No todas las listas van en orden: las de finalistas no (7/12 en una). Por eso
   el aviso solo se emite si ESTE documento demuestra estar ordenado —dos tercios
   de los pares—; si no, avisaría en todas y no serviría para mirar ninguna. */
const ORDEN_MINIMO = 2 / 3;
const clave = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** ¿Demuestra ESTE documento que su lista va ordenada? Con menos de cuatro
 *  filas no hay muestra, y las de finalistas no siempre lo están. */
function vieneOrdenada(filas: FilaRes[]): boolean {
  if (filas.length < 4) return false;
  let malos = 0;
  for (let i = 1; i < filas.length; i++) {
    if (clave(filas[i - 1].empresa) > clave(filas[i].empresa)) malos++;
  }
  return 1 - malos / (filas.length - 1) >= ORDEN_MINIMO;
}

/* ── DEVOLVERLE A CADA FILA LO QUE ES SUYO ──
   Dos defectos que hasta aquí se contaban por separado son en realidad el mismo,
   visto por sus dos extremos:

     fila i    título …ECO… + «CINE LIBRE PRODUCCIONES FERNANDEZ &»   ← le sobra
     fila i+1  empresa «ASOCIADOS S. CIVIL DE R.L»                    ← le falta

   Y hay DOS testigos independientes que dicen lo mismo: el eco marca dónde acaba
   de verdad la fila de arriba, y el orden alfabético marca que la de abajo está
   corta. Cuando los dos coinciden —y solo entonces— se junta lo que sobra con lo
   que falta y salen las dos filas enteras: «CINE LIBRE PRODUCCIONES FERNANDEZ &
   ASOCIADOS S. CIVIL DE R.L».

   ⚠ La condición es que el pegado ARREGLE el orden, no que lo parezca. Si tras
   juntarlos la fila sigue rompiendo el alfabeto, lo que sobraba era otra cosa
   —un segundo director, por ejemplo— y no se toca nada: se deja donde estaba,
   que es en el título, y el aviso lo dirá. Mover texto entre filas sin prueba
   estropearía las dos a la vez y en silencio. */
function devuelveLoQueSobra(filas: FilaRes[], sobras: string[]): void {
  if (!vieneOrdenada(filas)) {
    /* Sin orden que consultar no hay segundo testigo: lo que sobra vuelve al
       título de su fila, que es de donde se sacó. Perderlo sería peor. */
    filas.forEach((f, i) => {
      if (!sobras[i]) return;
      f.titulo = limpia(`${f.titulo} ${sobras[i]}`);
      f.pegado = true;
    });
    return;
  }
  for (let i = 0; i + 1 < filas.length; i++) {
    const sobra = sobras[i];
    if (!sobra) continue;
    const sig = filas[i + 1];
    const rompe = clave(filas[i].empresa) > clave(sig.empresa);
    const juntas = limpia(`${sobra} ${sig.empresa}`);
    /* Dos maneras de que quede probado, y basta una:
        · el orden se rompía y juntarlas lo arregla; o
        · lo que sobra TIENE FORMA DE EMPRESA —«CINE LIBRE PRODUCCIONES»— y
          juntarlas no rompe el orden. Esta segunda hace falta porque un nombre
          corto puede seguir cayendo en su sitio alfabético: «ATROCITOS» va
          antes que «FERNANDEZ & ASOCIADOS» igual que antes que «CINE LIBRE
          PRODUCCIONES FERNANDEZ & ASOCIADOS», así que ahí el alfabeto no tiene
          nada que decir y el que habla es el vocabulario.
       ⚠ Un tercer director se llamaría «PÉREZ GARCÍA JUAN», sin FILMS ni
       PRODUCCIONES ni S.A.C. dentro: por eso el vocabulario sirve de filtro. */
    const pareceEmpresa = RE_FORMA.test(sobra)
      && (!rompe ? clave(filas[i].empresa) <= clave(juntas) : true)
      && (i + 2 >= filas.length || clave(juntas) <= clave(filas[i + 2].empresa));
    if ((rompe && clave(filas[i].empresa) <= clave(juntas)) || pareceEmpresa) {
      sig.empresa = juntas;
      sig.crudo = limpia(`${juntas} (${sig.ruc || ""}) ${sig.region || ""} ${sig.titulo}`);
      sobras[i] = "";
    } else {
      filas[i].titulo = limpia(`${filas[i].titulo} ${sobra}`);
      filas[i].pegado = true;
    }
  }
  /* La última no tiene fila siguiente a la que darle nada. */
  const u = filas.length - 1;
  if (sobras[u]) { filas[u].titulo = limpia(`${filas[u].titulo} ${sobras[u]}`); filas[u].pegado = true; }
}

/* ── «NO TRAE FORMA JURÍDICA» SOLO CUANDO SIGNIFICA ALGO ──
   Que un nombre no lleve S.A.C. ni E.I.R.L. puede querer decir dos cosas: que
   se leyó corto —y arrastra el final de la fila de arriba— o que la empresa
   simplemente no la lleva. «CHOLA CONTRAVISUAL», «CUYAY WASI» y «COAST 2 COAST»
   son de las segundas, y existen.

   Distinguirlas hace falta porque el aviso se paga en atención: tres filas
   perfectas marcadas en rojo enseñan a ignorar el rojo. Y hay con qué: si la
   lista viene ordenada y el nombre cae EN SU SITIO alfabético, está completo —un
   nombre al que le falte el principio no aterriza por casualidad entre sus dos
   vecinos—. Solo se avisa cuando no se puede comprobar o cuando no cuadra. */
function avisaSinForma(filas: FilaRes[], sinForma: boolean[]): void {
  const ordenada = vieneOrdenada(filas);
  filas.forEach((f, i) => {
    if (!sinForma[i] || f.avisos.length) return;
    const enSuSitio = ordenada
      && (i === 0 || clave(filas[i - 1].empresa) <= clave(f.empresa))
      && (i + 1 >= filas.length || clave(f.empresa) <= clave(filas[i + 1].empresa));
    if (!enSuSitio) f.avisos.push(AVISO_SIN_FORMA);
  });
}

function avisaDesorden(filas: FilaRes[]): void {
  if (!vieneOrdenada(filas)) return;
  filas.forEach((f, i) => {
    if (i > 0 && clave(filas[i - 1].empresa) > clave(f.empresa)) f.avisos.push(AVISO_ORDEN);
  });
}

/**
 * Las filas de una RESOLUCIÓN, ancladas en el RUC.
 * Cada trozo entre dos RUC se reparte entre la fila que lo cierra —su empresa,
 * al final— y la que lo abre —su título, al principio—.
 */
function filasPorRuc(cuerpo: string, cab: CabeceraRes): { filas: FilaRes[]; sinLeer: string[] } {
  const texto = lineasUtiles(cuerpo).join("\n");
  const rucs = [...texto.matchAll(RE_RUC)]
    .map(m => ({ ruc: m[1].replace(/\s/g, ""), ini: m.index!, fin: m.index! + m[0].length }))
    .filter(r => r.ruc.length >= 8 && r.ruc.length <= 11);
  const filas: FilaRes[] = [];
  const sinLeer: string[] = [];
  /* Lo que quedó detrás del eco de cada fila, a la espera de saber si es el
     principio del nombre de la siguiente (ver `devuelveLoQueSobra`). */
  const sobras: string[] = [];
  if (!rucs.length) return { filas, sinLeer };

  /* Un trozo más que RUCs: el de delante del primero (que solo da su empresa) y
     el de detrás del último (que solo da su cola). */
  const trozos = rucs.map((r, i) => texto.slice(i === 0 ? 0 : rucs[i - 1].fin, r.ini));
  trozos.push(texto.slice(rucs[rucs.length - 1].fin));
  const partes: Bloque[] = trozos.map((t, i) =>
    /* El último trozo no lleva empresa detrás: es cola y nada más. */
    i === trozos.length - 1
      ? { colaL: t.split("\n").map(l => l.trim()).filter(Boolean), empresaL: [], sinForma: false }
      : partirBloque(t));

  /* ══ UNA FILA PARTIDA POR UN SALTO DE PÁGINA ══
     Cuando una fila cae justo en el corte de página, el extractor saca el pie y
     la cabecera de la siguiente EN MEDIO de ella, y su `(RUC)` acaba emitido
     detrás de todo lo demás:

       …CARRANZA BEUNZA MARIANO   ← se queda al final de la página
       MITOPAMPA CINE E.I.R.L.
       LIMA   LOS SHAPIS: EL DOCUMENTAL
       [pie de página + membrete]
       (20612497690)              ← el RUC, ya en la página siguiente

     Se reconoce sin ambigüedad: detrás del RUC no hay región, y en el trozo de
     delante hay una que no es la de la fila anterior. Entonces ese trozo se
     vuelve a partir POR LA REGIÓN —lo de antes es la razón social, lo de detrás
     el título— y la fila queda entera.

     ⚠ Esto hay que hacerlo ANTES de armar ninguna fila. Cada trozo se reparte
     entre dos filas —la cola de la de arriba y la empresa de la de abajo—, así
     que si se arreglara sobre la marcha, la de arriba ya estaría hecha con el
     reparto viejo y se quedaría «MITOPAMPA CINE» pegado a su título para
     siempre. Es exactamente lo que pasaba.

     ⚠ Se toma la ÚLTIMA región del trozo. Podría fallar si el título de la fila
     de arriba llevara dentro el nombre de un departamento; a cambio, sin esto
     falla siempre que hay un salto de página. La fila queda marcada igual. */
  const regionDe: (string | null)[] = [];
  const cabezaDe: string[] = [];
  const partida: boolean[] = [];
  const RE_REGION_G = new RegExp(`\\b(${REGIONES.join("|")})\\b`, "gi");
  for (let i = 0; i < rucs.length; i++) {
    if (RE_REGION.test(pegaLetraSuelta(colaDe(partes[i + 1])))) continue;
    const t = trozos[i];
    RE_REGION_G.lastIndex = 0;
    const ms = [...t.matchAll(RE_REGION_G)];
    if (!ms.length) continue;
    const m = ms[ms.length - 1];
    const p2 = partirBloque(t.slice(0, m.index!));
    if (!empresaDe(p2)) continue;
    partes[i] = p2;
    regionDe[i] = m[1].toUpperCase();
    cabezaDe[i] = limpia(t.slice(m.index! + m[0].length).replace(/\n/g, " "));
    partida[i] = true;
  }

  /* Y una vez cada trozo está donde debe, se estiran los nombres cortos: el
     orden alfabético dice cuáles y hasta dónde. */
  estiraNombres(partes, rucs.length);

  rucs.forEach((r, i) => {
    const empresa = empresaDe(partes[i]);
    const { sinForma } = partes[i];
    /* Igual que en las relaciones: la región puede venir partida por el salto de
       línea («PUN» / «O»), y hasta que no está junta no casa con ninguna. */
    let cola = pegaLetraSuelta(colaDe(partes[i + 1]));
    const mr = cola.match(RE_REGION);
    const region = regionDe[i] || (mr ? mr[1].toUpperCase() : null);
    if (mr) cola = cola.slice(mr[0].length);
    /* ── LO QUE HAY DETRÁS DEL SALTO ──
       En una fila partida, su título y sus responsables se quedaron en la página
       anterior (`cabezaDe`). Lo que aparece detrás del RUC es lo que sobra, y
       puede ser una de dos cosas: el final de la propia fila, cuando el corte la
       partió por la mitad («PRIMA RICARDO MUNDO»), o el principio del nombre de
       la empresa siguiente («NATIVO», de NATIVO COMUNICACIONES E.I.R.L.).
       Aquí no se decide: se aparta y decide `devuelveLoQueSobra`, que tiene con
       qué comprobarlo. Si no lo prueba, vuelve al título — donde estaba. */
    let apartado = "";
    if (cabezaDe[i]) { apartado = cola; cola = cabezaDe[i]; }

    const monto = leeMonto(cola);
    const sinMonto = limpia(cola.replace(RE_MONTO, " "));
    const { titulo, categoria, pegado, sobra, personas } = partirPorCategoria(sinMonto);

    if (!empresa) { sinLeer.push(limpia(trozos[i]) || `(RUC ${r.ruc} sin empresa delante)`); return; }
    const avisos: string[] = [];
    if (partida[i]) avisos.push(AVISO_PARTIDA);
    if (!region) avisos.push(AVISO_SIN_REGION);

    filas.push({
      empresa, ruc: r.ruc, region, titulo,
      categoria: categoria || cab.categoria,
      etapa: cab.etapa as EtapaRes,
      modalidad: cab.modalidad, n: null, monto, avisos, pegado, personas,
      crudo: limpia(`${empresa} (${r.ruc}) ${region || ""} ${sinMonto}`),
    });
    sobras[filas.length - 1] = sobra || apartado;
  });
  devuelveLoQueSobra(filas, sobras);
  avisaSinForma(filas, rucs.map((_, i) => partes[i].sinForma));
  avisaDesorden(filas);
  return { filas, sinLeer };
}

/**
 * Las filas de una RELACIÓN DE RECIBIDAS, ancladas en el N° de orden.
 * No traen RUC —DAFO no lo publica en esta lista— así que el competidor solo se
 * puede casar por nombre hasta que salga su resolución de aptas.
 */
function filasPorNumero(cuerpo: string, cab: CabeceraRes): { filas: FilaRes[]; sinLeer: string[]; notas: string[] } {
  const lineas = lineasUtiles(cuerpo, true);
  const filas: FilaRes[] = [];
  const sinLeer: string[] = [];
  const notas: string[] = [];
  let buf = "";
  let n = 0;
  /* La relación de ficción trae DOS tablas —desarrollo y producción— con la
     numeración corrida, y cada una con sus fechas y su modalidad. Se sigue la
     última que se leyó para que cada fila sepa a qué concurso pertenece. */
  let modalidad = cab.modalidad;
  let modalidadBuf = modalidad;
  /* Dentro de la cabecera de una tabla: entre el «MODALIDAD:» y su primer N°. */
  let enCabecera = false;

  /* `N° EMPRESA REGIÓN TÍTULO [CATEGORÍA] PERSONAS`: una fila está COMPLETA
     cuando ya tiene su región, que es el ancla del medio. Sirve para leerla y,
     antes de eso, para saber si lo que hay en el buffer es ya una fila entera
     —que es lo que decide si el número que acaba de llegar abre la siguiente—. */
  const RE_FILA = new RegExp(`^(\\d{1,3})\\s+(.+?)\\s+(${REGIONES.join("|")})\\b\\s*(.*)$`, "i");
  const completa = () => RE_FILA.test(pegaLetraSuelta(limpia(buf)));

  const cerrar = () => {
    /* El arreglo se repite sobre el buffer ya juntado porque el destrozo puede
       cruzar el salto: «CAJAMARC» al final de una línea y «A SAN MARCOS ROBA» al
       principio de la siguiente. Por línea no hay nada que pegar; juntas, sí. */
    const t = pegaLetraSuelta(limpia(buf)); buf = "";
    if (!t || !n) return;
    const m = t.match(RE_FILA);
    if (!m) { sinLeer.push(t); return; }
    const cola = limpia(m[4]);
    const monto = leeMonto(cola);
    const { titulo, categoria, pegado, sobra, personas } = partirPorCategoria(limpia(cola.replace(RE_MONTO, " ")));
    const avisos: string[] = [];
    filas.push({
      /* En una relación el N° y la región acorralan el nombre, así que no hay
         fila corta que arreglar: lo que sobre vuelve al título, que es de donde
         salió. */
      empresa: limpia(m[2]), ruc: null, region: m[3].toUpperCase(),
      titulo: limpia(`${titulo} ${sobra}`),
      categoria: categoria || cab.categoria,
      etapa: "recibida", modalidad: modalidadBuf, n: Number(m[1]), monto, avisos, personas,
      pegado: pegado || !!sobra,
      crudo: t,
    });
  };

  for (const l of lineas) {
    /* Una relación puede traer DOS tablas —«DESARROLLO DE LARGOMETRAJE
       FICCIÓN» y «PRODUCCIÓN DE LARGOMETRAJES DE FICCIÓN A NIVEL NACIONAL»—,
       cada una con su modalidad, y el N° hace lo que le da la gana entre ellas:
       en documental vuelve a 1 y en ficción sigue de corrido (…82, 83…). Así que
       tras una cabecera de modalidad se acepta el número que venga, sea el que
       sea, y a partir de ahí se vuelve a exigir el siguiente exacto. */
    const mm = l.match(/^MODALIDAD\s*:\s*(.*)$/i);
    if (mm) { cerrar(); modalidad = limpia(mm[1]); enCabecera = true; continue; }
    const mn = l.match(/^(\d{1,3})(?:\s|$)/);
    /* Y la modalidad se parte en dos líneas cuando es larga. Mientras no
       aparezca el primer número, lo que siga es el resto de su nombre: las
       cabeceras de columna ya se tiraron antes de llegar aquí. */
    if (enCabecera && !mn) { modalidad = limpia(`${modalidad} ${l}`); continue; }
    /* ── QUÉ NÚMERO ABRE UNA FILA ──
       El siguiente exacto, siempre. Y si no lo es, vale igual cuando lo que hay
       en el buffer YA ES UNA FILA COMPLETA —tiene su región— y el número cae
       cerca: una tabla que ya se cerró y otro número detrás solo puede ser la
       fila siguiente.

       Ese segundo camino no es un capricho. La relación de documental numera
       DOS filas con el 44 y se salta el 45 (mírala: 43, 44, 44, 46…), y
       exigiendo el sucesor exacto ese segundo 44 no abría nada: las diez filas
       que quedaban —hasta ZEPPELIN FILMS, la 53— se metían dentro de la 44 y
       desaparecían de la carga. Una errata de mecanografía de DAFO no puede
       costar el final de la tabla.

       ⚠ Y sigue haciendo falta que el buffer esté completo, que es lo que evita
       el otro fallo: «3 PECADOS PRODUCCIONES S.A.C.» empieza por un 3 en la
       segunda línea de la fila 1, cuando el buffer es solo «1» y todavía no
       tiene región. Ahí no abre nada, que es lo correcto. */
    const k = mn ? Number(mn[1]) : -1;
    if (mn && (k === n + 1 || enCabecera || (!filas.length && !buf)
      || (completa() && k >= n && k <= n + 4))) {
      cerrar();
      n = Number(mn[1]);
      enCabecera = false;
      modalidadBuf = modalidad;
    }
    /* Todo lo de antes de la primera fila es la portada de la tabla, no algo
       que no se supo leer: no se reporta. */
    if (!n) continue;
    buf = buf ? `${buf} ${l}` : l;
  }
  cerrar();

  /* ── LA CUENTA QUE NO CUADRA ──
     Una relación numera sus filas, así que ella misma dice cuántas tenía: si la
     última es la 53 y solo salieron 44, nueve se fundieron dentro de otra y NO
     hay forma de notarlo mirando la pantalla —las 44 que quedan se ven
     perfectas—. Este es el aviso que faltaba cuando pasó de verdad. */
  const porTabla = new Map<string, number[]>();
  for (const f of filas) {
    const k = String(f.modalidad);
    if (!porTabla.has(k)) porTabla.set(k, []);
    porTabla.get(k)!.push(f.n || 0);
  }
  for (const [, ns] of porTabla) {
    const alto = Math.max(...ns), bajo = Math.min(...ns);
    const esperadas = alto - bajo + 1;
    if (ns.length < esperadas) {
      notas.push(`La tabla numera del ${bajo} al ${alto} —${esperadas} filas— y se leyeron ${ns.length}. `
        + `Faltan ${esperadas - ns.length}: revisa las que salgan con un nombre larguísimo, porque `
        + `serán dos o tres filas juntas.`);
    }
  }
  return { filas, sinLeer, notas };
}

export function leerCabecera(texto: string): CabeceraRes {
  const t = pegaLetraSuelta(limpia(texto));
  const etapa = FRASES.find(f => f.re.test(primerArticulo(t)))?.etapa ?? null;

  /* «‘Concurso de proyectos de Documental - 2026’» — el año va pegado al nombre
     con un guion. Se piden los dos juntos para no cazar cualquier año suelto del
     documento, que está lleno de ellos (leyes, decretos, informes). */
  const m = t.match(new RegExp(`${C}\\s*(Concurso[^${SIN_C}]{3,90}?)\\s*[-–]\\s*(20\\d{2})`, "i"));
  let concurso = m ? limpia(m[1]) : null;
  let anio = m ? Number(m[2]) : null;
  /* La relación de recibidas no es una resolución: no lleva esa frase. Su
     cabecera son las primeras líneas —concurso, qué lista es, año—. */
  if (!concurso && etapa === "recibida") {
    const l = String(texto || "").split("\n").map(x => x.trim()).filter(Boolean);
    concurso = l[0] || null;
    const a = l.slice(0, 8).map(x => x.match(/^(20\d{2})$/)).find(Boolean);
    anio = a ? Number(a[1]) : null;
  }

  /* La modalidad, siempre entre comillas detrás de «en la modalidad de». El
     cierre es la comilla y no «la primera coma», porque varias la llevan
     dentro: «…Ficción Nacional, exclusivo para las regiones del país…». */
  const mm = t.match(new RegExp(`modalidad\\s+de\\s*${C}\\s*([^${SIN_C}]{4,160}?)\\s*${C}`, "i"))
    || t.match(new RegExp(`modalidad\\s+de\\s*([^${SIN_C},.]{4,90})`, "i"))
    /* La de las relaciones va en su propia línea, y por eso se busca sobre el
       texto SIN aplanar: aplanado, «MODALIDAD: DESARROLLO DE LARGOMETRAJES» se
       lleva pegada detrás la cabecera de la tabla y hasta la primera fila. */
    || String(texto || "").match(/^\s*MODALIDAD\s*:\s*(.+)$/im);
  const mc = t.match(new RegExp(`categor[íi]a\\s*${C}\\s*([^${SIN_C}]{3,60}?)\\s*${C}`, "i"));
  return {
    etapa, concurso, anio,
    /* ⚠ Con las letras sueltas pegadas. El PDF parte las palabras donde le
       conviene y en las bases de 2024 la modalidad llega «Producció n de
       Documental»: una letra de diferencia y el sistema cree que hay dos
       modalidades en el concurso, con su filtro partido en dos. Es el mismo
       remiendo que ya se le hacía a las razones sociales y a las regiones. */
    modalidad: mm ? limpia(pegaLetraSuelta(mm[1])) : null,
    categoria: mc ? limpia(pegaLetraSuelta(mc[1])) : null,
  };
}

/**
 * Lee una lista publicada por DAFO — la que sea de las cuatro, y las que traiga
 * el archivo: un PDF puede ser un cuadernillo con varias resoluciones dentro.
 */
export function leerResolucionDafo(texto: string): LecturaRes {
  const todo = String(texto || "");

  /* Cada «SE RESUELVE» abre una resolución. Lo de delante del primero es base
     legal —«VISTOS», «CONSIDERANDO»— y no tiene listas, solo números de ley. */
  const cortes = [...todo.matchAll(/SE\s+RESUELVE\s*:?/gi)].map(m => m.index!);
  const trozos = cortes.length
    ? cortes.map((c, i) => todo.slice(c, i + 1 < cortes.length ? cortes[i + 1] : todo.length))
    : [todo];

  let cabecera: CabeceraRes | null = null;
  const filas: FilaRes[] = [];
  const sinLeer: string[] = [];
  const notas: string[] = [];

  for (const trozo of trozos) {
    const cab = leerCabecera(trozo);
    /* Sin frase de lista no hay lista: una resolución que declara INFUNDADO un
       recurso menciona a la empresa y su RUC, y leerla como si la incorporara
       sumaría una competidora que precisamente NO entró. */
    if (!cab.etapa) continue;
    if (!cabecera) cabecera = cab;

    if (cab.etapa === "recibida") {
      const r = filasPorNumero(trozo, cab);
      filas.push(...r.filas); sinLeer.push(...r.sinLeer); notas.push(...r.notas);
      continue;
    }
    /* Desde la frase que abre la lista: lo de antes son cuarenta párrafos de
       base legal. La prosa ya se tira, pero acotar evita además que un número
       entre paréntesis de una norma futura se lea como un RUC. */
    const f = FRASES.find(x => x.re.test(limpia(trozo)));
    const i = f ? limpia(trozo).search(f.re) : -1;
    const desde = i >= 0 ? buscaEnCrudo(trozo, f!.re) : 0;
    const r = filasPorRuc(trozo.slice(desde), cab);
    filas.push(...r.filas); sinLeer.push(...r.sinLeer);
  }

  return {
    cabecera: cabecera || leerCabecera(todo),
    filas, sinLeer, notas,
  };
}

/** La frase se busca sobre el texto con los espacios normalizados —parte de
 *  ella puede venir partida en dos líneas— y hay que volver a la posición del
 *  texto de verdad. Se localiza por su primera palabra, que no se parte. */
function buscaEnCrudo(trozo: string, re: RegExp): number {
  const prim = limpia(trozo).match(re)?.[0].split(" ")[0];
  if (!prim) return 0;
  const i = trozo.indexOf(prim);
  return i >= 0 ? i : 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   CUANDO LA TABLA SE PUDO LEER POR COLUMNAS

   `lib/tablaPdf` saca la tabla de donde está pintada y devuelve celdas. Aquí
   solo hay que decir qué es cada columna —lo dice su rótulo— y montar la fila.
   Ni un ancla, ni un eco, ni un orden alfabético: eso era para reconstruir lo
   que el texto plano había perdido, y por este camino no se pierde nada.

   La columna de personas se lee y se guarda: son documentos públicos del
   Ministerio y, en este oficio, quien dirige identifica al proyecto tanto como
   la empresa —hace falta para cruzar intentos de postulación entre concursos—.
   Lo que NO se hace es darlos de alta como personas del sistema: esto es lo que
   dijo un documento, no una ficha que alguien mantenga.
   ══════════════════════════════════════════════════════════════════════════ */

/** Qué campo es cada columna, por su rótulo. */
/* ── LAS PERSONAS DE UNA FILA, SIN REPETIR ──
   Un documento puede nombrar a la misma persona dos veces —como representante
   legal y como directora— y casi nunca la escribe igual: «ROJAS GARCIA, LUZ
   VIRGINIA» en una columna y «ROJAS GARCIA LUZ VIRGINIA» en la otra. Comparar
   las cadenas no sirve, y guardarlas las dos convierte a una persona en dos en
   cuanto alguien cuente cuántas veces se ha presentado.
   ⚠ Se compara el CONJUNTO de palabras ordenado: sobrevive a la coma, al orden
   de apellidos y a las tildes. Es la misma llave que usa la matriz de /rivales,
   y tiene que serlo: si aquí se juntan y allí no, la cuenta sale distinta en
   dos pantallas del mismo sistema. */
const llavePersona = (n: string) =>
  sinTilde(n).toLowerCase().split(/[^a-z0-9ñ]+/).filter(p => p.length > 1).sort().join(" ");

function juntaPersonas(...celdas: string[]): string {
  const out: string[] = [], vistas = new Set<string>();
  for (const c of celdas) {
    for (const n of String(c || "").split(/\s*[\/;]\s*/).map(x => x.trim()).filter(Boolean)) {
      const k = llavePersona(n);
      if (!k || vistas.has(k)) continue;
      vistas.add(k);
      out.push(n);
    }
  }
  return out.join(" / ");
}

function queColumna(rotulo: string): keyof FilaRes | "personas" | "responsable" | null {
  const r = sinTilde(rotulo);
  /* ⚠ Las personas van PRIMERO. Su rótulo es «DIRECTOR(A/ES/RAS) DEL PROYECTO»
     y lleva dentro la palabra «proyecto»: preguntando antes por el título, esa
     columna se leía como el título y volvíamos a tener los nombres pegados —
     justo lo que este camino existe para evitar. */
  if (/director/.test(r)) return "personas";
  /* ⚠ El representante legal va APARTE del director aunque los dos sean
     personas. Muchas listas traen las dos columnas —«Representante Legal» y
     «Directores»— y a veces son la misma persona y a veces no; mandando las dos
     al mismo campo salía «ROJAS GARCIA, LUZ VIRGINIA ROJAS GARCIA LUZ VIRGINIA»
     y, cuando eran distintas, un nombre inventado con los apellidos de una y el
     nombre de la otra. Se juntan luego, sin repetir (ver `juntaPersonas`). */
  if (/representante|responsab|apoderad/.test(r)) return "responsable";
  if (/persona jur|postulante|ruc/.test(r)) return "empresa";
  /* «Departamento» es como lo llaman las listas de 2025 y anteriores; «Región»,
     las de 2026. Es la misma columna y el mismo dato. */
  if (/region|departamento/.test(r)) return "region";
  /* ⚠ «proyect» y «titul», no las palabras enteras: el PDF parte los rótulos
     donde le conviene y en un fallo de 2025 la cabecera llega como «PROYECT»,
     con su «O» caída en el grupo de al lado. Pidiendo la palabra completa, esa
     columna no era el título de nada y las cinco filas salían sin proyecto. */
  if (/proyect|titul/.test(r)) return "titulo";
  if (/categoria/.test(r)) return "categoria";
  if (/monto/.test(r)) return "monto";
  if (/^n°|^n\b/.test(r)) return "n";
  return null;
}

/**
 * Convierte las celdas de una tabla leída por columnas en filas de competencia.
 * @param rotulos los de la cabecera de la tabla, en orden.
 * @param celdas una fila de celdas por fila de la tabla.
 */
export function filasDeCeldas(rotulos: string[], filasTabla: FilaTabla[], cab: CabeceraRes): FilaRes[] {
  const campos = rotulos.map(queColumna);
  /* En las relaciones, el N° y la razón social comparten columna —el rótulo
     viene «N° PERSONA JURÍDICA»— y el número se queda al principio de la celda.
     Si ninguna columna se reconoció como la de la empresa pero hay una de N°,
     esa es: el número se le quita luego. */
  if (!campos.includes("empresa")) {
    const i = campos.indexOf("n");
    if (i < 0) return [];
    campos[i] = "empresa";
  }

  return filasTabla.map(ft => {
    const fila = ft.celdas;
    const de = (k: string) => fila
      .filter((_, i) => campos[i] === k).join(" ").replace(/\s+/g, " ").trim();

    /* En la columna de la persona jurídica van el nombre y el RUC, uno debajo
       del otro dentro de la misma celda: el paréntesis los separa. */
    let bruto = pegaLetraSuelta(de("empresa"));
    const mr = bruto.match(/\(\s*(\d[\d\s]{6,12}\d)\s*\)/);
    const ruc = mr ? mr[1].replace(/\s/g, "") : null;
    /* El N° de orden, cuando venía pegado delante del nombre. Se quita de la
       razón social y se guarda donde corresponde. */
    const mn = bruto.match(/^\s*(\d{1,3})\s+(?=\D)/);
    if (mn) bruto = bruto.slice(mn[0].length);
    const empresa = limpia(bruto.replace(/\(\s*\d[\d\s]{6,12}\d\s*\)/, ""));

    const region = pegaLetraSuelta(de("region")).toUpperCase().trim() || null;
    const titulo = limpia(pegaLetraSuelta(de("titulo")));
    const catCelda = de("categoria");
    const categoria = catCelda
      ? (CATEGORIAS.find(c => c.re.test(pegaLetraSuelta(catCelda)))?.txt || limpia(catCelda))
      : cab.categoria;
    const n = Number(de("n").match(/^\d{1,3}/)?.[0]) || (mn ? Number(mn[1]) : null);

    const avisos: string[] = [];
    if (!region) avisos.push(AVISO_SIN_REGION);
    /* ── ⚠ LA LISTA DE ESPERA NO GANÓ ──
       El fallo trae dos tablas iguales: las beneficiarias y, debajo, «CONSIGNAR
       la siguiente relación como Lista de espera». Misma cabecera, mismas
       columnas y hasta con el monto que les tocaría si se libera plata. Leídas
       igual, el concurso salía con un ganador de más y con dinero repartido que
       nunca se entregó.
       Se guardan —son competidores reales y llegaron lejos— pero como
       FINALISTAS, que es lo que son: evaluadas, ordenadas y sin estímulo. Y sin
       monto, que es el dato que las convertiría en ganadoras a la vista. */
    if (ft.espera) avisos.push(AVISO_ESPERA);

    return {
      empresa, ruc, region, titulo, categoria,
      /* Su columna propia: aquí el nombre llega entero y sin mezclarse con el
         título, que es exactamente de lo que se trataba. Detrás, el
         representante legal — solo si no es ya el mismo. */
      personas: juntaPersonas(limpia(pegaLetraSuelta(de("personas"))),
        limpia(pegaLetraSuelta(de("responsable")))),
      etapa: (ft.espera ? "finalista" : (cab.etapa || "apta")) as EtapaRes,
      /* La del bloque en el que está la fila, y solo si no la hay la del
         documento: una relación trae varias tablas y cada una es su concurso. */
      modalidad: ft.modalidad || cab.modalidad, n,
      monto: ft.espera ? null : leeMonto(de("monto")),
      avisos,
      /* El título viene de su propia columna: aquí nunca lleva personas
         pegadas, que era lo único que `pegado` señalaba. */
      pegado: false,
      crudo: limpia(fila.join(" · ")),
    };
  }).filter(f => f.empresa || f.ruc);
}
