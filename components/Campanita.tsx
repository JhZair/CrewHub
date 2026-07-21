"use client";
import { marcarNotifsLeidas, marcarNotifLeida } from "@/app/actions";
import Link from "next/link";
import { useState, useEffect } from "react";

import { anclaDe } from "@/lib/notificaciones";
import NotifFila from "./NotifFila";
/* La fila (ícono/título/cuándo/chips) salió a NotifFila: la pintaban idéntica
   esta campanita, la flotante y ahora la página /notificaciones. */

export default function Campanita({ items: itemsProp, sinLeer: sinLeerProp }: { items: any[]; sinLeer: number }) {
  const [abierta, setAbierta] = useState(false);
  const [items, setItems] = useState(itemsProp);
  const [sinLeer, setSinLeer] = useState(sinLeerProp);
  // Re-sincroniza cuando el servidor refresca el feed
  useEffect(() => { setItems(itemsProp); setSinLeer(sinLeerProp); }, [itemsProp, sinLeerProp]);

  // Abrir NO marca nada: el número persiste hasta atender cada una.
  const alternar = () => setAbierta(a => !a);

  const marcarUna = async (n: any) => {
    if (n.leida) return;
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x));
    setSinLeer(c => Math.max(0, c - 1));
    await marcarNotifLeida(n.id);
  };

  const marcarTodas = async () => {
    setItems(prev => prev.map(n => ({ ...n, leida: true })));
    setSinLeer(0);
    await marcarNotifsLeidas();
  };

  const contenido = (n: any) => <NotifFila n={n} />;

  return (
    <span className="campanita">
      <button className="camp-btn" onClick={alternar} title="Notificaciones">
        🔔{sinLeer > 0 && <span className="camp-badge">{sinLeer > 9 ? "9+" : sinLeer}</span>}
      </button>
      {abierta && (
        <>
          <div className="cbx-fondo" onClick={() => setAbierta(false)} />
          <div className="camp-menu">
            <div className="camp-cab">
              <span>🔔 Notificaciones{sinLeer > 0 ? ` · ${sinLeer} sin leer` : ""}</span>
              {sinLeer > 0 && <button className="camp-marcar" onClick={marcarTodas}>✓ marcar todas</button>}
            </div>
            {items.length === 0 && (
              <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", padding: "16px 0" }}>
                Nada nuevo — Bot Qhaway vigila por ti. 🤖
              </div>
            )}
            {items.map((n: any) => (
              n.publicacion_id ? (
                <Link key={n.id} href={`/caso/${n.publicacion_id}${anclaDe(n.tipo)}`}
                  className={`camp-item ${n.leida ? "leida" : "nueva"}`}
                  onClick={() => { marcarUna(n); setAbierta(false); }}>
                  {contenido(n)}
                </Link>
              ) : (
                <div key={n.id} className={`camp-item ${n.leida ? "leida" : "nueva"}`}
                  onClick={() => marcarUna(n)} style={{ cursor: n.leida ? "default" : "pointer" }}>
                  {contenido(n)}
                </div>
              )
            ))}
            {/* La campanita muestra las 12 recientes; el historial completo
                vive en su página. Como Gmail/GitHub: el timbre para lo de
                ahora, la página para buscar lo viejo. */}
            <Link href="/notificaciones" className="camp-vertodas" onClick={() => setAbierta(false)}>
              ver todas →
            </Link>
          </div>
        </>
      )}
    </span>
  );
}
