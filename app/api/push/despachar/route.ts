import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

/* 📮 DESPACHADOR DE PUSH — el cartero único del sistema.
   Toda notificación (mención, asignación, cronograma, Qhaway) cae en la
   tabla `notificaciones`; este endpoint recoge las no-enviadas y las empuja
   a cada dispositivo suscrito del destinatario. Lo invoca pg_cron (vía
   pg_net) cada minuto — así también las de Qhaway, que nacen en la base
   de datos, llegan al celular sin que el servidor web intervenga.
   Protegido por llave: /api/push/despachar?llave=PUSH_CRON_LLAVE */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.PUSH_CRON_LLAVE || url.searchParams.get("llave") !== process.env.PUSH_CRON_LLAVE)
    return new Response("no autorizado", { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return Response.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
    return Response.json({ error: "Faltan claves VAPID" }, { status: 500 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:wayki.john@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  // Solo lo fresco: más de 24h sin enviar ya no es notificación, es historia.
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: pendientes } = await db.from("notificaciones")
    .select("id,usuario_id,mensaje,publicacion_id")
    .is("push_enviado_en", null).gte("creado_en", desde)
    .order("creado_en").limit(150);
  if (!pendientes?.length) return Response.json({ pendientes: 0, enviadas: 0 });

  const uids = [...new Set(pendientes.map((n: any) => n.usuario_id))];
  const { data: subs } = await db.from("push_suscripciones")
    .select("id,usuario_id,endpoint,p256dh,auth").in("usuario_id", uids);
  const porUsuario = new Map<string, any[]>();
  (subs || []).forEach((s: any) => {
    const l = porUsuario.get(s.usuario_id) || [];
    l.push(s); porUsuario.set(s.usuario_id, l);
  });

  let enviadas = 0, muertas = 0;
  const ahora = new Date().toISOString();
  for (const n of pendientes) {
    for (const s of porUsuario.get(n.usuario_id) || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            titulo: "CrewHub+",
            cuerpo: n.mensaje,
            url: n.publicacion_id ? `/caso/${n.publicacion_id}` : "/",
            tag: n.id,
          })
        );
        enviadas++;
      } catch (e: any) {
        // 404/410 = el dispositivo se dio de baja (app desinstalada, permiso
        // revocado): la suscripción muerta se entierra, no se reintenta.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await db.from("push_suscripciones").delete().eq("id", s.id);
          muertas++;
        }
      }
    }
    // Se marca aunque el usuario no tenga dispositivos: la campanita 🔔
    // de la app sigue siendo el registro; esto solo evita reintentos.
    await db.from("notificaciones").update({ push_enviado_en: ahora }).eq("id", n.id);
  }

  return Response.json({ pendientes: pendientes.length, enviadas, suscripcionesMuertas: muertas });
}
