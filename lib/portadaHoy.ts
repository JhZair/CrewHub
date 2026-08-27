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

/* ── ¿SOBRA ESTA ACTIVIDAD PORQUE SU CASO YA LA CUENTA? ──
 *
 * El bot materializa las actividades del cronograma en casos, copiándoles el
 * título y las dos fechas: en una lista salen dos renglones idénticos, con el
 * mismo texto y el mismo destino.
 *
 * La regla NO puede ser «tiene caso, se va»: un caso materializado sin
 * `fecha_inicio` ocupa solo el día de su plazo, mientras que la actividad dura
 * toda su ventana. Quitando la actividad por tener caso, los días intermedios
 * se quedan sin nada — que es justo la fila que faltaba en la portada.
 *
 * Sobra solo si el caso CUBRE la ventana entera de la actividad. Entonces son
 * la misma cosa dicha dos veces y gana el caso, que es donde se comenta, se
 * asigna y se cierra. Si el caso cubre menos, se quedan las dos: mejor una
 * repetición un día que un hueco toda la semana.
 *
 * Escrita aquí porque la portada y /agenda tienen que hacer lo mismo: si una
 * pantalla deduplica y la otra no, «los dos paneles no enseñan lo mismo»
 * vuelve a ser cierto por otro camino. */
export function elCasoLaCubre(caso: ConFechas, act: ConFechas): boolean {
  const ca = soloDia(caso.ini), cb = soloDia(caso.fin) || ca;
  const aa = soloDia(act.ini), ab = soloDia(act.fin) || aa;
  if (!ca || !aa) return false;
  const cIni = ca <= cb ? ca : cb, cFin = ca <= cb ? cb : ca;
  const aIni = aa <= ab ? aa : ab, aFin = aa <= ab ? ab : aa;
  return cIni <= aIni && cFin >= aFin;
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
/** Un día, N días más allá (o más acá, con N negativo). Mediodía al parsear,
 *  como en todo el proyecto: a medianoche un cambio de horario resta un día. */
export function diaMas(dia: string, n: number): string {
  const d = new Date(`${soloDia(dia)}T12:00:00`);
  if (isNaN(d.getTime())) return dia;
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ventana(dias = DIAS_RODAJE, hoy = hoyLima()) {
  return { desde: hoy, hasta: diaMas(hoy, dias) };
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

/* ── ¿HAY QUE DECIR EN QUÉ ESTADO ESTÁ? ──
 *
 * En una lista del día, lo normal es que lo que sale esté abierto o en marcha:
 * decirlo sería repetir en cada fila algo que ya se da por hecho, y una lista
 * donde todas las filas llevan la misma etiqueta es una lista con una columna
 * de ruido.
 *
 * Lo que hay que decir es lo que CONTRADICE esa expectativa: «Rodaje bloque
 * Zenón» aparece hoy en la agenda y está EN PAUSA — sin ese aviso, alguien se
 * organiza el día alrededor de algo que nadie va a hacer. Lo mismo con
 * seguimiento (se espera a un tercero) y con lo ya cerrado.
 *
 * ── EL ESTADO ES EL DEL CASO, VENGA LA FILA DE DONDE VENGA ──
 * Solo se lee el vocabulario de `publicaciones` —abierta, en progreso, en
 * pausa…—; el de `cronograma_actividades` es otro y no significa lo mismo.
 * Pero una actividad materializada TIENE caso, y su estado es el de ese caso:
 * «Rodaje de planos de apoyo» estaba en SEGUIMIENTO y salía sin chip porque la
 * fila era la actividad y se le miraba un estado que no tiene. Quien pinta le
 * pasa el estado del caso cuando lo hay, y cadena vacía cuando no. */
export const NORMALES_HOY = ["abierta", "en_progreso"];

/* ── CUÁNTOS VÍNCULOS SE ENSEÑAN ANTES DEL «+N» ──
 * Seis. Empezó en tres y se quedaba corto justo donde importa: una reunión con
 * cinco convocados salía como «Haywarikuy · KatyP · MichelM +2», y el «+2»
 * esconde a las dos personas que uno estaba buscando. Los chips se encogen
 * antes de desbordar, así que caben; a partir de seis sí empiezan a tapar el
 * título, que es lo que se lee primero. */
export const TOPE_GRUPOS = 6;

/* ── EL ORDEN DE LOS VÍNCULOS ──
 * Delante lo que SITÚA el trabajo, detrás lo demás: si hay que cortar por el
 * tope, se corta por donde menos duele.
 *
 * El fondo va primero y no el proyecto, aunque suene menos concreto: el
 * cronograma de un fondo en ejecución NO cuelga del proyecto —sus filas tienen
 * `proyecto_id` en null— sino de la postulación. Es el mismo criterio que
 * agrupa la agenda, y estaba escrito dos veces con dos órdenes distintos: la
 * portada ponía `persona` por delante de `postulacion`, así que la misma
 * reunión recortaba chips distintos en cada pantalla. */
export const ORDEN_VINCULO = ["postulacion", "proyecto", "convocatoria", "empresa"];
export const pesoVinculo = (tipoCanon: string) => {
  const i = ORDEN_VINCULO.indexOf(tipoCanon);
  return i < 0 ? 99 : i;
};
export const hayQueDecirEstado = (estado?: string | null) =>
  !!estado && !NORMALES_HOY.includes(estado);

/* Y además de decirlo, se pinta apagado: una fila en pausa sigue estando hoy
 * —hay que saber que existe— pero no se está haciendo, así que no puede pesar
 * lo mismo que lo que sí. */
export const APAGADOS_HOY = ["en_pausa", "seguimiento"];
export const apagadoHoy = (estado?: string | null) =>
  !!estado && APAGADOS_HOY.includes(estado);

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
