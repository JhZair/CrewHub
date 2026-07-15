/* El RUC de una persona natural se deduce de su DNI: 10 + DNI + dígito
   verificador. Así evitamos pedirlo a mano (y las erratas que trae).
   Ojo: que el RUC sea calculable NO significa que esté inscrito en SUNAT;
   eso solo lo confirma la verificación. */

/* Dígito verificador del RUC peruano (pesos 5,4,3,2,7,6,5,4,3,2).
   Verificado contra RUCs reales del sistema. */
export function digitoVerificadorRuc(base10: string): number {
  const P = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = base10.split("").reduce((a, d, i) => a + Number(d) * P[i], 0);
  const r = 11 - (suma % 11);
  return r === 10 ? 0 : r === 11 ? 1 : r;
}

/* DNI (8 dígitos) → RUC de persona natural (11 dígitos). null si no aplica. */
export function rucDePersona(dni?: string | null): string | null {
  const d = String(dni || "").replace(/\D/g, "");
  if (d.length !== 8) return null;
  const base = "10" + d;
  return base + digitoVerificadorRuc(base);
}

/* ¿El RUC tiene un dígito verificador coherente? */
export function rucValido(ruc?: string | null): boolean {
  const r = String(ruc || "").replace(/\D/g, "");
  return r.length === 11 && digitoVerificadorRuc(r.slice(0, 10)) === Number(r[10]);
}
