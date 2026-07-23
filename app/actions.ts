"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { FORM_CONF, nombreCorto } from "@/lib/entidades";
import { nrmQ } from "@/lib/quechua";
import { procesarSunatEmpresa, correrRondaSunat, consultarRucApi } from "@/lib/sunat";
import { rucDePersona } from "@/lib/ruc";
import { TOKEN } from "@/lib/puertas";
import { BOT } from "@/lib/personas";
import { CAMPOS_TABLA } from "@/lib/tablas-expediente";
import { esCampoDelTrigger } from "@/lib/actividad";
import { SECCIONES } from "@/lib/secciones";
import { TIPOS_OBJETO } from "@/lib/objetos";
import { catalogoObjetos, catalogosEntidades } from "@/lib/catalogos";

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
      .filter(d => d && d !== user.id);
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
  const { error } = await supabase.from("publicaciones")
    .update({ responsable: perfilId }).eq("id", pubId);
  if (error) return { error: error.message };

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
    const hoyS = new Date().toISOString().slice(0, 10);
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
        const estado = decidida ? "cerrada" : "postulacion";
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

  // Las fracciones (½, 1½) solo aplican a oficina; rodaje/scouting = día completo.
  // scouting/oficina pagan con tarifa de día; solo rodaje usa la de rodaje.
  // El pernocte no aplica en oficina.
  const frac = tipo === "oficina" ? fraccion : 1;
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

  const frac = tipo === "oficina" ? fraccion : 1;
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
  return {};
}

export async function borrarRhe(id: string, personaId: string) {
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
  const hoy = new Date().toISOString().slice(0, 10);
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
    actualizado: new Date().toISOString().slice(0, 10),
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
    fecha_inicio: fechaInicio || new Date().toISOString().slice(0, 10),
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
    .update({ estado: "inactivo", fecha_fin: new Date().toISOString().slice(0, 10) })
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
    actualizado_en: new Date().toISOString().slice(0, 10),
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
    ...nuevo, actualizado_en: new Date().toISOString().slice(0, 10),
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
    verificado_en: new Date().toISOString().slice(0, 10), // recién ingresado = verificado hoy
  });
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `agregó el dato «${etiqueta.trim()}»` },
  });
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
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
    .update({ verificado_en: new Date().toISOString().slice(0, 10) }).eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: dueno, entidad_id: duenoId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `reverificó el dato «${prev?.etiqueta || "—"}»` },
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
const colCrono = (d: DuenoCrono) =>
  d === "proyecto" ? "proyecto_id" : d === "convocatoria" ? "convocatoria_id" : "postulacion_id";

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
    clase: d.clase === "hito_externo" ? "hito_externo" : "trabajo",
    fecha_inicio: d.ini,
    fecha_fin: d.fin || d.ini,
    responsable: d.responsable || null,
    descripcion: d.descripcion?.trim() || null,
    equipo: equipo.length ? equipo : null,
    dias_anticipacion: parseInt(d.antic) || 7,
    orden,
    estado: "planificada",
  });
  if (error) return { error: error.message };
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
    dias_anticipacion: a.dias_anticipacion ?? 7,
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
    dias_anticipacion: a.dias_anticipacion ?? 7,
    orden: a.orden ?? 0,
    estado: "planificada",
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
    .select("nombre,etapa,clase,fecha_inicio,fecha_fin,responsable,dias_anticipacion")
    .eq("id", actId).maybeSingle();

  const fila = {
    nombre: d.nombre.trim(),
    etapa: d.etapa || null,
    clase: d.clase === "hito_externo" ? "hito_externo" : "trabajo",
    fecha_inicio: d.ini,
    fecha_fin: fin,
    responsable: d.responsable || null,
    descripcion: d.descripcion?.trim() || null,
    equipo: equipoEd.length ? equipoEd : null,
    dias_anticipacion: parseInt(d.antic) || 7,
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

/* Responsable al vuelo. No registra a mano en la bitácora: el trigger
   `registrar_evento_estado` ya vigila `responsable` en cronograma_actividades
   y lo deja escrito solo. Si lo escribiéramos otra vez aquí, saldría doble. */
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
    .select("equipo").eq("id", actId).maybeSingle();
  const equipo = ((act?.equipo as string[] | null) || []).filter(id => id && id !== respId);
  const { data, error } = await supabase.from("cronograma_actividades")
    .update({ responsable: respId || null, equipo: equipo.length ? equipo : null })
    .eq("id", actId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
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
  const limpio = [...new Set((equipo || []).filter(Boolean))];
  const { data, error } = await supabase.from("cronograma_actividades")
    .update({ equipo: limpio.length ? limpio : null }).eq("id", actId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se guardó: no tienes permiso." };
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

/* LA FOTO DE LO POSTULADO. Congela en la postulación el cronograma tal como
   está ahora —lo que se envía a DAFO—. El vivo (cronograma_actividades) sigue
   editándose; esto es el registro de lo presentado, para el expediente y para
   comparar después qué cambió si se gana el fondo. */
export async function fijarCronogramaPostulado(postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: acts } = await supabase.from("cronograma_actividades")
    .select("nombre,etapa,fecha_inicio,fecha_fin,descripcion,resp:perfiles(nombre)")
    .eq("postulacion_id", postulacionId).neq("estado", "cancelada").not("fecha_inicio", "is", null)
    .order("etapa").order("orden").order("fecha_inicio").order("creado_en");
  const foto = (acts || []).map((a: any) => ({
    nombre: a.nombre, etapa: a.etapa,
    fecha_inicio: a.fecha_inicio, fecha_fin: a.fecha_fin,
    responsable: (a.resp as any)?.nombre || null,
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
    detalle: { mensaje: `📸 fijó el cronograma postulado (${foto.length} actividades)` },
  });
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

export async function cancelarActividadCrono(actId: string, dueno: string, duenoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("cronograma_actividades")
    .update({ estado: "cancelada" }).eq("id", actId);
  if (error) return { error: error.message };
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

  const hoy = new Date().toISOString().slice(0, 10);
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
    const hoy = new Date().toISOString().slice(0, 10);
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
  const hoy = new Date().toISOString().slice(0, 10);
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
export async function prestarEquipo(equipoId: string, personaId: string, proyectoId: string | null, nota: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  // Si alguien más lo tenía, ese préstamo se cierra hoy
  await supabase.from("equipo_prestamos")
    .update({ hasta: new Date().toISOString().slice(0, 10) })
    .eq("equipamiento_id", equipoId).is("hasta", null);

  const { error } = await supabase.from("equipo_prestamos").insert({
    equipamiento_id: equipoId, persona_id: personaId,
    proyecto_id: proyectoId || null, nota: nota.trim() || null,
  });
  if (error) return { error: error.message };

  const { error: e2 } = await supabase.from("equipamiento")
    .update({ estado: "en_uso" }).eq("id", equipoId);
  if (e2) return { error: "Préstamo registrado, pero el estado no se actualizó: " + e2.message };
  revalidatePath(`/entidad/equipamiento/${equipoId}`);
  revalidatePath("/equipamiento");
  return {};
}

export async function devolverEquipo(prestamoId: string, equipoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("equipo_prestamos")
    .update({ hasta: new Date().toISOString().slice(0, 10) })
    .eq("id", prestamoId);
  if (error) return { error: error.message };
  const { error: e2 } = await supabase.from("equipamiento")
    .update({ estado: "disponible" }).eq("id", equipoId);
  if (e2) return { error: "Devolución registrada, pero el estado no se actualizó: " + e2.message };
  revalidatePath(`/entidad/equipamiento/${equipoId}`);
  revalidatePath("/equipamiento");
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
const EMOJIS_REACCION = ["👀", "👍", "❤️", "🔥", "👏", "😂", "😮", "🤔", "😕", "😢"];
export async function toggleReaccion(pubId: string | null, comentarioId: string | null, emoji: string, objetoId?: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!EMOJIS_REACCION.includes(emoji)) return { error: "Reacción no permitida." };

  let q = supabase.from("reacciones").select("id")
    .eq("usuario_id", user.id).eq("emoji", emoji);
  /* Un comentario del repositorio no cuelga de una publicación —`pubId` es
     null—, pero la reacción se guarda igual contra `comentario_id`: la tabla
     `reacciones` ya admitía uno u otro (check `pub is not null OR com is not
     null`). Por eso el toggle busca por comentario cuando lo hay, sin mirar
     `publicacion_id`. */
  q = comentarioId ? q.eq("comentario_id", comentarioId) : q.eq("publicacion_id", pubId).is("comentario_id", null);
  const { data: ya } = await q.maybeSingle();

  if (ya) {
    const { error } = await supabase.from("reacciones").delete().eq("id", ya.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("reacciones").insert({
      publicacion_id: pubId, comentario_id: comentarioId,
      usuario_id: user.id, emoji,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/");
  // La reacción vive donde vive el comentario: caso u objeto.
  if (objetoId) revalidatePath(`/objeto/${objetoId}`);
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
    && pub.fecha_limite >= new Date().toISOString().slice(0, 10);
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
  const { error } = await supabase.from("publicaciones").update({ estado }).eq("id", pubId);
  if (error) return { error: error.message };

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
  const cols = "id,tipo,mensaje,actor_nombre,publicacion_id,objeto_id,leida,creado_en";
  const [{ data: pers }, { data: bot }, { count: sinLeer }, { count: sinLeerBot }] = await Promise.all([
    supabase.from("notificaciones").select(cols)
      .eq("usuario_id", user.id).not("actor_nombre", "is", null)
      .order("creado_en", { ascending: false }).order("id", { ascending: false }).limit(CAMP_LIM),
    supabase.from("notificaciones").select(cols)
      .eq("usuario_id", user.id).is("actor_nombre", null)
      .order("creado_en", { ascending: false }).order("id", { ascending: false }).limit(CAMP_LIM),
    // Timbre = solo lo personal sin leer (lo que pide tu acción).
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false).not("actor_nombre", "is", null),
    // Contador propio de las automáticas del Bot sin leer.
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("usuario_id", user.id).eq("leida", false).is("actor_nombre", null),
  ]);
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
      .eq("entidad_tipo", "publicacion").eq("entidad_id", pubId)
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
  return notifs.map((n: any) => ({
    ...n, vinculos: n.publicacion_id ? (vincDe.get(n.publicacion_id) || []) : [],
  }));
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
  let q = supabase.from("notificaciones")
    .select("id,tipo,mensaje,actor_nombre,publicacion_id,objeto_id,leida,creado_en")
    .eq("usuario_id", user.id);
  if (filtro === "personal") q = q.not("actor_nombre", "is", null);
  else if (filtro === "bot") q = q.is("actor_nombre", null);
  // Chips: afinan dentro de la pestaña. "todas"/undefined no filtra.
  if (chip === "no_leidas") q = q.eq("leida", false);
  else if (chip === "mencion") q = q.eq("tipo", "mencion");
  else if (chip === "comentario") q = q.eq("tipo", "comentario");
  else if (chip === "asignacion") q = q.eq("tipo", "asignacion");
  const [{ data: notifs }, { count: total }, { count: totalBot }, { count: sinLeer }, { count: sinLeerBot }] = await Promise.all([
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
