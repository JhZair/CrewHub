/* ══════════════════════════════════════════════════════════════════════════
   CANDIDATO, CONFIRMADO, DESCARTADO — la regla, en un solo sitio

   Un documental de personajes reales no se escribe: se busca. Antes de que
   Braulia sea la protagonista hubo una lista de mujeres de las que alguien oyó
   hablar, a las que hubo que ir a ver, y de las que la mayoría no entró.

   Esa exploración pasa en DOS sitios del sistema:
     · el reparto de un FONDO      (`postulacion_reparto`)
     · el reparto de un PROYECTO   (`proyecto_actores`)

   Y no es la misma lista a propósito —el fondo tiene que poder contestar quién
   estaba en el expediente que ganó, y eso el proyecto no lo sabe— pero SÍ es la
   misma pregunta. Con la regla copiada en los dos, el día que cambie se cambia
   en uno; y el que se olvide será el que alguien mire.

   Hay además proyectos que nunca van a tener fondo —los de encargo y los
   autofinanciados, como Khipukamaq—: ahí esta lista no es el borrador de nada,
   es la única que existe.

   ⚠ NO IMPORTA NADA DE SUPABASE.
   ══════════════════════════════════════════════════════════════════════════ */

export type Situacion = "explorando" | "confirmada" | "descartada";

/** Lo mínimo para repartir. Cada tabla tiene sus columnas propias —el fondo
 *  lleva cesiones, el proyecto lleva la ficha del personaje— y aquí solo entra
 *  lo que la regla necesita mirar. */
export type ConSituacion = { situacion?: string | null };

const limpia = (v?: string | null) => String(v || "").trim().toLowerCase();

/** La situación, normalizada.
 *
 *  ⚠ CUALQUIER COSA QUE NO SEAN LOS TRES VALORES CUENTA COMO CONFIRMADA.
 *  Las filas que se cargaron antes de que existiera la columna son gente que YA
 *  está dentro; tratarlas como candidatas vaciaría el reparto de golpe. El
 *  default de la base dice lo mismo, y esto lo repite en el cliente para que un
 *  dato viejo o un valor raro no cambie lo que se ve. */
export function situacionDe(f: ConSituacion): Situacion {
  const s = limpia(f.situacion);
  return s === "explorando" || s === "descartada" ? s : "confirmada";
}

export const ROTULO_SITUACION: Record<Situacion, string> = {
  explorando: "en exploración",
  confirmada: "confirmada",
  descartada: "descartada",
};

/** El mismo rótulo en masculino, para las listas donde se habla de personajes
 *  y no de personas. No se resuelve con un `.replace("a","o")` porque «en
 *  exploración» no cambia y «confirmada» sí: dos palabras, dos reglas. */
export const ROTULO_SITUACION_M: Record<Situacion, string> = {
  explorando: "en exploración",
  confirmada: "confirmado",
  descartada: "descartado",
};

/** Las tres zonas, en una sola pasada. La pantalla, el contador de la cabecera
 *  y el resumen del plegable tienen que estar contando exactamente lo mismo, y
 *  con tres `filter` sueltos por ahí acaban discrepando. */
export type TresZonas<T> = {
  /** Quienes ya están dentro. */
  dentro: T[];
  /** A quienes se está yendo a ver. */
  explorando: T[];
  /** Quienes no entraron. No se borran: saber a quién descartaste —y por qué,
   *  en la nota— evita volver a proponer a la misma persona en seis meses. */
  descartadas: T[];
  /** Cuántas hay DENTRO. No incluye candidatas ni descartadas: si el titular
   *  dijera «12 personas» contando a nueve que aún no se sabe si estarán, el
   *  número más visible de la pantalla sería el más falso. */
  confirmadas: number;
};

export function repartirPorSituacion<T extends ConSituacion>(filas: T[]): TresZonas<T> {
  const dentro: T[] = [], explorando: T[] = [], descartadas: T[] = [];
  for (const f of filas) {
    const s = situacionDe(f);
    (s === "explorando" ? explorando : s === "descartada" ? descartadas : dentro).push(f);
  }
  return { dentro, explorando, descartadas, confirmadas: dentro.length };
}

/** Las situaciones válidas, para que las acciones no tengan que repetir la
 *  lista. Es el mismo vocabulario que el `check` de las dos tablas: escribir
 *  aquí una cuarta palabra la rechazaría Postgres, que es lo correcto. */
export const SITUACIONES: Situacion[] = ["explorando", "confirmada", "descartada"];

export const esSituacion = (v: any): v is Situacion =>
  SITUACIONES.includes(String(v || "") as Situacion);
