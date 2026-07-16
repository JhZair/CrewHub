"use client";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";

/* Quién más está trabajando ahora.
 *
 * No es un tablero de estados: es ambiente. Nació de un momento concreto —
 * alguien trabajando solo de noche, entra un comentario de Wilfredo, y al
 * darse cuenta de que estaba ahí le responde al toque y se arma una
 * conversación. Ese momento existía igual; lo único que faltaba era
 * enterarse. Si esto viviera en una página, nadie iría a mirarla.
 *
 * Por eso: se muestra SOLO cuando hay alguien más. Estar solo es lo normal
 * y no necesita anuncio; que haya alguien más es la noticia.
 *
 * Usa Realtime Presence: vive en memoria mientras la pestaña está abierta.
 * No hay columna «visto_en» que mantener ni que limpiar, y al cerrar la
 * pestaña desaparece solo. Si el navegador muere de golpe, el canal lo
 * detecta y lo saca igual.
 */

type Quien = { id: string; nombre: string; color?: string | null; avatar_url?: string | null };

export default function QuienEsta({ yo, token }: { yo: Quien; token?: string }) {
  const pathname = usePathname() || "";
  const [otros, setOtros] = useState<Quien[]>([]);
  const [esTop, setEsTop] = useState(false);

  // Solo en la ventana principal: los paneles del Monitor son iframes y
  // aparecerían como gente conectada de más.
  useEffect(() => { setEsTop(window.self === window.top); }, []);

  useEffect(() => {
    if (!esTop || !yo?.id || pathname.startsWith("/login")) return;
    const supabase = createClient();
    if (token) supabase.realtime.setAuth(token);

    const canal = supabase.channel("presencia", {
      config: { presence: { key: yo.id } },
    });

    const sincronizar = () => {
      const estado = canal.presenceState() as Record<string, any[]>;
      const gente = Object.entries(estado)
        .filter(([id]) => id !== yo.id)          // yo ya sé que estoy
        .map(([, metas]) => metas[0] as Quien)
        .filter(Boolean);
      setOtros(gente);
    };

    canal
      .on("presence", { event: "sync" }, sincronizar)
      .on("presence", { event: "join" }, sincronizar)
      .on("presence", { event: "leave" }, sincronizar)
      .subscribe(async (estado) => {
        if (estado === "SUBSCRIBED") await canal.track(yo);
      });

    return () => { supabase.removeChannel(canal); };
  }, [esTop, yo?.id, token, pathname]);

  // Estar solo es lo normal: sin nadie más, esto no existe
  if (!esTop || !otros.length) return null;

  return (
    <div className="presencia" title={`Trabajando ahora: ${otros.map(o => o.nombre).join(", ")}`}>
      <span className="presencia-pt" />
      {/* Solo las caras. El nombre escrito sobraba: el avatar ya lo dice, y
          el texto hacía crecer la píldora hasta convertir compañía en aviso.
          Quién es cada uno está en el tooltip, para cuando haga falta.
          Seis caben sin apretar —el equipo es de siete— y el resto cuenta. */}
      <span className="presencia-avs">
        {otros.slice(0, 6).map(o => (
          <span key={o.id} title={o.nombre}>
            <Avatar nombre={o.nombre} color={o.color} src={o.avatar_url} size={24} />
          </span>
        ))}
      </span>
      {otros.length > 6 && <b style={{ color: "var(--muted)" }}>+{otros.length - 6}</b>}
    </div>
  );
}
