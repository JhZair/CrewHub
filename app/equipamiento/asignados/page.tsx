import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AsignarLote from "@/components/AsignarLote";
import Asignados, { type AsigItem } from "@/components/Asignados";
import {
  inventarioDePaneles, catalogosEntrega, asignacionesApartadas, un1,
} from "@/lib/equipamientoDatos";
import { asignacionesVivas } from "@/lib/asignaciones";

export const metadata: Metadata = { title: "📌 Asignados" };

/* ══════════════════════════════════════════════════════════════════════════
   📌 ASIGNADOS — DÓNDE VIVE CADA EQUIPO

   La cuarta pestaña, y la que faltaba. Una asignación no es un préstamo largo:
   la laptop es de Michel, la interfaz es del puesto de post, la ropa táctica
   es de Katy. Que sigan ahí seis meses es lo correcto, no una deuda. Está
   razonado en db/asignacion.sql y en lib/estadosEquipo.ts.

   Existían desde hace tiempo y no había dónde verlas juntas: había que abrir
   persona por persona, o filtrar el inventario por «📌 Asignados» —que filtra
   por ESTADO del equipo, no por la custodia, y no dice desde cuándo, ni quién
   se la dio, ni por qué es suya—. La pregunta que se hace de verdad es «¿qué
   hay que recuperar si alguien se va?», y no se podía contestar.

   ── DOS CONSULTAS PARA UNA LISTA, Y POR QUÉ ──
   Una asignación APARTADA por un rodaje está cerrada en la base: tiene `hasta`
   puesto, igual que una que terminó de verdad. La diferencia vive en el
   préstamo que la apartó, que la señala con `reanuda_id` y sigue abierto.
   Así que «las asignaciones vivas» NO es `hasta is null`: eso deja fuera justo
   las que están en un rodaje, que son las que más se preguntan. Se piden las
   abiertas, se recogen los punteros y se piden las apartadas. La segunda solo
   viaja si hay alguna.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function AsignadosEquipos() {
  /* ⚠ Su propio `getUser()`, aunque el layout ya lo haga y el middleware
     redirija antes. `middleware.ts` lo declara como invariante: él redirige,
     pero NO es el que cierra la puerta —deja pasar si la verificación tarda
     más de 3,5 s—, así que toda página protegida la cierra por su cuenta. */
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [inv, cat] = await Promise.all([inventarioDePaneles(), catalogosEntrega()]);
  const { equipos, enManos, eEquipos, eManos, cartelPorEq } = inv;

  const apartadas = await asignacionesApartadas(enManos as any[]);
  const vivas = asignacionesVivas(enManos as any[], (apartadas.data || []) as any[]);

  const items: AsigItem[] = vivas.map(({ asig, prestada }) => {
    const eq = un1((asig as any).equipo);
    const per = un1((asig as any).persona);
    const ent = un1((asig as any).entrego);
    /* El proyecto sale del PRÉSTAMO que la apartó, no de la asignación: una
       asignación no tiene proyecto —es de la persona, no de un rodaje— y
       leerlo de ahí daría siempre vacío. */
    const pr = prestada ? un1((prestada as any).proy) : null;
    return {
      id: asig.id, desde: asig.desde, nota: (asig as any).nota || null,
      eqId: eq?.id, folio: eq?.folio, nombre: eq?.nombre || "sin nombre",
      cartel: cartelPorEq.get(eq?.id) || null,
      categoria: eq?.categoria || null, subcategoria: eq?.subcategoria || null,
      valor: eq?.valor_compra ? Number(eq.valor_compra) : null,
      perId: per?.id || "_", per: per?.alias || per?.nombre || "sin registrar",
      foto: per?.foto_url || null,
      entrego: ent?.nombre || null,
      fuera: !!prestada, fueraEn: pr?.nombre || null,
    };
  });

  return (
    <>
      {/* Si la lista de equipos falla, se DICE. Sin esto el panel de asignar
          sale vacío y se lee como «no hay nada disponible», que sobre
          trescientos equipos libres es la mentira más cara de esta pantalla. */}
      {eEquipos && (
        <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
          <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ No se pudo leer el inventario</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            La lista de abajo saldrá vacía, y eso <b>no</b> quiere decir que no haya equipos libres.
            <br /><code style={{ fontSize: 11, opacity: .85 }}>{eEquipos}</code>
          </div>
        </div>
      )}

      <AsignarLote
        equipos={(equipos || []).map((e: any) => ({
          id: e.id, folio: e.folio, nombre: e.nombre,
          categoria: e.categoria, subcategoria: e.subcategoria,
          estado: e.estado, cartel: cartelPorEq.get(e.id) || null,
        }))}
        personas={cat.personas} />

      {/* Si la consulta de custodias falla, se DICE. Sin esto un error de
          PostgREST devuelve `data: null`, el `|| []` lo convierte en «no hay
          nada» y la pantalla juraría que nadie tiene nada asignado con la
          mitad del inventario en casa de alguien. */}
      {eManos && (
        <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
          <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ No se pudo leer quién tiene qué</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            {/(tipo|reanuda|motivo_fin)/.test(eManos)
              ? <>Falta correr <code>db/asignacion-suspender.sql</code> en Supabase. Hasta entonces esta pantalla no puede pintarse — y hay equipos asignados, no es que no haya.</>
              : eManos}
          </div>
        </div>
      )}
      {/* La segunda consulta puede fallar por su cuenta, y si se calla, las
          asignaciones que están en un rodaje desaparecen de la lista sin que
          nada lo diga: se leería como que a esa persona le quitaron equipos. */}
      {!eManos && apartadas.error && (
        <div className="card" style={{ borderLeft: "3px solid var(--yellow)" }}>
          <b style={{ color: "var(--yellow)", fontSize: 13 }}>⚠ Faltan las que están en un rodaje</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            La lista de abajo está incompleta: no se pudieron leer las asignaciones
            apartadas por una salida. <b>No</b> quiere decir que se hayan quitado.
            <br /><code style={{ fontSize: 11, opacity: .85 }}>{apartadas.error.message}</code>
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <Asignados items={items} />
      ) : !eManos && (
        /* El vacío se dice, y solo cuando SE SABE que está vacío. Sin esto,
           «nadie tiene nada a su cargo» y «la consulta falló» se ven igual:
           una pantalla sin el panel. */
        <div className="card" style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.55 }}>
          Todavía no hay ningún equipo a cargo de nadie. Una <b>asignación</b> es
          dónde vive un equipo —la laptop de alguien, la interfaz del puesto de
          post—, no una salida: no se le cuentan días ni se le reclama la vuelta.
          Para un rodaje, usa <b>🤝 Entrega</b>.
        </div>
      )}
    </>
  );
}
