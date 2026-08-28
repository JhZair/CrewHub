/* ══════════════════════════════════════════════════════════════════════════
   LA REJILLA DEL TRATAMIENTO — columnas, bandas y regla

   La vista principal de un tratamiento, según la referencia que compartió el
   equipo: cada COLUMNA es una secuencia, cada FILA una capa de información
   sobre las mismas columnas, y abajo una REGLA numerada con el metraje.

   ── NO ES PROPORCIONAL, Y ESO ES LO BUENO ──
   Las columnas son de ancho FIJO. Con columnas proporcionales al metraje, una
   secuencia de veinte segundos son doce píxeles y no cabe ni su número; y como
   habría que ponerle un ancho mínimo, la banda dejaría de ser proporcional de
   todas formas —pero sin decirlo, así que el ojo mediría mal—.
   La duración vive en la regla de abajo, donde sí se puede leer.

   ── LO QUE ESTE ARCHIVO CALCULA ──
   Todo lo que la rejilla necesita saber ANTES de pintar nada: en qué columna
   empieza y acaba cada acto, cuánto metraje lleva acumulado cada una, dónde
   caen las marcas de la regla y qué hilos toca cada secuencia.
   Vive aparte porque son cuentas, no dibujo: se pueden probar sin navegador, y
   la pantalla queda con una sola responsabilidad.

   ⚠ NO IMPORTA NADA DE SUPABASE.
   ══════════════════════════════════════════════════════════════════════════ */

import { minutosDe } from "@/lib/guion";

export type SecCol = {
  id: string;
  nombre: string;
  texto?: string | null;
  minutos?: number | null;
  acto_id?: string | null;
  hilos?: string[];
};

export type ActoMin = { id: string; clave?: string | null; nombre: string; orden?: number | null };

/** Una columna de la rejilla: la secuencia, su número visible y dónde cae en
 *  el metraje. `desde`/`hasta` son minutos acumulados —el principio y el final
 *  de esa secuencia dentro de la película—, que es lo que permite dibujar la
 *  regla de abajo alineada con las columnas. */
export type Columna = {
  sec: SecCol;
  /** 1, 2, 3… tal como se numera en la referencia. */
  n: number;
  min: number;
  /** `true` si los minutos son estimados a 190 palabras/minuto y no puestos a
   *  mano. La rejilla lo dice: un número que parece un dato y es una cuenta
   *  nuestra acaba usándose para decidir. */
  estimado: boolean;
  desde: number;
  hasta: number;
};

/** Una banda de acto sobre la rejilla: de qué columna a qué columna llega.
 *  ⚠ `desdeCol`/`hastaCol` son ÍNDICES de columna, no de acto: la banda se
 *  dibuja con `grid-column`, y un acto cuyas secuencias estén salteadas
 *  ocuparía un tramo que incluye columnas de otro. Por eso el reparto se hace
 *  sobre el orden REAL de las columnas y no sobre el `orden` del acto. */
export type Banda = {
  acto: ActoMin;
  desdeCol: number;
  hastaCol: number;
  cols: number;
  min: number;
};

/* ── LAS COLUMNAS ──
 * En el orden en que se leen: primero las secuencias SIN acto —quedan arriba,
 * a la vista, hasta que alguien las recoloque; esconderlas sería perderlas— y
 * luego cada acto con las suyas. Es el mismo orden que ya usa la lista
 * vertical, para que conmutar de vista no reordene la película. */
export function columnas(secs: SecCol[], actos: ActoMin[]): Columna[] {
  const porActo = (id: string | null) =>
    secs.filter(s => (s.acto_id || null) === id);

  const enOrden: SecCol[] = [
    ...porActo(null),
    ...actos.flatMap(a => porActo(a.id)),
  ];
  /* Cualquiera que se haya quedado fuera —un `acto_id` que apunta a un acto
     que ya no está— se añade al final en vez de desaparecer. Una secuencia
     escrita no puede evaporarse porque su acto se borró. */
  const vistos = new Set(enOrden.map(s => s.id));
  for (const s of secs) if (!vistos.has(s.id)) enOrden.push(s);

  let acumulado = 0;
  return enOrden.map((sec, i) => {
    const { min, estimado } = minutosDe(sec);
    const desde = acumulado;
    acumulado += min;
    return { sec, n: i + 1, min, estimado, desde, hasta: acumulado };
  });
}

/** Las bandas de acto, en índices de columna. Un acto sin secuencias NO
 *  produce banda: una banda de ancho cero no se ve y ensucia la rejilla. Que
 *  ese acto existe se dice en otra parte —el diagnóstico—, no con un hueco. */
export function bandas(cols: Columna[], actos: ActoMin[]): Banda[] {
  const out: Banda[] = [];
  for (const a of actos) {
    const idx = cols.map((c, i) => ({ c, i })).filter(x => x.c.sec.acto_id === a.id);
    if (!idx.length) continue;
    const desdeCol = idx[0].i;
    const hastaCol = idx[idx.length - 1].i;
    out.push({
      acto: a, desdeCol, hastaCol,
      cols: hastaCol - desdeCol + 1,
      min: idx.reduce((n, x) => n + x.c.min, 0),
    });
  }
  return out;
}

/** Cuántas columnas no caen bajo ninguna banda. Se devuelve aparte para poder
 *  rotularlas: en la referencia el acto es una banda con nombre, y un tramo sin
 *  rótulo se lee como que falta un dato de la pantalla. Aquí falta de verdad.
 *  ⚠ Cuenta las que no tienen acto Y las HUÉRFANAS —`acto_id` apuntando a un
 *  acto borrado—. Mirando solo `!acto_id`, la huérfana salía como una columna
 *  muda: sin banda encima, sin mención arriba y sin forma de descubrirla más
 *  que tropezándose con ella. */
export const cuantasSinActo = (cols: Columna[], actos: ActoMin[] = []) => {
  const vivos = new Set(actos.map(a => a.id));
  return cols.filter(c => !c.sec.acto_id || !vivos.has(c.sec.acto_id)).length;
};

/* ══════════════ LA REGLA ══════════════
 *
 * La franja numerada de abajo: 1, 5, 10… hasta el total. En la referencia son
 * páginas de guion; aquí son MINUTOS, que es lo que el modelo sabe calcular —y
 * la regla del oficio los hace equivalentes: una página, un minuto—.
 *
 * ⚠ La regla NO se dibuja proporcional a las columnas, porque las columnas no
 * son proporcionales. Lo que se hace es lo contrario: cada columna dice en qué
 * minuto empieza y acaba (`desde`/`hasta`), y la regla pone su marca DEBAJO DE
 * LA COLUMNA en la que ese minuto cae. Así el número y la secuencia coinciden
 * siempre, aunque los anchos no digan nada del tiempo.
 */
export type Marca = { min: number; col: number };

export function marcas(cols: Columna[], cada = 5): Marca[] {
  if (!cols.length) return [];
  const total = cols[cols.length - 1].hasta;
  if (total <= 0) return [];

  const crudas: Marca[] = [];
  /* Empieza en 0 y no en `cada`: el principio de la película es una marca, y
     sin ella la regla arranca en el minuto 5 como si los cinco primeros no
     existieran. */
  for (let m = 0; m <= total; m += cada) {
    /* La primera columna que TERMINA después de ese minuto es la que lo
       contiene. `>=` y no `>`: el minuto 0 cae en la primera columna, no
       fuera de la rejilla. */
    const i = cols.findIndex(c => c.hasta >= m);
    crudas.push({ min: m, col: i < 0 ? cols.length - 1 : i });
  }
  /* ── EL FINAL SIEMPRE SE ROTULA ──
     El bucle solo emite múltiplos de `cada`, así que una película de 32,5
     minutos terminaba marcada en el 30 y el 32,5 no aparecía en ninguna parte.
     La regla existe para leer la duración: callar el total es callar justo lo
     que se venía a mirar. Se redondea a un decimal para no escribir «32.4999». */
  const fin = Math.round(total * 10) / 10;
  if (crudas[crudas.length - 1]?.min !== fin) crudas.push({ min: fin, col: cols.length - 1 });

  /* ── UNA MARCA POR COLUMNA ──
     ⚠ Con una secuencia larga —treinta minutos— caían dentro seis marcas
     (5, 10, 15, 20, 25, 30) en una celda de 210 px, y desbordaban la columna
     sin que nada lo impidiera. Se queda la PRIMERA de cada columna, que es la
     que dice dónde empieza ese tramo; el resto se pierde y no pasa nada,
     porque la duración exacta de la columna ya está en su tooltip.
     El final es la excepción: si cae en una columna que ya tiene marca, se
     queda igualmente — es el dato que no se puede callar. */
  const out: Marca[] = [];
  const usadas = new Set<number>();
  for (const m of crudas) {
    const esFin = m.min === fin;
    if (usadas.has(m.col) && !esFin) continue;
    usadas.add(m.col);
    out.push(m);
  }
  return out;
}

/** El ancho de columna, en un solo sitio porque lo usan la rejilla, la regla y
 *  las bandas. Si los tres lo escribieran por su cuenta, cambiarlo en uno
 *  desalinearía los otros dos sin dar error. */
export const ANCHO_COL = 210;
/** El de la primera columna, la de los rótulos de fila. Va fija (`sticky`) al
 *  desplazar en horizontal: sin ella, a la tercera pantalla de scroll nadie
 *  sabe si está leyendo el cuerpo o el resumen. */
export const ANCHO_ROTULO = 96;
/* ⚠ Este número está TAMBIÉN en `.rej-rot` de app/globals.css. No se puede leer
   una constante de TypeScript desde una hoja de estilos, así que la columna fija
   lleva su ancho en línea desde aquí y la regla CSS solo pone el mínimo. Si
   algún día no cuadran, la rejilla se desalinea de su propia cabecera. */

/* ══════════════ LOS HILOS ══════════════
 *
 * En la referencia son bandas horizontales continuas que se ensanchan donde
 * hay contenido. Aquí, de momento, cada hilo es una fila y cada celda se
 * enciende con su color si esa secuencia lo declara.
 *
 * ⚠ Es lo DECLARADO, no lo medido. `guion_secuencia_hilos` guarda qué hilos
 * dice el autor que toca cada secuencia; cuando lleguen las escenas se podrá
 * contrastar con lo que la película hace de verdad. Son dos cosas distintas y
 * el comentario de db/guion.sql ya lo advierte: no es una fuente duplicada, es
 * el contraste «propuesto vs medido» — y solo existe si no se mezclan.
 */
export type FilaHilo = {
  hilo: { id: string; nombre: string; color: string };
  /** Por índice de columna: si esa secuencia declara el hilo. */
  en: boolean[];
  /** En cuántas secuencias aparece. Un hilo declarado en NINGUNA es un hilo
   *  que existe en la cabeza de quien lo creó y en ninguna parte más, y eso
   *  hay que poder verlo sin contar celdas. */
  cuantas: number;
};

export function filasDeHilos(
  cols: Columna[],
  hilos: { id: string; nombre: string; color: string }[],
): FilaHilo[] {
  return hilos.map(h => {
    const en = cols.map(c => (c.sec.hilos || []).includes(h.id));
    return { hilo: h, en, cuantas: en.filter(Boolean).length };
  });
}

/* ══════════════ LOS BEATS SOBRE LA REJILLA ══════════════
 *
 * En la referencia, las marcas del modelo estructural se pintan sobre la banda
 * de estructura, en la columna de la secuencia que las carga: «1: OPENING»,
 * «3: INCITING INCIDENT».
 *
 * ⚠ Un beat SIN secuencia asignada no se pinta en ninguna columna, y ese es el
 * dato más útil de todos mientras se escribe: significa que la historia
 * todavía no tiene dónde ocurre ese giro. Se devuelve aparte para poder
 * decirlo, en vez de que desaparezca de la pantalla.
 */
export type BeatCol = {
  beat: { id: string; nombre: string; tipo?: string | null; pos?: number | null };
  /** Índice de columna, o `null` si ninguna secuencia lo carga. */
  col: number | null;
};

export function beatsEnColumnas(
  cols: Columna[],
  beats: { id: string; nombre: string; tipo?: string | null; pos?: number | null; secuencia_id?: string | null }[],
): { colocados: BeatCol[]; sueltos: BeatCol[] } {
  const dondeEsta = new Map<string, number>();
  cols.forEach((c, i) => dondeEsta.set(c.sec.id, i));

  const colocados: BeatCol[] = [];
  const sueltos: BeatCol[] = [];
  for (const b of beats) {
    const i = b.secuencia_id ? dondeEsta.get(b.secuencia_id) : undefined;
    /* `?? null` y no `|| null`: la columna 0 es una columna válida, y con `||`
       el beat de la primera secuencia se habría contado como suelto. */
    const col = i ?? null;
    (col === null ? sueltos : colocados).push({ beat: b, col });
  }
  return { colocados, sueltos };
}
