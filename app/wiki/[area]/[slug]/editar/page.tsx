import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Enlace from "@/components/Enlace";
import { usuarioActual } from "@/lib/supabase/server";
import FormularioPagina from "@/components/wiki/FormularioPagina";
import { Migas } from "@/components/wiki/Piezas";
import { listarAreas, listarSecciones, obtenerPagina } from "@/lib/wiki/datos";
import { borrarPagina } from "@/app/wiki/acciones";

type Props = { params: { area: string; slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await obtenerPagina(params.area, params.slug);
  return { title: p ? `✎ ${p.titulo}` : "Editar" };
}

export default async function EditarPagina({ params }: Props) {
  const user = await usuarioActual();
  if (!user) redirect("/login");
  const pagina = await obtenerPagina(params.area, params.slug);
  if (!pagina) notFound();
  const [areas, secciones] = await Promise.all([listarAreas(), listarSecciones()]);
  const area = areas.find(a => a.id === pagina.area_id);
  const ruta = `/wiki/${pagina.area_id}/${pagina.slug}`;

  return (
    <main className="wk-main wk-main-solo">
      <Migas items={[{ label: "Wiki", href: "/wiki" }, { label: area?.nombre || pagina.area_id, href: `/wiki/${pagina.area_id}` }, { label: pagina.titulo, href: ruta }, { label: "Editar" }]} />
      <header className="wk-area-head">
        <h1 className="wk-cond">Editar: {pagina.titulo}</h1>
        <p className="wk-area-lead">Pega la versión actualizada que entregó el hilo, o corrige el texto aquí. Cada guardado deja una entrada en el historial.</p>
      </header>
      <FormularioPagina areas={areas} secciones={secciones} pagina={pagina} />
      <details className="wk-danger">
        <summary>Borrar esta página</summary>
        <p className="wk-muted">Se borran también su historial, sus anotaciones y sus vínculos con proyectos. Si solo quedó obsoleta, mejor márcala como <strong>Archivada</strong> y explica por qué (guía, sección 7).</p>
        <form action={borrarPagina}>
          <input type="hidden" name="id" value={pagina.id} /><input type="hidden" name="area" value={pagina.area_id} />
          <button type="submit" className="wk-btn wk-btn-danger">Borrar definitivamente</button>
          <Enlace className="wk-link" href={ruta} style={{ marginLeft: 14 }}>Cancelar</Enlace>
        </form>
      </details>
    </main>
  );
}
