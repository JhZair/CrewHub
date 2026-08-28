/* ══════════════════════════════════════════════════════════════════════════
   CORRER EL CRONOGRAMA — el plan, antes de tocar una sola fecha

   «El rodaje empieza el 7 de septiembre y no el 20 de agosto.» Dicho así son
   dieciocho días de diferencia y veintitantas actividades que hay que reescribir
   una por una, cada una con su inicio y su fin, sin equivocarse.

   Esto lo hace de una vez. Y lo hace ENSEÑANDO ANTES lo que va a pasar.

   ── POR QUÉ ESTE ARCHIVO NO ESCRIBE NADA ──
   Devuelve un PLAN: qué se mueve, qué se queda, cuántos días y qué avisos
   salen. La pantalla lo pinta y la acción lo aplica. Un desplazamiento en
   cascada toca decenas de filas de golpe y no hay «deshacer»: si el único sitio
   donde se puede mirar es después, se mira después.

   ── DE DÓNDE SALE ESTO ──
   De haberlo hecho tres veces a mano en SQL: db/crono-correr-po003.sql,
   db/crono-mover-po001.sql, db/crono-arreglar-po003.sql. Cada uno con su
   verificación previa, su idempotencia y su párrafo de «lo que esto deja fuera
   de plazo, dicho aquí». Las cuatro guardas de abajo son las de esos archivos,
   convertidas en código para no volver a escribirlas a mano cada vez.

   ⚠ NO IMPORTA NADA DE SUPABASE.
   ══════════════════════════════════════════════════════════════════════════ */

import { type Etapa } from "@/lib/etapas";

/** Lo mínimo que este archivo necesita saber de una actividad. Deliberadamente
 *  corto: cuanto menos pida, más sitios pueden usarlo y menos se rompe cuando
 *  la tabla crezca. */
export type ActCorrer = {
  id: string;
  nombre: string;
  etapa: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado?: string | null;
};

/** Una fila del plan: dónde estaba y dónde queda. El desplazamiento no viaja
 *  en cada fila porque es el MISMO para todas —el bloque se mueve entero y cada
 *  actividad conserva su duración—; vive una sola vez, en `Plan.dias`. */
export type Movimiento = {
  act: ActCorrer;
  ini: string;
  fin: string;
  iniViejo: string;
  finViejo: string;
};

/** Una fila que NO se mueve, y por qué. El «por qué» va aquí y no en un
 *  comentario: quien mira la previsualización tiene que poder discutirlo. */
export type Quieta = {
  act: ActCorrer;
  motivo: "anterior" | "finalizada" | "cancelada" | "sin-fecha" | "etapa-desconocida" | "sin-etapa";
};

export type Aviso = {
  /** `alto` corta el paso; `medio` se enseña y se puede seguir. */
  nivel: "alto" | "medio";
  texto: string;
};

export type Plan = {
  /** Días de desplazamiento. Positivo = se atrasa; negativo = se adelanta. */
  dias: number;
  /** La actividad cuya fecha de inicio se lleva a la fecha pedida. Es el ancla:
   *  todo lo demás se mueve exactamente lo mismo que ella. */
  ancla: ActCorrer | null;
  mueve: Movimiento[];
  quietas: Quieta[];
  avisos: Aviso[];
  /** El rango del cronograma antes y después, para el «de … a …» de la
   *  cabecera. Null si no hay ninguna fecha. */
  antes: { desde: string; hasta: string } | null;
  despues: { desde: string; hasta: string } | null;
  /** Si esto se puede aplicar. Falso cuando hay algún aviso `alto` — y los
   *  casos de «no hay nada que mover» producen uno, así que también quedan
   *  fuera. Se deriva de los avisos y no de dos condiciones sueltas: con dos,
   *  un camino nuevo que se olvide de la segunda devuelve `viable: true` con la
   *  lista vacía. */
  viable: boolean;
};

const D = 86400000;

/* ── EL TOPE DE DESPLAZAMIENTO ──
 * Diez años. No es una regla de negocio: es un detector de erratas.
 * Un `<input type="date">` acepta el año `0007` —teclear «7» en el segmento del
 * año y tabular—, y `^\d{4}-\d{2}-\d{2}$` lo da por bueno: sale un
 * desplazamiento de 737.402 días y toda la tabla se reescribe en el siglo I.
 * Lo que lo hacía indetectable es que la previsualización rotulaba «20 ago. →
 * 12 sept.», sin año, porque el año jamás cambia en un caso real.
 * Se arregla por los dos lados: aquí se corta el paso, y la pantalla escribe el
 * año. Ninguna reprogramación de un fondo público mueve nada una década. */
export const TOPE_DIAS = 3650;

/* ── ARITMÉTICA DE FECHAS A MEDIODÍA ──
 * Todas las cuentas se hacen sobre `T12:00:00` y no sobre la medianoche.
 * Motivo: `new Date("2026-09-07")` se interpreta como medianoche UTC, que en
 * Lima (UTC-5) es el 6 de septiembre a las 7 pm — o sea, el día ANTERIOR. Sumar
 * días desde ahí y recortar a diez caracteres devuelve fechas corridas un día,
 * y el error no aparece hasta que alguien coteja el cronograma con el acta.
 * A mediodía sobra margen para cualquier huso y el redondeo nunca cruza. */
const aMs = (iso: string) => new Date(iso + "T12:00:00").getTime();
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Sumar días a una fecha ISO. Naturales, no hábiles: en rodaje se trabaja el
 *  sábado, y saltar el fin de semana sería inventarse un calendario que nadie
 *  pidió. Los domingos se AVISAN más abajo, que es distinto de esquivarlos. */
export const masDias = (iso: string, n: number) => aIso(aMs(iso) + n * D);

/** Diferencia en días entre dos fechas ISO. */
export const difDias = (a: string, b: string) => Math.round((aMs(b) - aMs(a)) / D);

const esDomingo = (iso: string) => new Date(iso + "T12:00:00").getUTCDay() === 0;

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/* ══════════════ EL ALCANCE ══════════════ */

export type Alcance =
  /** Esa etapa y todas las posteriores. Lo normal: si el rodaje se atrasa dos
   *  semanas, la postproducción también. */
  | { modo: "desde-etapa"; etapa: string }
  /** Solo esa etapa. Lo demás se queda y puede solaparse: se avisa. */
  | { modo: "solo-etapa"; etapa: string }
  /** El cronograma entero. Es lo que hicieron crono-correr-po003 y
   *  crono-mover-po001, y sirve cuando lo que cambió fue el desembolso. */
  | { modo: "todo" };

/** El orden de una etapa dentro del preset de la categoría. −1 si no está.
 *  ⚠ Es una función y no un mapa suelto porque el preset cambia con la
 *  categoría de la convocatoria: el mismo `produccion` es la tercera etapa en
 *  cine y la sexta en Video y Cine Indígena. Un mapa global habría hecho que el
 *  corte «desde rodaje» arrastrara etapas distintas según el fondo. */
export const ordenEtapa = (clave: string | null, etapas: Etapa[]) =>
  etapas.findIndex(e => e.clave === (clave || ""));

/* ══════════════ EL PLAN ══════════════ */

export function planear(
  acts: ActCorrer[],
  etapas: Etapa[],
  alcance: Alcance,
  fechaDestino: string,
  opciones: {
    /** El tope del acta: `fecha_limite_rendicion` o la prórroga si la hay. Si
     *  el nuevo final lo rebasa, se dice — que es exactamente lo que hubo que
     *  escribir a mano en la cabecera de crono-correr-po003. */
    limite?: string | null;
    /** Rótulo del límite, SIN artículo: «plazo del acta», «prórroga». Las
     *  frases de abajo lo contraen («del plazo del acta»), y con el artículo
     *  dentro salía «después de el plazo del acta». */
    limiteNombre?: string;
    /** Mover también las finalizadas. Por defecto NO: una actividad finalizada
     *  no es un plan, es el registro de lo que ya ocurrió, y sus fechas cuadran
     *  con los RHE y los comprobantes. */
    moverHechas?: boolean;
    /** Hoy, en Lima. Solo lo usa el aviso de «finalizada que aún no ha
     *  llegado». Se PASA en vez de leer el reloj aquí para que este archivo
     *  siga siendo aritmética pura y se pueda probar con cualquier fecha. */
    hoy?: string;
  } = {},
): Plan {
  const vacio = (avisos: Aviso[]): Plan => ({
    dias: 0, ancla: null, mueve: [], quietas: [], avisos,
    antes: null, despues: null, viable: false,
  });

  if (!ES_FECHA.test(fechaDestino)) {
    return vacio([{ nivel: "alto", texto: "Elige la fecha nueva." }]);
  }

  /* ── QUIÉN ENTRA EN EL BLOQUE ──
   * Por etapa, según el orden del preset. Las que no tienen fecha de inicio no
   * se pueden mover —no hay desde dónde— y las huérfanas (etapa que el preset
   * no reconoce) tampoco: mover a ciegas una fila que no sé dónde va en el
   * flujo es peor que dejarla y decirlo. */
  const corte = alcance.modo === "todo" ? -1 : ordenEtapa(alcance.etapa, etapas);
  if (alcance.modo !== "todo" && corte < 0) {
    return vacio([{ nivel: "alto", texto: "Esa etapa no es de esta categoría." }]);
  }

  const enBloque = (a: ActCorrer): boolean => {
    if (alcance.modo === "todo") return true;
    const o = ordenEtapa(a.etapa, etapas);
    if (o < 0) return false;                       // huérfana: se dice aparte
    return alcance.modo === "solo-etapa" ? o === corte : o >= corte;
  };

  const quietas: Quieta[] = [];
  const candidatas: ActCorrer[] = [];

  for (const a of acts) {
    const est = (a.estado || "").toLowerCase();
    if (est === "cancelada") { quietas.push({ act: a, motivo: "cancelada" }); continue; }
    if (!a.fecha_inicio || !ES_FECHA.test(a.fecha_inicio)) {
      quietas.push({ act: a, motivo: "sin-fecha" }); continue;
    }
    if (!enBloque(a)) {
      /* Tres motivos distintos y no uno: «es de una etapa anterior» es normal,
         «su etapa no está en el preset» es un problema de datos —suele venir de
         cambiarle la categoría a la convocatoria— y «no tiene etapa» es un
         hueco. Meterlas todas en «anterior» escondería las dos últimas.
         ⚠ Sin etapa NO es «etapa ajena a la categoría»: no es ajena, no la
         tiene, y el rótulo mandaba a buscar un problema que no existe. */
      const fuera = alcance.modo !== "todo" && ordenEtapa(a.etapa, etapas) < 0;
      quietas.push({
        act: a,
        motivo: !fuera ? "anterior" : a.etapa ? "etapa-desconocida" : "sin-etapa",
      });
      continue;
    }
    if (est === "finalizada" && !opciones.moverHechas) {
      quietas.push({ act: a, motivo: "finalizada" }); continue;
    }
    candidatas.push(a);
  }

  if (!candidatas.length) {
    return vacio([{ nivel: "alto", texto: "No hay ninguna actividad que mover con ese alcance." }]);
  }

  /* ══════════════ EL ANCLA ══════════════
   * La actividad cuya fecha de inicio se lleva al destino. Todo lo demás se
   * desplaza exactamente lo mismo que ella.
   *
   * ⚠ SALE DE LA ETAPA QUE SE NOMBRÓ, NO DEL BLOQUE ENTERO.
   * Parece un detalle y es el fallo que hacía que «el rodaje empieza el 7 de
   * septiembre» acabara con el rodaje empezando el 12. En cine las etapas SE
   * SOLAPAN —el armado en set y el montaje corren durante el rodaje—, así que
   * en «desde producción» el bloque incluye una actividad de postproducción que
   * empieza ANTES que la primera de rodaje. Tomando la más temprana del bloque,
   * el ancla era esa, y la etapa que se pidió mover aterrizaba donde cayera.
   * Se escribían fechas mal que en pantalla se leían bien.
   *
   * Se toma la más temprana DE LA ETAPA NOMBRADA. Si esa etapa no tiene ninguna
   * candidata —todas finalizadas y sin marcar `moverHechas`— se cae al bloque
   * entero: mejor mover desde otra cosa, diciéndolo, que no mover nada.
   *
   * Y la más temprana por FECHA, no la primera por `orden`: el orden es de
   * presentación y se reordena a mano, así que arrastrar dos filas cambiaría el
   * desplazamiento sin que nadie tocara una fecha.
   * Empate: menor `fecha_fin`, luego el id — para que dos pasadas sobre los
   * mismos datos den siempre lo mismo. */
  const antesQue = (x: ActCorrer, y: ActCorrer) =>
    x.fecha_inicio! < y.fecha_inicio! ? -1 : x.fecha_inicio! > y.fecha_inicio! ? 1 :
      (x.fecha_fin || "") < (y.fecha_fin || "") ? -1 : (x.fecha_fin || "") > (y.fecha_fin || "") ? 1 :
        x.id < y.id ? -1 : 1;

  const deLaEtapa = alcance.modo === "todo" ? []
    : candidatas.filter(a => ordenEtapa(a.etapa, etapas) === corte);
  const ancla = [...(deLaEtapa.length ? deLaEtapa : candidatas)].sort(antesQue)[0];

  const dias = difDias(ancla.fecha_inicio!, fechaDestino);

  /* La cota, antes que nada más: con un destino disparatado el resto de los
     avisos se calculan sobre fechas del siglo I y no dicen nada útil. */
  if (Math.abs(dias) > TOPE_DIAS) {
    return {
      ...vacio([{
        nivel: "alto",
        texto: `Eso mueve el cronograma ${Math.abs(dias)} días (${fechaDestino}). Revisa la fecha: casi siempre es el año.`,
      }]),
      ancla,
    };
  }

  if (dias === 0) {
    return {
      ...vacio([{ nivel: "alto", texto: `«${ancla.nombre}» ya empieza ese día. No hay nada que correr.` }]),
      ancla,
    };
  }

  /* ── EL DESPLAZAMIENTO ──
   * El MISMO número de días para todas: el bloque se mueve entero y cada
   * actividad conserva su duración exacta. Recalcular cada fin a partir de su
   * duración en días hábiles, o reajustar los solapes, sería reprogramar — y
   * reprogramar es una decisión de producción, no una cuenta. */
  const mueve: Movimiento[] = candidatas.map(a => {
    const ini = masDias(a.fecha_inicio!, dias);
    /* Sin fin, el fin es el inicio: es lo que ya hace `editarActividadCrono`.
       Inventar una duración aquí crearía un dato que nadie escribió. */
    const finV = a.fecha_fin && ES_FECHA.test(a.fecha_fin) ? a.fecha_fin : a.fecha_inicio!;
    return { act: a, ini, fin: masDias(finV, dias), iniViejo: a.fecha_inicio!, finViejo: finV };
  });

  /* ── EL RANGO, ANTES Y DESPUÉS ──
   * Sobre TODAS las actividades con fecha, movidas o no. El rango de solo las
   * movidas diría que el cronograma empieza en el rodaje, cuando delante quedan
   * la investigación y la preproducción sin tocar. */
  const conFecha = acts.filter(a => a.fecha_inicio && ES_FECHA.test(a.fecha_inicio)
    && (a.estado || "").toLowerCase() !== "cancelada");
  const nuevaDe = new Map(mueve.map(m => [m.act.id, m]));
  const rango = (fn: (a: ActCorrer) => { i: string; f: string }) => {
    if (!conFecha.length) return null;
    const t = conFecha.map(fn);
    return {
      desde: t.reduce((m, x) => (x.i < m ? x.i : m), t[0].i),
      hasta: t.reduce((m, x) => (x.f > m ? x.f : m), t[0].f),
    };
  };
  const antes = rango(a => ({ i: a.fecha_inicio!, f: a.fecha_fin || a.fecha_inicio! }));
  const despues = rango(a => {
    const m = nuevaDe.get(a.id);
    return m ? { i: m.ini, f: m.fin } : { i: a.fecha_inicio!, f: a.fecha_fin || a.fecha_inicio! };
  });

  /* ══════════════ LOS AVISOS ══════════════ */
  const avisos: Aviso[] = [];

  /* 1 · EL PLAZO DEL ACTA.
   * El aviso que en crono-correr-po003 hubo que escribir a mano en la cabecera,
   * en catorce líneas, para que quien lo corriera supiera que el cronograma
   * terminaba veintinueve días después del vencimiento. Aquí sale solo.
   * Es MEDIO y no ALTO a propósito: pasarse del plazo puede ser justamente lo
   * que se está gestionando —se pide prórroga— y bloquearlo obligaría a
   * falsear el cronograma para poder guardarlo. */
  if (opciones.limite && ES_FECHA.test(opciones.limite) && despues) {
    const n = difDias(opciones.limite, despues.hasta);
    if (n > 0) {
      const nom = opciones.limiteNombre || "plazo";
      const yaSePasaba = antes && antes.hasta > opciones.limite;
      avisos.push({
        nivel: "medio",
        texto: yaSePasaba
          ? `El cronograma ya terminaba fuera del ${nom} (${opciones.limite}). Corrido, termina el ${despues.hasta}: ${n} día${n === 1 ? "" : "s"} más allá.`
          : `El cronograma pasa a terminar el ${despues.hasta}, ${n} día${n === 1 ? "" : "s"} después del ${nom} (${opciones.limite}).`,
      });
    }
  }

  /* 2 · LOS DOMINGOS.
   * Solo domingos, y solo las que EMPIEZAN en domingo. No hay calendario de
   * feriados peruanos en el sistema y meter uno a medias sería peor que no
   * tenerlo —es el mismo criterio de lib/cartaDafo y lib/cajaDormida—, así que
   * esto no dice «no hay feriados», dice lo que sabe.
   * Tampoco se avisa del sábado: en rodaje se trabaja, y un aviso que salta
   * siempre deja de leerse. */
  const domingos = mueve.filter(m => esDomingo(m.ini));
  if (domingos.length) {
    avisos.push({
      nivel: "medio",
      texto: domingos.length === 1
        ? `«${domingos[0].act.nombre}» pasa a empezar en domingo (${domingos[0].ini}).`
        : `${domingos.length} actividades pasan a empezar en domingo. No se cuentan feriados: ese calendario no está en el sistema.`,
    });
  }

  /* 3 · ADELANTAR POR ENCIMA DE LO YA HECHO.
   * Con `dias` negativo el bloque se adelanta, y puede meterse por delante de
   * actividades finalizadas que se quedan quietas. Eso no es un error de la
   * cuenta —es lo que se pidió— pero deja el cronograma diciendo que el rodaje
   * empezó antes de acabar la preproducción. */
  if (dias < 0) {
    const finHechas = quietas
      .filter(q => q.motivo === "finalizada" || q.motivo === "anterior")
      .map(q => q.act.fecha_fin || q.act.fecha_inicio || "")
      .filter(f => ES_FECHA.test(f));
    const tope = finHechas.length ? finHechas.reduce((m, f) => (f > m ? f : m)) : "";
    const invaden = tope ? mueve.filter(m => m.ini < tope) : [];
    if (invaden.length) {
      avisos.push({
        nivel: "medio",
        texto: `Se adelanta ${Math.abs(dias)} días y ${invaden.length} actividad${invaden.length === 1 ? "" : "es"} pasa${invaden.length === 1 ? "" : "n"} a empezar antes del ${tope}, que es cuando termina lo que se queda quieto.`,
      });
    }
  }

  /* 4 · SOLO ESA ETAPA: EL HUECO O EL SOLAPE.
   * Mover una etapa sin lo que viene detrás la descoloca respecto de lo
   * siguiente por definición. Se dice aquí porque es la consecuencia entera de
   * elegir ese alcance, y no se ve en ninguna otra parte de la previsualización. */
  if (alcance.modo === "solo-etapa") {
    avisos.push({
      nivel: "medio",
      texto: "Solo se mueve esta etapa: lo que viene detrás se queda donde está, así que va a quedar un hueco o un solape que hay que recolocar a mano.",
    });
  }

  /* 5 · LAS HUÉRFANAS.
   * Una actividad con una etapa que el preset no reconoce no entra en ningún
   * corte y se quedaría muda: sin moverse y sin aparecer en ninguna cuenta.
   * Suele venir de haber cambiado la categoría de la convocatoria después de
   * armar el cronograma. */
  const huerfanas = quietas.filter(q => q.motivo === "etapa-desconocida");
  if (huerfanas.length) {
    avisos.push({
      nivel: "medio",
      texto: `${huerfanas.length} actividad${huerfanas.length === 1 ? "" : "es"} tiene${huerfanas.length === 1 ? "" : "n"} una etapa que no es de esta categoría y se queda${huerfanas.length === 1 ? "" : "n"} sin mover.`,
    });
  }

  /* 6 · UNA «FINALIZADA» QUE TODAVÍA NO HA LLEGADO.
   * Una actividad terminada cuya fecha de inicio es POSTERIOR al destino casi
   * siempre tiene ese estado por error: se cerró el caso equivocado, o se dio
   * por hecho algo que aún no empieza. Y como las finalizadas se quedan
   * quietas a propósito, correr el bloque las deja atrás y lo parte en dos —el
   * rodaje en septiembre y dos rodajes en octubre y noviembre— sin decir nada.
   * El argumento para no moverlas es que sus fechas cuadran con los RHE y los
   * comprobantes; en el futuro no hay ni RHE ni comprobantes que cuadrar.
   * Se dice, no se decide: quien mira sabe si eso está bien. */
  /* ⚠ SE COMPARA CONTRA HOY, NO CONTRA LA FECHA DESTINO.
     Con `> fechaDestino` el aviso decía dos mentiras opuestas:
      · Corrigiendo un cronograma HACIA ATRÁS —el ancla mal puesta en septiembre,
        el destino real en junio— todas las finalizadas legítimas de julio y
        agosto, con sus RHE y sus comprobantes, cumplían la condición, y el
        aviso invitaba a replanificar trabajo que sí se hizo.
      · Y al revés: una finalizada por error en octubre, con el destino en
        enero, NO saltaba — que es exactamente el caso que este bloque vino a
        cubrir.
     Lo que hace sospechosa a una fila no es dónde cae respecto del destino,
     sino que esté terminada sin haber empezado todavía. Eso se mide contra hoy.
     Sin `hoy` no se avisa: mejor callar que acusar por una fecha inventada. */
  if (!opciones.moverHechas && opciones.hoy && ES_FECHA.test(opciones.hoy)) {
    const futuras = quietas.filter(q =>
      q.motivo === "finalizada" && (q.act.fecha_inicio || "") > opciones.hoy!);
    if (futuras.length) {
      avisos.push({
        nivel: "medio",
        texto: futuras.length === 1
          /* Se nombra el camino COMPLETO: con un caso atado el ↩ no está
             pintado —su estado lo manda el caso— y mandar a pulsarlo a secas
             es dar una instrucción imposible de seguir. */
          ? `«${futuras[0].act.nombre}» está marcada como finalizada pero todavía no ha empezado (${futuras[0].act.fecha_inicio}): se queda donde está y parte el bloque. Si ese estado está mal, replanifícala con ↩ en la lista —soltándole antes sus casos con la ✕ de cada chip— o marca arriba «mover también las finalizadas».`
          : `${futuras.length} actividades están marcadas como finalizadas y todavía no han empezado, así que se quedan donde están: ${futuras.map(q => q.act.nombre).join(", ")}. Si ese estado está mal, replanifícalas con ↩ en la lista —soltándoles antes sus casos con la ✕ de cada chip— o marca arriba «mover también las finalizadas».`,
      });
    }
  }

  /* 7 · MOVER LO YA HECHO.
   * El párrafo que crono-correr-po003 tituló «Y lo otro que hay que saber»: las
   * fechas de los RHE, los comprobantes y los movimientos del banco NO se mueven
   * con esto, así que a partir de aquí el cronograma y los papeles cuentan la
   * misma historia con N días de diferencia. */
  if (opciones.moverHechas) {
    const n = mueve.filter(m => (m.act.estado || "").toLowerCase() === "finalizada").length;
    if (n) avisos.push({
      nivel: "medio",
      texto: `Se mueven ${n} actividad${n === 1 ? "" : "es"} ya finalizada${n === 1 ? "" : "s"}. Los RHE, comprobantes y movimientos del banco NO se mueven: a partir de aquí el cronograma y los papeles dirán lo mismo con ${Math.abs(dias)} días de diferencia.`,
    });
  }

  return {
    dias, ancla, mueve, quietas, avisos, antes, despues,
    viable: !avisos.some(a => a.nivel === "alto") && mueve.length > 0,
  };
}

/* ══════════════ ROTULAR ══════════════ */

export const MOTIVO: Record<Quieta["motivo"], string> = {
  anterior: "de una etapa anterior",
  finalizada: "ya finalizada",
  cancelada: "cancelada",
  "sin-fecha": "sin fecha de inicio",
  "etapa-desconocida": "etapa ajena a la categoría",
  "sin-etapa": "sin etapa",
};

/** «se atrasa 18 días» / «se adelanta 3 días». El signo dicho en palabras: un
 *  «−18» en la cabecera de una confirmación se lee mal justo cuando importa. */
export const rotuloDias = (d: number) =>
  d === 0 ? "sin cambio"
    : `se ${d > 0 ? "atrasa" : "adelanta"} ${Math.abs(d)} día${Math.abs(d) === 1 ? "" : "s"}`;

/** El motivo que se guarda en la versión, para que dentro de un año se pueda
 *  leer qué se hizo sin abrir el código. */
export function motivoVersion(plan: Plan, alcanceTxt: string, fecha: string) {
  return `${alcanceTxt} ${rotuloDias(plan.dias)}: «${plan.ancla?.nombre || "—"}» pasa al ${fecha}. `
    + `${plan.mueve.length} actividad${plan.mueve.length === 1 ? "" : "es"} movida${plan.mueve.length === 1 ? "" : "s"}`
    + (plan.quietas.length ? `, ${plan.quietas.length} sin tocar.` : ".");
}
