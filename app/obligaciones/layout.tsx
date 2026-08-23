import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import BarraEmpresas from "@/components/BarraEmpresas";
import { empresasPropiasConLogo, conRuc } from "@/lib/empresasPropias";

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE NO CAMBIA AL ELEGIR EMPRESA — igual que en /comprobantes

   Misma estructura y por las mismas razones: la lista de empresas y sus logos
   se cargan UNA vez por visita, porque Next no vuelve a renderizar un layout
   cuando lo único que cambia son los parámetros de la URL.

   ── SIN RUC NO SALEN, IGUAL QUE EN COMPROBANTES ──
   Aquí se defendió lo contrario durante una versión: que una empresa sin RUC
   tenía sitio en esta pantalla porque es donde se ve que le falta. El
   argumento era razonable y el uso lo desmintió — sin RUC no hay último
   dígito, sin dígito no hay fecha de vencimiento y sin fecha no hay nada que
   vigilar. Lo único que aportaban esas filas era alargar la lista con ceros.
   Dónde se ve que a una empresa le falta el RUC: en /empresas, que es la
   pantalla de la empresa. Esta es la de lo que vence.
   ══════════════════════════════════════════════════════════════════════════ */
export default async function ObligacionesLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { empresas: todas, logos } = await empresasPropiasConLogo(supabase);
  const empresas = todas.filter(conRuc);

  return (
    /* El mismo ancho que /comprobantes (1180 y no 1100). Las dos pantallas
       llevan la MISMA barra con las mismas quince empresas, y ochenta píxeles
       de diferencia la partían en tres líneas aquí y en dos allí: el mismo
       menú saltando de forma al cambiar de pantalla se lee como dos menús
       distintos. Si el ancho vuelve a separarse, es este comentario el que
       hay que leer antes de tocarlo. */
    <div className="shell shell-ancho">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>lo que vence solo</span>
      </div>

      {/* La explicación, en un ⓘ: se lee el primer día y luego solo ocuparía
          una línea de todas las visitas. Misma decisión que en comprobantes. */}
      <h1 className="title-lg" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        📅 Obligaciones
        <span className="ayuda-ico" title={
          "Las declaraciones de cada empresa ante SUNAT. Los periodos se generan solos; "
          + "lo que se marca a mano es que ya se presentaron. Las constancias no se guardan "
          + "aquí: se comprueban en SOL, que es donde están de verdad."
        }>ⓘ</span>
      </h1>

      {empresas.length === 0 ? (
        <div className="empty">No hay empresas propias registradas.</div>
      ) : (
        /* El hueco de debajo lo pone el envoltorio y no cada bloque que venga
           después — aquí también son dos: el resumen y la ficha de una. */
        <div className="cmpp-emps">
          <BarraEmpresas empresas={empresas} logos={logos} inicio="◫ Todas" />
        </div>
      )}

      {children}
    </div>
  );
}
