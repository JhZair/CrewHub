import { redirect } from "next/navigation";
import Enlace from "@/components/Enlace";
import { usuarioActual } from "@/lib/supabase/server";
import Buscador from "@/components/wiki/Buscador";
import { IconoArea } from "@/components/wiki/Iconos";
import { FilaPagina } from "@/components/wiki/Piezas";
import { listarAreas, listarPaginas, listarSecciones, paginasEnInvestigacion, paginasRecientes } from "@/lib/wiki/datos";
import { fechaCorta } from "@/lib/wiki/util";

/* Inicio: «¿Qué necesitas resolver?» + las áreas como puntos de entrada. */
export default async function WikiInicio() {
  const user = await usuarioActual();
  if (!user) redirect("/login");

  const [areas, secciones, paginas, enInvestigacion, recientes] = await Promise.all([
    listarAreas(), listarSecciones(), listarPaginas(), paginasEnInvestigacion(6), paginasRecientes(6),
  ]);
  // Preguntas de ejemplo: las que las páginas dicen responder.
  const ejemplos = paginas.flatMap(p => p.preguntas || []).slice(0, 4);

  return (
    <>
      <section className="wk-hero">
        <h1 className="wk-cond">¿Qué necesitas resolver?</h1>
        <Buscador grande ejemplos={ejemplos} />
      </section>

      <section className="wk-areas" aria-labelledby="areas-t">
        <h2 id="areas-t" className="wk-h2">Áreas</h2>
        {areas.map(a => {
          const n = paginas.filter(p => p.area_id === a.id).length;
          const ns = secciones.filter(s => s.area_id === a.id).length;
          const meta = a.estado === "definida" ? `${ns} secciones, ${n} ${n === 1 ? "página" : "páginas"}`
            : a.estado === "propuesta" ? `${ns} secciones propuestas${n ? `, ${n} páginas` : ""}` : "Por definir";
          return (
            <Enlace key={a.id} className={`wk-area-row ${a.estado === "por-definir" ? "is-undef" : ""}`} style={{ "--c": `var(--a-${a.id})` } as any} href={`/wiki/${a.id}`}>
              <span className="wk-area-bar" aria-hidden="true" />
              <span>
                <span className="wk-area-name wk-cond"><IconoArea nombre={a.icono} size={a.estado === "por-definir" ? 20 : 26} />{a.nombre}</span>
                <span className="wk-area-desc">{a.descripcion}</span>
              </span>
              <span className="wk-area-meta">{meta}</span>
            </Enlace>
          );
        })}
      </section>

      <section className="wk-home-cols">
        <div>
          <h2 className="wk-h2">En investigación</h2>
          {enInvestigacion.length === 0 && <p className="wk-side-empty" style={{ padding: 0 }}>Ninguna página en investigación.</p>}
          {enInvestigacion.map(p => (
            <FilaPagina key={p.id} p={p} area={areas.find(a => a.id === p.area_id)} seccion={secciones.find(s => s.id === p.seccion_id)} />
          ))}
        </div>
        <div>
          <h2 className="wk-h2">Actualizadas recientemente</h2>
          {recientes.length === 0 && (
            <p className="wk-side-empty" style={{ padding: 0 }}>
              Todavía no hay páginas. <Enlace href="/wiki/nueva" className="wk-link">Carga la primera</Enlace>.
            </p>
          )}
          {recientes.map(p => (
            <FilaPagina key={p.id} p={p} sub={`${areas.find(a => a.id === p.area_id)?.nombre || p.area_id}, ${fechaCorta(p.actualizado)}`} />
          ))}
        </div>
      </section>

      <p className="wk-foot">
        <Enlace href="/wiki/nueva" className="wk-link">＋ Cargar una página</Enlace>
        <span aria-hidden="true"> · </span>
        <Enlace href="/manual" className="wk-link">Manual de uso de CrewHUB+</Enlace>
      </p>
    </>
  );
}
