/* ── LO DE HOY Y LOS RODAJES QUE VIENEN ──
 *
 * Las dos listas que abren la portada. Se escriben aquí, sin Supabase, por lo
 * de siempre: la portada y /agenda pintan lo mismo y no pueden discrepar sobre
 * qué día es «hoy» ni sobre qué actividad sigue viva.
 *
 * Qué NO decide este archivo: de dónde salen las filas. Eso lo hace cada
 * pantalla con su consulta; aquí solo se separa el grano de la paja.
 */

import { hoyLima } from "@/lib/fechas";

/** Cuántos días de rodajes se miran hacia adelante. */
export const DIAS_RODAJE = 30;

/* ── EL NOMBRE DE LA ETIQUETA, NO SU uuid ──
 * `etiquetas` no tiene slug: solo `id` y `nombre` (único). Guardar aquí el
 * uuid ataría un archivo de código a una fila concreta de la base —y el día
 * que alguien borre la etiqueta y la vuelva a crear, el bloque se quedaría
 * vacío sin decir por qué—. Se busca por nombre, sin distinguir mayúsculas,
 * y la pantalla avisa si la etiqueta no existe. */
export const ETIQUETA_RODAJE = "Rodaje";

/* Una fila cualquiera con ventana de fechas. Los dos mundos de la agenda —el
   caso, que tiene `fecha_limite`, y la actividad de cronograma, que tiene
   `fecha_inicio` y `fecha_fin`— se normalizan a esto antes de llegar. */
export type ConFechas = {
  /** Primer día. Para un caso es su fecha límite. */
  ini?: string | null;
  /** Último día. Igual que `ini` cuando dura un solo día. */
  fin?: string | null;
};

/* El día de una fecha, sin la hora. Un `timestamptz` cortado a diez caracteres
   da el día en UTC, que a partir de las siete de la tarde en Perú ya es el
   siguiente; pero estas columnas son `date`, así que basta con recortar. Se
   hace en un solo sitio para no repetir el `slice(0,10)` en cada comparación,
   que es donde se cuelan los errores de un día. */
export const soloDia = (f?: string | null) => String(f || "").slice(0, 10);

/* ── ¿ESTO CAE HOY? ──
 * Una fila cae hoy si hoy está DENTRO de su ventana, no solo si empieza hoy.
 * Un rodaje de tres días sigue siendo «lo de hoy» el segundo día — y esa es la
 * fila que más falta hace ver, porque es la que está ocurriendo. */
export function caeEnElDia(it: ConFechas, dia: string): boolean {
  const a = soloDia(it.ini);
  if (!a) return false;
  const b = soloDia(it.fin) || a;
  /* Si alguien invirtió las fechas —fin antes que inicio—, se compara contra
     las dos: una ventana al revés es un error de datos, y esconder la fila por
     eso sería castigar al que la mira en vez de al que la escribió. */
  const desde = a <= b ? a : b, hasta = a <= b ? b : a;
  return dia >= desde && dia <= hasta;
}

/** Lo que cae hoy, en el orden en que venga. */
export function loDeHoy<T extends ConFechas>(items: T[], hoy = hoyLima()): T[] {
  return items.filter(it => caeEnElDia(it, hoy));
}

/* ── LA VENTANA DE RODAJES ──
 *
 * De hoy en adelante, `dias` días. Lo de ayer no se prepara, y un bloque que
 * se llena de rodajes pasados deja de contestar la pregunta que se le hace:
 * qué se rueda este mes.
 *
 * Un rodaje que EMPEZÓ antes y sigue corriendo sí entra: se compara la ventana
 * entera contra el tramo, no solo su primer día. Si no, la película que lleva
 * rodando desde el lunes desaparecería de la portada justo la semana en que
 * más importa.
 */
export function ventana(dias = DIAS_RODAJE, hoy = hoyLima()) {
  const d = new Date(`${hoy}T12:00:00`);
  d.setDate(d.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return { desde: hoy, hasta: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` };
}

export function enLosProximos<T extends ConFechas>(
  items: T[], dias = DIAS_RODAJE, hoy = hoyLima(),
): T[] {
  const { desde, hasta } = ventana(dias, hoy);
  return items
    .filter(it => {
      const a = soloDia(it.ini);
      if (!a) return false;
      const b = soloDia(it.fin) || a;
      const ini = a <= b ? a : b, fin = a <= b ? b : a;
      /* Se solapan si empieza antes de que acabe la ventana y acaba después de
         que empiece. Es la comprobación de dos tramos que se cruzan, no la de
         «su primer día cae dentro» — con esa, un rodaje de dos semanas que
         arrancó ayer quedaba fuera. */
      return ini <= hasta && fin >= desde;
    })
    /* Por fecha de inicio: lo primero que se rueda, primero. Y con el título de
       desempate para que dos rodajes del mismo día no bailen entre recargas. */
    .sort((x, y) => {
      const c = soloDia(x.ini).localeCompare(soloDia(y.ini));
      return c || String((x as any).titulo || "").localeCompare(String((y as any).titulo || ""));
    });
}

/* ── CUÁNDO ES ──
 * «hoy», «mañana», «en 3 días». Lo que se necesita leer de un rodaje próximo
 * es la distancia, no la fecha: «14 sept.» obliga a contar con los dedos.
 * La fecha exacta va al lado, porque para reservar equipo hace falta el día. */
export function cuandoCae(dia: string, hoy = hoyLima()): string {
  const d = Math.round(
    (Date.parse(soloDia(dia) + "T12:00:00Z") - Date.parse(hoy + "T12:00:00Z")) / 86400000);
  if (isNaN(d)) return "";
  if (d < 0) return "ya empezó";
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d < 7) return `en ${d} días`;
  if (d < 14) return "la próxima semana";
  return `en ${Math.round(d / 7)} semanas`;
}
