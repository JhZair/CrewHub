import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PanelCombos from "@/components/PanelCombos";
import PanelKits from "@/components/PanelKits";
import { inventarioDePaneles } from "@/lib/equipamientoDatos";

export const metadata: Metadata = { title: "🧰 Combos y kits" };

/* ══════════════════════════════════════════════════════════════════════════
   🧰 COMBOS Y KITS — LO QUE ENTRÓ JUNTO Y LO QUE SALE JUNTO

   ── LOS DOS EN LA MISMA PESTAÑA, A PROPÓSITO ──
   `PanelCombos` lo lleva escrito desde el primer día: «el kit dice qué sale
   junto, el combo dice qué entró junto. Tenerlos en la misma pantalla es lo
   que hace visible que NO son lo mismo — las cinco radios entraron en un combo
   y pueden salir en cinco kits distintos».

   Al partir 🎥 equipos se planteó darle una pestaña a cada uno. Habría sido
   más limpio de cargar y habría borrado esa comparación, que es justo lo que
   enseña la diferencia entre las dos cosas. Un reparto que gana medio segundo
   y desordena un concepto no vale medio segundo.

   ── QUÉ SE GANA IGUALMENTE ──
   Los dos paneles son de cliente y los dos reciben el inventario. Antes lo
   recibían en CADA visita a 🎥 equipos, plegados y sin que nadie los abriera.
   Ahora solo lo paga quien entra aquí — y en versión flaca: doce campos por
   equipo, no las veintitantas columnas de la tabla.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function CombosYKits() {
  /* ⚠ Su propio `getUser()`, aunque el layout ya lo haga y el middleware
     redirija antes. `middleware.ts` lo declara como invariante: él redirige,
     pero NO es el que cierra la puerta —deja pasar si la verificación tarda
     más de 3,5 s—, así que toda página protegida la cierra por su cuenta.
     Estas dos nacieron sin ella al partir la pantalla y eran las únicas del
     sistema sin la línea. */
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { equipos, combos, kits, eKits, eEquipos, cortado, sitios } = await inventarioDePaneles();

  /* Las categorías que hay de verdad, para el selector de un combo. Salen del
     inventario y no de una lista escrita a mano: una categoría que nadie usa
     en el desplegable es una invitación a clasificar mal. */
  const categorias = [...new Set(
    (equipos || []).map((e: any) => (e.categoria || "").trim()).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <>
      {/* El inventario alimenta a los DOS paneles: sin él, los combos no saben
          qué trajeron y los kits creen que les faltan todas las piezas. */}
      {eEquipos && (
        <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
          <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ No se pudo leer el inventario</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            Los combos saldrán sin unidades y los kits con todas sus piezas en falta.
            Ninguna de las dos cosas es cierta.
            <br /><code style={{ fontSize: 11, opacity: .85 }}>{eEquipos}</code>
          </div>
        </div>
      )}

      {/* Los combos primero: es el orden del ciclo de vida —una cosa ENTRA por
          una compra y solo después se agrupa en un kit para salir—. */}
      <PanelCombos combos={combos} categorias={categorias}
        inventario={(equipos || []).map((e: any) => ({
          id: e.id, folio: e.folio, nombre: e.nombre, categoria: e.categoria,
          estado: e.estado, compra_id: e.compra_id,
          compra: e.compra_id ? (combos.find((c: any) => c.id === e.compra_id)?.nombre || null) : null,
          /* ── DOS CAMPOS MÁS, Y NINGUNA CONSULTA MÁS ──
             Los dos venían YA en cada fila de `inventarioParaPaneles`; lo que
             pasaba es que este `map` los dejaba fuera. Ahora el editor del
             combo enseña lo que enseñaba la vista al vuelo que se ha quitado:
             cuánto costó cada pieza —para contrastarlo contra el total de la
             boleta— y en manos de quién está.
             Si se recortan otra vez «porque no se usan», lo que se rompe no es
             el editor: es la comprobación de que la suma de las piezas cuadra
             con lo que dice el papel. Y esa no avisa al fallar. */
          valor_compra: e.valor_compra ?? null,
          quien: e.quien ?? null,
          /* Su foto. Ya venía en la fila —la usa la cara del combo, que es la
             de su primera unidad con foto— y aun así cada equipo se listaba
             sin ella. No cuesta ni una consulta más: `cartelesEquipo()` se
             pide una sola vez para toda la pantalla. */
          cartel: e.cartel ?? null,
        }))} />

      {/* Si la consulta de kits falla, se DICE. Sin esto el panel sale vacío y
          se lee como «no hay kits armados», que es lo contrario de la verdad —
          y encima invita a armarlos otra vez. */}
      {eKits && (
        <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
          <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ No se pudieron leer los kits</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            {/* ⚠ El patrón NO puede llevar «kits» a secas: casaría con casi
                cualquier mensaje de PostgREST sobre esa tabla —un timeout, una
                relación que no encuentra— y entonces la rama de la derecha, la
                que enseña el error de verdad, no se pinta nunca. Solo lo que
                de verdad significa «la migración no está corrida». */}
            {/(does not exist|schema cache|PGRST20)/i.test(eKits)
              ? <>Falta correr <code>db/kits.sql</code> en Supabase.</>
              : eKits}
          </div>
        </div>
      )}

      {/* `cortado` NO es decoración: si el inventario llegó al tope, el chip 🔧
          de una pieza cuyo anfitrión se quedó fuera diría «no encuentro dónde»
          y eso se lee como puntero roto. Con esto dice la verdad —falta media
          lista—. Va desde aquí porque es la página la que sabe si se cortó. */}
      <PanelKits kits={kits} equipos={equipos} cortado={cortado} sitios={sitios} />
    </>
  );
}
