import { createClient } from "@/lib/supabase/server";
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
        <Link href="/" className="btn btn-ghost">← Volver al feed</Link>
        <span className="spacer" />
      </div>
      <h1 className="title-lg">⬆ Importar personas desde Seatable</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
        Sube el CSV de tu tabla Proveedores. La importación no duplica: si una persona
        ya existe (mismo nombre), se omite. Cada persona importada queda registrada
        en la bitácora con su evento de creación.
      </p>
      <Importador />
    </div>
  );
}
