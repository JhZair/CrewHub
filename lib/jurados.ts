import type { Trozo } from "@/lib/tablaPdf";

/* ══════════════════════════════════════════════════════════════════════════
   LEER LA SUMILLA DEL JURADO

   DAFO publica, junto a cada concurso, un PDF con quién lo va a juzgar: cinco
   personas con su nombre, su especialidad y un párrafo de trayectoria. No es
   una tabla —el lector de `lib/tablaPdf.ts` no sirve aquí— sino prosa
   maquetada: un nombre en grande, debajo su especialidad, y debajo la
   biografía en cuerpo pequeño.

   ── POR QUÉ IMPORTA Y NO ES UN ADORNO ──
   Esa mesa decide. Y se repite: la misma persona juzga varias ediciones y
   varios concursos, así que la pregunta «¿este jurado ya nos leyó antes, y
   cómo nos fue?» solo se puede contestar si esto queda guardado como FILAS que
   se cruzan entre años. Además dice quién lee qué: una mesa con un diseñador
   de sonido lee la propuesta sonora con criterio, y eso cambia cómo se escribe
   esa parte del proyecto.

   ── CÓMO SE RECONOCE UN NOMBRE ──
   Con dos señales, y hacen falta las dos:

   1. EL CUERPO DE LA LETRA. El nombre siempre está en una letra más grande que
      la biografía. Es lo único constante en los cinco documentos que se
      probaron —2022 a 2026, cuatro maquetaciones distintas— y por eso el
      extractor tuvo que empezar a devolver el alto (`Trozo.h`).
      ⚠ La ESPECIALIDAD unas veces va en el tamaño del nombre (2022, 2025,
      2026) y otras en el del texto (2023, 2024). Así que el tamaño solo no
      distingue un nombre de una especialidad: hace falta la segunda señal.
   2. QUE PAREZCA UN NOMBRE DE PERSONA: dos o más palabras con mayúscula
      inicial, sin contar las partículas («de», «del», «la»). Con esto caen
      solas todas las especialidades —«Directora documentalista», «Técnico
      especialista de la cinematografía»: una sola mayúscula— y también los
      titulares, que además suelen ir en versales o con cifras.

   ⚠ LO QUE NO SE HACE: DEDUCIR EL PAÍS. En 2022 el país va en una columna
   aparte y en 2023 entre paréntesis detrás de la especialidad; en 2024, 2025 y
   2026 no está. La biografía de 2026 dice «Cineasta panameña» y sería fácil
   sacar «Panamá» de ahí — y estaría inventando un dato que el documento no
   da. Lo que no dice el papel se queda vacío.
   ══════════════════════════════════════════════════════════════════════════ */

export type FilaJurado = {
  nombre: string;
  /** Su especialidad tal como la nombra la resolución: «Directora
   *  documentalista», «Técnico especialista de la cinematografía». Es el
   *  criterio con el que DAFO compone la mesa, no un adorno. */
  rol: string | null;
  /** Solo si el documento lo dice. Nunca deducido de la biografía. */
  pais: string | null;
  sumilla: string | null;
  /** Lo que se leyó raro, dicho en la fila y no escondido. */
  avisos: string[];
  /** El trozo de PDF del que salió, para poder comprobarlo sin abrir el PDF. */
  crudo: string;
};

type Linea = { y: number; h: number; xs: number; items: Trozo[]; txt: string };
/** La misma línea, ya separada de lo que hubiera en otra columna. */
type Recta = Linea & { xc: number; txtc: string; izq: string };

const nfc = (s: string) => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim();

/* Partículas que no cuentan como palabra con mayúscula: «María del Rosario
   Vera del Carpio» tiene cuatro mayúsculas de verdad, no seis. */
const PARTICULA = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "do", "van", "von"]);

/** ¿Esta línea parece el nombre de una persona? Ver el cabecero. */
function pareceNombre(t: string): boolean {
  const s = nfc(t);
  if (!s || s.length > 70) return false;
  /* Cifras y dos puntos no salen en un nombre y sí en los titulares
     («ESTÍMULOS ECONÓMICOS 2022», «Categoría: Producción»). */
  if (/[0-9:;]/.test(s)) return false;
  const palabras = s.split(" ").filter(Boolean);
  if (palabras.length < 2 || palabras.length > 8) return false;
  /* Versales = titular. Un nombre propio en estos documentos va en caja alta y
     baja; el membrete es el que grita. */
  if (s === s.toUpperCase()) return false;
  const mays = palabras.filter(p =>
    !PARTICULA.has(p.toLowerCase()) && /^[A-ZÁÉÍÓÚÑÜ]/.test(p));
  return mays.length >= 2;
}

/** Las líneas de todas las páginas, de arriba abajo, con su cuerpo de letra. */
function lineasDe(paginas: Trozo[][]): Linea[] {
  const out: Linea[] = [];
  for (const pag of paginas) {
    const buenos = (pag || []).filter(i => i && nfc(i.s));
    const grupos: Trozo[][] = [];
    /* Misma línea = misma `y` con una tolerancia pequeña. Se ordena por y
       descendente porque en un PDF el origen está abajo. */
    for (const i of [...buenos].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const ult = grupos[grupos.length - 1];
      if (ult && Math.abs(ult[0].y - i.y) <= 1.5) ult.push(i);
      else grupos.push([i]);
    }
    for (const g of grupos) {
      const its = [...g].sort((a, b) => a.x - b.x);
      out.push({
        y: its[0].y,
        /* El alto de la línea es el MAYOR de sus trozos: una palabra en
           cursiva o un paréntesis pueden venir con alto 0. */
        h: Math.max(...its.map(i => Number(i.h) || 0)),
        xs: its[0].x,
        items: its,
        txt: nfc(its.map(i => i.s).join(" ")),
      });
    }
  }
  return out;
}

/** El valor que más se repite de una lista de números, redondeado a la unidad.
 *  Sirve tanto para el cuerpo del texto como para el margen izquierdo. */
function moda(ns: number[]): number {
  const m = new Map<number, number>();
  for (const n of ns) {
    const k = Math.round(n);
    m.set(k, (m.get(k) || 0) + 1);
  }
  let mejor = 0, veces = -1;
  m.forEach((v, k) => { if (v > veces) { veces = v; mejor = k; } });
  return mejor;
}

export function leeJurados(paginas: Trozo[][]): FilaJurado[] {
  const lineas = lineasDe(paginas);
  if (lineas.length < 3) return [];

  /* ── EL CUERPO DEL TEXTO Y EL MARGEN, MEDIDOS Y NO SUPUESTOS ──
     Cada año maqueta con otro tamaño —10 puntos en 2026, 23 en 2022, 25 en
     2024— así que no hay ningún número que valga para todos. Lo que sí vale
     en todos es la proporción: el nombre es más grande que la biografía, y la
     biografía es lo que más líneas ocupa. */
  const hCuerpo = moda(lineas.map(l => l.h).filter(h => h > 0)) || 10;
  const xCuerpo = moda(lineas.filter(l => Math.round(l.h) === hCuerpo).map(l => l.xs));

  /* ── ⚠ CADA LÍNEA, PARTIDA POR COLUMNAS ANTES DE MIRARLA ──
     En 2023 el membrete va en una columna estrecha a la izquierda y el título
     del concurso en el centro, y dos de sus renglones caen a la MISMA altura:
     «ECONÓMICOS» a la izquierda y «Concurso nacional de» en el centro. Pegados
     por altura forman «ECONÓMICOS Concurso nacional de» —dos mayúsculas, letra
     grande— y eso pasaba por nombre de persona: el documento salía con seis
     jurados y el primero era el membrete.
     Estar a la misma altura no es estar en la misma frase. Se parte por la x
     del margen del texto, y lo que se mire para decidir es solo la parte que
     está en la columna buena. */
  const rectas: Recta[] = lineas.map(l => {
    const dentro = l.items.filter(i => i.x >= xCuerpo - 20);
    const fuera = l.items.filter(i => i.x < xCuerpo - 20);
    return {
      ...l,
      xc: dentro.length ? dentro[0].x : l.xs,
      txtc: nfc(dentro.map(i => i.s).join(" ")),
      izq: nfc(fuera.map(i => i.s).join(" ")),
    };
  });

  /* Un nombre empieza EN el margen del texto. El título de 2023 está centrado
     —x 212 contra un margen de 165— y con esto se cae solo, sin tener que
     saber de qué habla. */
  const esNombre = (l: Recta) =>
    l.h > hCuerpo * 1.15 && Math.abs(l.xc - xCuerpo) <= 12 && pareceNombre(l.txtc);
  const iNombres = rectas.map((l, i) => (esNombre(l) ? i : -1)).filter(i => i >= 0);
  if (!iNombres.length) return [];

  const filas: FilaJurado[] = [];
  for (let k = 0; k < iNombres.length; k++) {
    const desde = iNombres[k];
    const hasta = k + 1 < iNombres.length ? iNombres[k + 1] : lineas.length;
    const bloque = rectas.slice(desde, hasta);
    const avisos: string[] = [];

    /* ── ⚠ LA COLUMNA DE LA IZQUIERDA NO ES BIOGRAFÍA ──
       En 2022 el país va en una columna suya, a la izquierda del texto, y sus
       trozos caen POR ALTURA en medio de un párrafo. Pegados sin mirar la x,
       la sumilla salía «Docente de la Escuela de Cine de Ecuador la Universidad
       de las Artes» — una frase perfectamente legible que el documento no dice.
       Ese es el fallo que hay que evitar aquí: no el que se ve, el que se lee
       bien y es falso. Se separa por posición: lo que está claramente a la
       izquierda del margen del texto es otra cosa. */
    const izquierda: string[] = [];
    const cuerpo: string[] = [];
    for (let i = 1; i < bloque.length; i++) {
      const l = bloque[i];
      if (l.izq) izquierda.push(l.izq);
      if (l.txtc) cuerpo.push(l.txtc);
    }

    /* La especialidad es la primera línea del cuerpo, y solo si es corta: si
       ese renglón ya es prosa, esta persona vino sin especialidad y meterle la
       primera frase de su biografía como «rol» sería inventarse su oficio. */
    let rol: string | null = null;
    if (cuerpo.length && cuerpo[0].length <= 70) rol = cuerpo.shift()!;
    else if (cuerpo.length) avisos.push("sin especialidad en el documento");

    /* ── EL PAÍS, SOLO SI ESTÁ ESCRITO ──
       Dos formas, las dos vistas en documentos reales: una columna aparte
       (2022) o entre paréntesis detrás de la especialidad (2023). Si no hay
       ninguna, queda vacío — no se deduce de la biografía. */
    let pais: string | null = izquierda.length ? nfc(izquierda.join(" ")) : null;
    if (rol) {
      const m = /^(.*?)\s*\(([^()]{3,30})\)\s*$/.exec(rol);
      if (m) { rol = nfc(m[1]) || null; pais = pais || nfc(m[2]); }
    }
    if (pais && pais.length > 40) {
      /* Una columna izquierda larga no es un país: es otra cosa que se coló, y
         guardarla como país ensuciaría el cruce entre ediciones. */
      avisos.push(`a la izquierda ponía «${pais.slice(0, 40)}…», no parece un país`);
      pais = null;
    }

    const sumilla = cuerpo.join(" ").trim() || null;
    if (!sumilla) avisos.push("sin biografía");

    filas.push({
      nombre: nfc(bloque[0].txtc),
      rol, pais, sumilla, avisos,
      crudo: bloque.map(l => l.txt).join("\n"),
    });
  }
  return filas;
}

/* ══════════════════════════════════════════════════════════════════════════
   EL MISMO JURADO DE UN AÑO A OTRO

   Igual que con los rivales, el valor aparece al cruzar ediciones, y por eso
   la pregunta «¿es la misma persona?» se contesta en un solo sitio.

   ⚠ Aquí NO hay RUC ni nada que identifique sin dudas: solo un nombre escrito
   por una persona distinta cada año. Así que se es conservador a propósito —
   se comparan los nombres normalizados enteros, sin tildes ni mayúsculas, y no
   se intenta casar «Ana Endara» con «Ana Milisa Endara Mislov». Juntar a dos
   personas distintas no se ve: sale una línea diciendo «juzgó cuatro veces» y
   nadie sospecha de un número. Dejar dos filas sin juntar se ve enseguida.
   ══════════════════════════════════════════════════════════════════════════ */

export const nrmNombre = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();

export type FilaJur = {
  id: string;
  convocatoria_id: string;
  nombre: string;
  rol: string | null;
  pais: string | null;
  sumilla: string | null;
  avisos: string[] | null;
  crudo: string | null;
  fuente: string | null;
};

export type ConvJur = { id: string; codigo: string | null; nombre: string; anio: number | null };

/** Una mesa anterior en la que estuvo esta misma persona. */
export type PasoJurado = {
  id: string;
  convocatoriaId: string;
  anio: number | null;
  codigo: string | null;
  concurso: string | null;
  rol: string | null;
};

export type HistJurado = {
  /** Convocatorias distintas en las que ha juzgado, esta incluida. */
  veces: number;
  /** Las OTRAS, de lo más reciente a lo más antiguo. */
  otras: PasoJurado[];
};

/**
 * Qué ha juzgado antes cada miembro de esta mesa, por id de fila.
 *
 * ⚠ Devuelve entrada para TODOS, también para quien solo aparece una vez: un
 * hueco debajo de un nombre se lee como «es nuevo» sin que nadie lo haya
 * escrito, y con nueve ediciones cargadas de veinte lo cierto es «no lo hemos
 * visto en lo que tenemos». La misma lección que costó la pestaña 🏁.
 */
export function historialDeJurado(
  filas: Pick<FilaJur, "id" | "convocatoria_id" | "nombre" | "rol">[],
  convs: Map<string, ConvJur>,
  convocatoriaId: string,
): Record<string, HistJurado> {
  const porNombre = new Map<string, typeof filas>();
  for (const f of filas) {
    const k = nrmNombre(f.nombre);
    if (!k) continue;
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k)!.push(f);
  }
  const out: Record<string, HistJurado> = {};
  porNombre.forEach(grupo => {
    const convsDistintas = new Set(grupo.map(f => f.convocatoria_id));
    const otras = grupo
      .filter(f => f.convocatoria_id !== convocatoriaId)
      /* Una convocatoria, una línea: si alguien apareciera dos veces en la
         misma mesa —no debería, el índice único lo impide— no se cuenta dos. */
      .filter((f, i, arr) => arr.findIndex(o => o.convocatoria_id === f.convocatoria_id) === i)
      .map(f => {
        const c = convs.get(f.convocatoria_id);
        return {
          id: f.id, convocatoriaId: f.convocatoria_id,
          anio: c?.anio ?? null, codigo: c?.codigo ?? null,
          concurso: c?.nombre ?? null, rol: f.rol ?? null,
        };
      })
      .sort((a, b) => (b.anio || 0) - (a.anio || 0));
    for (const f of grupo) {
      if (f.convocatoria_id !== convocatoriaId) continue;
      out[f.id] = { veces: convsDistintas.size, otras };
    }
  });
  return out;
}
