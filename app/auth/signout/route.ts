import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {}
  redirect("/login");
}
