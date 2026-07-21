"use client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/* Escucha cambios en las tablas indicadas y refresca la vista.
   El token viene del servidor (que sí tiene la sesión) para que
   el canal se autentique y las políticas RLS entreguen eventos. */
export default function Realtime({ tablas, token, cadaSegundos }: {
  tablas: string[]; token?: string;
  cadaSegundos?: number;  // refresco de respaldo (TV): por si el canal se cae o la tabla no publica eventos
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cadaSegundos) return;
    const int = setInterval(() => router.refresh(), cadaSegundos * 1000);
    return () => clearInterval(int);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadaSegundos]);

  useEffect(() => {
    const supabase = createClient();
    if (token) supabase.realtime.setAuth(token);
    // Nombre único por montaje: `createClient` es singleton; un nombre fijo puede
    // reutilizar un canal ya suscrito (p. ej. doble montaje en dev) y `.on()`
    // reventaría con "cannot add postgres_changes callbacks after subscribe()".
    const canal = supabase.channel(`crewhub-vivo-${Math.random().toString(36).slice(2)}`);
    tablas.forEach(t =>
      canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: t },
        () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 400);
        }
      )
    );
    canal.subscribe(status => {
      console.log("[CrewHub tiempo real]", status);
    });
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return null;
}
