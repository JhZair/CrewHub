"use client";
import Link from "next/link";
import { useState } from "react";
import { notificacionesTodas, marcarNotifLeida, marcarNotifsLeidas } from "@/app/actions";
import { anclaDe } from "@/lib/notificaciones";
import NotifFila from "./NotifFila";

/* EL HISTORIAL COMPLETO — misma fila que la campanita (NotifFila), pero sin
   corte a 12: "ver más" baja de tanda en tanda pidiendo a notificacionesTodas.
   Marca leída igual que la campanita (una al abrir, o todas de golpe); el
   número real sin leer lo lleva la campanita, aquí no hay badge que cuadrar. */
export default function NotificacionesLista({
  inicial, hayMas: hayMasIni, total,
}: { inicial: any[]; hayMas: boolean; total: number }) {
  const [items, setItems] = useState<any[]>(inicial);
  const [hayMas, setHayMas] = useState(hayMasIni);
  const [cargando, setCargando] = useState(false);

  const verMas = async () => {
    if (cargando) return;
    setCargando(true);
    const r: any = await notificacionesTodas(items.length);
    /* Por id, no por concatenar a ciegas: si entre tandas llegó una notif
       nueva, el offset se corre y la primera de la tanda podría repetir. El
       Map deja fuera al repetido en vez de pintarlo dos veces. */
    setItems(prev => {
      const vistos = new Set(prev.map(n => n.id));
      return [...prev, ...(r.items || []).filter((n: any) => !vistos.has(n.id))];
    });
    setHayMas(r.hayMas);
    setCargando(false);
  };

  const marcarUna = async (n: any) => {
    if (n.leida) return;
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x));
    await marcarNotifLeida(n.id);
  };

  const marcarTodas = async () => {
    setItems(prev => prev.map(n => ({ ...n, leida: true })));
    await marcarNotifsLeidas();
  };

  const quedanSinLeer = items.some(n => !n.leida);

  return (
    <div className="notif-pag">
      <div className="notif-cab">
        <span>{total} notificacion{total === 1 ? "" : "es"}</span>
        {quedanSinLeer && (
          <button className="camp-marcar" onClick={marcarTodas}>✓ marcar todas como leídas</button>
        )}
      </div>

      {items.length === 0 && (
        <div className="notif-vacia">Nada aún — Bot Qhaway vigila por ti. 🤖</div>
      )}

      {items.map((n: any) => (
        n.publicacion_id ? (
          <Link key={n.id} href={`/caso/${n.publicacion_id}${anclaDe(n.tipo)}`}
            className={`camp-item ${n.leida ? "leida" : "nueva"}`}
            onClick={() => marcarUna(n)}>
            <NotifFila n={n} />
          </Link>
        ) : (
          <div key={n.id} className={`camp-item ${n.leida ? "leida" : "nueva"}`}
            onClick={() => marcarUna(n)} style={{ cursor: n.leida ? "default" : "pointer" }}>
            <NotifFila n={n} />
          </div>
        )
      ))}

      {hayMas ? (
        <button className="notif-mas" onClick={verMas} disabled={cargando}>
          {cargando ? "cargando…" : "ver más"}
        </button>
      ) : items.length > 0 && (
        <div className="notif-fin">— fin del historial —</div>
      )}
    </div>
  );
}
