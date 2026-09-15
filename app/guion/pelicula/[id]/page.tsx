import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/Enlace";
import Volver from "@/components/Volver";
import Tratamientos from "@/components/Tratamientos";
import QueEsUnTratamiento from "@/components/QueEsUnTratamiento";
import { techo } from "@/lib/api";
import { esUuid } from "@/lib/texto";
import { modoGuion } from "@/lib/guion";
import {
  diagnosticar, META_FALTA, metaNivel, nivelDestino, motivoFalta,
  tieneGuion, type Tratamiento,
} from "@/lib/tratamiento";

/* ══════════════════════════════════════════════════════════════════════════
   ✍ EL GUION DE UNA PELÍCULA

   ── POR QUÉ EXISTE ESTA RUTA ──
   `/guion` listaba las quince películas y metía DENTRO de cada una el editor
   entero de tratamientos. Es la misma forma que tenía ⚖ clearance antes de
   partirse, y el mismo problema: la pantalla que sirve para saber «cómo va
   todo» y la que sirve para «voy a trabajar en esta» no son la misma pantalla.
   Juntas, la primera pesa lo que pesan las quince segundas.

   ── ¿Y POR QUÉ NO `/guion/[id]`? ──
   ⚠ Porque ese id YA ESTÁ COGIDO: es el de un TRATAMIENTO —la rejilla de
   secuencias de un documento concreto—, no el de la película. Una película
   tiene varios documentos, y esa ruta abre uno.
   Meter las dos cosas en el mismo `[id]` sería adivinar por el contenido de la
   tabla a qué se parece un UUID: el día que fallara, la pantalla diría «no
   existe» sobre algo que sí existe. Un segmento estático delante cuesta una
   carpeta y no adivina nada.
   ⚠ Lo que sí hay que atender es el prefijo desnudo: `/guion/pelicula` sin id
   encajaría en `/guion/[id]` y respondería «no existe». Por eso hay un
   `app/guion/pelicula/page.tsx` que redirige al índice.
   ══════════════════════════════════════════════════════════════════════════ */

export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  if (!esUuid(params.id)) return { title: "✍ Guion" };
  const supabase = createClient();
  const { data } = await supabase.from("proyectos")
    .select("nombre,nombre_corto").eq("id", params.id).maybeSingle();
  const n = (data as any)?.nombre_corto || (data as any)?.nombre;
  return { title: n ? `✍ Guion · ${n}` : "✍ Guion" };
}

export default async function GuionDePelicula(
  { params }: { params: { id: string } },
) {
  /* La forma del id ANTES de preguntar a la base: está razonada en lib/texto.ts. */
  if (!esUuid(params.id)) notFound();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: peli } = await supabase.from("proyectos")
    .select("id,nombre,nombre_corto,tipo,etapa")
    .eq("id", params.id).maybeSingle();
  if (!peli) notFound();

  /* ⚠ El mismo filtro que el índice. Sin esto, un videojuego alcanzado por su
     URL abriría un editor de tratamientos exigiéndole llegar al guion — y el
     índice, que sí filtra, nunca lo habría enseñado. Dos criterios para la
     misma pregunta se separan a la primera corrección. */
  if (!tieneGuion((peli as any).tipo)) notFound();

  const [trats, posts] = await Promise.all([
    /* Solo los de ESTA película. El índice los pide todos de golpe porque
       diagnostica quince; aquí pedir mil para quedarse con tres sería mandar
       al navegador el trabajo de todo el mundo. */
    supabase.from("tratamiento")
      .select("id,proyecto_id,postulacion_id,nombre,version,nivel,estado," +
        "presentado_en,vigente,url,nota,creado_en,secs:guion_secuencias(count)," +
        "actos:guion_actos(count)")
      .eq("proyecto_id", params.id)
      /* `techo(n)+1` para poder DETECTAR el corte, igual que el índice: pedir
         una fila de más y mirar si volvió. Sin eso, una película con más
         documentos de los que caben perdería los más antiguos y su diagnóstico
         discreparía del del índice EN SILENCIO. */
      .order("creado_en", { ascending: false }).limit(techo(200) + 1),
    /* Los fondos de esta película, para marcar a cuál se presentó cada
       documento. Aquí SÍ se pasan —al revés que en el índice viejo, que los
       mandaba vacíos— porque esta pantalla es el sitio de trabajar. */
    supabase.from("postulaciones")
      .select("id,codigo,proyecto_id,conv:convocatorias(nombre,codigo)")
      .eq("proyecto_id", params.id).order("codigo").limit(techo(60)),
  ]);

  /* ⚠ El error NO se traga con `|| []`. Con la consulta caída, la lista vacía
     se leería como «esta película no tiene nada escrito», que es la mentira
     más cara de esta pantalla: invita a empezar de cero encima de lo que ya
     hay. `Tratamientos` sabe pintar ese error, y por eso se le pasa. */
  const eTrat = (trats as any)?.error?.message || null;

  /* ⚠ La sonda se COMPARA y se RECORTA. Comparar sin recortar mete una fila
     de más en la lista; recortar sin comparar deja el corte invisible. */
  const cortado = (trats.data || []).length > techo(200);
  const lista: (Tratamiento & { _n: number; _a: number })[] = eTrat ? []
    : ((trats.data || []) as any[]).slice(0, techo(200))
        .map(t => ({ ...t, _n: t.secs?.[0]?.count ?? 0, _a: t.actos?.[0]?.count ?? 0 }));
  /* `null` es «no se sabe», no «cero»: con la consulta rota, cada documento
     dice «—» en vez de «vacío» — que sobre veinte secuencias sería falso. */
  const cuentas: Record<string, number> | null = eTrat
    ? null : Object.fromEntries(lista.map(t => [t.id, t._n]));
  /* Los actos, por la misma razón y con la misma regla del `null`: un
     documento con su mapa puesto no es un documento vacío, y decirlo al revés
     acusa de abandono a quien acaba de empezar. */
  const actosDe: Record<string, number> | null = eTrat
    ? null : Object.fromEntries(lista.map(t => [t.id, t._a]));

  const fondos = ((posts.data || []) as any[]).map(q => {
    const conv = Array.isArray(q.conv) ? q.conv[0] : q.conv;
    return {
      id: q.id as string,
      codigo: (q.codigo || null) as string | null,
      nombre: (conv?.nombre || conv?.codigo || "fondo sin código") as string,
    };
  });

  const f = diagnosticar(peli as any, lista, cuentas, actosDe);
  const doc = modoGuion((peli as any).tipo) === "documental";
  const nombre = (peli as any).nombre_corto || (peli as any).nombre || "(sin nombre)";
  const largo = String((peli as any).nombre || "");
  const motivo = motivoFalta(f);

  return (
    <div className="shell">
      <div className="topbar"><Volver /></div>

      <h1 className="title-lg">
        <span style={{ color: "var(--violet)" }}>{doc ? "🫂" : "🎭"}</span>{" "}
        {nombre}
      </h1>
      <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "-6px 0 14px", lineHeight: 1.6 }}>
        {/* El nombre largo solo cuando dice algo que el corto no dice. */}
        {largo && largo !== nombre && <>{largo}<br /></>}
        Destino: <b>{metaNivel(nivelDestino((peli as any).tipo)).txt.toLowerCase()}</b>
        {doc && " — en documental el secuenciado es el final del camino, no un paso intermedio"}
        {" · "}
        <Link href={`/entidad/proyecto/${(peli as any).id}`} style={{ color: "var(--blue)" }}>
          la ficha del proyecto →
        </Link>
        {" · "}
        <Link href="/guion" style={{ color: "var(--blue)" }}>todas las películas →</Link>
      </div>

      {cortado && (
        <div className="err-inline" style={{ lineHeight: 1.5 }}>
          ⚠ Esta película tiene más documentos de los que caben en una consulta. Faltan los más
          antiguos, así que el veredicto de abajo <b>puede no cuadrar con el del índice</b>.
        </div>
      )}

      {/* ── EL VEREDICTO, ARRIBA Y CON SU MOTIVO ──
          ⚠ Solo si `cuentas` no es `null`: con la consulta caída, `diagnosticar`
          diría «sin tratamiento» sobre trabajo que sí existe. Un diagnóstico
          calculado sobre datos que no llegaron es una acusación. */}
      {!eTrat && f.falta && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: META_FALTA[f.falta].col }}>
            {META_FALTA[f.falta].txt}
          </div>
          {!!motivo && (
            <div style={{ color: "var(--dim)", fontSize: 12, marginTop: 3 }}>{motivo}</div>
          )}
          <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 5, lineHeight: 1.5 }}>
            {META_FALTA[f.falta].ayuda}
          </div>
        </div>
      )}

      {/* Aquí SÍ se puede borrar: la decisión se toma con la película delante,
          y borrar un tratamiento se lleva sus actos, secuencias, hilos y
          espina. Desde el índice no se podía, y era lo correcto. */}
      <Tratamientos proyectoId={(peli as any).id} tipoProyecto={(peli as any).tipo}
        tratamientos={f.tratamientos} cuentas={cuentas} actos={actosDe}
        fondos={fondos} error={eTrat} />

      <QueEsUnTratamiento />
    </div>
  );
}
