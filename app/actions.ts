"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { FORM_CONF } from "@/lib/entidades";
import { nrmQ } from "@/lib/quechua";

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

export async function comentar(pubId: string, texto: string, imagenes: string[] = []) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: com, error } = await supabase
    .from("comentarios")
    .insert({ publicacion_id: pubId, autor_id: user.id, cuerpo: texto, imagenes: (imagenes || []).slice(0, 6) })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // 🪄 Menciones @nombre → notificación al invocado
  const tokens = [...new Set((texto.match(/@[^\s@,;:!?]+/g) || []).map(m => m.slice(1)))];
  if (tokens.length) {
    const nrmM = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const [{ data: perfs }, { data: pubT }] = await Promise.all([
      supabase.from("perfiles").select("id,nombre").eq("activo", true),
      supabase.from("publicaciones").select("titulo").eq("id", pubId).single(),
    ]);
    const { data: yo } = await supabase.from("perfiles").select("nombre").eq("id", user.id).single();
    for (const p of perfs || []) {
      const sinEspacios = nrmM(p.nombre).replace(/\s+/g, "");
      const palabras = nrmM(p.nombre).split(/\s+/);
      const invocado = tokens.some(t => {
        const tk = nrmM(t);
        return sinEspacios.startsWith(tk) || palabras.some(w => w.startsWith(tk));
      });
      if (invocado && p.id !== user.id) {
        await supabase.from("notificaciones").insert({
          usuario_id: p.id, publicacion_id: pubId, tipo: "mencion",
          mensaje: `🪄 ${(yo?.nombre || "Alguien").split(" ")[0]} te mencionó en «${(pubT?.titulo || "").slice(0, 60)}»`,
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

export async function editarFechaMiembro(miembroId: string, empresaId: string, fecha: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida." };
  const { error } = await supabase.from("empresa_miembros")
    .update({ fecha_inicio: fecha }).eq("id", miembroId);
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

/* --- Editar comentario: solo el autor, y queda la marca de editado --- */
export async function editarComentario(comentarioId: string, pubId: string, cuerpo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const texto = (cuerpo || "").trim();
  if (!texto) return { error: "El comentario no puede quedar vacío." };
  const { data: com } = await supabase.from("comentarios")
    .select("autor_id").eq("id", comentarioId).single();
  if (!com) return { error: "Comentario no encontrado." };
  if (com.autor_id !== user.id) return { error: "Solo el autor puede editar su comentario." };
  const { error } = await supabase.from("comentarios")
    .update({ cuerpo: texto, editado_en: new Date().toISOString() })
    .eq("id", comentarioId);
  if (error) return { error: error.message };
  revalidatePath(`/caso/${pubId}`);
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
    ["empresa", "empresas", ["carpeta_drive_url", "ficha_ruc_url", "vigencia_poder_url"]],
    ["persona", "personas", ["carpeta_drive_url", "cv_url", "dni_url"]],
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
   Requiere SUNAT_API_TOKEN en las variables de entorno
   (token gratuito de apis.net.pe). */
async function consultarRucApi(ruc: string): Promise<{ estado?: string; condicion?: string; error?: string }> {
  const token = process.env.SUNAT_API_TOKEN;
  if (!token) return { error: "Falta configurar SUNAT_API_TOKEN en el entorno." };
  try {
    const r = await fetch(`https://api.decolecta.com/v1/sunat/ruc?numero=${encodeURIComponent(ruc)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) return { error: `API respondió ${r.status} para RUC ${ruc}` };
    const d: any = await r.json();
    const limpiar = (s: any) => String(s || "").trim().toLowerCase().replace(/\s+/g, "_");
    return {
      estado: limpiar(d.estado || d.estadoContribuyente || d.status),
      condicion: limpiar(d.condicion || d.condicionDomicilio || d.condition),
    };
  } catch (e: any) {
    return { error: "No se pudo consultar la API: " + (e?.message || "error de red") };
  }
}

export async function verificarRucSunat(empresaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: emp } = await supabase.from("empresas")
    .select("id,nombre,ruc,estado_sunat,condicion_sunat").eq("id", empresaId).single();
  if (!emp?.ruc) return { error: "Esta empresa no tiene RUC registrado." };

  const r = await consultarRucApi(emp.ruc);
  if (r.error) return { error: r.error };

  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("empresas").update({
    estado_sunat: r.estado || null,
    condicion_sunat: r.condicion || null,
    fecha_verificacion_sunat: hoy,
  }).eq("id", empresaId);
  if (error) return { error: error.message };

  const cambio = emp.estado_sunat !== r.estado || emp.condicion_sunat !== r.condicion;
  await supabase.from("actividad").insert({
    entidad_tipo: "empresa", entidad_id: empresaId, tipo: "bot",
    detalle: { mensaje: `Verificación SUNAT automática: ${r.estado} · ${r.condicion}${cambio ? " (¡cambió!)" : ""}`, regla: "sunat_api" },
  });
  return { estado: r.estado, condicion: r.condicion, cambio };
}

export async function verificarSunatLote() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { data: emps } = await supabase.from("empresas")
    .select("id,nombre,ruc").eq("estado", "activa").not("ruc", "is", null);

  let ok = 0, alertas: string[] = [], fallas: string[] = [];
  for (const emp of emps || []) {
    const r = await verificarRucSunat(emp.id);
    if ((r as any).error) { fallas.push(`${emp.nombre}: ${(r as any).error}`); continue; }
    ok++;
    const rr = r as any;
    if (rr.estado !== "activo" || (rr.condicion && rr.condicion !== "habido"))
      alertas.push(`${emp.nombre}: ${rr.estado} · ${rr.condicion}`);
    await new Promise(res => setTimeout(res, 400)); // respirar entre consultas
  }
  revalidatePath("/empresas");
  return { ok, alertas, fallas: fallas.slice(0, 5) };
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
    if (!r.ok) return { error: `RENIEC respondió ${r.status} para DNI ${dni}` };
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

    await supabase.from("actividad").insert({
      entidad_tipo: "persona", entidad_id: personaId, tipo: "bot",
      detalle: { mensaje: `Verificación RENIEC: «${nombreReniec}»${coincide ? " ✔ coincide" : " ⚠ NO coincide con lo registrado"}`, regla: "reniec_api" },
    });
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

export async function editarCuerpo(pubId: string, cuerpo: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const limpio = cuerpo.trim();
  const { error } = await supabase.from("publicaciones")
    .update({ cuerpo: limpio || null }).eq("id", pubId);
  if (error) return { error: error.message };
  await supabase.from("actividad").insert({
    entidad_tipo: "publicacion", entidad_id: pubId, tipo: "edicion", actor_id: user.id,
    detalle: { mensaje: "editó la descripción" },
  });
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

export async function agregarVinculo(pubId: string, entidadTipo: string, entidadId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("publicacion_vinculos").upsert(
    { publicacion_id: pubId, entidad_tipo: entidadTipo, entidad_id: entidadId },
    { onConflict: "publicacion_id,entidad_tipo,entidad_id", ignoreDuplicates: true });
  if (error) return { error: error.message };
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
}

export async function quitarVinculo(pubId: string, entidadTipo: string, entidadId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  const { error } = await supabase.from("publicacion_vinculos").delete()
    .eq("publicacion_id", pubId).eq("entidad_tipo", entidadTipo).eq("entidad_id", entidadId);
  if (error) return { error: error.message };
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  return {};
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
const EMOJIS_REACCION = ["👀", "👍", "❤️", "🔥", "👏", "😂", "😢"];
export async function toggleReaccion(pubId: string, comentarioId: string | null, emoji: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  if (!EMOJIS_REACCION.includes(emoji)) return { error: "Reacción no permitida." };

  let q = supabase.from("reacciones").select("id")
    .eq("usuario_id", user.id).eq("emoji", emoji);
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
  revalidatePath(`/caso/${pubId}`);
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

export async function cambiarFechaLimite(pubId: string, fecha: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no encontrada." };
  // Acepta 'YYYY-MM-DD'; vacío = quitar la fecha
  const val = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
  const { error } = await supabase.from("publicaciones")
    .update({ fecha_limite: val }).eq("id", pubId);
  if (error) return { error: error.message };
  revalidatePath(`/caso/${pubId}`);
  revalidatePath("/");
  revalidatePath("/tablero");
  return {};
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
