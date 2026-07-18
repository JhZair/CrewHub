import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { notificacionesTodas } from "@/app/actions";
import NotificacionesLista from "@/components/NotificacionesLista";

export const metadata: Metadata = { title: "🔔 Notificaciones" };

/* /notificaciones — el historial completo. La campanita corta en 12 para
   "lo de ahora"; esta página es para bajar a buscar lo viejo. La primera
   tanda se pinta en el servidor (rápido, sin parpadeo); "ver más" ya es
   cliente. */
export default async function Notificaciones() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { items, hayMas, total } = await notificacionesTodas(0);

  return (
    <div className="shell" style={{ maxWidth: "min(720px, 96vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>todo lo que te avisó el Bot Qhaway</span>
      </div>

      <h1 className="title-lg">🔔 Notificaciones</h1>

      <NotificacionesLista inicial={items} hayMas={hayMas} total={total} />
    </div>
  );
}
