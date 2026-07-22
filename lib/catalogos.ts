import { SECCIONES, nombreDe } from "@/lib/secciones";

/* QUIÉNES PUEDEN SER DUEÑOS DE UN OBJETO, y sus catálogos para elegir.

   Lo piden dos pantallas: agregar desde /repositorio y cambiarle el dueño a un
   objeto. Se arma con `nombreDe` —el mismo resolvedor que ya traduce ids a
   nombres—, así que una sección nueva en SECCIONES queda habilitada sola. */

/** Todas las secciones menos el propio objeto: un objeto no cuelga de otro. */
export const DUENOS = SECCIONES.filter(s => s.tipo !== "objeto");

export type CatalogosDuenos = {
  catalogos: Record<string, { id: string; nombre: string }[]>;
  etiquetas: Record<string, string>;
};

export async function catalogosDuenos(supabase: any): Promise<CatalogosDuenos> {
  const catalogos: Record<string, { id: string; nombre: string }[]> = {};
  const etiquetas: Record<string, string> = {};
  await Promise.all(DUENOS.map(async s => {
    const n = nombreDe(s.tipo);
    if (!n) return;
    const sel = ["id", n.campo, n.corto].filter(Boolean).join(",");
    const { data, error } = await supabase.from(n.tabla).select(sel).limit(1000);
    /* Si una tabla falla —RLS, una columna `corto` que ya no existe— el tipo
       desaparecía del selector sin dejar rastro. Al menos que quede en el log
       del servidor: un selector al que le falta una opción es difícil de
       diagnosticar mirando la pantalla. */
    if (error) { console.error(`catálogo de ${s.tipo}:`, error.message); return; }
    const items = (data || []).map((r: any) => ({
      id: r.id, nombre: (n.corto && r[n.corto]) || r[n.campo] || "—",
    })).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre, "es"));
    if (items.length) { catalogos[s.tipo] = items; etiquetas[s.tipo] = s.singular || s.plural; }
  }));
  return { catalogos, etiquetas };
}
