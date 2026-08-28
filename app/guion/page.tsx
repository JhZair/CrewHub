import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/Enlace";
import Volver from "@/components/Volver";
import Plegable from "@/components/Plegable";
import Tratamientos from "@/components/Tratamientos";
import { techo } from "@/lib/api";
import { modoGuion } from "@/lib/guion";
import {
  diagnosticar, resumirDiagnostico, ordenarPeliculas, peliculaViva,
  tituloDe, metaNivel, nivelDe, nivelDestino, META_FALTA, TIPOS_CON_GUION,
} from "@/lib/tratamiento";

export const metadata: Metadata = { title: "✍ Guion" };

/* ══════════════════════════════════════════════════════════════════════════
   ✍ EL ÍNDICE DE GUION

   La puerta de una actividad. Quien va a escribir no piensa «voy a la ficha
   del proyecto ROBOTRASH»: piensa «voy a escribir». Era el único módulo grande
   del sistema sin índice —`/fondos`, `/personas`, `/caja`, `/casilla`,
   `/tablero` y `/obligaciones` lo tienen todos— y encima `/guion` daba 404:
   quien borrara el id de la URL, o llegara por un enlace roto, caía en una
   página de error.

   ── AGRUPADO POR PELÍCULA, NO POR DOCUMENTO ──
   La pregunta es «¿cómo va el guion de X?». Cuarenta documentos de quince
   películas ordenados por fecha no la contestan: obligan a leer la lista
   entera para reconstruir mentalmente qué pertenece a qué.

   ── Y EL DIAGNÓSTICO ARRIBA ──
   Qué películas no tienen nada escrito, cuáles tienen documentos pero ninguno
   vigente, cuáles están solo enlazadas a Drive y cuáles de ficción se quedaron
   en el secuenciado. Eso hoy exige abrir proyecto por proyecto, o sea que no
   se mira nunca.
   ⚠ El recuento sale de LAS MISMAS filas que se pintan debajo. Un titular
   calculado aparte del contenido que resume es el que acaba discrepando.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function IndiceGuion({
  searchParams,
}: { searchParams?: { todas?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* ── EL FILTRO VA EN LA URL, NO EN ESTADO ──
     Es otra lista, no otra forma de mirar la misma: «ver también las
     terminadas» tiene que poder enlazarse y volver con el botón de atrás. */
  const todas = searchParams?.todas === "1";

  const [proys, trats, posts] = await Promise.all([
    /* Las películas. Flacas: aquí solo se pintan su nombre, su tipo —que decide
       hasta dónde tiene que llegar el documento— y su etapa.
       ⚠ `.in("tipo", TIPOS_CON_GUION)`: sin esto entraban los videojuegos y la
       gestión cultural, se pintaban con 🎭, sumaban a «N películas» y salían
       acusados de «sin tratamiento» — a un videojuego, encima, exigiéndole
       llegar al guion.
       `techo(n)+1` para poder DETECTAR el corte: lib/api.ts dice que quien
       quiera saber si se recortó pida una fila de más y mire si volvió. */
    supabase.from("proyectos").select("id,nombre,nombre_corto,tipo,etapa")
      .in("tipo", TIPOS_CON_GUION).order("nombre").limit(techo(400) + 1),
    /* Todos los tratamientos, con su recuento de secuencias embebido. Una sola
       consulta para todas las películas: pedirlos por proyecto serían quince
       viajes encadenados.
       ⚠ El `.limit` explícito y por `techo()`: el tope real de PostgREST son
       1000 filas y corta SIN AVISAR. Con más documentos de los que caben, las
       películas del final saldrían «sin tratamiento» — una acusación falsa
       sobre trabajo que sí existe. */
    supabase.from("tratamiento")
      .select("id,proyecto_id,postulacion_id,nombre,version,nivel,estado," +
        "presentado_en,vigente,url,nota,creado_en,secs:guion_secuencias(count)")
      .order("creado_en", { ascending: false }).limit(techo(900) + 1),
    /* ── LOS FONDOS DE CADA PELÍCULA ──
       Para poder marcar aquí mismo a cuál se presentó un documento. Estaba
       fuera «porque es una decisión de expediente», y era una fricción tonta:
       la decisión se toma escribiendo, mirando el documento, y mandar a otra
       pantalla para desplegar un selector de tres opciones es la clase de
       rodeo que hace que el dato no se rellene nunca.
       Flaca —tres columnas— y ordenada por código: no se pinta ningún fondo
       aquí, solo se llena un desplegable. */
    supabase.from("postulaciones")
      .select("id,codigo,proyecto_id,conv:convocatorias(nombre,codigo)")
      .order("codigo").limit(techo(600)),
  ]);

  /* ⚠ Los dos errores se enseñan y NO se tragan con `|| []`. Sin la lista de
     tratamientos, todas las películas saldrían «sin tratamiento»: el
     diagnóstico entero sería falso y en la dirección que más alarma. */
  const eProy = (proys as any)?.error?.message || null;
  const eTrat = (trats as any)?.error?.message || null;
  const fallo = eProy || eTrat;

  /* ── ¿SE CORTÓ? ──
     El comentario de arriba describía el fallo —«las películas del final
     saldrían sin tratamiento, una acusación falsa»— y no lo detectaba. Se pide
     una fila de más y se mira si volvió: es lo que lib/api.ts llama la sonda.
     El corte va por `creado_en desc`, así que lo que se pierde son los
     documentos MÁS ANTIGUOS: justo los de las películas viejas. */
  const cortadoTrat = (trats.data || []).length > techo(900);
  const cortadoProy = (proys.data || []).length > techo(400);

  const listaTrats = ((trats.data || []) as any[]).slice(0, techo(900))
    .map(t => ({ ...t, _n: t.secs?.[0]?.count ?? 0 }));
  const cuentas: Record<string, number> | null = eTrat
    ? null
    : Object.fromEntries(listaTrats.map(t => [t.id, t._n]));

  /* Los fondos, agrupados por película en un solo recorrido. Un `filter` por
     cada una sería recorrer la lista tantas veces como proyectos haya.
     ⚠ Si esta consulta falla NO se rompe nada: el desplegable sale vacío y el
     resto de la pantalla funciona igual. Es decoración, no diagnóstico. */
  const fondosDe = new Map<string, { id: string; codigo: string | null; nombre: string }[]>();
  for (const q of ((posts.data || []) as any[])) {
    if (!q.proyecto_id) continue;
    const conv = Array.isArray(q.conv) ? q.conv[0] : q.conv;
    fondosDe.set(q.proyecto_id, [...(fondosDe.get(q.proyecto_id) || []), {
      id: q.id,
      codigo: q.codigo || null,
      nombre: conv?.nombre || conv?.codigo || "fondo sin código",
    }]);
  }

  const peliculas = ((proys.data || []) as any[]).slice(0, techo(400))
    .filter(p => todas || peliculaViva(p));
  const filas = ordenarPeliculas(
    peliculas.map(p => diagnosticar(p, listaTrats, cuentas)));
  const res = resumirDiagnostico(filas);
  const ocultas = Math.min(((proys.data || []) as any[]).length, techo(400)) - peliculas.length;

  return (
    /* `.shell` + `.topbar`, como el resto de las pantallas: `.wrap` no existe
       en app/globals.css —la página salía a sangre completa, sin ancho máximo
       ni padding, y el «volver» fuera de su barra—. */
    <div className="shell">
      <div className="topbar"><Volver /></div>
      <h1 className="title-lg">✍ Guion</h1>
      <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "-6px 0 14px", lineHeight: 1.6 }}>
        Los tratamientos de cada película: el que se presentó al concurso, el reescrito con las
        notas del jurado, el que se usa para rodar. En documental el destino es el tratamiento
        secuenciado; en ficción y animación, el guion — que se escribe sobre él.
      </div>

      {fallo && (
        <div className="err-inline" style={{ lineHeight: 1.5 }}>
          ⚠ No se pudo leer {eTrat ? "la lista de tratamientos" : "la lista de películas"}. El
          diagnóstico no se pinta: sin esos datos diría que ninguna película tiene nada escrito,
          que es lo contrario de la verdad.
          <br /><code style={{ fontSize: 11, opacity: .85 }}>{fallo}</code>
          {/column|does not exist|schema cache|PGRST20/i.test(fallo) && (
            <><br /><b>Falta correr <code>db/tratamiento.sql</code> en Supabase.</b></>
          )}
        </div>
      )}

      {(cortadoTrat || cortadoProy) && (
        <div className="err-inline" style={{ lineHeight: 1.5 }}>
          ⚠ Hay más {cortadoTrat ? "tratamientos" : "proyectos"} de los que caben en una consulta
          (el tope real de PostgREST es de mil filas). El diagnóstico de abajo está calculado sobre
          una parte, así que <b>puede acusar de «sin tratamiento» a películas que sí lo tienen</b>
          {cortadoTrat && " — se pierden los documentos más antiguos, que son los de las películas viejas"}.
        </div>
      )}

      {/* ── EL DIAGNÓSTICO ──
          Solo con los datos completos. Con la consulta de tratamientos rota,
          «12 sin tratamiento» sería una acusación falsa sobre trabajo real. */}
      {!fallo && (
        <div className="card gx-diag">
          <div className="gx-nums">
            <span className="gx-n">
              <b>{res.peliculas}</b> película{res.peliculas === 1 ? "" : "s"}
              {" · "}<b>{res.documentos}</b> documento{res.documentos === 1 ? "" : "s"}
            </span>
            {res.sinNada > 0 && (
              <span className="gx-n" style={{ color: META_FALTA["sin-nada"].col }}
                title={META_FALTA["sin-nada"].ayuda}>⚠ {res.sinNada} sin tratamiento</span>
            )}
            {res.sinVigente > 0 && (
              <span className="gx-n" style={{ color: META_FALTA["sin-vigente"].col }}
                title={META_FALTA["sin-vigente"].ayuda}>⚠ {res.sinVigente} sin vigente</span>
            )}
            {res.cortos > 0 && (
              <span className="gx-n" style={{ color: META_FALTA["corto"].col }}
                title={META_FALTA["corto"].ayuda}>{res.cortos} sin llegar al guion</span>
            )}
            {res.soloEnlazado > 0 && (
              <span className="gx-n" style={{ color: META_FALTA["solo-enlazado"].col }}
                title={META_FALTA["solo-enlazado"].ayuda}>{res.soloEnlazado} solo enlazado{res.soloEnlazado === 1 ? "" : "s"}</span>
            )}
            {res.sinNada === 0 && res.sinVigente === 0 && res.peliculas > 0 && (
              <span className="gx-n" style={{ color: "var(--green)" }}>✔ todas tienen su documento vigente</span>
            )}
            <span style={{ flex: 1 }} />
            {/* Un enlace y no un interruptor de estado: es otra lista, y tiene
                que poder enlazarse y volverse con el botón de atrás. */}
            <Link href={todas ? "/guion" : "/guion?todas=1"} className="gx-filtro">
              {todas
                ? "← solo las que siguen vivas"
                : `ver también las terminadas${ocultas ? ` (${ocultas})` : ""}`}
            </Link>
          </div>
        </div>
      )}

      {!fallo && filas.map(f => {
        const p = f.peli;
        const nombre = p.nombre_corto || p.nombre || "(sin nombre)";
        const doc = modoGuion(p.tipo) === "documental";
        return (
          <div key={p.id} style={{ scrollMarginTop: 12 }}>
            <Plegable id={`guion:peli:${p.id}`}
              /* Las que necesitan atención se abren solas; las que están al día
                 quedan plegadas. Con quince películas abiertas, la que le falta
                 algo está a tres pantallas de scroll.
                 ⚠ `Plegable` solo lee esto AL MONTAR y guarda en localStorage
                 lo que el lector alterna a mano. Así que si alguien pliega una
                 película una vez, queda plegada para siempre y ya no volverá a
                 abrirse sola el día que le empiece a faltar algo. Es una
                 pérdida aceptable —el diagnóstico de arriba sigue contándola—
                 pero conviene saberla antes de confiar en que esto avisa. */
              abiertoPorDefecto={!!f.falta}
              titulo={<>
                <span style={{ color: "var(--violet)" }}>{doc ? "🫂" : "🎭"}</span>{" "}
                {nombre}
              </>}
              resumen={<span style={{ fontWeight: 400, fontSize: 12 }}>
                {f.falta
                  ? <span style={{ color: META_FALTA[f.falta].col }} title={META_FALTA[f.falta].ayuda}>
                      {META_FALTA[f.falta].txt}
                    </span>
                  : <span style={{ color: "var(--dim)" }}>
                      {f.vigente ? tituloDe(f.vigente) : ""}
                      {f.vigente && ` · ${metaNivel(nivelDe(f.vigente)).txt.toLowerCase()}`}
                    </span>}
                {f.tratamientos.length > 1 && (
                  <span style={{ color: "var(--dim)" }}> · {f.tratamientos.length} documentos</span>
                )}
              </span>}>
              <div style={{ color: "var(--dim)", fontSize: 11.5, marginBottom: 4 }}>
                <Link href={`/entidad/proyecto/${p.id}`} style={{ color: "var(--blue)" }}>
                  la ficha del proyecto →
                </Link>
                {" · destino: "}{metaNivel(nivelDestino(p.tipo)).txt.toLowerCase()}
                {doc && " (en documental, el secuenciado es el final del camino)"}
              </div>
              {/* El mismo componente que en la ficha del proyecto: quien entra
                  a «voy a escribir» y ve una película sin nada tiene que poder
                  empezar ahí, sin el rodeo por la ficha.
                  `fondos` va vacío a propósito: marcar a qué concurso se
                  presentó un documento es una decisión de expediente, y se toma
                  donde está el expediente. */}
              {/* ⚠ Solo SUS cuentas y SUS fondos, no los mapas enteros.
                  `Tratamientos` es de cliente, así que cada película abre una
                  frontera y todo lo que reciba se serializa en el payload:
                  pasar los mapas completos a cada una los repetía N veces.
                  `puedeBorrar={false}`: desde el índice se crea —quien entra a
                  «voy a escribir» y ve una película sin nada tiene que poder
                  empezar ahí— pero no se destruye. Borrar un tratamiento se
                  lleva sus actos, secuencias, hilos y espina; esa decisión se
                  toma con el proyecto delante. */}
              <Tratamientos proyectoId={p.id} tipoProyecto={p.tipo}
                tratamientos={f.tratamientos} puedeBorrar={false}
                fondos={fondosDe.get(p.id) || []}
                cuentas={cuentas
                  ? Object.fromEntries(f.tratamientos.map(t => [t.id, cuentas[t.id] ?? 0]))
                  : null} />
            </Plegable>
          </div>
        );
      })}

      {!fallo && !filas.length && (
        <div className="card" style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.55 }}>
          {todas
            ? "No hay ninguna película registrada todavía."
            : <>No hay películas en marcha. <Link href="/guion?todas=1" style={{ color: "var(--blue)" }}>
                Ver también las terminadas</Link>.</>}
        </div>
      )}
    </div>
  );
}
