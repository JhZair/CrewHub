import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BOT } from "@/lib/personas";
import { enJuego, ejecutando } from "@/lib/fondos";
import { vincularPorAsuntoOCuerpo, pideAccion, type PostMin } from "@/lib/casilla";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── LA PUERTA DE ENTRADA DE LA CASILLA DAFO ──
   Quien llama es el Apps Script del buzón maestro (scripts/casilla-dafo.gs),
   cada diez minutos, en los servidores de Google: por eso esto funciona con la
   computadora apagada y sin gastar nada.

   Entra con service_role (salta RLS) porque no hay sesión de usuario, igual que
   el cron de SUNAT. Autorización por llave: cabecera Bearer (así no queda en
   los logs de Vercel) o ?llave= para probar con curl.

   Lo que hace, en orden:
     1. descarta lo que ya está (por gmail_msg_id)
     2. vincula cada correo a su postulación — primero por el código del
        asunto, y si no, por la cuenta que lo recibió
     3. guarda
     4. avisa de lo RECIENTE que aún no tiene aviso

   El paso 4 no se deduce del paso 3: se le pregunta a la base. Ver más abajo. */

type Entrada = {
  id?: string; threadId?: string; fecha?: string; buzon?: string;
  de?: string; para?: string[]; asunto?: string; extracto?: string;
};

const TOPE = 100;          // mensajes por petición
const RECIENTE_H = 72;     // más viejo que esto se guarda, no suena
const AVISOS_MAX = 6;      // por encima, un solo aviso resumen

export async function POST(req: Request) {
  const llave = process.env.INGESTA_DAFO_LLAVE;
  const url = new URL(req.url);
  const dada = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
    || url.searchParams.get("llave") || "";
  /* Sin llave configurada NO se abre la puerta. Un `if (llave && ...)` como el
     del cron de SUNAT dejaría el endpoint público mientras falte la variable,
     y aquí se ESCRIBE en la base: el fallo silencioso sería que cualquiera
     pueda meter correos falsos en la casilla. */
  if (!llave || dada !== llave) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno." }, { status: 500 });
  }

  let cuerpo: any = null;
  try { cuerpo = await req.json(); } catch { cuerpo = null; }
  const mensajes: Entrada[] = Array.isArray(cuerpo?.mensajes) ? cuerpo.mensajes : [];

  /* Se RECHAZA la tanda entera si viene pasada de tamaño, en vez de cortarla.
     Cortar sería el peor fallo posible de este sistema: el Apps Script marca
     los hilos como enviados solo si esto responde 200, así que un recorte
     silencioso daría por entregados correos que nunca entraron — y nadie
     volvería a mirarlos. Mejor que el script se queje y mande menos. */
  if (mensajes.length > TOPE) {
    return NextResponse.json({
      error: `Demasiados mensajes en una tanda (${mensajes.length}). Manda de a ${TOPE} o menos.`,
    }, { status: 413 });
  }

  const ids = [...new Set(mensajes.map(m => String(m.id || "")).filter(Boolean))];
  let nuevos = 0;

  if (ids.length) {
    const { data: yaData, error: eYa } = await db.from("dafo_comunicaciones")
      .select("gmail_msg_id").in("gmail_msg_id", ids);
    /* Distinguir «no hay nada» de «la tabla no existe»: sin esto, olvidar
       correr db/casilla-dafo.sql se leería como «el Apps Script no manda
       nada» y se buscaría el problema en Google. */
    if (eYa) {
      return NextResponse.json({
        error: /dafo_comunicaciones/.test(eYa.message)
          ? "Falta correr db/casilla-dafo.sql en Supabase."
          : eYa.message,
      }, { status: 500 });
    }
    const ya = new Set((yaData || []).map((r: any) => r.gmail_msg_id));
    const frescos = mensajes.filter(m => m.id && !ya.has(String(m.id)));

    if (frescos.length) {
      /* Los catálogos con los que se vincula. Se piden UNA vez por corrida, no
         por correo: veinte mensajes de la misma tanda preguntan lo mismo.
         `fecha_rendicion_real` va porque sin ella una ganadora que ya rindió se
         lee igual que una que debe (lib/fondos.ts → SEL_FONDO). */
      const [{ data: postsRaw }, { data: creds }] = await Promise.all([
        db.from("postulaciones").select("id,codigo,codigo_plataforma,estado,empresa_id,fecha_rendicion_real"),
        db.from("credenciales").select("identificador,empresa_id")
          .not("empresa_id", "is", null).not("identificador", "is", null),
      ]);
      const posts = (postsRaw || []) as PostMin[];

      /* De qué empresa es cada correo. No se guarda en ningún sitio nuevo: ya
         vive en las credenciales, donde cada cuenta de Gmail está colgada de su
         empresa. Un mapa más sería el mismo dato en dos lados. */
      const empresaDeCorreo = new Map<string, string>();
      (creds || []).forEach((c: any) => {
        const e = String(c.identificador || "").trim().toLowerCase();
        if (e.includes("@")) empresaDeCorreo.set(e, c.empresa_id);
      });

      const filas = frescos.map(m => {
        const asunto = String(m.asunto || "").slice(0, 400);
        const extracto = String(m.extracto || "").slice(0, 1200);
        const buzon = String(m.buzon || "").trim().toLowerCase();
        const para = (Array.isArray(m.para) ? m.para : [])
          .map(x => String(x || "").trim().toLowerCase()).filter(x => x.includes("@"));
        /* La cuenta de la postulación es el destinatario que NO es el buzón
           maestro: el reenvío de Gmail conserva el To original y agrega el
           maestro (y su X-Forwarded-For, que el script manda también aquí).
           Si el único destinatario ES el maestro, no se deduce nada: el
           fallback a `para[0]` daría la empresa del maestro, que es una
           respuesta inventada. */
        const cuenta = para.find(x => x !== buzon) || null;

        let postulacion_id = vincularPorAsuntoOCuerpo(asunto, extracto, posts);
        let vinculo_por: string | null = postulacion_id ? "codigo" : null;
        let empresa_id: string | null = (cuenta && empresaDeCorreo.get(cuenta)) || null;

        /* Segunda vía: la cuenta sabe de qué empresa es, y si esa empresa tiene
           UNA sola postulación viva, no hay ambigüedad. Viva incluye las
           GANADORAS sin rendir: son las que más correo reciben de DAFO —toda la
           rendición— y dejarlas fuera habría hecho inútil esta vía justo donde
           más se necesita. Con dos o más, se anota la empresa y decide una
           persona. */
        if (!postulacion_id && empresa_id) {
          const vivas = posts.filter(p =>
            p.empresa_id === empresa_id && (enJuego(p) || ejecutando(p)));
          if (vivas.length === 1) { postulacion_id = vivas[0].id; vinculo_por = "cuenta"; }
        }
        if (postulacion_id && !empresa_id) {
          empresa_id = posts.find(p => p.id === postulacion_id)?.empresa_id || null;
        }

        const fecha = new Date(String(m.fecha || ""));
        return {
          gmail_msg_id: String(m.id),
          gmail_thread_id: m.threadId ? String(m.threadId) : null,
          buzon: buzon || null,
          cuenta,
          remitente: String(m.de || "").slice(0, 240) || null,
          asunto: asunto || null,
          extracto: extracto || null,
          recibido_en: (isNaN(fecha.getTime()) ? new Date() : fecha).toISOString(),
          postulacion_id, empresa_id, vinculo_por,
          pide_accion: pideAccion(asunto, extracto),
        };
      });

      /* `ignoreDuplicates` es el cinturón además del tirante: entre la consulta
         de arriba y este insert pueden entrar dos corridas a la vez, y el unique
         de gmail_msg_id haría fallar TODA la tanda por un mensaje repetido. Así
         solo se cae el repetido. */
      const { data: creadas, error } = await db.from("dafo_comunicaciones")
        .upsert(filas, { onConflict: "gmail_msg_id", ignoreDuplicates: true })
        .select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      nuevos = (creadas || []).length;
    }
  }

  /* ── A QUIÉN AVISAR: se le pregunta a la base, no al insert de arriba ──

     Dos razones, y las dos son fallos que este sistema no puede permitirse.

     La primera: si el insert funciona y el aviso falla —un error de red, una
     columna que falta—, ese correo quedaría guardado y CALLADO PARA SIEMPRE,
     porque la próxima corrida lo vería como «ya estaba» y no volvería a
     mirarlo. Preguntando «qué hay reciente sin aviso» la corrida siguiente lo
     arregla sola.

     La segunda: el día de la instalación, si el filtro de Gmail se aplica
     también al correo viejo, entrarían cientos de mensajes de golpe y cada uno
     sonaría en el celular de cada miembro del equipo. Una tanda de cien pushes
     gasta exactamente la confianza que hace que el aviso siguiente se lea. Por
     eso solo suena lo de las últimas RECIENTE_H horas: lo viejo se guarda y
     aparece en el panel, que es donde se revisa el histórico. */
  const desde = new Date(Date.now() - RECIENTE_H * 3600 * 1000).toISOString();
  const { data: recientes } = await db.from("dafo_comunicaciones")
    .select("id,asunto,pide_accion,recibido_en")
    .gte("recibido_en", desde)
    .order("recibido_en", { ascending: false }).limit(200);

  let pendientes = (recientes || []) as any[];
  if (pendientes.length) {
    /* Por tandas de 50 y no todo de una: un `in` con doscientos UUID son unos
       7 KB de URL, y el límite de línea de petición del proxy de Supabase anda
       por ahí. Reventaría exactamente el día de la instalación —cuando entra el
       histórico— y el síntoma sería «no avisó», no «URL demasiado larga». */
    const yaAvisadas = new Set<string>();
    for (let i = 0; i < pendientes.length; i += 50) {
      const trozo = pendientes.slice(i, i + 50).map(r => r.id);
      const { data, error: eAv } = await db.from("notificaciones")
        .select("dafo_id").in("dafo_id", trozo);
      if (eAv) {
        return NextResponse.json({
          recibidos: mensajes.length, nuevos, avisos: 0,
          error: /dafo_id/.test(eAv.message)
            ? "Guardado, pero sin avisar: falta correr db/casilla-dafo.sql (columna notificaciones.dafo_id)."
            : eAv.message,
        });
      }
      (data || []).forEach((r: any) => { if (r.dafo_id) yaAvisadas.add(r.dafo_id); });
    }
    pendientes = pendientes.filter(r => !yaAvisadas.has(r.id));
  }
  if (!pendientes.length) return NextResponse.json({ recibidos: mensajes.length, nuevos, avisos: 0 });

  const { data: activos } = await db.from("perfiles").select("id").eq("activo", true).neq("nombre", BOT);
  if (!activos?.length) return NextResponse.json({ recibidos: mensajes.length, nuevos, avisos: 0 });

  const ahora = new Date().toISOString();
  const rafaga = pendientes.length > AVISOS_MAX;
  const filasN: any[] = [];
  for (const c of pendientes) {
    const titulo = String(c.asunto || "(sin asunto)").slice(0, 120);
    for (const p of activos as any[]) {
      filasN.push({
        usuario_id: p.id, dafo_id: c.id,
        tipo: c.pide_accion ? "dafo_accion" : "dafo",
        /* ── QUIÉN HABLA, y por qué eso decide si suena ──
           El eje de las dos pestañas es «¿te habla una persona o te recuerda el
           sistema?», y el timbre solo cuenta lo primero (actor_nombre no nulo).
           Un requerimiento con plazo de cinco días hábiles es la notificación
           más consecuente del sistema: dejarla sin actor la mandaba a «Del
           Bot», la pestaña que NO suena, con el mismo peso que un recordatorio
           de cronograma.
           Y no es una etiqueta inventada para colarla ahí: DAFO escribió ese
           correo. Es alguien externo hablándote, no el sistema recordándote
           algo — el eje se respeta, no se rompe.
           Lo rutinario (acuses, resoluciones que solo se archivan) sigue sin
           actor: si todo suena, nada suena. */
        ...(c.pide_accion ? { actor_nombre: "DAFO" } : {}),
        /* El asunto va entre « » porque la campanita se queda solo con eso
           (tituloDe); lo de delante lo lee quien recibe el push, donde el
           mensaje llega entero. */
        mensaje: `DAFO${c.pide_accion ? " — requiere respuesta" : ""}: «${titulo}»`,
        /* En ráfaga cada correo SÍ queda en la campanita —es el registro— pero
           con el push ya marcado como despachado, así no vibra el celular
           cincuenta veces. Es la misma semántica que usa el despachador cuando
           el destinatario no tiene dispositivos. */
        ...(rafaga ? { push_enviado_en: ahora } : {}),
      });
    }
  }
  /* …y un único aviso que sí suena, anclado al más reciente para que llevar al
     panel siga funcionando. */
  if (rafaga) {
    const ultimo = pendientes[0];
    const conAccion = pendientes.filter(c => c.pide_accion).length;
    for (const p of activos as any[]) {
      filasN.push({
        usuario_id: p.id, dafo_id: ultimo.id, tipo: "dafo",
        mensaje: `DAFO: ${pendientes.length} correos nuevos`
          + (conAccion ? ` · ${conAccion} requieren respuesta` : ""),
      });
    }
  }

  const { error: eN } = await db.from("notificaciones").insert(filasN);
  if (eN) {
    return NextResponse.json({
      recibidos: mensajes.length, nuevos, avisos: 0,
      error: /dafo_id/.test(eN.message)
        ? "Guardado, pero sin avisar: falta correr db/casilla-dafo.sql (columna notificaciones.dafo_id)."
        : eN.message,
    });
  }

  return NextResponse.json({
    recibidos: mensajes.length, nuevos,
    avisos: filasN.length, correosAvisados: pendientes.length, rafaga,
  });
}
