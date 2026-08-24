import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   QUIÉN ERES — UNA SOLA VEZ POR RENDER

   `auth.getUser()` NO lee una cookie: hace una llamada de red al servidor de
   auth de Supabase para verificar el token. Y se llama tres veces por cada
   render de página: en `middleware.ts`, en `QuienEstaGlobal` (que va en el
   layout) y en la propia página. Medido: una pantalla que hace DOS consultas
   —/etiquetas— cuesta 563 ms por encima del suelo, y buena parte es esto.

   `cache()` deduplica las dos de dentro: la primera hace el viaje, la segunda
   recibe la misma promesa. La del middleware no entra, que es otro runtime.

   ⚠⚠ NO SIRVE DENTRO DE UNA ACCIÓN DE SERVIDOR. Se intentó y no hace nada, y
   conviene que quede escrito porque el fallo es mudo: `cache` resuelve su mapa
   con `resolveRequest()`, que solo devuelve algo dentro de un render flight, y
   el manejador de acciones ejecuta la función ANTES de crear ese contexto
   (`next/dist/server/app-render/action-handler.js`: el `await
   actionHandler(...)` va antes del `generateFlight`). Cada llamada recibe un
   `Map` nuevo y todo se ejecuta otra vez, sin error y sin pista.
   En una acción que necesite el usuario una sola vez para varias cosas, la
   forma que sí funciona es pedirlo una vez y PASARLO — ver `estadoGlobal` en
   app/actions.ts.

   ⚠ Deduplica por RENDER, no por sesión ni por proceso: no hay forma de que le
   sirva a alguien el usuario de otro. */
export const usuarioActual = cache(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
