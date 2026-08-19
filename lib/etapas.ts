/* ── Las etapas del cronograma, por categoría de concurso ──
   Antes las etapas eran fijas al cine (preproducción/rodaje/postproducción…).
   Pero cada categoría DAFO tiene su propio flujo: un videojuego no se "rueda",
   un festival no tiene "postproducción". Cada convocatoria elige su categoría
   y el cronograma de sus postulaciones usa estas etapas.

   Las claves preproduccion/produccion/postproduccion/entrega/administracion NO
   se cambian: los cronogramas de PROYECTO ya existentes las usan. El resto son
   claves nuevas. Los presets salieron de los formatos DAFO (Info Ejecu_* y el
   formulario de videojuegos). */

export type Etapa = { clave: string; nombre: string; color: string };

const C = {
  gris: "#8b8ba3", ambar: "#f59e0b", teal: "#2dd4bf", verde: "#2ecc71",
  violeta: "#a78bfa", azul: "#3b82f6", rosa: "#ec4899", cian: "#22d3ee",
};
const e = (clave: string, nombre: string, color: string): Etapa => ({ clave, nombre, color });

/* Default: cine. Lo usan los cronogramas de proyecto y de convocatoria (los
   que no cuelgan de una categoría). Incluye "administración" para los hitos. */
export const ETAPAS_CINE: Etapa[] = [
  /* «Desarrollo» abre el ciclo de un documental: idea, investigación, escritura
     y financiamiento, antes de que exista nada que preproducir.
     Clave PROPIA (`desarrollo_ini`) y no `desarrollo`, que ya la usa «Desarrollo
     de proyecto» para otra cosa («Desarrollo (arte, layout)»). Dos nombres
     distintos bajo una misma clave hacen que el mapa global de lib/etapas
     —que es por clave y donde gana el último— devuelva el texto de la otra
     categoría en cualquier pantalla sin preset a la mano, como la agenda.
     Se separa la clave nueva en vez de renombrar la vieja porque la vieja puede
     tener actividades guardadas: cambiarle la clave las dejaría huérfanas,
     pintadas de gris y sin nombre. La clave no se ve nunca; el nombre sí. */
  e("desarrollo_ini", "Desarrollo", C.rosa),
  e("preproduccion", "Preproducción", C.gris),
  /* «Rodaje / Producción», idéntico en todas las categorías: los formularios
     DAFO dicen «Producción» y el equipo dice «Rodaje», y las dos palabras
     aportan —una es la del trámite, la otra la del oficio—. Mismo criterio que
     «Entrega / Fin del proyecto», y mismo motivo para no variarlo por
     categoría: el mapa global es por clave y gana el último. */
  e("produccion", "Rodaje / Producción", C.ambar),
  e("postproduccion", "Postproducción", C.teal),
  /* «Entrega / Fin del proyecto», y EXACTAMENTE igual en todas las categorías.
     Los formularios DAFO lo llaman «Fin del Proyecto» y ahí no se entrega
     solamente: se cierra (informe semestral, devolución a la ciudadanía,
     culminación, entrega del material). El nombre doble sirve para los dos
     mundos — el encargo que solo entrega y el fondo que además cierra.
     Que sea idéntico en todas no es cosmético: el mapa global es por clave y
     gana el último, así que dos nombres para `entrega` harían que la agenda
     mostrara uno u otro según el orden del archivo. */
  e("entrega", "Entrega / Fin del proyecto", C.verde),
  e("administracion", "Administración", C.violeta),
];

/* Las categorías aprobadas. El `nombre` ES lo que se guarda en
   convocatorias.categoria (y lo que se elige en el formulario): sin tabla de
   traducción, una categoría = su nombre. */
export const CATEGORIAS: { nombre: string; etapas: Etapa[] }[] = [
  { nombre: "Producción audiovisual", etapas: [
    e("preproduccion", "Preproducción", C.gris),
    e("produccion", "Rodaje / Producción", C.ambar),
    e("postproduccion", "Postproducción", C.teal),
    e("entrega", "Entrega / Fin del proyecto", C.verde),
  ] },
  { nombre: "Documental", etapas: [
    e("investigacion", "Investigación", C.azul),
    e("preproduccion", "Preproducción", C.gris),
    e("produccion", "Rodaje / Producción", C.ambar),
    e("postproduccion", "Postproducción", C.teal),
    e("entrega", "Entrega / Fin del proyecto", C.verde),
  ] },
  { nombre: "Desarrollo de proyecto", etapas: [
    e("investigacion", "Investigación / Guion", C.azul),
    e("desarrollo", "Desarrollo (arte, layout)", C.violeta),
    e("preproduccion", "Preproducción", C.gris),
    e("entrega", "Entrega / Fin del proyecto", C.verde),
  ] },
  { nombre: "Video y Cine Indígena", etapas: [
    e("formacion", "Formación", C.rosa),
    e("proceso_creativo", "Proceso creativo y colectivo", C.cian),
    e("preproduccion", "Preproducción", C.gris),
    e("produccion", "Rodaje / Producción", C.ambar),
    e("postproduccion", "Postproducción", C.teal),
    e("entrega", "Entrega / Fin del proyecto", C.verde),
  ] },
  /* El orden ES el del formulario DAFO de videojuego: inicio → las cuatro
     disciplinas del presupuesto → difusión → cierre. Así el cronograma que se
     arma aquí se puede volcar al formulario sin reordenar, y cada etapa cruza
     con su partida del presupuesto (que se organiza igual). */
  { nombre: "Videojuego", etapas: [
    /* «Inicio del Proyecto» es un bloque del formulario de VIDEOJUEGO y solo de
       ese: lleva la charla obligatoria de acoso y hostigamiento y la producción
       que corre todo el proyecto. En las demás categorías NO existe como bloque
       —la charla se ubica justo antes del rodaje, dentro de Producción—, así que
       esta clave no se replica al resto. */
    e("inicio", "Inicio del proyecto", C.gris),
    e("desarrollo_conceptual", "Desarrollo conceptual", C.azul),
    e("diseno", "Diseño", C.violeta),
    e("programacion", "Programación", C.ambar),
    e("pruebas", "Pruebas de prototipo", C.cian),
    /* Misma clave, nombre y color que en «Gestión de proyectos»: los mapas
       globales de abajo son por clave y el último gana, así que repetir una
       clave con otro nombre la renombraría en silencio en toda la aplicación. */
    e("difusion", "Difusión", C.rosa),
    e("entrega", "Entrega / Fin del proyecto", C.verde),
  ] },
  /* ── ANIMACIÓN ──
   * Etapas y nombres sacados de las Bases del Concurso de Proyectos de
   * Animación 2026 (numeral 6.1 «Definición del proyecto» y el glosario), no
   * del pipeline genérico de animación que uno esperaría. Dos cosas de ahí que
   * no se habrían adivinado:
   *
   *  · «En el caso de proyectos de animación, se considerará la ETAPA DE
   *    ANIMACIÓN como el equivalente al proceso de rodaje» (glosario, RODAJE y
   *    PLAN DE RODAJE). Por eso `animacion` va en el ámbar del rodaje: es la
   *    misma casilla del formulario, con otro nombre.
   *  · Preproducción en animación NO es «buscar locaciones»: es el ANIMATIC del
   *    total de la obra, el libro de arte completo y el teaser/tráiler.
   *
   * UNA categoría para las CINCO modalidades del concurso (Cortometrajes,
   * Desarrollo, Desarrollo de series, Preproducción, Producción). Cada proyecto
   * usa las etapas de la suya y deja el resto vacías, igual que hace un fondo
   * de «Producción audiovisual» que no llega a postproducción. Cinco categorías
   * con dos etapas cada una habrían multiplicado el catálogo para no decir nada
   * que el proyecto no diga ya.
   *
   * `desarrollo_ini` y no `desarrollo`: esa clave ya es «Desarrollo (arte,
   * layout)» en Desarrollo de proyecto, y el mapa global es por clave y gana el
   * último. `animacion` es clave NUEVA por lo mismo — reusar `produccion`
   * habría obligado a llamarla «Rodaje / Producción», que es justo la palabra
   * que las bases sustituyen. */
  { nombre: "Animación", etapas: [
    e("desarrollo_ini", "Desarrollo", C.rosa),
    e("preproduccion", "Preproducción", C.gris),
    e("animacion", "Animación", C.ambar),
    e("postproduccion", "Postproducción", C.teal),
    e("entrega", "Entrega / Fin del proyecto", C.verde),
  ] },
  { nombre: "Cine en construcción", etapas: [
    e("montaje", "Montaje", C.ambar),
    e("color", "Corrección de color", C.teal),
    e("sonido", "Postproducción de sonido", C.cian),
    e("master", "Máster y entrega", C.verde),
  ] },
  { nombre: "Gestión de proyectos", etapas: [
    e("planificacion", "Planificación", C.gris),
    e("programacion_ev", "Programación", C.azul),
    e("difusion", "Difusión", C.rosa),
    e("realizacion", "Realización del evento", C.ambar),
    e("cierre", "Cierre e informe", C.verde),
  ] },
];

/** Para el <select> de categoría en la ficha de convocatoria. */
export const CATEGORIAS_OPC = CATEGORIAS.map(c => c.nombre);

/** Las etapas de una categoría; si no tiene (o no se reconoce), las de cine. */
export function etapasDe(categoria?: string | null): Etapa[] {
  const c = CATEGORIAS.find(x => x.nombre === categoria);
  return c ? c.etapas : ETAPAS_CINE;
}

/* Mapas globales clave→color / clave→nombre, uniendo TODAS las categorías + el
   default. Los usa la agenda (que mezcla actividades de muchas categorías y
   solo tiene la clave suelta) y cualquier sitio sin el preset a la mano. */
const TODAS = [...ETAPAS_CINE, ...CATEGORIAS.flatMap(c => c.etapas)];
const COLOR: Record<string, string> = Object.fromEntries(TODAS.map(x => [x.clave, x.color]));
const NOMBRE: Record<string, string> = Object.fromEntries(TODAS.map(x => [x.clave, x.nombre]));
export const colorEtapa = (clave: string) => COLOR[clave] || C.gris;
export const nombreEtapa = (clave: string) => NOMBRE[clave] || (clave || "").replace(/_/g, " ");
