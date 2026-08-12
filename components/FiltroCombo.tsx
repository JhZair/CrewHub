"use client";
import { useRouter } from "next/navigation";
import MiniSelect from "@/components/MiniSelect";

/* ── UN FILTRO QUE YA NO CABE EN CHIPS ──
 *
 * Los chips son el lenguaje de los filtros de este sistema y siguen siéndolo
 * para lo que tiene tope: seis estados, seis tipos de proyecto. Pero hay dos
 * dimensiones que CRECEN sin techo —los años y las convocatorias— y en cuanto
 * las convocatorias pasaron de treinta, su fila ocupó media pantalla y empujó
 * el resto del panel fuera de la vista. Un filtro que hay que buscar deja de
 * filtrar.
 *
 * Así que esos dos van en desplegable. No es una excepción caprichosa: la
 * regla es «¿esta lista tiene final?». Si no lo tiene, combo.
 *
 * Navega en vez de guardar estado: el filtro vive en la URL —igual que con
 * chips—, así que se puede compartir, volver atrás y recargar sin perderlo.
 */
export default function FiltroCombo({ value, options, hrefs, etiqueta, ancho }: {
  /** El valor seleccionado; ha de existir en `options`. */
  value: string;
  /** [valor, texto] — lo que se ve en el menú. */
  options: string[][];
  /** A dónde lleva cada valor. Un mapa y no una función porque esto se pinta
   *  en el servidor y las funciones no cruzan esa frontera. */
  hrefs: Record<string, string>;
  /** Qué dice el botón cuando no basta con la opción (p. ej. recortada). */
  etiqueta?: string;
  ancho?: number;
}) {
  const router = useRouter();
  return (
    <MiniSelect
      value={value}
      options={options}
      etiqueta={etiqueta}
      buttonClass="vtab"
      buttonStyle={{
        maxWidth: ancho, textTransform: "none", letterSpacing: 0,
        overflow: "hidden", whiteSpace: "nowrap",
      }}
      onSelect={v => { const h = hrefs[v]; if (h) router.push(h); }}
    />
  );
}
