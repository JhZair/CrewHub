"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { revalidarFondo } from "@/lib/fondoDatos";

/* ── Las tres cosas que se le hacen a un correo de la casilla ──
   Viven aquí y no en app/actions.ts porque son la mecánica de esta pantalla y
   de ninguna otra; la REGLA de a qué postulación pertenece un correo sí está
   compartida, y por eso está en lib/casilla.ts.

   Las tres revalidan /casilla y nada más: el panel es el único sitio que las
   muestra. */

/* ── `casillaSinLeer` SE FUE A app/nav-acciones.ts ──
   Contaba los correos sin leer para la burbuja del menú. Se retiró de aquí, no
   se duplicó: ahora ese conteo viaja dentro de `estadoNav`, junto con el
   permiso de la caja y lo que vence, en UNA sola acción.
   El motivo es de velocidad y conviene dejarlo escrito donde estaba el
   problema: Next encola las acciones de servidor, así que tres llamadas
   «paralelas» desde el menú eran tres viajes seguidos, cada uno validando la
   sesión por su cuenta. En las diecinueve pantallas, en cada navegación.
   Si alguien vuelve a necesitar solo este número, que lo saque de `estadoNav`
   en vez de resucitar esta función: una segunda puerta al mismo dato es una
   segunda llamada que nadie va a contar. */

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

/* ══════════════════════════════════════════════════════════════════════════
   REGISTRAR UNA CARTA DE LA CASILLA ELECTRÓNICA

   La Plataforma Virtual del Ministerio no manda correo de todo y no tiene API:
   si nadie entra a mirar, la carta no existe para nosotros. Y las que llegan
   ahí son justo las que muerden —«SEGUNDO REQUERIMIENTO DE OBLIGACIONES DEL
   ACTA»—.

   Así que se registran a mano, en la misma bandeja donde ya aterrizan los
   correos: es la misma pregunta —«¿qué nos ha dicho DAFO?»— y dos bandejas
   serían dos respuestas.

   ⚠ EL NÚMERO DE CARTA ES LA LLAVE, NO LA FECHA. En la casilla de PO-005 la
   carta 000500-2025 aparece CUATRO VECES, notificada el mismo día a la misma
   hora. Registrando por fecha, la línea de tiempo diría que DAFO requirió
   cuatro veces; por número, la segunda vez actualiza la primera.
   ══════════════════════════════════════════════════════════════════════════ */
export async function registrarCarta(f: {
  numero: string;
  asunto: string;
  fecha: string;                  // YYYY-MM-DD, el día notificado
  postulacionId?: string | null;
  docUrl?: string | null;
  responderHasta?: string | null;
  sistema?: string | null;        // SGD, Concursos DAFO…
  /** Lo que trae el PDF cuando la carta se carga por lote: el código del
   *  validador documental y quién firma. Ver lib/cartaDafo.ts. */
  codigo?: string | null;
  firmante?: string | null;
  /** A quién iba dirigida, tal como sale del PDF. */
  destinatario?: string | null;
  /** `true` = nos la notificaron a nosotros pero NO es nuestra. Queda como
   *  prueba de que se notificó mal, sin fondo, sin plazo y sin pedir nada. */
  ajena?: boolean;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada. Vuelve a iniciar sesión." };

  /* El número, en una sola forma. «CARTA N°000500…» y «CARTA N° 000500…» son
     la misma carta escrita por dos personas, y con solo `trim()` la llave
     anti-duplicado no evitaba nada. Se guarda ya normalizado porque es lo que
     se enseña: mayúsculas (así viene de la plataforma), un espacio entre
     palabras y el «N°» siempre despegado de su número. */
  const numero = (f.numero || "").trim().toUpperCase()
    .replace(/\s+/g, " ").replace(/N\s*[°º]\s*/g, "N° ").trim();
  const asunto = (f.asunto || "").trim();
  if (!numero) return { error: "Falta el número de la carta: es lo que evita registrarla dos veces." };
  if (!f.fecha) return { error: "Falta la fecha en que se notificó." };
  /* Un plazo anterior a la notificación es un tecleo, y uno que se guarda deja
     el requerimiento vencido desde el primer día — con su aviso rojo puesto
     para siempre. */
  if (f.responderHasta && f.responderHasta < f.fecha) {
    return { error: "El plazo para responder es anterior a la fecha de notificación. Revisa las dos fechas." };
  }

  const docUrl = (f.docUrl || "").trim();
  if (docUrl && !/^https?:\/\/\S+$/.test(docUrl)) {
    return { error: "El enlace al documento tiene que ser un link completo (https://…)." };
  }

  /* La empresa sale de la postulación, no se pide otra vez: en la bandeja las
     cartas se agrupan por empresa, y una registrada a mano aparecía suelta al
     final aunque su fondo tuviera empresa de sobra. */
  let empresaId: string | null = null;
  if (f.postulacionId) {
    const { data: post } = await supabase.from("postulaciones")
      .select("empresa_id").eq("id", f.postulacionId).maybeSingle();
    empresaId = (post as any)?.empresa_id || null;
  }

  /* ── ¿YA ESTABA, Y YA SE CONTESTÓ? ──
     Registrar otra vez la misma carta no puede resucitarla como pendiente: si
     alguien ya la respondió, `pide_accion: true` la devolvía al tope de la
     bandeja y a la lista de «hay que contestar», sobre algo ya hecho. */
  const { data: yaHay } = await supabase.from("dafo_comunicaciones")
    .select("id,respondido_en").eq("doc_numero", numero).maybeSingle();

  const fila: Record<string, any> = {
    origen: "casilla",
    doc_numero: numero,
    asunto: asunto || numero,
    buzon: (f.sistema || "").trim() || "Plataforma Virtual",
    /* Mediodía de Lima: guardado como medianoche, el día se corre al anterior
       en cuanto alguien lo lea desde otra zona. */
    recibido_en: new Date(`${f.fecha}T12:00:00-05:00`).toISOString(),
    doc_url: docUrl || null,
    doc_codigo: (f.codigo || "").trim().toUpperCase() || null,
    firmante: (f.firmante || "").trim() || null,
    destinatario: (f.destinatario || "").trim() || null,
    ajena: !!f.ajena,
    /* ── LA QUE NO ES NUESTRA NO TIENE RELOJ ──
       Aunque la carta traiga «diez días hábiles», ese plazo es de otro. Se
       guarda el documento, no la obligación: un vencimiento ajeno en nuestra
       lista de pendientes es una alarma que nadie puede apagar cumpliendo. */
    responder_hasta: f.ajena ? null : (f.responderHasta || null),
    /* Una carta que alguien se tomó el trabajo de registrar pide algo por
       definición: si no pidiera nada, no estaría aquí. Salvo que ya se haya
       contestado —entonces ya no pide nada, y volver a marcarla la resucitaría
       en la lista de pendientes— o que sea de otro. */
    pide_accion: !f.ajena && !(yaHay as any)?.respondido_en,
    /* ── QUIEN LA REGISTRA, YA LA LEYÓ ──
       La tecleó mirándola. Sin esto, cada carta cargada a mano dejaba un «sin
       leer» permanente en la bandeja —y una burbuja en el menú— sobre algo que
       la persona que lo puso acababa de leer entero. Una lista de pendientes
       que incluye lo que uno mismo acaba de hacer es una lista que se deja de
       mirar. */
    leido_en: new Date().toISOString(),
    leido_por: user.id,
  };
  /* ⚠ EL VÍNCULO SOLO SE ESCRIBE SI SE DIJO. Yendo siempre en el payload, un
     `null` viajaba en el `upsert` y volver a registrar la misma carta sin
     elegir fondo la DESVINCULABA — desaparecía de la vida del fondo sin que
     nadie tocara nada. Lo que no se dice, no se toca.
     Y una carta ajena no se cuelga de ningún fondo NUESTRO aunque alguien lo
     elija por error en el desplegable: aparecería en su línea de tiempo como
     si nos hubieran requerido a nosotros. */
  if (f.postulacionId && !f.ajena) {
    fila.postulacion_id = f.postulacionId;
    fila.vinculo_por = "manual";
    if (empresaId) fila.empresa_id = empresaId;
  }

  /* `upsert` por el número: registrar la misma carta dos veces corrige la
     primera en vez de duplicarla. Lo que NO viaja en el payload se conserva
     —`leido_en`, `caso_id`, `respondido_en`—: si alguien ya la leyó, le abrió
     un caso o la contestó, volver a registrarla no lo borra. */
  const { data, error } = await supabase.from("dafo_comunicaciones")
    .upsert(fila, { onConflict: "doc_numero" }).select("id").maybeSingle();
  if (error) {
    return {
      error: /doc_numero|origen|column/.test(error.message)
        ? "Falta correr db/vida-fondo.sql en Supabase → SQL Editor."
        : error.message,
    };
  }

  if (f.postulacionId) {
    await supabase.from("actividad").insert({
      entidad_tipo: "postulacion", entidad_id: f.postulacionId, actor_id: user.id,
      tipo: "editado",
      detalle: { mensaje: `registró la carta «${numero}» de la casilla electrónica` },
    });
    revalidarFondo(f.postulacionId);
    revalidatePath(`/entidad/postulacion/${f.postulacionId}`);
  }
  revalidatePath("/casilla");
  return { id: (data as any)?.id as string | undefined };
}

/** Borrar una carta registrada a mano — un número mal tecleado, una que no era
 *  de este fondo.
 *
 *  ⚠ SOLO LO REGISTRADO A MANO. La política de la base solo deja borrar donde
 *  `origen <> 'gmail'`: un correo de la ingesta es la prueba de que DAFO
 *  escribió, y eso no se borra —si molesta, se marca leído—. Aquí se comprueba
 *  también, para poder decirlo con palabras en vez de devolver «cero filas». */
export async function borrarCarta(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada. Vuelve a iniciar sesión." };

  const { data: prev } = await supabase.from("dafo_comunicaciones")
    .select("origen,doc_numero,postulacion_id").eq("id", id).maybeSingle();
  if (!prev) return { error: "Esa carta ya no está." };
  if (((prev as any).origen || "gmail") === "gmail") {
    return { error: "Esto llegó por correo desde DAFO: no se borra. Si ya no hace falta, márcalo como leído." };
  }

  const { data, error } = await supabase.from("dafo_comunicaciones")
    .delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se borró: no tienes permiso." };

  const pid = (prev as any).postulacion_id;
  if (pid) {
    await supabase.from("actividad").insert({
      entidad_tipo: "postulacion", entidad_id: pid, actor_id: user.id, tipo: "editado",
      detalle: { mensaje: `borró la carta «${(prev as any).doc_numero || "sin número"}» de la casilla` },
    });
    revalidarFondo(pid);
  }
  revalidatePath("/casilla");
  return {};
}

/**
 * Apagar el reloj de una carta — o volver a encenderlo.
 *
 * `fecha = null` la devuelve a los pendientes: una carta marcada por error
 * tiene que poder volver, o el aviso se apaga para siempre con un clic.
 *
 * ── CONTESTADA NO ES LO MISMO QUE CERRADA ──
 * Un requerimiento de hace quinientos días no se va a contestar. La única
 * salida que había era marcarlo «ya se contestó», que es una mentira escrita
 * en el expediente — y este expediente existe justamente para no tener que
 * mentir. Con `motivo`, la fila dice que dejó de estar pendiente Y POR QUÉ:
 * «se entregó todo el material el 19/01/2026, ya no aplica».
 */
export async function responderCarta(
  id: string, fecha: string | null, url?: string | null, motivo?: string | null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada. Vuelve a iniciar sesión." };

  const { data, error } = await supabase.from("dafo_comunicaciones")
    .update({
      respondido_en: fecha, respuesta_url: (url || "").trim() || null,
      /* Al reabrirla se borra el motivo: si vuelve a estar pendiente, la
         explicación de por qué se cerró ya no describe nada. */
      cierre_motivo: fecha ? ((motivo || "").trim() || null) : null,
      /* Contestada deja de pedir algo. Sin esto seguía subiendo al tope de la
         bandeja para siempre, y una lista de urgencias que nunca se vacía es
         una lista que se deja de mirar. */
      pide_accion: !fecha,
    })
    .eq("id", id).select("postulacion_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso o la carta ya no está." };

  revalidatePath("/casilla");
  const pid = (data[0] as any)?.postulacion_id;
  if (pid) revalidarFondo(pid);
  return {};
}
