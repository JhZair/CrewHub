import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { aplicarPlantilla } from "@/lib/puertas";

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
export type Plat = { url: string | null; plantilla: string | null; puertas: Puerta[] };

/* Cada plataforma con su puerta principal y sus entradas adicionales. La
 * credencial guarda el nombre de su plataforma en texto, así que la llave es
 * ese nombre normalizado —igual que hace el admin para contar usos—.
 *
 * Devuelve un Map vacío si la tabla no está: una ficha de empresa no puede
 * caerse porque nadie corrió el SQL todavía.
 */
export const platPorNombre = cache(async (): Promise<Map<string, Plat>> => {
  const m = new Map<string, Plat>();
  try {
    const supabase = createClient();
    const { data } = await supabase.from("plataformas")
      .select("nombre,url,plantilla_url,puertas:plataforma_puertas(id,titulo,url,notas,orden)");
    (data || []).forEach((p: any) => {
      m.set(String(p.nombre || "").trim().toLowerCase(), {
        url: p.url || null,
        plantilla: p.plantilla_url || null,
        puertas: [...(p.puertas || [])].sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0)),
      });
    });
  } catch {}
  return m;
});

/* El link de una credencial se RESUELVE al leer; no se copia al guardar.
 *
 * Antes `credenciales.url` guardaba una copia del link de su plataforma, y
 * eso era el mismo dato en dos sitios divergiendo en silencio: el backfill
 * copió cuando SUNAT-ClaveSOL aún no tenía link y nunca volvió a mirar, así
 * que la plataforma sabía y la credencial decía «sin link». Peor: al editar
 * una plataforma solo se rellenaban las credenciales con url nula — cambiar
 * el link de DAFO habría dejado a las cinco que ya heredaron con el viejo,
 * para siempre.
 *
 * Ahora `credenciales.url` significa una sola cosa: la EXCEPCIÓN. Si está,
 * esta credencial entra por otra puerta. Si no, la de su plataforma. Sin
 * copias, sin propagación, sin nada que se pueda quedar atrás.
 */
export async function conPlataforma<T extends {
  plataforma?: string | null; url?: string | null; identificador?: string | null;
}>(creds: T[]) {
  const m = await platPorNombre();
  return creds.map(c => {
    const p = m.get(String(c.plataforma || "").trim().toLowerCase());
    /* Armada con el identificador de ESTA credencial: seis correos, seis
       puertas distintas, ninguna guardada. Ver lib/puertas.ts. */
    const calculada = aplicarPlantilla(p?.plantilla, c.identificador);
    return {
      ...c,
      /* El orden manda y no es casual:
         1. la propia    — alguien dijo expresamente que esta entra por otro lado
         2. la calculada — la plataforma sabe armarla con el usuario
         3. la general   — la puerta de todos
         Lo dicho gana a lo deducido, y lo deducido a lo genérico. */
      url: c.url || calculada || p?.url || null,
      /* El crudo, aparte. El formulario de edición tiene que cargar ESTE:
         si cargara el resuelto, abrir y guardar una credencial sin tocarla
         le grabaría el link de la plataforma como excepción propia — y la
         copia que acabo de matar volvería por la puerta de atrás, una
         credencial a la vez, cada vez que alguien edita. */
      urlPropia: c.url || "",
      calculada: !c.url && !!calculada,  // el link salió de su propio correo
      heredado: !c.url && !calculada && !!p?.url,
      puertas: p?.puertas || [],
    };
  });
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
