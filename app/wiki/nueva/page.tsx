import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/supabase/server";
import FormularioPagina from "@/components/wiki/FormularioPagina";
import { Migas } from "@/components/wiki/Piezas";
import { listarAreas, listarSecciones } from "@/lib/wiki/datos";

export const metadata: Metadata = { title: "Nueva página" };

/* /wiki/nueva?area=documental&s=8 — cargar una página entregada por un hilo. */
export default async function NuevaPagina({ searchParams }: { searchParams: { area?: string; s?: string } }) {
  const user = await usuarioActual();
  if (!user) redirect("/login");
  const [areas, secciones] = await Promise.all([listarAreas(), listarSecciones()]);
  const areaInicial = areas.some(a => a.id === searchParams.area) ? searchParams.area : "";
  const s = searchParams.s ? parseInt(searchParams.s, 10) : null;

  return (
    <main className="wk-main wk-main-solo">
      <Migas items={[{ label: "Wiki", href: "/wiki" }, { label: "Nueva página" }]} />
      <header className="wk-area-head">
        <h1 className="wk-cond">Cargar una página</h1>
        <p className="wk-area-lead">
          Pega el encabezado de metadatos (3.1) y el Markdown tal como los entregó el hilo. Los <code>[[enlaces]]</code>, las referencias <code>[n]</code>,
          las marcas <em>(Pendiente de verificación)</em>, los videos de YouTube en su propia línea, los diagramas <code>```mermaid</code> y los
          checklists <code>- [ ]</code> se muestran solos.
        </p>
      </header>
      <FormularioPagina areas={areas} secciones={secciones} areaInicial={areaInicial} seccionInicial={s} />
    </main>
  );
}
