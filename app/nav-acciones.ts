/* ⚠ ESTE FICHERO YA NO ES `"use server"`, y es a propósito.
   Lo era porque `NavIconos` —un componente de cliente— llamaba a `estadoNav()`
   directamente. Ya no: el menú pide su parte al zócalo compartido
   (lib/zocalo.ts), y el único que llama aquí es `estadoGlobal()` en
   app/actions.ts, que corre en el servidor.
   Importar una acción de servidor DESDE otra acción de servidor funciona, pero
   es un patrón que no existía en este repositorio y que depende de cómo Next
   decida envolver los exports. Un módulo normal no depende de nada de eso: es
   una función que se llama. Menos magia en el camino más transitado.
   `NavIconos` sigue usando el TIPO, con `import type`, que se borra al
   compilar y no arrastra `next/headers` al navegador. */
import { DIAS_AVISO } from "@/lib/obligaciones";
import { resumenFaltantes } from "@/lib/estadosCuenta";

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
  /** Fondos en ejecución a los que les falta algún estado de cuenta, y cuántos
   *  meses faltan en total. Dos números porque contestan preguntas distintas:
   *  uno dice a cuántas fichas hay que entrar, el otro cuánto papel hay que
   *  pedirle al banco. La burbuja enseña el primero —es lo que la lista de
   *  /fondos deja contar— y el segundo va en su título. */
  fondosEc: number;
  mesesEc: number;
};

const VACIO: EstadoNav = {
  casilla: 0, caja: false, vencidos: 0, porVencer: 0, fondosEc: 0, mesesEc: 0,
};

/* Recibe el cliente y el usuario YA resueltos. Antes verificaba la sesión por
   su cuenta, y al pasar a correr en paralelo con las otras tres del zócalo eso
   se volvía una carrera por rotar el mismo refresh token. Como este fichero ya
   no es `"use server"`, un parámetro aquí no es una puerta abierta: nadie
   puede llamarlo desde el navegador. */
export async function estadoNav(supabase: any, user: { id: string }): Promise<EstadoNav> {
  try {
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

    /* ── LOS ESTADOS DE CUENTA QUE FALTAN ──
       Esto NO se puede contar con un `count`: lo que falta no está en ninguna
       tabla. Se cuenta contra el calendario que exige el acta (5.2.3), o sea
       comparando los meses cargados con los que deberían estar. Por eso viajan
       filas y no números.

       ── UN VIAJE, NO DOS ──
       La primera versión pedía los fondos y DESPUÉS sus estados, cuando ya
       sabía los ids. Eso son dos idas y vueltas encadenadas en cada navegación
       de las diecinueve pantallas, y encima esta rama es la que hace esperar al
       zócalo entero. Con la relación embebida (`estado_cuenta(periodo)`) es una
       sola consulta y entra en la misma tanda que las demás.
       De paso desaparece el techo de mil: el corte de PostgREST se aplica a las
       filas de PRIMER nivel —los fondos, que son nueve—, no a lo embebido. Con
       dos consultas, un corte en `estado_cuenta` habría hecho pasar por «no
       cargado» todo lo que quedara fuera. */
    const [perfil, sinLeer, venc, porV, fondos] = await Promise.all([
      supabase.from("perfiles").select("es_admin,es_finanzas")
        .eq("id", user.id).maybeSingle(),
      supabase.from("dafo_comunicaciones")
        .select("id", { count: "exact", head: true }).is("leido_en", null),
      periodos().lt("vence", hoy),
      periodos().gte("vence", hoy).lte("vence", tope),
      supabase.from("postulaciones")
        .select("id,fecha_desembolso,fecha_rendicion_real,estado_cuenta(periodo)")
        .eq("estado", "ganadora")
        .is("fecha_rendicion_real", null)      // rendido = la serie terminó
        .not("fecha_desembolso", "is", null),  // sin desembolso no hay serie
    ]);

    const caja = !!((perfil.data as any)?.es_admin || (perfil.data as any)?.es_finanzas);

    /* ── SI LA CONSULTA FALLÓ, CERO — NO EL MÁXIMO ──
       supabase-js no lanza: devuelve `{data:null,error}`. Sin esta guarda, un
       timeout o una migración que falte dejaban el mapa vacío, y un mapa vacío
       se lee como «nadie ha cargado un solo estado de cuenta»: la alarma más
       alta posible, justo cuando el sistema no sabe nada.

       ── Y SOLO A QUIEN PUEDE CARGARLOS ──
       Los estados de cuenta los sube administración. Un rojo permanente en el
       menú, en las diecinueve pantallas, sobre papeles que uno no puede subir,
       es ruido que además enseña a ignorar los rojos de verdad. */
    let ec = { fondos: 0, meses: 0 };
    if (caja && !fondos.error) {
      const vivos = (fondos.data || []) as any[];
      const porFondo = new Map<string, string[]>();
      for (const f of vivos) {
        porFondo.set(f.id, ((f.estado_cuenta || []) as any[]).map(e => e.periodo));
      }
      ec = resumenFaltantes(vivos, porFondo, hoy);
    }

    return {
      casilla: sinLeer.count || 0,
      caja,
      /* Si falta una migración, `count` viene en null y la burbuja no se
         pinta. Es lo correcto: una burbuja en cero no es un cero, es «no lo
         sé», y un 0 rojo mandaría a buscar algo que no está. */
      vencidos: venc.count || 0,
      porVencer: porV.count || 0,
      fondosEc: ec.fondos,
      mesesEc: ec.meses,
    };
  } catch {
    return VACIO;
  }
}
