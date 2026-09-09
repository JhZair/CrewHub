import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PanelSitios from "@/components/PanelSitios";
import { equiposFlacos, kitsCrudos, sitiosTodos, TOPE_EQUIPOS, TOPE_SITIOS } from "@/lib/equipamientoDatos";

export const metadata: Metadata = { title: "📍 Sitios" };

/* ══════════════════════════════════════════════════════════════════════════
   📍 SITIOS — LA QUINTA PESTAÑA

   Las otras cuatro contestan preguntas sobre una COSA: dónde está, con qué
   sale, de qué está hecha, con qué entró. Esta contesta una sobre un SITIO:
   «¿qué hay en el Cajón 07?». Es la que se hace con el cajón abierto delante,
   y es la única que el modelo de db/sitios.sql hace posible — con el sitio
   escrito a mano dentro de una nota no se podía preguntar.

   Las tres consultas son las que ya usan las otras pestañas y están cacheadas,
   así que entrar aquí desde otra no vuelve a pedirlas.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function Sitios() {
  /* ⚠ Su propio `getUser()`: `middleware.ts` deja pasar si la verificación
     tarda más de 3,5 s, así que toda página protegida cierra su puerta. */
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [eqs, sitios, kitsRaw] = await Promise.all([
    equiposFlacos(), sitiosTodos(), kitsCrudos(),
  ]);
  const equipos = ((eqs as any)?.data || []) as any[];
  const listaSitios = ((sitios as any)?.data || []) as any[];
  const eLeer = (eqs as any)?.error?.message || (sitios as any)?.error?.message || null;

  return (
    <>
      {/* ⚠ El error se DICE. Sin la migración corrida, esta pantalla saldría
          «No hay sitios todavía» sobre una base que ya los tiene, o sobre una
          que no tiene la tabla — dos cosas muy distintas y la misma frase. */}
      {eLeer && (
        <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
          <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ No se pudo leer</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            {/(does not exist|schema cache|PGRST20)/i.test(eLeer)
              ? <>Falta correr <code>db/sitios.sql</code> en Supabase.</>
              : <code style={{ fontSize: 11 }}>{eLeer}</code>}
          </div>
        </div>
      )}

      <PanelSitios
        sitios={listaSitios}
        equipos={equipos}
        kits={((kitsRaw as any)?.kits?.data || []).map((k: any) => ({
          id: k.id, nombre: k.nombre,
          guardado_sitio: k.guardado_sitio, guardado_en_equipo: k.guardado_en_equipo,
        }))}
        /* Las dos sondas juntas: cualquiera de las dos listas cortada deja las
           cuentas cortas y hace que algo parezca «apunta a lo que no está». */
        cortado={equipos.length > TOPE_EQUIPOS || listaSitios.length > TOPE_SITIOS}
      />
    </>
  );
}
