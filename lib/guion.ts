/* EL GUION, EN UN SOLO SITIO
 *
 * Actos → secuencias → escenas. La vuelta 1 llega hasta la secuencia,
 * porque ese es el orden real de trabajo: primero se escribe el
 * tratamiento dividido en secuencias, y el guion se desarrolla contra él.
 *
 * ── LA PLANTILLA ES UNA CAPA, NO UN CONTENEDOR ──
 * Del prototipo, palabra por palabra: «Las escenas no saben a qué
 * plantilla pertenecen. El mapeo beat→escena vive fuera.» Es la decisión
 * que hace que se pueda pasar de Save the Cat a Truby sin tocar una línea
 * escrita: la plantilla solo dice DÓNDE se espera que pasen las cosas,
 * y el guion dice dónde pasan. La distancia entre las dos es el
 * diagnóstico, y solo existe si son dos cosas separadas.
 *
 * El catálogo vive aquí y no en una tabla: son modelos canónicos —Field,
 * Snyder, Campbell, Truby— que no se administran. Lo que sí va a la base
 * es cuál usa cada proyecto.
 */

export type Beat = {
  n: string;
  /** Dónde se ESPERA que caiga, en % del metraje. */
  pos: number;
};
export type Plantilla = { clave: string; nombre: string; fuente: string; beats: Beat[] };

export const PLANTILLAS: Plantilla[] = [
  {
    clave: "tres-actos", nombre: "Tres actos", fuente: "Syd Field",
    beats: [
      { n: "Detonante", pos: 12 },
      { n: "Primer punto de giro", pos: 25 },
      { n: "Punto medio", pos: 50 },
      { n: "Segundo punto de giro", pos: 75 },
      { n: "Clímax", pos: 90 },
    ],
  },
  {
    clave: "save-the-cat", nombre: "Save the Cat", fuente: "Blake Snyder",
    beats: [
      { n: "Imagen de apertura", pos: 2 },
      { n: "Tema declarado", pos: 6 },
      { n: "Catalizador", pos: 11 },
      { n: "Ruptura", pos: 22 },
      { n: "Juegos y diversión", pos: 33 },
      { n: "Punto medio", pos: 50 },
      { n: "Todo está perdido", pos: 72 },
      { n: "Noche oscura del alma", pos: 78 },
      { n: "Final", pos: 88 },
      { n: "Imagen de cierre", pos: 99 },
    ],
  },
  {
    clave: "viaje-heroe", nombre: "Viaje del héroe", fuente: "Campbell · Vogler",
    beats: [
      { n: "Mundo ordinario", pos: 5 },
      { n: "El llamado", pos: 12 },
      { n: "Cruce del umbral", pos: 25 },
      { n: "Pruebas y aliados", pos: 38 },
      { n: "La caverna profunda", pos: 60 },
      { n: "La odisea", pos: 75 },
      { n: "La recompensa", pos: 85 },
      { n: "El retorno", pos: 97 },
    ],
  },
  {
    clave: "truby", nombre: "Truby · pasos clave", fuente: "John Truby",
    beats: [
      { n: "Debilidad y necesidad", pos: 6 },
      { n: "Deseo", pos: 20 },
      { n: "Oponente", pos: 35 },
      { n: "Plan", pos: 45 },
      { n: "Batalla", pos: 80 },
      { n: "Autorrevelación", pos: 88 },
      { n: "Nuevo equilibrio", pos: 98 },
    ],
  },
];

const POR_CLAVE = new Map(PLANTILLAS.map(p => [p.clave, p]));
export const plantillaDe = (clave?: string | null) =>
  POR_CLAVE.get(String(clave || "")) || PLANTILLAS[0];

/* ── ACTOS QUE SIEMBRA CADA PLANTILLA ──
   Los beats no son actos: un beat es un momento, un acto es un tramo. La
   siembra da los tramos con los que se empieza a escribir; después se
   renombran, se añaden o se quitan a mano. */
export const ACTOS_BASE: Record<string, { clave: string; nombre: string }[]> = {
  "tres-actos": [
    { clave: "I", nombre: "Planteamiento" },
    { clave: "II", nombre: "Confrontación" },
    { clave: "III", nombre: "Resolución" },
  ],
  "save-the-cat": [
    { clave: "I", nombre: "Planteamiento" },
    { clave: "IIa", nombre: "Juegos y diversión" },
    { clave: "IIb", nombre: "Todo se derrumba" },
    { clave: "III", nombre: "Final" },
  ],
  "viaje-heroe": [
    { clave: "I", nombre: "Partida" },
    { clave: "II", nombre: "Iniciación" },
    { clave: "III", nombre: "Retorno" },
  ],
  truby: [
    { clave: "I", nombre: "Debilidad y deseo" },
    { clave: "II", nombre: "Oponente y plan" },
    { clave: "III", nombre: "Batalla y revelación" },
  ],
};

/* ══════════ FICCIÓN O DOCUMENTAL ══════════
 * No es un ajuste nuevo: el tipo del proyecto ya lo dice. Guardarlo otra
 * vez en el guion sería tener dos verdades sobre lo mismo, y llegaría el
 * día en que una diga documental y la otra ficción.
 *
 * Cambia el vocabulario entero, no solo una etiqueta: en ficción se
 * ESCRIBE lo que va a pasar; en documental se PREVÉ lo que puede pasar y
 * se planifica cómo registrarlo. Llamar «escena» a lo segundo empuja a
 * escribir lo que la gente va a decir, que es justo lo que un documental
 * no hace. */
export type ModoGuion = "ficcion" | "documental";
const TIPOS_DOC = ["documental", "cobertura"];
export const modoGuion = (tipoProyecto?: string | null): ModoGuion =>
  TIPOS_DOC.includes((tipoProyecto || "").trim().toLowerCase()) ? "documental" : "ficcion";

export const VOZ: Record<ModoGuion, {
  tratamiento: string; sec: string; secs: string; escena: string; escenas: string;
  ayudaTexto: string;
}> = {
  ficcion: {
    tratamiento: "Tratamiento", sec: "Secuencia", secs: "Secuencias",
    escena: "Escena", escenas: "Escenas",
    ayudaTexto: "Qué pasa en esta secuencia, en prosa. Sin diálogo y sin planos: eso viene después, y de aquí.",
  },
  documental: {
    tratamiento: "Tratamiento", sec: "Secuencia", secs: "Secuencias",
    escena: "Bloque", escenas: "Bloques",
    ayudaTexto: "Qué esperas que ocurra y por qué importa. En documental esto se prevé, no se dicta: lo que la gente diga, lo dirá ella.",
  },
};

/* ══════════ MEDIR UN TRATAMIENTO ══════════
 * Una sola definición, porque la leen la secuencia, el acto, la cabecera
 * y el diagnóstico. Escrita cuatro veces, la primera que cambiara de
 * criterio dejaría a las otras tres diciendo otra cosa —y todas parecen
 * ciertas—.
 *
 * La regla del oficio es «una página de guion, un minuto de pantalla», y
 * una página ronda las 190 palabras de tratamiento en prosa. Es una
 * ESTIMACIÓN y se dice que lo es: en cuanto la secuencia tiene minutos
 * puestos a mano, manda el autor.
 */
export const PALABRAS_POR_MINUTO = 190;
export const MIN_PARA_ANALIZAR = 60;   // caracteres: menos que esto no es un tratamiento

export const palabras = (t?: string | null) =>
  (t || "").trim() ? (t || "").trim().split(/\s+/).length : 0;

/** Minutos de una secuencia: los que puso el autor, o los estimados. */
export function minutosDe(s: { minutos?: number | null; texto?: string | null }) {
  const m = Number(s.minutos);
  if (Number.isFinite(m) && m > 0) return { min: m, estimado: false };
  const p = palabras(s.texto);
  return { min: p ? Math.round((p / PALABRAS_POR_MINUTO) * 10) / 10 : 0, estimado: true };
}

export const minutosHum = (m: number) => {
  if (!m) return "—";
  if (m < 1) return `${Math.round(m * 60)} s`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h ? `${h} h ${r} min` : `${Math.round(m * 10) / 10} min`;
};

/* ══════════ DIAGNÓSTICO DEL TRATAMIENTO ══════════
 * Del prototipo, adaptado a lo que existe en esta vuelta. Cada aviso
 * nombra la secuencia: un diagnóstico que dice «hay 3 secuencias sin
 * hilo» sin decir cuáles obliga a buscarlas a mano, y entonces no se
 * mira. */
export type Aviso = { grave: boolean; txt: string; secId?: string };

export function diagnosticar(
  secs: { id: string; nombre: string; texto?: string | null; hilos?: string[] }[],
  hayHilos: boolean,
): Aviso[] {
  const av: Aviso[] = [];
  secs.forEach(s => {
    const p = palabras(s.texto);
    if (!p) av.push({ grave: true, txt: `«${s.nombre}» no tiene tratamiento escrito`, secId: s.id });
    else if ((s.texto || "").trim().length < MIN_PARA_ANALIZAR)
      av.push({ grave: false, txt: `«${s.nombre}» tiene ${p} palabra(s): demasiado poco para sostener una secuencia`, secId: s.id });
    if (hayHilos && !(s.hilos || []).length)
      av.push({ grave: false, txt: `«${s.nombre}» no toca ningún hilo de trama`, secId: s.id });
  });
  return av;
}

/** Reparto del metraje por acto, para ver de un vistazo si algún acto se
 *  comió la película. El clásico 25/50/25 es orientación, no ley: por eso
 *  se muestra el porcentaje y no un semáforo. */
export function repartoActos(
  actos: { id: string; nombre: string }[],
  secs: { acto_id?: string | null; minutos?: number | null; texto?: string | null }[],
) {
  const total = secs.reduce((a, s) => a + minutosDe(s).min, 0);
  return {
    total,
    filas: actos.map(a => {
      const min = secs.filter(s => s.acto_id === a.id).reduce((x, s) => x + minutosDe(s).min, 0);
      return { id: a.id, nombre: a.nombre, min, pct: total ? (min / total) * 100 : 0 };
    }),
  };
}
