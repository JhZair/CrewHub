/* ── Los rubros del presupuesto DAFO, por categoría ──
   La Sección D del formulario es una tabla de costos agrupada por RUBRO. Como
   las etapas, los rubros dependen de la categoría del concurso. Por ahora está
   el de videojuego (sacado del formulario CDV); agregar otra categoría = una
   lista más aquí. */

export type Rubro = { clave: string; nombre: string };

export const RUBROS_POR_CATEGORIA: Record<string, Rubro[]> = {
  "Videojuego": [
    { clave: "gastos_generales", nombre: "Gastos generales" },
    { clave: "aspectos_admin", nombre: "Aspectos contables y administrativos" },
    { clave: "desarrollo_conceptual", nombre: "Desarrollo conceptual" },
    { clave: "diseno", nombre: "Diseño" },
    { clave: "programacion", nombre: "Programación" },
    { clave: "pruebas", nombre: "Pruebas de prototipo con usuarios" },
    { clave: "licencias", nombre: "Licencias" },
  ],
};

/* Genérico, para categorías que aún no tienen su preset. */
export const RUBROS_DEFAULT: Rubro[] = [
  { clave: "gastos_generales", nombre: "Gastos generales" },
  { clave: "honorarios", nombre: "Honorarios" },
  { clave: "produccion", nombre: "Producción" },
  { clave: "postproduccion", nombre: "Postproducción" },
];

export function rubrosDe(categoria?: string | null): Rubro[] {
  return (categoria && RUBROS_POR_CATEGORIA[categoria]) || RUBROS_DEFAULT;
}

const TODOS = [...Object.values(RUBROS_POR_CATEGORIA).flat(), ...RUBROS_DEFAULT];
export const nombreRubro = (clave: string) =>
  TODOS.find(r => r.clave === clave)?.nombre || (clave || "").replace(/_/g, " ");

export const ESTADOS_FUENTE = ["Confirmada", "Por confirmar"];

/* El estímulo del Ministerio no puede exceder el 70% del costo total del
   proyecto (Bases CDV, art. 24 del Reglamento). El resto es contrapartida. */
export const TOPE_ESTIMULO = 0.70;

/* La forma de lo que se guarda en postulaciones.presupuesto (jsonb). */
export type ItemPre = {
  id: string; rubro: string; concepto: string; unidad: string;
  cantidad: number; costo_unit: number;
  /* Cuánto de este ítem lo cubre OTRA fuente (contrapartida). Lo demás lo
     cubre el estímulo: por defecto 0 = ítem íntegramente financiado con el
     estímulo, y el medidor del 70% avisa cuando falta contrapartida. */
  otras: number;
};
export type FuentePre = { id: string; fuente: string; pais: string; estado: string; importe: number };
export type Presupuesto = { tipo_cambio: number; items: ItemPre[]; fuentes: FuentePre[] };
