"use client";
import { guardarSuscripcionPush, quitarSuscripcionPush } from "@/app/actions";
import { useEffect, useState } from "react";

/* 🔔 Notificaciones en el celular (Web Push).
   Cada dispositivo se suscribe por separado: el botón se toca en CADA
   celular/PC donde se quieran recibir. En iPhone solo funciona si la app
   está instalada en la pantalla de inicio (Compartir → Añadir a inicio). */

function b64aUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export default function ActivarPush() {
  // "cargando" | "sin_soporte" | "ios_sin_instalar" | "inactivo" | "activo" | "bloqueado"
  const [estado, setEstado] = useState("cargando");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const instalada = window.matchMedia("(display-mode: standalone)").matches;
        setEstado(esIOS && !instalada ? "ios_sin_instalar" : "sin_soporte");
        return;
      }
      if (Notification.permission === "denied") { setEstado("bloqueado"); return; }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setEstado(sub ? "activo" : "inactivo");
      } catch { setEstado("sin_soporte"); }
    })();
  }, []);

  const activar = async () => {
    setOcupado(true); setError("");
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") { setEstado("bloqueado"); setOcupado(false); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!clave) { setError("Falta la clave VAPID en el servidor."); setOcupado(false); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64aUint8(clave),
      });
      const res = await guardarSuscripcionPush(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
      if (res?.error) { setError(res.error); setOcupado(false); return; }
      setEstado("activo");
    } catch {
      setError("No se pudo activar — intenta de nuevo.");
    }
    setOcupado(false);
  };

  const desactivar = async () => {
    setOcupado(true); setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await quitarSuscripcionPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inactivo");
    } catch { setError("No se pudo desactivar."); }
    setOcupado(false);
  };

  if (estado === "cargando") return null;

  if (estado === "ios_sin_instalar") return (
    <div style={{ marginTop: 6, padding: "8px 10px", background: "var(--bg)", borderRadius: 10, fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
      🔔 En iPhone: primero instala la app<br />
      (Compartir → <b>Añadir a pantalla de inicio</b>)<br />
      y actívalas desde la app instalada.
    </div>
  );
  if (estado === "sin_soporte") return null;
  if (estado === "bloqueado") return (
    <div style={{ marginTop: 6, padding: "8px 10px", background: "var(--bg)", borderRadius: 10, fontSize: 11, color: "var(--yellow)", lineHeight: 1.5 }}>
      🔕 Notificaciones bloqueadas en este navegador — habilítalas en la
      configuración del sitio y recarga.
    </div>
  );

  return (
    <>
      {error && <div className="err-inline" style={{ marginTop: 6 }}>⚠ {error}</div>}
      {estado === "activo" ? (
        <button className="btn btn-ghost" disabled={ocupado} onClick={desactivar}
          style={{ marginTop: 6, fontSize: 12.5, textAlign: "center", color: "var(--green)" }}>
          🔔 Notificaciones activas {ocupado ? "…" : "· desactivar"}
        </button>
      ) : (
        <button className="btn btn-ghost" disabled={ocupado} onClick={activar}
          style={{ marginTop: 6, fontSize: 12.5, textAlign: "center" }}>
          {ocupado ? "🔔 Activando…" : "🔔 Activar notificaciones aquí"}
        </button>
      )}
    </>
  );
}
