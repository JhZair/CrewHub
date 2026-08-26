/* ── LO QUE EL ACTA OBLIGA — las reglas de lectura, en un solo sitio ──
 *
 * El acta de compromiso es un PDF escaneado de once páginas que nadie abre. Y
 * dentro están las reglas que deciden si el fondo se cierra bien: qué entregar,
 * en qué formato, con qué se puede sustentar y qué pasa si no.
 *
 * ── TRES NATURALEZAS, Y NO SE MEZCLAN ──
 * Un ENTREGABLE se tacha: existe o no existe, tiene fecha y tiene prueba.
 * Una OBLIGACIÓN no se tacha: no «se termina» de tener una cuenta exclusiva ni
 * de respetar el tope de declaraciones juradas. Se consulta antes de decidir.
 * Un PLAZO tampoco: es una fecha que gobierna a las otras dos.
 *
 * Mezclarlas en una lista única daría a la mitad de las filas un estado que no
 * significa nada — y un estado que no significa nada se rellena al azar, que es
 * peor que no tenerlo.
 *
 * ── LA CLÁUSULA NO ES DECORACIÓN ──
 * Cada fila cita su número. Es lo que hace que el extracto sea VERIFICABLE en
 * diez segundos contra el PDF, en vez de convertirse en una segunda versión del
 * acta que dentro de un año nadie sabrá si dice lo mismo. Por eso la pantalla
 * enseña siempre la cláusula y deja el enlace al acta a un clic: esto es un
 * índice para llegar al párrafo, no un sustituto del documento firmado.
 */

export type ClaseCompromiso = "entregable" | "obligacion" | "plazo";
export type EstadoCompromiso = "pendiente" | "en_proceso" | "entregado" | "no_aplica";

export type Compromiso = {
  id: string;
  clase: ClaseCompromiso;
  clausula?: string | null;
  titulo: string;
  detalle?: string | null;
  fecha_limite?: string | null;
  estado: EstadoCompromiso;
  entregado_en?: string | null;
  url?: string | null;
  nota?: string | null;
  orden?: number | null;
  /** ⚠ OBSOLETA: la relación vive ahora en `publicaciones.compromiso_id`, que
   *  admite varios casos por cláusula (db/compromiso-casos.sql). Se conserva
   *  el campo porque las filas viejas lo traen, pero no se pinta. */
  caso_id?: string | null;
  /** LOS casos abiertos desde esta cláusula. Un compromiso no es una tarea
   *  —sigue pendiente aunque nadie se ocupe—; cada caso es una decisión de
   *  ocuparse, con responsable y plazo. Los resueltos siguen aquí: en una
   *  rendición, lo hecho es lo que hay que poder enseñar. */
  casos?: CasoCompromiso[];
};

export type CasoCompromiso = {
  id: string;
  estado?: string | null;
  tipo?: string | null;
  archivado_en?: string | null;
  /** Quién lo está haciendo, con su cara. Sin esto hay que abrir el caso para
   *  contestar la primera pregunta que uno se hace mirando la lista. */
  resp?: { id?: string; nombre?: string | null; avatar_url?: string | null; color?: string | null } | null;
};

/* PostgREST devuelve lo embebido como objeto o como arreglo según cómo
   resuelva la relación. Se aplana en un solo sitio: leer solo una de las dos
   formas deja la cara en blanco sin que nada falle, y un hueco se lee como
   «no tiene responsable». */
export const unoDe = <T,>(x: T | T[] | null | undefined): T | null =>
  (Array.isArray(x) ? x[0] : x) || null;

/* Los casos de una cláusula, ordenados para leerse: primero lo vivo —que es
   donde hay que mirar— y dentro de cada grupo lo más nuevo arriba. Lo
   archivado se cae: no es trabajo hecho, es trabajo retirado. */
export function casosDe(x: Compromiso): CasoCompromiso[] {
  const cs = (Array.isArray(x.casos) ? x.casos : x.casos ? [x.casos as any] : [])
    .filter(Boolean)
    .map(c => ({ ...c, resp: unoDe(c.resp as any) }))
    .filter(c => !c.archivado_en);
  const CERRADO = ["resuelta", "descartada"];
  return cs.sort((a, b) => {
    const ca = CERRADO.includes(String(a.estado)) ? 1 : 0;
    const cb = CERRADO.includes(String(b.estado)) ? 1 : 0;
    return ca - cb || String(b.id).localeCompare(String(a.id));
  });
}

export const META_CLASE_COMP: Record<ClaseCompromiso, {
  ico: string; titulo: string; sub: string; seTacha: boolean;
}> = {
  entregable: {
    ico: "📦", titulo: "Entregables",
    sub: "lo que hay que entregar — se tacha cuando está entregado",
    seTacha: true,
  },
  obligacion: {
    ico: "⚖️", titulo: "Obligaciones y condiciones",
    sub: "reglas que rigen mientras se ejecuta — se consultan antes de decidir",
    seTacha: false,
  },
  plazo: {
    ico: "⏳", titulo: "Plazos",
    sub: "las fechas que manda el acta",
    seTacha: false,
  },
};

/* ── ESTE ESTADO NO ES EL DEL CASO ──
 *
 * Son dos preguntas distintas y la pantalla las tenía juntas diciendo lo mismo:
 * ambas ponían «en proceso», una al lado de la otra.
 *
 *   · El estado del COMPROMISO contesta «¿YA SE LE ENTREGÓ AL MINISTERIO?».
 *   · El estado del CASO contesta «¿ESTAMOS TRABAJANDO EN ELLO?».
 *
 * Y de verdad no coinciden. La ficha técnica puede estar terminada —caso
 * resuelto— y seguir sin entregar porque falta mandarla por la plataforma. Al
 * revés también: se entrega, y el caso sigue abierto esperando que el Ministerio
 * la apruebe o la observe. Fundir las dos habría sido cómodo y falso.
 *
 * La solución no fue esconder una: fue que las palabras digan a qué pregunta
 * contesta cada una. «Preparando» y «entregado a DAFO» no se confunden con
 * «abierta» o «en progreso» de un caso, que es lo que pasaba con «en proceso».
 */
export const META_ESTADO_COMP: Record<EstadoCompromiso, {
  ico: string; txt: string; col: string; ayuda: string;
}> = {
  pendiente: { ico: "○", txt: "sin entregar", col: "var(--dim)",
    ayuda: "Todavía no se le ha entregado al Ministerio. Nada dice si alguien está trabajando en ello — eso lo dice el caso." },
  en_proceso: { ico: "◐", txt: "preparando", col: "var(--yellow)",
    ayuda: "Se está armando, pero aún no se entregó al Ministerio." },
  entregado: { ico: "✅", txt: "entregado a DAFO", col: "var(--green)",
    ayuda: "Ya se le entregó al Ministerio. Que esté entregado no significa que esté aprobado: el Ministerio tiene 30 días hábiles para revisarlo (cl. 7.3) y puede observarlo." },
  /* «No aplica» es una decisión, no un hueco: el 5.3.7 (material promocional)
     dice «de ser el caso», y marcarlo así deja constancia de que alguien lo
     miró y decidió — que es distinto de que nadie se haya ocupado. */
  no_aplica: { ico: "—", txt: "no aplica", col: "var(--dim)",
    ayuda: "Se revisó y se decidió que esta cláusula no corresponde a este proyecto. No cuenta en el total de entregables." },
};

export const ESTADOS_COMP: EstadoCompromiso[] =
  ["pendiente", "en_proceso", "entregado", "no_aplica"];

/* Ordena una lista de compromisos por el `orden` del extracto y, a falta de
   él, por su cláusula leída como números. «5.3.10» va después de «5.3.9», que
   es lo que un orden alfabético haría al revés. */
const partesClausula = (c?: string | null) =>
  String(c || "").split(".").map(x => parseInt(x, 10) || 0);

export function ordenarCompromisos(xs: Compromiso[]): Compromiso[] {
  return [...xs].sort((a, b) => {
    const oa = a.orden ?? 9999, ob = b.orden ?? 9999;
    if (oa !== ob) return oa - ob;
    const pa = partesClausula(a.clausula), pb = partesClausula(b.clausula);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return a.titulo.localeCompare(b.titulo);
  });
}

/* El avance de los entregables. Los «no aplica» salen del denominador: contar
   como pendiente algo que se decidió que no corresponde hace que el porcentaje
   nunca llegue a 100 y que nadie se lo crea.
   Y se dice cuántos se excluyeron, porque un 8/8 con tres exclusiones que no
   se ven es un 8/11 disfrazado. */
/* Recibe lo MÍNIMO —clase y estado— y no un `Compromiso` entero: /fondos
   calcula esto para nueve tarjetas y no necesita traerse el extracto del acta,
   las notas ni los casos de cada cláusula para contar cuántas se entregaron.
   Pedir de más en una consulta por lote es lo que acaba rozando el techo de
   mil filas de PostgREST sin que nadie se entere. */
export function avanceEntregables(xs: Pick<Compromiso, "clase" | "estado">[]) {
  const ent = xs.filter(x => x.clase === "entregable");
  const noAplica = ent.filter(x => x.estado === "no_aplica").length;
  const cuentan = ent.length - noAplica;
  const listos = ent.filter(x => x.estado === "entregado").length;
  return {
    listos, cuentan, noAplica,
    pct: cuentan ? Math.round((listos / cuentan) * 100) : 0,
    enProceso: ent.filter(x => x.estado === "en_proceso").length,
  };
}
