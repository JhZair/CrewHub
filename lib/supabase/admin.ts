import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/* Cliente service-role: SOLO para tareas de servidor sin sesión de
   usuario (el cron). Salta el RLS, así que jamás debe exponerse al
   cliente ni usarse en respuesta a input directo del usuario. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
