/* ── Los rubros del presupuesto DAFO, por categoría ──
   La Sección D del formulario es una tabla de costos agrupada por RUBRO. Como
   las etapas, los rubros dependen de la categoría del concurso. Por ahora está
   el de videojuego (sacado del formulario CDV); agregar otra categoría = una
   lista más aquí. */

export type Rubro = { clave: string; nombre: string };

export const RUBROS_POR_CATEGORIA: Record<string, Rubro[]> = {
  /* Video y Cine Indígena: los 9 rubros del presupuesto DAFO (2 categorías →
     9 sub-rubros), sacados del presupuesto real de Mujunakuy. Son los que
     clasifican cada gasto/RHE para el informe económico. */
  "Video y Cine Indígena": [
    { clave: "juridicos_financieros", nombre: "Aspectos jurídicos y financieros" },
    { clave: "contables_admin", nombre: "Aspectos contables y administrativos" },
    { clave: "admin_oficina", nombre: "Gastos administrativos y de oficina" },
    { clave: "formativo", nombre: "Aspecto formativo" },
    { clave: "recursos_tecnicos", nombre: "Recursos técnicos" },
    { clave: "equipo_proyecto", nombre: "Equipo del proyecto" },
    { clave: "diseno", nombre: "Diseño" },
    { clave: "logistica", nombre: "Logística" },
    { clave: "socializacion", nombre: "Socialización de resultados" },
  ],
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

/* ── La codificación jerárquica DAFO (categoría 1 · rubro 1.1 · ítem 1.1.1) ──
   El formato oficial agrupa los rubros en 2 CATEGORÍAS, cada una con su código
   y su total. Aquí vive ese árbol para el audiovisual (Cine Indígena). Si un
   rubro no está en el árbol (videojuego, genéricos), no tiene categoría y la
   tabla lo muestra plano. */
export type CatPresu = { cod: string; nombre: string; rubros: { clave: string; cod: string }[] };
export const CATEGORIAS_PRESU_AUDIOVISUAL: CatPresu[] = [
  { cod: "1", nombre: "GASTOS GENERALES (todas las etapas)", rubros: [
    { clave: "juridicos_financieros", cod: "1.1" },
    { clave: "contables_admin", cod: "1.2" },
    { clave: "admin_oficina", cod: "1.3" },
  ] },
  { cod: "2", nombre: "DESARROLLO DEL PROYECTO", rubros: [
    { clave: "formativo", cod: "2.1" },
    { clave: "recursos_tecnicos", cod: "2.2" },
    { clave: "equipo_proyecto", cod: "2.3" },
    { clave: "diseno", cod: "2.4" },
    { clave: "logistica", cod: "2.5" },
    { clave: "socializacion", cod: "2.6" },
  ] },
];

/* Meta de un rubro: su código y la categoría a la que pertenece. Null si el
   rubro no está en ningún árbol conocido (se muestra plano). */
export type RubroMeta = { rubroCod: string; catCod: string; catNombre: string };
const RUBRO_META: Record<string, RubroMeta> = {};
for (const c of CATEGORIAS_PRESU_AUDIOVISUAL)
  for (const r of c.rubros)
    RUBRO_META[r.clave] = { rubroCod: r.cod, catCod: c.cod, catNombre: c.nombre };
export const metaRubro = (clave: string): RubroMeta | null => RUBRO_META[clave] || null;

const TODOS = [...Object.values(RUBROS_POR_CATEGORIA).flat(), ...RUBROS_DEFAULT];
export const nombreRubro = (clave: string) =>
  TODOS.find(r => r.clave === clave)?.nombre || (clave || "").replace(/_/g, " ");

export const ESTADOS_FUENTE = ["Confirmada", "Por confirmar"];

/* El estímulo del Ministerio no puede exceder el 70% del costo total del
   proyecto (Bases CDV, art. 24 del Reglamento). El resto es contrapartida.
   PERO esa regla es de VIDEOJUEGOS: otras categorías (Cine Indígena, etc.)
   admiten estímulo del 100% sin contrapartida. Por eso el tope depende de la
   categoría; `TOPE_ESTIMULO` queda como el default de videojuego. */
export const TOPE_ESTIMULO = 0.70;
export const topeEstimuloDe = (categoria?: string | null): number =>
  categoria === "Videojuego" ? 0.70 : 1.0;

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
