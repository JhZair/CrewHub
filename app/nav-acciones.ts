"use server";
import { createClient } from "@/lib/supabase/server";
import { DIAS_AVISO } from "@/lib/obligaciones";

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE EL MENÚ NECESITA SABER

   El menú de secciones vive dentro de <Volver>, o sea en las diecinueve
   pantallas, y es de cliente. Dos cosas le hacen falta que solo sabe el
   servidor: si quien mira lleva las finanzas —para enseñar o no la caja— y
   cuántas declaraciones están pendientes.

   ── POR QUÉ SE PREGUNTA Y NO SE PASA POR PROPS ──
   Enhebrar los dos datos por diecinueve páginas es la otra opción, y la
   número veinte que alguien añada se olvidaría de pasarlos. No daría error:
   simplemente esa pantalla no tendría caja ni burbuja, y nadie lo notaría
   hasta que hiciera falta.

   Las tres consultas son `count` sin filas y se piden en paralelo, así que
   cuestan poco aunque se repitan al navegar.
   ══════════════════════════════════════════════════════════════════════════ */

const hoyLima = () =>
  new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

/* ── ¿LE ENSEÑO LA CAJA? ──
 * La caja vivía en el menú de la cuenta, que se pinta en el servidor y ya
 * sabía esto. Al mudarla al menú de secciones hubo que preguntarlo aparte.
 *
 * NO se resuelve enseñándosela a todo el mundo: /caja comprueba el permiso por
 * su cuenta, así que el enlace no sería un agujero — sería una puerta que lleva
 * a un cartel de «no puedes entrar», y eso enseña que el menú miente.
 */
export async function puedeVerCaja(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("perfiles")
      .select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
    return !!((data as any)?.es_admin || (data as any)?.es_finanzas);
  } catch {
    return false;
  }
}

export type UrgenteObl = { vencidos: number; porVencer: number };

/* ── LO QUE VENCE, EN UN NÚMERO ──
 *
 * La casilla ya tenía su burbuja y las obligaciones no, y son justo el sitio
 * donde más falta hace: un correo sin leer espera, una declaración vencida
 * acumula multa. Sin burbuja, ese dato solo existía para quien entrara a
 * mirar la pantalla — y a la pantalla se entra cuando ya te acordaste, que es
 * exactamente lo que la burbuja está para no depender de.
 *
 * ── DOS NÚMEROS, NO UNO ──
 * Vencido y por vencer no son lo mismo y no pueden sumarse en la burbuja: uno
 * es una multa corriendo y el otro una tarea de esta semana. Se devuelven
 * separados y el menú pinta el rojo si hay vencidos y el ámbar si solo hay lo
 * segundo.
 *
 * ── LA SIMPLIFICACIÓN QUE SE ACEPTA, DICHA EN VOZ ALTA ──
 * Solo se filtra por `obligacion.activa`, no por el estado de la empresa. La
 * pantalla sí mira las dos cosas (ver `motivoNoDeclara`), pero el dueño de una
 * obligación es un par polimórfico sin clave foránea y cruzarlo aquí costaría
 * dos consultas más en cada navegación. En la práctica coinciden: a una
 * empresa que se cierra se le da de baja la obligación, que es el gesto que ya
 * ofrece la pantalla. Si algún día no coincidieran, la burbuja contaría de
 * más — y contar de más en un aviso se descubre al entrar; contar de menos, no.
 */
export async function obligacionesUrgentes(): Promise<UrgenteObl> {
  const vacio = { vencidos: 0, porVencer: 0 };
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return vacio;

    const hoy = hoyLima();
    const tope = new Date(Date.parse(hoy) + DIAS_AVISO * 86400000)
      .toISOString().slice(0, 10);

    /* `obligacion!inner(activa)` es lo que permite filtrar por la obligación
       sin traerse sus filas: con `count: exact, head: true` no viaja ni una. */
    const base = () => supabase.from("obligacion_periodo")
      .select("id,obligacion!inner(activa)", { count: "exact", head: true })
      .is("declarado_en", null)
      .not("vence", "is", null)
      .eq("obligacion.activa", true);

    const [venc, porV] = await Promise.all([
      base().lt("vence", hoy),
      base().gte("vence", hoy).lte("vence", tope),
    ]);

    /* Si falta alguna migración, `count` viene en null y la burbuja no se
       pinta. Es lo correcto: una burbuja en cero no es un cero, es «no lo sé»,
       y enseñar un 0 rojo mandaría a buscar algo que no está ahí. */
    return { vencidos: venc.count || 0, porVencer: porV.count || 0 };
  } catch {
    return vacio;
  }
}
