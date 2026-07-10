import { createClient } from "@/lib/supabase/server";
import { EntidadForm } from "@/components/EntidadForm";
import { FORM_CONF } from "@/lib/entidades";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function Nueva({ params }: { params: { tipo: string } }) {
  if (!FORM_CONF[params.tipo]) notFound();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/" className="btn btn-ghost">← Feed</Link>
        <span className="spacer" />
      </div>
      <EntidadForm tipo={params.tipo} />
    </div>
  );
}
