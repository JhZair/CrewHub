/* ══════════════════════════════════════════════════════════════════════════
   LA CLÁUSULA 5.4, EN UN SOLO SITIO

   El acta, literal:
     «Documentación de contratos, convenios de prácticas o prestación de
      servicios de todo el personal vinculado. Y OBLIGATORIAMENTE seguros
      contra accidentes para quienes participen —o prestaciones equivalentes
      que permitan atención inmediata durante el rodaje—.»

   Dos obligaciones distintas metidas en una cláusula, y las dos se cumplen
   PERSONA A PERSONA. Hasta ahora la 5.4 era una fila de `compromiso_acta` con
   una casilla: se marcaba «entregado» y nadie sabía si eran veintiún contratos
   o tres.

   ── POR QUÉ ESTA REGLA VIVE AQUÍ ──
   La leen tres pantallas —👥 Equipo, 🎥 Audiovisual y 📦 Entregables— y cada
   una contesta una parte. Escrita tres veces, a la primera corrección dirían
   tres cosas distintas y el recuento de la cabecera dejaría de cuadrar con las
   filas de debajo. Es la misma lección de lib/tipos.ts (diez copias, dos
   versiones) y de lib/rolesEquipo.ts.

   ── EL DENOMINADOR NO SE MANTIENE A MANO ──
   Sale de la nómina que ya se deduce en lib/equipoFondo.ts —manda el hecho:
   quien tiene un RHE girado en este fondo trabajó aquí, lo haya apuntado
   alguien o no— más el equipo artístico confirmado. Una lista de «personal
   vinculado» que hubiera que acordarse de actualizar es una lista que a los
   tres meses miente, y esta en concreto mentiría hacia abajo: diría que
   faltan menos papeles de los que faltan.

   ⚠ NO IMPORTA NADA DE SUPABASE. Lo usan el servidor y el cliente.
   ══════════════════════════════════════════════════════════════════════════ */

import { situacionDe, type FilaReparto } from "@/lib/repartoFondo";

export type TipoPapel = "contrato" | "convenio" | "locacion" | "seguro" | "otro";
export type EstadoPapel = "pendiente" | "firmado" | "no_aplica";

export type Papel = {
  id: string;
  persona_id: string;
  tipo?: string | null;
  estado?: string | null;
  url?: string | null;
  firmado_en?: string | null;
  vigente_desde?: string | null;
  vigente_hasta?: string | null;
  motivo?: string | null;
  nota?: string | null;
};

const limpia = (s?: string | null) => (s || "").trim().toLowerCase();

/** El tipo, normalizado. Lo que no reconocemos cae en `otro` — que NO tapa el
 *  hueco de un contrato: un papel del que no sabemos qué es no puede dar por
 *  cumplida una obligación del acta. */
export function tipoDe(p: Papel): TipoPapel {
  const t = limpia(p.tipo);
  return (t === "contrato" || t === "convenio" || t === "locacion"
    || t === "seguro" || t === "otro") ? t : "otro";
}

/** El estado, normalizado. Lo que no reconocemos cuenta como PENDIENTE, no
 *  como «no aplica»: un dato que no entendemos no puede rebajar el recuento de
 *  papeles que faltan. */
export function estadoDe(p: Papel): EstadoPapel {
  const e = limpia(p.estado);
  return (e === "firmado" || e === "no_aplica") ? e : "pendiente";
}

/* ── QUÉ TAPA EL HUECO DEL CONTRATO ──
 * Los tres que nombra la cláusula, uno a uno. `seguro` no, porque es la OTRA
 * obligación; `otro` tampoco, por lo dicho arriba. */
const CUENTAN_COMO_CONTRATO: TipoPapel[] = ["contrato", "convenio", "locacion"];

export const META_TIPO: Record<TipoPapel, { ico: string; txt: string; ayuda: string }> = {
  contrato: { ico: "📝", txt: "Contrato", ayuda: "Contrato de trabajo o de servicios" },
  convenio: { ico: "🎓", txt: "Convenio de prácticas", ayuda: "Convenio de prácticas preprofesionales o profesionales" },
  locacion: { ico: "🧾", txt: "Locación de servicios", ayuda: "Contrato de locación / prestación de servicios (el que acompaña al RHE)" },
  seguro:   { ico: "🛡", txt: "Seguro contra accidentes", ayuda: "Póliza o prestación equivalente que permita atención inmediata durante el rodaje" },
  otro:     { ico: "📄", txt: "Otro documento", ayuda: "No cuenta como contrato en el recuento de la cláusula 5.4" },
};

export const META_ESTADO: Record<EstadoPapel, { ico: string; txt: string; col: string }> = {
  firmado:   { ico: "✔", txt: "firmado", col: "var(--green)" },
  pendiente: { ico: "⚠", txt: "pendiente", col: "var(--yellow)" },
  no_aplica: { ico: "–", txt: "no aplica", col: "var(--dim)" },
};

/** ⚠ Firmado sin enlace no está probado. El papel puede existir en un
 *  archivador, pero en una rendición eso es lo mismo que no tenerlo: no se
 *  puede adjuntar. Se dice, en vez de pintarlo en verde. Misma regla que
 *  `firmadaSinPrueba` para las cesiones. */
export const sinPrueba = (p: Papel) =>
  estadoDe(p) === "firmado" && !(p.url || "").trim();

/* ── LA VIGENCIA, QUE SOLO IMPORTA EN EL SEGURO ──
 * Un contrato firmado lo está para siempre. Un seguro cubre UNA VENTANA, y lo
 * que el acta exige es estar cubierto MIENTRAS SE RUEDA. Un seguro vencido el
 * mes pasado sigue siendo un PDF firmado: sin mirar la fecha, la pantalla lo
 * pintaría en verde el día que ya no cubre a nadie. */
export function seguroVencido(p: Papel, hoy: string): boolean {
  if (tipoDe(p) !== "seguro" || estadoDe(p) !== "firmado") return false;
  const hasta = (p.vigente_hasta || "").trim();
  /* Sin fecha de fin NO se declara vencido. No sabemos hasta cuándo cubre, y
     eso es «no lo sé», no «ya no cubre». Se señala aparte con `sinVigencia`. */
  return !!hasta && hasta < hoy;
}

/** Un seguro firmado del que no sabemos hasta cuándo cubre. No es un error
 *  —hay pólizas sin fecha en el PDF— pero tampoco se puede afirmar que cubra
 *  el rodaje, y afirmarlo es justo lo que hace pintarlo en verde sin más. */
export const sinVigencia = (p: Papel) =>
  tipoDe(p) === "seguro" && estadoDe(p) === "firmado" && !(p.vigente_hasta || "").trim();

/* ── EL ESTADO DE UNA PERSONA ──
 * De todos sus papeles de una clase, manda el mejor: si tiene un contrato
 * firmado y otro pendiente, tiene contrato. `null` es «no hay ninguno», que NO
 * es lo mismo que «pendiente» —uno es un papel que existe y no está firmado,
 * el otro es que nadie lo ha registrado siquiera— y por eso son dos valores. */
const RANGO: Record<EstadoPapel, number> = { firmado: 0, no_aplica: 1, pendiente: 2 };

function mejor(ps: Papel[]): EstadoPapel | null {
  if (!ps.length) return null;
  return ps.map(estadoDe).sort((a, b) => RANGO[a] - RANGO[b])[0];
}

export type EstadoPersona = {
  /** El de contrato/convenio/locación: el que la cláusula pide para todos. */
  contrato: EstadoPapel | null;
  /** El del seguro contra accidentes. */
  seguro: EstadoPapel | null;
  /** Su seguro está firmado pero la ventana ya pasó. */
  seguroVencido: boolean;
  papeles: Papel[];
};

export function estadoDePersona(papeles: Papel[], hoy: string): EstadoPersona {
  const deContrato = papeles.filter(p => CUENTAN_COMO_CONTRATO.includes(tipoDe(p)));
  const deSeguro = papeles.filter(p => tipoDe(p) === "seguro");
  return {
    contrato: mejor(deContrato),
    seguro: mejor(deSeguro),
    /* ── VENCIDO SOLO SI LLEGÓ A ESTAR VIGENTE ──
       Hacen falta las DOS condiciones y no solo la segunda.
       ⚠ `every` con la negación dentro es vacuamente cierto cuando NINGÚN
       seguro está firmado: con solo `every`, alguien con el seguro apenas
       registrado —`pendiente`, que es el valor por defecto— salía pintado en
       rojo «⏳ seguro vencido». Y quien lo tuviera marcado «no aplica» con su
       motivo escrito contaba a la vez en `seguroNoAplica` y en `seguroVencido`,
       así que la cabecera decía las dos cosas. Se encendía el minuto uno, sobre
       un hecho duro y en la dirección que más exagera — que es como se enseña a
       ignorar un aviso.
       Dos pólizas encadenadas —una por etapa de rodaje— son lo normal, y con la
       primera caducada la persona sigue cubierta: por eso `every` sobre las
       firmadas y no `some`. */
    seguroVencido: deSeguro.some(p => estadoDe(p) === "firmado")
      && deSeguro.every(p => estadoDe(p) !== "firmado" || seguroVencido(p, hoy)),
    papeles,
  };
}

/** Los papeles de un fondo, indexados por persona. Un solo recorrido: la
 *  pantalla de Equipo pinta veintitantas filas y hacer un `filter` por fila
 *  sería recorrer la lista veintitantas veces. */
export function papelesPorPersona(papeles: Papel[]): Map<string, Papel[]> {
  const m = new Map<string, Papel[]>();
  for (const p of papeles) {
    if (!p.persona_id) continue;
    m.set(p.persona_id, [...(m.get(p.persona_id) || []), p]);
  }
  return m;
}

/* ══════════════ EL DENOMINADOR ══════════════
 *
 * «Todo el personal vinculado». Dos fuentes, ninguna que haya que mantener:
 *   · la nómina del fondo (lib/equipoFondo.ts), que sale de los RHE girados,
 *     de lo declarado en la postulación y de lo previsto a mano;
 *   · el equipo artístico CONFIRMADO (lib/repartoFondo.ts). Las candidatas no:
 *     a quien todavía se está yendo a ver no se le pide un contrato, y meterlas
 *     haría que el aviso exagerara siempre — que es como se enseña a ignorar un
 *     aviso.
 *
 * Y solo entra quien tiene ficha de persona: una candidata apuntada como «una
 * tejedora de Pitumarca» no tiene a quién contratar todavía.
 */
export type Vinculada = {
  id: string;
  nombre: string;
  /** De dónde sale. Sirve para explicar por qué está en la lista cuando
   *  alguien pregunta «¿y este quién es?» — que preguntan. */
  de: "equipo" | "reparto" | "ambos";
  /** Su cargo o su papel, para no tener que ir a buscarlo. */
  cargo?: string | null;
};

export function personasVinculadas(
  /* `nombre` opcional a propósito: la pestaña de Entregables solo necesita
     CONTAR, y pedirle los nombres la obligaría a traer el directorio entero
     para pintar un número. Quien solo cuenta pasa `{persona:{id}}`. */
  integrantes: { persona: { id: string; nombre?: string | null; alias?: string | null }; cargo?: string | null }[],
  reparto: FilaReparto[],
): Vinculada[] {
  const m = new Map<string, Vinculada>();
  for (const i of integrantes) {
    const p = i.persona;
    if (!p?.id) continue;
    m.set(p.id, { id: p.id, nombre: p.alias || p.nombre || "", de: "equipo", cargo: i.cargo || null });
  }
  for (const f of reparto) {
    if (situacionDe(f) !== "confirmada") continue;
    const q = Array.isArray(f.persona ?? f.per) ? (f.persona ?? f.per)[0] : (f.persona ?? f.per);
    const id = f.persona_id || q?.id;
    if (!id) continue;
    const ya = m.get(id);
    if (ya) { m.set(id, { ...ya, de: "ambos" }); continue; }
    m.set(id, {
      id,
      nombre: q?.alias || q?.nombre || (f.personaje || "").trim() || "sin nombre",
      de: "reparto",
      cargo: f.rol || null,
    });
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/* ══════════════ EL RECUENTO DE LA CLÁUSULA ══════════════
 *
 * ⚠ UN CERO AQUÍ NO ES UN CERO. Si la consulta de papeles falla y llega una
 * lista vacía, esto diría «0 sin contrato» — que se lee como «está todo
 * entregado», lo contrario de la verdad, sobre la cláusula cuyo incumplimiento
 * se convierte en observación de DAFO. Por eso la función NO decide qué
 * pintar: devuelve los números y quien llama enseña el error del servidor en
 * vez del recuento. Es el error más caro que hemos tenido en este proyecto.
 */
export type Recuento54 = {
  /** Cuántas personas vinculadas hay. Este número sale de la nómina, no de los
   *  papeles: si es 0 es que no hay nadie, no que falte leer algo. */
  vinculadas: number;
  conContrato: number;
  sinContrato: number;
  contratoNoAplica: number;
  conSeguro: number;
  sinSeguro: number;
  seguroNoAplica: number;
  /** Firmados de los que no se puede enseñar el documento. */
  sinPrueba: number;
  /** Personas cuyo seguro está firmado pero ya no cubre. */
  seguroVencido: number;
};

export function recuento54(vinculadas: Vinculada[], papeles: Papel[], hoy: string): Recuento54 {
  const porPersona = papelesPorPersona(papeles);
  const r: Recuento54 = {
    vinculadas: vinculadas.length,
    conContrato: 0, sinContrato: 0, contratoNoAplica: 0,
    conSeguro: 0, sinSeguro: 0, seguroNoAplica: 0,
    sinPrueba: 0, seguroVencido: 0,
  };
  for (const v of vinculadas) {
    const suyos = porPersona.get(v.id) || [];
    const e = estadoDePersona(suyos, hoy);
    /* `null` —ninguno registrado— cuenta como FALTA, igual que `pendiente`. La
       cláusula no distingue entre «no lo tenemos» y «no lo hemos apuntado»:
       las dos veces, el día de la rendición no hay papel que adjuntar. */
    if (e.contrato === "firmado") r.conContrato++;
    else if (e.contrato === "no_aplica") r.contratoNoAplica++;
    else r.sinContrato++;

    if (e.seguro === "firmado" && !e.seguroVencido) r.conSeguro++;
    else if (e.seguro === "no_aplica") r.seguroNoAplica++;
    else r.sinSeguro++;

    if (e.seguroVencido) r.seguroVencido++;
    r.sinPrueba += suyos.filter(sinPrueba).length;
  }
  return r;
}

/** La cláusula del acta donde se rinde todo esto. Escrita una vez: la nombran
 *  la pestaña Entregables, la de Equipo y la de Audiovisual. */
export const CLAUSULA_PAPELES = "5.4";
