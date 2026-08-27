/* ── EL MEDIO DE PAGO DE UNA CAJA ──
 *
 * «Visa Débito ···8897». Lo que se necesita para reconocer de qué tarjeta
 * salió un gasto, que es lo mismo que imprime cualquier voucher.
 *
 * ── LO QUE NUNCA SE GUARDA ──
 * El número completo, la fecha de vencimiento, el CVV y el PIN. No es una
 * formalidad: la base la lee todo el equipo, no está cifrada campo a campo, y
 * con esos datos juntos se compra por internet. Y un número que entra una vez
 * ya no se puede borrar del pasado —queda en cada copia de seguridad—, así que
 * la única defensa que sirve es la que impide que entre.
 *
 * ── POR QUÉ EL TOPE ES SIETE DÍGITOS Y NO TRECE ──
 * La primera versión rechazaba trece dígitos o más, razonando que ese es el
 * mínimo de un PAN. Dos agujeros: un PAN de Maestro puede tener doce, y sobre
 * todo, «venc 12/28 cvv 123 ···8897» son ONCE dígitos y pasaba — justo la
 * combinación con la que se compra por internet, colada por la puerta que
 * decía protegerla.
 *
 * Contar hacia arriba desde lo legítimo, en vez de hacia abajo desde lo
 * prohibido: aquí caben cuatro dígitos, o los seis de un número de operación.
 * Nada más. Con el tope en siete no hay que adivinar qué formatos de tarjeta
 * existen — no cabe ninguno, ni el vencimiento al lado del CVV.
 *
 * ── TRES CAPAS ──
 * Esta regla se comprueba en el navegador (para avisar mientras se teclea), en
 * el servidor (que la vuelve a exigir, porque el navegador es del usuario) y
 * en la base, como `check`. Es la excepción a «una regla en un solo sitio».
 * ⚠ La base NO llama a estas funciones: tiene los números copiados a mano en
 * db/caja-medio.sql. Si alguna vez divergen, gana la base y se ve como un
 * error al guardar — al cambiar un umbral hay que tocar los dos archivos.
 */

/* Se normalizan los dígitos «anchos» (１２３) antes de contar: en JS `\d` solo
   reconoce 0-9, y pegar un número en esa forma es una evasión conocida. No es
   un descuido probable de un usuario, pero el comentario de arriba promete que
   no cabe ningún número, y eso tiene que ser cierto. */
const aAscii = (s: string) =>
  String(s || "").replace(/[０-９]/g, d => String(d.charCodeAt(0) - 0xFF10));

/** Cuántos dígitos hay, ignorando espacios, guiones y puntos. */
export const digitosDe = (s: string) => (aAscii(s).match(/\d/g) || []).length;

/* Siete: por encima de un número de operación (seis) y muy por debajo de
   cualquier PAN. Ver el razonamiento de arriba. */
export const TOPE_DIGITOS = 7;
export const LARGO_MAX = 60;

/* Algo con forma de fecha —«12/28», «09-2028»— no tiene nada que hacer en este
   campo, y es como se escribe un vencimiento. Se rechaza aparte del conteo
   para poder decir en el aviso QUÉ se ha detectado: «quita el vencimiento» es
   accionable, «demasiados dígitos» sobre un texto de cinco no. */
const PARECE_FECHA = /\b\d{1,2}\s*[/\-]\s*\d{2,4}\b/;

/** El aviso, o cadena vacía si el texto está bien. Vacío también es válido:
 *  no todas las cajas tienen tarjeta —el efectivo del sobre no la tiene—. */
export function revisarMedio(texto: string): string {
  const t = aAscii(String(texto || "").trim());
  if (!t) return "";
  if (t.length > LARGO_MAX)
    return `Demasiado largo (${t.length} de ${LARGO_MAX}). Basta con la marca y los últimos cuatro dígitos.`;
  if (PARECE_FECHA.test(t))
    return "Ahí hay algo con forma de fecha. La fecha de vencimiento NO se guarda aquí: solo la marca y los cuatro últimos dígitos, como «Visa Débito ···8897».";
  /* No se comprueba Luhn: se rechaza cualquier ristra larga de dígitos, sea
     válida o no. Un número tecleado con una errata sigue siendo el número de
     una tarjeta. */
  if (digitosDe(t) >= TOPE_DIGITOS)
    return "Demasiados dígitos. Aquí van solo los cuatro últimos —«Visa Débito ···8897»—, nunca el número completo, el vencimiento ni el CVV. (Un número de cuenta o un CCI tampoco caben.)";
  return "";
}

/* ── LA MISMA GUARDA, MÁS FLOJA, PARA EL NOMBRE ──
 *
 * La regla es de la tabla, no de un campo: a quien le rechacen el número en la
 * casilla de la tarjeta, el sitio siguiente donde lo va a pegar es el NOMBRE de
 * la caja, que está tres centímetros a la izquierda. Una defensa que cubre un
 * campo y deja el de al lado abierto no defiende nada.
 *
 * Pero el nombre sí puede llevar dígitos con motivo —«Banco BCP 191-2345678
 * Soles» es un nombre razonable—, así que aquí el listón es el otro: doce
 * dígitos, el PAN más corto que existe. No para un vencimiento suelto; para
 * eso está el campo propio, que es donde se va a escribir. */
export const PAN_MIN = 12;
export function pareceNumeroDeTarjeta(texto: string): boolean {
  return digitosDe(texto) >= PAN_MIN;
}

/* Lo que se enseña. No transforma lo que la persona escribió —«Yape de Katy»
   se queda tal cual—: solo recorta espacios. Adivinar la marca a partir del
   primer dígito sería inventarse un dato que nadie pidió. */
export const medioLimpio = (s?: string | null) => String(s || "").trim();
