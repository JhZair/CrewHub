/* Topes de renta de 4ta categoría (SUNAT).
   Se recalculan cada año con la UIT, así que hay que actualizarlos cada
   enero: basta agregar la fila del año nuevo.
   Fuente 2026: Resolución de Superintendencia 000390-2025/SUNAT
   (UIT 2026 = S/ 5,500; en 2025 era S/ 5,350). */

export type TopeAnio = {
  uit: number;
  anual: number;        // proyección anual que no debe superarse
  mensual: number;      // ingreso mensual que dispara la retención
  anualDir: number;     // directores de empresa, síndicos, mandatarios...
  mensualDir: number;
};

export const TOPES_4TA: Record<number, TopeAnio> = {
  2025: { uit: 5350, anual: 46813, mensual: 3901, anualDir: 37450, mensualDir: 3121 },
  2026: { uit: 5500, anual: 48125, mensual: 4010, anualDir: 38500, mensualDir: 3208 },
};

/* Si el año aún no está cargado, usamos el último conocido y lo
   advertimos: mejor un número viejo señalado que un cálculo inventado. */
export function topeDe(anio: number): { t: TopeAnio; anioUsado: number; estimado: boolean } {
  if (TOPES_4TA[anio]) return { t: TOPES_4TA[anio], anioUsado: anio, estimado: false };
  const anios = Object.keys(TOPES_4TA).map(Number).sort((a, b) => b - a);
  const ultimo = anios[0];
  return { t: TOPES_4TA[ultimo], anioUsado: ultimo, estimado: true };
}

/* OJO: el tope menor es para DIRECTORES DE EMPRESA (de directorio),
   síndicos, mandatarios, gestores de negocios y albaceas. Un director
   de cine es un independiente común: le toca el tope general. */
export function topeAnual(anio: number, esDirectorDeEmpresa = false): number {
  const { t } = topeDe(anio);
  return esDirectorDeEmpresa ? t.anualDir : t.anual;
}

/* Cuánto lleva y qué tan cerca está del límite.
   `acumulado` es lo que le giramos NOSOTROS: si factura por fuera, el
   tope real se alcanza antes y el sistema no puede verlo. */
export function estado4ta(acumulado: number, anio: number, esDirectorDeEmpresa = false) {
  const tope = topeAnual(anio, esDirectorDeEmpresa);
  const pct = tope > 0 ? Math.round((acumulado / tope) * 100) : 0;
  return {
    tope,
    pct,
    resta: Math.max(0, tope - acumulado),
    supero: acumulado > tope,
    cerca: pct >= 80 && acumulado <= tope,
  };
}

export const money = (n: number) => `S/ ${Math.round(n || 0).toLocaleString("es-PE")}`;
