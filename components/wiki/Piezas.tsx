/* Piezas de servidor que comparten las pantallas de la wiki: variables de
   color por área, insignia de estado, migas de pan, filas de listado.
   Sin "use client": nada de esto tiene estado. */
import type { ReactNode } from "react";
import Enlace from "@/components/Enlace";
import { ESTADOS, TIPOS, type Area, type EstadoPagina, type PaginaResumen, type Seccion } from "@/lib/wiki/tipos";
import { fechaCorta } from "@/lib/wiki/util";
import { ChevronRight } from "./Iconos";

/** `--a-<area>` para cada área en los dos temas. Las áreas son datos, así que
 *  sus colores también: esto se genera desde la tabla en cada render. */
export function EstilosAreas({ areas }: { areas: Area[] }) {
  const claro = areas.map(a => `--a-${a.id}:${a.color};`).join("");
  const oscuro = areas.map(a => `--a-${a.id}:${a.color_oscuro};`).join("");
  return <style>{`.wk{${claro}}.wk.is-dark{${oscuro}}`}</style>;
}

export function Insignia({ estado }: { estado: EstadoPagina }) {
  const e = ESTADOS[estado] || ESTADOS.pendiente;
  return (
    <span className="wk-status">
      <span className="wk-dot" style={{ background: `var(${e.var})` }} />
      {e.label}
    </span>
  );
}

export function Migas({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="wk-crumbs" aria-label="Ruta">
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          {i > 0 && <ChevronRight size={13} />}
          {it.href ? <Enlace href={it.href}>{it.label}</Enlace> : <span>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Fila compacta (inicio, columna derecha). */
export function FilaPagina({ p, area, seccion, sub }: { p: PaginaResumen; area?: Area; seccion?: Seccion | null; sub?: ReactNode }) {
  return (
    <Enlace className="wk-list-item" style={{ "--c": `var(--a-${p.area_id})` } as any} href={`/wiki/${p.area_id}/${p.slug}`}>
      <span className="wk-li-title">
        <span className="wk-dot" style={{ background: `var(--a-${p.area_id})` }} />
        {p.titulo}
      </span>
      <span className="wk-li-sub">
        {sub ?? <>{area?.nombre || p.area_id}{seccion ? ` / ${seccion.nombre}` : ""}</>}
      </span>
    </Enlace>
  );
}

/** Fila ancha (portada de área). */
export function FilaPaginaArea({ p, areaId }: { p: PaginaResumen; areaId: string }) {
  const meta = [TIPOS[p.tipo] || p.tipo, p.etapa ? p.etapa.toLowerCase() : null, `nivel ${p.nivel}`].filter(Boolean).join(", ");
  return (
    <Enlace className="wk-page-row" style={{ "--c": `var(--a-${areaId})` } as any} href={`/wiki/${areaId}/${p.slug}`}>
      <span>
        <span className="wk-page-title">{p.titulo}</span>
        <span className="wk-page-sub">{meta}{p.actualizado ? ` · ${fechaCorta(p.actualizado)}` : ""}</span>
      </span>
      <Insignia estado={p.estado} />
    </Enlace>
  );
}
