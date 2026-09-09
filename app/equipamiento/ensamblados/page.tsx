import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PanelEnsamblados from "@/components/PanelEnsamblados";
import { arbolEnsamblados } from "@/lib/equipamientoDatos";

export const metadata: Metadata = { title: "🔧 Ensamblados" };

/* ══════════════════════════════════════════════════════════════════════════
   🔧 ENSAMBLADOS — LA CUARTA PESTAÑA

   Los tres ejes del inventario tenían dos pantallas y media: el combo y el kit
   viven en «Combos y kits»; el ensamblado —de qué está hecha una cosa— solo se
   veía dentro de la ficha de cada equipo. Con ciento doce piezas montadas, la
   pregunta «¿qué tengo armado?» no se podía contestar.

   ── UNA SOLA TANDA, Y LA COMPARTE CON EL LAYOUT ──
   `arbolEnsamblados` está `cache()`ada y la llaman dos: esta pantalla y la
   cabecera, que necesita el número para la pestaña. En un render completo son
   un solo viaje, igual que en las otras pestañas.

   ⚠ Pero NO garantiza que el número de la pestaña y el de aquí coincidan
   siempre: `app/equipamiento/layout.tsx` ya lo avisa —en navegación SUAVE
   entre pestañas hermanas Next no repinta el layout—, así que al entrar aquí
   desde otra pestaña el número de arriba puede ser el del render anterior y lo
   de abajo estar fresco. Se corrige solo al recargar. Decir lo contrario sería
   prometer una consistencia que el enrutador no da.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function Ensamblados() {
  /* ⚠ Su propio `getUser()`, aunque el layout ya lo haga y el middleware
     redirija antes: `middleware.ts` deja pasar si la verificación tarda más de
     3,5 s, así que toda página protegida cierra su propia puerta. */
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { raices, sueltas, candidatos, cortado, sitiosCortados, eEquipos, eSitios,
          sitios, contenedores } = await arbolEnsamblados();

  return (
    <>
      {/* ⚠ El error de la lista se DICE. Sin equipos, esta pantalla enseña
          «no hay nada armado todavía» sobre un inventario con ciento doce
          piezas montadas — la mentira en la dirección que más tranquiliza. */}
      {eEquipos && (
        <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
          <b style={{ color: "var(--red)", fontSize: 13 }}>⚠ No se pudo leer el inventario</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            Lo que salga abajo está incompleto: no es que no haya ensamblados,
            es que no se pudieron leer los equipos.
            <br /><code style={{ fontSize: 11, opacity: .85 }}>{eEquipos}</code>
          </div>
        </div>
      )}

      {/* El tope de la API alcanzado no es un detalle técnico aquí: una pieza
          cuyo anfitrión no llegó se leería como «apunta a un equipo que ya no
          está», o sea como una base rota. Se avisa antes de que nadie lo lea. */}
      {/* ⚠ El de SITIOS es otro aviso y va aparte. Fundidos, mil cajones sobre
          un inventario sano hacían que la pantalla dijera «se leyeron los
          primeros mil equipos», que es falso. */}
      {eSitios && (
        <div className="card" style={{ borderLeft: "3px solid var(--yellow)" }}>
          <b style={{ color: "var(--yellow)", fontSize: 13 }}>⚠ No se pudieron leer los sitios</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            Los ensamblados salen bien; lo que no se puede es decir dónde se
            guarda cada uno ni cambiarlo desde aquí.{" "}
            {/(does not exist|schema cache|PGRST20)/i.test(eSitios)
              ? <>Falta correr <code>db/sitios.sql</code> en Supabase.</>
              : <code style={{ fontSize: 11 }}>{eSitios}</code>}
          </div>
        </div>
      )}

      {sitiosCortados && (
        <div className="card" style={{ borderLeft: "3px solid var(--yellow)" }}>
          <b style={{ color: "var(--yellow)", fontSize: 13 }}>⚠ La lista de sitios llegó al tope</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            Alguna cadena puede salir cortada o diciendo que apunta a un sitio
            que no está. Los ensamblados en sí están completos.
          </div>
        </div>
      )}

      {cortado && (
        <div className="card" style={{ borderLeft: "3px solid var(--yellow)" }}>
          <b style={{ color: "var(--yellow)", fontSize: 13 }}>⚠ El inventario llegó al tope</b>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>
            Se leyeron los primeros mil equipos, así que puede faltar algún
            ensamblado entero y alguna pieza puede salir como «apunta a un
            equipo que no llegó». No es la base: es esta lista, que se cortó.
          </div>
        </div>
      )}

      <PanelEnsamblados raices={raices} sueltas={sueltas}
        candidatos={candidatos} cortado={cortado}
        sitios={sitios} contenedores={contenedores}
        eSitios={eSitios} sitiosCortados={sitiosCortados} />
    </>
  );
}
