"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/* ── Las tres cosas que se le hacen a un correo de la casilla ──
   Viven aquí y no en app/actions.ts porque son la mecánica de esta pantalla y
   de ninguna otra; la REGLA de a qué postulación pertenece un correo sí está
   compartida, y por eso está en lib/casilla.ts.

   Las tres revalidan /casilla y nada más: el panel es el único sitio que las
   muestra. */

/* Leído / sin leer. El estado no es un booleano sino CUÁNDO y QUIÉN: en un
   equipo, «alguien ya lo vio» sin decir quién es lo mismo que no saberlo. */
export async function marcarComunicacion(id: string, leido: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada. Vuelve a iniciar sesión." };

  const { error } = await supabase.from("dafo_comunicaciones").update({
    leido_en: leido ? new Date().toISOString() : null,
    leido_por: leido ? user.id : null,
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/casilla");
  return {};
}

/* Vincular a mano. `vinculo_por = 'manual'` no es decoración: separa lo que
   alguien AFIRMÓ de lo que el sistema dedujo, y por eso la ingesta nunca
   sobreescribe un vínculo manual —no vuelve a mirar un correo ya guardado—. */
export async function vincularComunicacion(id: string, postulacionId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada. Vuelve a iniciar sesión." };

  let empresaId: string | null = null;
  if (postulacionId) {
    const { data: p } = await supabase.from("postulaciones")
      .select("empresa_id").eq("id", postulacionId).maybeSingle();
    empresaId = (p as any)?.empresa_id || null;
  }

  const { error } = await supabase.from("dafo_comunicaciones").update({
    postulacion_id: postulacionId,
    empresa_id: empresaId,
    vinculo_por: postulacionId ? "manual" : null,
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/casilla");
  return {};
}

/* Convertir el correo en trabajo.
   A propósito NO es automático: un aviso de DAFO puede ser una resolución que
   solo se archiva o un requerimiento con plazo de cinco días, y la palabra
   «plazo» en el asunto no distingue una de otra. El sistema sube el correo al
   tope de la lista; que haya una tarea lo decide quien lee. */
export async function casoDeComunicacion(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada. Vuelve a iniciar sesión." };

  const { data: com, error: eCom } = await supabase.from("dafo_comunicaciones")
    .select("id,asunto,extracto,remitente,recibido_en,cuenta,caso_id,postulacion_id," +
            "post:postulaciones(codigo,proy:proyectos(nombre))")
    .eq("id", id).maybeSingle();
  if (eCom) {
    return {
      error: /dafo_comunicaciones/.test(eCom.message)
        ? "Falta correr db/casilla-dafo.sql en Supabase."
        : eCom.message,
    };
  }
  if (!com) return { error: "No se encontró el correo." };

  /* ¿Ya hay caso, y sigue vivo? Uno archivado o descartado no cuenta: el
     correo quedaría atado para siempre a algo que no aparece en ningún
     tablero. Misma regla que casoDeExpediente. */
  const yaId = (com as any).caso_id as string | null;
  if (yaId) {
    const { data: vive } = await supabase.from("publicaciones")
      .select("id").eq("id", yaId)
      .is("archivado_en", null).neq("estado", "descartada").maybeSingle();
    if (vive) return { id: yaId, ya: true };
  }

  const post = (com as any).post;
  const quien = post
    ? `${post.codigo || "🎯"}${post.proy?.nombre ? ` · ${post.proy.nombre}` : ""}`
    : ((com as any).cuenta || "sin postulación vinculada");
  const asunto = String((com as any).asunto || "(sin asunto)").slice(0, 160);

  const { data: pub, error } = await supabase.from("publicaciones").insert({
    tipo: "tarea", estado: "abierta", autor_id: user.id,
    titulo: `📬 ${asunto} — ${quien}`,
    cuerpo: [
      `Correo de DAFO recibido el ${String((com as any).recibido_en || "").slice(0, 10)}.`,
      (com as any).remitente ? `De: ${(com as any).remitente}` : "",
      (com as any).cuenta ? `A la cuenta: ${(com as any).cuenta}` : "",
      "",
      String((com as any).extracto || "").slice(0, 900),
      "",
      "— Abierto desde 📬 Casilla DAFO.",
    ].filter(Boolean).join("\n"),
  }).select("id").single();
  if (error || !pub) return { error: error?.message || "No se pudo crear el caso." };

  const postulacionId = (com as any).postulacion_id as string | null;
  if (postulacionId) {
    await supabase.from("publicacion_vinculos").insert({
      publicacion_id: pub.id, entidad_tipo: "postulacion", entidad_id: postulacionId,
    });
    await supabase.from("actividad").insert({
      entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "tarea",
      detalle: { mensaje: `abrió un caso desde el correo «${asunto}»` },
    });
  }

  /* El caso queda anotado en el correo: sin esto, el segundo clic abre un
     caso gemelo y el tablero se llena de duplicados. Si esto falla el caso ya
     existe, así que se devuelve su id igual —y se dice qué pasó—. */
  const { error: eLink } = await supabase.from("dafo_comunicaciones")
    .update({ caso_id: pub.id }).eq("id", id);

  revalidatePath("/casilla");
  revalidatePath("/");
  if (postulacionId) revalidatePath(`/entidad/postulacion/${postulacionId}`);
  if (eLink) return { id: pub.id as string, error: "Caso creado, pero no quedó anotado en el correo: " + eLink.message };
  return { id: pub.id as string };
}
