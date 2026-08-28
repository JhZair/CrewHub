import { createClient } from "@/lib/supabase/server";
import Realtime from "@/components/Realtime";
import CompromisosActa from "@/components/CompromisosActa";
import { traerFondo } from "@/lib/fondoDatos";

/* ── 📦 LO QUE EL ACTA OBLIGA ──
 *
 * Un PDF escaneado de once páginas que nadie abre, y dentro las reglas que
 * deciden si el fondo se cierra bien o se pierde.
 *
 * Era una de las seis pestañas de una página que las cargaba todas a la vez.
 * Ahora es su propia ruta: entrar aquí pide DOS consultas propias —el acta y
 * los casos del fondo— más las de la cabecera, que las paga cualquier pestaña.
 * Antes se pagaban además las de las otras cinco.
 * La cabecera (título, celdas, alarma) la pone app/fondo/[id]/layout.tsx.
 */

export const metadata = { title: "📦 Entregables" };

export default async function EntregablesPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  /* Token y quién soy, para el canal de tiempo real. Sin `token`, este canal se
     suscribe ANTES de que el layout autentique el socket compartido —los
     efectos de React corren de hijo a padre— y con RLS puede quedarse mudo.
     Sin `miId` se pierde el «no me refresques por lo que escribo yo».
     Las dos son de sesión, no de base: no cuestan un viaje a Supabase. */
  const { data: { session } } = await supabase.auth.getSession();
  const { data: { user: quien } } = await supabase.auth.getUser();

  /* `traerFondo` está cacheada y el layout ya la llamó en este mismo render:
     esto NO es un viaje extra. Hace falta para el enlace al PDF del acta. */
  const [ent, cac, casosQ] = await Promise.all([
    traerFondo(params.id),
    /* En su propia consulta y tolerante: sin db/compromiso-acta.sql corrido,
       la pestaña lo dice y el resto del fondo sigue funcionando. */
    supabase.from("compromiso_acta")
      /* El estado del CASO viaja con el compromiso. Son dos preguntas
         distintas —«¿se entregó?» y «¿estamos trabajando en ello?»— y si solo
         se enseña una, la que se ve se lee como si contestara las dos.
         TODOS los casos de la cláusula, no «el» caso: se traen embebidos por
         `publicaciones.compromiso_id`, y los RESUELTOS siguen colgando de ella
         — en una rendición, lo hecho es justo lo que hay que poder enseñar. */
      .select("id,clase,clausula,titulo,detalle,fecha_limite,estado,entregado_en,url,nota,orden,caso_id," +
        "casos:publicaciones!compromiso_id(id,estado,tipo,archivado_en," +
        "resp:perfiles!responsable(id,nombre,avatar_url,color))")
      .eq("postulacion_id", params.id).order("orden"),
    /* Los casos del fondo, para poder ATAR a una cláusula uno que ya existe.
       Van también los cerrados: un caso resuelto sigue siendo el sitio donde
       está lo que se dijo. */
    supabase.from("publicacion_vinculos")
      .select("pub:publicaciones(id,titulo,tipo,estado,creado_en,archivado_en)")
      .eq("entidad_tipo", "postulacion").eq("entidad_id", params.id)
      .order("creado_en", { ascending: false }).limit(200),
  ]);

  const compromisos = (cac.data || []) as any[];
  const cacError = (cac as any)?.error?.message || null;
  /* Se aplana el embebido —PostgREST devuelve objeto o array de uno según cómo
     resuelva la relación— y se quitan las bitácoras: una nota del muro no es
     «el caso donde está la conversación». */
  const casosDelFondo = ((casosQ.data || []) as any[])
    .map(v => (Array.isArray(v.pub) ? v.pub[0] : v.pub))
    .filter(p => p?.id && p.tipo !== "bitacora" && !p.archivado_en)
    .map(p => ({ id: p.id as string, titulo: (p.titulo || "(sin título)") as string, estado: p.estado as string }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));

  return (
    <>
      {/* Solo lo de esta pestaña, con filtro por fondo. Ver el comentario del
          layout: hasta db/realtime-fondo.sql, estas suscripciones no reciben
          nada — la tabla no estaba publicada. */}
      <Realtime tablas={[{ tabla: "compromiso_acta", filtro: `postulacion_id=eq.${params.id}` }]}
        token={session?.access_token} miId={quien?.id} />
      <p className="fondo-nat-sub">
        Lo que el acta de compromiso obliga: entregables, obligaciones y plazos, cada uno
        con su cláusula para poder comprobarlo en el PDF.
      </p>
      <div className="card">
        <CompromisosActa postulacionId={params.id} compromisos={compromisos as any}
          actaUrl={ent?.acta_url || null} codigoActa={ent?.codigo_acta || null}
          casosFondo={casosDelFondo}
          puedeEditar error={cacError} />
      </div>
    </>
  );
}
