import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import GuionEstructura from "@/components/GuionEstructura";
import { modoGuion, VOZ, plantillaDe, explicar } from "@/lib/guion";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "✍ Guion" };

/* LA LÍNEA DE TIEMPO NARRATIVA — vuelta 1: el tratamiento.
 *
 * Página propia y no pestaña de la ficha porque lo que viene después es
 * ancho: la línea de tiempo del prototipo son 36 px por minuto, y una
 * película de 47 minutos ocupa 1700 px de scroll horizontal. Eso no cabe
 * al lado del carné del proyecto.
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

  const { data: proy } = await supabase.from("proyectos")
    .select("id,nombre,nombre_corto,tipo,etapa,guion_plantilla").eq("id", params.id).maybeSingle();
  if (!proy) notFound();

  const [{ data: actos, error: eActos }, { data: secs, error: eSecs },
    { data: hilos, error: eHilos }, { data: beats, error: eBeats }] = await Promise.all([
    supabase.from("guion_actos").select("id,clave,nombre,orden")
      .eq("proyecto_id", params.id).order("orden"),
    supabase.from("guion_secuencias").select("id,nombre,texto,minutos,acto_id,orden")
      .eq("proyecto_id", params.id).order("orden"),
    supabase.from("guion_hilos").select("id,nombre,color,orden")
      .eq("proyecto_id", params.id).order("orden"),
    /* La espina: los puntos de giro y de inflexión en su orden. Es lo que
       convierte «Save the Cat» en una guía y no en una etiqueta. */
    supabase.from("guion_beats")
      .select("id,nombre,que,tipo,pos,nota,acto_id,secuencia_id,orden")
      .eq("proyecto_id", params.id).order("orden"),
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
  const P = plantillaDe(proy.guion_plantilla);

  return (
    <main className="wrap">
      <Volver />

      <h1 className="title-lg">
        ✍ {V.tratamiento} ·{" "}
        <Link href={`/entidad/proyecto/${proy.id}`} style={{ color: "var(--violet)" }}>
          {proy.nombre_corto || proy.nombre} →
        </Link>
      </h1>
      <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "-6px 0 14px" }}>
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

      <GuionEstructura proyectoId={proy.id} modo={modo} plantilla={proy.guion_plantilla}
        actos={(actos as any) || []} secs={secuencias as any} hilos={(hilos as any) || []}
        beats={(beats as any) || []} />
    </main>
  );
}
