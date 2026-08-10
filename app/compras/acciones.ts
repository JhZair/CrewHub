"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { siguientesFolios } from "@/lib/compras";

/* EL COMBO DE COMPRA — crear, y dar de alta sus unidades de golpe.
 *
 * Registrar diez Claw Mini V-Rig a mano son diez fichas abiertas, y lo que
 * pasa de verdad es que se registran dos y las otras ocho viven en el
 * estante sin existir en ninguna parte. Cuando una se malogra no hay dónde
 * anotarlo, y el inventario dice que hay dos.
 *
 * El alta en lote crea N unidades reales —cada una con su folio, su ficha,
 * su bitácora y su historial— de una sola vez. No son «una fila con
 * cantidad 10»: son diez cosas físicas, y la que se rompió tiene que poder
 * decirlo sola.
 */

const revalidar = (compraId?: string) => {
  /* Los combos viven dentro de /equipamiento: no hay listado propio que
     revalidar. Lo tuvo media hora y sobraba —nadie piensa «voy a compras»,
     piensa «¿de dónde salió esta radio?», y eso se pregunta desde los
     equipos—. */
  revalidatePath("/equipamiento");
  if (compraId) revalidatePath(`/entidad/compra/${compraId}`);
};

async function sesion() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Siguiente código de compra: C-001, C-002… Del máximo que exista, no del
 *  número de filas: con una compra borrada, contar filas repetiría un
 *  código que ya se usó y `codigo` es único. */
async function proximoCodigo(supabase: any) {
  const { data } = await supabase.from("compras").select("codigo")
    .not("codigo", "is", null).order("codigo", { ascending: false }).limit(1);
  const n = parseInt(String(data?.[0]?.codigo || "").replace(/\D+/g, ""), 10) || 0;
  return `C-${String(n + 1).padStart(3, "0")}`;
}

export async function crearCompra(datos: {
  nombre: string; proveedor?: string; fecha?: string; total?: string;
  moneda?: string; link?: string; nota?: string;
}) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const nombre = (datos.nombre || "").trim();
  if (!nombre) return { error: "El combo necesita un nombre — «Combo DJI Action 5 Pro»." };

  const t = Number(String(datos.total ?? "").replace(",", "."));
  const { data, error } = await supabase.from("compras").insert({
    codigo: await proximoCodigo(supabase),
    nombre,
    proveedor: (datos.proveedor || "").trim() || null,
    fecha: (datos.fecha || "").trim() || null,
    total: String(datos.total ?? "").trim() === "" ? null : (Number.isFinite(t) && t >= 0 ? t : null),
    moneda: datos.moneda === "USD" ? "USD" : "PEN",
    link: (datos.link || "").trim() || null,
    nota: (datos.nota || "").trim() || null,
    creado_por: user.id,
  }).select("id,codigo,nombre").single();
  if (error) return { error: error.message };

  await supabase.from("actividad").insert({
    entidad_tipo: "compra", entidad_id: data.id, actor_id: user.id, tipo: "creacion",
    detalle: { mensaje: `registró el combo «${data.nombre}»` },
  });
  revalidar(data.id);
  return { id: data.id, codigo: data.codigo };
}

/* ══════════ ALTA EN LOTE ══════════ */

const TOPE_LOTE = 50;   // más de cincuenta de una vez no es un combo, es un error de tecleo

/** Crea N unidades iguales dentro de un combo, con folios correlativos.
 *
 *  Los folios se calculan aquí y no en el navegador: dos personas dando de
 *  alta a la vez desde dos pestañas leerían el mismo último folio y la
 *  segunda tanda chocaría contra el índice único. Si aun así choca, se
 *  dice cuántas entraron —callar el número dejaría a alguien creyendo que
 *  tiene diez cuando tiene seis—.
 */
export async function altaEnLote(compraId: string | null, datos: {
  nombre: string; cantidad: number; categoria?: string; subcategoria?: string;
  valorUnitario?: string; link?: string; descripcion?: string;
}) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const nombre = (datos.nombre || "").trim();
  if (!nombre) return { error: "Falta el nombre del equipo." };
  const n = Math.floor(Number(datos.cantidad));
  if (!(n >= 1)) return { error: "¿Cuántas unidades?" };
  if (n > TOPE_LOTE) return { error: `De una vez, como mucho ${TOPE_LOTE}. ¿Seguro que son ${n}?` };

  /* Se leen TODOS los folios para sacar el máximo de verdad. Ordenar por
     `folio` y quedarse con el primero no vale: es orden alfabético, y ahí
     «A-99» va después de «A-208».
     El tope es explícito y se comprueba. PostgREST corta las respuestas por
     su cuenta —y sin `order` las filas que devuelve son arbitrarias—, así
     que una lectura truncada daría un máximo menor al real, folios ya
     usados, y el insert entero reventando contra el índice único: cero
     unidades creadas y un mensaje de base de datos que no explica nada.
     Antes de eso, se dice. */
  const TOPE_FOLIOS = 5000;
  const { data: folios, error: e0 } = await supabase.from("equipamiento")
    .select("folio").not("folio", "is", null).order("id").limit(TOPE_FOLIOS);
  if (e0) return { error: e0.message };
  if ((folios || []).length >= TOPE_FOLIOS)
    return { error: `Hay más de ${TOPE_FOLIOS} equipos: el folio siguiente no se puede calcular sin arriesgarse a repetir uno. Hay que pasar el correlativo a una secuencia de la base.` };
  const nuevos = siguientesFolios((folios || []).map((f: any) => f.folio), n);

  const v = Number(String(datos.valorUnitario ?? "").replace(",", "."));
  const filas = nuevos.map(folio => ({
    folio, nombre,
    categoria: (datos.categoria || "").trim() || null,
    subcategoria: (datos.subcategoria || "").trim() || null,
    estado: "disponible",
    /* Sin precio unitario se queda NULL, no en cero. Cero significaría
       «no vale nada» y entraría en el inventario como tal; nulo significa
       «no lo sé», y entonces manda el total del combo. */
    valor_compra: String(datos.valorUnitario ?? "").trim() === "" ? null
      : (Number.isFinite(v) && v >= 0 ? v : null),
    link: (datos.link || "").trim() || null,
    descripcion: (datos.descripcion || "").trim() || null,
    compra_id: compraId || null,
  }));

  const { data, error } = await supabase.from("equipamiento").insert(filas).select("id,folio");
  if (error) {
    /* Dos altas a la vez leen el mismo último folio y la segunda choca. No
       se puede evitar sin una secuencia en la base, pero sí se puede decir
       qué pasó: «duplicate key» no le dice a nadie que vuelva a intentarlo. */
    const choque = /duplicate key|unique constraint/i.test(error.message);
    return { error: choque
      ? `Esos folios (${nuevos[0]}–${nuevos[nuevos.length - 1]}) ya existen: alguien dio de alta al mismo tiempo. Vuelve a intentarlo — se recalculan solos.`
      : `No se dieron de alta: ${error.message}` };
  }

  if (compraId) {
    await supabase.from("actividad").insert({
      entidad_tipo: "compra", entidad_id: compraId, actor_id: user.id, tipo: "edicion",
      detalle: { mensaje: `dio de alta ${data.length} unidad(es) de «${nombre}» (${data[0]?.folio}–${data[data.length - 1]?.folio})` },
    });
  }
  revalidar(compraId || undefined);
  return { creadas: data.length, desde: data[0]?.folio, hasta: data[data.length - 1]?.folio };
}

/** Meter equipos que ya existen dentro de un combo (o sacarlos). Sirve para
 *  las compras viejas: el inventario ya está cargado y lo que falta es
 *  decir qué vino junto. */
export async function asignarACompra(equipoIds: string[], compraId: string | null) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const ids = [...new Set((equipoIds || []).filter(Boolean))];
  if (!ids.length) return { error: "No hay equipos seleccionados." };

  const { data, error } = await supabase.from("equipamiento")
    .update({ compra_id: compraId || null }).in("id", ids).select("id");
  if (error) return { error: error.message };

  if (compraId) {
    await supabase.from("actividad").insert({
      entidad_tipo: "compra", entidad_id: compraId, actor_id: user.id, tipo: "edicion",
      detalle: { mensaje: `sumó ${data.length} equipo(s) al combo` },
    });
  }
  ids.forEach(id => revalidatePath(`/entidad/equipamiento/${id}`));
  revalidar(compraId || undefined);
  return { movidos: data.length };
}

/** Borrar el registro de una compra NO borra sus equipos: la FK es
 *  `set null` y las unidades siguen en el inventario, sin procedencia. Se
 *  dice cuántas se quedaron sueltas, o nadie las buscaría. */
export async function borrarCompra(id: string) {
  const { supabase, user } = await sesion();
  if (!user) return { error: "Sesión no encontrada." };
  const { count } = await supabase.from("equipamiento")
    .select("id", { count: "exact", head: true }).eq("compra_id", id);
  const { error } = await supabase.from("compras").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidar();
  return { sueltos: count || 0 };
}
