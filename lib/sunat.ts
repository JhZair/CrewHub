import { hoyLima } from "@/lib/fechas";
/* Núcleo de la verificación SUNAT, reutilizable por las acciones
   (botón humano) y por el cron semanal. Recibe el cliente Supabase ya
   creado (de usuario o service-role) y quién firma los casos que genere. */

import { BOT } from "@/lib/personas";

type DB = any; // SupabaseClient (evitamos acoplar tipos entre clientes)

type EmpSunat = {
  id: string; nombre: string; ruc: string;
  estado?: string | null;            // estado interno: activa | cerrada | ...
  relacion?: string | null;          // propia | aliada | externa
  estado_sunat?: string | null; condicion_sunat?: string | null;
};

const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];
const tituloSunat = (nombre: string) => `❗ SUNAT: ${nombre}`;

/* ── Las dos preguntas de SUNAT, en un solo sitio ──
   Estaban copiadas en /empresas, /qhaway y aquí, y ya habían divergido: una
   olvidaba el "no habido", otra alertaba de empresas externas. Un dato así
   no puede tener tres respuestas según la página que lo mire. */

/* ¿Está mal? Activa pero no habida también está mal: no puede postular. */
export const esProblematico = (estado?: string | null, condicion?: string | null) =>
  (!!estado && estado !== "activo") || condicion === "no_habido";

/* ¿Es asunto nuestro? Solo las propias y activas exigen acción. De una
   aliada o externa mantenemos el dato al día, pero su SUNAT no lo
   arreglamos nosotros, así que no nos puede aparecer como tarea. */
export const esNuestra = (x: { estado?: string | null; relacion?: string | null }) =>
  (x.estado || "activa") === "activa" && (x.relacion || "propia") === "propia";

/* Lo que el ojo debe ver: mal Y nuestro. */
export const alertaSunat = (x: { estado?: string | null; relacion?: string | null;
  estado_sunat?: string | null; condicion_sunat?: string | null }) =>
  esNuestra(x) && esProblematico(x.estado_sunat, x.condicion_sunat);

/* ¿Sigue en juego? No es lo mismo que `esNuestra`: una aliada no es nuestra
   pero está viva —se postula con ella—, y una propia en cierre es nuestra
   pero ya no sirve para postular. Sirve para apagar en las listas lo que
   existe y tiene historia, pero con lo que ya no se juega. */
export const empresaViva = (x: { estado?: string | null }) =>
  ["activa", "en_constitucion"].includes(x.estado || "activa");

/* ¿Jugamos con ella? Propia o aliada. Es la TERCERA pregunta distinta sobre
   lo mismo, y las tres dan respuestas diferentes para la misma empresa:
     · Black Horse — activa (viva), externa (no de casa), no nuestra
     · AsocHuaynasP — activa, aliada (de casa), no nuestra
     · Asoc iCr3a   — en cierre (no viva), propia (de casa), no nuestra
   Por eso son tres funciones y no un booleano «relevante»: cada pantalla
   pregunta lo que necesita. Una externa aparece porque tiene historia con
   nosotros, pero no es cancha nuestra. */
export const empresaDeCasa = (x: { relacion?: string | null }) =>
  ["propia", "aliada"].includes(x.relacion || "propia");

/* Texto del problema, tolerante a nulos: una empresa puede estar "no habida"
   sin estado_sunat cargado, y ahí un .replace() directo tumba la página. */
export const textoSunat = (x: { estado_sunat?: string | null; condicion_sunat?: string | null }) =>
  [x.estado_sunat && x.estado_sunat !== "activo" ? x.estado_sunat : null,
   x.condicion_sunat && x.condicion_sunat !== "habido" ? x.condicion_sunat : null]
    .filter(Boolean).join(" · ").replace(/_/g, " ") || "revisar en SUNAT";

/* Consulta el RUC en la API de decolecta (token en el entorno). */
export async function consultarRucApi(ruc: string): Promise<{ estado?: string; condicion?: string; error?: string }> {
  const token = process.env.SUNAT_API_TOKEN;
  if (!token) return { error: "Falta configurar SUNAT_API_TOKEN en el entorno." };
  try {
    const r = await fetch(`https://api.decolecta.com/v1/sunat/ruc?numero=${encodeURIComponent(ruc)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      if (r.status === 401 || r.status === 429)
        return { error: `Límite del plan de decolecta alcanzado (${r.status}) — revisa tu cupo mensual de consultas.` };
      const cuerpo = await r.text().catch(() => "");
      return { error: `SUNAT respondió ${r.status} para RUC ${ruc}${cuerpo ? ` · ${cuerpo.slice(0, 120)}` : ""}` };
    }
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

/* Abre (o reutiliza) un caso 'problema' cuando la empresa cae en un
   estado que le impide postular. Deduplica por título. */
async function abrirProblemaSunat(db: DB, emp: EmpSunat, r: { estado?: string; condicion?: string }, autorId: string | null) {
  if (!autorId) return;
  const titulo = tituloSunat(emp.nombre);
  const { data: ya } = await db.from("publicaciones").select("id")
    .eq("titulo", titulo).in("estado", ABIERTOS).limit(1).maybeSingle();
  if (ya) return;
  const { data: pub } = await db.from("publicaciones").insert({
    autor_id: autorId, tipo: "problema", prioridad: "alta", estado: "abierta",
    titulo,
    cuerpo: `Verificación automática SUNAT: «${emp.nombre}» figura como ${(r.estado || "—").replace(/_/g, " ")} · ${(r.condicion || "—").replace(/_/g, " ")}. Una empresa que no esté activa y habida no puede postular ni firmar contratos. Regularizar en SUNAT y volver a verificar.`,
  }).select("id").single();
  if (!pub) return;
  await db.from("publicacion_vinculos").insert({ publicacion_id: pub.id, entidad_tipo: "empresa", entidad_id: emp.id });
  const { data: activos } = await db.from("perfiles").select("id").eq("activo", true).neq("nombre", BOT);
  if (activos?.length) {
    await db.from("notificaciones").insert(activos.map((p: any) => ({
      usuario_id: p.id, publicacion_id: pub.id, tipo: "aviso",
      mensaje: `🏛 SUNAT: ${emp.nombre} pasó a ${(r.estado || "—").replace(/_/g, " ")} · ${(r.condicion || "—").replace(/_/g, " ")}`,
    })));
  }
}

/* Cierra el caso SUNAT abierto de la empresa cuando se regulariza. */
async function cerrarProblemaSunat(db: DB, emp: EmpSunat) {
  await db.from("publicaciones").update({ estado: "resuelta" })
    .eq("titulo", tituloSunat(emp.nombre)).in("estado", ABIERTOS);
}

/* Procesa UNA empresa: consulta, actualiza, deja rastro y abre/cierra el
   problema según corresponda.

   `manual` distingue quién disparó la consulta, y eso cambia qué se registra:
   una persona que aprieta "Verificar" ejecutó un acto y merece su línea en el
   historial —aunque no haya cambiado nada, porque saber que se revisó y salió
   bien ES la información que buscaba—. El cron consultando cada semana no es
   un acto: si registrara siempre, enterraría el historial de cada empresa bajo
   "todo igual" hasta hacerlo inservible. Por eso el bot solo habla si cambió. */
export async function procesarSunatEmpresa(
  db: DB, emp: EmpSunat, autorId: string | null, manual = false
) {
  const r = await consultarRucApi(emp.ruc);
  if (r.error) return { error: r.error };

  const hoy = hoyLima();
  const { error } = await db.from("empresas").update({
    estado_sunat: r.estado || null,
    condicion_sunat: r.condicion || null,
    fecha_verificacion_sunat: hoy,
  }).eq("id", emp.id);
  if (error) return { error: error.message };

  const cambio = (emp.estado_sunat || null) !== (r.estado || null)
    || (emp.condicion_sunat || null) !== (r.condicion || null);
  const malo = esProblematico(r.estado, r.condicion);

  // Rastro: siempre que lo pidió una persona; el bot, solo si cambió algo.
  const ficha = `${(r.estado || "—").replace(/_/g, " ")} · ${(r.condicion || "—").replace(/_/g, " ")}`;
  if (cambio || manual) {
    await db.from("actividad").insert({
      entidad_tipo: "empresa", entidad_id: emp.id,
      // Firmado por quien lo pidió. Antes iba sin actor_id y todo salía como
      // "automática", incluso lo que habías apretado tú.
      actor_id: manual ? autorId : null,
      tipo: manual ? "dato" : "bot",
      detalle: {
        mensaje: manual
          ? `verificó en SUNAT: ${ficha}${cambio ? " (¡cambió!)" : " (sin cambios)"}`
          : `SUNAT cambió: ${ficha}`,
        regla: "sunat_api",
      },
    });
  }
  // ...pero el caso se abre/cierra según el estado ACTUAL, haya cambiado o
  // no: una empresa que ya venía mal también necesita su caso. El
  // deduplicado por título evita que se repita en cada ronda.
  // Solo abrimos caso de empresas de las que somos responsables: propias y
  // activas. De una aliada/externa mantenemos el dato al día (informativo),
  // pero no podemos actuar sobre su SUNAT, así que no exigimos acción.
  // Si deja de ser propia o se cierra, su caso abierto se cierra solo.
  if (malo && esNuestra(emp)) await abrirProblemaSunat(db, emp, r, autorId);
  else await cerrarProblemaSunat(db, emp);

  return { estado: r.estado, condicion: r.condicion, cambio, problematico: malo };
}

/* Ronda completa: todas las empresas activas con RUC. */
export async function correrRondaSunat(db: DB, autorId: string | null) {
  const { data: emps } = await db.from("empresas")
    .select("id,nombre,ruc,estado,relacion,estado_sunat,condicion_sunat")
    // Las que están en proceso de cierre se siguen consultando (el trámite es
    // largo y conviene ver el dato al día), pero no generan caso.
    .in("estado", ["activa", "en_proceso_de_cierre"]).not("ruc", "is", null);

  let ok = 0; const alertas: string[] = []; const fallas: string[] = [];
  for (const emp of emps || []) {
    const r: any = await procesarSunatEmpresa(db, emp as EmpSunat, autorId);
    if (r.error) { fallas.push(`${emp.nombre}: ${r.error}`); continue; }
    ok++;
    if (r.problematico) alertas.push(`${emp.nombre}: ${r.estado} · ${r.condicion}`);
    await new Promise(res => setTimeout(res, 400)); // respirar entre consultas
  }
  return { ok, alertas, fallas };
}
