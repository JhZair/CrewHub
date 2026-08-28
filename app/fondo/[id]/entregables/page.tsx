import { createClient } from "@/lib/supabase/server";
import Realtime from "@/components/Realtime";
import CompromisosActa from "@/components/CompromisosActa";
import { traerFondo } from "@/lib/fondoDatos";
import { techo } from "@/lib/api";
import { hoyLima } from "@/lib/fechas";
import Link from "@/components/Enlace";
import { personasVinculadas, recuento54, CLAUSULA_PAPELES } from "@/lib/papeles";

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
  const [ent, cac, casosQ, rheQ, eqpQ, eqfQ, repQ, papQ] = await Promise.all([
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
    /* ── LAS CINCO FLACAS DE LA CLÁUSULA 5.4 ──
       El acta pide contratos y seguros de «todo el personal vinculado». Esa
       lista NO se mantiene a mano: sale de los recibos girados, del equipo
       declarado, del personal previsto y del equipo artístico confirmado —la
       misma regla que usa la pestaña 👥 Equipo, escrita una vez en
       lib/papeles.ts—.
       Aquí solo hace falta CONTAR, así que se piden únicamente los `persona_id`:
       ni nombres, ni montos, ni el directorio. Cinco consultas de una columna
       en el mismo `Promise.all` no encadenan espera.
       Todas tolerantes: sin las migraciones corridas, el bloque lo dice y el
       resto de la pestaña —los compromisos del acta, que es lo importante—
       sigue funcionando. */
    supabase.from("rhe").select("persona_id").eq("postulacion_id", params.id).limit(techo(1000)),
    supabase.from("postulacion_equipo").select("persona_id").eq("postulacion_id", params.id),
    supabase.from("equipo_fondo").select("persona_id").eq("postulacion_id", params.id),
    supabase.from("postulacion_reparto").select("persona_id,situacion")
      .eq("postulacion_id", params.id).limit(techo(500)),
    supabase.from("postulacion_papel")
      .select("id,persona_id,tipo,estado,url,vigente_hasta")
      .eq("postulacion_id", params.id).limit(techo(500)),
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

  /* ── EL RECUENTO DE LA CLÁUSULA 5.4 ──
     ⚠ Si CUALQUIERA de las cinco consultas falló, no se pinta ningún número.
     Con la de papeles rota diría «21 sin contrato» —falso por exceso—; con la
     nómina rota diría «0 vinculadas · 0 sin contrato», que se lee como «está
     todo entregado» y es falso por defecto, sobre la cláusula cuyo
     incumplimiento se convierte en observación de DAFO. Un cero que en
     realidad es «no lo sé» es el error más caro que hemos tenido aquí. */
  const err54 = [rheQ, eqpQ, eqfQ, repQ, papQ]
    .map(q => (q as any)?.error?.message).find(Boolean) || null;
  const vinculadas = err54 ? [] : personasVinculadas(
    [
      ...((rheQ.data || []) as any[]),
      ...((eqpQ.data || []) as any[]),
      ...((eqfQ.data || []) as any[]),
    ].filter(x => x?.persona_id).map(x => ({ persona: { id: x.persona_id as string } })),
    (repQ.data || []) as any[],
  );
  const r54 = err54 ? null : recuento54(vinculadas, (papQ.data || []) as any[], hoyLima());
  /* Cuántas vienen SOLO del equipo artístico: son las que explican por qué este
     número es mayor que las filas de la pestaña 👥 Equipo. */
  const deReparto = vinculadas.filter(v => v.de === "reparto").length;

  return (
    <>
      {/* Solo lo de esta pestaña, con filtro por fondo. Ver el comentario del
          layout: hasta db/realtime-fondo.sql, estas suscripciones no reciben
          nada — la tabla no estaba publicada. */}
      <Realtime tablas={[
        { tabla: "compromiso_acta", filtro: `postulacion_id=eq.${params.id}` },
        /* Sin esto, quien tenga esta pestaña abierta ve el recuento de la 5.4
           congelado mientras otro registra contratos desde 👥 Equipo. */
        { tabla: "postulacion_papel", filtro: `postulacion_id=eq.${params.id}` },
      ]}
        token={session?.access_token} miId={quien?.id} />
      <p className="fondo-nat-sub">
        Lo que el acta de compromiso obliga: entregables, obligaciones y plazos, cada uno
        con su cláusula para poder comprobarlo en el PDF.
      </p>
      {/* ── LA 5.4, CON NÚMEROS ──
          Era una fila del acta con una casilla: se marcaba «entregado» y nadie
          sabía si eran veintiún contratos o tres. Ahora el recuento sale de los
          datos —de la nómina que se deduce sola y de los papeles registrados—,
          así que no se puede dar por cumplida sin haberla cumplido.
          Va ANTES del listado del acta y no dentro: es lo único de esta
          pantalla que cambia solo, y un aviso al final es un aviso que se lee
          cuando ya no sirve. */}
      <div className="card c54">
        <div className="c54-t">
          📎 Cláusula {CLAUSULA_PAPELES} · contratos y seguros del personal vinculado
        </div>
        {err54 ? (
          <div className="err-inline" style={{ lineHeight: 1.5, marginTop: 6 }}>
            ⚠ No se pudo contar: los números no se pintan porque dirían que no falta nada.
            <br /><code style={{ fontSize: 11, opacity: .85 }}>{err54}</code>
            {/column|does not exist|schema cache|PGRST20/i.test(err54) && (
              <><br /><b>Falta correr <code>db/postulacion-papel.sql</code> en Supabase.</b></>
            )}
          </div>
        ) : r54 && r54.vinculadas === 0 ? (
          <div className="c54-vacio">
            Todavía no hay personal vinculado a este fondo: nadie con recibo girado, ni declarado
            en la postulación, ni previsto, ni confirmado en el equipo artístico. Cuando lo haya,
            aquí se dirá cuántos contratos y seguros faltan.
          </div>
        ) : r54 && (
          <>
            <div className="c54-nums">
              {/* ⚠ PARTIDO EN DOS. El total suma la nómina Y el equipo
                  artístico, y la pestaña 👥 Equipo solo enseña la primera: sin
                  desglosar, «26 vinculadas» contra 21 filas allí es un
                  descuadre que nadie puede explicar. */}
              <span className="c54-n" title="La nómina del fondo (recibos girados, equipo declarado y personal previsto) más el equipo artístico confirmado.">
                <b>{r54.vinculadas}</b> vinculadas
                {deReparto > 0 && (
                  <span style={{ color: "var(--dim)" }}>
                    {" "}({r54.vinculadas - deReparto} de la nómina + {deReparto} del equipo artístico)
                  </span>
                )}
              </span>
              <span className="c54-n" style={{ color: r54.sinContrato ? "var(--yellow)" : "var(--green)" }}>
                {r54.sinContrato ? `⚠ ${r54.sinContrato} sin contrato` : "✔ contratos al día"}
              </span>
              <span className="c54-n" style={{ color: r54.sinSeguro ? "var(--yellow)" : "var(--green)" }}>
                {r54.sinSeguro ? `⚠ ${r54.sinSeguro} sin seguro` : "✔ seguros al día"}
              </span>
              {r54.seguroVencido > 0 && (
                <span className="c54-n" style={{ color: "var(--red)" }}
                  title="Su seguro está firmado pero la ventana de cobertura ya pasó. Un PDF firmado no cubre un rodaje que ocurre después.">
                  ⏳ {r54.seguroVencido} con el seguro vencido
                </span>
              )}
              {r54.sinPrueba > 0 && (
                <span className="c54-n" style={{ color: "var(--yellow)" }}
                  title="Marcados como firmados pero sin el documento adjunto: en una rendición eso no se puede probar.">
                  {r54.sinPrueba} documento(s) sin adjuntar
                </span>
              )}
            </div>
            <div className="c54-pie">
              {(r54.contratoNoAplica > 0 || r54.seguroNoAplica > 0) && (
                <span>
                  No aplica en {r54.contratoNoAplica} contrato(s) y {r54.seguroNoAplica} seguro(s),
                  cada uno con su motivo escrito.{" "}
                </span>
              )}
              Se registran persona a persona en <Link href={`/fondo/${params.id}/equipo`}>👥 Equipo</Link>
              {" "}y en <Link href={`/fondo/${params.id}/audiovisual`}>🎥 Audiovisual</Link>.
              El acta pide contrato, convenio de prácticas o locación de servicios de todo el
              personal vinculado, y seguro contra accidentes de quien participa.
            </div>
          </>
        )}
      </div>

      <div className="card">
        <CompromisosActa postulacionId={params.id} compromisos={compromisos as any}
          actaUrl={ent?.acta_url || null} codigoActa={ent?.codigo_acta || null}
          casosFondo={casosDelFondo}
          puedeEditar error={cacError} />
      </div>
    </>
  );
}
