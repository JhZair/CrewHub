"use client";
import { type ReactNode } from "react";
import { cargarMovCajaRapido, comentarMovCaja, toggleReaccion } from "@/app/actions";
import { money, ICO_CAJA } from "@/lib/caja";
import VistaHilo from "@/components/VistaHilo";
import VerAdjunto from "@/components/VerAdjunto";

/* ── VISTA DE UN APUNTE DE CAJA — hablar de un gasto sin salir de la caja ──
 *
 * La pregunta que este pop-up existe para capturar es «¿esto qué fue?», y hoy
 * se hace por WhatsApp: la respuesta llega, se lee, y no vuelve nunca al
 * apunte — que es exactamente donde hará falta cuando alguien la busque en
 * tres meses.
 *
 * Sobre VistaHilo, como la vista del objeto y por la misma razón: el motor de
 * comentarios, menciones, respuestas y reacciones ya existe y es uno solo. Aquí
 * solo se pone la cabecera —de qué movimiento estamos hablando— y las dos
 * escrituras propias.
 *
 * `permitirResponder` va en true: en una caja que llevan varias manos, la
 * conversación es de ida y vuelta —«¿y el comprobante?» «lo subo mañana»— y sin
 * responder cada mensaje queda suelto en la lista.
 */
export default function VistaMovCaja({ movId, children }: {
  movId: string;
  /** Disparador: recibe `abrir` y devuelve el elemento clicable de la fila. */
  children: (abrir: (e?: any) => void) => ReactNode;
}) {
  return (
    <VistaHilo
      ariaLabel="Movimiento de caja"
      tituloCab="💰 Movimiento de caja"
      cargar={() => cargarMovCajaRapido(movId)}
      listo={(d) => !!d?.movimiento}
      selComentarios={(d) => d?.comentarios || []}
      selReaccionesPorComentario={(d) => d?.reaccionesPorComentario || {}}
      selPerfiles={(d) => d?.perfiles || []}
      selUserId={(d) => d?.userId || ""}
      permitirResponder
      onComentar={(texto, respondeA) => comentarMovCaja(movId, texto, [], respondeA)}
      onReaccionarComentario={(comentarioId, emoji) =>
        toggleReaccion(null, comentarioId, emoji, null, null, movId)}
      /* Reaccionar al movimiento en sí, no solo a sus comentarios: un 👀 es
         «lo vi, está bien» sin tener que escribirlo, y en una caja que revisa
         otra persona eso es media conversación. */
      reaccionesHilo={(d) => d?.reaccionesHilo || []}
      onReaccionarHilo={(emoji) => toggleReaccion(null, null, emoji, null, null, movId)}
      textoVacio="Nadie ha preguntado nada de este movimiento."
      placeholder="¿Qué fue esto?  (@ para mencionar)"
      cabecera={(d) => {
        const m = d.movimiento;
        const traspaso = !!m.caja_destino;
        const flujo = m.cuenta?.flujo;
        const col = traspaso ? "var(--muted)"
          : flujo === "ingreso" ? "var(--green)"
          : flujo === "egreso" ? "var(--red)" : "var(--yellow)";
        return (
          <>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: col }}>
                {traspaso ? "⇄ " : flujo === "ingreso" ? "+ " : flujo === "egreso" ? "− " : ""}
                {money(Number(m.monto))}
              </span>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                {traspaso ? "traspaso entre cajas" : m.cuenta?.nombre || "sin cuenta"}
              </span>
              <span style={{ flex: 1 }} />
              {m.url && <VerAdjunto url={m.url} titulo="Ver el comprobante" />}
            </div>

            {m.descripcion && (
              <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{m.descripcion}</div>
            )}

            {/* La ficha del movimiento, en una línea. Es el contexto mínimo para
                que la pregunta tenga sentido: sin la fecha y la caja, «¿esto qué
                fue?» se contesta con otra pregunta. */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8,
              color: "var(--dim)", fontSize: 12 }}>
              <span>
                {new Date(m.fecha + "T12:00:00").toLocaleDateString("es-PE",
                  { day: "numeric", month: "long", year: "numeric" })}
              </span>
              {m.caja?.nombre && (
                <span>{ICO_CAJA[m.caja.tipo] || "📦"} {m.caja.nombre}</span>
              )}
              {m.proy?.nombre && <span>🎬 {m.proy.nombre}</span>}
              {m.quien?.nombre && <span>apuntado por {m.quien.nombre}</span>}
            </div>
          </>
        );
      }}
    >
      {children}
    </VistaHilo>
  );
}
