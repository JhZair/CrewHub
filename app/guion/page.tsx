import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/Enlace";
import Volver from "@/components/Volver";
import ListaPeliculas, { type FilaVista } from "@/components/ListaPeliculas";
import QueEsUnTratamiento from "@/components/QueEsUnTratamiento";
/* ⚠ `normalizar` de `lib/texto` y NO de `ListaPeliculas`: ese módulo es
   `"use client"`, y una función importada de ahí y llamada AQUÍ —en el
   servidor— no da error de tipos, da un error en runtime que tumba la
   pantalla entera. Está contado en lib/texto.ts. */
import { normalizar } from "@/lib/texto";
import { techo } from "@/lib/api";
import { modoGuion } from "@/lib/guion";
import {
  diagnosticar, resumirDiagnostico, ordenarPeliculas, peliculaViva,
  motivoFalta, resumenPelicula, META_FALTA, TIPOS_CON_GUION,
  type FilaPelicula,
} from "@/lib/tratamiento";

export const metadata: Metadata = { title: "✍ Guion" };

/* ══════════════════════════════════════════════════════════════════════════
   ✍ EL ÍNDICE DE GUION

   La puerta de una actividad. Quien va a escribir no piensa «voy a la ficha
   del proyecto ROBOTRASH»: piensa «voy a escribir».

   ── ES UN ÍNDICE, NO UN ESCRITORIO ──
   ⚠ Lo era hasta hoy, y es el cambio de esta pantalla. Cada película llevaba
   DENTRO el editor entero de tratamientos —`Tratamientos`, que es de cliente—,
   así que abrir «cómo va todo» cargaba quince editores con sus formularios,
   sus desplegables de fondos y sus mapas de secuencias, para que se usara como
   mucho uno.

   Es exactamente lo que le pasaba a ⚖ clearance y se arregló igual: el índice
   dice UNA línea por película y el trabajo se hace en `/guion/pelicula/[id]`.
   La lista y el buscador son el MISMO componente que allí —`ListaPeliculas`—
   para que los dos no aprendan por separado a buscar sin tildes.

   ⚠ LO QUE SE PIERDE, ENTERO. Una primera versión de este comentario declaró
   una sola pérdida —«ya no se puede crear»— y era quedarse corto: el editor
   iba con `puedeEditar` por defecto, así que desde aquí también se editaba la
   cabecera, se duplicaba, se marcaba vigente y se saltaba a la rejilla de
   escritura de cualquier documento en un clic. Todo eso está ahora a un clic
   más, dentro de la película. Y con el editor se fueron el enlace a la ficha
   del proyecto y la línea «destino: …» de cada fila, que viven en la ficha.
   Lo único que se conserva por fila —porque es lo que explica el veredicto—
   es el 🫂 / 🎭: si la película termina en el secuenciado o sigue al guion.
   A cambio, la pantalla que se mira todos los días deja de cargar quince
   editores de cliente y seiscientas postulaciones para llenar un desplegable
   que nadie abre.

   ── AGRUPADO POR PELÍCULA, NO POR DOCUMENTO ──
   La pregunta es «¿cómo va el guion de X?». Cuarenta documentos de quince
   películas ordenados por fecha no la contestan.

   ── Y EL DIAGNÓSTICO ARRIBA ──
   ⚠ El recuento sale de LAS MISMAS filas que se pintan debajo. Un titular
   calculado aparte del contenido que resume es el que acaba discrepando.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function IndiceGuion({
  searchParams,
}: { searchParams?: { todas?: string; q?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* ── EL FILTRO VA EN LA URL, NO EN ESTADO ──
     Es otra lista, no otra forma de mirar la misma: «ver también las
     terminadas» tiene que poder enlazarse y volver con el botón de atrás. */
  const todas = searchParams?.todas === "1";

  const [proys, trats] = await Promise.all([
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
      .select("id,proyecto_id,nombre,version,nivel,estado,vigente,url,creado_en," +
        "secs:guion_secuencias(count)")
      .order("creado_en", { ascending: false }).limit(techo(900) + 1),
  ]);
  /* ⚠ Las `postulaciones` ya NO se piden. Solo servían para llenar el
     desplegable de «a qué fondo se presentó» dentro de cada editor, y el
     editor ya no está aquí: eran seiscientas filas cargadas en cada visita
     para alimentar un control que nadie ve. Se piden en la ficha, filtradas
     por película. */

  /* ⚠ Los dos errores se enseñan y NO se tragan con `|| []`. Sin la lista de
     tratamientos, todas las películas saldrían «sin tratamiento»: el
     diagnóstico entero sería falso y en la dirección que más alarma. */
  const eProy = (proys as any)?.error?.message || null;
  const eTrat = (trats as any)?.error?.message || null;
  const fallo = eProy || eTrat;

  /* ── ¿SE CORTÓ? ──
     Se pide una fila de más y se mira si volvió: es lo que lib/api.ts llama la
     sonda. El corte va por `creado_en desc`, así que lo que se pierde son los
     documentos MÁS ANTIGUOS: justo los de las películas viejas. */
  const cortadoTrat = (trats.data || []).length > techo(900);
  const cortadoProy = (proys.data || []).length > techo(400);

  const listaTrats = ((trats.data || []) as any[]).slice(0, techo(900))
    .map(t => ({ ...t, _n: t.secs?.[0]?.count ?? 0 }));
  const cuentas: Record<string, number> | null = eTrat
    ? null
    : Object.fromEntries(listaTrats.map(t => [t.id, t._n]));

  const peliculas = ((proys.data || []) as any[]).slice(0, techo(400))
    .filter(p => todas || peliculaViva(p));
  const filas = ordenarPeliculas(
    peliculas.map(p => diagnosticar(p, listaTrats, cuentas)));
  const res = resumirDiagnostico(filas);
  const ocultas = Math.min(((proys.data || []) as any[]).length, techo(400)) - peliculas.length;

  /* ── UNA LÍNEA POR PELÍCULA, COMO DATO ──
     ⚠ Se construyen aquí y las pinta `ListaPeliculas`, que es cliente porque
     tiene la caja de búsqueda. Lo que cruza son CADENAS ya resueltas. Ni
     `cuentas` ni `diagnosticar` viajan — una función a un componente cliente
     revienta en runtime y tsc no lo ve. */
  const vista = (f: FilaPelicula): FilaVista => {
    const p = f.peli as any;
    const nombre = p.nombre_corto || p.nombre || "(sin nombre)";
    const motivo = motivoFalta(f);
    return {
      id: p.id,
      nombre,
      /* 🫂 termina en el tratamiento secuenciado, 🎭 sigue hasta el guion. En
         TODAS las filas: es lo que explica por qué dos películas con el mismo
         nivel tienen veredictos distintos. */
      ico: modoGuion(p.tipo) === "documental" ? "🫂" : "🎭",
      nombreLargo: String(p.nombre || ""),
      /* ⚠ El corto Y el largo. Se busca «mujeres» y la fila se llama
         «MUJERESANDE»; se busca «Mujeres del Ande» y también tiene que salir. */
      busca: normalizar([p.nombre_corto, p.nombre].filter(Boolean).join(" ")),
      color: f.falta ? META_FALTA[f.falta].col : "var(--green)",
      veredicto: f.falta ? META_FALTA[f.falta].txt : "al día",
      resumen: resumenPelicula(f),
      /* ⚠ NINGÚN documento, ni vivo ni descartado — y NO `falta === "sin-nada"`,
         que era el criterio y era falso. Una película cuyos dos documentos se
         abandonaron sale «sin tratamiento» (correcto: no hay nada vigente que
         escribir) pero caía dentro del plegable «sin ningún documento, ni
         siquiera el enlace al de Drive», que es una frase falsa sobre trabajo
         que existe y sigue guardado. Ahora se queda en la lista de arriba,
         diciendo «2 documentos, todos descartados». */
      sinDatos: !f.tratamientos.length,
      /* Una sola razón, la del veredicto. No es una lista de bloqueos como en
         ⚖ clearance —aquí solo se dice UNA cosa, la peor— pero el hueco es el
         mismo: la línea de debajo que explica el color. */
      bloqueos: motivo
        ? [{ id: `${p.id}:motivo`, ico: "↳",
             txt: motivo, color: META_FALTA[f.falta!].col }]
        : [],
      masBloqueos: 0,
    };
  };

  /* El MISMO criterio que `vista().sinDatos`, y por eso se lee de la fila y no
     de la falta: si aquí se dijera `f.falta === "sin-nada"` y allí otra cosa,
     una película iría al plegable con el rótulo equivocado. */
  const conDatos = filas.filter(f => f.tratamientos.length > 0);
  const vacias = filas.filter(f => !f.tratamientos.length);

  return (
    /* `.shell` + `.topbar`, como el resto de las pantallas: `.wrap` no existe
       en app/globals.css. */
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
            {res.vacios > 0 && (
              <span className="gx-n" style={{ color: META_FALTA["vacio"].col }}
                title={META_FALTA["vacio"].ayuda}>⚠ {res.vacios} con el vigente vacío</span>
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
            {res.sinNada > 0 && (
              <span className="gx-n" style={{ color: META_FALTA["sin-nada"].col }}
                title={META_FALTA["sin-nada"].ayuda}>{res.sinNada} sin empezar</span>
            )}
            {res.sinNada === 0 && res.sinVigente === 0 && res.vacios === 0 && res.peliculas > 0 && (
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

      {!fallo && (
        <ListaPeliculas filas={conDatos.map(vista)} vacias={vacias.map(vista)}
          inicial={searchParams?.q} ocultas={todas ? 0 : ocultas}
          rotulos={{
            base: "/guion/pelicula",
            indice: "/guion",
            queBusca: "películas",
            noBusca: "no por el texto de los tratamientos",
            vaciasTitulo: `${vacias.length} película${vacias.length === 1 ? "" : "s"} sin ningún documento`,
            vaciasResumen: "ni siquiera el enlace al de Drive: nadie ha empezado",
            incluyeVacias: "incluye las que nadie ha empezado",
          }} />
      )}

      {!fallo && !filas.length && (
        <div className="card" style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.55 }}>
          {todas
            ? "No hay ninguna película registrada todavía."
            : <>No hay películas en marcha. <Link href="/guion?todas=1" style={{ color: "var(--blue)" }}>
                Ver también las terminadas</Link>.</>}
        </div>
      )}

      {!fallo && <QueEsUnTratamiento />}
    </div>
  );
}
