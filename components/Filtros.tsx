import Link from "next/link";
import { ReactNode } from "react";

/* Bloque de filtros compartido: un solo lenguaje visual en todos los
   listados (empresas, personas...). Todo es chip, agrupado por dimensión. */

/* ── `prefetch={false}`: POR QUÉ AQUÍ Y NO EN TODOS LOS ENLACES ──
 *
 * Un listado pinta veinte de estos chips a la vez —estado, tipo, especialidad,
 * género, alertas— y Next precarga todo `<Link>` que entra en pantalla. Veinte
 * peticiones nada más abrir la pantalla, para ahorrar la de un clic que casi
 * siempre no llega. Medido en /personas: ahí estaban, una por chip.
 *
 * No son tan caras como parecían —Next cortocircuita el árbol de una ruta sin
 * `loading`, así que la precarga no renderiza la página—, pero siguen siendo
 * veinte invocaciones. Y aquí el clic no se gana nada por adelantarlo: quien
 * filtra un listado se queda en la misma pantalla.
 *
 * En los enlaces que SÍ se pulsan —la ficha que estás mirando, el caso del que
 * te avisaron— la precarga se queda, que para eso está.
 *
 * Se decide en el componente y no en cada página: son catorce listados usando
 * este mismo chip, y catorce sitios donde acordarse es cero sitios. */
export function Chip({ href, on, color, title, children }: {
  href: string; on?: boolean; color?: string; title?: string; children: ReactNode;
}) {
  return (
    <Link href={href} prefetch={false} className={`vtab${on ? " on" : ""}`} title={title}
      style={!on && color ? { color } : undefined}>{children}</Link>
  );
}

export function FilaFiltro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "5px 0" }}>
      <span style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, color: "var(--dim)", width: 58, flex: "none" }}>
        {titulo}
      </span>
      {children}
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
