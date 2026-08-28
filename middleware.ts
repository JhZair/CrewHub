import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE CUESTA UNA PRECARGA, Y POR QUÉ SE SALTA AQUÍ

   Medido en producción: abrir /personas disparaba 53 peticiones. Cuarenta y
   nueve eran precargas `?_rsc=` de `<Link>` —el menú al abrirlo, cada chip de
   filtro, cada ficha visible— de 277 a 776 ms CADA UNA.

   La primera explicación fue la equivocada, y conviene dejarla escrita para que
   nadie la repita: NO era que la precarga renderizara la página. Next ya lo
   impide — cortocircuita el árbol cuando no encuentra ningún `loading` en la
   ruta («the prefetch will be short-circuited to avoid requesting a potentially
   very expensive subtree», walk-tree-with-flight-router-state.js). Poner un
   `app/loading.tsx` para «arreglarlo» habría APAGADO esa protección en toda la
   aplicación, porque `hasLoadingComponentInTree` mira el árbol entero.

   Lo que costaba esos 300 ms es esta línea de abajo. `auth.getUser()` no lee una
   cookie: hace una llamada de RED a Supabase Auth para verificar el token. El
   matcher excluye lo estático, pero no las peticiones RSC — así que cada una de
   las 49 precargas pagaba una verificación completa.

   ── Y SALTARLA EN UNA PRECARGA NO ABRE NADA ──
   Una precarga con el árbol cortocircuitado devuelve estado de router: ni datos,
   ni HTML de la página. No hay nada que proteger porque no se entrega nada. Y
   cuando la persona PULSA el enlace, esa navegación llega sin la cabecera
   `next-router-prefetch` y pasa por la comprobación de siempre.

   Es la única forma segura de abaratarla: quitar `getUser()` del todo, o
   cambiarlo por `getSession()` —que lee la cookie sin verificarla—, sí dejaría
   la puerta entornada, porque una cookie se puede falsificar y el middleware es
   quien decide si te manda a /login.

   ╔══════════════════════════════════════════════════════════════════════════╗
   ║  Y POR QUÉ ESA LLAMADA TIENE UN PLAZO                                    ║
   ╚══════════════════════════════════════════════════════════════════════════╝
   El sitio entero devolvió 504 GATEWAY_TIMEOUT ·
   `MIDDLEWARE_INVOCATION_TIMEOUT`. La causa: `auth.getUser()` es una llamada de
   RED, y cuando Supabase Auth va lento el middleware se queda esperando hasta
   que Vercel lo corta. Como el middleware corre ANTES que todo, no se cae una
   pantalla: se caen TODAS. Un servicio externo lento se convertía en la caída
   completa de la aplicación.

   ── SE DEJA PASAR, Y NO ES UN AGUJERO ──
   Si la verificación no contesta a tiempo, la petición SIGUE. Suena mal hasta
   que se comprueba quién protege de verdad: 42 de las 43 páginas hacen su
   propio `getUser()` y su `redirect("/login")`. La 43ª es `/monitor`, que son
   dos iframes cargando `/` y `/tablero` — y esas dos sí comprueban. O sea que
   el middleware REDIRIGE ANTES, pero no es el que cierra la puerta.
   (Comprobado con `grep` sobre las 43 páginas antes de escribir esto. Si alguna
   pantalla futura se salta la comprobación, esta red deja de cubrirla: la regla
   es que toda página protegida hace su propio `getUser()`.)

   La alternativa era mandar a /login al vencer el plazo, y es peor: un hipo de
   red de tres segundos echaría a todo el mundo de su sesión, en mitad de lo que
   estuviera escribiendo.

   El plazo son 3,5 s. Una verificación normal tarda entre 100 y 300 ms; a los
   tres segundos y medio ya no es lentitud, es que no va a contestar. Y queda
   MUY por debajo del corte de Vercel, que es lo que convertía el problema en
   una caída total.
   ══════════════════════════════════════════════════════════════════════════ */

/** Cuánto se espera a que Supabase Auth verifique el token antes de seguir sin
 *  saber quién es. Ver el bloque de arriba. */
const PLAZO_AUTH_MS = 3500;

export async function middleware(request: NextRequest) {
  if (request.headers.get("next-router-prefetch") === "1") {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /* ── LA VERIFICACIÓN, CON PLAZO ──
     `undefined` significa «no se pudo saber», que NO es lo mismo que «no hay
     sesión»: con `null` mandaríamos a /login a alguien que sí está dentro. */
  let user: any = null;
  let sinRespuesta = false;
  try {
    const r = await Promise.race([
      supabase.auth.getUser(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), PLAZO_AUTH_MS)),
    ]);
    if (r === null) sinRespuesta = true;
    else user = (r as any)?.data?.user ?? null;
  } catch {
    /* Un fallo de red tampoco puede tumbar el sitio. Mismo criterio que el
       plazo: se sigue, y la página decide. */
    sinRespuesta = true;
  }

  if (sinRespuesta) {
    /* Sale en los registros de Vercel. Sin esto, la degradación es invisible:
       el sitio «funciona» y nadie sabe que la verificación lleva días sin
       contestar. */
    console.warn(`[middleware] auth.getUser() no respondió en ${PLAZO_AUTH_MS} ms; se deja pasar y decide la página. Ruta: ${request.nextUrl.pathname}`);
    return response;
  }

  const path = request.nextUrl.pathname;
  // /api/cron/* no pasa por sesión: se protege con CRON_SECRET (lo llama
  // Vercel Cron, que no tiene cookies de usuario).
  const publica = path.startsWith("/login") || path.startsWith("/auth")
    || path.startsWith("/api/cron")
    // El cartero de push lo llama pg_cron (sin cookies); su seguridad es la
    // llave PUSH_CRON_LLAVE que valida el propio endpoint.
    || path.startsWith("/api/push/despachar")
    /* La casilla DAFO la llama el Apps Script de Google (sin cookies); su
       seguridad es INGESTA_DAFO_LLAVE, que el endpoint exige SIEMPRE —sin
       variable configurada responde 401 a todo, nunca abierto.
       REGLA para lo que se agregue bajo /api/ingesta: valida tu propia llave,
       porque aquí ya no hay sesión que te cubra.
       Sin esta línea el POST se iba redirigido a /login y devolvía la página de
       login con estado 200: el Apps Script lo habría leído como «entregado» y
       habría marcado los hilos como enviados sin que entrara un solo correo.
       Justo la pérdida silenciosa que este módulo existe para evitar. */
    || path.startsWith("/api/ingesta")
    || path === "/manifest.webmanifest"
    || path === "/sw.js";

  if (!user && !publica) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && path.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
