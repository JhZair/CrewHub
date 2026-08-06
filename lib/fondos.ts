/* ── Cuándo una empresa puede postular a un fondo ──
 *
 * La cadena real de papeles, en orden:
 *
 *   vigencia de poder  →  sirve para PEDIR el RENCA
 *   RENCA              →  sirve para POSTULAR
 *
 * La vigencia no es requisito del fondo: es requisito del trámite anterior.
 * Con el RENCA en mano ya cumplió. Exigirla para postular era pedir dos
 * veces el mismo papel, y el sistema decía «1 libre» cuando había 9.
 *
 * Y no basta con tener los papeles: una empresa comprometida no puede
 * tomar otro fondo. Comprometida = postulando, o ejecutando uno ganado.
 *
 * Todo vive aquí porque la misma regla estaba escrita en /empresas y en
 * /qhaway con palabras distintas — y cuando dos sitios deciden lo mismo por
 * separado, un día dejan de coincidir sin que nadie se entere.
 */

import { vigenciaVencida } from "@/lib/vigencia";

/* La partida sigue viva: presentada y sin resolverse.
   `apta` entra aquí: DAFO ya revisó sus papeles y la dejó pasar, pero el
   jurado todavía no la vio. Está más viva que nunca — sin esto, una
   postulación que acaba de pasar el primer filtro desaparecía de «en juego»
   justo cuando empieza lo bueno. */
export const EN_JUEGO = ["en_preparacion", "enviada", "en_subsanacion", "apta", "finalista"];
export const enJuego = (p: { estado?: string | null }) => EN_JUEGO.includes(p.estado || "");

/* Ejecutando: ganó y todavía no entregó la rendición.
 *
 * Antes esto era «ganadora cuyo plazo no ha vencido», y fallaba en los dos
 * casos que más importaban: sin plazo cargado la daba por libre, y con el
 * plazo vencido la daba por cerrada — aunque nadie hubiera entregado nada.
 * «Vencida» significaba entregada o debiéndola, y elegía la optimista.
 *
 * Ahora manda el hecho, no el calendario: mientras no haya fecha de entrega,
 * el fondo sigue abierto. El plazo dice si va tarde (ver `rendicionVencida`),
 * no si terminó.
 */
export const ejecutando = (p: { estado?: string | null; fecha_rendicion_real?: string | null }) =>
  p.estado === "ganadora" && !p.fecha_rendicion_real;

/* El plazo de una ganadora, con la prórroga si la hay. */
export const plazoRendicion = (p: { fecha_prorroga?: string | null; fecha_limite_rendicion?: string | null }) =>
  p.fecha_prorroga || p.fecha_limite_rendicion || null;

/* Debiendo: el plazo pasó y no hay entrega registrada. Es lo más grave que
   le puede pasar a una empresa ante DAFO, y hasta hoy se leía como «cerrada». */
export const rendicionVencida = (p: {
  estado?: string | null; fecha_rendicion_real?: string | null;
  fecha_prorroga?: string | null; fecha_limite_rendicion?: string | null;
}) => {
  if (!ejecutando(p)) return false;
  const f = plazoRendicion(p);
  return !!f && f < new Date().toISOString().slice(0, 10);
};

/* Ganadora sin plazo cargado: no se sabe para cuándo debe rendir. No es que
   esté libre — es que falta el dato, y un hueco no es un permiso. */
export const rendicionSinPlazo = (p: {
  estado?: string | null; fecha_rendicion_real?: string | null;
  fecha_prorroga?: string | null; fecha_limite_rendicion?: string | null;
}) => ejecutando(p) && !plazoRendicion(p);

/* Los campos que hacen falta para decidir. Escritos aquí para que ninguna
   página se olvide de traer uno y saque una conclusión con medio dato —
   `fecha_rendicion_real` faltando se lee igual que «no la ha entregado». */
export const SEL_FONDO =
  "id,empresa_id,estado,monto_adjudicado,fecha_limite_rendicion,fecha_prorroga,fecha_rendicion_real";

/* ── ¿Puede postular esta empresa? ──────────────────────────── */

export type Compromiso = { juego: number; ejec: number; debe: number; sinPlazo: number };

/* Lo que una empresa tiene encima, contado de sus propias postulaciones. */
export const compromisoDe = (posts: any[]): Compromiso => ({
  juego: posts.filter(enJuego).length,
  ejec: posts.filter(ejecutando).length,
  debe: posts.filter(rendicionVencida).length,
  sinPlazo: posts.filter(rendicionSinPlazo).length,
});
export const SIN_COMPROMISO: Compromiso = { juego: 0, ejec: 0, debe: 0, sinPlazo: 0 };

/* Libre = papeles en regla y sin ningún fondo encima: ni en concurso, ni
 * ejecutándose.
 *
 * La vigencia de poder NO entra: sirve para pedir el RENCA, y con el RENCA en
 * mano ya cumplió. Exigirla aquí era pedir dos veces el mismo papel — el
 * sistema decía «1 libre» cuando había 9.
 *
 * ⚠ AVISO A QUIEN LEA LAS BASES Y QUIERA "CORREGIR" ESTO:
 *
 * Las bases 2026 dicen, textual:
 *   «Las personas jurídicas postulantes pueden presentar uno (1) o más
 *    proyectos […] Sin embargo, no se premiará más de un (1) proyecto u obra
 *    de la misma persona jurídica, representante legal o director(a) en un (1)
 *    mismo año.»
 *
 * O sea: presentar dos está PERMITIDO. Y aun así `c.juego === 0` se queda,
 * a propósito.
 *
 * Porque esto no es el reglamento del Ministerio: es la estrategia de la
 * productora, y es más estricta a propósito. Palabras de John (16/07):
 *
 *   «Una cosa es que las bases lo permiten, pero según mi estrategia no puedo
 *    acumular varias postulaciones en una empresa. En algunos casos lo hago
 *    cuando no tengo de otra — por ejemplo Aynicha Films, con tres proyectos
 *    de la misma directora: sabemos que solo una gana.»
 *
 * Para eso existen nueve empresas propias: para repartir, no para apilar. Una
 * empresa con algo en concurso ya está comprometida, aunque el Estado la deje
 * presentar otra. Y las que apilan —Aynicha— son la excepción que se toma
 * sabiendo el costo, no el caso normal que el sistema deba sugerir.
 *
 * Yo ya "corregí" esto una vez leyendo las bases, y estaba mal. Si vuelves a
 * tener la tentación: la regla del concurso dice qué se puede; ésta dice qué
 * conviene. El sistema es de la productora.
 */
export const empresaLibre = (e: any, c: Compromiso = SIN_COMPROMISO) =>
  e.estado === "activa"
  && !!e.ruc
  && e.estado_sunat === "activo" && e.condicion_sunat === "habido"
  && !!e.renca
  && c.juego === 0 && c.ejec === 0;

/* Por qué NO puede: sirve para saber qué arreglar, así que cada línea
   nombra el trámite, no el síntoma. */
export const trabasEmpresa = (e: any, c: Compromiso = SIN_COMPROMISO): string[] => {
  const t: string[] = [];
  /* Si no está activa, su estado ES la única traba y lo demás no viene al
     caso: a una empresa en constitución no le falta el RENCA — todavía no
     puede tenerlo, ni tiene RUC con qué pedirlo. Y a una que está cerrando no
     se le reclama un papel que ya no va a usar.
     Reclamar un trámite a quien no puede hacerlo es el mismo error que
     pedirle la vigencia de poder a una empresa que ya tiene su RENCA: una
     regla correcta aplicada a un caso que nadie pensó. */
  if (e.estado !== "activa") {
    t.push(e.estado === "en_constitucion" ? "en constitución" : String(e.estado || "no activa").replace(/_/g, " "));
    return t;
  }
  if (!e.ruc) t.push("sin RUC");
  if (e.estado_sunat !== "activo") t.push("SUNAT no activo");
  if (e.condicion_sunat !== "habido") t.push("no habido");
  /* La vigencia solo se nombra cuando de verdad estorba: sin RENCA, es lo que
     hay que tener para poder pedirlo. Con RENCA en mano, que esté vencida no
     impide postular y decirlo sería ruido. */
  if (!e.renca) {
    t.push("sin RENCA");
    if (!e.vigencia_poder_fecha) t.push("sin vigencia para pedir el RENCA");
    else if (vigenciaVencida(e.vigencia_poder_fecha)) t.push("vigencia vencida para pedir el RENCA");
  }
  // Compromiso propio, no del Ministerio: ver el aviso en `empresaLibre`
  if (c.juego > 0) t.push("en concurso");
  /* Ejecutando se dice distinto según el caso porque lo que hay que hacer es
     distinto: si va tarde, entregar; si no hay plazo cargado, cargarlo.
     «Ejecutando» a secas no dice ni una cosa ni la otra. */
  if (c.debe > 0) t.push("debe una rendición vencida");
  else if (c.sinPlazo > 0) t.push("ejecutando un fondo, sin plazo cargado");
  else if (c.ejec > 0) t.push("ejecutando un fondo");
  return t;
};

/* A un trámite: cumple todo menos el RENCA, y tiene la vigencia vigente con
   la que pedirlo. Si le faltara también la vigencia serían dos trámites y
   `trabasEmpresa` devolvería dos líneas — por eso el largo === 1. */
export const puedePedirRenca = (e: any, c: Compromiso = SIN_COMPROMISO) => {
  const t = trabasEmpresa(e, c);
  return t.length === 1 && t[0] === "sin RENCA";
};

/* ── ¿Y sus responsables? ───────────────────────────────────── */

/* Una empresa no postula sola: firma alguien. Un DNI vencido invalida la
   firma, y un representante no habido arrastra a la empresa entera. Esto no
   se veía en ningún lado: la ficha listaba los cargos y nada más.

   `dni_vencimiento` vacío NO es una traba: hay gente mayor a la que el DNI
   ya no le caduca. Sin fecha no se sabe, y no saber no es lo mismo que estar
   mal — se dice aparte, como duda, no como falta. */
export const trabasMiembro = (p: any): string[] => {
  const t: string[] = [];
  if (!p?.ruc_dni) { t.push("sin DNI registrado"); return t; }
  const hoy = new Date().toISOString().slice(0, 10);
  if (p.dni_vencimiento && p.dni_vencimiento < hoy) t.push("DNI vencido");
  if (p.estado_sunat && p.estado_sunat !== "activo")
    t.push(`SUNAT ${String(p.estado_sunat).replace(/_/g, " ")}`);
  if (p.condicion_sunat === "no_habido") t.push("no habido en SUNAT");
  return t;
};

/* Lo que NO sabemos de un miembro, que no es lo mismo que lo que está mal.
 *
 * `trabasMiembro` solo se queja de lo que puede ver: si `estado_sunat` está
 * vacío, no hay nada que objetar y la persona pasa. Pero pasar por no haber
 * mirado no es estar bien — y la hoja llegó a decir «sus 3 responsables con
 * SUNAT sano» cuando a dos nunca se les consultó. Un hueco leído como
 * aprobado, otra vez.
 *
 * Se devuelven aparte a propósito: una duda no bloquea, pero tampoco se
 * pinta de verde. Ese es el tercer color.
 */
/* ── La reserva regional ────────────────────────────────────────
 *
 * No es un puntaje: es plata apartada. En Cortometrajes 2026 son
 * S/ 279,000 de S/ 558,000 — la mitad del concurso— reservados para
 * empresas fuera de Lima Metropolitana y Callao. No se compite mejor: se
 * compite contra menos gente por otra bolsa.
 *
 * Bases 2026, numeral IV.3: hay que acreditar el lugar de constitución en
 * SUNARP fuera de Lima Metrop. y Callao, Y el domicilio fuera de ahí ante
 * SUNARP Y ante SUNAT. Tres hechos, los tres obligatorios.
 *
 * Ojo con «Lima»: la reserva excluye Lima METROPOLITANA, no el departamento.
 * Huacho y Cañete son departamento de Lima y SÍ entran. Por eso «Lima» no
 * decide nada por sí solo — hace falta la provincia. El sistema no adivina:
 * lo dice.
 */

export type Veredicto = "si" | "no" | "falta";

/* Qué dice una región sobre la reserva:
     "no"    → Callao: excluido y punto
     "falta" → "Lima" (¿Metropolitana o provincia?) o vacío (nadie lo cargó)
     "si"    → cualquier otra región del país  */
export const regionReserva = (r?: string | null, provinciaLima?: string | null): Veredicto => {
  const s = String(r ?? "").trim();
  if (!s) return "falta";
  if (s === "Callao") return "no";
  if (s !== "Lima") return "si";
  /* Departamento de Lima: decide la provincia. «Lima» a secas es Lima
     Metropolitana, que está excluida; cualquier otra provincia entra. */
  const p = String(provinciaLima ?? "").trim();
  if (!p) return "falta";
  return /^lima$/i.test(p) ? "no" : "si";
};

/* El requisito regional de la empresa. Antes eran tres campos separados
   (constitución SUNARP, domicilio SUNARP, domicilio SUNAT) que en la práctica
   repetían «Región donde opera»; ahora se decide con esa única fuente
   (`e.region`). Se devuelve como una sola fila para la hoja de elegibilidad. */
export const reservaEmpresa = (e: any): { que: string; v: Veredicto; region: string }[] => [
  { que: "Región fuera de Lima Metrop. y Callao",
    v: regionReserva(e.region),
    region: e.region || "" },
];

/* El veredicto: basta un "no" para quedar fuera; si no hay ningún "no" pero
   falta algo, no se puede afirmar que califique. */
export const veredictoReserva = (partes: { v: Veredicto }[]): Veredicto =>
  !partes.length ? "falta"
  : partes.some(p => p.v === "no") ? "no"
  : partes.some(p => p.v === "falta") ? "falta"
  : "si";

/* El veredicto COMPLETO: la empresa Y sus responsables.
 *
 * Las bases no piden solo que la empresa figure en región — piden que
 * «el(la/los/las) responsable(s) del proyecto cuenten con domicilio fuera de
 * Lima Metropolitana y Callao, según los datos consignados en sus documentos
 * de identidad». Son dos requisitos y hay que cumplir los dos.
 *
 * Esta función existe porque la hoja llegó a decir «✅ Puede aplicar a la
 * reserva» con los tres responsables en «sin región» — el veredicto miraba
 * solo las filas de la empresa mientras las de abajo lo desmentían. Es el
 * mismo error que decir «SUNAT sano» de quien nadie consultó: afirmar de más
 * mirando de menos.
 *
 * Y sin responsables cargados tampoco se puede afirmar: alguien tiene que
 * acreditar ese domicilio.
 */
export const reservaCompleta = (
  partesEmpresa: { v: Veredicto }[],
  miembros: { reserva: Veredicto }[],
): Veredicto =>
  !miembros.length ? "falta"
  : veredictoReserva([...partesEmpresa, ...miembros.map(m => ({ v: m.reserva }))]);

/* Los responsables, por la dirección de su DNI —que es lo que exigen las
   bases: «según los datos consignados en sus documentos de identidad»—.
   `personas.region` se llena mirando el DNI (confirmado con el equipo), así
   que aquí sí sirve tal cual. */
export const reservaMiembro = (p: any): Veredicto => regionReserva(p?.region);

export const dudasMiembro = (p: any): string[] => {
  const d: string[] = [];
  if (!p?.ruc_dni) return d;               // sin DNI ya es traba, no duda
  if (!p.estado_sunat) d.push("SUNAT sin verificar");
  if (!p.nombre_reniec) d.push("nombre sin verificar en RENIEC");
  /* Sin fecha de vencimiento puede ser que el DNI no caduque (pasa con la
     gente mayor) o que nadie la cargó. Son cosas opuestas y no se distinguen:
     por eso es duda y no falta. */
  if (!p.dni_vencimiento) d.push("DNI sin fecha de vencimiento");
  return d;
};

/* ── EL VEREDICTO DE ELEGIBILIDAD, en un solo sitio ──
 *
 * La hoja de postulación (ficha) y la vista rápida responden la misma
 * pregunta —«¿puedo presentar con ésta?»— y la respondían por separado: la
 * hoja con cuatro estados y su matiz, el pop-up con un «✕ No puede postular»
 * que mezclaba «ya está en concurso» con «le falta el RENCA». Son cosas
 * distintas: la primera no se arregla con un trámite.
 *
 * Aquí vive la CLASIFICACIÓN; el texto largo lo pone cada pantalla, porque una
 * hoja tiene sitio para explicar y un pop-up no. Lo que no puede diferir es en
 * qué casillero cae una empresa.
 */
export type EstadoElegibilidad = "bloqueada" | "concurso" | "lista" | "pendiente";

/* Lo MÍNIMO que hace falta para clasificar; cada pantalla trae además lo suyo
   (id, cargo, ruc, reserva…) y el índice lo deja pasar. */
export type MiembroEval = { trabas: string[]; dudas: string[]; persona?: any;[k: string]: any };

export function elegibilidadDe({ libre, trabasEmp, miembros, bloqueada, enConcurso }: {
  /** `empresaLibre(...)` — solo los papeles de la EMPRESA. */
  libre: boolean;
  trabasEmp: string[];
  miembros: MiembroEval[];
  /** Ejecuta un fondo ganado: no puede tomar otro. */
  bloqueada: boolean;
  /** Ya postula con ésta. */
  enConcurso: boolean;
}) {
  const conProblema = miembros.filter(m => m.trabas.length > 0);
  const conDuda = miembros.filter(m => !m.trabas.length && m.dudas.length > 0);
  /* Listo de verdad = la empresa Y su gente. Mirando solo la empresa, alguien
     podía irse tranquilo a postular con un representante de DNI vencido. */
  const todoOk = libre && conProblema.length === 0;
  /* Puede postular, pero hay cosas que NADIE miró. No es lo mismo que estar
     bien, y decir que lo está es dar tranquilidad falsa justo antes de firmar. */
  const conReparo = todoOk && conDuda.length > 0;

  /* Un fondo encima se dice distinto de un trámite pendiente: «ejecutando» o
     «rendición vencida» no se arreglan llenando un papel. */
  const trabaFondo = trabasEmp.find(t => /ejecutando|rendición vencida/i.test(t));
  const otrasTrabasEmp = trabasEmp.filter(t => t !== "en concurso" && t !== trabaFondo);
  /* Sin miembros no es «todo en orden»: es que no sabemos quién firma. Un
     `every` sobre lista vacía devuelve true, y ese true es una trampa. */
  const hayPendientes = otrasTrabasEmp.length > 0 || conProblema.length > 0 || !miembros.length;

  const estado: EstadoElegibilidad =
    bloqueada ? "bloqueada"
    : enConcurso ? "concurso"
    : todoOk ? "lista"
    : "pendiente";

  return { estado, conProblema, conDuda, todoOk, conReparo, trabaFondo, otrasTrabasEmp, hayPendientes };
}

/** El rótulo corto de cada estado, para donde no cabe la explicación larga. */
export const ROTULO_ELEGIBILIDAD: Record<EstadoElegibilidad, { ico: string; txt: string; clase: string }> = {
  bloqueada: { ico: "⛔", txt: "No puede postular — ya tiene un fondo encima", clase: "no" },
  concurso:  { ico: "▶", txt: "Ya está en concurso", clase: "concurso" },
  lista:     { ico: "✅", txt: "Lista para postular", clase: "si" },
  pendiente: { ico: "⚠", txt: "Todavía no", clase: "casi" },
};
