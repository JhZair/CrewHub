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

/* ── UN BEAT ──
 * Un beat no es un título: es un TRABAJO que la historia tiene que hacer en
 * un punto concreto. «Catalizador» no le dice nada a quien está delante de
 * la página en blanco; «la noticia que desordena la vida del protagonista»
 * sí. Por eso cada beat lleva su `que`: el modelo estructural solo sirve de
 * guía si dice qué hay que conseguir, no solo cómo se llama.
 *
 * `tipo` separa lo que la estructura hace de verdad:
 *   giro      — la historia cambia de dirección y no puede volver
 *   inflexion — no cambia de dirección, cambia de naturaleza (o de quién
 *               lleva la iniciativa). Es lo que suele faltar cuando un
 *               segundo acto se hace largo.
 *   estado    — no gira nada: establece, mide o cierra
 */
export type TipoBeat = "giro" | "inflexion" | "estado";
export type Beat = {
  n: string;
  /** Dónde se ESPERA que caiga, en % del metraje. */
  pos: number;
  tipo: TipoBeat;
  /** Qué tiene que conseguir. La guía para escribir la secuencia. */
  que: string;
  /** A qué acto de la plantilla pertenece (índice en ACTOS_BASE). */
  acto: number;
};
export type Plantilla = { clave: string; nombre: string; fuente: string; beats: Beat[] };

export const ICO_BEAT: Record<TipoBeat, string> = { giro: "◆", inflexion: "◈", estado: "·" };
export const TXT_BEAT: Record<TipoBeat, string> = {
  giro: "punto de giro", inflexion: "punto de inflexión", estado: "",
};

export const PLANTILLAS: Plantilla[] = [
  {
    clave: "tres-actos", nombre: "Tres actos", fuente: "Syd Field",
    beats: [
      { n: "Detonante", pos: 12, tipo: "giro", acto: 0,
        que: "El suceso que rompe el equilibrio. Sin él la historia no arranca: el protagonista podría seguir con su vida." },
      { n: "Primer punto de giro", pos: 25, tipo: "giro", acto: 0,
        que: "El protagonista DECIDE, y esa decisión lo mete en el segundo acto. A partir de aquí no puede volver a lo de antes." },
      { n: "Punto medio", pos: 50, tipo: "inflexion", acto: 1,
        que: "Cambia la naturaleza del conflicto: de reaccionar pasa a actuar (o al revés). Si falta, el segundo acto se hace largo." },
      { n: "Segundo punto de giro", pos: 75, tipo: "giro", acto: 1,
        que: "La caída mayor. Lo que creía que le bastaba deja de bastarle, y lo que necesita de verdad se le pone delante." },
      { n: "Clímax", pos: 90, tipo: "giro", acto: 2,
        que: "La confrontación final. Aquí se contesta la pregunta dramática, y se contesta con una acción, no con una frase." },
    ],
  },
  {
    clave: "save-the-cat", nombre: "Save the Cat", fuente: "Blake Snyder",
    beats: [
      { n: "Imagen de apertura", pos: 2, tipo: "estado", acto: 0,
        que: "El mundo y el tono en un plano. Es el «antes» que la imagen de cierre va a contradecir." },
      { n: "Tema declarado", pos: 6, tipo: "estado", acto: 0,
        que: "Alguien dice, casi de pasada, de qué trata la película. El protagonista todavía no lo entiende." },
      { n: "Catalizador", pos: 11, tipo: "giro", acto: 0,
        que: "La noticia que desordena su vida. Le llega de fuera: no la busca." },
      { n: "Ruptura", pos: 22, tipo: "giro", acto: 0,
        que: "Deja atrás el mundo viejo y entra en el nuevo. Tiene que ser una decisión suya, no un empujón." },
      { n: "Juegos y diversión", pos: 33, tipo: "estado", acto: 1,
        que: "La promesa de la premisa: aquello a lo que vino el público. Es el tramo del tráiler." },
      { n: "Punto medio", pos: 50, tipo: "inflexion", acto: 1,
        que: "Falsa victoria o falsa derrota, y la apuesta sube. Lo público y lo privado se cruzan." },
      { n: "Todo está perdido", pos: 72, tipo: "giro", acto: 2,
        que: "La derrota mayor, con su «olor a muerte»: algo o alguien se pierde de verdad." },
      { n: "Noche oscura del alma", pos: 78, tipo: "estado", acto: 2,
        que: "El duelo. No hay plan. Es el único sitio donde el personaje puede mirar lo que evitaba." },
      { n: "Final", pos: 88, tipo: "giro", acto: 3,
        que: "Aplica lo aprendido y desmonta lo que lo bloqueaba. Gana con lo que era su debilidad." },
      { n: "Imagen de cierre", pos: 99, tipo: "estado", acto: 3,
        que: "El espejo de la apertura. Mide, sin decirlo, cuánto cambió." },
    ],
  },
  {
    clave: "viaje-heroe", nombre: "Viaje del héroe", fuente: "Campbell · Vogler",
    beats: [
      { n: "Mundo ordinario", pos: 5, tipo: "estado", acto: 0,
        que: "Lo que va a perder. Si no se ve lo que tiene, después no duele que lo deje." },
      { n: "El llamado", pos: 12, tipo: "giro", acto: 0,
        que: "La invitación a salir. Casi siempre la rechaza primero, y ese rechazo lo define." },
      { n: "Cruce del umbral", pos: 25, tipo: "giro", acto: 0,
        que: "Entra en el mundo especial y acepta sus reglas. La puerta se cierra detrás." },
      { n: "Pruebas y aliados", pos: 38, tipo: "estado", acto: 1,
        que: "Aprende las reglas nuevas y se rodea. Cada prueba tiene que enseñarle algo distinto." },
      { n: "La caverna profunda", pos: 60, tipo: "inflexion", acto: 1,
        que: "Se acerca a lo que más teme. Aquí deja de avanzar por inercia y empieza a elegir." },
      { n: "La odisea", pos: 75, tipo: "giro", acto: 1,
        que: "Muerte y resurrección. Algo suyo se queda ahí dentro y no vuelve." },
      { n: "La recompensa", pos: 85, tipo: "estado", acto: 2,
        que: "Se lleva el elixir, pero con precio. Un premio sin precio no cierra nada." },
      { n: "El retorno", pos: 97, tipo: "estado", acto: 2,
        que: "Vuelve al mundo ordinario cambiado, y se nota en cómo lo mira." },
    ],
  },
  {
    clave: "truby", nombre: "Truby · pasos clave", fuente: "John Truby",
    beats: [
      { n: "Debilidad y necesidad", pos: 6, tipo: "estado", acto: 0,
        que: "Qué le falta al protagonista para vivir bien — y que él todavía no sabe que le falta." },
      { n: "Deseo", pos: 20, tipo: "giro", acto: 0,
        que: "Lo que persigue, concreto y visible. Es el motor: el público tiene que poder decir si lo consiguió." },
      { n: "Oponente", pos: 35, tipo: "estado", acto: 1,
        que: "Quien quiere LO MISMO. No es el malo: es quien compite por el mismo objetivo." },
      { n: "Plan", pos: 45, tipo: "estado", acto: 1,
        que: "Cómo piensa vencerlo. Tiene que fallar, y fallar por su debilidad." },
      { n: "Batalla", pos: 80, tipo: "giro", acto: 2,
        que: "El enfrentamiento final por el objetivo. Se decide quién se lo lleva." },
      { n: "Autorrevelación", pos: 88, tipo: "inflexion", acto: 2,
        que: "Ve lo que no veía de sí mismo. Sin esto la batalla es solo ruido." },
      { n: "Nuevo equilibrio", pos: 98, tipo: "estado", acto: 2,
        que: "El nivel nuevo, más alto o más bajo. La medida de todo lo anterior." },
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

/** ¿De qué plantilla son los actos que tiene el proyecto? Se deduce de sus
 *  nombres, porque no se guarda: los actos se siembran una vez y después son
 *  del autor —los renombra, los parte, añade uno—. Sirve solo para avisar de
 *  que el modelo elegido y los actos que hay no coinciden, que es algo que
 *  se ve raro en pantalla y no tiene explicación por ningún lado. */
export function plantillaDeLosActos(nombres: string[]): string | null {
  const norm = (a: string[]) => a.map(x => x.trim().toLowerCase()).join("|");
  const mio = norm(nombres);
  if (!mio) return null;
  const hit = Object.entries(ACTOS_BASE).find(([, base]) => norm(base.map(b => b.nombre)) === mio);
  return hit ? hit[0] : null;
}

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

/* ── CUANDO FALTA UNA TABLA ──
 * PostgREST contesta «Could not find the table 'public.guion_beats' in the
 * schema cache». Es exacto y no sirve de nada: no dice qué hacer. El repo
 * tiene la respuesta —un archivo en db/— y decirla aquí, una vez, evita
 * pegarla en cada pantalla que pueda tropezar con lo mismo. */
const ARCHIVO_DE: Record<string, string> = {
  guion_beats: "db/guion-beats.sql",
  guion_actos: "db/guion.sql",
  guion_secuencias: "db/guion.sql",
  guion_hilos: "db/guion.sql",
  guion_secuencia_hilos: "db/guion.sql",
};

/** Añade al error de la base la instrucción que falta. Devuelve el mismo
 *  mensaje si no reconoce nada: nunca se traga el original. */
export function explicar(msg?: string | null): string {
  const m = String(msg || "");
  if (!m) return "";
  const t = Object.keys(ARCHIVO_DE).find(k => m.includes(k));
  const falta = /could not find the table|does not exist|schema cache|relation .* does not exist/i.test(m);
  return t && falta
    ? `${m}\n→ Falta correr ${ARCHIVO_DE[t]} en Supabase.`
    : m;
}

/** Cuánto se puede desviar un punto de donde se esperaba antes de que
 *  signifique algo. Ocho puntos porcentuales, como en el prototipo: por
 *  debajo es ruido, y avisar de todo es no avisar de nada. */
export const DESVIO_MAX = 8;

export function diagnosticar(
  secs: { id: string; nombre: string; texto?: string | null; hilos?: string[] }[],
  hayHilos: boolean,
  beats: { id: string; nombre: string; tipo: TipoBeat; pos?: number | null; secuencia_id?: string | null }[] = [],
  pctDe: Map<string, number> = new Map(),
): Aviso[] {
  const av: Aviso[] = [];

  /* La estructura primero. Un punto de giro sin escribir pesa más que una
     secuencia corta: la secuencia corta se alarga, el giro que falta hay
     que inventarlo. */
  beats.forEach(b => {
    if (!b.secuencia_id) {
      av.push({
        grave: b.tipo === "giro",
        txt: `${b.tipo === "giro" ? "El punto de giro" : b.tipo === "inflexion" ? "El punto de inflexión" : "«"}` +
             `${b.tipo === "estado" ? b.nombre + "»" : ` «${b.nombre}»`} no lo carga ninguna secuencia`,
      });
      return;
    }
    const real = pctDe.get(b.secuencia_id);
    if (b.pos == null || real == null) return;
    const d = Math.round(real - b.pos);
    if (Math.abs(d) > DESVIO_MAX)
      av.push({
        grave: false,
        txt: `«${b.nombre}» se espera al ${b.pos}% y cae al ${Math.round(real)}% (${d > 0 ? "+" : ""}${d} puntos)`,
      });
  });

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
