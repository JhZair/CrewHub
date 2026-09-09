"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/* ══════════════════════════════════════════════════════════════════════════
   📍 DÓNDE SE GUARDA CADA COSA — las acciones

   El modelo y su porqué están en db/sitios.sql; la regla que resuelve la
   cadena, en lib/sitios.ts. Aquí solo lo que ESCRIBE.

   ── UNA SOLA ACCIÓN PARA GUARDAR, Y NO TRES ──
   `guardarEn` recibe un destino y ya: un sitio, un equipo contenedor, o nada.
   Con tres acciones —`ponerEnSitio`, `meterEnEquipo`, `sacarDeTodo`— la regla
   de «solo uno de los dos punteros» habría vivido tres veces, y la cuarta
   pantalla que llamara a la primera sin limpiar la segunda dejaría una fila
   con las dos cosas puestas. Aquí el destino manda y lo otro se pone a null en
   el mismo `update`.

   ⚠ El `check` de la base es la última palabra, no esta función. Si algo de
   aquí se olvida de limpiar el otro puntero, Postgres rechaza el update entero
   y sale un error — que es infinitamente mejor que una fila que dice que la
   cámara se guarda en dos sitios.
   ══════════════════════════════════════════════════════════════════════════ */

const revalidar = () => {
  revalidatePath("/equipamiento");
  revalidatePath("/equipamiento/entrega");
  revalidatePath("/equipamiento/combos");
  revalidatePath("/equipamiento/asignados");
  revalidatePath("/equipamiento/ensamblados");
  revalidatePath("/equipamiento/sitios");
};

/* Traduce los dos errores de Postgres que este módulo puede provocar de
   verdad. Solo esos: rotular CUALQUIER «does not exist» como «falta correr la
   migración» convierte un problema real —una FK rota, un enum que cambió— en
   una instrucción que no arregla nada.
   · `relation "sitios" does not exist`  → la migración no está corrida
   · `duplicate key … idx_sitio_nombre*` → ya hay un sitio así en ese nivel. Es
     alcanzable al renombrar, al borrar un padre (sus hijos suben a la raíz y
     pueden chocar) y al sacar uno a la raíz. */
const traducir = (msg: string) => {
  if (/relation "?sitios"?.*does not exist|'sitios'.*schema cache|PGRST20/i.test(msg)) {
    return "Falta correr db/sitios.sql en Supabase.";
  }
  if (/duplicate key|idx_sitio_nombre/i.test(msg)) {
    return "Ya hay un sitio con ese nombre en ese mismo nivel. Ponle otro nombre, o muévelo dentro de otro sitio.";
  }
  return msg;
};

/* ══════════════════════ LOS SITIOS ══════════════════════ */

/** Crear un sitio, o devolver el que ya existe con ese nombre.
 *  Devuelve el existente en vez de fallar, como `crearLugar`: quien escribe
 *  «Cajón 07» en el selector quiere ESE cajón, y un error de clave duplicada
 *  le pediría adivinar que ya estaba. */
export async function crearSitio(nombre: string, dentroDe?: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const limpio = String(nombre || "").trim();
  if (!limpio) return { error: "Escribe un nombre para el sitio." };

  /* El duplicado se busca DENTRO DEL MISMO PADRE, igual que el índice único de
     la base: «Cajón 07» del Depósito y «Cajón 07» de la oficina son dos. */
  /* ⚠ `%` y `_` ESCAPADOS. `ilike` los trata como comodines, así que un sitio
     llamado «Estante_A» o «Cajón 100%» buscaba cualquier cosa: podía casar con
     dos filas, `maybeSingle` devolvía error, el error se ignoraba y se caía al
     insert — que revienta contra el índice único con el mensaje crudo. */
  const patron = limpio.replace(/[\\%_]/g, c => `\\${c}`);
  let q = supabase.from("sitios").select("id,nombre,dentro_de").ilike("nombre", patron);
  q = dentroDe ? q.eq("dentro_de", dentroDe) : q.is("dentro_de", null);
  const { data: ex, error: eBusca } = await q.maybeSingle();
  if (eBusca) return { error: traducir(eBusca.message) };
  if (ex) return { id: ex.id, nombre: ex.nombre, yaEstaba: true };

  const { data, error } = await supabase.from("sitios")
    .insert({ nombre: limpio, dentro_de: dentroDe || null, creado_por: user.id })
    .select("id,nombre").single();
  if (error) return { error: traducir(error.message) };
  revalidar();
  return { id: data.id, nombre: data.nombre };
}

export async function renombrarSitio(id: string, nombre: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const limpio = String(nombre || "").trim();
  if (!limpio) return { error: "El nombre no puede quedar vacío." };
  const { error } = await supabase.from("sitios").update({ nombre: limpio }).eq("id", id);
  if (error) return { error: traducir(error.message) };
  revalidar();
  return { ok: true };
}

/** Mover un sitio dentro de otro (o sacarlo a la raíz).
 *  ⚠ Sube la cadena antes de escribir: sin esto, meter el Depósito dentro del
 *  Cajón 07 —que está en el Depósito— deja un bucle que la base no puede ver
 *  (su check solo mira que no se meta en sí mismo) y que cuelga cualquier
 *  recorrido. `lib/sitios` lo corta al leer, pero cortar un bucle es enseñar
 *  «no se sabe» a quien sí lo sabía hace un segundo. */
export async function moverSitio(id: string, dentroDe: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (dentroDe === id) return { error: "Un sitio no puede estar dentro de sí mismo." };

  let cursor: string | null = dentroDe;
  const vistos = new Set<string>();
  while (cursor) {
    if (cursor === id) {
      return { error: "Eso lo dejaría dentro de sí mismo: ese sitio ya está dentro de este." };
    }
    if (vistos.has(cursor)) break;      // ya había un bucle: no lo empeoramos
    vistos.add(cursor);
    const { data: p }: any = await supabase.from("sitios")
      .select("dentro_de").eq("id", cursor).maybeSingle();
    cursor = p?.dentro_de || null;
  }

  const { error } = await supabase.from("sitios")
    .update({ dentro_de: dentroDe || null }).eq("id", id);
  if (error) return { error: traducir(error.message) };
  revalidar();
  return { ok: true };
}

/** Borrar un sitio. Nada de lo que había dentro se borra, pero no a todos les
 *  pasa lo mismo, y por eso son tres cifras y no una:
 *    · los EQUIPOS y los KITS que colgaban de él se quedan SIN SITIO
 *    · los SITIOS hijos NO se quedan sin sitio: suben a la raíz, que es lo que
 *      hace el `on delete set null` de `dentro_de`
 *  Se cuentan antes y se devuelven para poder decirlo; que desaparezcan de la
 *  vista por sitio sin una palabra es lo que hace que nadie confíe en ella.
 *  ⚠ Los equipos que colgaban de un cajón HIJO no pierden nada: siguen en su
 *  cajón, que ahora está en la raíz. Por eso `equipos` cuenta solo los
 *  directos, y es correcto. */
export async function borrarSitio(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const [{ count: nEq }, { count: nKits }, { count: nHijos }] = await Promise.all([
    supabase.from("equipamiento").select("id", { count: "exact", head: true }).eq("guardado_sitio", id),
    supabase.from("kits").select("id", { count: "exact", head: true }).eq("guardado_sitio", id),
    supabase.from("sitios").select("id", { count: "exact", head: true }).eq("dentro_de", id),
  ]);

  const { error } = await supabase.from("sitios").delete().eq("id", id);
  if (error) return { error: traducir(error.message) };
  revalidar();
  return { ok: true, equipos: nEq || 0, kits: nKits || 0, sitios: nHijos || 0 };
}

/* ══════════════════════ DÓNDE VA CADA COSA ══════════════════════ */

export type Destino =
  | { sitio: string }
  | { equipo: string }
  | null;      // «ya no sé dónde va» — que es un dato, no un olvido

/** Dónde se guarda un equipo o un kit. Una sola puerta para los dos.
 *  `que` decide la tabla; el resto de la regla es idéntico y por eso no son
 *  dos funciones que se copiarían la una a la otra. */
export async function guardarEn(
  que: "equipo" | "kit", ids: string[], destino: Destino,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const lista = [...new Set((ids || []).filter(Boolean))];
  if (!lista.length) return { error: "Falta qué guardar." };
  const tabla = que === "kit" ? "kits" : "equipamiento";

  const contenedor = destino && "equipo" in destino ? destino.equipo : null;

  /* Solo para equipos: un kit no puede estar dentro de sí mismo porque no es
     un equipo, así que el recorrido sería N viajes a la base que no pueden
     devolver nada. */
  if (contenedor && que === "equipo") {
    /* Nada se guarda dentro de sí mismo, ni dentro de algo que ya lleva
       dentro. La base solo puede impedir lo primero —el check de una fila—;
       la cadena hay que recorrerla, igual que en `ensamblar`. */
    if (lista.includes(contenedor)) {
      return { error: "Una cosa no se puede guardar dentro de sí misma." };
    }
    /* ⚠ Sube por LOS DOS punteros. Subía solo por `guardado_en_equipo`, y así
       un bucle MIXTO se colaba por debajo de las dos guardas: `ensamblar(B,[A])`
       pasa porque su recorrido solo mira `ensamblado_en`, y luego
       `guardarEn(B, dentro de A)` pasa porque el de aquí solo miraba
       `guardado_en_equipo` —que en A es null, porque A está atornillado—. Los
       dos equipos quedaban en «⟲ la cadena da vueltas» para siempre.
       `lib/sitios` resuelve subiendo por cualquiera de los dos; la guarda tiene
       que preguntar lo mismo que la lectura. */
    let cursor: string | null = contenedor;
    const vistos = new Set<string>();
    while (cursor && !vistos.has(cursor)) {
      vistos.add(cursor);
      if (lista.includes(cursor)) {
        return { error: "Eso lo dejaría guardado dentro de sí mismo: el contenedor ya va dentro de una de esas cosas." };
      }
      const { data: p }: any = await supabase.from("equipamiento")
        .select("guardado_en_equipo,ensamblado_en").eq("id", cursor).maybeSingle();
      cursor = p?.guardado_en_equipo || p?.ensamblado_en || null;
    }
  }

  /* ⚠ Una pieza ATORNILLADA no puede tener sitio propio: lo hereda de su
     anfitrión, y el check de la base rechaza el update entero si se intenta.
     Se comprueba aquí para poder decir CUÁLES y por qué, en vez de dejar salir
     el mensaje crudo de Postgres sobre una restricción que nadie conoce. */
  if (que === "equipo" && destino) {
    const { data: montadas } = await supabase.from("equipamiento")
      .select("folio,nombre").in("id", lista).not("ensamblado_en", "is", null);
    if (montadas?.length) {
      const cuales = montadas.map((e: any) => `${e.folio || ""} ${e.nombre}`.trim()).join(", ");
      return { error: `Están atornilladas dentro de otro equipo, así que se guardan donde él: ${cuales}. Desmóntalas primero, o cambia el sitio del equipo que las lleva.` };
    }
  }

  /* Los dos punteros SIEMPRE en el mismo update, uno con valor y el otro a
     null. Escribir solo el que cambia dejaría los dos puestos y el check
     rechazaría la fila — con razón. */
  const campos = {
    guardado_sitio: destino && "sitio" in destino ? destino.sitio : null,
    guardado_en_equipo: contenedor,
  };
  const { data, error } = await supabase.from(tabla)
    .update(campos).in("id", lista).select("id");
  if (error) return { error: traducir(error.message) };
  if (!data?.length) return { error: "No se guardó: no tienes permiso, o esas cosas ya no están." };

  /* En la bitácora de CADA cosa movida y no en una sola línea global: «dónde
     se guarda» es un dato de la ficha, y quien la abra dentro de un año
     querrá ver cuándo cambió. */
  const donde = destino
    ? await (async () => {
      if ("sitio" in destino) {
        const { data: s } = await supabase.from("sitios").select("nombre").eq("id", destino.sitio).maybeSingle();
        return s?.nombre || "otro sitio";
      }
      const { data: e } = await supabase.from("equipamiento").select("nombre").eq("id", destino.equipo).maybeSingle();
      return e?.nombre || "otro equipo";
    })()
    : null;

  /* ⚠ Solo para EQUIPOS. Un kit no tiene ficha —`rutaEntidad` devuelve `null`
     para «kit»— así que una fila de actividad suya sería un renglón en el muro
     que no lleva a ninguna parte, y nadie la leería jamás en una bitácora que
     no existe. Escribir un rastro que ningún sitio pinta es ruido con coste. */
  if (que === "equipo") {
    await supabase.from("actividad").insert(data.map((r: any) => ({
      entidad_tipo: "equipamiento",
      entidad_id: r.id, actor_id: user.id, tipo: "edicion",
      detalle: { mensaje: donde ? `guardado en «${donde}»` : "se quedó sin sitio anotado" },
    })));
  }

  if (que === "equipo") lista.forEach(id => revalidatePath(`/entidad/equipamiento/${id}`));
  revalidar();
  return { ok: true, guardados: data.length };
}
