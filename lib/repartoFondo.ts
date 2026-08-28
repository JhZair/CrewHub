/* ══════════════════════════════════════════════════════════════════════════
   EL EQUIPO ARTÍSTICO DE UN FONDO — quién sale, con qué papel, y si firmó.

   Tres reglas viven aquí porque las leen tres sitios distintos —la pestaña
   Audiovisual, el contador de la cabecera y el aviso de la cláusula 5.4— y
   escritas tres veces se separan a la primera corrección. Ya pasó con el tipo
   de publicación: diez copias, dos versiones, contado en lib/tipos.ts.

   ── POR QUÉ NO REUSAR `rangoRol` DE lib/actores ──
   Aquel ordena cuatro cosas (protagonista, secundario, otro, ninguno) porque
   la ficha del proyecto solo necesitaba eso. Un fondo documental tiene además
   conducción y testimonios, que son categorías propias y no «otro»: el jurado
   DAFO lee «tres voces expertas» como un dato del proyecto, y hundidas en un
   cajón de sastre desaparecen. Los rótulos SÍ se reusan (`esDocumental`), que
   es la parte que de verdad es la misma pregunta.
   ══════════════════════════════════════════════════════════════════════════ */

import { esDocumental } from "@/lib/actores";

export type Procedencia = "postulacion" | "ejecucion";
export type CesionEstado = "no_aplica" | "pendiente" | "firmada";

/** La fila tal como sale de `postulacion_reparto`, con lo que decoramos. */
export type FilaReparto = {
  id: string;
  persona_id?: string | null;
  personaje?: string | null;
  proyecto_actor_id?: string | null;
  rol?: string | null;
  especialidad?: string | null;
  procedencia?: string | null;
  cesion_estado?: string | null;
  cesion_url?: string | null;
  cesion_fecha?: string | null;
  nota?: string | null;
  orden?: number | null;
  /* PostgREST devuelve la relación embebida como objeto o como array de uno
     según cómo resuelva la consulta. Las dos formas, o media lista pierde el
     nombre — exactamente el fallo que documenta `FilaActor` en lib/actores. */
  persona?: any;
  per?: any;
};

/* ── LOS GRUPOS ──
 * Cada uno con las raíces que lo reclaman. Por RAÍZ y no por igualdad para
 * tolerar «protagonistas», «PROTAGONISTA», «conductora», «voces expertas»: el
 * campo es texto libre a propósito, así que aquí hay que ser generoso o el
 * agrupado no agrupa nada.
 * El orden del array ES el orden en que se pintan Y el orden en que se
 * reclaman: el primero que reconoce el papel se lo lleva. Eso no es un detalle
 * de implementación, es la regla que separa las dos capas de abajo.
 *
 * ── POR QUÉ CONDUCCIÓN Y PROTAGONISMO SOCIAL SON DOS COSAS ──
 * En KAWSAY WARMI la directora y la productora dejan de estar detrás de cámara
 * y entran en el relato: viajan, se encuentran, conversan, y ese viaje es el
 * hilo que articula las historias. Las tres mujeres a las que visitan no dan un
 * testimonio sentadas frente a una cámara: la cámara las acompaña en su vida.
 * Son dos papeles distintos —quien LLEVA el relato y quien ES el relato— y
 * meterlos en un cajón llamado «protagonismo y conducción» aplanaba justo la
 * distinción que sostiene la película: se veía «5 personas» donde hay dos capas.
 *
 * ⚠ CONDUCCIÓN VA PRIMERO Y NO ES CASUAL. «Protagonista narrativa» contiene la
 * raíz «protagon», así que si el grupo social se reclamara antes, las
 * conductoras caerían con las protagonistas y la separación no existiría. El
 * orden del array ES la desambiguación.
 */
export type Grupo = { k: string; titulo: string; raices: string[] };

export const GRUPOS: Grupo[] = [
  /* Quienes llevan al espectador de un lugar a otro. Aquí caben las
     realizadoras que entran en cuadro, la conductora, la narradora — y, en
     ficción, quien haga de hilo. */
  /* ⚠ NO están «directora» ni «realizadora», a propósito. Este campo dice qué
     es alguien EN LA PELÍCULA, no qué cargo tiene: el cargo vive en la pestaña
     👥 Equipo. Que Yajaida dirija no la convierte en conductora del relato —lo
     que la convierte es entrar en cuadro, y eso se escribe—. Si aceptáramos el
     cargo aquí, cualquiera del crew apuntado por error caería en el grupo más
     destacado de la lista. Caen en «Otros papeles», que es lo honesto. */
  { k: "conduccion", titulo: "Conducción — quienes llevan el relato",
    raices: ["conduct", "presentad", "anfitrion", "anfitrión", "narrador", "narradora",
             "protagonista narrativ", "protagonistas narrativ"] },
  /* A quienes la película va a buscar. En un documental de encuentro, estas son
     las historias; en ficción, el o la protagonista de la trama. */
  { k: "protagonista", titulo: "Protagonistas — de quiénes es la historia",
    raices: ["protagon", "heroe", "héroe"] },
  { k: "secundario", titulo: "Personajes secundarios",
    raices: ["secundar", "antagon", "reparto", "extra", "figurac"] },
  { k: "testimonio", titulo: "Testimonios y voces expertas",
    raices: ["testimoni", "experta", "experto", "especialista", "entrevistad",
             "investigador", "academic", "académic", "antropolog", "antropólog"] },
  { k: "otros", titulo: "Otros papeles", raices: [] },
  { k: "sinrol", titulo: "Sin papel asignado", raices: [] },
];

const limpia = (s?: string | null) => (s || "").trim().toLowerCase();

/** A qué grupo cae un rol. `sinrol` si está vacío; `otros` si está escrito
 *  pero no lo reclama ninguno — que NO es lo mismo, y por eso son dos.
 *  Recorre `GRUPOS` en orden y devuelve el PRIMERO que lo reconoce: ver arriba
 *  por qué conducción tiene que ir antes que protagonismo. */
export function grupoDeRol(rol?: string | null): string {
  const r = limpia(rol);
  if (!r) return "sinrol";
  for (const g of GRUPOS) {
    if (g.raices.some(raiz => r.includes(raiz))) return g.k;
  }
  return "otros";
}

/* (Aquí vivía `rangoGrupo`, que traducía la clave de un grupo a su posición.
   No lo usaba nadie: `agrupar` recorre `GRUPOS` en orden y eso YA es el rango.
   Un export que nadie importa es una segunda definición del orden esperando a
   discrepar con la primera.) */

/** Las filas repartidas en sus grupos, en el orden de `GRUPOS`, y sin los
 *  grupos vacíos: una cabecera «Testimonios y voces expertas» sobre la nada
 *  se lee como que se perdieron. */
export function agrupar(filas: FilaReparto[]): { grupo: Grupo; filas: FilaReparto[] }[] {
  const cajones = new Map<string, FilaReparto[]>();
  for (const f of filas) {
    const k = grupoDeRol(f.rol);
    cajones.set(k, [...(cajones.get(k) || []), f]);
  }
  return GRUPOS
    .map(g => ({ grupo: g, filas: ordenarDentro(cajones.get(g.k) || []) }))
    .filter(x => x.filas.length > 0);
}

/** Dentro de un grupo: primero lo que venía de la postulación —es lo que el
 *  Estado tiene por escrito—, luego por `orden`, y a igualdad por nombre.
 *  `localeCompare` con "es" para que la Ñ y los acentos caigan donde un
 *  lector espera. */
function ordenarDentro(filas: FilaReparto[]): FilaReparto[] {
  return [...filas].sort((a, b) => {
    /* Por `procedenciaDe` y no comparando el campo en crudo: si el orden usara
       un criterio y la burbuja otro, un dato con un espacio o una mayúscula se
       pintaría «de la postulación» y se ordenaría como de ejecución. El CHECK
       de la base lo impide hoy; que sean dos criterios es lo que se separa a
       la primera migración. */
    const pa = procedenciaDe(a) === "postulacion" ? 0 : 1;
    const pb = procedenciaDe(b) === "postulacion" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const oa = a.orden ?? 0, ob = b.orden ?? 0;
    if (oa !== ob) return oa - ob;
    return tituloDe(a).localeCompare(tituloDe(b), "es");
  });
}

/* ── CÓMO SE LEE UNA FILA ──
 * Igual que en la ficha del proyecto y por la misma razón: el título es el
 * personaje si lo hay, porque en ficción se busca por «Robomac» y no por quien
 * le pone la voz. */
export function personaDe(f: FilaReparto): any | null {
  const v = f.persona ?? f.per;
  const q = Array.isArray(v) ? v[0] : v;
  return q || null;
}

export function tituloDe(f: FilaReparto): string {
  const q = personaDe(f);
  const persona = q?.alias || q?.nombre || null;
  return (f.personaje || "").trim() || persona || "sin nombre";
}

export function leerFila(f: FilaReparto) {
  const q = personaDe(f);
  const persona = q?.alias || q?.nombre || null;
  const personaje = (f.personaje || "").trim() || null;
  return {
    titulo: personaje || persona || "sin nombre",
    /* Quién lo interpreta — solo cuando personaje y persona son dos cosas. */
    pie: personaje && persona ? persona : null,
    sinRepartir: !!personaje && !persona,
    esPersona: !personaje && !!persona,
    persona: q,
  };
}

/* ── LA CESIÓN ──
 * Sin autorización de imagen y voz firmada, ese material no se puede usar: ni
 * en la copia final, ni en el tráiler, ni en el material promocional. Se
 * descubre en montaje, que es cuando volver a pedirlo significa volver a la
 * comunidad.
 *
 * ⚠ `undefined` NO es cero. Si la consulta falló, `resumenCesiones` recibe una
 * lista vacía y diría «0 pendientes», que se lee como «está todo firmado» —lo
 * contrario de la verdad—. Por eso la función devuelve el total y quien pinta
 * decide; y por eso la pestaña enseña el error del servidor en vez de la
 * cuenta. Un cero que en realidad es «no lo sé» es el error más caro que hemos
 * tenido en este proyecto. */
export type ResumenCesiones = {
  total: number; firmadas: number; pendientes: number; noAplica: number;
};

export function resumenCesiones(filas: FilaReparto[]): ResumenCesiones {
  let firmadas = 0, pendientes = 0, noAplica = 0;
  for (const f of filas) {
    const e = estadoCesion(f);
    if (e === "firmada") firmadas++;
    else if (e === "no_aplica") noAplica++;
    else pendientes++;
  }
  return { total: filas.length, firmadas, pendientes, noAplica };
}

/** El estado, normalizado. Cualquier cosa que no sean los tres valores
 *  conocidos cuenta como PENDIENTE, no como «no aplica»: un dato que no
 *  entendemos no puede rebajar el recuento de papeles que faltan. */
export function estadoCesion(f: FilaReparto): CesionEstado {
  const e = limpia(f.cesion_estado);
  return e === "firmada" || e === "no_aplica" ? e : "pendiente";
}

/** ⚠ Una cesión marcada «firmada» sin enlace no está probada. No es un error
 *  —el papel puede existir en un archivador— pero tampoco se puede enseñar a
 *  DAFO, y en una rendición eso es lo mismo que no tenerlo. Se dice, en vez de
 *  pintarla en verde como si estuviera resuelta. */
export const firmadaSinPrueba = (f: FilaReparto) =>
  estadoCesion(f) === "firmada" && !(f.cesion_url || "").trim();

export const COLOR_CESION: Record<CesionEstado, string> = {
  firmada: "var(--green)",
  /* `--yellow` y no `--amber`: esa variable no existe en app/globals.css. Un
     color CSS inventado no falla ni avisa —el navegador se queda con el color
     heredado— así que la burbuja «pendiente» habría salido del mismo color que
     el texto normal, o sea invisible justo la que hay que ver. */
  pendiente: "var(--yellow)",
  no_aplica: "var(--dim)",
};

export const ROTULO_CESION: Record<CesionEstado, string> = {
  firmada: "cesión firmada",
  pendiente: "cesión pendiente",
  no_aplica: "cesión no aplica",
};

/* ── ROLES SUGERIDOS ──
 * El combo es un `datalist`: se puede escribir cualquier cosa. Esto cubre el
 * caso normal sin cerrar la puerta al raro. */
/* Las dos primeras son las dos capas: quien lleva el relato y quien lo es. Van
   escritas con su apellido —«protagonista narrativa», «social»— porque a
   secas las dos se llaman «protagonista» y quien rellena el combo no tiene por
   qué saber cuál de las dos le toca. `Conductora` a secas se queda porque es
   lo que ya está escrito en los fondos vivos y sigue cayendo donde debe. */
const ROLES_DOC = [
  "Conductora (protagonista narrativa)", "Conductora",
  "Protagonista social", "Protagonista",
  "Personaje secundario", "Testimonio", "Voz experta", "Reparto",
];
const ROLES_FIC = [
  "Protagonista", "Personaje secundario", "Antagonista",
  "Narradora", "Reparto", "Voz", "Extra",
];

export const rolesReparto = (tipoProyecto?: string | null) =>
  esDocumental(tipoProyecto) ? ROLES_DOC : ROLES_FIC;

/** Cómo se llama la sección y qué se dice cuando está vacía. El equipo
 *  artístico de un documental y el de una ficción no se nombran igual, y usar
 *  el rótulo equivocado hace que nadie encuentre lo que busca. */
export function rotuloReparto(tipoProyecto?: string | null) {
  return esDocumental(tipoProyecto)
    ? {
        titulo: "Equipo artístico",
        ico: "🫂",
        vacio: "Sin equipo artístico — quiénes aparecen en el documental: protagonistas, testimonios, voces expertas.",
        pideNombre: false,
        etqPersona: "Persona",
      }
    : {
        titulo: "Equipo artístico",
        ico: "🎭",
        vacio: "Sin equipo artístico — los personajes de la historia, y quién los interpreta cuando esté el casting.",
        pideNombre: true,
        etqPersona: "Intérprete",
      };
}

export const ROTULO_PROCEDENCIA: Record<Procedencia, string> = {
  postulacion: "de la postulación",
  ejecucion: "de la ejecución",
};

/** La procedencia, normalizada. Solo `postulacion` es `postulacion`;
 *  cualquier otra cosa —incluida una vacía— es de ejecución. Al revés, una
 *  fila con el dato corrupto se presentaría como parte del expediente que ganó
 *  el fondo, que es una afirmación sobre un documento entregado al Estado. */
export const procedenciaDe = (f: FilaReparto): Procedencia =>
  limpia(f.procedencia) === "postulacion" ? "postulacion" : "ejecucion";

/** La cláusula del acta donde se rinde esta documentación.
 *  ⚠ El acta NO nombra la cesión de imagen como entregable aparte: la 5.4 pide
 *  «documentación de contratos, convenios de prácticas o prestación de
 *  servicios de todo el personal vinculado» y los seguros. La cesión se rinde
 *  ahí dentro. Se enlaza por eso, no porque el acta diga «cesión». */
export const CLAUSULA_CESION = "5.4";
