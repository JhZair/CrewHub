import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import BarraEmpresas from "@/components/BarraEmpresas";
import { empresasPropiasConLogo, conRuc } from "@/lib/empresasPropias";

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE NO CAMBIA AL ELEGIR EMPRESA

   Los botones de empresa son enlaces con `?emp=`, así que cada clic volvía a
   ejecutar la página entera en el servidor: perfil, lista de empresas y logos
   se pedían de nuevo aunque fueran idénticos, clic tras clic. Tres consultas
   repetidas para cambiar de pestaña.

   Next no vuelve a renderizar un layout cuando lo único que cambia son los
   parámetros de la URL — precisamente porque un layout no los recibe. Así que
   lo que es igual para todas las empresas vive aquí y se carga UNA vez por
   visita: la cabecera, el rótulo y la barra.

   ── POR QUÉ SUBE TAMBIÉN EL TÍTULO ──
   Porque la barra tiene que ir DEBAJO de él, y un layout no puede meterse en
   mitad de la página. O subía el título aquí, o la barra quedaba encima del
   nombre de la pantalla. Además es lo correcto: el título de /comprobantes no
   depende de qué empresa mires.

   El efecto secundario se nota: al cambiar de empresa la cabecera y la barra
   ya no parpadean — se quedan quietas y solo se repinta la lista de abajo.
   ══════════════════════════════════════════════════════════════════════════ */
export default async function ComprobantesLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { empresas, logos } = await empresasPropiasConLogo(supabase);
  /* Solo las que pueden tener comprobantes. El criterio vive en
     lib/empresasPropias junto a la consulta, no repetido aquí. */
  const conComprobantes = empresas.filter(conRuc);
  const sinRuc = empresas.length - conComprobantes.length;

  return (
    <div className="shell" style={{ maxWidth: "min(1180px, 96vw)" }}>
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>compras y ventas de la empresa</span>
      </div>

      {/* ── LA EXPLICACIÓN, EN UN ⓘ ──
          Era un párrafo bajo el título. Se lee una vez —el primer día— y a
          partir de ahí ocupa una línea de todas las pantallas para no decir
          nada nuevo. En el ícono sigue estando para quien llega por primera
          vez, y desaparece para quien ya sabe dónde está.
          Lo que se pierde es el enlace a /obligaciones: un tooltip no admite
          enlaces. Se puede vivir con ello — esa pantalla está en el menú de
          Secciones, a dos teclas. */}
      <h1 className="title-lg" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        🧾 Comprobantes
        <span className="ayuda-ico" title={
          "Todas las facturas y boletas de cada empresa: las que se rinden en un fondo DAFO y las que no. "
          + "De aquí sale el IGV de cada mes en Obligaciones."
        }>ⓘ</span>
      </h1>

      {conComprobantes.length === 0 ? (
        /* Decir CUÁL de los dos vacíos es: «no hay ninguna» y «las que hay no
           tienen RUC» se arreglan en sitios distintos. */
        <div className="empty">
          {sinRuc > 0
            ? `Ninguna empresa propia tiene RUC cargado (${sinRuc} sin RUC). Cárgalo en /empresas y aparecerán aquí.`
            : "No hay empresas propias registradas."}
        </div>
      ) : (
        /* El hueco de debajo lo pone este envoltorio y no cada bloque que
           venga después. Ya son dos —la ficha de una empresa y el resumen de
           todas— y serían tres el día que se añada otro: repetir un
           `margin-top` en cada uno es como acaban separados por distancias
           distintas. `.tv-vistas` no vale para esto: es genérica y la usan
           también los años y los meses, que sí van pegados a lo suyo. */
        <div className="cmpp-emps">
          <BarraEmpresas empresas={conComprobantes} logos={logos} inicio="◫ Todas" />
        </div>
      )}

      {children}
    </div>
  );
}
