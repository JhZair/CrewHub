import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PanelSitios from "@/components/PanelSitios";
import { inventarioDePaneles, sitiosTodos } from "@/lib/equipamientoDatos";
import { faltaCorrer } from "@/lib/sitios";

export const metadata: Metadata = { title: "📍 Sitios" };

/* ══════════════════════════════════════════════════════════════════════════
   📍 SITIOS — LA QUINTA PESTAÑA

   Las otras cuatro contestan preguntas sobre una COSA: dónde está, con qué
   sale, de qué está hecha, con qué entró. Esta contesta una sobre un SITIO:
   «¿qué hay en el Cajón 07?». Es la que se hace con el cajón abierto delante,
   y es la única que el modelo de db/sitios.sql hace posible — con el sitio
   escrito a mano dentro de una nota no se podía preguntar.

   ── EL INVENTARIO ENTERO Y NO LAS FILAS FLACAS ──
   ⚠ Esto pedía `equiposFlacos()`, que trae folio y nombre. Con eso, abrir el
   Cajón 08 enseñaba dos renglones de texto: ni la foto —que es como se
   reconoce un equipo, no por el folio—, ni que la cámara lleva cuatro piezas
   montadas dentro, ni que sale en dos kits. Justo lo que se quiere saber con
   el cajón abierto delante y algo en la mano.

   `inventarioDePaneles()` es lo que ya usan la entrega y los combos, y sus
   siete consultas están `cache()`adas: entrando desde cualquiera de esas
   pestañas no se pide ni una otra vez. Entrando directo aquí son cuatro
   viajes más que antes —carteles, combos, quién tiene qué y fotos— y los
   pagan las cuatro cosas que se ven.
   ══════════════════════════════════════════════════════════════════════════ */

/* `searchParams.q` para que el chip 📍 del inventario pueda abrir esta pestaña
   ya buscando un código. Es la vuelta entera del recorrido: desde una cosa, ver
   su cajón; y desde el cajón, todo lo demás que hay dentro — que es la pregunta
   siguiente casi siempre. El buscador ya casaba por código; lo que faltaba era
   poder llegar aquí con él escrito. */
export default async function Sitios({ searchParams }: {
  searchParams?: { q?: string };
}) {
  /* ⚠ Su propio `getUser()`: `middleware.ts` deja pasar si la verificación
     tarda más de 3,5 s, así que toda página protegida cierra su puerta. */
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* `sitiosTodos()` otra vez y no es un viaje de más: `inventarioDePaneles` ya
     la llamó y está `cache()`ada, así que esto devuelve la MISMA respuesta.
     Se pide por el `error`, que el inventario no devuelve — y sin él, una
     migración sin correr saldría como «no hay sitios todavía». */
  const [inv, sitiosQ] = await Promise.all([inventarioDePaneles(), sitiosTodos()]);
  const eLeer = inv.eEquipos || (sitiosQ as any)?.error?.message || null;

  return (
    <>
      {/* ⚠ El error se DICE. Sin la migración corrida, esta pantalla saldría
          «No hay sitios todavía» sobre una base que ya los tiene, o sobre una
          que no tiene la tabla — dos cosas muy distintas y la misma frase. */}
      {eLeer && (
        <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
          <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ No se pudo leer</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            {faltaCorrer(eLeer)
              ? <>Falta correr <code>{faltaCorrer(eLeer)}</code> en Supabase.</>
              : <code style={{ fontSize: 11 }}>{eLeer}</code>}
          </div>
        </div>
      )}

      <PanelSitios
        sitios={inv.sitios}
        equipos={inv.equipos}
        /* Los kits, con su cara y su lista de piezas: la portada del kit es la
           foto de una de sus piezas, así que sin `equipoIds` el panel no puede
           dibujarla y sin `portadaId` dibujaría otra distinta de la que se
           eligió en «Combos y kits». */
        kits={inv.kits.map(k => ({
          id: k.id, nombre: k.nombre,
          portadaId: k.portadaId, equipoIds: k.equipoIds,
          guardado_sitio: k.guardadoSitio, guardado_en_equipo: k.guardadoEnEquipo,
        }))}
        qInicial={searchParams?.q || ""}
        /* Las dos sondas juntas: cualquiera de las dos listas cortada deja las
           cuentas cortas y hace que algo parezca «apunta a lo que no está». */
        cortado={inv.cortado || inv.sitiosCortados}
      />
    </>
  );
}
