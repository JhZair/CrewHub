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
  const { data } = await supabase.from("postulaciones")
    .select("tope_dj_pct,tope_dj_monto").eq("id", id).maybeSingle();
  return data as any;
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
