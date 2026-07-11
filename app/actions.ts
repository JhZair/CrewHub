"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { FORM_CONF } from "@/lib/entidades";

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
  const limpio: Record<string, string | null> = {};
  conf.campos.forEach(c => {
    if (!(c.key in datos)) return;
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
    const { error } = await supabase.from(conf.tabla).update(limpio).eq("id", id);
    if (error) return { error: error.message };
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

export async function crearPublicacion(
  tipo: string,
  titulo: string,
  cuerpo: string,
  vinculos: Vinculo[] = [],
  responsable: string | null = null,
  fechaLimite: string | null = null
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
    estado: tipo === "problema" ? "abierta" : "en_progreso",
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

  // 🔔 Notificar al responsable asignado (si no soy yo mismo)
  if (pub && responsable && responsable !== user.id) {
    await supabase.from("notificaciones").insert({
      usuario_id: responsable,
      publicacion_id: pub.id,
      tipo: "asignacion",
      mensaje: `Te asignaron: «${titulo}»`,
    });
  }
  revalidatePath("/");
  return {};
}

export async function comentar(pubId: string, texto: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: com, error } = await supabase
    .from("comentarios")
    .insert({ publicacion_id: pubId, autor_id: user.id, cuerpo: texto })
    .select("id")
    .single();
  if (error) return { error: error.message };
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
        mensaje: `Nuevo comentario en «${pub.titulo}»`,
      })));
    }
  }
  revalidatePath(`/caso/${pubId}`);
  return {};
}

export async function asignarResponsable(pubId: string, perfilId: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("publicaciones")
    .update({ responsable: perfilId }).eq("id", pubId);
  if (error) return { error: error.message };

  // 🔔 Notificar al nuevo responsable
  if (perfilId && perfilId !== user.id) {
    const { data: pub } = await supabase.from("publicaciones").select("titulo").eq("id", pubId).single();
    await supabase.from("notificaciones").insert({
      usuario_id: perfilId,
      publicacion_id: pubId,
      tipo: "asignacion",
      mensaje: `Te asignaron: «${pub?.titulo || "un caso"}»`,
    });
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

const norm = (s: string) => (s || "").trim();
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

  // Dedupe contra lo existente (por nombre, sin mayúsculas)
  const { data: existentes } = await supabase.from("personas").select("nombre");
  const ya = new Set((existentes || []).map((x: any) => x.nombre.trim().toLowerCase()));

  const nuevas = filas
    .filter(f => norm(f.nombre) && !ya.has(norm(f.nombre).toLowerCase()))
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
      notas: norm(f.notas) || null,
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

        const crearHito = async (nombre: string, d: string) => {
          await supabase.from("cronograma_actividades").insert({
            convocatoria_id: convId, nombre,
            clase: "hito_externo", etapa: "administracion",
            fecha_inicio: d, fecha_fin: d,
            estado: d <= hoyS ? "finalizada" : "planificada",
            dias_anticipacion: 7,
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

/* --- Miembros de empresa (rep. legal, socios, directiva) --- */
export async function agregarMiembro(empresaId: string, personaId: string, cargo: string, fechaInicio?: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("empresa_miembros").insert({
    empresa_id: empresaId,
    persona_id: personaId,
    cargo: cargo.trim() || "Miembro",
    fecha_inicio: fechaInicio || new Date().toISOString().slice(0, 10),
    estado: "activo",
  });
  if (error) return { error: error.message };
  revalidatePath(`/entidad/empresa/${empresaId}`);
  return {};
}

export async function bajaMiembro(miembroId: string, empresaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Baja, no borrado: el historial societario se conserva
  const { error } = await supabase.from("empresa_miembros")
    .update({ estado: "inactivo", fecha_fin: new Date().toISOString().slice(0, 10) })
    .eq("id", miembroId);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/empresa/${empresaId}`);
  return {};
}

/* --- Credenciales: SOLO metadatos; la clave vive en el gestor --- */
export async function agregarCredencial(
  dueno: "empresa" | "persona", duenoId: string,
  plataforma: string, identificador: string, ubicacion: string, notas: string
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
    actualizado_en: new Date().toISOString().slice(0, 10),
  });
  if (error) return { error: error.message };
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  return {};
}

export async function borrarCredencial(id: string, dueno: string, duenoId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("credenciales").delete().eq("id", id);
  if (error) return { error: error.message };
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
  const PERMITIDOS = ["estado", "codigo_acta", "fecha_firma_acta", "monto_adjudicado",
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
  const { error } = await supabase.from("postulaciones").update(limpio).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/convocatoria/${convocatoriaId}`);
  return {};
}

export async function borrarPostulacion(id: string, convocatoriaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("postulaciones").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/entidad/convocatoria/${convocatoriaId}`);
  return {};
}

export async function agregarEquipoPostulacion(postulacionId: string, personaId: string, rol: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("postulacion_equipo").insert({
    postulacion_id: postulacionId, persona_id: personaId, cargo: rol.trim() || "Integrante",
  });
  if (error) return { error: error.message };
  revalidatePath(`/entidad/postulacion/${postulacionId}`);
  return {};
}

export async function quitarEquipoPostulacion(id: string, postulacionId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("postulacion_equipo").delete().eq("id", id);
  if (error) return { error: error.message };
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
  const { error } = await supabase.from("postulaciones")
    .update({ materiales: limpio }).eq("id", postulacionId);
  if (error) return { error: error.message };
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

/* --- CRONOGRAMA: el plan produce el trabajo --- */
export async function agregarActividadCrono(
  dueno: "proyecto" | "convocatoria", duenoId: string,
  d: { nombre: string; etapa: string; ini: string; fin: string;
       responsable: string; antic: string; clase: string; }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!d.nombre.trim() || !d.ini) return { error: "Nombre y fecha de inicio son obligatorios." };
  const { error } = await supabase.from("cronograma_actividades").insert({
    [dueno === "proyecto" ? "proyecto_id" : "convocatoria_id"]: duenoId,
    nombre: d.nombre.trim(),
    etapa: d.etapa || null,
    clase: d.clase === "hito_externo" ? "hito_externo" : "trabajo",
    fecha_inicio: d.ini,
    fecha_fin: d.fin || d.ini,
    responsable: d.responsable || null,
    dias_anticipacion: parseInt(d.antic) || 7,
    estado: "planificada",
  });
  if (error) return { error: error.message };
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
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
    .select("*, proyecto:proyectos(nombre), convocatoria:convocatorias(codigo,nombre)")
    .eq("id", actId).single();
  if (!act || act.estado !== "planificada") return { error: "La actividad ya no está planificada." };

  const esHito = act.clase === "hito_externo";
  const contexto = (act.proyecto as any)?.nombre
    || `${(act.convocatoria as any)?.codigo || ""} ${(act.convocatoria as any)?.nombre || ""}`.trim()
    || "el cronograma";

  const { data: pub, error } = await supabase.from("publicaciones").insert({
    autor_id: user.id,
    responsable: act.responsable || null,
    tipo: esHito ? "aviso" : "tarea",
    titulo: esHito ? `🏛 ${act.nombre}` : act.nombre,
    cuerpo: esHito
      ? `Hito del concurso (${contexto}): ${act.fecha_inicio}${act.fecha_fin && act.fecha_fin !== act.fecha_inicio ? ` → ${act.fecha_fin}` : ""}. Fecha fijada por la institución — dar seguimiento.`
      : `Generada desde el cronograma de ${contexto}. Ventana planificada: ${act.fecha_inicio} → ${act.fecha_fin || "—"}.`,
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

  if (act.responsable && act.responsable !== user.id) {
    await supabase.from("notificaciones").insert({
      usuario_id: act.responsable, publicacion_id: pub.id,
      tipo: "asignacion", mensaje: `📅 Del cronograma: «${act.nombre}»`,
    });
  }
  revalidatePath(`/entidad/${dueno}/${duenoId}`);
  revalidatePath("/");
  return {};
}

export async function marcarNotifsLeidas() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  await supabase.from("notificaciones").update({ leida: true })
    .eq("usuario_id", user.id).eq("leida", false);
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
  }
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}
