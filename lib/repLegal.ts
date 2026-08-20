/* ── QUIÉN FIRMA POR UNA EMPRESA ──
 *
 * El representante legal no es una columna: se deduce de `empresa_miembros`
 * mirando el cargo. Y esa deducción estaba escrita DOS veces —en la búsqueda
 * global y en la ficha de entidad— con la misma tabla de prioridad copiada a
 * mano. Al ir a necesitarla por tercera vez (obligaciones) tocaba escribirla
 * otra vez o traerla aquí.
 *
 * ── LA PRIORIDAD, Y POR QUÉ NO ES ALFABÉTICA ──
 *   0 · «representante legal» — el cargo exacto. Si está, manda.
 *   1 · presidente / titular / gerente — quien lo es de hecho cuando nadie
 *       escribió el cargo formal. En una asociación cultural el acta dice
 *       «presidente» y ante SUNAT firma esa misma persona.
 *   9 · cualquier otro cargo: NO es representante y no se propone. Elegir al
 *       primer miembro que aparezca sería inventar un firmante, y este dato se
 *       usa para papeles que se presentan.
 *
 * Solo miembros ACTIVOS: quien salió de la asociación dejó de firmar por ella
 * el día que salió, y su nombre en un expediente es una observación.
 */

export type RepLegal = {
  personaId?: string | null;
  nombre: string;
  alias?: string | null;
  foto?: string | null;
  cargo?: string | null;
};

export const prioridadRL = (c?: string | null) =>
  /representante/i.test(String(c ?? "")) ? 0
  : /presidente|titular|gerente/i.test(String(c ?? "")) ? 1
  : 9;

/** Elige el representante de una lista de miembros ya cargada. Sin consulta:
 *  las pantallas que ya traen los miembros no deben pedirlos otra vez. */
export function elegirRL(miembros: any[]): any | null {
  return (miembros || [])
    .filter(m => prioridadRL(m?.cargo) < 9)
    .sort((a, b) => prioridadRL(a?.cargo) - prioridadRL(b?.cargo))[0] || null;
}

/** El representante de varias empresas, en UNA consulta. */
export async function repLegalDeEmpresas(
  supabase: any, ids: string[],
): Promise<Map<string, RepLegal>> {
  const salida = new Map<string, RepLegal>();
  const limpios = [...new Set((ids || []).filter(Boolean))];
  if (!limpios.length) return salida;

  const { data, error } = await supabase.from("empresa_miembros")
    .select("empresa_id,cargo,persona:personas(id,nombre,alias,foto_url)")
    .in("empresa_id", limpios).eq("estado", "activo");
  /* Sin representante no se cae nada: la pantalla enseña la empresa sin él.
     Un fallo aquí no puede tumbar una lista de obligaciones. */
  if (error || !data) return salida;

  const porEmp = new Map<string, any[]>();
  data.forEach((m: any) => porEmp.set(m.empresa_id, [...(porEmp.get(m.empresa_id) || []), m]));
  porEmp.forEach((ms, eid) => {
    const r = elegirRL(ms);
    const per = r?.persona ? (Array.isArray(r.persona) ? r.persona[0] : r.persona) : null;
    if (per) salida.set(eid, {
      personaId: per.id, nombre: per.nombre, alias: per.alias,
      foto: per.foto_url, cargo: r.cargo,
    });
  });
  return salida;
}
