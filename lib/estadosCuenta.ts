import { plazoRendicion } from "@/lib/fondos";
/* ── ¿CUÁNTOS ESTADOS DE CUENTA FALTAN? ──
 *
 * La cláusula 5.2.3 del acta pide «los estados mensuales de la cuenta
 * exclusiva, desde el depósito y/o transferencia bancaria hasta la ejecución
 * total del mismo». O sea: no es una carpeta que se llena cuando uno se
 * acuerda, es una serie SIN HUECOS que empieza el mes del desembolso.
 *
 * Y un hueco no se ve. Seis meses cargados, todos con su saldo correcto y su
 * cadena cuadrando, se leen como «esto está al día» aunque falten los dos
 * últimos — porque lo que falta no ocupa espacio en la pantalla. Por eso el
 * conteo se calcula contra el calendario y no contra lo que hay.
 *
 * ── POR QUÉ EL MES EN CURSO NO CUENTA ──
 * El banco emite el estado al CERRAR el mes. Exigir el mes corriente haría
 * que la ficha estuviera en rojo todos los días de todos los meses, y una
 * alarma que siempre está encendida es una alarma que nadie mira. El tope es
 * el último mes cerrado.
 *
 * ── HUECO NO ES LO MISMO QUE COLA ──
 * Que falte julio cuando el último cargado es junio significa «todavía no lo
 * han subido». Que falte marzo cuando hay hasta junio significa que se saltó
 * uno, y eso es un problema distinto: alguien dio por completa una serie que
 * no lo estaba. Se cuentan aparte.
 */

/** El mes de una fecha ISO: '2026-01-05' → '2026-01'. */
export const mesDe = (iso?: string | null): string | null => {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[1]}-${m[2]}` : null;
};

/** Suma meses a un 'YYYY-MM'. */
export const masMes = (ym: string, n: number): string => {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun",
                   "jul", "ago", "set", "oct", "nov", "dic"];
/** '2026-07' → 'jul. 2026' */
export const nombreMes = (ym: string): string => {
  const [y, m] = ym.split("-");
  return `${MES_CORTO[Number(m) - 1]}. ${y}`;
};

/** Cuándo deja de correr la serie. Los tres son fechas ISO o nulo. */
export type CierreSerie = {
  /** Cuándo se entregó la rendición de verdad. */
  rendicionReal?: string | null;
  /** Hasta cuándo dura la ejecución: el plazo de rendición, con su prórroga si
   *  la hay (lib/fondos → `plazoRendicion`). */
  plazo?: string | null;
};

/** Los meses que el acta exige: del desembolso al final de la EJECUCIÓN, sin
 *  pasar del último mes cerrado. */
export function mesesEsperados(
  desembolso?: string | null,
  hoy?: string | null,
  cierre?: CierreSerie,
): string[] {
  const ini = mesDe(desembolso);
  const hoyMes = mesDe(hoy);
  /* Sin fecha de desembolso no hay serie que exigir: no se sabe cuándo
     empieza. La ficha ya avisa por su lado de que falta ese dato. */
  if (!ini || !hoyMes) return [];
  let fin = masMes(hoyMes, -1);                 // el último mes CERRADO
  /* Rendido: la serie termina donde terminó la ejecución. Seguir pidiendo
     meses de un fondo cerrado es pedir papeles que ya no existen. */
  const rend = mesDe(cierre?.rendicionReal);
  if (rend && rend < fin) fin = rend;
  /* ── Y EL PLAZO TAMBIÉN CIERRA LA SERIE ──
     Esto faltaba, y era el fallo gordo: un fondo de UN AÑO que no rindió
     seguía acumulando meses para siempre, porque el único tope era «hoy».
     Chaccu —desembolso 09/2024, plazo 09/2025— pedía en agosto de 2026
     veintitrés meses de estados de cuenta y decía que faltaban nueve, todos
     posteriores al fin de la ejecución. Meses en los que ya no había fondo que
     ejecutar, así que no hay estado que pedir: la cláusula 5.2.3 pide la serie
     «hasta la ejecución total», no hasta hoy.
     Y el plazo lleva la prórroga incorporada (`plazoRendicion`): prorrogar
     alarga la ejecución, así que alarga la serie.
     No rendir a tiempo es un problema —y grave— pero es OTRO, y ya lo dice la
     cabecera en rojo: «Debe rendición — venció 11/09/2025». Inflar la cuenta
     de papeles del banco no lo cuenta mejor; lo tapa con nueve meses de ruido
     que nadie puede cargar. */
  const pl = mesDe(cierre?.plazo);
  if (pl && pl < fin) fin = pl;
  if (fin < ini) return [];
  const out: string[] = [];
  for (let m = ini; m <= fin; m = masMes(m, 1)) out.push(m);
  return out;
}

export type FaltanEstados = {
  /** Los meses que deberían estar, según el acta. */
  esperados: string[];
  /** Los que no están. */
  faltan: string[];
  /** Los que faltan y tienen algún mes cargado DESPUÉS: series rotas. */
  huecos: string[];
  /** Cargados que caen fuera de la serie esperada (antes del desembolso). */
  fuera: string[];
};

export function faltanEstados(
  periodos: (string | null | undefined)[],
  desembolso?: string | null,
  hoy?: string | null,
  cierre?: CierreSerie,
): FaltanEstados {
  const esperados = mesesEsperados(desembolso, hoy, cierre);
  const hay = new Set(periodos.map(mesDe).filter(Boolean) as string[]);
  const faltan = esperados.filter(m => !hay.has(m));
  const ultimo = [...hay].sort().pop();
  const huecos = ultimo ? faltan.filter(m => m < ultimo) : [];
  const fuera = [...hay].filter(m => esperados.length > 0 && m < esperados[0]).sort();
  return { esperados, faltan, huecos, fuera };
}

/** El texto del resumen. Null cuando no hay nada que decir. */
export function textoFaltan(f: FaltanEstados): string | null {
  if (!f.faltan.length) return null;
  const lista = f.faltan.slice(0, 3).map(nombreMes).join(", ");
  const resto = f.faltan.length > 3 ? ` y ${f.faltan.length - 3} más` : "";
  const rotas = f.huecos.length ? ` · ${f.huecos.length} en medio de la serie` : "";
  return `falta${f.faltan.length > 1 ? "n" : ""} ${f.faltan.length}: ${lista}${resto}${rotas}`;
}

/* ── EL MISMO CONTEO PARA LA BURBUJA Y PARA LA LISTA ──
 *
 * La burbuja del menú y la tarjeta de /fondos tienen que decir lo mismo que la
 * sub-sección de dentro del fondo. Si el menú dice «1» y al entrar no se ve
 * cuál, el número no se puede cuadrar y deja de creerse: eso es lo que mata a
 * un indicador, no que sea alto.
 *
 * Se salta lo que no tiene serie que exigir —un fondo ya rendido, o uno sin
 * desembolso cargado— por la misma razón que `mesesEsperados`: pedir meses de
 * un fondo cerrado es pedir papeles que no existen, y sin desembolso no se
 * sabe ni dónde empieza la cuenta. Esos dos casos ya se avisan por su lado.
 */
export type FondoEC = {
  id: string;
  estado?: string | null;
  fecha_desembolso?: string | null;
  fecha_rendicion_real?: string | null;
  /* El plazo, con su prórroga. Cierran la serie: ver `mesesEsperados`. */
  fecha_limite_rendicion?: string | null;
  fecha_prorroga?: string | null;
};

/** El cierre de la serie de un fondo, sacado de sus fechas. En un solo sitio
 *  para que las cuatro pantallas no puedan armarlo cada una a su manera. */
export const cierreDe = (f: FondoEC): CierreSerie => ({
  rendicionReal: f?.fecha_rendicion_real || null,
  plazo: plazoRendicion(f || {}),
});

/* ── ¿A ESTE FONDO SE LE SIGUE PIDIENDO EL BANCO? ──
 *
 * Sin desembolso no hay serie: no se sabe dónde empieza. Ya rendido tampoco:
 * el expediente se entregó, y perseguir un papel de un fondo cerrado no es
 * una tarea de nadie.
 *
 * Está aquí, suelto y con nombre, porque de esto dependen CINCO sitios —la
 * burbuja del menú, la tarjeta de /fondos, la pestaña, la cabecera de
 * Rendición y la sub-sección de estados—. Estuvo escrito dos veces con dos
 * criterios: `resumenFaltantes` descartaba el fondo rendido entero y
 * `faltanEstados` solo le recortaba el final, así que un fondo cerrado con un
 * hueco salía en rojo dentro de la ficha y en ninguna otra pantalla. Un aviso
 * que solo existe en el sitio donde hay que sospechar para mirarlo es el
 * mismo problema que este trabajo vino a arreglar.
 *
 * Lo que NO hace: esconder el hueco. Un fondo rendido con la serie
 * incompleta lo sigue diciendo en su ficha —es un hallazgo, y ahí es donde se
 * audita—; lo que no hace es encender alarmas que nadie puede apagar. */
export const seVigila = (f: {
  fecha_desembolso?: string | null; fecha_rendicion_real?: string | null;
}) => !!f?.fecha_desembolso && !f?.fecha_rendicion_real;

export function resumenFaltantes(
  fondos: FondoEC[],
  periodosPorFondo: Map<string, (string | null | undefined)[]>,
  hoy: string,
): { fondos: number; meses: number } {
  let nFondos = 0, nMeses = 0;
  for (const f of fondos || []) {
    if (!f?.id || !seVigila(f)) continue;
    // Mismo cierre que en la ficha —`cierreDe`—: la misma llamada en los dos
    // sitios es una cosa menos que cotejar.
    const r = faltanEstados(
      periodosPorFondo.get(f.id) || [], f.fecha_desembolso, hoy, cierreDe(f));
    if (!r.faltan.length) continue;
    nFondos++; nMeses += r.faltan.length;
  }
  return { fondos: nFondos, meses: nMeses };
}
