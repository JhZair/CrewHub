import { createClient, usuarioActual } from "@/lib/supabase/server";
import QuienEsta from "@/components/QuienEsta";

/* El layout no consulta nada, así que la presencia necesita su propio
   envoltorio de servidor: quién soy y el token para autenticar el canal
   (el mismo patrón que usa <Realtime/>). */
export default async function QuienEstaGlobal() {
  const supabase = createClient();
  /* El MISMO `getUser` que hace la página, no otro. `cache()` deduplica dentro
     del render: este componente va en el layout, así que sin eso cada pantalla
     pagaba dos verificaciones de sesión contra Supabase Auth —dos viajes de
     red— para saber lo mismo. Ver lib/supabase/server.ts. */
  const user = await usuarioActual();
  if (!user) return null;
  const [{ data: perfil }, { data: { session } }] = await Promise.all([
    supabase.from("perfiles").select("id,nombre,color,avatar_url").eq("id", user.id).maybeSingle(),
    supabase.auth.getSession(),
  ]);
  if (!perfil) return null;
  return <QuienEsta yo={perfil} token={session?.access_token} />;
}
