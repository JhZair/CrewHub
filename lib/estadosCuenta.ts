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

/** Los meses que el acta exige, del desembolso al último mes cerrado. */
export function mesesEsperados(
  desembolso?: string | null,
  hoy?: string | null,
  rendicionReal?: string | null,
): string[] {
  const ini = mesDe(desembolso);
  const hoyMes = mesDe(hoy);
  /* Sin fecha de desembolso no hay serie que exigir: no se sabe cuándo
     empieza. La ficha ya avisa por su lado de que falta ese dato. */
  if (!ini || !hoyMes) return [];
  let fin = masMes(hoyMes, -1);                 // el último mes CERRADO
  /* Rendido: la serie termina donde terminó la ejecución. Seguir pidiendo
     meses de un fondo cerrado es pedir papeles que ya no existen. */
  const rend = mesDe(rendicionReal);
  if (rend && rend < fin) fin = rend;
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
  rendicionReal?: string | null,
): FaltanEstados {
  const esperados = mesesEsperados(desembolso, hoy, rendicionReal);
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
};

export function resumenFaltantes(
  fondos: FondoEC[],
  periodosPorFondo: Map<string, (string | null | undefined)[]>,
  hoy: string,
): { fondos: number; meses: number; huecos: number } {
  let nFondos = 0, nMeses = 0, nHuecos = 0;
  for (const f of fondos || []) {
    if (!f?.id || !f.fecha_desembolso || f.fecha_rendicion_real) continue;
    const r = faltanEstados(
      periodosPorFondo.get(f.id) || [], f.fecha_desembolso, hoy, f.fecha_rendicion_real);
    if (!r.faltan.length) continue;
    nFondos++; nMeses += r.faltan.length; nHuecos += r.huecos.length;
  }
  return { fondos: nFondos, meses: nMeses, huecos: nHuecos };
}
