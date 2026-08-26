"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/Enlace";
import { pedirZocalo } from "@/lib/zocalo";
import { estadoAlarma, pieAlarma, type Alarma } from "@/lib/alarmas";

/* ══════════════════════════════════════════════════════════════════════════
   LA FRANJA — una alarma encendida se ve en todas las pantallas

   No es un aviso más: es el único rojo del sistema que declaró una persona.
   Por eso va arriba del todo y en cualquier pantalla — si hay que enterarse sí
   o sí, tiene que estar donde la gente ya mira, no donde habría que ir.

   ── VIAJA EN EL ZÓCALO, NO EN UNA LLAMADA PROPIA ──
   `pedirZocalo` es la petición que ya se hace en cada navegación, compartida
   con el menú, el banco y la campanita. Una acción de servidor más por
   navegación, en las diecinueve pantallas, es exactamente lo que aquel trabajo
   vino a quitar (ver lib/zocalo.ts).

   ── NO SE PUEDE CERRAR ──
   Una franja con ✕ es una franja que se cierra el primer día y ya no vuelve a
   verse. Lo que sí se puede es APAGAR la alarma, que es distinto: apagarla
   exige contar cómo se resolvió y lo hace administración. La molestia es el
   mecanismo, no un efecto secundario.
   ══════════════════════════════════════════════════════════════════════════ */
export default function FranjaAlarmas() {
  const pathname = usePathname() || "";
  const [alarmas, setAlarmas] = useState<Alarma[]>([]);

  useEffect(() => {
    let vivo = true;
    pedirZocalo(pathname)
      .then(z => { if (vivo) setAlarmas(((z as any).alarmas || []) as Alarma[]); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pathname]);

  if (!alarmas.length) return null;

  return (
    <div className="alarma-franja">
      {alarmas.map(a => {
        const e = estadoAlarma(a);
        return (
          /* Lleva a SU CASO y no a la ficha de la entidad: el caso es donde se
             trabaja y donde está la conversación. Mandar a la ficha sería
             enseñar el problema otra vez en vez de llevar a hacer algo. */
          <Link key={a.id} href={a.caso_id ? `/caso/${a.caso_id}` : "/"}
            className="alarma-item" title={`${a.motivo}\n\n${pieAlarma(a)}`}>
            <b>🚨 {a.titulo}</b>
            {/* La alarma se delata sola cuando pasa su fecha de revisión: deja
                de hablar del problema y empieza a hablar de sí misma. Es lo
                que impide que se quede encendida para siempre. */}
            {e.aviso && <span className="alarma-vieja">· {e.aviso}</span>}
            <span className="alarma-ir">ver el caso →</span>
          </Link>
        );
      })}
    </div>
  );
}
