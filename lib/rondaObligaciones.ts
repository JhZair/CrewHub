/* ══════════════════════════════════════════════════════════════════════════
   EL AVISO QUE SE ABRE SOLO — la ronda diaria de obligaciones

   Todo este módulo existe por una frase: «no las pide nadie y no las asigna
   nadie — vencen». La pantalla de /obligaciones ya enseña el semáforo, pero
   una pantalla solo avisa a quien entra a mirarla, y nadie entra a mirar lo
   que todavía no ha vencido. Esto es lo que convierte una fecha en un trabajo
   con dueño y plazo antes de que sea una multa.

   ── QUÉ HACE ──
   Cada día, para cada obligación activa, busca los periodos sin declarar cuyo
   vencimiento cae dentro de su ventana de aviso (`obligacion.dias_aviso`, hoy
   6 días) y abre UN caso con el responsable de la obligación y el plazo puesto
   en la fecha de vencimiento real.

   ── LAS TRES DECISIONES QUE IMPIDEN QUE ESTO SE VUELVA RUIDO ──

   1. UN CASO POR PERIODO, PARA SIEMPRE. Se guarda en
      `obligacion_periodo.caso_id` y no se vuelve a abrir otro, ni siquiera si
      alguien lo descarta. Descartar es una decisión de una persona; volver a
      abrirlo al día siguiente sería discutir con ella todas las mañanas, y a
      la tercera se ignoran todos los casos del bot — incluidos los que sí
      importaban. La fila sigue en rojo en /obligaciones, que es donde vive el
      hecho.

   2. NO SE MIRA HACIA ATRÁS MÁS DE UN MES. Sin este tope, la primera corrida
      sobre una empresa con historial atrasado abriría veinte casos de golpe
      —Wilkakalle tenía nueve vencidos— y un tablero con veinte casos nuevos el
      mismo día no se lee: se cierra. Lo vencido hace medio año no es una
      alerta, es historia, y ya se ve en la lista.

   3. UN TOPE POR CORRIDA. Si algo sale mal —una migración a medias, una fecha
      corrupta en el calendario— el daño máximo es `TOPE` casos, no doscientos.
      Y se DICE en la respuesta del cron, para que ese tope no pase inadvertido
      como si fuera el final normal del trabajo.

   ── NO CONSULTA A SUNAT ──
   No hace falta: el cronograma ya está cargado como dato (ver
   db/sunat-2026.sql y hermanos) y `vence` está escrito en cada periodo. Esto
   solo lee la base.
   ══════════════════════════════════════════════════════════════════════════ */

import { nombreClase, rotuloPeriodo, DIAS_AVISO } from "@/lib/obligaciones";

type DB = any;

/** Cuántos casos como mucho por corrida. Ver la decisión 3 de la cabecera. */
const TOPE = 12;

/** Cuántos días hacia atrás se sigue considerando «alerta» y no «historia». */
const MIRAR_ATRAS = 31;

/* Los mismos estados que considera viva una publicación en el resto del
   sistema. No se redefine aquí: si algún día se añade uno, se añade en un
   sitio. */
const ABIERTOS = ["abierta", "en_progreso", "seguimiento"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Hoy en Lima. El servidor corre en UTC y a las 19:00 de Perú ya sería el día
 *  siguiente allí: un periodo que vence hoy se leería como vencido ayer. */
export const hoyLima = () =>
  new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

export type ResultadoRonda = {
  abiertos: { periodo: string; empresa: string; vence: string; caso: string }[];
  revisados: number;
  topeAlcanzado: boolean;
  fallas: string[];
};

export async function correrRondaObligaciones(
  db: DB, botId: string | null,
): Promise<ResultadoRonda> {
  const fallas: string[] = [];
  const abiertos: ResultadoRonda["abiertos"] = [];

  if (!botId) {
    /* Sin el bot no hay autor con quien firmar, y `publicaciones.autor_id` no
       admite nulo. Se dice en vez de fallar en silencio: un cron que devuelve
       «0 casos» cuando en realidad no pudo abrir ninguno es indistinguible de
       un día tranquilo. */
    return { abiertos, revisados: 0, topeAlcanzado: false,
      fallas: ["No existe el perfil del bot: no hay con quién firmar los casos."] };
  }

  const hoy = hoyLima();
  const desde = iso(new Date(Date.parse(hoy) - MIRAR_ATRAS * 86400000));

  /* Solo las obligaciones VIVAS y de empresas que hoy deben declarar. Una
     empresa cerrada o sin RUC no tiene nada que vencer, y abrirle un caso sería
     reclamar trabajo que no existe — el mismo criterio que apaga su bloque en
     la pantalla. */
  const { data: obls, error: eO } = await db.from("obligacion")
    .select("id,clase,responsable,dias_aviso,activa,entidad_tipo,entidad_id")
    .eq("activa", true);
  if (eO) return { abiertos, revisados: 0, topeAlcanzado: false, fallas: [eO.message] };

  const idsEmp = [...new Set((obls || [])
    .filter((o: any) => o.entidad_tipo === "empresa")
    .map((o: any) => o.entidad_id))];
  const { data: emps } = idsEmp.length
    ? await db.from("empresas").select("id,nombre,ruc,estado").in("id", idsEmp)
    : { data: [] as any[] };
  const empPorId = new Map((emps || []).map((e: any) => [e.id, e]));

  let revisados = 0;
  let topeAlcanzado = false;

  for (const o of obls || []) {
    const emp: any = empPorId.get(o.entidad_id);
    if (!emp) continue;
    /* Sin RUC no hay vencimiento que valga, y si la empresa no está activa lo
       que debe hacerse con ella es otra cosa, no declarar. */
    if (!String(emp.ruc || "").trim()) continue;
    if (emp.estado && emp.estado !== "activa") continue;

    const dias = Number.isFinite(o.dias_aviso) ? o.dias_aviso : DIAS_AVISO;
    /* La ventana: desde un mes atrás hasta `dias` por delante. El extremo
       derecho es el aviso propiamente dicho; el izquierdo recoge lo que se pasó
       hace poco y todavía se puede regularizar barato. */
    const hasta = iso(new Date(Date.parse(hoy) + dias * 86400000));

    const { data: pers, error: eP } = await db.from("obligacion_periodo")
      .select("id,anio,mes,vence,declarado_en,caso_id")
      .eq("obligacion_id", o.id)
      .is("declarado_en", null)
      .is("caso_id", null)          // ver decisión 1: uno por periodo, y basta
      .not("vence", "is", null)
      .gte("vence", desde).lte("vence", hasta)
      .order("vence");
    if (eP) { fallas.push(`${emp.nombre}: ${eP.message}`); continue; }

    for (const p of pers || []) {
      revisados++;
      if (abiertos.length >= TOPE) { topeAlcanzado = true; break; }
      const r = await abrirCasoDePeriodo(db, botId, o, p, emp, hoy);
      if (r.error) { fallas.push(`${emp.nombre} ${p.anio}-${p.mes}: ${r.error}`); continue; }
      if (r.caso) {
        abiertos.push({
          periodo: rotuloPeriodo(p.anio, p.mes), empresa: emp.nombre,
          vence: p.vence, caso: r.caso,
        });
      }
    }
    if (topeAlcanzado) break;
  }

  return { abiertos, revisados, topeAlcanzado, fallas };
}

/* ── UN PERIODO, UN CASO ──
   Con responsable y plazo, que es lo que distingue un caso de una nota. El
   plazo es la fecha de vencimiento REAL de SUNAT, no «dentro de una semana»:
   el tablero ordena por plazo y una fecha inventada lo desordena todo. */
async function abrirCasoDePeriodo(
  db: DB, botId: string, o: any, p: any, emp: any, hoy: string,
): Promise<{ caso?: string; error?: string }> {
  const rotulo = rotuloPeriodo(p.anio, p.mes);
  const titulo = `📅 ${nombreClase(o.clase)} · ${rotulo} — ${emp.nombre}`;

  /* Cinturón contra el duplicado que `caso_id` no puede ver: si una corrida
     anterior creó el caso y falló justo al guardar el `caso_id`, el periodo
     seguiría en null y mañana se abriría otro. Se busca por título entre los
     casos vivos antes de crear. */
  const { data: ya } = await db.from("publicaciones").select("id")
    .eq("titulo", titulo).in("estado", ABIERTOS).limit(1).maybeSingle();
  if (ya) {
    await db.from("obligacion_periodo").update({ caso_id: ya.id }).eq("id", p.id);
    return {};
  }

  const restan = Math.round((Date.parse(p.vence) - Date.parse(hoy)) / 86400000);
  const cuando = restan > 1 ? `Vence en ${restan} días, el ${dmy(p.vence)}.`
    : restan === 1 ? `Vence MAÑANA, ${dmy(p.vence)}.`
    : restan === 0 ? `Vence HOY, ${dmy(p.vence)}.`
    : `Venció el ${dmy(p.vence)}, hace ${Math.abs(restan)} día(s).`;

  const { data: pub, error } = await db.from("publicaciones").insert({
    autor_id: botId,
    tipo: "tarea",
    /* Vencido es alta; por vencer es media. La prioridad no es decorativa:
       ordena el tablero, y si todo entrara como alta dejaría de ordenar. */
    prioridad: restan < 0 ? "alta" : "media",
    estado: "abierta",
    titulo: titulo.slice(0, 200),
    responsable: o.responsable || null,
    fecha_limite: p.vence,
    cuerpo: [
      `${cuando} Lo abre el sistema porque una declaración no la pide nadie: vence sola.`,
      "",
      `Empresa: ${emp.nombre} · RUC ${emp.ruc}`,
      `Periodo: ${rotulo}`,
      "",
      "Cuando esté presentada, la forma de cerrarlo es importar la constancia en /obligaciones → «Importar de SUNAT». Eso guarda la fecha real y el número de orden; marcarlo a mano deja el ✅ sin nada detrás.",
      "",
      "— Este caso no se vuelve a abrir. Si se descarta, la fila sigue en rojo en /obligaciones, pero nadie recibirá otro aviso.",
    ].join("\n"),
  }).select("id").single();
  if (error || !pub) return { error: error?.message || "no se pudo crear el caso" };

  /* El vínculo con la empresa: sin él, el caso no sale en su ficha y hay que
     acordarse de que existe para encontrarlo. */
  await db.from("publicacion_vinculos").insert({
    publicacion_id: pub.id, entidad_tipo: "empresa", entidad_id: emp.id,
  });

  /* Y el periodo se queda con el caso: es lo que impide el segundo aviso
     mañana, y lo que hace que la fila enseñe 📋 en vez de «＋ caso». */
  const { error: eU } = await db.from("obligacion_periodo")
    .update({ caso_id: pub.id }).eq("id", p.id).select("id");
  if (eU) {
    /* Si esto falla, mañana habría un caso duplicado. Se avisa en la respuesta
       del cron en vez de dejarlo pasar; el cinturón por título de arriba lo
       atrapará, pero conviene saber que hizo falta. */
    return { caso: pub.id, error: `caso creado pero no enlazado al periodo: ${eU.message}` };
  }

  /* Al responsable, si lo hay. Sin responsable el caso existe igual y se ve en
     el tablero — es mejor un caso sin dueño que ningún caso —, pero se nota en
     la respuesta del cron para que alguien le ponga uno. */
  if (o.responsable) {
    await db.from("notificaciones").insert({
      usuario_id: o.responsable, publicacion_id: pub.id, tipo: "asignacion",
      mensaje: `📅 ${rotulo} de ${emp.nombre}: ${cuando.toLowerCase()}`,
    });
  }

  return { caso: pub.id };
}

const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(f ?? "");
};
