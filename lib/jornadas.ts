/* ── La escalera de fracciones de una jornada ──
 *
 * Estaba escrita dos veces —en el formulario de registro y en la edición de la
 * bitácora— y ya había divergido en las etiquetas: una decía «1½» y la otra
 * «1½ Día y medio». Dos listas de opciones que tienen que coincidir y no
 * comparten fuente terminan ofreciendo cosas distintas según dónde entres.
 *
 * `2` («doble») entra hoy: una jornada de oficina puede valer dos. La base no
 * restringe el valor (`fraccion numeric not null default 1`, sin check), así
 * que ampliarla no necesita migración — pero SÍ significa que nada impide
 * guardar un 7 desde otro sitio: la única barrera es esta lista.
 *
 * Las fracciones solo aplican a OFICINA. Rodaje y scouting son día completo:
 * `registrarJornada` fuerza 1 y esa regla vive en el servidor, no aquí.
 */
/* Los CUATRO tiempos. `tono` es el color con que se distinguen en un listado:
   escritos todos igual —«1j», «1.5j»— hay que leer el número para ver que una
   fila no es como la de arriba, y en treinta filas eso no se hace. Medio día
   se apaga, el completo es lo normal, y los dos que pasan de un día suben de
   temperatura: son los que hay que mirar al aprobar. */
/* ── EL ÍCONO ES UN DÍA VISTO POR ENCIMA ──
 *
 * `1½` y `1` en el mismo gris obligan a LEER el número para ver que una fila
 * no es como la de arriba, y en treinta filas eso no se hace: se barre con la
 * vista y se da todo por igual.
 *
 * El círculo lleno ES un día completo, y la duración se lee por cuánto está
 * relleno — media luna, entero, entero y medio, dos. La forma sola ya ordena
 * de menor a mayor sin saber qué significa, y sigue ordenando en gris, sin
 * color y en una pantalla en blanco y negro. Con emojis se habría reconocido
 * más rápido y ordenado peor: cambian de dibujo según el sistema y no forman
 * una escala.
 *
 * Son caracteres de texto, no imágenes: pesan cero, heredan el color de la
 * etiqueta —que ya lleva el tono de cada duración— y se copian con el resto
 * de la fila. */
export const FRACCIONES: { v: number; ico: string; corto: string; largo: string; tono: string }[] = [
  { v: 0.5, ico: "◑", corto: "½",  largo: "½ Medio",         tono: "medio" },
  { v: 1,   ico: "●", corto: "1",  largo: "1 Completo",      tono: "uno" },
  { v: 1.5, ico: "◕", corto: "1½", largo: "1½ Día y medio",  tono: "medio-mas" },
  { v: 2,   ico: "⬤", corto: "2",  largo: "2 Doble",         tono: "doble" },
];
/** La fracción tal como se lee en una fila: «1½ día y medio». */
export const metaFraccion = (n?: number | null) =>
  FRACCIONES.find(f => f.v === Number(n))
  /* Sin ícono para lo que no está en la lista, y a propósito: un valor que
     nadie eligió no debe parecerse a los cuatro que sí. El «?» lo delata. */
  || { v: Number(n) || 0, ico: "", corto: String(n ?? "?"), largo: `${n}`, tono: "uno" };

/** ¿Es una fracción que ofrecemos? Para no guardar valores que nadie eligió. */
export const fraccionValida = (n: number) => FRACCIONES.some(f => f.v === Number(n));

/* «07-13» obliga a traducir mentalmente y no dice qué día de la semana fue —
   que es justo lo que se comprueba al aprobar o al liquidar: si ese sábado se
   trabajó de verdad. Vive aquí porque ya lo usan la bitácora y la liquidación. */
export const fechaHum = (f?: string | null) => {
  const s = String(f ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s + "T12:00:00");
  return d.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
};

/** Sábado o domingo: no está mal, pero es lo primero que se mira. */
export const esFinde = (f?: string | null) => {
  const s = String(f ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const n = new Date(s + "T12:00:00").getDay();
  return n === 0 || n === 6;
};

export const ICO_TIPO: Record<string, string> = { rodaje: "🎬", oficina: "🏢", scouting: "🚙" };
