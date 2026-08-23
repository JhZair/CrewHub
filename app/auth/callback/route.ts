import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/* ══════════════════════════════════════════════════════════════════════════
   LA PUERTA

   Google ya dijo quién eres; aquí se decide si además se te esperaba. Son dos
   preguntas distintas y por eso hay dos pasos.

   ── LA LISTA VIVE EN LA BASE, NO EN UNA VARIABLE DE ENTORNO ──
   Estaba en `ALLOWED_EMAILS`, así que sumar a alguien al equipo era editar la
   configuración de Vercel y volver a desplegar: un trámite de programador para
   una decisión que no lo es, y que toca hacer justo el día que la persona
   llega. Ahora se invita desde /admin y basta con que entre.

   El correo NO se busca en la tabla: se PREGUNTA por él. Quien llega aquí ya
   tiene sesión —aunque sea para echarlo dos líneas más abajo— y consultar la
   lista le daría un instante para leerse los correos del equipo entero.
   `correo_permitido()` contesta sí o no sobre un valor que quien pregunta ya
   conoce, que es el suyo.

   ── LAS DOS LISTAS SE SUMAN ──
   `ALLOWED_EMAILS` no se retira: la tabla se sembró con quien YA tenía cuenta,
   y a quien está invitado en la variable pero todavía no ha entrado no hay
   forma de verlo desde la base. Si se ignorara la variable, esa persona se
   quedaría fuera el día que llegue y nadie sabría por qué.

   ── Y NO SE ABRE SOLA ──
   Antes era `if (allowed.length && !allowed.includes(email))`: con la variable
   vacía o mal escrita, la condición entera se saltaba y entraba CUALQUIERA con
   una cuenta de Google. Una cerradura que al fallar abre del todo no lo es.

   Ahora se distinguen tres cosas que antes eran una:

     · «no hay ninguna lista» — ni tabla ni variable. Sistema recién instalado:
       se abre, porque cerrar dejaría fuera también a quien tiene que
       configurarlo, y se grita en el log.
     · «la función no existe» — migración pendiente. Manda la variable, que es
       el comportamiento de siempre.
     · «la consulta falló» — un tiempo de espera, la base saturada, la caché de
       PostgREST recién invalidada. Esto CIERRA. Es la diferencia que faltaba:
       un hipo de la red no puede ser una invitación.
   ══════════════════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase().trim() || "";

  const delEntorno = (process.env.ALLOWED_EMAILS || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const enElEntorno = !!email && delEntorno.includes(email);

  const { data: fila, error: eRpc } =
    await supabase.rpc("correo_permitido", { correo: email });
  /* `returns table` devuelve un arreglo aunque sea de una fila. */
  const puerta = (Array.isArray(fila) ? fila[0] : fila) as
    { permitido?: boolean; hay_lista?: boolean } | null | undefined;

  /* Solo «la función no existe» significa «todavía no hay tabla». Cualquier
     otro fallo es un fallo, y un fallo no puede valer por una invitación:
     PGRST202 es el código de PostgREST cuando no encuentra la función, y 42883
     el de Postgres para lo mismo. */
  const sinFuncion = !!eRpc && /PGRST202|42883|does not exist|schema cache/i
    .test(`${(eRpc as any).code || ""} ${(eRpc as any).message || ""}`);

  let permitido: boolean | null;
  /* ── ¿EL «NO» ES UNA RESPUESTA O UN TROPIEZO? ──
     Solo cuando la lista contestó de verdad se puede tratar el rechazo como un
     hecho. Si venimos de un fallo de la consulta, el «no» es provisional — y
     eso cambia lo que se hace con el perfil más abajo. */
  let respuestaFirme = true;

  if (eRpc && !sinFuncion) {
    console.error("[auth] No se pudo consultar la lista de invitados:", eRpc);
    permitido = enElEntorno;          // el respaldo aún vale; el fallo no.
    respuestaFirme = enElEntorno;     // si entra, es firme; si no, es un tropiezo.
  } else if (sinFuncion || !puerta?.hay_lista) {
    /* Sin tabla, o con la tabla vacía —que es lo mismo desde fuera: nadie ha
       dicho quién entra—. Manda la variable. Y si tampoco la hay, `null`. */
    permitido = delEntorno.length ? enElEntorno : null;
  } else {
    // Las dos listas se suman.
    permitido = puerta.permitido === true || enElEntorno;
  }

  /* `null` es «no hay ninguna lista en ninguna parte»: sistema recién
     instalado. Se deja entrar —si no, nadie podría configurarlo— pero se
     grita, porque es el único estado en que esta puerta no protege nada. */
  if (permitido === null) {
    console.warn(
      "[auth] ⚠ Nadie ha configurado quién puede entrar: la tabla " +
      "`cuenta_permitida` (db/invitaciones.sql) está vacía o no existe, y " +
      "ALLOWED_EMAILS tampoco. CUALQUIER cuenta de Google puede acceder.");
    return NextResponse.redirect(`${origin}/`);
  }

  if (!permitido) {
    /* Se apaga el perfil fantasma que el trigger acaba de crear, para que no
       aparezca en los combos de asignar. Esto ya se intentaba antes y no hacía
       nada: no había política de UPDATE sobre `perfiles`, así que RLS lo
       descartaba y PostgREST respondía «correcto» con cero filas. La política
       de db/cuentas-activas.sql incluye la rama `id = auth.uid()` justo para
       este momento — es la única forma de que quien no es admin, y nunca lo
       será, pueda apagarse a sí mismo al salir.

       ⚠ SOLO SI EL «NO» ES FIRME. Si venimos de un fallo de la consulta, este
       rechazo es pasajero: en cuanto la base responda, la persona vuelve a
       entrar. Pero su perfil se habría quedado APAGADO, y nada lo reenciende —
       desaparecería de los combos y de los avisos del equipo sin que nadie
       supiera por qué. Un tropiezo de la red no puede tener consecuencias
       permanentes. */
    if (user && respuestaFirme) {
      const { data: tocadas } = await supabase.from("perfiles")
        .update({ activo: false }).eq("id", user.id).select("id");
      if (!tocadas?.length) {
        console.warn(
          "[auth] No se pudo apagar el perfil de " + email +
          ": falta correr db/cuentas-activas.sql. Aparecerá en los combos " +
          "de asignar hasta que se apague a mano en /admin → Cuentas.");
      }
    }
    await supabase.auth.signOut();
    /* Se distingue en la URL: «no estás invitado» y «no se pudo comprobar» son
       cosas distintas, y la segunda se arregla volviendo a intentarlo. */
    return NextResponse.redirect(
      `${origin}/login?error=${respuestaFirme ? "no-autorizado" : "sin-comprobar"}`);
  }

  return NextResponse.redirect(`${origin}/`);
}
