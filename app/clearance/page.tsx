import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/components/Enlace";
import Volver from "@/components/Volver";
import Realtime from "@/components/Realtime";
import ListaClearance, { type FilaVista } from "@/components/ListaClearance";
/* ⚠ `normalizar` de `lib/texto` y NO de `ListaClearance`: ese módulo es
   `"use client"`, y una función importada de ahí y llamada AQUÍ —en el
   servidor— no da error de tipos, da un error en runtime que tumba la
   pantalla entera. Está contado en lib/texto.ts. */
import { normalizar } from "@/lib/texto";
import { createClient } from "@/lib/supabase/server";
import { techo } from "@/lib/api";
import { hoyLima } from "@/lib/fechas";
import {
  resumenSemaforo, COLOR_RIESGO,
  type FilaAutorizacion, type FilaIncidental, type FilaUsoMusical,
} from "@/lib/clearance";
import {
  catalogosDeRiesgo, contextoDe, porProyecto, rotuloBloqueo,
  semaforosDe, nombrePeli,
  CAMPOS_AUT_SEMAFORO, CAMPOS_INCIDENTAL, CAMPOS_USO_MUSICAL,
  type FilaSemaforo,
} from "@/lib/clearanceDatos";
import { TIPOS_CON_GUION, peliculaViva } from "@/lib/tratamiento";

export const metadata: Metadata = { title: "⚖ Clearance" };

/* ══════════════════════════════════════════════════════════════════════════
   ⚖ CLEARANCE — EL ÍNDICE

   ¿Puedo publicar cada documental hoy, y qué me falta si no?

   ── POR QUÉ ESTO ES UN ÍNDICE Y NO LA PANTALLA ENTERA ──
   Antes esta página pintaba TODAS las películas con todo su detalle dentro:
   doce consultas trayendo el catálogo completo, y un panel de registro por
   cada documental aunque no tuviera un solo permiso. Con quince películas ya
   eran quince bloques de «SIN DATOS» que había que atravesar para llegar al
   único que importaba.

   Y eso no es solo lento: es la manera de que una pantalla deje de leerse. Lo
   mismo que un aviso que no se puede apagar, una lista donde el 90% es ruido
   se salta entera, con lo importante dentro.

   Así que aquí solo va la pregunta —¿cuál no puedo publicar?— y el detalle
   vive en `/clearance/[id]`. Es el mismo reparto que se hizo con /fondo.

   ── EL SEMÁFORO NO ES UN NÚMERO ──
   «12 de 18 permisos» suena a progreso y no dice nada: si los seis que faltan
   son de la banda que suena en toda la película, no se puede publicar. Lo que
   manda es el peor bloqueo, no el porcentaje.

   ── UN CERO NO ES UN CERO ──
   Si la consulta falla y llega una lista vacía, «0 pendientes» se lee como
   «puedo publicar», que es lo contrario de la verdad. Por eso `semaforo()`
   devuelve `sinDatos` aparte de `publicable`, y el error del servidor se pinta
   EN VEZ del semáforo, no debajo.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function Clearance({
  searchParams,
}: { searchParams?: { todas?: string; q?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();

  const todas = searchParams?.todas === "1";
  const hoy = hoyLima();

  /* ⚠ CUATRO CONSULTAS, NO DOCE. Las agrupaciones, locaciones, actividades y
     materiales solo llenan los desplegables de REGISTRO, y aquí no se registra
     nada. El catálogo de riesgo sí hace falta: sin él el veredicto se calcula a
     ciegas, y un verde ciego es peor que ningún verde. */
  const [proys, auts, incs, usos, agrs, cat] = await Promise.all([
    supabase.from("proyectos").select("id,nombre,nombre_corto,tipo,etapa")
      .in("tipo", TIPOS_CON_GUION).order("nombre").limit(techo(400) + 1),
    /* ⚠ `.order("proyecto_id")` NO es decoración. Sin orden, PostgREST devuelve
       las filas como le viene, así que CUÁLES 900 llegan puede cambiar entre
       dos recargas: la misma película pasaría de verde a rojo sin que nada
       cambie en la base. Ordenado, el corte es al menos siempre el mismo. */
    supabase.from("autorizacion").select(CAMPOS_AUT_SEMAFORO)
      .order("proyecto_id").limit(techo(900) + 1),
    supabase.from("aparicion_incidental").select(CAMPOS_INCIDENTAL)
      .order("proyecto_id").limit(techo(900) + 1),
    supabase.from("uso_musical_corte").select(CAMPOS_USO_MUSICAL)
      .order("proyecto_id").limit(techo(900) + 1),
    /* Solo el nombre: es para rotular quién firma un bloqueo. La ficha carga la
       agrupación entera porque allí sí se registra sobre ella. */
    supabase.from("agrupacion").select("id,nombre").order("nombre").limit(techo(300) + 1),
    catalogosDeRiesgo(),
  ]);

  /* ⚠ Los errores NO se tragan con `|| []`. Una lista vacía por fallo se lee
     como «no falta ningún permiso», que es lo contrario de la verdad sobre
     unos papeles cuya ausencia impide estrenar. */
  const eProy = (proys as any)?.error?.message || null;
  const eAut = (auts as any)?.error?.message || null;
  /* ⚠ El montaje SÍ tumba el semáforo, como los permisos: R8 lo cuenta, y sin
     leerlo un «se puede publicar» estaría calculado sobre media película. */
  const eMontaje = (incs as any)?.error?.message || (usos as any)?.error?.message || null;
  const fallo = eProy || eAut || eMontaje;

  const cortado = [
    [(proys.data || []).length, techo(400), "películas"],
    [(auts.data || []).length, techo(900), "permisos"],
    [(incs.data || []).length, techo(900), "apariciones incidentales"],
    [(usos.data || []).length, techo(900), "músicas del corte"],
    [(agrs.data || []).length, techo(300), "agrupaciones"],
  ].filter(([n, t]) => (n as number) > (t as number)).map(([, , q]) => q as string)
    .concat(cat.cortado);

  /* ⚠ CON EL CATÁLOGO CAÍDO —O CORTADO— EL VEREDICTO NO SE AFIRMA.
     Si se cayeron las personas, R5 no dispara ni un crítico; si se cayeron las
     grabaciones, desaparecen los de fonograma. El semáforo seguiría
     calculándose y diría «✓ se puede publicar» sobre un cálculo ciego.

     ⚠ Y EL CORTE CUENTA COMO CEGUERA, que es lo que faltaba. El tope de esta
     pantalla es GLOBAL —900 permisos entre TODAS las películas— y el de la
     ficha es por película. Pasado ese número, el índice calcula sobre un
     subconjunto y la ficha sobre el total: la lista diría «✓ se puede publicar»
     y la ficha «🚫 NO», sobre la misma película el mismo día. Un aviso gris
     arriba no arregla quince verdes seguros más abajo. */
  const ciego = !!cat.error || cortado.length > 0;

  const ctxDe = contextoDe(cat, hoy);
  const agrNombre = new Map(((agrs.data || []) as any[])
    .slice(0, techo(300)).map(a => [a.id, a.nombre as string]));
  const nombreAgrupacion = (id?: string | null) =>
    (id ? agrNombre.get(id) : null) || null;
  const autsDe = porProyecto(
    ((auts.data || []) as any[]).slice(0, techo(900)) as FilaAutorizacion[]);
  const incsDe = porProyecto(
    ((incs.data || []) as any[]).slice(0, techo(900)) as FilaIncidental[]);
  const usosDe = porProyecto(
    ((usos.data || []) as any[]).slice(0, techo(900)) as FilaUsoMusical[]);

  const peliculas = ((proys.data || []) as any[]).slice(0, techo(400))
    .filter(p => todas || peliculaViva(p));
  const filas = semaforosDe(peliculas, autsDe, incsDe, usosDe, ctxDe);

  /* ── LAS QUE NADIE HA EMPEZADO, ABAJO ──
     ⚠ Abajo y NO fuera. Una película sin un solo permiso no es un problema
     resuelto —es el que más lejos está de resolverse— pero tampoco es lo que
     se mira cada mañana, y en medio de la lista empuja hacia el olvido a las
     que sí tienen algo que atender. Se pliegan, con su número a la vista: lo
     que se esconde del todo deja de existir. */
  const conDatos = filas.filter(f => !f.s.sinDatos);
  const vacias = filas.filter(f => f.s.sinDatos);

  const bloqueadas = conDatos.filter(f => !f.s.publicable).length;
  /* Ciego no cuenta como listo: no se sabe. */
  const listas = ciego ? 0 : conDatos.filter(f => f.s.publicable).length;
  const ocultas = Math.min(((proys.data || []) as any[]).length, techo(400)) - peliculas.length;

  /* ── UNA LÍNEA POR PELÍCULA, COMO DATO ──
     ⚠ Se construyen aquí y las pinta `ListaClearance`, que es cliente porque
     tiene la caja de búsqueda. Lo que cruza son CADENAS ya resueltas: el
     color, el rótulo, el nombre de quien firma. Ni el catálogo ni `ctxDe`
     viajan — un closure a un componente cliente revienta en runtime y tsc no
     lo ve.
     Los tres peores bloqueos y cuántos quedan detrás: sin motivo, un rojo se
     deja de mirar; con los quince, la lista vuelve a ser la pantalla vieja. */
  const vista = (f: FilaSemaforo): FilaVista => ({
    id: f.p.id,
    nombre: nombrePeli(f.p),
    nombreLargo: String(f.p.nombre || ""),
    /* ⚠ El corto Y el largo. Se busca «mujeres» y la fila se llama
       «MUJERESANDE»; se busca «Mujeres del Ande» y también tiene que salir. */
    busca: normalizar([f.p.nombre_corto, f.p.nombre].filter(Boolean).join(" ")),
    sinDatos: f.s.sinDatos,
    color: f.s.sinDatos || (ciego && f.s.publicable) ? "var(--dim)"
      : f.s.publicable ? "var(--green)" : "var(--red)",
    veredicto: f.s.sinDatos ? "sin datos"
      : ciego && f.s.publicable ? "no se puede decir"
      : f.s.publicable ? "✓ se puede publicar" : "🚫 NO se puede publicar",
    resumen: resumenSemaforo(f.s),
    bloqueos: f.s.bloqueos.slice(0, 3).map(b => {
      const { que, quien } = rotuloBloqueo(b, f.suyas, cat, nombreAgrupacion);
      return {
        id: b.id,
        ico: b.nivel === "critico" ? "🚫" : "🔶",
        color: COLOR_RIESGO[b.nivel],
        txt: `${que}${quien ? ` · ${quien}` : ""} — ${b.txt}`,
      };
    }),
    masBloqueos: Math.max(0, f.s.bloqueos.length - 3),
  });

  return (
    <div className="shell">
      <Realtime tablas={["autorizacion", "aparicion_incidental", "uso_musical_corte",
          "documento_firmado"]}
        token={session?.access_token} miId={user.id} />
      <div className="topbar"><Volver /></div>
      <h1 className="title-lg">⚖ Clearance</h1>
      <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "-6px 0 14px", lineHeight: 1.6 }}>
        ¿Puedo publicar cada documental hoy, y qué me falta si no? Lo que manda
        no es cuántos permisos hay firmados: es <b>el peor de los que faltan</b>.
        Un solo bloqueo crítico impide publicar aunque todo lo demás esté hecho.
        Entra en una película para registrar y para verlo todo.
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
          ⚠ No se pudo leer el catálogo: <code>{cat.error}</code>
          <div style={{ marginTop: 4 }}>
            Los permisos se leen igual, pero el riesgo se calcula <b>a ciegas</b>
            —sin saber si una obra está verificada o si alguien es menor— así que
            el veredicto se degrada a «no se puede decir». Los colores de abajo
            dicen de menos, no de más.
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
            {!!vacias.length && (
              <span className="gx-n" style={{ color: "var(--dim)" }}
                title="Ningún permiso registrado. No es «todo en regla»: es que no se sabe.">
                <b>{vacias.length}</b> sin empezar
              </span>
            )}
            <span style={{ flex: 1 }} />
            <Link href={todas ? "/clearance" : "/clearance?todas=1"} className="gx-filtro">
              {todas ? "ocultar las terminadas" : `ver también las terminadas${ocultas > 0 ? ` (${ocultas})` : ""}`}
            </Link>
          </div>
        </div>
      )}

      {!fallo && (
        <ListaClearance filas={conDatos.map(vista)} vacias={vacias.map(vista)}
          inicial={searchParams?.q} ocultas={todas ? 0 : ocultas} />
      )}

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
