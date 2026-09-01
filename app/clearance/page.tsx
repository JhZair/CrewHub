import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/components/Enlace";
import Volver from "@/components/Volver";
import Plegable from "@/components/Plegable";
import Realtime from "@/components/Realtime";
import CoberturaAgrupacion, { type AgrupacionVista } from "@/components/CoberturaAgrupacion";
import PermisosProyecto from "@/components/PermisosProyecto";
import { createClient } from "@/lib/supabase/server";
import { techo } from "@/lib/api";
import { hoyLima } from "@/lib/fechas";
import {
  semaforo, resumenSemaforo, sinUsoPromocional, riesgoDe,
  META_TIPO_AUT, COLOR_RIESGO,
  type FilaAutorizacion, type ContextoRiesgo, type TipoAutorizacion,
  type NivelRiesgo,
} from "@/lib/clearance";
import { TIPOS_CON_GUION, peliculaViva } from "@/lib/tratamiento";

export const metadata: Metadata = { title: "⚖ Clearance" };

/* ══════════════════════════════════════════════════════════════════════════
   ¿PUEDO PUBLICAR ESTE DOCUMENTAL HOY, Y QUÉ ME FALTA SI NO?

   Es la única pregunta que esta pantalla contesta, y va arriba del todo en
   cada película. Todo lo demás —los permisos, las bandas, los papeles— es el
   camino para poder contestarla sin mentir.

   ── POR QUÉ EL SEMÁFORO NO ES UN NÚMERO ──
   «12 de 18 permisos» suena a progreso y no dice nada: si los seis que faltan
   son de la banda que suena en toda la película, no se puede publicar. Lo que
   manda es el peor bloqueo, no el porcentaje.

   ── UN CERO NO ES UN CERO ──
   Si la consulta falla y llega una lista vacía, «0 pendientes» se lee como
   «puedo publicar», que es lo contrario de la verdad. Por eso `semaforo()`
   devuelve `sinDatos` aparte de `publicable`, y aquí el error del servidor se
   pinta EN VEZ del semáforo, no debajo.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function Clearance({
  searchParams,
}: { searchParams?: { todas?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const todas = searchParams?.todas === "1";
  const hoy = hoyLima();

  const [proys, auts, agrs, ints, obras, grabs, pers] = await Promise.all([
    supabase.from("proyectos").select("id,nombre,nombre_corto,tipo,etapa")
      .in("tipo", TIPOS_CON_GUION).order("nombre").limit(techo(400) + 1),
    supabase.from("autorizacion")
      .select("id,proyecto_id,tipo,naturaleza,otorgante_tipo,otorgante_persona_id," +
        "otorgante_agrupacion_id,otorgante_entidad_nombre,calidad_firmante," +
        "objeto_persona_id,objeto_obra_id,objeto_grabacion_id,objeto_agrupacion_id," +
        "medios,permite_uso_promocional,incluye_explotacion_comercial_futura," +
        "tipo_plazo,plazo_anios,plazo_hasta,estado,riesgo_manual,prioridad," +
        "documento_id,firmado_el,notas")
      .limit(techo(900) + 1),
    supabase.from("agrupacion")
      .select("id,nombre,tipo,procedencia,representante_id,numero_integrantes_declarado")
      .order("nombre").limit(techo(300) + 1),
    supabase.from("agrupacion_integrante")
      .select("agrupacion_id,persona_id,instrumento_rol,orden")
      .order("orden").limit(techo(900) + 1),
    /* Del catálogo, solo lo que la regla de riesgo mira. Traer la ficha entera
       de cada obra para calcular un color sería pedir de más en cada carga. */
    supabase.from("obra")
      .select("id,titulo,autor_conocido,iswc,estado_dominio_publico,es_tradicional_o_anonima")
      .limit(techo(900) + 1),
    supabase.from("grabacion")
      .select("id,descripcion,origen,plan_ia,productor_fonografico,reconocida_por_sistemas_automaticos")
      .limit(techo(900) + 1),
    supabase.from("personas")
      .select("id,nombre,alias,es_menor_de_edad,fecha_nacimiento,representante_legal_id")
      .order("nombre").limit(techo(900) + 1),
  ]);

  /* ⚠ Los errores NO se tragan con `|| []`. Una lista vacía por fallo se lee
     como «no falta ningún permiso», que es lo contrario de la verdad sobre
     unos papeles cuya ausencia impide estrenar. */
  const eProy = (proys as any)?.error?.message || null;
  const eAut = (auts as any)?.error?.message || null;
  const fallo = eProy || eAut;
  /* El catálogo y las bandas no tumban la pantalla —los permisos se leen
     igual— pero sin ellos el riesgo se calcula a ciegas y la cobertura de las
     agrupaciones desaparece. Así que se dice. */
  const eLado = [agrs, ints, obras, grabs, pers]
    .map(r => (r as any)?.error?.message).find(Boolean) || null;

  const cortado = [
    [(proys.data || []).length, techo(400), "películas"],
    [(auts.data || []).length, techo(900), "permisos"],
    [(agrs.data || []).length, techo(300), "agrupaciones"],
    [(ints.data || []).length, techo(900), "integrantes"],
    [(obras.data || []).length, techo(900), "obras"],
    [(grabs.data || []).length, techo(900), "grabaciones"],
    [(pers.data || []).length, techo(900), "personas"],
  ].filter(([n, t]) => (n as number) > (t as number)).map(([, , q]) => q as string);

  const listaAuts = ((auts.data || []) as any[]).slice(0, techo(900)) as FilaAutorizacion[];

  /* ── LOS ÍNDICES, EN UN SOLO RECORRIDO ──
     Un `find` por fila dentro del render sería recorrer el catálogo una vez por
     permiso, y son cientos. */
  const obraDe = new Map(((obras.data || []) as any[]).map(o => [o.id, o]));
  const grabDe = new Map(((grabs.data || []) as any[]).map(g => [g.id, g]));
  const persDe = new Map(((pers.data || []) as any[]).map(p => [p.id, p]));
  const agrDe = new Map(((agrs.data || []) as any[]).map(a => [a.id, a]));

  const nombrePersona = (id?: string | null) => {
    const p = id ? persDe.get(id) : null;
    return p ? (p.alias || p.nombre || "(sin nombre)") : null;
  };

  /* El contexto que la regla necesita para cada permiso. Es una función y no un
     mapa precalculado porque `semaforo` la llama solo por las filas que mira. */
  /* ⚠ ESTA FUNCIÓN NO SALE DE AQUÍ. Se usa para calcular en el servidor, y lo
     que viaja al cliente es el RESULTADO —un mapa de id→nivel—, nunca ella.
     Pasar un closure a un componente `"use client"` revienta en runtime con
     «Functions cannot be passed directly to Client Components», y `tsc` no lo
     ve porque tipar la prop como función es válido: la pantalla compilaba
     limpia y daba 500 con la primera película. */
  const ctxDe = (a: FilaAutorizacion): ContextoRiesgo => ({
    hoy,
    obra: a.objeto_obra_id ? obraDe.get(a.objeto_obra_id) : null,
    grabacion: a.objeto_grabacion_id ? grabDe.get(a.objeto_grabacion_id) : null,
    persona: a.objeto_persona_id ? persDe.get(a.objeto_persona_id) : null,
  });

  const autsDe = new Map<string, FilaAutorizacion[]>();
  for (const a of listaAuts) {
    const k = String(a.proyecto_id || "");
    autsDe.set(k, [...(autsDe.get(k) || []), a]);
  }

  /* Las agrupaciones con sus integrantes, del catálogo global. Se enseñan por
     película solo las que tienen algún permiso en ella: la lista entera de
     bandas de la productora en cada documental sería ruido. */
  const intsDe = new Map<string, { personaId: string; nombre: string; instrumento?: string | null }[]>();
  for (const i of ((ints.data || []) as any[])) {
    const p = persDe.get(i.persona_id);
    intsDe.set(i.agrupacion_id, [...(intsDe.get(i.agrupacion_id) || []), {
      personaId: i.persona_id,
      nombre: p ? (p.alias || p.nombre || "(sin nombre)") : "(persona no encontrada)",
      instrumento: i.instrumento_rol,
    }]);
  }

  const catalogoPersonas = ((pers.data || []) as any[])
    .map(p => ({ id: p.id, nombre: p.alias || p.nombre || "(sin nombre)" }));
  const catalogoAgrupaciones = ((agrs.data || []) as any[])
    .map(a => ({ id: a.id, nombre: a.procedencia ? `${a.nombre} · ${a.procedencia}` : a.nombre }));
  /* La obra se nombra con su ISWC cuando lo tiene: hay QUINCE «Fatal Destino»
     en el catálogo de APDAYC y el título solo no distingue ninguno. */
  const catalogoObras = ((obras.data || []) as any[])
    .map(o => ({ id: o.id, nombre: o.iswc ? `${o.titulo} · ${o.iswc}` : o.titulo }));
  const catalogoGrabaciones = ((grabs.data || []) as any[])
    .map(g => ({ id: g.id, nombre: g.productor_fonografico
      ? `${g.descripcion || g.id.slice(0, 8)} · ${g.productor_fonografico}`
      : (g.descripcion || g.id.slice(0, 8)) }));

  const peliculas = ((proys.data || []) as any[]).slice(0, techo(400))
    .filter(p => todas || peliculaViva(p));

  /* ⚠ CON EL CATÁLOGO CAÍDO, EL VEREDICTO NO SE AFIRMA.
     `eLado` alimenta `ctxDe`: si se cayeron las personas, R5 no dispara ni un
     crítico; si se cayeron las grabaciones, desaparecen los de fonograma. El
     semáforo seguiría calculándose y diría «✓ se puede publicar» sobre un
     cálculo ciego — el mismo error que la cabecera de este archivo jura no
     cometer, un nivel más abajo. Así que se degrada a «no se puede decir». */
  const ciego = !!eLado;

  /* Cada película con su semáforo, y las peores arriba: es a lo que se entra. */
  const filas = peliculas.map(p => {
    const suyas = autsDe.get(p.id) || [];
    return { p, s: semaforo(suyas, ctxDe), suyas };
  }).sort((a, b) =>
    (b.s.criticos - a.s.criticos)
    || (b.s.altos - a.s.altos)
    || (a.p.nombre_corto || a.p.nombre || "").localeCompare(
       b.p.nombre_corto || b.p.nombre || "", "es"));

  const bloqueadas = filas.filter(f => !f.s.publicable && !f.s.sinDatos).length;
  /* Ciego no cuenta como listo: no se sabe. */
  const listas = ciego ? 0 : filas.filter(f => f.s.publicable).length;
  const vacias = filas.filter(f => f.s.sinDatos).length;
  const ocultas = Math.min(((proys.data || []) as any[]).length, techo(400)) - peliculas.length;

  return (
    <div className="shell">
      <Realtime tablas={["autorizacion", "agrupacion_integrante", "documento_firmado"]}
        token={session?.access_token} miId={user.id} />
      <div className="topbar"><Volver /></div>
      <h1 className="title-lg">⚖ Clearance</h1>
      <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "-6px 0 14px", lineHeight: 1.6 }}>
        ¿Puedo publicar cada documental hoy, y qué me falta si no? Lo que manda
        no es cuántos permisos hay firmados: es <b>el peor de los que faltan</b>.
        Un solo bloqueo crítico impide publicar aunque todo lo demás esté hecho.
      </div>

      {fallo && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ No se pudieron leer los permisos: <code>{fallo}</code>
          {/column|does not exist|schema cache|PGRST20/i.test(fallo) && (
            <> <b>Falta correr las tres migraciones <code>db/clearance-*.sql</code> en
              Supabase, en su orden: agrupacion → obra → autorizacion.</b></>
          )}
          <div style={{ marginTop: 4 }}>
            El semáforo <b>no</b> se pinta: un «se puede publicar» calculado sobre una
            lista vacía por error es la mentira más cara que puede decir esta pantalla.
          </div>
        </div>
      )}

      {eLado && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ No se pudo leer el catálogo: <code>{eLado}</code>
          <div style={{ marginTop: 4 }}>
            Los permisos se leen igual, pero el riesgo se calcula a ciegas —sin saber
            si una obra está verificada o si alguien es menor— y las agrupaciones no
            salen. Los colores de abajo dicen de menos, no de más.
          </div>
        </div>
      )}

      {!!cortado.length && (
        <div className="err-inline" style={{ marginBottom: 12 }}>
          ⚠ Se cortó en el tope de la API ({cortado.join(", ")}). El semáforo habla
          solo de lo que se leyó, así que puede faltar más de lo que dice.
        </div>
      )}

      {!fallo && (
        <div className="card gx-diag">
          <div className="gx-nums">
            <span className="gx-n"><b>{filas.length}</b> película{filas.length === 1 ? "" : "s"}</span>
            {!!bloqueadas && (
              <span className="gx-n" style={{ color: "var(--red)" }}
                title="Tienen al menos un permiso de riesgo alto o crítico sin resolver. No se pueden publicar.">
                🚫 <b>{bloqueadas}</b> no se puede{bloqueadas === 1 ? "" : "n"} publicar
              </span>
            )}
            {!!listas && (
              <span className="gx-n" style={{ color: "var(--green)" }}>
                ✓ <b>{listas}</b> sin nada bloqueante
              </span>
            )}
            {!!vacias && (
              <span className="gx-n" style={{ color: "var(--dim)" }}
                title="Ningún permiso registrado. No es «todo en regla»: es que no se sabe.">
                <b>{vacias}</b> sin nada registrado
              </span>
            )}
            <span style={{ flex: 1 }} />
            <Link href={todas ? "/clearance" : "/clearance?todas=1"} className="gx-filtro">
              {todas ? "ocultar las terminadas" : `ver también las terminadas${ocultas > 0 ? ` (${ocultas})` : ""}`}
            </Link>
          </div>
        </div>
      )}

      {!fallo && filas.map(({ p, s, suyas }) => {
        const nombre = p.nombre_corto || p.nombre || "(sin nombre)";
        /* Las bandas que tienen algún permiso en ESTA película. La lista global
           de agrupaciones en cada documental sería ruido. */
        const agrIds = [...new Set(suyas.map(a => a.objeto_agrupacion_id || a.otorgante_agrupacion_id)
          .filter(Boolean) as string[])];
        const sinPromo = sinUsoPromocional(suyas);
        /* El riesgo de cada permiso, calculado AQUÍ con el catálogo entero
           delante. Lo que cruza al cliente son cadenas, no closures. */
        const riesgos: Record<string, NivelRiesgo> =
          Object.fromEntries(suyas.map(a => [a.id, riesgoDe(a, ctxDe(a))]));
        return (
          <div key={p.id} style={{ scrollMarginTop: 12 }}>
            <Plegable
              id={`clearance:peli:${p.id}`}
              abiertoPorDefecto={!s.publicable}
              titulo={
                <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{nombre}</span>
                  <span className="clr-sem" style={{
                    color: s.sinDatos || (ciego && s.publicable) ? "var(--dim)"
                      : s.publicable ? "var(--green)" : "var(--red)",
                  }}>
                    {s.sinDatos ? "sin datos"
                      : ciego && s.publicable ? "no se puede decir"
                      : s.publicable ? "✓ se puede publicar" : "🚫 NO se puede publicar"}
                  </span>
                </span>
              }
              resumen={<span style={{ fontSize: 11.5, color: "var(--dim)" }}>{resumenSemaforo(s)}</span>}>

              {/* ── QUÉ ME FALTA PARA PUBLICAR ──
                  Ordenado por riesgo, que es el orden en que hay que atacarlo.
                  Con el motivo escrito: un rojo sin motivo se deja de mirar. */}
              {s.bloqueos.length > 0 && (
                <div className="clr-bloq">
                  <div className="trt-cab-t">qué lo impide</div>
                  {s.bloqueos.map(b => {
                    const a = suyas.find(x => x.id === b.id);
                    const quien = a && (nombrePersona(a.otorgante_persona_id)
                      || (a.otorgante_agrupacion_id ? agrDe.get(a.otorgante_agrupacion_id)?.nombre : null)
                      || a.otorgante_entidad_nombre
                      || nombrePersona(a.objeto_persona_id));
                    return (
                      <div key={b.id} className="clr-bl">
                        <span className="clr-pt" style={{ color: COLOR_RIESGO[b.nivel] }}>
                          {b.nivel === "critico" ? "🚫" : "🔶"}
                        </span>
                        <span className="clr-que">
                          {a ? META_TIPO_AUT[a.tipo as TipoAutorizacion]?.corto : "permiso"}
                          {quien ? ` · ${quien}` : ""}
                        </span>
                        <span className="clr-mot" style={{ color: COLOR_RIESGO[b.nivel] }}>{b.txt}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {s.sinDatos && (
                <div className="trt-vacio">
                  Ningún permiso registrado en esta película. <b>No es «todo en regla»</b>:
                  es que nadie ha empezado, o que la consulta no trajo nada. Un cero
                  aquí no significa que se pueda publicar.
                </div>
              )}

              {/* ── LA COBERTURA DE CADA AGRUPACIÓN — R1 ── */}
              {agrIds.map(id => {
                const a = agrDe.get(id);
                if (!a) return null;
                const vista: AgrupacionVista = {
                  id: a.id, nombre: a.nombre, tipo: a.tipo, procedencia: a.procedencia,
                  representanteId: a.representante_id,
                  representanteNombre: nombrePersona(a.representante_id),
                  numeroDeclarado: a.numero_integrantes_declarado,
                  integrantes: intsDe.get(a.id) || [],
                };
                return (
                  <CoberturaAgrupacion key={id} proyectoId={p.id} agrupacion={vista}
                    autorizaciones={suyas} personas={catalogoPersonas}
                    /* Cuadrilla y hermandad danzan tanto como el conjunto de
                       danza —la cuadrilla del cargo de Lino es de danzantes—,
                       así que el permiso se tipa igual. Solo `banda_musicos`
                       es interpretación musical con seguridad. */
                    tipoInterpretacion={a.tipo === "banda_musicos"
                      ? "interpretacion_musical" : "interpretacion_danza"} />
                );
              })}

              {/* ── R6 · QUIÉN NO PUEDE IR EN PROMOCIÓN ──
                  El tráiler y el afiche se publican antes que la película, a veces
                  años antes. Un permiso que autoriza salir en la pieza y no en su
                  promoción es frecuente, y si no se puede listar se incumple sin
                  querer. */}
              {sinPromo.length > 0 && (
                <div className="ces-aviso" style={{ marginTop: 10 }}>
                  ⚠ No pueden aparecer en tráiler, afiche ni miniatura:{" "}
                  {sinPromo.map(a => nombrePersona(a.objeto_persona_id) || "alguien").join(", ")}.
                  Firmaron para la película, no para su promoción.
                </div>
              )}

              {/* ── LO REGISTRADO, Y DONDE SE REGISTRA ──
                  Interactivo y no una lista de lectura: una pantalla que dice
                  qué falta pero no deja hacer nada obliga a ir a otra parte a
                  arreglarlo, y entonces no se arregla. Aquí se crea el permiso,
                  se mueve su estado y se apunta el intento de contacto. */}
              <PermisosProyecto
                proyectoId={p.id} autorizaciones={suyas}
                personas={catalogoPersonas}
                agrupaciones={catalogoAgrupaciones}
                obras={catalogoObras} grabaciones={catalogoGrabaciones}
                riesgos={riesgos} hoy={hoy} />

              <div style={{ marginTop: 10 }}>
                <Link href={`/entidad/proyecto/${p.id}`} className="gx-filtro">
                  ir a la ficha de {nombre} →
                </Link>
              </div>
            </Plegable>
          </div>
        );
      })}

      {!fallo && !filas.length && (
        <div className="card" style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.55 }}>
          No hay ninguna película en marcha.
          {!todas && <> <Link href="/clearance?todas=1" className="gx-filtro">verlas igualmente</Link>.</>}
        </div>
      )}

      {!fallo && !!filas.length && (
        <div className="card" style={{ color: "var(--dim)", fontSize: 12, lineHeight: 1.6, marginTop: 14 }}>
          <b>La firma de quien representa no cubre a los representados.</b> Jennifer
          puede comprometer a Las Patronas como banda, pero el derecho de intérprete
          de cada música es de cada música — el D. Leg. 822 lo dice de los derechos
          conexos, y son personales. Por eso la cobertura se lee «5 de 11» y no
          «firmado»: hasta ayer, una firma se contaba como once.
        </div>
      )}
    </div>
  );
}
