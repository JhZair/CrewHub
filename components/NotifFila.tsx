import { ICONO, ETIQ, hace, tituloDe } from "@/lib/notificaciones";
import { ICO_ENT } from "@/lib/secciones";

/* El interior de una fila de notificación: ícono + título + quién/cuándo +
   chips de vínculo. Lo pintaban IGUAL las dos campanitas (feed y flotante), y
   al nacer la página /notificaciones iba a ser la tercera copia del mismo
   bloque — justo el patrón que cría los bichos de este sistema. Vive aquí.
   Es solo el CONTENIDO; el envoltorio (Link o div, marcar-leída, clases) lo
   pone cada sitio, porque ahí sí difieren. */
/* Nombre corto del actor: solo el primer nombre. La campanita es una lista para
   barrer con el ojo —"Michel Sandro Oros comentó" ocupa toda la fila y empuja la
   hora fuera—, y con el equipo de 6 el primer nombre basta para saber quién. */
const corto = (s?: string) => (s || "").trim().split(/\s+/)[0] || "";

export default function NotifFila({ n }: { n: any }) {
  const quien = [corto(n.actor_nombre), ETIQ[n.tipo]].filter(Boolean).join(" ");
  return (
    <>
      <div className="camp-tt">{ICONO[n.tipo] || "•"} {tituloDe(n.mensaje)}</div>
      <div className="cuando">
        <span>{quien ? `${quien} · ` : ""}{hace(n.creado_en)}</span>
        {(n.vinculos || []).slice(0, 3).map((v: any, i: number) => (
          <span key={i} className="camp-vinc">{ICO_ENT[v.tipo] || "🔗"} {v.nombre}</span>
        ))}
      </div>
    </>
  );
}
