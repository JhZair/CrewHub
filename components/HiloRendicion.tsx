"use client";
import { type ReactNode } from "react";
import { cargarRendicionRapido, comentarRendicion, toggleReaccion } from "@/app/actions";
import { anclaRendicion, type TablaRendicion } from "@/lib/rendicionHilo";
import VistaHilo from "@/components/VistaHilo";
import Reacciones, { type Reaccion } from "@/components/Reacciones";

/* ── HABLAR DE LA PLATA — el mismo hilo de la caja, en las cinco tablas ──
 *
 * Facturas, estados de cuenta, RHE, declaraciones juradas y movimientos del
 * banco. La pregunta que esto existe para capturar es siempre la misma —«¿esto
 * qué fue?», «¿este retiro a qué corresponde?»— y hoy se hace por WhatsApp: la
 * respuesta llega, se lee, y no vuelve nunca a la fila, que es exactamente
 * donde hará falta el día de la observación.
 *
 * Sobre VistaHilo, como la vista del apunte de caja y del objeto: el motor de
 * comentarios, menciones, respuestas y reacciones ya existe y es UNO. Aquí no
 * se construye nada, se enchufa.
 *
 * ── UN COMPONENTE, NO CINCO ──
 * Podían ser cinco archivos gemelos. Son uno, con `tabla` como parámetro,
 * porque lo único que cambia entre las cinco ya está descrito en
 * lib/rendicionHilo.ts y la cabecera la pone quien lo usa —que es quien sabe
 * cómo se lee una factura y cómo se lee un estado de cuenta—.
 */
export default function HiloRendicion({ tabla, filaId, cabecera, children }: {
  tabla: TablaRendicion;
  filaId: string;
  /** Cómo se presenta la fila arriba del hilo. Si falta, se usa el rótulo que
   *  arma lib/rendicionHilo (monto · documento · concepto). */
  cabecera?: (d: any) => ReactNode;
  /** Disparador: recibe `abrir` y devuelve el elemento clicable de la fila. */
  children: (abrir: (e?: any) => void) => ReactNode;
}) {
  return (
    <VistaHilo
      ariaLabel="Fila de la rendición"
      tituloCab="🧾 Rendición"
      cargar={() => cargarRendicionRapido(tabla, filaId)}
      /* `fila` y no `!error`: si la migración no está corrida, la acción
         devuelve el nombre del SQL que falta y VistaHilo lo enseña. Un pop-up
         vacío sin explicación haría pensar que nadie ha comentado. */
      listo={(d) => !!d?.fila}
      selComentarios={(d) => d?.comentarios || []}
      selReaccionesPorComentario={(d) => d?.reaccionesPorComentario || {}}
      selPerfiles={(d) => d?.perfiles || []}
      selUserId={(d) => d?.userId || ""}
      /* Igual que en caja: la conversación es de ida y vuelta —«¿y el
         comprobante?» «lo subo mañana»— y sin responder cada mensaje queda
         suelto en la lista. */
      permitirResponder
      onComentar={(texto, respondeA) => comentarRendicion(tabla, filaId, texto, [], respondeA)}
      onReaccionarComentario={(comentarioId, emoji) =>
        toggleReaccion(null, comentarioId, emoji, null, null, null, { tabla, id: filaId })}
      reaccionesHilo={(d) => d?.reaccionesHilo || []}
      onReaccionarHilo={(emoji) =>
        toggleReaccion(null, null, emoji, null, null, null, { tabla, id: filaId })}
      textoVacio="Nadie ha preguntado nada de esta fila."
      placeholder="¿Qué fue esto?  (@ para mencionar)"
      cabecera={cabecera || ((d) => (
        <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--teal)" }}>{d?.titulo}</span>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>{d?.etiqueta}</span>
        </div>
      ))}
    >
      {children}
    </VistaHilo>
  );
}

/* ── LA ZONA DE ACCIÓN DE UNA FILA ──
 *
 * Las cinco listas necesitan lo mismo: el chip de reacciones y el botón del
 * hilo, en ese orden y sin descolocar la fila. Escribirlo cinco veces sería
 * garantizar que las cinco acaben con anchos distintos.
 *
 * ── POR QUÉ UNA REJILLA Y NO UN FLEX ──
 * Lección de CajaPanel, y no barata: con `flex`, el ancho de esta zona depende
 * de cuántas reacciones haya, así que las filas comentadas empujan y las demás
 * no — la columna de la derecha deja de estar alineada. Con `grid` de anchos
 * fijos, cada celda ocupa lo suyo tenga contenido o no.
 * `minmax(0,…)` y no un ancho a secas: sin el mínimo en cero, un chip largo
 * desborda la celda en vez de encogerse.
 * Y NUNCA `overflow: hidden` aquí — recorta la paleta de emojis, que es
 * absoluta y sale fuera. Eso ya rompió las reacciones una vez.
 */
export function AccionesFila({ tabla, filaId, reacciones, userId, nComentarios, extra }: {
  tabla: TablaRendicion;
  filaId: string;
  reacciones?: Reaccion[];
  userId: string;
  /** Cuántos comentarios tiene. Se pinta siempre que haya: sin el número, una
   *  conversación de cuatro mensajes es invisible desde la lista. */
  nComentarios?: number;
  /** Lo que la lista quiera añadir a la derecha (editar, borrar…). */
  extra?: ReactNode;
}) {
  return (
    <span style={{
      display: "grid", flex: "none", alignItems: "center", justifyItems: "center",
      gridTemplateColumns: `minmax(0,104px) minmax(0,46px)${extra ? " minmax(0,52px)" : ""}`,
      gap: 4,
    }}>
      {/* Reaccionar SIN abrir nada. Un 👀 es «lo vi, está bien», y es lo que
          más se hace al revisar una rendición: si cuesta tres clics no se
          hace, y el acuse de revisión —que es el dato— se pierde. */}
      <Reacciones pubId={null} compacto rendicion={{ tabla, id: filaId }}
        reacciones={reacciones || []} userId={userId} />

      {/* El botón está para TODO el equipo, no solo para finanzas: quien
          pregunta «¿esta factura de qué es?» es justamente quien no lleva las
          finanzas. Escribir en estas tablas sí está restringido; preguntar
          por ellas no. */}
      <HiloRendicion tabla={tabla} filaId={filaId}>
        {(abrir) => (
          <button className="dato-btn" onClick={abrir}
            title={nComentarios ? `${nComentarios} comentario(s)` : "Preguntar sobre esta fila"}
            style={{ color: nComentarios ? "var(--accent)" : undefined,
              opacity: nComentarios ? 1 : .5, whiteSpace: "nowrap" }}>
            💬{nComentarios ? ` ${nComentarios}` : ""}
          </button>
        )}
      </HiloRendicion>

      {extra}
    </span>
  );
}

/* ── EL MODO DEGRADADO SE ANUNCIA ──
 * Sin db/rendicion-interaccion.sql, el 💬 abre un hilo que no puede guardar
 * nada y el 👀 no se registra. Callarlo deja botones que no hacen nada sin
 * decir por qué, y eso no enseña a correr el SQL: enseña a desconfiar de toda
 * la pantalla. Un modo degradado que no se anuncia es una avería disfrazada de
 * funcionamiento normal. */
export function AvisoHilo({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div style={{
      color: "var(--yellow)", fontSize: 11.5, margin: "0 0 8px",
      padding: "5px 9px", borderRadius: 7,
      background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)",
    }}>
      ⚠ {error} Mientras tanto se puede leer todo, pero no comentar ni reaccionar.
    </div>
  );
}

/* El `id` del DOM de una fila, para que el aviso aterrice en ella. Sale del
   mismo sitio que la URL del aviso (lib/rendicionHilo) — si cada uno se
   inventara el suyo, el aviso llegaría a la pantalla correcta y no saltaría a
   ninguna fila, sin error y sin efecto. */
export const idFila = (tabla: TablaRendicion, filaId: string) => anclaRendicion(tabla, filaId);
