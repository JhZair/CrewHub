import { hoyLima } from "@/lib/fechas";

/* ══════════════════════════════════════════════════════════════════════════
   LA VIDA DE UN FONDO — una sola línea de tiempo, tres fuentes

   Un fondo dura dos años y lo que decide si acaba bien no son las cifras: son
   cuatro o cinco momentos. Hoy están repartidos en tres sitios que no se
   hablan —las fechas del acta en la postulación, las cartas de DAFO en la
   casilla, las llamadas en la cabeza de quien las hizo— y por eso «¿qué pasó
   con este fondo?» no se puede contestar sin reconstruirlo de memoria.

   Aquí se juntan. Lo importante es CÓMO:

   ── LAS FECHAS DEL ACTA SE LEEN, NO SE COPIAN ──
   Firma, desembolso, límite de rendición y prórroga son columnas de
   `postulaciones`. Esta función las convierte en hitos al vuelo. Guardarlas
   como filas daría dos respuestas a «¿cuándo vence?» —y el día que difieran,
   ninguna manda—. Misma razón por la que la rendición entregada sale de
   `fecha_rendicion_real` y no de una marca aparte.

   ── LO QUE VIENE NO SE MEZCLA CON LO QUE PASÓ ──
   Un límite de rendición futuro y una llamada de marzo no son la misma clase
   de cosa: uno es un compromiso y el otro un hecho. Van en la misma línea
   —porque así se lee la vida de un fondo— pero cada uno sabe si ya ocurrió,
   y lo que está por venir se puede mostrar aparte.

   ── UN REQUERIMIENTO ES UN RELOJ, NO UNA ANÉCDOTA ──
   «SEGUNDO REQUERIMIENTO» quiere decir que un plazo ya pasó. Por eso una carta
   con `responder_hasta` y sin `respondido_en` no es historia: es lo que hay
   que contestar, y se cuenta aparte.
   ══════════════════════════════════════════════════════════════════════════ */

export type ClaseHito =
  /* Las cuatro fechas del acta y la rendición: vienen de la postulación. */
  | "acta" | "desembolso" | "plazo" | "prorroga" | "rendido"
  /* Lo que DAFO nos dijo: correo de la casilla o carta de la plataforma. */
  | "carta"
  /* Lo que hicimos y alguien apuntó. */
  | "propio";

export type Hito = {
  /** `hito:<id>`, `carta:<id>` o `acta:<campo>`. Único dentro de la línea. */
  clave: string;
  clase: ClaseHito;
  /** `YYYY-MM-DD`. Todo se compara como texto: son fechas de calendario, no
   *  instantes, y pasarlas por `new Date()` mete la zona horaria en medio. */
  fecha: string;
  titulo: string;
  detalle?: string | null;
  /** El icono con el que se reconoce de un vistazo. */
  ico: string;
  /** `true` si la fecha aún no ha llegado: es un compromiso, no un hecho. */
  futuro: boolean;
  /** Hasta cuándo hay que contestar (solo cartas con plazo). */
  vence?: string | null;
  /** Cuándo dejó de estar pendiente. Con esto puesto, el reloj se apaga. */
  resuelto?: string | null;
  /** Por qué se cerró SIN contestar. Vacío = se contestó de verdad. Son dos
   *  cosas distintas y en un expediente no se pueden leer igual. */
  motivoCierre?: string | null;
  url?: string | null;
  /** El caso donde está la conversación. */
  casoId?: string | null;
  /** El id de la fila, para poder borrarla. Los derivados no tienen. */
  id?: string | null;
  autor?: string | null;
  /** El tipo del hito propio (`envio`, `recepcion`, `llamada`…). Es lo que
   *  dice la DIRECCIÓN: quién le habló a quién. */
  tipo?: string | null;
  /** Solo para cartas: `true` si la registró una persona (y por tanto se puede
   *  borrar). Un correo que llegó de DAFO no se borra — es la prueba de que
   *  escribieron. */
  registrada?: boolean;
};

export type PostulacionVida = {
  fecha_firma_acta?: string | null;
  fecha_desembolso?: string | null;
  fecha_limite_rendicion?: string | null;
  fecha_prorroga?: string | null;
  fecha_rendicion_real?: string | null;
  /** El número del ACTA DE COMPROMISO. Además de rotular la firma, es la llave
   *  con la que se comprueba que una carta cargada en este fondo es suya. */
  codigo_acta?: string | null;
  acta_url?: string | null;
};

export type FilaHito = {
  id: string; fecha: string; tipo: string; titulo: string;
  detalle?: string | null; url?: string | null; publicacion_id?: string | null;
  creado?: { nombre?: string | null } | { nombre?: string | null }[] | null;
};

export type FilaCarta = {
  id: string; asunto?: string | null; extracto?: string | null;
  recibido_en: string; origen?: string | null;
  doc_numero?: string | null; doc_url?: string | null;
  responder_hasta?: string | null; respondido_en?: string | null;
  cierre_motivo?: string | null;
  pide_accion?: boolean | null; caso_id?: string | null;
};

/** El icono de cada tipo de hito propio. Sale de aquí y no de la pantalla:
 *  dos listas de iconos acaban enseñando cosas distintas para lo mismo. */
export const TIPOS_HITO: { clave: string; nombre: string; ico: string }[] = [
  { clave: "llamada", nombre: "Llamada", ico: "📞" },
  { clave: "reunion", nombre: "Reunión", ico: "🤝" },
  { clave: "envio", nombre: "Enviamos algo", ico: "📤" },
  { clave: "recepcion", nombre: "Nos llegó algo", ico: "📥" },
  { clave: "visita", nombre: "Visita / supervisión", ico: "🚪" },
  { clave: "acuerdo", nombre: "Acuerdo o decisión", ico: "✍️" },
  { clave: "otro", nombre: "Otro", ico: "📍" },
];
const icoTipo = (t?: string | null) =>
  TIPOS_HITO.find(x => x.clave === t)?.ico || "📍";
export const nombreTipoHito = (t?: string | null) =>
  TIPOS_HITO.find(x => x.clave === t)?.nombre || "Otro";

/* El primer nombre del autor embebido. Supabase devuelve objeto o array de uno
   según cómo resuelva la relación, y elegir mal deja el nombre en blanco sin
   ningún error. */
const unNombre = (c: any): string | null =>
  (Array.isArray(c) ? c[0]?.nombre : c?.nombre) || null;

/* El día de un `timestamptz`, en Lima. Cortar los diez primeros caracteres da
   el día UTC, y a partir de las 7 de la tarde en Perú eso YA ES EL DÍA
   SIGUIENTE: una carta notificada el 3 a las 20:00 saldría fechada el 4. */
const diaDe = (f: string): string =>
  new Date(f).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/**
 * La línea de tiempo del fondo, de lo más nuevo a lo más viejo.
 *
 * `hoy` se pasa por parámetro para poder probarla: una función que pregunta la
 * hora por su cuenta no se puede simular, y la mitad de lo que decide aquí
 * —qué es futuro, qué venció— depende de qué día sea.
 */
export function vidaDelFondo(
  post: PostulacionVida | null | undefined,
  hitos: FilaHito[] | null | undefined,
  cartas: FilaCarta[] | null | undefined,
  hoy: string = hoyLima(),
): Hito[] {
  const out: Hito[] = [];
  const p = post || {};

  /* ── 1. LO QUE DICE EL ACTA ── */
  if (p.fecha_firma_acta) out.push({
    clave: "acta:firma", clase: "acta", fecha: p.fecha_firma_acta, ico: "✍️",
    titulo: "Se firmó el acta de compromiso",
    detalle: p.codigo_acta ? `Acta ${p.codigo_acta}` : null,
    url: p.acta_url || null,
    futuro: p.fecha_firma_acta > hoy,
  });
  if (p.fecha_desembolso) out.push({
    clave: "acta:desembolso", clase: "desembolso", fecha: p.fecha_desembolso, ico: "🏦",
    titulo: "Llegó el desembolso del estímulo",
    detalle: "Desde aquí corre el plazo de ejecución, no desde la firma.",
    futuro: p.fecha_desembolso > hoy,
  });
  if (p.fecha_limite_rendicion) out.push({
    clave: "acta:limite", clase: "plazo", fecha: p.fecha_limite_rendicion, ico: "🧾",
    titulo: p.fecha_prorroga ? "Límite de rendición (original)" : "Límite de rendición",
    /* Si hay prórroga, este ya no es el plazo que manda. Se deja en la línea
       —pasó y explica la prórroga— pero se dice, porque un fondo con dos
       fechas de vencimiento en pantalla y ninguna explicación es un fondo en
       el que alguien va a mirar la equivocada. */
    detalle: p.fecha_prorroga ? "Sustituido por la prórroga." : null,
    futuro: p.fecha_limite_rendicion > hoy,
  });
  if (p.fecha_prorroga) out.push({
    clave: "acta:prorroga", clase: "prorroga", fecha: p.fecha_prorroga, ico: "📅",
    titulo: "Prórroga: nuevo límite de rendición",
    futuro: p.fecha_prorroga > hoy,
  });
  if (p.fecha_rendicion_real) out.push({
    clave: "acta:rendido", clase: "rendido", fecha: p.fecha_rendicion_real, ico: "✅",
    titulo: "Se entregó la rendición",
    futuro: false,
  });

  /* ── 2. LO QUE DAFO NOS DIJO ──
     Las cartas registradas a mano y los correos que alguien marcó como que
     piden algo. Un correo cualquiera NO entra: doscientos avisos de concurso
     en la línea de tiempo la vuelven ilegible y entonces no se mira ninguna.
     El criterio es el mismo que ya usa la casilla (`pide_accion`) más el
     hecho de que alguien se tomara el trabajo de registrarla. */
  for (const c of cartas || []) {
    const registrada = (c.origen || "gmail") !== "gmail";
    if (!registrada && !c.pide_accion && !c.responder_hasta) continue;
    const fecha = diaDe(c.recibido_en);
    out.push({
      clave: `carta:${c.id}`, id: c.id, clase: "carta", fecha,
      ico: c.responder_hasta && !c.respondido_en ? "⏳" : "📨",
      titulo: c.doc_numero || c.asunto || "Comunicación de DAFO",
      detalle: c.doc_numero ? (c.asunto || c.extracto || null) : (c.extracto || null),
      url: c.doc_url || null,
      vence: c.responder_hasta || null,
      resuelto: c.respondido_en || null,
      motivoCierre: c.cierre_motivo || null,
      casoId: c.caso_id || null,
      registrada,
      futuro: fecha > hoy,
    });
  }

  /* ── 3. LO QUE HICIMOS ── */
  for (const h of hitos || []) {
    out.push({
      clave: `hito:${h.id}`, id: h.id, clase: "propio", fecha: h.fecha,
      ico: icoTipo(h.tipo), tipo: h.tipo, titulo: h.titulo, detalle: h.detalle || null,
      url: h.url || null, casoId: h.publicacion_id || null,
      autor: unNombre(h.creado),
      futuro: h.fecha > hoy,
    });
  }

  /* Lo más reciente arriba. A igual día, el desempate es la clave: sin él el
     orden lo decide el motor y dos recargas seguidas pintan la lista distinta.
     Las fechas son `YYYY-MM-DD`, así que el orden alfabético ES el
     cronológico. */
  return out.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.clave.localeCompare(b.clave)));
}

/* ══════════════════════════════════════════════════════════════════════════
   LOS SILENCIOS TAMBIÉN SON LA HISTORIA

   En un fondo con problemas, lo que más pesa no es lo que se dijo: es el
   tiempo en que nadie dijo nada. Entre el requerimiento de marzo de 2025 y el
   siguiente movimiento pasaron meses, y esa distancia —que en una lista de
   filas iguales no se ve— es justo lo que explica el expediente.

   Así que entre dos hitos separados por más de un mes se mete un tramo de
   silencio, con cuánto duró. No es adorno: leído de arriba abajo, un fondo se
   entiende por sus huecos.

   ── EL PRIMER SILENCIO ES EL DE AHORA ──
   El hueco entre HOY y lo último que pasó es el que importa mientras el fondo
   sigue abierto: «llevamos cuatro meses sin novedades» es una frase que hay
   que poder leer sin restar fechas a mano.
   ══════════════════════════════════════════════════════════════════════════ */

export type Tramo =
  | { tipo: "hito"; hito: Hito }
  /** El hueco entre dos hitos. `hasta` es el más reciente de los dos. */
  | { tipo: "silencio"; desde: string; hasta: string; dias: number; hastaHoy: boolean };

/** «45 días», «4 meses», «1 año y 2 meses». En meses a partir del mes y medio:
 *  «73 días» obliga a dividir mentalmente, y lo que se quiere saber es si fue
 *  mucho o poco. */
export function duracion(dias: number): string {
  if (dias < 45) return `${dias} días`;
  const meses = Math.round(dias / 30.44);
  if (meses < 12) return `${meses} mes${meses > 1 ? "es" : ""}`;
  const a = Math.floor(meses / 12), m = meses % 12;
  return `${a} año${a > 1 ? "s" : ""}${m ? ` y ${m} mes${m > 1 ? "es" : ""}` : ""}`;
}

/**
 * La misma línea con los silencios intercalados, de lo más nuevo a lo más
 * viejo. `minDias` es a partir de cuándo un hueco merece contarse: por debajo
 * de un mes, un fondo simplemente no tiene novedades todos los días.
 */
export function conSilencios(
  hitos: Hito[], hoy: string = hoyLima(), minDias = 31,
): Tramo[] {
  const out: Tramo[] = [];
  if (!hitos.length) return out;

  /* El hueco de arriba: desde lo último que pasó hasta hoy. */
  const dHoy = diasHasta(hoy, hitos[0].fecha);
  if (dHoy >= minDias) {
    out.push({ tipo: "silencio", desde: hitos[0].fecha, hasta: hoy, dias: dHoy, hastaHoy: true });
  }
  for (let i = 0; i < hitos.length; i++) {
    out.push({ tipo: "hito", hito: hitos[i] });
    const sig = hitos[i + 1];
    if (!sig) continue;
    const d = diasHasta(hitos[i].fecha, sig.fecha);
    if (d >= minDias) {
      out.push({ tipo: "silencio", desde: sig.fecha, hasta: hitos[i].fecha, dias: d, hastaHoy: false });
    }
  }
  return out;
}

/**
 * Lo que hay que contestar: cartas con plazo y sin respuesta.
 *
 * Se cuenta aparte de la línea de tiempo a propósito. La línea mira al pasado;
 * esto mira al calendario, y es lo único de esta pantalla que puede convertirse
 * en una sanción.
 */
export function porResponder(hitos: Hito[], hoy: string = hoyLima()) {
  const pend = hitos.filter(h => h.vence && !h.resuelto);
  /* Solo dos grupos: lo pendiente y lo que ya se pasó de plazo. Hubo un tercero
     —«vence en menos de siete días»— y se quitó antes de nacer: ninguna
     pantalla lo usaba, y un dato que se calcula y no se enseña es una promesa
     que alguien va a creerse al leer el código. */
  return { todas: pend, vencidas: pend.filter(h => (h.vence as string) < hoy) };
}

/** Cuántos días faltan para una fecha. Negativo si ya pasó.
 *  Se cuenta a mediodía para que el cambio de horario no reste un día. */
export function diasHasta(fecha: string, hoy: string = hoyLima()): number {
  const a = new Date(`${fecha}T12:00:00`).getTime();
  const b = new Date(`${hoy}T12:00:00`).getTime();
  return Math.round((a - b) / 86400000);
}

/** «en 3 días», «hoy», «hace 12 días». Para el reloj de un requerimiento. */
export function cuandoVence(fecha: string, hoy: string = hoyLima()): string {
  const d = diasHasta(fecha, hoy);
  if (d === 0) return "vence hoy";
  if (d === 1) return "vence mañana";
  if (d > 1) return `vence en ${d} días`;
  if (d === -1) return "venció ayer";
  return `venció hace ${-d} días`;
}
