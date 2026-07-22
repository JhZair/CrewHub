"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { misNotificaciones, marcarNotifsLeidas, marcarNotifLeida } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";

/* Campanita flotante global: aparece en las páginas internas (no en el feed,
   que ya tiene la suya, ni dentro de los paneles del Monitor). Trae las
   notificaciones bajo demanda y se actualiza en tiempo real. */

import { rutaNotif, esAutomatica } from "@/lib/notificaciones";
import NotifFila from "./NotifFila";
/* La fila salió a NotifFila: la pintaban idéntica esta campanita, la del feed
   y la página /notificaciones. */

export default function CampanitaGlobal() {
  const pathname = usePathname() || "";
  // Oculta en login, en el feed (que ya tiene su campanita) y en la propia
  // página de notificaciones (que ES el centro de notificaciones, con su realtime).
  const oculto = pathname.startsWith("/login") || pathname === "/" || pathname.startsWith("/notificaciones");
  const [esTop, setEsTop] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [sinLeer, setSinLeer] = useState(0);        // personales
  const [sinLeerBot, setSinLeerBot] = useState(0);
  const [pestana, setPestana] = useState<"mias" | "bot">("mias");
  const [abierta, setAbierta] = useState(false);

  useEffect(() => { setEsTop(window.self === window.top); }, []);

  useEffect(() => {
    if (oculto || !esTop) return;
    const cargar = async () => {
      const r: any = await misNotificaciones();
      setItems(r.items || []); setSinLeer(r.sinLeer || 0); setSinLeerBot(r.sinLeerBot || 0);
    };
    cargar();
    const supabase = createClient();
    let vivo = true;
    // Canal síncrono + nombre único por montaje: `createClient` es singleton, un
    // nombre fijo reutilizaría un canal ya suscrito y `.on()` reventaría.
    const canal = supabase.channel(`campanita-global-${Math.random().toString(36).slice(2)}`);
    canal.on("postgres_changes",
      { event: "*", schema: "public", table: "notificaciones" }, () => cargar());
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!vivo) return;
      if (session) supabase.realtime.setAuth(session.access_token);
      canal.subscribe();
    })();
    return () => { vivo = false; supabase.removeChannel(canal); };
  }, [oculto, esTop, pathname]);

  if (oculto || !esTop) return null;

  // Abrir NO marca nada: solo muestra. El número persiste hasta atender.
  const abrir = () => setAbierta(a => !a);

  // Atender una sola: se marca leída y baja el contador de su grupo.
  const marcarUna = async (n: any) => {
    if (n.leida) return;
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x));
    if (esAutomatica(n)) setSinLeerBot(c => Math.max(0, c - 1));
    else setSinLeer(c => Math.max(0, c - 1));
    await marcarNotifLeida(n.id);
  };

  // Marca todas las de la pestaña actual (no las de la otra).
  const marcarTodas = async () => {
    const esBot = pestana === "bot";
    setItems(prev => prev.map(n => esAutomatica(n) === esBot ? { ...n, leida: true } : n));
    if (esBot) setSinLeerBot(0); else setSinLeer(0);
    await marcarNotifsLeidas(esBot ? "bot" : "personal");
  };

  const fila = (n: any) => <NotifFila n={n} />;
  const badge = sinLeer;   // el timbre = solo lo personal
  const lista = items.filter(n => esAutomatica(n) === (pestana === "bot"));
  const nPestana = pestana === "bot" ? sinLeerBot : sinLeer;

  return (
    <div className="camp-flot">
      <button className="camp-flot-btn" onClick={abrir} title="Notificaciones">
        🔔{badge > 0 && <span className="camp-badge">{badge > 9 ? "9+" : badge}</span>}
      </button>
      {abierta && (
        <>
          <div className="cbx-fondo" onClick={() => setAbierta(false)} />
          <div className="camp-menu camp-menu-flot">
            <div className="camp-tabs">
              <button className={`camp-tab ${pestana === "mias" ? "on" : ""}`} onClick={() => setPestana("mias")}>
                👤 Para ti{sinLeer > 0 && <span className="camp-tabn">{sinLeer}</span>}
              </button>
              <button className={`camp-tab ${pestana === "bot" ? "on" : ""}`} onClick={() => setPestana("bot")}>
                🤖 Del Bot{sinLeerBot > 0 && <span className="camp-tabn">{sinLeerBot}</span>}
              </button>
              {nPestana > 0 && <button className="camp-marcar" onClick={marcarTodas}>✓ marcar</button>}
            </div>
            {lista.length === 0 && (
              <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", padding: "16px 0" }}>
                {pestana === "bot" ? "Sin avisos del Bot por ahora. 🤖" : "Nada que requiera tu acción. ✨"}
              </div>
            )}
            {lista.map((n: any) => (
              rutaNotif(n) ? (
                <Link key={n.id} href={rutaNotif(n)!}
                  className={`camp-item ${n.leida ? "leida" : "nueva"}`}
                  onClick={() => { marcarUna(n); setAbierta(false); }}>{fila(n)}</Link>
              ) : (
                <div key={n.id} className={`camp-item ${n.leida ? "leida" : "nueva"}`}
                  onClick={() => marcarUna(n)} style={{ cursor: n.leida ? "default" : "pointer" }}>{fila(n)}</div>
              )
            ))}
            <Link href={pestana === "bot" ? "/notificaciones?t=bot" : "/notificaciones"} className="camp-vertodas" onClick={() => setAbierta(false)}>
              ver todas →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
