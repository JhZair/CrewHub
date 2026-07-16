"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { misNotificaciones, marcarNotifsLeidas, marcarNotifLeida } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";

/* Campanita flotante global: aparece en las páginas internas (no en el feed,
   que ya tiene la suya, ni dentro de los paneles del Monitor). Trae las
   notificaciones bajo demanda y se actualiza en tiempo real. */

import { ICONO, ETIQ, anclaDe, hace, tituloDe } from "@/lib/notificaciones";
const ENT_ICO: Record<string, string> = {
  proyecto: "📁", empresa: "🏢", persona: "👤", convocatoria: "📜",
  postulacion: "🎯", equipamiento: "🎥", lugar: "📍", etiqueta: "🏷️",
};

export default function CampanitaGlobal() {
  const pathname = usePathname() || "";
  const oculto = pathname.startsWith("/login") || pathname === "/"; // el feed ya tiene campanita
  const [esTop, setEsTop] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [sinLeer, setSinLeer] = useState(0);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => { setEsTop(window.self === window.top); }, []);

  useEffect(() => {
    if (oculto || !esTop) return;
    const cargar = async () => {
      const r: any = await misNotificaciones();
      setItems(r.items || []); setSinLeer(r.sinLeer || 0);
    };
    cargar();
    const supabase = createClient();
    let canal: any;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      canal = supabase.channel("campanita-global");
      canal.on("postgres_changes",
        { event: "*", schema: "public", table: "notificaciones" }, () => cargar());
      canal.subscribe();
    })();
    return () => { if (canal) supabase.removeChannel(canal); };
  }, [oculto, esTop, pathname]);

  if (oculto || !esTop) return null;

  // Abrir NO marca nada: solo muestra. El número persiste hasta atender.
  const abrir = () => setAbierta(a => !a);

  // Atender una sola: se marca leída y el contador baja de a uno.
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

  const fila = (n: any) => (
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
    <div className="camp-flot">
      <button className="camp-flot-btn" onClick={abrir} title="Notificaciones">
        🔔{sinLeer > 0 && <span className="camp-badge">{sinLeer > 9 ? "9+" : sinLeer}</span>}
      </button>
      {abierta && (
        <>
          <div className="cbx-fondo" onClick={() => setAbierta(false)} />
          <div className="camp-menu camp-menu-flot">
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
                  onClick={() => { marcarUna(n); setAbierta(false); }}>{fila(n)}</Link>
              ) : (
                <div key={n.id} className={`camp-item ${!n.leida ? "nueva" : ""}`}
                  onClick={() => marcarUna(n)} style={{ cursor: n.leida ? "default" : "pointer" }}>{fila(n)}</div>
              )
            ))}
          </div>
        </>
      )}
    </div>
  );
}
