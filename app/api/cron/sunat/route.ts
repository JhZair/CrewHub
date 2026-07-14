import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { correrRondaSunat } from "@/lib/sunat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Ronda SUNAT semanal (la dispara Vercel Cron). Verifica todas las
   empresas activas con RUC; los avisos que genere los firma Bot Qhaway.
   - Autorización: Vercel manda `Authorization: Bearer <CRON_SECRET>`.
   - Compuerta: solo corre los lunes (hora de Perú); ?forzar=1 lo salta. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const forzar = url.searchParams.get("forzar") === "1";
  const ahoraPeru = new Date(Date.now() - 5 * 3600 * 1000); // UTC-5
  if (!forzar && ahoraPeru.getUTCDay() !== 1) {
    return NextResponse.json({ omitido: "solo corre los lunes", dia: ahoraPeru.getUTCDay() });
  }

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno." }, { status: 500 });
  }

  const { data: bot } = await db.from("perfiles").select("id").eq("nombre", "Bot Qhaway").maybeSingle();
  const res = await correrRondaSunat(db, bot?.id || null);
  return NextResponse.json({ corrida: true, ...res });
}
