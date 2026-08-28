import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Realtime from "@/components/Realtime";
import VidaFondo from "@/components/VidaFondo";
import { hoyLima } from "@/lib/fechas";
import { traerFondo, traerPerfilActual, traerHitos, traerCartas } from "@/lib/fondoDatos";

/* ── 📍 LA VIDA DEL FONDO ──
 *
 * Dos años de ejecución en una pantalla. No es un adorno: es el expediente con
 * el que se contesta «¿y ustedes qué hicieron?» — y hoy esa respuesta vive en
 * la memoria de quien hizo la llamada.
 *
 * Es la primera pestaña porque al abrir un fondo la primera pregunta no es
 * cuánto hay, es QUÉ PASÓ: qué nos dijeron, qué contestamos, cuánto llevamos
 * callados. Eso es lo que decide si hay que mirar el dinero hoy o el mes que
 * viene.
 *
 * Era una de las seis pestañas de una página que las cargaba todas a la vez.
 * Ahora es la RAÍZ de /fondo/<id> —la que se abre al entrar— y su propia ruta, y es la más barata de las seis: los hitos y las
 * cartas ya viajaron con la cabecera —el contador y el aviso de carta vencida
 * salen de ellos—, así que lo único suyo es la lista de casos del fondo.
 * La cabecera (título, celdas, alarma) la pone app/fondo/[id]/layout.tsx.
 */

export const metadata = { title: "📍 Vida del fondo" };

export default async function VidaPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  /* El token y quién soy, para el canal de tiempo real: sin `token` este canal
     se suscribe ANTES de que el layout autentique el socket compartido —los
     efectos de React corren de hijo a padre—, y con RLS puede quedarse mudo.
     Sin `miId` se pierde el «no me refresques por lo que escribo yo». */
  const { data: { session } } = await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [ent, perfilActual, hitosQ, cartasQ, casosQ] = await Promise.all([
    /* Las cuatro cacheadas ya las llamó el layout en este mismo render, así que
       en carga dura NO son viajes extra: comparten el suyo. `traerHitos` y
       `traerCartas` se piden GORDAS a propósito —ver lib/fondoDatos.ts—
       justamente para que esta pestaña las reciba enteras sin pedirlas otra
       vez. */
    traerFondo(params.id),
    traerPerfilActual(user.id),
    traerHitos(params.id),
    traerCartas(params.id),
    /* ── LOS CASOS DE ESTE FONDO ──
       Para poder atar un hito a su caso: «llamamos a DAFO» tiene detrás una
       conversación entera, y el hito solo lleva el titular. El campo existía
       desde el principio (`hito_fondo.publicacion_id`) pero no había ningún
       sitio donde rellenarlo — un enlace que nadie podía poner.
       Van también los cerrados: un caso resuelto sigue siendo el sitio donde
       está lo que se dijo. */
    supabase.from("publicacion_vinculos")
      .select("pub:publicaciones(id,titulo,tipo,estado,creado_en,archivado_en)")
      .eq("entidad_tipo", "postulacion").eq("entidad_id", params.id)
      /* Orden estable y los más recientes primero: si el tope llega a cortar
         —las bitácoras gastan cupo antes de filtrarse—, que corte por lo más
         viejo y no por donde le convenga a Postgres. Sin `order`, dos recargas
         podían ofrecer casos distintos en el selector. */
      .order("creado_en", { ascending: false })
      .limit(200),
  ]);

  /* «Admin» aquí significa «puede tocar los datos de plata de esta ficha», que
     no es lo mismo que tener /admin entero. Registrar una carta es escribir en
     el expediente, y el asistente de administración lo hace sin necesitar la
     llave maestra — ver db/rhe-permisos.sql. */
  const esAdmin = !!((perfilActual as any)?.es_admin || (perfilActual as any)?.es_finanzas);

  /* El día de HOY según el SERVIDOR, en Lima. Se pasa desde aquí en vez de
     preguntarlo en el navegador: con la fecha del equipo torcida, se vería
     vencido lo que no lo está — y al revés. */
  const hoyDia = hoyLima();
  const titulo = [(ent as any)?.codigo, (ent as any)?.proy?.nombre, (ent as any)?.conv?.anio]
    .filter(Boolean).join(" · ");

  /* Los casos del fondo, para poder atar un hito al suyo. Se aplana el
     embebido —PostgREST devuelve objeto o array de uno según cómo resuelva la
     relación— y se quitan las bitácoras: una nota del muro no es «el caso
     donde está la conversación». */
  const casosDelFondo = ((casosQ.data || []) as any[])
    .map(v => (Array.isArray(v.pub) ? v.pub[0] : v.pub))
    .filter(p => p?.id && p.tipo !== "bitacora" && !p.archivado_en)
    .map(p => ({ id: p.id as string, titulo: (p.titulo || "(sin título)") as string, estado: p.estado as string }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));

  /* Sin la migración corrida, las dos consultas fallan y la pestaña lo dice en
     vez de aparecer vacía —que se leería como «no ha pasado nada»—. */
  const faltaVida = !!((hitosQ as any).error || (cartasQ as any).error);

  return (
    <>
      {/* Solo lo de esta pestaña. Antes la página escuchaba nueve tablas sin
          filtro, así que una carta registrada en OTRO fondo la refrescaba. */}
      <Realtime tablas={[
        { tabla: "hito_fondo", filtro: `postulacion_id=eq.${params.id}` },
        { tabla: "dafo_comunicaciones", filtro: `postulacion_id=eq.${params.id}` },
      ]}
        token={session?.access_token} miId={user?.id} />
      <p className="fondo-nat-sub">
        Lo que ha pasado en este fondo, de la firma del acta al cierre: fechas del acta, cartas
        de DAFO y lo que hicimos nosotros. Lo que no se apunta, en un año no existió.
      </p>
      <div className="card">
        {faltaVida ? (
          <p className="rp-vacio" style={{ color: "var(--yellow)" }}>
            ⚠ Falta correr <b>db/vida-fondo.sql</b> en Supabase → SQL Editor.
            Hasta entonces esta pestaña no puede guardar nada.
          </p>
        ) : (
          <VidaFondo postulacionId={params.id} postulacion={ent as any}
            hitos={((hitosQ as any).data || []) as any} cartas={((cartasQ as any).data || []) as any}
            hoy={hoyDia} etiquetaFondo={titulo} esAdmin={esAdmin}
            casos={casosDelFondo} />
        )}
      </div>
    </>
  );
}
