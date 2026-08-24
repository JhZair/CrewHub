import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { EntidadForm } from "@/components/EntidadForm";
import { FORM_CONF } from "@/lib/entidades";
import Link from "@/components/Enlace";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ICO_ENT } from "@/lib/secciones";

export function generateMetadata({ params }: { params: { tipo: string } }): Metadata {
  return { title: `${ICO_ENT[params.tipo] || "📄"} Nuevo ${params.tipo}` };
}

export default async function Nueva({ params }: { params: { tipo: string } }) {
  if (!FORM_CONF[params.tipo]) notFound();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
      </div>
      <EntidadForm tipo={params.tipo} />
    </div>
  );
}
