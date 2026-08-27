/* ══════════════════════════════════════════════════════════════════════════
   LOS DATOS DE UN FONDO, PEDIDOS UNA SOLA VEZ

   La ficha de un fondo se está partiendo en rutas hermanas —una por pestaña,
   con una cabecera común en el layout—, y eso trae un problema nuevo: el
   layout y la página se renderizan por separado pero necesitan varias de las
   mismas filas. El fondo, para el título y para las cifras; los perfiles, para
   la alarma y para las listas.

   ── POR QUÉ `cache()` Y NO PROPS ──
   Un layout de App Router NO puede pasarle props a su página: recibe
   `children` ya construido. Tampoco sirve un contexto de React —la página es
   un componente de servidor y no puede leer contextos de cliente—. Lo único
   que funciona es que los dos LLAMEN A LA MISMA FUNCIÓN cacheada: Next
   renderiza layout y página en el mismo pase, así que dos llamadas con el
   mismo argumento hacen UN SOLO viaje.

   Es el mismo mecanismo que ya usan `usuarioActual` (lib/supabase/server.ts) y
   `urlPlataforma` (lib/plataformas.ts), y por la misma razón.

   ⚠ DOS AVISOS QUE HAY QUE LEER ANTES DE TOCAR ESTO:

   1. `cache()` NO deduplica dentro de una Server Action. Está medido y
      documentado en lib/supabase/server.ts. Si alguien mueve estos loaders a
      app/actions.ts pensando en reusarlos, dejarán de deduplicar SIN DAR
      ERROR — y el fallo se manifiesta como lentitud, que es lo último que se
      investiga.
   2. En navegación SUAVE entre pestañas hermanas, Next no vuelve a renderizar
      el layout: solo pide la página. Ahí no hay nada que deduplicar y cada una
      hace su viaje. Correcto en los dos casos, pero explica por qué el ahorro
      del `cache()` solo se nota en la carga dura y en `router.refresh()`.

   ── FLACO ARRIBA, GORDO ABAJO ──
   Varias tablas se piden dos veces con selects distintos: la cabecera necesita
   `rhe(persona_id,monto,url)` para decir cuánto se giró, y la pestaña
   Financiera necesita `rhe` con tres relaciones embebidas para pintar la
   lista. Son dos preguntas distintas a la misma tabla, y pedir el gordo para
   la cabecera significaría pagarlo en las seis pestañas.
   ⚠ El precio de esta decisión: dos consultas distintas contestan sobre lo
   mismo. Los CÁLCULOS salen de las mismas funciones (`resumenEquipo`,
   `sinPruebas`, `faltanEstados`) para que no puedan discrepar — lo único que
   cambia son las columnas que se les dan de comer.
   ══════════════════════════════════════════════════════════════════════════ */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/* ── EL FONDO ──
 * La consulta que decide si la ficha existe. Los topes de DJ NO se piden aquí
 * a propósito: nombrar una columna que puede no estar todavía —una migración
 * sin correr— convertiría «falta un SQL» en «este fondo no existe». Van en su
 * propia consulta, que puede fallar sola.
 * Cacheada porque la llaman `generateMetadata`, el layout y alguna página: sin
 * esto eran tres viajes por la misma fila. */
export const traerFondo = cache(async (id: string) => {
  const supabase = createClient();
  const { data } = await supabase.from("postulaciones")
    .select("*, proy:proyectos(id,nombre,tipo), emp:empresas(id,nombre), " +
      "conv:convocatorias(id,nombre,anio,categoria,monto_adjudicado)")
    .eq("id", id).maybeSingle();
  return data as any;
});

/* Los topes de declaración jurada, aparte y tolerantes: sin la migración
   corrida, esto falla solo y el bloque de DJ lo dice en vez de tumbar la
   ficha. */
export const traerTopes = cache(async (id: string) => {
  const supabase = createClient();
  const r = await supabase.from("postulaciones")
    /* El de la convocatoria embebido: el tope puede venir del acta de este
       fondo o de las bases del concurso, y `pctDe` decide cuál manda. */
    .select("tope_dj_pct,conv:convocatorias(tope_dj_pct)").eq("id", id).maybeSingle();
  return r;
});

/* ── QUIÉN MIRA ──
 * Dos preguntas sobre la misma persona: qué permisos tiene y a qué FICHA de
 * persona corresponde su cuenta. La segunda hace falta para saber cuáles de
 * los recibos de la pantalla son suyos — el puente `personas.usuario_id` es el
 * mismo que usa /jornadas. */
export const traerPerfilActual = cache(async (userId: string) => {
  const supabase = createClient();
  const { data } = await supabase.from("perfiles")
    .select("es_admin,es_finanzas").eq("id", userId).maybeSingle();
  return data as any;
});

export const traerMiPersona = cache(async (userId: string) => {
  const supabase = createClient();
  const { data } = await supabase.from("personas")
    .select("id").eq("usuario_id", userId).maybeSingle();
  return data as any;
});

/** El equipo con cuenta activa: para la alarma, para asignar y para nombrar. */
export const traerPerfiles = cache(async () => {
  const supabase = createClient();
  const { data } = await supabase.from("perfiles")
    .select("id,nombre,avatar_url,color").eq("activo", true).order("nombre");
  return (data || []) as any[];
});

/* ══════════════════════════════════════════════════════════════════════════
   LOS FLACOS DE LA CABECERA

   Solo las columnas que las siete celdas de arriba y las burbujas de las
   pestañas necesitan. Se piden en el layout, o sea en las seis pestañas, así
   que cada columna de más se paga seis veces.
   ══════════════════════════════════════════════════════════════════════════ */

/* ⚠ EQUIVALENCIA FRÁGIL, LEER ANTES DE CAMBIAR NADA
   La celda «Girado en RHE» sale de `resumenEquipo`, que recibe el cruce de
   `postulacion_equipo`, `rhe`, `equipo_fondo` y `personas`. Pero `montoGirado`
   y `girados` NO dependen de las dos primeras: un integrante declarado o
   previsto SIN recibos entra con `rhes: []` y `total: 0`, así que no suma ni
   cuenta (ver lib/equipoFondo.ts). Por eso aquí basta con los recibos y los
   ids de las personas.
   El día que `resumenEquipo` cambie, esta equivalencia se rompe EN SILENCIO:
   la cabecera diría un número y la pestaña Equipo otro. Si se toca
   lib/equipoFondo.ts, hay que volver aquí. */
export const traerRheFlaco = cache(async (id: string) => {
  const supabase = createClient();
  const { data } = await supabase.from("rhe")
    .select("persona_id,monto,url").eq("postulacion_id", id);
  return (data || []) as any[];
});

/** Solo los ids: para saber qué recibos tienen una persona reconocible. */
export const traerPersonasIds = cache(async () => {
  const supabase = createClient();
  const { data } = await supabase.from("personas").select("id");
  return (data || []) as { id: string }[];
});

export const traerGastoDjFlaco = cache(async (id: string) => {
  const supabase = createClient();
  const { data } = await supabase.from("gasto_dj")
    .select("importe,dj_numero,dj_url").eq("postulacion_id", id);
  return (data || []) as any[];
});

export const traerComprobanteFlaco = cache(async (id: string) => {
  const supabase = createClient();
  const { data } = await supabase.from("comprobante")
    .select("importe,url").eq("postulacion_id", id);
  return (data || []) as any[];
});

export const traerEstadoCuentaFlaco = cache(async (id: string) => {
  const supabase = createClient();
  const { data } = await supabase.from("estado_cuenta")
    .select("periodo,url,imagenes").eq("postulacion_id", id).order("periodo");
  return (data || []) as any[];
});

/* La versión VIGENTE del presupuesto: contra ella se rinde y se gira, y es la
   que se envía a DAFO. Su `datos` es lo más pesado de los «flacos» —el
   presupuesto entero en JSON— pero la cabecera lo necesita para contar los
   roles sin dueño, que es el aviso de la pestaña «Por rol». */
export const traerVersiones = cache(async (id: string) => {
  const supabase = createClient();
  const { data } = await supabase.from("version_fondo")
    .select("id,tipo,etiqueta,motivo,vigente,creado_en,datos,creado:perfiles!creado_por(nombre)")
    .eq("postulacion_id", id).order("creado_en", { ascending: false });
  return (data || []) as any[];
});

/** Cuántas cláusulas tiene el acta. `head` + `count`: viaja un número, no las
 *  filas — la pestaña Entregables las pide enteras cuando toca. */
export const contarCompromisos = cache(async (id: string) => {
  const supabase = createClient();
  const { count, error } = await supabase.from("compromiso_acta")
    .select("id", { count: "exact", head: true }).eq("postulacion_id", id);
  /* Sin la migración corrida esto falla: se devuelve null y la pestaña sale
     sin número, en vez de con un cero que se leería como «no hay ninguna». */
  return error ? null : (count ?? null);
});

/* Los dos lados del equipo que NO salen de los recibos: quién se declaró al
   concurso y a quién se piensa convocar. Flacos —solo hace falta contar
   cabezas para la burbuja de la pestaña. */
export const traerEquipoFlaco = cache(async (id: string) => {
  const supabase = createClient();
  const [{ data: post }, { data: prev }] = await Promise.all([
    supabase.from("postulacion_equipo").select("cargo,persona:personas(id)")
      .eq("postulacion_id", id),
    supabase.from("equipo_fondo").select("persona_id,cargo").eq("postulacion_id", id),
  ]);
  return { post: (post || []) as any[], previstos: (prev || []) as any[] };
});

/* La vida del fondo: los hitos que alguien apuntó y lo que DAFO nos ha dicho.
   Se piden GORDOS aunque los use la cabecera para el contador, porque la
   pestaña Vida los necesita enteros y así comparten viaje cuando estás en
   ella. En las otras cinco, el layout paga dos consultas medianas — el precio
   de que el contador y el aviso de carta vencida estén siempre. */
export const traerHitos = cache(async (id: string) => {
  const supabase = createClient();
  const r = await supabase.from("hito_fondo")
    .select("id,fecha,tipo,titulo,detalle,url,publicacion_id," +
      "creado:perfiles!creado_por(nombre,avatar_url,color)")
    .eq("postulacion_id", id).order("fecha", { ascending: false }).limit(300);
  return r;
});

export const traerCartas = cache(async (id: string) => {
  const supabase = createClient();
  const r = await supabase.from("dafo_comunicaciones")
    .select("id,asunto,extracto,recibido_en,origen,doc_numero,doc_url," +
      "responder_hasta,respondido_en,cierre_motivo,pide_accion,caso_id")
    .eq("postulacion_id", id).order("recibido_en", { ascending: false }).limit(200);
  return r;
});

/* ══════════════════════════════════════════════════════════════════════════
   LA CABECERA, CALCULADA EN UN SOLO SITIO

   Las siete celdas de arriba, las burbujas de las pestañas y sus avisos. Vive
   aquí y no en el layout por una razón concreta: son los números que el resto
   de la ficha vuelve a calcular más abajo con datos más gordos, y si cada
   sitio los deduce por su cuenta acaban discrepando. Aquí se llaman las MISMAS
   funciones que pintan cada pestaña (`resumenEquipo`, `faltanEstados`,
   `sinPruebas`, `agruparPorRol`); lo único distinto son las columnas que se
   les dan de comer.
   ══════════════════════════════════════════════════════════════════════════ */

import { integrantesDeFondo, resumenEquipo } from "@/lib/equipoFondo";
import { faltanEstados, seVigila, cierreDe } from "@/lib/estadosCuenta";
import { sinPruebas, textoSinPruebas } from "@/lib/pruebasFondo";
import { agruparPorRol, filasPorPersona, itemsDeReferencia } from "@/lib/rolesPresupuesto";
import { saldoDJ } from "@/lib/dj";
import { plazoRendicion, rendicionVencida } from "@/lib/fondos";
import { vidaDelFondo } from "@/lib/vidaFondo";
import { hoyLima } from "@/lib/fechas";

export type Aviso = { n: number; txt: string; tono?: "rojo" | "ambar" };

/* Todo lo que la cabecera y la barra de pestañas necesitan, en una sola tanda
   paralela. Se llama desde el layout —o sea en las seis pestañas—, así que
   cada consulta que entre aquí se paga seis veces: si algo solo lo necesita
   una pestaña, va en su página y no aquí. */
export async function datosCabecera(id: string) {
  const [rhe, personas, dj, cmp, ec, vers, nCompromisos, eq, hitosQ, cartasQ, topes] =
    await Promise.all([
      traerRheFlaco(id), traerPersonasIds(), traerGastoDjFlaco(id),
      traerComprobanteFlaco(id), traerEstadoCuentaFlaco(id), traerVersiones(id),
      contarCompromisos(id), traerEquipoFlaco(id),
      traerHitos(id), traerCartas(id), traerTopes(id),
    ]);
  return { rhe, personas, dj, cmp, ec, vers, nCompromisos, eq, hitosQ, cartasQ, topes };
}

/* ── LAS CIFRAS DE LA CABECERA, SIN TOCAR LA BASE ──
   Función pura: recibe el fondo y lo que trajo `datosCabecera`, y devuelve lo
   que se pinta. Separada de las consultas para poder probarla con datos a
   mano — es donde viven los números que el equipo mira primero. */
export function cifrasCabecera(ent: any, d: Awaited<ReturnType<typeof datosCabecera>>) {
  const hoy = hoyLima();

  /* ── LO GIRADO ──
     Ver la nota de `traerRheFlaco`: `montoGirado` y `girados` salen del cruce
     de recibos con personas, sin necesitar el equipo declarado ni el previsto.
     Se usa `resumenEquipo` y no una suma escrita aquí para que la cabecera y la
     pestaña Equipo no puedan contestar distinto. */
  const integrantes = integrantesDeFondo([], d.rhe as any[], [], d.personas as any);
  const resEquipo = resumenEquipo(integrantes);
  const totRhe = (d.rhe as any[]).reduce((s, r) => s + Number(r.monto || 0), 0);
  /* Los recibos que no dicen de quién son no entran en el cruce: si los hay, la
     cifra de arriba no es toda la plata girada, y eso se dice en vez de
     callarlo. */
  const rheSinPersona = totRhe - resEquipo.montoGirado;

  /* Cuánta gente hay en el fondo, para la burbuja de la pestaña. Aquí SÍ hacen
     falta el declarado y el previsto: una persona sin recibos no suma plata
     pero sí es del equipo. */
  const nEquipo = integrantesDeFondo(
    d.eq.post as any[], d.rhe as any[], d.eq.previstos as any[], d.personas as any).length;

  const usadoDj = (d.dj as any[]).reduce((s, g) => s + Number(g.importe || 0), 0);
  const topes: any = (d.topes as any)?.data || null;
  const djError = ((d.topes as any)?.error?.message || null) as string | null;
  const convTope = Array.isArray(topes?.conv) ? topes.conv[0] : topes?.conv;
  const saldoDj = saldoDJ(ent.monto_adjudicado, usadoDj,
    { tope_dj_pct: topes?.tope_dj_pct }, { tope_dj_pct: convTope?.tope_dj_pct });

  const totCmp = (d.cmp as any[]).reduce((s, c) => s + Number(c.importe || 0), 0);

  /* ── LOS DOS AVISOS DE FINANCIERA ──
     Rojo: falta el papel del banco, hay que pedírselo. Ámbar: la fila está
     registrada y falta subir su archivo. Se resuelven en sitios distintos y por
     gente distinta, así que van aparte y no sumados — un número que las mezcla
     no dice qué hacer.
     `seVigila` manda en los dos: a una rendición ya entregada no se le piden
     más papeles, y sin él la ficha enseñaba avisos que el menú y la tarjeta del
     fondo no enseñaban. */
  const faltanEc = faltanEstados(
    (d.ec as any[]).map(e => e.periodo), ent.fecha_desembolso, hoy, cierreDe(ent));
  const nFaltaEc = seVigila(ent) ? faltanEc.faltan.length : 0;
  const avisoEc: Aviso | null = nFaltaEc > 0
    ? { n: nFaltaEc, txt: `${nFaltaEc} estado(s) de cuenta del banco sin cargar` } : null;

  const docsTodos = sinPruebas({
    estados: d.ec as any[], rhe: d.rhe as any[],
    facturas: d.cmp as any[], dj: d.dj as any[],
  });
  const docsEc = seVigila(ent) ? docsTodos : { estados: 0, rhe: 0, facturas: 0, dj: 0, total: 0 };
  const avisoDocs: Aviso | null = docsEc.total > 0
    ? { n: docsEc.total, txt: textoSinPruebas(docsEc), tono: "ambar" } : null;

  /* ── POR ROL ──
     Contra la versión VIGENTE, que es la que se envía a DAFO; el presupuesto
     vivo es el borrador de la siguiente modificación. Las etiquetas (rol y
     quién cobra) sí salen del vivo, que es donde se escriben. */
  const vigPresu = (d.vers as any[]).find(v => v.tipo === "presupuesto" && v.vigente) || null;
  const vigItems = ((vigPresu?.datos as any)?.items || []) as any[];
  const preItems = ((ent.presupuesto as any)?.items || []) as any[];
  const rolesPre = agruparPorRol(itemsDeReferencia(vigItems, preItems) as any);
  const sinDueno = filasPorPersona(rolesPre, () => 0).filter(f => !f.personaId).length;
  const avisoRoles: Aviso[] | null = sinDueno
    ? [{ n: sinDueno, tono: "ambar" as const,
         txt: `${sinDueno} rol(es) sin persona asignada: no se puede saber cuánto les falta cobrar` }]
    : null;

  /* ── LA VIDA ──
     El contador sale de `vidaDelFondo`, no de sumar las dos consultas: los
     correos que no piden nada no entran en la línea, así que sumarlos daría un
     número que no cuadra con lo que se ve al abrir. */
  const hitos = ((d.hitosQ as any).data || []) as any[];
  const cartas = ((d.cartasQ as any).data || []) as any[];
  const lineaVida = vidaDelFondo(ent, hitos as any, cartas as any, hoy);
  const porResponder = lineaVida.filter((h: any) => h.porResponder).length;
  const avisoVida: Aviso[] | null = porResponder
    ? [{ n: porResponder, txt: `${porResponder} carta(s) de DAFO con plazo sin contestar` }]
    : null;

  const plazo = plazoRendicion(ent);
  const estadoEjec = ent.fecha_rendicion_real
    ? { ico: "✅", txt: "Rendido", col: "var(--green)" }
    : rendicionVencida(ent)
      ? { ico: "⏰", txt: "Debe rendición", col: "var(--red)", venceEl: plazo }
      : { ico: "🎬", txt: "En ejecución", col: "var(--teal)", rindeEl: plazo };

  return {
    plazo, estadoEjec,
    girado: resEquipo.montoGirado, girados: resEquipo.girados, rheSinPersona,
    usadoDj, saldoDj, nDj: (d.dj as any[]).length, djError,
    totCmp, nCmp: (d.cmp as any[]).length,
    nEquipo, nVida: lineaVida.length, nCompromisos: d.nCompromisos, nRoles: rolesPre.length,
    avisosFin: [avisoEc, avisoDocs].filter(Boolean) as Aviso[],
    avisoVida, avisoRoles,
  };
}
