/* La puerta que se calcula del propio identificador.
 *
 * Hay plataformas donde el link no es uno para todos: Gmail con seis cuentas
 * te deja en la que estaba abierta, y entrar «a Gmail» no es el problema —
 * el problema es caer en la bandeja equivocada y cambiarla a mano, seis
 * veces al día.
 *
 * Pero el correo ya está guardado: es el identificador de la credencial. Así
 * que el link no hace falta guardarlo, se calcula — igual que el RUC de una
 * persona se calcula de su DNI en vez de guardarse aparte (lib/ruc.ts).
 *
 * La plantilla vive en la plataforma (`plataformas.plantilla_url`), NO aquí:
 * si dijera «si se llama Gmail, arma este link», el día que alguien la
 * renombre a «Correo Google» dejaría de funcionar sin decir por qué. Y si
 * Google cambia su URL —lo hace—, se corrige en el admin, sin deploy.
 *
 * Este archivo es puro a propósito: sin supabase, sin cookies. Lo importan
 * componentes de cliente y de servidor por igual.
 */

export const TOKEN = "{usuario}";

/* Reemplaza {usuario} por el identificador de la credencial, escapado.
   Devuelve null si no hay plantilla, no hay usuario, o la plantilla no
   tiene el hueco — sin las tres cosas no hay link que calcular, y un link
   a medias es peor que ninguno. */
export const aplicarPlantilla = (plantilla?: string | null, usuario?: string | null): string | null => {
  const p = String(plantilla ?? "").trim();
  const u = String(usuario ?? "").trim();
  if (!p || !u || !p.includes(TOKEN)) return null;
  return p.split(TOKEN).join(encodeURIComponent(u));
};

/* La plantilla de Gmail, como sugerencia para el admin. No la usa el código:
   se siembra en la tabla (db/plataformas-plantilla.sql) y desde ahí se
   edita. Está escrita aquí solo para poder ofrecerla de un clic.

   OJO: Google ha cambiado esta URL más de una vez. Compruébala con el ↗
   del admin antes de darla por buena — si no honra la cuenta, se cambia
   ahí mismo. */
export const PLANTILLA_GMAIL =
  `https://accounts.google.com/AccountChooser?Email=${TOKEN}&continue=https%3A%2F%2Fmail.google.com%2Fmail%2F`;
