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
  e("preproduccion", "Preproducción", C.gris),
  e("produccion", "Rodaje", C.ambar),
  e("postproduccion", "Postproducción", C.teal),
  e("entrega", "Entrega", C.verde),
  e("administracion", "Administración", C.violeta),
];

/* Las categorías aprobadas. El `nombre` ES lo que se guarda en
   convocatorias.categoria (y lo que se elige en el formulario): sin tabla de
   traducción, una categoría = su nombre. */
export const CATEGORIAS: { nombre: string; etapas: Etapa[] }[] = [
  { nombre: "Producción audiovisual", etapas: [
    e("preproduccion", "Preproducción", C.gris),
    e("produccion", "Rodaje", C.ambar),
    e("postproduccion", "Postproducción", C.teal),
    e("entrega", "Entrega", C.verde),
  ] },
  { nombre: "Desarrollo de proyecto", etapas: [
    e("investigacion", "Investigación / Guion", C.azul),
    e("desarrollo", "Desarrollo (arte, layout)", C.violeta),
    e("preproduccion", "Preproducción", C.gris),
    e("entrega", "Entrega", C.verde),
  ] },
  { nombre: "Video y Cine Indígena", etapas: [
    e("formacion", "Formación", C.rosa),
    e("proceso_creativo", "Proceso creativo y colectivo", C.cian),
    e("preproduccion", "Preproducción", C.gris),
    e("produccion", "Rodaje", C.ambar),
    e("postproduccion", "Postproducción", C.teal),
    e("entrega", "Entrega", C.verde),
  ] },
  { nombre: "Videojuego", etapas: [
    e("desarrollo_conceptual", "Desarrollo conceptual", C.azul),
    e("diseno", "Diseño", C.violeta),
    e("programacion", "Programación", C.ambar),
    e("pruebas", "Pruebas de prototipo", C.cian),
    e("entrega", "Entrega", C.verde),
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
