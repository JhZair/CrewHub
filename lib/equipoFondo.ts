/* ── QUIÉN TRABAJA EN ESTE FONDO — el cruce, en un solo sitio ──
 *
 * La pregunta que esta pantalla existe para contestar no es «¿quiénes son?».
 * Es: **¿cuadra a quién dijimos que íbamos a convocar con a quién le estamos
 * girando recibos?** Esa es la coherencia que DAFO revisa al leer la
 * rendición, y hasta ahora vivía en la cabeza de quien armó el equipo.
 *
 * Tres listas que hay que casar, y cada una es de una naturaleza distinta:
 *
 *   1. EL EQUIPO DE POSTULACIÓN — lo que se DECLARÓ al concurso. Es una
 *      promesa firmada: está en el expediente y no cambia.
 *   2. LOS RHE GIRADOS — lo que PASÓ. Es el hecho más duro que hay aquí:
 *      hay un recibo, con su número y su monto.
 *   3. EL PERSONAL PREVISTO — lo que se PIENSA hacer. Es intención, y por eso
 *      es lo único que hay que escribir a mano (`equipo_fondo`).
 *
 * ── LA REGLA QUE ORDENA TODO ──
 * Manda el hecho. Si alguien tiene un recibo girado en este fondo, TRABAJÓ
 * aquí — esté o no en la lista declarada, lo haya apuntado alguien o no. Por
 * eso la nómina no se mantiene a mano: sale sola de los recibos, y a mano solo
 * se añade lo que todavía no ha ocurrido.
 *
 * Es el mismo principio que lib/pagos.ts («manda el hecho, no la bandera») y
 * que lib/caja.ts. Una lista de personal que hay que recordar actualizar es
 * una lista que a los tres meses miente.
 *
 * No importa nada de Supabase: lo usan el servidor y el cliente, y una regla
 * escrita dos veces se corrige en una.
 */

import { rangoRol } from "@/lib/rolesEquipo";

export type PersonaMin = {
  id: string;
  nombre: string;
  alias?: string | null;
  foto_url?: string | null;
  /* ── LO QUE PIDE EL INFORME, NO LO QUE PIDE LA PANTALLA ──
   * El alias basta para hablar entre nosotros —«GabyM»— y no basta para nada
   * más. El informe económico de DAFO se lee con nombres completos, y los
   * recibos por honorarios llevan el domicilio del emisor: cuando toca armar
   * la rendición, esos datos se buscaban abriendo la ficha de cada persona,
   * una por una, veintitrés veces. Esta lista es justamente donde están las
   * veintitrés.
   * `tipo` no es adorno: distingue al equipo estable del colaborador eventual,
   * y de eso depende qué se le reclama a cada uno (un CV con enfoque a quien
   * hizo un flete es la clase de aviso que enseña a ignorar todos los avisos).
   */
  tipo?: string | null;
  ruc_dni?: string | null;
  direccion?: string | null;
  distrito?: string | null;
  provincia?: string | null;
  region?: string | null;
  /** La suspensión de 4ta: el AÑO (que es el hecho — caduca cada 31/12) y la
   *  constancia del Formulario 1609 que lo prueba. */
  suspension_4ta_anio?: number | null;
  suspension_4ta_url?: string | null;
  /** El HISTORIAL, una fila por año (db/suspension-4ta-anios.sql). Es la
   *  fuente buena: las dos columnas de arriba son solo su año más reciente,
   *  que contesta «¿está cubierta hoy?» y no «¿lo estaba en 2024?».
   *  Opcional a propósito: sin la migración corrida llega vacío y la regla de
   *  abajo cae a la columna — degradada, pero sin romperse. */
  suspensiones?: { anio: number; url?: string | null }[];
};

/* ── EL DOMICILIO, EN UNA LÍNEA Y EN EL ORDEN DE AQUÍ ──
 * Distrito, provincia, departamento: es como se escribe una dirección en el
 * Perú y como la piden los formatos. Invertirlo obliga a releer.
 * Devuelve "" cuando no hay nada, y quien lo use decide qué decir — un guion
 * en pantalla y un hueco en el informe no son la misma decisión. */
export const domicilioDe = (p?: PersonaMin | null) =>
  [p?.direccion, [p?.distrito, p?.provincia, p?.region].filter(Boolean).join(", ")]
    .filter(Boolean).join(" · ");

/* ── ¿LA SUSPENSIÓN CUBRE LOS RECIBOS DE ESTA PERSONA? ──
 *
 * Los 26 recibos de este fondo tienen retención CERO. Eso solo es correcto si
 * quien emitió tenía la suspensión de 4ta vigente EL AÑO DE CADA RECIBO — y la
 * suspensión caduca cada 31 de diciembre, así que no es una propiedad de la
 * persona sino de la pareja (persona, año).
 *
 * Por eso no basta con enseñar «tiene suspensión ✓». Alguien con la constancia
 * de 2026 y un recibo de 2024 se vería en verde y estaría igual de descubierto:
 * el 8 % de ese recibo lo terminaría poniendo la asociación. Es justo el error
 * que una casilla de «sí/no» produce y que una lista de años impide.
 *
 * ── PERO LA FICHA SOLO GUARDA UN AÑO, Y ESO LIMITA LO QUE SE PUEDE AFIRMAR ──
 * `personas.suspension_4ta_anio` guarda UNO: el último. Así que de un recibo
 * de otro año esta función NO puede decir si está descubierto — solo que la
 * ficha no lo prueba. Son cosas distintas y confundirlas sale caro en la
 * dirección contraria a la que uno teme:
 *
 * Probado con PO-003, tratar «año distinto» como «descubierto» daba 8 personas
 * y S/ 55,870 en riesgo. El hueco real, contando las constancias que SÍ
 * existen en Drive aunque la ficha no pueda almacenarlas, es de S/ 9,970. Un
 * aviso que exagera por cinco no se corrige: se ignora, y con él se ignoran
 * los cuatro casos que sí eran verdad.
 *
 * Por eso `faltan` se devuelve, pero como DATO para matizar, no como alarma.
 * La única alarma que esta función se permite es `sinConstancia`, que es un
 * hecho duro: no hay ningún papel, de ningún año.
 */
export function coberturaSuspension(x: Integrante): {
  anio: number | null;
  url: string | null;
  /** ¿Estamos leyendo el historial por año o solo la columna vieja? De esto
   *  depende si `faltan` es una alarma o un «no lo puedo probar». */
  hayHistorial: boolean;
  anios: number[];
  urlDe: (a: number) => string | null;
  /** HECHO DURO: no hay constancia de ningún año. Esto sí es una alarma. */
  sinConstancia: boolean;
  /** Años de sus recibos sin cubrir. Con historial es un hecho; sin él, solo
   *  significa que la ficha no lo prueba. */
  faltan: number[];
} {
  const hist = x.persona.suspensiones || [];
  /* Con historial, «cubierto» es pertenecer al conjunto de años. Sin él, se
     compara contra el único año que hay — y entonces `faltan` deja de ser una
     afirmación sobre la realidad y pasa a ser «esto no lo puedo probar». La
     pantalla distingue los dos casos con `hayHistorial`. */
  const anios = new Set(hist.map(h => h.anio));
  const anio = hist.length
    ? Math.max(...hist.map(h => h.anio))
    : (x.persona.suspension_4ta_anio ?? null);
  const url = hist.length
    ? (hist.find(h => h.anio === anio)?.url || null)
    : (x.persona.suspension_4ta_url || null);
  const aniosRecibo = [...new Set(x.rhes
    .map(r => parseInt(String(r.fecha || "").slice(0, 4), 10))
    .filter(a => !isNaN(a)))].sort();
  const cubre = (a: number) => hist.length ? anios.has(a) : a === anio;
  return {
    anio, url,
    hayHistorial: hist.length > 0,
    /** Todos los años con constancia, para poder enseñarlos. */
    anios: [...anios].sort(),
    /** Qué constancia cubre cada año de recibo (para enlazar la correcta). */
    urlDe: (a: number) => hist.find(h => h.anio === a)?.url || null,
    sinConstancia: !anio,
    faltan: anio ? aniosRecibo.filter(a => !cubre(a)) : [],
  };
}

export type FilaEquipoPost = { cargo?: string | null; persona?: any };
export type FilaRhe = {
  id: string; persona_id?: string | null;
  fecha?: string | null; monto?: number | string | null;
  numero?: string | null; url?: string | null;
  /* Los dos ejes de clasificación de un gasto. Estaban en la tabla y en la
     pantalla de rendición desde siempre, y este módulo no los conocía: la
     pestaña de Equipo solo sabía sumar por persona. */
  etapa?: string | null; rubro_item?: string | null;
};
export type FilaPrevista = {
  id: string; persona_id: string; cargo?: string | null; nota?: string | null;
};

/** En qué situación está cada persona respecto de este fondo. */
export type Situacion =
  /** Declarada en la postulación y con recibos girados: lo esperado. */
  | "declarado_girado"
  /** Declarada en la postulación y todavía sin ningún recibo. */
  | "declarado_sin_girar"
  /** No estaba declarada, pero tiene recibos: entró durante la ejecución. */
  | "girado_no_declarado"
  /** Apuntada a mano y aún sin recibos: es una previsión, no un hecho. */
  | "previsto";

export type Integrante = {
  persona: PersonaMin;
  /** El cargo declarado en la postulación manda sobre el apuntado a mano: uno
   *  está firmado en el expediente y el otro es una nota nuestra. */
  cargo: string;
  situacion: Situacion;
  /** Sus recibos en ESTE fondo. */
  rhes: FilaRhe[];
  total: number;
  /** La fila de `equipo_fondo`, si se apuntó a mano (para poder editarla). */
  filaId?: string | null;
  nota?: string | null;
};

const n = (v: any) => Number(v) || 0;
const un1 = (v: any) => (Array.isArray(v) ? v[0] : v);

export const nombreCorto = (p?: PersonaMin | null) =>
  (p?.alias || p?.nombre || "—");

/* Reparte a todo el mundo en su situación. Una sola pasada y un solo mapa por
   persona: si esto se hiciera con tres listas separadas, alguien podría salir
   en dos —y el descuadre se contaría dos veces. */
export function integrantesDeFondo(
  equipoPost: FilaEquipoPost[],
  rhes: FilaRhe[],
  previstos: FilaPrevista[],
  /** Catálogo para poner nombre a los previstos y a los que salen del RHE. */
  personas: PersonaMin[],
): Integrante[] {
  const porId = new Map<string, PersonaMin>();
  personas.forEach(p => { if (p?.id) porId.set(p.id, p); });

  /* Los recibos, agrupados por persona. Es la base del cruce: todo lo demás se
     compara contra esto. */
  const rhePor = new Map<string, FilaRhe[]>();
  rhes.forEach(r => {
    const pid = r.persona_id || "";
    if (!pid) return;                     // un recibo sin persona no dice de quién es
    rhePor.set(pid, [...(rhePor.get(pid) || []), r]);
  });

  const salida = new Map<string, Integrante>();

  const meter = (p: PersonaMin, cargo: string, situacion: Situacion,
    filaId?: string | null, nota?: string | null) => {
    const rs = rhePor.get(p.id) || [];
    salida.set(p.id, {
      persona: p, cargo, situacion, rhes: rs,
      total: rs.reduce((s, r) => s + n(r.monto), 0),
      filaId: filaId || null, nota: nota || null,
    });
  };

  // 1. Lo declarado manda sobre lo demás: su cargo está en el expediente.
  equipoPost.forEach(f => {
    const p = un1(f.persona) as PersonaMin | null;
    if (!p?.id || salida.has(p.id)) return;
    const tiene = (rhePor.get(p.id) || []).length > 0;
    meter(p, (f.cargo || "").trim() || "—",
      tiene ? "declarado_girado" : "declarado_sin_girar");
  });

  // 2. Los apuntados a mano que no estaban declarados.
  previstos.forEach(f => {
    const p = porId.get(f.persona_id);
    if (!p || salida.has(p.id)) return;
    const tiene = (rhePor.get(p.id) || []).length > 0;
    /* Con recibo ya no es una previsión: es un hecho, y se dice como tal. La
       fila apuntada a mano se conserva (por su cargo y su nota) pero no
       decide la situación — el recibo sí. */
    meter(p, (f.cargo || "").trim() || "—",
      tiene ? "girado_no_declarado" : "previsto", f.id, f.nota);
  });

  /* 3. Y los que aparecen SOLOS, por tener un recibo. Nadie los apuntó: los
        trajo la contabilidad, que es la fuente más fiable que hay aquí. */
  rhePor.forEach((_, pid) => {
    if (salida.has(pid)) return;
    const p = porId.get(pid);
    if (!p) return;    // persona borrada: su recibo sigue, pero no hay a quién nombrar
    meter(p, "—", "girado_no_declarado");
  });

  return [...salida.values()];
}

/* ── EL MISMO EQUIPO, VISTO POR ETAPA O POR RUBRO ──
 *
 * La lista general responde «¿a quién se le giró y cuánto?». Estas dos
 * responden otra cosa: «¿en qué se fue la plata de postproducción?», «¿quién
 * cobró contra Recursos Técnicos?». Es la pregunta que hace DAFO al leer la
 * rendición, y hasta ahora se contestaba exportando los recibos a mano.
 *
 * ── SE AGRUPAN RECIBOS, NO PERSONAS ──
 * Y por eso la misma persona puede salir en dos etapas: no es una repetición,
 * es que cobró en las dos, con montos distintos. Cada aparición lleva SOLO los
 * recibos de ese grupo y SU subtotal — si arrastrara el total de la persona,
 * las columnas sumarían más que el fondo y nadie sabría por qué.
 *
 * ── LO QUE NO ESTÁ CLASIFICADO SE DICE ──
 * Un recibo sin etapa (o sin rubro) va a su propio grupo, al final y con
 * nombre propio. Repartirlo «por si acaso» o esconderlo daría una vista que
 * cuadra y miente; así el hueco se ve y se puede cerrar, que es justo el
 * trabajo que queda pendiente en este fondo.
 */
export type AparicionEnGrupo = {
  /** La persona con SUS recibos de este grupo y el subtotal de ellos. Tiene la
   *  forma de un `Integrante` para poder pintarse con la misma fila. */
  integrante: Integrante;
};
export type GrupoEquipo = {
  clave: string;
  nombre: string;
  gente: AparicionEnGrupo[];
  total: number;
  recibos: number;
};

export type EjeEquipo = "etapa" | "rubro_item";

export function agruparEquipo(
  integrantes: Integrante[],
  eje: EjeEquipo,
  /** El catálogo del fondo, para nombrar y ORDENAR: las etapas se leen en su
   *  orden de producción, no alfabético, y los rubros en el del presupuesto. */
  catalogo: { id: string; nombre: string }[],
): { grupos: GrupoEquipo[]; sinRecibos: Integrante[] } {
  const sinRecibos = integrantes.filter(x => x.rhes.length === 0);
  const porClave = new Map<string, GrupoEquipo>();

  const grupo = (clave: string) => {
    let g = porClave.get(clave);
    if (!g) {
      g = {
        clave,
        nombre: clave
          ? (catalogo.find(c => c.id === clave)?.nombre || clave)
          : (eje === "etapa" ? "Sin etapa asignada" : "Sin rubro asignado"),
        gente: [], total: 0, recibos: 0,
      };
      porClave.set(clave, g);
    }
    return g;
  };

  for (const x of integrantes) {
    if (!x.rhes.length) continue;
    /* Los recibos de esta persona, repartidos por el eje. Se agrupan primero y
       se crea UNA aparición por grupo: hacerlo al revés —una por recibo—
       enseñaría tres veces a la misma persona dentro de la misma etapa. */
    const porGrupo = new Map<string, FilaRhe[]>();
    for (const r of x.rhes) {
      const k = String((r as any)[eje] || "").trim();
      porGrupo.set(k, [...(porGrupo.get(k) || []), r]);
    }
    porGrupo.forEach((rs, k) => {
      const g = grupo(k);
      const total = rs.reduce((s, r) => s + n(r.monto), 0);
      g.gente.push({ integrante: { ...x, rhes: rs, total } });
      g.total += total;
      g.recibos += rs.length;
    });
  }

  /* Orden: el del catálogo; lo que no esté en él, detrás y por monto; y el
     grupo sin clasificar SIEMPRE el último — es un pendiente, no una etapa. */
  const pos = new Map(catalogo.map((c, i) => [c.id, i]));
  const grupos = [...porClave.values()].sort((a, b) => {
    if (!a.clave) return 1;
    if (!b.clave) return -1;
    const pa = pos.has(a.clave) ? pos.get(a.clave)! : 9999;
    const pb = pos.has(b.clave) ? pos.get(b.clave)! : 9999;
    return pa - pb || b.total - a.total;
  });
  // Dentro de cada grupo, quien más cobró primero: es como se lee una nómina.
  grupos.forEach(g => g.gente.sort((a, b) => b.integrante.total - a.integrante.total));
  return { grupos, sinRecibos };
}

export const META_SITUACION: Record<Situacion, {
  ico: string; txt: string; col: string; ayuda: string;
}> = {
  declarado_girado: {
    ico: "✅", txt: "declarado y girado", col: "var(--green)",
    ayuda: "Se presentó con la postulación y tiene recibos en este fondo. Es lo que DAFO espera encontrar.",
  },
  declarado_sin_girar: {
    ico: "○", txt: "declarado, sin recibos", col: "var(--dim)",
    ayuda: "Se declaró en la postulación y todavía no se le ha girado nada. No es un problema por sí solo —puede que su etapa no haya llegado— pero al cerrar la rendición conviene poder explicarlo.",
  },
  /* ── ESTO NO ES UNA ANOMALÍA, Y DEJÓ DE PINTARSE COMO TAL ──
     Decía «⚠ cobró sin estar declarado» en ámbar, y era un mal aviso por dos
     razones a la vez.
     Primera: no describe un problema. Un fondo de dos años suma gente por
     definición —el sonidista de una semana, la traductora de tres jornadas—;
     que alguien no estuviera en el formulario del concurso es lo esperado, no
     una irregularidad que haya que justificar.
     Segunda, y peor: saltaba en 17 de 20 filas. Un aviso que se enciende en el
     85 % de los casos deja de señalar y pasa a ser el fondo de pantalla; y con
     él se aprende a saltarse el ámbar de al lado, que sí marca hechos duros
     («sin DNI», «sin domicilio», «sin constancia de 4ta»).
     Queda como dato neutro, que es lo que es: entró durante la ejecución. La
     sección donde vive ya lo dice, así que aquí solo se confirma. */
  girado_no_declarado: {
    ico: "·", txt: "se sumó en la ejecución", col: "var(--dim)",
    ayuda: "Tiene recibos girados en este fondo y no figuraba en el equipo presentado al concurso. Es lo normal: el equipo crece durante los dos años de ejecución. Lo único que conviene es que su cargo esté escrito, para poder explicarlo si lo preguntan.",
  },
  previsto: {
    ico: "·", txt: "previsto", col: "var(--blue)",
    ayuda: "Apuntado a mano como alguien con quien se piensa trabajar. Todavía no tiene recibos: es una previsión, no un hecho.",
  },
};

/* ── EL ORDEN: JERARQUÍA DE ROL, COMO EN TODAS PARTES ──
 *
 * La primera versión ordenaba por «lo que hay que mirar»: el descuadre arriba,
 * la directora donde cayera. Suena razonable y se lee mal — un equipo se lee
 * como una nómina, y una nómina que no empieza por dirección obliga a buscar
 * a la directora en una lista de veinte. Además la ficha de la postulación
 * ordena por jerarquía (lib/rolesEquipo → `ordenarEquipo`), así que la misma
 * gente salía en dos órdenes distintos según la pestaña: eso no es criterio,
 * es desconcierto.
 *
 * El descuadre no necesitaba el primer puesto para verse. Está contado arriba
 * («⚠ 1 cobró sin estar declarado») y marcado en su propia fila; subirlo a la
 * cabecera era gritar dos veces lo mismo a cambio de romper la lectura.
 *
 * A igual rango, primero quien más ha cobrado: dentro de un montón de cargos
 * sin jerarquía —lo que llega por un recibo no trae cargo— el monto es lo que
 * ordena de mayor a menor importancia real.
 */
export const ordenarIntegrantes = (xs: Integrante[]): Integrante[] =>
  [...xs].sort((a, b) =>
    rangoRol(a.cargo) - rangoRol(b.cargo) ||
    b.total - a.total ||
    nombreCorto(a.persona).localeCompare(nombreCorto(b.persona)));

/* El resumen de arriba. Son los tres números que contestan «¿esto cuadra?»
   sin tener que leer la lista entera. */
export function resumenEquipo(xs: Integrante[]) {
  const cuenta = (s: Situacion) => xs.filter(x => x.situacion === s).length;
  return {
    total: xs.length,
    girados: xs.filter(x => x.rhes.length > 0).length,
    montoGirado: xs.reduce((s, x) => s + x.total, 0),
    sinDeclarar: cuenta("girado_no_declarado"),
    declaradosSinGirar: cuenta("declarado_sin_girar"),
    previstos: cuenta("previsto"),
    /* ── QUIÉN COBRÓ SIN NINGUNA CONSTANCIA ──
       Solo cuenta a quien NO tiene ninguna, de ningún año. Es lo único que
       esta cabecera puede afirmar sin mentir.
       La versión anterior contaba también a quien tuviera la constancia de un
       año distinto al del recibo, y probada contra PO-003 daba 8 personas y
       S/ 55,870 «en riesgo» cuando el hueco real era de S/ 9,970: las otras
       constancias existen, solo que la ficha guarda un año y no cabe más de
       una. Un contador que multiplica por cinco no se corrige, se ignora. */
    /* ── LO QUE NO TIENE CON QUÉ JUSTIFICAR LA RETENCIÓN CERO ──
       Con el historial por año (db/suspension-4ta-anios.sql) esto ya es un
       hecho y no una sospecha, así que suma SOLO los recibos descubiertos —no
       todo lo de la persona—: quien tiene 2025 y giró en 2024 y 2025 tiene un
       recibo en el aire, no tres. Inflarlo haría que nadie se lo creyera, que
       es lo que pasaba con la versión de una sola columna.
       Sin historial se limita a contar a quien no tiene NADA, que es lo único
       que una columna puede afirmar sin mentir. */
    sinSuspension: xs.filter(x => x.rhes.length > 0 &&
      coberturaSuspension(x).faltan.length + (coberturaSuspension(x).sinConstancia ? 1 : 0) > 0).length,
    montoSinSuspension: xs.reduce((acc, x) => {
      if (!x.rhes.length) return acc;
      const c = coberturaSuspension(x);
      if (c.sinConstancia) return acc + x.total;
      if (!c.hayHistorial) return acc;          // no se puede afirmar: no se suma
      const malos = new Set(c.faltan);
      return acc + x.rhes
        .filter(r => malos.has(parseInt(String(r.fecha || "").slice(0, 4), 10)))
        .reduce((t, r) => t + n(r.monto), 0);
    }, 0),
  };
}
