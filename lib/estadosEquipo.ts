/* EL ESTADO DE UN EQUIPO, EN UN SOLO SITIO.
 *
 * Estaba escrito en OCHO archivos —/equipamiento, la ficha, el buscador,
 * la vista del combo, la lista agrupada, el préstamo, los kits y las
 * acciones— y ya había divergido: el rojo de «perdido» era `var(--dano)`
 * en la ficha, `var(--red)` en la lista y `#ff4d5e` en el buscador, y la
 * lista de «qué no se puede entregar» vivía en dos sitios que tenían que
 * coincidir a mano o la pantalla ofrecía lo que el servidor rechazaba.
 *
 * ── EL ESTADO QUE FALTABA ──
 * «Perdido» es una CONCLUSIÓN, y la conclusión llega semanas después de
 * la pregunta. Lo que pasa de verdad es que alguien va al almacén, no
 * encuentra la jaula, y no tiene dónde anotarlo: marcarla «perdida» es
 * afirmar algo que no se sabe, y dejarla «disponible» es peor —el sistema
 * la sigue ofreciendo para un rodaje y el problema se descubre el sábado,
 * cargando la camioneta—.
 *
 * `no_aparece` es ese hueco. Cuenta en el inventario (no está confirmado
 * que se perdiera: sigue siendo patrimonio), no se puede entregar, y sale
 * en «requieren atención» — porque lo que hay que hacer con él es
 * buscarlo, y un equipo que nadie busca acaba perdido de verdad.
 */

export type EstadoEquipo =
  | "disponible" | "en_uso" | "ensamblado" | "no_aparece" | "en_reparacion"
  | "perdido" | "de_baja";

export type MetaEstado = {
  k: EstadoEquipo;
  ico: string;
  txt: string;          // singular, para una ficha
  plural: string;       // para los chips de filtro
  color: string;
  /** Fondo tenue para resaltar la fila. Vacío = no se resalta. */
  tinte: string;
  /** ¿Se puede entregar a alguien? */
  entregable: boolean;
  /** ¿Cuenta como patrimonio en el valor del inventario? */
  inventario: boolean;
  /** ¿Sale en «requieren atención»? */
  atencion: boolean;
  /** Por qué NO se puede entregar, dicho para quien lo lee. */
  porque?: string;
  ayuda?: string;
};

export const ESTADOS_EQUIPO: MetaEstado[] = [
  { k: "disponible", ico: "🟢", txt: "Disponible", plural: "Disponibles",
    color: "var(--green)", tinte: "", entregable: true, inventario: true, atencion: false },
  { k: "en_uso", ico: "🤝", txt: "En uso", plural: "En uso",
    color: "var(--blue)", tinte: "rgba(59,130,246,.05)",
    entregable: false, inventario: true, atencion: false, porque: "lo tiene alguien" },
  /* ── LA PIEZA QUE ESTÁ ATORNILLADA A OTRA ──
     Un monopod de paneo son siete piezas unidas con tornillos: varilla,
     cabezal, mango, adaptadores. Cada una es una unidad que se compró y que
     tiene su boleta, pero mientras está montada NO se puede prestar sola —y
     ofrecerla en la lista de entrega es ofrecer algo que habría que desarmar
     con un destornillador.
     No es «en uso» (nadie la tiene), ni «en reparación» (no está rota), ni
     está fuera del inventario (es nuestra y costó lo que costó). Es un estado
     físico: forma parte de otra cosa.
     Cuenta en el patrimonio SU precio y no el del ensamblado —el ensamblado no
     se compró, se armó— y así el total del inventario no cuenta nada dos
     veces. En gris y sin tinte: no es un problema que atender, es cómo está
     guardada. */
  { k: "ensamblado", ico: "🔩", txt: "Ensamblado", plural: "Ensamblados",
    color: "var(--muted)", tinte: "", entregable: false, inventario: true,
    atencion: false, porque: "está montado en otro equipo",
    ayuda: "Está atornillado dentro de otro equipo, así que no se presta solo. Para liberarlo hay que desarmarlo desde la ficha del equipo que lo contiene." },
  /* Entre «disponible» y «perdido», que es donde vive la realidad la mayor
     parte del tiempo. Naranja: ni el amarillo de reparación —eso se sabe
     dónde está— ni el rojo de perdido, que ya es un veredicto. */
  { k: "no_aparece", ico: "🔍", txt: "No aparece", plural: "No aparecen",
    color: "#fb923c", tinte: "rgba(251,146,60,.07)",
    entregable: false, inventario: true, atencion: true,
    porque: "no aparece",
    ayuda: "No está donde debería y todavía no se da por perdido. Sigue contando en el inventario: lo que hay que hacer con él es buscarlo." },
  { k: "en_reparacion", ico: "🛠", txt: "En reparación", plural: "En reparación",
    color: "var(--yellow)", tinte: "rgba(244,180,0,.05)",
    entregable: false, inventario: true, atencion: true, porque: "en reparación" },
  { k: "perdido", ico: "❌", txt: "Perdido", plural: "Perdidos",
    color: "var(--red)", tinte: "rgba(255,77,94,.06)",
    entregable: false, inventario: false, atencion: true, porque: "perdido",
    ayuda: "Se da por perdido: ya no cuenta en el inventario. Si solo no aparece, usa «No aparece»." },
  { k: "de_baja", ico: "⬛", txt: "De baja", plural: "De baja",
    color: "var(--dim)", tinte: "", entregable: false, inventario: false, atencion: false,
    porque: "de baja" },
];

const POR_K = new Map(ESTADOS_EQUIPO.map(e => [e.k, e]));
const NINGUNO: MetaEstado = {
  k: "disponible", ico: "·", txt: "—", plural: "—", color: "var(--dim)", tinte: "",
  entregable: false, inventario: true, atencion: false,
};

export const metaEstado = (k?: string | null): MetaEstado => POR_K.get(String(k ?? "") as EstadoEquipo) || NINGUNO;
export const colorEstadoEq = (k?: string | null) => metaEstado(k).color;
export const txtEstadoEq = (k?: string | null) => metaEstado(k).txt;
export const icoEstadoEq = (k?: string | null) => metaEstado(k).ico;
export const tinteEstadoEq = (k?: string | null) => metaEstado(k).tinte;

/** Las opciones que se le pueden PONER a mano. «en uso» no está: lo gobiernan
 *  los préstamos, y ponerlo a dedo dejaría un equipo «en uso» sin que nadie
 *  lo tenga. */
/* Ni «en uso» ni «ensamblado» se ponen a mano: el primero lo gobierna el
   préstamo y el segundo el equipo que contiene la pieza. Elegirlos a dedo
   dejaría un equipo «ensamblado» sin nada dentro de lo cual lo esté. */
export const ESTADOS_ELEGIBLES: EstadoEquipo[] =
  ESTADOS_EQUIPO.filter(e => e.k !== "en_uso" && e.k !== "ensamblado").map(e => e.k);

/** Qué NO se puede entregar, y por qué —con estas palabras—. Es la MISMA
 *  lista que veta el servidor: si se separan, la pantalla ofrece algo que el
 *  servidor rechaza, y el rechazo llega después del clic. */
/* ¿SE PUEDE ENTREGAR? La pregunta completa, no solo «¿está vetado?».
 *
 * Un equipo SIN ESTADO —cadena vacía o nulo— no está en la lista de vetados,
 * así que todo lo que preguntaba `NO_ENTREGABLE[estado]` lo daba por bueno: el
 * kit lo contaba entre las libres y decía «completo», mientras la entrega
 * —que pide `estado === "disponible"`— se negaba a sacarlo. Dos pantallas, dos
 * verdades, y ningún error: el kit prometía algo que la entrega no cumplía.
 *
 * Sin estado no es disponible: es que NO SE SABE. Y lo que no se sabe no se
 * promete. */
export const entregableEq = (k?: string | null): boolean => {
  const s = String(k ?? "").trim();
  if (!s) return false;
  const m = POR_K.get(s as EstadoEquipo);
  return !!m && m.entregable;
};

/** Por qué no se puede entregar, incluido el caso de no tener estado. */
export const porQueNoEq = (k?: string | null): string => {
  const s = String(k ?? "").trim();
  if (!s) return "sin estado";
  return NO_ENTREGABLE[s] || metaEstado(s).txt.toLowerCase();
};

export const NO_ENTREGABLE: Record<string, string> = Object.fromEntries(
  ESTADOS_EQUIPO.filter(e => !e.entregable && e.k !== "en_uso").map(e => [e.k, e.porque || e.txt]));

/** Lo que ya no es patrimonio. */
export const FUERA_DE_INVENTARIO: string[] =
  ESTADOS_EQUIPO.filter(e => !e.inventario).map(e => e.k);

/** Lo que hay que mirar hoy. */
export const NECESITA_ATENCION: string[] =
  ESTADOS_EQUIPO.filter(e => e.atencion).map(e => e.k);

/* ── EL SELLO DE UN EQUIPO FUERA DE JUEGO ──
 *
 * Mismo sello que ya usan las postulaciones —«NO APTA» estampado sobre el
 * carné— porque es la misma pregunta: ¿esto sigue en juego o no? En una
 * postulación se lee de un vistazo y en un equipo había que leer la línea
 * «ESTADO: en reparacion» entre otras cinco, en gris y del mismo tamaño que
 * la categoría. Quien abre la ficha de una cámara antes de un rodaje está
 * preguntando exactamente eso, y merece la respuesta antes que el dato.
 *
 * Solo los estados que dejan el equipo FUERA. Ni «disponible» —lo normal no
 * se estampa— ni «en uso» ni «ensamblado»: esos dos no son un problema, son
 * el equipo haciendo su trabajo, y sellarlos convertiría el sello en ruido.
 *
 * Los títulos van cortos a propósito: es un sello, no una frase. «Reparación»
 * a 30 px cabe en la columna del carné; «En reparación» ya no.
 */
export type SelloEq = { titulo: string; sub: string; ico: string; tono: string };
const SELLO_EQ: Record<string, SelloEq> = {
  en_reparacion: { titulo: "Reparación", sub: "No se presta", ico: "🛠", tono: "averiado" },
  no_aparece:    { titulo: "No aparece", sub: "Sin ubicar", ico: "🔎", tono: "averiado" },
  perdido:       { titulo: "Perdido", sub: "Fuera del inventario", ico: "🚫", tono: "perdido" },
  de_baja:       { titulo: "De baja", sub: "Fuera del inventario", ico: "⛔", tono: "baja" },
};
export const selloEquipo = (k?: string | null): SelloEq | null =>
  SELLO_EQ[String(k ?? "").trim()] || null;
