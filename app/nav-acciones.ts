"use server";
import { createClient } from "@/lib/supabase/server";
import { DIAS_AVISO } from "@/lib/obligaciones";

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE EL MENÚ NECESITA SABER — EN UN SOLO VIAJE

   El menú de secciones vive dentro de <Volver>, o sea en las diecinueve
   pantallas, y es de cliente. Necesita tres datos que solo sabe el servidor:
   si quien mira lleva las finanzas, cuántos correos de DAFO quedan sin leer y
   cuántas declaraciones están pendientes.

   ── POR QUÉ UNA FUNCIÓN Y NO TRES ──
   Nació como tres llamadas sueltas, lanzadas «en paralelo» con tres promesas.
   No corrían en paralelo: Next encola las acciones de servidor y las manda de
   una en una, así que eran TRES viajes de ida y vuelta seguidos. Y cada uno
   arrastraba lo suyo: el middleware valida la sesión contra el servidor de
   auth de Supabase en cada petición, y la acción volvía a validarla por su
   cuenta. Seis llamadas de red antes de tocar un dato — en cada navegación,
   en las diecinueve pantallas.

   Esto es lo que hizo que el sistema se notara «cada vez más lento»: las tres
   llamadas no llegaron juntas, se fueron sumando a medida que el menú aprendía
   a contar cosas. Cada una parecía barata por separado.

   Ahora es UNA acción: una comprobación de sesión y tres consultas que sí
   corren de verdad en paralelo dentro del mismo servidor, donde la base está
   a un salto y no a un océano.

   ── NUNCA LANZA ──
   Es el menú de todo el sistema. Si algo falla —una migración sin correr, la
   red— devuelve ceros y la navegación se dibuja igual. Un indicador que tumba
   el menú no es un indicador, es una trampa.
   ══════════════════════════════════════════════════════════════════════════ */

const hoyLima = () =>
  new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

export type EstadoNav = {
  /** Correos de DAFO sin leer. */
  casilla: number;
  /** Si esta persona puede entrar a la caja (administración o finanzas). */
  caja: boolean;
  /** Declaraciones vencidas y por vencer. Separadas: una es una multa
   *  corriendo y la otra una tarea de esta semana. */
  vencidos: number;
  porVencer: number;
};

const VACIO: EstadoNav = { casilla: 0, caja: false, vencidos: 0, porVencer: 0 };

export async function estadoNav(): Promise<EstadoNav> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return VACIO;

    const hoy = hoyLima();
    const tope = new Date(Date.parse(hoy) + DIAS_AVISO * 86400000)
      .toISOString().slice(0, 10);

    /* Los tres `count` van sin filas (`head: true`): solo viaja el número.
       Y aquí sí es paralelo de verdad — son consultas a la base desde el
       servidor, no acciones que Next tenga que encolar. */
    /* Las mismas dos condiciones que /obligaciones, y por la misma razón: una
       obligación APAGADA no se vigila, y una que no cuelga de una empresa no
       tiene pantalla donde mirarla. Si la burbuja cuenta algo que la lista no
       pinta, el número no se puede cuadrar y deja de creerse. */
    const periodos = () => supabase.from("obligacion_periodo")
      .select("id,obligacion!inner(activa,entidad_tipo)", { count: "exact", head: true })
      .is("declarado_en", null)
      .not("vence", "is", null)
      .eq("obligacion.activa", true)
      .eq("obligacion.entidad_tipo", "empresa");

    const [perfil, sinLeer, venc, porV] = await Promise.all([
      supabase.from("perfiles").select("es_admin,es_finanzas")
        .eq("id", user.id).maybeSingle(),
      supabase.from("dafo_comunicaciones")
        .select("id", { count: "exact", head: true }).is("leido_en", null),
      periodos().lt("vence", hoy),
      periodos().gte("vence", hoy).lte("vence", tope),
    ]);

    return {
      casilla: sinLeer.count || 0,
      caja: !!((perfil.data as any)?.es_admin || (perfil.data as any)?.es_finanzas),
      /* Si falta una migración, `count` viene en null y la burbuja no se
         pinta. Es lo correcto: una burbuja en cero no es un cero, es «no lo
         sé», y un 0 rojo mandaría a buscar algo que no está. */
      vencidos: venc.count || 0,
      porVencer: porV.count || 0,
    };
  } catch {
    return VACIO;
  }
}
