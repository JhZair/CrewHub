import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { TIPO_COLOR } from "@/lib/entidades";
import { prefijoComun, sinPrefijo } from "@/lib/texto";
// EN_JUEGO y la regla de ejecución viven en lib/fondos.ts: /empresas las
// tenía escritas aparte, y ya no decían lo mismo.
import { EN_JUEGO, ejecutando, rendicionVencida, plazoRendicion } from "@/lib/fondos";
import { avisoVencido } from "@/lib/estados";
import { buscadorDe, pal } from "@/lib/buscar";
import { esDirectorObra } from "@/lib/personas";
import { postApagada, postCerradaSinPremio } from "@/lib/resultados";
import { hoyLima } from "@/lib/fechas";
import { ordenarEquipo } from "@/lib/rolesEquipo";
import Avatar from "@/components/Avatar";
import RielHitos from "@/components/RielHitos";
import CaidosPop from "@/components/CaidosPop";
import Link from "@/components/Enlace";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "🎯 Postulaciones" };

/* El camino tiene DOS jueces: primero DAFO revisa papeles y declara aptas
   (bases 5.2, administrativo), después el jurado elige. Por eso «apta» y
   «no apta» son estados propios: sacar a alguien por su RUC no es lo mismo
   que no elegirlo por su película. */
const EST_META: Record<string, [string, string]> = {
  en_preparacion: ["🛠 En preparación", "var(--violet)"],
  enviada: ["📨 Enviadas", "var(--blue)"],
  /* ⚠ FALTABA, y no era un chip de menos: era CINCO POSTULACIONES INVISIBLES.
     `en_subsanacion` existe en la base, en el stepper de la ficha y en
     `EN_JUEGO` de lib/fondos — solo esta pantalla no lo conocía. Sin su
     entrada aquí no había chip para filtrarlas, el badge de su tarjeta
     enseñaba la clave en crudo («en_subsanacion»), y el embudo las dejaba
     fuera de TODAS sus bandas: el título decía «21 postulaciones» y el primer
     escalón «16 se prepararon», con los cuatro porcentajes calculados sobre
     16. Nada fallaba; simplemente cinco no estaban. */
  en_subsanacion: ["🔧 En subsanación", "var(--yellow)"],
  apta: ["✅ Aptas", "var(--teal)"],
  no_apta: ["🚫 No aptas", "var(--red)"],
  finalista: ["⭐ Finalistas", "var(--yellow)"],
  ganadora: ["🏆 Ganadoras", "var(--green)"],
  finalista_no_ganadora: ["🥈 Finalistas (no ganaron)", "var(--yellow)"],
  no_seleccionada: ["✖ No seleccionadas", "var(--dim)"],
  retirada: ["↩ Retiradas", "var(--dim)"],
};
const dias = (f: string) => Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);

const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];

export default async function Postulaciones({ searchParams }: {
  searchParams: { q?: string; e?: string; a?: string; t?: string; f?: string; y?: string; c?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const e = searchParams?.e || "";
  const a = searchParams?.a || "";
  const t = searchParams?.t || "";
  const f = searchParams?.f || "";
  /* La CONVOCATORIA concreta. Se podía filtrar por año y por estado, pero no
     por «este concurso»: para ver cómo nos fue en el Documental Producción
     2026 había que leer 21 filas y quedarse con las cinco del código C-072. */
  const c = searchParams?.c || "";
  const listar = !!(q || e || a || t || f || c);

  /* ── EL AÑO EN CURSO MANDA MIENTRAS NADIE DIGA OTRA COSA ──
     Las convocatorias del año que viene se cargan con meses de antelación, así
     que al entrar sin filtros el panel hablaba del año MÁS ALTO —2027— cuando
     el trabajo de esta semana es del 2026. Nadie lo pidió: era el efecto de un
     `Math.max` puesto para «el más reciente».
     `aAlcance` es el año que acota TODO el panel: los conteos de los chips, la
     lista de convocatorias y el enlace de cada filtro. Sin `?a=` es el año en
     curso; con `a=todos` no acota nada y se ven los siete años de golpe. */
  const anioActual = hoyLima().slice(0, 4);
  const todosAnios = a === "todos";
  const aAlcance = todosAnios ? "" : (a || anioActual);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: postsAll, error: qErr }, { data: vincs }, { data: peq }, { data: pyeq }, { data: media }, { data: hitosAll }] = await Promise.all([
    supabase.from("postulaciones")
      .select("*,conv:convocatorias(id,codigo,nombre,anio,estado,monto_adjudicado),proy:proyectos(id,nombre,tipo,relacion),emp:empresas(id,nombre,relacion)")
      .order("creado_en", { ascending: false }),
    supabase.from("publicacion_vinculos")
      /* ⚠ EL CONTADOR 💬 YA NO SE CUENTA A MANO.
       Aquí había una consulta que se traía la tabla `comentarios` ENTERA —solo
       la columna del caso, pero entera— para contar cuántos tiene cada uno. Sin
       `.limit()` y sin `.order()`, contra un techo real de mil filas
       (Supabase → Max rows). Hoy son 989 y entran ~450 al mes: en días, los
       SEIS listados que hacían esto se habrían quedado cortos a la vez, cada
       uno enseñando un número menor que el de verdad y ninguno dando error.
       `comentarios(count)` es un agregado: lo cuenta Postgres y vuelve un
       número por fila. Ni techo que sortear, ni una consulta más. */
      .select("entidad_id,publicacion_id,pub:publicaciones(estado,tipo,archivado_en,fecha_limite,comentarios(count))").eq("entidad_tipo", "postulacion"),
    /* El/la director(a): el tercer protagonista del trío. Vive en el equipo de
       la postulación; si ahí no está, se hereda del equipo del proyecto. */
    supabase.from("postulacion_equipo").select("postulacion_id,cargo,persona:personas(id,nombre,alias,foto_url)"),
    supabase.from("proyecto_equipo").select("proyecto_id,cargo,persona:personas(id,nombre,alias,foto_url)"),
    /* Las imágenes del trío: cartel del proyecto y logo de la empresa (la foto
       del director viaja con la persona). Para mostrar caras, no solo texto. */
    supabase.from("entidad_media").select("entidad_tipo,entidad_id,cartel_url").in("entidad_tipo", ["proyecto", "empresa"]),
    /* Los hitos (fechas del cronograma) de cada convocatoria: la MISMA línea de
       tiempo de la cancha, reusada como tercera fila en cada postulación. */
    supabase.from("cronograma_actividades")
      .select("id,nombre,fecha_inicio,convocatoria_id").not("convocatoria_id", "is", null),
  ]);

  const cartelDe = new Map<string, string>();
  (media || []).forEach((m: any) => { if (m.cartel_url) cartelDe.set(`${m.entidad_tipo}:${m.entidad_id}`, m.cartel_url); });

  /* Hitos por convocatoria, mapeados al formato del riel ({id,nombre,fecha}).
     Cada postulación toma los de su convocatoria para ver la fecha más próxima. */
  const hitosPorConv = new Map<string, { id: string; nombre: string; fecha: string }[]>();
  (hitosAll || []).forEach((h: any) => {
    if (!h.fecha_inicio) return;
    const l = hitosPorConv.get(h.convocatoria_id) || [];
    l.push({ id: h.id, nombre: h.nombre, fecha: h.fecha_inicio });
    hitosPorConv.set(h.convocatoria_id, l);
  });
  const hoyS = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }); // YYYY-MM-DD

  /* El trío que define una postulación: Proyecto × Empresa × Director(a). Los
     dos primeros vienen en la fila; el director se arma aquí. Se prefiere el de
     la postulación y, si no hay, el del proyecto (que aquella hereda). */
  /* Director/a de la OBRA (no direcciones técnicas como «Director/a de
     Fotografía» — antes esas se colaban como director del trío). */
  const esDir = (c: string) => esDirectorObra(c);
  const dirPost = new Map<string, any>();
  (peq || []).forEach((r: any) => { if (esDir(r.cargo) && r.persona && !dirPost.has(r.postulacion_id)) dirPost.set(r.postulacion_id, r.persona); });
  const dirProy = new Map<string, any>();
  (pyeq || []).forEach((r: any) => { if (esDir(r.cargo) && r.persona && !dirProy.has(r.proyecto_id)) dirProy.set(r.proyecto_id, r.persona); });
  const directorDe = (p: any) => dirPost.get(p.id) || (p.proy?.id ? dirProy.get(p.proy.id) : null);

  /* El EQUIPO completo que postula, agrupado por postulación (mismo `peq` del
     que sale el director). Se muestra como una fila de solo-avatares. */
  const equipoPorPost = new Map<string, any[]>();
  (peq || []).forEach((r: any) => {
    if (!r.persona) return;
    const l = equipoPorPost.get(r.postulacion_id) || [];
    l.push(r);
    equipoPorPost.set(r.postulacion_id, l);
  });

  /* Su vida en CrewHub+: cuánto trabajo cuelga de cada postulación.
     Empresas y personas ya la muestran; aquí la fila terminaba en el estado
     y no decía si había algo sin resolver encima. */

  type Act = { casos: number; abiertos: number; coments: number; muro: number };
  const VACIO: Act = { casos: 0, abiertos: 0, coments: 0, muro: 0 };
  const act = new Map<string, Act>();
  (vincs || []).forEach((v: any) => {
    const x = act.get(v.entidad_id) || { ...VACIO };
    const pub = v.pub as any;
    /* Los posts del MURO (bitácora) cuelgan de la postulación como los casos,
       pero NO son trabajo: se cuentan aparte (contador de muro), no como caso. */
    if (pub?.tipo === "bitacora") {
      x.muro++;
    } else {
      x.casos++;
      /* «Sin resolver» solo si sigue vivo Y no está archivado NI es un aviso ya
         vencido: un aviso archivado se queda en estado 'abierta' (los avisos no
         cambian de estado, se cierran archivándose o al vencer), y sin este
         filtro se contaba como pendiente. */
      if (pub && ABIERTOS.includes(pub.estado) && !pub.archivado_en
          && !avisoVencido(pub.tipo, pub.fecha_limite)) x.abiertos++;
      x.coments += ((v.pub as any)?.comentarios?.[0]?.count ?? 0);
    }
    act.set(v.entidad_id, x);
  });

  const posts = postsAll || [];
  const coincide = buscadorDe(q);   // el mismo motor que el buscador global

  /* Lo que hay que arreglar. Son las mismas reglas que ya avisan en la ficha
     y en el vigía: si el sistema sabe señalarlas de a una, tiene que saber
     listarlas todas juntas. */
  const PRUEBA_F: Record<string, (p: any) => boolean> = {
    sin_empresa: p => !p.emp,
    gan_incompleta: p => p.estado === "ganadora"
      && (!p.codigo_acta || !p.monto_adjudicado || !p.fecha_limite_rendicion),
    sin_rendicion: p => p.estado === "ganadora"
      && !p.fecha_limite_rendicion && !p.fecha_prorroga,
    /* Debiendo: el plazo pasó y no hay entrega. Lo más grave que le puede
       pasar a la empresa ante DAFO, y hasta hoy no se podía listar porque el
       sistema lo daba por cerrado. */
    debiendo: rendicionVencida,
  };

  const filtradas = posts.filter((p: any) =>
    (!e || p.estado === e) &&
    // Año de verdad, del concurso. Antes esto se hacía buscando "2026" como
    // texto: una postulación con «CDO-P-2026-14» salía en cualquier año.
    (!aAlcance || String(p.conv?.anio || "") === aAlcance) &&
    (!c || p.conv?.id === c) &&
    (!t || p.proy?.tipo === t) &&
    (!f || PRUEBA_F[f]?.(p)) &&
    // El código del acta y el de la plataforma DAFO también: son los números
    // con los que llega un correo del Ministerio
    (!q || coincide(pal(
      p.codigo, p.codigo_plataforma, p.codigo_acta, p.proy?.nombre,
      p.emp?.nombre, p.conv?.codigo, p.conv?.nombre, p.conv?.anio, p.estado))));

  /* Los conteos del panel se cuentan DENTRO del año elegido. Si el chip dijera
     «Ganadoras · 9» y al pulsarlo salieran tres, el número habría dejado de
     ser una promesa para ser un adorno — y un contador en el que no se confía
     no se vuelve a mirar. El marcador de la portada sigue siendo histórico,
     que es justo lo que ahí se viene a ver. */
  const enAlcance = aAlcance
    ? posts.filter((p: any) => String(p.conv?.anio || "") === aAlcance)
    : posts;
  const cnt = (est: string) => enAlcance.filter((p: any) => p.estado === est).length;
  const cntF = (k: string) => enAlcance.filter(PRUEBA_F[k]).length;
  const tipos = [...new Set(enAlcance.map((p: any) => p.proy?.tipo).filter(Boolean))];
  const ganas = posts.filter((p: any) => p.estado === "ganadora");
  const enJuego = posts.filter((p: any) => EN_JUEGO.includes(p.estado));
  const decididas = posts.length - enJuego.length;
  const efectividad = decididas > 0 ? Math.round((ganas.length / decididas) * 100) : null;
  const montoHist = ganas.reduce((s: number, g: any) => s + (parseFloat(g.monto_adjudicado) || 0), 0);
  const anios = posts.map((p: any) => p.conv?.anio).filter(Boolean);
  const porAnio = [...new Set(anios)].sort((a: any, b: any) => b - a);

  /* ── LOS CONCURSOS A LOS QUE FUIMOS ──
     Solo los que tienen postulación: el catálogo entero de DAFO no es un
     filtro de esta pantalla —aquí no hay nada que enseñar de un concurso al
     que no nos presentamos—.
     Acotados al AÑO que esté elegido, y por eso el chip conserva `a` en su
     enlace: veinte concursos de siete años en una fila no se eligen, se
     sufren, y el año es el corte que ya está a la vista justo encima. Sin año
     elegido salen todos, que es lo coherente con el resto del panel. */
  const convsFiltro = (() => {
    const m = new Map<string, { id: string; codigo: string; nombre: string; anio: any; n: number }>();
    posts.forEach((p: any) => {
      const cv = p.conv;
      if (!cv?.id) return;
      if (aAlcance && String(cv.anio || "") !== aAlcance) return;
      const x = m.get(cv.id) || { id: cv.id, codigo: cv.codigo || "—", nombre: cv.nombre || "", anio: cv.anio, n: 0 };
      x.n++; m.set(cv.id, x);
    });
    return [...m.values()].sort((x, y) =>
      /* Por año descendente y luego por código: sin año elegido, lo reciente
         primero es lo que se busca; dentro de un año, el orden del código es
         el que la gente ya tiene en la cabeza. */
      (Number(y.anio) || 0) - (Number(x.anio) || 0) || x.codigo.localeCompare(y.codigo));
  })();

  /* ── El embudo del año ──
   *
   * «Entran varios, según las fechas del cronograma avanzan, solo algunos
   *  pasan, y al final unos cuantos ganan.»
   *
   * La lista de «rutas activas» no era eso: mostraba las 20 que siguen vivas
   * y escondía a las que quedaron en el camino. **Un embudo se entiende por lo
   * que se cae.** Sin los caídos es una lista con forma de lista.
   *
   * Los cuatro escalones son acumulativos y por eso se estrechan: toda
   * ganadora fue finalista, toda finalista fue enviada, toda enviada se
   * preparó. El número de cada banda cuenta a las que LLEGARON hasta ahí,
   * incluidas las que siguieron. Así el ancho significa algo.
   */
  /* El embudo arranca en el año EN CURSO, no en el más alto. Las convocatorias
     del año siguiente se cargan con meses de antelación, así que `Math.max`
     abría la portada con el embudo del 2027 —tres postulaciones sin enviar—
     como si fuera el resumen del trabajo. Si el año en curso todavía no tiene
     ninguna, sí manda el más alto: un embudo vacío no dice nada. */
  /* ── YA NO HAY COMBOS: TODO ES CHIP ──
     ⚠ Aquí decía «chips para lo que tiene tope; combo para lo que crece sin
     techo —los años, y las convocatorias, que ya pasan de treinta—. La regla
     es ¿esta lista tiene final?». Esa regla existía por UN motivo concreto y
     el motivo ya no está: con `flex-wrap`, treinta convocatorias ocupaban
     cuatro renglones y empujaban el panel entero fuera de la vista. Desde que
     `.filt-tira` es una sola línea que se desplaza (ver components/Filtros),
     una dimensión de treinta cuesta exactamente lo mismo que una de seis: un
     renglón. La lista sin final dejó de ser un problema de sitio.

     Y volver a chip no es solo cosmético, gana tres cosas que el desplegable
     no podía dar:
      · Los CONTEOS se ven sin abrir nada. «No aptas · 5» al lado de «Aptas ·
        5» es la comparación que uno viene a hacer; dentro de un menú hay que
        abrirlo y recordar.
      · Se ve QUÉ HAY. Con el combo cerrado, que existieran nueve
        convocatorias de este año era invisible hasta pulsarlo.
      · Un clic en vez de dos.

     `components/FiltroCombo` se queda sin usos con esto y se borra: un
     componente que ya no se monta en ninguna parte es una respuesta a una
     pregunta que la app dejó de hacerse. */
  const conAnio = todosAnios ? "a=todos&" : `a=${aAlcance}&`;
  const nAnio = (y: any) => anios.filter((x: any) => x === y).length;
  /* Lo que comparten los nombres de las convocatorias que se van a pintar. Se
     calcula UNA vez y sobre `convsFiltro` —las de esta pantalla, ya acotadas
     por el año—, no sobre el catálogo entero: el prefijo que sobra depende de
     con quién se la esté comparando. */
  const prefConv = prefijoComun(convsFiltro.map(cv => cv.nombre || ""));

  const anioEmbudo = Number(searchParams?.y)
    || (anios.includes(Number(anioActual)) ? Number(anioActual) : 0)
    || Math.max(...(anios.length ? anios : [Number(anioActual)]));
  const delAnio = posts.filter((p: any) => p.conv?.anio === anioEmbudo);

  /* Hasta dónde llegó cada una. Hay DOS jueces y no uno, y por eso son cinco
     escalones: primero DAFO revisa papeles y declara APTAS —un revisor,
     administrativo, antes de que nadie lea el tratamiento— y recién después
     el jurado elige. Sin ese paso, «no seleccionada» mezclaba al descartado
     por un RUC con el que no convenció con su película. */
  const LLEGO: Record<string, number> = {
    en_preparacion: 1, retirada: 1,
    /* En subsanación llegó a ENVIARSE: DAFO la recibió, la observó y la
       devolvió para corregir. Por eso comparte escalón con `enviada` y NO
       está en `CAE`: no se cayó, sigue en carrera —es lo mismo que dice
       `EN_JUEGO`— y se pinta entre las vivas de esa banda. */
    enviada: 2, no_apta: 2, en_subsanacion: 2,
    apta: 3, no_seleccionada: 3,
    finalista: 4, finalista_no_ganadora: 4,
    ganadora: 5,
  };
  const CAE: Record<string, string> = {
    retirada: "se retiraron",
    no_apta: "no aptas — DAFO las sacó por papeles",
    no_seleccionada: "no las eligió el jurado",
    finalista_no_ganadora: "finalistas que no ganaron",
  };
  /* Dos dineros distintos, y antes eran uno solo —por eso «S/ 400,000»
     aparecía en las cuatro bandas—: `monto_adjudicado` solo lo tienen las
     ganadoras, así que las trece preparadas «valían» los 400 mil de la única
     que ganó. Arriba lo que hay EN JUEGO (el estímulo de su convocatoria);
     abajo, lo GANADO. */
  const enJuegoDe = (l: any[]) => l.reduce((s, p) => s + (parseFloat(p.conv?.monto_adjudicado) || 0), 0);
  const monto = (l: any[]) => l.reduce((s, p) => s + (parseFloat(p.monto_adjudicado) || 0), 0);

  const ESCALONES: [number, string, string, string][] = [
    [1, "🛠", "Se prepararon", "var(--violet)"],
    [2, "📨", "Se enviaron", "var(--blue)"],
    [3, "✅", "Aptas — pasaron el filtro de DAFO", "var(--teal)"],
    [4, "⭐", "Finalistas", "var(--yellow)"],
    [5, "🏆", "Ganaron", "var(--green)"],
  ];
  const embudo = ESCALONES.map(([n, ico, txt, col]) => {
    const llegaron = delAnio.filter((p: any) => (LLEGO[p.estado] ?? 0) >= n);
    // Se cayeron EN este escalón: llegaron hasta aquí y no siguieron
    const caidos = delAnio.filter((p: any) => (LLEGO[p.estado] ?? 0) === n && !!CAE[p.estado]);
    const vivos = delAnio.filter((p: any) => (LLEGO[p.estado] ?? 0) === n && !CAE[p.estado]);
    return { n, ico, txt, col, llegaron, caidos, vivos };
  });
  const base = Math.max(1, embudo[0].llegaron.length);
  /* ── LAS QUE EL EMBUDO NO SABE DÓNDE PONER ──
     ⚠ Esto nació de un fallo real y su única misión es que no se repita. Una
     postulación con un estado que no esté en `LLEGO` saca 0 y no supera el
     `>= 1` de ninguna banda: desaparece de las cinco, del cálculo de los
     porcentajes y de la base. Y no da error — el embudo sale entero y
     coherente consigo mismo, solo que hablando de menos postulaciones de las
     que hay. Pasó con `en_subsanacion` y se descubrió porque alguien comparó
     el «21 postulaciones» del título con el «16 se prepararon» de la primera
     banda.
     Ese es justo el chivato, así que ahora lo dice la pantalla en vez de
     dejarlo a la vista de quien se fije. Con todos los estados conocidos
     `perdidas` es 0 y no se pinta nada. */
  const perdidas = delAnio.length - embudo[0].llegaron.length;
  const ganaronAnio = delAnio.filter((p: any) => p.estado === "ganadora");
  const decidióAnio = delAnio.filter((p: any) => !EN_JUEGO.includes(p.estado)).length;

  const Fila = (p: any) => {
    const x = act.get(p.id) || VACIO;
    const rend = plazoRendicion(p);
    /* Solo cuenta los días de las que siguen abiertas: una ganadora ya
       rendida no «vence» nada, y pintarla en rojo por una fecha vieja manda
       a alguien a resolver algo que ya está hecho. */
    const dRend = ejecutando(p) && rend ? dias(rend) : null;
    /* Las que ya cerraron SIN ganar salen apagadas: son historia, no compiten.
       La regla entera vive en lib/resultados.ts → `postApagada`, porque el
       listado de convocatorias tiene que apagar exactamente lo mismo — y hasta
       ahora copiaba solo la mitad. */
    const apagada = postApagada(p, p.conv?.estado);
    /* El RESULTADO no debe pasar desapercibido: se refuerza tiñendo toda la
       tarjeta muy tenue con el color del estado (borde izquierdo + degradado
       que se apaga hacia la derecha), la misma técnica que los casos del feed.
       Ganadora glow verde, no apta rojo, finalista ámbar… de un vistazo. */
    const estCol = EST_META[p.estado]?.[1] || "var(--muted)";

    /* ══ LA QUE YA CERRÓ SIN GANAR SE PLIEGA A UN RENGLÓN ══
       Una tarjeta entera son cinco bloques —el trío con sus retratos, la fila
       de avatares del equipo, la vida en CrewHub+, la línea de tiempo— y los
       cinco contestan preguntas de algo que TODAVÍA COMPITE: quién lo lleva,
       qué falta, qué fecha se viene. Sobre una postulación decidida ninguna de
       esas preguntas tiene sentido, y aun así ocupaba lo mismo que una viva:
       en un año con veintiuna, las cinco que perdieron empujaban fuera de la
       pantalla a las que todavía se pueden trabajar.

       ⚠ Y el riel MENTÍA. PO-051 perdió, y su línea de tiempo seguía
       anunciando «sigue: Declaración de ganadores · en 4 días» porque las
       fechas son de la convocatoria, no suyas. No era un adorno de más: era
       una fecha futura sobre algo que ya terminó.

       Se queda lo que sirve para encontrarla y para saber qué le pasó: código,
       proyecto, empresa, concurso y desenlace. Lo demás está a un clic, en su
       ficha. */
    if (postCerradaSinPremio(p.estado)) {
      return (
        <Link key={p.id} href={`/entidad/postulacion/${p.id}`}>
          <div className="card link post-apagada post-cerrada"
            style={{ cursor: "pointer",
              borderLeft: `3px solid color-mix(in srgb, ${estCol} 45%, transparent)` }}>
            <b className="pc-cod">🎯 {p.codigo || "—"}</b>
            <span className="pc-nom" style={{ color: "var(--violet)" }}>{p.proy?.nombre || "—"}</span>
            {p.emp?.nombre && <span className="pc-emp">{p.emp.nombre}</span>}
            <span style={{ flex: 1 }} />
            {p.conv && (
              <span className="pc-conv"
                title={`${p.conv.codigo} · ${p.conv.nombre || ""}${p.conv.anio ? ` · ${p.conv.anio}` : ""}`}>
                📜 {p.conv.codigo}
              </span>
            )}
            <span className="badge" style={{ color: estCol, background: "#1c1c2c" }}>
              {(EST_META[p.estado]?.[0] || p.estado).replace(/^\S+ /, "")}
            </span>
          </div>
        </Link>
      );
    }

    return (
    <Link key={p.id} href={`/entidad/postulacion/${p.id}`}>
      <div className={`card link${apagada ? " post-apagada" : ""}`}
        style={{ cursor: "pointer", padding: "12px 16px",
          borderLeft: `3px solid color-mix(in srgb, ${estCol} 55%, transparent)`,
          backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${estCol} 7%, transparent), transparent 58%)` }}>
        {/* línea 1: código a la IZQUIERDA; el concurso y el estado a la DERECHA
            —así el nombre largo de la convocatoria no apila texto sobre el trío
            que va debajo. */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 14.5 }}>🎯 {p.codigo || "—"}</b>
          <span style={{ flex: 1 }} />
          {p.conv && (
            <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)", textTransform: "none", letterSpacing: 0, maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={`${p.conv.codigo} · ${p.conv.nombre || ""}${p.conv.anio ? ` · ${p.conv.anio}` : ""}`}>
              📜 {p.conv.codigo}{p.conv.nombre ? ` · ${p.conv.nombre}` : ""}{p.conv.anio ? ` · ${p.conv.anio}` : ""}
            </span>
          )}
          {p.estado === "ganadora" && p.monto_adjudicado && (
            <span style={{ color: "var(--teal)", fontSize: 12.5 }}>
              S/ {parseFloat(p.monto_adjudicado).toLocaleString("es-PE")}
            </span>
          )}
          <span className="badge" style={{ color: EST_META[p.estado]?.[1] || "var(--muted)", background: "#1c1c2c" }}>
            {(EST_META[p.estado]?.[0] || p.estado).replace(/^\S+ /, "")}
          </span>
        </div>

        {/* línea 2: el TRÍO protagonista con sus imágenes — proyecto, empresa y
            director(a), en ese orden y a tamaño legible. No son enlaces sueltos
            (toda la fila lleva a la postulación), así que van como retratos, no
            como chips. */}
        {(() => {
          const dir = directorDe(p);
          const cProy = p.proy?.id ? cartelDe.get(`proyecto:${p.proy.id}`) : null;
          const cEmp = p.emp?.id ? cartelDe.get(`empresa:${p.emp.id}`) : null;
          const retrato = (img: string | null | undefined, emoji: string, cls: string) =>
            img
              ? // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" referrerPolicy="no-referrer" className={`pt-img ${cls}`} />
              : <span className={`pt-img pt-ph ${cls}`}>{emoji}</span>;
          return (
            <div className="post-trio">
              <span className="pt-item">
                {retrato(cProy, "📁", "")}
                <span className="pt-txt">
                  {/* El trío lleva su color de identidad: proyecto=violeta,
                      empresa=teal, director(persona)=azul. Así el ojo lee qué es
                      cada uno por su color, no solo por el ícono. */}
                  <span className="pt-nom" style={{ color: "var(--violet)" }}>{p.proy?.nombre || "—"}</span>
                  {p.proy?.tipo && <span className="pt-rol" style={{ color: TIPO_COLOR[p.proy.tipo] || "var(--dim)" }}>{p.proy.tipo.replace(/_/g, " ")}</span>}
                </span>
              </span>
              <span className="pt-item">
                {p.emp
                  ? retrato(cEmp, "🏢", "")
                  : <span className="pt-img pt-ph pt-falta">⚠</span>}
                <span className="pt-txt">
                  <span className="pt-nom" style={{ color: p.emp ? "var(--teal)" : "var(--red)" }}>{p.emp?.nombre || "sin empresa"}</span>
                  <span className="pt-rol">empresa</span>
                </span>
              </span>
              <span className="pt-item">
                {retrato(dir?.foto_url, "🎬", "pt-redondo")}
                <span className="pt-txt">
                  <span className="pt-nom" style={{ color: dir ? "var(--blue)" : "var(--dim)" }}>{dir ? (dir.alias || dir.nombre) : "sin director/a"}</span>
                  <span className="pt-rol">director/a</span>
                </span>
              </span>
              {/* Su vida en CrewHub+ (rendición + casos + comentarios) va en la
                  misma fila del trío, empujada a la derecha: antes ocupaba una
                  franja aparte que quedaba casi vacía a la izquierda. */}
              <span className="pt-vida">
                {/* La rendición manda: es la única fecha con consecuencia legal */}
                {p.fecha_rendicion_real && (
                  <span style={{ color: "var(--green)", fontWeight: 700 }}
                    title="Fondo cerrado: la empresa vuelve a estar libre para postular">
                    ✅ rendida el {p.fecha_rendicion_real}
                  </span>
                )}
                {dRend !== null && (
                  <span style={{ fontWeight: 700,
                    color: dRend < 0 ? "var(--red)" : dRend <= 60 ? "var(--yellow)" : "var(--dim)" }}
                    title={dRend < 0 ? "El plazo pasó y no hay entrega registrada. Si ya se entregó, ponle la fecha en «Rendición entregada el»." : undefined}>
                    🧾 {dRend < 0 ? `rendición vencida hace ${-dRend}d` : `rinde en ${dRend}d`}
                    {p.fecha_prorroga ? " (prórroga)" : ""}
                  </span>
                )}
                {ejecutando(p) && !rend && (
                  <span style={{ color: "var(--yellow)", fontWeight: 700 }}>⚠ sin fecha de rendición</span>
                )}
                {x.abiertos > 0 && <span style={{ color: "var(--red)" }}>❗ {x.abiertos} sin resolver</span>}
                <span style={{ color: "var(--dim)" }} title="Casos vinculados">📌 {x.casos}</span>
                <span style={{ color: "var(--muted)" }} title="Comentarios">💬 {x.coments}</span>
                {x.muro > 0 && <span style={{ color: "var(--muted)" }} title="Notas del muro">📝 {x.muro}</span>}
                {!x.casos && !x.muro && <span style={{ color: "var(--dim)" }}>sin actividad</span>}
              </span>
            </div>
          );
        })()}
        {/* fila del EQUIPO que postula: solo caras (avatares), ordenadas por
            jerarquía de rol (director primero). Para no cargar la fila, el
            nombre corto y el cargo aparecen al pasar el cursor. */}
        {(() => {
          const eqp = ordenarEquipo(equipoPorPost.get(p.id) || []);
          if (!eqp.length) return null;
          return (
            <div className="post-equipo">
              {eqp.map((r: any, i: number) => (
                <span key={i} className="post-eq-av"
                  title={`${r.persona?.alias || r.persona?.nombre}${r.cargo ? ` · ${r.cargo}` : ""}`}>
                  <Avatar nombre={r.persona?.nombre} src={r.persona?.foto_url} size={33} />
                </span>
              ))}
            </div>
          );
        })()}
        {/* línea 3: la LÍNEA DE TIEMPO del concurso (los hitos de su
            convocatoria) — la misma de la cancha, para ver de un vistazo qué
            fecha se viene. Solo si la convocatoria tiene fechas cargadas. */}
        {p.conv?.id && (hitosPorConv.get(p.conv.id)?.length ?? 0) > 0 && (
          <div className="post-riel">
            <RielHitos hitos={hitosPorConv.get(p.conv.id) || []} hoy={hoyS} />
          </div>
        )}
      </div>
    </Link>
    );
  };

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/casos/postulacion" className="btn btn-ghost"
          title="Todos los casos, agrupados por postulación">🗂 Casos</Link>
        <Link href="/historial/postulacion" className="btn btn-ghost"
          title="Todo lo que se movió en las postulaciones, por periodo">🕐 Historial</Link>
      </div>
      <h1 className="title-lg">🎯 Postulaciones</h1>
      {qErr && (
        <div className="card" style={{ borderColor: "var(--red)", color: "var(--red)", fontSize: 13 }}>
          ⚠ Error al consultar postulaciones: {qErr.message}
        </div>
      )}

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {e && <input type="hidden" name="e" value={e} />}
        {/* BUSCAR ES GLOBAL mientras nadie haya elegido un año a mano. El panel
            arranca acotado al año en curso, y si esa acotación se colara aquí,
            buscar «Solischa» —del 2023— no devolvería nada y la pantalla diría
            «sin resultados» sobre algo que existe. El año viaja explícito en la
            URL y el combo lo dice, así que el alcance de la búsqueda siempre
            está a la vista. */}
        <input type="hidden" name="a" value={a || "todos"} />
        {c && <input type="hidden" name="c" value={c} />}
        {t && <input type="hidden" name="t" value={t} />}
        {f && <input type="hidden" name="f" value={f} />}
        <span className="buscador-lista">
          <span className="bg-lupa">🔍</span>
          <input name="q" defaultValue={q}
            placeholder="Proyecto, código, empresa, concurso, código de acta…" />
        </span>
        <button className="btn" type="submit">Buscar</button>
      </form>

      <PanelFiltros limpiar="/postulaciones" mostrarLimpiar={listar}>
        {/* Todo filtro conserva el AÑO. Antes cada chip escribía un único
            parámetro y borraba lo demás, así que elegir «Aptas» dentro del
            2026 devolvía las aptas de siete años: el panel deshacía el corte
            que uno acababa de hacer. */}
        <FilaFiltro titulo="Estado">
          {Object.entries(EST_META).map(([k, [lbl, col]]) => {
            const n = cnt(k);
            return n === 0 ? null : (
              <Chip key={k} href={`/postulaciones?${conAnio}e=${k}`} on={e === k} color={col}>
                {lbl} · {n}
              </Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="Año del concurso">
          {/* ── SE MARCA EL AÑO QUE MANDA, NO EL QUE SE PULSÓ ──
              ⚠ Con el desplegable esto no se podía, y el porqué estaba escrito
              aquí: al entrar sin elegir nada el panel YA está acotado al año en
              curso, pero marcar 2026 en el menú lo dejaba sin salida — un menú
              no reacciona al valor que ya tiene, así que volver a pulsar 2026
              no hacía nada y no había forma de llegar a la lista del año desde
              aquí. Se marcaba el valor elegido (vacío) y el año real iba en la
              etiqueta: dos cosas para decir una.
              Un chip es un enlace, y pulsar el que ya está encendido navega
              igual. Así que se marca `aAlcance` —lo que de verdad está
              filtrando— y la pantalla deja de tener un filtro activo que no se
              veía activo. */}
          {porAnio.map((y: any) => (
            <Chip key={y} href={`/postulaciones?a=${y}`}
              on={!todosAnios && String(y) === aAlcance}>
              {y} · {nAnio(y)}
            </Chip>
          ))}
          {/* La escapatoria. Con el desplegable era obligatoria —no tenía
              «ninguno»— y con chips también hace falta: el año en curso manda
              aunque nadie lo pulse, así que sin esto no hay forma de mirar los
              siete años juntos. */}
          <Chip href="/postulaciones?a=todos" on={todosAnios}>
            Todos los años · {anios.length}
          </Chip>
        </FilaFiltro>
        {convsFiltro.length > 0 && (
          <FilaFiltro titulo="Convocatoria">
            <Chip href={`/postulaciones?${conAnio.slice(0, -1)}`} on={!c}>
              Todas · {convsFiltro.length}
            </Chip>
            {/* ── EL CÓDIGO NO BASTA, Y EL NOMBRE ENTERO NO CABE ──
                ⚠ Estos chips salieron diciendo solo «C-060 · 1», «C-062 · 4»…
                y eso no se puede elegir: los códigos no se saben de memoria, y
                nueve seguidos son nueve etiquetas indistinguibles. El menú de
                antes al menos llevaba el nombre completo dentro.
                Pero el nombre completo tampoco cabe —«Concurso de Proyectos de
                Animación» por nueve es una tira por la que hay que viajar— y
                ahí está el truco: las cuatro primeras palabras son IDÉNTICAS en
                las nueve. Lo que todas comparten no distingue a ninguna.
                `prefijoComun` lo mide sobre lo que hay en pantalla y lo quita,
                así que el chip dice «C-072 · Animación · 4»: el código para
                nombrarla, la palabra que la distingue para reconocerla.
                El nombre entero sigue en el `title`, y la elegida se nombra
                completa en el resumen de resultados, justo debajo.
                El año solo cuando se ven todos: dentro de un año ya elegido,
                repetirlo nueve veces no distingue nada. */}
            {convsFiltro.map(cv => {
              const corto = sinPrefijo(cv.nombre || "", prefConv);
              return (
                <Chip key={cv.id} href={`/postulaciones?${conAnio}c=${cv.id}`} on={c === cv.id}
                  title={`${cv.codigo} · ${cv.nombre}${cv.anio ? ` (${cv.anio})` : ""} — ${cv.n} postulación(es)`}>
                  {cv.codigo}
                  {/* Acotado con elipsis: el recorte del prefijo depende de qué
                      convocatorias haya en pantalla, así que un año con nombres
                      que no se parecen entre sí las deja enteras — y una sola
                      larga no puede estirar la fila hasta hacerla inmanejable. */}
                  {corto && <span className="filt-corto"> · {corto}</span>}
                  {todosAnios && cv.anio ? ` (${cv.anio})` : ""} · {cv.n}
                </Chip>
              );
            })}
          </FilaFiltro>
        )}
        <FilaFiltro titulo="Tipo de proyecto">
          {tipos.map((tt: any) => (
            <Chip key={tt} href={`/postulaciones?${conAnio}t=${tt}`} on={t === tt} color={TIPO_COLOR[tt]}>
              {tt.replace(/_/g, " ")} · {enAlcance.filter((p: any) => p.proy?.tipo === tt).length}
            </Chip>
          ))}
        </FilaFiltro>
        <FilaFiltro titulo="Atención">
          <Chip href={`/postulaciones?${conAnio}f=debiendo`} on={f === "debiendo"} color="var(--red)"
            title="El plazo de rendición pasó y no hay entrega registrada. Mientras siga así, la empresa no puede postular a nada.">
            🔴 rendición vencida · {cntF("debiendo")}
          </Chip>
          <Chip href={`/postulaciones?${conAnio}f=sin_empresa`} on={f === "sin_empresa"} color="var(--red)"
            title="Sin empresa postulante: no puede firmar el acta ni cobrar">
            ⚠ sin empresa · {cntF("sin_empresa")}
          </Chip>
          <Chip href={`/postulaciones?${conAnio}f=gan_incompleta`} on={f === "gan_incompleta"} color="var(--yellow)"
            title="Ganadoras a las que les falta acta, monto o fecha de rendición">
            🏆 ganadoras incompletas · {cntF("gan_incompleta")}
          </Chip>
          <Chip href={`/postulaciones?${conAnio}f=sin_rendicion`} on={f === "sin_rendicion"} color="var(--yellow)"
            title="Ganó, pero nadie registró hasta cuándo hay que rendir">
            🧾 sin fecha de rendición · {cntF("sin_rendicion")}
          </Chip>
        </FilaFiltro>
      </PanelFiltros>

      {!listar && (
        <>
          {/* Solo lo que informa: los conteos por estado son filtros y viven
              arriba, en el panel. Esto no filtra nada — es el marcador. */}
          <div className="stat-grid">
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>
                {efectividad != null ? `${efectividad}%` : "—"}
              </span>
              <span className="stat-l">efectividad · {ganas.length} de {decididas} decididas</span>
            </span>
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--teal)", fontSize: 19, display: "block" }}>
                S/ {montoHist.toLocaleString("es-PE")}
              </span>
              <span className="stat-l">🏆 ganado en total</span>
            </span>
            <span className="stat-card" style={{ display: "block" }}>
              <span className="stat-n" style={{ color: "var(--blue)", display: "block" }}>{enJuego.length}</span>
              <span className="stat-l">🎯 en juego ahora</span>
            </span>
          </div>

          {/* ── El embudo del año ──
              Antes esto era «🎯 Rutas activas»: una lista plana de las 20 que
              siguen vivas. Un embudo se entiende por lo que se cae, y los
              caídos no estaban. Ahora el ancho de cada banda dice cuántas
              llegaron hasta ahí, y al costado, en gris, las que se quedaron. */}
          {delAnio.length > 0 && (
            <div className="card" style={{ borderColor: "rgba(59,130,246,.35)" }}>
              <div className="panel-h" style={{ color: "var(--blue)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1 }}>🎯 Embudo {anioEmbudo} · {delAnio.length} postulaciones</span>
                {perdidas > 0 && (
                  <span className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.12)" }}
                    title="Tienen un estado que este embudo no sabe en qué escalón poner, así que no están contadas en ninguna banda ni en los porcentajes. Es un fallo del código, no de los datos: falta añadir ese estado al mapa LLEGO de esta pantalla.">
                    ⚠ {perdidas} fuera del embudo
                  </span>
                )}
                {/* Navegar años: el embudo de un año es una historia cerrada */}
                {porAnio.filter((y: any) => y !== anioEmbudo).map((y: any) => (
                  <Link key={y} href={`/postulaciones?y=${y}`} className="badge"
                    style={{ color: "var(--dim)", background: "#1c1c2c", textDecoration: "none" }}>{y}</Link>
                ))}
              </div>

              {embudo.map(({ n, ico, txt, col, llegaron, caidos, vivos }) => {
                const pct = Math.round((llegaron.length / base) * 100);
                return (
                  <div key={n} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, marginBottom: 3 }}>
                      <b style={{ color: col }}>{ico} {llegaron.length}</b>
                      <span style={{ color: "var(--muted)" }}>{txt}</span>
                      <span style={{ color: "var(--dim)", fontSize: 11 }}>· {pct}%</span>
                      <span style={{ flex: 1 }} />
                      {/* En juego arriba, ganado abajo: no son lo mismo y
                          mezclarlos hacía que las trece preparadas «valieran»
                          los 400 mil de la única que ganó. */}
                      {n < 5 && enJuegoDe(llegaron) > 0 && (
                        <span style={{ color: "var(--dim)", fontSize: 11 }}>
                          S/ {enJuegoDe(llegaron).toLocaleString("es-PE")} en juego
                        </span>
                      )}
                      {n === 5 && monto(llegaron) > 0 && (
                        <span style={{ color: "var(--teal)", fontSize: 11.5, fontWeight: 700 }}>
                          S/ {monto(llegaron).toLocaleString("es-PE")} ganados
                        </span>
                      )}
                    </div>
                    {/* La barra ES el embudo: se estrecha sola porque toda
                        ganadora fue finalista, toda finalista fue enviada. Por
                        eso el CARRIL tiene que medir lo mismo en todas las
                        filas — un embudo cuyo ancho no se puede comparar entre
                        filas no es un embudo, es un adorno.
                        ⚠ Ahora ocupa el ANCHO ENTERO. Antes cedía 190 px fijos
                        a la columna de los caídos, y esa columna se reservaba
                        aunque estuviera vacía: la barra medía menos de lo que
                        podía en todas las bandas para dejar sitio a un texto
                        que solo aparece en tres. Y encima no cabía —«5 no aptas
                        — DAFO las sacó por p…»—. El texto se fue abajo, con el
                        resto del desglose, y el carril recuperó su ancho. */}
                    <span style={{ display: "block", height: 10, background: "var(--bg)", borderRadius: 5, overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", borderRadius: 5,
                        width: `${Math.max(pct, llegaron.length ? 3 : 0)}%`, background: col, opacity: .85 }} />
                    </span>
                    {/* ── EL DESGLOSE DE LA BANDA, EN UNA SOLA LÍNEA ──
                        ⚠ Las tres cifras de una misma banda vivían en tres
                        sitios: el total arriba, los caídos a la derecha de la
                        barra y el resto debajo, antes de los chips. Tres trozos
                        de la misma resta repartidos por la fila, y ninguno
                        decía que fueran la misma resta.
                        Juntos y en el orden del embudo —lo que siguió, lo que
                        está, lo que se fue— la cuenta se comprueba leyendo:
                        9 + 6 + 5 = las 20 de la banda. Ese cuadre es lo que
                        contesta el «dice 20 y solo veo 6» sin tener que
                        explicarlo en ningún sitio.
                        Va SIEMPRE que haya algo que desglosar, aunque no queden
                        chips debajo: una banda de la que todas avanzaron
                        también tiene una historia, y antes esa no se contaba
                        porque la línea colgaba de que hubiera `vivos`. */}
                    {(vivos.length > 0 || caidos.length > 0) && (
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
                        <span className="emb-desglose">
                          {llegaron.length - vivos.length - caidos.length > 0 && (
                            <span>{llegaron.length - vivos.length - caidos.length} avanzaron</span>
                          )}
                          {vivos.length > 0 && (
                            <span style={{ color: col }}>
                              {vivos.length} {n === 5 ? "ganaron" : "siguen aquí"}
                            </span>
                          )}
                          {/* Los que se cayeron aquí: el embudo se explica por
                              ellos, así que se pueden ABRIR. Los nombres vivían
                              en el `title` del navegador —había que acertar a
                              dejar el ratón quieto encima, no se podía pulsar
                              ninguno, y en una tableta no existían—, y «cuáles
                              son» es justo lo que se viene a preguntar aquí. */}
                          {caidos.length > 0 && (() => {
                            /* ⚠ El código de la convocatoria SOLO no dice nada:
                               «C-068» no es un concurso, es una etiqueta que hay
                               que ir a buscar. Y las caídas de una banda suelen
                               ser de convocatorias distintas —C-067, C-068,
                               C-072—, así que sin el nombre no se puede ni
                               agrupar mentalmente lo que se está mirando.
                               El nombre entero tampoco cabe en un pop-up de 420,
                               y aquí sirve el mismo truco que en los filtros: lo
                               que estas convocatorias COMPARTEN no distingue a
                               ninguna. Se mide sobre las de ESTA banda —no sobre
                               las del año— porque es esta lista la que se está
                               leyendo. */
                            const pref = prefijoComun(caidos.map((p: any) => p.conv?.nombre || ""));
                            return (
                              <CaidosPop n={caidos.length} motivo={CAE[caidos[0].estado]}
                                caidos={caidos.map((p: any) => ({
                                  id: p.id, codigo: p.codigo,
                                  proyecto: p.proy?.nombre, empresa: p.emp?.nombre,
                                  conv: p.conv?.codigo,
                                  convNombre: sinPrefijo(p.conv?.nombre || "", pref),
                                  convEntera: `${p.conv?.codigo || ""} · ${p.conv?.nombre || ""}`.trim(),
                                }))} />
                            );
                          })()}
                        </span>
                        {vivos.map((p: any) => (
                          <Link key={p.id} href={`/entidad/postulacion/${p.id}`} className="badge"
                            title={`${p.conv?.nombre || ""} ${p.conv?.anio || ""} · ${p.emp?.nombre || "sin empresa"}`}
                            style={{ color: col, background: `color-mix(in srgb, ${col} 12%, transparent)`,
                              textTransform: "none", letterSpacing: 0, textDecoration: "none", fontSize: 11 }}>
                            {p.proy?.nombre || p.codigo}
                            {p.conv?.codigo && <i style={{ opacity: .55, fontStyle: "normal" }}> · {p.conv.codigo}</i>}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* El resultado, cuando ya se sabe */}
              {decidióAnio > 0 && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4,
                  fontSize: 11.5, color: "var(--dim)" }}>
                  {ganaronAnio.length > 0
                    ? <>🏆 <b style={{ color: "var(--green)" }}>{ganaronAnio.length} de {decidióAnio}</b> decididas
                        {monto(ganaronAnio) > 0 && <> · <b style={{ color: "var(--teal)" }}>S/ {monto(ganaronAnio).toLocaleString("es-PE")}</b> ganados</>}</>
                    : <>{decidióAnio} decididas, ninguna ganó todavía</>}
                </div>
              )}
            </div>
          )}

        </>
      )}

      {listar && (
        <>
          <div style={{ color: "var(--muted)", fontSize: 13, margin: "2px 4px 10px" }}>
            {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
            {e && ` · ${(EST_META[e]?.[0] || e).toLowerCase()}`}
            {aAlcance ? ` · ${aAlcance}` : " · todos los años"}
            {/* Con la convocatoria elegida, el resumen la dice POR SU NOMBRE y
                no por «C-072»: quien acaba de pulsar el chip ya vio el código,
                lo que quiere confirmar es que es el concurso que pensaba. */}
            {c && ` · ${convsFiltro.find(x => x.id === c)?.nombre || "convocatoria"}`}
            {t && ` · ${t.replace(/_/g, " ")}`}
            {f && ` · ${f.replace(/_/g, " ")}`}{q && ` · «${q}»`}
          </div>
          {/* Agrupadas por año del concurso: una postulación se entiende
              dentro de su temporada — con qué compitió y contra qué. */}
          {(() => {
            const grupos = porAnio
              .map((y: any) => ({ y, filas: filtradas.filter((p: any) => p.conv?.anio === y) }))
              .filter(g => g.filas.length > 0);
            const sinAnio = filtradas.filter((p: any) => !p.conv?.anio);
            if (sinAnio.length) grupos.push({ y: null, filas: sinAnio });

            /* ── DOS SEPARADORES, LA MISMA LÍNEA VIOLETA ──
               Un separador SEPARA, y donde no hay nada que separar estorba: la
               línea «2026 · 21» debajo de «21 resultados · 2026» decía dos
               veces lo mismo, y una etiqueta que siempre está deja de leerse
               justo el día que sí importa. Por eso cada nivel aparece solo
               cuando hay más de un grupo en él.
               Y el nivel que hacía falta era el de ABAJO: dentro de un año, las
               21 postulaciones son de nueve concursos distintos y salían
               mezcladas, así que ubicar «las del C-072» era leer las 21. El año
               es el corte de arriba y la convocatoria el de dentro — el mismo
               orden en que uno pregunta.
               Se distinguen por peso y no por color: el año en versalitas
               grandes, la convocatoria en una línea más fina y con el código
               delante. Dos violetas distintos habrían inventado un significado
               que no existe. */
            const cab = (txt: string, n: number, sub?: string | null, nivel: 1 | 2 = 1) => (
              <div style={{ display: "flex", alignItems: "center", gap: 8,
                margin: nivel === 1 ? "18px 4px 6px" : "14px 4px 6px" }}>
                <span style={{ fontSize: nivel === 1 ? 11 : 10.5, textTransform: "uppercase",
                  letterSpacing: nivel === 1 ? 1.4 : 1, color: "var(--violet)",
                  fontWeight: 700, opacity: nivel === 1 ? 1 : .85 }}>
                  {txt}
                </span>
                {sub && (
                  /* El nombre del concurso en texto normal: en versalitas, seis
                     palabras se vuelven un muro y el código deja de resaltar. */
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{sub}</span>
                )}
                <span style={{ fontSize: 11, color: "var(--dim)" }}>· {n}</span>
                <span style={{ flex: 1, height: 1,
                  background: `linear-gradient(90deg, color-mix(in srgb, var(--violet) ${nivel === 1 ? 45 : 26}%, transparent), transparent)` }} />
              </div>
            );

            const variosAnios = grupos.length > 1;
            return grupos.map(({ y, filas }) => {
              /* Por CÓDIGO y no por cantidad ni por fecha: es el orden que la
                 gente ya tiene en la cabeza y el mismo del combo de arriba, así
                 que buscar en la lista es seguir la misma secuencia que se
                 acaba de leer en el filtro. Las sueltas, al final. */
              const porConv = new Map<string, { codigo: string; nombre: string; filas: any[] }>();
              filas.forEach((p: any) => {
                const k = p.conv?.id || "";
                const g = porConv.get(k)
                  || { codigo: p.conv?.codigo || "Sin convocatoria", nombre: p.conv?.nombre || "", filas: [] };
                g.filas.push(p); porConv.set(k, g);
              });
              const bloques = [...porConv.entries()].sort((x, z) =>
                (x[0] ? 0 : 1) - (z[0] ? 0 : 1) || x[1].codigo.localeCompare(z[1].codigo));
              const variasConvs = bloques.length > 1;
              return (
                <div key={y || "sin"} style={{ marginTop: 6 }}>
                  {variosAnios && cab(String(y || "sin año"), filas.length)}
                  {bloques.map(([k, g]) => (
                    <div key={k || "sin-conv"}>
                      {variasConvs && cab(g.codigo, g.filas.length, g.nombre || null, 2)}
                      {g.filas.map(Fila)}
                    </div>
                  ))}
                </div>
              );
            });
          })()}
          {!filtradas.length && <div className="empty">Sin resultados.</div>}
        </>
      )}
    </div>
  );
}
