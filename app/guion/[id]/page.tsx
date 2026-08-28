import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import GuionEstructura from "@/components/GuionEstructura";
import GuionTimeline from "@/components/GuionTimeline";
import { modoGuion, VOZ, plantillaDe, explicar, minutosHum, repartoActos,
  diagnosticar as diagnosticarGuion } from "@/lib/guion";
import { columnas } from "@/lib/timeline";
import { tituloDe, nivelDe, metaNivel, nivelDestino, llegoAlDestino,
  estadoDe as estadoTrat, META_ESTADO_TRAT } from "@/lib/tratamiento";
import Link from "@/components/Enlace";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "✍ Guion" };

/* LA LÍNEA DE TIEMPO NARRATIVA — un TRATAMIENTO concreto.
 *
 * ⚠ El `[id]` de esta ruta es el del TRATAMIENTO, no el del proyecto. Una
 * película tiene varios documentos —el presentado al concurso, el reescrito con
 * las notas del jurado, el de rodaje— y hasta que existió la cabecera solo
 * cabía uno. Está razonado en db/tratamiento.sql.
 * Se entra desde la lista de tratamientos de la ficha del proyecto o desde la
 * pestaña Audiovisual del fondo.
 *
 * Página propia y no pestaña de la ficha porque lo que viene después es
 * ancho: la línea de tiempo del prototipo son 36 px por minuto, y una
 * película de 47 minutos ocupa 1700 px de scroll horizontal. Eso no cabe
 * al lado del carné del proyecto.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  LA REJILLA: columnas = secuencias, filas = capas                    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 * Referencia de diseño compartida por el equipo (tres capturas de una
 * herramienta de escritura de guion, sobre «The Social Network»). Lo que
 * enseñan, y que conviene tener escrito porque ya se perdió una vez:
 *
 * ── NO ES UNA LÍNEA DE TIEMPO PROPORCIONAL: ES UNA REJILLA ──
 * Cada COLUMNA es una secuencia, de ancho FIJO. Cada FILA es una capa de
 * información sobre las mismas columnas. Y la proporción al metraje vive en
 * una REGLA numerada abajo (1, 5, 10… 80 páginas), teñida por acto.
 * Eso resuelve solo el problema que parecía difícil: con columnas
 * proporcionales, una secuencia de veinte segundos son doce píxeles y no cabe
 * ni su número. Con ancho fijo y la regla abajo, la duración se lee sin que la
 * columna se vuelva ilegible.
 *
 * ── LAS FILAS DE LA REFERENCIA ──
 *   STRUCTURE  — el acto como banda que abarca sus columnas, con las marcas
 *                del modelo encima: «1: OPENING», «3: INCITING INCIDENT».
 *   Images     — una miniatura por secuencia.
 *   Body       — el texto, recortado, con un botón «More» que abre el resto.
 *   Summary    — el resumen en prosa, aparte del texto.
 *   Notes      — las notas del autor.
 *   Theme      — marcas ✓ Stated / Symbolized / Explored donde ocurre.
 *   CHARACTERS — quién aparece en cada columna, con su cara.
 *   Tone −/+   — una barra roja o verde por secuencia.
 *   PLOT THREADS — los hilos como bandas horizontales continuas que se
 *                ensanchan donde hay contenido, cada uno de su color.
 *
 * ── QUÉ TENEMOS Y QUÉ FALTA ──
 * Ya soportado por el modelo:
 *   STRUCTURE      → `guion_actos` + `guion_beats` (con `pos` y `secuencia_id`)
 *   Body           → `guion_secuencias.texto`
 *   PLOT THREADS   → `guion_hilos.color` + `guion_secuencia_hilos`
 *   la regla       → `minutosDe()` en lib/guion.ts
 *   Story Stats    → el diagnóstico que ya está en lib/guion.ts
 * Falta en la base, y por eso esas filas llegarán después:
 *   Images/Slides  → `imagen_url` en la secuencia
 *   Summary        → hoy solo hay `texto`; la referencia tiene los DOS
 *   Notes          → una nota por secuencia
 *   CHARACTERS     → tabla secuencia↔persona (el reparto ya existe)
 *   Tone           → un campo de tono
 *
 * ── DECIDIDO ──
 *   · La rejilla SUSTITUYE a la lista vertical: no conviven, se conmuta.
 *   · Las vistas de entrada son Timeline · Cards · Page · Story Stats.
 *   · Se escribe EN LA CELDA, con «More» para el cajón completo. Escribir sin
 *     cambiar de sitio es lo que hace que la herramienta se use; un panel que
 *     hay que abrir cuesta dos clics por frase.
 *   · Reordenar sigue con los ↑↓ que ya existen. Arrastrar en una banda con
 *     scroll horizontal es fácil de hacer mal, y el orden ya funciona.
 * ────────────────────────────────────────────────────────────────────────
 *
 * El orden de la pantalla es el orden de trabajo: primero contra qué
 * estructura se escribe (la plantilla), luego qué atraviesa la película
 * (los hilos), luego el tratamiento acto por acto, y al final lo que
 * falta. No al revés: un diagnóstico arriba, antes de escribir nada, solo
 * dice que no has escrito nada.
 */
/* ── LAS VISTAS ──
 * La rejilla SUSTITUYE a la lista vertical: no conviven, se conmuta. La
 * elección va en la URL y no en estado de cliente porque son cuatro formas de
 * mirar lo mismo que hay que poder enlazar —«míralo en la rejilla»— y volver
 * atrás con el botón del navegador. */
const VISTAS = [
  { k: "timeline", ico: "⧉", txt: "Rejilla",
    que: "Cada columna una secuencia, cada fila una capa: estructura, cuerpo, hilos y la regla de metraje." },
  { k: "cards", ico: "▤", txt: "Tarjetas",
    que: "Una secuencia debajo de otra, con su acto, sus hilos y la espina. Para escribir seguido." },
  { k: "page", ico: "▦", txt: "Documento",
    que: "El tratamiento de corrido, como se lee y como se manda." },
  { k: "stats", ico: "▥", txt: "Diagnóstico",
    que: "Reparto de metraje por acto y lo que falta: puntos sin secuencia, secuencias sin hilo." },
] as const;
type Vista = typeof VISTAS[number]["k"];

export default async function Guion({
  params, searchParams,
}: { params: { id: string }; searchParams?: { v?: string | string[] } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* El documento y su película en una sola consulta. Sin el embebido harían
     falta dos viajes encadenados —el tratamiento primero para saber de qué
     proyecto es— y eso es latencia pura antes de pintar nada. */
  const { data: trat } = await supabase.from("tratamiento")
    .select("id,nombre,version,nivel,estado,plantilla,vigente,url,nota,postulacion_id," +
      "proy:proyectos(id,nombre,nombre_corto,tipo,etapa)")
    .eq("id", params.id).maybeSingle();
  if (!trat) notFound();
  const proy: any = Array.isArray((trat as any).proy) ? (trat as any).proy[0] : (trat as any).proy;
  /* Un tratamiento sin proyecto no debería existir —la FK es `not null`— pero
     si el embebido fallara, la página entera se apoyaría en `proy.tipo` y
     reventaría con un error que no dice nada. */
  if (!proy) notFound();

  const [{ data: actos, error: eActos }, { data: secs, error: eSecs },
    { data: hilos, error: eHilos }, { data: beats, error: eBeats }] = await Promise.all([
    supabase.from("guion_actos").select("id,clave,nombre,orden")
      .eq("tratamiento_id", params.id).order("orden"),
    supabase.from("guion_secuencias").select("id,nombre,texto,minutos,acto_id,orden")
      .eq("tratamiento_id", params.id).order("orden"),
    supabase.from("guion_hilos").select("id,nombre,color,orden")
      .eq("tratamiento_id", params.id).order("orden"),
    /* La espina: los puntos de giro y de inflexión en su orden. Es lo que
       convierte «Save the Cat» en una guía y no en una etiqueta. */
    supabase.from("guion_beats")
      .select("id,nombre,que,tipo,pos,nota,acto_id,secuencia_id,orden")
      .eq("tratamiento_id", params.id).order("orden"),
  ]);

  /* Las marcas van en una segunda ronda porque hay que acotarlas a ESTAS
     secuencias. `guion_secuencia_hilos` no tiene `proyecto_id` —cuelga de la
     secuencia— y sin el `.in()` la consulta se traía las marcas de todos los
     proyectos de la base: crece sin techo y manda al navegador datos de
     guiones ajenos. */
  const ids = (secs || []).map((s: any) => s.id);
  const { data: marcas } = ids.length
    ? await supabase.from("guion_secuencia_hilos").select("secuencia_id,hilo_id").in("secuencia_id", ids)
    : { data: [] as any[] };

  /* Una consulta rota devuelve `data: null`, y `|| []` la convierte en
     «no hay nada escrito»: exactamente lo mismo que se ve cuando de verdad
     no hay nada. Con un tratamiento dentro eso es aterrador, y además
     mentira.
     Se miran las CUATRO. Antes solo se miraba la de secuencias, así que si
     faltaba `guion_beats` la espina salía vacía sin decir por qué —y la
     página parecía funcionar—. Es el mismo fallo silencioso que llevo
     cerrando toda la sesión, cometido otra vez a los diez minutos. */
  const fallo = explicar([eActos, eSecs, eHilos, eBeats]
    .map((e: any) => e?.message).filter(Boolean).join(" · "));

  const hilosDe = new Map<string, string[]>();
  (marcas || []).forEach((m: any) =>
    hilosDe.set(m.secuencia_id, [...(hilosDe.get(m.secuencia_id) || []), m.hilo_id]));

  const secuencias = (secs || []).map((s: any) => ({ ...s, hilos: hilosDe.get(s.id) || [] }));
  const modo = modoGuion(proy.tipo);
  const V = VOZ[modo];
  const P = plantillaDe((trat as any).plantilla);
  const T = trat as any;

  /* ── LO QUE COMPARTEN LAS CUATRO VISTAS ──
     Las columnas se calculan una vez y las usan la rejilla, el documento y el
     diagnóstico. Que cada vista hiciera su propio reparto es la forma segura de
     que el «25%» del diagnóstico no cuadre con la banda que se ve en la
     rejilla. */
  const cols = columnas(secuencias as any, (actos as any) || []);
  const reparto = repartoActos((actos as any) || [], secuencias as any);
  /* Dónde cae de VERDAD cada secuencia, en % del metraje: el CENTRO de su
     tramo. Es contra esto que se mide si un punto de giro llegó donde el modelo
     lo esperaba, que es lo único que una plantilla puede diagnosticar. */
  /* ⚠ VACÍO si no hay metraje, no lleno de ceros. Con `total === 0` —un
     tratamiento recién creado, todo sin texto ni minutos— un mapa de ceros NO
     es un mapa vacío: `diagnosticar` comprueba `real == null` para saltarse la
     medición, y `0` no es `null`. Así que emitía un aviso por cada punto de
     giro: «"Clímax" se espera al 90% y cae al 0%». Antes de escribir una
     palabra, la pantalla acusaba de once desvíos. */
  const pctDe = reparto.total > 0
    ? new Map<string, number>(cols.map(c => [c.sec.id, ((c.desde + c.min / 2) / reparto.total) * 100]))
    : new Map<string, number>();
  const avisos = diagnosticarGuion(secuencias as any, (hilos || []).length > 0, (beats as any) || [], pctDe);

  /* `?v=a&v=b` llega como array: Next tipa `string | string[]` aunque casi
     nadie lo escriba así. Se toma el último, que es lo que hace un navegador
     con un parámetro repetido. */
  const vBruto = searchParams?.v;
  const vistaPedida = Array.isArray(vBruto) ? (vBruto[vBruto.length - 1] || "") : (vBruto || "");
  /* Una vista desconocida cae en la rejilla en vez de pintar la pantalla en
     blanco: un enlace viejo o un parámetro mal escrito no puede parecer que el
     tratamiento está vacío. */
  const vista: Vista = (VISTAS.some(x => x.k === vistaPedida) ? vistaPedida : "timeline") as Vista;

  return (
    /* `.shell` + `.topbar`, como el resto de las pantallas: `.wrap` no existe
       en app/globals.css, así que la página salía a sangre completa y el
       «volver» fuera de su barra. */
    <div className="shell shell-ancho">
      <div className="topbar"><Volver /></div>

      {/* El título es el del DOCUMENTO, no el de la película: con varios
          tratamientos abiertos en pestañas distintas, «✍ Tratamiento · KAWSAY
          WARMI» tres veces no distingue cuál se está editando. */}
      <h1 className="title-lg">
        ✍ {tituloDe(T)} ·{" "}
        <Link href={`/entidad/proyecto/${proy.id}`} style={{ color: "var(--violet)" }}>
          {proy.nombre_corto || proy.nombre} →
        </Link>
      </h1>
      <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "-6px 0 14px", lineHeight: 1.6 }}>
        <span style={{ color: META_ESTADO_TRAT[estadoTrat(T)].col }}>
          {META_ESTADO_TRAT[estadoTrat(T)].ico} {META_ESTADO_TRAT[estadoTrat(T)].txt}
        </span>
        {T.vigente && <> · <b style={{ color: "var(--green)" }}>vigente</b></>}
        {" · "}{metaNivel(nivelDe(T)).ico} {metaNivel(nivelDe(T)).txt}
        {/* Hasta dónde tiene que llegar esta película. En documental el
            secuenciado ES el destino; en ficción y animación es el paso previo
            al guion, y decirlo evita que alguien dé por cerrado un documento
            que todavía tiene que crecer. */}
        {!llegoAlDestino(T, proy.tipo) && (
          <> · <span style={{ color: "var(--yellow)" }}>
            falta llegar a {metaNivel(nivelDestino(proy.tipo)).txt.toLowerCase()}
          </span></>
        )}
        {T.url && <> · <a href={T.url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>↗ el documento original</a></>}
        <br />
        {modo === "documental"
          ? "Lo que esperas que ocurra, secuencia por secuencia. En documental el tratamiento se prevé, no se dicta."
          : "Qué pasa, secuencia por secuencia y en prosa. De aquí sale después el guion en escenas."}
        {" "}Estás escribiendo contra <b>{P.nombre}</b>.
      </div>

      {fallo && (
        <div className="err-inline" style={{ lineHeight: 1.5, whiteSpace: "pre-line" }}>
          ⚠ No se pudo leer parte del guion. Lo que falte aquí abajo está vacío por un fallo,
          no porque no haya nada escrito.
          {"\n"}{fallo}
        </div>
      )}

      {!fallo && !actos?.length && !secuencias.length && (
        <div className="card" style={{ borderColor: "rgba(167,139,250,.35)" }}>
          <b>Todavía no hay estructura.</b>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6, lineHeight: 1.55 }}>
            Elige abajo el modelo con el que quieres escribir: se crean sus actos y su espina
            —cada punto de giro y de inflexión, en orden, con qué tiene que conseguir—.
            Ese es el mapa. Después vas colgando {V.secs.toLowerCase()} de cada punto y
            escribiendo el tratamiento de cada una.
            <br />La plantilla es una capa: puedes cambiarla más adelante sin perder una palabra.
          </div>
        </div>
      )}

      {/* ── LA BARRA DE VISTAS ──
          Enlaces y no botones: la vista va en la URL, así que cada una tiene su
          dirección y el botón de atrás funciona. */}
      <div className="gv-barra">
        {VISTAS.map(x => (
          <Link key={x.k} href={`/guion/${T.id}${x.k === "timeline" ? "" : `?v=${x.k}`}`}
            className={`gv-tab${vista === x.k ? " on" : ""}`}
            aria-current={vista === x.k ? "page" : undefined} title={x.que}>
            {x.ico} {x.txt}
          </Link>
        ))}
      </div>

      {vista === "timeline" && (
        <GuionTimeline tratamientoId={T.id} modo={modo}
          secs={secuencias as any} actos={(actos as any) || []}
          hilos={(hilos as any) || []} beats={(beats as any) || []} />
      )}

      {vista === "cards" && (
        <GuionEstructura tratamientoId={T.id} modo={modo} plantilla={T.plantilla}
          actos={(actos as any) || []} secs={secuencias as any} hilos={(hilos as any) || []}
          beats={(beats as any) || []} />
      )}

      {/* ── DOCUMENTO ──
          El tratamiento de corrido, que es como se lee y como se manda. Aquí no
          se edita: por eso el texto va con `white-space: pre-wrap`, respetando
          los saltos que puso el autor en vez de normalizárselos al enseñárselo. */}
      {vista === "page" && (
        <div className="card gv-doc">
          {cols.length === 0
            ? <span style={{ color: "var(--dim)", fontSize: 12.5 }}>
                Todavía no hay nada escrito en este tratamiento.
              </span>
            : cols.map(c => {
              const acto = ((actos as any[]) || []).find(a => a.id === c.sec.acto_id);
              /* La primera columna DE ESE ACTO, para poner el título una sola
                 vez. `columnas()` agrupa por acto antes de numerar, así que la
                 primera coincidencia es siempre la de su tramo. */
              const primeraDelActo =
                cols.find(x => x.sec.acto_id === c.sec.acto_id)?.sec.id === c.sec.id;
              return (
                <div key={c.sec.id} className="gv-doc-sec">
                  {acto && primeraDelActo && (
                    <h2 className="gv-doc-acto">{acto.clave ? `${acto.clave} · ` : ""}{acto.nombre}</h2>
                  )}
                  <h3 className="gv-doc-t">
                    <span className="gv-doc-n">{c.n}</span> {c.sec.nombre || "Sin título"}
                    <span className="gv-doc-min">{c.min ? minutosHum(c.min) : ""}</span>
                  </h3>
                  {(c.sec.texto || "").trim()
                    ? <p className="gv-doc-p">{c.sec.texto}</p>
                    : <p className="gv-doc-vacio">— sin escribir —</p>}
                </div>
              );
            })}
        </div>
      )}

      {/* ── DIAGNÓSTICO ── */}
      {vista === "stats" && (
        <div className="card">
          <div className="gv-st-t">Reparto del metraje</div>
          {reparto.total === 0
            ? <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 6 }}>
                Todavía no hay metraje que repartir: ninguna secuencia tiene texto ni minutos.
              </div>
            : <div className="gv-st-barras">
              {reparto.filas.map(f => (
                <div key={f.id} className="gv-st-fila">
                  <span className="gv-st-nom">{f.nombre}</span>
                  <span className="gv-st-b"><span style={{ width: `${f.pct}%` }} /></span>
                  <span className="gv-st-n">{minutosHum(f.min)} · {Math.round(f.pct)}%</span>
                </div>
              ))}
              <div className="gv-st-tot">
                Total {minutosHum(reparto.total)}
                {/* Se dice cuánto de ese total es estimado: un número que parece
                    un dato y es una cuenta a 190 palabras/minuto acaba usándose
                    para decidir un plan de rodaje. */}
                {cols.some(c => c.estimado && c.min > 0) && " · en parte estimado por palabras"}
              </div>
            </div>}

          <div className="gv-st-t" style={{ marginTop: 14 }}>Lo que falta</div>
          {avisos.length === 0
            ? <div style={{ color: "var(--green)", fontSize: 12.5, marginTop: 6 }}>
                {reparto.total === 0
                  ? "Nada que señalar todavía: el diagnóstico necesita algo escrito para poder medir."
                  : "✔ Nada que señalar: cada punto de la estructura tiene su secuencia y no hay huecos."}
              </div>
            : <ul className="gv-st-av">
              {avisos.map((a, i) => (
                <li key={i} style={{ color: a.grave ? "var(--yellow)" : "var(--dim)" }}>
                  {a.grave ? "⚠ " : "· "}{a.txt}
                </li>
              ))}
            </ul>}
        </div>
      )}
    </div>
  );
}
