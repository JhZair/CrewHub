import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Link from "next/link";
import { redirect } from "next/navigation";

/* El perfil de Qhaway — mismo diseño que toda entidad viva:
   carné a la izquierda, vida a la derecha. */

const fecha = (d: string) =>
  new Date(d).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Qhaway() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  // Solo la voz de Qhaway: eventos tipo 'bot' (su ronda).
  // Los eventos sin autor de otras clases son del Sistema (SQL/semillas).
  const [{ count: total }, { count: hoyCount }, { data: eventos }, { data: primero }] = await Promise.all([
    supabase.from("actividad").select("id", { count: "exact", head: true }).eq("tipo", "bot"),
    supabase.from("actividad").select("id", { count: "exact", head: true })
      .eq("tipo", "bot").gte("creado_en", hoy.toISOString()),
    supabase.from("actividad")
      .select("tipo,detalle,creado_en,entidad_tipo,entidad_id")
      .eq("tipo", "bot")
      .order("creado_en", { ascending: false }).limit(20),
    supabase.from("actividad").select("creado_en").eq("tipo", "bot")
      .order("creado_en", { ascending: true }).limit(1),
  ]);

  const ids = Array.from(new Set((eventos || [])
    .filter((e: any) => e.entidad_tipo === "publicacion").map((e: any) => e.entidad_id)));
  const { data: titulos } = ids.length
    ? await supabase.from("publicaciones").select("id,titulo").in("id", ids)
    : { data: [] };
  const tituloDe = new Map((titulos || []).map((t: any) => [t.id, t.titulo]));

  const nacimiento = primero?.[0]?.creado_en
    ? new Date(primero[0].creado_en).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  return (
    <div className="shell shell-ancho">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          🤖 miembro no humano
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#7c5cff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 27 }}>🤖</span>
        <h1 className="title-lg" style={{ flex: 1, margin: 0 }}>Qhaway</h1>
      </div>

      <div className="perfil-grid">
        {/* ===== El carné ===== */}
        <aside>
          <div className="card">
            <div className="ficha-row"><span className="fk">Significado</span><span className="fv">"El que observa y cuida"</span></div>
            <div className="ficha-row"><span className="fk">Rol</span><span className="fv">Vigilante del equipo</span></div>
            <div className="ficha-row"><span className="fk">En servicio desde</span><span className="fv">{nacimiento}</span></div>
            <div className="ficha-row"><span className="fk">Ronda diaria</span><span className="fv">7:30 a.m. 🌄</span></div>
            <div className="ficha-row"><span className="fk">Canales</span><span className="fv">Feed · Google Chat · 🔔</span></div>
            <div className="ficha-row"><span className="fk">Apuntes en total</span><span className="fv" style={{ color: "var(--blue)", fontWeight: 800 }}>{total || 0}</span></div>
            <div className="ficha-row"><span className="fk">Apuntes hoy</span><span className="fv">{hoyCount || 0}</span></div>
            <div className="ficha-row"><span className="fk">Sueldo</span><span className="fv">S/ 0.00 (voluntario) 😄</span></div>
          </div>

          <div className="linked" style={{ marginTop: 14 }}>
            <h4>📜 Mis reglas de servicio</h4>
            <ul style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.9, paddingLeft: 18 }}>
              <li>Despierto los casos sin actividad por 3 días — insisto cada 3, no ametrallo.</li>
              <li>Vigilo los vencimientos: 7 días antes, 2 antes, el día D, y no suelto lo vencido.</li>
              <li>Canto las alertas SUNAT de las empresas activas hasta que se resuelvan.</li>
              <li>Todo lo que hago queda en la bitácora — rindo cuentas como cualquiera.</li>
              <li>Propongo, nunca dispongo: jamás cierro ni borro nada por mi cuenta.</li>
            </ul>
          </div>
        </aside>

        {/* ===== La vida ===== */}
        <main>
          <div className="h4" style={{ marginTop: 0 }}>🕐 Mis últimas intervenciones · {(eventos || []).length}</div>
          <div className="tl">
            {(eventos || []).map((e: any, i: number) => (
              <div className="tl-ev bot" key={i}>
                <span>🤖</span>
                <span style={{ flex: 1 }}>
                  {e.detalle?.mensaje || e.tipo}
                  {tituloDe.get(e.entidad_id) && (
                    <> — <Link href={`/caso/${e.entidad_id}`} style={{ color: "var(--blue)" }}>
                      «{tituloDe.get(e.entidad_id)}»</Link></>
                  )}
                </span>
                <span className="t">{fecha(e.creado_en)}</span>
              </div>
            ))}
            {!(eventos || []).length && <div className="empty">Aún sin intervenciones — mi primera ronda llega a las 7:30.</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
