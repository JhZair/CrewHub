/* Los estados de un caso, en un solo sitio.
   Estaban duplicados en ocho archivos y ya habían empezado a divergir:
   unos con ícono, otros sin él. Cada ícono cuenta qué es el estado:
     📥 entró y espera turno   🛠 se está trabajando
     🔭 se vigila, no se cierra hoy   ⏸ está detenido a propósito
     ✅ terminó   🗄 descansa fuera del feed */

export const ESTADO_ICO: Record<string, string> = {
  abierta: "📥", en_progreso: "🛠", seguimiento: "🔭",
  en_pausa: "⏸", resuelta: "✅", archivada: "🗄",
};

export const ESTADO_TXT: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso", seguimiento: "Seguimiento",
  en_pausa: "En Pausa", resuelta: "Resuelta", archivada: "Archivada",
};

export const ESTADO_COL: Record<string, string> = {
  abierta: "var(--red)", en_progreso: "var(--yellow)", seguimiento: "var(--teal)",
  en_pausa: "var(--blue)", resuelta: "var(--green)", archivada: "var(--dim)",
};

/* Con ícono, para pills y columnas */
export const ESTADOS: Record<string, string> = Object.fromEntries(
  Object.keys(ESTADO_TXT).map(k => [k, `${ESTADO_ICO[k]} ${ESTADO_TXT[k]}`])
);

/* Para los combos: [valor, etiqueta] en el orden del ciclo de vida */
export const ESTADOS_SEL: [string, string][] =
  ["abierta", "en_progreso", "seguimiento", "en_pausa", "resuelta", "archivada"]
    .map(k => [k, ESTADOS[k]]);
