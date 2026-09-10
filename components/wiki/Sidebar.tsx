"use client";
import Enlace from "@/components/Enlace";
import { pad2 } from "@/lib/wiki/util";
import type { Area, PaginaResumen, Seccion } from "@/lib/wiki/tipos";
import { IconoArea, Layers } from "./Iconos";
import { useWikiUI } from "./WikiShell";

/* ══════════════════════════════════════════════════════════════════════════
   NAVEGACIÓN LATERAL — las secciones del área activa

   Arriba, las píldoras de todas las áreas; debajo, las secciones numeradas
   con su cuenta de páginas; al final, el acceso permanente a Común. En el
   móvil se desliza desde la izquierda (estado en WikiShell).
   Es de cliente solo por ese estado; los datos llegan de la página.
   ══════════════════════════════════════════════════════════════════════════ */
export default function Sidebar({ areas, area, secciones, paginas, seccionActiva, slugActivo }: {
  areas: Area[]; area: Area; secciones: Seccion[]; paginas: PaginaResumen[];
  seccionActiva?: number | null; slugActivo?: string | null;
}) {
  const { menuOpen, setMenuOpen } = useWikiUI();
  return (
    <>
      {menuOpen && <div className="wk-scrim" onClick={() => setMenuOpen(false)} />}
      <nav className={`wk-side ${menuOpen ? "is-open" : ""}`} aria-label="Navegación de la wiki" style={{ "--c": `var(--a-${area.id})` } as any}>
        <div className="wk-side-areas">
          {areas.map(a => (
            <Enlace key={a.id} className={`wk-area-pill ${a.id === area.id ? "is-on" : ""}`} style={{ "--c": `var(--a-${a.id})` } as any} href={`/wiki/${a.id}`}>
              <IconoArea nombre={a.icono} size={13} />{a.nombre}
            </Enlace>
          ))}
        </div>

        <div className="wk-side-title wk-cond"><IconoArea nombre={area.icono} size={21} />{area.nombre}</div>
        {area.estado === "propuesta" && <p className="wk-side-note">Secciones en propuesta</p>}

        {secciones.length === 0 ? (
          <p className="wk-side-empty">Sin secciones definidas.</p>
        ) : secciones.map(s => {
          const ps = paginas.filter(p => p.seccion_id === s.id);
          const on = seccionActiva === s.numero;
          return (
            <div key={s.id}>
              <Enlace className={`wk-sec ${on ? "is-on" : ""}`} href={`/wiki/${area.id}?s=${s.numero}`}>
                <span className="wk-sec-num">{pad2(s.numero)}</span>
                <span>{s.nombre}</span>
                <span className="wk-sec-count">{ps.length || ""}</span>
              </Enlace>
              {slugActivo && on && ps.length > 0 && (
                <div className="wk-sec-pages">
                  {ps.map(p => (
                    <Enlace key={p.id} className={`wk-sec-page ${p.slug === slugActivo ? "is-on" : ""}`} href={`/wiki/${area.id}/${p.slug}`}>{p.titulo}</Enlace>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {area.id !== "comun" && areas.some(a => a.id === "comun") && (
          <Enlace className="wk-common-link" href="/wiki/comun"><Layers size={15} /> Fundamentos en Común</Enlace>
        )}
        <Enlace className="wk-common-link" href={`/wiki/nueva?area=${area.id}${seccionActiva ? `&s=${seccionActiva}` : ""}`}>＋ Nueva página</Enlace>
      </nav>
    </>
  );
}
