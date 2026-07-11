import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Importador from "@/components/Importador";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function Importar() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
      </div>
      <h1 className="title-lg">⬆ Importar desde Seatable</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
        Personas, proyectos o empresas. La importación no duplica (reconoce folios,
        códigos y nombres ya existentes) y cada registro queda en la bitácora con
        su evento de creación.
      </p>
      <Importador />
    </div>
  );
}
