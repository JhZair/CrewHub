import { nombreDe } from "@/lib/secciones";

/* CÓMO SE LLAMA CUALQUIER COSA, en un solo sitio.

   Cuatro pantallas resolvían ids a nombres con el mismo bloque copiado —el
   repositorio, la ficha del objeto, el buscador y el catálogo de vínculos—, y
   todas caían en el mismo hueco: `nombreDe("postulacion")` apunta a la columna
   `codigo`, así que una postulación se presentaba como «PO-047». Ese código no
   dice de qué película es ni de qué año, y son justo las que se repiten: el
   mismo proyecto al mismo concurso tres años seguidos son tres «PO-0xx»
   indistinguibles en un chip.

   El título de la ficha ya se estandarizó a «PO-040 · HexaFill · 2026». Esto
   hace que los chips, el buscador y los selectores digan lo mismo: un nombre
   que se escribe una vez y se lee igual en todas partes.

   Va en lotes de 100 ids: viajan en la query string de un GET y varios
   cientos de uuids pasan del techo del proxy, que responde 414 y deja la
   pantalla sin nombres sin decir nada. */

export type Par = { tipo: string; id: string };

export async function resolverNombres(supabase: any, pares: Par[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const porTipo = new Map<string, Set<string>>();
  pares.forEach(p => {
    if (!p?.tipo || !p?.id) return;
    const s = porTipo.get(p.tipo) || new Set<string>();
    s.add(p.id); porTipo.set(p.tipo, s);
  });

  await Promise.all([...porTipo.entries()].map(async ([tipo, set]) => {
    const ids = [...set];
    /* La postulación es la excepción: su nombre no vive en una columna, se
       arma con tres tablas. El resto sí sale de (tabla, campo, corto). */
    if (tipo === "postulacion") {
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from("postulaciones")
          .select("id,codigo,proy:proyectos(nombre),conv:convocatorias(codigo,anio)")
          .in("id", ids.slice(i, i + 100));
        (data || []).forEach((r: any) => m.set(`postulacion:${r.id}`, etiquetaPostulacion(r)));
      }
      return;
    }
    const n = nombreDe(tipo);
    if (!n) return;
    const sel = ["id", n.campo, n.corto].filter(Boolean).join(",");
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from(n.tabla).select(sel).in("id", ids.slice(i, i + 100));
      (data || []).forEach((r: any) =>
        m.set(`${tipo}:${r.id}`, (n.corto && r[n.corto]) || r[n.campo] || ""));
    }
  }));
  return m;
}

/** «PO-040 · HexaFill · 2026». Mismo formato que el título de la ficha. */
export function etiquetaPostulacion(r: any): string {
  const base = `${r?.codigo || r?.conv?.codigo || "Postulación"} · ${r?.proy?.nombre || ""}`.replace(/ · $/, "");
  return [base, r?.conv?.anio || null].filter(Boolean).join(" · ");
}
