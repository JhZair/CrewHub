"use server";
import { createClient } from "@/lib/supabase/server";
import { estadoNav, type EstadoNav } from "@/app/nav-acciones";
import { revalidatePath } from "next/cache";
import { entregableEq, porQueNoEq, enRonda, txtEstadoEq } from "@/lib/estadosEquipo";
import { ESTADOS_COMP } from "@/lib/compromisos";
import { META_RENDICION, esTablaRendicion, anclaRendicion, duenoDe, type TablaRendicion } from "@/lib/rendicionHilo";
import { COLS_DUENO_COM, COLS_DUENO_COM_EXTRA } from "@/lib/vinculoComentario";
import { icoTipo, esTipoCreable } from "@/lib/tipos";
import { claseDe as claseDeObligacion, RESULTADOS as RESULTADOS_OBL, DIAS_AVISO } from "@/lib/obligaciones";
import { leerReporteSol, periodosDeSol, leerCasillasSol, casillasVigentes, pareceCopiaPorColumnas, leerDeclaracionesSol, rucDelTexto } from "@/lib/importarSol";
import { FORM_CONF, nombreCorto, SUBCATS_EQUIPO } from "@/lib/entidades";
import { ETAPAS_PROY_VALIDAS } from "@/lib/etapasProyecto";
import { nrmQ } from "@/lib/quechua";
import { procesarSunatEmpresa, correrRondaSunat, consultarRucApi } from "@/lib/sunat";
import { rucDePersona } from "@/lib/ruc";
import { TOKEN } from "@/lib/puertas";
import { BOT, sinBot } from "@/lib/personas";
import { CAMPOS_TABLA } from "@/lib/tablas-expediente";
import { esCampoDelTrigger } from "@/lib/actividad";
import { rotuloEstado } from "@/lib/estados";
import { EMOJIS as EMOJIS_REACCION } from "@/lib/reacciones";
import { SECCIONES, grafiasDe, tipoCanonico, ICO_ENT } from "@/lib/secciones";
import { vinculosDePublicaciones, conNombre } from "@/lib/vinculosPub";
import { fraccionValida, montoJornada } from "@/lib/jornadas";
import { TIPOS_OBJETO } from "@/lib/objetos";
import { catalogoObjetos, catalogosEntidades } from "@/lib/catalogos";
import { resolverNombres } from "@/lib/nombres";
import { COL_DAFO, sinColumna, faltaAlguna, columnasQueFaltan, sinEstas, COLS_NUEVAS, COLS_NOTIF, TIPOS_DAFO } from "@/lib/notificaciones";
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
/* ── INSERTAR UN AVISO SIN QUE LO TUMBE UNA COLUMNA NUEVA ──
 *
 * `comentario_id` llega con db/notif-comentario.sql. Hasta que ese SQL se
 * corra, PostgREST no ignora la columna que no conoce: RECHAZA el insert
 * entero. Y como el error de una notificación no se comprueba en ningún sitio
 * —avisar es un efecto, no el trabajo—, el resultado sería el peor de todos:
 * comentar seguiría funcionando y nadie recibiría aviso, sin una sola línea
 * roja en ninguna parte. Ya nos pasó al revés con `dafo_id` y una bandeja
 * vacía con el badge marcando dos.
 *
 * Así que se intenta con la columna y, si la base dice que no la conoce, se
 * repite sin ella: el aviso llega igual y lo único que pierde es el ancla al
 * párrafo, que es exactamente como funcionaba ayer.
 */
async function notificar(supabase: any, filas: any | any[]) {
  const lista = Array.isArray(filas) ? filas : [filas];
  if (!lista.length) return;
  const { error } = await supabase.from("notificaciones").insert(lista);
  if (!error || !sinColumna(error, "comentario_id")) return;
  await supabase.from("notificaciones").insert(
    lista.map(({ comentario_id, ...resto }: any) => resto));
}

/* ── QUIEN YA ESCRIBIÓ EN UN HILO, OYE EL HILO ──
 *
 * El caso que lo destapó: en un movimiento de caja apuntado por Katy, John
 * preguntó algo y Katy contestó tres horas después. John no se enteró nunca.
 * Y no fue un error de código — las reglas que había se cumplieron todas:
 *
 *   · menciones      → no había @
 *   · quien lo apuntó → era Katy misma, que es quien escribía
 *   · a quien responde → no usó el botón de responder, escribió abajo
 *
 * Tres reglas, tres aciertos, cero avisos. Las tres miran ROLES —autor,
 * responsable, mencionado— y ninguna mira lo único que de verdad predice
 * quién quiere enterarse: haber hablado ahí. Alguien que escribió en una
 * conversación ya declaró su interés mejor de lo que puede hacerlo cualquier
 * campo de la ficha.
 *
 * Por eso esta función es una regla y no un parche en la caja: el mismo hueco
 * estaba en las seis pantallas que tienen comentarios. Un hilo en el que
 * respondes y nadie se entera no es un hilo, es un cuaderno.
 *
 * Se apoya en el mismo `avisados` que ya llevan las acciones, así que a nadie
 * le llegan dos avisos por el mismo comentario.
 */
async function avisarAlHilo(supabase: any, opts: {
  /** La columna dueña del hilo: publicacion_id, objeto_id, movimiento_caja_id… */
  columna: string;
  dueno: string;
  comentarioId: string;
  actorId: string;
  actorNombre: string;
  /** Cómo nombrar la conversación en el aviso. */
  titulo: string;
  /** A quién ya se le avisó por otra vía (se muta: se añaden los nuevos). */
  avisados: Set<string>;
  /** Columnas extra para la notificación. Existe por las filas de la
   *  rendición: la fila sola no dice a qué FONDO pertenece, y sin el fondo el
   *  aviso no puede construir su URL — sonaría y no llevaría a ninguna parte,
   *  que es el fallo que este archivo lleva tres comentarios prometiendo no
   *  repetir. */
  extra?: Record<string, any>;
}) {
  const { columna, dueno, comentarioId, actorId, actorNombre, titulo, avisados, extra } = opts;
  const [{ data: previos }, { data: activos }] = await Promise.all([
    supabase.from("comentarios").select("autor_id").eq(columna, dueno),
    supabase.from("perfiles").select("id").eq("activo", true),
  ]);
  /* Solo cuentas ACTIVAS. Quien dejó el equipo escribió en su día y su
     `autor_id` sigue en el hilo, pero mandarle avisos es llenar una bandeja
     que ya nadie abre. Es la misma condición que aplica la bitácora de
     equipos, de donde viene esta regla. */
  const vivos = new Set<string>((activos || []).map((p: any) => p.id));
  const destinatarios = [...new Set((previos || []).map((c: any) => c.autor_id))]
    .filter((id: any): id is string =>
      !!id && id !== actorId && !avisados.has(id) && vivos.has(id));
  if (!destinatarios.length) return;
  destinatarios.forEach(id => avisados.add(id));
  await notificar(supabase, destinatarios.map(id => ({
    usuario_id: id, [columna]: dueno, comentario_id: comentarioId,
    ...(extra || {}),
    tipo: "comentario", actor_nombre: actorNombre,
    mensaje: `${(actorNombre || "Alguien").split(" ")[0]} escribió en ${titulo}`,
  })));
}

/* ── VINCULADO = ENTERADO ──
 *
 * Estar vinculado a un caso ya avisaba de UNA cosa: del momento en que te
 * vincularon. De lo que pasara después, nada. Autor, responsable, mencionados
 * y —desde `avisarAlHilo`— quien ya había escrito allí; el vinculado que
 * nunca abrió la boca se quedaba fuera de su propio caso.
 *
 * Y el hueco no se notaba desde dentro: quien escribe ve el hilo entero y da
 * por hecho que los vinculados lo están leyendo. El silencio parece
 * conformidad. Es el mismo fallo que destapó `avisarAlHilo` en la caja —tres
 * reglas, tres aciertos, cero avisos— un escalón más arriba.
 *
 * Va DESPUÉS de las otras vías y comparte el mismo `avisados`, así que a nadie
 * le llegan dos por el mismo hecho: el responsable que además está vinculado
 * recibe uno.
 *
 * Solo personas con cuenta y activa. Vincular a alguien es también una forma
 * de archivar —«este rodaje fue con Fulano»— y media plantilla de `personas`
 * no tiene usuario; a esos no hay bandeja a la que escribir.
 */
async function avisarVinculados(supabase: any, opts: {
  /** De qué publicación se leen los vínculos. */
  pubId: string;
  /** A dónde lleva el aviso. Casi siempre la misma; en un sub-caso es el
   *  PADRE, que es donde están listados los hermanos. */
  destino?: string;
  comentarioId?: string | null;
  actorId: string;
  actorNombre: string;
  tipo: string;
  mensaje: string;
  /** A quién ya se le avisó por otra vía (se muta). */
  avisados: Set<string>;
}) {
  const { pubId, destino, comentarioId, actorId, actorNombre, tipo, mensaje, avisados } = opts;
  const { data: vincs } = await supabase.from("publicacion_vinculos")
    .select("entidad_id").eq("publicacion_id", pubId).eq("entidad_tipo", "persona");
  const ids = [...new Set((vincs || []).map((v: any) => v.entidad_id).filter(Boolean))];
  if (!ids.length) return;
  const [{ data: pers }, { data: activos }] = await Promise.all([
    supabase.from("personas").select("usuario_id").in("id", ids).not("usuario_id", "is", null),
    supabase.from("perfiles").select("id").eq("activo", true),
  ]);
  const vivos = new Set<string>((activos || []).map((p: any) => p.id));
  const destinatarios = [...new Set((pers || []).map((p: any) => p.usuario_id))]
    .filter((uid: any): uid is string =>
      !!uid && uid !== actorId && !avisados.has(uid) && vivos.has(uid));
  if (!destinatarios.length) return;
  destinatarios.forEach(id => avisados.add(id));
  await notificar(supabase, destinatarios.map(uid => ({
    usuario_id: uid, publicacion_id: destino || pubId,
    ...(comentarioId ? { comentario_id: comentarioId } : {}),
    tipo, actor_nombre: actorNombre, mensaje,
  })));
}

/* ── A QUIEN LE TOCA UN CASO, SE LE DICE QUE SE LO MOVIERON ──
 *
 * Un caso tiene dos personas que responden por él: quien lo abrió y quien lo
 * lleva. Los tres cambios que de verdad lo alteran —el ESTADO, el RESPONSABLE
 * y la FECHA LÍMITE— no avisaban a ninguna de las dos.
 *
 *   · `cambiarEstado`      → cero notificaciones. Alguien podía dar por
 *                            resuelto tu caso y no te enterabas nunca.
 *   · `asignarResponsable` → solo al nuevo. Ni al autor, ni a quien lo dejaba
 *                            de llevar, que se quedaba creyendo que era suyo.
 *   · `cambiarFechaLimite` → cero. El plazo se movía y quien tiene que
 *                            cumplirlo seguía con la fecha vieja en la cabeza.
 *
 * Los tres dejaban rastro en `actividad` —que hay que ir a mirar— y ahí
 * acababa. Es el mismo fallo que ya destapó `avisarAlHilo` con los
 * comentarios: la regla se cumplía, el aviso no existía, y el silencio parecía
 * conformidad.
 *
 * Una función y no tres copias: las tres contestan «¿a quién le importa este
 * caso?» y esa lista tiene que ser la misma en las tres o la próxima puerta se
 * abrirá a medias.
 */
async function avisarCambioCaso(supabase: any, opts: {
  pubId: string;
  actorId: string;
  actorNombre: string;
  /** El tipo de la notificación: decide ícono y verbo en la campanita. */
  tipo: string;
  /** Lleva el título entre « »: `tituloDe` se queda con el primer par y es lo
   *  único que la campanita pinta. */
  mensaje: string;
  /** Autor y responsable del caso, y quien lo dejó de llevar si hubo relevo. */
  interesados: (string | null | undefined)[];
  /** A quién ya se avisó por otra vía (p. ej. el «te asignaron» del nuevo
   *  responsable). Sin esto, el autor que se auto-asigna recibiría dos avisos
   *  por un solo clic. */
  avisados?: Set<string>;
}) {
  const { pubId, actorId, actorNombre, tipo, mensaje, interesados, avisados } = opts;
  const ids = [...new Set(interesados.filter(Boolean))] as string[];
  const destinatarios = ids.filter(id => id !== actorId && !avisados?.has(id));
  if (!destinatarios.length) return;
  /* Solo cuentas ACTIVAS, como en el resto de avisos: quien dejó el equipo
     sigue figurando como autor de sus casos viejos y mandarle correo es llenar
     una bandeja que ya nadie abre. */
  const { data: activos } = await supabase.from("perfiles").select("id").eq("activo", true);
  const vivos = new Set<string>((activos || []).map((p: any) => p.id));
  const finales = destinatarios.filter(id => vivos.has(id));
  if (!finales.length) return;
  finales.forEach(id => avisados?.add(id));
  await notificar(supabase, finales.map(id => ({
    usuario_id: id, publicacion_id: pubId, tipo, actor_nombre: actorNombre, mensaje,
  })));
}

/* Quién responde por un caso, y cómo se llama quien lo tocó. Una consulta para
   las dos cosas porque las tres acciones necesitan siempre ambas. */
async function casoYActor(supabase: any, pubId: string, userId: string) {
  const [{ data: pub }, { data: miP }] = await Promise.all([
    /* `tipo` va en el select porque `rotuloEstado` lo necesita: un AVISO no se
       «resuelve», rige o deja de regir, y sin el tipo el mensaje habría dicho
       «Resuelta» sobre algo que nunca lo estuvo. */
    supabase.from("publicaciones").select("titulo,tipo,autor_id,responsable").eq("id", pubId).maybeSingle(),
    supabase.from("perfiles").select("nombre").eq("id", userId).maybeSingle(),
  ]);
  return { pub, actorNombre: miP?.nombre || "Alguien" };
}

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
  imagenes: string[] = [],
  /* ⚠ AL FINAL Y NO JUNTO A `fechaLimite`, que es donde «pertenece».
     Esta firma es POSICIONAL y ya tiene siete argumentos: meter una fecha
     nueva al lado de la otra compila igual si se intercambian, y el error
     —el caso empieza el día que vence— no lo ve nadie hasta mirar la agenda
     semanas después. Al final, un error de orden no puede pasar por bueno. */
  fechaInicio: string | null = null,
  /* La hora, para lo que OCURRE a una hora (hoy: una reunión). Igual que
     `fechaInicio`, al final y no junto a las fechas: la firma es posicional y
     ya tiene ocho argumentos. */
  hora: string | null = null
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada. Vuelve a iniciar sesión." };
  /* La ventana al revés no se guarda «como venga»: se dice. El check de la
     base lo impediría igual, pero con un mensaje de Postgres que no explica
     nada a quien está escribiendo un caso. */
  if (fechaInicio && fechaLimite && fechaInicio > fechaLimite) {
    return { error: "El inicio no puede ir después del vencimiento." };
  }
  const { data: pub, error } = await supabase.from("publicaciones").insert({
    autor_id: user.id,
    tipo,
    titulo,
    cuerpo: cuerpo || null,
    responsable: responsable || null,
    fecha_inicio: fechaInicio || null,
    fecha_limite: fechaLimite || null,
    hora: hora || null,
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
        await notificar(supabase, {
          usuario_id: p.id, publicacion_id: pubId, comentario_id: com.id,
          tipo: "mencion", actor_nombre: actorNombre,
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
      await notificar(supabase, destinatarios.map(d => ({
        usuario_id: d,
        publicacion_id: pubId,
        comentario_id: com.id,
        tipo: "comentario",
        actor_nombre: actorNombre,
        mensaje: `Nuevo comentario en «${pub.titulo}»`,
      })));
    }
    destinatarios.forEach(d => { if (d) mencionados.add(d as string); });
  }

  /* Y los que ya venían hablando. Autor y responsable son ROLES: en un caso
     largo, la mitad de la conversación la llevan personas que no son ninguno
     de los dos, y hasta ahora respondían al vacío. */
  await avisarAlHilo(supabase, {
    columna: "publicacion_id", dueno: pubId, comentarioId: com.id,
    actorId: user.id, actorNombre,
    titulo: `«${(pub?.titulo || "un caso").slice(0, 60)}»`,
    avisados: mencionados,
  });

  /* Y los vinculados que aún no han hablado. Último de la cadena a propósito:
     las otras cuatro vías son más específicas —te mencionaron, respondes por
     esto, ya estabas conversando— y `avisados` hace que gane la primera.
     Mismo `tipo` y mismo destino que los demás avisos del hilo, así que el
     agrupador los junta: veinte mensajes siguen siendo una fila. */
  await avisarVinculados(supabase, {
    pubId, comentarioId: com.id, actorId: user.id, actorNombre,
    tipo: "comentario",
    mensaje: `Nuevo comentario en «${pub?.titulo || "un caso"}»`,
    avisados: mencionados,
  });

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
        await notificar(supabase, {
          usuario_id: p.id, objeto_id: objetoId, comentario_id: com.id,
          tipo: "mencion", actor_nombre: actorNombre,
          mensaje: `🪄 ${actorNombre.split(" ")[0]} te mencionó en «${titulo}»`,
        });
      }
    }
  }

  // 🔔 A quien trajo el objeto (si no es quien comenta)
  if (obj?.creado_por && !avisados.has(obj.creado_por)) {
    await notificar(supabase, {
      usuario_id: obj.creado_por, objeto_id: objetoId, comentario_id: com.id,
      tipo: "comentario", actor_nombre: actorNombre,
      mensaje: `Nuevo comentario en «${titulo}»`,
    });
  }

  /* Y a quien ya escribió aquí — ver `avisarAlHilo`. */
  await avisarAlHilo(supabase, {
    columna: "objeto_id", dueno: objetoId, comentarioId: com.id,
    actorId: user.id, actorNombre, titulo: `«${titulo}»`, avisados,
  });

  await supabase.from("actividad").insert({
    entidad_tipo: "objeto", entidad_id: objetoId, actor_id: user.id, tipo: "comentario",
    detalle: { comentario_id: com.id },
  });
  revalidatePath(`/objeto/${objetoId}`);
  return {};
}

/* ── HABLAR DE UN APUNTE DE CAJA ──
 *
 * Calcado de `comentarObjeto` (objeto_id → movimiento_caja_id). No es pereza:
 * es la regla de db/objeto-comentarios.sql —«una sola bodega, N puertas»—, y
 * apartarse de ella habría significado otra bandeja y otro camino de avisos.
 *
 * Comentar lo puede hacer CUALQUIERA del equipo aunque escribir en la caja sea
 * de finanzas. Escribir un movimiento es mover plata; preguntar por él no — y
 * la pregunta que esto quiere capturar, «¿esto qué fue?», viene justo de quien
 * no lleva la caja. Restringirlo la habría dejado en WhatsApp.
 */
export async function comentarMovCaja(
  movId: string, texto: string, imagenes: string[] = [], respondeA: string | null = null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cuerpo = (texto || "").trim();
  const imgs = (imagenes || []).filter(Boolean).slice(0, 6);
  if (!cuerpo && !imgs.length) return { error: "El comentario no puede ir vacío." };

  const { data: com, error } = await supabase.from("comentarios")
    .insert({ movimiento_caja_id: movId, autor_id: user.id, cuerpo: cuerpo || "📷",
      imagenes: imgs, responde_a: respondeA || null })
    .select("id").single();
  if (error) {
    return {
      error: /movimiento_caja_id/.test(error.message)
        ? "Falta correr db/movcaja-comentarios.sql en Supabase."
        : error.message,
    };
  }

  const [{ data: miP }, { data: mov }] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("id", user.id).single(),
    supabase.from("movimiento_caja").select("descripcion,monto,creado_por").eq("id", movId).maybeSingle(),
  ]);
  const actorNombre = miP?.nombre || "Alguien";
  /* El rótulo del aviso lleva el MONTO además de la descripción: en una bandeja
     con veinte avisos, «Nuevo comentario en Taxi» no distingue el taxi de
     S/ 15 del de S/ 180, y la descripción muchas veces está vacía. */
  const soles = `S/ ${Math.round(Number(mov?.monto || 0)).toLocaleString("es-PE")}`;
  const titulo = [soles, (mov?.descripcion || "").slice(0, 50)].filter(Boolean).join(" · ");

  // 🪄 Menciones @nombre — mismo reconocimiento que en casos y objetos
  const tokens = [...new Set((cuerpo.match(/@[^\s@,;:!?*_`]+/g) || []).map(m => m.slice(1)))];
  const avisados = new Set<string>([user.id]);
  if (tokens.length) {
    const nrmM = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
        await notificar(supabase, {
          usuario_id: p.id, movimiento_caja_id: movId, comentario_id: com.id,
          tipo: "mencion", actor_nombre: actorNombre,
          mensaje: `🪄 ${actorNombre.split(" ")[0]} te mencionó en un movimiento de caja (${titulo})`,
        });
      }
    }
  }

  /* A quien apuntó el movimiento. Es el destinatario natural: la pregunta
     «¿esto qué fue?» es para él, y sin este aviso tendría que enterarse
     volviendo a abrir la caja por casualidad. */
  if (mov?.creado_por && !avisados.has(mov.creado_por)) {
    avisados.add(mov.creado_por);
    await notificar(supabase, {
      usuario_id: mov.creado_por, movimiento_caja_id: movId, comentario_id: com.id,
      tipo: "comentario", actor_nombre: actorNombre,
      mensaje: `Nuevo comentario en un movimiento de caja (${titulo})`,
    });
  }

  /* A quien se le responde. Responder es la forma más explícita que hay de
     dirigirse a alguien; pedir además un @ es pedir que se diga dos veces.
     (La lección es de la bitácora de equipo, y vale igual aquí.) */
  if (respondeA) {
    const { data: padre } = await supabase.from("comentarios")
      .select("autor_id").eq("id", respondeA).maybeSingle();
    if (padre?.autor_id && !avisados.has(padre.autor_id)) {
      avisados.add(padre.autor_id);
      await notificar(supabase, {
        usuario_id: padre.autor_id, movimiento_caja_id: movId, comentario_id: com.id,
        tipo: "comentario", actor_nombre: actorNombre,
        mensaje: `${actorNombre.split(" ")[0]} respondió a tu comentario (${titulo})`,
      });
    }
  }

  /* Y a todos los que ya habían escrito aquí. Va AL FINAL, después de las tres
     reglas de rol, porque `avisados` ya trae a los que recibieron un aviso más
     preciso —una mención o una respuesta directa— y a esos no hay que
     mandarles además el genérico. */
  await avisarAlHilo(supabase, {
    columna: "movimiento_caja_id", dueno: movId, comentarioId: com.id,
    actorId: user.id, actorNombre, titulo: `un movimiento de caja (${titulo})`,
    avisados,
  });

  await supabase.from("actividad").insert({
    entidad_tipo: "movimiento_caja", entidad_id: movId, actor_id: user.id, tipo: "comentario",
    detalle: { comentario_id: com.id },
  });
  revalidatePath("/caja");
  return {};
}

/* ══════════════════════════════════════════════════════════════════════════
   HABLAR DE LA PLATA — una acción para las cinco tablas de la rendición

   Facturas, estados de cuenta, RHE, declaraciones juradas y movimientos del
   banco. Podían ser cinco funciones gemelas copiadas de `comentarMovCaja`;
   son una, porque cinco copias no son cinco veces más código sino cinco
   sitios donde arreglar el mismo fallo — y el que se olvide no dará error,
   seguirá funcionando mal en silencio.

   Lo que cambia entre las cinco (la columna, cómo se rotula el aviso, qué
   traer para rotularlo) está descrito una vez en lib/rendicionHilo.ts. Aquí
   solo se aplica.
   ══════════════════════════════════════════════════════════════════════════ */
export async function comentarRendicion(
  tabla: string, filaId: string, texto: string,
  imagenes: string[] = [], respondeA: string | null = null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* La tabla llega del cliente, así que se valida contra la lista antes de
     tocar la base. Sin esto, un valor inventado llegaría hasta el `insert` y
     Postgres contestaría «column ... does not exist» — un mensaje que no
     significa nada para quien solo quería preguntar por una factura. */
  if (!esTablaRendicion(tabla)) return { error: "No sé de qué se está hablando." };
  const meta = META_RENDICION[tabla];

  const cuerpo = (texto || "").trim();
  const imgs = (imagenes || []).filter(Boolean).slice(0, 6);
  if (!cuerpo && !imgs.length) return { error: "El comentario no puede ir vacío." };

  const { data: com, error } = await supabase.from("comentarios")
    .insert({ [meta.col]: filaId, autor_id: user.id, cuerpo: cuerpo || "📷",
      imagenes: imgs, responde_a: respondeA || null })
    .select("id").single();
  if (error) {
    /* La migración que falta se dice POR SU NOMBRE. «column does not exist» es
       verdad y es inútil: quien lo lee no sabe qué correr. */
    return {
      error: new RegExp(meta.col).test(error.message)
        ? `Falta correr ${meta.migracion} en Supabase.`
        : error.message,
    };
  }

  const [{ data: miP }, { data: fila }] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("id", user.id).single(),
    supabase.from(tabla).select(meta.sel).eq("id", filaId).maybeSingle(),
  ]);
  const actorNombre = miP?.nombre || "Alguien";
  /* El dueño va en el rótulo del aviso cuando no viaja en la fila. «noviembre
     2024» en una bandeja no dice de cuál de las diecisiete asociaciones se
     habla; «noviembre 2024 · Asoc Apu Wilkakalle» sí. Para las cinco del fondo
     esto devuelve "" y el rótulo queda como estaba. */
  const titulo = [meta.titulo(fila), await duenoDe(supabase, meta, fila)]
    .filter(Boolean).join(" · ");
  /* El FONDO al que pertenece la fila viaja en cada aviso. Sin él, la
     campanita tiene el id de la factura y ninguna forma de saber en qué
     pantalla vive: el aviso llegaría, se leería, y al pulsarlo no pasaría
     nada. Ese fallo exacto ya costó dos rondas de depuración con
     `comentario_id` y otra con `postulacion_id`; aquí se paga por
     adelantado. */
  const post = (fila as any)?.postulacion_id || null;
  const dondeVive = post ? { postulacion_id: post } : {};
  const queEs = `${meta.etiqueta}${titulo ? ` (${titulo})` : ""}`;

  // 🪄 Menciones @nombre — mismo reconocimiento que en casos, objetos y caja.
  const tokens = [...new Set((cuerpo.match(/@[^\s@,;:!?*_`]+/g) || []).map(m => m.slice(1)))];
  const avisados = new Set<string>([user.id]);
  if (tokens.length) {
    const nrmM = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
        await notificar(supabase, {
          usuario_id: p.id, [meta.col]: filaId, comentario_id: com.id, ...dondeVive,
          tipo: "mencion", actor_nombre: actorNombre,
          mensaje: `🪄 ${actorNombre.split(" ")[0]} te mencionó en ${queEs}`,
        });
      }
    }
  }

  /* A quien registró la fila. Es el destinatario natural: la pregunta «¿esta
     factura de qué es?» es para él.
     Puede no haber nadie —las cargas por SQL entran sin `creado_por`— y eso
     no es un error: simplemente no hay a quién avisar, y el hilo de abajo se
     encarga de los demás. */
  const dueno = (fila as any)?.creado_por;
  if (dueno && !avisados.has(dueno)) {
    avisados.add(dueno);
    await notificar(supabase, {
      usuario_id: dueno, [meta.col]: filaId, comentario_id: com.id, ...dondeVive,
      tipo: "comentario", actor_nombre: actorNombre,
      mensaje: `Nuevo comentario en ${queEs}`,
    });
  }

  // A quien se le responde: responder ya es dirigirse a alguien, no hace falta @.
  if (respondeA) {
    const { data: padre } = await supabase.from("comentarios")
      .select("autor_id").eq("id", respondeA).maybeSingle();
    if (padre?.autor_id && !avisados.has(padre.autor_id)) {
      avisados.add(padre.autor_id);
      await notificar(supabase, {
        usuario_id: padre.autor_id, [meta.col]: filaId, comentario_id: com.id, ...dondeVive,
        tipo: "comentario", actor_nombre: actorNombre,
        mensaje: `${actorNombre.split(" ")[0]} respondió a tu comentario (${titulo})`,
      });
    }
  }

  // Y a todos los que ya habían escrito aquí. Al final: `avisados` ya trae a
  // quienes recibieron un aviso más preciso.
  await avisarAlHilo(supabase, {
    columna: meta.col, dueno: filaId, comentarioId: com.id,
    actorId: user.id, actorNombre, titulo: queEs, avisados, extra: dondeVive,
  });

  await supabase.from("actividad").insert({
    entidad_tipo: tabla, entidad_id: filaId, actor_id: user.id, tipo: "comentario",
    detalle: { comentario_id: com.id },
  });
  /* La fila vive en la pantalla del fondo. Se revalida por el `postulacion_id`
     que trae la propia fila, no por uno que nos pasen: si el que llama se
     equivoca de fondo, la pantalla correcta se queda sin refrescar y el
     comentario «no aparece» hasta recargar a mano. */
  if (post) revalidatePath(`/fondo/${post}`);
  return {};
}

/* ══════════════════════════════════════════════════════════════════════════
   ABRIR UN CASO DESDE UNA FILA DE LA RENDICIÓN

   Comentar deja constancia; el caso reparte el trabajo. No son lo mismo y por
   eso son dos botones: en el hilo del recibo E001-5 alguien escribió que la
   persona no giró su RHE y que se prestó de otra. Eso, como comentario, se
   queda ahí — sin responsable, sin plazo y sin salir en ningún tablero.

   La decisión de ocuparse la toma una persona, no el sistema. Por eso es un
   botón y no algo que pase solo al comentar.
   ══════════════════════════════════════════════════════════════════════════ */
export async function casoDeRendicion(tabla: string, filaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!esTablaRendicion(tabla)) return { error: "No sé de qué se está hablando." };
  const meta = META_RENDICION[tabla as TablaRendicion];

  /* El embed de la postulación solo se pide a las tablas que la tienen. Un
     periodo declarable no tiene `postulacion_id`, y PostgREST rechaza la
     consulta ENTERA cuando una relación no existe — no devuelve la fila sin
     ese trozo, devuelve error. La lección ya está aprendida con las columnas
     opcionales; aquí vale igual para las relaciones. */
  const conFondo = meta.sel.includes("postulacion_id");
  const { data: fila, error: eF } = await supabase.from(tabla)
    .select(`${meta.sel},caso_id${conFondo ? ",post:postulaciones(codigo,proy:proyectos(nombre))" : ""}`)
    .eq("id", filaId).maybeSingle();
  if (eF) {
    return { error: /caso_id/.test(eF.message)
      ? "Falta correr db/rendicion-caso.sql en Supabase." : eF.message };
  }
  if (!fila) return { error: "Esa fila ya no está." };

  /* ¿Ya hay caso, y sigue VIVO? Uno archivado o descartado no cuenta: la fila
     quedaría atada para siempre a algo que no aparece en ningún tablero, y el
     botón no ofrecería abrir otro. Misma regla que los compromisos del acta.
     ⚠ La LISTA hace esta misma pregunta con `casoVivo` (lib/rendicionHilo).
     Son dos formas de la regla —aquí una consulta, allí un predicado sobre la
     fila ya traída— y tienen que decir lo mismo. Durante un tiempo no lo
     dijeron: la lista enseñaba los muertos y esta rama era inalcanzable. */
  const ya = (fila as any).caso_id as string | null;
  if (ya) {
    const { data: vive } = await supabase.from("publicaciones")
      .select("id").eq("id", ya)
      .is("archivado_en", null).neq("estado", "descartada").maybeSingle();
    if (vive) return { id: ya, ya: true };
  }

  const post: any = Array.isArray((fila as any).post) ? (fila as any).post[0] : (fila as any).post;
  const rotulo = meta.titulo(fila);
  /* Fuera del fondo no hay «PO-003 · Chaccu» que poner, y el rótulo del periodo
     ya trae la empresa. Repetirla, o escribir «fondo» sobre algo que no lo es,
     sería un título que miente en el tablero — que es donde más se lee. */
  const quien = post
    ? `${post.codigo || "🎯"}${post.proy?.nombre ? ` · ${post.proy.nombre}` : ""}`
    : (conFondo ? "fondo" : await duenoDe(supabase, meta, fila));

  const { data: pub, error } = await supabase.from("publicaciones").insert({
    tipo: "tarea", estado: "abierta", autor_id: user.id,
    /* El rótulo de la fila va en el TÍTULO: en un tablero de cuarenta casos,
       «Revisar factura» no dice cuál ni de qué fondo, y el monto y el número
       son lo que permite volver a la fila desde el propio caso. */
    titulo: `${meta.ico} ${rotulo}${quien ? ` — ${quien}` : ""}`.slice(0, 200),
    cuerpo: [
      conFondo
        ? `Abierto desde ${meta.etiqueta} de la rendición del fondo.`
        : `Abierto desde ${meta.etiqueta}.`,
      "",
      /* El enlace de vuelta usa el mismo ancla que los avisos, y ahora también
         la misma FUNCIÓN: la ruta la dice META_RENDICION. Aquí estaba escrita a
         mano una segunda vez, y dos formas de nombrar el mismo destino son dos
         formas que un día dejan de coincidir sin que nada avise. */
      (() => {
        const r = meta.ruta(fila, filaId);
        return r ? `Vuelve a la fila: ${r}` : "";
      })(),
      "",
      "— La fila sigue existiendo aunque este caso se cierre: el caso es la decisión de ocuparse, no el dato.",
    ].filter(Boolean).join("\n"),
  }).select("id").single();
  if (error || !pub) return { error: error?.message || "No se pudo crear el caso." };

  const postId = (fila as any).postulacion_id;
  if (postId) {
    await supabase.from("publicacion_vinculos").insert({
      publicacion_id: pub.id, entidad_tipo: "postulacion", entidad_id: postId,
    });
    await supabase.from("actividad").insert({
      entidad_tipo: "postulacion", entidad_id: postId, actor_id: user.id, tipo: "tarea",
      detalle: { mensaje: `abrió un caso desde ${meta.etiqueta} (${rotulo})` },
    });
  }

  /* Se anota en la fila. Si esto falla el caso YA existe, así que se devuelve
     su id igual y se dice qué pasó: callarlo dejaría al botón ofreciendo abrir
     otro caso sobre lo mismo. */
  const { error: eLink } = await supabase.from(tabla).update({ caso_id: pub.id }).eq("id", filaId);

  revalidatePath("/");
  if (postId) revalidatePath(`/fondo/${postId}`);
  if (eLink) return { id: pub.id as string, error: "Caso creado, pero no quedó anotado en la fila: " + eLink.message };
  return { id: pub.id as string };
}

/* La lectura que alimenta el pop-up de las cinco. Misma forma que
   `cargarMovCajaRapido`, para que la vista no aprenda un contrato por dueño. */
export async function cargarRendicionRapido(tabla: string, filaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!esTablaRendicion(tabla)) return { error: "No sé de qué se está hablando." };
  const meta = META_RENDICION[tabla];

  /* ── EL ERROR DE LA FILA NO SE TIRA ──
     Aquí se pedía `{ data: fila }` a secas. Cuando esa consulta fallaba —una
     columna que no existe, una relación que PostgREST no sabe resolver— `fila`
     volvía en null SIN error, la función devolvía un objeto aparentemente
     bueno, y el pop-up se quedaba en «Cargando…» PARA SIEMPRE, porque su
     condición de listo es `!!fila`. Ni un mensaje, ni una traza: la peor forma
     de fallo que puede tener esta pantalla, y estaba a un `error:` de
     distancia. */
  const [{ data: fila, error: eFila }, { data: comentarios, error: eCom }, { data: perfiles }] = await Promise.all([
    supabase.from(tabla).select(meta.sel).eq("id", filaId).maybeSingle(),
    supabase.from("comentarios")
      .select("id,cuerpo,imagenes,creado_en,editado_en,autor_id,responde_a," +
              "autor:perfiles(nombre,color,avatar_url)")
      .eq(meta.col, filaId).order("creado_en"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
  ]);
  /* Si la columna no existe, la lista viene vacía y sin error visible: el hilo
     parecería no tener comentarios cuando lo que pasa es que no hay dónde
     guardarlos. Se dice. */
  if (eFila) return { error: `No pude leer la fila: ${eFila.message}` };
  if (eCom) {
    return {
      error: new RegExp(meta.col).test(eCom.message)
        ? `Falta correr ${meta.migracion} en Supabase.`
        : eCom.message,
    };
  }
  /* Y si no hay error pero tampoco fila, se dice: la fila se borró mientras
     alguien tenía la lista abierta. Sin esto vuelve al mismo «Cargando…»
     eterno por otro camino. */
  if (!fila) return { error: "Esa fila ya no está. Recarga la lista." };

  const ids = (comentarios || []).map((c: any) => c.id);
  const { data: rx } = ids.length
    ? await supabase.from("reacciones")
        .select("emoji,usuario_id,comentario_id,perfil:perfiles!usuario_id(nombre)")
        .in("comentario_id", ids)
    : { data: [] as any[] };
  const reaccionesPorComentario: Record<string, any[]> = {};
  (rx || []).forEach((r: any) => {
    (reaccionesPorComentario[r.comentario_id] ||= []).push({
      emoji: r.emoji, usuario_id: r.usuario_id, nombre: r.perfil?.nombre || null,
    });
  });

  const { data: rxHilo } = await supabase.from("reacciones")
    .select("emoji,usuario_id,perfil:perfiles!usuario_id(nombre)")
    .eq(meta.col, filaId).is("comentario_id", null);

  return {
    fila, titulo: meta.titulo(fila), etiqueta: meta.etiqueta,
    comentarios: comentarios || [], reaccionesPorComentario,
    reaccionesHilo: (rxHilo || []).map((r: any) => ({
      emoji: r.emoji, usuario_id: r.usuario_id, nombre: r.perfil?.nombre || null,
    })),
    perfiles: perfiles || [], userId: user.id,
  };
}

/* La lectura que alimenta el pop-up. Misma forma que `cargarObjetoRapido`, para
   que VistaHilo no tenga que aprender un contrato nuevo por cada dueño. */
export async function cargarMovCajaRapido(movId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const [{ data: movimiento }, { data: comentarios }, { data: perfiles }] = await Promise.all([
    supabase.from("movimiento_caja")
      .select("id,fecha,monto,descripcion,url,caja_id,cuenta_id,caja_destino," +
              "caja:caja!movimiento_caja_caja_id_fkey(nombre,tipo)," +
              "cuenta:cuenta_caja(nombre,flujo),proy:proyectos(nombre),quien:perfiles!creado_por(nombre)")
      .eq("id", movId).maybeSingle(),
    supabase.from("comentarios")
      .select("id,cuerpo,imagenes,creado_en,editado_en,autor_id,responde_a," +
              "autor:perfiles(nombre,color,avatar_url)")
      .eq("movimiento_caja_id", movId).order("creado_en"),
    supabase.from("perfiles").select("id,nombre").eq("activo", true).order("nombre"),
  ]);

  const ids = (comentarios || []).map((c: any) => c.id);
  const { data: rx } = ids.length
    ? await supabase.from("reacciones")
        .select("emoji,usuario_id,comentario_id,perfil:perfiles!usuario_id(nombre)")
        .in("comentario_id", ids)
    : { data: [] as any[] };
  const reaccionesPorComentario: Record<string, any[]> = {};
  (rx || []).forEach((r: any) => {
    (reaccionesPorComentario[r.comentario_id] ||= []).push({
      emoji: r.emoji, usuario_id: r.usuario_id, nombre: r.perfil?.nombre || null,
    });
  });

  /* Las reacciones al movimiento en sí (sin comentario): el 👀 de «lo vi, está
     bien», que en una caja que revisa otra persona es media conversación. */
  const { data: rxHilo } = await supabase.from("reacciones")
    .select("emoji,usuario_id,perfil:perfiles!usuario_id(nombre)")
    .eq("movimiento_caja_id", movId).is("comentario_id", null);

  return {
    movimiento, comentarios: comentarios || [], reaccionesPorComentario,
    reaccionesHilo: (rxHilo || []).map((r: any) => ({
      emoji: r.emoji, usuario_id: r.usuario_id, nombre: r.perfil?.nombre || null,
    })),
    perfiles: perfiles || [], userId: user.id,
  };
}

export async function asignarResponsable(pubId: string, perfilId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Filas afectadas: si RLS bloquea el cambio vuelve 0 filas sin error — se avisa
  // en vez de dejar el no-op silencioso (el select rebotaba al valor viejo).
  /* Quién lo llevaba ANTES, leído antes del update: es el otro interesado del
     cambio y después ya no hay forma de saberlo. A quien le quitan un caso se
     le avisa igual que a quien se lo dan — si no, sigue creyendo que es suyo. */
  /* ── LAS TRES LECTURAS, A LA VEZ ──
     Iban una detrás de otra, y entre medias el update y los avisos: nueve
     viajes de ida y vuelta encadenados para asignar un sub-caso. Con la base
     a cien milisegundos, eso es el segundo largo que se nota al soltar el
     desplegable.
     Las tres se pueden pedir juntas porque ninguna depende de las otras, y las
     tres ANTES del update porque lo que leen no cambia con él: el título y el
     autor del caso son los mismos, y `previo` tiene que leerse antes por
     definición. */
  const [{ data: previo }, ctx, nuevo] = await Promise.all([
    supabase.from("publicaciones").select("responsable").eq("id", pubId).maybeSingle(),
    casoYActor(supabase, pubId, user.id),
    perfilId
      ? supabase.from("perfiles").select("nombre").eq("id", perfilId).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);
  const { pub, actorNombre } = ctx;

  const { data: filas, error } = await supabase.from("publicaciones")
    .update({ responsable: perfilId }).eq("id", pubId).select("id");
  if (error) return { error: error.message };
  if (!filas?.length) return { error: "No se pudo cambiar el responsable (sin permiso o el caso ya no existe)." };

  /* 🗂 Bitácora: NO se inserta a mano. El trigger `registrar_evento_estado`
     (db/schema.sql) ya registra el cambio de `responsable` con el actor
     (auth.uid()) al hacer el UPDATE. Insertarlo aquí también lo dejaba
     DUPLICADO —igual que el cambio de estado, que confía solo en el trigger—. */

  /* El aviso del NUEVO responsable va primero y con su propio tipo: «te
     asignaron» es otra cosa que «cambió el responsable» —una pide trabajo, la
     otra informa— y quien recibe la primera no debe recibir además la segunda.
     Por eso comparten `avisados`, y por eso NO van en paralelo entre sí: el
     segundo necesita saber a quién avisó el primero. */
  const avisados = new Set<string>();
  if (perfilId && perfilId !== user.id) {
    avisados.add(perfilId);
    await notificar(supabase, {
      usuario_id: perfilId, publicacion_id: pubId, tipo: "asignacion",
      actor_nombre: actorNombre,
      mensaje: `Te asignaron: «${pub?.titulo || "un caso"}»`,
    });
  }
  // 🔔 Y al autor y a quien lo llevaba: el caso cambió de manos.
  if (pub) {
    // El nombre ya vino con las lecturas de arriba; era un viaje más él solo.
    const quien = perfilId ? ((nuevo as any)?.data?.nombre || "otra persona") : null;
    await avisarCambioCaso(supabase, {
      pubId, actorId: user.id, actorNombre, tipo: "cambio_responsable",
      mensaje: quien
        ? `${actorNombre.split(" ")[0]} pasó «${pub.titulo}» a ${quien}`
        : `${actorNombre.split(" ")[0]} dejó «${pub.titulo}» sin responsable`,
      interesados: [pub.autor_id, previo?.responsable],
      avisados,
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
/* ── RECORTAR UN TEXTO SIN ROMPERLO ──
 * `slice` cuenta unidades UTF-16, no caracteres: cortar en medio de un emoji
 * deja media unidad suelta, que se serializa como � y puede hacer que Postgres
 * rechace la fila entera. `Array.from` recorre por caracteres reales.
 * Y se recorta ANTES de limpiar: al revés, el corte puede dejar justo el
 * espacio final que el `trim` acababa de quitar. */
function recorte(txt: string | null | undefined, max: number): string | null {
  const t = Array.from(String(txt ?? "")).slice(0, max).join("").trim();
  return t || null;
}

export async function registrarMiJornada(
  fecha: string, proyectoId: string | null, tipo: string, fraccion: number,
  noche: boolean = false, notas: string = ""
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
  /* La regla vive en lib/jornadas: estaba escrita aquí, en `editarJornada` y
     en el formulario que enseña «Esta jornada: S/ 160». Tres sitios donde
     cambiar una decisión sobre dinero. */
  const monto = montoJornada(tipo, frac, nocheOk, yo);
  const { error } = await supabase.from("jornadas").insert({
    persona_id: yo.id, fecha, proyecto_id: proyectoId || null, tipo, fraccion: frac, noche: nocheOk, monto, registrado_por: user.id,
    /* La columna existe desde db/jornadas.sql y no la escribía nadie. Se
       recorta aquí y no solo en el formulario: una acción de servidor se puede
       llamar sin pasar por la pantalla, y `notas` es `text` sin límite. */
    notas: recorte(notas, 300),
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
  id: string, fecha: string, proyectoId: string | null, tipo: string, fraccion: number,
  noche: boolean,
  /* `undefined` es «no la toques» y `""` es «bórrala». Son cosas distintas y
     el valor por defecto tiene que ser la primera: si esta acción se llama sin
     el argumento —desde otra pantalla, mañana— no puede llevarse por delante
     una nota que nadie quiso tocar. */
  notas?: string | null,
  /* ── EL IMPORTE, A MANO ──
   * `jornadas.monto` es una FOTO del cálculo al registrar, a propósito: subir
   * una tarifa no puede reescribir lo que ya se pagó. Pero eso deja el caso
   * contrario sin salida — la jornada que se apuntó con la tarifa vieja por
   * error, y que hay que corregir a mano.
   *
   * Vacío o `undefined` significa «recalcula con la tarifa de hoy», que es lo
   * que esta acción hacía siempre. Un número significa «este importe y no
   * otro». Las dos intenciones son legítimas y por eso viajan distinto: un
   * campo que solo acepta números obligaría a teclear el cálculo que la
   * máquina ya sabe hacer.
   *
   * ⚠ SOLO ADMINISTRACIÓN. Sin esa condición, cualquiera podría fijarse el
   * importe de su propia jornada — y esta acción la puede llamar el dueño de
   * la fila, que es justo quien cobra. */
  monto?: string | number | null,
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
  const calculado = montoJornada(tipo, frac, nocheOk, dueno);

  /* El importe escrito a mano solo cuenta si quien edita es administración, y
     solo si es un número que se puede cobrar. Cualquier otra cosa —texto,
     negativo, vacío— cae al cálculo, que es la respuesta segura. */
  const aMano = perfil?.es_admin ? montoDe(monto ?? "") : 0;
  const montoFinal = aMano > 0 ? aMano : calculado;

  const { error } = await supabase.from("jornadas").update({
    fecha, proyecto_id: proyectoId || null, tipo, fraccion: frac, noche: nocheOk, monto: montoFinal,
    aprobada: false, aprobada_por: null, aprobada_en: null,
    ...(notas === undefined ? {} : { notas: recorte(notas, 300) }),
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

  /* Reabrir BORRA la fila, y desde que los recibos cuelgan de ella
     (db/pagos-expediente.sql) eso arrastra sus vínculos: `on delete set null`
     deja los RHE en pie —hicieron falta, existen ante SUNAT— pero huérfanos, y
     nada avisaría de que ese mes perdió su rastro de pago. Se para antes.

     No se resuelve reenlazando solo: quien reabre casi siempre quiere corregir
     una jornada, no deshacer el pago, y merece enterarse de que lo segundo
     venía incluido. */
  const { data: liq } = await supabase.from("liquidaciones")
    .select("id,cerrado_en").eq("persona_id", personaId).eq("anio", anio).eq("mes", mes).maybeSingle();
  if (!liq) { revalidatePath("/admin"); revalidatePath("/jornadas"); return {}; }
  if (liq.cerrado_en) {
    /* Se nombra el OTRO botón. «Reábrelo primero» como respuesta a pulsar
       «reabrir» es un círculo: son dos reabrir distintos —el del expediente y
       el del mes— y quien lee el error está mirando el segundo. */
    return { error: "Este expediente está cerrado. Quítale el sello con 🔓 antes de corregir el mes." };
  }
  const { count } = await supabase.from("rhe")
    .select("id", { count: "exact", head: true }).eq("liquidacion_id", liq.id);
  if (count) {
    return {
      error: `Hay ${count} recibo${count === 1 ? "" : "s"} enlazado${count === 1 ? "" : "s"} a este mes; al reabrirlo perdería${count === 1 ? "" : "n"} el vínculo con su pago. Desenlázalo${count === 1 ? "" : "s"} primero desde 🧾 RHE.`,
    };
  }

  await supabase.from("liquidaciones").delete().eq("id", liq.id);
  revalidatePath("/admin"); revalidatePath("/jornadas");
  return {};
}

/* ── EL CIERRE DE UN EXPEDIENTE DE PAGO ──
 *
 * «Completo» lo calcula el sistema (lib/pagos.ts): están el recibo, su
 * comprobante y la salida del dinero. «Cerrado» lo dice una persona: lo miré y
 * está bien. Son cosas distintas —un expediente puede estar completo y tener
 * el monto equivocado— y por eso el botón no aparece hasta que está completo,
 * pero tampoco se pulsa solo cuando lo está.
 */
export async function cerrarExpediente(personaId: string, anio: number, mes: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo un administrador puede cerrar un expediente." };

  /* Se comprueba aquí y no solo en el botón. El botón puede venir de una
     pantalla que se cargó hace media hora, cuando el expediente sí estaba
     completo y alguien ha borrado el RHE desde entonces. */
  const { data: liq } = await supabase.from("liquidaciones")
    .select("id,estado").eq("persona_id", personaId).eq("anio", anio).eq("mes", mes).maybeSingle();
  if (!liq) return { error: "Ese mes no está liquidado." };
  if (liq.estado !== "liquidado") return { error: "Primero hay que liquidar el mes." };

  const { data: rhes } = await supabase.from("rhe")
    .select("id,url,pagado_en").eq("liquidacion_id", liq.id);
  if (!rhes?.length) return { error: "No se puede cerrar sin ningún RHE enlazado a este mes." };
  const sinPdf = rhes.filter((r: any) => !String(r.url || "").trim());
  if (sinPdf.length) return { error: `Falta el comprobante de ${sinPdf.length} recibo${sinPdf.length === 1 ? "" : "s"}.` };

  const { data: movs } = await supabase.from("movimiento_banco")
    .select("rhe_id").in("rhe_id", rhes.map((r: any) => r.id));
  const conBanco = new Set((movs || []).map((m: any) => m.rhe_id));
  const sinPago = rhes.filter((r: any) => !conBanco.has(r.id) && !r.pagado_en);
  if (sinPago.length) return { error: `No consta el pago de ${sinPago.length} recibo${sinPago.length === 1 ? "" : "s"}.` };

  const { error } = await supabase.from("liquidaciones")
    .update({ cerrado_en: new Date().toISOString(), cerrado_por: user.id }).eq("id", liq.id);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: "persona", entidad_id: personaId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `cerró el expediente de pago de ${String(mes).padStart(2, "0")}/${anio}` },
  });
  revalidatePath("/admin");
  return {};
}

/* Reabrir. Existe porque un cierre equivocado no se puede quedar cerrado: es
   una afirmación de una persona y las personas se equivocan. No borra nada,
   solo quita el sello. */
export async function reabrirExpediente(personaId: string, anio: number, mes: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo un administrador puede reabrir un expediente." };

  /* `.select()` para saber si de verdad se tocó algo. Sin él, un update que no
     encuentra fila —o que RLS esconde— devolvía éxito y encima dejaba escrito
     en Actividad «reabrió el expediente» de algo que sigue cerrado. */
  const { data: tocadas, error } = await supabase.from("liquidaciones")
    .update({ cerrado_en: null, cerrado_por: null })
    .eq("persona_id", personaId).eq("anio", anio).eq("mes", mes).select("id");
  if (error) return { error: error.message };
  if (!tocadas?.length) return { error: "No se encontró ese expediente para reabrir." };
  await supabase.from("actividad").insert({
    entidad_tipo: "persona", entidad_id: personaId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `reabrió el expediente de pago de ${String(mes).padStart(2, "0")}/${anio}` },
  });
  revalidatePath("/admin");
  return {};
}

/* ── REGISTRAR EL PAGO, CON SU COMPROBANTE ──
 *
 * La prueba de que el dinero salió es el documento que Katy ya guarda: la
 * captura de la transferencia, el voucher del depósito. No la línea del estado
 * de cuenta — un cheque de gerencia paga a doce personas de golpe y no dice
 * nada de ninguna en particular (ver db/pagos-expediente.sql, sección 2).
 *
 * El comprobante NO es obligatorio, y esa es una decisión: en efectivo puede no
 * haberlo, y bloquear el registro por un papel que no existe deja el expediente
 * congelado por ser honesto. Se registra igual y se marca «sin comprobante»,
 * que dice la verdad en vez de esconderla.
 */
export async function registrarPagoRhe(
  rheId: string, medio: string, url: string, nota: string,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo un administrador registra los pagos." };

  const m = String(medio || "").trim();
  if (!m) return { error: "Di cómo salió el dinero." };
  const link = String(url || "").trim();
  if (link && !/^https?:\/\/\S+$/.test(link)) return { error: "El comprobante debe ser un link completo." };
  /* Sin comprobante hay que decir algo. Un «pagado» pelado y sin papel no lo
     puede comprobar nadie dentro de un año, y quien lo puso ya no se acuerda.
     Con comprobante la nota sobra: el documento habla. */
  if (!link && String(nota || "").trim().length < 4) {
    return { error: "Sin comprobante adjunto, di al menos por dónde salió el dinero." };
  }

  const cerrado = await expedienteCerrado(supabase, rheId);
  if (cerrado) return cerrado;

  const { data: tocados, error } = await supabase.from("rhe").update({
    pagado_en: new Date().toISOString(), pagado_por: user.id,
    pagado_medio: m, pagado_url: link || null, pagado_nota: String(nota || "").trim() || null,
  }).eq("id", rheId).select("id");
  if (error) return { error: error.message };
  if (!tocados?.length) return { error: "No se encontró ese recibo." };
  revalidatePath("/admin");
  return {};
}

/* ── EL SELLO TIENE QUE SELLAR ──
 * Cerrar un expediente afirma «lo revisé y está bien». Si después se le puede
 * quitar el comprobante, deshacer el pago o desenlazar el recibo sin reabrirlo,
 * el sello no afirma nada: describe un momento que ya pasó.
 *
 * Vive en una función y no copiado en cada acción porque son cuatro sitios, y
 * la regla que se escribe cuatro veces se corrige en tres.
 */
async function expedienteCerrado(supabase: any, rheId: string): Promise<{ error: string } | null> {
  const { data: r } = await supabase.from("rhe")
    .select("liq:liquidaciones(anio,mes,cerrado_en)").eq("id", rheId).maybeSingle();
  const l = Array.isArray(r?.liq) ? r.liq[0] : r?.liq;
  if (!l?.cerrado_en) return null;
  return {
    error: `Este recibo pertenece al expediente cerrado de ${String(l.mes).padStart(2, "0")}/${l.anio}. Ábrelo con 🔓 antes de tocarlo.`,
  };
}

export async function deshacerPagoRhe(rheId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin").eq("id", user.id).single();
  if (!perfil?.es_admin) return { error: "Solo un administrador puede deshacerlo." };
  const cerrado = await expedienteCerrado(supabase, rheId);
  if (cerrado) return cerrado;
  const { data: tocados, error } = await supabase.from("rhe")
    .update({
      pagado_en: null, pagado_por: null, pagado_nota: null,
      pagado_url: null, pagado_medio: null,
    }).eq("id", rheId).select("id");
  if (error) return { error: error.message };
  if (!tocados?.length) return { error: "No se encontró ese recibo." };
  revalidatePath("/admin");
  return {};
}

/* Atar un recibo a la persona-mes que paga. Es el eslabón que faltaba, y se
   hace desde el panel de RHE porque es ahí donde se registra el recibo — con
   el mes delante, mientras se sabe de cuál era. */
export async function enlazarRheALiquidacion(rheId: string, liquidacionId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* También finanzas: atar el recibo a su mes es parte de registrarlo, y
     dejarlo fuera obligaría a que administración repasara uno por uno lo que
     el asistente acaba de cargar — el cuello de botella que se quitó. */
  const { data: perfil } = await supabase.from("perfiles").select("es_admin,es_finanzas").eq("id", user.id).single();
  if (!perfil?.es_admin && !perfil?.es_finanzas) {
    return { error: "Solo administración puede enlazar un recibo a un mes." };
  }

  /* Desenlazar de un expediente cerrado lo vaciaría de pruebas dejándole el
     sello puesto: 🔒 «revisado y terminado» encima de cero recibos. Se mira el
     estado ACTUAL del recibo, no el destino. */
  const cerrado = await expedienteCerrado(supabase, rheId);
  if (cerrado) return cerrado;

  if (liquidacionId) {
    /* Que el recibo y el mes sean de la MISMA persona. La pantalla solo ofrece
       los meses de esa persona, así que esto no se puede tocar desde la UI —
       pero una acción de servidor es una puerta abierta a la base, y el día que
       otra pantalla la llame con otros argumentos, un recibo de Ana pagando el
       mes de Luis no daría ningún error: cuadraría mal en silencio. */
    const [{ data: r }, { data: l }] = await Promise.all([
      supabase.from("rhe").select("persona_id").eq("id", rheId).maybeSingle(),
      supabase.from("liquidaciones").select("persona_id,cerrado_en").eq("id", liquidacionId).maybeSingle(),
    ]);
    if (!r || !l) return { error: "No se encontró el recibo o el mes." };
    if (r.persona_id !== l.persona_id) return { error: "Ese mes es de otra persona." };
    if (l.cerrado_en) return { error: "Ese expediente está cerrado. Ábrelo con 🔓 antes de enlazarle un recibo." };
  }

  const { data: tocados, error } = await supabase.from("rhe")
    .update({ liquidacion_id: liquidacionId || null }).eq("id", rheId).select("id");
  if (error) return { error: error.message };
  if (!tocados?.length) return { error: "No se encontró ese recibo." };
  revalidatePath("/admin");
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

/* Un importe escrito por una persona. En es-PE el separador decimal es la
 * COMA y el de miles el punto, justo al revés que en el número que espera
 * `parseFloat`. Se normaliza en un solo sitio para que no vuelva a haber dos
 * criterios en el mismo archivo. */
function montoDe(v: string | number | null | undefined): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  /* Si hay coma, ELLA es el decimal y los puntos son miles: «1.234,50».
     Si no la hay, el punto es el decimal: «1234.50». */
  const limpio = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s;
  const n = parseFloat(limpio.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* ── GASTOS CON DECLARACIÓN JURADA ──
 *
 * Lo que se paga en la puna sin comprobante y se declara al volver. DAFO lo
 * acepta topeado a un % del estímulo, y pasarse obliga a devolver el exceso
 * (acta, cláusula 6.9) — así que estas tres funciones sostienen el número más
 * caro de equivocar del sistema. Ver db/declaraciones-juradas.sql y lib/dj.ts.
 */
export async function guardarGastoDj(f: {
  id?: string | null; postulacionId: string;
  descripcion: string; importe: string;
  fecha: string; fechaHasta?: string;
  lugarOrigen?: string; lugarDestino?: string;
  etapa?: string; rubroItem?: string;
  djNumero?: string; djUrl?: string; firmadaPor?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
  if (!perfil?.es_admin && !perfil?.es_finanzas) {
    return { error: "Solo administración registra los gastos con declaración jurada." };
  }

  const desc = String(f.descripcion || "").trim();
  if (!desc) return { error: "Di qué se pagó: es la descripción que va en la DJ." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return { error: "Pon la fecha del gasto." };
  const hasta = String(f.fechaHasta || "").trim();
  if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { error: "La fecha final no es válida." };
  /* Un rango al revés no da error en ningún sitio y sale impreso en la DJ como
     «del 9 al 3 de agosto». Lo ve DAFO, no nosotros. */
  if (hasta && hasta < f.fecha) return { error: "La fecha final es anterior a la inicial." };

  /* La coma decimal, y no es un detalle de formato: con `replace(/[^\d.]/g,"")`
     un «1234,50» perdía la coma y se guardaba como 123450 — cien veces más, en
     el único número del sistema cuyo exceso obliga a devolver plata. El teclado
     es-PE ofrece coma, así que el caso no es raro: es el normal. */
  const importe = montoDe(f.importe);
  if (importe <= 0) return { error: "El importe debe ser mayor que cero." };

  const fila = {
    postulacion_id: f.postulacionId,
    descripcion: desc,
    importe,
    fecha: f.fecha,
    fecha_hasta: hasta || null,
    lugar_origen: String(f.lugarOrigen || "").trim() || null,
    lugar_destino: String(f.lugarDestino || "").trim() || null,
    etapa: f.etapa || null,
    rubro_item: f.rubroItem || null,
    dj_numero: String(f.djNumero || "").trim() || null,
    dj_url: String(f.djUrl || "").trim() || null,
    firmada_por: f.firmadaPor || null,
  };

  /* Al editar NO se reescribe `postulacion_id`, y además se acota por él. Sin
     las dos cosas, un id ajeno movería el gasto de un fondo a otro y
     descuadraría dos saldos de una vez — el de origen sube y el de destino
     baja, y ninguno de los dos avisa. */
  const { postulacion_id, ...sinFondo } = fila;
  const { data: guardado, error } = f.id
    ? await supabase.from("gasto_dj").update(sinFondo)
        .eq("id", f.id).eq("postulacion_id", f.postulacionId).select("id")
    : await supabase.from("gasto_dj").insert({ ...fila, creado_por: user.id }).select("id");
  if (error) {
    /* Por CÓDIGO y no por el texto: `42P01` es «la tabla no existe» y nada
       más. Buscar «gasto_dj» en el mensaje capturaba también el check del
       importe y el rechazo de RLS, y a los tres se les contestaba «falta correr
       el SQL» — mandando a arreglar algo que ya estaba bien. */
    return {
      error: (error as any).code === "42P01"
        ? "Falta correr db/declaraciones-juradas.sql en Supabase."
        : error.message,
    };
  }
  if (!guardado?.length) return { error: "No se guardó nada. Revisa tus permisos." };

  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: f.postulacionId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `${f.id ? "corrigió" : "registró"} un gasto con DJ de S/ ${importe.toLocaleString("es-PE")} — ${desc.slice(0, 80)}` },
  });
  revalidatePath(`/fondo/${f.postulacionId}`);
  return {};
}

export async function borrarGastoDj(id: string, postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
  if (!perfil?.es_admin && !perfil?.es_finanzas) return { error: "Solo administración puede borrarlo." };

  const { data: prev } = await supabase.from("gasto_dj").select("importe,descripcion").eq("id", id).maybeSingle();
  const { data: borrados, error } = await supabase.from("gasto_dj").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!borrados?.length) return { error: "No se borró nada. Revisa tus permisos." };

  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `borró un gasto con DJ de S/ ${Number(prev?.importe || 0).toLocaleString("es-PE")} — ${String(prev?.descripcion || "").slice(0, 80)}` },
  });
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

/* El tope que dice el acta de ESTA postulación, cuando difiere del de las
 * bases. Se guarda aparte del de la convocatoria porque lo que obliga es lo
 * firmado, y porque un fondo con acta distinta no debería obligar a cambiar la
 * regla del concurso entero para el resto. */
export async function fijarTopeDj(postulacionId: string, pct: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
  if (!perfil?.es_admin && !perfil?.es_finanzas) return { error: "Solo administración puede fijar el tope." };

  const limpio = String(pct || "").trim();
  const n = limpio ? montoDe(limpio) : null;
  /* Se admite el CERO. Un concurso que no acepta declaraciones juradas es un
     caso real, y sin poder decirlo el sistema caería al tope de las bases y
     mostraría un margen que no existe — el error que acaba en devolver plata.
     Vacío sigue queriendo decir «usa el de las bases»; cero dice «ninguna». */
  if (limpio && (!Number.isFinite(n as number) || (n as number) < 0 || (n as number) > 100)) {
    return { error: "El tope es un porcentaje entre 0 y 100." };
  }

  const { data: tocadas, error } = await supabase.from("postulaciones")
    .update({ tope_dj_pct: n }).eq("id", postulacionId).select("id");
  if (error) {
    return {
      error: (error as any).code === "42703"   // columna inexistente
        ? "Falta correr db/declaraciones-juradas.sql en Supabase."
        : error.message,
    };
  }
  /* Sin esto, un id que no existe o un rechazo de RLS devolvían éxito y encima
     dejaban escrito en Actividad «fijó el tope en 10%» de un tope que sigue
     vacío. Es el mismo cinturón que llevan las otras acciones de esta tanda. */
  if (!tocadas?.length) return { error: "No se encontró esa postulación." };
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: n ? `fijó el tope de DJ de este fondo en ${n}% (lo que dice su acta)` : "quitó el tope de DJ propio: vuelve a mandar el de las bases" },
  });
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

/* ══ CAJA — ingresos y egresos del día a día (control interno) ══
 *
 * Nada de esto se rinde a DAFO. Ver db/caja.sql y lib/caja.ts.
 *
 * La regla que gobierna estas funciones: apuntar un gasto tiene que costar
 * diez segundos. Cada validación que se añade es una razón más para no
 * apuntarlo, y un cuaderno que no se llena da la sensación de que hay control
 * sin haberlo. Solo se valida lo que hace el dato inservible.
 */
async function puedeCaja(supabase: any, userId: string) {
  const { data: p } = await supabase.from("perfiles")
    .select("es_admin,es_finanzas").eq("id", userId).maybeSingle();
  return !!(p?.es_admin || p?.es_finanzas);
}

export async function guardarMovCaja(f: {
  id?: string | null;
  cajaId: string; fecha: string; monto: string;
  /* O cuenta (ingreso/egreso) o caja destino (traspaso). Nunca las dos: lo
     exige también un check de la base, porque una fila con las dos no se
     sabría ni sumar ni ignorar. */
  cuentaId?: string; cajaDestino?: string; traspaso?: boolean;
  descripcion?: string; proyectoId?: string; url?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!(await puedeCaja(supabase, user.id))) {
    return { error: "Solo administración registra movimientos de caja." };
  }

  if (!f.cajaId) return { error: "Elige de qué caja sale o entra." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return { error: "Pon la fecha." };
  const monto = montoDe(f.monto);
  if (monto <= 0) return { error: "El monto debe ser mayor que cero." };

  /* La INTENCIÓN viaja; antes se deducía del destino, y con el modo traspaso
     puesto pero la caja destino sin elegir el servidor creía que era un
     movimiento normal y pedía «elige la cuenta» — un campo que en ese modo no
     está en pantalla. Un error que nombra algo que no se ve no se puede
     obedecer. */
  const esTraspaso = f.traspaso ?? !!f.cajaDestino;
  if (esTraspaso) {
    if (!f.cajaDestino) return { error: "Elige a qué caja va el traspaso." };
    if (f.cajaDestino === f.cajaId) return { error: "Un traspaso tiene que ir a otra caja." };
  } else if (!f.cuentaId) {
    return { error: "Elige la cuenta: dice si entra o sale." };
  }

  const fila = {
    caja_id: f.cajaId,
    fecha: f.fecha,
    monto,
    cuenta_id: esTraspaso ? null : (f.cuentaId || null),
    caja_destino: esTraspaso ? f.cajaDestino : null,
    descripcion: String(f.descripcion || "").trim() || null,
    /* Un traspaso no pertenece a ninguna cobertura: es la misma plata cambiando
       de sitio. La pantalla esconde el selector en ese modo, pero si quedó algo
       elegido de antes llegaría hasta aquí y el traspaso saldría colgado de un
       proyecto sin que nadie lo hubiera visto. */
    proyecto_id: esTraspaso ? null : (f.proyectoId || null),
    url: String(f.url || "").trim() || null,
  };

  const { data: guardado, error } = f.id
    ? await supabase.from("movimiento_caja").update(fila).eq("id", f.id).select("id")
    : await supabase.from("movimiento_caja").insert({ ...fila, creado_por: user.id }).select("id");
  if (error) {
    const c = (error as any).code;
    return {
      error: c === "42P01" ? "Falta correr db/caja.sql en Supabase."
        /* Los códigos de Postgres, traducidos. Un «violates check constraint
           mov_caja_clase» es inglés de base de datos delante de alguien que
           está apuntando un gasto de S/ 20. */
        : c === "23514" ? "El movimiento tiene que ser o de una cuenta o un traspaso, no las dos cosas."
        : c === "42501" ? "No tienes permiso para escribir en la caja."
        : error.message,
    };
  }
  if (!guardado?.length) return { error: "No se guardó nada. Revisa tus permisos." };
  revalidatePath("/caja");
  return {};
}

export async function borrarMovCaja(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!(await puedeCaja(supabase, user.id))) return { error: "Solo administración puede borrarlo." };
  const { data: borrados, error } = await supabase.from("movimiento_caja").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!borrados?.length) return { error: "No se borró nada. Revisa tus permisos." };
  revalidatePath("/caja");
  return {};
}

/* Las cuentas se crean desde la pantalla porque se van a partir y renombrar, y
 * cada cambio no puede ser un despliegue. Y NO se borran: se apagan. Una
 * cuenta con historia detrás, borrada, obligaría a reasignar sus movimientos —
 * que es falsear el pasado para limpiar una lista. */
export async function guardarCuentaCaja(f: { id?: string | null; nombre: string; flujo: string }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!(await puedeCaja(supabase, user.id))) return { error: "Solo administración edita las cuentas." };

  const nombre = String(f.nombre || "").trim();
  if (!nombre) return { error: "Ponle nombre a la cuenta." };
  if (f.flujo !== "ingreso" && f.flujo !== "egreso") return { error: "Di si es de ingreso o de egreso." };

  /* El `flujo` también se actualiza. Antes solo se guardaba el nombre y el
     cambio de sentido se descartaba en silencio: la cuenta seguía sumando al
     lado contrario y el error no se veía hasta cuadrar el mes. */
  const { data: tocadas, error } = f.id
    ? await supabase.from("cuenta_caja").update({ nombre, flujo: f.flujo }).eq("id", f.id).select("id")
    : await supabase.from("cuenta_caja").insert({ nombre, flujo: f.flujo }).select("id");
  if (error) {
    return {
      error: (error as any).code === "23505"
        ? `Ya existe una cuenta de ${f.flujo} llamada «${nombre}».`
        : error.message,
    };
  }
  if (!tocadas?.length) return { error: "No se guardó nada. Revisa tus permisos." };
  revalidatePath("/caja");
  return {};
}

export async function activarCuentaCaja(id: string, activa: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!(await puedeCaja(supabase, user.id))) return { error: "Solo administración edita las cuentas." };
  const { data: tocadas, error } = await supabase.from("cuenta_caja")
    .update({ activa }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!tocadas?.length) return { error: "No se pudo cambiar. Revisa tus permisos." };
  revalidatePath("/caja");
  return {};
}

/* ── CREAR, RENOMBRAR Y ARCHIVAR CAJAS ──
 *
 * El propio db/caja.sql argumentaba que añadir un Yape o una segunda cuenta «no
 * puede ser un despliegue», y luego dejó la única forma de hacerlo en un INSERT
 * a mano. Esto cierra ese hueco.
 *
 * Renombrar importa más de lo que parece: «Banco» se convierte en «Banco BCP
 * Oficina» en cuanto aparece la segunda cuenta, y un saldo que no dice de qué
 * cuenta es no se puede contrastar con nada.
 */
export async function guardarCaja(f: {
  id?: string | null; nombre: string; tipo?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!(await puedeCaja(supabase, user.id))) return { error: "Solo administración edita las cajas." };

  const nombre = String(f.nombre || "").trim();
  if (!nombre) return { error: "Ponle nombre a la caja." };
  const tipo = ["efectivo", "banco", "otro"].includes(f.tipo || "") ? f.tipo : "efectivo";

  /* Al renombrar NO se toca el tipo si no viene: el tipo solo decide el ícono, y
     pisarlo con un valor por defecto cambiaría 🏦 por 💵 en una cuenta bancaria
     por el simple hecho de haberle corregido el nombre. */
  const fila: any = f.id && f.tipo === undefined ? { nombre } : { nombre, tipo };

  const { data: tocadas, error } = f.id
    ? await supabase.from("caja").update(fila).eq("id", f.id).select("id")
    : await supabase.from("caja").insert(fila).select("id");
  if (error) {
    return {
      error: (error as any).code === "42P01"
        ? "Falta correr db/caja.sql en Supabase."
        : error.message,
    };
  }
  if (!tocadas?.length) return { error: "No se guardó nada. Revisa tus permisos." };
  revalidatePath("/caja");
  return {};
}

/* Archivar en vez de borrar, por la misma razón que las cuentas: una caja con
 * movimientos detrás tiene historia, y la base además lo impide (`on delete
 * restrict`). Archivada deja de ofrecerse al apuntar y su tarjeta desaparece,
 * pero sus movimientos siguen contando donde ya contaban.
 *
 * Con saldo distinto de cero se AVISA y no se bloquea: una caja que se cierra
 * con plata dentro casi siempre es un traspaso que falta hacer, y quien la
 * archiva merece enterarse antes de que el dinero desaparezca de la vista. */
export async function archivarCaja(id: string, activa: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!(await puedeCaja(supabase, user.id))) return { error: "Solo administración edita las cajas." };

  if (!activa) {
    const { count } = await supabase.from("caja")
      .select("id", { count: "exact", head: true }).eq("activa", true);
    /* Sin cajas activas no se puede apuntar nada: el formulario se queda sin
       origen y la pantalla, muda. */
    if ((count || 0) <= 1) return { error: "Es la única caja activa. Crea otra antes de archivar esta." };
  }

  const { data: tocadas, error } = await supabase.from("caja")
    .update({ activa }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!tocadas?.length) return { error: "No se pudo cambiar. Revisa tus permisos." };
  revalidatePath("/caja");
  return {};
}

/* El saldo inicial: lo único que el sistema no puede deducir. Se pone una vez,
 * al empezar, y sin él el saldo de la pantalla no es el dinero que hay. */
export async function fijarSaldoInicial(cajaId: string, saldo: string, desde: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!(await puedeCaja(supabase, user.id))) return { error: "Solo administración puede fijarlo." };
  const v = montoDe(saldo);
  /* Se admite negativo: una cuenta en rojo o un adelanto que dejó la caja chica
     en descubierto son estados reales, y prohibirlos obligaría a poner un
     número falso para poder seguir. */
  const { data: tocadas, error } = await supabase.from("caja")
    .update({ saldo_inicial: v, fecha_inicio: /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : null })
    .eq("id", cajaId).select("id");
  if (error) return { error: error.message };
  if (!tocadas?.length) return { error: "No se guardó. Revisa tus permisos." };
  revalidatePath("/caja");
  return {};
}

/* ── FACTURAS Y BOLETAS DE PROVEEDOR ──
 *
 * La tercera forma de rendir. A diferencia de las DJ, NO tiene tope: cuanto
 * más gasto se respalde con comprobante formal, mejor — y de hecho es lo que
 * libera saldo de declaraciones juradas para lo que de verdad no puede tener
 * papel. Ver db/facturas.sql.
 */
export async function guardarComprobante(f: {
  id?: string | null;
  /** De quién es la factura. Obligatoria desde db/comprobante-empresa.sql: una
   *  factura pertenece a una EMPRESA, y el fondo es a lo que se imputa. */
  empresaId?: string | null;
  /** A qué fondo se imputa, si es que a alguno. OPCIONAL: la compra de la
   *  asociación con plata propia no tiene postulación, y exigirla era lo que
   *  la dejaba fuera del sistema. */
  postulacionId?: string | null;
  /** `compra` (IGV crédito) o `venta` (IGV débito). Sin esto el IGV del mes no
   *  se puede calcular: sumar los dos daría un número sin significado. */
  sentido?: string;
  tipo: string; proveedor: string; ruc?: string;
  serie?: string; numero?: string;
  fecha: string; importe: string; igv?: string;
  concepto?: string; etapa?: string; rubroItem?: string; url?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
  if (!perfil?.es_admin && !perfil?.es_finanzas) {
    return { error: "Solo administración registra los comprobantes." };
  }

  const prov = String(f.proveedor || "").trim();
  if (!prov) return { error: "Di quién emitió el comprobante." };
  const sentido = f.sentido === "venta" ? "venta" : "compra";

  /* La empresa se puede deducir del fondo cuando viene por ahí —es lo que hace
     la pantalla del fondo, que no la pide—, pero alguna tiene que haber: sin
     empresa el comprobante no entra en ningún IGV y no se echa de menos. */
  let empresaId = f.empresaId || null;
  if (!empresaId && f.postulacionId) {
    const { data: post } = await supabase.from("postulaciones")
      .select("empresa_id").eq("id", f.postulacionId).maybeSingle();
    empresaId = (post as any)?.empresa_id || null;
  }
  if (!empresaId) return { error: "Falta la empresa a la que pertenece el comprobante." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return { error: "Pon la fecha del comprobante." };
  const importe = montoDe(f.importe);
  if (importe <= 0) return { error: "El importe debe ser mayor que cero." };
  const igv = montoDe(f.igv);
  /* El IGV no puede ser mayor que el total. No es pedantería: el desglose va
     al informe de DAFO, y un IGV imposible se descubre allá y no aquí. */
  if (igv > importe) return { error: "El IGV no puede ser mayor que el importe total." };

  const ruc = String(f.ruc || "").replace(/\D/g, "");
  /* Un RUC peruano tiene 11 dígitos. Se admite vacío —una boleta pequeña puede
     no traerlo— pero si viene, que venga entero: un RUC de diez dígitos no
     falla en ningún sitio, se rinde así y lo rebota DAFO. */
  if (ruc && ruc.length !== 11) return { error: "El RUC tiene 11 dígitos. Déjalo vacío si el comprobante no lo trae." };

  const fila = {
    empresa_id: empresaId,
    postulacion_id: f.postulacionId || null,
    sentido,
    tipo: f.tipo || "factura",
    proveedor: prov,
    ruc: ruc || null,
    serie: String(f.serie || "").trim().toUpperCase() || null,
    numero: String(f.numero || "").trim() || null,
    fecha: f.fecha,
    importe, igv,
    concepto: String(f.concepto || "").trim() || null,
    etapa: f.etapa || null,
    rubro_item: f.rubroItem || null,
    url: String(f.url || "").trim() || null,
  };

  /* Al EDITAR sí viaja `postulacion_id`: imputar una factura a un fondo —o
     dejar de hacerlo— es justo una de las correcciones que hay que poder
     hacer, y antes la actualización lo excluía a propósito porque el fondo era
     inmutable. Ya no lo es.
     El `eq("empresa_id")` sustituye al viejo `eq("postulacion_id")` como
     cinturón: impide que un id de otra empresa se cuele en el update. */
  const { data: guardado, error } = f.id
    ? await supabase.from("comprobante").update(fila)
        .eq("id", f.id).eq("empresa_id", empresaId).select("id")
    : await supabase.from("comprobante").insert({ ...fila, creado_por: user.id }).select("id");

  if (error) {
    const c = (error as any).code;
    return {
      error: c === "42P01" ? "Falta correr db/facturas.sql en Supabase."
        /* El duplicado se explica, no se suelta en crudo. «23505» a secas
           manda a buscar un error de programa cuando lo que pasa es que esa
           factura ya se cargó — y saberlo evita cargarla «con otro número». */
        /* El duplicado ya no es «en este fondo»: la unicidad pasó a ser la de
           SUNAT —emisor, serie y número dentro de la empresa—, así que la
           factura puede estar cargada en otro fondo o sin fondo ninguno. Decir
           «en este fondo» mandaría a buscarla donde no está. */
        : c === "23505" ? `Esa factura ya está cargada para esta empresa (${fila.serie || "sin serie"}-${fila.numero || "sin número"}${ruc ? ` de ${ruc}` : ""}). Búscala en /comprobantes.`
        : error.message,
    };
  }
  if (!guardado?.length) return { error: "No se guardó nada. Revisa tus permisos." };

  /* La bitácora va a la EMPRESA, que es la dueña, y al fondo solo si lo hay.
     Antes iba siempre a la postulación: una compra sin fondo habría escrito su
     rastro en `entidad_id: null` — una fila de historial que no se puede
     encontrar desde ninguna ficha. */
  const rastro = `${f.id ? "corrigió" : "registró"} ${sentido === "venta" ? "una venta" : "una compra"}: ${fila.tipo} de ${prov} por S/ ${importe.toLocaleString("es-PE")}`;
  await supabase.from("actividad").insert({
    entidad_tipo: "empresa", entidad_id: empresaId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: rastro },
  });
  revalidatePath("/comprobantes");
  revalidatePath("/obligaciones");
  if (f.postulacionId) revalidatePath(`/fondo/${f.postulacionId}`);
  return {};
}

export async function borrarComprobante(id: string, postulacionId?: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles").select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
  if (!perfil?.es_admin && !perfil?.es_finanzas) return { error: "Solo administración puede borrarlo." };

  const { data: prev } = await supabase.from("comprobante")
    .select("proveedor,importe,empresa_id,postulacion_id").eq("id", id).maybeSingle();
  const { data: borrados, error } = await supabase.from("comprobante").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!borrados?.length) return { error: "No se borró nada. Revisa tus permisos." };

  const emp = (prev as any)?.empresa_id || null;
  if (emp) await supabase.from("actividad").insert({
    entidad_tipo: "empresa", entidad_id: emp, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `borró un comprobante de ${prev?.proveedor || "—"} por S/ ${Number(prev?.importe || 0).toLocaleString("es-PE")}` },
  });
  revalidatePath("/comprobantes");
  revalidatePath("/obligaciones");
  const fondo = postulacionId || (prev as any)?.postulacion_id;
  if (fondo) revalidatePath(`/fondo/${fondo}`);
  return {};
}

/* ── ¿PUEDE ESTA PERSONA ESCRIBIR ESTE RHE? ──
 *
 * Tres puertas, las mismas que la RLS (db/rhe-permisos.sql): admin, finanzas, o
 * que el recibo sea SUYO. Las reglas viven en la base —ahí es donde no se
 * pueden saltar— y esto las repite arriba por una sola razón: cuando RLS
 * rechaza una escritura no da un error explicativo, devuelve cero filas. El
 * mensaje útil («esto no es tuyo») solo se puede dar desde aquí.
 *
 * Devuelve el error cuando NO puede, y null cuando sí. Al revés se leería mejor
 * en la firma y peor en el sitio de uso, donde lo que se quiere escribir es
 * `if (no puede) return el error`.
 */
async function puedeEscribirRhe(
  supabase: any, userId: string, personaId: string,
): Promise<{ error: string } | null> {
  const [{ data: perfil }, { data: mia }] = await Promise.all([
    supabase.from("perfiles").select("es_admin,es_finanzas").eq("id", userId).maybeSingle(),
    supabase.from("personas").select("id").eq("id", personaId).eq("usuario_id", userId).maybeSingle(),
  ]);
  if (perfil?.es_admin || perfil?.es_finanzas) return null;
  if (mia) return null;
  return {
    error: "Solo puedes registrar los recibos girados a tu nombre. Para los de otra persona, pídeselo a administración.",
  };
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
  /* El mes de jornadas que este recibo paga. Se manda al CREARLO, que es el
     único momento en que alguien lo tiene claro sin pensar: viene de pulsar
     «registrar el recibo» desde ese mes. Atarlo después, de memoria, es lo que
     dejaba expedientes «sin recibo» con su recibo delante. */
  liquidacionId?: string;
  /* Quién lo giró: oficina | delegado | propio. Ver db/pagos-expediente.sql. */
  giradoPor?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  if (!f.personaId) return { error: "Elige a quién se le giró." };

  const puede = await puedeEscribirRhe(supabase, user.id, f.personaId);
  if (puede) return puede;
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
    ...(f.liquidacionId !== undefined ? { liquidacion_id: f.liquidacionId || null } : {}),
    ...(f.giradoPor !== undefined ? { girado_por: f.giradoPor || null } : {}),
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

/* ══════════════════════════════════════════════════════════════════════════
   LAS CONSTANCIAS DE SUSPENSIÓN DE 4ta, UNA POR AÑO

   La suspensión caduca cada 31 de diciembre, así que una persona tiene una
   constancia por año y no «una constancia». Hasta ahora se tecleaban en dos
   campos de la ficha; con db/suspension-4ta-anios.sql esos campos pasaron a
   estar DERIVADOS del historial, y este es el sitio donde se escribe.
   ══════════════════════════════════════════════════════════════════════════ */
export async function guardarSuspension4ta(f: {
  id?: string | null; personaId: string; anio: string | number;
  url?: string; operacion?: string; presentado?: string; nota?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const anio = parseInt(String(f.anio), 10);
  /* El rango no es paranoia de programador: el campo se teclea y un dedo de
     más convierte 2025 en 20255, que la tabla aceptaría como int y luego
     ordenaría por encima de todo — dejando a esa persona «cubierta» para
     siempre. El check de la base también lo impide; aquí se dice por qué. */
  if (!anio || anio < 2000 || anio > 2100) return { error: "El año no parece un año." };

  const fila: any = {
    persona_id: f.personaId, anio,
    url: (f.url || "").trim() || null,
    operacion: (f.operacion || "").trim() || null,
    presentado: (f.presentado || "").trim() || null,
    nota: (f.nota || "").trim() || null,
  };
  if (!f.id) fila.creado_por = user.id;

  const { data, error } = f.id
    ? await supabase.from("suspension_4ta").update(fila).eq("id", f.id).select("id")
    : await supabase.from("suspension_4ta").insert(fila).select("id");
  if (error) {
    return {
      error: /does not exist|42P01/.test(error.message)
        ? "Falta correr db/suspension-4ta-anios.sql en Supabase."
        /* El duplicado aquí SÍ tiene un significado útil y se traduce: ya hay
           una constancia de ese año. Decir «unique violation» obligaría a
           adivinarlo. */
        : /duplicate|unique/i.test(error.message)
        ? `Ya hay una constancia de ${anio} para esta persona. Edita esa en vez de añadir otra.`
        : error.message,
    };
  }
  /* Cinturón: un insert bloqueado por RLS devuelve cero filas sin error, y el
     historial «se guardaría» y desaparecería al recargar. */
  if (!data?.length) return { error: "No se pudo guardar: el permiso de la base lo rechazó." };

  revalidatePath(`/entidad/persona/${f.personaId}`);
  revalidatePath("/personas");
  return {};
}

export async function quitarSuspension4ta(id: string, personaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = await supabase.from("suspension_4ta")
    .delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se pudo borrar: el permiso de la base lo rechazó." };
  revalidatePath(`/entidad/persona/${personaId}`);
  revalidatePath("/personas");
  return {};
}

/* ── EL COMPROBANTE DE UN RHE, DESPUÉS DE HABERLO REGISTRADO ──
 *
 * El PDF del recibo solo se podía adjuntar en el formulario de alta, y de ahí
 * salía este agujero: los 26 recibos de PO-003 entraron por carga SQL, así que
 * los 26 se quedaron sin comprobante y no había forma de ponérselo. La fila
 * enseñaba «📄 ↗» cuando había PDF y nada cuando no — sin nada que pulsar,
 * o sea sin decir que faltaba algo ni cómo arreglarlo.
 *
 * Y no es un dato menor: el recibo escaneado ES la rendición. Un RHE en la
 * base sin su PDF es una cifra que no se puede presentar.
 *
 * ── QUIÉN PUEDE ──
 * `es_admin` O `es_finanzas`, igual que la pantalla que lo ofrece. `fijarEjesRhe`
 * pide solo `es_admin` y por eso a quien lleva finanzas le rebota un botón que
 * la interfaz le dejaba pulsar; no se toca aquí —cambiar permisos de paso es
 * como se acaban repartiendo llaves de más— pero queda dicho.
 */
/* ── «NO EXISTE» NO ES «NO PUEDES» ──
 * Se distinguía por el NOMBRE de la función dentro del mensaje, y ese nombre
 * aparece igual en «permission denied for function adjuntar_comprobante_rhe».
 * Con eso, un permiso mal dado se anunciaba como una migración sin correr: se
 * manda a alguien a ejecutar un SQL que ya está ejecutado, y el problema real
 * —el grant— no se mira. Los códigos sí distinguen: PGRST202 es «PostgREST no
 * la encuentra» y 42883 es «no existe» de Postgres. */
const faltaLaFuncion = (e: any) =>
  e?.code === "PGRST202" || e?.code === "42883";

const mensajeRpc = (e: any) =>
  faltaLaFuncion(e) ? "Falta correr db/apoyo-rendicion.sql en la base." : e?.message || "No se pudo guardar.";

export async function fijarComprobanteRhe(id: string, postulacionId: string, url: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* ── LA REGLA VIVE EN LA BASE, NO AQUÍ ──
     Esto comprobaba el permiso por su cuenta y hacía el `update` directo. Con
     tres clases de gente que puede adjuntar —administración, el apoyo del
     fondo y el titular del recibo— esa comprobación tenía que existir a la vez
     aquí y en la política de RLS, y dos escrituras de la misma regla divergen
     en cuanto una de las dos se retoca.
     `adjuntar_comprobante_rhe` decide y escribe UNA columna. Un `update`
     abierto por RLS no podría: una política elige filas, nunca columnas, y
     quien puede colgar el PDF acabaría pudiendo cambiar el monto.
     Devuelve null si fue bien, o el motivo — que se enseña tal cual. */
  const { data, error } = await supabase.rpc("adjuntar_comprobante_rhe", {
    p_rhe: id, p_url: url,
  });
  if (error) return { error: mensajeRpc(error) };
  if (data) return { error: String(data) };
  revalidatePath(`/fondo/${postulacionId}`);
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

/* ── LOS COMPROBANTES DE UNA TANDA, EN UN SOLO VIAJE ──
 *
 * La carga por lote llega con cincuenta y ocho pares recibo→PDF. Llamar a
 * `fijarComprobanteRhe` cincuenta y ocho veces desde el navegador son
 * cincuenta y ocho acciones de servidor que Next ENCOLA de una en una, cada
 * una con su validación de sesión y su `revalidatePath`: minutos de espera
 * para escribir una columna, y una barra de progreso que no se mueve.
 *
 * Aquí el bucle corre en el servidor, donde la base está a un salto, y se
 * revalida UNA vez al final.
 *
 * ── NO ES «TODO O NADA» ──
 * Cada recibo se decide por separado y los fallos se DEVUELVEN uno a uno con
 * su motivo. Abortar la tanda entera porque el recibo 41 pertenece a un
 * expediente cerrado tiraría a la basura los cuarenta que sí entraron, y
 * obligaría a repetir la carga entera para descubrir el siguiente problema.
 */
export async function adjuntarComprobantesRhe(
  postulacionId: string, pares: { id: string; url: string }[],
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!Array.isArray(pares) || !pares.length) return { error: "No llegó ningún comprobante." };
  /* Un tope de cordura: una tanda de miles sería un fallo de quien llama, y
     dejarla correr bloquea la conexión un buen rato. */
  if (pares.length > 300) return { error: "Demasiados de una vez: sube por tandas de 300." };

  let hechos = 0;
  const fallos: { id: string; error: string }[] = [];
  for (const par of pares) {
    const { data, error } = await supabase.rpc("adjuntar_comprobante_rhe", {
      p_rhe: par.id, p_url: par.url,
    });
    if (error) {
      /* Si falta la migración, falla el primero y fallarían los 58 iguales:
         se corta y se dice una vez. Un «permiso denegado» NO es eso: ahí la
         función existe, y cortar la tanda mandaría a correr un SQL que ya está
         corrido mientras se tira lo que sí habría entrado. */
      if (faltaLaFuncion(error)) {
        return { error: "Falta correr db/apoyo-rendicion.sql en la base." };
      }
      fallos.push({ id: par.id, error: error.message });
    } else if (data) {
      fallos.push({ id: par.id, error: String(data) });
    } else {
      hechos++;
    }
  }
  revalidatePath(`/fondo/${postulacionId}`);
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return { hechos, fallos };
}

/* ── DAR DE ALTA LOS RECIBOS QUE EL PDF YA TRAE ──
 *
 * Un fondo que empieza no tiene ni una fila de RHE, así que la carga por lote
 * no tenía a qué colgar los PDF y se quedaba muda justo cuando más trabajo
 * ahorraría. Pero el recibo trae dentro TODO lo que una fila necesita: de
 * quién es (su RUC), número, fecha, importe y concepto. Teclear eso cincuenta
 * veces mirando los mismos PDF es el trabajo que esta pantalla vino a quitar.
 *
 * ── SOLO ADMINISTRACIÓN ──
 * Adjuntar un papel a un gasto ya registrado y REGISTRAR el gasto son cosas
 * distintas: lo primero completa un expediente, lo segundo mete plata en la
 * rendición. El apoyo de rendición puede lo primero y no lo segundo, y la
 * política `crear_rhe` de la base dice lo mismo (db/rhe-permisos.sql).
 *
 * ── NO CREA DOS VECES EL MISMO ──
 * Se comprueba persona + número dentro del fondo antes de insertar. Soltar la
 * carpeta dos veces es lo normal —se baja de Drive de una tacada— y un gasto
 * duplicado en la rendición es el error que ninguna auditoría perdona. El
 * repetido se DEVUELVE dicho, no se ignora en silencio.
 */
export async function crearRhesDeLote(postulacionId: string, items: {
  personaId: string; numero: string; fecha: string; monto: number;
  concepto?: string; url: string;
}[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles")
    .select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
  if (!perfil?.es_admin && !perfil?.es_finanzas) {
    return { error: "Solo administración registra recibos. Tú sí puedes adjuntar el PDF de los que ya están." };
  }
  if (!Array.isArray(items) || !items.length) return { error: "No llegó ningún recibo." };
  if (items.length > 300) return { error: "Demasiados de una vez: sube por tandas de 300." };

  /* Los que YA existen en este fondo, en un solo viaje. Preguntar uno por uno
     serían trescientas idas y vueltas para no crear duplicados. */
  const { data: yaHay, error: eLee } = await supabase.from("rhe")
    .select("persona_id,numero").eq("postulacion_id", postulacionId);
  if (eLee) return { error: eLee.message };
  const clave = (p: string, n: string) =>
    `${p}|${String(n || "").toUpperCase().replace(/\s+/g, "")}`;
  const existen = new Set((yaHay || []).map((r: any) => clave(r.persona_id, r.numero)));

  let creados = 0;
  const fallos: { archivo?: string; error: string }[] = [];
  for (const it of items) {
    const k = clave(it.personaId, it.numero);
    if (existen.has(k)) {
      fallos.push({ error: `El recibo ${it.numero} de esa persona ya estaba registrado en este fondo.` });
      continue;
    }
    if (!it.personaId || !it.numero || !(it.monto > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(it.fecha)) {
      fallos.push({ error: `${it.numero || "un recibo"}: le faltan datos para registrarlo.` });
      continue;
    }
    if (!/^https?:\/\/\S+$/.test(String(it.url || "").trim())) {
      fallos.push({ error: `${it.numero}: el PDF no se subió.` });
      continue;
    }
    const { error } = await supabase.from("rhe").insert({
      persona_id: it.personaId,
      postulacion_id: postulacionId,
      numero: it.numero,
      fecha: it.fecha,
      monto: it.monto,
      /* La retención en cero: los recibos del fondo van sin retención —el 8 %
         solo aplica pasado el tope anual— y el propio PDF lo dice. Si alguno
         la llevara, se corrige en su fila; inventarla aquí sería peor. */
      retencion: 0,
      concepto: it.concepto || null,
      url: it.url.trim(),
      creado_por: user.id,
    });
    if (error) { fallos.push({ archivo: it.numero, error: error.message }); continue; }
    existen.add(k);      // por si la misma tanda trae el mismo dos veces
    creados++;
  }

  if (creados) {
    await supabase.from("actividad").insert({
      entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "dato",
      detalle: { mensaje: `registró ${creados} recibo(s) por honorarios desde sus PDF` },
    });
  }
  revalidatePath(`/fondo/${postulacionId}`);
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return { creados, fallos };
}

/* ── LA CUENTA DEL FONDO SE CERRÓ ──
 *
 * PO-005 gastó el fondo entero y cerró la cuenta exclusiva; el sistema seguía
 * pidiendo cinco estados mensuales porque su serie solo sabía terminar por dos
 * motivos —rendición entregada o plazo del acta vencido—. Este es el tercero,
 * y el más definitivo: sin cuenta no hay estado que emitir.
 *
 * La alternativa era registrar esos meses en cero, y sería guardar como hecho
 * algo que no ocurrió: un cero AFIRMA que el banco reportó saldo cero. Aquí se
 * guarda el hecho —el día del cierre— y la cuenta de meses sale sola.
 */
export async function fijarCierreCuenta(postulacionId: string, fecha: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: perfil } = await supabase.from("perfiles")
    .select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
  if (!perfil?.es_admin && !perfil?.es_finanzas) {
    return { error: "Solo administración registra el cierre de la cuenta." };
  }
  const f = String(fecha || "").trim() || null;
  if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) return { error: "La fecha no tiene el formato correcto." };

  const { data, error } = await supabase.from("postulaciones")
    .update({ fecha_cierre_cuenta: f }).eq("id", postulacionId).select("id");
  if (error) {
    /* 42703 = la columna no existe; 23514 = la lo rechazó el check. Los dos
       tienen arreglos distintos y decirlos igual manda a buscar donde no es. */
    if ((error as any).code === "42703") return { error: "Falta correr db/cuenta-cerrada.sql en Supabase." };
    if ((error as any).code === "23514") return { error: "La cuenta no puede cerrarse antes del desembolso. Revisa el año." };
    return { error: error.message };
  }
  if (!data?.length) return { error: "No se pudo guardar: el permiso de la base lo rechazó." };
  revalidatePath(`/fondo/${postulacionId}`);
  revalidatePath("/fondos");
  return {};
}

/* ── EL RUC QUE FALTABA, CARGADO DONDE SE DESCUBRE QUE FALTA ──
 *
 * El cruce de comprobantes necesita las dos puntas: el RUC del PDF y el RUC de
 * la ficha. Cuando el segundo no está, el archivo se queda en «no sé de quién
 * es» y el arreglo vive en otra pantalla — con 58 archivos a medio clasificar,
 * eso quiere decir que no se arregla.
 * Escribe UNA columna a través de una función de la base: `personas` no tiene
 * política de UPDATE a propósito (db/invitaciones.sql), porque abrirla daría
 * acceso a las tarifas y al estado SUNAT de cualquier ficha.
 */
export async function fijarRucPersona(personaId: string, ruc: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = await supabase.rpc("fijar_ruc_persona", {
    p_persona: personaId, p_ruc: ruc,
  });
  if (error) {
    return { error: faltaLaFuncion(error)
      ? "Falta correr db/ruc-persona.sql en la base."
      : error.message };
  }
  if (data) return { error: String(data) };
  return {};
}

/* ── NOMBRAR Y QUITAR APOYOS DE RENDICIÓN ──
 * Solo administración, y la base lo vuelve a exigir con su política: un apoyo
 * que pudiera nombrarse a sí mismo no sería un permiso. Ver db/apoyo-rendicion.sql.
 */
export async function fijarApoyoFondo(
  postulacionId: string, usuarioId: string, sumar: boolean,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const q = sumar
    ? supabase.from("fondo_apoyo")
        .insert({ postulacion_id: postulacionId, usuario_id: usuarioId, creado_por: user.id })
        .select("usuario_id")
    : supabase.from("fondo_apoyo").delete()
        .eq("postulacion_id", postulacionId).eq("usuario_id", usuarioId)
        .select("usuario_id");
  const { data, error } = await q;
  if (error) {
    /* 42P01 = la tabla no existe. La migración se corre a mano y este es el
       primer sitio donde se nota. */
    if ((error as any).code === "42P01") return { error: "Falta correr db/apoyo-rendicion.sql en la base." };
    /* Nombrar dos veces al mismo no es un fallo: el resultado deseado ya está. */
    if ((error as any).code === "23505") return {};
    return { error: error.message };
  }
  /* El mismo cinturón de siempre: un insert o un delete que la RLS rechaza
     devuelve cero filas y NINGÚN error, así que sin esto «se guardaría» y
     desaparecería al recargar. */
  if (!data?.length) return { error: "No se pudo guardar: el permiso de la base lo rechazó. Solo administración nombra apoyos." };
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

/* ── LOS DOS EJES DE UNA FACTURA O DE UNA DJ, DESDE LA FILA ──
 *
 * Los RHE se clasifican en la propia lista con dos desplegables; las facturas
 * y las declaraciones juradas obligaban a abrir el formulario de edición,
 * cambiar y guardar. Tres clics extra por fila, y en PO-003 hay diez facturas
 * seguidas del mismo rubro: a ese precio la clasificación se pospone, y sin
 * rubro la conciliación no reparte nada.
 *
 * `fijarEjesRhe` ya hace esto para los recibos y se queda como está: su tabla
 * tiene reglas propias (permiso, liquidación) que no aplican aquí.
 */
export async function fijarEjesRendicion(tabla: string, id: string, ejes: {
  postulacionId: string; etapa?: string | null; rubroItem?: string | null;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* Solo estas dos: `movimiento_banco` y `estado_cuenta` no tienen ejes —un
     retiro del banco no se clasifica, se justifica con el gasto que lo
     respalda— y `rhe` tiene su propia acción. */
  if (!["comprobante", "gasto_dj"].includes(tabla)) {
    return { error: "Esa tabla no se clasifica por etapa y rubro." };
  }
  const { data: perfil } = await supabase.from("perfiles")
    .select("es_admin,es_finanzas").eq("id", user.id).maybeSingle();
  if (!(perfil?.es_admin || perfil?.es_finanzas)) {
    return { error: "Solo administración o finanzas clasifica los gastos." };
  }

  const patch: any = {};
  if (ejes.etapa !== undefined) patch.etapa = ejes.etapa || null;
  if (ejes.rubroItem !== undefined) patch.rubro_item = ejes.rubroItem || null;
  if (!Object.keys(patch).length) return {};

  /* `.select()` de cinturón: un update bloqueado por RLS devuelve cero filas y
     ningún error, y el desplegable se quedaría enseñando el valor nuevo hasta
     recargar. */
  const { data, error } = await supabase.from(tabla).update(patch).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se pudo guardar: el permiso de la base lo rechazó." };
  revalidatePath(`/fondo/${ejes.postulacionId}`);
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
  const puede = await puedeEscribirRhe(supabase, user.id, personaId);
  if (puede) return { error: puede.error.replace("registrar", "borrar") };

  const { data: prev } = await supabase.from("rhe").select("monto,numero").eq("id", id).maybeSingle();
  /* `.select()` para distinguir «borrado» de «RLS no dejó y devolvió cero
     filas». Ahora que escriben más manos, el caso frecuente es el de alguien
     borrando un recibo suyo que ya está pagado —la política no lo permite— y
     sin esto se iría con la sensación de haberlo borrado. */
  const { data: borrados, error } = await supabase.from("rhe").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!borrados?.length) {
    return { error: "No se borró. Un recibo ya pagado o dentro de un expediente cerrado solo lo puede quitar administración." };
  }
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
  return bancoDe(supabase, user);
}

/* El cuerpo, separado de la puerta. `estadoGlobal` necesita llamarlo SIN
   volver a verificar la sesión —ya la verificó una vez por las cuatro— y un
   parámetro `user` en una acción de servidor exportada sería un agujero: el
   cliente elige a quién dice ser. Por eso el helper NO se exporta. */
async function bancoDe(supabase: any, user: { id: string }) {
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
  /* ── LAS ONCE PUERTAS, TAMBIÉN AL EDITAR ──
     Esto leía tres columnas —autor, publicación, objeto— y revalidaba una de
     dos rutas. Con once dueños posibles, editar un comentario de una factura
     refrescaba `/caso/undefined`: el texto cambiaba en la base y la pantalla
     de al lado seguía enseñando el viejo hasta que alguien recargara a mano.
     Se piden todas y se refresca la que toque. Las opcionales van en su propio
     `select` de reintento: si la migración de la rendición no está corrida,
     PostgREST rechaza la consulta ENTERA y editar dejaría de funcionar hasta
     en los casos, que no tienen nada que ver. */
  /* ── Y LA LISTA NO SE TECLEA ──
     Aquí estaban las once columnas escritas a mano, copia de las que
     `lib/vinculoComentario.ts` ya deriva de TABLAS_RENDICION. Al abrir la
     puerta doce esta copia se quedó corta —y no habría dado error: editar un
     comentario de un periodo simplemente no habría refrescado su pantalla, y
     el texto viejo seguiría ahí hasta recargar a mano—.
     Es el fallo que este repo se toma en serio: dos listas de lo mismo, la
     segunda envejeciendo en silencio. Ahora sale de un sitio.
     Se mantiene el reintento sin las opcionales: si una migración no está
     corrida, PostgREST rechaza la consulta ENTERA y editar dejaría de
     funcionar hasta en los casos, que no tienen nada que ver. */
  const BASE = "autor_id," + COLS_DUENO_COM;
  const EXTRA = COLS_DUENO_COM_EXTRA;
  let { data: com, error: eSel } = await supabase.from("comentarios")
    .select(BASE + EXTRA).eq("id", comentarioId).maybeSingle();
  if (eSel) {
    ({ data: com } = await supabase.from("comentarios")
      .select(BASE).eq("id", comentarioId).maybeSingle());
  }
  if (!com) return { error: "Comentario no encontrado." };
  if ((com as any).autor_id !== user.id) return { error: "Solo el autor puede editar su comentario." };
  const upd: any = { cuerpo: texto || "📷", editado_en: new Date().toISOString() };
  if (imgs) upd.imagenes = imgs;
  /* `.select()` de cinturón: un update bloqueado por RLS devuelve cero filas y
     ningún error, y la edición «se guardaría» hasta recargar. */
  const { data: tocadas, error } = await supabase.from("comentarios")
    .update(upd).eq("id", comentarioId).select("id");
  if (error) return { error: error.message };
  if (!tocadas?.length) return { error: "No se pudo guardar: el permiso de la base lo rechazó." };

  const c: any = com;
  if (c.objeto_id) revalidatePath(`/objeto/${c.objeto_id}`);
  else if (c.equipamiento_id) revalidatePath(`/entidad/equipamiento/${c.equipamiento_id}`);
  else if (c.postulacion_id) revalidatePath(`/entidad/postulacion/${c.postulacion_id}`);
  else if (c.movimiento_caja_id) revalidatePath("/caja");
  else if (c.publicacion_id || pubId) revalidatePath(`/caso/${c.publicacion_id || pubId}`);
  /* Las cinco de la rendición viven en la pantalla de SU fondo, y el
     comentario no sabe cuál es: hay que preguntárselo a la fila. Una consulta
     de más al editar, a cambio de que el resto del equipo vea el cambio sin
     recargar. */
  for (const [col, tabla] of [["comprobante_id","comprobante"],["estado_cuenta_id","estado_cuenta"],
       ["rhe_id","rhe"],["gasto_dj_id","gasto_dj"],["movimiento_banco_id","movimiento_banco"]] as const) {
    if (!c[col]) continue;
    const { data: fila } = await supabase.from(tabla).select("postulacion_id").eq("id", c[col]).maybeSingle();
    if ((fila as any)?.postulacion_id) revalidatePath(`/fondo/${(fila as any).postulacion_id}`);
  }
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

/* ── UNA CUENTA DE CORREO PARA LA CASILLA DAFO ──
 *
 * La casilla vincula un correo a su postulación por dos vías: el código en el
 * asunto, y —cuando no viene— la CUENTA que lo recibió. Esa segunda vía
 * necesita saber de qué empresa es cada Gmail, y ese dato ya vive en
 * `credenciales`: cada cuenta colgada de su empresa. Una tabla nueva sería el
 * mismo dato en dos sitios, y el día que se contradigan nadie sabrá cuál vale.
 *
 * Así que esto no inventa nada: escribe una credencial de Gmail, igual que si
 * se hubiera registrado desde la ficha de la empresa. Lo único que añade es la
 * puerta —poder darlas de alta desde donde se nota que faltan— y el rechazo de
 * duplicados: dos filas con el mismo correo y empresas distintas harían que la
 * vía de la cuenta apunte a una u otra según el orden en que vuelvan.
 */
export async function registrarCuentaDafo(email: string, empresaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const correo = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: "Eso no parece un correo." };
  if (!empresaId) return { error: "Falta decir de qué empresa es la cuenta." };

  /* Ya registrada: se dice CON QUIÉN está, no un «ya existe» a secas. Quien
     intenta darla de alta dos veces normalmente cree que está en otra
     empresa, y esa es la información que resuelve la duda. */
  const { data: yaRaw } = await supabase.from("credenciales")
    .select("id,empresa_id,emp:empresas(nombre)").ilike("identificador", correo);
  const ya = (yaRaw || []).find((r: any) => r.empresa_id);
  if (ya) {
    const e = Array.isArray((ya as any).emp) ? (ya as any).emp[0] : (ya as any).emp;
    return ya.empresa_id === empresaId
      ? { error: `«${correo}» ya estaba registrada en ${e?.nombre || "esa empresa"}.` }
      : { error: `«${correo}» ya está registrada en ${e?.nombre || "otra empresa"}. Cámbiala desde la ficha de esa empresa antes de moverla.` };
  }

  const { error } = await supabase.from("credenciales").insert({
    empresa_id: empresaId,
    plataforma: "Gmail",
    identificador: correo,
    actualizado_en: hoyLima(),
  });
  if (error) return { error: error.message };

  await supabase.from("actividad").insert({
    entidad_tipo: "empresa", entidad_id: empresaId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `conectó la cuenta «${correo}» a la casilla DAFO` },
  });
  revalidatePath("/casilla");
  revalidatePath(`/entidad/empresa/${empresaId}`);
  return {};
}

/* La baja, gemela del alta y por el mismo motivo: la cuenta equivocada se
 * descubre MIRANDO la casilla —«a esta postulación no le llega por ahí»— y
 * mandar a buscar la ficha de la empresa desde ahí perdía el hallazgo por el
 * camino. Borra la credencial, igual que el ✕ de la ficha.
 *
 * Se pide el correo además del id, y no por comodidad: es lo que se escribe en
 * Actividad. «Borró la credencial Gmail» no dice CUÁL, y el día que alguien
 * quite la buena por error, el rastro tiene que servir para reponerla.
 */
export async function quitarCuentaDafo(id: string, empresaId: string, correo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  /* `.select()` detrás del delete, y no por gusto: cuando RLS no deja borrar
     una fila NO la rechaza, la esconde. El delete corre contra cero filas
     visibles, borra cero y la base responde «todo bien». Sin pedir de vuelta lo
     borrado, esto devolvía éxito y el botón se pintaba como si hubiera
     funcionado — con la cuenta intacta al recargar. Un fallo que se disfraza de
     acierto es el peor de todos: nadie lo va a reportar como error. */
  const { data: borradas, error } = await supabase.from("credenciales")
    .delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!borradas?.length) {
    return { error: "No se borró nada. Suele faltar la política de borrado: corre db/credenciales-borrar.sql en Supabase." };
  }

  await supabase.from("actividad").insert({
    entidad_tipo: "empresa", entidad_id: empresaId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `desconectó la cuenta «${correo}» de la casilla DAFO` },
  });
  revalidatePath("/casilla");
  revalidatePath(`/entidad/empresa/${empresaId}`);
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
  /* Mismo cinturón que en quitarCuentaDafo: sin `.select()`, un borrado que RLS
     no permite se lee como un borrado hecho. Este ✕ tenía el mismo agujero. */
  const { data: borradas, error } = await supabase.from("credenciales")
    .delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!borradas?.length) {
    return { error: "No se borró nada. Suele faltar la política de borrado: corre db/credenciales-borrar.sql en Supabase." };
  }
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
  /* Y /llaves, que lee estos mismos datos al revés («este número, qué abre»).
     Sin esto, registrar la llave desde allí dejaba la cuenta en «sin llave»
     hasta la siguiente recarga completa — o sea, el trabajo hecho y la
     pantalla diciendo que falta. */
  revalidatePath("/llaves");
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

/* ── CORREGIR A QUIÉN SE PUSO, SIN BORRAR LA FILA ──
 *
 * El cargo ya se podía cambiar; la persona no. Para arreglar un «lo puse en el
 * de al lado» había que quitar la fila y volver a crearla — y eso no es
 * equivalente: se pierde el `desde` (cuándo se sumó al proyecto) y la bitácora
 * queda contando una baja y un alta que nunca pasaron. Un error de dedo no
 * debería producir historia falsa.
 */
export async function cambiarPersonaProyecto(id: string, proyectoId: string, personaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!personaId) return { error: "Elige a quién va la fila." };

  /* Quién estaba y quién entra, en una sola tanda: la bitácora necesita los dos
     nombres y ninguno depende del otro. */
  const [{ data: prev }, { data: nueva }] = await Promise.all([
    supabase.from("proyecto_equipo")
      .select("cargo,persona_id,per:personas(nombre,alias)").eq("id", id).maybeSingle(),
    supabase.from("personas").select("nombre,alias").eq("id", personaId).maybeSingle(),
  ]);
  if (!prev) return { error: "Esa fila ya no está." };
  if ((prev as any).persona_id === personaId) return {};   // nada que cambiar

  const { data: post, error } = await supabase.from("proyecto_equipo")
    .update({ persona_id: personaId }).eq("id", id).select("id");
  if (error) {
    /* El duplicado aquí tiene un significado concreto y el mensaje de Postgres
       no lo dice: esa persona ya figura con ese mismo cargo. */
    return { error: /duplicate key/i.test(error.message)
      ? "Esa persona ya está en el equipo con ese mismo cargo."
      : error.message };
  }
  if (!post?.length) return { error: "No se guardó: no tienes permiso." };

  const antes = (prev.per as any)?.alias || (prev.per as any)?.nombre || "alguien";
  const ahora = (nueva as any)?.alias || (nueva as any)?.nombre || "otra persona";
  await supabase.from("actividad").insert({
    entidad_tipo: "proyecto", entidad_id: proyectoId, actor_id: user.id, tipo: "miembro",
    detalle: {
      mensaje: `cambió ${prev.cargo || "un cargo"}: de ${antes} a ${ahora}`,
      cambios: [{ campo: prev.cargo || "cargo", de: antes, a: ahora }],
    },
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

/* ── CAMBIAR EL ROL SIN DESHACER LA FILA ──
 *
 * Hasta ahora corregir un cargo era quitar a la persona y volver a sumarla, y
 * eso NO es lo mismo: la fila lleva colgado el `cv_url` —el CV preparado para
 * ESTA postulación y ESTE cargo— y el precontrato apunta a ella. Al borrarla
 * se iban los dos, y la única señal era que un chip verde volvía a decir «sin
 * CV». Nadie relaciona eso con haber corregido una errata en el cargo.
 *
 * Y en la bitácora quedaba «quitó a Narda» + «sumó a Narda», que se lee como
 * una baja y una alta —dos hechos que no ocurrieron— en vez de lo que pasó:
 * una corrección. Ante DAFO, un equipo que entra y sale el mismo día es una
 * pregunta; un cargo corregido no lo es.
 *
 * El CV NO se toca al cambiar el cargo, y es una decisión, no un olvido: un CV
 * se prepara para un concurso, no para un puesto, y casi siempre sigue
 * sirviendo. Si de verdad ya no vale, quitarlo es un clic y lo decide quien
 * sabe qué dice ese documento.
 */
export async function cambiarRolPostulacion(id: string, postulacionId: string, rol: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const cargoOk = (rol || "").trim();
  if (!cargoOk) return { error: "El cargo no puede quedar vacío." };

  const { data: prev } = await supabase.from("postulacion_equipo")
    .select("cargo,per:personas(nombre,alias)").eq("id", id).maybeSingle();
  if (!prev) return { error: "Esa persona ya no está en el equipo." };
  if ((prev.cargo || "") === cargoOk) return {};   // nada que cambiar, nada que anotar

  /* `.select()` como en el resto: una política de RLS que tape la fila
     devolvería éxito con cero filas cambiadas y la pantalla diría «guardado». */
  const { data: hechas, error } = await supabase.from("postulacion_equipo")
    .update({ cargo: cargoOk }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!hechas?.length) return { error: "No se guardó: no tienes permiso sobre esta postulación." };

  const quien = (prev.per as any)?.alias || (prev.per as any)?.nombre || "alguien";
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "miembro",
    /* Los DOS cargos, el viejo y el nuevo. Un «cambió el cargo de Narda» sin el
       de antes obliga a reconstruir a mano qué era para entender qué cambió. */
    detalle: { mensaje: `cambió el cargo de ${quien}: «${prev.cargo || "—"}» → «${cargoOk}»` },
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
  /* ── LA VENTANA, TAMBIÉN AL CREAR ──
     `editarActividadCrono` y `cambiarFechaActividad` ya lo comprobaban; esta,
     que es por donde NACEN, no. Daba igual mientras la actividad solo se
     dibujara en el cronograma —una barra al revés se ve—, pero ahora esa
     ventana VIAJA al caso que la materializa, y allí choca contra el check
     `publicaciones_ventana_ok`: la acción de materializar contestaría con un
     error de Postgres en crudo y el bot de la mañana se caería entero, con él
     los avisos y el mensaje al Chat.
     Se ataja donde se escribe el dato, que es donde se puede explicar. */
  if (d.fin && d.fin < d.ini) {
    return { error: "La actividad no puede terminar antes de empezar." };
  }
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
    /* ── LA VENTANA VIAJA, YA NO SE PIERDE ──
       La actividad del cronograma tiene inicio y fin; al materializarla, el
       fin se convertía en la fecha límite y el INICIO se tiraba: sobrevivía
       como prosa en el cuerpo («Ventana planificada: … → …»), que no la lee
       ninguna pantalla. El caso de un rodaje planificado para agosto nacía
       dibujándose desde el día en que el bot lo abrió.
       Un hito no lleva inicio a propósito: es una fecha, no un tramo. */
    fecha_inicio: esHito ? null : (act.fecha_inicio || null),
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

/* ── LOS COMPROMISOS DEL ACTA ──
   Marcar un entregable, guardar su prueba y anotar. El TEXTO del extracto
   también se puede corregir: se leyó de un escaneo por OCR y una tilde mal
   puesta no debería obligar a volver al SQL. Lo que no se toca desde aquí es la
   cláusula — si el número cambia, ya no es la misma cita.
   Requiere db/compromiso-acta.sql. */

export async function marcarCompromiso(
  id: string, postulacionId: string, estado: string, url: string, nota: string,
  entregadoEn: string | null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!ESTADOS_COMP.includes(estado as any)) return { error: "Ese estado no existe." };

  const { data: prev } = await supabase.from("compromiso_acta")
    .select("clausula,titulo,estado").eq("id", id).maybeSingle();
  if (!prev) return { error: "Ese compromiso ya no está." };

  const { data: hechas, error } = await supabase.from("compromiso_acta").update({
    estado,
    url: (url || "").trim() || null,
    nota: (nota || "").trim() || null,
    /* La fecha de entrega se pone sola al marcar «entregado» si no se dio una:
       obligar a teclearla es el paso que hace que quede en blanco, y una
       entrega sin fecha no sirve para defender un plazo. Al desmarcar se
       limpia: guardar una fecha de entrega en algo que no está entregado es
       dejar una contradicción a la vista de quien audite. */
    entregado_en: estado === "entregado" ? (entregadoEn || hoyLima()) : null,
  }).eq("id", id).select("id");
  if (error) {
    return { error: /compromiso_acta/.test(error.message)
      ? "Falta correr db/compromiso-acta.sql en Supabase." : error.message };
  }
  if (!hechas?.length) return { error: "No se guardó: no tienes permiso sobre este fondo." };

  if (prev.estado !== estado) {
    await supabase.from("actividad").insert({
      entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "dato",
      detalle: { mensaje: `acta ${prev.clausula || ""} «${prev.titulo}»: ${prev.estado} → ${estado}`.trim() },
    });
  }
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

/* ── DE UNA CLÁUSULA A UN CASO ──
 *
 * Un entregable NO es una tarea. Es una obligación del acta: existe y sigue
 * pendiente aunque nadie se ocupe de ella. Una tarea es la decisión de que
 * alguien se ocupe AHORA, con responsable y plazo — y eso lo decide una
 * persona, no el sistema al importar el acta. Por eso el caso no se crea solo:
 * hay treinta compromisos, y abrir treinta casos el primer día llenaría el
 * tablero de trabajo que nadie prometió hacer esta semana.
 *
 * Lo que sí hace falta es que abrirlo cueste un clic y llegue con contexto: el
 * caso nace con la cláusula en el título, el extracto en el cuerpo y vinculado
 * a la postulación, así que aparece en su ficha y en el tablero sin teclear
 * nada. Es el mismo camino que la Casilla DAFO (`casoDeComunicacion`).
 */
export async function casoDeCompromiso(id: string, postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: c, error: eC } = await supabase.from("compromiso_acta")
    .select("clase,clausula,titulo,detalle,fecha_limite,caso_id," +
            "post:postulaciones(codigo,codigo_acta,proy:proyectos(nombre))")
    .eq("id", id).maybeSingle();
  if (eC) {
    return { error: /compromiso_acta|caso_id/.test(eC.message)
      ? "Falta correr db/compromiso-acta.sql en Supabase (columna caso_id)." : eC.message };
  }
  if (!c) return { error: "Ese compromiso ya no está." };

  /* ¿Ya hay caso, y sigue VIVO? Uno archivado o descartado no cuenta: el
     compromiso quedaría atado para siempre a algo que no aparece en ningún
     tablero, y el botón no ofrecería abrir otro. Misma regla que la casilla. */
  const ya = (c as any).caso_id as string | null;
  if (ya) {
    const { data: vive } = await supabase.from("publicaciones")
      .select("id").eq("id", ya)
      .is("archivado_en", null).neq("estado", "descartada").maybeSingle();
    if (vive) return { id: ya, ya: true };
  }

  const post: any = Array.isArray((c as any).post) ? (c as any).post[0] : (c as any).post;
  const quien = post
    ? `${post.codigo || "🎯"}${post.proy?.nombre ? ` · ${post.proy.nombre}` : ""}`
    : "fondo";
  const cl = (c as any).clausula ? `${(c as any).clausula} ` : "";

  const { data: pub, error } = await supabase.from("publicaciones").insert({
    tipo: "tarea", estado: "abierta", autor_id: user.id,
    /* La cláusula va en el TÍTULO y no solo en el cuerpo: en un tablero de
       cuarenta casos, «Ficha técnica de la obra» no dice de qué fondo ni de
       qué obligación sale, y el número es lo que permite volver al acta desde
       el propio caso. */
    titulo: `📦 ${cl}${(c as any).titulo} — ${quien}`.slice(0, 200),
    /* La fecha del acta se hereda como plazo del caso. Es la única fecha con
       consecuencias: un caso sin plazo sobre un entregable con plazo pierde
       justo el dato por el que se abrió. */
    ...((c as any).fecha_limite ? { fecha_limite: (c as any).fecha_limite } : {}),
    cuerpo: [
      `Compromiso del acta ${post?.codigo_acta || ""}`.trim() +
        ((c as any).clausula ? `, cláusula ${(c as any).clausula}.` : "."),
      "",
      String((c as any).detalle || "").slice(0, 1200),
      "",
      "— Abierto desde 📦 Entregables del fondo. El texto de arriba es el extracto del acta: si hay duda, manda el PDF.",
    ].filter(Boolean).join("\n"),
  }).select("id").single();
  if (error || !pub) return { error: error?.message || "No se pudo crear el caso." };

  await supabase.from("publicacion_vinculos").insert({
    publicacion_id: pub.id, entidad_tipo: "postulacion", entidad_id: postulacionId,
  });
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "tarea",
    detalle: { mensaje: `abrió un caso desde el acta ${cl}«${(c as any).titulo}»`.trim() },
  });

  /* Se anota en el compromiso. Si esto falla el caso YA existe, así que se
     devuelve su id igual y se dice qué pasó: callarlo dejaría al botón
     ofreciendo abrir otro caso sobre lo mismo. */
  const { error: eLink } = await supabase.from("compromiso_acta")
    .update({ caso_id: pub.id }).eq("id", id);

  revalidatePath(`/fondo/${postulacionId}`);
  revalidatePath("/");
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  if (eLink) return { id: pub.id as string, error: "Caso creado, pero no quedó anotado en el compromiso: " + eLink.message };
  return { id: pub.id as string };
}

export async function editarDetalleCompromiso(
  id: string, postulacionId: string, titulo: string, detalle: string, fechaLimite: string | null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const t = (titulo || "").trim();
  if (!t) return { error: "El título no puede quedar vacío." };

  const { data: hechas, error } = await supabase.from("compromiso_acta").update({
    titulo: t,
    detalle: (detalle || "").trim() || null,
    fecha_limite: (fechaLimite || "").trim() || null,
  }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!hechas?.length) return { error: "No se guardó: no tienes permiso, o la fila ya no está." };
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

/* ═══════════════════════════════════════════════════════════════════
   EL PERSONAL DE UN FONDO EN EJECUCIÓN
   ═══════════════════════════════════════════════════════════════════
   Solo se guarda lo que NO se puede deducir: a quién se piensa convocar.
   Quien ya tiene recibo girado sale solo de `rhe` (ver lib/equipoFondo.ts),
   y por eso estas acciones no lo tocan — copiar un hecho a una segunda lista
   es fabricar la primera contradicción.
   Requiere db/equipo-fondo.sql. */

export async function sumarPersonalFondo(
  postulacionId: string, personaId: string, cargo: string, nota: string,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!postulacionId || !personaId) return { error: "Falta el fondo o la persona." };

  const { error } = await supabase.from("equipo_fondo").insert({
    postulacion_id: postulacionId, persona_id: personaId,
    cargo: (cargo || "").trim() || null,
    nota: (nota || "").trim() || null,
    creado_por: user.id,
  });
  if (error) {
    /* El unique de (fondo, persona) no es un fallo del usuario: es que esa
       persona ya está en la lista, y decirlo así ahorra ir a buscarla. */
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: "Esa persona ya está en el equipo de este fondo." };
    }
    if (/equipo_fondo/.test(error.message)) {
      return { error: "Falta correr db/equipo-fondo.sql en Supabase." };
    }
    return { error: error.message };
  }

  const { data: per } = await supabase.from("personas")
    .select("nombre,alias").eq("id", personaId).maybeSingle();
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "miembro",
    detalle: { mensaje: `sumó a ${per?.alias || per?.nombre || "alguien"} al personal del fondo${cargo?.trim() ? ` como ${cargo.trim()}` : ""}` },
  });
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

export async function editarPersonalFondo(
  id: string, postulacionId: string, cargo: string, nota: string,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!id) return { error: "Falta la fila." };

  /* `.select()` como en el resto: con una política de RLS que tape la fila,
     PostgREST devuelve éxito con cero filas y la pantalla diría «guardado». */
  const { data: hechas, error } = await supabase.from("equipo_fondo")
    .update({ cargo: (cargo || "").trim() || null, nota: (nota || "").trim() || null })
    .eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!hechas?.length) return { error: "No se guardó: no tienes permiso, o la fila ya no está." };
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

export async function quitarPersonalFondo(id: string, postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  /* Se lee ANTES de borrar: después ya no hay a quién nombrar en la bitácora,
     y «quitó a alguien» no sirve de nada dentro de un año. */
  const { data: prev } = await supabase.from("equipo_fondo")
    .select("cargo,per:personas(nombre,alias)").eq("id", id).maybeSingle();

  const { data: fuera, error } = await supabase.from("equipo_fondo")
    .delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!fuera?.length) return { error: "No se quitó: no tienes permiso, o ya no estaba." };

  const quien = (prev?.per as any)?.alias || (prev?.per as any)?.nombre || "alguien";
  await supabase.from("actividad").insert({
    entidad_tipo: "postulacion", entidad_id: postulacionId, actor_id: user.id, tipo: "miembro",
    /* Se dice que los recibos NO se van con ella: quitar de una lista de
       previsión no deshace un pago, y confundir las dos cosas en la bitácora
       sería sembrar una duda que costaría media auditoría aclarar. */
    detalle: { mensaje: `quitó a ${quien} del personal previsto del fondo${prev?.cargo ? ` (${prev.cargo})` : ""} — sus recibos, si los tiene, siguen` },
  });
  revalidatePath(`/fondo/${postulacionId}`);
  return {};
}

/* ── PONER LA SUBCATEGORÍA SIN ABRIR LA FICHA ──
 *
 * Hay cincuenta y ocho equipos sin subcategoría. Arreglarlos uno a uno es
 * entrar a la ficha, pulsar Editar, buscar el campo entre doce, elegir,
 * guardar y volver a la lista — que ya no está donde estaba. Seis pasos por
 * equipo, trescientos cuarenta y ocho en total, y por eso llevan meses así.
 *
 * No es `guardarEntidad`: aquella exige el formulario entero —«nombre» es
 * obligatorio— y llamarla con un solo campo devolvería «El campo Nombre es
 * obligatorio» sobre un equipo que sí tiene nombre.
 *
 * La subcategoría se valida contra el catálogo de SU categoría. Eso no es
 * burocracia: la lista se llena de «Panel LED», «panel led» y «Panel de luz
 * LED» en cuanto se puede escribir libre, y entonces filtrar por subcategoría
 * deja de servir — que es lo único para lo que existe el campo. Escribir una
 * fuera del catálogo sigue siendo posible desde la ficha, que es donde uno se
 * toma el tiempo de decidirlo.
 */
export async function fijarSubcategoria(equipoId: string, sub: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const s = String(sub || "").trim();
  if (!s) return { error: "Elige una subcategoría." };

  const { data: eq, error: eErr } = await supabase.from("equipamiento")
    .select("categoria,subcategoria,nombre").eq("id", equipoId).maybeSingle();
  if (eErr) return { error: eErr.message };
  if (!eq) return { error: "Ese equipo ya no está." };

  const cat = String(eq.categoria || "").trim().toLowerCase();
  const catalogo = SUBCATS_EQUIPO[cat] || [];
  if (!catalogo.length) {
    return { error: `«${eq.categoria || "sin categoría"}» no tiene lista de subcategorías. Ponla desde la ficha.` };
  }
  if (!catalogo.includes(s)) {
    return { error: `«${s}» no está en la lista de ${cat}. Si de verdad hace falta, escríbela desde la ficha.` };
  }

  /* El `.select()` es el cinturón de siempre: si una política de RLS tapara la
     fila, PostgREST devolvería éxito con cero filas actualizadas y la pantalla
     diría «guardado» sobre algo que no se guardó. */
  const { data: hechas, error } = await supabase.from("equipamiento")
    .update({ subcategoria: s }).eq("id", equipoId).select("id");
  if (error) return { error: error.message };
  if (!hechas?.length) return { error: "No se guardó: no tienes permiso sobre este equipo." };

  await supabase.from("actividad").insert({
    entidad_tipo: "equipamiento", entidad_id: equipoId, tipo: "edicion", actor_id: user.id,
    detalle: {
      mensaje: eq.subcategoria
        ? `cambió la subcategoría: «${eq.subcategoria}» → «${s}»`
        : `puso la subcategoría: «${s}»`,
    },
  });
  revalidatePath("/equipamiento");
  revalidatePath(`/entidad/equipamiento/${equipoId}`);
  return {};
}

/* Ronda de comprobación: "vi este equipo hoy, existe y está bien" */
export async function comprobarEquipo(equipoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  /* ── EL SELLO NO SE PONE SOBRE CUALQUIER ESTADO ──
     «Visto» afirma que el equipo existe y está conforme, y sobre un perdido o
     un «no aparece» eso es falso por definición. La pantalla ya no ofrece el
     botón, pero esconderlo no es impedirlo: una pestaña abierta desde antes del
     cambio de estado, o una llamada directa, seguirían escribiendo «visto hoy»
     junto a «Perdido» — una contradicción que nadie escribió a propósito y que
     habría que deshacer a mano el día de la auditoría.
     Y se DICE qué hacer en su lugar, que es la buena noticia: si apareció,
     cámbiale el estado. */
  const { data: eq, error: eErr } = await supabase.from("equipamiento")
    .select("estado").eq("id", equipoId).maybeSingle();
  if (eErr) return { error: eErr.message };
  if (!eq) return { error: "Ese equipo ya no está." };
  if (!enRonda(eq.estado)) {
    return { error: `No se puede marcar como visto: está «${txtEstadoEq(eq.estado)}». Si apareció, cámbiale el estado.` };
  }

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

export async function crearKit(nombre: string, uso: string, descripcion: string, equipoIds: string[],
  /** Qué pieza representa al kit. Se elige al armarlo porque es cuando se
   *  tienen las piezas delante; si no se elige, manda la regla automática. */
  portadaId?: string | null) {
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

  /* La cara del kit, si se eligió al armarlo. Va DESPUÉS de meter las piezas
     porque `fijarPortadaKit` comprueba que la pieza esté dentro: al revés, la
     comprobación fallaría sobre un kit todavía vacío.
     Y si falla no se deshace nada: el kit existe y sus piezas están, que es lo
     que costaba trabajo. Se dice, y se elige la cara desde la lista. */
  if (portadaId) {
    const rp = await fijarPortadaKit(kit.id, portadaId);
    if (rp?.error) return { id: kit.id, n: (equipoIds || []).length, aviso: `El kit se creó, pero la portada no: ${rp.error}` };
  }

  revalidatePath("/equipamiento");
  return { id: kit.id, n: (equipoIds || []).length };
}

/* ── QUÉ PIEZA ES LA CARA DEL KIT ──
 *
 * El «Kit Zhiyun Molus G60» salía con la foto de un trípode: la cara era «la
 * primera pieza que tenga foto» y las piezas van por folio —A-028 antes que
 * A-031—. Deducir la portada del orden mezcla dos cosas que no son la misma:
 * el orden sirve para CONTAR contra la bolsa (y por eso manda el folio), la
 * portada sirve para RECONOCER el kit en una lista de veinte.
 *
 * `equipoId` nulo devuelve el kit a la regla automática, que es una decisión
 * válida y tiene que poder deshacerse.
 */
export async function fijarPortadaKit(kitId: string, equipoId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!kitId) return { error: "Falta el kit." };

  /* Una portada que no está en el kit sería una foto de algo que no sale con
     él: se comprueba aquí y no solo en la pantalla, porque la pieza puede
     haberse quitado del kit en otra pestaña entre que se abrió la lista y se
     pulsó la estrella. */
  if (equipoId) {
    const { data: dentro, error: e0 } = await supabase.from("kit_equipos")
      .select("id").eq("kit_id", kitId).eq("equipamiento_id", equipoId).maybeSingle();
    if (e0) return { error: e0.message };
    if (!dentro) return { error: "Esa pieza ya no está en el kit." };
  }

  /* `.select()`: sin él, una política de RLS que tape la fila devolvería éxito
     con cero filas cambiadas y la estrella se pintaría sobre nada. */
  const { data: hechas, error } = await supabase.from("kits")
    .update({ portada_equipo_id: equipoId }).eq("id", kitId).select("id");
  if (error) {
    /* El caso más probable la primera vez: falta correr db/kit-portada.sql. Un
       «column does not exist» no le dice nada a quien pulsa una estrella. */
    return { error: /portada_equipo_id/.test(error.message)
      ? "Falta correr db/kit-portada.sql en la base de datos."
      : error.message };
  }
  if (!hechas?.length) return { error: "No se guardó: no tienes permiso sobre este kit." };

  revalidatePath("/equipamiento");
  return { ok: true };
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
  /* Se pide el id de vuelta: el aviso tiene que decir a QUÉ comentario lleva,
     no solo a qué ficha. */
  const { data: com, error } = await supabase.from("comentarios")
    .insert({ prestamo_id: prestamoId, autor_id: user.id, cuerpo: cuerpo || "📷", imagenes: imgs, etiquetas: tags, es_dano: esDano, responde_a: respondeA || null, fecha_evento: fechaEvento || null })
    .select("id").single();
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
  await avisarBitacoraEquipo(supabase, user.id, equipoId, cuerpo, esDano,
    { prestamo_id: prestamoId, comentario_id: (com as any)?.id }, respondeA);

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
  /* `destino` viaja entero al insert (`...destino`), así que el comentario
     entra por aquí: el aviso tiene que saber a QUÉ párrafo lleva, no solo a
     qué ficha. */
  destino: { prestamo_id?: string; equipamiento_id?: string; comentario_id?: string },
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
    await notificar(supabase, {
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
  const { data: com, error } = await supabase.from("comentarios")
    .insert({ equipamiento_id: equipoId, autor_id: user.id, cuerpo: cuerpo || "📷", imagenes: imgs, etiquetas: tags, es_dano: esDano, responde_a: respondeA || null, fecha_evento: fechaEvento || null })
    .select("id").single();
  if (error) {
    if (/equipamiento_id|fecha_evento/.test(error.message)) return { error: "Falta correr db/bitacora-equipo.sql en Supabase." };
    if (/etiquetas|es_dano/.test(error.message)) return { error: "Falta correr db/comentario-dano.sql en Supabase." };
    return { error: error.message };
  }
  if (esDano) {
    await supabase.from("equipamiento").update({ estado: "en_reparacion" }).eq("id", equipoId);
  }
  await avisarBitacoraEquipo(supabase, user.id, equipoId, cuerpo, esDano,
    { equipamiento_id: equipoId, comentario_id: (com as any)?.id }, respondeA);

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

  /* ── PARTIR UN CASO ES UN HECHO, Y NO SONABA ──
   * Esto dejaba rastro en `actividad` —que hay que ir a mirar— y ni un aviso.
   * Si eres responsable de un caso y alguien lo divide en doce tareas, tu
   * campanita no suena una sola vez: te enteras entrando, o no te enteras.
   *
   * Se avisa al autor y al responsable del PADRE, y también a las personas
   * vinculadas. Lo segundo se dejó fuera al principio con el argumento de que
   * heredar un vínculo no es un hecho nuevo —ya estabas vinculado al padre—, y
   * es verdad: el hecho nuevo no es el vínculo, es que el trabajo se partió.
   * Eso sí le importa a quien figura en él. La regla es la misma que en los
   * comentarios: vinculado = enterado.
   *
   * ── EL AVISO CUELGA DEL PADRE, NO DEL HIJO ──
   * Los sub-casos se crean en tandas: partir un caso son ocho o doce de un
   * tirón. Colgado del hijo, cada uno sería su propio destino y su propio
   * grupo — doce filas en la campanita por un solo gesto. Colgado del padre,
   * los doce comparten clave y se leen como uno: «Carlos · 12». Y el clic
   * lleva al sitio donde están los doce listados, que es lo que se quiere
   * mirar. */
  const { data: padre } = await supabase.from("publicaciones")
    .select("titulo,autor_id,responsable").eq("id", padreId).maybeSingle();
  if (padre) {
    const { data: miP } = await supabase.from("perfiles").select("nombre").eq("id", user.id).maybeSingle();
    const actorNombre = miP?.nombre || "Alguien";
    /* El título entre « » es el del PADRE, y a propósito: `tituloDe` se queda
       con el primer par de comillas y es lo único que la campanita pinta.
       Agrupados doce avisos, enseñar el título del último hijo junto a un
       «· 12» no diría de qué caso se está hablando. El del hijo va detrás,
       para el aviso suelto. */
    const mensaje = `${actorNombre.split(" ")[0]} dividió «${padre.titulo}» — nuevo sub-caso: ${titulo.trim()}`;
    const avisados = new Set<string>();
    const dest = [...new Set([padre.autor_id, padre.responsable])]
      .filter((d: any): d is string => !!d && d !== user.id);
    dest.forEach(d => avisados.add(d));
    if (dest.length) await notificar(supabase, dest.map(d => ({
      usuario_id: d, publicacion_id: padreId, tipo: "subcaso",
      actor_nombre: actorNombre, mensaje,
    })));
    /* Los vínculos se leen del PADRE y no del hijo: son los mismos —el hijo
       acaba de heredarlos— pero el padre los tiene desde siempre, así que el
       aviso no depende de que el `insert` de la herencia haya ido bien. Si
       falla, se pierde el vínculo del hijo, no el aviso. */
    await avisarVinculados(supabase, {
      pubId: padreId, actorId: user.id, actorNombre,
      tipo: "subcaso", mensaje, avisados,
    });
  }
  revalidatePath(`/caso/${padreId}`);
  revalidatePath("/");
  return { id: hijo.id };
}

/* ===== REACCIONES: los famosos "me gusta" =====
   Toggle por usuario: mismo emoji dos veces = quitar.

   ── LA LISTA QUE VALIDA ES LA MISMA QUE LA QUE SE OFRECE ──
   Aquí había una copia de los once emojis. Idéntica, sí, pero copia: el día
   que se añadiera uno a la paleta, el botón lo ofrecería y esto respondería
   «Reacción no permitida» — un fallo que se ve al tocar, no al escribir.
   El servidor sigue validando (el cliente elige lo que quiere mandar), pero
   valida contra la MISMA lista —`EMOJIS_REACCION`, importada arriba de
   lib/reacciones—, no contra su recuerdo de ella. */
export async function toggleReaccion(
  pubId: string | null, comentarioId: string | null, emoji: string,
  objetoId?: string | null, postulacionId?: string | null, movCajaId?: string | null,
  /* ── LAS CINCO DE LA RENDICIÓN VIAJAN JUNTAS ──
     Podrían ser cinco parámetros más y esta firma tendría once posiciones.
     Once posiciones opcionales es una firma que nadie lee: se llama mal y el
     error aparece en otra pantalla, semanas después. Van como un solo objeto
     porque son un solo concepto — «una fila de la rendición». */
  rendicion?: { tabla: string; id: string } | null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!EMOJIS_REACCION.includes(emoji)) return { error: "Reacción no permitida." };
  if (rendicion && !esTablaRendicion(rendicion.tabla))
    return { error: "No sé a qué se está reaccionando." };
  const metaR = rendicion ? META_RENDICION[rendicion.tabla as TablaRendicion] : null;

  let q = supabase.from("reacciones").select("id")
    .eq("usuario_id", user.id).eq("emoji", emoji);
  /* Un comentario (del repositorio o de una postulación) no cuelga de una
     publicación —`pubId` es null—, pero la reacción se guarda igual contra
     `comentario_id`. Además, una postulación puede recibir reacciones sobre sí
     misma (`postulacion_id`, sin comentario). El toggle busca por comentario si
     lo hay; si no, por postulación; si no, por publicación. */
  q = comentarioId ? q.eq("comentario_id", comentarioId)
    : postulacionId ? q.eq("postulacion_id", postulacionId).is("comentario_id", null)
    : movCajaId ? q.eq("movimiento_caja_id", movCajaId).is("comentario_id", null)
    : metaR ? q.eq(metaR.col, rendicion!.id).is("comentario_id", null)
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
      movimiento_caja_id: comentarioId ? null : (movCajaId ?? null),
      ...(metaR && !comentarioId ? { [metaR.col]: rendicion!.id } : {}),
      usuario_id: user.id, emoji,
    });
    if (error) {
      return {
        error: /movimiento_caja_id/.test(error.message)
          ? "Falta correr db/movcaja-comentarios.sql en Supabase."
          : metaR && new RegExp(metaR.col).test(error.message)
          ? `Falta correr ${metaR.migracion} en Supabase.`
          /* El duplicado aquí NO es que ya reaccionaras: eso lo resuelve el
             toggle de arriba. Es el índice único sin rehacer, que trata dos
             facturas distintas como la misma. El error de Postgres no lo
             dice; este sí. */
          : metaR && /duplicate key|uq_reacciones_dueno/i.test(error.message)
          ? `El índice único de reacciones está sin rehacer: corre ${metaR.migracion}.`
          : error.message,
      };
    }
  }
  revalidatePath("/");
  // La reacción vive donde vive el comentario: caso, objeto o postulación.
  if (objetoId) revalidatePath(`/objeto/${objetoId}`);
  else if (postulacionId) revalidatePath(`/entidad/postulacion/${postulacionId}`);
  else if (movCajaId) revalidatePath("/caja");
  else if (metaR) {
    /* El fondo al que pertenece la fila. Se pregunta a la propia fila en vez
       de pedírselo a quien llama: un id equivocado deja la pantalla sin
       refrescar y la reacción «no aparece» hasta recargar a mano. */
    const { data: fila } = await supabase.from(rendicion!.tabla)
      .select("postulacion_id").eq("id", rendicion!.id).maybeSingle();
    if ((fila as any)?.postulacion_id) revalidatePath(`/fondo/${(fila as any).postulacion_id}`);
  }
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

  /* 🔔 Al autor y al responsable. Dar por resuelto el caso de otro sin que se
     entere es la forma más barata de que algo quede sin hacer creyendo que se
     hizo — y era exactamente lo que pasaba. */
  {
    const { pub, actorNombre } = await casoYActor(supabase, pubId, user.id);
    if (pub) await avisarCambioCaso(supabase, {
      pubId, actorId: user.id, actorNombre, tipo: "cambio_estado",
      mensaje: `${actorNombre.split(" ")[0]} puso «${pub.titulo}» en ${rotuloEstado(estado, (pub as any).tipo)}`,
      interesados: [pub.autor_id, pub.responsable],
    });
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

/* ── LAS DOS PUNTAS DE LA VENTANA ──
   `cambiarFechaInicio` y `cambiarFechaLimite` son hermanas y se vigilan: cada
   una comprueba la ventana contra la OTRA punta antes de guardar. Sin eso, la
   forma más fácil de romper el orden no es poner mal el inicio —eso se ve—,
   sino adelantar el vencimiento de un caso que ya tenía inicio, que no se ve.
   El check de la base lo impediría, pero con un error de Postgres en crudo:
   aquí se contesta con una frase que dice qué hacer. */
export async function cambiarFechaInicio(pubId: string, fecha: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Acepta 'YYYY-MM-DD'; vacío = quitar la fecha
  const val = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
  const { data: antes } = await supabase.from("publicaciones")
    .select("fecha_inicio,fecha_limite").eq("id", pubId).single();
  if (val && antes?.fecha_limite && val > antes.fecha_limite) {
    return { error: "El inicio no puede ir después del vencimiento." };
  }
  /* `.select("id")` para VER lo que pasó: un UPDATE bloqueado por RLS no da
     error, devuelve cero filas. Sin mirarlo, la función diría «ok» y encima
     escribiría en la bitácora que alguien puso una fecha que no se guardó —una
     mentira firmada, que es peor que un fallo. */
  const { data: tocado, error } = await supabase.from("publicaciones")
    .update({ fecha_inicio: val }).eq("id", pubId).select("id");
  if (error) return { error: error.message };
  if (!tocado?.length) return { error: "No se pudo guardar (sin permiso o el caso ya no existe)." };
  if ((antes?.fecha_inicio || null) !== val) {
    const fmt = (d: string) => new Date(d + "T12:00:00")
      .toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" });
    await supabase.from("actividad").insert({
      entidad_tipo: "publicacion", entidad_id: pubId, actor_id: user.id, tipo: "edicion",
      detalle: { mensaje: val ? `puso el inicio en ${fmt(val)}` : "quitó la fecha de inicio" },
    });
    /* 🔔 Sin notificación, y es a propósito: mover el INICIO no mueve lo que
       hay que cumplir. Quien tiene el caso ya se entera al abrirlo, y un
       timbre por cada ajuste de calendario enseña a apagar el timbre. El
       cambio queda en la bitácora, que es donde se busca el «¿quién movió
       esto?». Mover el VENCIMIENTO sí suena: ver `cambiarFechaLimite`. */
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  revalidatePath("/tablero");
  revalidatePath("/agenda");
  return {};
}

/* La hora de lo que ocurre a una hora. Hermana de las dos fechas, con la
   misma forma: valida, escribe bitácora solo si cambió y no notifica —mover la
   hora de una reunión que ya está convocada es un ajuste, y un timbre por cada
   ajuste enseña a apagar el timbre—. */
export async function cambiarHora(pubId: string, hora: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // 'HH:MM' del <input type="time">; vacío = quitarla.
  const val = /^\d{2}:\d{2}$/.test(hora) ? hora : null;
  const { data: antes } = await supabase.from("publicaciones")
    .select("hora").eq("id", pubId).single();
  const { data: tocado, error } = await supabase.from("publicaciones")
    .update({ hora: val }).eq("id", pubId).select("id");
  if (error) return { error: error.message };
  if (!tocado?.length) return { error: "No se pudo guardar (sin permiso o el caso ya no existe)." };
  // La base devuelve 'HH:MM:SS'; se comparan los cinco primeros o cada guardado
  // parecería un cambio y la bitácora se llenaría de horas idénticas.
  if (String(antes?.hora || "").slice(0, 5) !== (val || "")) {
    await supabase.from("actividad").insert({
      entidad_tipo: "publicacion", entidad_id: pubId, actor_id: user.id, tipo: "edicion",
      detalle: { mensaje: val ? `puso la hora en ${val}` : "quitó la hora" },
    });
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  revalidatePath("/tablero");
  revalidatePath("/agenda");
  return {};
}

export async function cambiarFechaLimite(pubId: string, fecha: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Acepta 'YYYY-MM-DD'; vacío = quitar la fecha
  const val = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
  const { data: antes } = await supabase.from("publicaciones")
    .select("fecha_limite,fecha_inicio,hora").eq("id", pubId).single();
  // La otra punta de la ventana: adelantar el vencimiento por detrás del
  // inicio es el error que no se ve, porque se toca esta fecha mirando otra.
  if (val && antes?.fecha_inicio && val < antes.fecha_inicio) {
    return { error: "El vencimiento no puede ir antes del inicio del caso." };
  }
  /* ── QUITAR EL VENCIMIENTO SE LLEVA LA VENTANA ──
     Un caso con inicio y sin fin no es media ventana: es una que no se puede
     dibujar, y la agenda ni siquiera lo trae (pide `fecha_limite not null`).
     Se borran las dos y se DICE en la bitácora, en vez de dejar un
     `fecha_inicio` huérfano que nadie vuelve a ver ni entiende de dónde sale
     el día que reaparece un vencimiento. */
  /* La HORA cuelga de la fecha igual que el inicio: sin día, «10:00» no
     significa nada y la agenda ni siquiera trae la fila. Se va con ella. */
  const soltarVentana = !val && !!antes?.fecha_inicio;
  const { error } = await supabase.from("publicaciones")
    .update(val ? { fecha_limite: val }
      : { fecha_limite: null, fecha_inicio: null, hora: null })
    .eq("id", pubId);
  if (error) return { error: error.message };
  // 🗂 Bitácora
  if ((antes?.fecha_limite || null) !== val) {
    const fmt = (d: string) => new Date(d + "T12:00:00")
      .toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" });
    await supabase.from("actividad").insert({
      entidad_tipo: "publicacion", entidad_id: pubId, actor_id: user.id, tipo: "edicion",
      detalle: { mensaje: val ? `puso la fecha límite en ${fmt(val)}`
        : `quitó la fecha límite${soltarVentana && antes?.hora ? " (y con ella el inicio y la hora)"
            : soltarVentana ? " (y con ella el inicio)"
            : antes?.hora ? " (y con ella la hora)" : ""}` },
    });
    /* 🔔 Solo si CAMBIÓ —está dentro del mismo `if`—: guardar la misma fecha
       otra vez no es un hecho y no debe sonar. Mover el plazo sin decírselo a
       quien tiene que cumplirlo es la mitad de un plazo. */
    const { pub, actorNombre } = await casoYActor(supabase, pubId, user.id);
    if (pub) await avisarCambioCaso(supabase, {
      pubId, actorId: user.id, actorNombre, tipo: "cambio_plazo",
      mensaje: val
        ? `${actorNombre.split(" ")[0]} puso «${pub.titulo}» para el ${fmt(val)}`
        : `${actorNombre.split(" ")[0]} quitó la fecha límite de «${pub.titulo}»`,
      interesados: [pub.autor_id, pub.responsable],
    });
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  revalidatePath("/tablero");
  // La agenda vive de estas fechas y no se revalidaba: se cambiaba el plazo y
  // la línea de tiempo seguía enseñando el anterior hasta que caducara sola.
  revalidatePath("/agenda");
  return {};
}

// Notificaciones del usuario (con vínculos de entidad) para la campanita global.
// Trae las recientes de CADA tipo por separado (25 y 25), no 50 mezcladas: así
// la pestaña "Del Bot" del desplegable no queda con las pocas que se colaron.
/* ── ESTE NÚMERO NO ES «CUÁNTAS SE VEN» ──
   Son FILAS pedidas, y la campanita las AGRUPA antes de pintarlas: tres
   comentarios en el mismo caso son un solo renglón con un «3». Por eso con
   doce filas se veían once cosas, y subirlo a diecisiete habría dado unas
   doce o trece. La cuenta no es lineal y depende del día: una mañana en la
   que todos comentan el mismo caso encoge mucho más que una repartida.
   Veinticinco por pestaña deja el panel lleno incluso agrupando fuerte, y el
   panel hace scroll (70vh), así que sobrar no estorba — faltar sí: el «ver
   todas →» con sitio de sobra encima se lee como «esto es todo lo que hay».
   Sigue siendo por TIPO (25 y 25, no 50 mezcladas): si se pidieran juntas, un
   día ruidoso del bot dejaría la pestaña «Para ti» con las tres que se
   colaron. */
const CAMP_LIM = 25;
export async function misNotificaciones() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { items: [], sinLeer: 0, sinLeerBot: 0, faltan: [] };
  return notifsDe(supabase, user);
}

/** El cuerpo de la campanita, sin la puerta. Ver `bancoDe` para el porqué. */
async function notifsDe(supabase: any, user: { id: string }) {
  // `objeto_id`: una notificación puede colgar de un caso O de un objeto del
  // repositorio. Sin traerla, el aviso llega pero no lleva a ninguna parte.
  const cols = COLS_NOTIF;
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
  /* Qué columnas opcionales faltan. Se DEVUELVE, no solo se sortea: sin
     `dafo_id` los avisos de la casilla llegan sin destino y al pulsarlos no
     pasa nada — un fallo que no deja rastro en ningún log y que nadie va a
     arreglar porque nadie sabe que existe. */
  /* Se reintenta quitando SOLO lo que la base dijo que no tiene, y se vuelve a
     intentar por si falta más de una. Antes se quitaban las tres de golpe: con
     `comentario_id` sin migrar se renunciaba también a `dafo_id` —que sí
     estaba— y los avisos de la casilla llegaban sin destino. Una migración
     pendiente puede costar su función; no las de al lado. */
  let faltan: string[] = [];
  let quitadas: string[] = [];
  for (let i = 0; i < COLS_NUEVAS.length; i++) {
    const nuevas = [...new Set([
      ...columnasQueFaltan(r[0].error), ...columnasQueFaltan(r[1].error),
    ])].filter(c => !quitadas.includes(c));
    if (!nuevas.length) break;
    quitadas = [...quitadas, ...nuevas];
    faltan = quitadas;
    const c2 = sinEstas(cols, quitadas);
    const r2 = await Promise.all([tanda(c2, false), tanda(c2, true)]);
    pers = r2[0].data; bot = r2[1].data;
    if (!faltaAlguna(r2[0].error) && !faltaAlguna(r2[1].error)) break;
    r[0] = r2[0] as any; r[1] = r2[1] as any;
  }
  const items = await conVinculos(supabase, [...(pers || []), ...(bot || [])]);
  return { items, sinLeer: sinLeer || 0, sinLeerBot: sinLeerBot || 0, faltan };
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
  return muroDe(supabase, user);
}

/** El cuerpo del muro, sin la puerta. Ver `bancoDe` para el porqué. */
async function muroDe(supabase: any, user: { id: string }) {
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
    /* El mapa de tipo→tabla→campo vivía aquí, escrito a mano, y era el tercer
       lugar donde se declaraba lo mismo que ya dice `SECCIONES`. Ahora sale de
       `lib/vinculosPub`, que es también lo que usa la búsqueda global: si
       mañana se vincula una entidad nueva, la aprenden las dos a la vez o
       ninguna. Antes la habría aprendido una y la otra habría seguido pintando
       chips vacíos sin avisar. */
    const vincDeLib = await vinculosDePublicaciones(supabase, ids);
    vincDeLib.forEach((l, pubId) =>
      vincDe.set(pubId, conNombre(l).map(v => ({ tipo: v.tipo, nombre: v.nombre }))));
    /* El muro de una nota es su PRIMER vínculo — una nota nace en un muro y
       solo en uno. Se lee del mismo resultado, sin volver a preguntar. */
    esMuro.forEach(pubId => {
      const primero = vincDeLib.get(pubId)?.[0];
      if (primero) muroDe.set(pubId, { tipo: primero.tipo, id: primero.id });
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
  const COLS = COLS_NOTIF;
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
  let faltan: string[] = [];
  {
    /* Igual que en la campanita: se quita solo lo que la base nombró, no todo
       lo opcional. Ver el comentario de `sinEstas` en lib/notificaciones.ts. */
    let err: any = eNotifs;
    let quitadas: string[] = [];
    for (let i = 0; i < COLS_NUEVAS.length && faltaAlguna(err); i++) {
      const nuevas = columnasQueFaltan(err).filter(c => !quitadas.includes(c));
      if (!nuevas.length) break;
      quitadas = [...quitadas, ...nuevas];
      faltan = quitadas;
      const { data, error } = await consulta(sinEstas(COLS, quitadas))
        .order("creado_en", { ascending: false }).order("id", { ascending: false })
        .range(desde, desde + NOTIF_PAGINA - 1);
      notifs = data; err = error;
    }
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
    faltan,
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
  /* La lista de válidos era la tercera copia de lo mismo. Sale de lib/tipos, y
     de paso «archivo» deja de ser un destino posible: un caso ya guardado con
     ese tipo se puede cambiar A otra cosa, pero ninguno vuelve a serlo. */
  if (!esTipoCreable(tipo)) return { error: "Tipo no válido." };
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
    .select("id,titulo,cuerpo,tipo,estado,fecha_inicio,fecha_limite,hora,archivado_en,creado_en,autor_id,responsable," +
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
        await notificar(supabase, {
          usuario_id: pf.id, postulacion_id: postulacionId, comentario_id: com.id,
          tipo: "mencion", actor_nombre: actorNombre,
          mensaje: `🪄 ${actorNombre.split(" ")[0]} te mencionó en «${titulo}»`,
        });
      }
    }
  }

  /* Y a quien ya escribió aquí — ver `avisarAlHilo`. */
  await avisarAlHilo(supabase, {
    columna: "postulacion_id", dueno: postulacionId, comentarioId: com.id,
    actorId: user.id, actorNombre, titulo: `«${titulo}»`, avisados,
  });

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

/* ══════════════════════════════════════════════════════════════════
   📅 OBLIGACIONES PERIÓDICAS — las tareas que vuelven solas
   Ver db/obligaciones.sql (por qué tres tablas) y lib/obligaciones.ts (el
   catálogo y el semáforo). Aquí solo están las escrituras.
   ══════════════════════════════════════════════════════════════════ */

/* Un mensaje útil cuando la migración no está corrida. Sin esto, el error de
   PostgREST dice «relation "obligacion" does not exist», que en pantalla no
   significa nada para quien solo quería marcar una casilla. */
const faltaObl = (msg: string) =>
  /obligacion|vencimiento_oficial/.test(msg)
    ? "Falta correr db/obligaciones.sql en Supabase."
    : msg;

/** Dar de alta una obligación y generar sus periodos de una vez. Las dos cosas
 *  juntas a propósito: una obligación sin periodos no se ve en ninguna parte,
 *  así que dejar la generación para «luego» equivale a no haberla creado. */
export async function crearObligacion(datos: {
  entidadTipo?: string; entidadId: string; clase: string;
  responsable?: string | null; diasAviso?: number; desde?: string | null;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!datos.entidadId || !datos.clase) return { error: "Falta la empresa o la obligación." };
  const meta = claseDeObligacion(datos.clase);
  if (!meta) return { error: "Esa obligación no está en el catálogo." };

  const { data, error } = await supabase.from("obligacion").insert({
    entidad_tipo: datos.entidadTipo || "empresa",
    entidad_id: datos.entidadId,
    clase: datos.clase,
    periodicidad: meta.periodicidad,
    responsable: datos.responsable || null,
    dias_aviso: datos.diasAviso ?? DIAS_AVISO,
    desde: datos.desde || null,
    creado_por: user.id,
  }).select("id").maybeSingle();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: "Esa empresa ya tiene esta obligación." };
    }
    return { error: faltaObl(error.message) };
  }
  const gen = await generarPeriodos(data?.id || null);
  revalidatePath("/obligaciones");
  return { id: data?.id, creados: (gen as any)?.creados ?? 0 };
}

/** Generar los periodos que falten. Sin `obligacionId`, todas. Es idempotente
 *  —el `unique (obligacion, año, mes)` lo garantiza—, así que se puede pulsar
 *  el botón las veces que haga falta. */
export async function generarPeriodos(obligacionId: string | null = null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = obligacionId
    ? await supabase.rpc("obligacion_generar", { p_obligacion: obligacionId })
    : await supabase.rpc("obligaciones_generar_todas");
  if (error) return { error: faltaObl(error.message) };
  revalidatePath("/obligaciones");
  return { creados: Number(data ?? 0) };
}

/** Marcar (o desmarcar) un periodo como declarado.
 *  La fecha es el dato, no un `true`: sin ella no hay forma de saber si se
 *  presentó a tiempo, que es justo lo que se revisa al cerrar el año. */
export async function marcarDeclarado(periodoId: string, fecha: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const val = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || "")) ? fecha : null;
  /* `.select()` de cinturón: un update bloqueado por RLS devuelve cero filas y
     ningún error, y la casilla «se marcaría» hasta recargar. */
  /* `registrado_en` es CUÁNDO SE APUNTÓ AQUÍ, no cuándo lo recibió SUNAT. Sin
     él la pantalla solo podía enseñar `declarado_en`, que es la fecha de la
     constancia: un periodo de 2024 regularizado en 2026 se leería como marcado
     a tiempo. Al desmarcar se limpia junto con el resto — dejar el rastro de
     una marca que ya no existe es peor que no tenerlo. */
  const base = { declarado_en: val, declarado_por: val ? user.id : null };
  const marcar = (extra: Record<string, any>) => supabase.from("obligacion_periodo")
    /* `.select()` de cinturón: un update bloqueado por RLS devuelve cero filas
       y ningún error, y la casilla «se marcaría» hasta recargar. */
    .update({ ...base, ...extra }).eq("id", periodoId).select("id");

  let { data, error } = await marcar({ registrado_en: val ? new Date().toISOString() : null });
  /* ── SI FALTA LA COLUMNA, SE MARCA IGUAL ──
     Postgres rechaza el UPDATE ENTERO cuando una columna no existe, así que
     sin este reintento nadie podría marcar un periodo hasta correr
     db/obligacion-hilo.sql — una migración pendiente dejaría inservible lo que
     ya funcionaba. Se pierde el «cuándo se apuntó», que es lo nuevo, y no la
     marca, que es lo que hacía falta. */
  if (error && /registrado_en/.test(error.message)) ({ data, error } = await marcar({}));
  if (error) return { error: faltaObl(error.message) };
  if (!data?.length) return { error: "No se pudo guardar: el permiso de la base lo rechazó." };
  revalidatePath("/obligaciones");
  return {};
}

/* Aquí vivía `guardarPapelObligacion`, que pegaba enlaces de Drive con las
   cuatro constancias de cada mes. Se retiró a los dos días de escribirla y el
   motivo lo dio quien la iba a usar: guardar esas copias no sirvió nunca en
   SeaTable. Si una declaración está presentada lo dice SUNAT, no un archivo
   nuestro; y una copia que hay que mantener a mano se queda vieja y encima da
   confianza. Lo que hacía falta era llegar rápido a SUNAT a comprobarlo, y eso
   es un enlace en la pantalla, no cuatro columnas y una acción. */

/** Qué salió el mes: en cero, saldo a favor o a pagar, con su monto. */
export async function fijarResultadoPeriodo(
  periodoId: string, resultado: string | null, monto: string | number | null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const r = RESULTADOS_OBL.find(x => x.id === resultado) || null;
  /* Sin resultado no hay monto, y «en cero» tampoco lo lleva: dejar un importe
     colgando de un mes en cero es la clase de dato que luego nadie sabe leer. */
  const n = r?.conMonto ? Number(monto) : NaN;
  const { data, error } = await supabase.from("obligacion_periodo")
    .update({ resultado: r?.id || null, monto: Number.isFinite(n) ? n : null })
    .eq("id", periodoId).select("id");
  if (error) return { error: faltaObl(error.message) };
  if (!data?.length) return { error: "No se pudo guardar: el permiso de la base lo rechazó." };
  revalidatePath("/obligaciones");
  return {};
}

/** Desde cuándo se le sigue la pista a una obligación, y regenerar.
 *
 *  Es el control que faltaba: sin él, ver 2024 obligaba a tocar SQL. Vacío
 *  significa «desde que la empresa existe» —`obligacion_generar` cae en
 *  `fecha_constitucion`—, que es la respuesta correcta cuando nadie decide.
 *
 *  No BORRA periodos al acortar el rango: los meses ya generados se quedan.
 *  Es deliberado. Alguien pudo marcar uno como declarado, y una fecha de
 *  inicio no es motivo para tirar el trabajo de otro; para quitar meses de
 *  más está el filtro por constitución, que sí sabe que son imposibles. */
export async function fijarDesdeObligacion(obligacionId: string, desde: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const val = /^\d{4}-\d{2}-\d{2}$/.test(String(desde || "")) ? desde : null;
  const { data, error } = await supabase.from("obligacion")
    .update({ desde: val }).eq("id", obligacionId).select("id");
  if (error) return { error: faltaObl(error.message) };
  if (!data?.length) return { error: "No se pudo guardar: el permiso de la base lo rechazó." };
  const gen = await generarPeriodos(obligacionId);
  revalidatePath("/obligaciones");
  return { creados: (gen as any)?.creados ?? 0 };
}

/* ── IMPORTAR LO QUE SUNAT DICE QUE SE PRESENTÓ ──
 *
 * Se le pega el texto del reporte «Relación de constancia de pagos» de SOL y
 * marca los periodos, con su fecha real y su número de orden. No habla con
 * SUNAT ni guarda credenciales: lee un texto. Ver lib/importarSol.
 *
 * ── LO QUE NO HACE, Y ES LO IMPORTANTE ──
 * No crea periodos. Solo marca los que YA existen para esa empresa y esa
 * clase. Si el reporte trae un mes que el sistema no tiene —porque la
 * obligación arranca después, o no está creada— se cuenta aparte y se dice.
 * Crearlos al vuelo sería dejar que un pegado defina desde cuándo declara una
 * empresa, que es justo la decisión que `obligacion.desde` existe para que
 * tome una persona.
 *
 * Tampoco pisa una fecha ya puesta a mano salvo que se pida: quien la escribió
 * pudo saber algo que el reporte no dice.
 */
export async function importarDeclaracionesSol(
  empresaId: string, texto: string, pisarManual = false,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  /* ── UN SOLO SITIO PARA LOS DOS REPORTES ──
     SOL da dos cosas distintas: la «relación de constancia de pagos» (si se
     presentó y cuándo) y el «detalle de casillas» (qué cifras se pusieron).
     Se reconocen los dos aquí en vez de poner dos botones: quien pega no tiene
     por qué saber cuál de los dos tiene en el portapapeles, y dos botones
     garantizan que alguien pegue en el equivocado y vea «no encontré nada»
     sobre un reporte perfectamente válido. */
  const lectura = leerReporteSol(texto || "");
  const casillas = leerCasillasSol(texto || "");
  /* ── Y EL TERCERO: LA DECLARACIÓN EN SU PROPIO PDF ──
     La jurada anual no se descarga como listado sino como el formulario 710
     entero. Sin este lector, ese PDF —el documento oficial de la declaración—
     entraba y la respuesta era «no encontré ninguna declaración», que manda a
     dudar del archivo cuando el archivo está perfecto.
     Se suma a las filas del listado, no las sustituye: los tres formatos se
     pueden soltar juntos y cada uno aporta lo suyo. */
  const sueltas = leerDeclaracionesSol(texto || "");
  if (!lectura.filas.length && !casillas.length && !sueltas.length) {
    /* ── DECIR QUÉ PASÓ, NO SOLO QUE NO PASÓ ──
       «No encontré nada» ante un pegado que SÍ trae las cifras manda a la
       persona a comprobar el reporte, que está bien, en vez de la forma de
       copiarlo, que es lo que falla. Un error que apunta al sitio equivocado
       cuesta más que no dar error. */
    if (pareceCopiaPorColumnas(texto || "")) {
      /* No se sugiere «pruébalo en otro visor»: el desorden viene DENTRO del
         PDF —el PDT escribe etiquetas e importes en pasadas distintas—, así que
         ningún visor lo copia bien y ese consejo solo haría repetir el intento.
         La salida es soltar el archivo, que se lee por coordenadas. */
      return { error: "Ese texto viene con los códigos de casilla separados de sus importes («185 342» por un lado y «0.00» por otro), y así no hay forma de saber qué importe es de cuál. No es tu manera de copiar: estos PDF del PDT no se pueden copiar bien desde ningún visor. Suelta el archivo PDF en el recuadro de arriba y se lee entero." };
    }
    return { error: "No encontré ninguna declaración en ese texto. Pega el reporte completo de SOL —el de constancias de pagos o el detalle de casillas—, con su cabecera." };
  }

  /* ── EL RUC DE LA CABECERA SE COMPRUEBA ──
     Pegar el reporte de una empresa en la ficha de otra es el error fácil de
     esta pantalla: no daría ningún síntoma y dejaría a las dos mintiendo a la
     vez —una con meses declarados que no son suyos, la otra sin ellos—.

     ⚠ El RUC sale de `rucDelTexto` y no de `lectura.ruc`. Eran lo mismo hasta
     que se sumaron los otros dos formatos: la lectura solo lo traía cuando el
     pegado era la relación de constancias, así que soltar el DETALLE DE
     CASILLAS o la DECLARACIÓN ENTERA de otra empresa se saltaba esta guarda
     por completo. La comprobación estaba escrita y no cubría dos de los tres
     caminos que llegan hasta ella. */
  const rucPapel = rucDelTexto(texto || "");
  const { data: emp } = await supabase.from("empresas")
    .select("ruc,nombre").eq("id", empresaId).maybeSingle();
  const rucEmp = String((emp as any)?.ruc || "").replace(/\D/g, "");
  if (rucPapel && rucEmp && rucPapel !== rucEmp) {
    return { error: `Ese reporte es del RUC ${rucPapel} (${lectura.razon || "—"}), y esta empresa es ${rucEmp}. No se importó nada.` };
  }
  /* Y si NO se pudo comprobar, se dice. Callarlo deja la puerta abierta al
     mismo error con la apariencia de haberlo vigilado: quien ve «12
     importadas» da por hecho que el archivo era el correcto porque la pantalla
     no dijo lo contrario. */
  const sinComprobar = !rucPapel
    ? "No pude leer el RUC de ese archivo, así que no comprobé que sea de esta empresa."
    : !rucEmp
    ? `Esta empresa no tiene RUC cargado, así que no pude comprobar que el reporte (RUC ${rucPapel}) sea suyo.`
    : "";

  /* Las del listado y las sueltas, juntas. `periodosDeSol` deduplica por
     (clase, año, mes) y se queda con la primera presentación como original y
     las siguientes como rectificatorias, así que soltar el listado Y el PDF de
     la misma declaración no la cuenta dos veces. */
  const periodos = periodosDeSol([...lectura.filas, ...sueltas]);
  if (!periodos.length && !casillas.length) {
    return { error: "El reporte se leyó, pero no trae ningún formulario que este sistema siga (0621 mensual o renta anual)." };
  }

  /* Los periodos que YA existen, de las obligaciones de esta empresa. Una sola
     consulta: el reporte trae dieciocho meses y preguntar uno por uno serían
     dieciocho viajes. */
  const { data: obls, error: eo } = await supabase.from("obligacion")
    .select("id,clase").eq("entidad_tipo", "empresa").eq("entidad_id", empresaId);
  if (eo) return { error: faltaObl(eo.message) };
  const oblDe = new Map<string, string>((obls || []).map((o: any) => [o.clase, o.id]));
  if (!oblDe.size) return { error: "Esta empresa no tiene ninguna obligación registrada todavía." };

  const { data: exist } = await supabase.from("obligacion_periodo")
    .select("id,obligacion_id,anio,mes,declarado_en")
    .in("obligacion_id", [...oblDe.values()]);
  const clave = (oid: string, a: number, m: number) => `${oid}|${a}|${m}`;
  const porClave = new Map<string, any>(
    (exist || []).map((p: any) => [clave(p.obligacion_id, p.anio, p.mes), p]));

  let marcados = 0, yaEstaban = 0, sinPeriodo = 0, sinObligacion = 0;
  const faltantes: string[] = [];

  for (const p of periodos) {
    const oid = oblDe.get(p.clase);
    if (!oid) { sinObligacion++; continue; }
    /* Las anuales viven con `mes = 0`: el reporte las trae con el mes en que
       se presentaron, y ese no es su periodo. */
    const mes = p.clase === "igv_renta" ? p.mes : 0;
    const fila = porClave.get(clave(oid, p.anio, mes));
    if (!fila) {
      sinPeriodo++;
      faltantes.push(`${String(p.mes).padStart(2, "0")}/${p.anio}`);
      continue;
    }
    if (fila.declarado_en && !pisarManual) { yaEstaban++; continue; }

    /* ── QUIÉN LO APUNTÓ Y CUÁNDO, TAMBIÉN AL IMPORTAR ──
       Aquí se guardaba `declarado_por` y NO `registrado_en`. El resultado era
       que la lista enseñaba el nombre de quien importó y, al lado, «no consta
       cuándo lo apuntó» — en las veintiocho filas, para siempre, porque
       ninguna importación futura iba a escribirlo tampoco. El dato no faltaba
       en los datos: faltaba en este `update`.
       Ojo con la confusión que hace fácil este error: `declarado_en` es la
       fecha de SUNAT y viene del reporte; `registrado_en` es cuándo pasó por
       aquí y es AHORA. Van juntas en la misma línea y significan cosas
       distintas. */
    const fijar = (extra: Record<string, any>) => supabase.from("obligacion_periodo").update({
      declarado_en: p.fecha,
      declarado_por: user.id,
      nro_orden: p.nroOrden,
      rectificaciones: p.rectificaciones.length ? p.rectificaciones : null,
      monto_pago: p.montoPago || 0,
      ...extra,
    }).eq("id", fila.id);

    let { error } = await fijar({ registrado_en: new Date().toISOString() });
    /* Sin db/obligacion-hilo.sql corrido, Postgres rechaza el UPDATE entero por
       una columna que no existe y el importador dejaría de funcionar del todo.
       Se reintenta sin ella: se pierde el «cuándo», que es lo nuevo, no la
       importación, que es lo que se venía a hacer. */
    if (error && /registrado_en/.test(error.message)) ({ error } = await fijar({}));
    if (error) return { error: faltaObl(error.message) };
    marcados++;
  }

  /* ── Y LAS CASILLAS, SI EL TEXTO LAS TRAÍA ──
     Van SIEMPRE, aunque el periodo ya estuviera marcado: aquí no hay nada que
     pisar de nadie —el declarado no se teclea a mano en ninguna pantalla— y es
     justo el dato que se viene a corregir cuando se rectifica un mes. */
  let conCasillas = 0;
  const igvOblId = oblDe.get("igv_renta");
  if (casillas.length && igvOblId) {
    for (const [, c] of casillasVigentes(casillas)) {
      const fila = porClave.get(clave(igvOblId, c.anio, c.mes));
      if (!fila) { sinPeriodo++; faltantes.push(`${String(c.mes).padStart(2, "0")}/${c.anio}`); continue; }
      const { error } = await supabase.from("obligacion_periodo").update({
        igv_debito: c.debito,
        igv_credito: c.credito,
        igv_resultado: c.resultado,
        igv_a_pagar: c.aPagar,
        declarado_orden: c.nroOrden,
      }).eq("id", fila.id);
      if (error) return { error: faltaObl(error.message) };
      conCasillas++;
    }
  }

  await supabase.from("actividad").insert({
    entidad_tipo: "empresa", entidad_id: empresaId, actor_id: user.id, tipo: "dato",
    detalle: { mensaje: `importó de SUNAT ${marcados} presentación(es) y ${conCasillas} detalle(s) de casillas` },
  });
  revalidatePath("/obligaciones");
  return {
    marcados, yaEstaban, sinPeriodo, sinObligacion, conCasillas,
    faltantes: [...new Set(faltantes)].slice(0, 12),
    ignoradas: lectura.ignoradas.length,
    razon: lectura.razon,
    sinComprobar,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   QUITAR UN PERIODO QUE NUNCA DEBIÓ EXISTIR

   Los periodos se generan solos a partir de una fecha, y esa fecha puede estar
   mal. A Apu Wilkakalle le salió un «abril 2024 · vencido» porque la
   generación arrancó en su fecha de constitución, y SUNAT no le pide nada
   antes de mayo: no hay constancia de abril, no la hubo nunca y no la va a
   haber. Sin forma de quitarlo, esa fila se queda en rojo para siempre y el
   titular dice «1 vencido» sobre algo que nadie debe.

   Y eso es lo caro: un semáforo que alerta de algo que no existe no es un
   detalle cosmético — es lo que enseña a no mirar el semáforo. La primera vez
   se comprueba, la segunda se ignora, y la tercera se ignora el vencido de
   verdad que está justo debajo.

   ── LO DECLARADO NO SE BORRA ──
   Si el periodo tiene fecha de presentación, esto se niega. Esa fecha y su
   número de orden son la prueba de lo que sí se hizo ante SUNAT, y un botón
   que la borra de un clic es un botón que un día borra el historial de un año.
   Para quitarlo hay que desmarcarlo antes (el ↺), que es un acto deliberado y
   distinto.

   Los comentarios y reacciones del periodo se van con él por la cascada de la
   base. Es correcto —hablaban de una fila que no debía existir— pero la
   pantalla lo advierte antes, porque puede haber una conversación dentro.
   ══════════════════════════════════════════════════════════════════════════ */
export async function quitarPeriodo(periodoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: p, error: eSel } = await supabase.from("obligacion_periodo")
    .select("id,anio,mes,declarado_en").eq("id", periodoId).maybeSingle();
  if (eSel) return { error: faltaObl(eSel.message) };
  if (!p) return { error: "Ese periodo ya no está." };
  if ((p as any).declarado_en) {
    return { error: "Este periodo tiene una declaración registrada. Desmárcalo primero (↺) si de verdad no corresponde: la fecha y el número de orden son la prueba ante SUNAT y no se borran de un clic." };
  }

  /* `.select()` de cinturón: un delete bloqueado por RLS devuelve cero filas y
     ningún error, y la fila «desaparecería» hasta recargar. */
  const { data, error } = await supabase.from("obligacion_periodo")
    .delete().eq("id", periodoId).select("id");
  if (error) return { error: faltaObl(error.message) };
  if (!data?.length) return { error: "No se pudo quitar: el permiso de la base lo rechazó." };

  revalidatePath("/obligaciones");
  return {};
}

/** Apagar o encender una obligación. No se borra: los periodos ya declarados
 *  son el historial de la empresa ante SUNAT, y borrarlos por dar de baja una
 *  regla sería tirar la prueba de lo que sí se hizo. */
/* ══════════════════════════════════════════════════════════════════════════
   CAMBIAR QUIÉN RESPONDE POR UNA OBLIGACIÓN

   El responsable se elegía al CREAR la obligación y ahí se quedaba: el pie del
   bloque lo pintaba en gris y el único botón era «Dar de baja». Pero la gente
   cambia de encargo —Wilfredo llevaba las de Aynicha Films y ahora las lleva
   Katy— y eso no es una excepción: es lo normal en un equipo.

   Sin esta acción, la salida era el SQL Editor. Y lo que decide esa columna no
   es decorativo: `lib/rondaObligaciones.ts` le abre el caso a quien figura
   aquí, así que un responsable viejo significa que el aviso de vencimiento le
   llega a alguien que ya no lo mira. Un dato que dirige avisos no puede
   necesitar una consola para corregirse.

   ⚠ Lo ya declarado NO se toca. `obligacion_periodo.declarado_por` guarda
   quién apuntó cada mes, y eso es historia: reescribirla al cambiar de
   encargado diría que Katy declaró meses que declaró Wilfredo. Esto cambia a
   quién se le pedirá de ahora en adelante, no quién hizo lo de antes.
   ══════════════════════════════════════════════════════════════════════════ */
export async function cambiarResponsableObligacion(
  obligacionId: string, responsable: string | null,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  /* `.select()` no es adorno: sin él, un UPDATE que RLS descarta vuelve con
     error nulo y cero filas, y la pantalla diría «guardado» sobre algo que no
     se guardó. Es la misma trampa que documenta `cambiarEstado`. */
  const { data, error } = await supabase.from("obligacion")
    .update({ responsable: responsable || null }).eq("id", obligacionId).select("id");
  if (error) return { error: faltaObl(error.message) };
  if (!data?.length) return { error: "No se pudo guardar: el permiso de la base lo rechazó." };
  revalidatePath("/obligaciones");
  return {};
}

export async function activarObligacion(obligacionId: string, activa: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data, error } = await supabase.from("obligacion")
    .update({ activa }).eq("id", obligacionId).select("id");
  if (error) return { error: faltaObl(error.message) };
  if (!data?.length) return { error: "No se pudo guardar: el permiso de la base lo rechazó." };
  revalidatePath("/obligaciones");
  return {};
}

/* ══════════════════════════════════════════════════════════════════════════
   ENCENDER O APAGAR UNA CUENTA

   `perfiles` lo crea un trigger en cada registro de Google, con `activo` en
   true. Y hasta hoy no había forma de cambiarlo: ni acción, ni política de
   escritura. La columna existía desde el primer día del esquema y nunca tuvo
   interruptor, así que quien entró una vez a probar quedaba asignable para
   siempre — en el combo de cada caso, de cada sub-caso y de cada actividad.

   ── APAGAR NO ES BORRAR, NI ESCONDER ──
   Una cuenta apagada deja de salir en los combos de ASIGNAR y deja de recibir
   los avisos que van «a todo el equipo» —que es la otra cara de lo mismo: no
   se le encarga trabajo, no se le interrumpe—. Nada más. Lo que escribió sigue
   firmado con su nombre, sus casos siguen siendo suyos y sus jornadas cuentan
   igual. Tampoco cierra su sesión: `activo` no lo mira la
   autenticación. Es «no le encarguen trabajo», no «esta persona no existió».

   ── NADIE SE APAGA A SÍ MISMO ──
   No por cortesía: quien se apaga deja de salir en los combos y sigue siendo
   administrador, así que el daño es reversible. Pero es un clic sin ningún
   motivo bueno y con un despiste muy fácil en una lista de nombres parecidos.
   ══════════════════════════════════════════════════════════════════════════ */
export async function cambiarCuentaActiva(cuentaId: string, activa: boolean) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  const { data: yo } = await supabase.from("perfiles")
    .select("es_admin").eq("id", user.id).maybeSingle();
  if (!yo?.es_admin) return { error: "Solo administración enciende y apaga cuentas." };
  if (cuentaId === user.id) return { error: "No puedes apagar tu propia cuenta." };

  /* ── EL `select` NO ES DECORACIÓN ──
     Sin db/cuentas-activas.sql corrido no hay política de UPDATE, y RLS no da
     error por eso: descarta las filas y PostgREST responde «correcto» con cero
     cambios. Un botón que no hace nada y dice que sí es peor que uno roto.
     Pidiendo la fila de vuelta, «cero filas» ES la respuesta —en el mismo
     viaje, y sin depender de comparar valores: releer y comparar fallaba justo
     en el caso que importa, porque en una base sin migrar `activo` puede estar
     en null y `!!null === false` coincidía con «apagar». */
  const falta = "Falta correr db/cuentas-activas.sql: la tabla de cuentas todavía no acepta cambios.";
  const { data: tocadas, error } = await supabase.from("perfiles")
    .update({ activo: activa }).eq("id", cuentaId).select("id");
  if (error) {
    return { error: /policy|permission|denied|row-level/i.test(error.message) ? falta : error.message };
  }
  if (!tocadas?.length) return { error: falta };

  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return {};
}

/* ══════════════════════════════════════════════════════════════════════════
   INVITAR, DESINVITAR Y ATAR UNA CUENTA A SU FICHA

   Las tres cosas que hacían falta para dar de alta a alguien sin tocar Vercel
   ni el SQL Editor. Ver db/invitaciones.sql.
   ══════════════════════════════════════════════════════════════════════════ */

const FALTA_INV =
  "Falta correr db/invitaciones.sql: la lista de invitados todavía no existe en la base.";

/** ¿Es admin quien pide? La comprobación de la pantalla no vale como cerradura
 *  —se salta con la consola del navegador—, así que se repite aquí y además la
 *  exige la base con sus políticas. Tres capas para lo mismo, a propósito. */
async function exigirAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("perfiles")
    .select("es_admin").eq("id", userId).maybeSingle();
  return !!data?.es_admin;
}

export async function invitarCorreo(correo: string, nota: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!await exigirAdmin(supabase, user.id)) {
    return { error: "Solo administración invita cuentas." };
  }

  /* Minúsculas y sin espacios ANTES de guardar. La clave de la tabla es el
     correo, y «Ana@Gmail.com » y «ana@gmail.com» serían dos invitaciones para
     la misma persona — con la segunda pareciendo que no está invitada. */
  const email = String(correo || "").trim().toLowerCase();
  /* Una validación mínima, que es la que evita el error de verdad: invitar un
     nombre en vez de un correo. Nadie entra con «Ana López» y el fallo no se
     descubre hasta que esa persona no puede entrar, mañana, con prisa. */
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return { error: "Eso no parece un correo. Hace falta el de Google con el que va a entrar." };
  }

  const { error } = await supabase.from("cuenta_permitida")
    .insert({ email, nota: nota?.trim() || null, invitado_por: user.id });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { error: "Ese correo ya estaba invitado." };
    if (/does not exist|relation|schema cache/i.test(error.message)) return { error: FALTA_INV };
    return { error: error.message };
  }
  revalidatePath("/admin");
  return {};
}

export async function quitarInvitacion(correo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!await exigirAdmin(supabase, user.id)) {
    return { error: "Solo administración toca la lista de invitados." };
  }

  const email = String(correo || "").trim().toLowerCase();
  /* `select` para saber si de verdad se borró: sin política de DELETE, RLS
     descarta la fila y PostgREST responde «correcto» sin borrar nada. */
  const { data, error } = await supabase.from("cuenta_permitida")
    .delete().eq("email", email).select("email");
  if (error) {
    return { error: /does not exist|relation|schema cache/i.test(error.message)
      ? FALTA_INV : error.message };
  }
  /* Cero filas puede ser dos cosas y no se sabe cuál: que ese correo ya no
     estaba —doble clic, otro admin, la lista de la pantalla desactualizada— o
     que falta la política de borrado. Se dicen las dos, en el orden en que son
     probables. Mandar a correr una migración ya corrida es peor que no decir
     nada: se busca donde no es. */
  if (!data?.length) {
    return { error: "No se quitó nada: o ese correo ya no estaba en la lista, "
      + "o falta correr db/invitaciones.sql." };
  }

  revalidatePath("/admin");
  /* ⚠ Quitar de la lista NO expulsa a quien ya entró: la allowlist se mira al
     iniciar sesión, no en cada página. Para que deje de trabajar hay que
     apagar su cuenta, que es el botón de al lado. Se dice en la pantalla. */
  return {};
}

/* ── ATAR UNA CUENTA A SU FICHA DE PERSONA ──
 *
 * `personas.usuario_id` es lo que hace que el alias corto salga en la caja,
 * que se le puedan pagar jornadas y que /admin sepa quién es cada cuenta.
 * Hasta ahora se rellenaba a mano por SQL, porque `personas` no tenía política
 * de UPDATE en el repositorio.
 *
 * Se pasa `personaId = null` para desatar. Y desatar es una operación normal:
 * si alguien enlazó la ficha equivocada, lo importante es poder deshacerlo sin
 * abrir el SQL Editor — que es de donde venimos. */
export async function enlazarCuentaPersona(cuentaId: string, personaId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };

  /* ── LAS DOS ESCRITURAS VAN EN LA BASE, NO AQUÍ ──
     Atar una cuenta a una ficha es soltar la que tuviera y asignar la nueva.
     Hechas desde aquí son dos viajes, y si el segundo falla —choque con el
     índice único, ficha borrada— el primero YA se guardó: la cuenta se queda
     sin ficha y el estado anterior, que era el correcto, se ha perdido. En
     `enlazar_cuenta_persona` las dos van en la misma transacción: o las dos, o
     ninguna. Y comprueba que la ficha esté libre ANTES de tocar nada, para que
     el error llegue como una frase y no como «duplicate key value violates
     unique constraint». */
  const { data, error } = await supabase.rpc("enlazar_cuenta_persona", {
    cuenta: cuentaId, persona: personaId,
  });
  if (error) {
    return { error: /PGRST202|42883|does not exist|schema cache/i.test(
      `${(error as any).code || ""} ${error.message}`)
      ? "Falta correr db/invitaciones.sql: el enlace entre cuenta y ficha todavía no existe en la base."
      : error.message };
  }
  /* La función devuelve un motivo, no un booleano: cada uno manda a un sitio
     distinto y «no se pudo» no manda a ninguno. */
  const r = String(data || "");
  if (r === "no_admin") return { error: "Solo administración enlaza cuentas con fichas." };
  if (r === "sin_ficha") return { error: "Esa ficha de persona ya no existe. Recarga la página." };
  if (r === "ficha_ocupada") {
    return { error: "Esa ficha ya está atada a otra cuenta. Desátala primero desde su fila." };
  }
  if (r !== "ok") return { error: `No se pudo enlazar (${r || "sin respuesta"}).` };

  revalidatePath("/admin");
  /* El alias corto y el nombre de quien apunta salen de este vínculo en media
     docena de pantallas; todas tienen que enterarse. */
  revalidatePath("/", "layout");
  return {};
}

/* ══════════════════════════════════════════════════════════════════════════
   EL ZÓCALO, EN UN SOLO VIAJE

   Tres componentes del layout piden cada uno lo suyo al cambiar de página:
   NavIconos (`estadoNav`), BancoTrabajo (`misEnProgreso` y `muroMensajes`) y
   CampanitaGlobal (`misNotificaciones`). Cuatro acciones.

   Y Next ENCOLA las acciones de servidor de un mismo cliente: no salen a la
   vez, salen de una en una. Medido en producción sobre /tablero: cuatro POST
   sumando **4772 ms**, más del doble de lo que cuesta pintar la pantalla
   entera. Es el trámite invisible de cada navegación, en las 34 pantallas.

   Aquí las cuatro corren de verdad en paralelo, dentro del mismo servidor y
   contra una base que está a un salto y no a un océano.

   ── Y UNA SOLA VERIFICACIÓN DE SESIÓN, DE VERDAD ──
   El primer intento fue envolver `getUser()` en `cache()` de React. NO
   funciona dentro de una acción de servidor, y está comprobado en el código:
   `cache` resuelve su mapa con `resolveRequest()`, que solo devuelve algo
   dentro de un render flight; el manejador de acciones ejecuta la función
   ANTES de crear ese contexto, así que cada llamada recibe un `Map` nuevo y
   nada se deduplica.

   Peor todavía: al ponerlas en paralelo, esas cuatro verificaciones dejaron de
   ir en cuatro peticiones separadas y pasaron a salir A LA VEZ, cada una con
   su propio cliente. Si el token está vencido justo al navegar, las cuatro
   intentan refrescarlo con el mismo refresh token — y Supabase lo ROTA: la
   primera gana y las otras tres presentan uno ya gastado. Una vez por hora,
   al navegar, y con la sesión de por medio.

   Por eso `estadoGlobal` verifica UNA vez y les pasa el `user` a los cuatro
   cuerpos internos. Paralelizar sin mirar qué se estaba paralelizando habría
   cambiado 4772 ms por un fallo de sesión intermitente.

   ── LO QUE NO HACE ──
   No sustituye a las cuatro: cada una sigue existiendo y siendo llamada por su
   cuenta cuando algo cambia en vivo. Recargar el banco porque llegó un
   comentario no tiene por qué traerse las notificaciones. Esto es solo para el
   momento en que las cuatro se piden a la vez, que es al navegar.

   ── NUNCA LANZA ──
   `allSettled` y no `all`: si una falla, las otras tres llegan. Un zócalo que
   se cae entero porque a una migración le falta una columna deja la
   navegación sin menú, sin banco y sin campanita a la vez.
   ══════════════════════════════════════════════════════════════════════════ */
const ZOCALO_VACIO = {
  /* Tipado como `EstadoNav` a propósito: era un objeto suelto, y al añadirle un
     indicador al menú este quedaba sin él —el menú se dibujaba con la forma
     vieja mientras no llegara la respuesta— sin que nada avisara. */
  nav: { casilla: 0, caja: false, vencidos: 0, porVencer: 0, fondosEc: 0, mesesEc: 0, docsEc: 0,
         casosMios: 0, casosCurso: 0 } as EstadoNav,
  banco: { error: "sin sesión" } as any,
  muro: { mensajes: [], yo: null } as any,
  notifs: { items: [], sinLeer: 0, sinLeerBot: 0, faltan: [] } as any,
};

export async function estadoGlobal() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return ZOCALO_VACIO;

  const [nav, banco, muro, notifs] = await Promise.allSettled([
    estadoNav(supabase, user),
    bancoDe(supabase, user),
    muroDe(supabase, user),
    notifsDe(supabase, user),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>, deFallo: T): T =>
    r.status === "fulfilled" ? r.value : deFallo;
  return {
    nav: ok(nav, ZOCALO_VACIO.nav),
    banco: ok(banco, { error: "no se pudo cargar" } as any),
    muro: ok(muro, ZOCALO_VACIO.muro),
    notifs: ok(notifs, ZOCALO_VACIO.notifs),
  };
}
