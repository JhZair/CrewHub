import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/* Las puertas del sistema, pedidas por su clave.
 *
 * `clave` es el nombre con el que el código pide una plataforma: pide
 * `sunat_consulta_ruc`, no «SUNAT — Consulta RUC». Si mañana alguien la
 * renombra en el admin, el código sigue encontrándola. Eso es justo lo que
 * rompió al bot: alguien renombró «Qhaway» → «Bot Qhaway» y la función se
 * quedó buscando el nombre viejo, firmando los casos como si fueran de John.
 *
 * `cache` de React lo resuelve una vez por render: seis fichas de empresa en
 * una lista piden el mismo link y sale una sola consulta.
 *
 * Devuelve `undefined` si falta —tabla vacía, plataforma borrada, SQL sin
 * correr— y quien lo use decide su respaldo. Nunca revienta la página por un
 * link: una lista de empresas no puede caerse porque nadie llenó el admin.
 */
export const urlPlataforma = cache(async (clave: string): Promise<string | undefined> => {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("plataformas").select("url").eq("clave", clave).maybeSingle();
    return data?.url || undefined;
  } catch {
    return undefined;
  }
});

export type Puerta = { id: string; titulo: string; url: string; notas: string | null; orden: number | null };

/* Las entradas adicionales de cada plataforma, listas para colgarlas de una
 * credencial. La credencial guarda el nombre de la plataforma en texto, así
 * que la llave es ese nombre normalizado —igual que hace el admin para
 * contar usos—.
 *
 * Devuelve un Map vacío si la tabla no está: una ficha de empresa no puede
 * caerse porque nadie corrió el SQL todavía.
 */
export const puertasPorPlataforma = cache(async (): Promise<Map<string, Puerta[]>> => {
  const m = new Map<string, Puerta[]>();
  try {
    const supabase = createClient();
    const { data } = await supabase.from("plataformas")
      .select("nombre,puertas:plataforma_puertas(id,titulo,url,notas,orden)");
    (data || []).forEach((p: any) => {
      const ps = [...(p.puertas || [])].sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0));
      if (ps.length) m.set(String(p.nombre || "").trim().toLowerCase(), ps);
    });
  } catch {}
  return m;
});

/* Cuelga las puertas de cada credencial, por el nombre de su plataforma. */
export async function conPuertas<T extends { plataforma?: string | null }>(creds: T[]) {
  const m = await puertasPorPlataforma();
  return creds.map(c => ({
    ...c, puertas: m.get(String(c.plataforma || "").trim().toLowerCase()) || [],
  }));
}

/* Claves que el código conoce. Escritas aquí y no sueltas en cada página:
   un `eq("clave", "sunat_ruc")` mal tecleado no falla, solo devuelve nada
   —y eso se ve como «la SUNAT dejó de abrir», no como un error.

   OJO: este archivo es solo de servidor (lee cookies por lib/supabase/server).
   Un componente con "use client" no puede importarlo, ni siquiera para sacar
   PLAT: rompe el build. Si algún día hace falta del lado del cliente, PLAT se
   muda a su propio archivo sin el import de supabase. */
export const PLAT = {
  sunatConsultaRuc: "sunat_consulta_ruc",
  sunatSol: "sunat_sol",
  dafo: "dafo",
} as const;
