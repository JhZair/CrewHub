import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Allowlist: solo los correos del equipo entran
      const { data: { user } } = await supabase.auth.getUser();
      const allowed = (process.env.ALLOWED_EMAILS || "")
        .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      const email = user?.email?.toLowerCase() || "";
      if (allowed.length && !allowed.includes(email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=no-autorizado`);
      }
      return NextResponse.redirect(`${origin}/`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
