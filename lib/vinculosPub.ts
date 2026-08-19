/* ── DE QUÉ HABLA UN CASO ──
 *
 * Un caso no flota: cuelga de un proyecto, de una empresa, de una persona, de
 * un equipo, de una postulación, de un lugar. Eso vive en
 * `publicacion_vinculos` y es —casi siempre— la mitad del dato. «Lista de
 * nombres en los créditos» no dice de qué película; «Coordinar traslado» no
 * dice de qué rodaje.
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE ──
 * Esta resolución ya estaba escrita, dentro de `conVinculos` en app/actions.ts,
 * para pintar los chips de la campanita. La búsqueda global no la tenía, así
 * que enseñaba títulos huérfanos; y copiarla habría hecho dos mapas de
 * tipo→tabla→campo, que es exactamente como empezaron a divergir los estados,
 * las reglas de SUNAT y los 90 días de la vigencia.
 *
 * El mapa tampoco se escribe aquí: sale de `SECCIONES`, que ya declara para
 * cada entidad su tabla, cómo se llama y su nombre corto. Solo se añaden
 * lugares y etiquetas, que son vinculables y no tienen sección propia.
 */

import { SECCIONES, ICO_ENT } from "./secciones";

export type VincPub = {
  tipo: string; id: string; ico: string;
  /* `null` cuando el vínculo EXISTE pero no se pudo nombrar: la entidad se
     borró, o es de un tipo que la base vincula y este mapa aún no conoce.
     Se devuelve igual y no se pinta, porque hay quien necesita el vínculo sin
     el nombre —de qué muro es una nota se decide por el primero, tenga nombre
     o no— y quien solo quiere el chip. Tirarlo aquí obligaba a la segunda
     consulta que este archivo existe para evitar. */
  nombre: string | null;
};

/* tipo → [tabla, campo, campo corto]. Los dos de abajo no salen de SECCIONES
   porque no son secciones: no tienen listado ni ficha, pero sí se vinculan. */
const DONDE: Record<string, [string, string, string?]> = {
  ...Object.fromEntries(SECCIONES.map(s => [s.tipo, [s.tabla, s.campo, s.corto]])),
  lugar: ["lugares", "nombre"],
  etiqueta: ["etiquetas", "nombre"],
};

/* Los vínculos de un puñado de publicaciones. Una consulta por TIPO de entidad
   presente —nunca una por caso—, y ninguna para los tipos que no aparecen. */
export async function vinculosDePublicaciones(
  supabase: any, ids: string[],
): Promise<Map<string, VincPub[]>> {
  const salida = new Map<string, VincPub[]>();
  if (!ids.length) return salida;

  const { data: vincs } = await supabase.from("publicacion_vinculos")
    .select("publicacion_id,entidad_tipo,entidad_id").in("publicacion_id", ids);
  if (!vincs?.length) return salida;

  const porTipo = new Map<string, Set<string>>();
  vincs.forEach((v: any) => {
    if (!porTipo.has(v.entidad_tipo)) porTipo.set(v.entidad_tipo, new Set());
    porTipo.get(v.entidad_tipo)!.add(v.entidad_id);
  });

  const nombres = new Map<string, string>();
  await Promise.all([...porTipo.entries()].map(async ([tipo, idset]) => {
    const d = DONDE[tipo];
    if (!d) return;   // un tipo que la base conoce y este mapa no: se omite, no se inventa
    const [tabla, campo, corto] = d;
    /* El nombre CORTO cuando existe. Un chip no es una ficha: «Chaccu» dice lo
       mismo que «Chaccu: Entre Lana y Tradición en Pomacanchi» en la décima
       parte del ancho, y en una fila con cuatro vínculos ese ancho decide si
       se ven los cuatro o uno. `corto` está declarado en SECCIONES justo para
       esto y hasta hoy no lo usaba nadie. */
    const cols = ["id", campo, ...(corto ? [corto] : [])].join(",");
    const { data } = await supabase.from(tabla).select(cols).in("id", [...idset]);
    (data || []).forEach((r: any) =>
      nombres.set(`${tipo}:${r.id}`, (corto ? r[corto] : null) || r[campo]));
  }));

  vincs.forEach((v: any) => {
    const l = salida.get(v.publicacion_id) || [];
    l.push({
      tipo: v.entidad_tipo, id: v.entidad_id,
      nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`) || null,
      ico: ICO_ENT[v.entidad_tipo] || "🔗",
    });
    salida.set(v.publicacion_id, l);
  });
  return salida;
}

/* Los que se pueden ENSEÑAR. Un chip sin nombre es un ícono suelto que no
   dice nada; el filtro va aquí y no en cada pantalla para que la próxima no
   se olvide de ponerlo. */
export const conNombre = (l: VincPub[] | undefined) =>
  (l || []).filter(v => v.nombre) as (VincPub & { nombre: string })[];
