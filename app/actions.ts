"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { entregableEq, porQueNoEq } from "@/lib/estadosEquipo";
import { icoTipo } from "@/lib/tipos";
import { FORM_CONF, nombreCorto } from "@/lib/entidades";
import { ETAPAS_PROY_VALIDAS } from "@/lib/etapasProyecto";
import { nrmQ } from "@/lib/quechua";
import { procesarSunatEmpresa, correrRondaSunat, consultarRucApi } from "@/lib/sunat";
import { rucDePersona } from "@/lib/ruc";
import { TOKEN } from "@/lib/puertas";
import { BOT, sinBot } from "@/lib/personas";
import { CAMPOS_TABLA } from "@/lib/tablas-expediente";
import { esCampoDelTrigger } from "@/lib/actividad";
import { SECCIONES, grafiasDe, tipoCanonico, ICO_ENT } from "@/lib/secciones";
import { fraccionValida } from "@/lib/jornadas";
import { TIPOS_OBJETO } from "@/lib/objetos";
import { catalogoObjetos, catalogosEntidades } from "@/lib/catalogos";
import { resolverNombres } from "@/lib/nombres";
import { COL_DAFO, sinColumna, sinDafoId, TIPOS_DAFO } from "@/lib/notificaciones";
import { DIAS_AVISO_DEF } from "@/lib/plazo";
import { hoyLima } from "@/lib/fechas";

/* Crear o actualizar una entidad núcleo (proyecto/empresa/persona).
   La config compartida actúa como whitelist de tabla y campos. */
export async function guardarEntidad(tipo: string, id: string | null, datos: Record<string, string>) {
  const conf = FORM_CONF[tipo];
  if (!conf) return { error: "Tipo de entidad no permitido" };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  // Campos de dinero/puntaje: se limpia "S/ 400,000.00" → "400000.00"
  const NUMERICOS = ["monto_adjudicado", "puntaje_jurado", "valor_compra"];
  const limpio: Record<string, string | boolean | null> = {};
  conf.campos.forEach(c => {
    if (!(c.key in datos)) return;
    // Los booleanos llegan como "si"/"no" desde el formulario
    if (c.tipo === "bool") {
      const b = String(datos[c.key] ?? "").trim();
      limpio[c.key] = b === "si" ? true : b === "no" ? false : null;
      return;
    }
    // String(...) porque los campos numéricos (año, monto) pueden llegar como número
    let v = String(datos[c.key] ?? "").trim();
    if (v && NUMERICOS.includes(c.key)) {
      v = v.replace(/[^\d.,]/g, "").replace(/,/g, "");
      const p = v.split(".");
      if (p.length > 2) v = p.slice(0, -1).join("") + "." + p[p.length - 1];
      v = v.replace(/^\.+/, "");
    }
    limpio[c.key] = v || null;
  });
  const req = conf.campos.find(c => c.requerido && !limpio[c.key]);
  if (req) return { error: `El campo "${req.label}" es obligatorio.` };

  if (id) {
    // Foto previa para el diff del historial. El trigger de BD ya registra los
    // CAMPOS_TRIGGER (estado/responsable/…); aquí anotamos el resto. La regla y
    // la lista viven en lib/actividad (fuente única) para no duplicar bitácora.
    const { data: antes } = await supabase.from(conf.tabla).select("*").eq("id", id).maybeSingle();

    /* ── «EN USO» LO GOBIERNA EL PRÉSTAMO, NO EL FORMULARIO ──
       El estado dice QUÉ y el préstamo dice QUIÉN: son dos filas que tienen
       que contar la misma historia. El desplegable no ofrece «en uso» —no
       está en ESTADOS_ELEGIBLES— pero cuando el equipo YA está en uso, el
       formulario enseña su valor actual para no perderlo… y nada impedía
       elegir «disponible» encima.
       Eso no fallaba: guardaba. Y dejaba el equipo diciendo «disponible»
       mientras «En uso ahora» lo seguía enseñando en manos de alguien, con
       su botón de devolver. Dos verdades a la vez, y la de la ficha es la
       que se cree.
       Se comprueba en el servidor y no solo en la pantalla: la pantalla es
       una cortesía, el servidor es la regla. */
    if (tipo === "equipamiento" && "estado" in limpio) {
      const { data: abierto } = await supabase.from("equipo_prestamos")
        .select("id,persona:personas(nombre,alias)")
        .eq("equipamiento_id", id).is("hasta", null).limit(1).maybeSingle();
      const q: any = abierto ? (Array.isArray((abierto as any).persona) ? (abierto as any).persona[0] : (abierto as any).persona) : null;
      const quien = q?.alias || q?.nombre || "alguien";
      if (abierto && limpio.estado !== "en_uso") {
        return { error: `Está prestado —lo tiene ${quien}—, así que su estado lo manda el préstamo. Regístralo como devuelto y después cámbialo. Si se perdió o se rompió estando fuera, dilo en su bitácora: al devolverlo se le pone el estado que toque.` };
      }
      if (!abierto && limpio.estado === "en_uso") {
        return { error: "«En uso» no se pone a mano: sale de un préstamo abierto, y este equipo no tiene ninguno. Entrégalo desde /equipamiento y el estado se pone solo." };
      }
      /* Y lo mismo con «ensamblado», por la misma razón: lo gobierna el equipo
         que contiene la pieza, no este formulario. Cambiarlo a mano dejaría la
         pieza «disponible» y a la vez atornillada dentro de otra cosa — dos
         verdades, y la lista de entrega se creería la primera. */
      const montada = (antes as any)?.ensamblado_en || null;
      if (montada && limpio.estado !== "ensamblado") {
        return { error: "Está montada dentro de otro equipo, así que su estado lo manda ese equipo. Desmóntala desde su ficha y después cámbialo." };
      }
      if (!montada && limpio.estado === "ensamblado") {
        return { error: "«Ensamblado» no se pone a mano: sale de estar montado dentro de otro equipo. Móntalo desde la ficha de ese equipo." };
      }
    }

    /* El .select() no es decorativo: si una política de RLS impide el UPDATE,
       PostgREST no devuelve error — afecta cero filas y responde OK. Sin
       exigir que la fila vuelva, el sistema jura que guardó y no guardó. */
    const { data: post, error } = await supabase.from(conf.tabla)
      .update(limpio).eq("id", id).select("id");
    if (error) return { error: error.message };
    if (!post?.length) return { error: "No se guardó: no tienes permiso para editar este registro." };
    if (antes) {
      // Valor legible y acotado para la bitácora (evita textos kilométricos).
      // Una URL NO se recorta: el historial la muestra como botón para verla y
      // abrirla, y truncarla rompía el link (Drive no abría el enlace cortado).
      const vis = (v: any) => {
        const s = String(v ?? "").trim();
        if (!s) return "—";
        if (/^https?:\/\/\S+$/.test(s)) return s;
        return s.length > 70 ? s.slice(0, 70) + "…" : s;
      };
      const cambios = conf.campos
        .filter(c => (c.key in limpio) && !esCampoDelTrigger(c.key))
        .filter(c => {
          const a = (antes as any)[c.key], b = limpio[c.key];
          return NUMERICOS.includes(c.key)
            ? Number(a ?? 0) !== Number(b ?? 0)
            : String(a ?? "") !== String(b ?? "");
        })
        .map(c => ({ campo: nombreCorto(c), de: vis((antes as any)[c.key]), a: vis(limpio[c.key]) }));
      if (cambios.length) {
        await supabase.from("actividad").insert({
          entidad_tipo: tipo, entidad_id: id, actor_id: user.id, tipo: "editado",
          detalle: {
            mensaje: `actualizó ${cambios.length} campo${cambios.length > 1 ? "s" : ""}`,
            cambios,
          },
        });
      }
    }
    revalidatePath(`/entidad/${tipo}/${id}`);
    return { id };
  }

  // Folio/código autogenerado si viene vacío: E-###, P-###, A-###
  const PREFIJOS: Record<string, { campo: string; letra: string }> = {
    empresa: { campo: "codigo", letra: "E" },
    proyecto: { campo: "folio", letra: "P" },
    equipamiento: { campo: "folio", letra: "A" },
    convocatoria: { campo: "codigo", letra: "C" },
    postulacion: { campo: "codigo", letra: "PO" },
  };
  const pf = PREFIJOS[tipo];
  if (pf && !limpio[pf.campo]) {
    const { data: filas } = await supabase.from(conf.tabla).select(pf.campo);
    let max = 0;
    (filas || []).forEach((r: any) => {
      const m = (r[pf.campo] || "").match(new RegExp(`^${pf.letra}-(\\d+)`, "i"));
      if (m) max = Math.max(max, parseInt(m[1]));
    });
    limpio[pf.campo] = `${pf.letra}-${String(max + 1).padStart(3, "0")}`;
  }

  const { data, error } = await supabase.from(conf.tabla).insert(limpio).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/");
  return { id: data.id };
}

export type Vinculo = { tipo: string; id: string };

/* 🔔 Notificar a las PERSONAS vinculadas a una publicación. Esto era el hueco:
   vincular a alguien lo mete en su feed "Mis asuntos", pero no le llegaba
   campanita —un aviso dirigido a Michel no le avisaba a Michel—. Solo se puede
   notificar a personas CON cuenta (personas.usuario_id); un colaborador externo
   sin usuario no recibe (no tiene dónde). Se excluye al propio actor y a quien
   ya se notificó por otra vía (p. ej. el responsable). */
async function notificarPersonasVinculadas(
  supabase: any, pubId: string, personaIds: string[],
  actorUserId: string, actorNombre: string, titulo: string, tipo: string,
  yaAvisados: (string | null)[] = []
) {
  const ids = [...new Set((personaIds || []).filter(Boolean))];
  if (!ids.length) return;
  const { data: pers } = await supabase.from("personas")
    .select("usuario_id").in("id", ids).not("usuario_id", "is", null);
  const evitar = new Set([actorUserId, ...yaAvisados].filter(Boolean) as string[]);
  const destinatarios = [...new Set((pers || []).map((p: any) => p.usuario_id))]
    .filter((uid: any): uid is string => !!uid && !evitar.has(uid));
  if (!destinatarios.length) return;
  const nom = (actorNombre || "Alguien").split(" ")[0];
  await supabase.from("notificaciones").insert(destinatarios.map(uid => ({
    usuario_id: uid, publicacion_id: pubId, tipo: "vinculo", actor_nombre: actorNombre,
    mensaje: tipo === "aviso"
      ? `📢 ${nom} te vinculó en el aviso «${titulo}»`
      : `🔗 ${nom} te vinculó en «${titulo}»`,
  })));
}

export async function crearPublicacion(
  tipo: string,
  titulo: string,
  cuerpo: string,
  vinculos: Vinculo[] = [],
  responsable: string | null = null,
  fechaLimite: string | null = null,
  imagenes: string[] = []
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada. Vuelve a iniciar sesión." };
  const { data: pub, error } = await supabase.from("publicaciones").insert({
    autor_id: user.id,
    tipo,
    titulo,
    cuerpo: cuerpo || null,
    responsable: responsable || null,
    fecha_limite: fechaLimite || null,
    imagenes: (imagenes || []).slice(0, 6),
    estado: "abierta",  // todo caso nace Sin Resolver; En Progreso se gana trabajando
  }).select("id").single();
  if (error) return { error: error.message };

  if (vinculos.length && pub) {
    const filas = vinculos.map(v => ({
      publicacion_id: pub.id,
      entidad_tipo: v.tipo,
      entidad_id: v.id,
    }));
    const { error: e2 } = await supabase.from("publicacion_vinculos").insert(filas);
    if (e2) return { error: "Publicado, pero falló un vínculo: " + e2.message };
  }

  // 🔔 Notificaciones: al responsable asignado y a las personas vinculadas.
  if (pub) {
    const personaIds = vinculos.filter(v => v.tipo === "persona").map(v => v.id);
    const notificaResp = !!responsable && responsable !== user.id;
    if (notificaResp || personaIds.length) {
      const { data: miP } = await supabase.from("perfiles").select("nombre").eq("id", user.id).single();
      const actorNombre = miP?.nombre || "Alguien";
      if (notificaResp) {
        await supabase.from("notificaciones").insert({
          usuario_id: responsable, publicacion_id: pub.id, tipo: "asignacion",
          actor_nombre: actorNombre, mensaje: `Te asignaron: «${titulo}»`,
        });
      }
      // Al responsable ya se le avisó arriba: no duplicar si además está vinculado.
      await notificarPersonasVinculadas(supabase, pub.id, personaIds, user.id, actorNombre, titulo, tipo, [responsable]);
    }
  }
  revalidatePath("/");
  return {};
}

/* MURO DEL PROYECTO — una nota de bitácora. Es una publicación tipo 'bitacora'
   vinculada al proyecto (y a las etiquetas que la ordenan), con imágenes. Reusa
   todo el motor de publicaciones: reacciones, comentarios y menciones vienen
   gratis. El título no se pide —una nota no tiene asunto— así que se deriva de
   la primera línea del cuerpo (la columna `titulo` es NOT NULL). */
export async function publicarBitacora(
  entidadId: string,
  cuerpo: string,
  imagenes: string[] = [],
  tags: string[] = [],
  entidadTipo: string = "proyecto",
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cuerpoT = (cuerpo || "").trim();
  const imgs = (imagenes || []).filter(Boolean).slice(0, 6);
  if (!cuerpoT && !imgs.length) return { error: "Escribe algo o agrega una imagen." };
  const titulo = ((cuerpoT.split("\n")[0] || "").trim() || "🧱 Nota").slice(0, 80);
  /* Las etiquetas del muro son PROPIAS de la bitácora, no las del sistema (las
     de casos: Urgente, SUNAT…). Se guardan como texto en la propia nota, no
     como vínculo a la tabla `etiquetas` — así jamás salen en otro listado ni se
     mezclan con las etiquetas de trabajo. Acotadas a esta entidad. */
  const tagsLimpias = [...new Set((tags || []).map(t => t.trim()).filter(Boolean))].slice(0, 12);
  const { data: pub, error } = await supabase.from("publicaciones").insert({
    autor_id: user.id, tipo: "bitacora", titulo, cuerpo: cuerpoT || null,
    imagenes: imgs, estado: "abierta", datos_extra: { tags: tagsLimpias },
  }).select("id").single();
  if (error) return { error: error.message };
  const { error: e2 } = await supabase.from("publicacion_vinculos")
    .insert({ publicacion_id: pub.id, entidad_tipo: entidadTipo, entidad_id: entidadId });
  if (e2) return { error: "Publicado, pero falló el vínculo: " + e2.message };
  revalidatePath(`/entidad/${entidadTipo}/${entidadId}`);
  return {};
}

/* Destacar / quitar de destacados una nota del muro. Las destacadas asoman en
   la columna del carné del proyecto. Es una decisión de equipo (cualquiera del
   sistema puede fijarla), no solo del autor. Se guarda en `datos_extra`. */
export async function destacarBitacora(pubId: string, entidadId: string, destacado: boolean, entidadTipo: string = "proyecto") {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: pub } = await supabase.from("publicaciones").select("tipo,datos_extra").eq("id", pubId).single();
  if (!pub) return { error: "No se encontró la nota." };
  if (pub.tipo !== "bitacora") return { error: "No es una nota del muro." };
  // `destacado_orden` (número) guarda la posición en los destacados; se conserva
  // `destacado` (bool) por compatibilidad. Al destacar por primera vez se pone
  // al final (Date.now() > cualquier orden normalizado). El reorden lo ajusta.
  const de = { ...(pub.datos_extra || {}) } as any;
  if (destacado) { de.destacado = true; if (typeof de.destacado_orden !== "number") de.destacado_orden = Date.now(); }
  else { de.destacado = false; delete de.destacado_orden; }
  const { error } = await supabase.from("publicaciones").update({ datos_extra: de }).eq("id", pubId);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/${entidadTipo}/${entidadId}`);
  return {};
}

/* Destacar (o quitar) un MATERIAL del repositorio en el muro. Mismo modelo que
   una nota, pero en `objetos.datos` (jsonb). Así el bloque «Destacados del muro»
   puede mezclar notas y material. */
export async function destacarObjeto(objetoId: string, entidadTipo: string, entidadId: string, destacado: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: obj } = await supabase.from("objetos").select("datos").eq("id", objetoId).single();
  if (!obj) return { error: "No se encontró el material." };
  const d = { ...(obj.datos || {}) } as any;
  if (destacado) { d.destacado = true; if (typeof d.destacado_orden !== "number") d.destacado_orden = Date.now(); }
  else { d.destacado = false; delete d.destacado_orden; }
  const { error } = await supabase.from("objetos").update({ datos: d }).eq("id", objetoId);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/${entidadTipo}/${entidadId}`);
  return {};
}

/* Reordenar los destacados del muro (notas + material). Recibe la lista YA en el
   orden deseado; escribe `destacado_orden = índice` en cada uno. Pocos ítems, así
   que el bucle de updates es barato. */
export async function ordenarDestacados(
  entidadTipo: string, entidadId: string,
  items: { kind: "post" | "obj"; id: string }[],
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  for (let i = 0; i < items.length; i++) {
    const { kind, id } = items[i];
    if (kind === "post") {
      const { data } = await supabase.from("publicaciones").select("datos_extra").eq("id", id).single();
      if (data) await supabase.from("publicaciones")
        .update({ datos_extra: { ...(data.datos_extra || {}), destacado: true, destacado_orden: i } }).eq("id", id);
    } else {
      const { data } = await supabase.from("objetos").select("datos").eq("id", id).single();
      if (data) await supabase.from("objetos")
        .update({ datos: { ...(data.datos || {}), destacado: true, destacado_orden: i } }).eq("id", id);
    }
  }
  revalidatePath(`/entidad/${entidadTipo}/${entidadId}`);
  return {};
}

/* Editar una nota del muro: solo su autor. Cambia texto, imágenes y etiquetas;
   conserva el «destacado» y marca `editado_en`. */
export async function editarBitacora(
  pubId: string, entidadId: string, cuerpo: string, imagenes: string[] = [], tags: string[] = [], entidadTipo: string = "proyecto",
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: pub } = await supabase.from("publicaciones").select("autor_id,tipo,datos_extra").eq("id", pubId).single();
  if (!pub) return { error: "No se encontró la nota." };
  if (pub.tipo !== "bitacora") return { error: "No es una nota del muro." };
  if (pub.autor_id !== user.id) return { error: "Solo el autor puede editar su nota." };
  const cuerpoT = (cuerpo || "").trim();
  const imgs = (imagenes || []).filter(Boolean).slice(0, 6);
  if (!cuerpoT && !imgs.length) return { error: "La nota no puede quedar vacía." };
  const tagsLimpias = [...new Set((tags || []).map(t => t.trim()).filter(Boolean))].slice(0, 12);
  const titulo = ((cuerpoT.split("\n")[0] || "").trim() || "🧱 Nota").slice(0, 80);
  const nuevo = { ...(pub.datos_extra || {}), tags: tagsLimpias };
  const { error } = await supabase.from("publicaciones")
    .update({ titulo, cuerpo: cuerpoT || null, imagenes: imgs, datos_extra: nuevo, editado_en: new Date().toISOString() })
    .eq("id", pubId);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/${entidadTipo}/${entidadId}`);
  return {};
}

/* Borrar una nota del muro: solo su autor. Cascadea comentarios/reacciones. */
export async function borrarBitacora(pubId: string, entidadId: string, entidadTipo: string = "proyecto") {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: pub } = await supabase.from("publicaciones").select("autor_id,tipo").eq("id", pubId).single();
  if (!pub) return { error: "No se encontró la nota." };
  if (pub.tipo !== "bitacora") return { error: "No es una nota del muro." };
  if (pub.autor_id !== user.id) return { error: "Solo el autor puede borrar su nota." };
  const { error } = await supabase.from("publicaciones").delete().eq("id", pubId);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/${entidadTipo}/${entidadId}`);
  return {};
}

export async function comentar(pubId: string, texto: string, imagenes: string[] = [], respondeA: string | null = null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: com, error } = await supabase
    .from("comentarios")
    .insert({ publicacion_id: pubId, autor_id: user.id, cuerpo: texto, imagenes: (imagenes || []).slice(0, 6), responde_a: respondeA || null })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Quién comenta (para el "quién" en la notificación)
  const { data: miPerfilC } = await supabase.from("perfiles").select("nombre").eq("id", user.id).single();
  const actorNombre = miPerfilC?.nombre || "Alguien";

  // 🪄 Menciones @nombre → notificación al invocado
  // El token de mención excluye `*` y `_`: si alguien pone en negrita
  // `**@Juan**`, «Juan**» no casaría con ningún nombre y el aviso se perdía.
  // Quiénes ya reciben aviso por MENCIÓN: no se les vuelve a notificar por el
  // mismo comentario (si no, el autor mencionado recibía dos —mención y
  // comentario— por un solo mensaje).
  const mencionados = new Set<string>();
  const tokens = [...new Set((texto.match(/@[^\s@,;:!?*_`]+/g) || []).map(m => m.slice(1)))];
  if (tokens.length) {
    const nrmM = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const [{ data: perfs }, { data: pubT }] = await Promise.all([
      supabase.from("perfiles").select("id,nombre").eq("activo", true),
      supabase.from("publicaciones").select("titulo").eq("id", pubId).single(),
    ]);
    for (const p of perfs || []) {
      const sinEspacios = nrmM(p.nombre).replace(/\s+/g, "");
      const palabras = nrmM(p.nombre).split(/\s+/);
      const invocado = tokens.some(t => {
        const tk = nrmM(t);
        return sinEspacios.startsWith(tk) || palabras.some(w => w.startsWith(tk));
      });
      if (invocado && p.id !== user.id) {
        mencionados.add(p.id);
        await supabase.from("notificaciones").insert({
          usuario_id: p.id, publicacion_id: pubId, tipo: "mencion", actor_nombre: actorNombre,
          mensaje: `🪄 ${actorNombre.split(" ")[0]} te mencionó en «${(pubT?.titulo || "").slice(0, 60)}»`,
        });
      }
    }
  }
  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion",
    entidad_id: pubId,
    actor_id: user.id,
    tipo: "comentario",
    detalle: { comentario_id: com.id },
  });

  // 🔔 Notificar al autor y al responsable del caso (menos a quien comenta)
  const { data: pub } = await supabase.from("publicaciones")
    .select("titulo,autor_id,responsable").eq("id", pubId).single();
  if (pub) {
    const destinatarios = [...new Set([pub.autor_id, pub.responsable])]
      // A quien ya se le avisó por mención no se le manda además la de
      // comentario: es el mismo mensaje y salían dos notificaciones.
      .filter(d => d && d !== user.id && !mencionados.has(d as string));
    if (destinatarios.length) {
      await supabase.from("notificaciones").insert(destinatarios.map(d => ({
        usuario_id: d,
        publicacion_id: pubId,
        tipo: "comentario",
        actor_nombre: actorNombre,
        mensaje: `Nuevo comentario en «${pub.titulo}»`,
      })));
    }
  }
  revalidatePath(`/caso/${pubId}`);
  return {};
}

/* Comentar un OBJETO del repositorio. Misma tabla `comentarios` y mismo motor
   de menciones y avisos que un caso — solo cambia de quién cuelga. Se hizo así
   tras probar la vía de «abrir un caso»: el caso es una unidad de trabajo
   (estado, responsable, plazo) y un comentario sobre un libro no lo es; cada
   conversación dejaba un caso «Sin Resolver» eterno en el tablero. */
export async function comentarObjeto(objetoId: string, texto: string, imagenes: string[] = [], respondeA: string | null = null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cuerpo = (texto || "").trim();
  const imgs = (imagenes || []).filter(Boolean).slice(0, 6);
  if (!cuerpo && !imgs.length) return { error: "El comentario no puede ir vacío." };

  const { data: com, error } = await supabase.from("comentarios")
    .insert({ objeto_id: objetoId, autor_id: user.id, cuerpo: cuerpo || "📷", imagenes: imgs, responde_a: respondeA || null })
    .select("id").single();
  if (error) return { error: error.message };

  const [{ data: miP }, { data: obj }] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("id", user.id).single(),
    supabase.from("objetos").select("titulo,creado_por").eq("id", objetoId).single(),
  ]);
  const actorNombre = miP?.nombre || "Alguien";
  const titulo = (obj?.titulo || "").slice(0, 60);

  // 🪄 Menciones @nombre — mismo reconocimiento que en los casos
  const tokens = [...new Set((cuerpo.match(/@[^\s@,;:!?*_`]+/g) || []).map(m => m.slice(1)))];
  const avisados = new Set<string>([user.id]);
  if (tokens.length) {
    const nrmM = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const { data: perfs } = await supabase.from("perfiles").select("id,nombre").eq("activo", true);
    for (const p of perfs || []) {
      const sinEspacios = nrmM(p.nombre).replace(/\s+/g, "");
      const palabras = nrmM(p.nombre).split(/\s+/);
      const invocado = tokens.some(t => {
        const tk = nrmM(t);
        return sinEspacios.startsWith(tk) || palabras.some(w => w.startsWith(tk));
      });
      if (invocado && !avisados.has(p.id)) {
        avisados.add(p.id);
        await supabase.from("notificaciones").insert({
          usuario_id: p.id, objeto_id: objetoId, tipo: "mencion", actor_nombre: actorNombre,
          mensaje: `🪄 ${actorNombre.split(" ")[0]} te mencionó en «${titulo}»`,
        });
      }
    }
  }

  // 🔔 A quien trajo el objeto (si no es quien comenta)
  if (obj?.creado_por && !avisados.has(obj.creado_por)) {
    await supabase.from("notificaciones").insert({
      usuario_id: obj.creado_por, objeto_id: objetoId, tipo: "comentario", actor_nombre: actorNombre,
      mensaje: `Nuevo comentario en «${titulo}»`,
    });
  }

  await supabase.from("actividad").insert({
    entidad_tipo: "objeto", entidad_id: objetoId, actor_id: user.id, tipo: "comentario",
    detalle: { comentario_id: com.id },
  });
  revalidatePath(`/objeto/${objetoId}`);
  return {};
}

export async function asignarResponsable(pubId: string, perfilId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Filas afectadas: si RLS bloquea el cambio vuelve 0 filas sin error — se avisa
  // en vez de dejar el no-op silencioso (el select rebotaba al valor viejo).
  const { data: filas, error } = await supabase.from("publicaciones")
    .update({ responsable: perfilId }).eq("id", pubId).select("id");
  if (error) return { error: error.message };
  if (!filas?.length) return { error: "No se pudo cambiar el responsable (sin permiso o el caso ya no existe)." };

  /* 🗂 Bitácora: NO se inserta a mano. El trigger `registrar_evento_estado`
     (db/schema.sql) ya registra el cambio de `responsable` con el actor
     (auth.uid()) al hacer el UPDATE. Insertarlo aquí también lo dejaba
     DUPLICADO —igual que el cambio de estado, que confía solo en el trigger—. */

  // 🔔 Notificar al nuevo responsable
  if (perfilId && perfilId !== user.id) {
    const [{ data: pub }, { data: miP }] = await Promise.all([
      supabase.from("publicaciones").select("titulo").eq("id", pubId).single(),
      supabase.from("perfiles").select("nombre").eq("id", user.id).single(),
    ]);
    await supabase.from("notificaciones").insert({
      usuario_id: perfilId,
      publicacion_id: pubId,
      tipo: "asignacion",
      actor_nombre: miP?.nombre || "Alguien",
      mensaje: `Te asignaron: «${pub?.titulo || "un caso"}»`,
    });
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

const norm = (s: string) => (s || "").trim();
/* Clave para comparar nombres al importar: sin tildes, sin dobles espacios,
   en minúsculas. Es la misma regla que nrm_nombre() en la base.
   Sin esto, "José Nelson Márquez" y "Jose Nelson Marquez" entran como dos
   personas: así se colaron los duplicados de la migración de Seatable. */
const clave = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
const normEstado = (s: string) => {
  const v = norm(s).toLowerCase();
  if (v.includes("vetado") || v.includes("no usar")) return "vetado";
  if (v.includes("potencial")) return "potencial";
  if (v.includes("inactivo") || v.includes("archivado")) return "inactivo";
  return "activo";
};
const normTipo = (s: string) => {
  const v = norm(s).toLowerCase();
  if (v.includes("personal")) return "personal";
  if (v.includes("colaborador")) return "colaborador";
  if (v.includes("independiente")) return "independiente";
  if (v.includes("financiera") || v.includes("entidad")) return "entidad_financiera";
  return "contacto";
};
const normEquipo = (s: string) => {
  const v = norm(s).toLowerCase();
  if (v.includes("creativo")) return "creativo";
  if (v.includes("cnico")) return "tecnico";
  if (v.includes("administrativo")) return "administrativo";
  return null;
};

export async function importarPersonas(filas: Record<string, string>[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  /* Dedupe por nombre normalizado (sin tildes) y también por DNI/RUC, que
     es la llave más fuerte: pesca a quien vino escrito distinto.
     El `ya` crece con cada fila aceptada, así el archivo tampoco puede
     duplicarse contra sí mismo — antes solo miraba la base, y un CSV con
     la misma persona dos veces la insertaba dos veces. */
  const { data: existentes } = await supabase.from("personas").select("nombre,ruc_dni");
  const ya = new Set<string>();
  (existentes || []).forEach((x: any) => {
    ya.add("n:" + clave(x.nombre));
    if (norm(x.ruc_dni)) ya.add("d:" + norm(x.ruc_dni));
  });

  const nuevas = filas
    .filter(f => {
      const n = norm(f.nombre);
      if (!n) return false;
      const kn = "n:" + clave(n);
      const kd = norm(f.ruc_dni) ? "d:" + norm(f.ruc_dni) : null;
      if (ya.has(kn) || (kd && ya.has(kd))) return false;
      ya.add(kn);
      if (kd) ya.add(kd);
      return true;
    })
    .map(f => ({
      nombre: norm(f.nombre),
      alias: norm(f.alias) || null,
      tipo: normTipo(f.tipo),
      equipo: normEquipo(f.equipo),
      estado: normEstado(f.estado),
      rol: norm(f.rol) || null,
      region: norm(f.region) || null,
      genero: norm(f.genero) || null,
      telefono: norm(f.telefono) || null,
      email: norm(f.email) || null,
      ruc_dni: norm(f.ruc_dni) || null,
      origen: "seatable",
    }));

  let insertadas = 0;
  for (let i = 0; i < nuevas.length; i += 100) {
    const lote = nuevas.slice(i, i + 100);
    const { error } = await supabase.from("personas").insert(lote);
    if (error) return { error: `Error en el lote ${i / 100 + 1}: ${error.message}`, insertadas };
    insertadas += lote.length;
  }
  revalidatePath("/");
  return { insertadas, omitidas: filas.length - nuevas.length };
}

/* --- Importación genérica: personas | proyectos | empresas --- */
const pref = (s: string, re: RegExp) => (norm(s).match(re)?.[0] || "").toUpperCase();

export async function importarEntidades(entidad: string, filas: Record<string, string>[]) {
  if (entidad === "persona") return importarPersonas(filas);
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  let nuevas: Record<string, string | null>[] = [];
  let omitidas = 0;

  if (entidad === "proyecto") {
    const { data: exis } = await supabase.from("proyectos").select("folio,nombre");
    const ya = new Set<string>();
    (exis || []).forEach((x: any) => {
      if (x.folio) ya.add(pref(x.folio, /^P-\d+/i));
      if (x.nombre) ya.add(x.nombre.trim().toLowerCase());
    });
    const mapTipo = (s: string) => {
      const v = norm(s).toLowerCase();
      if (v.includes("documental")) return "documental";
      if (v.includes("anima")) return "animacion";
      if (v.includes("video")) return "videojuego";
      if (v.includes("ficci")) return "ficcion";
      if (v.includes("experimental")) return "experimental";
      return null;
    };
    const mapEtapa = (s: string) => {
      const v = norm(s).toLowerCase();
      if (v.includes("semilla") || v.includes("idea")) return "idea";
      if (v.includes("carpeta")) return "en_carpeta";
      if (v.includes("desarrollo")) return "desarrollo";
      if (v.includes("preproduc")) return "preproduccion";
      if (v.includes("postproduc")) return "postproduccion";
      if (v.includes("produc")) return "produccion";
      if (v.includes("finalizado")) return "finalizado";
      return null;
    };
    const mapAct = (s: string) => {
      const v = norm(s).toLowerCase();
      if (v.includes("bloqueado")) return "bloqueado";
      if (v.includes("pausa") || v.includes("detenido")) return "en_pausa";
      if (v.includes("completado")) return "completado";
      if (v.includes("activo")) return "activo";
      return "activo";
    };
    filas.forEach(f => {
      const nombre = norm(f.nombre);
      const fol = pref(f.folio, /^P-\d+/i);
      if (!nombre || ya.has(nombre.toLowerCase()) || (fol && ya.has(fol))) { omitidas++; return; }
      ya.add(nombre.toLowerCase()); if (fol) ya.add(fol);
      nuevas.push({
        folio: norm(f.folio) || null, nombre,
        nombre_corto: norm(f.nombre_corto) || null,
        tipo: mapTipo(f.tipo), etapa: mapEtapa(f.etapa),
        estado_actividad: mapAct(f.estado_actividad),
        descripcion: norm(f.descripcion) || null,
      });
    });
    for (let i = 0; i < nuevas.length; i += 100) {
      const { error } = await supabase.from("proyectos").insert(nuevas.slice(i, i + 100));
      if (error) return { error: error.message, insertadas: i };
    }
  } else if (entidad === "empresa") {
    const { data: exis } = await supabase.from("empresas").select("codigo,nombre");
    const ya = new Set<string>();
    (exis || []).forEach((x: any) => {
      if (x.codigo) ya.add(pref(x.codigo, /^E-\d+/i));
      if (x.nombre) ya.add(x.nombre.trim().toLowerCase());
    });
    const mapTipoE = (s: string) => {
      const v = norm(s).toLowerCase();
      if (v.includes("eirl") || v.includes("e.i.r.l")) return "eirl";
      if (v.includes("sac") || v.includes("s.a.c")) return "sac";
      if (v.includes("asoc")) return "asociacion";
      if (v.includes("ong")) return "ong";
      if (v.includes("munici")) return "municipalidad";
      return null;
    };
    filas.forEach(f => {
      let nombre = norm(f.nombre);
      const cod = pref(f.codigo, /^E-\d+/i);
      if (!nombre && norm(f.codigo)) nombre = norm(f.codigo);
      if (!nombre || ya.has(nombre.toLowerCase()) || (cod && ya.has(cod))) { omitidas++; return; }
      ya.add(nombre.toLowerCase()); if (cod) ya.add(cod);
      nuevas.push({
        codigo: norm(f.codigo) || null, nombre,
        razon_social: norm(f.razon_social) || null,
        tipo: mapTipoE(f.tipo), ruc: norm(f.ruc) || null,
        region: norm(f.region) || null,
        estado: norm(f.estado).toLowerCase().includes("inactiv") ? "inactiva" : "activa",
      });
    });
    for (let i = 0; i < nuevas.length; i += 100) {
      const { error } = await supabase.from("empresas").insert(nuevas.slice(i, i + 100));
      if (error) return { error: error.message, insertadas: i };
    }
  } else if (entidad === "equipamiento") {
    const { data: exis } = await supabase.from("equipamiento").select("folio");
    const ya = new Set<string>();
    (exis || []).forEach((x: any) => { if (x.folio) ya.add(pref(x.folio, /^A-\d+/i)); });
    const mapCat = (s: string) => {
      const v = norm(s).toLowerCase();
      if (v.includes("cámara") || v.includes("camara")) return "cámara";
      if (v.includes("micr")) return "micrófono";
      if (v.includes("ilumin")) return "iluminación";
      if (v.includes("dron")) return "drone";
      if (v.includes("energ")) return "energía";
      if (v.includes("producc")) return "producción";
      if (v.includes("pc") || v.includes("accesor")) return "pc_accesorios";
      if (v.includes("cómputo") || v.includes("computo")) return "cómputo";
      return v || null;
    };
    const mapEst = (s: string) => {
      const v = norm(s).toLowerCase();
      if (v.includes("baja")) return "de_baja";
      if (v.includes("repara")) return "en_reparacion";
      if (v.includes("perdido")) return "perdido";
      /* «No aparece» va ANTES de «disponible» y después de «perdido»: una
         hoja que diga «no aparece / no ubicado / extraviado» no es lo mismo
         que una que diga «perdido», y meterlas en el mismo cajón borra la
         única distinción que importa aquí. */
      if (v.includes("no aparece") || v.includes("no ubica") || v.includes("extravi") || v.includes("sin ubicar"))
        return "no_aparece";
      // OJO al orden: "no disponible" contiene "disponible"
      if (v.includes("no disponible")) return "en_uso";
      if (v.includes("asignado")) return "en_uso";
      if (v.includes("uso")) return "en_uso";
      if (v.includes("disponible")) return "disponible";
      return "disponible";
    };
    filas.forEach(f => {
      const nombre = norm(f.nombre);
      const fol = pref(f.folio, /^A-\d+/i);
      // Dedupe SOLO por folio: los nombres se repiten legítimamente
      // (dos colchonetas idénticas = A-082 y A-083)
      if (!nombre || (fol && ya.has(fol))) { omitidas++; return; }
      if (fol) ya.add(fol);
      nuevas.push({
        folio: fol || norm(f.folio) || null,   // guarda "A-001" limpio
        nombre,
        categoria: mapCat(f.categoria), subcategoria: norm(f.subcategoria) || null,
        estado: mapEst(f.estado),
        valor_compra: (() => {
          // "S/.1115.54" | "S/ 1,115.54" | "1115" → numérico limpio
          let v = norm(f.valor_compra).replace(/[^\d.,]/g, "").replace(/,/g, "");
          const partes = v.split(".");
          if (partes.length > 2) v = partes.slice(0, -1).join("") + "." + partes[partes.length - 1];
          v = v.replace(/^\.+/, "");
          const n = parseFloat(v);
          return isNaN(n) ? null : String(n);
        })(),
        comprado_en: norm(f.comprado_en) || null,
        link: norm(f.link) || null,
        descripcion: norm(f.descripcion) || null,
      });
    });
    for (let i = 0; i < nuevas.length; i += 100) {
      const { error } = await supabase.from("equipamiento").insert(nuevas.slice(i, i + 100));
      if (error) return { error: error.message, insertadas: i };
    }
  } else if (entidad === "convocatoria") {
    // Cada fila crea la convocatoria + sus HITOS de cronograma
    // desde las columnas de fechas (DD/MM/YYYY del Seatable)
    const fechaDMY = (s: string) => {
      const m = norm(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
    };
    const nrmS = (s: string) => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const numDe = (s: string) => {
      let v = norm(s).replace(/[^\d.,]/g, "").replace(/,/g, "");
      const p = v.split("."); if (p.length > 2) v = p.slice(0, -1).join("") + "." + p[p.length - 1];
      const n = parseFloat(v.replace(/^\.+/, "")); return isNaN(n) ? null : String(n);
    };

    const [{ data: exis }, { data: proysAll }, { data: postExis }] = await Promise.all([
      supabase.from("convocatorias").select("id,nombre,codigo,anio"),
      supabase.from("proyectos").select("id,folio"),
      supabase.from("postulaciones").select("convocatoria_id,proyecto_id"),
    ]);
    // Correlativo C-### continuando desde el máximo existente
    let maxC = 0;
    (exis || []).forEach((x: any) => {
      const m = (x.codigo || "").match(/^C-(\d+)/i);
      if (m) maxC = Math.max(maxC, parseInt(m[1]));
    });
    // Si la convocatoria ya existe, la devolvemos (para colgarle postulaciones)
    const buscarExistente = (concurso: string, anio: number | null) =>
      (exis || []).find((x: any) => {
        if (anio && x.anio && x.anio !== anio) return false;
        const a = nrmS(x.nombre || ""), b = nrmS(concurso);
        return a.includes(b) || b.includes(a);
      });
    // Mapa folio P-### → id de proyecto (para la columna ConcursosProyectos)
    const folioMap = new Map<string, string>();
    (proysAll || []).forEach((p: any) => {
      const m = (p.folio || "").match(/^P-?0*(\d+)/i);
      if (m) folioMap.set(String(parseInt(m[1])), p.id);
    });
    const postYa = new Set((postExis || []).map((x: any) => `${x.convocatoria_id}:${x.proyecto_id}`));
    let postCreadas = 0;
    // Correlativo PO-### para postulaciones importadas
    const { data: codsPO } = await supabase.from("postulaciones").select("codigo");
    let maxPO = 0;
    (codsPO || []).forEach((x: any) => {
      const m = (x.codigo || "").match(/^PO-(\d+)/i);
      if (m) maxPO = Math.max(maxPO, parseInt(m[1]));
    });

    const HITOS: [string, string][] = [
      ["f_apertura", "Apertura de convocatoria"],
      ["f_cierre", "Cierre de postulación"],
      ["f_revision", "Revisión de postulaciones"],
      ["f_evaluacion", "Evaluación / Encuentro con Jurado"],
      ["f_finalistas", "Publicación de finalistas"],
      ["f_ganadores", "Declaración de ganadores"],
    ];
    const hoyS = hoyLima();
    const anioActual = new Date().getFullYear();
    let insertadas = 0, hitosCreados = 0;

    for (const f of filas) {
      const concurso = norm(f.nombre);
      if (!concurso) { omitidas++; continue; }
      const anio = parseInt(norm(f.anio)) || null;
      const gan = fechaDMY(f.f_ganadores);
      // ¿El concurso ya se decidió? (para el estado de las postulaciones)
      const decidida = !!((gan && gan <= hoyS) || (anio && anio < anioActual));

      const previa = buscarExistente(concurso, anio);
      let convId: string;

      if (previa) {
        omitidas++;
        convId = previa.id;
      } else {
        maxC++;
        const codigo = `C-${String(maxC).padStart(3, "0")}`;
        const estado = decidida ? "finalizada" : "abierta";
        const basesUrl = (norm(f.bases_url).match(/https?:\/\/\S+/) || [null])[0];
        const { data: nueva, error } = await supabase.from("convocatorias").insert({
          codigo, nombre: concurso, institucion: "DAFO", anio,
          estado, monto_adjudicado: numDe(f.monto), bases_url: basesUrl,
        }).select("id").single();
        if (error) return { error: `En «${concurso}»: ${error.message}`, insertadas, omitidas };
        insertadas++;
        convId = nueva.id;

        /* Cuánto avisa cada hito depende de qué te exige a TI.
           Estos números salieron de mirar los hitos reales de las bases
           (db/hitos-anticipacion.sql), no de suponer: todos nacían con 7
           días, el mismo aviso para entregar una carpeta que para
           enterarse de que DAFO publicó una lista.
           Si cambian aquí, hay que correr también el SQL para los ya
           cargados — y al revés. */
        const anticipacionDe = (nombre: string) => {
          const n = nombre.toLowerCase();
          // Entregas la carpeta. Dos nombres para el mismo día: algunos
          // concursos lo llaman "Ventana de postulación (cierra 13:00)".
          if (n.includes("cierre de postulaci") || n.includes("ventana de postulaci")) return 15;
          // Trámites con fecha tope: RENCA, excepciones, regularizaciones.
          // Y la ventana de consultas, que es la única chance de preguntarle
          // a DAFO qué quiso decir en las bases: si nadie se entera, se pierde.
          if (n.includes("límite") || n.includes("limite")
              || n.includes("formulaci") && n.includes("consulta")) return 10;
          /* Todo lo demás solo se mira: apertura, revisión, evaluación,
             publicación de finalistas, declaración de ganadores. Ojo con
             "Evaluación / Encuentro con Jurado": el nombre sugiere una
             reunión, pero en estos concursos es DAFO evaluando sola. */
          return 2;
        };
        const crearHito = async (nombre: string, d: string) => {
          await supabase.from("cronograma_actividades").insert({
            convocatoria_id: convId, nombre,
            clase: "hito_externo", etapa: "administracion",
            fecha_inicio: d, fecha_fin: d,
            estado: d <= hoyS ? "finalizada" : "planificada",
            dias_anticipacion: anticipacionDe(nombre),
            creado_por: user.id,
          });
          hitosCreados++;
        };

        for (const [campo, label] of HITOS) {
          const d = fechaDMY(f[campo]);
          if (d) await crearHito(label, d);
        }
        // Hitos dinámicos: cualquier columna extra del CSV con una fecha
        // (ej. "Inscripción RENCA") se vuelve hito con el nombre de la columna
        try {
          const extras = JSON.parse(f.__extras || "{}");
          for (const [col, val] of Object.entries(extras)) {
            const d = fechaDMY(String(val));
            if (d && col) await crearHito(col, d);
          }
        } catch { /* extras opcionales */ }
      }

      // Postulaciones históricas: la columna ConcursosProyectos trae
      // los P-### que postularon. Se crean también para convocatorias
      // ya existentes (por eso este bloque va fuera del else).
      const folios = [...new Set(
        (norm(f.postulados).match(/P-?0*\d+/gi) || [])
          .map((s: string) => String(parseInt(s.replace(/\D/g, ""))))
      )];
      for (const num of folios) {
        const pid = folioMap.get(num);
        if (!pid || postYa.has(`${convId}:${pid}`)) continue;
        maxPO++;
        await supabase.from("postulaciones").insert({
          convocatoria_id: convId, proyecto_id: pid,
          codigo: `PO-${String(maxPO).padStart(3, "0")}`,
          // Concurso decidido → 'no_seleccionada' por defecto;
          // las ganadoras se marcan a mano (son pocas y ustedes las conocen)
          estado: decidida ? "no_seleccionada" : "enviada",
        });
        postYa.add(`${convId}:${pid}`);
        postCreadas++;
      }
    }
    revalidatePath("/");
    return { insertadas, omitidas, hitos: hitosCreados, postulaciones: postCreadas };
  } else return { error: "Entidad no soportada" };

  revalidatePath("/");
  return { insertadas: nuevas.length, omitidas };
}

export async function crearEtiqueta(nombre: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const limpio = nombre.trim();
  if (!limpio) return { error: "Nombre vacío" };
  // Si ya existe (sin distinguir mayúsculas), la reutiliza
  const { data: ex } = await supabase.from("etiquetas")
    .select("id,nombre").ilike("nombre", limpio).maybeSingle();
  if (ex) return { id: ex.id, nombre: ex.nombre };
  const { data, error } = await supabase.from("etiquetas")
    .insert({ nombre: limpio }).select("id,nombre").single();
  if (error) return { error: error.message };
  revalidatePath("/");
  return { id: data.id, nombre: data.nombre };
}

// Borra una etiqueta — solo si no tiene casos vinculados (seguridad).
export async function borrarEtiqueta(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { count } = await supabase.from("publicacion_vinculos")
    .select("publicacion_id", { count: "exact", head: true })
    .eq("entidad_tipo", "etiqueta").eq("entidad_id", id);
  if (count && count > 0)
    return { error: `Tiene ${count} caso${count === 1 ? "" : "s"} — quítala de ellos antes de borrarla.` };
  const { error } = await supabase.from("etiquetas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/etiquetas");
  revalidatePath("/");
  return {};
}

/* ── Jornadas: registro PERSONAL. Solo el usuario logueado registra su
      propia jornada; la persona se resuelve por su cuenta enlazada. ── */
export async function registrarMiJornada(
  fecha: string, proyectoId: string | null, tipo: string, fraccion: number, noche: boolean = false
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida." };
  if (!["rodaje", "oficina", "scouting"].includes(tipo)) return { error: "Tipo inválido." };
  if (![0.5, 1, 1.5].includes(fraccion)) return { error: "Fracción inválida." };

  const { data: yo } = await supabase.from("personas")
    .select("id,tarifa_dia,tarifa_rodaje,tarifa_noche").eq("usuario_id", user.id).maybeSingle();
  if (!yo) return { error: "Tu cuenta no está enlazada a una persona. Pídele al administrador que la enlace." };

  const estMes = await estadoDelMes(supabase, yo.id, fecha);
  if (estMes === "liquidado") return { error: "Ese mes ya está liquidado; no puedes agregar jornadas." };
  if (estMes === "confirmado") return { error: "Ya confirmaste ese mes. Reábrelo si necesitas agregar una jornada." };

  /* Las fracciones solo aplican a oficina; rodaje/scouting = día completo.
     scouting/oficina pagan con tarifa de día; solo rodaje usa la de rodaje.
     El pernocte no aplica en oficina.

     `fraccionValida` no es paranoia: `jornadas.fraccion` es un `numeric` sin
     check, así que la única barrera contra un 7 son los botones — y una acción
     de servidor se puede llamar sin pasar por ellos. Un valor inventado aquí
     se convierte en dinero en el monto, callado. */
  const frac = tipo === "oficina" ? (fraccionValida(fraccion) ? fraccion : 1) : 1;
  const nocheOk = tipo !== "oficina" && !!noche;
  const base = tipo === "rodaje" ? (yo.tarifa_rodaje ?? yo.tarifa_dia) : yo.tarifa_dia;
  const extraNoche = nocheOk ? Number(yo.tarifa_noche ?? yo.tarifa_rodaje ?? yo.tarifa_dia ?? 0) : 0;
  const dia = base != null ? Number(base) * frac : null;
  const monto = dia != null ? dia + extraNoche : (nocheOk && extraNoche ? extraNoche : null);
  const { error } = await supabase.from("jornadas").insert({
    persona_id: yo.id, fecha, proyecto_id: proyectoId || null, tipo, fraccion: frac, noche: nocheOk, monto, registrado_por: user.id,
  });
  if (error) return { error: error.message };

  if (proyectoId) {
    await supabase.from("actividad").insert({
      entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "jornada",
      detalle: { mensaje: `registró su jornada de ${tipo} (${fecha})` },
    });
  }
  revalidatePath("/jornadas");
  return { ok: 1 };
}

export async function borrarJornada(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: j } = await supabase.from("jornadas").select("persona_id,fecha").eq("id", id).single();
  if (j) {
    const { data: dueno } = await supabase.from("personas").select("usuario_id").eq("id", j.persona_id).single();
    const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
    if (dueno?.usuario_id !== user.id && !perfil?.es_admin) return { error: "No puedes borrar esta jornada." };
    const est = await estadoDelMes(supabase, j.persona_id, j.fecha);
    if (est === "liquidado") return { error: "Ese mes está liquidado; reábrelo para borrar." };
    if (est === "confirmado" && !perfil?.es_admin) return { error: "Confirmaste ese mes; reábrelo para borrar." };
  }
  const { error } = await supabase.from("jornadas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/jornadas");
  return {};
}

// Aprobar / desaprobar una jornada — solo admin.
export async function aprobarJornada(id: string, aprobar: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo un administrador puede aprobar jornadas." };
  const { error } = await supabase.from("jornadas").update({
    aprobada: aprobar,
    aprobada_por: aprobar ? user.id : null,
    aprobada_en: aprobar ? new Date().toISOString() : null,
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/jornadas");
  return {};
}

// Editar una jornada (dueño o admin). Recalcula el monto y la deja pendiente de aprobar.
export async function editarJornada(
  id: string, fecha: string, proyectoId: string | null, tipo: string, fraccion: number, noche: boolean
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida." };
  if (!["rodaje", "oficina", "scouting"].includes(tipo)) return { error: "Tipo inválido." };

  const { data: j } = await supabase.from("jornadas").select("persona_id,fecha").eq("id", id).single();
  if (!j) return { error: "Jornada no encontrada." };
  const { data: dueno } = await supabase.from("personas")
    .select("id,usuario_id,tarifa_dia,tarifa_rodaje,tarifa_noche").eq("id", j.persona_id).single();
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (dueno?.usuario_id !== user.id && !perfil?.es_admin) return { error: "No puedes editar esta jornada." };
  const est = await estadoDelMes(supabase, j.persona_id, j.fecha);
  if (est === "liquidado") return { error: "Ese mes está liquidado; reábrelo para editar." };
  if (est === "confirmado" && !perfil?.es_admin) return { error: "Confirmaste ese mes; reábrelo para editar." };

  // Misma guarda que al registrar: editar es otra puerta a la misma tabla.
  const frac = tipo === "oficina" ? (fraccionValida(fraccion) ? fraccion : 1) : 1;
  const nocheOk = tipo !== "oficina" && !!noche;
  const base = tipo === "rodaje" ? (dueno!.tarifa_rodaje ?? dueno!.tarifa_dia) : dueno!.tarifa_dia;
  const extraNoche = nocheOk ? Number(dueno!.tarifa_noche ?? dueno!.tarifa_rodaje ?? dueno!.tarifa_dia ?? 0) : 0;
  const dia = base != null ? Number(base) * frac : null;
  const monto = dia != null ? dia + extraNoche : (nocheOk && extraNoche ? extraNoche : null);
  const { error } = await supabase.from("jornadas").update({
    fecha, proyecto_id: proyectoId || null, tipo, fraccion: frac, noche: nocheOk, monto,
    aprobada: false, aprobada_por: null, aprobada_en: null,
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/jornadas");
  return {};
}

/* ══════ QUÉ HIZO ESA PERSONA ESE DÍA, EN TODO EL SISTEMA ══════
 *
 * Una jornada dice «1.5j · S/ 195 · oficina» y no dice NADA de en qué se fue
 * el día. Al aprobar, esa es la pregunta que nadie puede contestar sin abrir
 * seis pantallas — y la que más importa en los días raros: el que registró
 * día y medio de oficina un domingo, o el que no registró nada un martes.
 *
 * Justamente ese último caso es el que paga esta ventana. Un día en blanco no
 * distingue «descansó» de «se le olvidó registrar», y el sistema SÍ lo sabe:
 * si esa tarde dejó ocho comentarios y entregó dos equipos, no descansó.
 *
 * Se lee al abrir la ventana y no con la página: son cinco consultas por día
 * y hay treinta días por persona. Traerlo todo por adelantado sería mover mil
 * quinientas consultas para enseñar, casi siempre, ninguna.
 *
 * EL DÍA ES EL DE LIMA, no el del servidor. `creado_en` es timestamptz y sin
 * la zona un comentario de las nueve de la noche caería en el día siguiente —
 * el mismo error que corrigió lib/fechas. Por eso el rango se escribe con el
 * offset explícito y no con la fecha a secas.
 */
/* Los préstamos de una consulta, pidiendo `creado_en` SI EXISTE.
 *
 * La columna la añade db/prestamo-creado-en.sql y guarda a qué hora se
 * REGISTRÓ el préstamo —que no es `desde`, el día en que el equipo sale—.
 * Mientras esa migración no se corra, PostgREST devuelve un error por columna
 * desconocida y `data` viene en null: la ventana del día se quedaría sin los
 * equipos y sin decir por qué. Así que se pide, y si la base no la conoce se
 * repite la consulta sin ella. Un dato de más que aún no está no puede
 * llevarse por delante los que sí.
 */
async function prestamosCon(supabase: any, cols: string, filtro: (q: any) => any) {
  const conProy = cols.replace("PROY", "proy:proyectos(id,nombre)");
  const r = await filtro(supabase.from("equipo_prestamos").select(`${conProy},creado_en`));
  if (!r.error) return r;
  if (!/creado_en/.test(r.error.message || "")) return r;
  return await filtro(supabase.from("equipo_prestamos").select(conProy));
}

export type HechoDelDia = {
  /** Instante exacto, o `null` si el hecho NO tiene hora. Un préstamo guarda
   *  `desde` como fecha suelta —sin hora— y un RHE igual: inventarles las
   *  12:00 para poder ordenarlos ponía en pantalla un dato que nadie
   *  registró, y encima los dejaba en medio de la mañana como si hubieran
   *  pasado ahí. Van al final, dichos como lo que son. */
  at: string | null; ico: string; txt: string; sub?: string | null; href?: string | null;
  /** En qué cajón cae, para poder filtrar. Cinco y no diez: un filtro con
   *  diez botones se recorre más despacio que la lista que filtra. */
  clase: "pub" | "com" | "cambio" | "equipo" | "rhe";
  /** Si es una TANDA —veintidós equipos entregados de una sentada—, qué
   *  contiene. Veintidós filas idénticas ocupan la ventana entera y dicen una
   *  sola cosa; plegadas dicen la misma y dejan ver el resto del día. */
  lista?: string[];
};
export async function contextoDelDia(personaId: string, fecha: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida." };

  const { data: per } = await supabase.from("personas")
    .select("id,nombre,alias,usuario_id").eq("id", personaId).single();
  if (!per) return { error: "Persona no encontrada." };

  /* Solo tú, o un admin. Lo que alguien hizo un martes es suyo. */
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (per.usuario_id !== user.id && !perfil?.es_admin) {
    return { error: "Solo puedes ver tu propia actividad." };
  }

  const desde = `${fecha}T00:00:00-05:00`;
  const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  const hasta = `${d.toISOString().slice(0, 10)}T00:00:00-05:00`;
  const uid = per.usuario_id;
  const u1 = (x: any) => (Array.isArray(x) ? x[0] : x);

  const [pubs, coms, acts, presDio, presRecibio, presDevolvio, rhes] = await Promise.all([
    /* Lo que PUBLICÓ: casos, avisos, notas de muro. */
    uid ? supabase.from("publicaciones").select("id,titulo,tipo,creado_en")
      .eq("autor_id", uid).gte("creado_en", desde).lt("creado_en", hasta) : Promise.resolve({ data: [] }),
    /* Lo que COMENTÓ, con dónde. Los cuatro dueños posibles de un comentario
       —caso, objeto, equipo y uso— se piden de una vez: preguntar por el
       nombre después sería una consulta por comentario. */
    uid ? supabase.from("comentarios")
      .select("id,cuerpo,creado_en,publicacion_id,objeto_id,equipamiento_id,prestamo_id,pub:publicaciones(id,titulo),obj:objetos(id,titulo),eq:equipamiento(id,folio,nombre),pre:equipo_prestamos(equipo:equipamiento(id,folio,nombre))")
      .eq("autor_id", uid).gte("creado_en", desde).lt("creado_en", hasta) : Promise.resolve({ data: [] }),
    /* El registro de cambios: estados, asignaciones, vínculos. Sin los de tipo
       «comentario», que ya vienen enteros de la consulta de arriba y contarían
       dos veces el mismo hecho. */
    uid ? supabase.from("actividad").select("id,tipo,entidad_tipo,entidad_id,creado_en,detalle")
      .eq("actor_id", uid).neq("tipo", "comentario")
      .gte("creado_en", desde).lt("creado_en", hasta) : Promise.resolve({ data: [] }),
    /* Equipos: los que ENTREGÓ (es un acto suyo aunque se los lleve otro), los
       que recibió y los que devolvió. `desde`/`hasta` son fechas sueltas, sin
       hora: se comparan con el día tal cual. */
    uid ? prestamosCon(supabase, "id,desde,tipo,PROY,equipo:equipamiento(id,folio,nombre),persona:personas(nombre,alias)",
      q => q.eq("entregado_por", uid).eq("desde", fecha)) : Promise.resolve({ data: [] }),
    prestamosCon(supabase, "id,desde,tipo,PROY,equipo:equipamiento(id,folio,nombre)",
      q => q.eq("persona_id", personaId).eq("desde", fecha)),
    prestamosCon(supabase, "id,hasta,tipo,PROY,equipo:equipamiento(id,folio,nombre)",
      q => q.eq("persona_id", personaId).eq("hasta", fecha)),
    supabase.from("rhe").select("id,numero,monto,concepto,fecha")
      .eq("persona_id", personaId).eq("fecha", fecha),
  ]);

  const hechos: HechoDelDia[] = [];

  (pubs.data || []).forEach((x: any) => hechos.push({
    at: x.creado_en, ico: icoTipo(x.tipo), clase: "pub",
    txt: `Publicó «${(x.titulo || "").slice(0, 70)}»`,
    href: `/caso/${x.id}`,
  }));

  (coms.data || []).forEach((c: any) => {
    const pub = u1(c.pub), obj = u1(c.obj), eq = u1(c.eq), pre = u1(c.pre);
    const eqPre = pre ? u1(pre.equipo) : null;
    const donde = pub ? { t: pub.titulo, h: `/caso/${pub.id}` }
      : obj ? { t: obj.titulo, h: `/objeto/${obj.id}` }
      : eq ? { t: `${eq.folio || ""} ${eq.nombre}`.trim(), h: `/entidad/equipamiento/${eq.id}` }
      : eqPre ? { t: `${eqPre.folio || ""} ${eqPre.nombre}`.trim(), h: `/entidad/equipamiento/${eqPre.id}` }
      : null;
    hechos.push({
      at: c.creado_en, ico: "💬", clase: "com",
      txt: donde ? `Comentó en «${String(donde.t || "").slice(0, 60)}»` : "Comentó",
      /* El texto del comentario es LO QUE HIZO: sin él la fila dice que hubo
         actividad y no cuál. Recortado, que esto es un resumen del día. */
      sub: (c.cuerpo || "") === "📷" ? "(una foto)" : String(c.cuerpo || "").replace(/\s+/g, " ").slice(0, 90),
      href: donde?.h || null,
    });
  });

  /* ── DE QUÉ COSA HABLA CADA EVENTO ──
     «Cambió el cartel · en un equipo» once veces seguidas no dice nada: son
     once equipos distintos y la fila no nombraba ninguno. El tipo de entidad
     no es el detalle; el detalle es CUÁL.
     `actividad` guarda entidad_tipo + entidad_id, así que el nombre hay que
     ir a buscarlo. Una consulta por TABLA —no por evento—: ciento treinta
     eventos de un día caen en tres o cuatro tablas.
     `tipoCanonico` porque el trigger de la base escribe el nombre físico en
     plural («equipamiento», «publicaciones») y las acciones a mano el
     singular: sin reconciliar, la mitad de las filas se quedaría sin nombre
     según quién las escribió. */
  const TABLA_ENT: Record<string, [string, string]> = {
    equipamiento: ["equipamiento", "id,folio,nombre"],
    publicacion: ["publicaciones", "id,titulo"],
    persona: ["personas", "id,nombre,alias"],
    empresa: ["empresas", "id,nombre"],
    proyecto: ["proyectos", "id,nombre"],
    postulacion: ["postulaciones", "id,codigo"],
    convocatoria: ["convocatorias", "id,codigo,nombre"],
    objeto: ["objetos", "id,titulo"],
    compra: ["compras", "id,codigo,nombre"],
    lugar: ["lugares", "id,nombre"],
  };
  const nombraFila = (t: string, r: any) =>
    t === "equipamiento" ? `${r.folio ? r.folio + " " : ""}${r.nombre}`
    : t === "persona" ? (r.alias || r.nombre)
    : t === "convocatoria" ? `${r.codigo || ""} ${r.nombre || ""}`.trim()
    : t === "compra" ? `${r.codigo || ""} ${r.nombre || ""}`.trim()
    : (r.titulo || r.nombre || r.codigo || "");
  const nombreEnt = new Map<string, string>();
  {
    const porTipo = new Map<string, Set<string>>();
    (acts.data || []).forEach((a: any) => {
      const t = tipoCanonico(String(a.entidad_tipo || ""));
      if (!TABLA_ENT[t]) return;
      if (!porTipo.has(t)) porTipo.set(t, new Set());
      porTipo.get(t)!.add(a.entidad_id);
    });
    await Promise.all([...porTipo.entries()].map(async ([t, ids]) => {
      const [tabla, cols] = TABLA_ENT[t];
      const { data } = await supabase.from(tabla).select(cols).in("id", [...ids]);
      (data || []).forEach((r: any) => nombreEnt.set(`${t}:${r.id}`, nombraFila(t, r)));
    }));
  }

  /* CADA EVENTO YA TRAE ESCRITO LO QUE PASÓ. La mayoría de las acciones
     guardan `detalle.mensaje` —«registró un RHE de S/ 450», «corrigió la
     fecha límite»— y es la misma frase que usa el historial de una ficha
     (ver textoEvento). Componerla aquí a partir de `tipo` + `entidad_tipo`
     producía «dato equipamiento» y «creacion compra»: dos palabras que no
     son una frase y que además ya estaban dichas mejor en la fila de al
     lado. Se usa el mensaje; el tipo solo cuando no hay ninguno. */
  const ACT: Record<string, string> = {
    creado: "creó una ficha", estado: "cambió un estado", asignacion: "asignó un responsable",
    archivo: "archivó algo", prioridad: "cambió una prioridad", tarea: "marcó una tarea",
    vinculo: "vinculó algo", relacion: "relacionó algo", cierre: "cerró algo",
    edicion: "editó una ficha", editado: "editó una ficha", dato: "cambió un dato",
  };
  const ENT: Record<string, string> = {
    publicacion: "un caso", equipamiento: "un equipo", persona: "una persona",
    empresa: "una empresa", proyecto: "un proyecto", postulacion: "una postulación",
    convocatoria: "una convocatoria", objeto: "el repositorio", compra: "una compra",
  };
  (acts.data || []).forEach((a: any) => {
    const t = tipoCanonico(String(a.entidad_tipo || ""));
    const msg = (a.detalle?.mensaje || "").trim();
    const nombre = nombreEnt.get(`${t}:${a.entidad_id}`);
    hechos.push({
      at: a.creado_en, ico: ICO_ENT[t] || "🛠", clase: "cambio",
      /* QUÉ pasó y SOBRE QUÉ, en el mismo renglón: «Cambió el cartel — A-022
         Zhiyun Crane M3». Separados, la segunda línea se leía como una
         categoría y no como la cosa. */
      txt: `${msg ? msg.charAt(0).toUpperCase() + msg.slice(1) : (ACT[a.tipo] || a.tipo)}${nombre ? ` — ${nombre}` : ""}`,
      /* Y si NO se pudo resolver el nombre se dice el tipo, que es lo único
         que se sabe. Callarlo dejaría la fila afirmando menos de lo que
         consta. */
      sub: nombre ? null : `en ${ENT[t] || t}`,
      href: t === "publicacion" ? `/caso/${a.entidad_id}`
        : t === "objeto" ? `/objeto/${a.entidad_id}`
        : t === "compra" ? `/compras`
        : TABLA_ENT[t] ? `/entidad/${t}/${a.entidad_id}` : null,
    });
  });

  /* -- LOS EQUIPOS, EN TANDAS --
     Veintidos equipos entregados de una sentada son VEINTIDOS filas que dicen
     la misma cosa y llenan la ventana entera; el resto del dia queda debajo
     del scroll. Y son UNA sola accion: se hizo en la pantalla de entrega en
     lote, de un clic.
     Se agrupan por lo que las hace una tanda -el mismo acto, el mismo instante
     en que se registro, la misma persona y el mismo proyecto- y no por «son
     del mismo dia»: dos entregas distintas del martes no son una.
     A partir de TRES. Con dos, plegar esconde tanto como enseña. */
  const enTandas = (
    filas: any[],
    ico: (p: any) => string,
    verbo: (p: any) => string,
    coleta: (p: any) => string | null,
  ) => {
    const grupos = new Map<string, { p: any; eqs: any[] }>();
    filas.forEach((p: any) => {
      const eq = u1(p.equipo);
      const k = [verbo(p), coleta(p) || "", p.creado_en || ""].join("|");
      const g = grupos.get(k) || { p, eqs: [] };
      g.eqs.push(eq); grupos.set(k, g);
    });
    grupos.forEach(({ p, eqs }) => {
      /* `creado_en` es CUANDO SE ANOTO; `desde` es el dia en que el equipo
         sale, sin hora. Con la migracion corrida, la tanda entra en la barra
         del dia a su hora real en vez de caer en «sin hora». */
      const at = p.creado_en || null;
      if (eqs.length < 3) {
        eqs.forEach((eq: any) => hechos.push({
          at, ico: ico(p), clase: "equipo",
          txt: `${verbo(p)} ${eq?.folio || ""} ${eq?.nombre || "un equipo"}`.trim(),
          sub: coleta(p),
          href: eq ? `/entidad/equipamiento/${eq.id}` : null,
        }));
        return;
      }
      hechos.push({
        at, ico: ico(p), clase: "equipo",
        txt: `${verbo(p)} ${eqs.length} equipos`,
        sub: coleta(p),
        /* La lista completa viaja plegada: quien abre la tanda quiere ver QUE
           veintidos, no que se lo resuman otra vez. */
        lista: eqs.map((eq: any) => `${eq?.folio || ""} ${eq?.nombre || ""}`.trim()).filter(Boolean),
        href: null,
      });
    });
  };

  const nombreProy = (p: any) => u1(p.proy)?.nombre || null;
  enTandas(presDio.data || [],
    (p) => (p.tipo === "asignacion" ? "📌" : "🤝"),
    (p) => (p.tipo === "asignacion" ? "Asignó" : "Entregó"),
    (p) => {
      const a = u1(p.persona), pr = nombreProy(p);
      return [a ? `a ${a.alias || a.nombre}` : null, pr].filter(Boolean).join(" · ") || null;
    });
  enTandas(presRecibio.data || [],
    (p) => (p.tipo === "asignacion" ? "📌" : "📥"),
    (p) => (p.tipo === "asignacion" ? "Quedó a su cargo" : "Recibió"),
    /* PARA QUE salieron. El prestamo lo sabe y la ventana no lo decia, y es
       justo el contexto de trabajo que se viene a buscar aqui. */
    (p) => (nombreProy(p) ? `para ${nombreProy(p)}` : null));
  enTandas(presDevolvio.data || [],
    () => "↩", () => "Devolvió",
    (p) => (nombreProy(p) ? `de ${nombreProy(p)}` : null));
  (rhes.data || []).forEach((r: any) => hechos.push({
    at: null, ico: "🧾", clase: "rhe",
    txt: `RHE ${r.numero || ""} · S/ ${Math.round(Number(r.monto) || 0).toLocaleString("es-PE")}`.trim(),
    sub: r.concepto || null,
  }));

  /* POR TIEMPO REAL, no por texto. Los instantes vienen de la base en UTC
     («…T14:16:00Z») y los que se armaban aquí llevaban el offset de Lima
     («…T12:00:00-05:00»): comparados como cadenas, «12» va antes que «14» y
     los equipos aparecían al principio de la mañana. Dos formatos de la misma
     cosa ordenados como texto dan un orden que parece bueno y no lo es.
     Lo que no tiene hora va al final: no es que ocurriera al final del día, es
     que no se sabe cuándo, y esa es la única posición que no lo afirma. */
  hechos.sort((a, b) =>
    (a.at ? new Date(a.at).getTime() : Infinity) - (b.at ? new Date(b.at).getTime() : Infinity));
  return { hechos, quien: per.alias || per.nombre };
}

/* ── Ciclo de pago: confirmación (persona) y liquidación (admin) → recibo ── */
// Estado de liquidación del mes al que pertenece una fecha (para bloquear).
async function estadoDelMes(supabase: any, personaId: string, fechaISO: string): Promise<string | null> {
  const [y, m] = (fechaISO || "").split("-");
  if (!y || !m) return null;
  const { data } = await supabase.from("liquidaciones").select("estado")
    .eq("persona_id", personaId).eq("anio", Number(y)).eq("mes", Number(m)).maybeSingle();
  return (data as any)?.estado || null;
}

export async function confirmarMiMes(anio: number, mes: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: yo } = await supabase.from("personas").select("id").eq("usuario_id", user.id).maybeSingle();
  if (!yo) return { error: "Tu cuenta no está enlazada a una persona." };
  const { data: ex } = await supabase.from("liquidaciones").select("estado")
    .eq("persona_id", yo.id).eq("anio", anio).eq("mes", mes).maybeSingle();
  if (ex?.estado === "liquidado") return { error: "Este mes ya está liquidado." };
  const { error } = await supabase.from("liquidaciones").upsert({
    persona_id: yo.id, anio, mes, estado: "confirmado",
    confirmado_en: new Date().toISOString(), confirmado_por: user.id,
  }, { onConflict: "persona_id,anio,mes" });
  if (error) return { error: error.message };
  revalidatePath("/jornadas"); revalidatePath("/admin");
  return {};
}

export async function reabrirMiMes(anio: number, mes: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: yo } = await supabase.from("personas").select("id").eq("usuario_id", user.id).maybeSingle();
  if (!yo) return { error: "Tu cuenta no está enlazada a una persona." };
  const { data: ex } = await supabase.from("liquidaciones").select("estado")
    .eq("persona_id", yo.id).eq("anio", anio).eq("mes", mes).maybeSingle();
  if (ex?.estado === "liquidado") return { error: "Este mes ya está liquidado; pide al administrador que lo reabra." };
  await supabase.from("liquidaciones").delete().eq("persona_id", yo.id).eq("anio", anio).eq("mes", mes);
  revalidatePath("/jornadas"); revalidatePath("/admin");
  return {};
}

export async function liquidarMes(personaId: string, anio: number, mes: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo un administrador puede liquidar." };
  const pd = (n: number) => String(n).padStart(2, "0");
  const inicio = `${anio}-${pd(mes)}-01`;
  const fin = `${mes === 12 ? anio + 1 : anio}-${pd(mes === 12 ? 1 : mes + 1)}-01`;
  const { data: js } = await supabase.from("jornadas").select("fraccion,monto,aprobada")
    .eq("persona_id", personaId).gte("fecha", inicio).lt("fecha", fin);
  if (!js || !js.length) return { error: "No hay jornadas para liquidar en ese mes." };
  const pend = js.filter((j: any) => !j.aprobada).length;
  if (pend > 0) return { error: `Faltan ${pend} jornada${pend === 1 ? "" : "s"} por aprobar antes de liquidar.` };
  const totalJornadas = js.reduce((s: number, j: any) => s + Number(j.fraccion || 0), 0);
  const totalMonto = js.reduce((s: number, j: any) => s + Number(j.monto || 0), 0);
  const { error } = await supabase.from("liquidaciones").upsert({
    persona_id: personaId, anio, mes, estado: "liquidado",
    total_jornadas: totalJornadas, total_monto: totalMonto,
    liquidado_en: new Date().toISOString(), liquidado_por: user.id,
  }, { onConflict: "persona_id,anio,mes" });
  if (error) return { error: error.message };
  revalidatePath("/admin"); revalidatePath("/jornadas");
  return { ok: true };
}

export async function reabrirLiquidacion(personaId: string, anio: number, mes: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo un administrador puede reabrir." };
  await supabase.from("liquidaciones").delete().eq("persona_id", personaId).eq("anio", anio).eq("mes", mes);
  revalidatePath("/admin"); revalidatePath("/jornadas");
  return {};
}

export async function editarTarifa(
  personaId: string, tarifaDia: number | null, tarifaRodaje: number | null, tarifaNoche: number | null = null
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("personas")
    .update({ tarifa_dia: tarifaDia, tarifa_rodaje: tarifaRodaje, tarifa_noche: tarifaNoche }).eq("id", personaId);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/jornadas");
  return {};
}

/* --- Recibos por honorarios girados ---
   Los registra administración. Sirven para vigilar el tope de 4ta: si la
   persona lo supera, su suspensión se rompe y hay que retenerle el 8%
   por el resto del año. Como le manejamos la clave SOL, nadie más se
   va a dar cuenta. */
export async function guardarRhe(f: {
  id?: string | null; personaId: string; numero: string; fecha: string;
  monto: string; retencion: string; concepto: string; proyectoId: string; url: string;
  /* Los dos ejes del gasto (opcionales: un RHE puede no ser de un fondo). Si
     se cargan al momento, el control de presupuesto y el informe económico
     salen los dos, gratis; si no, se reconstruyen de memoria dos años después. */
  postulacionId?: string; actividadId?: string; rubroItem?: string; etapa?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración registra los RHE." };

  if (!f.personaId) return { error: "Elige a quién se le giró." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return { error: "Fecha inválida." };
  const num = (s: string) => parseFloat(String(s).replace(/[^\d.]/g, "")) || 0;
  const monto = num(f.monto);
  if (monto <= 0) return { error: "El monto debe ser mayor que cero." };
  if (f.url && !/^https?:\/\/\S+$/.test(f.url.trim())) return { error: "El PDF debe ser un link completo." };

  const fila = {
    persona_id: f.personaId,
    numero: f.numero.trim() || null,
    fecha: f.fecha,
    monto,
    retencion: num(f.retencion),
    concepto: f.concepto.trim() || null,
    proyecto_id: f.proyectoId || null,
    url: f.url.trim() || null,
    // undefined = no tocar (para no pisar los ejes al editar desde otra pantalla)
    ...(f.postulacionId !== undefined ? { postulacion_id: f.postulacionId || null } : {}),
    ...(f.actividadId !== undefined ? { actividad_id: f.actividadId || null } : {}),
    ...(f.rubroItem !== undefined ? { rubro_item: f.rubroItem || null } : {}),
    ...(f.etapa !== undefined ? { etapa: f.etapa || null } : {}),
  };
  const { error } = f.id
    ? await supabase.from("rhe").update(fila).eq("id", f.id)
    : await supabase.from("rhe").insert({ ...fila, creado_por: user.id });
  if (error) return { error: error.message };

  await supabase.from("actividad").insert({
    entidad_tipo: "persona", entidad_id: f.personaId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `${f.id ? "corrigió" : "registró"} un RHE de S/ ${monto.toLocaleString("es-PE")}${fila.numero ? ` (${fila.numero})` : ""}` },
  });
  revalidatePath("/admin");
  revalidatePath(`/entidad/persona/${f.personaId}`);
  if (f.postulacionId) revalidatePath(`/entidad/postulacion/${f.postulacionId}`);
  return {};
}

/* Fijar los ejes de un RHE ya girado (fondo · actividad · rubro), sin tocar
   monto ni persona. Es la puerta desde la vista del fondo: se registra el
   pago en admin y aquí se le dice a qué actividad y rubro pertenece. */
export async function fijarEjesRhe(id: string, ejes: {
  postulacionId?: string | null; actividadId?: string | null; rubroItem?: string | null; etapa?: string | null;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración edita los RHE." };
  const patch: any = {};
  if (ejes.postulacionId !== undefined) patch.postulacion_id = ejes.postulacionId || null;
  if (ejes.actividadId !== undefined) patch.actividad_id = ejes.actividadId || null;
  if (ejes.rubroItem !== undefined) patch.rubro_item = ejes.rubroItem || null;
  if (ejes.etapa !== undefined) patch.etapa = ejes.etapa || null;
  if (!Object.keys(patch).length) return {};
  const { error } = await supabase.from("rhe").update(patch).eq("id", id);
  if (error) return { error: error.message };
  if (ejes.postulacionId) {
    revalidatePath(`/entidad/postulacion/${ejes.postulacionId}`);
    revalidatePath(`/fondo/${ejes.postulacionId}`);
  }
  return {};
}

/* Fijar los ejes a VARIOS RHE de golpe (los de una persona, por lo general).
   La mayoría de los RHE de una misma persona van a la misma actividad y rubro,
   así que asignarlos en lote ahorra decenas de clics. */
export async function fijarEjesRheLote(ids: string[], ejes: {
  actividadId?: string | null; rubroItem?: string | null; etapa?: string | null;
}, postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración edita los RHE." };
  const limpios = (Array.isArray(ids) ? ids : []).filter(x => typeof x === "string");
  if (!limpios.length) return {};
  const patch: any = {};
  if (ejes.actividadId !== undefined) patch.actividad_id = ejes.actividadId || null;
  if (ejes.rubroItem !== undefined) patch.rubro_item = ejes.rubroItem || null;
  if (ejes.etapa !== undefined) patch.etapa = ejes.etapa || null;
  if (!Object.keys(patch).length) return {};
  const { error } = await supabase.from("rhe").update(patch).in("id", limpios);
  if (error) return { error: error.message };
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

/* ── Estados de cuenta del banco (uno por mes, por fondo) ──
   El estado emitido por el banco: PDF + saldo al cierre + intereses. Es
   referencia para la rendición, no contabilidad línea a línea. Solo
   administración los carga, como los RHE. */
export async function guardarEstadoCuenta(f: {
  id?: string | null; postulacionId: string; periodo: string;
  url: string; saldo: string; intereses: string; nota: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración carga los estados de cuenta." };
  if (!f.postulacionId) return { error: "Falta el fondo." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.periodo)) return { error: "Elige el mes que cubre." };
  if (f.url && !/^https?:\/\/\S+$/.test(f.url.trim())) return { error: "El PDF debe ser un link completo." };
  const num = (s: string) => { const t = String(s).replace(/[^\d.-]/g, ""); return t === "" ? null : parseFloat(t); };
  // El periodo se normaliza al primer día del mes: un estado por fondo y mes.
  const periodo = f.periodo.slice(0, 8) + "01";
  const fila = {
    postulacion_id: f.postulacionId,
    periodo,
    url: f.url.trim() || null,
    saldo: num(f.saldo),
    intereses: num(f.intereses) ?? 0,
    nota: f.nota.trim() || null,
  };
  const { error } = f.id
    ? await supabase.from("estado_cuenta").update(fila).eq("id", f.id)
    : await supabase.from("estado_cuenta").insert({ ...fila, creado_por: user.id });
  if (error) {
    if (/duplicate|unique/i.test(error.message))
      return { error: "Ya hay un estado de cuenta para ese mes en este fondo." };
    return { error: error.message };
  }
  revalidatePath(`/entidad/postulacion/${f.postulacionId}`);
  return {};
}

/* Guardar los escaneos/fotos del comprobante de un mes. Las imágenes ya se
   subieron al Storage (subirImagen) del lado del cliente; aquí solo se guarda
   la lista de URLs. */
export async function imagenesEstadoCuenta(id: string, imagenes: string[], postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración adjunta comprobantes." };
  const limpio = (Array.isArray(imagenes) ? imagenes : [])
    .filter(u => typeof u === "string" && /^https?:\/\/\S+$/.test(u)).slice(0, 12);
  /* Registra quién y cuándo tocó el comprobante. Si se quitan todos, se
     limpia el sello: ya no hay comprobante que atribuir. */
  const sello = limpio.length
    ? { comprobante_en: new Date().toISOString(), comprobante_por: user.id }
    : { comprobante_en: null, comprobante_por: null };
  const { error } = await supabase.from("estado_cuenta").update({ imagenes: limpio, ...sello }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

export async function borrarEstadoCuenta(id: string, postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración puede borrar estados de cuenta." };
  const { error } = await supabase.from("estado_cuenta").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

/* ── Movimientos del banco (el libro línea a línea) ──
   Cada línea del estado de cuenta, con su categoría (desembolso / retiro /
   comisión / interés / otro). Solo administración escribe. */
const CAT_MOV = ["desembolso", "retiro", "comision", "interes", "otro"];
export async function guardarMovimiento(f: {
  id?: string | null; postulacionId: string; fecha: string; glosa: string;
  medio: string; tipo: string; monto: string; saldo: string; categoria: string; nota: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración registra los movimientos." };
  if (!f.postulacionId) return { error: "Falta el fondo." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return { error: "Fecha inválida." };
  if (!f.glosa.trim()) return { error: "Pon la glosa del movimiento." };
  const num = (s: string) => { const t = String(s).replace(/[^\d.-]/g, ""); return t === "" ? null : parseFloat(t); };
  const monto = num(f.monto);
  if (monto === null || monto <= 0) return { error: "El monto debe ser mayor que cero (el signo lo da abono/cargo)." };
  const tipo = f.tipo === "abono" ? "abono" : "cargo";
  const categoria = CAT_MOV.includes(f.categoria) ? f.categoria : "otro";
  const fila = {
    postulacion_id: f.postulacionId, fecha: f.fecha, glosa: f.glosa.trim(),
    medio: f.medio.trim() || null, tipo, monto, saldo: num(f.saldo),
    categoria, nota: f.nota.trim() || null,
  };
  const { error } = f.id
    ? await supabase.from("movimiento_banco").update(fila).eq("id", f.id)
    : await supabase.from("movimiento_banco").insert({ ...fila, creado_por: user.id });
  if (error) {
    if (/duplicate|unique/i.test(error.message))
      return { error: "Ese movimiento (misma fecha, glosa y monto) ya está cargado." };
    return { error: error.message };
  }
  revalidatePath(`/fondo/${f.postulacionId}`);
  return {};
}

export async function borrarMovimiento(id: string, postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración puede borrar movimientos." };
  const { error } = await supabase.from("movimiento_banco").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

export async function borrarRhe(id: string, personaId: string, postulacionId?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración puede borrar RHE." };
  const { data: prev } = await supabase.from("rhe").select("monto,numero").eq("id", id).maybeSingle();
  const { error } = await supabase.from("rhe").delete().eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: "persona", entidad_id: personaId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `borró el RHE${prev?.numero ? ` ${prev.numero}` : ""} de S/ ${Number(prev?.monto || 0).toLocaleString("es-PE")}` },
  });
  revalidatePath("/admin");
  revalidatePath(`/entidad/persona/${personaId}`);
  if (postulacionId) revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

/* Mi banco de trabajo: los casos que tengo EN PROGRESO. Ese estado ya
   significa "estoy trabajando en esto", así que no hace falta inventar
   otra marca: se llenan y se vacían solos al mover el estado. */
const TABLA_VINC: Record<string, [string, string]> = {
  proyecto: ["proyectos", "nombre"], empresa: ["empresas", "nombre"],
  persona: ["personas", "alias"], postulacion: ["postulaciones", "codigo"],
  convocatoria: ["convocatorias", "codigo"], etiqueta: ["etiquetas", "nombre"],
};
// Las entidades primero y las etiquetas al final: la etiqueta matiza, el
// proyecto ubica. Si hay que recortar, se recorta lo que matiza.
const ORDEN_CTX = ["proyecto", "postulacion", "convocatoria", "empresa", "persona", "etiqueta"];

export async function misEnProgreso() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* Solo lo que YO soy responsable. Antes entraba también lo que yo había
     creado, y eso llenaba el banco de trabajo ajeno: un caso que abrí y
     asigné a Katy es de Katy, no mío. */
  const { data, error } = await supabase.from("publicaciones")
    .select("id,tipo,titulo,estado,fecha_limite,creado_en,autor_id,comentarios(count),autor:perfiles!publicaciones_autor_id_fkey(nombre),vinculos:publicacion_vinculos(entidad_tipo,entidad_id)")
    .in("estado", ["abierta", "en_progreso", "seguimiento"])
    .eq("responsable", user.id)
    // Un aviso archivado se queda 'abierta' y con responsable: sin esto,
    // seguiría en el banco de trabajo de esa persona para siempre.
    .is("archivado_en", null)
    // Lo más nuevo arriba: lo recién llegado es lo que aún no tiene lugar en
    // tu cabeza. Lo viejo baja, pero su plazo sigue avisando en rojo.
    .order("creado_en", { ascending: false })
    .limit(40);
  if (error) return { error: error.message };

  // Resolver los vínculos a nombres: sin eso, "Girar RHE" no dice de quién
  const ids: Record<string, Set<string>> = {};
  (data || []).forEach((p: any) => (p.vinculos || []).forEach((v: any) => {
    if (!TABLA_VINC[v.entidad_tipo]) return;
    (ids[v.entidad_tipo] ||= new Set()).add(v.entidad_id);
  }));
  const nombre = new Map<string, string>();
  await Promise.all(Object.entries(ids).map(async ([tipo, set]) => {
    const [tabla, campo] = TABLA_VINC[tipo];
    const sel = tipo === "persona" ? "id,alias,nombre" : `id,${campo}`;
    const { data: rows } = await supabase.from(tabla).select(sel).in("id", [...set]);
    (rows || []).forEach((r: any) =>
      nombre.set(`${tipo}:${r.id}`, r[campo] || r.nombre || "—"));
  }));

  const arma = (p: any) => ({
    id: p.id, tipo: p.tipo, titulo: p.titulo, estado: p.estado,
    fecha_limite: p.fecha_limite,
    // Quién lo pidió: solo importa cuando no fui yo
    pidio: p.autor_id && p.autor_id !== user.id ? (p.autor?.nombre || "").split(" ")[0] : null,
    nComs: p.comentarios?.[0]?.count || 0,
    ctx: (p.vinculos || [])
      .map((v: any) => ({ tipo: v.entidad_tipo, id: v.entidad_id, nombre: nombre.get(`${v.entidad_tipo}:${v.entidad_id}`) }))
      .filter((v: any) => v.nombre)
      .sort((a: any, b: any) => ORDEN_CTX.indexOf(a.tipo) - ORDEN_CTX.indexOf(b.tipo))
      .slice(0, 4),
  });

  return {
    casos: (data || []).filter((p: any) => p.estado === "en_progreso").map(arma),
    abiertas: (data || []).filter((p: any) => p.estado === "abierta").map(arma),
    // Seguimiento: casos largos que no se cierran hoy pero no hay que perder de vista
    seguimiento: (data || []).filter((p: any) => p.estado === "seguimiento").map(arma),
  };
}

/* Destacar un caso en la cabecera del feed. Solo administración.
   El destacado caduca solo: muere con la fecha límite del caso, o a las
   2 semanas si no tiene. Así la zona nunca acumula cosas vencidas. */
export async function destacarCaso(pubId: string, on: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración puede destacar casos." };

  let hasta: string | null = null;
  if (on) {
    const { data: pub } = await supabase.from("publicaciones")
      .select("fecha_limite").eq("id", pubId).maybeSingle();
    const lim = pub?.fecha_limite ? new Date(pub.fecha_limite + "T23:59:59") : null;
    const dosSem = new Date(Date.now() + 14 * 86400000);
    hasta = (lim && lim.getTime() > Date.now() ? lim : dosSem).toISOString();
  }
  const { error } = await supabase.from("publicaciones")
    .update({ destacado_hasta: hasta }).eq("id", pubId);
  if (error) return { error: error.message };

  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion", entidad_id: pubId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: on ? "destacó el caso en el feed" : "quitó el caso de destacados" },
  });
  revalidatePath("/"); revalidatePath(`/caso/${pubId}`);
  return { hasta };
}

/* Foto de la persona (pasar null la quita) */
export async function guardarFotoPersona(personaId: string, url: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("personas")
    .update({ foto_url: url || null }).eq("id", personaId);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: "persona", entidad_id: personaId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: url ? "cambió la foto" : "quitó la foto" },
  });
  revalidatePath(`/entidad/persona/${personaId}`);
  return {};
}

/* --- Imágenes de una entidad: portada (banner) + cartel (póster) ---
   Sirve a cualquier tipo (proyecto, empresa, convocatoria…) desde la tabla
   polimórfica `entidad_media`. Una fila por entidad; se hace UPSERT del campo
   que cambió, sin pisar el otro. `url=null` la quita. */
export async function guardarImagenEntidad(
  tipo: string, id: string, campo: "portada" | "cartel", url: string | null
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const col = campo === "portada" ? "portada_url" : "cartel_url";
  const { error } = await supabase.from("entidad_media").upsert(
    { entidad_tipo: tipo, entidad_id: id, [col]: url || null, actualizado: new Date().toISOString() },
    { onConflict: "entidad_tipo,entidad_id" }
  );
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: tipo, entidad_id: id, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: url ? `cambió ${campo === "portada" ? "la portada" : "el cartel"}` : `quitó ${campo === "portada" ? "la portada" : "el cartel"}` },
  });
  revalidatePath(`/entidad/${tipo}/${id}`);
  return {};
}

/* --- CVs por enfoque: uno por rol al que postula la persona --- */
export async function guardarCv(personaId: string, enfoque: string, url: string, id?: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const enf = enfoque.trim(), u = url.trim();
  if (!enf) return { error: "Elige el enfoque del CV." };
  if (!/^https?:\/\/\S+$/.test(u)) return { error: "El CV debe ser un link completo (https://...)." };

  /* Los CVs viven en `objetos` (tipo='cv', titulo=enfoque) desde que el
     repositorio generalizó `persona_cv`. La sección de CVs de la ficha sigue
     aparte porque el enfoque tiene lógica propia —se cruza con el cargo de
     cada postulación—, pero el dato es un objeto más. */
  const hoy = hoyLima();
  if (id) {
    /* Acotado a ESTA persona y a tipo='cv'. `objetos` es una tabla compartida
       por todas las entidades: un id equivocado —o forjado, esto es una server
       action pública— pisaría el título y la url de la obra de otra ficha. */
    const { data: prev } = await supabase.from("objetos").select("titulo,url").eq("id", id).maybeSingle();
    const { error } = await supabase.from("objetos")
      .update({ titulo: enf, url: u, actualizado: hoy })
      .eq("id", id).eq("entidad_tipo", "persona").eq("entidad_id", personaId).eq("tipo", "cv");
    if (error) {
      return { error: error.code === "23505" ? `Ya existe un CV con enfoque «${enf}».` : error.message };
    }
    await supabase.from("actividad").insert({
      entidad_tipo: "persona", entidad_id: personaId, actor_id: user.id, tipo: "dato",
      detalle: {
        mensaje: `actualizó el CV de ${enf}`,
        ...(prev?.url !== u ? { cambios: [{ campo: `CV ${enf}`, de: "link anterior", a: "link nuevo" }] } : {}),
      },
    });
  } else {
    const { error } = await supabase.from("objetos").insert({
      entidad_tipo: "persona", entidad_id: personaId, tipo: "cv",
      titulo: enf, url: u, actualizado: hoy, creado_por: user.id,
    });
    if (error) {
      return { error: error.code === "23505" ? `Ya existe un CV con enfoque «${enf}».` : error.message };
    }
    await supabase.from("actividad").insert({
      entidad_tipo: "persona", entidad_id: personaId, actor_id: user.id, tipo: "dato",
      detalle: { mensaje: `agregó el CV de ${enf}` },
    });
  }
  revalidatePath(`/entidad/persona/${personaId}`);
  return {};
}

/* ===== REPOSITORIO — la cola infinita de una entidad =====
   Obras, investigaciones, prensa, premios, redes, notas. No son campos de un
   formulario: son una colección abierta. El archivo vive en Drive; aquí vive
   lo que se sabe de él, y por eso `url` puede ir vacía (una nota no tiene). */
export async function guardarObjeto(a: {
  id?: string | null;
  entidadTipo: string; entidadId: string;
  tipo: string; titulo: string; url?: string; fecha?: string; notas?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const titulo = (a.titulo || "").trim();
  const url = (a.url || "").trim();
  const notas = (a.notas || "").trim();
  const fecha = (a.fecha || "").trim();
  if (!titulo) return { error: "Ponle un título." };
  /* La lista de tipos es CERRADA a propósito (lib/objetos): si cada quien
     inventa el suyo, el filtro deja de servir. El cliente ya solo ofrece los
     válidos, pero esto es una acción de servidor. `cv` se excluye aquí a
     propósito: tiene su propia puerta (`guardarCv`), que sabe del enfoque. */
  if (!TIPOS_OBJETO.some(t => t.key === a.tipo)) return { error: "Ese tipo de objeto no existe." };
  /* EL DUEÑO TIENE QUE EXISTIR DE VERDAD. `objetos` guarda el dueño como
     (texto, uuid) sin clave foránea —es polimórfico—, así que nadie más lo
     comprueba: un tipo inventado crea un objeto huérfano que sale en
     /repositorio con dueño «—» y no aparece en ninguna ficha. Y un id que no
     sea uuid revienta en Postgres con un 22P02 que el humano no entiende.
     Ahora que se puede crear desde la página global, la entidad la elige el
     formulario y no la ruta: conviene comprobarla aquí. */
  const dueno = SECCIONES.find(s => s.tipo === a.entidadTipo && s.tipo !== "objeto");
  if (!dueno) return { error: "Elige de quién es el objeto." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.entidadId || ""))
    return { error: "No se reconoce a quién pertenece." };
  // Y que exista: un uuid con forma válida pero inventado creaba un objeto
  // sin ficha donde aparecer.
  if (!a.id && !await existeEntidad(supabase, a.entidadTipo, a.entidadId))
    return { error: "Esa ficha no existe." };
  /* El link es OBLIGATORIO: un objeto del repositorio es la referencia a algo
     que existe en alguna parte. Sin link no hay objeto que referenciar, solo
     un título suelto. La única excepción es la nota, que es texto por
     definición. */
  if (!url && a.tipo !== "nota")
    return { error: "Falta el link. Solo una 🗒 Nota puede ir sin link." };
  if (url && !/^https?:\/\/\S+$/.test(url))
    return { error: "El link debe empezar en http:// o https://" };
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida." };

  const fila = {
    tipo: a.tipo, titulo, url: url || null,
    fecha: fecha || null, notas: notas || null,
    actualizado: hoyLima(),
  };
  const nuevo = !a.id;
  // El update se acota a la entidad dueña: la tabla es compartida y un id
  // suelto podría pisar el objeto de otra ficha.
  const { data: fil, error } = nuevo
    ? await supabase.from("objetos").insert({
        ...fila, entidad_tipo: a.entidadTipo, entidad_id: a.entidadId, creado_por: user.id })
        .select("id").single()
    : await supabase.from("objetos").update(fila)
        .eq("id", a.id).eq("entidad_tipo", a.entidadTipo).eq("entidad_id", a.entidadId)
        .select("id").single();
  if (error) {
    return { error: error.code === "23505" ? "Ya existe un objeto igual." : error.message };
  }
  const objId = fil?.id || a.id;

  /* DOS bitácoras, y no es duplicación: son dos preguntas distintas.
     · En la ficha del dueño: «qué pasó con esta persona» → que se le agregó
       algo al repositorio. Solo el hito de alta, no cada retoque.
     · En el objeto: «qué pasó con este libro» → su propia vida, edición a
       edición. Sin esto su página no tenía historial nunca. */
  if (nuevo) {
    await supabase.from("actividad").insert({
      entidad_tipo: a.entidadTipo, entidad_id: a.entidadId, actor_id: user.id, tipo: "dato",
      detalle: { mensaje: `agregó al repositorio: ${titulo}` },
    });
  }
  if (objId) {
    await supabase.from("actividad").insert({
      entidad_tipo: "objeto", entidad_id: objId, actor_id: user.id, tipo: nuevo ? "creado" : "editado",
      detalle: { mensaje: nuevo ? `lo agregó al repositorio` : `actualizó «${titulo}»` },
    });
    revalidatePath(`/objeto/${objId}`);
  }
  revalidatePath(`/entidad/${a.entidadTipo}/${a.entidadId}`);
  return {};
}

/* ¿La ficha dueña EXISTE? Validar el tipo y el formato del uuid no basta: son
   acciones de servidor y `objetos` no tiene clave foránea al dueño (es
   polimórfico), así que un uuid inventado creaba un objeto que sale en
   /repositorio con dueño «—» y no aparece en ninguna ficha. */
async function existeEntidad(supabase: any, tipo: string, id: string) {
  const s = SECCIONES.find(x => x.tipo === tipo && x.tipo !== "objeto");
  if (!s) return false;
  const { data } = await supabase.from(s.tabla).select("id").eq("id", id).maybeSingle();
  return !!data;
}

/* CAMBIARLE EL DUEÑO A UN OBJETO.

   Se guardó la entrevista al maestro Faure colgando de Wilfredo, que fue quien
   la trajo. Traer algo y ser su protagonista no es lo mismo, y hasta ahora no
   había forma de corregirlo salvo borrar y volver a crear —perdiendo el
   historial, los comentarios y los vínculos—.

   Es un movimiento, no una edición: se anota en la bitácora de las dos fichas
   (de dónde salió, a dónde entró) y en la del propio objeto. Un dato que
   cambia de dueño sin dejar rastro es un dato que aparece «de la nada» en una
   ficha y nadie sabe por qué. */
export async function moverObjeto(id: string, entidadTipo: string, entidadId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const dueno = SECCIONES.find(s => s.tipo === entidadTipo && s.tipo !== "objeto");
  if (!dueno) return { error: "Ese tipo de ficha no puede tener repositorio." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entidadId || ""))
    return { error: "No se reconoce la ficha de destino." };

  const { data: o } = await supabase.from("objetos")
    .select("titulo,tipo,entidad_tipo,entidad_id").eq("id", id).maybeSingle();
  if (!o) return { error: "No se encontró el objeto." };
  if (o.entidad_tipo === entidadTipo && o.entidad_id === entidadId) return {};
  /* Un CV solo tiene sentido colgando de una persona: su sección propia solo
     se dibuja ahí, y el repositorio genérico excluye tipo='cv'. Movido a un
     proyecto se volvía invisible en las dos pantallas. */
  if (o.tipo === "cv" && entidadTipo !== "persona")
    return { error: "Un CV solo puede pertenecer a una persona." };
  if (!await existeEntidad(supabase, entidadTipo, entidadId))
    return { error: "Esa ficha ya no existe." };

  const { error } = await supabase.from("objetos")
    .update({ entidad_tipo: entidadTipo, entidad_id: entidadId }).eq("id", id);
  if (error) {
    // El único choque posible es el índice de CV por enfoque.
    return { error: error.code === "23505" ? "Esa ficha ya tiene un objeto igual." : error.message };
  }

  /* LO QUE VIAJA CON EL OBJETO.
     `link_verificaciones` se guarda contra el DUEÑO —(entidad_tipo, entidad_id,
     campo='objeto:<id>')— porque nació antes que el repositorio. Si no se
     reasigna, pasan tres cosas a la vez: el link vuelve a «sin revisar» aunque
     alguien ya lo revisó, la fila vieja queda pegada a la ficha anterior sin
     pintarse nunca, y al borrar el objeto se limpia con las claves nuevas, así
     que esa fila sobrevive al objeto para siempre. */
  const { data: verifVieja } = await supabase.from("link_verificaciones")
    .select("id").eq("entidad_tipo", o.entidad_tipo).eq("entidad_id", o.entidad_id)
    .eq("campo", `objeto:${id}`).maybeSingle();
  if (verifVieja) {
    /* Si el objeto ya estuvo en la ficha destino puede haber quedado una fila
       con el mismo (entidad, campo) y el unique haría chocar el update. Se
       limpia — pero SOLO si hay una que la reemplace: borrarla cuando el
       origen no tiene ninguna dejaría el link «sin revisar» habiendo sido
       revisado. */
    await supabase.from("link_verificaciones").delete()
      .eq("entidad_tipo", entidadTipo).eq("entidad_id", entidadId).eq("campo", `objeto:${id}`);
    const { error: eVerif } = await supabase.from("link_verificaciones")
      .update({ entidad_tipo: entidadTipo, entidad_id: entidadId }).eq("id", verifVieja.id);
    // Se avisa, no se aborta: el objeto YA se movió, y dejar el error mudo es
    // exactamente lo que este bloque vino a evitar.
    if (eVerif) console.error("moverObjeto · verificación no reasignada:", eVerif.message);
  }

  /* Y si el destino ya estaba VINCULADO al objeto, ese vínculo sobra: sería el
     mismo material saliendo dos veces en la misma ficha —en «Repositorio» y en
     «Del repositorio»— y contándose a sí mismo en 🔗. */
  await supabase.from("objeto_vinculos").delete()
    .eq("objeto_id", id).eq("entidad_tipo", entidadTipo).eq("entidad_id", entidadId);

  await supabase.from("actividad").insert([
    { entidad_tipo: o.entidad_tipo, entidad_id: o.entidad_id, actor_id: user.id, tipo: "dato",
      detalle: { mensaje: `movió «${o.titulo}» a otra ficha` } },
    { entidad_tipo: entidadTipo, entidad_id: entidadId, actor_id: user.id, tipo: "dato",
      detalle: { mensaje: `recibió del repositorio: ${o.titulo}` } },
    { entidad_tipo: "objeto", entidad_id: id, actor_id: user.id, tipo: "editado",
      detalle: { mensaje: `cambió de dueño` } },
  ]);

  revalidatePath(`/objeto/${id}`);
  revalidatePath(`/entidad/${o.entidad_tipo}/${o.entidad_id}`);
  revalidatePath(`/entidad/${entidadTipo}/${entidadId}`);
  revalidatePath("/repositorio");
  return {};
}

export async function borrarObjeto(id: string, entidadTipo: string, entidadId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("objetos").select("titulo").eq("id", id).maybeSingle();
  const { data: fue, error } = await supabase.from("objetos").delete()
    .eq("id", id).eq("entidad_tipo", entidadTipo).eq("entidad_id", entidadId)
    .select("id");
  if (error) return { error: error.message };
  // Sin `.select()` un delete que no toca nada —RLS, claves que no casan—
  // devuelve éxito y la pantalla dice que borró algo que sigue ahí.
  if (!fue?.length) return { error: "No se pudo quitar: no se encontró el objeto en esta ficha." };
  /* Lo que NO cascadea solo. `comentarios`, `notificaciones` y
     `objeto_vinculos` tienen FK con `on delete cascade`; estas dos no, porque
     guardan el dueño de forma polimórfica y no hay FK posible. Sin limpiarlas,
     el caso se queda con un chip a un objeto inexistente. */
  await supabase.from("link_verificaciones").delete()
    .eq("entidad_tipo", entidadTipo).eq("entidad_id", entidadId).eq("campo", `objeto:${id}`);
  await supabase.from("publicacion_vinculos").delete()
    .eq("entidad_tipo", "objeto").eq("entidad_id", id);
  // Su bitácora propia: si no, quedan eventos enlazando a una página que ya
  // no existe.
  await supabase.from("actividad").delete().eq("entidad_tipo", "objeto").eq("entidad_id", id);
  await supabase.from("actividad").insert({
    entidad_tipo: entidadTipo, entidad_id: entidadId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `quitó del repositorio: ${prev?.titulo || "—"}` },
  });
  revalidatePath(`/entidad/${entidadTipo}/${entidadId}`);
  // El listado global también lo mostraba: sin esto seguía apareciendo ahí.
  revalidatePath("/repositorio");
  return {};
}

/* Un objeto tiene UN dueño (donde vive y se edita) y MUCHOS vínculos: el
   «Libro Khipukamaq» es de Jesús y además es la base de «Los Khipus». Mismo
   patrón que un caso — duplicarlo sería tener dos libros. */
export async function vincularObjeto(objetoId: string, entidadTipo: string, entidadId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: ins, error } = await supabase.from("objeto_vinculos").upsert(
    { objeto_id: objetoId, entidad_tipo: entidadTipo, entidad_id: entidadId },
    { onConflict: "objeto_id,entidad_tipo,entidad_id", ignoreDuplicates: true })
    .select("id");
  if (error) return { error: error.message };
  if (ins?.length) {
    const [{ data: o }, nombre] = await Promise.all([
      supabase.from("objetos").select("titulo,entidad_tipo,entidad_id").eq("id", objetoId).single(),
      nombreEntidad(supabase, entidadTipo, entidadId),
    ]);
    // En la ficha vinculada («apareció este libro aquí») y en el objeto
    // («ahora sostiene este proyecto»). Son los dos lados del mismo hecho.
    await supabase.from("actividad").insert([
      {
        entidad_tipo: entidadTipo, entidad_id: entidadId, actor_id: user.id, tipo: "vinculo",
        detalle: { mensaje: `vinculó del repositorio: ${o?.titulo || "un objeto"}` },
      },
      {
        entidad_tipo: "objeto", entidad_id: objetoId, actor_id: user.id, tipo: "vinculo",
        detalle: { mensaje: `lo vinculó a ${ENT_LBL[entidadTipo] || entidadTipo}: ${nombre}` },
      },
    ]);
    if (o) revalidatePath(`/entidad/${o.entidad_tipo}/${o.entidad_id}`);
    revalidatePath(`/entidad/${entidadTipo}/${entidadId}`);
  }
  revalidatePath(`/objeto/${objetoId}`);
  return {};
}

export async function desvincularObjeto(objetoId: string, entidadTipo: string, entidadId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const nombre = await nombreEntidad(supabase, entidadTipo, entidadId);
  const { error } = await supabase.from("objeto_vinculos").delete()
    .eq("objeto_id", objetoId).eq("entidad_tipo", entidadTipo).eq("entidad_id", entidadId);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: "objeto", entidad_id: objetoId, actor_id: user.id, tipo: "vinculo",
    detalle: { mensaje: `lo desvinculó de ${ENT_LBL[entidadTipo] || entidadTipo}: ${nombre}` },
  });
  revalidatePath(`/objeto/${objetoId}`);
  revalidatePath(`/entidad/${entidadTipo}/${entidadId}`);
  return {};
}

/* Conversar sobre un objeto = abrir un caso vinculado a él. NO se construye un
   segundo hilo de comentarios: ya existe uno completo —menciones, reacciones,
   notificaciones, bitácora— y dos sitios donde hablar significa dos bandejas y
   conversaciones que después nadie encuentra. */
export async function conversarObjeto(objetoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: o } = await supabase.from("objetos")
    .select("titulo,entidad_tipo,entidad_id").eq("id", objetoId).single();
  if (!o) return { error: "No se encontró el objeto." };

  /* `tarea`, no `consulta`: esto es trabajo sobre el objeto —conseguir los
     derechos, pedir permiso al autor—, no una conversación. Para conversar
     el objeto tiene su propio hilo de comentarios. El título arranca con un
     verbo por lo mismo: «Sobre «X»» invitaba a usarlo como foro. */
  const { data: pub, error } = await supabase.from("publicaciones").insert({
    tipo: "tarea", titulo: `Gestionar «${o.titulo}»`, autor_id: user.id, estado: "abierta",
  }).select("id").single();
  if (error || !pub) return { error: error?.message || "No se pudo abrir el caso." };

  /* Se vincula al objeto Y a su dueño: el trabajo tiene que aparecer tanto en
     el objeto como en la ficha de quien lo aporta. */
  await supabase.from("publicacion_vinculos").insert([
    { publicacion_id: pub.id, entidad_tipo: "objeto", entidad_id: objetoId },
    { publicacion_id: pub.id, entidad_tipo: o.entidad_tipo, entidad_id: o.entidad_id },
  ]);
  revalidatePath(`/objeto/${objetoId}`);
  return { id: pub.id };
}

export async function borrarCv(id: string, personaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("objetos").select("titulo").eq("id", id).maybeSingle();
  const { data: fue, error } = await supabase.from("objetos").delete()
    .eq("id", id).eq("entidad_tipo", "persona").eq("entidad_id", personaId).eq("tipo", "cv")
    .select("id");
  if (error) return { error: error.message };
  if (!fue?.length) return { error: "No se pudo borrar: no se encontró ese CV." };
  /* Un CV es un objeto como cualquier otro: arrastra las mismas colas que no
     cascadean solas. La sección de CVs es otra puerta a la misma bodega, no
     otra bodega — si la limpieza vive solo en `borrarObjeto`, borrar por aquí
     deja la basura que allá se aprendió a recoger. */
  await supabase.from("link_verificaciones").delete()
    .eq("entidad_tipo", "persona").eq("entidad_id", personaId).eq("campo", `objeto:${id}`);
  await supabase.from("publicacion_vinculos").delete()
    .eq("entidad_tipo", "objeto").eq("entidad_id", id);
  await supabase.from("actividad").delete().eq("entidad_tipo", "objeto").eq("entidad_id", id);
  await supabase.from("actividad").insert({
    entidad_tipo: "persona", entidad_id: personaId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `borró el CV de ${prev?.titulo || "—"}` },
  });
  revalidatePath(`/entidad/persona/${personaId}`);
  return {};
}

/* --- Miembros de empresa (rep. legal, socios, directiva) --- */
export async function agregarMiembro(empresaId: string, personaId: string, cargo: string, fechaInicio?: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cargoOk = cargo.trim() || "Miembro";
  const { error } = await supabase.from("empresa_miembros").insert({
    empresa_id: empresaId,
    persona_id: personaId,
    cargo: cargoOk,
    fecha_inicio: fechaInicio || hoyLima(),
    estado: "activo",
  });
  if (error) return { error: error.message };
  const { data: per } = await supabase.from("personas")
    .select("nombre,alias").eq("id", personaId).maybeSingle();
  await supabase.from("actividad").insert({
    entidad_tipo: "empresa", entidad_id: empresaId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: `sumó a ${per?.alias || per?.nombre || "alguien"} como ${cargoOk}` },
  });
  revalidatePath(`/entidad/empresa/${empresaId}`);
  return {};
}

export async function editarFechaMiembro(miembroId: string, empresaId: string, fecha: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida." };
  const { data: prev } = await supabase.from("empresa_miembros")
    .select("cargo,fecha_inicio,per:personas(nombre,alias)").eq("id", miembroId).maybeSingle();
  const { error } = await supabase.from("empresa_miembros")
    .update({ fecha_inicio: fecha }).eq("id", miembroId);
  if (error) return { error: error.message };
  const quien = (prev?.per as any)?.alias || (prev?.per as any)?.nombre || "un miembro";
  await supabase.from("actividad").insert({
    entidad_tipo: "empresa", entidad_id: empresaId, actor_id: user.id, tipo: "miembro",
    detalle: {
      mensaje: `cambió la fecha de inicio de ${quien}`,
      cambios: [{ campo: `${quien} · desde`, de: prev?.fecha_inicio || "—", a: fecha }],
    },
  });
  revalidatePath(`/entidad/empresa/${empresaId}`);
  return {};
}

/* Corregir el cargo sin tener que borrar y volver a crear al miembro */
export async function editarCargoMiembro(miembroId: string, empresaId: string, cargo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const nuevo = cargo.trim();
  if (!nuevo) return { error: "El cargo no puede quedar vacío." };
  const { data: prev } = await supabase.from("empresa_miembros")
    .select("cargo,per:personas(nombre,alias)").eq("id", miembroId).maybeSingle();
  if (prev?.cargo === nuevo) return {};
  const { error } = await supabase.from("empresa_miembros")
    .update({ cargo: nuevo }).eq("id", miembroId);
  if (error) return { error: error.message };
  const quien = (prev?.per as any)?.alias || (prev?.per as any)?.nombre || "un miembro";
  await supabase.from("actividad").insert({
    entidad_tipo: "empresa", entidad_id: empresaId, actor_id: user.id, tipo: "miembro",
    detalle: {
      mensaje: `corrigió el cargo de ${quien}`,
      cambios: [{ campo: quien, de: prev?.cargo || "—", a: nuevo }],
    },
  });
  revalidatePath(`/entidad/empresa/${empresaId}`);
  return {};
}

export async function bajaMiembro(miembroId: string, empresaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Baja, no borrado: el historial societario se conserva
  const { data: prev } = await supabase.from("empresa_miembros")
    .select("cargo,per:personas(nombre,alias)").eq("id", miembroId).maybeSingle();
  const { error } = await supabase.from("empresa_miembros")
    .update({ estado: "inactivo", fecha_fin: hoyLima() })
    .eq("id", miembroId);
  if (error) return { error: error.message };
  const quien = (prev?.per as any)?.alias || (prev?.per as any)?.nombre || "un miembro";
  await supabase.from("actividad").insert({
    entidad_tipo: "empresa", entidad_id: empresaId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: `dio de baja a ${quien}${prev?.cargo ? ` (${prev.cargo})` : ""}` },
  });
  revalidatePath(`/entidad/empresa/${empresaId}`);
  return {};
}

/* --- Push al celular: cada dispositivo registra su suscripción --- */
export async function guardarSuscripcionPush(sub: { endpoint: string; keys?: { p256dh?: string; auth?: string } }, dispositivo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth)
    return { error: "Suscripción incompleta." };
  const { error } = await supabase.from("push_suscripciones").upsert({
    usuario_id: user.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    dispositivo: (dispositivo || "").slice(0, 120),
  }, { onConflict: "endpoint" });
  if (error) return { error: error.message };
  return {};
}

export async function quitarSuscripcionPush(endpoint: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  await supabase.from("push_suscripciones")
    .delete().eq("usuario_id", user.id).eq("endpoint", endpoint);
  return {};
}

/* --- Expediente de postulación: el formulario DAFO se llena en casa ---
   Guarda UN campo de forma ATÓMICA (jsonb_set vía RPC), no read-modify-write:
   así dos personas editando campos distintos de la misma postulación a la vez
   no se pisan. La RPC devuelve true si tocó una fila (detecta postulación
   inexistente o bloqueada por RLS, el UPDATE que antes fallaba en silencio). */
export async function guardarExpediente(postulacionId: string, campo: string, valor: string, listo: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = await supabase.rpc("set_expediente_campo", {
    pid: postulacionId, campo, valor: valor || "", listo: !!listo,
  });
  if (error) return { error: error.message };
  if (!data) return { error: "No se guardó: postulación no encontrada o sin permiso." };
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

/* REFRESCAR LOS DATOS DEL SISTEMA EN EL EXPEDIENTE.
   Los campos 🔗 (RUC, razón social, domicilio, RL, etc.) se traen de la ficha de
   la empresa/persona/proyecto. En el expediente están BLOQUEADOS: no se editan a
   mano —para cambiarlos se edita el formulario que corresponda—. Este botón
   vuelca los valores VIVOS (que `auto` ya trae recalculados) al expediente y los
   deja como «listo». Así queda una foto fija (importa para el ganador) que se
   actualiza a voluntad tras editar el origen. */
export async function refrescarExpedienteAuto(postulacionId: string, auto: Record<string, string>) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Solo lo que tiene valor y no viene con ⚠ (faltante en la ficha de origen).
  const entradas = Object.entries(auto || {}).filter(([, v]) => v && !String(v).includes("⚠"));
  let n = 0;
  for (const [campo, valor] of entradas) {
    const { data, error } = await supabase.rpc("set_expediente_campo", {
      pid: postulacionId, campo, valor: String(valor), listo: true,
    });
    if (error) return { error: error.message };
    if (data) n++;
  }
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return { n };
}

/* ENCARGAR UN CAMPO DEL EXPEDIENTE.

   El expediente sabe cuánto falta, pero saberlo no es repartirlo. Ese encargo
   vivía en el chat: sin responsable, sin plazo y sin rastro de en qué quedó.

   CAMPO, no sección: de los nueve que faltan en la Sección C, seis son combos
   o un sí/no que se resuelven en diez segundos y tres son la sinopsis, el
   planteamiento y el GDD —eso sí es trabajo de alguien—. Encargar los nueve de
   golpe convierte una tarea real en una lista de pendientes ajenos, y el
   responsable acaba devolviéndola a medias.

   Esto abre un CASO NORMAL vinculado a la postulación: se le pone responsable
   y fecha como a cualquiera, aparece en el tablero y se comenta ahí. Lo único
   que se guarda aparte es qué caso atiende qué sección, para no crear dos ni
   tener que buscarlo. Si ya existe, no se crea otro: se devuelve el que hay. */
export async function casoDeExpediente(postulacionId: string, clave: string, titulo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: post, error: ePost } = await supabase.from("postulaciones")
    .select("codigo,expediente_casos,proy:proyectos(nombre),conv:convocatorias(codigo)")
    .eq("id", postulacionId).maybeSingle();
  /* Distinguir «no existe» de «la consulta falló» — con el mensaje anterior,
     olvidar correr db/expediente-casos.sql se leía como «no se encontró la
     postulación», que manda a buscar el problema donde no está. */
  if (ePost) {
    return {
      error: /expediente_casos/.test(ePost.message)
        ? "Falta correr db/expediente-casos.sql en Supabase."
        : ePost.message,
    };
  }
  if (!post) return { error: "No se encontró la postulación." };

  /* ¿Ya hay uno, y sigue VIVO? Un caso archivado o descartado no cuenta: el
     campo quedaría encargado para siempre a algo que ya no aparece en ningún
     tablero, sin forma de volver a encargarlo. Ahí se libera la clave y se
     sigue como si no hubiera. */
  const yaId = (post.expediente_casos as any)?.[clave];
  if (yaId) {
    const { data: vive } = await supabase.from("publicaciones")
      .select("id").eq("id", yaId)
      .is("archivado_en", null).neq("estado", "descartada").maybeSingle();
    if (vive) return { id: yaId as string, ya: true };
    await supabase.rpc("set_expediente_caso", { pid: postulacionId, clave, caso: null });
  }

  const quien = `${(post as any).codigo || (post as any).conv?.codigo || "🎯"} · ${(post as any).proy?.nombre || "postulación"}`;
  const { data: pub, error } = await supabase.from("publicaciones").insert({
    tipo: "tarea", estado: "abierta", autor_id: user.id,
    titulo: `${titulo} — ${quien}`,
    cuerpo: "Falta este campo del expediente de postulación. Se llena en 🗂 Expediente, en la ficha de la postulación.",
  }).select("id").single();
  if (error || !pub) return { error: error?.message || "No se pudo crear el caso." };

  /* RESERVAR el campo. La RPC solo escribe si nadie llegó antes y devuelve el
     caso que quedó asignado. Si perdimos la carrera —otra persona encargó lo
     mismo en el mismo segundo— se borra el caso recién creado y se devuelve el
     suyo: dos tareas idénticas en el tablero no ayudan a nadie. */
  const { data: asignado, error: eMapa } = await supabase.rpc("set_expediente_caso", {
    pid: postulacionId, clave, caso: pub.id,
  });
  if (eMapa || !asignado) {
    await supabase.from("publicaciones").delete().eq("id", pub.id);
    return { error: eMapa?.message || "No se pudo encargar el campo." };
  }
  if (asignado !== pub.id) {
    await supabase.from("publicaciones").delete().eq("id", pub.id);
    return { id: asignado as string, ya: true };
  }

  await supabase.from("publicacion_vinculos").insert({
    publicacion_id: pub.id, entidad_tipo: "postulacion", entidad_id: postulacionId,
  });
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "tarea",
    detalle: { mensaje: `encargó «${titulo}» del expediente` },
  });
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return { id: pub.id as string };
}

/* --- Presupuesto de postulación: la Sección D, guardada entera ---
   Recibe todo el objeto (items + tipo_cambio + fuentes) y lo persiste. NO
   revalida: el componente edita con autosave y su estado local ya es la
   verdad mientras se escribe; un refresh cortaría el tecleo. */
export async function guardarPresupuesto(postulacionId: string, presupuesto: any) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = await supabase.from("postulaciones")
    .update({ presupuesto }).eq("id", postulacionId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
  return {};
}

/* Guardar el presupuesto actual como PLANTILLA reusable (por categoría), como
   las plantillas del cronograma. Guarda solo la estructura del ítem (rubro,
   concepto, unidad, cantidad, costo unitario), no el split de fuentes —eso es
   propio de cada postulación—. */
export async function guardarPlantillaPresupuesto(nombre: string, categoria: string | null, items: any[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!nombre.trim()) return { error: "Ponle nombre a la plantilla." };
  if (!items?.length) return { error: "El presupuesto está vacío — arma ítems antes de guardarlo como plantilla." };
  const limpios = items.map((i: any) => ({
    rubro: i.rubro, concepto: i.concepto || "", unidad: i.unidad || "",
    cantidad: i.cantidad || 0, costo_unit: i.costo_unit || 0,
  }));
  const { error } = await supabase.from("plantillas_presupuesto")
    .insert({ nombre: nombre.trim(), categoria: categoria || null, items: limpios });
  if (error) return { error: error.message };
  return { n: limpios.length };
}

/* La FOTO del presupuesto postulado: congela el presupuesto actual (lo que se
   envía a DAFO). El vivo se sigue editando; si se gana, se compara para ver
   qué cambió al ejecutar (la modificación de presupuesto que pide DAFO). */
export async function fijarPresupuestoPostulado(postulacionId: string, presupuesto: any) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!presupuesto?.items?.length) return { error: "El presupuesto está vacío — arma al menos un ítem antes de fijar." };
  const { data, error } = await supabase.from("postulaciones")
    .update({ presupuesto_postulado: presupuesto, presupuesto_postulado_en: new Date().toISOString() })
    .eq("id", postulacionId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
  const totalPre = (presupuesto.items || []).reduce((s: number, i: any) => s + (i.cantidad || 0) * (i.costo_unit || 0), 0);
  // Hito en la bitácora: qué presupuesto se presentó y por cuánto.
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "editado",
    detalle: { mensaje: `📸 fijó el presupuesto postulado (S/ ${Math.round(totalPre).toLocaleString("es-PE")})` },
  });
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

/* Tablas repetibles del expediente (material de archivo, beneficiarios):
   guarda el arreglo entero en su columna jsonb. `campo` va en whitelist. */
export async function guardarTablaPostulacion(postulacionId: string, campo: string, filas: any[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!(CAMPOS_TABLA as readonly string[]).includes(campo)) return { error: "Tabla no válida." };
  const { data, error } = await supabase.from("postulaciones")
    .update({ [campo]: filas || [] }).eq("id", postulacionId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
  return {};
}

/* Precontratos (cartas de compromiso del equipo): guarda el arreglo entero en
   su columna jsonb. El monto NO se guarda: se deriva del ítem del presupuesto
   al leer, así el documento y lo presupuestado nunca se separan. */
export async function guardarPrecontratos(postulacionId: string, filas: any[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = await supabase.from("postulaciones")
    .update({ precontratos: filas || [] }).eq("id", postulacionId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
  return {};
}

/* --- Editar comentario: solo el autor, y queda la marca de editado --- */
export async function editarComentario(comentarioId: string, pubId: string, cuerpo: string, imagenes?: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const texto = (cuerpo || "").trim();
  const imgs = imagenes ? imagenes.filter(Boolean).slice(0, 6) : null;
  // Válido si tiene texto O al menos una imagen (un comentario puede ser solo foto).
  if (!texto && !(imgs && imgs.length)) return { error: "El comentario no puede quedar vacío." };
  const { data: com } = await supabase.from("comentarios")
    .select("autor_id,publicacion_id,objeto_id").eq("id", comentarioId).single();
  if (!com) return { error: "Comentario no encontrado." };
  if (com.autor_id !== user.id) return { error: "Solo el autor puede editar su comentario." };
  const upd: any = { cuerpo: texto || "📷", editado_en: new Date().toISOString() };
  if (imgs) upd.imagenes = imgs;
  const { error } = await supabase.from("comentarios").update(upd).eq("id", comentarioId);
  if (error) return { error: error.message };
  /* La ruta se deduce del propio comentario: desde que también cuelgan de un
     objeto, el `pubId` que manda el cliente puede no ser una publicación. */
  revalidatePath(com.objeto_id ? `/objeto/${com.objeto_id}` : `/caso/${com.publicacion_id || pubId}`);
  return {};
}

/* --- Cuenta de acceso: enlaza una persona con su perfil (usuario del sistema) --- */
export async function enlazarCuenta(personaId: string, perfilId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Una cuenta solo puede pertenecer a una persona
  const { data: ocupada } = await supabase.from("personas")
    .select("id,nombre").eq("usuario_id", perfilId).neq("id", personaId).maybeSingle();
  if (ocupada) return { error: `Esa cuenta ya está enlazada a ${ocupada.nombre}.` };
  const { error } = await supabase.from("personas")
    .update({ usuario_id: perfilId }).eq("id", personaId);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/persona/${personaId}`);
  return {};
}

export async function desenlazarCuenta(personaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("personas")
    .update({ usuario_id: null }).eq("id", personaId);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/persona/${personaId}`);
  return {};
}

/* --- Credenciales: SOLO metadatos; la clave vive en el gestor --- */
/* ── Plataformas: dónde se entra ──
   La URL vive con la plataforma, no repetida en cada credencial. Al
   guardarla, las credenciales de esa plataforma que no tengan una propia
   la heredan: cambiar la puerta de DAFO es un solo cambio, no seis. */
export async function guardarPlataforma(f: {
  id?: string; nombre: string; url: string; requiereCuenta: boolean; notas: string;
  plantillaUrl?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración gestiona las plataformas." };

  const nombre = f.nombre.trim();
  if (!nombre) return { error: "El nombre es obligatorio." };
  const url = f.url.trim();
  if (url && !/^https?:\/\/\S+$/.test(url))
    return { error: "El link debe ser completo (https://…)." };

  /* La plantilla arma el link con el usuario de cada credencial: Gmail con
     seis cuentas necesita seis puertas y ninguna se guarda. Sin el hueco
     {usuario} no hay nada que reemplazar — y una plantilla que no reemplaza
     nada manda a todos al mismo sitio creyendo que van al suyo. */
  const plantilla = (f.plantillaUrl || "").trim();
  if (plantilla) {
    if (!/^https?:\/\/\S+$/.test(plantilla))
      return { error: "La plantilla debe ser un link completo (https://…)." };
    if (!plantilla.includes(TOKEN))
      return { error: `A la plantilla le falta ${TOKEN} — es el hueco donde entra el usuario de cada cuenta.` };
  }

  const fila = {
    nombre, url: url || null, requiere_cuenta: f.requiereCuenta,
    notas: f.notas.trim() || null, plantilla_url: plantilla || null,
  };
  const { data, error } = f.id
    ? await supabase.from("plataformas").update(fila).eq("id", f.id).select("id").maybeSingle()
    : await supabase.from("plataformas").insert(fila).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "No se guardó: revisa que el nombre no esté repetido." };

  /* Nada que propagar: la credencial NO guarda copia del link. Lo resuelve
     al leer (lib/plataformas.ts → conPlataforma). Antes esto copiaba el link
     a las credenciales con url nula, y era el mismo dato en dos sitios: solo
     rellenaba los huecos, nunca corregía. Cambiar el link de DAFO habría
     dejado a las cinco que ya lo heredaron con el viejo, sin avisar. */
  revalidatePath("/admin");
  revalidatePath("/buscar");
  return {};
}

export async function borrarPlataforma(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración gestiona las plataformas." };
  const { error } = await supabase.from("plataformas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

/* Puertas: las entradas ADICIONALES de una plataforma.
   Clave SOL es una cuenta con tres entradas —menú general, declaraciones y
   pagos, renta anual—, así que `plataformas.url` sola no alcanzaba. La
   principal sigue en `plataformas.url` (es la que heredan las credenciales);
   aquí viven las demás, con el nombre de para qué sirven. */
export async function guardarPuerta(f: {
  id?: string; plataformaId: string; titulo: string; url: string; notas: string; orden?: number;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración gestiona las plataformas." };

  const titulo = f.titulo.trim();
  if (!titulo) return { error: "Ponle un nombre a la entrada — para qué sirve." };
  const url = f.url.trim();
  /* Aquí el link SÍ es obligatorio, al revés que en la plataforma: una
     plataforma sin link todavía dice algo (que existe, que tiene cuenta).
     Una puerta sin link no es nada. */
  if (!/^https?:\/\/\S+$/.test(url))
    return { error: "El link debe ser completo (https://…)." };

  const fila = {
    plataforma_id: f.plataformaId, titulo, url,
    notas: f.notas.trim() || null, orden: f.orden ?? 0,
  };
  const { data, error } = f.id
    ? await supabase.from("plataforma_puertas").update(fila).eq("id", f.id).select("id").maybeSingle()
    : await supabase.from("plataforma_puertas").insert(fila).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "No se guardó: revisa que el nombre no se repita en esta plataforma." };
  revalidatePath("/admin");
  return {};
}

export async function borrarPuerta(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración gestiona las plataformas." };
  const { error } = await supabase.from("plataforma_puertas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

/* Nombres cortos para el historial de credenciales: la columna se llama
   `metodo_acceso`, pero en la bitácora se lee "Método de acceso". */
const CRED_CAMPOS: Record<string, string> = {
  plataforma: "Plataforma",
  identificador: "Usuario",
  url: "Link para entrar",
  ubicacion: "Dónde vive la clave",
  metodo_acceso: "Método de acceso",
  notas: "Notas",
};

export async function agregarCredencial(
  dueno: "empresa" | "persona", duenoId: string,
  plataforma: string, identificador: string, ubicacion: string, notas: string,
  metodo: string = "", url: string = ""
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("credenciales").insert({
    [dueno === "empresa" ? "empresa_id" : "persona_id"]: duenoId,
    plataforma: plataforma.trim(),
    identificador: identificador.trim() || null,
    ubicacion: ubicacion.trim() || null,
    notas: notas.trim() || null,
    metodo_acceso: metodo.trim() || null,
    url: url.trim() || null,
    actualizado_en: hoyLima(),
  });
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `registró la credencial «${plataforma.trim()}»` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

export async function editarCredencial(
  id: string, dueno: string, duenoId: string,
  plataforma: string, identificador: string, ubicacion: string, notas: string,
  metodo: string = "", url: string = ""
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!plataforma.trim()) return { error: "La plataforma es obligatoria." };
  const { data: antes } = await supabase.from("credenciales")
    .select("plataforma,identificador,ubicacion,notas,metodo_acceso,url")
    .eq("id", id).maybeSingle();
  const nuevo: Record<string, string | null> = {
    plataforma: plataforma.trim(),
    identificador: identificador.trim() || null,
    ubicacion: ubicacion.trim() || null,
    notas: notas.trim() || null,
    metodo_acceso: metodo.trim() || null,
    url: url.trim() || null,
  };
  const { error } = await supabase.from("credenciales").update({
    ...nuevo, actualizado_en: hoyLima(),
  }).eq("id", id);
  if (error) return { error: error.message };
  // Mismo formato que la edición de la ficha: antes → después
  if (antes) {
    const cambios = (Object.entries(CRED_CAMPOS) as [string, string][])
      .filter(([k]) => String((antes as any)[k] ?? "") !== String(nuevo[k] ?? ""))
      .map(([k, etiqueta]) => ({
        campo: etiqueta, de: (antes as any)[k] || "—", a: nuevo[k] || "—",
      }));
    if (cambios.length) {
      await supabase.from("actividad").insert({
        entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "editado",
        detalle: {
          mensaje: `actualizó la credencial «${plataforma.trim()}»`,
          cambios,
        },
      });
    }
  }
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

export async function borrarCredencial(id: string, dueno: string, duenoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("credenciales")
    .select("plataforma").eq("id", id).maybeSingle();
  const { error } = await supabase.from("credenciales").delete().eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `borró la credencial «${prev?.plataforma || "—"}»` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

// ── Datos flexibles y verificables dentro de una credencial ──
export async function agregarDato(
  credencialId: string, dueno: string, duenoId: string, etiqueta: string, valor: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!etiqueta.trim()) return { error: "La etiqueta es obligatoria." };
  const { error } = await supabase.from("credencial_datos").insert({
    credencial_id: credencialId,
    etiqueta: etiqueta.trim(),
    valor: valor.trim() || null,
    verificado_en: hoyLima(), // recién ingresado = verificado hoy
  });
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `agregó el dato «${etiqueta.trim()}»` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

/* Los contactos declarados en el formulario de una POSTULACIÓN. Misma tabla y
 * mismas acciones de edición/verificación que los datos de una credencial; solo
 * cambia de qué cuelgan. Requiere db/postulacion-contactos.sql. */
export async function agregarDatoPostulacion(
  postulacionId: string, etiqueta: string, valor: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!etiqueta.trim()) return { error: "La etiqueta es obligatoria." };
  const { error } = await supabase.from("credencial_datos").insert({
    postulacion_id: postulacionId,
    etiqueta: etiqueta.trim(),
    valor: valor.trim() || null,
    verificado_en: hoyLima(),
  });
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `declaró «${etiqueta.trim()}» en la postulación` },
  });
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

export async function editarDato(
  id: string, dueno: string, duenoId: string, etiqueta: string, valor: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!etiqueta.trim()) return { error: "La etiqueta es obligatoria." };
  const { error } = await supabase.from("credencial_datos").update({
    etiqueta: etiqueta.trim(), valor: valor.trim() || null,
  }).eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `editó el dato «${etiqueta.trim()}»` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

export async function verificarDato(id: string, dueno: string, duenoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("credencial_datos").select("etiqueta").eq("id", id).maybeSingle();
  const { error } = await supabase.from("credencial_datos")
    .update({ verificado_en: hoyLima() }).eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `reverificó el dato «${prev?.etiqueta || "—"}»` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

/* Quitar la confirmación: el dato vuelve a «sin confirmar».
 *
 * Hace falta porque `verificarDato` no tenía vuelta atrás, y un ✔ que no se
 * puede deshacer convierte un clic equivocado en tranquilidad falsa
 * PERMANENTE. Peor todavía: al descubrir que un teléfono ya no responde, la
 * única salida era borrar el dato —perdiendo el rastro de que ese número se
 * declaró— o dejarlo en verde mintiendo.
 *
 * Vuelve a null y no a una fecha vieja: «nadie lo ha comprobado» y «se
 * comprobó hace mucho» son estados distintos y el sistema ya los distingue.
 */
export async function desverificarDato(id: string, dueno: string, duenoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("credencial_datos").select("etiqueta").eq("id", id).maybeSingle();
  const { error } = await supabase.from("credencial_datos")
    .update({ verificado_en: null }).eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `quitó la confirmación de «${prev?.etiqueta || "—"}»` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

/* Registrar el veredicto de un humano sobre el link de un documento: correcto
   (`correcto=true`) o equivocado (`false`, hay que corregir el link). Toggle: si
   ya está marcado ESE MISMO link con el MISMO veredicto, lo quita (vuelve a «sin
   revisar»); si cambia el veredicto o el link, lo re-marca con quién y cuándo.
   Se guarda la url para que el veredicto se invalide solo cuando cambia el link. */
export async function marcarLink(tipo: string, id: string, campo: string, url: string, correcto: boolean, etiqueta?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const u = (url || "").trim();
  if (!u) return { error: "No hay link que revisar." };

  // Nombre legible del documento para la bitácora ("firma", "DNI"…).
  const doc = (etiqueta || campo.replace(/_url$/, "").replace(/_/g, " ")).toLowerCase();
  /* El campo `objeto:<id>` significa que el link vive en un objeto del
     repositorio: además de la ficha del dueño hay que refrescar SU página, o
     el resto del equipo sigue viendo el veredicto viejo. */
  const objId = campo.startsWith("objeto:") ? campo.slice(7) : null;
  const refrescar = () => {
    revalidatePath(`/entidad/${tipo}/${id}`);
    if (objId) { revalidatePath(`/objeto/${objId}`); revalidatePath("/repositorio"); }
  };
  const registrar = (mensaje: string) => supabase.from("actividad").insert({
    entidad_tipo: tipo, entidad_id: id, actor_id: user.id, tipo: "link", detalle: { mensaje },
  });

  const { data: prev } = await supabase.from("link_verificaciones")
    .select("id,url,correcto").eq("entidad_tipo", tipo).eq("entidad_id", id).eq("campo", campo).maybeSingle();

  // Mismo link y mismo veredicto → quitar la marca (des-revisar).
  if (prev && prev.url === u && prev.correcto === correcto) {
    const { error } = await supabase.from("link_verificaciones").delete().eq("id", prev.id);
    if (error) return { error: error.message };
    await registrar(`quitó la revisión del link de ${doc}`);
    refrescar();
    return { estado: "quitado" };
  }

  // Marcar (o re-marcar tras cambio de veredicto o de link).
  const { error } = await supabase.from("link_verificaciones")
    .upsert({
      entidad_tipo: tipo, entidad_id: id, campo, url: u, correcto,
      verificado_por: user.id, verificado_en: new Date().toISOString(),
    }, { onConflict: "entidad_tipo,entidad_id,campo" });
  if (error) return { error: error.message };
  await registrar(correcto
    ? `revisó el link de ${doc} — ✅ contenido correcto`
    : `revisó el link de ${doc} — ⚠ contenido equivocado, hay que corregirlo`);
  refrescar();
  return { estado: correcto ? "correcto" : "malo" };
}

export async function borrarDato(id: string, dueno: string, duenoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("credencial_datos").select("etiqueta").eq("id", id).maybeSingle();
  const { error } = await supabase.from("credencial_datos").delete().eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `borró el dato «${prev?.etiqueta || "—"}»` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

export async function crearLugar(nombre: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const limpio = nombre.trim();
  if (!limpio) return { error: "Nombre vacío" };
  const { data: ex } = await supabase.from("lugares")
    .select("id,nombre").ilike("nombre", limpio).maybeSingle();
  if (ex) return { id: ex.id, nombre: ex.nombre };
  const { data, error } = await supabase.from("lugares")
    .insert({ nombre: limpio }).select("id,nombre").single();
  if (error) return { error: error.message };
  revalidatePath("/");
  return { id: data.id, nombre: data.nombre };
}

/* ===== POSTULACIONES: proyecto + empresa + convocatoria =====
   El acta, la rendición y la prórroga viven aquí (en la ganadora),
   no en la convocatoria: el concurso existe gane quien gane. */
export async function crearPostulacion(convocatoriaId: string, proyectoId: string, empresaId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Código interno PO-### correlativo
  const { data: cods } = await supabase.from("postulaciones").select("codigo");
  let max = 0;
  (cods || []).forEach((x: any) => {
    const m = (x.codigo || "").match(/^PO-(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1]));
  });
  const { error } = await supabase.from("postulaciones").insert({
    convocatoria_id: convocatoriaId, proyecto_id: proyectoId,
    empresa_id: empresaId || null, estado: "en_preparacion",
    codigo: `PO-${String(max + 1).padStart(3, "0")}`,
  });
  if (error) return { error: error.message };
  revalidatePath(`/entidad/convocatoria/${convocatoriaId}`);
  return {};
}

export async function actualizarPostulacion(id: string, convocatoriaId: string, datos: Record<string, string>) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const PERMITIDOS = ["estado", "empresa_id", "codigo_acta", "fecha_firma_acta", "monto_adjudicado",
    "fecha_limite_rendicion", "fecha_prorroga", "acta_url", "feedback_jurado"];
  const limpio: Record<string, string | null> = {};
  PERMITIDOS.forEach(k => {
    let v = String(datos[k] ?? "").trim();
    if (!(k in datos)) return;
    if (v && k === "monto_adjudicado") {
      v = v.replace(/[^\d.,]/g, "").replace(/,/g, "");
      const p = v.split(".");
      if (p.length > 2) v = p.slice(0, -1).join("") + "." + p[p.length - 1];
      v = v.replace(/^\.+/, "");
    }
    limpio[k] = v || null;
  });
  if (!Object.keys(limpio).length) return { error: "Nada que actualizar." };
  const { data: post, error } = await supabase.from("postulaciones")
    .update(limpio).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!post?.length) return { error: "No se guardó: no tienes permiso sobre esta postulación." };

  // Asignar la empresa es un hecho societario: quién postula con qué RUC.
  // Antes no dejaba rastro; el historial de la postulación no lo sabía.
  if ("empresa_id" in limpio) {
    const { data: emp } = limpio.empresa_id
      ? await supabase.from("empresas").select("nombre").eq("id", limpio.empresa_id).maybeSingle()
      : { data: null };
    await supabase.from("actividad").insert({
      entidad_tipo: "postulacion", entidad_id: id, actor_id: user.id, tipo: "editado",
      detalle: { mensaje: emp ? `asignó la empresa ${emp.nombre}` : "quitó la empresa postulante" },
    });
  }
  revalidatePath(`/entidad/convocatoria/${convocatoriaId}`);
  // La ficha de la postulación también muestra esto: sin esta línea, cambias
  // la empresa y la pantalla donde estás parado sigue mostrando la anterior.
  revalidatePath(`/entidad/postulacion/${id}`);
  return {};
}

export async function borrarPostulacion(id: string, convocatoriaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* `.select()` OBLIGATORIO antes de limpiar el rastro: `postulaciones` tiene
     RLS y no hay policy de DELETE versionada, así que un delete sin permiso
     borra 0 filas y NO devuelve error. Sin este chequeo, la postulación seguía
     viva y la limpieza de abajo le borraba igual sus objetos y su bitácora. */
  const { data: fue, error } = await supabase.from("postulaciones")
    .delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!fue?.length) return { error: "No se borró: no tienes permiso sobre esta postulación." };
  await limpiarRastroPolimorfico(supabase, "postulacion", id);
  revalidatePath(`/entidad/convocatoria/${convocatoriaId}`);
  revalidatePath("/repositorio");
  return {};
}

/* LO QUE NO SE VA SOLO AL BORRAR UNA FICHA.
   Cuatro tablas guardan a su dueño de forma polimórfica —(entidad_tipo,
   entidad_id)— y por eso no pueden tener clave foránea: nadie las cascadea.
   Sin esto, borrar una postulación dejaba sus objetos del repositorio vivos,
   saliendo en /repositorio con dueño «—» e inalcanzables desde cualquier
   ficha. Cualquier borrado de entidad futuro debe pasar por aquí. */
async function limpiarRastroPolimorfico(supabase: any, tipo: string, id: string) {
  const { data: objs } = await supabase.from("objetos").select("id")
    .eq("entidad_tipo", tipo).eq("entidad_id", id);
  const ids = (objs || []).map((o: any) => o.id);
  if (ids.length) {
    // Los casos que apuntaban a esos objetos se quedarían con chips rotos.
    await supabase.from("publicacion_vinculos").delete()
      .eq("entidad_tipo", "objeto").in("entidad_id", ids);
    // La bitácora propia de cada objeto: sin esto quedan eventos apuntando a
    // una página /objeto/<id> que ya no existe.
    await supabase.from("actividad").delete()
      .eq("entidad_tipo", "objeto").in("entidad_id", ids);
    // `objetos` cascadea comentarios, notificaciones y objeto_vinculos.
    await supabase.from("objetos").delete().in("id", ids);
  }
  for (const t of ["publicacion_vinculos", "objeto_vinculos", "link_verificaciones"]) {
    await supabase.from(t).delete().eq("entidad_tipo", tipo).eq("entidad_id", id);
  }
  /* La bitácora se escribe con DOS grafías: las acciones ponen el singular
     («postulacion») y los triggers de la base ponen `tg_table_name`, o sea el
     plural («postulaciones»). Borrar solo una dejaba media historia huérfana
     enlazando a una ficha 404 — peor que no borrar nada. */
  const plural = SECCIONES.find(s => s.tipo === tipo)?.tabla;
  await supabase.from("actividad").delete()
    .in("entidad_tipo", plural && plural !== tipo ? [tipo, plural] : [tipo])
    .eq("entidad_id", id);
}

/* ── El equipo de un PROYECTO ──
 *
 * Distinto de `postulacion_equipo`, y la diferencia es el punto:
 *   · proyecto_equipo   → quién hace esta película. Existe desde «idea», un
 *                         año antes de postular. La directora nace con él.
 *   · postulacion_equipo → quién se presentó a UN concurso con ella.
 *
 * Hasta hoy solo existía el segundo, así que para el sistema una directora
 * nacía al postular. El año anterior —el que John llama «abrirles el camino»,
 * el que de verdad forma al equipo— era invisible.
 */
export async function agregarEquipoProyecto(proyectoId: string, personaId: string, cargo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cargoOk = cargo.trim();
  if (!cargoOk) return { error: "Elige el cargo." };
  const { error } = await supabase.from("proyecto_equipo").insert({
    proyecto_id: proyectoId, persona_id: personaId, cargo: cargoOk,
  });
  if (error) return { error: error.message };
  const { data: per } = await supabase.from("personas")
    .select("nombre,alias").eq("id", personaId).maybeSingle();
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: `sumó a ${per?.alias || per?.nombre || "alguien"} como ${cargoOk}` },
  });
  revalidatePath(`/entidad/proyecto/${proyectoId}`);
  return {};
}

export async function editarCargoProyecto(id: string, proyectoId: string, cargo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const nuevo = cargo.trim();
  if (!nuevo) return { error: "El cargo no puede quedar vacío." };
  const { data: prev } = await supabase.from("proyecto_equipo")
    .select("cargo,per:personas(nombre,alias)").eq("id", id).maybeSingle();
  const { data: post, error } = await supabase.from("proyecto_equipo")
    .update({ cargo: nuevo }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!post?.length) return { error: "No se guardó: no tienes permiso." };
  const quien = (prev?.per as any)?.alias || (prev?.per as any)?.nombre || "alguien";
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "miembro",
    detalle: {
      mensaje: `cambió el cargo de ${quien}`,
      cambios: [{ campo: quien, de: prev?.cargo || "—", a: nuevo }],
    },
  });
  revalidatePath(`/entidad/proyecto/${proyectoId}`);
  return {};
}

export async function quitarEquipoProyecto(id: string, proyectoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Se lee antes de borrar: después ya no hay a quién nombrar en la bitácora
  const { data: prev } = await supabase.from("proyecto_equipo")
    .select("cargo,per:personas(nombre,alias)").eq("id", id).maybeSingle();
  const { data: fuera, error } = await supabase.from("proyecto_equipo")
    .delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!fuera?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  const quien = (prev?.per as any)?.alias || (prev?.per as any)?.nombre || "alguien";
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: `quitó a ${quien} del equipo${prev?.cargo ? ` (${prev.cargo})` : ""}` },
  });
  revalidatePath(`/entidad/proyecto/${proyectoId}`);
  return {};
}

/* ── El ESTADO de una POSTULACIÓN, editable desde la cabecera ──
 *
 * La postulación es lo único con ciclo de vida real: su estado avanza en una
 * carrera con fin (preparación → enviada → apta → finalista → ganadora, con dos
 * salidas: no apta, no ganó). Editarlo entrando al formulario era tedioso; el
 * mini-cronograma de la cabecera lo cambia en un clic.
 *
 * Solo hace el UPDATE: el trigger `registrar_evento_estado` (db/schema.sql) ya
 * escribe el cambio en el historial con el actor, como en los casos. */
const ESTADOS_POST = ["en_preparacion", "enviada", "en_subsanacion", "apta", "no_apta", "finalista", "ganadora", "finalista_no_ganadora"];
export async function cambiarEstadoPostulacion(id: string, estado: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!ESTADOS_POST.includes(estado)) return { error: "Estado no válido." };
  const { data, error } = await supabase.from("postulaciones")
    .update({ estado }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se pudo cambiar el estado (sin permiso o ya no existe)." };
  revalidatePath(`/entidad/postulacion/${id}`);
  return {};
}

/* Igual que la postulación, pero para la CONVOCATORIA: su propio ciclo de vida
   (planificada → abierta → en evaluación → con resultados → finalizada; salida:
   cancelada). El trigger `registrar_evento_estado` también cubre convocatorias,
   así que el cambio queda en el historial solo. */
const ESTADOS_CONV = ["planificada", "abierta", "en_evaluacion", "con_resultados", "finalizada", "cancelada"];
export async function cambiarEstadoConvocatoria(id: string, estado: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!ESTADOS_CONV.includes(estado)) return { error: "Estado no válido." };
  const { data, error } = await supabase.from("convocatorias")
    .update({ estado }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se pudo cambiar el estado (sin permiso o ya no existe)." };
  revalidatePath(`/entidad/convocatoria/${id}`);
  return {};
}

/* La ETAPA del proyecto (idea → en carpeta → desarrollo → pre/pro/post →
   festivales → distribución → finalizado) también es una carrera con ciclo de
   vida y se toca seguido según avanza. Mismo patrón: un clic la cambia ahí
   mismo, sin entrar al formulario. */
export async function cambiarEtapaProyecto(id: string, etapa: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!ETAPAS_PROY_VALIDAS.includes(etapa)) return { error: "Etapa no válida." };
  const { data, error } = await supabase.from("proyectos")
    .update({ etapa }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se pudo cambiar la etapa (sin permiso o ya no existe)." };
  revalidatePath(`/entidad/proyecto/${id}`);
  return {};
}

/* ── Los ACTORES SOCIALES de un PROYECTO ──
 *
 * Los personajes de la vida real que el documental retrata. Ni equipo (quienes
 * lo hacen) ni cliente (para quién es un encargo): a quiénes se cuenta. Cada
 * uno enlaza a su ficha de persona y lleva un rol y una descripción del
 * personaje —el jurado DAFO valora a quién se retrata. */
export async function agregarActorProyecto(
  proyectoId: string, personaId: string, rol: string, descripcion: string,
  personaje?: string, imagenUrl?: string | null
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  /* Una de las dos, no las dos obligatorias. En documental basta la persona
     —Braulia ES el personaje—; en ficción basta el personaje, porque el
     intérprete aparece en casting meses después y exigirlo aquí obligaría a
     esperar al casting para poder escribir el reparto. */
  const pj = (personaje || "").trim();
  if (!personaId && !pj) return { error: "Elige a la persona o escribe el nombre del personaje." };

  const { error } = await supabase.from("proyecto_actores").insert({
    proyecto_id: proyectoId, persona_id: personaId || null,
    personaje: pj || null, imagen_url: imagenUrl || null,
    rol: rol.trim() || null, descripcion: descripcion.trim() || null,
  });
  if (error) return { error: error.message };

  let quien = pj;
  if (personaId) {
    const { data: per } = await supabase.from("personas")
      .select("nombre,alias").eq("id", personaId).maybeSingle();
    const nom = per?.alias || per?.nombre || "alguien";
    quien = pj ? `${pj} (${nom})` : nom;
  }
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: `sumó a ${quien || "alguien"} al reparto${rol.trim() ? ` (${rol.trim()})` : ""}` },
  });
  revalidatePath(`/entidad/proyecto/${proyectoId}`);
  return {};
}

/* ── LA FICHA DEL PERSONAJE ──
 * Qué quiere, qué necesita, y las dos formas de intentarlo. Se guarda entera
 * de una vez y no campo a campo: son preguntas que se contestan juntas —lo que
 * quiere solo se entiende contra lo que necesita— y guardar de a una llenaría
 * el historial de nueve entradas por una sola sesión de escritura.
 *
 * La lista de campos permitidos está aquí y NO se toma del objeto que llega:
 * sin ella, quien llame a esta acción escribe la columna que quiera. */
const CAMPOS_ACTOR = [
  "personaje", "imagen_url", "imagenes", "rol", "descripcion", "arquetipo", "edad",
  "genero", "rasgos", "quiere", "quiere_como", "necesita", "necesita_como", "notas",
] as const;

export async function guardarFichaActor(id: string, proyectoId: string, campos: Record<string, any>) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!id) return { error: "Falta el actor." };

  const patch: Record<string, any> = {};
  CAMPOS_ACTOR.forEach(k => {
    if (!(k in campos)) return;
    const v = campos[k];
    /* La galería es un array y su vacío es `[]`, no `null`: la columna es
       `not null default '[]'` y mandarle null la rechazaría entera —con la
       ficha completa dentro—. */
    if (k === "imagenes") { patch[k] = Array.isArray(v) ? v.filter(Boolean) : []; return; }
    patch[k] = typeof v === "string" ? (v.trim() || null) : (v ?? null);
  });
  if (!Object.keys(patch).length) return { error: "No hay nada que guardar." };

  /* El CHECK de la base impide dejar la fila sin nadie, pero el error que
     devuelve es «violates check constraint proyecto_actores_alguien», que no
     le dice nada a quien está escribiendo. Se comprueba antes, con palabras. */
  if ("personaje" in patch && !patch.personaje) {
    const { data: prev } = await supabase.from("proyecto_actores")
      .select("persona_id").eq("id", id).maybeSingle();
    if (!prev?.persona_id) return { error: "Sin persona vinculada, el personaje necesita un nombre." };
  }

  const { data, error } = await supabase.from("proyecto_actores")
    .update(patch).eq("id", id).select("id,personaje,per:personas(nombre,alias)");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso, o ya no existe." };

  const f: any = data[0];
  const quien = f.personaje || (Array.isArray(f.per) ? f.per[0] : f.per)?.alias
    || (Array.isArray(f.per) ? f.per[0] : f.per)?.nombre || "alguien";
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: `escribió la ficha de ${quien}` },
  });
  revalidatePath(`/entidad/proyecto/${proyectoId}`);
  return {};
}

/** Vincular (o desvincular) al intérprete de un personaje. Es su propia acción
 *  porque es su propio momento: el casting llega mucho después del guion. */
export async function repartirActor(id: string, proyectoId: string, personaId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: prev } = await supabase.from("proyecto_actores")
    .select("personaje").eq("id", id).maybeSingle();
  if (!personaId && !(prev?.personaje || "").trim()) {
    return { error: "No se puede quitar al intérprete: la fila se quedaría sin nadie. Ponle nombre al personaje primero." };
  }

  const { data, error } = await supabase.from("proyecto_actores")
    .update({ persona_id: personaId || null }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };

  let nom = "nadie";
  if (personaId) {
    const { data: per } = await supabase.from("personas")
      .select("nombre,alias").eq("id", personaId).maybeSingle();
    nom = per?.alias || per?.nombre || "alguien";
  }
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: personaId
      ? `repartió a ${prev?.personaje || "un personaje"}: lo interpreta ${nom}`
      : `dejó sin repartir a ${prev?.personaje || "un personaje"}` },
  });
  revalidatePath(`/entidad/proyecto/${proyectoId}`);
  return {};
}

/* (Aquí vivía `editarActorProyecto`, que guardaba rol y descripción. La
   reemplaza `guardarFichaActor`: hace lo mismo y once campos más, con una lista
   blanca de columnas. Dejar las dos era dejar dos formas de guardar lo mismo, y
   la vieja además nombraba en el historial solo a la persona —de un personaje
   sin intérprete decía «actualizó al actor social alguien»—.) */

export async function quitarActorProyecto(id: string, proyectoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: prev } = await supabase.from("proyecto_actores")
    .select("personaje,per:personas(nombre,alias)").eq("id", id).maybeSingle();
  const { data: fuera, error } = await supabase.from("proyecto_actores")
    .delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!fuera?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  /* El personaje manda: sin él, borrar a Robomac dejaba en el historial «quitó
     a alguien», que es exactamente lo que nadie podrá reconstruir después. */
  const quien = prev?.personaje
    || (prev?.per as any)?.alias || (prev?.per as any)?.nombre || "alguien";
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: `quitó a ${quien} del reparto` },
  });
  revalidatePath(`/entidad/proyecto/${proyectoId}`);
  return {};
}

/* Quién postula con qué proyecto queda escrito, igual que los miembros de una
   empresa. No es simetría por gusto: el equipo es criterio del jurado
   —«COMPETENCIA DEL PERSONAL DEL PROYECTO», hasta 5 puntos en la matriz— y
   además decide la reserva regional. Que alguien entre o salga de una
   postulación es exactamente el tipo de cosa que dos años después nadie
   recuerda quién movió ni cuándo. */
export async function agregarEquipoPostulacion(postulacionId: string, personaId: string, rol: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cargoOk = rol.trim() || "Integrante";
  const { error } = await supabase.from("postulacion_equipo").insert({
    postulacion_id: postulacionId, persona_id: personaId, cargo: cargoOk,
  });
  if (error) return { error: error.message };
  const { data: per } = await supabase.from("personas")
    .select("nombre,alias").eq("id", personaId).maybeSingle();
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: `sumó a ${per?.alias || per?.nombre || "alguien"} al equipo como ${cargoOk}` },
  });
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

export async function quitarEquipoPostulacion(id: string, postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* Se lee ANTES de borrar: después de la baja ya no hay a quién nombrar, y
     «quitó a alguien» no sirve de nada en una bitácora. */
  const { data: prev } = await supabase.from("postulacion_equipo")
    .select("cargo,per:personas(nombre,alias)").eq("id", id).maybeSingle();
  // Un DELETE bloqueado por RLS tampoco da error: borra cero filas y dice OK
  const { data: fuera, error } = await supabase.from("postulacion_equipo")
    .delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!fuera?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };
  const quien = (prev?.per as any)?.alias || (prev?.per as any)?.nombre || "alguien";
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: `quitó a ${quien} del equipo${prev?.cargo ? ` (${prev.cargo})` : ""}` },
  });
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

/* --- CV PRESENTADO: el CV es del expediente, no de la persona ---
   El CV que se entrega al fondo se prepara PARA esta postulación y este
   cargo, y se archiva con la fila del equipo (db/cv-postulacion.sql). No
   confundir con los CVs generales de la persona (objetos tipo='cv'): esos
   son identidad y aquí solo sirven de base sugerida. `url` vacía = quitar
   el CV de la fila (se subió mal, se rehace). */
export async function guardarCvEquipo(filaId: string, postulacionId: string, url: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const u = url.trim();
  if (u && !/^https?:\/\/\S+$/.test(u)) return { error: "El CV debe ser un link completo (https://...)." };

  /* Se lee ANTES para que la bitácora diga el HECHO (sumó / cambió / quitó)
     y nombre a la persona — mismo criterio que quitarEquipoPostulacion. */
  const { data: prev } = await supabase.from("postulacion_equipo")
    .select("cargo,cv_url,per:personas(nombre,alias)")
    .eq("id", filaId).eq("postulacion_id", postulacionId).maybeSingle();
  if (!prev) return { error: "No se encontró esa fila del equipo." };

  /* Acotado a la fila Y a la postulación: esto es una server action pública
     y un id forjado pisaría el CV de otra carpeta. Un UPDATE bloqueado por
     RLS no da error: devuelve cero filas — se verifica. */
  const { data: filas, error } = await supabase.from("postulacion_equipo")
    .update({ cv_url: u || null, cv_actualizado: u ? hoyLima() : null })
    .eq("id", filaId).eq("postulacion_id", postulacionId).select("id");
  if (error) return { error: error.message };
  if (!filas?.length) return { error: "No se guardó: no tienes permiso." };

  const quien = (prev.per as any)?.alias || (prev.per as any)?.nombre || "alguien";
  const mensaje = !u ? `quitó el CV presentado de ${quien} (${prev.cargo})`
    : prev.cv_url ? `cambió el CV presentado de ${quien} (${prev.cargo})`
    : `sumó el CV presentado de ${quien} (${prev.cargo})`;
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id,
    tipo: "editado", detalle: { mensaje },
  });
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

export async function guardarMateriales(postulacionId: string, materiales: Record<string, string>) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Solo strings recortados; los vacíos se eliminan del expediente
  const limpio: Record<string, string> = {};
  Object.entries(materiales).forEach(([k, v]) => {
    const s = String(v ?? "").trim();
    if (s) limpio[k.slice(0, 60)] = s.slice(0, 500);
  });

  /* Hay que leer ANTES de escribir, y aquí no es opcional como en una tabla
     normal: `materiales` es un JSON que se reemplaza entero. Sin la foto
     previa, después del update no queda rastro de qué había — el expediente
     pasaría de 3/10 a 4/10 y nadie sabría cuál llegó ni quién lo trajo. */
  const { data: antes } = await supabase.from("postulaciones")
    .select("materiales").eq("id", postulacionId).maybeSingle();
  const prev: Record<string, string> = (antes?.materiales as any) || {};

  /* El `.select()` no es decorativo: si una política de RLS impide el UPDATE,
     PostgREST no devuelve error — afecta cero filas y responde OK. Sin exigir
     que la fila vuelva, escribiríamos en la bitácora un cambio que nunca
     ocurrió, que es peor que no escribir nada. */
  const { data: post, error } = await supabase.from("postulaciones")
    .update({ materiales: limpio }).eq("id", postulacionId).select("id");
  if (error) return { error: error.message };
  if (!post?.length) return { error: "No se guardó: no tienes permiso para editar esta postulación." };

  // Mismo criterio que el resto de la bitácora, pero SIN recortar URLs: el
  // historial las muestra como botón y un link truncado no abre.
  const vis = (v: any) => {
    const s = String(v ?? "").trim();
    if (!s) return "—";
    if (/^https?:\/\/\S+$/.test(s)) return s;
    return s.length > 70 ? s.slice(0, 70) + "…" : s;
  };
  const cambios = [...new Set([...Object.keys(prev), ...Object.keys(limpio)])]
    .filter(k => String(prev[k] ?? "") !== String(limpio[k] ?? ""))
    .map(k => ({ campo: k, de: vis(prev[k]), a: vis(limpio[k]) }));

  if (cambios.length) {
    /* El mensaje dice el HECHO, no la cuenta: sumar un cronograma, cambiarle
       el link o quitarlo son tres cosas distintas y «actualizó 1 campo» las
       tapa a las tres. Con varios a la vez ya no hay verbo único y ahí sí
       toca contar. */
    const sumo = cambios.filter(c => c.de === "—");
    const quito = cambios.filter(c => c.a === "—");
    const mensaje =
      cambios.length > 1 ? `actualizó el expediente · ${cambios.length} cambios`
      : sumo.length ? `sumó ${cambios[0].campo} al expediente`
      : quito.length ? `quitó ${cambios[0].campo} del expediente`
      : `cambió el link de ${cambios[0].campo}`;
    await supabase.from("actividad").insert({
      entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id,
      tipo: "editado", detalle: { mensaje, cambios },
    });
  }
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

export async function asignarClienteProyecto(proyectoId: string, personaId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("proyectos")
    .update({ cliente_id: personaId }).eq("id", proyectoId);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/proyecto/${proyectoId}`);
  return {};
}

/* --- CRONOGRAMA: el plan produce el trabajo ---
   Un cronograma puede colgar de un proyecto, una convocatoria O una
   postulación (cada postulación arma el suyo, independiente). El dueño se
   pasa como `dueno` y aquí se traduce a su columna. */
type DuenoCrono = "proyecto" | "convocatoria" | "postulacion";
/* Las clases válidas de una actividad del cronograma. Antes esto era un
   ternario —«si no es hito_externo, es trabajo»— y con dos valores funcionaba.
   Al aparecer el tercero («continua»), ese ternario lo convertía en «trabajo»
   al guardar: el formulario lo mostraba elegido, la acción respondía OK y el
   valor se perdía por el camino. Una lista blanca no se olvida de crecer.
   Lo que NO esté aquí cae a `trabajo`, que es el valor seguro: se materializa,
   se ve y alguien lo corrige. */
const CLASES_ACT = ["trabajo", "hito_externo", "continua"];
const claseVal = (c?: string | null) =>
  CLASES_ACT.includes(String(c || "")) ? String(c) : "trabajo";

const colCrono = (d: DuenoCrono) =>
  d === "proyecto" ? "proyecto_id" : d === "convocatoria" ? "convocatoria_id" : "postulacion_id";

/* En QUÉ columna vive el responsable, según de quién cuelgue el cronograma.
   El de un proyecto o una convocatoria es trabajo interno: lo lleva alguien con
   cuenta (`perfiles`). El de una POSTULACIÓN lo ejecuta el equipo que se
   presenta al concurso, que sale de postulacion_equipo → `personas` y en buena
   parte no tiene cuenta (colaboradores eventuales). Ver
   db/crono-responsable-persona.sql. La fila usa una columna o la otra, nunca
   las dos: por eso se limpia la que no toca. */
const colResp = (d: DuenoCrono) =>
  d === "postulacion" ? "responsable_persona" : "responsable";
const campoResp = (d: DuenoCrono, valor: string | null) =>
  d === "postulacion"
    ? { responsable_persona: valor || null, responsable: null }
    : { responsable: valor || null, responsable_persona: null };

export async function agregarActividadCrono(
  dueno: DuenoCrono, duenoId: string,
  d: { nombre: string; etapa: string; ini: string; fin: string;
       responsable: string; antic: string; clase: string; descripcion?: string; equipo?: string[]; }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!d.nombre.trim() || !d.ini) return { error: "Nombre y fecha de inicio son obligatorios." };
  /* Orden = al final de su etapa (max + 10). Como el orden manual manda dentro
     de la etapa, una actividad nueva sin orden (0) saltaría al TOPE de una
     etapa ya ordenada a mano. Se anexa al final —es lo que uno espera al
     «agregar»— y de ahí se arrastra con las flechas si va en otro sitio. */
  const colDueno = colCrono(dueno);
  /* `.eq(col, null)` NO matchea NULL en PostgREST (hay que usar `.is`). La
     etapa siempre viene del <select>, pero se blinda por si acaso. */
  let qUlt = supabase.from("cronograma_actividades")
    .select("orden").eq(colDueno, duenoId).neq("estado", "cancelada");
  qUlt = d.etapa ? qUlt.eq("etapa", d.etapa) : qUlt.is("etapa", null);
  const { data: ultima } = await qUlt.order("orden", { ascending: false }).limit(1).maybeSingle();
  const orden = ((ultima?.orden ?? 0) as number) + 10;
  // Equipo de apoyo: sin duplicados y sin el responsable (es líder, no apoyo).
  const equipo = [...new Set((d.equipo || []).filter(id => id && id !== d.responsable))];
  const { error } = await supabase.from("cronograma_actividades").insert({
    [colDueno]: duenoId,
    nombre: d.nombre.trim(),
    etapa: d.etapa || null,
    clase: claseVal(d.clase),
    fecha_inicio: d.ini,
    fecha_fin: d.fin || d.ini,
    ...campoResp(dueno, d.responsable),
    descripcion: d.descripcion?.trim() || null,
    equipo: equipo.length ? equipo : null,
    /* `|| DEF` no: un 0 es una elección válida —«ábrelo el día que
       empieza»— y con `||` se convertía en el valor por defecto. */
    dias_anticipacion: Number.isFinite(parseInt(d.antic)) ? parseInt(d.antic) : DIAS_AVISO_DEF,
    orden,
    estado: "planificada",
    creado_por: user.id,
  });
  if (error) return { error: error.message };
  /* Queda en el historial de la ficha, con nombre —igual que una edición. El
     trigger de la BD ya deja un «creado» genérico contra la actividad; la página
     lo oculta para no duplicar, y muestra este, que sí dice cuál. */
  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "creado",
    detalle: { mensaje: `creó la actividad «${d.nombre.trim()}» del cronograma` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

/* ── Plantillas de cronograma ──
 *
 * «Las coberturas generalmente son las mismas.» Y lo son: P-086 tiene siete
 * actividades que se van a repetir en la próxima y en la siguiente.
 *
 * La plantilla NO se teclea: se guarda desde un cronograma que ya funcionó.
 * Pedirle a alguien que reescriba lo que ya está escrito, calculando los
 * offsets de cabeza, es pedirle que se equivoque.
 *
 * Y no guarda fechas: guarda DESPLAZAMIENTOS desde la primera actividad. Un
 * cronograma con fechas solo sirve para el proyecto que lo tuvo; con
 * desplazamientos sirve para todos los que vengan.
 */
export async function guardarComoPlantilla(
  dueno: DuenoCrono, duenoId: string, nombre: string, tipoProyecto: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const nom = nombre.trim();
  if (!nom) return { error: "Ponle un nombre a la plantilla." };

  const col = colCrono(dueno);
  const { data: acts } = await supabase.from("cronograma_actividades")
    .select("nombre,etapa,clase,fecha_inicio,fecha_fin,responsable,dias_anticipacion,orden,creado_en")
    .eq(col, duenoId).neq("estado", "cancelada").not("fecha_inicio", "is", null)
    .order("fecha_inicio").order("orden").order("creado_en");
  const l = acts || [];
  if (!l.length) return { error: "Este cronograma no tiene actividades que guardar." };

  /* La primera actividad es el día 0. No el rodaje ni la entrega: la primera.
     Es lo más simple de explicar y no decide por nadie cuál fecha «manda» —
     al aplicarla eliges cuándo empieza y todo lo demás se acomoda. */
  const D = 86400000;
  const dia = (s: string) => new Date(s + "T12:00:00").getTime();
  const cero = dia(l[0].fecha_inicio);
  const off = (s: string) => Math.round((dia(s) - cero) / D);

  const { data: pl, error: e1 } = await supabase.from("plantillas_cronograma")
    .insert({ nombre: nom, tipo_proyecto: tipoProyecto || null }).select("id").maybeSingle();
  if (e1) return { error: e1.message };
  if (!pl) return { error: "No se creó la plantilla." };

  const filas = l.map((a: any, i: number) => ({
    plantilla_id: pl.id,
    orden: (i + 1) * 10,          // ×10: deja hueco para intercalar sin renumerar
    nombre: a.nombre,
    etapa: a.etapa,
    clase: a.clase || "trabajo",
    offset_dias: off(a.fecha_inicio),
    duracion_dias: a.fecha_fin ? Math.max(0, off(a.fecha_fin) - off(a.fecha_inicio)) : 0,
    responsable: a.responsable || null,
    dias_anticipacion: a.dias_anticipacion ?? DIAS_AVISO_DEF,
  }));
  const { error: e2 } = await supabase.from("plantilla_actividades").insert(filas);
  if (e2) {
    // Sin las actividades, la plantilla es una cáscara que va a confundir
    await supabase.from("plantillas_cronograma").delete().eq("id", pl.id);
    return { error: e2.message };
  }

  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "editado",
    detalle: { mensaje: `guardó este cronograma como plantilla «${nom}» (${filas.length} actividades)` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return { id: pl.id, n: filas.length };
}

/* Aplicar una plantilla: los desplazamientos se vuelven fechas.
   SUMA, no reemplaza: si el cronograma ya tiene algo, se agrega. Borrar lo que
   hay para poner una plantilla sería tirar trabajo por un clic. */
export async function aplicarPlantilla(
  plantillaId: string, dueno: DuenoCrono, duenoId: string, desde: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return { error: "Elige la fecha de inicio." };

  const { data: pl } = await supabase.from("plantillas_cronograma")
    .select("nombre").eq("id", plantillaId).maybeSingle();
  const { data: acts } = await supabase.from("plantilla_actividades")
    .select("*").eq("plantilla_id", plantillaId).order("orden");
  const l = acts || [];
  if (!l.length) return { error: "Esa plantilla no tiene actividades." };

  const D = 86400000;
  const base = new Date(desde + "T12:00:00").getTime();
  const fecha = (n: number) => new Date(base + n * D).toISOString().slice(0, 10);

  const filas = l.map((a: any) => ({
    [colCrono(dueno)]: duenoId,
    plantilla_act: a.id,          // de dónde nació: sirve para saber qué se cambió después
    nombre: a.nombre,
    etapa: a.etapa,
    clase: a.clase || "trabajo",
    fecha_inicio: fecha(a.offset_dias || 0),
    fecha_fin: fecha((a.offset_dias || 0) + (a.duracion_dias || 0)),
    responsable: a.responsable || null,
    dias_anticipacion: a.dias_anticipacion ?? DIAS_AVISO_DEF,
    orden: a.orden ?? 0,
    estado: "planificada",
    creado_por: user.id,
  }));
  const { error } = await supabase.from("cronograma_actividades").insert(filas);
  if (error) return { error: error.message };

  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "editado",
    detalle: { mensaje: `aplicó la plantilla «${pl?.nombre || "—"}» desde el ${desde} · ${filas.length} actividades` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return { n: filas.length };
}

export async function borrarPlantilla(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("plantillas_cronograma").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

/* Editar una actividad ya creada.
 *
 * Faltaba, y no era un olvido menor: el cronograma solo tenía `agregar`,
 * `cancelar` y `materializar`. O sea que una fecha mal puesta se arreglaba
 * cancelando la actividad y creándola de nuevo — perdiendo su historia y su
 * caso si ya se había materializado. Un cronograma de dos años que no se
 * puede corregir no se corrige: se abandona.
 */
export async function editarActividadCrono(
  actId: string, dueno: DuenoCrono, duenoId: string,
  d: { nombre: string; etapa: string; ini: string; fin: string;
       responsable: string; antic: string; clase: string; descripcion?: string; equipo?: string[]; }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!d.nombre.trim() || !d.ini) return { error: "Nombre y fecha de inicio son obligatorios." };
  const fin = d.fin || d.ini;
  if (fin < d.ini) return { error: "La fecha de fin no puede ser anterior al inicio." };
  const equipoEd = [...new Set((d.equipo || []).filter(id => id && id !== d.responsable))];

  const { data: antes } = await supabase.from("cronograma_actividades")
    .select(`nombre,etapa,clase,fecha_inicio,fecha_fin,${colResp(dueno)},dias_anticipacion`)
    .eq("id", actId).maybeSingle();

  const fila = {
    nombre: d.nombre.trim(),
    etapa: d.etapa || null,
    clase: claseVal(d.clase),
    fecha_inicio: d.ini,
    fecha_fin: fin,
    ...campoResp(dueno, d.responsable),
    descripcion: d.descripcion?.trim() || null,
    equipo: equipoEd.length ? equipoEd : null,
    /* `|| DEF` no: un 0 es una elección válida —«ábrelo el día que
       empieza»— y con `||` se convertía en el valor por defecto. */
    dias_anticipacion: Number.isFinite(parseInt(d.antic)) ? parseInt(d.antic) : DIAS_AVISO_DEF,
  };
  // El .select() otra vez: un UPDATE bloqueado por RLS no da error, afecta
  // cero filas y responde OK — y la bitácora contaría un cambio que no pasó.
  const { data: post, error } = await supabase.from("cronograma_actividades")
    .update(fila).eq("id", actId).select("id");
  if (error) return { error: error.message };
  if (!post?.length) return { error: "No se guardó: no tienes permiso para editar esta actividad." };

  /* Mover una fecha de un cronograma de dos años es una decisión, no un
     tecleo: queda escrito quién la movió y desde dónde. */
  if (antes) {
    const ETIQ: Record<string, string> = {
      nombre: "Nombre", etapa: "Etapa", clase: "Clase",
      fecha_inicio: "Inicio", fecha_fin: "Fin",
      responsable: "Responsable", dias_anticipacion: "Anticipación",
    };
    const cambios = Object.keys(fila)
      /* La descripción queda fuera del historial a propósito: es una nota
         libre que puede ser un párrafo, y volcarla como «de X → a Y» ahogaría
         las decisiones que el log SÍ debe guardar (fechas, responsable). Se
         guarda igual en la fila; solo no se cuenta como cambio registrado. */
      .filter(k => k !== "descripcion" && k !== "equipo" && String((antes as any)[k] ?? "") !== String((fila as any)[k] ?? ""))
      .map(k => ({ campo: ETIQ[k] || k, de: String((antes as any)[k] ?? "—"), a: String((fila as any)[k] ?? "—") }));
    if (cambios.length) {
      await supabase.from("actividad").insert({
        entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "editado",
        detalle: { mensaje: `cambió la actividad «${antes.nombre}» del cronograma`, cambios },
      });
    }
  }
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

/* Comparador de secuencia DENTRO de una etapa. TIENE que ser idéntico al del
   componente (CronogramaProyecto: `ordenadas`), o «subir una posición» movería
   una cosa distinta a la que se ve. El orden manual manda; la fecha es el
   desempate por defecto (una etapa recién creada, con todo en orden 0, sale
   cronológica); `creado_en` desempata el desempate. */
function cmpEtapa(a: any, b: any) {
  return (a.orden ?? 0) - (b.orden ?? 0)
    || (a.fecha_inicio < b.fecha_inicio ? -1 : a.fecha_inicio > b.fecha_inicio ? 1 : 0)
    || (a.creado_en < b.creado_en ? -1 : a.creado_en > b.creado_en ? 1 : 0);
}

/* Mover una actividad arriba o abajo DENTRO DE SU ETAPA (a cualquier fecha).
 *
 * Antes solo se movía entre las del mismo DÍA: por eso solo algunas filas
 * tenían flechas —las que compartían fecha con otra— y el resto no, que se
 * veía como un botón roto. Ahora la secuencia de la etapa es lo que manda
 * (una postproducción es Sincronización → Color → Logging →…, con fechas
 * aproximadas), y se reordena toda la etapa.
 *
 * Se renumera DENSO (10,20,30…) toda la etapa en su orden actual con la
 * permuta aplicada, y se actualiza solo lo que cambió. La primera vez que se
 * mueve algo en una etapa que estaba toda en orden 0, se numeran todas de una
 * (dejan de empatar); las siguientes veces cambian solo dos. Renumerar una
 * lista de ~15 no es una migración, y evita el lío de permutar ceros. */
export async function moverActividadCrono(
  actId: string, dueno: DuenoCrono, duenoId: string, dir: "sube" | "baja"
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const col = colCrono(dueno);
  const { data: act } = await supabase.from("cronograma_actividades")
    .select("id,etapa").eq("id", actId).maybeSingle();
  if (!act) return { error: "No se encontró la actividad." };

  // `.eq(col, null)` no matchea NULL en PostgREST → conmutar a `.is` si toca.
  let qHer = supabase.from("cronograma_actividades")
    .select("id,orden,fecha_inicio,creado_en").eq(col, duenoId).neq("estado", "cancelada");
  qHer = act.etapa ? qHer.eq("etapa", act.etapa) : qHer.is("etapa", null);
  const { data: hermanas } = await qHer;
  const l = (hermanas || []).slice().sort(cmpEtapa);
  const i = l.findIndex((x: any) => x.id === actId);
  const j = dir === "sube" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= l.length) {
    return { error: "Ya está en el extremo de su etapa. Para pasarla a otra etapa, edítala con ✎." };
  }

  // Permuta y renumera denso; actualiza solo las filas cuyo orden cambió.
  [l[i], l[j]] = [l[j], l[i]];
  const cambios = l
    .map((x: any, idx: number) => ({ id: x.id, nuevo: (idx + 1) * 10, viejo: x.orden ?? 0 }))
    .filter(u => u.nuevo !== u.viejo);
  const res = await Promise.all(cambios.map(u =>
    supabase.from("cronograma_actividades").update({ orden: u.nuevo }).eq("id", u.id).select("id")));
  const conError = res.find(r => r.error);
  if (conError?.error) return { error: conError.error.message };
  /* RLS: un UPDATE bloqueado no da error, afecta cero filas. Si la fila que se
     movió debía cambiar y no cambió, es permiso. */
  const kMovida = cambios.findIndex(u => u.id === actId);
  if (kMovida >= 0 && !res[kMovida].data?.length) {
    return { error: "No se movió: no tienes permiso para editar esta actividad." };
  }

  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

/* ── Los dos cambios «al vuelo» del cronograma ──
   Como en sub-casos: repartir responsables y ajustar fechas sin abrir el
   editor entero de la actividad. Cada uno toca UN campo. */

/* Responsable al vuelo. Se registra a mano CON NOMBRE del hito (como los demás
   cambios del cronograma); el trigger `registrar_evento_estado` deja además un
   evento genérico sin nombre que la ficha filtra para no duplicar. */
export async function asignarResponsableActividad(
  actId: string, dueno: DuenoCrono, duenoId: string, respId: string | null
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* Si el nuevo responsable estaba en el equipo de apoyo, sale de ahí: es
     líder, no apoyo — nadie debe figurar en los dos a la vez, o saldría
     duplicado en la fila. */
  const { data: act } = await supabase.from("cronograma_actividades")
    .select("nombre,equipo").eq("id", actId).maybeSingle();
  const equipo = ((act?.equipo as string[] | null) || []).filter(id => id && id !== respId);
  const { data, error } = await supabase.from("cronograma_actividades")
    .update({ ...campoResp(dueno, respId), equipo: equipo.length ? equipo : null })
    .eq("id", actId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
  if (act) await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "editado",
    detalle: { mensaje: `${respId ? "cambió" : "quitó"} el responsable de la actividad «${act.nombre}» del cronograma` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

/* Fecha al vuelo. Edita el INICIO —la fecha por la que se ordena y se lee la
   lista— y arrastra el fin: si la actividad era de un día (inicio = fin), el
   fin sigue al inicio; si era de varios, solo se mueve el fin cuando quedaría
   antes del nuevo inicio. El fin fino se sigue tocando con el editor ✎.
   La fecha SÍ se registra a mano: el trigger no vigila fechas, y mover una
   fecha de un cronograma es una decisión, no un tecleo — igual que en el
   editor completo. */
export async function cambiarFechaActividad(
  actId: string, dueno: DuenoCrono, duenoId: string, fecha: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!fecha) return { error: "Falta la fecha." };

  const { data: antes } = await supabase.from("cronograma_actividades")
    .select("nombre,fecha_inicio,fecha_fin").eq("id", actId).maybeSingle();
  if (!antes) return { error: "No se encontró la actividad." };

  const eraUnDia = !antes.fecha_fin || antes.fecha_fin === antes.fecha_inicio;
  const nuevoFin = eraUnDia ? fecha : (antes.fecha_fin < fecha ? fecha : antes.fecha_fin);

  const { data, error } = await supabase.from("cronograma_actividades")
    .update({ fecha_inicio: fecha, fecha_fin: nuevoFin }).eq("id", actId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };

  if (antes.fecha_inicio !== fecha) {
    await supabase.from("actividad").insert({
      entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "editado",
      detalle: {
        mensaje: `movió la actividad «${antes.nombre}» del cronograma`,
        cambios: [{ campo: "Inicio", de: antes.fecha_inicio ?? "—", a: fecha }],
      },
    });
  }
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

/* Equipo de apoyo al vuelo. Recibe la lista COMPLETA (el componente arma el
   arreglo con la persona agregada o quitada) y la fija. `perfiles.equipo` no
   lo vigila el trigger de bitácora, y es un detalle de planificación —quién
   más ayuda—, no una decisión de estado: no se registra a mano. */
export async function fijarEquipoActividad(
  actId: string, dueno: DuenoCrono, duenoId: string, equipo: string[]
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: act } = await supabase.from("cronograma_actividades")
    .select("nombre").eq("id", actId).maybeSingle();
  const limpio = [...new Set((equipo || []).filter(Boolean))];
  const { data, error } = await supabase.from("cronograma_actividades")
    .update({ equipo: limpio.length ? limpio : null }).eq("id", actId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
  if (act) await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "editado",
    detalle: { mensaje: `cambió el equipo de apoyo de la actividad «${act.nombre}» del cronograma` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

/* LA FOTO DE LO POSTULADO. Congela en la postulación el cronograma tal como
   está ahora —lo que se envía a DAFO—. El vivo (cronograma_actividades) sigue
   editándose; esto es el registro de lo presentado, para el expediente y para
   comparar después qué cambió si se gana el fondo. */
export async function fijarCronogramaPostulado(postulacionId: string, rehacer = false) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  /* ── LA FOTO NO SE PISA SIN DECIRLO ──
     Regla del negocio, dicha así: «luego de postular, la foto final no cambia
     para nada ni por ningún motivo». Es la prueba de qué cronograma se presentó
     a DAFO — si el fondo se gana, el cronograma vivo se mueve por mil razones
     (recomendaciones del jurado, el dinero que tarda en llegar al banco, la
     realidad de rodar un documental) y la única forma de saber qué se prometió
     es esta foto.
     Y sin embargo el botón decía «Volver a fijar» y la pisaba en un clic, sin
     preguntar y sin guardar la anterior. Ahora hay que pedirlo aparte. */
  if (!rehacer) {
    const { data: ya } = await supabase.from("postulaciones")
      .select("cronograma_postulado_en").eq("id", postulacionId).maybeSingle();
    if (ya?.cronograma_postulado_en) {
      const f = new Date(ya.cronograma_postulado_en).toLocaleDateString("es-PE",
        { day: "numeric", month: "long", year: "numeric" });
      return { error: `Ya hay una foto fijada el ${f}: es lo que fue a DAFO y no se cambia. Si de verdad hay que rehacerla, confirma la advertencia.` };
    }
  }

  /* El responsable sale de `responsable_persona` (el equipo que postula), no de
     `perfiles`: ver db/crono-responsable-persona.sql. Con el select viejo la
     foto guardaba `responsable: null` en TODAS las actividades — y una foto sin
     responsables no sirve como prueba de nada. */
  const { data: acts } = await supabase.from("cronograma_actividades")
    .select("nombre,etapa,fecha_inicio,fecha_fin,descripcion,respP:personas!responsable_persona(nombre,alias)")
    .eq("postulacion_id", postulacionId).neq("estado", "cancelada").not("fecha_inicio", "is", null)
    .order("etapa").order("orden").order("fecha_inicio").order("creado_en");
  const foto = (acts || []).map((a: any) => ({
    nombre: a.nombre, etapa: a.etapa,
    fecha_inicio: a.fecha_inicio, fecha_fin: a.fecha_fin,
    responsable: (a.respP as any)?.alias || (a.respP as any)?.nombre || null,
    descripcion: a.descripcion || null,
  }));
  if (!foto.length) return { error: "El cronograma está vacío — arma al menos una actividad antes de fijar." };
  const { data, error } = await supabase.from("postulaciones")
    .update({ cronograma_postulado: foto, cronograma_postulado_en: new Date().toISOString() })
    .eq("id", postulacionId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
  // Hito en la bitácora: presentar el cronograma es una decisión, no un tecleo.
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "editado",
    detalle: { mensaje: rehacer
      ? `📸 REHÍZO el cronograma postulado (${foto.length} actividades) — la foto anterior se perdió`
      : `📸 fijó el cronograma postulado (${foto.length} actividades)` },
  });
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

/* ── Historial de VERSIONES del fondo (presupuesto · cronograma) ──
   El presupuesto y el cronograma cambian a lo largo del fondo (desgloses,
   reformulaciones, prórroga). Cada foto se guarda como versión, con etiqueta y
   motivo; una es la VIGENTE (contra la que se rinde). Solo administración. */
const ETIQUETAS_VERSION = ["Postulado", "Reformulado", "Prórroga", "Otro"];

async function fotoVivaDelFondo(supabase: any, postulacionId: string, tipo: string) {
  if (tipo === "presupuesto") {
    const { data } = await supabase.from("postulaciones").select("presupuesto").eq("id", postulacionId).maybeSingle();
    const pre = data?.presupuesto;
    if (!pre?.items?.length) return { error: "El presupuesto está vacío — arma al menos un ítem antes de guardar una versión." };
    return { datos: pre };
  }
  // cronograma: se captura de las filas vivas (mismo shape que la foto vieja)
  const { data: acts } = await supabase.from("cronograma_actividades")
    .select("nombre,etapa,fecha_inicio,fecha_fin,descripcion,resp:perfiles!responsable(nombre)")
    .eq("postulacion_id", postulacionId).neq("estado", "cancelada").not("fecha_inicio", "is", null)
    .order("etapa").order("orden").order("fecha_inicio").order("creado_en");
  const foto = (acts || []).map((a: any) => ({
    nombre: a.nombre, etapa: a.etapa, fecha_inicio: a.fecha_inicio, fecha_fin: a.fecha_fin,
    responsable: (a.resp as any)?.nombre || null, descripcion: a.descripcion || null,
  }));
  if (!foto.length) return { error: "El cronograma está vacío — arma al menos una actividad antes de guardar una versión." };
  return { datos: foto };
}

export async function guardarVersionFondo(f: {
  postulacionId: string; tipo: string; etiqueta: string; motivo: string; vigente: boolean;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración guarda versiones." };
  if (!["presupuesto", "cronograma"].includes(f.tipo)) return { error: "Tipo inválido." };
  const etiqueta = ETIQUETAS_VERSION.includes(f.etiqueta) ? f.etiqueta : "Otro";

  const foto: any = await fotoVivaDelFondo(supabase, f.postulacionId, f.tipo);
  if (foto.error) return { error: foto.error };

  /* Se inserta SIEMPRE como no vigente (así nunca choca con el índice único de
     «una sola vigente»), y solo después —si toca— se promueve. De este modo,
     si el insert falla, la vigente anterior no queda demovida a la nada. */
  const { data: ins, error } = await supabase.from("version_fondo").insert({
    postulacion_id: f.postulacionId, tipo: f.tipo, etiqueta, motivo: f.motivo.trim() || null,
    datos: foto.datos, vigente: false, creado_por: user.id,
  }).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!ins?.id) return { error: "No se guardó la versión." };
  if (f.vigente) {
    await supabase.from("version_fondo").update({ vigente: false })
      .eq("postulacion_id", f.postulacionId).eq("tipo", f.tipo);
    await supabase.from("version_fondo").update({ vigente: true }).eq("id", ins.id);
  }
  revalidatePath(`/fondo/${f.postulacionId}`);
  return {};
}

export async function marcarVersionVigente(id: string, postulacionId: string, tipo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración cambia la versión vigente." };
  // La versión objetivo debe existir ANTES de bajar las demás (si no, el grupo
  // quedaría sin ninguna vigente).
  const { data: tgt } = await supabase.from("version_fondo").select("id")
    .eq("id", id).eq("postulacion_id", postulacionId).eq("tipo", tipo).maybeSingle();
  if (!tgt?.id) return { error: "No se encontró la versión a marcar." };
  await supabase.from("version_fondo").update({ vigente: false })
    .eq("postulacion_id", postulacionId).eq("tipo", tipo);
  const { error } = await supabase.from("version_fondo").update({ vigente: true }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

export async function borrarVersionFondo(id: string, postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo administración borra versiones." };
  const { data: prev } = await supabase.from("version_fondo").select("tipo,vigente").eq("id", id).maybeSingle();
  const { error } = await supabase.from("version_fondo").delete().eq("id", id);
  if (error) return { error: error.message };
  // Si se borró la vigente, se promueve la más reciente que quede de ese tipo,
  // para que el fondo no quede sin versión contra la cual comparar/rendir.
  if (prev?.vigente) {
    const { data: sig } = await supabase.from("version_fondo").select("id")
      .eq("postulacion_id", postulacionId).eq("tipo", prev.tipo)
      .order("creado_en", { ascending: false }).limit(1).maybeSingle();
    if (sig?.id) await supabase.from("version_fondo").update({ vigente: true }).eq("id", sig.id);
  }
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

export async function cancelarActividadCrono(actId: string, dueno: string, duenoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: antes } = await supabase.from("cronograma_actividades")
    .select("nombre").eq("id", actId).maybeSingle();
  const { error } = await supabase.from("cronograma_actividades")
    .update({ estado: "cancelada" }).eq("id", actId);
  if (error) return { error: error.message };
  // Log con nombre (el trigger deja un estado genérico que la ficha filtra).
  if (antes) await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "editado",
    detalle: { mensaje: `canceló la actividad «${antes.nombre}» del cronograma` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

export async function materializarActividad(actId: string, dueno: string, duenoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: act } = await supabase.from("cronograma_actividades")
    .select("*, proyecto:proyectos(nombre), convocatoria:convocatorias(codigo,nombre), postulacion:postulaciones(codigo)")
    .eq("id", actId).single();
  if (!act || act.estado !== "planificada") return { error: "La actividad ya no está planificada." };

  const esHito = act.clase === "hito_externo";
  const contexto = (act.proyecto as any)?.nombre
    || `${(act.convocatoria as any)?.codigo || ""} ${(act.convocatoria as any)?.nombre || ""}`.trim()
    || (act.postulacion as any)?.codigo
    || "el cronograma";

  /* El equipo de apoyo viaja al caso: el responsable es quien rinde cuentas
     (va en `responsable`), pero el caso debe decir con quién MÁS se hace, o se
     pierde al materializar. Van al cuerpo (no como vínculos: el equipo son
     ids de perfiles, y los vínculos-persona apuntan a la tabla `personas`,
     que es otra cosa) y se les notifica. */
  const equipoIds = ((act.equipo as string[] | null) || []).filter(Boolean);
  let equipoTxt = "";
  if (equipoIds.length) {
    const { data: eqs } = await supabase.from("perfiles").select("id,nombre").in("id", equipoIds);
    const nombres = (eqs || []).map((p: any) => p.nombre).filter(Boolean);
    if (nombres.length) equipoTxt = ` 👥 Equipo de apoyo: ${nombres.join(", ")}.`;
  }

  const { data: pub, error } = await supabase.from("publicaciones").insert({
    autor_id: user.id,
    responsable: act.responsable || null,
    tipo: esHito ? "aviso" : "tarea",
    titulo: esHito ? `🏛 ${act.nombre}` : act.nombre,
    cuerpo: (esHito
      ? `Hito del concurso (${contexto}): ${act.fecha_inicio}${act.fecha_fin && act.fecha_fin !== act.fecha_inicio ? ` → ${act.fecha_fin}` : ""}. Fecha fijada por la institución — dar seguimiento.`
      : `Generada desde el cronograma de ${contexto}. Ventana planificada: ${act.fecha_inicio} → ${act.fecha_fin || "—"}.`) + equipoTxt,
    estado: "en_progreso",
    fecha_limite: act.fecha_fin || act.fecha_inicio,
  }).select("id").single();
  if (error) return { error: error.message };

  await supabase.from("publicacion_vinculos").insert({
    publicacion_id: pub.id,
    entidad_tipo: dueno,
    entidad_id: duenoId,
  });
  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion", entidad_id: pub.id, tipo: "bot",
    detalle: { mensaje: "Caso creado desde el cronograma", regla: "cronograma" },
  });
  await supabase.from("cronograma_actividades")
    .update({ estado: "materializada", publicacion_id: pub.id }).eq("id", actId);

  /* Materializar lo dispara una PERSONA (clic en "Materializar"), no el cron.
     Por eso lleva actor_nombre: sin él, la notificación caería como "del Bot" y
     no sumaría al timbre —al asignado podría pasársele que le encargaron algo—. */
  const { data: miMat } = await supabase.from("perfiles").select("nombre").eq("id", user.id).single();
  const actorMat = miMat?.nombre || "Alguien";
  if (act.responsable && act.responsable !== user.id) {
    await supabase.from("notificaciones").insert({
      usuario_id: act.responsable, publicacion_id: pub.id, actor_nombre: actorMat,
      tipo: "asignacion", mensaje: `📅 Del cronograma: «${act.nombre}»`,
    });
  }
  // Al equipo de apoyo también se le avisa — sin repetir al que lo hizo ni al
  // responsable (que ya recibió la suya arriba).
  const equipoAvisar = equipoIds.filter(id => id !== user.id && id !== act.responsable);
  if (equipoAvisar.length) {
    await supabase.from("notificaciones").insert(equipoAvisar.map(id => ({
      usuario_id: id, publicacion_id: pub.id, actor_nombre: actorMat,
      tipo: "asignacion", mensaje: `📅 Del cronograma, en el equipo de: «${act.nombre}»`,
    })));
  }
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  revalidatePath("/");
  return {};
}

/* ¿Ya existe alguien parecido? Detector de duplicados al crear entidades,
   con conciencia quechua (Huaman encuentra a Waman). */
export async function buscarParecidos(tipo: string, nombre: string) {
  const conf = FORM_CONF[tipo];
  if (!conf) return { parecidos: [] };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { parecidos: [] };
  const n = nombre.trim();
  if (n.length < 4) return { parecidos: [] };

  const { data } = await supabase.from(conf.tabla).select("id,nombre").limit(1000);
  const palabras = nrmQ(n).split(/\s+/).filter(w => w.length >= 3);
  if (!palabras.length) return { parecidos: [] };
  const minimo = Math.min(2, palabras.length);

  const parecidos = (data || [])
    .map((r: any) => {
      const hw = nrmQ(r.nombre || "").split(/\s+/);
      const s = palabras.filter(p => hw.some(w => w === p || w.startsWith(p) || p.startsWith(w))).length;
      return { id: r.id, nombre: r.nombre, s };
    })
    .filter(r => r.s >= minimo)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(({ id, nombre: nom }) => ({ id, nombre: nom }));
  return { parecidos };
}

/* ===== RONDA DE LINKS: ¿los documentos invocados de Drive siguen vivos? =====
   Un 404 es un link definitivamente muerto (archivo borrado o URL mal
   pegada). Un error de red se reporta como "sin respuesta" (dudoso). */
export async function verificarLinksDrive() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const FUENTES: [string, string, string[]][] = [
    ["proyecto", "proyectos", ["carpeta_drive_url", "presupuesto_url"]],
    ["empresa", "empresas", ["carpeta_drive_url", "renca_url", "vigencia_poder_url"]],
    ["persona", "personas", ["carpeta_drive_url", "cv_url", "dni_url", "firma_url"]],
    ["convocatoria", "convocatorias", ["bases_url", "carpeta_drive_url"]],
    ["postulacion", "postulaciones", ["acta_url", "matriz_jurado_url", "carpeta_drive_url"]],
    ["equipamiento", "equipamiento", ["link"]],
  ];

  type LinkReg = { tipo: string; id: string; nombre: string; campo: string; url: string };
  const links: LinkReg[] = [];
  for (const [tipo, tabla, campos] of FUENTES) {
    const { data } = await supabase.from(tabla).select(`id,nombre,${campos.join(",")}`).limit(500);
    (data || []).forEach((r: any) => {
      campos.forEach(c => {
        const u = (r[c] || "").trim();
        if (/^https?:\/\//.test(u)) links.push({ tipo, id: r.id, nombre: r.nombre, campo: c, url: u });
      });
    });
  }
  // materiales de postulaciones (JSON flexible)
  const { data: posts } = await supabase.from("postulaciones")
    .select("id,materiales,proy:proyectos(nombre)").not("materiales", "eq", "{}");
  (posts || []).forEach((p: any) => {
    Object.entries(p.materiales || {}).forEach(([campo, u]: any) => {
      if (/^https?:\/\//.test(String(u).trim()))
        links.push({ tipo: "postulacion", id: p.id, nombre: p.proy?.nombre || "postulación", campo: `material: ${campo}`, url: String(u).trim() });
    });
  });

  const probar = async (l: LinkReg) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(l.url, { method: "GET", redirect: "follow", signal: ctrl.signal });
      clearTimeout(t);
      return { ...l, estado: r.ok ? "ok" : `error ${r.status}` };
    } catch {
      return { ...l, estado: "sin respuesta" };
    }
  };

  const resultados: any[] = [];
  for (let i = 0; i < links.length; i += 8) {
    resultados.push(...await Promise.all(links.slice(i, i + 8).map(probar)));
  }
  const rotos = resultados.filter(r => r.estado !== "ok")
    .map(({ tipo, id, nombre, campo, estado, url }) => ({ tipo, id, nombre, campo, estado, url }));
  return { revisados: links.length, rotos };
}

/* Del hallazgo a la acción: convierte una alerta de Qhaway en caso
   urgente (❗ prioridad alta) vinculado a la entidad. Si ya existe un
   caso abierto con el mismo título, lleva ahí en vez de duplicar. */
export async function crearCasoUrgente(titulo: string, cuerpo: string, entTipo: string, entId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: ya } = await supabase.from("publicaciones")
    .select("id").eq("titulo", titulo)
    .in("estado", ["abierta", "en_progreso", "seguimiento"])
    .limit(1).maybeSingle();
  if (ya) return { id: ya.id, yaExistia: true };

  const { data: pub, error } = await supabase.from("publicaciones").insert({
    autor_id: user.id, tipo: "problema", titulo, cuerpo,
    prioridad: "alta", estado: "abierta",
  }).select("id").single();
  if (error) return { error: error.message };

  await supabase.from("publicacion_vinculos").insert({
    publicacion_id: pub.id, entidad_tipo: entTipo, entidad_id: entId,
  });
  revalidatePath("/");
  return { id: pub.id };
}

/* ===== VERIFICACIÓN SUNAT AUTOMÁTICA (API de consulta RUC) =====
   La lógica vive en lib/sunat.ts (reutilizada por el cron semanal).
   Aquí solo los envoltorios con sesión de usuario. */

export async function verificarRucSunat(empresaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: emp } = await supabase.from("empresas")
    .select("id,nombre,ruc,estado,relacion,estado_sunat,condicion_sunat").eq("id", empresaId).single();
  if (!emp?.ruc) return { error: "Esta empresa no tiene RUC registrado." };

  // El caso que se genere lo firma el usuario que verifica (evita chocar
  // con RLS de autor); el cron sí lo firma el bot.
  const r: any = await procesarSunatEmpresa(supabase, emp as any, user.id, true);
  if (r.error) return { error: r.error };
  revalidatePath(`/entidad/empresa/${empresaId}`);
  return { estado: r.estado, condicion: r.condicion, cambio: r.cambio };
}

/* Verifica en SUNAT el RUC de una persona natural. El RUC no se guarda:
   se deduce del DNI. Si no está inscrita, SUNAT no la encuentra y eso
   también es información útil. */
export async function verificarRucPersona(personaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: per } = await supabase.from("personas")
    .select("id,nombre,ruc_dni,estado_sunat,condicion_sunat").eq("id", personaId).single();

  const ruc = rucDePersona(per?.ruc_dni);
  if (!ruc) return { error: "Necesita un DNI de 8 dígitos para calcular su RUC." };

  const r = await consultarRucApi(ruc);
  if (r.error) return { error: r.error };

  const hoy = hoyLima();
  const { error } = await supabase.from("personas").update({
    estado_sunat: r.estado || null,
    condicion_sunat: r.condicion || null,
    fecha_verificacion_sunat: hoy,
  }).eq("id", personaId);
  if (error) return { error: error.message };

  const cambio = (per?.estado_sunat || null) !== (r.estado || null)
    || (per?.condicion_sunat || null) !== (r.condicion || null);
  // Esto siempre lo aprieta una persona: siempre deja rastro, y firmado.
  // Antes solo registraba si cambió algo, así que verificar y salir todo
  // bien no dejaba constancia de que se revisó.
  await supabase.from("actividad").insert({
    entidad_tipo: "persona", entidad_id: personaId, actor_id: user.id, tipo: "dato",
    detalle: {
      mensaje: `verificó en SUNAT (RUC ${ruc}): ${(r.estado || "—").replace(/_/g, " ")} · ${(r.condicion || "—").replace(/_/g, " ")}${cambio ? " (¡cambió!)" : " (sin cambios)"}`,
      regla: "sunat_api",
    },
  });
  revalidatePath(`/entidad/persona/${personaId}`);
  return { ruc, estado: r.estado, condicion: r.condicion, cambio };
}

export async function verificarSunatLote() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const res = await correrRondaSunat(supabase, user.id);
  revalidatePath("/empresas");
  return { ok: res.ok, alertas: res.alertas, fallas: res.fallas.slice(0, 5) };
}

/* Consulta RENIEC: el nombre oficial detrás de un DNI (mismo token) */
export async function verificarDniReniec(personaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const token = process.env.SUNAT_API_TOKEN;
  if (!token) return { error: "Falta configurar SUNAT_API_TOKEN en el entorno." };

  const { data: per } = await supabase.from("personas")
    .select("id,nombre,ruc_dni").eq("id", personaId).single();
  const dni = String(per?.ruc_dni || "").replace(/\D/g, "");
  if (dni.length !== 8) return { error: "El campo RUC/DNI no contiene un DNI de 8 dígitos." };

  try {
    const r = await fetch(`https://api.decolecta.com/v1/reniec/dni?numero=${dni}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      if (r.status === 401 || r.status === 429) {
        return { error: `Límite del plan de decolecta alcanzado (${r.status}) — revisa tu cupo mensual de consultas.` };
      }
      const cuerpo = await r.text().catch(() => "");
      return { error: `RENIEC respondió ${r.status} para DNI ${dni}${cuerpo ? ` · ${cuerpo.slice(0, 120)}` : ""}` };
    }
    const d: any = await r.json();
    const nombreReniec = (d.full_name && String(d.full_name).trim())
      || [d.first_name || d.nombres, d.first_last_name || d.apellidoPaterno, d.second_last_name || d.apellidoMaterno]
        .filter(Boolean).join(" ").trim();
    if (!nombreReniec) return { error: "RENIEC no devolvió nombre para ese DNI." };

    // ¿Coincide con lo registrado? (tolerante a orden y ortografía andina)
    const palabras = nrmQ(nombreReniec).split(/\s+/).filter(w => w.length >= 3);
    const registrado = nrmQ(per!.nombre || "");
    const aciertos = palabras.filter(w => registrado.includes(w)).length;
    const coincide = aciertos >= Math.min(2, palabras.length);

    /* Guardar la consulta, no solo contarla. Antes esto únicamente escribía
       en el historial: para saber cuándo se verificó por última vez había
       que bucear en la bitácora, y el nombre oficial se perdía apenas se
       cerraba el aviso. */
    const hoy = hoyLima();
    await supabase.from("personas").update({
      fecha_verificacion_reniec: hoy,
      nombre_reniec: nombreReniec,
    }).eq("id", personaId);

    await supabase.from("actividad").insert({
      // Esto siempre lo aprieta una persona: va firmado, como el de SUNAT
      entidad_tipo: "persona", entidad_id: personaId, actor_id: user.id, tipo: "dato",
      detalle: { mensaje: `verificó el DNI en RENIEC: «${nombreReniec}»${coincide ? " ✔ coincide" : " ⚠ NO coincide con lo registrado"}`, regla: "reniec_api" },
    });
    revalidatePath(`/entidad/persona/${personaId}`);
    return { nombreReniec, coincide };
  } catch (e: any) {
    return { error: "No se pudo consultar RENIEC: " + (e?.message || "error de red") };
  }
}

/* Ronda de comprobación: "vi este equipo hoy, existe y está bien" */
export async function comprobarEquipo(equipoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const hoy = hoyLima();
  const { error } = await supabase.from("equipamiento")
    .update({ ultima_comprobacion: hoy }).eq("id", equipoId);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: "equipamiento", entidad_id: equipoId, tipo: "edicion", actor_id: user.id,
    detalle: { mensaje: "comprobación física: el equipo existe y está conforme ✔" },
  });
  revalidatePath("/equipamiento");
  revalidatePath(`/entidad/equipamiento/${equipoId}`);
  return {};
}

/* ===== PRÉSTAMOS DE EQUIPOS: los recursos pasan de mano en mano =====
   El estado dice QUÉ (en_uso); el préstamo dice QUIÉN, DESDE CUÁNDO y
   PARA QUÉ proyecto. Cerrar el préstamo devuelve el equipo a disponible. */
export async function prestarEquipo(
  equipoId: string, personaId: string, proyectoId: string | null, nota: string,
  /* PRESTAR o ASIGNAR. Es la misma custodia —quién lo tiene, desde cuándo,
     quién se lo dio— y por eso la misma tabla y la misma función; lo que
     cambia es si se espera que vuelva. Ver db/asignacion.sql. */
  tipo: "prestamo" | "asignacion" = "prestamo",
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  /* NO SALE LO QUE NO PUEDE SALIR. La entrega en lote releía el estado en el
     servidor antes de prestar; esta —la de la ficha, «🤝 Poner en uso»— no
     comprobaba nada: se podía poner en uso una cámara perdida, una en
     reparación o una sin estado, y el propio préstamo la dejaba «en uso»,
     borrando el estado que avisaba del problema.
     El estado se relee aquí y no se confía en el que vio el navegador: pudo
     entrar a reparación mientras la pestaña estaba abierta. */
  const { data: eqAhora } = await supabase.from("equipamiento")
    .select("estado").eq("id", equipoId).single();
  if (!entregableEq(eqAhora?.estado)) {
    return { error: `No se puede poner en uso: ${porQueNoEq(eqAhora?.estado)}.` };
  }

  // Si alguien más lo tenía, ese préstamo se cierra hoy
  await supabase.from("equipo_prestamos")
    .update({ hasta: hoyLima() })
    .eq("equipamiento_id", equipoId).is("hasta", null);

  const { error } = await supabase.from("equipo_prestamos").insert({
    equipamiento_id: equipoId, persona_id: personaId,
    proyecto_id: proyectoId || null, nota: nota.trim() || null,
    tipo,
    /* Quién lo dio. Una entrega la hacen dos personas y hasta ahora solo se
       guardaba una: cuando algo no aparece y quien lo tiene dice que no se lo
       llevó, sin este dato no hay a quién más preguntar. */
    entregado_por: user.id,
  });
  if (error) {
    if (/tipo/.test(error.message)) return { error: "Falta correr db/asignacion.sql en Supabase." };
    return { error: error.message };
  }

  const { error: e2 } = await supabase.from("equipamiento")
    .update({ estado: tipo === "asignacion" ? "asignado" : "en_uso" }).eq("id", equipoId);
  if (e2) return { error: "Registrado, pero el estado no se actualizó: " + e2.message };
  revalidatePath(`/entidad/equipamiento/${equipoId}`);
  revalidatePath("/equipamiento");
  return {};
}

/* ===== VISTAS DE TABLA GUARDADAS =====
 * Se reaprovecha `vistas_guardadas`, que existía desde el primer esquema sin
 * usarse. `usuario_id` null = compartida con el equipo; con id = privada de
 * quien la creó, que es lo que esa columna ya significaba.
 * Requiere haber corrido db/vistas-tabla.sql.
 */
export async function guardarVista(
  entidad: string, nombre: string, config: any, compartida: boolean, id?: string | null
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const n = (nombre || "").trim();
  if (!n) return { error: "Ponle un nombre a la vista." };

  const fila = { nombre: n, entidad, config, usuario_id: compartida ? null : user.id };
  const q = id
    ? supabase.from("vistas_guardadas").update(fila).eq("id", id)
    : supabase.from("vistas_guardadas").insert(fila);
  const { error } = await q;
  if (error) return { error: error.message };
  // Las dos listas que hoy tienen pestaña de tabla.
  revalidatePath("/personas"); revalidatePath("/empresas");
  return {};
}

export async function borrarVista(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("vistas_guardadas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/personas"); revalidatePath("/empresas");
  return {};
}

/* ===== VISTA RÁPIDA DE PERSONA Y EMPRESA =====
 * Read-only: el pop-up orienta, no es un sitio de trabajo. Formato final lo
 * arma el cliente; aquí solo se leen datos crudos.
 *
 * Mismo molde que `cargarCasoRapido`: sesión, el registro principal con guarda,
 * y TODO lo demás en un solo Promise.all. Un pop-up que se abre en cualquier
 * pantalla se pide muchas veces al día: encadenar consultas se paga en cada
 * apertura.
 */
export async function cargarPersonaRapida(personaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: p, error } = await supabase.from("personas")
    .select("id,nombre,alias,tipo,equipo,estado,rol,region,direccion,ruc_dni,telefono,email,foto_url,"
      + "estado_sunat,condicion_sunat,dni_vencimiento,suspension_4ta_anio,"
      + "es_comunero,organizacion,usuario_id,nombre_reniec")
    .eq("id", personaId).single();
  if (error || !p) return { error: "No se encontró a la persona." };
  /* El `select` va partido en varias cadenas por largo, y así PostgREST no
     puede inferir el tipo de la fila: `p` sale como un error genérico y leer
     `p.usuario_id` no compila. Se nombra una vez y se sigue. */
  const per = p as any;

  /* ¿Sigue viva en el sistema? Dos cifras: cuántos movimientos hizo en 30 días
     y cuándo fue el último. La segunda hace falta porque un 0 en la primera es
     ambiguo —puede ser alguien que dejó de entrar la semana pasada o hace dos
     años— y esa diferencia es justo la que se quiere saber. */
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const [pe, em, pq, pa, pr, cta, act30, ultAct] = await Promise.all([
    /* Postulaciones donde participa. Vienen por `postulacion_equipo`, así que
       la misma persona puede aparecer dos veces en una (Director Y Autor): el
       dedup lo hace `palmaresDe` en el cliente, con la lista completa. */
    supabase.from("postulacion_equipo")
      .select("cargo,post:postulaciones(id,codigo,estado,monto_adjudicado,"
        + "proy:proyectos(id,nombre,nombre_corto),conv:convocatorias(id,nombre,anio))")
      /* Con `limit` y sin `order`, «los 6 primeros» son 6 filas cualesquiera
         —y distintas entre aperturas—: la del año en curso podía quedar entre
         las escondidas. El orden manda antes que el recorte. */
      .eq("persona_id", personaId).order("id", { ascending: false }).limit(120),
    supabase.from("empresa_miembros")
      .select("cargo,estado,fecha_inicio,fecha_fin,empresa:empresas(id,nombre,codigo)")
      .eq("persona_id", personaId).order("fecha_inicio", { ascending: false, nullsFirst: false }).limit(30),
    supabase.from("proyecto_equipo")
      .select("cargo,desde,hasta,proyecto:proyectos(id,nombre,nombre_corto,etapa)")
      .eq("persona_id", personaId).order("desde", { ascending: false, nullsFirst: false }).limit(60),
    supabase.from("proyecto_actores")
      .select("rol,orden,personaje,proyecto:proyectos(id,nombre,nombre_corto)")
      .eq("persona_id", personaId).order("orden").limit(40),
    // Solo lo que TIENE ahora: un préstamo cerrado no es responsabilidad viva.
    supabase.from("equipo_prestamos")
      .select("id,desde,equipo:equipamiento(id,folio,nombre)")
      .eq("persona_id", personaId).is("hasta", null).limit(60),
    per.usuario_id
      /* `activo` viaja en vez de filtrarse: una cuenta desactivada NO es lo
         mismo que no tener cuenta, y colapsarlas hacía que un ex-usuario se
         leyera igual que una persona externa. */
      ? supabase.from("perfiles").select("id,nombre,avatar_url,color,activo")
          .eq("id", per.usuario_id).maybeSingle()
      : Promise.resolve({ data: null }),
    per.usuario_id
      ? supabase.from("actividad").select("id", { count: "exact", head: true })
          .eq("actor_id", per.usuario_id).gte("creado_en", hace30)
      : Promise.resolve({ count: 0 }),
    per.usuario_id
      ? supabase.from("actividad").select("creado_en").eq("actor_id", per.usuario_id)
          .order("creado_en", { ascending: false }).limit(1)
      : Promise.resolve({ data: null }),
  ]);

  return {
    persona: per,
    postulaciones: pe.data || [],
    cargos: em.data || [],
    proyectos: pq.data || [],
    actor: pa.data || [],
    prestamos: pr.data || [],
    cuenta: (cta as any)?.data || null,
    act30: (act30 as any)?.count || 0,
    ultimaAct: ((ultAct as any)?.data || [])[0]?.creado_en || null,
  };
}

export async function cargarEmpresaRapida(empresaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  /* `*` y no una lista de columnas: las reglas de elegibilidad (lib/fondos.ts)
     leen media ficha —RENCA, vigencia de poder, SUNAT, constitución— y una
     lista se queda corta en silencio en cuanto se agrega un campo a la regla. */
  const { data: e, error } = await supabase.from("empresas").select("*").eq("id", empresaId).single();
  if (error || !e) return { error: "No se encontró la empresa." };

  const [po, mi, lg] = await Promise.all([
    supabase.from("postulaciones")
      .select("id,codigo,estado,monto_adjudicado,fecha_limite_rendicion,fecha_prorroga,"
        + "fecha_rendicion_real,proy:proyectos(id,nombre,nombre_corto),conv:convocatorias(id,nombre,anio)")
      .eq("empresa_id", empresaId).order("creado_en", { ascending: false }).limit(120),
    /* Los papeles de cada miembro viajan aunque no se pinten: el veredicto de
       elegibilidad mira TAMBIÉN a los responsables (la ficha lo hace así), y
       pedir solo nombre y foto haría que el pop-up dijera «libre para postular»
       por no tener con qué desmentirlo. */
    supabase.from("empresa_miembros")
      .select("cargo,estado,persona:personas(id,nombre,alias,foto_url,region,"
        + "ruc_dni,dni_vencimiento,estado_sunat,condicion_sunat,nombre_reniec)")
      .eq("empresa_id", empresaId).order("cargo").limit(40),
    supabase.from("entidad_media").select("cartel_url")
      .eq("entidad_tipo", "empresa").eq("entidad_id", empresaId).maybeSingle(),
  ]);

  return {
    empresa: e,
    postulaciones: po.data || [],
    miembros: mi.data || [],
    logo: (lg as any)?.data?.cartel_url || null,
  };
}

/* ===== ENTREGA EN LOTE — la salida a rodaje =====
 * Un rodaje no presta un equipo: presta doce. Hacerlo de a uno son doce fichas
 * abiertas y doce formularios, y lo que pasa de verdad es que nadie lo registra
 * y el inventario miente mientras la camioneta ya salió.
 *
 * No es un bucle de `prestarEquipo`: son tres consultas para todo el lote, no
 * tres por equipo. Y NO presta a ciegas —lo que está en reparación, perdido o
 * de baja se queda fuera y VUELVE nombrado en `omitidos`, para que quien
 * entrega vea qué no salió en vez de creer que salió todo—.
 */
/* ══════════════ KITS ══════════════
 * Un kit es un puñado de equipos que salen juntos. Las tablas existían desde
 * el schema original con el comentario «al publicar desde rodaje se vincula el
 * kit completo en un clic»; el clic nunca se escribió. Esto es el clic.
 *
 * Todas estas acciones releen en el servidor: la lista que vio el navegador
 * puede tener minutos, y un kit se arma justo mientras alguien más entrega.
 */

const KIT_MAX = 60;   // un «kit» de 200 piezas es el inventario, no un kit

export async function crearKit(nombre: string, uso: string, descripcion: string, equipoIds: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const nom = (nombre || "").trim();
  if (!nom) return { error: "El kit necesita un nombre." };

  const { data: kit, error } = await supabase.from("kits").insert({
    nombre: nom, uso: (uso || "").trim() || null,
    descripcion: (descripcion || "").trim() || null, creado_por: user.id,
  }).select("id").single();
  if (error) return { error: error.message };

  const r = await setKitEquipos(kit.id, equipoIds || []);
  if (r?.error) return { error: `El kit se creó, pero sus equipos no: ${r.error}`, id: kit.id };

  revalidatePath("/equipamiento");
  return { id: kit.id, n: (equipoIds || []).length };
}

export async function guardarKit(kitId: string, nombre: string, uso: string, descripcion: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const nom = (nombre || "").trim();
  if (!kitId || !nom) return { error: "Falta el kit o su nombre." };

  const { error } = await supabase.from("kits").update({
    nombre: nom, uso: (uso || "").trim() || null,
    descripcion: (descripcion || "").trim() || null,
  }).eq("id", kitId);
  if (error) return { error: error.message };
  revalidatePath("/equipamiento");
  return { ok: true };
}

/* Deja el kit EXACTAMENTE con estos equipos. Se calcula la diferencia en vez
   de borrar todo y volver a insertar: un `delete` + `insert` deja el kit vacío
   durante un instante y, si el insert falla, para siempre. */
export async function setKitEquipos(kitId: string, equipoIds: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!kitId) return { error: "Falta el kit." };

  const quiero = [...new Set((equipoIds || []).filter(Boolean))];
  if (quiero.length > KIT_MAX) return { error: `Un kit no puede tener más de ${KIT_MAX} equipos.` };

  const { data: hay, error: e0 } = await supabase.from("kit_equipos")
    .select("equipamiento_id").eq("kit_id", kitId);
  if (e0) return { error: e0.message };

  const tengo = new Set((hay || []).map((x: any) => x.equipamiento_id));
  const meter = quiero.filter(id => !tengo.has(id));
  const sacar = [...tengo].filter((id: any) => !quiero.includes(id));

  if (sacar.length) {
    const { error } = await supabase.from("kit_equipos")
      .delete().eq("kit_id", kitId).in("equipamiento_id", sacar);
    if (error) return { error: error.message };
  }
  if (meter.length) {
    const { error } = await supabase.from("kit_equipos")
      .insert(meter.map(id => ({ kit_id: kitId, equipamiento_id: id })));
    if (error) return { error: error.message };
  }
  revalidatePath("/equipamiento");
  return { meter: meter.length, sacar: sacar.length };
}

/* Un kit no se borra si ya salió a rodaje: sus préstamos lo nombran y esa
   etiqueta es parte del historial. Se retira —deja de ofrecerse— y ya. Lo que
   nunca salió sí se borra: es un error de tecleo, no historia. */
export async function borrarKit(kitId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!kitId) return { error: "Falta el kit." };

  const { count, error: e0 } = await supabase.from("equipo_prestamos")
    .select("id", { count: "exact", head: true }).eq("kit_id", kitId);
  if (e0) return { error: e0.message };

  if (count && count > 0) {
    const { error } = await supabase.from("kits")
      .update({ retirado_en: new Date().toISOString() }).eq("id", kitId);
    if (error) return { error: error.message };
    revalidatePath("/equipamiento");
    return { retirado: true, usos: count };
  }
  const { error } = await supabase.from("kits").delete().eq("id", kitId);
  if (error) return { error: error.message };
  revalidatePath("/equipamiento");
  return { borrado: true };
}

export async function revivirKit(kitId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("kits").update({ retirado_en: null }).eq("id", kitId);
  if (error) return { error: error.message };
  revalidatePath("/equipamiento");
  return { ok: true };
}

/* ══════════ EQUIPOS ENSAMBLADOS ══════════
 *
 * Montar piezas dentro de un equipo. Ver db/ensamblado.sql para el porqué de
 * que sea una columna y no una tabla.
 */
export async function ensamblar(padreId: string, piezaIds: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const ids = [...new Set((piezaIds || []).filter(Boolean))].filter(i => i !== padreId);
  if (!padreId || !ids.length) return { error: "Falta qué montar." };

  /* Ni la pieza puede contener a su contenedor, ni más arriba en la cadena:
     un monopod dentro de un rig dentro del monopod se quedaría dando vueltas
     al pintar la ficha. Se sube por `ensamblado_en` hasta la raíz. */
  let cursor: string | null = padreId;
  const vistos = new Set<string>();
  while (cursor && !vistos.has(cursor)) {
    vistos.add(cursor);
    if (ids.includes(cursor)) {
      return { error: "Eso lo dejaría montado dentro de sí mismo: una de las piezas ya contiene a este equipo." };
    }
    const { data: p }: any = await supabase.from("equipamiento")
      .select("ensamblado_en").eq("id", cursor).maybeSingle();
    cursor = p?.ensamblado_en || null;
  }

  /* Se relee el estado: una pieza prestada no se puede atornillar —está en
     la mochila de alguien— y decirlo con nombre evita el «no se guardó» a
     secas. */
  const { data: eqs, error: e0 } = await supabase.from("equipamiento")
    .select("id,folio,nombre,estado,ensamblado_en").in("id", ids);
  if (e0) return { error: e0.message };
  const malas = (eqs || []).filter((e: any) => e.estado === "en_uso")
    .map((e: any) => `${e.folio || ""} ${e.nombre}`.trim());
  if (malas.length) {
    return { error: `Están prestadas, así que no se pueden montar todavía: ${malas.join(", ")}. Regístralas como devueltas primero.` };
  }

  const buenos = (eqs || []).map((e: any) => e.id);
  const { data, error } = await supabase.from("equipamiento")
    .update({ ensamblado_en: padreId, estado: "ensamblado" })
    .in("id", buenos).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso, o esas piezas ya no están." };

  const { data: padre } = await supabase.from("equipamiento").select("nombre").eq("id", padreId).maybeSingle();
  /* En la bitácora del ENSAMBLADO y no en la de cada pieza: armar algo es un
     suceso del conjunto. En la pieza queda su estado, que ya lo dice. */
  await supabase.from("actividad").insert({
    entidad_tipo: "equipamiento", entidad_id: padreId, actor_id: user.id, tipo: "edicion",
    detalle: { mensaje: `montó ${data.length} pieza(s) en «${padre?.nombre || "el equipo"}»` },
  });
  revalidatePath(`/entidad/equipamiento/${padreId}`);
  buenos.forEach(id => revalidatePath(`/entidad/equipamiento/${id}`));
  revalidatePath("/equipamiento");
  return { ok: true, montadas: data.length };
}

/** Desmontar: la pieza vuelve a estar disponible y suelta. */
export async function desensamblar(piezaIds: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const ids = [...new Set((piezaIds || []).filter(Boolean))];
  if (!ids.length) return { error: "Falta qué desmontar." };

  const { data: antes } = await supabase.from("equipamiento")
    .select("id,ensamblado_en,estado").in("id", ids);
  const padres = [...new Set((antes || []).map((e: any) => e.ensamblado_en).filter(Boolean))] as string[];

  /* Vuelve a «disponible» SOLO si estaba en «ensamblado». Si alguien la marcó
     «en reparación» estando montada —se rompió dentro del rig— desmontarla no
     la arregla, y pisar ese estado borraría el único sitio donde consta. */
  const aLiberar = (antes || []).filter((e: any) => e.estado === "ensamblado").map((e: any) => e.id);
  const soloSoltar = (antes || []).filter((e: any) => e.estado !== "ensamblado").map((e: any) => e.id);

  if (aLiberar.length) {
    const { error } = await supabase.from("equipamiento")
      .update({ ensamblado_en: null, estado: "disponible" }).in("id", aLiberar);
    if (error) return { error: error.message };
  }
  if (soloSoltar.length) {
    const { error } = await supabase.from("equipamiento")
      .update({ ensamblado_en: null }).in("id", soloSoltar);
    if (error) return { error: error.message };
  }

  for (const p of padres) {
    await supabase.from("actividad").insert({
      entidad_tipo: "equipamiento", entidad_id: p, actor_id: user.id, tipo: "edicion",
      detalle: { mensaje: `desmontó ${ids.length} pieza(s)` },
    });
    revalidatePath(`/entidad/equipamiento/${p}`);
  }
  ids.forEach(id => revalidatePath(`/entidad/equipamiento/${id}`));
  revalidatePath("/equipamiento");
  return { ok: true, sueltas: ids.length };
}

export async function prestarEquipos(
  equipoIds: string[], personaId: string, proyectoId: string | null, nota: string,
  /* De qué kit sale CADA equipo, no uno para todo el lote. Una salida de
     rodaje se arma con varios kits a la vez —el de entrevista y el de
     drone— y con un solo `kitId` los doce equipos quedaban etiquetados con
     el mismo, o sea que la mitad del historial era falso. A la vuelta, «¿el
     kit volvió entero?» se contestaba contra el kit equivocado. */
  kitDe?: Record<string, string> | null
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const ids = [...new Set((equipoIds || []).filter(Boolean))];
  if (!ids.length) return { error: "No hay equipos seleccionados." };
  if (!personaId) return { error: "Falta a quién se le entrega." };

  /* Se relee el estado en el servidor: la lista que vio el navegador puede
     tener minutos y el equipo pudo pasar a reparación mientras tanto. */
  const { data: eqs, error: e0 } = await supabase.from("equipamiento")
    .select("id,folio,nombre,estado").in("id", ids);
  if (e0) return { error: e0.message };

  /* `entregableEq` y no un mapa de estados vetados. El mapa se preguntaba
     `VETADOS[e.estado]`, y un equipo SIN ESTADO no está en ningún mapa: el
     `undefined` pasaba por bueno y salía a rodaje algo que la pantalla ya
     marcaba como no disponible. Preguntar «¿es entregable?» no tiene ese
     agujero — la lista blanca es explícita, la negra siempre olvida un caso. */
  const omitidos = (eqs || []).filter((e: any) => !entregableEq(e.estado))
    .map((e: any) => `${e.folio || ""} ${e.nombre} (${porQueNoEq(e.estado)})`.trim());
  const buenos = (eqs || []).filter((e: any) => entregableEq(e.estado)).map((e: any) => e.id);
  if (!buenos.length) return { error: `Ninguno se puede entregar: ${omitidos.join(", ")}` };

  const hoy = hoyLima();
  // Lo que alguien más tuviera abierto se cierra hoy, igual que en el préstamo
  // de a uno — pero para todo el lote de una vez.
  await supabase.from("equipo_prestamos").update({ hasta: hoy })
    .in("equipamiento_id", buenos).is("hasta", null);

  /* El préstamo recuerda de qué kit salió. Sin esto, los tres equipos de
     Roxana vuelven a ser tres fichas sueltas en cuanto salen por la puerta:
     el kit habría servido para marcarlos rápido y para nada más, y a la
     vuelta nadie sabría que faltaba cerrar una cuarta pieza. */
  const { error } = await supabase.from("equipo_prestamos").insert(
    buenos.map(id => ({
      equipamiento_id: id, persona_id: personaId,
      proyecto_id: proyectoId || null, nota: (nota || "").trim() || null,
      kit_id: kitDe?.[id] || null,
      entregado_por: user.id,
    })));
  if (error) return { error: error.message };

  const { error: e2 } = await supabase.from("equipamiento")
    .update({ estado: "en_uso" }).in("id", buenos);
  if (e2) return { error: `Se registraron ${buenos.length}, pero el estado no se actualizó: ${e2.message}` };

  /* La salida de equipos ES un suceso del proyecto, y por eso se anota contra
     el proyecto y no contra cada cámara: los eventos de una cámara son de la
     cámara —rueda en cinco proyectos— y arrastrarlos al historial del proyecto
     lo llenaría de cosas ajenas. Una línea por entrega, no doce. */
  if (proyectoId) {
    const quien = (await supabase.from("personas").select("nombre,alias").eq("id", personaId).single()).data;
    await supabase.from("actividad").insert({
      entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "edicion",
      detalle: { mensaje: `entregó ${buenos.length} equipo(s) a ${quien?.alias || quien?.nombre || "alguien"}` },
    });
  }
  buenos.forEach(id => revalidatePath(`/entidad/equipamiento/${id}`));
  revalidatePath("/equipamiento");
  return { entregados: buenos.length, omitidos };
}

/* Devolver de golpe todo lo que tiene una persona. El reverso exacto de la
 * entrega: si entregar de a uno no se hace, devolver de a uno tampoco, y el
 * inventario se queda diciendo «en uso» semanas después del rodaje. */
export async function devolverEquipos(prestamoIds: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const ids = [...new Set((prestamoIds || []).filter(Boolean))];
  if (!ids.length) return { error: "No hay préstamos que cerrar." };

  /* Los ids de equipo salen de los propios préstamos, no del navegador: así no
     hay forma de cerrar un préstamo y liberar otro equipo. */
  const { data: pres, error: e0 } = await supabase.from("equipo_prestamos")
    .select("id,equipamiento_id").in("id", ids).is("hasta", null);
  if (e0) return { error: e0.message };
  if (!pres?.length) return { error: "Esos préstamos ya estaban cerrados." };

  const hoy = hoyLima();
  const { error } = await supabase.from("equipo_prestamos")
    .update({ hasta: hoy }).in("id", pres.map((p: any) => p.id));
  if (error) return { error: error.message };

  const eqIds = pres.map((p: any) => p.equipamiento_id).filter(Boolean);
  const { error: e2 } = await supabase.from("equipamiento")
    .update({ estado: "disponible" }).in("id", eqIds);
  if (e2) return { error: `Se cerraron ${pres.length}, pero el estado no se actualizó: ${e2.message}` };

  eqIds.forEach((id: string) => revalidatePath(`/entidad/equipamiento/${id}`));
  revalidatePath("/equipamiento");
  return { devueltos: pres.length };
}

export async function devolverEquipo(prestamoId: string, equipoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("equipo_prestamos")
    .update({ hasta: hoyLima() })
    .eq("id", prestamoId);
  if (error) return { error: error.message };
  const { error: e2 } = await supabase.from("equipamiento")
    .update({ estado: "disponible" }).eq("id", equipoId);
  if (e2) return { error: "Devolución registrada, pero el estado no se actualizó: " + e2.message };
  revalidatePath(`/entidad/equipamiento/${equipoId}`);
  revalidatePath("/equipamiento");
  return {};
}

/* COMENTAR UN PRÉSTAMO DE EQUIPO — la bitácora de esa salida (se lo pasó a
   Carlos, lo devolvió rayado, falta el cargador). Misma tabla `comentarios`
   que casos y objetos; solo cambia de qué cuelga (prestamo_id). Requiere haber
   corrido db/prestamo-comentarios.sql. */
export async function comentarPrestamo(
  prestamoId: string, equipoId: string, texto: string,
  imagenes: string[] = [], etiquetas: string[] = [], respondeA: string | null = null,
  fechaEvento: string | null = null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cuerpo = (texto || "").trim();
  const imgs = (imagenes || []).filter(Boolean).slice(0, 6);
  // Etiquetas libres: limpiadas, sin duplicados, tope razonable.
  const tags = [...new Set((etiquetas || []).map(t => (t || "").trim()).filter(Boolean))].slice(0, 8);
  // Un parte de daño puede ser solo fotos («mira cómo llegó»); un comentario
  // normal sin texto ni fotos no tiene sentido. `cuerpo || "📷"` porque la
  // columna es NOT NULL —igual que comentarObjeto—.
  if (!cuerpo && !imgs.length) return { error: "Escribe algo o adjunta una foto." };
  const esDano = tags.some(esTagDano);
  const { error } = await supabase.from("comentarios")
    .insert({ prestamo_id: prestamoId, autor_id: user.id, cuerpo: cuerpo || "📷", imagenes: imgs, etiquetas: tags, es_dano: esDano, responde_a: respondeA || null, fecha_evento: fechaEvento || null });
  if (error) {
    if (/etiquetas|es_dano|fecha_evento/.test(error.message)) return { error: "Falta correr db/comentario-dano.sql y db/bitacora-equipo.sql en Supabase." };
    return { error: /prestamo_id/.test(error.message)
      ? "Falta correr db/prestamo-comentarios.sql en Supabase."
      : error.message };
  }

  // Parte de daño ⇒ el equipo entra a evaluación técnica / reparación. El uso
  // no se cierra solo (quizá lo devuelvan luego); solo cambia el estado para que
  // nadie más lo saque mientras está averiado.
  if (esDano) {
    await supabase.from("equipamiento").update({ estado: "en_reparacion" }).eq("id", equipoId);
  }
  await avisarBitacoraEquipo(supabase, user.id, equipoId, cuerpo, esDano, { prestamo_id: prestamoId }, respondeA);

  revalidatePath(`/entidad/equipamiento/${equipoId}`);
  return {};
}

/* ¿Una etiqueta es un daño? Normaliza acentos: «Daño», «daños», «dano» valen. */
function esTagDano(t: string) {
  return (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes("dano");
}

/* AVISOS DE LA BITÁCORA DE UN EQUIPO.
 *
 * Se llamaba «avisarMenciones…» y el nombre decía la verdad: avisaba SOLO a
 * quien fuera nombrado con @. Todo lo demás pasaba en silencio.
 *
 *   · Carlos respondió a una pregunta de John sobre qué batería fallaba, sin
 *     poner @john porque le estaba respondiendo A ÉL — y John encontró la
 *     respuesta días después, de casualidad. Responder es la forma más
 *     explícita que hay de dirigirse a alguien; pedir además un @ es pedir
 *     que se diga dos veces.
 *   · Un parte de DAÑO manda el equipo a reparación —cambia su estado, lo
 *     saca del inventario disponible— y no se avisaba a nadie salvo que a
 *     alguien se le ocurriera nombrar a alguien.
 *
 * Ahora avisa a tres, sin repetir a nadie y nunca a uno mismo:
 *   1. los @mencionados,
 *   2. a quien se le responde,
 *   3. los que ya venían hablando de este equipo — la conversación es de
 *      ellos, y enterarse de una respuesta no debería depender de volver a
 *      abrir la ficha por casualidad.
 *
 * `destino` decide de qué cuelga el aviso: de un uso (prestamo_id) o directo
 * del equipo (equipamiento_id). Compartido por comentarPrestamo y
 * comentarEquipo para no divergir. */
async function avisarBitacoraEquipo(
  supabase: any, userId: string, equipoId: string, cuerpo: string, esDano: boolean,
  destino: { prestamo_id?: string; equipamiento_id?: string },
  respondeA: string | null = null,
) {
  const nrmM = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const tokens = [...new Set((cuerpo.match(/@[^\s@,;:!?*_`]+/g) || []).map(m => m.slice(1)))];

  /* Los préstamos del equipo: sus comentarios cuelgan del USO, no del equipo,
     así que sin esto «los que ya venían hablando» se quedaría corto en la
     mitad de las conversaciones — justo las de un rodaje. */
  const { data: pres } = await supabase.from("equipo_prestamos")
    .select("id").eq("equipamiento_id", equipoId);
  const idsPres = (pres || []).map((x: any) => x.id);
  const filtroCharla = idsPres.length
    ? `equipamiento_id.eq.${equipoId},prestamo_id.in.(${idsPres.join(",")})`
    : `equipamiento_id.eq.${equipoId}`;

  const [{ data: miP }, { data: eq }, { data: perfs }, { data: padre }, { data: charla }] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("id", userId).single(),
    supabase.from("equipamiento").select("nombre").eq("id", equipoId).single(),
    supabase.from("perfiles").select("id,nombre").eq("activo", true),
    respondeA
      ? supabase.from("comentarios").select("autor_id").eq("id", respondeA).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("comentarios").select("autor_id").or(filtroCharla),
  ]);
  const actorNombre = miP?.nombre || "Alguien";
  const corto = actorNombre.split(" ")[0];
  const nomEquipo = (eq?.nombre || "un equipo").slice(0, 50);
  const enUso = !!destino.prestamo_id;
  const donde = enUso ? "el uso de" : "la bitácora de";

  /* Quién ya está avisado. Uno mismo entra de salida: nadie necesita que le
     cuenten lo que acaba de escribir. */
  const avisados = new Set<string>([userId]);
  const avisar = async (uid: string, tipo: string, mensaje: string) => {
    if (!uid || avisados.has(uid)) return;
    avisados.add(uid);
    await supabase.from("notificaciones").insert({
      usuario_id: uid, ...destino, tipo, actor_nombre: actorNombre, mensaje });
  };

  // 1. Los @mencionados — el aviso más explícito, va primero.
  if (tokens.length) {
    for (const p of perfs || []) {
      const sinEsp = nrmM(p.nombre).replace(/\s+/g, "");
      const palabras = nrmM(p.nombre).split(/\s+/);
      const invocado = tokens.some((t: string) => { const tk = nrmM(t); return sinEsp.startsWith(tk) || palabras.some((w: string) => w.startsWith(tk)); });
      if (invocado) {
        await avisar(p.id, "mencion", esDano
          ? `🔧 ${corto} reportó un daño en «${nomEquipo}»`
          : `🪄 ${corto} te mencionó en ${donde} «${nomEquipo}»`);
      }
    }
  }

  // 2. A quien se le responde. Responder ES dirigirse a alguien.
  if (padre?.autor_id) {
    await avisar(padre.autor_id, "comentario",
      `↩ ${corto} respondió a tu comentario en «${nomEquipo}»`);
  }

  /* 3. Los que ya venían hablando de este equipo. Solo cuentas activas: el
        `autor_id` de alguien que dejó el equipo no debe recibir nada. */
  const activos = new Set<string>((perfs || []).map((p: any) => p.id));
  for (const c of charla || []) {
    if (!activos.has(c.autor_id)) continue;
    await avisar(c.autor_id, "comentario", esDano
      ? `🔧 ${corto} reportó un daño en «${nomEquipo}»`
      : `💬 ${corto} comentó en ${donde} «${nomEquipo}»`);
  }
}

/* COMENTAR EL EQUIPO (bitácora suelta) — comentarios y partes de daño que
   cuelgan del EQUIPO mismo, no de un uso. Aquí va lo que no pertenece a ningún
   préstamo: «buscando técnico», o un daño de una salida ya no registrada (con su
   `fechaEvento` real). Misma tabla `comentarios`, cuarto dueño equipamiento_id.
   Requiere db/bitacora-equipo.sql. */
export async function comentarEquipo(
  equipoId: string, texto: string,
  imagenes: string[] = [], etiquetas: string[] = [], respondeA: string | null = null,
  fechaEvento: string | null = null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cuerpo = (texto || "").trim();
  const imgs = (imagenes || []).filter(Boolean).slice(0, 6);
  const tags = [...new Set((etiquetas || []).map(t => (t || "").trim()).filter(Boolean))].slice(0, 8);
  if (!cuerpo && !imgs.length) return { error: "Escribe algo o adjunta una foto." };
  const esDano = tags.some(esTagDano);
  const { error } = await supabase.from("comentarios")
    .insert({ equipamiento_id: equipoId, autor_id: user.id, cuerpo: cuerpo || "📷", imagenes: imgs, etiquetas: tags, es_dano: esDano, responde_a: respondeA || null, fecha_evento: fechaEvento || null });
  if (error) {
    if (/equipamiento_id|fecha_evento/.test(error.message)) return { error: "Falta correr db/bitacora-equipo.sql en Supabase." };
    if (/etiquetas|es_dano/.test(error.message)) return { error: "Falta correr db/comentario-dano.sql en Supabase." };
    return { error: error.message };
  }
  if (esDano) {
    await supabase.from("equipamiento").update({ estado: "en_reparacion" }).eq("id", equipoId);
  }
  await avisarBitacoraEquipo(supabase, user.id, equipoId, cuerpo, esDano, { equipamiento_id: equipoId }, respondeA);

  revalidatePath(`/entidad/equipamiento/${equipoId}`);
  return {};
}

/* EDITAR un comentario de la bitácora del equipo o de un uso (corregir un typo,
   ajustar el parte de daño, cambiar la fecha del incidente). Solo el autor.
   Recalcula es_dano de las etiquetas; si queda como daño, el equipo entra a
   reparación (no se “des-repara” solo al quitar la etiqueta: eso se decide a
   mano). El equipo se deduce del propio comentario para revalidar bien. */
export async function editarComentarioEquipo(
  comentarioId: string, texto: string,
  imagenes: string[] = [], etiquetas: string[] = [], fechaEvento: string | null = null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cuerpo = (texto || "").trim();
  const imgs = (imagenes || []).filter(Boolean).slice(0, 6);
  const tags = [...new Set((etiquetas || []).map(t => (t || "").trim()).filter(Boolean))].slice(0, 8);
  if (!cuerpo && !imgs.length) return { error: "El comentario no puede quedar vacío." };
  const { data: com } = await supabase.from("comentarios")
    .select("autor_id,equipamiento_id,prestamo_id").eq("id", comentarioId).single();
  if (!com) return { error: "Comentario no encontrado." };
  if (com.autor_id !== user.id) return { error: "Solo el autor puede editar su comentario." };
  const esDano = tags.some(esTagDano);
  const { error } = await supabase.from("comentarios")
    .update({ cuerpo: cuerpo || "📷", imagenes: imgs, etiquetas: tags, es_dano: esDano, fecha_evento: fechaEvento || null, editado_en: new Date().toISOString() })
    .eq("id", comentarioId);
  if (error) return { error: error.message };

  let equipoId: string | null = com.equipamiento_id;
  if (!equipoId && com.prestamo_id) {
    const { data: pr } = await supabase.from("equipo_prestamos").select("equipamiento_id").eq("id", com.prestamo_id).single();
    equipoId = pr?.equipamiento_id || null;
  }
  if (esDano && equipoId) {
    await supabase.from("equipamiento").update({ estado: "en_reparacion" }).eq("id", equipoId);
  }
  if (equipoId) revalidatePath(`/entidad/equipamiento/${equipoId}`);
  return {};
}

/* Editar el título de una publicación (queda en la bitácora quién y qué) */
export async function editarTitulo(pubId: string, titulo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const limpio = titulo.trim();
  if (!limpio) return { error: "El título no puede quedar vacío." };

  const { data: antes } = await supabase.from("publicaciones")
    .select("titulo").eq("id", pubId).single();
  const { error } = await supabase.from("publicaciones")
    .update({ titulo: limpio }).eq("id", pubId);
  if (error) return { error: error.message };

  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion", entidad_id: pubId, tipo: "edicion", actor_id: user.id,
    detalle: { mensaje: `editó el título (antes: «${(antes?.titulo || "").slice(0, 80)}»)` },
  });
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

export async function editarCuerpo(pubId: string, cuerpo: string, imagenes?: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const limpio = cuerpo.trim();
  const upd: any = { cuerpo: limpio || null };
  // `if (imagenes)` (no `imagenes?.length`) a propósito: [] es truthy, así que
  // pasar [] SÍ vacía la columna (quitar todas). `undefined` = no tocar imágenes.
  if (imagenes) upd.imagenes = imagenes.filter(Boolean).slice(0, 6);
  const { error } = await supabase.from("publicaciones")
    .update(upd).eq("id", pubId);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion", entidad_id: pubId, tipo: "edicion", actor_id: user.id,
    detalle: { mensaje: "editó la descripción" },
  });
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

const ENT_LBL: Record<string, string> = {
  proyecto: "proyecto", empresa: "empresa", persona: "persona", convocatoria: "convocatoria",
  postulacion: "postulación", equipamiento: "equipo", lugar: "lugar", etiqueta: "etiqueta",
  objeto: "material del repositorio",
};
const ENT_TABLA: Record<string, [string, string]> = {
  proyecto: ["proyectos", "nombre"], empresa: ["empresas", "nombre"],
  persona: ["personas", "nombre"], convocatoria: ["convocatorias", "codigo"],
  postulacion: ["postulaciones", "codigo"], equipamiento: ["equipamiento", "nombre"],
  lugar: ["lugares", "nombre"], etiqueta: ["etiquetas", "nombre"],
  // Sin esta línea la bitácora registraba «vinculó objeto: objeto».
  objeto: ["objetos", "titulo"],
};
async function nombreEntidad(supabase: any, tipo: string, id: string): Promise<string> {
  const t = ENT_TABLA[tipo];
  if (!t) return ENT_LBL[tipo] || tipo;
  const { data } = await supabase.from(t[0]).select(t[1]).eq("id", id).single();
  return data?.[t[1]] || (ENT_LBL[tipo] || tipo);
}

export async function agregarVinculo(pubId: string, entidadTipo: string, entidadId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: ins, error } = await supabase.from("publicacion_vinculos").upsert(
    { publicacion_id: pubId, entidad_tipo: entidadTipo, entidad_id: entidadId },
    { onConflict: "publicacion_id,entidad_tipo,entidad_id", ignoreDuplicates: true })
    .select("publicacion_id");
  if (error) return { error: error.message };
  /* ¿Fue un vínculo NUEVO o ya existía? Con ignoreDuplicates, un conflicto no
     devuelve fila. Si ya estaba, no re-registramos ni re-notificamos —vincular
     dos veces a la misma persona mandaba campanita repetida y ensuciaba la
     bitácora—. */
  if (!ins?.length) { revalidatePath(`/caso/${pubId}`); return {}; }
  // 🗂 Bitácora
  const nombre = await nombreEntidad(supabase, entidadTipo, entidadId);
  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion", entidad_id: pubId, actor_id: user.id, tipo: "vinculo",
    detalle: { mensaje: `vinculó ${ENT_LBL[entidadTipo] || entidadTipo}: ${nombre}` },
  });
  // 🔔 Si vinculé a una PERSONA, avísale (igual que al crear).
  if (entidadTipo === "persona") {
    const [{ data: pub }, { data: miP }] = await Promise.all([
      supabase.from("publicaciones").select("titulo,tipo").eq("id", pubId).single(),
      supabase.from("perfiles").select("nombre").eq("id", user.id).single(),
    ]);
    if (pub) await notificarPersonasVinculadas(
      supabase, pubId, [entidadId], user.id, miP?.nombre || "Alguien", pub.titulo, pub.tipo);
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

export async function quitarVinculo(pubId: string, entidadTipo: string, entidadId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const nombre = await nombreEntidad(supabase, entidadTipo, entidadId);
  const { error } = await supabase.from("publicacion_vinculos").delete()
    .eq("publicacion_id", pubId).eq("entidad_tipo", entidadTipo).eq("entidad_id", entidadId);
  if (error) return { error: error.message };
  // 🗂 Bitácora
  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion", entidad_id: pubId, actor_id: user.id, tipo: "vinculo",
    detalle: { mensaje: `desvinculó ${ENT_LBL[entidadTipo] || entidadTipo}: ${nombre}` },
  });
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

/* Vincular VARIAS entidades del mismo tipo de una sola vez (orden de trabajo:
   «este caso toca a estas 15 personas»). Un solo evento de bitácora y una sola
   tanda de notificaciones. Solo procesa las NUEVAS (upsert ignoreDuplicates
   devuelve únicamente las insertadas), así que re-vincular no duplica nada. */
export async function vincularEnLote(pubId: string, entidadTipo: string, entidadIds: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const ids = [...new Set((entidadIds || []).filter(Boolean))];
  if (!ids.length) return { error: "No elegiste a nadie." };

  const { data: ins, error } = await supabase.from("publicacion_vinculos")
    .upsert(ids.map(id => ({ publicacion_id: pubId, entidad_tipo: entidadTipo, entidad_id: id })),
      { onConflict: "publicacion_id,entidad_tipo,entidad_id", ignoreDuplicates: true })
    .select("entidad_id");
  if (error) return { error: error.message };

  const nuevos = (ins || []).map((r: any) => r.entidad_id);
  if (!nuevos.length) { revalidatePath(`/caso/${pubId}`); return { n: 0 }; }

  // Nombres legibles de los nuevos, en una consulta, para un solo evento.
  const t = ENT_TABLA[entidadTipo];
  let nombres: string[] = [];
  if (t) {
    const { data } = await supabase.from(t[0]).select(`id,${t[1]}`).in("id", nuevos);
    const m = new Map((data || []).map((r: any) => [r.id, r[t[1]]]));
    nombres = nuevos.map((id: string) => m.get(id) || ENT_LBL[entidadTipo] || entidadTipo);
  }
  const lbl = ENT_LBL[entidadTipo] || entidadTipo;
  const lista = nombres.slice(0, 8).join(", ") + (nombres.length > 8 ? `… (+${nombres.length - 8})` : "");
  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion", entidad_id: pubId, actor_id: user.id, tipo: "vinculo",
    detalle: { mensaje: `vinculó ${nuevos.length} ${lbl}${nuevos.length > 1 ? "s" : ""}: ${lista}` },
  });

  if (entidadTipo === "persona") {
    const [{ data: pub }, { data: miP }] = await Promise.all([
      supabase.from("publicaciones").select("titulo,tipo").eq("id", pubId).single(),
      supabase.from("perfiles").select("nombre").eq("id", user.id).single(),
    ]);
    if (pub) await notificarPersonasVinculadas(
      supabase, pubId, nuevos, user.id, miP?.nombre || "Alguien", pub.titulo, pub.tipo);
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return { n: nuevos.length };
}

/* ===== SUB-CASOS: un caso largo se descompone en hijos =====
   El hijo hereda los vínculos del padre; el padre acumula el progreso. */
export async function crearSubCaso(padreId: string, titulo: string, tipo: string = "tarea") {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!titulo.trim()) return { error: "El título es obligatorio." };

  const { data: hijo, error } = await supabase.from("publicaciones").insert({
    autor_id: user.id,
    tipo: ["tarea", "problema", "consulta", "pago"].includes(tipo) ? tipo : "tarea",
    titulo: titulo.trim(),
    padre_id: padreId,
    estado: "abierta",
  }).select("id").single();
  if (error) return { error: error.message };

  // Hereda los vínculos del padre (proyecto, personas, etc.)
  const { data: vincs } = await supabase.from("publicacion_vinculos")
    .select("entidad_tipo,entidad_id").eq("publicacion_id", padreId);
  if (vincs?.length) {
    await supabase.from("publicacion_vinculos").insert(
      vincs.map((v: any) => ({ publicacion_id: hijo.id, entidad_tipo: v.entidad_tipo, entidad_id: v.entidad_id })));
  }
  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion", entidad_id: padreId, tipo: "vinculo", actor_id: user.id,
    detalle: { mensaje: `Sub-caso creado: «${titulo.trim()}»` },
  });
  revalidatePath(`/caso/${padreId}`);
  revalidatePath("/");
  return { id: hijo.id };
}

/* ===== REACCIONES: los famosos "me gusta" =====
   Toggle por usuario: mismo emoji dos veces = quitar. */
const EMOJIS_REACCION = ["👀", "👍", "✔️", "❤️", "🔥", "👏", "😂", "😮", "🤔", "😕", "😢"];
export async function toggleReaccion(pubId: string | null, comentarioId: string | null, emoji: string, objetoId?: string | null, postulacionId?: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!EMOJIS_REACCION.includes(emoji)) return { error: "Reacción no permitida." };

  let q = supabase.from("reacciones").select("id")
    .eq("usuario_id", user.id).eq("emoji", emoji);
  /* Un comentario (del repositorio o de una postulación) no cuelga de una
     publicación —`pubId` es null—, pero la reacción se guarda igual contra
     `comentario_id`. Además, una postulación puede recibir reacciones sobre sí
     misma (`postulacion_id`, sin comentario). El toggle busca por comentario si
     lo hay; si no, por postulación; si no, por publicación. */
  q = comentarioId ? q.eq("comentario_id", comentarioId)
    : postulacionId ? q.eq("postulacion_id", postulacionId).is("comentario_id", null)
    : q.eq("publicacion_id", pubId).is("comentario_id", null);
  const { data: ya } = await q.maybeSingle();

  if (ya) {
    const { error } = await supabase.from("reacciones").delete().eq("id", ya.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("reacciones").insert({
      publicacion_id: pubId, comentario_id: comentarioId,
      // La reacción a la postulación misma solo cuando NO es a un comentario.
      postulacion_id: comentarioId ? null : (postulacionId ?? null),
      usuario_id: user.id, emoji,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/");
  // La reacción vive donde vive el comentario: caso, objeto o postulación.
  if (objetoId) revalidatePath(`/objeto/${objetoId}`);
  else if (postulacionId) revalidatePath(`/entidad/postulacion/${postulacionId}`);
  else if (pubId) revalidatePath(`/caso/${pubId}`);
  return {};
}

/* Acuse de recibo de un AVISO: reusa la reacción 👀 como "me enteré".
   Cuando todo el equipo (perfiles activos, sin Qhaway) se dio por enterado,
   el aviso se archiva solo — su ciclo cierra por lectura, no por "resolver". */
export async function toggleEnterado(pubId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  // Toggle del 👀 sobre la publicación
  const { data: ya } = await supabase.from("reacciones").select("id")
    .eq("usuario_id", user.id).eq("emoji", "👀")
    .eq("publicacion_id", pubId).is("comentario_id", null).maybeSingle();
  if (ya) {
    await supabase.from("reacciones").delete().eq("id", ya.id);
  } else {
    const { error } = await supabase.from("reacciones").insert({
      publicacion_id: pubId, comentario_id: null, usuario_id: user.id, emoji: "👀",
    });
    if (error) return { error: error.message };
  }

  /* ¿Se enteró la mayoría? → archivar el aviso… PERO NUNCA si tiene fecha
     límite por delante.
     Enterarse no es hacer. Para "mañana no hay luz", que todos lo lean ES el
     final del asunto. Para "subsanar Pampacucho antes del 20 de julio", no:
     eso termina cuando alguien subsana. Esta regla archivó un aviso de un
     fondo de S/ 160,000 a cuatro días de su plazo porque cuatro personas
     dijeron "ya vi" — y con él se fue del feed, del tablero y de la ronda
     matutina. Un aviso con fecha límite no es un aviso: es trabajo con reloj,
     y se archiva a mano cuando el trabajo está hecho. */
  const { data: pub } = await supabase.from("publicaciones")
    .select("tipo,estado,fecha_limite,archivado_en").eq("id", pubId).single();
  const conPlazoVivo = !!pub?.fecha_limite
    && pub.fecha_limite >= hoyLima();
  /* Ahora archivar es ARCHIVAR, no cambiar de estado: el aviso se queda
     Vigente (abierta) y solo se le pone `archivado_en`. Antes lo mandaba a
     `estado:"archivada"` —el estado que ya no existe— y de paso lo sacaba de
     los conteos de «resuelto». Guard: no re-archivar lo ya archivado. */
  if (pub?.tipo === "aviso" && !conPlazoVivo && !pub.archivado_en) {
    const [{ data: team }, { data: vistos }] = await Promise.all([
      supabase.from("perfiles").select("id").eq("activo", true).neq("nombre", BOT),
      supabase.from("reacciones").select("usuario_id")
        .eq("publicacion_id", pubId).is("comentario_id", null).eq("emoji", "👀"),
    ]);
    const teamIds = new Set((team || []).map((t: any) => t.id));
    const enterados = new Set((vistos || []).map((v: any) => v.usuario_id).filter((id: string) => teamIds.has(id)));
    // Basta con que se entere MÁS DE LA MITAD del equipo
    if (teamIds.size > 0 && enterados.size * 2 > teamIds.size) {
      await supabase.from("publicaciones").update({ archivado_en: new Date().toISOString() }).eq("id", pubId);
      await supabase.from("actividad").insert({
        entidad_tipo: "publicacion", entidad_id: pubId, actor_id: user.id, tipo: "archivo",
        detalle: { a: "archivado", mensaje: "aviso archivado — se enteró la mayoría del equipo" },
      });
    }
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

/* Marcar todas como leídas. `filtro` acota a una pestaña: "personal" (las que
   pide acción) o "bot" (las automáticas). Sin filtro, marca ambas. */
export async function marcarNotifsLeidas(filtro?: "personal" | "bot") {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  let q = supabase.from("notificaciones").update({ leida: true })
    .eq("usuario_id", user.id).eq("leida", false);
  if (filtro === "personal") q = q.not("actor_nombre", "is", null);  // solo con actor
  else if (filtro === "bot") q = q.is("actor_nombre", null);         // solo del Bot
  await q;
  revalidatePath("/");
  return {};
}

// Marca UNA notificación como leída (al atenderla individualmente).
export async function marcarNotifLeida(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  await supabase.from("notificaciones").update({ leida: true })
    .eq("id", id).eq("usuario_id", user.id);
  revalidatePath("/");
  return {};
}

export async function cerrarSesion() {
  const supabase = createClient();
  await supabase.auth.signOut();
}

export async function cambiarEstado(pubId: string, estado: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* `.select("id")` no es adorno: sin él, un UPDATE bloqueado por RLS vuelve
     con error=null y 0 filas — la acción decía «ok» y la UI rebotaba al valor
     viejo sin explicar por qué. Comprobar las filas afectadas convierte ese
     no-op silencioso en un aviso. */
  const { data: filas, error } = await supabase.from("publicaciones")
    .update({ estado }).eq("id", pubId).select("id");
  if (error) return { error: error.message };
  if (!filas?.length) return { error: "No se pudo cambiar el estado (sin permiso o el caso ya no existe)." };

  // Cierre de ida y vuelta: caso resuelto → actividad del cronograma finalizada
  if (estado === "resuelta") {
    await supabase.from("cronograma_actividades")
      .update({ estado: "finalizada" }).eq("publicacion_id", pubId).neq("estado", "finalizada");
  } else {
    // Si deja de estar resuelto, reaparece en el feed de quien lo había ocultado
    await supabase.from("feed_ocultos").delete().eq("publicacion_id", pubId);
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

export async function ocultarDelFeed(pubId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("feed_ocultos").upsert(
    { usuario_id: user.id, publicacion_id: pubId },
    { onConflict: "usuario_id,publicacion_id", ignoreDuplicates: true });
  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

/* Ocultar en BLOQUE los resueltos que el usuario tiene A LA VISTA —el mismo
   "quítalo de MI feed" del ojo, pero de una—. Recibe los ids visibles (los que
   ve en su pestaña actual), NO barre todo el sistema. Es personal
   (feed_ocultos) y reversible: reabrir el caso lo devuelve al feed. */
export async function ocultarResueltosDelFeed(ids: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const limpio = (ids || []).filter(Boolean);
  if (!limpio.length) return { ok: 0 };
  const { error } = await supabase.from("feed_ocultos").upsert(
    limpio.map(id => ({ usuario_id: user.id, publicacion_id: id })),
    { onConflict: "usuario_id,publicacion_id", ignoreDuplicates: true });
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: limpio.length };
}

/* ARCHIVAR / DESPERTAR — el eje `archivado_en`, no el estado.
   Archivar es GLOBAL (sale de la vista de todos) y distinto de `feed_ocultos`,
   que es personal («quítalo de MI feed»). Un caso se archiva cuando ya está
   cerrado —resuelta o descartada— y no queremos verlo, pero SÍ tenerlo: es la
   memoria. Despertar es quitar la fecha; el caso vuelve con el estado que
   tenía, porque archivar nunca lo cambió. Ésa es la razón de partir los ejes:
   antes archivar borraba cómo terminó el caso. */
export async function archivar(pubId: string, archivar = true) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* `.select("id")` para VER lo que pasó: un UPDATE bloqueado por RLS no da
     error, devuelve 0 filas. Sin mirar `data.length`, la función diría «ok»
     sin haber archivado nada —el fallo silencioso que el .select decía evitar
     y no evitaba, porque nadie leía el data—. */
  const { data, error } = await supabase.from("publicaciones")
    .update({ archivado_en: archivar ? new Date().toISOString() : null })
    .eq("id", pubId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se pudo archivar (sin permiso o el caso ya no existe)." };
  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion", entidad_id: pubId, actor_id: user.id, tipo: "archivo",
    detalle: { a: archivar ? "archivado" : "despertado" },
  });
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  revalidatePath("/tablero");
  return {};
}

export async function cambiarFechaLimite(pubId: string, fecha: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Acepta 'YYYY-MM-DD'; vacío = quitar la fecha
  const val = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
  const { data: antes } = await supabase.from("publicaciones")
    .select("fecha_limite").eq("id", pubId).single();
  const { error } = await supabase.from("publicaciones")
    .update({ fecha_limite: val }).eq("id", pubId);
  if (error) return { error: error.message };
  // 🗂 Bitácora
  if ((antes?.fecha_limite || null) !== val) {
    const fmt = (d: string) => new Date(d + "T12:00:00")
      .toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" });
    await supabase.from("actividad").insert({
      entidad_tipo: "publicacion", entidad_id: pubId, actor_id: user.id, tipo: "edicion",
      detalle: { mensaje: val ? `puso la fecha límite en ${fmt(val)}` : "quitó la fecha límite" },
    });
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  revalidatePath("/tablero");
  return {};
}

// Notificaciones del usuario (con vínculos de entidad) para la campanita global.
// Trae las recientes de CADA tipo por separado (12 y 12), no 20 mezcladas: así
// la pestaña "Del Bot" del desplegable no queda con las pocas que se colaron.
const CAMP_LIM = 12;
export async function misNotificaciones() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { items: [], sinLeer: 0, sinLeerBot: 0 };
  // `objeto_id`: una notificación puede colgar de un caso O de un objeto del
  // repositorio. Sin traerla, el aviso llega pero no lleva a ninguna parte.
  const cols = "id,tipo,mensaje,actor_nombre,publicacion_id,objeto_id,prestamo_id,equipamiento_id,dafo_id,leida,creado_en";
  /* La consulta en una función para poder repetirla sin `dafo_id` si esa
     columna aún no existe (ver lib/notificaciones.ts → COL_DAFO). */
  const tanda = (c: string, esBot: boolean) => {
    const q = supabase.from("notificaciones").select(c).eq("usuario_id", user.id);
    return (esBot ? q.is("actor_nombre", null) : q.not("actor_nombre", "is", null))
      .order("creado_en", { ascending: false }).order("id", { ascending: false }).limit(CAMP_LIM);
  };
  const r = await Promise.all([
    tanda(cols, false),
    tanda(cols, true),
    // Timbre = solo lo personal sin leer (lo que pide tu acción).
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false).not("actor_nombre", "is", null),
    // Contador propio de las automáticas del Bot sin leer.
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false).is("actor_nombre", null),
  ]);
  let pers: any = r[0].data, bot: any = r[1].data;
  const sinLeer = r[2].count, sinLeerBot = r[3].count;
  if (sinColumna(r[0].error, COL_DAFO) || sinColumna(r[1].error, COL_DAFO)) {
    const r2 = await Promise.all([tanda(sinDafoId(cols), false), tanda(sinDafoId(cols), true)]);
    pers = r2[0].data; bot = r2[1].data;
  }
  const items = await conVinculos(supabase, [...(pers || []), ...(bot || [])]);
  return { items, sinLeer: sinLeer || 0, sinLeerBot: sinLeerBot || 0 };
}

/* ===== MURO — mensajes efímeros de oficina (reemplaza el chat del almuerzo) =====
   Se ven solo los de HOY (hora de Lima) y se limpian solos. */
// Inicio del día en Lima (UTC-5 todo el año) como timestamptz ISO.
function inicioDiaLima(): string {
  const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }); // YYYY-MM-DD
  return `${dia}T00:00:00-05:00`;
}

export async function muroMensajes() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { mensajes: [], yo: null };
  const { data } = await supabase.from("muro_mensajes")
    .select("id,texto,vistos,creado_en,autor_id,autor:perfiles(nombre,color,avatar_url)")
    .gte("creado_en", inicioDiaLima())
    .order("creado_en", { ascending: false });
  return { mensajes: data || [], yo: user.id };
}

export async function publicarMuro(texto: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const t = (texto || "").trim().slice(0, 280);
  if (!t) return { error: "Escribe algo." };
  const { error } = await supabase.from("muro_mensajes").insert({ autor_id: user.id, texto: t });
  if (error) return { error: error.message };
  return {};
}

export async function borrarMuro(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("muro_mensajes").delete().eq("id", id);  // RLS: solo lo propio
  return error ? { error: error.message } : {};
}

export async function toggleVistoMuro(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.rpc("muro_toggle_visto", { mid: id });
  return error ? { error: error.message } : {};
}

/* Detalle para el panel de la página de notificaciones: el caso al que apunta
   la notificación + sus últimos eventos de bitácora (quién hizo qué y cuándo).
   Read-only; formato final lo arma el cliente. */
export async function actividadDeCaso(pubId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { caso: null, eventos: [], nComentarios: 0, reacciones: [] };
  const [{ data: caso }, { data: evs }, { count: nComentarios }, { data: reacs }] = await Promise.all([
    supabase.from("publicaciones")
      .select("id,titulo,tipo,estado,prioridad,fecha_limite,creado_en," +
        "autor:perfiles!publicaciones_autor_id_fkey(nombre)," +
        "resp:perfiles!publicaciones_responsable_fkey(nombre)")
      .eq("id", pubId).single(),
    supabase.from("actividad")
      .select("id,tipo,detalle,creado_en,actor:perfiles(nombre)")
      .in("entidad_tipo", grafiasDe("publicacion")).eq("entidad_id", pubId)
      .order("creado_en", { ascending: false }).limit(12),
    supabase.from("comentarios").select("id", { count: "exact", head: true }).eq("publicacion_id", pubId),
    supabase.from("reacciones").select("emoji").eq("publicacion_id", pubId).is("comentario_id", null),
  ]);
  // Reacciones agrupadas por emoji.
  const rc = new Map<string, number>();
  (reacs || []).forEach((r: any) => rc.set(r.emoji, (rc.get(r.emoji) || 0) + 1));
  const reacciones = [...rc.entries()].map(([emoji, n]) => ({ emoji, n }));
  return { caso: caso || null, eventos: evs || [], nComentarios: nComentarios || 0, reacciones };
}

/* Enriquecer notificaciones con los chips de sus vínculos. Lo usan
   misNotificaciones (la campanita, 12) y notificacionesTodas (la página,
   paginada): mismo trabajo, un solo sitio. Antes vivía inline dentro de
   misNotificaciones; al nacer la página iba a ser la segunda copia. */
async function conVinculos(supabase: any, notifs: any[]) {
  const ids = [...new Set(notifs.map((n: any) => n.publicacion_id).filter(Boolean))];
  const vincDe = new Map<string, { tipo: string; nombre: string }[]>();
  /* Cuáles de esas publicaciones son NOTAS DE MURO. Comparten tabla con los
     casos, así que desde la notificación son indistinguibles — y por eso
     acababan abriendo una ficha de caso alrededor de un apunte. Con el tipo
     en la mano, `rutaNotif` las manda a su muro. */
  const esMuro = new Set<string>();
  if (ids.length) {
    const { data: tipos } = await supabase.from("publicaciones")
      .select("id,tipo").in("id", ids);
    (tipos || []).forEach((t: any) => { if (t.tipo === "bitacora") esMuro.add(t.id); });
  }
  /* De qué entidad es cada nota: su PRIMER vínculo, que es el que creó
     `publicarBitacora` (una nota nace en un muro y solo en uno). */
  const muroDe = new Map<string, { tipo: string; id: string }>();
  if (ids.length) {
    const { data: vincs } = await supabase.from("publicacion_vinculos")
      .select("publicacion_id,entidad_tipo,entidad_id").in("publicacion_id", ids);
    const TABLA: Record<string, [string, string]> = {
      proyecto: ["proyectos", "nombre"], empresa: ["empresas", "nombre"],
      persona: ["personas", "nombre"], convocatoria: ["convocatorias", "codigo"],
      postulacion: ["postulaciones", "codigo"], equipamiento: ["equipamiento", "nombre"],
      lugar: ["lugares", "nombre"], etiqueta: ["etiquetas", "nombre"],
    };
    const porTipo = new Map<string, Set<string>>();
    (vincs || []).forEach((v: any) => {
      if (!porTipo.has(v.entidad_tipo)) porTipo.set(v.entidad_tipo, new Set());
      porTipo.get(v.entidad_tipo)!.add(v.entidad_id);
      if (esMuro.has(v.publicacion_id) && !muroDe.has(v.publicacion_id)) {
        muroDe.set(v.publicacion_id, { tipo: v.entidad_tipo, id: v.entidad_id });
      }
    });
    const nombres = new Map<string, string>();
    await Promise.all([...porTipo.entries()].map(async ([tipo, idset]) => {
      const t = TABLA[tipo]; if (!t) return;
      // Personas: prefiere el alias (nombre corto) para el chip; cae al nombre.
      const cols = tipo === "persona" ? "id,nombre,alias" : `id,${t[1]}`;
      const { data } = await supabase.from(t[0]).select(cols).in("id", [...idset]);
      (data || []).forEach((r: any) =>
        nombres.set(`${tipo}:${r.id}`, tipo === "persona" ? (r.alias || r.nombre) : r[t[1]]));
    }));
    (vincs || []).forEach((v: any) => {
      const nombre = nombres.get(`${v.entidad_tipo}:${v.entidad_id}`);
      if (!nombre) return;
      const l = vincDe.get(v.publicacion_id) || [];
      l.push({ tipo: v.entidad_tipo, nombre });
      vincDe.set(v.publicacion_id, l);
    });
  }
  /* Un aviso de préstamo cuelga de `prestamo_id`; su destino es la ficha del
     EQUIPO. Se resuelve aquí prestamo → equipamiento (id + nombre) para poder
     enlazar y pintar el chip, igual que los vínculos de una publicación. */
  const idsPrest = [...new Set(notifs.map((n: any) => n.prestamo_id).filter(Boolean))];
  const equipoDe = new Map<string, { id: string; nombre: string }>();
  if (idsPrest.length) {
    const { data: prs } = await supabase.from("equipo_prestamos")
      .select("id,equipo:equipamiento(id,nombre)").in("id", idsPrest);
    (prs || []).forEach((p: any) => {
      const e = Array.isArray(p.equipo) ? p.equipo[0] : p.equipo;
      if (e?.id) equipoDe.set(p.id, { id: e.id, nombre: e.nombre });
    });
  }
  /* Un aviso de la bitácora del equipo ya trae el equipamiento_id directo: solo
     falta el nombre para el chip. */
  const idsEq = [...new Set(notifs.map((n: any) => n.equipamiento_id).filter(Boolean))];
  const nombreEq = new Map<string, string>();
  if (idsEq.length) {
    const { data: eqs } = await supabase.from("equipamiento").select("id,nombre").in("id", idsEq);
    (eqs || []).forEach((e: any) => nombreEq.set(e.id, e.nombre));
  }
  return notifs.map((n: any) => {
    // Directo (bitácora) manda; si no, el derivado del uso (prestamo→equipo).
    const eq = n.equipamiento_id
      ? { id: n.equipamiento_id, nombre: nombreEq.get(n.equipamiento_id) || "un equipo" }
      : n.prestamo_id ? equipoDe.get(n.prestamo_id) : null;
    return {
      ...n,
      // El id del equipo para que `rutaNotif` sepa a dónde llevar el aviso.
      equipamiento_id: eq?.id || null,
      /* Y el muro, si la publicación es una nota y no un caso. `null` cuando
         la nota se quedó sin vínculo (el insert del vínculo falló): entonces
         no hay muro al que llevarla y sigue el camino de siempre. */
      muro: n.publicacion_id ? muroDe.get(n.publicacion_id) || null : null,
      vinculos: n.publicacion_id
        ? (vincDe.get(n.publicacion_id) || [])
        : eq ? [{ tipo: "equipamiento", nombre: eq.nombre }] : [],
    };
  });
}

/* LA PÁGINA /notificaciones — el historial completo, en tandas.
   La campanita corta en 12 ("lo de ahora"); aquí se baja hasta el fondo con
   "ver más", de NOTIF_PAGINA en NOTIF_PAGINA. `range(desde, desde+N-1)` es
   inclusivo en Supabase. `total` alimenta la cabecera y decide `hayMas`.
   Ojo: paginar por creado_en descendente asume que no llegan notifs nuevas
   entre tanda y tanda; si llegan, la primera de la siguiente tanda podría
   repetir una. Es raro (mirar el historial no es tiempo real) y el peor caso
   es una fila duplicada, no un hueco — se acepta por simplicidad. */
const NOTIF_PAGINA = 30;
/* `filtro` acota a una pestaña y —clave— PAGINA dentro de ese tipo, no sobre la
   mezcla: así "Del Bot" trae de bot en bot y no depende de cuántas personales se
   colaron en la tanda. Los contadores (totales y sin leer, por tipo) van siempre,
   para que ambas pestañas muestren su número sin recargar. */
export async function notificacionesTodas(desde = 0, filtro?: "personal" | "bot", chip?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { items: [], hayMas: false, total: 0, totalBot: 0, sinLeer: 0, sinLeerBot: 0 };
  const COLS = "id,tipo,mensaje,actor_nombre,publicacion_id,objeto_id,prestamo_id,equipamiento_id,dafo_id,leida,creado_en";
  /* Armada en una función: si `dafo_id` no existe todavía hay que preguntar
     otra vez sin ella, y un builder ya filtrado no se puede reusar. */
  const consulta = (cols: string) => {
    let q = supabase.from("notificaciones").select(cols).eq("usuario_id", user.id);
    if (filtro === "personal") q = q.not("actor_nombre", "is", null);
    else if (filtro === "bot") q = q.is("actor_nombre", null);
    // Chips: afinan dentro de la pestaña. "todas"/undefined no filtra.
    if (chip === "no_leidas") q = q.eq("leida", false);
    else if (chip === "mencion") q = q.eq("tipo", "mencion");
    else if (chip === "comentario") q = q.eq("tipo", "comentario");
    else if (chip === "asignacion") q = q.eq("tipo", "asignacion");
    else if (chip === "dafo") q = q.in("tipo", TIPOS_DAFO);
    return q;
  };
  const q = consulta(COLS);
  const [{ data: notifsRaw, error: eNotifs }, { count: total }, { count: totalBot }, { count: sinLeer }, { count: sinLeerBot }] = await Promise.all([
    /* Desempate por id: dos notifs con el MISMO creado_en (p.ej. un insert
       múltiple a varios destinatarios) no tienen orden estable entre dos SELECT
       paginados sin segundo criterio → una podría saltarse (hueco). */
    q.order("creado_en", { ascending: false }).order("id", { ascending: false })
      .range(desde, desde + NOTIF_PAGINA - 1),
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id),
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).is("actor_nombre", null),
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false).not("actor_nombre", "is", null),
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false).is("actor_nombre", null),
  ]);
  /* Si la columna de la casilla no existe todavía, se repite la consulta sin
     ella: la bandeja de notificaciones NO puede quedarse vacía por un SQL
     pendiente de otro módulo. */
  let notifs: any = notifsRaw;
  if (sinColumna(eNotifs, COL_DAFO)) {
    const { data } = await consulta(sinDafoId(COLS))
      .order("creado_en", { ascending: false }).order("id", { ascending: false })
      .range(desde, desde + NOTIF_PAGINA - 1);
    notifs = data;
  }
  const items = await conVinculos(supabase, notifs || []);
  /* hayMas heurístico: si vino una página completa, probablemente hay más. Con
     chips no tenemos un total exacto por combinación, y esto funciona igual para
     todas (el peor caso es un "ver más" que trae 0 cuando el total es múltiplo
     exacto de la página). Los contadores de arriba (totales/sin leer) van aparte. */
  return {
    items, hayMas: (notifs?.length || 0) === NOTIF_PAGINA,
    total: total || 0, totalBot: totalBot || 0,
    sinLeer: sinLeer || 0, sinLeerBot: sinLeerBot || 0,
  };
}

// Catálogos + perfiles para el compositor global (FAB "+"), bajo demanda.
export async function datosNuevoCaso() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* Los MISMOS catálogos que el feed, armados por la misma función. Es
     literalmente el mismo compositor abierto desde el «+» flotante: si aquí la
     persona sale como «Nombre · Alias» y allá con el alias apagado, el usuario
     ve dos formularios distintos para la misma tarea. */
  const [ents, objs, etiq, perfs] = await Promise.all([
    catalogosEntidades(supabase),
    catalogoObjetos(supabase),
    supabase.from("etiquetas").select("id,nombre").order("nombre"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
  ]);
  const catalogos = { ...ents, etiqueta: etiq.data || [], objeto: objs };
  return { userId: user.id, catalogos, perfiles: perfs.data || [] };
}

export async function cambiarTipo(pubId: string, tipo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const VALIDOS = ["aviso", "tarea", "problema", "consulta", "pago", "idea", "archivo"];
  if (!VALIDOS.includes(tipo)) return { error: "Tipo no válido." };
  const { error } = await supabase.from("publicaciones").update({ tipo }).eq("id", pubId);
  if (error) return { error: error.message };
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

/* ─────────────────────────────────────────────────────────────────────────
   VISTA RÁPIDA — detalle simplificado de un caso para el pop-up.
   Es de LECTURA: lo justo para leer e interactuar sin abrir la página entera
   (título, cuerpo, estado, responsable, vencimiento, comentarios, reacciones).
   El pop-up llama las mismas acciones de escritura de siempre y luego vuelve a
   pedir esto para refrescarse solo. ───────────────────────────────────────── */
export async function cargarCasoRapido(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: p, error } = await supabase.from("publicaciones")
    .select("id,titulo,cuerpo,tipo,estado,fecha_limite,archivado_en,creado_en,autor_id,responsable," +
      "autor:perfiles!publicaciones_autor_id_fkey(nombre)," +
      "vinculos:publicacion_vinculos(entidad_tipo,entidad_id)")
    .eq("id", id).single();
  if (error || !p) return { error: "No se encontró el caso." };

  const [coms, rx, perf] = await Promise.all([
    supabase.from("comentarios")
      .select("id,cuerpo,imagenes,creado_en,autor_id,autor:perfiles(nombre,color,avatar_url)")
      .eq("publicacion_id", id).order("creado_en"),
    supabase.from("reacciones").select("emoji,usuario_id")
      .is("comentario_id", null).eq("publicacion_id", id),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
  ]);
  const perfiles = sinBot(perf.data || []);

  /* Vínculos → nombre (contexto del caso). Solo se consultan las tablas de los
     tipos que este caso realmente usa, por sus ids (barato). */
  const vinc = ((p as any).vinculos || []) as { entidad_tipo: string; entidad_id: string }[];
  const RES: Record<string, { tabla: string; sel: string; fmt: (x: any) => string }> = {
    proyecto: { tabla: "proyectos", sel: "id,nombre", fmt: x => x.nombre },
    empresa: { tabla: "empresas", sel: "id,nombre", fmt: x => x.nombre },
    persona: { tabla: "personas", sel: "id,nombre,alias", fmt: x => x.alias || x.nombre },
    convocatoria: { tabla: "convocatorias", sel: "id,nombre,anio", fmt: x => `${x.nombre}${x.anio ? ` ${x.anio}` : ""}` },
    postulacion: { tabla: "postulaciones", sel: "id,codigo,proy:proyectos(nombre)", fmt: x => x.proy?.nombre ? `${x.codigo} · ${x.proy.nombre}` : x.codigo },
    equipamiento: { tabla: "equipamiento", sel: "id,folio,nombre", fmt: x => `${x.folio ? x.folio + " · " : ""}${x.nombre}` },
    lugar: { tabla: "lugares", sel: "id,nombre", fmt: x => x.nombre },
    etiqueta: { tabla: "etiquetas", sel: "id,nombre,color", fmt: x => x.nombre },
    objeto: { tabla: "objetos", sel: "id,titulo", fmt: x => x.titulo },
  };
  const nombres = new Map<string, string>();
  const etqColor = new Map<string, string>();
  await Promise.all(Object.keys(RES).map(async t => {
    const idl = vinc.filter(v => v.entidad_tipo === t).map(v => v.entidad_id);
    if (!idl.length) return;
    const { data } = await supabase.from(RES[t].tabla).select(RES[t].sel).in("id", idl);
    (data || []).forEach((x: any) => {
      nombres.set(`${t}:${x.id}`, RES[t].fmt(x));
      if (t === "etiqueta" && x.color) etqColor.set(x.id, x.color);
    });
  }));
  const vinculos = vinc
    .map(v => ({
      tipo: v.entidad_tipo, id: v.entidad_id,
      nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`),
      color: v.entidad_tipo === "etiqueta" ? etqColor.get(v.entidad_id) : undefined,
    }))
    .filter(v => v.nombre);

  return {
    caso: { ...(p as any), comentarios: coms.data || [], reacciones: rx.data || [], vinculos },
    perfiles,
    userId: user.id,
    equipoTotal: perfiles.length,
  };
}

/* VISTA RÁPIDA DE UN OBJETO DEL REPOSITORIO — lectura para el pop-up.
   Un objeto se ve así como se trabaja: se abre sin salir de la página, se lee
   (portada + notas + procedencia), se conversa (comentarios con sus reacciones)
   y se salta a los casos vinculados. Reusa las escrituras existentes
   (comentarObjeto, toggleReaccion); esto es solo la lectura. */
export async function cargarObjetoRapido(objetoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: o, error } = await supabase.from("objetos").select("*").eq("id", objetoId).single();
  if (error || !o) return { error: "No se encontró el objeto." };

  const [{ data: vincs }, { data: casosVinc }, { data: coments }, { data: perf }, { data: verifs }] =
    await Promise.all([
      supabase.from("objeto_vinculos").select("entidad_tipo,entidad_id").eq("objeto_id", objetoId),
      supabase.from("publicacion_vinculos")
        .select("pub:publicaciones(id,titulo,tipo,estado,creado_en,autor:perfiles!publicaciones_autor_id_fkey(nombre),comentarios(count))")
        .eq("entidad_tipo", "objeto").eq("entidad_id", objetoId),
      supabase.from("comentarios")
        .select("id,cuerpo,imagenes,creado_en,editado_en,autor_id,responde_a,autor:perfiles(nombre,color,avatar_url)")
        .eq("objeto_id", objetoId).order("creado_en"),
      supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("link_verificaciones")
        .select("url,correcto,verificado_en,por:perfiles(nombre)")
        .eq("entidad_tipo", (o as any).entidad_tipo).eq("entidad_id", (o as any).entidad_id)
        .eq("campo", `objeto:${objetoId}`),
    ]);
  const perfiles = sinBot(perf || []);

  // Reacciones SOLO de los comentarios de este objeto (agrupadas por comentario).
  const idsCom = (coments || []).map((c: any) => c.id);
  const { data: reaccs } = idsCom.length
    ? await supabase.from("reacciones").select("comentario_id,emoji,usuario_id").in("comentario_id", idsCom)
    : { data: [] as any[] };
  const { data: perfsRx } = await supabase.from("perfiles").select("id,nombre");
  const nombrePerfil = new Map(((perfsRx as any[]) || []).map((x: any) => [x.id, x.nombre]));
  const reaccionesPorComentario: Record<string, { emoji: string; usuario_id: string; nombre?: string }[]> = {};
  (reaccs || []).forEach((r: any) => {
    (reaccionesPorComentario[r.comentario_id] ||= []).push({
      emoji: r.emoji, usuario_id: r.usuario_id, nombre: nombrePerfil.get(r.usuario_id),
    });
  });

  // Dueño + entidades vinculadas, resueltos a nombre.
  const pares = [
    { tipo: (o as any).entidad_tipo, id: (o as any).entidad_id },
    ...(vincs || []).map((v: any) => ({ tipo: v.entidad_tipo, id: v.entidad_id })),
  ];
  const nombres = await resolverNombres(supabase, pares);
  const dueno = {
    tipo: (o as any).entidad_tipo, id: (o as any).entidad_id,
    nombre: nombres.get(`${(o as any).entidad_tipo}:${(o as any).entidad_id}`) || "—",
  };
  const vinculadas = (vincs || []).map((v: any) => ({
    tipo: v.entidad_tipo, id: v.entidad_id,
    nombre: nombres.get(`${v.entidad_tipo}:${v.entidad_id}`) || "—",
  })).filter((v: any) => v.nombre !== "—");

  const casos = (casosVinc || []).map((r: any) => r.pub).filter(Boolean)
    .sort((a: any, b: any) => (b.creado_en || "").localeCompare(a.creado_en || ""));

  const v0: any = (verifs || [])[0];
  const verif = v0 ? { por: v0.por?.nombre, en: v0.verificado_en, correcto: v0.correcto } : null;

  return {
    objeto: o, dueno, vinculadas, casos,
    comentarios: coments || [], reaccionesPorComentario, verif,
    perfiles, userId: user.id,
  };
}

/* ── INTERACCIÓN DE UNA POSTULACIÓN ──
   La postulación es UNA sola entidad: su hilo (comentarios + reacciones) cuelga
   de ella, así que se ve idéntico desde la ficha de empresa, proyecto o persona.
   Calcado de la pila de «objeto» (objeto_id → postulacion_id). */
export async function cargarPostulacionRapida(postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: p, error } = await supabase.from("postulaciones")
    .select("id,codigo,estado,proy:proyectos(id,nombre),conv:convocatorias(id,nombre,anio),emp:empresas(id,nombre)")
    .eq("id", postulacionId).single();
  if (error || !p) return { error: "No se encontró la postulación." };

  const [{ data: coments }, { data: perf }] = await Promise.all([
    supabase.from("comentarios")
      .select("id,cuerpo,imagenes,creado_en,editado_en,autor_id,responde_a,autor:perfiles(nombre,color,avatar_url)")
      .eq("postulacion_id", postulacionId).order("creado_en"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
  ]);
  const perfiles = sinBot(perf || []);

  // Reacciones: a la postulación misma (postulacion_id) Y a cada comentario.
  const idsCom = (coments || []).map((c: any) => c.id);
  const [{ data: rxPost }, rxComRes] = await Promise.all([
    supabase.from("reacciones").select("emoji,usuario_id").eq("postulacion_id", postulacionId).is("comentario_id", null),
    idsCom.length
      ? supabase.from("reacciones").select("comentario_id,emoji,usuario_id").in("comentario_id", idsCom)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const rxCom = ((rxComRes as any).data as any[]) || [];
  const { data: perfsRx } = await supabase.from("perfiles").select("id,nombre");
  const nombrePerfil = new Map(((perfsRx as any[]) || []).map((x: any) => [x.id, x.nombre]));
  const reaccionesPorComentario: Record<string, { emoji: string; usuario_id: string; nombre?: string }[]> = {};
  rxCom.forEach((r: any) => {
    (reaccionesPorComentario[r.comentario_id] ||= []).push({ emoji: r.emoji, usuario_id: r.usuario_id, nombre: nombrePerfil.get(r.usuario_id) });
  });
  const reaccionesPostulacion = (rxPost || []).map((r: any) => ({ emoji: r.emoji, usuario_id: r.usuario_id, nombre: nombrePerfil.get(r.usuario_id) }));

  return {
    postulacion: p,
    comentarios: coments || [], reaccionesPorComentario, reaccionesPostulacion,
    perfiles, userId: user.id,
  };
}

export async function comentarPostulacion(postulacionId: string, texto: string, imagenes: string[] = [], respondeA: string | null = null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cuerpo = (texto || "").trim();
  const imgs = (imagenes || []).filter(Boolean).slice(0, 6);
  if (!cuerpo && !imgs.length) return { error: "El comentario no puede ir vacío." };

  const { data: com, error } = await supabase.from("comentarios")
    .insert({ postulacion_id: postulacionId, autor_id: user.id, cuerpo: cuerpo || "📷", imagenes: imgs, responde_a: respondeA || null })
    .select("id").single();
  if (error) return { error: error.message };

  const [{ data: miP }, { data: post }] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("id", user.id).single(),
    supabase.from("postulaciones")
      .select("codigo,proy:proyectos(id,nombre),emp:empresas(id),equipo:postulacion_equipo(persona:personas(id))")
      .eq("id", postulacionId).single(),
  ]);
  const actorNombre = miP?.nombre || "Alguien";
  const proy = Array.isArray((post as any)?.proy) ? (post as any).proy[0] : (post as any)?.proy;
  const emp = Array.isArray((post as any)?.emp) ? (post as any).emp[0] : (post as any)?.emp;
  const titulo = (proy?.nombre || (post as any)?.codigo || "postulación").slice(0, 60);

  // 🪄 Menciones @nombre — mismo reconocimiento que en casos/objetos.
  const tokens = [...new Set((cuerpo.match(/@[^\s@,;:!?*_`]+/g) || []).map(m => m.slice(1)))];
  const avisados = new Set<string>([user.id]);
  if (tokens.length) {
    const nrmM = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const { data: perfs } = await supabase.from("perfiles").select("id,nombre").eq("activo", true);
    for (const pf of perfs || []) {
      const sinEspacios = nrmM(pf.nombre).replace(/\s+/g, "");
      const palabras = nrmM(pf.nombre).split(/\s+/);
      const invocado = tokens.some(t => { const tk = nrmM(t); return sinEspacios.startsWith(tk) || palabras.some(w => w.startsWith(tk)); });
      if (invocado && !avisados.has(pf.id)) {
        avisados.add(pf.id);
        await supabase.from("notificaciones").insert({
          usuario_id: pf.id, postulacion_id: postulacionId, tipo: "mencion", actor_nombre: actorNombre,
          mensaje: `🪄 ${actorNombre.split(" ")[0]} te mencionó en «${titulo}»`,
        });
      }
    }
  }

  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "comentario",
    detalle: { comentario_id: com.id },
  });
  // El hilo es el mismo desde las 3 fichas: refrescamos el contador 💬 en todas
  // ellas, además de la página de la postulación y el feed (por la actividad).
  revalidatePath("/");
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  if (proy?.id) revalidatePath(`/entidad/proyecto/${proy.id}`);
  if (emp?.id) revalidatePath(`/entidad/empresa/${emp.id}`);
  for (const e of ((post as any)?.equipo || [])) {
    const per = Array.isArray(e?.persona) ? e.persona[0] : e?.persona;
    if (per?.id) revalidatePath(`/entidad/persona/${per.id}`);
  }
  return {};
}

/* METADATOS DE UN ENLACE (unfurl). Lee la página del lado del servidor y saca
   sus etiquetas Open Graph: título, descripción e imagen reales. Así un enlace
   —YouTube, Google Doc, una nota de prensa— muestra su carátula y su título de
   verdad, en vez de adivinar la miniatura por el patrón de la URL (que para
   YouTube devuelve un gris cuando el video no tiene esa versión).

   El navegador NO puede hacer esto: las páginas no mandan CORS. Por eso vive
   aquí, en el servidor. `next.revalidate` cachea un día: el mismo enlace no se
   vuelve a bajar en cada render. */
function decodeEntidades(s: string): string {
  return (s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return _; } });
}

export async function unfurlEnlace(url: string): Promise<{ title?: string; description?: string; image?: string; site?: string }> {
  try {
    const u = new URL((url || "").startsWith("http") ? url : `https://${url}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return {};
    // Cortafuegos SSRF: nada de hosts internos/privados desde el servidor.
    const host = u.hostname;
    if (host === "localhost" || host === "::1" ||
        /^(127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return {};

    const r = await fetch(u.toString(), {
      headers: { "user-agent": "Mozilla/5.0 (compatible; CrewHubBot/1.0; +preview)", "accept": "text/html,*/*" },
      redirect: "follow",
      // @ts-ignore  — opción de caché de Next
      next: { revalidate: 86400 },
    });
    if (!r.ok) return {};
    if (!/text\/html/i.test(r.headers.get("content-type") || "")) return {};
    const html = (await r.text()).slice(0, 300000);   // las OG viven en el <head>

    const meta = (prop: string) => {
      const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"));
      const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"));
      const m = a || b;
      return m ? decodeEntidades(m[1]).trim() : "";
    };
    const tituloTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = (meta("og:title") || meta("twitter:title") || (tituloTag ? decodeEntidades(tituloTag[1]).trim() : "")).slice(0, 160);
    const description = (meta("og:description") || meta("twitter:description") || meta("description")).slice(0, 220);
    const image = meta("og:image") || meta("og:image:url") || meta("twitter:image") || "";
    const site = meta("og:site_name");
    if (!title && !image) return {};
    return { title, description, image, site };
  } catch {
    return {};
  }
}
