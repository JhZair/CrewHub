import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EntregaLote from "@/components/EntregaLote";
import EnUsoAhora, { type UsoItem } from "@/components/EnUsoAhora";
import { inventarioDePaneles, catalogosEntrega, un1 } from "@/lib/equipamientoDatos";

export const metadata: Metadata = { title: "🤝 Entrega" };

/* ══════════════════════════════════════════════════════════════════════════
   🤝 ENTREGA — LA SALIDA A RODAJE Y LO QUE TIENE QUE VOLVER

   Los dos bloques van juntos y en este orden porque es el orden del día:
   primero se entrega, después se mira quién tiene qué. Estaban así dentro de
   la pantalla grande y se mudan enteros.

   ── LO QUE CAMBIA AL SEPARARSE ──
   Antes, abrir 🎥 equipos cargaba esto aunque solo se viniera a buscar un
   folio: el inventario completo cruzaba al navegador dentro de `EntregaLote`
   —que es de cliente— en cada visita. Ahora lo paga quien viene a entregar.
   Y lo que cruza es una versión FLACA de cada equipo: doce campos en vez de
   las veintitantas columnas de la tabla. Está contado en lib/equipamientoDatos.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function EntregaEquipos({ searchParams }: {
  searchParams?: { kit?: string };
}) {
  /* ⚠ Su propio `getUser()`, aunque el layout ya lo haga y el middleware
     redirija antes. `middleware.ts` lo declara como invariante: él redirige,
     pero NO es el que cierra la puerta —deja pasar si la verificación tarda
     más de 3,5 s—, así que toda página protegida la cierra por su cuenta.
     Estas dos nacieron sin ella al partir la pantalla y eran las únicas del
     sistema sin la línea. */
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const kitPre = searchParams?.kit || "";   // llegó desde «🤝 Entregar» de un kit

  const [inv, cat] = await Promise.all([inventarioDePaneles(), catalogosEntrega()]);
  const { equipos, kits, enManos, eEquipos, eManos, cartelPorEq, comboPorEq, piezasDe } = inv;
  const kitPorId = new Map(kits.map(k => [k.id, k]));

  const enUso = (enManos as any[]).filter((p: any) => p.tipo !== "asignacion");

  return (
    <>
      {/* Si la lista de equipos falla, se DICE. Sin esto el panel de entrega
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

      {/* La salida a rodaje: una persona, un proyecto, N equipos, un botón.
          `key` CON EL KIT DENTRO. «🤝 Entregar» de un kit navega aquí con
          ?kit=…, y el panel se abre solo si `kitInicial` llega en el PRIMER
          pintado — es el valor inicial de un useState. Sin la key, Next reusa
          el componente ya montado al cambiar de parámetro: llegaba el kit, el
          estado seguía cerrado, y el botón del kit acababa en un segundo clic
          sobre «Entregar equipos a alguien». No fallaba nada; simplemente no
          pasaba nada. */}
      {/* `equipos` ya trae `quien` pegado a cada fila: lo pone
          `inventarioParaPaneles` en lib/equipamientoDatos, y es lo que el panel
          usa para decir DE QUIÉN es cada cosa en la lista de lo asignado. Sin
          ese nombre, esa lista sería una segunda tanda de disponibles con otro
          color, que es exactamente lo que no puede parecer. */}
      <EntregaLote key={kitPre || "_"} equipos={equipos as any}
        personas={cat.personas} proyectos={cat.proyectos}
        kits={kits} kitInicial={kitPre} />

      {/* Si la consulta falla, se DICE. Sin esto, un error de PostgREST
          —por ejemplo, que falte correr db/prestamo-entregado-por.sql—
          devuelve `data: null`, el `|| []` lo convierte en «no hay nada» y el
          panel entero desaparece: la aplicación juraría que no hay ningún
          equipo prestado con doce en la calle. Es el mismo fallo que dejó sin
          personajes a los proyectos. */}
      {eManos && (
        <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
          <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ No se pudo leer quién tiene qué</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            {/(reanuda|motivo_fin)/.test(eManos)
              ? <>Falta correr <code>db/asignacion-suspender.sql</code> en Supabase. Hasta entonces esta pantalla no puede pintarse — y hay equipos fuera, no es que no haya.</>
              : /(entregado_por|entrego)/.test(eManos)
              ? <>Falta correr <code>db/prestamo-entregado-por.sql</code> en Supabase. Hasta entonces este panel no puede pintarse — y hay equipos prestados, no es que no haya.</>
              : eManos}
          </div>
        </div>
      )}

      {/* «EN USO AHORA» ES LA LISTA DE LO QUE TIENE QUE VOLVER.
          Una asignación no vuelve —la laptop es de Michel— y meterla aquí
          haría crecer para siempre una lista que se mira para reclamar: con
          veinte asignaciones dentro, las tres salidas de rodaje que sí hay que
          perseguir quedan enterradas. Tienen su propia pestaña: 📌 Asignados.
          ⚠ Un equipo asignado que SÍ salió a un rodaje sale aquí, y tiene que
          salir: hoy está fuera y tiene que volver. Que además sea de alguien
          se ve en su pestaña, donde se dice que está en una salida. */}
      {enUso.length > 0 ? (
        /* El panel entero es cliente porque las casillas son estado, así que
           aquí solo se aplana lo que la consulta ya trajo: nada de funciones
           cruzando la frontera, que es donde esto se rompe. */
        <EnUsoAhora items={enUso.map((p: any): UsoItem => {
          const eq = un1(p.equipo), per = un1(p.persona), pr = un1(p.proy), ent = un1(p.entrego);
          return {
            id: p.id, desde: p.desde,
            entrego: ent?.nombre || null, entregoFoto: ent?.avatar_url || null,
            categoria: eq?.categoria || null, subcategoria: eq?.subcategoria || null,
            valor: eq?.valor_compra ? Number(eq.valor_compra) : null,
            /* Solo el código, no el combo entero: la fila necesita dos
               palabras, no un objeto con total, moneda y comprobante repetido
               en cada préstamo. */
            comboCodigo: eq?.compra_id ? (comboPorEq.get(eq.id)?.codigo || null) : null,
            piezas: piezasDe.get(eq?.id) || [],
            eqId: eq?.id, folio: eq?.folio, nombre: eq?.nombre || "sin nombre",
            cartel: cartelPorEq.get(eq?.id) || null,
            perId: per?.id || "_", per: per?.alias || per?.nombre || "sin registrar",
            foto: per?.foto_url || null,
            proyId: pr?.id || null, proy: pr?.nombre || null,
            kitId: p.kit_id || null,
            kit: p.kit_id ? kitPorId.get(p.kit_id)?.nombre || null : null,
            kitTotal: p.kit_id ? kitPorId.get(p.kit_id)?.equipoIds.length || 0 : 0,
          };
        })} />
      ) : !eManos && (
        /* ⚠ El vacío se dice, y solo cuando SE SABE que está vacío. Antes este
           bloque simplemente no se pintaba, así que «nadie tiene nada» y «la
           consulta falló» se veían igual: una pantalla sin el panel. */
        <div className="card" style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.55 }}>
          Ahora mismo no hay nada fuera. Las <b>asignaciones</b> —lo que alguien
          tiene de forma permanente— no salen aquí porque no vuelven: están en la
          pestaña <b>📌 Asignados</b>.
        </div>
      )}
    </>
  );
}
