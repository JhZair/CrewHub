import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Realtime from "@/components/Realtime";
import Plegable from "@/components/Plegable";
import CronogramaPostulacion from "@/components/CronogramaPostulacion";
import VersionesFondo from "@/components/VersionesFondo";
import RepartoFondo from "@/components/RepartoFondo";
import { etapasDe } from "@/lib/etapas";
import { techo } from "@/lib/api";
import { traerFondo, traerPerfilActual, traerVersiones } from "@/lib/fondoDatos";
import { resumenCesiones } from "@/lib/repartoFondo";

/* ── 🎥 AUDIOVISUAL ──
 *
 * La otra naturaleza del fondo: Financiera dice cuánto, esta dice QUÉ. Dos años
 * de rodaje con su cronograma de ejecución y las versiones que se le fueron
 * fijando.
 *
 * Era una de las seis pestañas de una página que las cargaba todas a la vez.
 * Ahora es su propia ruta: entrar aquí pide el cronograma, el catálogo de
 * plantillas y el plantel de la postulación —tres consultas— en vez de las
 * veintitantas de las seis pestañas juntas. El fondo, las versiones y el perfil
 * de quien mira ya viajaron con la cabecera.
 * La cabecera (título, celdas, alarma) la pone app/fondo/[id]/layout.tsx.
 */

export const metadata = { title: "🎥 Audiovisual" };

const dim = (t: string) => <span style={{ color: "var(--dim)", fontWeight: 400 }}>{t}</span>;

export default async function AudiovisualPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  /* Token y quién soy, para el canal de tiempo real. Sin `token`, este canal se
     suscribe ANTES de que el layout autentique el socket compartido —los
     efectos de React corren de hijo a padre— y con RLS puede quedarse mudo.
     Sin `miId` se pierde el «no me refresques por lo que escribo yo».
     Las dos son de sesión, no de base: no cuestan un viaje a Supabase. */
  const { data: { session } } = await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [ent, perfilActual, versiones, cp, pl, eqp, rep, per] = await Promise.all([
    /* Cacheadas y ya llamadas por el layout en este mismo render: en carga dura
       NO cuestan un viaje. Hacen falta el tipo de proyecto y la categoría de la
       convocatoria —de ellas salen las etapas— y la versión vigente del
       cronograma. */
    traerFondo(params.id),
    traerPerfilActual(user.id),
    traerVersiones(params.id),
    supabase.from("cronograma_actividades").select("*, resp:perfiles!responsable(nombre)")
      .eq("postulacion_id", params.id)
      .order("etapa").order("orden").order("fecha_inicio").order("creado_en"),
    supabase.from("plantillas_cronograma")
      .select("id,nombre,tipo_proyecto,acts:plantilla_actividades(count)").order("nombre"),
    /* El equipo que se presentó: es la nómina del cronograma de esta
       postulación, aquí igual que en la ficha. Sin esto, la misma actividad
       ofrecería responsables distintos según por qué pantalla se entre.
       Del bloque de persona solo se piden las cuatro columnas que arman el
       desplegable. La ficha vieja traía además domicilio, RUC y la suspensión
       de 4ta porque la MISMA fila alimentaba la pestaña Equipo; partidas, ese
       peso ya no se paga aquí. */
    supabase.from("postulacion_equipo")
      .select("cargo,persona:personas(id,nombre,alias,foto_url)")
      .eq("postulacion_id", params.id),
    /* ── EL EQUIPO ARTÍSTICO ──
       Quién SALE en la película. Lista propia del fondo, no un puntero a la
       del proyecto: el fondo tiene que poder contestar quién estaba en el
       expediente que ganó y quién apareció rodando, y eso el proyecto no lo
       sabe. Razonado en db/postulacion-reparto.sql.
       `.limit(300)` explícito: el techo por defecto de PostgREST son 1000
       filas y CORTA SIN AVISAR. Trescientos personajes en un fondo no pasa —el
       mayor que tenemos ronda los veinte— pero un tope escrito se ve al
       leerlo; uno heredado, no. */
    supabase.from("postulacion_reparto")
      .select("id,persona_id,personaje,proyecto_actor_id,rol,especialidad,procedencia," +
        "cesion_estado,cesion_url,cesion_fecha,nota,orden," +
        "persona:personas(id,nombre,alias,foto_url)")
      .eq("postulacion_id", params.id).order("orden").limit(300),
    /* El catálogo para elegir persona. Las mismas cuatro columnas que usa la
       ficha del proyecto, para que el desplegable se lea igual en los dos
       sitios.
       ⚠ `techo()` y no un número a mano: el tope real de PostgREST en este
       proyecto son 1000 filas y escribir `.limit(2000)` no lo sube, lo TAPA
       —está contado en lib/api.ts, donde se corrigieron veinte límites
       escritos de buena fe con números que describían un techo inexistente—.
       Pasado el millar, la persona que falta simplemente no sale en el
       desplegable y quien la busca concluye que no tiene ficha.
       ⚠ Y se paga en CADA carga de la pestaña, abra o no alguien el selector.
       Es la única consulta de aquí que no pinta nada por sí sola; va en el
       mismo `Promise.all`, así que no encadena espera, pero es peso. Si algún
       día molesta, lo que hay que mover es esto. */
    supabase.from("personas").select("id,nombre,alias,tipo").order("nombre").limit(techo(2000)),
  ]);

  const esAdmin = !!((perfilActual as any)?.es_admin || (perfilActual as any)?.es_finanzas);
  const categoria = (ent as any)?.conv?.categoria || null;

  /* Responsable de actividad de postulación = persona del equipo
     (`responsable_persona`), no cuenta del sistema. Se normaliza a
     `responsable` al leer — ver db/crono-responsable-persona.sql. */
  const cronoPost = (cp.data || []).map((a: any) => ({ ...a, responsable: a.responsable_persona || null }));

  const cargosF = new Map<string, string[]>();
  const nombresF = new Map<string, string>();
  const fotosF = new Map<string, string | null>();
  for (const m of (eqp.data || []) as any[]) {
    const p = Array.isArray(m?.persona) ? m.persona[0] : m?.persona; if (!p?.id) continue;
    nombresF.set(p.id, p.alias || p.nombre || "—");
    fotosF.set(p.id, p.foto_url || null);
    cargosF.set(p.id, [...(cargosF.get(p.id) || []), m.cargo].filter(Boolean));
  }
  const plantelPost = [...nombresF].map(([id, n]) => ({
    id, nombre: (cargosF.get(id) || []).length ? `${n} · ${(cargosF.get(id) || []).join(" / ")}` : n,
    foto: fotosF.get(id) || null,
  }));
  const plantillas = (pl.data || []).map((x: any) => ({
    id: x.id, nombre: x.nombre, tipo_proyecto: x.tipo_proyecto, n: x.acts?.[0]?.count ?? 0,
  }));

  /* ⚠ El error se pasa entero al componente y NO se traga con `|| []`. Una
     lista vacía por fallo se lee como «no hay equipo artístico» y, peor, como
     «no falta ninguna cesión» — que es justo el papel que si falta impide usar
     el material. Cuatro loaders del fondo hacían `data || []` y la cabecera
     decía «todavía ninguna» cuando lo que pasaba era que no se podía leer. */
  const reparto = (rep.data || []) as any[];
  const repError = (rep as any)?.error?.message || null;
  const personasCat = ((per.data || []) as any[])
    .map(x => ({ ...x, nombre: x.alias ? `${x.nombre} · ${x.alias}` : x.nombre }));

  /* El resumen para el título del plegable. No se pinta si la consulta falló:
     `resumenCesiones([])` diría «0 pendientes», o sea «está todo firmado». */
  const ces = repError ? null : resumenCesiones(reparto);

  // Versiones del cronograma con su autor resuelto.
  const versCrono = (versiones as any[])
    .filter((v: any) => v.tipo === "cronograma")
    .map((v: any) => ({ ...v, autor: v.creado?.nombre || null }));
  const vigCrono = versCrono.find((v: any) => v.vigente) || null;

  return (
    <>
      {/* Solo lo de esta pestaña. Antes la página escuchaba nueve tablas sin
          filtro, así que una actividad movida en OTRO fondo la refrescaba. */}
      <Realtime tablas={[
        { tabla: "cronograma_actividades", filtro: `postulacion_id=eq.${params.id}` },
        { tabla: "version_fondo", filtro: `postulacion_id=eq.${params.id}` },
        /* ⚠ Hasta correr db/postulacion-reparto.sql, esta suscripción se abre,
           dice SUBSCRIBED y no emite nada: una tabla no publicada en
           `supabase_realtime` no da error, simplemente no llega nunca un
           evento. La migración la publica. */
        { tabla: "postulacion_reparto", filtro: `postulacion_id=eq.${params.id}` },
      ]}
        token={session?.access_token} miId={user.id} />
      <p className="fondo-nat-sub">La obra que hay que entregar: el rodaje de dos años y su registro.</p>

      {/* ── 🎭 QUIÉN SALE ──
          Va antes del cronograma porque contesta la pregunta anterior: el
          cronograma dice cuándo se rueda, esto dice a quién. Y porque lleva
          dentro el único aviso de esta pestaña que caduca —las cesiones sin
          firmar—, y un aviso al final de la página es un aviso que se lee
          cuando ya no sirve. */}
      <div style={{ scrollMarginTop: 12 }}>
        <Plegable id={`fondo:${params.id}:reparto`} titulo="🎭 Equipo artístico" abiertoPorDefecto={true}
          resumen={ces
            ? dim(ces.total
              ? `${ces.total} ${ces.total === 1 ? "persona" : "personas"}${ces.pendientes ? ` · ${ces.pendientes} sin cesión` : ""}`
              : "sin equipo artístico")
            : dim("no se pudo leer")}>
          <RepartoFondo postulacionId={params.id}
            proyectoId={(ent as any)?.proy?.id || null}
            filas={reparto} personas={personasCat}
            tipo={(ent as any)?.proy?.tipo || null} error={repError} />
        </Plegable>
      </div>

      <div style={{ scrollMarginTop: 12 }}>
        <Plegable id={`fondo:${params.id}:crono`} titulo="📅 Cronograma de ejecución" abiertoPorDefecto={true}
          resumen={dim(cronoPost.filter((a: any) => a.estado !== "cancelada").length
            ? `${cronoPost.filter((a: any) => a.estado !== "cancelada").length} actividades` : "sin actividades")}>
          <CronogramaPostulacion key={`crono-${params.id}`} postulacionId={params.id}
            actividades={cronoPost} perfiles={plantelPost}
            plantillas={plantillas} tipoProyecto={(ent as any)?.proy?.tipo || ""}
            etapas={etapasDe(categoria)}
            postulado={vigCrono?.datos || null}
            postuladoEn={vigCrono?.creado_en || null} ocultarFijar />
          <Plegable nivel={2} id={`fondo:${params.id}:crono:versiones`} titulo="🕑 Historial de versiones"
            abiertoPorDefecto={false}
            resumen={dim(versCrono.length ? `${versCrono.length} versión(es)` : "sin versiones")}>
            <VersionesFondo postulacionId={params.id} tipo="cronograma" esAdmin={esAdmin} versiones={versCrono} />
          </Plegable>
        </Plegable>
      </div>
      {/* Lo que el plan tiene mapeado pero aún no se construye: se anuncia
          para que se sepa dónde va a vivir, no para simular que ya está. */}
      <div className="fondo-pronto">
        <Pronto ico="📝" t="Contratos oficiales" d="Los contratos de personal de la ejecución (distintos de los precontratos de la postulación)." />
        {/* Ojo con el rótulo: las cesiones de imagen de quienes SALEN ya no son
            «pronto», están arriba en el equipo artístico. Lo que falta aquí es
            lo de la OBRA —la licencia de comunicación pública del 5.3.8, la
            música, el archivo de terceros—, que es otra cosa. Dejarlo como
            «cesiones» a secas haría que nadie encontrara las que sí existen. */}
        <Pronto ico="©️" t="Derechos de la obra" d="Licencia de comunicación pública (cl. 5.3.8), música y material de archivo de terceros. Las cesiones de imagen de quienes salen están en el equipo artístico." />
        <Pronto ico="🎞️" t="Material de archivo (producción)" d="El registro que se genera durante el rodaje." />
        <Pronto ico="📖" t="Informes de ejecución" d="El informe narrativo por etapa — lo alimentan los casos del proyecto." />
      </div>
    </>
  );
}

/* Una tarjeta de «esto vendrá»: dice qué se va a poder hacer aquí y que
   todavía no. Un hueco en blanco se lee como un fallo; esto se lee como un
   plan. */
function Pronto({ ico, t, d }: { ico: string; t: string; d: string }) {
  return (
    <div className="card fondo-pronto-card">
      <div style={{ fontWeight: 700, fontSize: 12.5 }}>{ico} {t} <span className="badge" style={{ marginLeft: 4, color: "var(--dim)", background: "rgba(255,255,255,.05)" }}>pronto</span></div>
      <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>{d}</div>
    </div>
  );
}
