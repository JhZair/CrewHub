"use client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/* Escucha cambios en las tablas indicadas y refresca la vista.
   Con esto, cuando Katy publica desde su celular, el feed de John
   se actualiza solo — sin recargar. */
export default function Realtime({ tablas }: { tablas: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase.channel("crewhub-vivo");
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
    canal.subscribe();
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
