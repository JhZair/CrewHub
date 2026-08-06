/* ── LLAVES: con qué se recupera cada cuenta externa ──
 *
 * Un número de recuperación NO es un dato de contacto: es una llave. Si la
 * cuenta de Gmail de una postulación se recupera con el celular de alguien que
 * mañana deja el equipo o cambia de chip, la cuenta no se pierde «un poco» —
 * se pierde entera, con el correo de DAFO dentro. Por eso esto no vive junto
 * al teléfono de contacto: es continuidad, no directorio.
 *
 * No hace falta modelo nuevo. `credencial_datos` (etiqueta + valor +
 * verificado_en) ya existe y su propia cabecera dice para qué se hizo. Lo que
 * faltaba era leerla AL REVÉS: dado un número, qué cuentas abre.
 */

/** Los últimos 9 dígitos: en la base conviven «+51 984…», «984 …» y «984…».
 *  Comparar literal fallaría por el formato y no por el dato — y un fallo por
 *  formato se lee como «no existe», que es la respuesta contraria. */
export const digitos = (v?: string | null) =>
  String(v ?? "").replace(/\D/g, "");
export const clavePhone = (v?: string | null) => {
  const d = digitos(v);
  return d.length >= 9 ? d.slice(-9) : "";
};

/** ¿Este valor parece un número peruano? 9 dígitos, empieza en 9. */
export const pareceCelular = (v?: string | null) => {
  const k = clavePhone(v);
  return !!k && k.startsWith("9");
};

export type ClaseLlave = "tel_recuperacion" | "correo_recuperacion" | "tel_contacto" | "correo_contacto" | "otro";

/* Qué clase de dato es, por su etiqueta. Es una HEURÍSTICA sobre texto libre y
 * se comporta como tal: lo que no reconoce cae en «otro» y se MUESTRA, no se
 * descarta. Un dato mal etiquetado que desaparece de la pantalla es peor que
 * uno mal clasificado: el segundo se ve y se corrige. */
export function claseDeDato(etiqueta?: string | null, valor?: string | null): ClaseLlave {
  const e = String(etiqueta ?? "").toLowerCase();
  const rec = /recuperaci|respaldo|backup|2fa|verificaci/.test(e);
  const tel = /tel|celular|m[oó]vil|whats/.test(e) || pareceCelular(valor);
  const cor = /correo|email|mail|@/.test(e) || String(valor ?? "").includes("@");
  if (rec && tel) return "tel_recuperacion";
  if (rec && cor) return "correo_recuperacion";
  if (tel) return "tel_contacto";
  if (cor) return "correo_contacto";
  return "otro";
}

/** ¿Este dato sirve para RECUPERAR la cuenta? (lo que la vuelve una llave) */
export const esLlave = (c: ClaseLlave) => c === "tel_recuperacion" || c === "correo_recuperacion";

/* Un teléfono de CONTACTO también puede ser la llave de hecho: Google manda el
 * código al número que tenga, se llame como se llame en nuestra ficha. Se
 * cuenta como llave probable —no como llave confirmada— y se dice cuál es
 * cuál: dar por segura una llave que nadie confirmó es el error que esta
 * pantalla existe para evitar. */
export const esLlaveProbable = (c: ClaseLlave) => c === "tel_contacto" || c === "correo_contacto";

export const ROTULO_CLASE: Record<ClaseLlave, string> = {
  tel_recuperacion: "📱 teléfono de recuperación",
  correo_recuperacion: "📧 correo de recuperación",
  tel_contacto: "📞 teléfono de contacto",
  correo_contacto: "✉ correo de contacto",
  otro: "· otro dato",
};

/** Días desde una fecha ISO corta, o null si no hay. */
export const diasDesde = (d?: string | null) => {
  const s = String(d ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Math.floor((Date.now() - new Date(s + "T12:00:00").getTime()) / 86400000);
};

/** A partir de cuántos días una llave pide reconfirmarse. */
export const STALE_LLAVE = 180;
