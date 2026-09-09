import type { Metadata } from "next";
import { ALTA_SUELTA } from "@/lib/entidades";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "@/components/Enlace";
import Volver from "@/components/Volver";
import Pestanas from "@/components/Pestanas";
import { enManosAhora } from "@/lib/equipamientoDatos";

/* ══════════════════════════════════════════════════════════════════════════
   🎥 EQUIPOS — LA CABECERA Y LAS TRES PESTAÑAS

   ── POR QUÉ SE PARTIÓ ──
   Era UNA pantalla con cuatro bloques dentro: el inventario con sus filtros y
   sus quinientas fichas, la entrega en lote, quién tiene qué, y los combos y
   los kits. Se sentía cargada porque lo estaba — y no solo de scroll: los tres
   paneles son de cliente y recibían el inventario COMPLETO como prop, así que
   la tabla de equipos cruzaba al navegador tres veces por visita para llenar
   dos paneles que nacen plegados.

   Es el mismo reparto que ya se hizo con la ficha del fondo, y por lo mismo.

   ── LOS COMBOS Y LOS KITS VAN JUNTOS, A PROPÓSITO ──
   `PanelCombos` lo tiene escrito desde el primer día: «el kit dice qué SALE
   junto, el combo dice qué ENTRÓ junto; tenerlos en la misma pantalla es lo
   que hace visible que NO son lo mismo — las cinco radios entraron en un combo
   y pueden salir en cinco kits distintos». Separarlos habría sido más limpio
   de cargar y habría borrado esa comparación, que es la que enseña la
   diferencia. Son dos bloques en UNA pestaña.

   ── LO QUE ESTE LAYOUT PIDE, LAS TRES PESTAÑAS LO NECESITAN ──
   Una sola consulta: lo que está en manos de alguien ahora. Va en la etiqueta
   de «Entrega», y las tres pestañas la usan igualmente —el inventario para su
   cifra de arriba, la entrega para la lista, los kits para saber a quién
   llamar—, así que ninguna paga un viaje por decorar la barra. Y va cacheada
   por render, o sea que la pestaña recibe la misma promesa que pidió el layout.
   ⚠ En navegación SUAVE entre pestañas hermanas, Next no vuelve a renderizar
   el layout: ahí no hay nada que deduplicar y cada una hace su viaje. Está
   contado en lib/fondoDatos.ts, que topó con lo mismo.

   ── LO QUE SE PIERDE AL PARTIR ──
   El estado de cada pestaña. Antes todo estaba en la misma página, así que
   volver de mirar los kits te devolvía con el filtro del inventario puesto y
   el scroll donde estaba. Ahora cada pestaña se monta de nuevo. Los filtros
   del inventario ya viven en la URL —así se pueden compartir—, y por eso ésa
   es la que menos lo nota.
   ══════════════════════════════════════════════════════════════════════════ */

export const metadata: Metadata = {
  /* `template` y no `title` a secas: en App Router el título de la página pisa
     el del layout, y sin esto las tres pestañas abiertas se llamarían igual.
     Es el mismo arreglo que la ficha del fondo. */
  title: { default: "🎥 Equipos", template: "%s · 🎥 Equipos" },
};

export default async function EquipamientoLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const manos = await enManosAhora();
  /* ⚠ `null` cuando la consulta falla, no cero. Un «0» en la etiqueta se lee
     como «no hay nada fuera», que sobre un inventario que está en la calle es
     la mentira que más caro sale. `Pestanas` no pinta el número si no lo es. */
  /* ⚠ SIN las asignaciones, igual que la lista que hay dentro de la pestaña.
     Una asignación —la laptop es de Michel— no vuelve, y `EnUsoAhora` la
     excluye a propósito. Contarlas aquí ponía un «26» al lado de «Entrega»
     sobre una lista de doce: el rótulo viejo («en manos de alguien ahora») lo
     explicaba, una cifra pelada en una pestaña no explica nada. */
  const nManos = (manos as any)?.error
    ? null
    : (manos.data || []).filter((p: any) => p.tipo !== "asignacion").length;

  /* ⚠ Las asignaciones NO son «las custodias abiertas de tipo asignación».
     Una que está apartada por un rodaje tiene `hasta` puesto —está cerrada— y
     no sale por aquí; se llega a ella desde el préstamo que la apartó, que la
     señala con `reanuda_id`. Contarlas sin esto pondría un número que BAJA
     cuando alguien saca un equipo a una salida, y esa cifra se lee como
     «devolvieron cosas», que es lo contrario de lo que pasó.
     Sin segunda consulta: el puntero ya viaja en las filas que hay aquí. */
  const nAsig = (manos as any)?.error ? null : (() => {
    const f = manos.data || [];
    /* Un solo conjunto de ids y no una suma de dos cuentas: en el estado que
       la base no impide —una asignación abierta Y un préstamo abierto que la
       apunta— sumar daba 2 donde la lista enseña 1, y una pestaña que dice un
       número distinto del que hay dentro se deja de creer. `asignacionesVivas`
       deduplica igual, así que las dos cuentas salen del mismo criterio. */
    const ids = new Set<string>(f.filter((p: any) => p.tipo === "asignacion").map((p: any) => p.id));
    f.forEach((p: any) => { if (p.reanuda_id) ids.add(p.reanuda_id); });
    return ids.size;
  })();

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/casos/equipamiento" className="btn btn-ghost"
          title="Todos los casos, agrupados por equipo">🗂 Casos</Link>
        <Link href="/historial/equipamiento" className="btn btn-ghost"
          title="Todo lo que se movió en los equipos, por periodo">🕐 Historial</Link>
        <Link href="/entidad/equipamiento/nuevo" className="btn">{ALTA_SUELTA.equipamiento}</Link>
      </div>
      <h1 className="title-lg">🎥 Equipos audiovisuales</h1>

      <Pestanas items={[
        { href: "/equipamiento", label: "📋 Inventario" },
        { href: "/equipamiento/entrega", label: "🤝 Entrega", n: nManos },
        /* Separada de Entrega a propósito, y no un bloque más dentro de ella:
           lo que hay aquí NO tiene que volver. Mezclarlas hacía crecer para
           siempre una lista que se mira para reclamar — con veinte asignaciones
           dentro, las tres salidas que sí hay que perseguir quedan enterradas.
           El razonamiento está en app/equipamiento/entrega/page.tsx. */
        { href: "/equipamiento/asignados", label: "📌 Asignados", n: nAsig },
        /* ⚠ Sin número, y es a propósito: la pestaña lleva DOS cosas dentro y
           un solo número no puede decir las dos —«26» al lado de «Combos y
           kits» se lee como veintiséis de algo, y son once kits y veintiséis
           combos—. Cada panel ya pinta el suyo en su propio título. */
        { href: "/equipamiento/combos", label: "🧰 Combos y kits" },
      ]} />

      {children}
    </div>
  );
}
