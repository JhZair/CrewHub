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

/* ── Nombres DENTRO de los eventos del historial ──
 *
 * `resolverNombres` traduce ENTIDADES (tipo:id). Esto es otra cosa: valores
 * sueltos guardados dentro de `detalle`. Un cambio de responsable lo registra
 * el trigger de la base con el UUID del perfil —no con el nombre—, así que en
 * el historial salía «responsable: 24930c21-… → 3bdfbacb-…»: 72 caracteres que
 * no dicen nada. Esto junta esos UUID y los cambia por el nombre (de perfiles;
 * personas como respaldo, con su alias). */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function nombresDeEventos(supabase: any, eventos: any[]): Promise<Map<string, string>> {
  const ids = new Set<string>();
  const mira = (v: any) => { const s = String(v ?? "").trim(); if (RE_UUID.test(s)) ids.add(s); };
  (eventos || []).forEach((e: any) => {
    mira(e?.detalle?.de); mira(e?.detalle?.a);
    (e?.detalle?.cambios || []).forEach((c: any) => { mira(c?.de); mira(c?.a); });
  });
  const m = new Map<string, string>();
  const lista = [...ids];
  // perfiles y personas tienen id-spaces distintos: un UUID cae en una u otra,
  // no en las dos. Se consultan ambas y gana la que lo tenga (personas, con alias).
  for (let i = 0; i < lista.length; i += 100) {
    const chunk = lista.slice(i, i + 100);
    const [perf, pers] = await Promise.all([
      supabase.from("perfiles").select("id,nombre").in("id", chunk),
      supabase.from("personas").select("id,nombre,alias").in("id", chunk),
    ]);
    (perf.data || []).forEach((r: any) => { if (r.nombre) m.set(r.id, r.nombre); });
    (pers.data || []).forEach((r: any) => m.set(r.id, r.alias || r.nombre));
  }
  return m;
}

/** Reescribe los valores de/a (y los de `cambios`) que sean un UUID por su
 *  nombre resuelto; deja intacto lo demás. Devuelve eventos nuevos (no muta). */
export function conNombresEventos<T extends { detalle?: any }>(eventos: T[], nombres: Map<string, string>): T[] {
  if (!nombres.size) return eventos;
  const tr = (v: any) => nombres.get(String(v ?? "").trim()) || v;
  return (eventos || []).map(e => {
    if (!e?.detalle) return e;
    const d: any = { ...e.detalle };
    if ("de" in d) d.de = tr(d.de);
    if ("a" in d) d.a = tr(d.a);
    if (Array.isArray(d.cambios)) d.cambios = d.cambios.map((c: any) => ({ ...c, de: tr(c.de), a: tr(c.a) }));
    return { ...e, detalle: d };
  });
}
