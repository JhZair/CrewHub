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
export const FRACCIONES: { v: number; corto: string; largo: string }[] = [
  { v: 0.5, corto: "½", largo: "½ Medio" },
  { v: 1, corto: "1", largo: "1 Completo" },
  { v: 1.5, corto: "1½", largo: "1½ Día y medio" },
  { v: 2, corto: "2", largo: "2 Doble" },
];

/** ¿Es una fracción que ofrecemos? Para no guardar valores que nadie eligió. */
export const fraccionValida = (n: number) => FRACCIONES.some(f => f.v === Number(n));
