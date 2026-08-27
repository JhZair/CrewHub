import { createClient, usuarioActual } from "@/lib/supabase/server";
import Realtime from "@/components/Realtime";
import Campanita from "@/components/Campanita";
import BuscadorGlobal from "@/components/BuscadorGlobal";
import NavIconos from "@/components/NavIconos";
import FranjaAlarmas from "@/components/FranjaAlarmas";
import MenuUsuario from "@/components/MenuUsuario";
import Avatar from "@/components/Avatar";
import Foto from "@/components/Foto";
import LinkPreviews from "@/components/LinkPreviews";
import NotaSocial from "@/components/NotaSocial";
import EventoHistorial, { ROTULO_ENT } from "@/components/EventoHistorial";
import EventoGrupo from "@/components/EventoGrupo";
import { agruparEventos } from "@/lib/agrupar";
import { nombrarEventos, nombresDe, porDias } from "@/lib/eventos";
import { ICO_ENT, rutaEntidad, grafiasDe, tipoCanonico } from "@/lib/secciones";
import { rotuloDia } from "@/lib/periodo";
import { plazoDe } from "@/lib/plazo";
import { rotuloTipo, colorTipo, icoTipo, llevaHora } from "@/lib/tipos";
import { urlsDe } from "@/lib/drive";
import { fechaDia } from "@/lib/fechas";
import { ESTADOS_VIVOS, actividadFueraDeAgenda, fueraDeAgenda,
  ESTADO_ICO, ESTADO_TXT, ESTADO_COL } from "@/lib/estados";
import { loDeHoy, enLosProximos, ventana, cuandoCae, soloDia, diaMas, hayQueDecirEstado, apagadoHoy, pesoVinculo, TOPE_GRUPOS, DIAS_RODAJE, ETIQUETA_RODAJE } from "@/lib/portadaHoy";
import { sinBot, BOT } from "@/lib/personas";
import {
  COLS_NOTIF, COLS_NUEVAS, faltaAlguna, columnasQueFaltan, sinEstas,
} from "@/lib/notificaciones";
import Link from "@/components/Enlace";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "⬡ CrewHub+" };

/* ══════════════════════════════════════════════════════════════════════════
   LA PORTADA — QUÉ PASÓ MIENTRAS NO ESTABAS

   Antes era un feed de CASOS: seis pestañas, un compositor arriba y la lista
   de lo que a uno le toca. Todo eso se mudó al tablero, que lo hace mejor —
   por columnas, con arrastre y filtros propios— y desde que el tablero está en
   el menú, la portada era la misma información peor contada. Dos pantallas que
   cuentan lo mismo no son dos pantallas: son una y su copia desactualizada.

   Lo que ninguna pantalla contaba es lo que hizo el RESTO del equipo. Katy
   subió los comprobantes de PO-001, Wilfredo enlazó una empresa, el bot dejó
   su ronda: eso vivía solo en /historial, que es una pantalla a la que se
   entra cuando ya se sospecha algo. Un rastro al que hay que ir a buscar no
   entera a nadie.

   ── LO QUE SE QUEDA ARRIBA, Y POR QUÉ EN ESE ORDEN ──
   1. La alarma (si la hay), que es lo único que puede parar el día.
   2. El bot, con lo que vence hoy.
   3. «Lo que corre»: lo que administración clavó a mano. Vacío casi siempre.
   4. Tu trabajo en dos números, con la puerta al tablero. Dos números NO son
      la lista: quien quiera la lista entra, y el que solo pasaba no la paga.
   5. Lo último del sistema.

   ── EL COMPOSITOR NO ESTÁ, Y NO SE PERDIÓ NADA ──
   Ocupaba el primer tercio de la pantalla más abierta del sistema para una
   acción que ya tiene su botón ＋ flotante en TODAS las pantallas
   (app/layout.tsx). Una puerta que está en todos lados no necesita además un
   vestíbulo en la entrada.
   ══════════════════════════════════════════════════════════════════════════ */

/* Cuántos eventos trae la portada. Decenas, no miles: esto es «lo último», y
   para el rastro completo está /historial con sus periodos y su «ver más».
   ⚠ Con `order` explícito SIEMPRE. `actividad` pasó de diez mil filas y el
   corte de PostgREST (Max rows = 1000) devuelve filas ARBITRARIAS cuando no se
   ordena — el mismo fallo que ya se pagó dos veces en /pulso y en /buscar. */
const CUANTOS = 60;

/* ── LOS CHIPS DE «SOBRE QUÉ» SON FIJOS, Y NO LLEVAN NÚMERO ──
   La tentación era contar cuántos eventos hay de cada tipo. Pero contar de
   verdad obliga a traerse el periodo entero —diez mil filas en la pantalla que
   más se abre— y contar sobre los 60 traídos da el tamaño de la muestra
   disfrazado de dato: fue literalmente el fallo de /historial («Michel · 21»
   significaba «21 de los últimos 500»).
   Sin número no se miente. Los que hoy no tienen nada dicen que no tienen nada
   al pulsarlos, que es una respuesta honesta y de un solo clic. */
const SOBRE_QUE = ["publicacion", "postulacion", "proyecto", "empresa", "persona", "objeto", "equipamiento"];

/** Un uuid, para no mandar a la base lo que venga escrito en la barra. */
const ES_UUID = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export default async function Portada({ searchParams }: {
  searchParams: { t?: string; a?: string };
}) {
  /* ── LO QUE VIENE DE LA URL SE COMPRUEBA ──
     `?a=hola` acababa en `eq("actor_id","hola")`, PostgREST devolvía un 400 por
     uuid inválido y la pantalla decía «nada con estos filtros»: un error de
     tipo disfrazado de respuesta vacía. Y `?t=loquesea` dejaba la portada
     filtrada por algo que ningún chip marcaba, o sea sin forma de volver.
     Lo que no se reconoce, no filtra. */
  const filtroEnt = SOBRE_QUE.includes(searchParams?.t || "") ? searchParams!.t! : "";
  const filtroActor = (() => {
    const a = searchParams?.a || "";
    return a === "bot" || ES_UUID(a) ? a : "";
  })();
  const supabase = createClient();
  // Compartido con `QuienEstaGlobal` del layout: una verificación, no dos.
  const user = await usuarioActual();
  if (!user) redirect("/login");

  const hoyISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }); // YYYY-MM-DD
  /* La medianoche de HOY EN CUSCO, no la del servidor. Estaba con
     `setHours(0,0,0,0)` sobre la hora de la máquina —UTC en producción—, así
     que «hoy dejé N apuntes» empezaba a contar a las 19:00 del día anterior. */
  const hoy = new Date(`${hoyISO}T00:00:00-05:00`);
  const en60ISO = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const desde30 = new Date(Date.now() - 30 * 86400000).toISOString();
  /* El día de hoy en Lima, UNO para toda la página. `hoyISO` ya existía tres
     líneas más arriba y calcularlo otra vez era pedirle la hora al reloj dos
     veces: en una carga a las 23:59:59, la consulta podría preguntar por el 27
     y el filtro por el 28, y la lista saldría vacía sin que nada fallara. */
  const hoyDeLima = hoyISO;

  // Recientes de cada tipo por separado (12 y 12), no 20 mezcladas: así la
  // pestaña "Del Bot" del desplegable tiene contenido aunque lo último sea
  // personal. Desempate por id (varias del mismo lote comparten creado_en).
  const NCAMP = 12;
  /* En función para poder repetirla sin `dafo_id` cuando esa columna todavía no
     existe: PostgREST rechaza la consulta entera, no la columna (ver
     lib/notificaciones.ts → COL_DAFO). */
  const tandaNotif = (cols: string, esBot: boolean) => {
    const q = supabase.from("notificaciones").select(cols).eq("usuario_id", user.id);
    return (esBot ? q.is("actor_nombre", null) : q.not("actor_nombre", "is", null))
      .order("creado_en", { ascending: false }).order("id", { ascending: false }).limit(NCAMP);
  };

  /* Mis casos por estado, con la MISMA regla que la burbuja del menú
     (app/nav-acciones.ts → misCasos): un aviso o una reunión no están «sin
     resolver» porque no se resuelven. Si esto contara distinto, la portada y
     el menú dirían dos números para lo mismo en la misma pantalla. */
  const misCasos = () => supabase.from("publicaciones")
    .select("id", { count: "exact", head: true })
    .eq("responsable", user.id)
    .is("archivado_en", null)
    .not("tipo", "in", "(aviso,bitacora,reunion)");

  /* ══ TANDA 1 ══ TODO lo que solo necesita `user.id` y la fecha, a la vez.
     Nada de esto depende de nada de esto: la portada vieja lo pedía en quince
     esperas encadenadas y tardaba siete segundos en cerrar el documento. Se
     recogen en grupos solo para poder leerlos. */
  const pMio = Promise.all([
    supabase.auth.getSession(),
    supabase.from("perfiles")
      .select("nombre,color,rol,avatar_url,es_admin,es_finanzas").eq("id", user.id).single(),
    /* Mi ficha de persona: la necesita el enlace «Mi perfil» del menú. */
    supabase.from("personas").select("id").eq("usuario_id", user.id).maybeSingle(),
    misCasos().eq("estado", "abierta"),
    misCasos().eq("estado", "en_progreso"),
  ]);
  // — la campanita —
  const pCampana = Promise.all([
    tandaNotif(COLS_NOTIF, false),
    tandaNotif(COLS_NOTIF, true),
    // Timbre = solo lo personal sin leer (lo que pide tu acción).
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false).not("actor_nombre", "is", null),
    // Contador propio de las automáticas del Bot sin leer.
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false).is("actor_nombre", null),
    supabase.from("actividad").select("id", { count: "exact", head: true })
      .eq("tipo", "bot").gte("creado_en", hoy.toISOString()),
  ]);
  // — los hallazgos del Bot: seis conteos que solo dependen de la fecha —
  const pQhaway = Promise.all([
    supabase.from("publicaciones").select("id", { count: "exact", head: true })
      .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"])
      .is("archivado_en", null)   // un aviso archivado con fecha vencida NO es un vencido
      .not("fecha_limite", "is", null).lt("fecha_limite", hoyISO),
    supabase.from("publicaciones").select("id", { count: "exact", head: true })
      .in("estado", ["abierta", "en_progreso", "seguimiento", "en_pausa"])
      .is("archivado_en", null).is("responsable", null),
    supabase.from("empresas").select("id", { count: "exact", head: true })
      .eq("estado", "activa").not("estado_sunat", "is", null).neq("estado_sunat", "activo"),
    supabase.from("personas").select("id", { count: "exact", head: true })
      .not("dni_vencimiento", "is", null).lte("dni_vencimiento", en60ISO),
    supabase.from("personas").select("nombre,alias,fecha_nacimiento")
      .in("tipo", ["personal", "colaborador"]).not("fecha_nacimiento", "is", null),
    supabase.from("postulaciones")
      .select("estado, proy:proyectos(nombre), conv:convocatorias(anio)")
      .in("estado", ["en_preparacion", "enviada", "en_subsanacion", "finalista", "ganadora"]),
  ]);
  // — la portada propiamente dicha: lo clavado y lo último —
  const pFeed = Promise.all([
    /* Lo que corre: SOLO lo que administración clavó a mano, y caduca solo.
       `vinculos` para poder decir de qué proyecto habla: un caso clavado en la
       cabecera es justo el que menos puede depender de que el título esté bien
       redactado. */
    supabase.from("publicaciones")
      .select(`id,tipo,titulo,estado,fecha_limite,destacado_hasta,
        resp:perfiles!publicaciones_responsable_fkey(nombre),
        vinculos:publicacion_vinculos(entidad_tipo, entidad_id)`)
      .in("estado", ["abierta", "en_progreso", "seguimiento"])
      .neq("tipo", "bitacora")   // las notas del muro solo viven en su proyecto
      .is("archivado_en", null)
      .gt("destacado_hasta", new Date().toISOString())
      .order("fecha_limite", { ascending: true, nullsFirst: false })
      .limit(5),
    /* ── LO ÚLTIMO ──
       Los filtros van a la BASE y no a la lista traída: filtrando en memoria,
       elegir a Wilfredo enseñaba «lo suyo dentro de los últimos 60 del
       equipo», que casi siempre son tres líneas y parece que no trabaja. Es
       exactamente el fallo que /historial ya corrigió. */
    (() => {
      let q = supabase.from("actividad")
        .select("tipo,detalle,creado_en,entidad_tipo,entidad_id,actor_id,actor:perfiles(nombre)");
      /* Las DOS grafías: el trigger escribe el nombre de la tabla («proyectos»)
         y el código a mano escribe el singular. Preguntando por una sola, la
         mitad del rastro desaparece sin ningún error. */
      if (filtroEnt) q = q.in("entidad_tipo", grafiasDe(filtroEnt));
      if (filtroActor) q = filtroActor === "bot" ? q.is("actor_id", null) : q.eq("actor_id", filtroActor);
      return q.order("creado_en", { ascending: false }).order("id", { ascending: false })
        .limit(CUANTOS);
    })(),
    // El equipo, para los avatares del filtro «quién».
    supabase.from("perfiles").select("id,nombre,avatar_url,color")
      .eq("activo", true).order("nombre"),
    /* ── EL MURO, JUNTO ──
       Las notas de bitácora son lo único que el equipo escribe en prosa, y
       viven cada una encerrada en el muro de SU proyecto, empresa o persona.
       O sea: para enterarte de lo que se contó esta semana había que entrar a
       ocho fichas y abrir ocho pestañas. Nadie hace eso, así que las notas se
       escribían para nadie.
       Aquí se ven todas y en orden, con el muro de donde salen. Se leen; se
       responde en su sitio, que es donde está la conversación. */
    supabase.from("publicaciones")
      .select(`id,cuerpo,imagenes,creado_en,
        autor:perfiles!publicaciones_autor_id_fkey(nombre,color,avatar_url),
        vinculos:publicacion_vinculos(entidad_tipo, entidad_id)`)
      .eq("tipo", "bitacora")
      /* Archivadas fuera. En su ficha siguen saliendo —allí el muro es la
         memoria del proyecto—; aquí no, porque esto es «lo que se está
         contando», no el archivo. */
      .is("archivado_en", null)
      /* ── UNA VENTANA, NO SOLO UN TOPE ──
         Sin ella, un mes sin escribir dejaba «🧱 El muro» clavado encima de lo
         último con notas de hace medio año: una sección permanente que
         cuenta cosas viejas es peor que no tenerla. Si nadie escribió, no hay
         muro, y eso también dice algo. */
      .gte("creado_en", desde30)
      .order("creado_en", { ascending: false }).order("id", { ascending: false })
      /* Nueve. Con seis, un día movido del equipo llenaba la tira entero y lo
         escrito el día anterior ya no se veía; la ventana de 30 días es la que
         evita que esto crezca sin fin, no el tope. */
      .limit(9),
  ]);

  /* ── LO DE HOY Y LOS RODAJES QUE VIENEN ──
     Van en su propia tanda, dentro del mismo `Promise.all` de abajo: son
     independientes de todo lo demás y encadenarlas habría añadido un viaje
     entero a la portada, que es justo lo que costó siete segundos y se fue a
     quitar. */
  const vent = ventana(DIAS_RODAJE, hoyDeLima);
  const pHoy = Promise.all([
    /* Los casos cuyo plazo cae hoy. Mismos filtros que /agenda —vivos, con
       fecha, sin archivar, sin bitácoras—: si esta lista y la agenda no
       dijeran lo mismo, una de las dos estaría mintiendo y no habría forma de
       saber cuál. */
    supabase.from("publicaciones")
      .select("id,titulo,tipo,estado,fecha_inicio,fecha_limite,hora,responsable," +
        "vinculos:publicacion_vinculos(entidad_tipo, entidad_id)")
      .in("estado", ESTADOS_VIVOS)
      .is("archivado_en", null)
      .neq("tipo", "bitacora")
      /* Con fecha límite, como en /agenda: un caso sin plazo no está en el
         calendario de ningún día. */
      .not("fecha_limite", "is", null)
      /* ── UNA VENTANA ANCHA, Y EL DÍA SE AFINA EN MEMORIA ──
         Hubo dos intentos de acotarlo con precisión en la base y los dos
         escondieron filas: `.lte("fecha_inicio", hoy)` descartaba las que
         tienen `fecha_inicio` nulo —NULL no es «menor o igual» que nada, o sea
         casi todas—, y el `.or()` con `and()` anidado dependía de que la
         combinación de filtros de PostgREST hiciera exactamente lo que uno
         cree. Un caso que no sale no da error: se lee como «hoy no hay nada».
         Ahora se pide una ventana ancha —lo que vence en los tres meses de
         alrededor— y el día lo decide `loDeHoy`, que es la MISMA función que
         usa el resto. Son unas decenas de filas y el filtro está donde se
         puede leer y probar. */
      .gte("fecha_limite", diaMas(hoyDeLima, -45))
      .lte("fecha_limite", diaMas(hoyDeLima, 45))
      .order("fecha_limite")
      .limit(500),
    /* Las actividades de cronograma que caen hoy. `pub` viaja para respetar el
       archivado del caso: ver `actividadFueraDeAgenda`. */
    supabase.from("cronograma_actividades")
      .select("id,nombre,fecha_inicio,fecha_fin,etapa,estado,publicacion_id,responsable,equipo," +
        "proy:proyectos(id,nombre,nombre_corto)," +
        "conv:convocatorias(id,codigo,nombre)," +
        "postu:postulaciones(id,codigo,estado,proy:proyectos(nombre,nombre_corto))," +
        "pub:publicaciones!publicacion_id(estado,archivado_en)")
      .neq("estado", "cancelada")
      /* Igual que los casos: ventana ancha y el día se afina con `loDeHoy`.
         Una actividad siempre tiene `fecha_inicio`, pero puede durar semanas,
         así que la ventana se abre por delante lo suficiente para que una que
         empezó hace mes y medio y sigue corriendo no se pierda. */
      .gte("fecha_inicio", diaMas(hoyDeLima, -120))
      .lte("fecha_inicio", hoyDeLima)
      .order("fecha_inicio")
      .limit(500),
    /* Los rodajes de los próximos 30 días, por la etiqueta. Una sola llamada:
       sin ella serían tres viajes encadenados —resolver la etiqueta, sus
       vínculos, y los casos—. Ver db/portada-hoy.sql. */
    supabase.rpc("casos_de_etiqueta", {
      p_nombre: ETIQUETA_RODAJE, p_desde: vent.desde, p_hasta: vent.hasta, p_tope: 40,
    }),
    /* Y si existe la etiqueta, que NO es lo mismo que si hay rodajes: sin esta
       pregunta, una etiqueta renombrada dejaría el bloque vacío pareciendo que
       nadie rueda nada. */
    supabase.rpc("existe_etiqueta", { p_nombre: ETIQUETA_RODAJE }),
  ]);

  const [
    [{ data: { session } }, { data: perfil }, { data: yo },
      { count: casosMios }, { count: casosCurso }],
    [{ data: notifPersRaw, error: ePers }, { data: notifBotRaw, error: eBot },
      { count: sinLeer }, { count: sinLeerBot }, { count: botHoy }],
    [{ count: cVencidos }, { count: cSinResp }, { count: cSunat }, { count: cDni },
      { data: nacim }, { data: postAnio }],
    [destQ, actQ, equipoQ, muroQ],
    [casosHoyQ, actsHoyQ, rodajesQ, hayEtqQ],
  ] = await Promise.all([pMio, pCampana, pQhaway, pFeed, pHoy]);

  const miPersonaId: string | null = yo?.id || null;
  const equipo = sinBot(equipoQ.data);

  /* ── SEGUNDO INTENTO, QUITANDO SOLO LO QUE FALTE ──
     Si a la base le falta una columna de otra migración, PostgREST rechaza la
     consulta ENTERA y la campanita se queda vacía con el timbre marcando tres.
     Una pantalla que ya funcionaba no puede caerse porque alguien no corrió un
     SQL de otro módulo (ver lib/notificaciones.ts → `sinEstas`). */
  let notifPers: any = notifPersRaw, notifBot: any = notifBotRaw;
  {
    let err: any = ePers || eBot;
    let quitadas: string[] = [];
    for (let i = 0; i < COLS_NUEVAS.length && faltaAlguna(err); i++) {
      const nuevas = columnasQueFaltan(err).filter(c => !quitadas.includes(c));
      if (!nuevas.length) break;
      quitadas = [...quitadas, ...nuevas];
      const cols = sinEstas(COLS_NOTIF, quitadas);
      const [a, b] = await Promise.all([tandaNotif(cols, false), tandaNotif(cols, true)]);
      notifPers = a.data; notifBot = b.data;
      err = a.error || b.error;
    }
  }
  const notifs = [...(notifPers || []), ...(notifBot || [])];

  /* ══ TANDA 2 ══ ponerle nombre a lo que llegó. Las tres necesitan los ids de
     la tanda 1 y ninguna necesita a las otras: salen juntas.
     Los vínculos de los destacados y los de las notificaciones se resuelven
     con la MISMA función que nombra los eventos (lib/eventos → nombresDe):
     antes cada bloque lo hacía a su manera y el mismo material salía con
     nombre en un sitio y sin él en el otro. */
  const idsNotif = [...new Set(notifs.map((n: any) => n.publicacion_id).filter(Boolean))];
  const idsNotas = ((muroQ.data || []) as any[]).map((n: any) => n.id);
  const [nombrados, nombresVinc, vincNotifQ, rxNotas, comsNotas] = await Promise.all([
    /* Sin `conActores`: eso trae la tabla `perfiles` entera para poder nombrar
       a quien no salga en la página, y aquí las caras del filtro ya vienen de
       `equipoQ`. Lo necesita /historial, que pinta un chip por persona. */
    nombrarEventos(supabase, actQ.data, { conActores: false }),
    /* Los destacados y las notas del muro, en la MISMA consulta por tabla: son
       vínculos de la misma clase y separarlos era pagar dos veces por nombrar
       el mismo proyecto. */
    /* Los casos de hoy se suman a esta misma llamada: son vínculos de la misma
       clase, y pedirlos aparte sería un viaje más para nombrar proyectos que
       probablemente ya están en la lista. */
    nombresDe(supabase, [...(destQ.data || []), ...(muroQ.data || []), ...(casosHoyQ.data || [])]
      .flatMap((p: any) => (p.vinculos || [])
        .map((v: any) => ({ tipo: v.entidad_tipo, id: v.entidad_id })))),
    idsNotif.length
      ? supabase.from("publicacion_vinculos").select("publicacion_id,entidad_tipo,entidad_id")
        .in("publicacion_id", idsNotif)
      : Promise.resolve({ data: [] as any[] }),
    /* ── EL HILO DE CADA NOTA ──
       Una nota del muro sin sus reacciones ni sus respuestas es media nota: la
       conversación es el muro. Las dos consultas son por LOTE —los ids de las
       nueve notas—, no una por nota.
       ⚠ `comentario_id is null`: una reacción a un comentario no es una
       reacción a la nota. Es el mismo filtro que usa la ficha; sin él, el 👍
       que alguien le puso a una respuesta aparecería como puesto a la nota. */
    idsNotas.length
      ? supabase.from("reacciones").select("publicacion_id,emoji,usuario_id")
        .in("publicacion_id", idsNotas).is("comentario_id", null)
      : Promise.resolve({ data: [] as any[] }),
    idsNotas.length
      ? supabase.from("comentarios")
        .select(`id,publicacion_id,cuerpo,imagenes,creado_en,editado_en,autor_id,
          autor:perfiles(nombre,color,avatar_url)`)
        .in("publicacion_id", idsNotas).order("creado_en").order("id")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  /* ── TANDA 3 (solo si hay respuestas) ── las reacciones DE LOS COMENTARIOS.
     No se pueden pedir antes: hacen falta sus ids. Si nadie ha respondido, no
     hay tercera ola. */
  const comentarios = ((comsNotas as any).data || []) as any[];
  const idsComs = comentarios.map((c: any) => c.id);
  const claveDe = (v: any) => `${tipoCanonico(v.entidad_tipo)}:${v.entidad_id}`;
  const vincNotif = ((vincNotifQ as any).data || []) as any[];
  const faltan = vincNotif.filter((v: any) => !nombresVinc.has(claveDe(v)));
  const [rxComsQ, nombresNotif, perfilesTodos] = await Promise.all([
    idsComs.length
      ? supabase.from("reacciones").select("comentario_id,emoji,usuario_id").in("comentario_id", idsComs)
      : Promise.resolve({ data: [] as any[] }),
    /* Los nombres de los vínculos que aún no se resolvieron. Iba en una ola
       propia, detrás de esta: son independientes, así que van juntas. */
    faltan.length
      ? nombresDe(supabase, faltan.map((v: any) => ({ tipo: v.entidad_tipo, id: v.entidad_id })))
      : Promise.resolve(new Map<string, string>()),
    /* TODOS los perfiles, no solo los activos: quien reaccionó y luego se fue
       del equipo es justo el caso donde saber quién fue importa más. Con el
       catálogo de activos, «👍 3» enseñaba dos nombres en su tooltip — el
       número y la lista se contradecían. */
    supabase.from("perfiles").select("id,nombre"),
  ]);
  const { eventos } = nombrados;

  /* Contexto de cada notificación: de qué habla el caso avisado. Los nombres
     salen de lo ya resuelto para los destacados y el muro; lo que faltaba se
     pidió arriba, en la misma ola que las reacciones. */
  const vincDe = new Map<string, { tipo: string; nombre: string }[]>();
  for (const v of vincNotif) {
    const nombre = nombresVinc.get(claveDe(v)) || nombresNotif.get(claveDe(v));
    if (!nombre) continue;
    const l = vincDe.get(v.publicacion_id) || [];
    l.push({ tipo: v.entidad_tipo, nombre });
    vincDe.set(v.publicacion_id, l);
  }
  const notifsEnriq = (notifs || []).map((n: any) => ({
    ...n, vinculos: n.publicacion_id ? (vincDe.get(n.publicacion_id) || []) : [],
  }));

  /* ── Mensaje de Qhaway: hallazgos reales + cumpleaños + frases decorativas,
     elegido al azar (los cumpleaños tienen prioridad). Solo informa. ── */
  const hoyMD = hoyISO.slice(5);
  const cumples: string[] = (nacim || [])
    .filter((p: any) => (p.fecha_nacimiento || "").slice(5) === hoyMD)
    .map((p: any) => `🎂 ¡Hoy cumple años ${p.alias || (p.nombre || "").split(" ")[0]}! Que no falte el saludo, Kawsay 🎉`);

  const hallazgos: string[] = [];
  if (cVencidos) hallazgos.push(`⏰ Hay ${cVencidos} caso${cVencidos === 1 ? "" : "s"} vencido${cVencidos === 1 ? "" : "s"} — un vistazo no cae mal.`);
  if (cSinResp) hallazgos.push(`🙋 ${cSinResp} caso${cSinResp === 1 ? "" : "s"} sin responsable — un caso huérfano es de todos.`);
  if (cSunat) hallazgos.push(`🏢 ${cSunat} empresa${cSunat === 1 ? "" : "s"} con alerta SUNAT — regularizar antes de postular.`);
  if (cDni) hallazgos.push(`🪪 ${cDni} DNI por vencer — renovar a tiempo evita sustos.`);
  if (botHoy) hallazgos.push(`📝 Hoy dejé ${botHoy} apunte${botHoy === 1 ? "" : "s"} en mi ronda.`);

  // 🍀 Buenas vibras a las postulaciones del año en curso
  const anioActual = new Date().getFullYear();
  const vibras: string[] = [];
  for (const p of (postAnio || []) as any[]) {
    if (p.conv?.anio !== anioActual) continue;
    const nom = p.proy?.nombre || "un proyecto";
    if (p.estado === "ganadora") {
      const m = `🏆 ¡${nom} ganó su fondo ${anioActual}! Orgullo Kawsay — a celebrarlo. 🎉`;
      vibras.push(m, m, m); // los ganadores brillan más
    } else if (p.estado === "finalista") {
      const m = `🌟 ${nom} es finalista ${anioActual} — ya casi, un último empujón. 💪`;
      vibras.push(m, m);
    } else {
      vibras.push(`✨ ${nom} va por el fondo ${anioActual} — buenas vibras para esa postulación. 🍀`);
    }
  }

  const DECORATIVAS = [
    "Nada se pierde mientras yo mire. 👁",
    "Lo que mañana importa, hoy se publica.",
    "Vigilo los plazos para que ustedes vigilen el arte.",
    "Mi ronda fue tranquila. Sigan así, Kawsay.",
    "Recuerden: el chat coordina, CrewHub+ recuerda.",
    "Cada vínculo de hoy es una respuesta instantánea en el futuro.",
    "Menos tarjetas abiertas, más calma — cerrar también es avanzar.",
    "Lo que no se registra, se discute dos veces.",
  ];

  const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)];
  const fraseQhaway: string = cumples.length
    ? pick(cumples)
    : pick([...hallazgos, ...hallazgos, ...vibras, ...DECORATIVAS]);

  const url = (t: string, a: string) =>
    `/${t || a ? "?" : ""}${t ? `t=${t}` : ""}${t && a ? "&" : ""}${a ? `a=${encodeURIComponent(a)}` : ""}`;
  /* ── LAS NOTAS DEL MURO, LISTAS PARA LEER ──
     El muro de cada ficha permite escribir, comentar y reaccionar; aquí solo
     se LEE. No es una limitación técnica: una nota se responde donde está la
     conversación, y un muro de escritura en la portada convertiría cada
     comentario en algo que se dice sin contexto. Se enseña quién, cuándo, de
     qué muro y qué dijo — y el enlace lleva a su sitio. */
  /* Quién reaccionó, con nombre: es lo que convierte «👍 3» en «Katy, Wilfredo
     y tú». Sale del equipo ya cargado (`equipoQ`), sin otra consulta. */
  const nomDe = new Map<string, string>(
    (((perfilesTodos as any).data || []) as any[]).map((p: any) => [p.id, p.nombre]));
  const conNombre = (r: any) => ({ emoji: r.emoji, usuario_id: r.usuario_id, nombre: nomDe.get(r.usuario_id) });

  const rxDeNota = new Map<string, any[]>();
  for (const r of (((rxNotas as any).data || []) as any[])) {
    const l = rxDeNota.get(r.publicacion_id) || [];
    l.push(conNombre(r)); rxDeNota.set(r.publicacion_id, l);
  }
  const rxDeCom = new Map<string, any[]>();
  for (const r of (((rxComsQ as any).data || []) as any[])) {
    const l = rxDeCom.get(r.comentario_id) || [];
    l.push(conNombre(r)); rxDeCom.set(r.comentario_id, l);
  }
  const comsDe = new Map<string, any[]>();
  for (const c of comentarios) {
    const l = comsDe.get(c.publicacion_id) || [];
    // El embebido de PostgREST llega como objeto o como array de uno.
    l.push({ ...c, autor: Array.isArray(c.autor) ? c.autor[0] : c.autor, reacciones: rxDeCom.get(c.id) || [] });
    comsDe.set(c.publicacion_id, l);
  }

  const errHilo: any = (comsNotas as any).error || (rxNotas as any).error || (rxComsQ as any).error;
  /* ══════════════════════════════════════════════════════════════════
     LO DE HOY

     Las dos mitades de la agenda —casos y actividades de cronograma—
     normalizadas a la misma forma y recortadas al día de hoy. Se hace con las
     MISMAS funciones que /agenda (`fueraDeAgenda`, `actividadFueraDeAgenda`,
     `caeEnElDia`) para que las dos pantallas no puedan decir cosas distintas
     sobre el mismo día: cuando eso pasa, no hay forma de saber cuál miente.
     ══════════════════════════════════════════════════════════════════ */
  const hoyCasos = ((casosHoyQ.data || []) as any[])
    /* Un aviso vencido ya no rige; una reunión pasada sí se queda —en un
       calendario el pasado es historial y no deuda—. Misma regla que /agenda. */
    .filter((c: any) => !fueraDeAgenda(c.tipo, c.fecha_limite))
    .map((c: any) => {
      /* ── TODOS LOS VÍNCULOS, NO EL PRIMERO ──
         Se enseñaba uno solo, elegido por prioridad, y en una reunión eso es
         justo lo que no sirve: una reunión existe POR quién y qué convoca —dos
         fondos, tres personas—, y quedarse con el primero convierte «Reunión
         sobre entrega de Fondos · PO-002 · PO-005 · Katy» en «· WilfredoP».
         Se ordenan poniendo delante lo que sitúa el trabajo (fondo, proyecto,
         convocatoria, empresa) y detrás lo demás: si hay que cortar, se corta
         por el final. */
      const vs = (c.vinculos || []) as any[];
      /* Sin vínculos se dice «Casos sueltos» —igual que /agenda— y no se deja
         el hueco: el nombre explica por qué está solo, en vez de sugerir que
         al sistema se le perdió el dato. */
      const grupos = [...vs]
        .sort((a, b) => pesoVinculo(tipoCanonico(a.entidad_tipo))
                      - pesoVinculo(tipoCanonico(b.entidad_tipo)))
        .map((x: any) => nombresVinc.get(`${tipoCanonico(x.entidad_tipo)}:${x.entidad_id}`))
        .filter(Boolean) as string[];
      return {
        id: c.id, kind: "caso" as const, titulo: c.titulo, tipo: c.tipo,
        hora: c.hora || "", href: `/caso/${c.id}`, respId: c.responsable || null,
        estado: c.estado || "", grupos,
        /* ── LA VENTANA DE UN CASO ──
           Empieza cuando empiece y termina el día del plazo. Con una
           excepción, la misma que hace /agenda: lo que LLEVA HORA —una reunión,
           una cita— ocurre en un instante, no en un tramo. El compositor ofrece
           el «empieza» para todos los tipos, así que una reunión con
           `fecha_inicio` puesto habría salido en «Hoy» todos los días del
           tramo, y en la agenda solo el suyo: dos pantallas contando cosas
           distintas del mismo caso. */
        ini: llevaHora(c.tipo) ? c.fecha_limite : (c.fecha_inicio || c.fecha_limite),
        fin: c.fecha_limite || c.fecha_inicio,
      };
    });

  const hoyActs = ((actsHoyQ.data || []) as any[])
    .filter((a: any) => {
      const postu = a.postu as any;
      /* Las propuestas no van a la agenda: el cronograma de una postulación en
         concurso es lo que le PROMETES a DAFO, no trabajo que hacer. */
      if (postu && postu.estado !== "ganadora") return false;
      return !actividadFueraDeAgenda(a);
    })
    .map((a: any) => {
      const proy = a.proy as any, conv = a.conv as any, postu = a.postu as any;
      return {
        id: a.id, kind: "act" as const, titulo: a.nombre, tipo: "",
        publicacion_id: a.publicacion_id || null,
        /* ── QUIÉN LA TIENE ──
           Una actividad de cronograma puede no tener `responsable` y sí
           `equipo`: se reparte entre varios y nadie firma. «Rodaje de planos de
           apoyo» salía sin cara por eso. Se cae al primero del equipo — no es
           «el responsable», pero es alguien a quien preguntar, que es para lo
           que se mira la cara. */
        respId: a.responsable || ((a.equipo as string[]) || [])[0] || null, estado: "",
        hora: "", etapa: a.etapa || "",
        ini: a.fecha_inicio, fin: a.fecha_fin || a.fecha_inicio,
        href: a.publicacion_id ? `/caso/${a.publicacion_id}`
          : proy ? `/entidad/proyecto/${proy.id}`
          : postu ? `/fondo/${postu.id}#audiovisual`
          : conv ? `/entidad/convocatoria/${conv.id}` : "/agenda",
        /* Una actividad cuelga de una sola cosa —su cronograma—, así que su
           lista de grupos tiene un elemento. Misma forma que la del caso para
           que la fila no tenga que preguntar de qué clase es lo que pinta. */
        grupos: [proy ? (proy.nombre_corto || proy.nombre)
          : postu ? [`🎬 ${postu.codigo || "Fondo"}`,
                     (postu.proy as any)?.nombre_corto || (postu.proy as any)?.nombre]
                    .filter(Boolean).join(" · ")
          : conv ? [conv.codigo, conv.nombre].filter(Boolean).join(" · ") : ""].filter(Boolean),
      };
    });

  /* ── UNA COSA, UNA FILA ──
     El bot materializa las actividades del cronograma en casos: la actividad
     se queda con `estado='materializada'` y nace un caso con SU MISMO título y
     sus mismas fechas. En /agenda no se nota —van en carriles distintos, con
     barras y grupos—, pero en una lista plana salían DOS renglones idénticos,
     con el mismo texto y el mismo destino.
     Gana el caso: es donde se comenta, se asigna y se cierra. La actividad
     solo queda cuando nadie la materializó todavía.

     Gana el caso SI el caso está en la lista. La versión anterior quitaba la
     actividad por el mero hecho de tener `publicacion_id`, y eso borraba tres
     filas que /agenda sí enseña: un caso materializado sin `fecha_inicio` solo
     cae el día de su plazo, mientras que la ACTIVIDAD dura toda su ventana. El
     caso no estaba en la lista de hoy, la actividad sí, y la portada se quedó
     sin las dos. Los dos paneles tienen que enseñar lo mismo. */
  const casosDeHoy = loDeHoy(hoyCasos, hoyDeLima);
  const idsDeHoy = new Set(casosDeHoy.map((c: any) => c.id));
  const actsDeHoy = loDeHoy(hoyActs, hoyDeLima)
    .filter((a: any) => !(a.publicacion_id && idsDeHoy.has(a.publicacion_id)));

  /* Juntos y ordenados por hora: lo que tiene hora arriba y en orden —una
     reunión a las 9 antes que una a las 15—, y lo que no la tiene detrás. Un
     día se lee de arriba abajo. */
  const deHoy = [...casosDeHoy, ...actsDeHoy]
    .sort((a: any, b: any) => {
      if (!!a.hora !== !!b.hora) return a.hora ? -1 : 1;
      return String(a.hora).localeCompare(String(b.hora))
        || String(a.titulo).localeCompare(String(b.titulo));
    });

  /* ── LOS RODAJES QUE VIENEN ──
     Ya llegan filtrados y ordenados por la base (`casos_de_etiqueta`). El
     `hay_etiqueta` no se lee de las filas —si no hay filas, no hay ninguna—:
     por eso viaja aparte, y por eso la pantalla puede distinguir «no hay
     rodajes» de «no existe la etiqueta Rodaje». */
  const rodajes = ((rodajesQ.data || []) as any[]).map((r: any) => ({
    id: r.id, titulo: r.titulo, estado: r.estado, respId: r.responsable || null,
    ini: r.fecha_inicio || r.fecha_limite, fin: r.fecha_limite || r.fecha_inicio,
    hora: r.hora || "", grupo: r.grupo || "", href: `/caso/${r.id}`,
  }));
  const hayEtqRodaje = hayEtqQ.data === true;
  /* Quién ve los recados de configuración. Mismo criterio que el resto de la
     pantalla (línea del `esAdmin` de la tira del bot). */
  const esAdminPortada = !!(perfil?.es_admin || (perfil as any)?.es_finanzas);
  /* Las caras del equipo, por id. `equipo` ya viaja para los filtros de «lo
     último»: reusarlo es gratis, y pedir los perfiles otra vez para pintar
     cuatro avatares sería un viaje por nada. */
  const perfilDe = new Map<string, any>((equipo || []).map((p: any) => [p.id, p]));
  /* ── UN DÍA VACÍO NO ES LO MISMO QUE UN DÍA QUE NO SE PUDO LEER ──
     El bloque se esconde cuando no hay nada, así que un error de consulta
     —falta una migración, se cayó la red— haría que la portada AFIRMARA en
     silencio que hoy no hay nada. Es el mismo cuidado que ya tienen la
     campanita y el hilo del muro en esta pantalla. */
  const errHoy = (casosHoyQ as any).error?.message || (actsHoyQ as any).error?.message || null;
  /* ── POR QUÉ NO HAY BLOQUE DE RODAJES ──
     Tres causas distintas que en pantalla se ven igual y se arreglan de forma
     muy distinta: la función no existe (falta la migración), existe pero no
     tengo permiso, o falló otra cosa. Mandar a correr un SQL ya corrido es
     peor que no decir nada, así que se mira el CÓDIGO y no solo si hubo error.
     PGRST202 es «no encuentro esa función»; 42501 es «permiso denegado». */
  const errRpc = ((rodajesQ.error || hayEtqQ.error) || null) as any;
  const causaRpc = !errRpc ? null
    : errRpc.code === "PGRST202" || /could not find the function|does not exist/i.test(errRpc.message || "")
      ? "falta"
    : errRpc.code === "42501" || /permission denied/i.test(errRpc.message || "")
      ? "permiso"
    : "error";

  const notas = ((muroQ.data || []) as any[]).map((n: any) => {
    const uno = (x: any) => (Array.isArray(x) ? x[0] : x);
    /* De qué muro es. Hoy `publicarBitacora` escribe UN solo vínculo, así que
       `vinculos[0]` bastaría; se busca igualmente entre los cuatro tipos que
       tienen muro —proyecto, empresa, persona y postulación— para que el día
       que una nota tenga dos vínculos no se elija una etiqueta como «muro». */
    const CON_MURO = ["proyecto", "empresa", "persona", "postulacion"];
    const v = (n.vinculos || []).find((x: any) =>
      CON_MURO.includes(tipoCanonico(x.entidad_tipo))) || (n.vinculos || [])[0];
    const tipo = v ? tipoCanonico(v.entidad_tipo) : "";
    /* ── LA NOTA, ENTERA ──
       Se recortaba a 240 caracteres y a tres líneas. Pero debajo se enseñan
       todas sus fotos a tamaño real y todo su hilo de respuestas: el texto
       acababa siendo lo ÚNICO de la tarjeta que había que ir a otro sitio a
       leer, y encima con letra más chica que la de sus propios comentarios.
       Una nota de muro es un párrafo, no un documento. */
    const texto = String(n.cuerpo || "").trim();
    return {
      id: n.id,
      autor: uno(n.autor),
      creado_en: n.creado_en,
      fotos: ((n.imagenes || []) as string[]).filter(Boolean),
      enlaces: urlsDe(texto),
      texto,
      reacciones: rxDeNota.get(n.id) || [],
      comentarios: comsDe.get(n.id) || [],
      muro: v && nombresVinc.get(`${tipo}:${v.entidad_id}`)
        ? { tipo, id: v.entidad_id, nombre: nombresVinc.get(`${tipo}:${v.entidad_id}`)! }
        : null,
    };
  });

  /* «hace 2 h», «ayer». En una lista de notas la fecha completa es ruido: lo
     que se pregunta es si es de hoy o de la semana pasada. */
  const haceQue = (iso: string) => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 60) return m <= 1 ? "ahora mismo" : `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    if (d === 1) return "ayer";
    // Pasada la semana, la fecha dice más que la cuenta: «hace 23 días» obliga
    // a hacer la resta mentalmente para saber si fue antes o después de algo.
    return d <= 7 ? `hace ${d} días`
      : new Date(iso).toLocaleDateString("es-PE",
        { day: "numeric", month: "short", timeZone: "America/Lima" });
  };

  const dias = porDias(eventos);
  const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE",
    { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
  const conFiltro = !!(filtroEnt || filtroActor);

  return (
    <div className="shell">
      {/* `actividad` es la tabla que mueve esta pantalla: sin ella en la lista,
          el feed se quedaba quieto mientras el equipo trabajaba al lado.
          `miId` evita que tus propios actos te recarguen la página. */}
      {/* Sin `publicaciones`: crear un caso o una nota, y los cambios de
          estado, etapa, prioridad y responsable, YA escriben su fila en
          `actividad` (triggers de db/schema.sql), así que escuchar las dos
          tablas era refrescar dos veces por el mismo hecho — y el filtro
          anti-eco compara el AUTOR, no el responsable, así que cerrar un caso
          ajeno me disparaba a mí mismo el render entero de la portada.
          Lo que se pierde: editar el texto de una nota o clavar un destacado
          no llegan solos —no dejan evento—, y se ven en la siguiente carga. Un
          render entero de la portada por cada tecleo ajeno costaba más. */}
      <Realtime tablas={["actividad", "notificaciones"]}
        token={session?.access_token} miId={user.id} />
      <div className="topbar">
        <Link href="/" className="logo"><span className="ic">⬡</span><span>CrewHub<sup>+</sup></span></Link>
        {/* ── LA PORTADA MONTA SU PROPIA CABECERA ──
            No usa `<Volver>`, así que la franja de alarmas —que vive dentro de
            él— no llegaba justo a la pantalla que más se abre: la primera de
            la mañana. */}
        <FranjaAlarmas />
        <NavIconos />
        <span className="spacer" />
        <BuscadorGlobal />
        <Campanita items={notifsEnriq} sinLeer={sinLeer || 0} sinLeerBot={sinLeerBot || 0} />
        <MenuUsuario nombre={perfil?.nombre} rol={perfil?.rol}
          color={perfil?.color} src={perfil?.avatar_url}
          /* También finanzas: /admin le enseña SOLO el panel de recibos, pero
             sin este enlace no tiene por dónde llegar. */
          esAdmin={!!(perfil?.es_admin || (perfil as any)?.es_finanzas)}
          personaId={miPersonaId} />
      </div>

      <div className="qhaway-tira">
        <span className="qa">🤖</span>
        <span style={{ flex: 1 }}>
          <b>Bot Qhaway</b>: <i style={{ color: "var(--muted)" }}>{fraseQhaway}</i>
        </span>
        <Link href="/qhaway" title="Ver mi bitácora">bitácora →</Link>
      </div>

      {/* Lo que corre: lo clava administración, y baja solo al caducar.
          Vacío es el estado normal — solo aparece cuando alguien decidió
          que algo no se puede perder. */}
      {(destQ.data || []).length > 0 && (
        <div className="card" style={{ borderColor: "rgba(244,180,0,.35)", background: "rgba(244,180,0,.03)", padding: "8px 14px 10px" }}>
          <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--yellow)", fontWeight: 700, marginBottom: 2 }}>
            📌 Lo que corre
          </div>
          {(destQ.data || []).map((p: any) => {
            const pl = plazoDe(p.fecha_limite, p.estado);
            const chips = (p.vinculos || [])
              .map((v: any) => ({
                tipo: v.entidad_tipo, id: v.entidad_id,
                nombre: nombresVinc.get(`${tipoCanonico(v.entidad_tipo)}:${v.entidad_id}`),
                ico: ICO_ENT[v.entidad_tipo] || "🔗",
              }))
              .filter((v: any) => v.nombre);
            return (
              /* Dos líneas, como el buscador y los listados: arriba qué es y
                 cuándo vence; abajo, de qué habla. Enlace estirado: la fila
                 entera abre el caso, y cada chip abre su entidad. */
              <div key={p.id} className="info-row fila-cap"
                style={{
                  cursor: "pointer", flexDirection: "column", alignItems: "stretch", gap: 0,
                  borderLeft: `3px solid ${colorTipo(p.tipo)}`,
                  paddingLeft: 10, borderRadius: 4,
                }}>
                <Link href={`/caso/${p.id}`} className="fila-cubre" aria-label={p.titulo} />
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="badge" style={{
                    color: colorTipo(p.tipo),
                    background: `${colorTipo(p.tipo)}22`,
                  }}>{rotuloTipo(p.tipo)}</span>
                  <b style={{ fontSize: 13, color: "var(--text)" }}>{p.titulo}</b>
                  <span style={{ flex: 1 }} />
                  {(p.resp as any)?.nombre && (
                    <span className="tv-resp">{(p.resp as any).nombre.split(" ")[0]}</span>
                  )}
                  {pl && (
                    <span style={{ color: pl.color, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {pl.vencido ? `vencido hace ${-pl.d}d`
                        : pl.d === 0 ? "vence hoy" : pl.d === 1 ? "vence mañana" : `en ${pl.d} días`}
                    </span>
                  )}
                </div>
                {chips.length > 0 && (
                  <div className="fila-docs">
                    {chips.map((c: any) => (
                      <Link key={`${c.tipo}:${c.id}`}
                        href={rutaEntidad(c.tipo, c.id) || `/entidad/${c.tipo}/${c.id}`}
                        className="badge fila-encima" title={`${c.tipo} · ${c.nombre}`}
                        style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)",
                          textTransform: "none", letterSpacing: 0, textDecoration: "none" }}>
                        {c.ico} {c.nombre}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TU TRABAJO, EN DOS NÚMEROS ──
          Lo que queda de las seis pestañas de casos. No es la lista y no
          pretende serlo: es el recordatorio de que existe, con la puerta al
          sitio donde se trabaja. Los mismos colores que el menú —violeta, que
          no es rojo— porque esto no es una deuda: es el trabajo.
          Si no hay nada asignado, no se pinta: una tira que dice «0 · 0» es
          una tira que enseña a no mirar esta zona de la pantalla. */}
      {!!((casosMios || 0) + (casosCurso || 0)) && (
        <Link href="/tablero" className="port-mio">
          <span className="port-mio-txt">
            Tienes
            {!!casosMios && <b className="port-n">{casosMios} sin resolver</b>}
            {!!casosMios && !!casosCurso && <span className="port-sep">·</span>}
            {!!casosCurso && <b className="port-n flojo">{casosCurso} en progreso</b>}
          </span>
          <span className="port-mio-ir">tu tablero →</span>
        </Link>
      )}

      {/* ══════════════════════════════════════════════════════════════
          LO DE HOY

          Lo primero después de tus números, y antes del muro: el muro y la
          actividad cuentan lo que YA pasó, y esto es lo que hay que hacer
          ahora. Una portada que abre con el pasado obliga a bajar para
          enterarse del día.
          Si no hay nada hoy, no se pinta: una cabecera «📅 Hoy» sobre un hueco
          vacío enseña a saltarse esa zona de la pantalla.
          ══════════════════════════════════════════════════════════════ */}
      {errHoy && (
        <p className="port-vacio-chico">
          No se pudo leer lo de hoy, así que este bloque puede estar incompleto: {errHoy}
        </p>
      )}
      {deHoy.length > 0 && (
        <section className="port-hoy">
          <div className="port-cab">
            <h2 className="port-tit">📅 Hoy</h2>
            <Link href="/agenda" className="port-cab-ir">la agenda →</Link>
          </div>
          <div className="port-hoy-lista">
            {deHoy.map((it: any) => (
              <Link key={`${it.kind}:${it.id}`} href={it.href}
                /* Apagada, no escondida: sigue estando hoy —hay que saber que
                   existe— pero no se está haciendo, así que no compite con lo
                   que sí. Misma idea que el rodaje ya hecho. */
                className={`port-hoy-fila${apagadoHoy(it.kind, it.estado) ? " es-hecho" : ""}`}
                style={{ borderLeftColor: it.kind === "caso"
                  ? colorTipo(it.tipo || "") : "var(--teal)" }}>
                {/* La hora manda a la izquierda: en un día, «12:30» es lo que
                    ordena. Lo que no tiene hora lleva el ícono de su tipo, que
                    dice de qué clase de cosa se trata sin ocupar más sitio. */}
                <span className="port-hoy-hora">
                  {it.hora ? it.hora.slice(0, 5) : (it.kind === "caso" ? icoTipo(it.tipo || "") : "▬")}
                </span>
                <span className="port-hoy-tit">{it.titulo}</span>
                {/* ── LO QUE CONTRADICE LA EXPECTATIVA ──
                    Si sale en «Hoy» se da por hecho que está abierto o en
                    marcha. Cuando NO es así hay que decirlo: «Rodaje bloque
                    Zenón» aparece hoy y está en pausa, y sin este chip alguien
                    organiza el día alrededor de algo que nadie va a hacer. */}
                {hayQueDecirEstado(it.kind, it.estado) && (
                  <span className="port-hoy-estado"
                    style={{ color: ESTADO_COL[it.estado] || "var(--dim)",
                      borderColor: ESTADO_COL[it.estado] || "var(--dim)" }}>
                    {ESTADO_ICO[it.estado]} {ESTADO_TXT[it.estado] || it.estado}
                  </span>
                )}
                {/* De qué es. Sin esto, «Rodaje bloque Zenón» no dice de qué
                    película, y el título solo no basta para decidir si te toca.
                    Se enseñan los primeros y el resto se cuenta: ver
                    `TOPE_GRUPOS`. */}
                {(it.grupos.length ? it.grupos : ["Casos sueltos"])
                  .slice(0, TOPE_GRUPOS).map((g: string, i: number) => (
                  <span key={i} className="port-hoy-grupo">{g}</span>
                ))}
                {it.grupos.length > TOPE_GRUPOS && (
                  <span className="port-hoy-grupo port-hoy-mas" title={it.grupos.join(" · ")}>
                    +{it.grupos.length - TOPE_GRUPOS}
                  </span>
                )}
                {/* Quién lo tiene. Una cara se reconoce de un vistazo y un
                    nombre hay que leerlo: en una lista del día, lo primero que
                    se busca es si es tuyo. */}
                {(() => {
                  const q = perfilDe.get(it.respId || "");
                  /* Sin responsable no se pinta un hueco gris: un avatar vacío
                     se lee como «alguien» y aquí no hay nadie. La fila queda
                     más corta y eso ya dice lo que hay que saber. */
                  return q ? <Avatar nombre={q.nombre} color={q.color} src={q.avatar_url} size={22} /> : null;
                })()}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════
          LOS RODAJES QUE VIENEN

          Treinta días hacia adelante. Es lo único de la portada que mira al
          futuro, y va aquí porque un rodaje se prepara con semanas: equipo,
          permisos, gente. Enterarse el día antes es enterarse tarde.
          ══════════════════════════════════════════════════════════════ */}
      {causaRpc ? (
        /* Solo a administración: al resto del equipo, un recado sobre un
           archivo SQL o sobre permisos no le dice nada que pueda hacer. */
        esAdminPortada && (
          <p className="port-vacio-chico">
            {causaRpc === "falta"
              ? <>El bloque de rodajes está apagado: falta correr <code>db/portada-hoy.sql</code> en Supabase.</>
              : causaRpc === "permiso"
                ? <>El bloque de rodajes está apagado: esta cuenta no tiene permiso para leerlo.</>
                : <>No se pudieron leer los rodajes: {errRpc?.message}</>}
          </p>
        )
      ) : !hayEtqRodaje ? (
        /* La etiqueta no existe. Se DICE —«no hay rodajes» y «la etiqueta se
           llama de otra forma» se ven igual en pantalla y se arreglan muy
           distinto— pero solo a quien va a ir a crearla. Un cartel de
           configuración clavado en la portada de todo el equipo, todos los
           días, es de las cosas que enseñan a no mirar la portada. */
        esAdminPortada && (
          <p className="port-vacio-chico">
            No existe la etiqueta <b>{ETIQUETA_RODAJE}</b>, así que no se pueden listar los rodajes.
            {" "}<Link href="/etiquetas" className="port-link">ver etiquetas →</Link>
          </p>
        )
      ) : rodajes.length > 0 && (
        <section className="port-hoy">
          <div className="port-cab">
            <h2 className="port-tit">🎬 Rodajes</h2>
            <span className="port-cab-nota">próximos {DIAS_RODAJE} días</span>
          </div>
          <div className="port-hoy-lista">
            {rodajes.map((r: any) => {
              const dia = soloDia(r.ini);
              /* Un rodaje ya resuelto dentro de la ventana no se esconde —haría
                 parecer que se cayó— pero se pinta apagado: no hay nada que
                 preparar. */
              const hecho = r.estado === "resuelta";
              return (
                <Link key={r.id} href={r.href}
                  className={`port-hoy-fila${hecho ? " es-hecho" : ""}`}
                  style={{ borderLeftColor: hecho ? "var(--green)" : "var(--yellow)" }}>
                  {/* La distancia primero: lo que se necesita saber de un rodaje
                      próximo es cuánto falta, no la fecha — «14 sept.» obliga a
                      contar con los dedos. La fecha va al lado igualmente,
                      porque para reservar equipo hace falta el día. */}
                  <span className="port-hoy-hora">{hecho ? "✓" : cuandoCae(dia, hoyDeLima)}</span>
                  <span className="port-hoy-tit">{r.titulo}</span>
                  <span className="port-hoy-fecha">
                    {/* La hora de llamado, si la hay: en un rodaje es la mitad
                        del dato —«el 14» y «el 14 a las 5 a. m.» se preparan
                        muy distinto—. */}
                    {r.hora ? `${String(r.hora).slice(0, 5)} · ` : ""}
                    {fechaDia(dia)}
                    {soloDia(r.fin) && soloDia(r.fin) !== dia && <> – {fechaDia(soloDia(r.fin))}</>}
                  </span>
                  {r.grupo && <span className="port-hoy-grupo">{r.grupo}</span>}
                  {(() => {
                    const q = perfilDe.get(r.respId || "");
                    return q ? <Avatar nombre={q.nombre} color={q.color} src={q.avatar_url} size={22} /> : null;
                  })()}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── EL MURO ──
          Va ANTES de «lo último» y no después: son las dos mitades de «qué
          pasó», pero esto lo escribió alguien a propósito para que lo leas, y
          la actividad es el rastro que deja el sistema solo. Lo escrito a mano
          gana. */}
      {muroQ.error && (
        /* Igual que con la actividad: una consulta rota no puede leerse como
           «esta semana nadie escribió». */
        <div className="empty">⚠ No se pudo leer el muro ({muroQ.error.message}).</div>
      )}
      {/* Y lo mismo con el hilo. Si a `comentarios` le falta una columna de una
          migración, PostgREST rechaza la consulta ENTERA y las nueve notas
          dirían «Comentar esta nota» —o sea «nadie ha respondido»— sobre
          conversaciones que existen. */}
      {errHilo && (
        <div className="empty">⚠ No se pudieron leer las respuestas del muro ({errHilo.message}).</div>
      )}
      {notas.length > 0 && (
        <>
          <div className="port-cab">
            <h2 className="port-tit">🧱 El muro</h2>
            <span style={{ flex: 1 }} />
            <span className="port-todo" style={{ pointerEvents: "none" }}>
              se responde en su ficha
            </span>
          </div>
          <div className="port-notas">
            {notas.map(n => (
              <div key={n.id} className="port-nota">
                {/* ── SIN ENLACE ESTIRADO ──
                    La nota lo tenía: la tarjeta entera abría el muro. Con
                    reacciones y una caja de texto dentro, un enlace que cubre
                    todo es un enlace que se traga los clics —o que te saca de
                    la pantalla a mitad de escribir—. Las puertas ahora son
                    explícitas: el chip del muro arriba, y «ver en su muro →»
                    abajo, con el ancla de la nota. */}
                <Avatar size={30} nombre={n.autor?.nombre} src={n.autor?.avatar_url} color={n.autor?.color} />
                <div className="port-nota-cuerpo">
                  <div className="port-nota-cab">
                    <b className="port-nota-autor">{(n.autor?.nombre || "Alguien").split(" ")[0]}</b>
                    {n.muro && (
                      <Link href={rutaEntidad(n.muro.tipo, n.muro.id) || "/"}
                        className="badge port-nota-donde"
                        title={`Ir a ${n.muro.nombre}`}>
                        {ICO_ENT[n.muro.tipo] || "🔗"} {n.muro.nombre}
                      </Link>
                    )}
                    <span style={{ flex: 1 }} />
                    <span className="port-nota-cuando">{haceQue(n.creado_en)}</span>
                  </div>
                  {n.texto && <div className="port-nota-txt">{n.texto}</div>}
                  {/* ── LA CARA DEL ENLACE ──
                      Media bitácora es «mira esto» + una url. En texto plano,
                      «https://youtu.be/RfCl2UQzluY?si=…» no dice si es el corte
                      del documental o un tutorial: hay que abrirlo para saber
                      si vale la pena abrirlo. La tarjeta lo dice antes.
                      `sinRed`: la miniatura y el tipo salen del patrón de la
                      url, sin pedirle nada al servidor — ver LinkPreviews. */}
                  {!!n.enlaces.length && (
                    <LinkPreviews texto={n.enlaces.join("\n")} max={1} sinRed />
                  )}
                  {/* ── LAS FOTOS, COMO EN SU MURO ──
                      Decían «📷 2 imágenes», que es el índice de un libro en vez
                      del libro: media bitácora de este equipo ES la foto —el
                      montaje, el rodaje, el papel firmado— y una nota que solo
                      era una imagen se leía como una línea gris.
                      Probé miniaturas cuadradas de 68px «para que la lista no
                      crezca», y una miniatura recortada de una foto de rodaje
                      no es la foto: es el aviso de que hay una. Se enseñan con
                      el mismo componente y el mismo alto que en el muro de su
                      ficha, porque un muro es para MIRAR — y una portada que
                      obliga a entrar para ver la foto no ahorra nada.
                      El clic abre el visor, que es lo que se espera de una
                      foto: mirarla aquí. La conversación está allá. */}
                  {!!n.fotos.length && (
                    <div className="port-nota-fotos">
                      {n.fotos.map((u: string, i: number) => (
                        <Foto key={i} src={u} maxHeight={260} />
                      ))}
                    </div>
                  )}
                  {/* Reaccionar y responder, aquí mismo: el mismo pie que el
                      muro de la ficha (components/NotaSocial.tsx). Lo que NO
                      está es publicar, editar ni borrar — eso se administra
                      donde vive la nota.
                      `sinRed` viaja hasta los enlaces de cada respuesta: un
                      hilo con urls encolaría una acción de servidor por
                      tarjeta, y aquí hay nueve hilos. */}
                  <NotaSocial pubId={n.id} userId={user.id}
                    reacciones={n.reacciones} comentarios={n.comentarios}
                    perfiles={equipo as any} deQuien={n.autor?.nombre} sinRed />
                  {/* Al final del todo: es la salida, no un paso intermedio.
                      Estaba entre el cuerpo y la barra de reacciones, o sea en
                      mitad de la nota.
                      `#pub-…` es el id que pinta el muro, así que la nota queda
                      a la vista. Se va a la FICHA y no a `/caso/{id}`: el caso
                      de una bitácora solo redirige al muro, o sea un render de
                      servidor y un 307 para llegar donde ya sabemos ir. Sin
                      muro (hoy no pasa, mañana quién sabe), el caso hace de
                      respaldo. */}
                  <div className="port-nota-pie">
                    <Link className="port-nota-ir"
                      href={n.muro ? `${rutaEntidad(n.muro.tipo, n.muro.id)}#pub-${n.id}` : `/caso/${n.id}`}>
                      ver en su muro →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── LO ÚLTIMO ── */}
      <div className="port-cab">
        <h2 className="port-tit">⚡ Lo último</h2>
        <span style={{ flex: 1 }} />
        <Link href="/historial" className="port-todo">el diario completo →</Link>
      </div>

      <div className="port-filtros">
        <Link href="/" className={`port-chip${conFiltro ? "" : " on"}`}>todo</Link>
        {SOBRE_QUE.map(t => (
          <Link key={t} href={url(filtroEnt === t ? "" : t, filtroActor)}
            className={`port-chip${filtroEnt === t ? " on" : ""}`}>
            {ICO_ENT[t] || "🔗"} {ROTULO_ENT[t] || t}
          </Link>
        ))}
        <span className="port-corte" />
        {/* Las caras y no los nombres: son cinco o seis personas que se
            reconocen antes de leerlas, y así la fila entra en una línea. */}
        {equipo.map((p: any) => (
          <Link key={p.id} href={url(filtroEnt, filtroActor === p.id ? "" : p.id)}
            className={`port-quien${filtroActor === p.id ? " on" : ""}`}
            title={p.nombre || ""}>
            <Avatar size={22} nombre={p.nombre} src={p.avatar_url} color={p.color} />
          </Link>
        ))}
        <Link href={url(filtroEnt, filtroActor === "bot" ? "" : "bot")}
          className={`port-chip${filtroActor === "bot" ? " on" : ""}`} title={`Lo que hizo ${BOT}`}>
          🤖 el bot
        </Link>
      </div>

      {/* ── UN VACÍO NO ES UN FALLO, Y UN FALLO NO ES UN VACÍO ──
          `actQ.data` viene `null` cuando la consulta falla, y sin esto la
          pantalla decía «todavía no hay nada registrado» sobre una tabla con
          diez mil filas de historia. La forma más convincente de mentir. */}
      {!eventos.length && (actQ.error ? (
        <div className="empty">
          ⚠ No se pudo leer la actividad ({actQ.error.message}). Vuelve a cargar;
          si sigue igual, avísale a John.
        </div>
      ) : (
        <div className="empty">
          {conFiltro
            ? "Nada con estos filtros en lo último. Prueba en el diario completo, que llega más atrás."
            : "Todavía no hay nada registrado."}
        </div>
      ))}

      {dias.map(([dia, evs]) => (
        <div key={dia} style={{ marginTop: 14 }}>
          <div className="port-dia">
            <span className="port-dia-txt">{rotuloDia(dia)}</span>
            <span className="port-dia-linea" />
          </div>
          <div className="card">
            <div className="tl">
              {/* Nueve «vinculó persona: X» seguidas del mismo actor no son
                  nueve hechos: son uno. Se pliegan igual que en el diario. */}
              {agruparEventos(evs as any[]).map((f, i) =>
                f.grupo
                  ? <EventoGrupo key={i} items={f.grupo} horaDe={(x: any) => hora(x.creado_en)} conEntidad />
                  : <EventoHistorial key={i} e={f.solo} hora={hora(f.solo.creado_en)} conEntidad />
              )}
            </div>
          </div>
        </div>
      ))}

      {eventos.length >= CUANTOS && (
        /* El tope se DICE. Una lista que corta en seco enseña que el sistema
           «solo guarda unos días», y de ahí a no fiarse del rastro hay un paso. */
        <div className="port-tope">
          Estos son los últimos {CUANTOS} movimientos
          {conFiltro ? " con estos filtros" : ""}. <Link href="/historial">El diario completo →</Link>
        </div>
      )}
    </div>
  );
}
