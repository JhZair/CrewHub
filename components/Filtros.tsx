import Link from "next/link";
import { ReactNode } from "react";

/* Bloque de filtros compartido: un solo lenguaje visual en todos los
   listados (empresas, personas...). Todo es chip, agrupado por dimensión. */

export function Chip({ href, on, color, title, children }: {
  href: string; on?: boolean; color?: string; title?: string; children: ReactNode;
}) {
  return (
    <Link href={href} className={`vtab${on ? " on" : ""}`} title={title}
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
