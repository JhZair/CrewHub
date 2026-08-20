import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { correrRondaSunat } from "@/lib/sunat";
import { correrRondaObligaciones } from "@/lib/rondaObligaciones";
import { BOT } from "@/lib/personas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── LA RONDA DIARIA ──
 *
 * La dispara Vercel Cron (ver vercel.json) todos los días a las 11:00 UTC, que
 * son las 6 de la mañana en Perú. Hace DOS cosas con cadencias distintas:
 *
 *   · OBLIGACIONES — todos los días. Abre un caso con responsable y plazo por
 *     cada declaración que vence dentro de su ventana de aviso. Tiene que ser
 *     diaria: una ronda semanal se perdería los vencimientos que caen entre dos
 *     lunes, que son la mayoría.
 *
 *   · SUNAT (estado del RUC) — solo los lunes. Consulta la API de SUNAT empresa
 *     por empresa y eso ni cambia a diario ni conviene pedirlo a diario.
 *
 * ── POR QUÉ UNA RUTA Y NO DOS ──
 * Podrían ser dos entradas en vercel.json. Son una porque el disparo ya existía
 * y era diario: añadir una segunda entrada gasta uno de los cron que da el plan
 * para repetir una compuerta que aquí cuesta tres líneas. La ruta se llama
 * `/sunat` por historia; lo que hace es la ronda de la mañana.
 *
 * ── AUTORIZACIÓN Y PRUEBAS ──
 *   · Vercel manda `Authorization: Bearer <CRON_SECRET>`.
 *   · `?forzar=1` salta la compuerta del lunes (para probar la ronda SUNAT).
 *   · `?solo=obligaciones` o `?solo=sunat` corre una sola.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const forzar = url.searchParams.get("forzar") === "1";
  const solo = url.searchParams.get("solo") || "";

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno." }, { status: 500 });
  }

  const { data: bot } = await db.from("perfiles").select("id").eq("nombre", BOT).maybeSingle();
  const salida: Record<string, any> = { bot: bot?.id ? "ok" : "NO ENCONTRADO" };

  /* ── LAS OBLIGACIONES VAN PRIMERO ──
     La ronda SUNAT consulta una API externa y puede tardar o fallar entera. Si
     fuera antes, un mal día suyo se llevaría por delante los avisos de
     vencimiento, que son los que tienen fecha límite. Lo que no puede esperar,
     primero. */
  if (solo !== "sunat") {
    salida.obligaciones = await correrRondaObligaciones(db, bot?.id || null);
  }

  if (solo !== "obligaciones") {
    /* El estado del RUC, solo los lunes. */
    const ahoraPeru = new Date(Date.now() - 5 * 3600 * 1000); // UTC-5
    salida.sunat = (!forzar && ahoraPeru.getUTCDay() !== 1)
      ? { omitido: "solo corre los lunes", dia: ahoraPeru.getUTCDay() }
      : await correrRondaSunat(db, bot?.id || null);
  }

  return NextResponse.json({ corrida: true, ...salida });
}
