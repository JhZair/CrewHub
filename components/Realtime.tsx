"use client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/* ── LO QUE PASA EN LA BASE, EN LA PANTALLA ──
 *
 * Escucha cambios en las tablas indicadas y refresca la vista. El token viene
 * del servidor (que sí tiene la sesión) para que el canal se autentique y las
 * políticas RLS entreguen eventos.
 *
 * ══ POR QUÉ ESTE ARCHIVO SE REESCRIBIÓ ══
 *
 * Estaba costando el doble de lo que parecía. Al pulsar una reacción pasaba
 * esto:
 *   1. la acción escribe en la base,
 *   2. el componente hace `router.refresh()` — la página entera se vuelve a
 *      renderizar en el servidor, con sus diecinueve consultas,
 *   3. y 400 ms después llegaba por el canal MI PROPIO cambio, que disparaba
 *      OTRO `router.refresh()`: las diecinueve consultas otra vez.
 *
 * Dos renders completos por clic. El segundo no aportaba nada —el primero ya
 * traía el dato— y era la mitad del «hay que esperar segundos».
 *
 * ══ DOS FILTROS, Y NINGUNO ADIVINA ══
 *
 * · `miId` — los eventos que provoco yo se ignoran. No porque no importen,
 *   sino porque YA los vi: quien hizo el cambio refresca por su cuenta al
 *   terminar la acción. Se compara contra la columna de autor de cada tabla;
 *   si una tabla no tiene ninguna conocida, el evento pasa. Ante la duda se
 *   refresca: quedarse viejo en silencio es peor que refrescar de más.
 *
 * · `filtro` por tabla — «solo los comentarios DE ESTE caso». Sin él, un
 *   comentario de Katy en otro caso recargaba tu pantalla entera, y con varias
 *   personas trabajando eso se realimenta. Se usa solo donde la correspondencia
 *   es exacta; donde no lo es, la tabla se escucha entera a propósito, porque
 *   perder un cambio de verdad es más caro que un refresco de más.
 */

/** Una tabla a escuchar. Con `filtro` en la forma de PostgREST: `col=eq.valor`. */
export type TablaViva = string | { tabla: string; filtro?: string };

/* Cómo se llama «quién lo hizo» en cada tabla. No hay una convención única en
   el esquema y no se va a inventar: lo que no está aquí no se filtra. */
const COL_AUTOR: Record<string, string> = {
  reacciones: "usuario_id",
  comentarios: "autor_id",
  actividad: "actor_id",
  publicaciones: "autor_id",
  dafo_comunicaciones: "leido_por",
};

export default function Realtime({ tablas, token, cadaSegundos, miId }: {
  tablas: TablaViva[]; token?: string;
  cadaSegundos?: number;  // refresco de respaldo (TV): por si el canal se cae o la tabla no publica eventos
  /** Quién está mirando. Sin esto, tus propios cambios te recargan la página
   *  una segunda vez — ver la cabecera. */
  miId?: string | null;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cadaSegundos) return;
    const int = setInterval(() => router.refresh(), cadaSegundos * 1000);
    return () => clearInterval(int);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadaSegundos]);

  /* `tablas` llega como literal en cada render y cambiaría de identidad
     siempre; se compara por contenido para no re-suscribir el canal en cada
     pintada — que era otra fuente de trabajo invisible. */
  const clave = JSON.stringify(tablas);

  useEffect(() => {
    const supabase = createClient();
    if (token) supabase.realtime.setAuth(token);
    // Nombre único por montaje: `createClient` es singleton; un nombre fijo puede
    // reutilizar un canal ya suscrito (p. ej. doble montaje en dev) y `.on()`
    // reventaría con "cannot add postgres_changes callbacks after subscribe()".
    const canal = supabase.channel(`crewhub-vivo-${Math.random().toString(36).slice(2)}`);

    (JSON.parse(clave) as TablaViva[]).forEach(t => {
      const tabla = typeof t === "string" ? t : t.tabla;
      const filtro = typeof t === "string" ? undefined : t.filtro;
      canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tabla, ...(filtro ? { filter: filtro } : {}) },
        (payload: any) => {
          if (esMio(tabla, payload, miId)) return;
          if (timer.current) clearTimeout(timer.current);
          /* 600 ms y no 400: agrupa la ráfaga de una importación o de un bot
             escribiendo varias filas seguidas en un solo refresco. */
          timer.current = setTimeout(() => router.refresh(), 600);
        }
      );
    });

    canal.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, clave, miId]);

  return null;
}

function esMio(tabla: string, payload: any, miId?: string | null): boolean {
  if (!miId) return false;
  const col = COL_AUTOR[tabla];
  if (!col) return false;
  /* En un DELETE viaja `old`; en INSERT y UPDATE, `new`. Si la fila no trae la
     columna —replica identity reducida— sale `undefined` y el evento pasa. */
  const fila = payload?.new && Object.keys(payload.new).length ? payload.new : payload?.old;
  return fila?.[col] === miId;
}
