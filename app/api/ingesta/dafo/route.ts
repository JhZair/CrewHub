import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BOT } from "@/lib/personas";
import { EN_JUEGO } from "@/lib/fondos";
import { vincularPorCodigo, pideAccion, type PostMin } from "@/lib/casilla";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── LA PUERTA DE ENTRADA DE LA CASILLA DAFO ──
   Quien llama es el Apps Script del buzón maestro (scripts/casilla-dafo.gs),
   cada diez minutos, en los servidores de Google: por eso esto funciona con la
   computadora apagada y sin gastar nada.

   Entra con service_role (salta RLS) porque no hay sesión de usuario, igual que
   el cron de SUNAT. Autorización por llave: ?llave=… o Bearer.

   Lo que hace, en orden:
     1. descarta lo que ya está (por gmail_msg_id)
     2. vincula cada correo a su postulación — primero por el código del
        asunto, y si no, por la cuenta que lo recibió
     3. guarda
     4. avisa al equipo, que es lo único que se ve desde afuera: el push llega
        solo, porque toda notificación de este sistema nace en la tabla
        `notificaciones` y el despachador (/api/push/despachar) la recoge.

   Es idempotente a propósito: el Apps Script puede reintentar, y una
   notificación duplicada en el celular gasta la confianza que hace que la
   siguiente se lea. */

type Entrada = {
  id?: string; threadId?: string; fecha?: string; buzon?: string;
  de?: string; para?: string[]; asunto?: string; extracto?: string;
};

const TOPE = 100;   // por corrida; el Apps Script manda de a 25 hilos

export async function POST(req: Request) {
  const llave = process.env.INGESTA_DAFO_LLAVE;
  const url = new URL(req.url);
  const dada = url.searchParams.get("llave")
    || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
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
  const mensajes: Entrada[] = Array.isArray(cuerpo?.mensajes) ? cuerpo.mensajes.slice(0, TOPE) : [];
  if (!mensajes.length) return NextResponse.json({ recibidos: 0, nuevos: 0 });

  const ids = [...new Set(mensajes.map(m => String(m.id || "")).filter(Boolean))];
  if (!ids.length) return NextResponse.json({ recibidos: mensajes.length, nuevos: 0 });

  const { data: yaData, error: eYa } = await db.from("dafo_comunicaciones")
    .select("gmail_msg_id").in("gmail_msg_id", ids);
  /* Distinguir «no hay nada» de «la tabla no existe»: sin esto, olvidar correr
     db/casilla-dafo.sql se leería como «el Apps Script no manda nada» y se
     buscaría el problema en Google. */
  if (eYa) {
    return NextResponse.json({
      error: /dafo_comunicaciones/.test(eYa.message)
        ? "Falta correr db/casilla-dafo.sql en Supabase."
        : eYa.message,
    }, { status: 500 });
  }
  const ya = new Set((yaData || []).map((r: any) => r.gmail_msg_id));
  const frescos = mensajes.filter(m => m.id && !ya.has(String(m.id)));
  if (!frescos.length) return NextResponse.json({ recibidos: mensajes.length, nuevos: 0 });

  /* Los catálogos con los que se vincula. Se piden UNA vez por corrida, no por
     correo: veinte mensajes de la misma tanda preguntan lo mismo. */
  const [{ data: postsRaw }, { data: creds }] = await Promise.all([
    db.from("postulaciones").select("id,codigo,codigo_plataforma,estado,empresa_id"),
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
       maestro: el reenvío conserva el To original y agrega el maestro. */
    const cuenta = para.find(x => x !== buzon) || para[0] || null;

    let postulacion_id = vincularPorCodigo(`${asunto} ${extracto}`, posts);
    let vinculo_por: string | null = postulacion_id ? "codigo" : null;
    let empresa_id: string | null = (cuenta && empresaDeCorreo.get(cuenta)) || null;

    /* Segunda vía: la cuenta sabe de qué empresa es, y si esa empresa tiene
       UNA sola postulación en juego, no hay ambigüedad. Con dos o más se deja
       sin vincular: la empresa queda anotada y la persona decide. */
    if (!postulacion_id && empresa_id) {
      const vivas = posts.filter(p => p.empresa_id === empresa_id && EN_JUEGO.includes(p.estado || ""));
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

  /* `ignoreDuplicates` es el cinturón además del tirante: entre la consulta de
     arriba y este insert pueden entrar dos corridas a la vez, y el unique de
     gmail_msg_id haría fallar TODA la tanda por un mensaje repetido. Así solo
     se cae el repetido y `select` devuelve exactamente lo que se creó — que es
     lo que se notifica. */
  const { data: creadas, error } = await db.from("dafo_comunicaciones")
    .upsert(filas, { onConflict: "gmail_msg_id", ignoreDuplicates: true })
    .select("id,asunto,pide_accion");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const nuevas = (creadas || []) as any[];
  if (!nuevas.length) return NextResponse.json({ recibidos: mensajes.length, nuevos: 0 });

  /* Al equipo, como la ronda SUNAT: quien tiene cuenta activa y no es el Bot.
     Sin actor_nombre = automática, que es lo que manda a la pestaña «Del Bot»
     de la campanita (lib/notificaciones.ts → esAutomatica). */
  const { data: activos } = await db.from("perfiles").select("id").eq("activo", true).neq("nombre", BOT);
  let avisos = 0;
  if (activos?.length) {
    const filasN: any[] = [];
    for (const c of nuevas) {
      const titulo = String(c.asunto || "(sin asunto)").slice(0, 120);
      for (const p of activos as any[]) {
        filasN.push({
          usuario_id: p.id, dafo_id: c.id, tipo: "bot",
          mensaje: `${c.pide_accion ? "🚨" : "📬"} DAFO: «${titulo}»`,
        });
      }
    }
    const { error: eN } = await db.from("notificaciones").insert(filasN);
    /* Si la columna no está, el correo YA quedó guardado: no se pierde nada,
       pero hay que saber por qué el celular no vibró. */
    if (eN) {
      return NextResponse.json({
        recibidos: mensajes.length, nuevos: nuevas.length, avisos: 0,
        error: /dafo_id/.test(eN.message)
          ? "Guardado, pero sin avisar: falta correr db/casilla-dafo.sql (columna notificaciones.dafo_id)."
          : eN.message,
      });
    }
    avisos = filasN.length;
  }

  return NextResponse.json({ recibidos: mensajes.length, nuevos: nuevas.length, avisos });
}
