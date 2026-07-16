/* ── Vigencia de poder ──
   El certificado de SUNARP trae su fecha de EMISIÓN, no de vencimiento: no
   caduca solo, caduca porque el fondo no la acepta pasado cierto tiempo.
   Por eso guardamos la emisión —que es el dato real que aparece en el
   papel— y el vencimiento se calcula.

   Guardar el vencimiento en su lugar sería guardar una opinión: si mañana
   DAFO pide 30 días en vez de 90, con la emisión guardada solo se cambia
   esta constante; con el vencimiento guardado habría que recargar todas
   las fichas a mano. */

import { fechaCorta } from "@/lib/fechas";

export const DIAS_VIGENCIA = 90;   // DAFO suele exigirla con menos de 3 meses

const D = 86400000;
const alDia = (f: string) => new Date(f + "T12:00:00").getTime();

/* Cuándo deja de servir */
export const venceVigencia = (emision: string) =>
  new Date(alDia(emision) + DIAS_VIGENCIA * D);

/* Días que le quedan. Negativo = ya venció. */
export const diasDeVigencia = (emision: string) =>
  Math.ceil((venceVigencia(emision).getTime() - Date.now()) / D);

export const vigenciaVencida = (emision?: string | null) =>
  !!emision && diasDeVigencia(emision) < 0;

export const fmtVence = (emision: string) => fechaCorta(venceVigencia(emision));

/* Frase lista para pintar: "vence en 12 d" / "venció hace 40 d" */
export const textoVigencia = (emision: string) => {
  const d = diasDeVigencia(emision);
  return d < 0 ? `venció hace ${-d} d (${fmtVence(emision)})`
    : d === 0 ? `vence hoy`
    : `vence en ${d} d (${fmtVence(emision)})`;
};
