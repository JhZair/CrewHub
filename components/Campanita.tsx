"use client";
import { marcarNotifsLeidas } from "@/app/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const ICONO: Record<string, string> = {
  asignacion: "👤", comentario: "💬", vencimiento: "⏰",
  cambio_estado: "🔄", mencion: "🔗", reaccion: "👍", bot: "🤖",
};
const ETIQ: Record<string, string> = {
  asignacion: "te asignó", comentario: "comentó", vencimiento: "vence",
  cambio_estado: "cambió el estado", mencion: "te mencionó", reaccion: "reaccionó",
};
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

export default function Campanita({ items, sinLeer }: { items: any[]; sinLeer: number }) {
  const [abierta, setAbierta] = useState(false);
  const router = useRouter();

  const alternar = async () => {
    const abriendo = !abierta;
    setAbierta(abriendo);
    if (abriendo && sinLeer > 0) {
      await marcarNotifsLeidas();
      router.refresh();
    }
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
                  onClick={() => setAbierta(false)}>
                  {contenido(n)}
                </Link>
              ) : (
                <div key={n.id} className={`camp-item ${!n.leida ? "nueva" : ""}`}>
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
