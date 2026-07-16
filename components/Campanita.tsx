"use client";
import { marcarNotifsLeidas, marcarNotifLeida } from "@/app/actions";
import Link from "next/link";
import { useState, useEffect } from "react";

import { ICONO, ETIQ, anclaDe } from "@/lib/notificaciones";
const ENT_ICO: Record<string, string> = {
  proyecto: "📁", empresa: "🏢", persona: "👤", convocatoria: "📜",
  postulacion: "🎯", equipamiento: "🎥", lugar: "📍", etiqueta: "🏷️",
};

// Título del caso: el texto entre « » (o el mensaje completo si no hay)
const tituloDe = (mensaje: string) => {
  const m = (mensaje || "").match(/«([^»]+)»/);
  return m ? m[1] : (mensaje || "");
};

const hace = (d: string) => {
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

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

  const contenido = (n: any) => (
    <>
      <div className="camp-tt">{ICONO[n.tipo] || "•"} {tituloDe(n.mensaje)}</div>
      <div className="cuando">
        <span>{(() => { const a = [n.actor_nombre, ETIQ[n.tipo]].filter(Boolean).join(" "); return a ? `${a} · ` : ""; })()}{hace(n.creado_en)}</span>
        {(n.vinculos || []).slice(0, 3).map((v: any, i: number) => (
          <span key={i} className="camp-vinc">{ENT_ICO[v.tipo] || "🔗"} {v.nombre}</span>
        ))}
      </div>
    </>
  );

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
                  className={`camp-item ${!n.leida ? "nueva" : ""}`}
                  onClick={() => { marcarUna(n); setAbierta(false); }}>
                  {contenido(n)}
                </Link>
              ) : (
                <div key={n.id} className={`camp-item ${!n.leida ? "nueva" : ""}`}
                  onClick={() => marcarUna(n)} style={{ cursor: n.leida ? "default" : "pointer" }}>
                  {contenido(n)}
                </div>
              )
            ))}
          </div>
        </>
      )}
    </span>
  );
}
