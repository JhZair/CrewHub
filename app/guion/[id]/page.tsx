import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import GuionEstructura from "@/components/GuionEstructura";
import { modoGuion, VOZ, plantillaDe, explicar } from "@/lib/guion";
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
 * ║  LA VISTA QUE FALTA: LA LÍNEA DE TIEMPO HORIZONTAL                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 * Referencia de diseño: **prewrite.com** — escribir un tratamiento como se
 * monta un vídeo, en una banda horizontal, pero de texto.
 *
 * ⚠ ESTO SE ANOTA AQUÍ PORQUE YA SE PERDIÓ UNA VEZ. La referencia se
 * compartió al empezar el módulo, no quedó escrita en ninguna parte, y hubo
 * que volver a preguntarla meses después. Una decisión de diseño que solo
 * vive en la cabeza de quien la tomó es una decisión que se toma dos veces.
 *
 * ── LO QUE YA EXISTE PARA CONSTRUIRLA ──
 * El modelo entero está, y no por casualidad: se fue haciendo para esto.
 *   · el ANCHO de cada bloque  → `minutosDe(s)` en lib/guion.ts, que da los
 *     minutos del autor o los estimados a 190 palabras/minuto, y dice cuál
 *     de las dos cosas es (`estimado`). Manda el autor si los puso.
 *   · las ZONAS de fondo       → `guion_actos`, con su orden.
 *   · las PISTAS de color      → `guion_hilos.color` + `guion_secuencia_hilos`,
 *     que son exactamente las capas de un editor de vídeo.
 *   · las MARCAS de la regla   → `guion_beats.pos`, el % de metraje donde el
 *     modelo estructural ESPERA cada punto de giro. La distancia entre eso y
 *     donde cae de verdad es el diagnóstico, y solo existe porque la
 *     plantilla y el guion son dos cosas separadas (ver lib/guion.ts).
 *
 * Lo único que falta es la pantalla: una banda con scroll horizontal, un
 * bloque por secuencia proporcional a su duración, y el cajón de edición
 * abriéndose debajo al pulsar uno.
 *
 * ── LO QUE HAY QUE DECIDIR ANTES DE DIBUJARLA ──
 *   · Si la banda SUSTITUYE a la lista vertical o convive con ella (un
 *     conmutador, como el de /tablero entre tablero y lista).
 *   · Qué pasa con una secuencia de 20 segundos: a 36 px/min son 12 px, un
 *     bloque en el que no cabe ni su número. Hace falta un ancho mínimo, y
 *     entonces la banda deja de ser proporcional — y hay que decir que lo es
 *     «casi», o el ojo medirá mal.
 *   · Si se puede arrastrar para reordenar, o el orden se sigue cambiando
 *     con los ↑↓ que ya existen. Arrastrar en una banda con scroll
 *     horizontal es difícil de hacer bien y muy fácil de hacer mal.
 * ────────────────────────────────────────────────────────────────────────
 *
 * El orden de la pantalla es el orden de trabajo: primero contra qué
 * estructura se escribe (la plantilla), luego qué atraviesa la película
 * (los hilos), luego el tratamiento acto por acto, y al final lo que
 * falta. No al revés: un diagnóstico arriba, antes de escribir nada, solo
 * dice que no has escrito nada.
 */
export default async function Guion({ params }: { params: { id: string } }) {
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

  return (
    <main className="wrap">
      <Volver />

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

      <GuionEstructura tratamientoId={T.id} modo={modo} plantilla={T.plantilla}
        actos={(actos as any) || []} secs={secuencias as any} hilos={(hilos as any) || []}
        beats={(beats as any) || []} />
    </main>
  );
}
