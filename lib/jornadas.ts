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
/* ── LOS CUATRO NOMBRES, CON LA MISMA FORMA Y LA UNIDAD CORRECTA ──
 *
 * Eran «½ Medio», «1 Completo», «1½ Día y medio» y «2 Doble»: cuatro maneras
 * distintas de decir lo mismo —una con adjetivo, otra con la palabra entera,
 * otra con un sustantivo— y de largos tan dispares que los botones se partían
 * en dos líneas al añadirles el círculo.
 *
 * Y la unidad no es el DÍA, es la JORNADA. No es lo mismo: dos jornadas caben
 * en un día largo de rodaje, y media jornada no es medio día de calendario.
 * Lo que se registra —y lo que se paga— son jornadas.
 *
 * Se escribe entera en la unidad —«1 jornada»— y abreviada en las otras tres.
 * No es una excepción caprichosa: el 1 es el caso de referencia, el que define
 * qué es una unidad aquí, y verlo escrito una vez en la fila enseña a leer las
 * otras tres. En las demás la palabra completa solo repite lo que el número ya
 * dijo.
 *
 * `ayuda` guarda lo que el rótulo corto ya no dice: va al `title`, donde no
 * estorba a nadie. */
export const FRACCIONES: { v: number; ico: string; corto: string; largo: string; ayuda: string; tono: string }[] = [
  { v: 0.5, ico: "◑", corto: "½",  largo: "½ j",       ayuda: "Media jornada",    tono: "medio" },
  { v: 1,   ico: "●", corto: "1",  largo: "1 jornada", ayuda: "Jornada completa", tono: "uno" },
  { v: 1.5, ico: "◕", corto: "1½", largo: "1½ j",      ayuda: "Jornada y media",  tono: "medio-mas" },
  { v: 2,   ico: "⬤", corto: "2",  largo: "2 j",       ayuda: "Jornada doble",    tono: "doble" },
];
/** La fracción tal como se lee en una fila: «1½ día y medio». */
export const metaFraccion = (n?: number | null) =>
  FRACCIONES.find(f => f.v === Number(n))
  /* Sin ícono para lo que no está en la lista, y a propósito: un valor que
     nadie eligió no debe parecerse a los cuatro que sí. El «?» lo delata. */
  || { v: Number(n) || 0, ico: "", corto: String(n ?? "?"), largo: `${n}`,
       ayuda: `Valor fuera de las cuatro duraciones: ${n}`, tono: "uno" };

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

/* ── LOS TRES TIPOS DE JORNADA, EN UN SOLO SITIO ──
 *
 * Estaban escritos CUATRO veces: aquí solo los emojis, y una lista propia en
 * la bitácora (solo íconos), otra en el formulario (ícono + palabra) y otra en
 * /jornadas para el gráfico. Cuatro copias de tres cosas — y ya divergían: en
 * unas salía «🎬» a secas y en otras «🎬 Rodaje».
 *
 * Uno solo, con el ícono y la palabra separados: cada pantalla decide si le
 * caben las dos, pero ninguna se inventa un cuarto nombre. */
export const TIPOS_JORNADA: { v: string; ico: string; txt: string }[] = [
  { v: "rodaje",   ico: "🎬", txt: "Rodaje" },
  { v: "oficina",  ico: "🏢", txt: "Oficina" },
  { v: "scouting", ico: "🚙", txt: "Scouting" },
];

/* Un tipo desconocido no se disfraza de los tres válidos: se pinta con un
   punto y con su propio texto, para que se vea que hay algo que nadie eligió. */
export const metaTipo = (t?: string | null) =>
  TIPOS_JORNADA.find(x => x.v === t) || { v: String(t || ""), ico: "•", txt: String(t || "—") };

/** Solo el ícono, para donde no cabe la palabra. */
export const ICO_TIPO: Record<string, string> =
  Object.fromEntries(TIPOS_JORNADA.map(t => [t.v, t.ico]));

/* ══════════════════════════════════════════════════════════════════════════
   CUÁNTO SE PAGA POR UNA JORNADA

   La regla estaba escrita TRES veces: al registrar, al editar y en el
   formulario que enseña «Esta jornada: S/ 160». Las tres decían lo mismo hoy,
   pero eran tres sitios donde cambiar una decisión sobre dinero — y la
   pantalla, además, calculaba en el navegador un número que el servidor
   volvería a calcular por su cuenta. Dos cálculos del mismo importe es un
   importe que puede discrepar.

   Las tres reglas, juntas y explicadas:

     · Solo el RODAJE usa la tarifa de rodaje. Oficina y scouting pagan con la
       de día — un día de scouting no es un día de rodaje aunque se salga a la
       misma hora.
     · La FRACCIÓN solo aplica a oficina. Un rodaje o un scouting es un día
       entero: no se vuelve de la puna a media jornada.
     · El PERNOCTE se suma aparte y no multiplica. No es más tiempo —el rodaje
       sigue siendo un día— es que además se durmió fuera. Y no existe en
       oficina.

   Sin tarifa cargada devuelve `null`, no cero: «no sabemos cuánto» y «no se
   paga nada» son cosas distintas, y un cero se cobra.
   ══════════════════════════════════════════════════════════════════════════ */
export type Tarifas = {
  tarifa_dia?: number | null;
  tarifa_rodaje?: number | null;
  tarifa_noche?: number | null;
};

export function montoJornada(
  tipo: string, fraccion: number, noche: boolean, t?: Tarifas | null,
): number | null {
  if (!t) return null;
  const frac = tipo === "oficina" ? (fraccionValida(fraccion) ? fraccion : 1) : 1;
  const nocheOk = tipo !== "oficina" && !!noche;
  const base = tipo === "rodaje" ? (t.tarifa_rodaje ?? t.tarifa_dia) : t.tarifa_dia;
  const extra = nocheOk ? Number(t.tarifa_noche ?? t.tarifa_rodaje ?? t.tarifa_dia ?? 0) : 0;
  const dia = base != null ? Number(base) * frac : null;
  if (dia != null) return dia + extra;
  return nocheOk && extra ? extra : null;
}
