"use client";
import { marcarNotifsLeidas, marcarNotifLeida } from "@/app/actions";
import Link from "next/link";
import { useState, useEffect } from "react";

import { rutaNotif, esAutomatica } from "@/lib/notificaciones";
import NotifFila from "./NotifFila";
/* La fila (ícono/título/cuándo/chips) salió a NotifFila: la pintaban idéntica
   esta campanita, la flotante y ahora la página /notificaciones. */

export default function Campanita({ items: itemsProp, sinLeer: sinLeerProp, sinLeerBot: sinLeerBotProp = 0 }: {
  items: any[]; sinLeer: number; sinLeerBot?: number;
}) {
  const [abierta, setAbierta] = useState(false);
  const [items, setItems] = useState(itemsProp);
  const [sinLeer, setSinLeer] = useState(sinLeerProp);       // personales
  const [sinLeerBot, setSinLeerBot] = useState(sinLeerBotProp);
  const [pestana, setPestana] = useState<"mias" | "bot">("mias");
  // Re-sincroniza cuando el servidor refresca el feed
  useEffect(() => { setItems(itemsProp); setSinLeer(sinLeerProp); setSinLeerBot(sinLeerBotProp); }, [itemsProp, sinLeerProp, sinLeerBotProp]);

  // Abrir NO marca nada: el número persiste hasta atender cada una.
  const alternar = () => setAbierta(a => !a);

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

  // El timbre cuenta SOLO lo personal (lo que pide tu acción).
  const badge = sinLeer;
  const lista = items.filter(n => esAutomatica(n) === (pestana === "bot"));
  const nPestana = pestana === "bot" ? sinLeerBot : sinLeer;

  return (
    <span className="campanita">
      <button className="camp-btn" onClick={alternar} title="Notificaciones">
        🔔{badge > 0 && <span className="camp-badge">{badge > 9 ? "9+" : badge}</span>}
      </button>
      {abierta && (
        <>
          <div className="cbx-fondo" onClick={() => setAbierta(false)} />
          <div className="camp-menu">
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
                  onClick={() => { marcarUna(n); setAbierta(false); }}>
                  <NotifFila n={n} />
                </Link>
              ) : (
                <div key={n.id} className={`camp-item ${n.leida ? "leida" : "nueva"}`}
                  onClick={() => marcarUna(n)} style={{ cursor: n.leida ? "default" : "pointer" }}>
                  <NotifFila n={n} />
                </div>
              )
            ))}
            {/* La campanita muestra las recientes; el historial completo vive en
                su página. Como Gmail/GitHub: el timbre para lo de ahora, la
                página para buscar lo viejo. */}
            <Link href={pestana === "bot" ? "/notificaciones?t=bot" : "/notificaciones"} className="camp-vertodas" onClick={() => setAbierta(false)}>
              ver todas →
            </Link>
          </div>
        </>
      )}
    </span>
  );
}
