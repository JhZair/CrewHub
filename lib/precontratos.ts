/* ── Precontratos (cartas de compromiso del equipo) ──
   Un precontrato ata a una PERSONA del equipo nombrado con un ÍTEM del
   presupuesto: de ahí hereda el monto (honorario), para que el documento y lo
   presupuestado nunca se contradigan. No guardamos el monto: lo derivamos del
   presupuesto vivo (montoDeItem). */

import { type ItemPre } from "@/lib/rubros";

export type Precontrato = {
  id: string;
  persona_id: string;   // persona del equipo (proyecto o postulación)
  cargo: string;        // rol acordado (por defecto, el cargo en el equipo)
  item_ids: string[];   // ítems del presupuesto cuyo total suma el honorario
  estado: "pendiente" | "firmado";
  firmado_en: string;   // ISO date o ""
  forma_pago: string;   // p. ej. "50% a la firma, 50% a la entrega"
  notas: string;
};

export const ESTADOS_PRE = ["pendiente", "firmado"] as const;

/* Monto (bruto) de UN ítem: cantidad × costo unitario. */
export const montoDeItem = (it?: ItemPre | null): number =>
  it ? (Number(it.cantidad) || 0) * (Number(it.costo_unit) || 0) : 0;

/* Monto comprometido en el precontrato: la SUMA de los ítems elegidos (un
   honorario puede componerse de varios ítems del presupuesto). */
export const montoDeItems = (items: ItemPre[], ids: string[]): number =>
  (ids || []).reduce((s, id) => s + montoDeItem(items.find(i => i.id === id)), 0);

/* Etiqueta legible de un ítem para el selector: «Rubro · concepto — S/ monto». */
export const rotuloItem = (it: ItemPre, nombreRubro: (c: string) => string): string => {
  const m = montoDeItem(it);
  const concepto = (it.concepto || "").trim() || "(sin concepto)";
  return `${nombreRubro(it.rubro)} · ${concepto} — S/ ${Math.round(m).toLocaleString("es-PE")}`;
};

/* Fila vacía de precontrato para una persona del equipo. */
export const precontratoNuevo = (persona_id: string, cargo: string): Precontrato => ({
  id: "", persona_id, cargo: cargo || "", item_ids: [],
  estado: "pendiente", firmado_en: "", forma_pago: "", notas: "",
});

/* Compatibilidad: filas viejas guardaron `item_id` (uno solo). Las normaliza a
   `item_ids` sin perder lo que ya había. */
export const normalizarPre = (f: any): Precontrato => ({
  id: f.id || "",
  persona_id: f.persona_id,
  cargo: f.cargo || "",
  item_ids: Array.isArray(f.item_ids) ? f.item_ids : (f.item_id ? [f.item_id] : []),
  estado: f.estado === "firmado" ? "firmado" : "pendiente",
  firmado_en: f.firmado_en || "",
  forma_pago: f.forma_pago || "",
  notas: f.notas || "",
});
