import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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
