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
   ══════════════════════════════════════════════════════════════════════════ */

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

  const { data: { user } } = await supabase.auth.getUser();
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
