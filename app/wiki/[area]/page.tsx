import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Enlace from "@/components/Enlace";
import { usuarioActual } from "@/lib/supabase/server";
import Sidebar from "@/components/wiki/Sidebar";
import { IconoArea } from "@/components/wiki/Iconos";
import { FilaPaginaArea, Migas } from "@/components/wiki/Piezas";
import { listarAreas, listarPaginas, listarSecciones } from "@/lib/wiki/datos";
import { pad2 } from "@/lib/wiki/util";

/* ══════════════════════════════════════════════════════════════════════════
   PORTADA DE UN ÁREA — /wiki/[area]  (y una sección con ?s=8)

   Secciones con sus páginas, filtro por etapa (?etapa=Rodaje) y la lista de
   secciones sin páginas todavía, para saber qué falta.
   ══════════════════════════════════════════════════════════════════════════ */

type Props = { params: { area: string }; searchParams: { s?: string; etapa?: string } };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const areas = await listarAreas();
  const a = areas.find(x => x.id === params.area);
  if (!a) return { title: "Wiki" };
  if (searchParams.s) {
    const secs = await listarSecciones(a.id);
    const s = secs.find(x => x.numero === parseInt(searchParams.s!, 10));
    if (s) return { title: `${s.nombre} · ${a.nombre}` };
  }
  return { title: a.nombre };
}

export default async function PortadaArea({ params, searchParams }: Props) {
  const user = await usuarioActual();
  if (!user) redirect("/login");

  const [areas, secciones, paginas] = await Promise.all([
    listarAreas(), listarSecciones(params.area), listarPaginas(params.area),
  ]);
  const area = areas.find(a => a.id === params.area);
  if (!area) notFound();

  const numSec = searchParams.s ? parseInt(searchParams.s, 10) : null;
  const seccion = numSec ? secciones.find(s => s.numero === numSec) || null : null;
  const etapa = searchParams.etapa || null;

  const etapas = Array.from(new Set(paginas.map(p => p.etapa).filter(Boolean))) as string[];
  const filtradas = paginas.filter(p => !etapa || p.etapa === etapa);
  const bloques = secciones.map(s => ({ s, pages: filtradas.filter(p => p.seccion_id === s.id) }));
  const sueltas = filtradas.filter(p => !p.seccion_id);
  const mostradas = seccion ? bloques.filter(b => b.s.id === seccion.id) : bloques.filter(b => b.pages.length);
  const vacias = seccion ? [] : bloques.filter(b => !b.pages.length);

  const migas = [{ label: "Wiki", href: "/wiki" }];
  if (seccion) migas.push({ label: area.nombre, href: `/wiki/${area.id}` }, { label: `${pad2(seccion.numero)} ${seccion.nombre}` } as any);
  else migas.push({ label: area.nombre } as any);

  return (
    <div className="wk-layout" style={{ "--c": `var(--a-${area.id})` } as any}>
      <Sidebar areas={areas} area={area} secciones={secciones} paginas={paginas} seccionActiva={seccion?.numero} />

      <main className="wk-main">
        <Migas items={migas} />
        <header className="wk-area-head">
          <h1 className="wk-cond"><IconoArea nombre={area.icono} size={44} />{seccion ? seccion.nombre : area.nombre}</h1>
          <p className="wk-area-lead">{seccion ? (seccion.descripcion || `Sección ${pad2(seccion.numero)} de ${area.nombre}`) : area.descripcion}</p>
        </header>

        {area.estado === "propuesta" && (
          <div className="wk-note">Arquitectura en propuesta. Valida estas secciones con el equipo antes de crear páginas.</div>
        )}
        {area.estado === "por-definir" && (
          <div className="wk-note">Esta área todavía no tiene secciones. Abre un hilo llamado <strong>Wiki › {area.nombre}</strong> para proponer su arquitectura; las secciones se cargan en la tabla <code>wiki_secciones</code>.</div>
        )}

        {!seccion && etapas.length > 1 && (
          <div className="wk-chips" role="group" aria-label="Filtrar por etapa">
            <Enlace className={`wk-chip ${!etapa ? "is-on" : ""}`} href={`/wiki/${area.id}`}>Todas las etapas</Enlace>
            {etapas.map(e => (
              <Enlace key={e} className={`wk-chip ${etapa === e ? "is-on" : ""}`} href={`/wiki/${area.id}?etapa=${encodeURIComponent(e)}`}>{e}</Enlace>
            ))}
          </div>
        )}

        {mostradas.map(({ s, pages }) => (
          <section key={s.id} className="wk-section-block">
            {!seccion && <h2 className="wk-cond"><span>{pad2(s.numero)}</span>{s.nombre}</h2>}
            {pages.length === 0 ? (
              <div className="wk-emptybox" style={{ marginTop: 20 }}>
                {area.estado === "propuesta"
                  ? "Sección propuesta. Podrás crear páginas cuando se apruebe la arquitectura del área."
                  : <>Todavía no hay páginas en esta sección. Créalas desde un hilo llamado <strong>Wiki › {area.nombre} › {pad2(s.numero)} {s.nombre}</strong> y <Enlace className="wk-link" href={`/wiki/nueva?area=${area.id}&s=${s.numero}`}>cárgalas aquí</Enlace>.</>}
              </div>
            ) : pages.map(p => <FilaPaginaArea key={p.id} p={p} areaId={area.id} />)}
          </section>
        ))}

        {!seccion && sueltas.length > 0 && (
          <section className="wk-section-block">
            <h2 className="wk-cond"><span>—</span>Sin sección</h2>
            {sueltas.map(p => <FilaPaginaArea key={p.id} p={p} areaId={area.id} />)}
          </section>
        )}

        {!seccion && paginas.length === 0 && secciones.length > 0 && (
          <div className="wk-emptybox" style={{ marginTop: 24 }}>
            Esta área todavía no tiene páginas. <Enlace className="wk-link" href={`/wiki/nueva?area=${area.id}`}>Carga la primera</Enlace>.
          </div>
        )}

        {vacias.length > 0 && (
          <section className="wk-seclist-wrap">
            <h2 className="wk-h2">{area.estado === "propuesta" ? "Secciones propuestas" : etapa ? `Sin páginas en la etapa ${etapa.toLowerCase()}` : "Secciones sin páginas todavía"}</h2>
            <div className="wk-seclist">
              {vacias.map(({ s }) => (
                <Enlace key={s.id} href={`/wiki/${area.id}?s=${s.numero}`}><span>{pad2(s.numero)}</span><span>{s.nombre}</span></Enlace>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
