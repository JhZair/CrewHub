import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Tablero from "@/components/Tablero";
import Realtime from "@/components/Realtime";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function TableroPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const { data: pubs } = await supabase.from("publicaciones")
    .select("id,titulo,tipo,estado,fecha_limite,creado_en,resp:perfiles!publicaciones_responsable_fkey(nombre)")
    .in("estado", ["abierta", "en_progreso", "en_pausa", "resuelta"])
    .order("creado_en", { ascending: false })
    .limit(200);

  const de = (estado: string, limite?: number) => {
    const lista = (pubs || []).filter((p: any) => p.estado === estado);
    return limite ? lista.slice(0, limite) : lista;
  };

  const columnas = [
    { estado: "abierta", titulo: "🔴 Sin Resolver", color: "var(--red)", items: de("abierta") },
    { estado: "en_progreso", titulo: "🟡 En Progreso", color: "var(--yellow)", items: de("en_progreso") },
    { estado: "en_pausa", titulo: "⏸ En Pausa", color: "var(--blue)", items: de("en_pausa") },
    { estado: "resuelta", titulo: "✅ Resueltas", color: "var(--green)", items: de("resuelta", 12) },
  ];

  return (
    <div className="shell shell-ancho">
      <Realtime tablas={["publicaciones"]} token={session?.access_token} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          arrastra una tarjeta a otra columna para cambiar su estado
        </span>
      </div>
      <h1 className="title-lg">🗂 Tablero</h1>
      <Tablero columnas={columnas} />
    </div>
  );
}
