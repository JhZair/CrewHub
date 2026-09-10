import Link from "@/components/Enlace";
import { ReactNode } from "react";

/* Bloque de filtros compartido: un solo lenguaje visual en todos los
   listados (empresas, personas...). Todo es chip, agrupado por dimensión. */

/* (Aquí hubo un `prefetch={false}` explícito: un listado pinta veinte de estos
 * chips a la vez y cada uno costaba una precarga nada más abrir la pantalla.
 * Ya no hace falta decirlo — `@/components/Enlace` lo trae de fábrica para los
 * 309 enlaces del sistema, y ahí está el porqué completo.) */
export function Chip({ href, on, color, title, children }: {
  href: string; on?: boolean; color?: string; title?: string; children: ReactNode;
}) {
  return (
    <Link href={href} className={`vtab${on ? " on" : ""}`} title={title}
      style={!on && color ? { color } : undefined}>{children}</Link>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   UNA DIMENSIÓN DE FILTRO = UN RÓTULO ARRIBA Y UNA TIRA QUE SE DESPLAZA

   ── EL RÓTULO, ENCIMA Y NO AL LADO ──
   Estaba en una columna de 58 px a la izquierda, y esa columna hacía dos
   cosas malas a la vez: se comía 58 px de ancho en TODAS las filas —justo el
   ancho que le falta a la de categorías— y obligaba a que «CATEGORÍA» cupiera
   en 58 px, que no cabe. Encima, el rótulo no le quita ancho a nada y puede
   ser tan largo como haga falta.

   ── UNA SOLA LÍNEA, CON DESPLAZAMIENTO ──
   Con `wrap`, diez categorías ocupaban tres renglones y el bloque de filtros
   medía media pantalla: al entrar al inventario lo primero que se veía eran
   los filtros, y había que bajar para ver el inventario. En una línea, cada
   dimensión mide UNA fila pase lo que pase, el bloque entero es previsible, y
   lo que no cabe se alcanza desplazando.

   ⚠ LOS DOS DETALLES SIN LOS QUE ESTO NO FUNCIONA, y los dos fallan sin dar
   error —salen chips estrujados en vez de una tira que se desplaza—:
    · `flex:none` en CADA hijo. Un hijo flex se encoge por debajo de su
      contenido por defecto: sin esto los chips no desbordan, se aplastan, y
      «sin subcategoría · 76» acaba en «sin subcat…». No hay desbordamiento,
      así que tampoco hay desplazamiento: no aparece la barra y parece que el
      diseño simplemente aprieta.
    · `min-width:0` en el grupo. Un ítem de flex o de grid tampoco baja de su
      contenido: dentro de un contenedor así, la tira ensancharía la tarjeta
      —y con ella la página— en lugar de desplazarse. Hoy `.card` es un bloque
      y no hace falta; el día que alguien meta el panel en una rejilla, sí.

   ── Y LA BARRA SE VE SIEMPRE ──
   Una tira que se desplaza sin ninguna marca es contenido escondido: nadie
   arrastra lo que no sabe que está. La barra fina es la marca, y por eso se
   pinta siempre y no al pasar el ratón.
   ══════════════════════════════════════════════════════════════════════════ */
export function FilaFiltro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="filt-grupo">
      <span className="filt-tit">{titulo}</span>
      <div className="filt-tira">{children}</div>
    </div>
  );
}

export function PanelFiltros({ limpiar, mostrarLimpiar, children }: {
  limpiar: string; mostrarLimpiar?: boolean; children: ReactNode;
}) {
  return (
    <div className="card" style={{ padding: "8px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4, borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
          Filtros
        </span>
        <span style={{ flex: 1 }} />
        {mostrarLimpiar && (
          <Link href={limpiar} className="vtab" style={{ padding: "2px 9px", fontSize: 11 }}>
            ✕ limpiar filtros
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
