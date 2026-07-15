/* Núcleo de la verificación SUNAT, reutilizable por las acciones
   (botón humano) y por el cron semanal. Recibe el cliente Supabase ya
   creado (de usuario o service-role) y quién firma los casos que genere. */

type DB = any; // SupabaseClient (evitamos acoplar tipos entre clientes)

type EmpSunat = {
  id: string; nombre: string; ruc: string;
  estado_sunat?: string | null; condicion_sunat?: string | null;
};

const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];
const tituloSunat = (nombre: string) => `❗ SUNAT: ${nombre}`;
const esProblematico = (estado?: string | null, condicion?: string | null) =>
  (!!estado && estado !== "activo") || condicion === "no_habido";

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
  const { data: activos } = await db.from("perfiles").select("id").eq("activo", true).neq("nombre", "Bot Qhaway");
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

/* Procesa UNA empresa: consulta, actualiza, y si cambió deja rastro +
   abre/cierra el problema según corresponda. */
export async function procesarSunatEmpresa(db: DB, emp: EmpSunat, autorId: string | null) {
  const r = await consultarRucApi(emp.ruc);
  if (r.error) return { error: r.error };

  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await db.from("empresas").update({
    estado_sunat: r.estado || null,
    condicion_sunat: r.condicion || null,
    fecha_verificacion_sunat: hoy,
  }).eq("id", emp.id);
  if (error) return { error: error.message };

  const cambio = (emp.estado_sunat || null) !== (r.estado || null)
    || (emp.condicion_sunat || null) !== (r.condicion || null);
  const malo = esProblematico(r.estado, r.condicion);

  // El historial solo registra cambios reales (sin ruido)...
  if (cambio) {
    await db.from("actividad").insert({
      entidad_tipo: "empresa", entidad_id: emp.id, tipo: "bot",
      detalle: { mensaje: `SUNAT cambió: ${r.estado || "—"} · ${r.condicion || "—"}`, regla: "sunat_api" },
    });
  }
  // ...pero el caso se abre/cierra según el estado ACTUAL, haya cambiado o
  // no: una empresa que ya venía mal también necesita su caso. El
  // deduplicado por título evita que se repita en cada ronda.
  if (malo) await abrirProblemaSunat(db, emp, r, autorId);
  else await cerrarProblemaSunat(db, emp);

  return { estado: r.estado, condicion: r.condicion, cambio, problematico: malo };
}

/* Ronda completa: todas las empresas activas con RUC. */
export async function correrRondaSunat(db: DB, autorId: string | null) {
  const { data: emps } = await db.from("empresas")
    .select("id,nombre,ruc,estado_sunat,condicion_sunat")
    .eq("estado", "activa").not("ruc", "is", null);

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
