/* ── LAS TAREAS QUE VUELVEN SOLAS ──
 *
 * Trabajo que no nace de una decisión sino del calendario: la declaración
 * mensual de IGV-Renta de cada empresa, la jurada anual. Nadie las pide y
 * nadie las asigna — vencen.
 *
 * Aquí vive TODO lo que hay que saber de una obligación: cómo se llama, qué
 * documentos exige, cómo se lee su periodo y en qué situación está. Las
 * pantallas no deciden nada de esto; preguntan.
 *
 * Ver db/obligaciones.sql para el porqué de las tres tablas. Lo único que
 * conviene repetir aquí es la regla incómoda: la fecha de vencimiento de SUNAT
 * es DATO, no fórmula —se publica cada año por resolución y cambia—, así que
 * un periodo sin calendario cargado no tiene fecha y se dice. Media pantalla
 * honesta vale más que una fecha inventada, porque la primera se pregunta y la
 * segunda se cree.
 */

/* ── CUÁNTOS DÍAS ANTES AVISAR ──
   Cada obligación guarda los suyos en `obligacion.dias_aviso`; esto es solo lo
   que vale cuando una fila no lo dice. Estaba escrito a mano en tres sitios
   —la migración, la pantalla y el alta— y bajarlo de 7 a 6 obligaba a acertar
   con los tres: el clásico número que se cambia en dos y se queda mintiendo en
   el tercero. */
export const DIAS_AVISO = 6;

export type Periodicidad = "mensual" | "anual";

export type ClaseObligacion = {
  clase: string;
  nombre: string;
  /** Cómo se nombra una sola: «la declaración de octubre». */
  singular: string;
  ico: string;
  periodicidad: Periodicidad;
  ayuda: string;
};

/* El catálogo. Añadir una obligación es añadir una entrada aquí — la base no
   tiene enum ni hay migración que correr, justamente para que la lista pueda
   crecer al ritmo al que aparecen.
 *
 * ── LO QUE ESTA LISTA YA NO TIENE: LOS PAPELES ──
 * Nació con cuatro enlaces por mes —registro de compras, de ventas, constancia
 * de declaración y de pago— porque así estaba la tabla de SeaTable. Se
 * quitaron a los dos días, y el motivo lo dio quien la usaba: guardar esas
 * constancias no sirvió nunca. La fuente de verdad de si una declaración está
 * presentada es SUNAT, no una copia nuestra en Drive; y una copia que hay que
 * mantener a mano se queda vieja y encima da confianza.
 * Lo que sí hacía falta era llegar rápido a SUNAT para comprobarlo, y eso es
 * un enlace, no cuatro campos. */
export const CLASES: ClaseObligacion[] = [
  {
    clase: "igv_renta",
    nombre: "Declaración mensual IGV-Renta",
    singular: "declaración mensual",
    ico: "🧾",
    periodicidad: "mensual",
    ayuda: "PDT/Formulario 621. Vence según el último dígito del RUC y el cronograma que SUNAT publica cada año.",
  },
  /* ── LA MISMA DECLARACIÓN, DOS CALENDARIOS ──
   * SUNAT publica dos cronogramas para la jurada anual y la diferencia es de
   * DOS MESES. Cuál toca depende de los ingresos netos del año anterior —un
   * dato que este sistema no tiene—, así que no se puede elegir solo: se
   * ofrecen los dos y la ayuda dice cuál es cuál. Que un desplegable obligue a
   * decidir es mejor que un sistema que decide mal en silencio.
   * Son dos clases y no una casilla «es MYPE» porque una clase ES un
   * calendario: mezclarlos bajo un nombre metería la Ley 31940 y las UIT
   * dentro de una consulta que solo debería saber leer fechas. */
  {
    clase: "dj_anual_mype",
    nombre: "Jurada anual · MYPE (Ley 31940)",
    singular: "jurada anual",
    ico: "📑",
    periodicidad: "anual",
    ayuda: "Renta anual de quien tuvo hasta 1700 UIT de ingresos netos el año anterior — lo habitual en un colectivo. Vence entre finales de mayo y junio.",
  },
  {
    clase: "dj_anual",
    nombre: "Jurada anual · cronograma general",
    singular: "jurada anual",
    ico: "📑",
    periodicidad: "anual",
    ayuda: "Renta anual de quien superó las 1700 UIT de ingresos netos el año anterior, inició operaciones ese año o está en un grupo económico. Vence entre finales de marzo y abril — dos meses antes que la de MYPE.",
  },
];

const POR_CLASE = new Map(CLASES.map(c => [c.clase, c]));
export const claseDe = (c?: string | null): ClaseObligacion | null =>
  POR_CLASE.get(String(c ?? "")) || null;
export const nombreClase = (c?: string | null) => claseDe(c)?.nombre || c || "—";
export const icoClase = (c?: string | null) => claseDe(c)?.ico || "📌";

/* ── CÓMO SE LEE UN PERIODO ──
 * `mes = 0` es la marca de «esto es anual», y por eso el periodo anual se lee
 * «2025» a secas y no «enero 2025»: la jurada de 2025 no es de enero. */
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const rotuloPeriodo = (anio: number, mes: number) =>
  mes >= 1 && mes <= 12 ? `${MESES[mes - 1]} ${anio}` : String(anio);

/** Para ordenar y comparar: «2025-10», «2025-00» en las anuales. */
export const clavePeriodo = (anio: number, mes: number) =>
  `${anio}-${String(mes).padStart(2, "0")}`;

/* ── EN QUÉ SITUACIÓN ESTÁ ──
 *
 * Cinco, y la diferencia entre dos de ellas es la que hace útil el módulo:
 *
 *   · `sin_fecha` NO es «no vence». Es «no sabemos cuándo», porque el
 *     calendario de ese año no está cargado. Pintarlo como pendiente normal
 *     escondería que falta un dato del sistema; pintarlo como vencido sería
 *     mentir. Tiene color propio y dice qué hacer.
 *   · `vencido` es deuda de verdad: pasó la fecha y no hay constancia.
 */
export type SituacionPeriodo =
  | "declarado" | "vencido" | "por_vencer" | "pendiente" | "sin_fecha" | "inactiva";

export type PeriodoMin = {
  anio: number; mes: number;
  vence?: string | null;
  declarado_en?: string | null;
} & Record<string, any>;

export const META_SIT: Record<SituacionPeriodo, {
  ico: string; txt: string; col: string; ayuda: string;
}> = {
  declarado: {
    ico: "✅", txt: "Declarado", col: "var(--green)",
    ayuda: "Presentado. La fecha en que se declaró queda guardada, así que se puede saber si fue a tiempo.",
  },
  vencido: {
    ico: "🔴", txt: "Vencido", col: "var(--red)",
    ayuda: "Pasó la fecha y no hay constancia. Declarar fuera de plazo tiene multa, y la multa crece con el tiempo.",
  },
  por_vencer: {
    ico: "🟡", txt: "Por vencer", col: "var(--yellow)",
    ayuda: "Vence dentro de la ventana de aviso de esta obligación. Es lo que hay que hacer esta semana.",
  },
  pendiente: {
    ico: "·", txt: "Pendiente", col: "var(--dim)",
    ayuda: "Todavía no toca. Está en la lista para que no se olvide, no para que se haga hoy.",
  },
  sin_fecha: {
    ico: "⚠", txt: "Sin fecha", col: "var(--violet)",
    ayuda: "El periodo existe pero el cronograma de SUNAT de ese año no está cargado, así que no sabemos cuándo vence. No es que no venza: es que falta el dato. Se carga en vencimiento_oficial.",
  },
  inactiva: {
    ico: "⏸", txt: "No se vigila", col: "var(--dim)",
    ayuda: "La obligación está apagada, así que este mes no se cuenta como deuda. El periodo sigue a la vista —apagar no es esconder—, pero no suma al semáforo ni abre casos. Si sí hay que declararlo, vuelve a encender la obligación.",
  },
};

/** Hoy en Lima, como 'YYYY-MM-DD'. La comparación de vencimientos se hace en
 *  hora peruana: con la del servidor, un plazo se daba por vencido cinco horas
 *  antes de tiempo. */
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/* ── LO QUE LA OBLIGACIÓN APORTA A LA SITUACIÓN DE SUS MESES ──
 *
 * Se pasa la obligación entera y no sus días de aviso sueltos, y eso es el
 * arreglo: la situación depende de DOS cosas suyas —cuántos días avisa y si
 * está encendida—, y pasar solo una fue exactamente la forma de olvidar la
 * otra. Durante un tiempo los meses sin declarar de un bloque APAGADO se
 * contaron como vencidos en la pantalla, mientras la burbuja del menú —que sí
 * miraba `activa`— daba otro número. Dos cuentas para la misma deuda, y
 * entonces no se cree ninguna.
 *
 * Con la obligación por delante no se puede llamar a esto sin saber si está
 * encendida. */
export type OblMin = { dias_aviso?: number | null; activa?: boolean | null };

export function situacionPeriodo(p: PeriodoMin, o: OblMin): SituacionPeriodo {
  /* Declarado primero, y a propósito: apagar la obligación después no
     desdeclara marzo. Manda el hecho, no la bandera. */
  if (p.declarado_en) return "declarado";
  if (o.activa === false) return "inactiva";
  if (!p.vence) return "sin_fecha";
  const h = hoy();
  const v = String(p.vence).slice(0, 10);
  if (v < h) return "vencido";
  const dias = Math.round(
    (new Date(v + "T12:00:00").getTime() - new Date(h + "T12:00:00").getTime()) / 86400000);
  return dias <= (o.dias_aviso ?? DIAS_AVISO) ? "por_vencer" : "pendiente";
}

/** ¿Se declaró después de la fecha? Se sabe porque `declarado_en` es una fecha
 *  y no un booleano — la razón de que lo sea. */
export const declaradoTarde = (p: PeriodoMin) =>
  !!(p.declarado_en && p.vence && String(p.declarado_en).slice(0, 10) > String(p.vence).slice(0, 10));

/* ── UNA FECHA PUEDE SER OFICIAL O REFERENCIAL ──
 *
 * `vencimiento_oficial.fuente` guarda de dónde salió cada fecha, y no es un
 * adorno: hay tablas de cronograma circulando por internet que se parecen
 * mucho a la resolución de SUNAT y no lo son —una de ellas contradecía en dos
 * semanas los datos reales de este equipo—. Una fecha equivocada no se nota:
 * se cumple, y la multa llega después.
 *
 * Así que la procedencia viaja con el dato y la pantalla la enseña. Oficial es
 * lo cotejado contra la R.S.; todo lo demás se pinta distinto y avisa. */
export const esFechaOficial = (fuente?: string | null) =>
  !/referencial|pendiente|estimad/i.test(String(fuente ?? ""));

/* ── EL RESUMEN DE UNA LISTA ──
 * Lo que se mira antes de leer fila por fila. `sinFecha` va aparte de
 * `pendientes` a propósito: mezclarlos daría un número tranquilizador sobre
 * meses de los que no sabemos nada. */
export function resumenPeriodos(ps: (PeriodoMin & { clase?: string })[], o: OblMin) {
  let declarados = 0, vencidos = 0, porVencer = 0, pendientes = 0, sinFecha = 0,
    tarde = 0, inactivos = 0;
  for (const p of ps) {
    switch (situacionPeriodo(p, o)) {
      case "declarado": declarados++; if (declaradoTarde(p)) tarde++; break;
      case "vencido": vencidos++; break;
      case "por_vencer": porVencer++; break;
      case "sin_fecha": sinFecha++; break;
      case "inactiva": inactivos++; break;
      default: pendientes++;
    }
  }
  /* `total` es de cuántos hay que responder, no cuántas filas hay. Los meses
     de una obligación apagada existen y se ven, pero decir «29 declarados de
     31» cuando dos no había que declararlos es inventar dos deudas. Quien
     quiera la cuenta cruda tiene `inactivos` al lado. */
  return { total: ps.length - inactivos, declarados, vencidos, porVencer,
    pendientes, sinFecha, tarde, inactivos };
}

/* ── EL RESULTADO DEL MES SE CALCULA, NO SE TECLEA ──
 *
 * En la tabla de SeaTable esta columna se llenaba sola, con tres columnas
 * ocultas: IGV de ventas (débito), IGV de compras (crédito) y la resta. Aquí
 * nació a mano y eso era un retroceso: un número tecleado que ya está en los
 * comprobantes es un número que se puede escribir mal y nadie va a cotejar.
 *
 * La regla es la del formulario 621:
 *
 *     IGV a pagar = IGV de las VENTAS del mes − IGV de las COMPRAS del mes
 *
 * Negativo es saldo a favor, y arrastra al mes siguiente. Cero es «en cero»,
 * que no es lo mismo que no haber declarado.
 *
 * Se comprobó contra la contabilidad real del equipo antes de escribirlo:
 * abril 2025, egresos de S/ 7,588.61 → crédito de S/ 1,157.58 (7,588.61 ×
 * 18/118), que es el número que tenían en su tabla. Y octubre, con S/ 6,000 de
 * egreso y crédito CERO, porque ese gasto era un recibo por honorarios y un
 * RHE no lleva IGV — de ahí que esto sume `comprobante.igv` y no un porcentaje
 * del importe.
 *
 * ── LO CALCULADO NO PISA LO ESCRITO A MANO ──
 * Si alguien fijó el resultado a mano, manda: puede saber algo que el sistema
 * no —un mes anterior a que se cargaran las facturas, un ajuste—. Pero se
 * DICE que es a mano, y si difiere de lo calculado se enseñan los dos. Un
 * número que discrepa en silencio de sus propios datos es la peor clase de
 * dato: convincente.
 */
export type CompMin = {
  fecha?: string | null; igv?: number | string | null; sentido?: string | null;
};

export function igvDelPeriodo(comps: CompMin[], anio: number, mes: number) {
  let debito = 0, credito = 0, n = 0;
  for (const c of comps) {
    const f = String(c.fecha ?? "").slice(0, 10);
    if (Number(f.slice(0, 4)) !== anio || Number(f.slice(5, 7)) !== mes) continue;
    const v = Number(c.igv) || 0;
    n++;
    if (c.sentido === "venta") debito += v; else credito += v;
  }
  const aPagar = Math.round((debito - credito) * 100) / 100;
  return {
    debito, credito, aPagar, comprobantes: n,
    /* Sin ningún comprobante del mes no se concluye nada. «En cero» sería una
       afirmación —«este mes no hubo movimiento»— y lo cierto es que no se sabe:
       puede que no se haya cargado todavía. */
    resultado: n === 0 ? null
      : aPagar > 0 ? "a_pagar"
      : aPagar < 0 ? "saldo_favor"
      : "en_cero",
    monto: n === 0 ? null : Math.abs(aPagar),
  };
}

/* ── EL RESULTADO DEL MES ──
 * Estaba en la tabla vieja («Neutro / En Cero», «Saldo a Favor: 228.81») y es
 * lo que convierte esta lista en información contable en vez de en una lista
 * de tareas: mirando la columna se ve de un vistazo si la empresa arrastra
 * saldo a favor o viene pagando. */
export const RESULTADOS: { id: string; txt: string; col: string; conMonto: boolean }[] = [
  { id: "en_cero", txt: "En cero", col: "var(--dim)", conMonto: false },
  { id: "saldo_favor", txt: "Saldo a favor", col: "var(--green)", conMonto: true },
  { id: "a_pagar", txt: "A pagar", col: "var(--yellow)", conMonto: true },
];
export const resultadoDe = (id?: string | null) =>
  RESULTADOS.find(r => r.id === id) || null;

const soles = (n: any) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function rotuloResultado(p: PeriodoMin): string {
  const r = resultadoDe(p.resultado);
  if (!r) return "—";
  return r.conMonto && p.monto != null ? `${r.txt}: ${soles(p.monto)}` : r.txt;
}

/** El último dígito del RUC — el que decide la fecha. Se saca igual que en la
 *  base (db/obligaciones.sql) para que las dos respuestas coincidan. */
export const digitoRuc = (ruc?: string | null): number | null => {
  const d = String(ruc ?? "").replace(/\D/g, "");
  return d ? Number(d.slice(-1)) : null;
};

/* ── ¿ESTA EMPRESA DECLARA HOY? ──
 *
 * Devuelve `null` si sí, o el motivo si no. Vive aquí y no en la pantalla
 * porque la misma pregunta la van a hacer el listado, el cron que abra los
 * casos y cualquier aviso futuro; tres respuestas distintas a «¿le toca
 * declarar?» es peor que ninguna.
 *
 * ── DOS CLASES DE «NO», Y NO SE MEZCLAN ──
 *  · `imposible` — sin RUC no hay último dígito, sin dígito no hay fecha y sin
 *    fecha no hay nada que vigilar. No es una decisión: no se puede.
 *  · `probable`  — la empresa existe y tiene RUC, pero por su estado hoy no
 *    debería estar declarando. Es un criterio nuestro, y puede estar
 *    equivocado, así que la obligación se deja crear igual.
 *
 * ── EL MATIZ QUE NO SE PUEDE CALLAR ──
 * «En proceso de cierre» NO exime: mientras no se dé de baja el RUC, SUNAT
 * sigue esperando las declaraciones —aunque sean en cero—. Aquí se agrupa
 * aparte por comodidad de lectura, no porque haya dejado de deber. Si eso no
 * se dice, apagar la fila se lee como «ya no le toca», que es justo la lectura
 * que acaba en multa.
 */
export type MotivoNoDeclara = {
  clase: "imposible" | "probable";
  txt: string;
  ayuda: string;
};

export function motivoNoDeclara(e: {
  ruc?: string | null; estado?: string | null;
}): MotivoNoDeclara | null {
  if (!String(e.ruc ?? "").trim()) {
    return {
      clase: "imposible", txt: "todavía sin RUC",
      ayuda: "Sin RUC no hay último dígito, y el último dígito es lo que decide cada fecha de vencimiento. No hay nada que vigilar hasta que se constituya.",
    };
  }
  const est = String(e.estado ?? "").trim();
  if (est === "activa" || est === "") return null;
  const M: Record<string, string> = {
    en_constitucion: "Todavía no opera: se está constituyendo.",
    inactiva: "Marcada como inactiva. Ojo: si el RUC sigue activo ante SUNAT, las declaraciones se siguen esperando aunque sean en cero — «inactiva» es nuestro criterio, no el de SUNAT.",
    en_proceso_de_cierre: "En cierre. NO exime de declarar: mientras no se dé de baja el RUC, SUNAT sigue esperando la declaración de cada mes, aunque sea en cero. Está agrupada aparte para leer mejor la lista, no porque haya dejado de deber.",
    cerrada: "Cerrada. Si se dio de baja el RUC, no hay más periodos que declarar.",
  };
  return {
    clase: "probable",
    txt: (EST_TXT[est] || est).toLowerCase(),
    ayuda: M[est] || "Por su estado interno, hoy no debería estar declarando.",
  };
}

/* El rótulo de cada estado. Copiado corto a propósito: `EST_EMPRESA` vive en
   lib/entidades junto a todo el formulario de entidades, y arrastrarlo entero
   aquí traería media aplicación a un módulo que solo necesita cinco palabras. */
const EST_TXT: Record<string, string> = {
  activa: "activa", en_constitucion: "en constitución", inactiva: "inactiva",
  en_proceso_de_cierre: "en cierre", cerrada: "cerrada",
};
