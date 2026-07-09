import { createClient } from "@/lib/supabase/server";
import Composer from "@/components/Composer";
import Avatar from "@/components/Avatar";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";

const TIPO_META: Record<string, [string, string]> = {
  aviso: ["📢 Aviso", "#a78bfa"], tarea: ["✅ Tarea", "#22c55e"],
  problema: ["❗ Problema", "#ff4d5e"], pago: ["💰 Pago", "#2dd4bf"],
  idea: ["💡 Idea", "#f4b400"], archivo: ["📎 Archivo", "#3b82f6"],
  conversacion: ["💬 Conversación", "#8b8ba3"],
};
const ESTADOS: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso",
  resuelta: "Resuelta", archivada: "Archivada",
};

export default async function Feed() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from("perfiles").select("nombre,color,rol").eq("id", user!.id).single();

  const { data: posts } = await supabase
    .from("publicaciones")
    .select(`
      id, tipo, titulo, cuerpo, estado, prioridad, creado_en,
      autor:perfiles!publicaciones_autor_id_fkey(nombre, color),
      comentarios(count)
    `)
    .order("creado_en", { ascending: false })
    .limit(50);

  return (
    <div className="shell">
      <div className="topbar">
        <div className="logo"><span className="ic">⬡</span><span>CrewHub<sup>+</sup></span></div>
        <span className="spacer" />
        <div className="userbox">
          <Avatar nombre={perfil?.nombre} color={perfil?.color} size={32} />
          <span><b style={{ color: "var(--text)" }}>{perfil?.nombre}</b><br />{perfil?.rol || "Equipo"}</span>
        </div>
        <LogoutButton />
      </div>

      <Composer userId={user!.id} />

      {(posts || []).map((p: any) => {
        const [tl, tc] = TIPO_META[p.tipo] || TIPO_META.conversacion;
        const nc = p.comentarios?.[0]?.count ?? 0;
        return (
          <Link key={p.id} href={`/caso/${p.id}`}>
            <div className="card link" style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Avatar nombre={p.autor?.nombre} color={p.autor?.color} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 15 }}>{p.titulo}</b>
                    <span className="badge" style={{ color: tc, background: `${tc}22` }}>{tl}</span>
                    <span style={{ flex: 1 }} />
                    <span className={`pill st-${p.estado}`}>{ESTADOS[p.estado] || p.estado}</span>
                  </div>
                  <div className="meta">
                    <span>{new Date(p.creado_en).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span>•</span><span>Por <b>{p.autor?.nombre}</b></span>
                    <span>•</span><span>💬 {nc}</span>
                  </div>
                  {p.cuerpo && <p style={{ color: "#c6c6da", fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{p.cuerpo.slice(0, 180)}{p.cuerpo.length > 180 ? "…" : ""}</p>}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
      {!posts?.length && <div className="empty">Aún no hay publicaciones. ¡Publica la primera! 🎬</div>}
    </div>
  );
}
