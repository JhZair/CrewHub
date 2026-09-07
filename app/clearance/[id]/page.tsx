import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "@/components/Enlace";
import Volver from "@/components/Volver";
import Realtime from "@/components/Realtime";
import CoberturaAgrupacion, { type AgrupacionVista } from "@/components/CoberturaAgrupacion";
import PermisosProyecto from "@/components/PermisosProyecto";
import MontajeProyecto from "@/components/MontajeProyecto";
import QueEsUnPermiso from "@/components/QueEsUnPermiso";
import { createClient } from "@/lib/supabase/server";
import { techo } from "@/lib/api";
import { hoyLima } from "@/lib/fechas";
import {
  resumenSemaforo, sinUsoPromocional, semaforo, esMenor, COLOR_RIESGO,
  type FilaAutorizacion, type FilaIncidental, type FilaUsoMusical,
} from "@/lib/clearance";
import {
  catalogosDeRiesgo, contextoDe, nombrePersonaDe, riesgosDe, nombrePeli,
  rotuloBloqueo, catalogoDePersonas, catalogoDeObras, catalogoDeGrabaciones, motivosDe,
  CAMPOS_AUT_FICHA, CAMPOS_INCIDENTAL, CAMPOS_USO_MUSICAL,
} from "@/lib/clearanceDatos";
import { TIPOS_CON_GUION } from "@/lib/tratamiento";

/** ⚠ Por película y no fijo: con dos fichas abiertas, dos pestañas idénticas. */
export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase.from("proyectos")
    .select("nombre,nombre_corto").eq("id", params.id).maybeSingle();
  return { title: data ? `⚖ ${nombrePeli(data)}` : "⚖ Clearance" };
}

/* ══════════════════════════════════════════════════════════════════════════
   ⚖ CLEARANCE DE UNA PELÍCULA

   Todo lo que antes vivía dentro de un plegable en la lista general: qué la
   bloquea, la cobertura de cada agrupación, los permisos —que aquí se
   registran— y la bitácora de montaje.

   ── POR QUÉ AQUÍ SÍ SE ESCRIBE, Y EN EL ÍNDICE NO ──
   Una pantalla que dice qué falta pero no deja hacer nada obliga a ir a otra
   parte a arreglarlo, y entonces no se arregla. Pero el registro necesita seis
   catálogos de desplegable, y traerlos para quince películas a la vez era el
   motivo de que la lista pesara. Aquí se traen una vez, para una.

   ── LAS CONSULTAS VAN FILTRADAS POR PELÍCULA ──
   `.eq("proyecto_id", …)` donde la tabla lo tiene. Lo que sigue siendo global
   es lo que de verdad lo es: una obra, una persona, una banda y una locación
   no pertenecen a una película — la casa de Braulia sale en dos documentales.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function ClearanceDePelicula({
  params,
}: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const hoy = hoyLima();

  /* ⚠ LA FORMA DEL ID, ANTES DE CONSULTAR. Con `/clearance/pepe`, Postgres
     responde «invalid input syntax for type uuid», y eso pone `peli.error`: la
     guarda de abajo NO llama a `notFound()` y la pantalla pinta «no se pudieron
     leer los permisos» sobre una película que nunca existió. Un 404 dice la
     verdad; un error rojo manda a buscar un fallo que no está. */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id))
    notFound();

  /* ⚠ Las obras y las grabaciones NO se piden aquí. Salen de
     `catalogosDeRiesgo`, que ya las trae: pedirlas dos veces eran dos viajes
     tirados y, pasado el techo, DOS LISTAS DISTINTAS — el desplegable ofrecería
     obras que el mapa de riesgo no tiene, y esas filas se calcularían con
     `ctx.obra = undefined`, más bajo de lo real y en silencio. */
  const [peli, auts, incs, usos, docs, agrs, ints, locs, acts, mats, tecnicos, actores, cat] =
    await Promise.all([
      supabase.from("proyectos").select("id,nombre,nombre_corto,tipo,etapa")
        .eq("id", params.id).maybeSingle(),
      supabase.from("autorizacion").select(CAMPOS_AUT_FICHA)
        .eq("proyecto_id", params.id).limit(techo(900) + 1),
      supabase.from("aparicion_incidental").select(CAMPOS_INCIDENTAL)
        .eq("proyecto_id", params.id).limit(techo(900) + 1),
      supabase.from("uso_musical_corte").select(CAMPOS_USO_MUSICAL)
        .eq("proyecto_id", params.id).order("timecode_inicio").limit(techo(900) + 1),
      /* ── LOS PAPELES FIRMADOS ──
         ⚠ Sin esto, el papel se podía subir y NO SE PODÍA VOLVER A VER. El
         botón decía «ver o cambiar» y abría un panel vacío, y `📎` era un emoji
         sin enlace. Todo este módulo existe para enseñar el expediente meses
         después a un fondo o a una aseguradora, y ese era justo el paso que
         faltaba: se guardaba y no se recuperaba. */
      supabase.from("documento_firmado")
        .select("id,modelo,archivo_url,hash_archivo,firmado_el,lugar_firma,tiene_huella_digital,consentimiento_grabado_url,testigos,nota,es_original_digital,ubicacion_original")
        .eq("proyecto_id", params.id).limit(techo(900) + 1),
      supabase.from("agrupacion")
        .select("id,nombre,tipo,procedencia,representante_id,numero_integrantes_declarado")
        .order("nombre").limit(techo(300) + 1),
      supabase.from("agrupacion_integrante")
        .select("agrupacion_id,persona_id,instrumento_rol,orden")
        .order("orden").limit(techo(900) + 1),
      supabase.from("locacion").select("id,nombre,direccion,tipo")
        .order("nombre").limit(techo(300) + 1),
      supabase.from("actividad_rodaje").select("id,proyecto_id,nombre,fecha_inicio")
        .eq("proyecto_id", params.id).order("fecha_inicio").limit(techo(400) + 1),
      supabase.from("material_aportado").select("id,proyecto_id,descripcion,tipo")
        .eq("proyecto_id", params.id).limit(techo(400) + 1),
      /* ── EL REPARTO DE ESTA PELÍCULA ──
         ⚠ Sin esto, la pantalla decía «todavía no hay ningún permiso» sobre una
         película con cinco actores sociales listados en su ficha, y para
         registrar el primero había que buscar a la persona en un desplegable
         con TODAS las del sistema. Cierto y a la vez inútil: lo que hace falta
         saber es a quién le falta.
         Solo los CONFIRMADOS: a una candidata que aún se está viendo no se le
         pide un papel por un trabajo que quizá no ocurra. Mismo filtro que
         /musica, y `situacion` puede ser NULL en las filas anteriores a
         db/proyecto-actores-situacion.sql — esas son gente que ya estaba. */
      /* ── Y EL EQUIPO TÉCNICO ──
         ⚠ `aporte_de_equipo` existía en el vocabulario y ninguna pantalla lo
         enseñaba. Su cesión es la que hace a la productora titular de la obra:
         sin la de la montajista o la del director de fotografía, lo que se
         presenta a un fondo no es suyo. */
      supabase.from("proyecto_equipo")
        .select("persona_id,cargo")
        .eq("proyecto_id", params.id)
        .not("persona_id", "is", null)
        .order("cargo").limit(techo(400) + 1),
      supabase.from("proyecto_actores")
        .select("persona_id,rol,personaje,situacion")
        .eq("proyecto_id", params.id)
        .or("situacion.eq.confirmada,situacion.is.null")
        .not("persona_id", "is", null)
        .order("orden").limit(techo(400) + 1),
      catalogosDeRiesgo(),
    ]);

  /* ⚠ `notFound` y no una pantalla en blanco: un id que no existe tiene que
     decirlo, no enseñar un clearance vacío que se lee como «esta película no
     tiene nada pendiente». */
  if (!(peli as any)?.error && !peli.data) notFound();
  /* ⚠ Y que sea una PELÍCULA. El índice filtra por `TIPOS_CON_GUION`; sin esto,
     `/clearance/<id-de-un-fondo>` pintaba un clearance entero, con panel de
     registro, para algo que no aparece en ninguna lista — permisos que nadie
     volvería a ver. */
  if (peli.data && !TIPOS_CON_GUION.includes((peli.data as any).tipo)) notFound();
  const p = (peli.data || { id: params.id }) as any;
  const nombre = nombrePeli(p);

  const eProy = (peli as any)?.error?.message || null;
  const eAut = (auts as any)?.error?.message || null;
  const eMontaje = (incs as any)?.error?.message || (usos as any)?.error?.message || null;
  const fallo = eProy || eAut || eMontaje;
  const eCatalogo = [docs, agrs, ints, locs, acts, mats, tecnicos, actores]
    .map(r => (r as any)?.error?.message).find(Boolean) || null;
  const ciego = !!cat.error;

  const cortado = [
    [(auts.data || []).length, techo(900), "permisos"],
    [(incs.data || []).length, techo(900), "apariciones incidentales"],
    [(usos.data || []).length, techo(900), "músicas del corte"],
    [(docs.data || []).length, techo(900), "papeles firmados"],
    [(agrs.data || []).length, techo(300), "agrupaciones"],
    [(ints.data || []).length, techo(900), "integrantes"],
    [(locs.data || []).length, techo(300), "locaciones"],
    [(acts.data || []).length, techo(400), "actividades"],
    [(mats.data || []).length, techo(400), "materiales"],
    [(actores.data || []).length, techo(400), "actores sociales"],
    [(tecnicos.data || []).length, techo(400), "equipo técnico"],
  ].filter(([n, t]) => (n as number) > (t as number)).map(([, , q]) => q as string)
    .concat(cat.cortado);

  /* ⚠ TODAS RECORTADAS, no solo las tres grandes. La fila de sonda que se pide
     de más tiene que salir antes de contar nada: con 901 integrantes, el «5 de
     11» de una agrupación pasaba a decir «5 de 12», y un número equivocado no
     da error — se lee y se cree. */
  const suyas = ((auts.data || []) as any[]).slice(0, techo(900)) as FilaAutorizacion[];
  const mIncs = ((incs.data || []) as any[]).slice(0, techo(900)) as FilaIncidental[];
  const mUsos = ((usos.data || []) as any[]).slice(0, techo(900)) as FilaUsoMusical[];
  const lDocs = ((docs.data || []) as any[]).slice(0, techo(900));
  const lAgrs = ((agrs.data || []) as any[]).slice(0, techo(300));
  const lInts = ((ints.data || []) as any[]).slice(0, techo(900));
  const lLocs = ((locs.data || []) as any[]).slice(0, techo(300));
  const lActs = ((acts.data || []) as any[]).slice(0, techo(400));
  const lMats = ((mats.data || []) as any[]).slice(0, techo(400));
  const lActores = ((actores.data || []) as any[]).slice(0, techo(400));
  const lTecnicos = ((tecnicos.data || []) as any[]).slice(0, techo(400));

  const ctxDe = contextoDe(cat, hoy);
  /* ⚠ El MISMO `semaforo` con el MISMO contexto que el índice, por lib/
     clearanceDatos. Si esta pantalla calculara el veredicto a su manera, la
     lista podría decir «se puede publicar» y la ficha «no», y no habría forma
     de saber cuál miente. */
  const s = semaforo(suyas, ctxDe, { incidentales: mIncs, usosMusicales: mUsos });
  const riesgos = riesgosDe(suyas, ctxDe);
  const motivos = motivosDe(suyas, ctxDe);
  const sinPromo = sinUsoPromocional(suyas);

  const agrDe = new Map(lAgrs.map(a => [a.id, a]));
  const intsDe = new Map<string, { personaId: string; nombre: string; instrumento?: string | null }[]>();
  for (const i of lInts) {
    intsDe.set(i.agrupacion_id, [...(intsDe.get(i.agrupacion_id) || []), {
      personaId: i.persona_id,
      nombre: nombrePersonaDe(cat, i.persona_id) || "(persona no encontrada)",
      instrumento: i.instrumento_rol,
    }]);
  }

  /* Los tres del catálogo de riesgo, derivados de las MISMAS filas con que se
     calculó el veredicto. Ver lib/clearanceDatos.ts. */
  const catalogoPersonas = catalogoDePersonas(cat);
  const catalogoObras = catalogoDeObras(cat);
  const catalogoGrabaciones = catalogoDeGrabaciones(cat);
  const catalogoAgrupaciones = lAgrs
    .map(a => ({ id: a.id, nombre: a.procedencia ? `${a.nombre} · ${a.procedencia}` : a.nombre }));
  /* La dirección desambigua: hay una plaza de armas en cada pueblo. */
  const catalogoLocaciones = lLocs
    .map(l => ({ id: l.id, nombre: l.direccion ? `${l.nombre} · ${l.direccion}` : l.nombre }));

  const nombreDe = (l: { id: string; nombre: string }[], id?: string | null) =>
    l.find(x => x.id === id)?.nombre || null;

  /* Los papeles por su id, tal cual: el componente los precarga en el
     formulario y pinta el enlace al archivo. Objetos planos, nada de Maps —
     `PermisosProyecto` es cliente. */
  const documentos: Record<string, any> = Object.fromEntries(lDocs.map(x => [x.id, x]));
  /* Los que son una copia y no dicen dónde vive el papel. No es un fallo: es la
     lista de trabajo, y el motivo por el que esto es una columna. */
  const sinArchivar = lDocs.filter(x =>
    x.es_original_digital !== true && !String(x.ubicacion_original || "").trim());

  /* ── EL REPARTO, CON SU NOMBRE Y SI ES MENOR ──
     ⚠ Sin repetir a nadie: la misma persona puede tener DOS filas en el
     reparto —como ella misma y como «la cantante»— y saldría dos veces, con
     dos botones de registrar el mismo papel.
     `esMenor` sale de `lib/clearance` y no de un `if` aquí: es la regla R5, y
     la fecha de nacimiento manda sobre el booleano porque quien cumple
     dieciocho deja de ser menor sin que nadie lo desmarque. */
  const vistos = new Set<string>();
  const repartoVista: { id: string; nombre: string; papel: string | null; menor: boolean }[] = [];
  for (const a of lActores) {
    /* Un bucle y no un `filter` con `Set.add` dentro: un efecto escondido en un
       filtro funciona hasta que alguien reordena la cadena. */
    if (!a.persona_id || vistos.has(a.persona_id)) continue;
    vistos.add(a.persona_id);
    repartoVista.push({
      id: a.persona_id as string,
      nombre: nombrePersonaDe(cat, a.persona_id) || "(persona no encontrada)",
      papel: (a.personaje || a.rol || null) as string | null,
      menor: esMenor(cat.persDe.get(a.persona_id), hoy),
    });
  }

  /* ── EL EQUIPO TÉCNICO, PARA SU CESIÓN ──
     ⚠ NO se excluye a quien ya está en el reparto, y la primera versión sí lo
     hacía. Son dos papeles DISTINTOS: a la directora que además sale a cámara
     se le pide su release de imagen Y su cesión de aporte creativo. Al
     excluirla, se quedaba con un solo botón —el del release— y su cesión no
     tenía ningún atajo: había que ir a `＋ permiso` y buscarla en el
     desplegable de todas las personas del sistema. Y es de quien más falta
     hace, porque es la que hace a la productora titular.
     `filaPersona` está clavada por tipo y su `key` es `id|tipo`, así que las
     dos filas conviven sin chocar.
     Se deduplica DENTRO de esta lista y con su propio `Set`: el compartido con
     el reparto era lo que la borraba. */
  const vistosTec = new Set<string>();
  const equipoVista: { id: string; nombre: string; papel: string | null; menor: boolean }[] = [];
  for (const m of lTecnicos) {
    if (!m.persona_id || vistosTec.has(m.persona_id)) continue;
    vistosTec.add(m.persona_id);
    equipoVista.push({
      id: m.persona_id as string,
      nombre: nombrePersonaDe(cat, m.persona_id) || "(persona no encontrada)",
      papel: (m.cargo || null) as string | null,
      menor: esMenor(cat.persDe.get(m.persona_id), hoy),
    });
  }

  /* Las bandas que tienen algún permiso en ESTA película. La lista global de
     agrupaciones en cada documental sería ruido. */
  const agrIds = [...new Set(suyas
    .map(a => a.objeto_agrupacion_id || a.otorgante_agrupacion_id)
    .filter(Boolean) as string[])];

  return (
    <div className="shell">
      <Realtime tablas={["autorizacion", "agrupacion_integrante", "documento_firmado",
          "aparicion_incidental", "uso_musical_corte"]}
        token={session?.access_token} miId={user.id} />
      <div className="topbar"><Volver /></div>

      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 className="title-lg" style={{ margin: 0 }}>⚖ {nombre}</h1>
        {!fallo && (
          <span className="clr-sem" style={{
            color: s.sinDatos || (ciego && s.publicable) ? "var(--dim)"
              : s.publicable ? "var(--green)" : "var(--red)",
          }}>
            {s.sinDatos ? "sin datos"
              : ciego && s.publicable ? "no se puede decir"
              : s.publicable ? "✓ se puede publicar" : "🚫 NO se puede publicar"}
          </span>
        )}
      </div>
      <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "4px 0 14px", lineHeight: 1.6 }}>
        {!fallo && <>{resumenSemaforo(s)} · </>}
        <Link href="/clearance" className="gx-filtro">← todas las películas</Link>
        {" · "}
        <Link href={`/entidad/proyecto/${p.id}`} className="gx-filtro">ficha de {nombre} →</Link>
      </div>

      {fallo && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ No se pudieron leer los permisos: <code>{fallo}</code>
          {/column|does not exist|schema cache|PGRST20/i.test(fallo) && (
            <> <b>Faltan las migraciones <code>db/clearance-*.sql</code> en Supabase,
              en su orden: agrupacion → obra → autorizacion → lugares → montaje →
              obra-cesion.</b></>
          )}
          <div style={{ marginTop: 4 }}>
            El semáforo <b>no</b> se pinta: un «se puede publicar» calculado sobre una
            lista vacía por error es la mentira más cara que puede decir esta pantalla.
          </div>
        </div>
      )}

      {cat.error && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ No se pudo leer el catálogo de riesgo: <code>{cat.error}</code>
          <div style={{ marginTop: 4 }}>
            Los permisos se leen igual, pero el riesgo se calcula <b>a ciegas</b>
            —sin saber si una obra está verificada o si alguien es menor— así que
            el veredicto se degrada a «no se puede decir».
          </div>
        </div>
      )}

      {eCatalogo && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ No se pudieron leer los desplegables: <code>{eCatalogo}</code>
          <div style={{ marginTop: 4 }}>
            Faltan las agrupaciones, lugares, actividades o materiales, así que no se
            pueden registrar permisos sobre ellos. El semáforo <b>no</b> se ve
            afectado: esas tablas no entran en el cálculo del riesgo.
          </div>
        </div>
      )}

      {!!cortado.length && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ Se cortó en el tope de la API ({cortado.join(", ")}). El semáforo habla
          solo de lo que se leyó, así que puede faltar más de lo que dice.
        </div>
      )}

      {/* ── QUÉ ME FALTA PARA PUBLICAR ──
          Ordenado por riesgo, que es el orden en que hay que atacarlo. Con el
          motivo escrito: un rojo sin motivo se deja de mirar. */}
      {/* ── LA AYUDA ──
          ⚠ DESPUÉS de los avisos y dentro de `!fallo`. Estaba justo bajo la
          cabecera, y una tarjeta plegada de cincuenta píxeles empujaba hacia
          abajo lo que urge. Peor con `fallo` puesto: la pantalla se queda sin
          semáforo, sin bloqueos y sin panel de registro, y lo único entre el
          título y el error rojo era una invitación a leer sobre los once tipos
          de permiso en una pantalla que no ha podido leer ni uno. */}
      {!fallo && <QueEsUnPermiso />}

      {/* ⚠ Sin `card`: `.clr-bloq` va después en globals.css y con el mismo
          peso, así que le ganaba el `border-radius` y el `padding` — salía una
          tarjeta con dos esquinas cuadradas y el borde rojo pisado. */}
      {!fallo && s.bloqueos.length > 0 && (
        <div className="clr-bloq" style={{ marginBottom: 12 }}>
          <div className="trt-cab-t">qué lo impide</div>
          {s.bloqueos.map(b => {
            /* El mismo rótulo que el índice, por lib/clearanceDatos: dos
               cadenas de respaldo distintas describían el mismo bloqueo de dos
               maneras, y la de la lista se dejaba el nombre de la agrupación. */
            const { que, quien } = rotuloBloqueo(b, suyas, cat,
              id => (id ? agrDe.get(id)?.nombre : null) || null);
            return (
              <div key={b.id} className="clr-bl">
                <span className="clr-pt" style={{ color: COLOR_RIESGO[b.nivel] }}>
                  {b.nivel === "critico" ? "🚫" : "🔶"}
                </span>
                <span className="clr-que">{que}{quien ? ` · ${quien}` : ""}</span>
                <span className="clr-mot" style={{ color: COLOR_RIESGO[b.nivel] }}>{b.txt}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Igual que arriba: `.trt-vacio` tiene `padding: 4px 0` y con `card`
          dejaba el texto pegado al borde. */}
      {!fallo && s.sinDatos && (
        <div className="trt-vacio" style={{ marginBottom: 12 }}>
          Ningún permiso registrado en esta película. <b>No es «todo en regla»</b>:
          es que nadie ha empezado, o que la consulta no trajo nada. Un cero aquí
          no significa que se pueda publicar.
        </div>
      )}

      {/* ── LA COBERTURA DE CADA AGRUPACIÓN — R1 ── */}
      {!fallo && agrIds.map(id => {
        const a = agrDe.get(id);
        if (!a) return null;
        const vista: AgrupacionVista = {
          id: a.id, nombre: a.nombre, tipo: a.tipo, procedencia: a.procedencia,
          representanteId: a.representante_id,
          representanteNombre: nombrePersonaDe(cat, a.representante_id),
          numeroDeclarado: a.numero_integrantes_declarado,
          integrantes: intsDe.get(a.id) || [],
        };
        return (
          <CoberturaAgrupacion key={id} proyectoId={p.id} agrupacion={vista}
            autorizaciones={suyas} personas={catalogoPersonas}
            /* Cuadrilla y hermandad danzan tanto como el conjunto de danza —la
               cuadrilla del cargo de Lino es de danzantes—, así que el permiso
               se tipa igual. Solo `banda_musicos` es interpretación musical con
               seguridad. */
            tipoInterpretacion={a.tipo === "banda_musicos"
              ? "interpretacion_musical" : "interpretacion_danza"} />
        );
      })}

      {/* ── LOS ORIGINALES QUE NADIE HA DICHO DÓNDE ESTÁN ──
          ⚠ La migración justifica que `ubicacion_original` sea una COLUMNA y no
          una frase dentro de la nota con esto: «así se puede listar qué
          originales faltan por archivar». Sin esta lista, esa frase era falsa —
          para saberlo habría que abrir el panel de cada papel uno por uno, que
          es exactamente igual de imposible que con la nota. Una columna que
          nadie lee es la otra mitad de una columna que nadie escribe. */}
      {!fallo && sinArchivar.length > 0 && (
        <div className="ces-aviso" style={{ marginTop: 10 }}>
          ⚠ {sinArchivar.length} papel{sinArchivar.length === 1 ? "" : "es"} subido
          {sinArchivar.length === 1 ? "" : "s"} sin decir dónde está su original.
          Lo que se subió es una foto; el papel firmado a mano está en algún
          sitio, y el día que haya una disputa lo piden. Ábrelo{sinArchivar.length === 1 ? "" : "s"} en
          📎 y apunta la carpeta.
        </div>
      )}

      {/* ── R6 · QUIÉN NO PUEDE IR EN PROMOCIÓN ──
          El tráiler y el afiche se publican antes que la película, a veces años
          antes. Un permiso que autoriza salir en la pieza y no en su promoción
          es frecuente, y si no se puede listar se incumple sin querer. */}
      {!fallo && sinPromo.length > 0 && (
        <div className="ces-aviso" style={{ marginTop: 10 }}>
          ⚠ No pueden aparecer en tráiler, afiche ni miniatura:{" "}
          {sinPromo.map(a => nombrePersonaDe(cat, a.objeto_persona_id) || "alguien").join(", ")}.
          Firmaron para la película, no para su promoción.
        </div>
      )}

      {/* ── LO REGISTRADO, Y DONDE SE REGISTRA ── */}
      {!fallo && (
        <PermisosProyecto
          proyectoId={p.id} autorizaciones={suyas}
          personas={catalogoPersonas}
          agrupaciones={catalogoAgrupaciones}
          obras={catalogoObras} grabaciones={catalogoGrabaciones}
          locaciones={catalogoLocaciones}
          actividades={lActs.map(a => ({ id: a.id, nombre: a.nombre }))}
          materiales={lMats.map(m => ({ id: m.id, nombre: m.descripcion }))}
          reparto={repartoVista} equipo={equipoVista} documentos={documentos}
          riesgos={riesgos} motivos={motivos} hoy={hoy} />
      )}

      {/* ── LA BITÁCORA DE MONTAJE ──
          Quién sale sin firmar y qué suena en cada minuto. No son permisos, son
          decisiones — pero R8 las cuenta igual: una persona sin desenfocar en
          el corte impide publicar lo mismo que un papel que falta. */}
      {!fallo && (
        <MontajeProyecto
          proyectoId={p.id} incidentales={mIncs} usos={mUsos}
          obras={catalogoObras} grabaciones={catalogoGrabaciones}
          agrupaciones={catalogoAgrupaciones}
          /* Solo las licencias de fonograma FIRMADAS de ESTA película: es lo
             único que puede dar por resuelta una música de tercero. */
          licencias={suyas
            .filter(a => a.tipo === "fonograma" && a.estado === "firmada")
            .map(a => ({
              id: a.id,
              nombre: `${nombreDe(catalogoGrabaciones, a.objeto_grabacion_id) || "fonograma"} · firmada ${a.firmado_el || ""}`,
            }))} />
      )}
    </div>
  );
}
