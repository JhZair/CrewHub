"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { misNotificaciones, marcarNotifsLeidas } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";

/* Campanita flotante global: aparece en las páginas internas (no en el feed,
   que ya tiene la suya, ni dentro de los paneles del Monitor). Trae las
   notificaciones bajo demanda y se actualiza en tiempo real. */

const ICONO: Record<string, string> = {
  asignacion: "👤", comentario: "💬", vencimiento: "⏰",
  cambio_estado: "🔄", mencion: "🔗", reaccion: "👍", bot: "🤖",
};
const ETIQ: Record<string, string> = {
  asignacion: "te asignaron", comentario: "comentó", vencimiento: "vence",
  cambio_estado: "cambió estado", mencion: "te mencionó", reaccion: "reaccionó",
};
const ENT_ICO: Record<string, string> = {
  proyecto: "📁", empresa: "🏢", persona: "👤", convocatoria: "📜",
  postulacion: "🎯", equipamiento: "🎥", lugar: "📍", etiqueta: "🏷️",
};
const tituloDe = (m: string) => { const x = (m || "").match(/«([^»]+)»/); return x ? x[1] : (m || ""); };
const hace = (d: string) => {
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
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

  const abrir = async () => {
    const abriendo = !abierta;
    setAbierta(abriendo);
    if (abriendo && sinLeer > 0) {
      await marcarNotifsLeidas();
      setSinLeer(0);
      setItems(prev => prev.map(n => ({ ...n, leida: true })));
    }
  };

  const fila = (n: any) => (
    <>
      <div className="camp-tt">{ICONO[n.tipo] || "•"} {tituloDe(n.mensaje)}</div>
      <div className="cuando">
        <span>{ETIQ[n.tipo] ? `${ETIQ[n.tipo]} · ` : ""}{hace(n.creado_en)}</span>
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
            <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)", padding: "4px 11px 8px" }}>
              🔔 Notificaciones
            </div>
            {items.length === 0 && (
              <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", padding: "16px 0" }}>
                Nada nuevo — Qhaway vigila por ti. 🤖
              </div>
            )}
            {items.map((n: any) => (
              n.publicacion_id ? (
                <Link key={n.id} href={`/caso/${n.publicacion_id}`}
                  className={`camp-item ${!n.leida ? "nueva" : ""}`}
                  onClick={() => setAbierta(false)}>{fila(n)}</Link>
              ) : (
                <div key={n.id} className={`camp-item ${!n.leida ? "nueva" : ""}`}>{fila(n)}</div>
              )
            ))}
          </div>
        </>
      )}
    </div>
  );
}
