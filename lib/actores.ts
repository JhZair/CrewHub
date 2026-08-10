/* QUIÉN APARECE EN LA PELÍCULA — y cómo se llama eso según lo que sea.
 *
 * En un documental la persona Y el personaje son la misma cosa: Braulia Puma
 * es Braulia Puma, y por eso la sección se llamó «actores sociales» —los
 * personajes de la vida real que la película retrata—.
 *
 * En ficción y animación son dos cosas distintas, y además no van al mismo
 * ritmo: Robomac existe desde el guion; quien le pone la voz aparece en
 * casting, meses después. Un modelo que exija la persona para poder nombrar al
 * personaje obliga a esperar al casting para escribir el reparto.
 *
 * Una sola lista, entonces, con dos lecturas:
 *   documental → persona sin personaje
 *   ficción    → personaje con o sin intérprete
 *
 * Los rótulos y los roles viven aquí porque los leen tres sitios (el título de
 * la sección, el combo de roles y el ordenamiento). Escritos tres veces
 * habrían divergido: ya pasó con el tipo de publicación —diez copias, dos
 * versiones— y está contado en lib/tipos.ts.
 */

/** Tipos de proyecto donde lo que se retrata es real. Los demás son ficción a
 *  efectos de reparto: hay personaje, y puede haber quien lo interprete. */
const DOCUMENTALES = ["documental", "cobertura", "gestion_cultural"];

export const esDocumental = (tipoProyecto?: string | null) =>
  DOCUMENTALES.includes((tipoProyecto || "").trim().toLowerCase());

/** Cómo se llama la sección, qué se pide y qué se dice cuando está vacía. */
export function rotuloActores(tipoProyecto?: string | null) {
  return esDocumental(tipoProyecto)
    ? {
        titulo: "Actores sociales",
        ico: "🫂",
        vacio: "Sin actores sociales — los personajes de la vida real que retrata el documental.",
        pideNombre: false,          // el nombre lo pone la ficha de persona
        etqPersona: "Persona",
      }
    : {
        titulo: "Personajes y elenco",
        ico: "🎭",
        vacio: "Sin personajes — quiénes aparecen en la historia, y quién los interpreta cuando ya esté el casting.",
        pideNombre: true,           // el personaje se escribe: no existe en ninguna tabla
        etqPersona: "Intérprete",
      };
}

/** Sugerencias del combo, por tipo. Es editable (datalist): un proyecto puede
    tener roles que no están aquí, pero estos cubren el caso normal. */
const ROLES_DOC = ["Protagonista", "Secundario", "Antagonista", "Testimonio", "Reparto"];
const ROLES_FIC = ["Protagonista", "Secundario", "Antagonista", "Reparto", "Voz", "Extra"];

export const rolesDe = (tipoProyecto?: string | null) =>
  esDocumental(tipoProyecto) ? ROLES_DOC : ROLES_FIC;

/** Rango para ordenar: protagonista (0) → secundario (1) → otro rol (2) →
    sin rol (3). Se compara por raíz para tolerar «protagonistas», mayúsculas… */
export function rangoRol(rol?: string | null): number {
  const r = (rol || "").trim().toLowerCase();
  if (!r) return 3;
  if (r.startsWith("protagon")) return 0;
  if (r.startsWith("secundar")) return 1;
  return 2;
}

/** Ordena una lista de actores por rango de rol (estable dentro del mismo rango). */
export function ordenarActores<T extends { rol?: string | null }>(actores: T[]): T[] {
  return [...actores].sort((a, b) => rangoRol(a.rol) - rangoRol(b.rol));
}

/* ── CÓMO SE LEE UNA FILA ──
 * Tres formas, y las tres tienen que verse distintas de un vistazo:
 *   · persona sola          → un actor social (documental)
 *   · personaje + persona   → Robomac, interpretado por Fulana
 *   · personaje solo        → Robomac, sin repartir todavía
 * Lo tercero NO es un error ni un dato incompleto: es el estado normal de un
 * guion antes del casting, y decirlo —«sin repartir»— es más útil que dejar el
 * hueco en blanco, que se lee como un olvido. */
type Quien = { id?: string; nombre?: string | null; alias?: string | null; foto_url?: string | null };
export type FilaActor = {
  personaje?: string | null;
  /* Las DOS grafías. PostgREST devuelve la relación con el alias que le pida
     cada consulta —`persona:personas(...)` en la ficha del proyecto, `per:…`
     en otras—, y una función que solo mire una de las dos devuelve «sin
     nombre» para filas que sí tienen persona. Pasó: con `per` a secas, TODO
     documental existente perdía el nombre y se pintaba «sin repartir», y
     `actores: any[]` impedía que TypeScript lo viera. */
  per?: Quien | Quien[] | null;
  persona?: Quien | Quien[] | null;
};

/** La persona de una fila, venga con el alias que venga (y sea objeto o array,
 *  que PostgREST devuelve lo uno o lo otro según la forma de la consulta). */
export function personaDe(a: FilaActor): Quien | null {
  const v = a.persona ?? a.per;
  const q = Array.isArray(v) ? v[0] : v;
  return q || null;
}

export function leerActor(a: FilaActor) {
  const q = personaDe(a);
  const persona = q?.alias || q?.nombre || null;
  const personaje = (a.personaje || "").trim() || null;
  return {
    /* El título de la fila es el personaje si lo hay: en ficción se busca por
       «Robomac», no por el nombre del actor de voz. */
    titulo: personaje || persona || "sin nombre",
    /* Y debajo, quién lo interpreta —solo cuando son dos cosas distintas—. */
    pie: personaje && persona ? persona : null,
    sinRepartir: !!personaje && !persona,
    esPersona: !personaje && !!persona,
  };
}

/* ══════════════ LA FICHA DEL PERSONAJE ══════════════
 *
 * Un personaje no es un nombre y un rol. Lo que lo hace personaje es la
 * distancia entre lo que QUIERE y lo que NECESITA —Robomac quiere romper la
 * simulación; lo que necesita es aceptar de quién es hijo—, y esa distancia es
 * la historia. Un campo «descripción» no obliga a nombrarla: se escribe un
 * párrafo bonito y las dos preguntas quedan sin contestar.
 *
 * No es cosa de ficción. El tratamiento de un documental pide lo mismo —qué
 * persigue Braulia, qué descubre por el camino— y el jurado DAFO lee
 * exactamente eso. Así que la ficha es de cualquiera a quien la película
 * retrate, invente o no.
 *
 * Definidos aquí y no en el formulario porque los leen dos sitios —el editor y
 * la ficha— y una lista escrita dos veces se separa a la tercera edición.
 */

export type CampoFicha = {
  k: string;          // columna en proyecto_actores
  label: string;
  hint: string;       // la pregunta, tal como se le hace a quien escribe
  area?: boolean;     // caja grande
  par?: boolean;      // va pegado al campo anterior (el «cómo» de un deseo)
};

export const CAMPOS_FICHA: CampoFicha[] = [
  { k: "descripcion", label: "Sinopsis", hint: "¿Qué hay que saber de este personaje?", area: true },
  { k: "quiere", label: "Quiere", hint: "¿Qué quiere tu personaje?" },
  { k: "quiere_como", label: "y lo intenta así", hint: "¿Cómo intentará conseguirlo?", par: true },
  { k: "necesita", label: "Necesita", hint: "¿Qué necesita de verdad?" },
  { k: "necesita_como", label: "y lo descubre así", hint: "¿Cómo se dará cuenta?", par: true },
  { k: "notas", label: "Notas", hint: "Detalles varios y contexto", area: true },
];

/** Los cuatro datos de cabecera, en una fila. Cortos a propósito: si piden
 *  párrafo, van en la sinopsis. */
export const CAMPOS_DETALLE: CampoFicha[] = [
  { k: "edad", label: "Edad", hint: "«16», «adulta», «de 40 a 70»" },
  { k: "genero", label: "Género", hint: "" },
  { k: "rasgos", label: "Rasgos", hint: "cómo es y cómo se ve" },
];

/* Arquetipos del viaje del héroe. Sugerencias, no lista cerrada: el combo es
   editable y un proyecto puede nombrarlos a su manera. */
export const ARQUETIPOS = [
  "Héroe", "Mentor", "Aliado", "Sombra", "Antagonista",
  "Guardián del umbral", "Embaucador", "Heraldo", "Camaleón",
];

/** ¿Tiene esta fila algo escrito en la ficha? Sirve para no abrir un panel
 *  vacío ni pintar un «▾ ficha» que no lleva a ninguna parte. */
export const TIENE_FICHA = (a: any) =>
  [...CAMPOS_FICHA, ...CAMPOS_DETALLE].some(c => (a?.[c.k] || "").toString().trim())
  || !!(a?.arquetipo || "").trim();
