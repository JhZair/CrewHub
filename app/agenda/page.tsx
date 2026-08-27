import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import Agenda, { type ItemAgenda } from "@/components/Agenda";
import Realtime from "@/components/Realtime";
import { sinBot } from "@/lib/personas";
import { fueraDeAgenda, actividadFueraDeAgenda } from "@/lib/estados";
import { diaLima } from "@/lib/fechas";
import { techo } from "@/lib/api";
import { llevaHora } from "@/lib/tipos";
import { nombresDe } from "@/lib/eventos";
import { ORDEN_VINCULO, pesoVinculo, elCasoLaCubre } from "@/lib/portadaHoy";
import { tipoCanonico } from "@/lib/secciones";

export const metadata: Metadata = { title: "📅 Agenda" };

/* AGENDA — todo lo que tiene fecha, en un solo sitio.
   Junta dos cosas que hasta ahora vivían separadas: las actividades de TODOS
   los cronogramas (de cada proyecto/convocatoria) y los casos vivos con fecha
   límite. Dos vistas: línea de tiempo (barras por proyecto) y calendario
   mensual. Se carga todo y se filtra en el cliente —es poca data (unas
   decenas de actividades y ~25 casos) y así el filtro por persona y el cambio
   de vista son instantáneos. */

const VIVOS = ["abierta", "en_progreso", "seguimiento", "en_pausa"];

export default async function AgendaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const [{ data: acts }, { data: casos }, { data: perfs }] = await Promise.all([
    supabase.from("cronograma_actividades")
      /* `orden` y `creado_en` viajan porque la agenda tiene que ordenar
         EXACTAMENTE igual que el cronograma de donde salen las actividades;
         y `categoria` (de la convocatoria, propia o vía postulación) porque el
         orden de las FASES sale del preset de esa categoría, no del calendario:
         un documental empieza por Investigación aunque su primera fecha caiga
         después de algo de Preproducción. */
      .select("id,nombre,fecha_inicio,fecha_fin,etapa,estado,responsable,equipo,publicacion_id,orden,creado_en," +
        "proy:proyectos(id,nombre,nombre_corto),conv:convocatorias(id,codigo,nombre,categoria)," +
        "postu:postulaciones(id,codigo,estado,proy:proyectos(nombre,nombre_corto),conv:convocatorias(categoria))," +
        /* El caso al que se materializó esta actividad, si lo hay. Viaja para
           poder respetar su archivado: ver `actividadFueraDeAgenda`. Sin esto,
           archivar el caso lo sacaba de la agenda y dejaba la actividad —que en
           pantalla es la misma fila— tan campante. */
        "pub:publicaciones!publicacion_id(estado,archivado_en,responsable)")
      .neq("estado", "cancelada").not("fecha_inicio", "is", null),
    supabase.from("publicaciones")
      .select("id,titulo,tipo,estado,fecha_inicio,fecha_limite,hora,responsable,creado_en")
      .in("estado", VIVOS).not("fecha_limite", "is", null).is("archivado_en", null)
      .neq("tipo", "bitacora"),   // las notas del muro solo viven en su proyecto
    supabase.from("perfiles").select("id,nombre,avatar_url,color").eq("activo", true).order("nombre"),
  ]);

  // ── Cuántos comentarios tiene cada caso ──
  // Las dos mitades de la agenda desembocan en el mismo sitio: un caso es una
  // publicación, y una actividad de cronograma ya materializada TIENE una
  // (`publicacion_id`). Así que se pregunta una sola vez, por id de publicación,
  // y sirve a las dos. Se usa el agregado embebido en vez de traer la tabla
  // `comentarios` entera y contar en memoria: los comentarios de objetos,
  // préstamos, equipamiento y postulaciones viven en esa misma tabla y gastarían
  // el tope de filas de PostgREST, dejando el contador corto EN SILENCIO.
  // El `limit` explícito es por lo mismo: el default (1000) truncaría sin avisar.
  /* ── LAS PROPUESTAS NO VAN A LA AGENDA ──
     El cronograma de una postulación que sigue en concurso es lo que le
     PROMETES a DAFO que harás si ganas: no hay trabajo que hacer todavía, ni
     fecha que cumplir. Mezclarlo con lo que sí hay que hacer esta semana
     llena la agenda de fechas hipotéticas —y de varias a la vez, porque se
     postula a varios concursos con el mismo proyecto—, que es la forma más
     rápida de que el equipo deje de mirarla.

     Ganado el fondo deja de ser una promesa: pasa a ser la ejecución, con
     plazo de acta y dinero que rendir. Por eso el corte es `ganadora` y no
     «tiene postulación».

     Es la misma regla que `qhaway_matutino()` aplica al materializar, escrita
     aquí para la lectura. Ojo: hoy el bot excluye `postulacion_id` ENTERO, así
     que los fondos ganados aparecen en esta agenda pero el bot todavía no les
     abre casos. Las dos mitades tienen que acabar diciendo lo mismo. */
  const actsVisibles = (acts || []).filter((a: any) => {
    const postu = a.postu as any;
    if (postu && postu.estado !== "ganadora") return false;
    /* Y si la actividad ya tiene caso, manda el caso: archivado o descartado,
       la fila se va del calendario. La regla vive en lib/estados.ts porque la
       portada pinta la misma lista y las dos tienen que decir lo mismo. */
    return !actividadFueraDeAgenda(a);
  });

  /* Los avisos VENCIDOS ya no rigen y no se pintan (misma regla que
     feed/kanban/muro), así que tampoco se les piden comentarios ni vínculos:
     el filtro estaba más abajo y se pagaba el viaje igual.
     Una REUNIÓN pasada sí se queda: sale de lo pendiente pero no de la agenda,
     porque en un calendario el pasado es historial y no deuda — «¿cuándo fue
     la reunión de producción?» es exactamente lo que se le pregunta a un
     calendario. Por eso `fueraDeAgenda` y no `avisoVencido`. */
  const casosVivos = (casos || []).filter((c: any) => !fueraDeAgenda(c.tipo, c.fecha_limite));
  const idsCaso = casosVivos.map((c: any) => c.id);
  const idsPub = [...new Set([
    ...actsVisibles.map((a: any) => a.publicacion_id),
    ...idsCaso,
  ].filter(Boolean))] as string[];
  /* Los conteos y los vínculos NO dependen el uno del otro: los dos salen de
     ids que ya están resueltos. Encadenarlos añadía un viaje de red entero a
     la página por nada — el mismo patrón que se fue a aplanar en la portada y
     en /tablero. */
  const [{ data: conteos }, { data: vincs }] = await Promise.all([
    idsPub.length
      ? supabase.from("publicaciones").select("id,comentarios(count)").in("id", idsPub)
          .limit(techo(5000))
      : Promise.resolve({ data: [] as any[] }),
    idsCaso.length
      ? supabase.from("publicacion_vinculos")
          .select("publicacion_id,entidad_tipo,entidad_id").in("publicacion_id", idsCaso)
          /* `creado_en` para que el orden sea SIEMPRE el mismo. Sin `order`,
             Postgres devuelve las filas como le convenga —y eso cambia con un
             update o un autovacuum—: un caso vinculado a dos proyectos habría
             saltado de bloque entre recargas sin que nada hubiera cambiado. */
          .order("creado_en").order("entidad_id")
          /* `techo` y no 5000 a secas: PostgREST corta en mil (Max rows) y no
             avisa. Un caso al que se le pierde el vínculo no da error — se va
             al cajón de los sueltos como si no tuviera ninguno. */
          .limit(techo(5000))
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const nComs = new Map<string, number>();
  (conteos || []).forEach((p: any) => nComs.set(p.id, p.comentarios?.[0]?.count ?? 0));

  /* ══════════════════════════════════════════════════════════════════
     ¿A QUÉ PERTENECE CADA CASO?

     Las actividades del cronograma salen agrupadas por su proyecto y el
     contexto lo da la cabecera del grupo. Los casos caían todos en un único
     bloque «Casos», así que eran justo ellos los que no decían de qué van:
     «Rodaje bloque Zenon» a secas no dice de qué película es, y el título
     está cortado por el ancho de la columna.

     La solución no es meter más texto en una fila que ya va justa, sino usar
     la estructura que la agenda YA tiene: si el caso está vinculado a «15
     Emi», que aparezca bajo «15 Emi», al lado de las actividades de esa misma
     película. Cero altura extra, cero ancho robado al título, y la agenda deja
     de hablar dos idiomas.

     ── UN CASO PUEDE COLGAR DE VARIAS COSAS ──
     Se elige UNA por prioridad —fondo, proyecto, convocatoria, empresa— y las
     demás siguen estando en la ficha. El criterio es dónde está el TRABAJO de
     ese caso, no qué suena más específico: ver `PRIORIDAD` más abajo.
     Persona, lugar, equipamiento y etiqueta NO agrupan: no tienen cronograma
     y partirían la agenda en veinte grupos de una fila. Un caso etiquetado con
     alguien no «pertenece» a esa persona.
     ══════════════════════════════════════════════════════════════════ */
  // Los vínculos de cada caso, en el orden estable que pidió la consulta.
  const vincDe = new Map<string, { tipo: string; id: string }[]>();
  (vincs || []).forEach((v: any) => vincDe.set(v.publicacion_id,
    [...(vincDe.get(v.publicacion_id) || []), { tipo: v.entidad_tipo, id: v.entidad_id }]));

  /* Los nombres, por lote y solo de los tipos que agrupan. Cuatro consultas en
     paralelo y nunca una por fila. */
  /* El orden vive en lib/portadaHoy: la portada recorta los mismos vínculos
     por el mismo criterio. Estaba escrito dos veces con dos órdenes distintos
     y la misma reunión enseñaba chips distintos en cada pantalla. */
  const PRIORIDAD = ORDEN_VINCULO;

  /* `tipoCanonico` y no el tipo crudo: el trigger escribe el nombre de la
     tabla («proyectos») y el código a mano escribe el singular. Comparando en
     crudo, un vínculo en plural no entraba aquí ni en el agrupado — el caso
     salía con su chip pero caía en «Casos sueltos». */
  const idsDe = (t: string) => [...new Set([...vincDe.values()].flat()
    .filter(v => tipoCanonico(v.tipo) === t).map(v => v.id))];
  const [proyG, postuG, convG, empG, nombresOtros, persG] = await Promise.all([
    idsDe("proyecto").length
      ? supabase.from("proyectos").select("id,nombre,nombre_corto").in("id", idsDe("proyecto"))
      : Promise.resolve({ data: [] as any[] }),
    /* Solo las GANADAS: una postulación en concurso no es un fondo, y este
       grupo se rotula «🎬 Fondo» y enlaza a `/fondo/<id>`, que para una que
       sigue compitiendo redirige al expediente y deja al lector en otra
       pantalla. Es la misma regla que filtra las actividades («las propuestas
       no van a la agenda»), que los casos se saltaban por no pasar por ahí.
       Las que no ganaron caen al siguiente nivel de prioridad. */
    idsDe("postulacion").length
      ? supabase.from("postulaciones")
          .select("id,codigo,proy:proyectos(nombre,nombre_corto)")
          .in("id", idsDe("postulacion")).eq("estado", "ganadora")
      : Promise.resolve({ data: [] as any[] }),
    idsDe("convocatoria").length
      ? supabase.from("convocatorias").select("id,codigo,nombre").in("id", idsDe("convocatoria"))
      : Promise.resolve({ data: [] as any[] }),
    idsDe("empresa").length
      ? supabase.from("empresas").select("id,nombre").in("id", idsDe("empresa"))
      : Promise.resolve({ data: [] as any[] }),
    /* ── TODOS LOS VÍNCULOS, PARA PODER ENSEÑARLOS TODOS ──
       Las cuatro consultas de arriba resuelven los tipos que AGRUPAN. Pero un
       caso cuelga de más cosas —personas, lugares, etiquetas—, y una reunión
       existe justamente por a quién convoca: enseñar solo el grupo la deja en
       «Casos sueltos», que es lo único que no informa de ella.
       Va sin excluir los cuatro que agrupan: `grupoEnt` no
       siempre los cubre —una postulación que no ganó no entra allí, y un
       vínculo guardado en plural («proyectos») tampoco casa—, y esos chips
       desaparecían de la fila sin dejar rastro. Nombrar de más cuesta una
       consulta por tipo; nombrar de menos borra datos de la pantalla. */
    nombresDe(supabase, [...vincDe.values()].flat()
      .map(v => ({ tipo: v.tipo, id: v.id }))),
    /* ── LA CUENTA DE CADA PERSONA VINCULADA ──
       El avatar vive en `perfiles` y el vínculo apunta a `personas`: sin este
       cruce, los convocados de una reunión solo pueden salir como texto. Es la
       misma consulta que hace la portada, para que las dos pinten las mismas
       caras. */
    idsDe("persona").length
      ? supabase.from("personas").select("id,nombre,alias,foto_url,usuario_id")
          .in("id", idsDe("persona"))
      : Promise.resolve({ data: [] as any[] }),
  ]);

  /* El grupo de cada entidad, con el MISMO `id` que arman las actividades
     —`p:`, `postu:`, `c:`— para que un caso y las actividades de su película
     caigan en el mismo bloque. Si estos prefijos se separan de los de arriba,
     no falla nada: simplemente salen dos grupos con el mismo nombre, que es
     de los errores que más tardan en verse. */
  const grupoEnt = new Map<string, { id: string; label: string }>();
  ((proyG.data || []) as any[]).forEach(p =>
    grupoEnt.set(`proyecto:${p.id}`, { id: `p:${p.id}`, label: p.nombre_corto || p.nombre }));
  ((postuG.data || []) as any[]).forEach(p =>
    grupoEnt.set(`postulacion:${p.id}`, {
      id: `postu:${p.id}`,
      label: [`🎬 ${p.codigo || "Fondo"}`,
              (p.proy as any)?.nombre_corto || (p.proy as any)?.nombre].filter(Boolean).join(" · "),
    }));
  ((convG.data || []) as any[]).forEach(c =>
    grupoEnt.set(`convocatoria:${c.id}`, {
      id: `c:${c.id}`, label: [c.codigo, c.nombre].filter(Boolean).join(" · "),
    }));
  ((empG.data || []) as any[]).forEach(e =>
    grupoEnt.set(`empresa:${e.id}`, { id: `e:${e.id}`, label: `🏢 ${e.nombre}` }));

  /* ── EL FONDO ANTES QUE EL PROYECTO ──
     Parece al revés («el proyecto es más concreto»), y no lo es: el cronograma
     de un fondo en ejecución NO cuelga del proyecto —sus filas tienen
     `proyecto_id` en null— sino de la postulación. Con el proyecto primero, un
     caso vinculado a los dos se iba a `p:<proyecto>` mientras su cronograma
     vivía en `postu:<fondo>`: dos bloques de la misma película, uno con el
     cronograma y otro con un caso solo. La prioridad tiene que seguir a dónde
     está el trabajo, no a qué suena más específico. */
  const grupoDeCaso = (id: string) => {
    const vs = vincDe.get(id) || [];
    for (const t of PRIORIDAD) {
      const v = vs.find(x => tipoCanonico(x.tipo) === t);
      const g = v && grupoEnt.get(`${t}:${v.id}`);
      if (g) return g;
    }
    /* Sin vínculo que agrupe. «Sueltos» y no «Casos» a secas: el nombre dice
       por qué están juntos —no comparten nada— en vez de sugerir que son «los
       casos» y los demás otra cosa. */
    return { id: "__casos__", label: "Casos sueltos" };
  };

  /* ── TODOS LOS VÍNCULOS DE UN CASO, EN ORDEN ──
     Delante lo que sitúa el trabajo —fondo, proyecto, convocatoria, empresa—,
     detrás lo demás. La fila enseña los primeros y cuenta el resto: si hay que
     cortar, se corta por donde menos duele. */
  /* persona (la ficha) → cara. Sin cuenta —un colaborador externo— se pinta
     igual con su inicial y su color, que sigue diciendo quién es. */
  /* `perfiles.avatar_url` ya trae la cara buena (db/una-sola-cara.sql). */
  const perfPorId = new Map<string, any>((perfs || []).map((p: any) => [p.id, p]));
  const caraDePersona = new Map<string, { nombre: string; color?: string; avatar_url?: string }>(
    ((persG.data || []) as any[]).map((pe: any) => {
      const q = pe.usuario_id ? perfPorId.get(pe.usuario_id) : null;
      return [pe.id, {
        nombre: q?.nombre || pe.alias || pe.nombre || "—",
        color: q?.color || undefined,
        /* La de la ficha primero: es la que sube administración y la que el
           equipo reconoce. */
        avatar_url: pe.foto_url || q?.avatar_url || undefined,
      }];
    }));
  /* Las caras de un caso, en el orden estable de sus vínculos. */
  const carasDeCaso = (id: string) => (vincDe.get(id) || [])
    .filter(v => tipoCanonico(v.tipo) === "persona")
    .map(v => caraDePersona.get(v.id))
    .filter(Boolean) as { nombre: string; color?: string; avatar_url?: string }[];

  const gruposDeCaso = (id: string): string[] => {
    const vs = vincDe.get(id) || [];
    /* Las personas salen de aquí: van como avatares. Repetirlas también como
       chip de texto llenaba la fila con el mismo dato dos veces. */
    return [...vs].filter(v => tipoCanonico(v.tipo) !== "persona")
      .sort((a, b) => pesoVinculo(tipoCanonico(a.tipo))
                    - pesoVinculo(tipoCanonico(b.tipo)))
      .map(v => {
        const t = tipoCanonico(v.tipo);
        return grupoEnt.get(`${t}:${v.id}`)?.label || nombresOtros.get(`${t}:${v.id}`) || "";
      })
      .filter(Boolean);
  };

  // ── Actividades → items. Grupo = su proyecto/convocatoria/fondo. ──
  const itemsAct: ItemAgenda[] = actsVisibles.map((a: any) => {
    const proy = a.proy as any, conv = a.conv as any, postu = a.postu as any;
    const grupo = proy ? { id: `p:${proy.id}`, label: proy.nombre_corto || proy.nombre }
      /* Ya solo llegan ganadoras, así que esto es un FONDO EN EJECUCIÓN. El
         🎬 es el mismo icono con que /fondos las llama, para que la agenda no
         invente un vocabulario propio.
         Y el código va con el NOMBRE del proyecto: «PO-001» a secas no dice de
         qué es, y en una agenda donde los demás grupos se llaman «Linderaje» o
         «SanEsteban», un código suelto obliga a recordar de memoria cuál era.
         El nombre sale por la postulación porque estas filas ya no cuelgan de
         un proyecto: su `proyecto_id` es null desde que el cronograma del fondo
         vive en su postulación. */
      : postu ? {
          id: `postu:${postu.id}`,
          label: [`🎬 ${postu.codigo || "Fondo"}`,
                  (postu.proy as any)?.nombre_corto || (postu.proy as any)?.nombre]
                 .filter(Boolean).join(" · "),
        }
      : conv ? { id: `c:${conv.id}`, label: [conv.codigo, conv.nombre].filter(Boolean).join(" · ") }
      : { id: "sin", label: "Sin proyecto" };
    const href = a.publicacion_id ? `/caso/${a.publicacion_id}`
      : proy ? `/entidad/proyecto/${proy.id}`
      /* Mismo destino que el título del grupo: la pestaña donde está el
         cronograma, no la portada del fondo. */
      : postu ? `/fondo/${postu.id}#audiovisual`
      : conv ? `/entidad/convocatoria/${conv.id}` : "#";
    return {
      id: a.id, kind: "act", titulo: a.nombre,
      ini: a.fecha_inicio, fin: a.fecha_fin || a.fecha_inicio,
      // Una actividad del cronograma SIEMPRE tiene ventana: su `ini` es un
      // dato y no un relleno. Ver `ItemAgenda.ventana`.
      ventana: true,
      estado: a.estado, etapa: a.etapa || "",
      /* El del caso al que se materializó: es el que se lee con el vocabulario
         de las publicaciones y el que hay que enseñar en la fila. */
      estadoCaso: (a.pub as any)?.estado || "",
      /* Por orden de certeza: el de la actividad, el del caso —una actividad
         materializada suele no tener responsable propio— y el primero del
         equipo, que no es «el responsable» pero es a quien preguntar. */
      respId: a.responsable || (a.pub as any)?.responsable
        || ((a.equipo as string[]) || [])[0] || null,
      personas: [a.responsable, ...((a.equipo as string[]) || [])].filter(Boolean) as string[],
      nc: a.publicacion_id ? nComs.get(a.publicacion_id) || 0 : 0,
      orden: a.orden ?? 0, creado: a.creado_en || "",
      // Sin categoría (los cronogramas de proyecto) manda el preset de cine,
      // que es justo lo que `etapasDe` devuelve cuando no reconoce nada.
      cat: conv?.categoria || (postu?.conv as any)?.categoria || "",
      grupo: grupo.label, grupoId: grupo.id, grupos: [grupo.label], href,
    };
  });

  // ── Casos vivos con fecha límite → items, cada uno en el grupo de su
  //    vínculo principal (ver `grupoDeCaso`). ──
  // Un aviso VENCIDO ya no rige (misma regla que feed/kanban/muro): sale de la
  // agenda solo, sin esperar a que se archive a mano. Los casos normales y los
  // avisos aún vigentes se quedan.
  const itemsCaso: ItemAgenda[] = casosVivos.map((c: any) => {
    /* ── DE CUÁNDO A CUÁNDO SE DIBUJA UN CASO ──
       Si el caso tiene VENTANA (`fecha_inicio`), esa es la barra: el trabajo
       va de ahí a su vencimiento. Es lo que hacía falta —«Rodaje bloque
       Zenon» se dibujaba desde el día en que alguien lo escribió, o sea la
       vida del apunte y no la del rodaje—.
       Sin ventana se conserva el respaldo de siempre: de `creado_en` al
       límite, tenue y punteado. No es la verdad, es lo único que se sabe, y
       enseñar un tramo aproximado dice más que una marca suelta.
       El `< fin` de los dos casos evita la barra al revés: un caso creado
       DESPUÉS de su propio vencimiento existe —se apunta tarde— y sin este
       guard se dibujaría hacia atrás. Con `fecha_inicio` no debería pasar
       (lo impiden la acción y el check de la base), pero este dibujo no es
       el sitio donde descubrir que una de las dos falló. */
    /* `diaLima` y no `slice(0,10)`: `creado_en` es un instante en UTC, y sus
       diez primeros caracteres son el día UTC — pasadas las 7 de la tarde en
       Perú, el día siguiente. Un caso escrito el 31 a las 20:00 salía
       arrancando el 1. */
    const creado = diaLima(c.creado_en || "");
    /* ── UNA REUNIÓN ES UN PUNTO, NO UN TRAMO ──
       No dura: ocurre. Dibujarle la cola punteada desde el día en que se
       apuntó la convertía en una barra de tres semanas para un acto de una
       hora, y encima la ordenaba por la fecha del apunte —así que dos
       reuniones del mismo martes salían separadas y en cualquier orden,
       porque el desempate por hora nunca llegaba a evaluarse—.
       Su `ini` es su día, igual que su `fin`: una sola marca, en su fecha. */
    const arranque = llevaHora(c.tipo) ? c.fecha_limite : (c.fecha_inicio || creado);
    const ini = arranque && arranque < c.fecha_limite ? arranque : c.fecha_limite;
    return {
    id: c.id, kind: "caso" as const, titulo: c.titulo,
    ini, fin: c.fecha_limite,
    // Solo es ventana si alguien la puso: ver `ItemAgenda.ventana`.
    ventana: !!c.fecha_inicio,
    // 'HH:MM:SS' de Postgres → 'HH:MM': los segundos de una reunión son ruido.
    hora: c.hora ? String(c.hora).slice(0, 5) : undefined,
    estado: c.estado, tipo: c.tipo,
    respId: c.responsable || null,
    personas: [c.responsable].filter(Boolean) as string[],
    nc: nComs.get(c.id) || 0,
    creado: c.creado_en || "",
    ...(() => { const g = grupoDeCaso(c.id); return { grupo: g.label, grupoId: g.id }; })(),
    grupos: gruposDeCaso(c.id),
    caras: carasDeCaso(c.id),
    /* ── LOS CASOS, DEBAJO DEL CRONOGRAMA DE SU GRUPO ──
       Dentro de un grupo se ordena por `orden`, que es la secuencia que una
       persona decidió en el cronograma —primero se alistan los equipos,
       después rueda cámara A—. Un caso no tiene esa secuencia, y con el 0 de
       antes se colaba ENCIMA de toda ella: al juntarlos con las actividades,
       los casos habrían partido en dos el cronograma de cada película.
       Van al final del grupo, ordenados entre sí por fecha. El cronograma se
       lee de un tirón y los casos cuelgan debajo, que es lo que son. */
    orden: Number.MAX_SAFE_INTEGER,
    href: `/caso/${c.id}`,
  }; });

  /* ── UNA COSA, UNA FILA ──
     El bot materializa las actividades en casos, copiándoles el título y las
     dos fechas: en el calendario salían DOS renglones idénticos, con el mismo
     texto y el mismo destino, y la cabecera del día los contaba a los dos.
     Gana el caso —es donde se comenta, se asigna y se cierra—; la actividad
     solo queda mientras nadie la haya materializado.
     Es la misma regla que aplica la portada, y por eso vive donde se ve: si
     una pantalla deduplica y la otra no, «los dos paneles no enseñan lo
     mismo» vuelve a ser cierto por otro camino. */
  const casoPorId = new Map(itemsCaso.map(c => [c.id, c]));
  /* Por un mapa y no por el índice del arreglo: hoy `itemsAct` sale de un
     `map` sobre `actsVisibles` y los índices coinciden, pero eso es un
     accidente del código de arriba y el día que alguien filtre entre medias,
     esto emparejaría filas equivocadas sin dar error. */
  const casoDeAct = new Map<string, string>(
    actsVisibles.filter((a: any) => a.publicacion_id).map((a: any) => [a.id, a.publicacion_id]));
  const itemsActSolas = itemsAct.filter(a => {
    const caso = casoPorId.get(casoDeAct.get(a.id) || "");
    /* `elCasoLaCubre` y no «tiene caso»: si el caso ocupa menos días que la
       actividad, quitarla dejaría vacíos los días intermedios. La misma
       función que usa la portada. */
    return !(caso && elCasoLaCubre(caso, a));
  });

  return (
    <div className="shell" style={{ maxWidth: "min(1800px, 98vw)" }}>
      {/* Refresco en vivo: la agenda sale de cronograma + casos con fecha. */}
      {/* «comentarios» entra a la lista porque ahora la agenda muestra su
          conteo: sin eso el 💬 se quedaría congelado hasta recargar. */}
      {/* `publicacion_vinculos` entra a la lista desde que el grupo de un caso
          sale de su vínculo: vincular un caso a un proyecto lo MUEVE de sitio
          en esta pantalla, y sin esto el cambio no se vería hasta recargar. */}
      <Realtime tablas={["cronograma_actividades", "publicaciones", "comentarios", "publicacion_vinculos"]} token={session?.access_token} miId={user.id} />
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>todo lo que tiene fecha, junto</span>
      </div>
      <Agenda items={[...itemsActSolas, ...itemsCaso]}
        perfiles={sinBot(perfs || [])} miId={user.id} />
    </div>
  );
}
