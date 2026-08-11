import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { buscadorDe, nrmB, pal, partir } from "@/lib/buscar";
import { contarHijos, colorFamilia, type Familia } from "@/lib/familia";
import { icoTipo } from "@/lib/tipos";
import { icoObjeto, lblObjeto } from "@/lib/objetos";
import { ICO_ENT } from "@/lib/secciones";
import { resolverNombres } from "@/lib/nombres";
import { claseEstado, rotuloEstado } from "@/lib/estados";
import VistaRapida from "@/components/VistaRapida";
import Plegable from "@/components/Plegable";
import Avatar from "@/components/Avatar";
import Miniatura from "@/components/Miniatura";
import { previewCandidates } from "@/lib/drive";
import { TXT } from "@/lib/texto";
import { REL_EMPRESA, EST_EMPRESA, TIPO_COLOR, COLOR_ENTIDAD } from "@/lib/entidades";
import { alertaSunat, empresaDeCasa, empresaViva, textoSunat } from "@/lib/sunat";
import { esProminente } from "@/lib/personas";
import { fmtVence, venceVigencia, vigenciaVencida } from "@/lib/vigencia";
import { fechaLarga, haceOEn } from "@/lib/fechas";
import { rucDePersona } from "@/lib/ruc";
import { urlPlataforma, platPorNombre, PLAT } from "@/lib/plataformas";
import { aplicarPlantilla } from "@/lib/puertas";
import { ejecutando } from "@/lib/fondos";
import BotonFichaSunat from "@/components/BotonFichaSunat";
import Volver from "@/components/Volver";
import BuscadorGlobal from "@/components/BuscadorGlobal";
import OjoCompra from "@/components/OjoCompra";
import { ESTADOS_EQUIPO } from "@/lib/estadosEquipo";
import Link from "next/link";
import { redirect } from "next/navigation";

/* BÚSQUEDA GLOBAL — Qhaway busca en todo el conocimiento:
   casos, comentarios, personas, proyectos, empresas, equipos,
   lugares y convocatorias. Una caja, todo el sistema. */

/* (El mapa de tipos salió a lib/tipos.) */

/* Color de los bloques que NO son entidad (no viven en COLOR_ENTIDAD, para no
   ensuciar ese mapa): son secciones del buscador con vida propia. Se eligen
   fuera de los siete colores de entidad ya usados —azul/violeta/teal/naranja/
   verde/amarillo/rosa— para que cada bloque siga siendo distinguible. */
const COLOR_SECCION: Record<string, string> = {
  credenciales: "var(--red)",   // llaves / seguridad — rojo coral
  repositorio: "#b08968",       // archivo — bronce
  casos: "var(--accent)",       // el trabajo, el «océano» — el morado del sistema
  comentarios: "#22d3ee",       // conversación — cian
};

/* ===== búsqueda por palabras =====
   La frase se parte en palabras (sin conectores) y un registro
   coincide si TODAS aparecen en él, aunque sea en campos distintos:
   «acta compromiso mujeres» encuentra la postulación ganadora de
   Mujeres del Ande porque tiene acta de compromiso. */
/* Un proyecto está vivo si se está moviendo. `estado_actividad` responde eso
   y la `etapa` responde otra cosa —dónde está en su vida—: se puede estar en
   producción y en pausa. Finalizado entra igual: la etapa lo declara terminado
   aunque nadie haya tocado el estado. */
const proyVivo = (p: any) =>
  (p.estado_actividad || "activo") === "activo" && p.etapa !== "finalizado";

const ANIO = new Date().getFullYear();
const HOY_S = new Date().toISOString().slice(0, 10);

/* ¿Queda algo por rendir? Es lo único que mantiene viva a una ganadora vieja:
   mientras no se entregue, el fondo sigue encima aunque el concurso sea de
   hace dos años.

   Antes esto era «mientras el plazo no venza», y se le daba la vuelta al
   revés: una rendición vencida y sin entregar —la peor situación posible
   ante DAFO— se apagaba como historia justo el día que empezaba a doler. La
   regla vive en lib/fondos.ts, donde también la leen /empresas y /qhaway. */
const rendicionPendiente = ejecutando;

/* Una postulación de edición pasada es historia… salvo que aún le deba una
   rendición al Estado. El año solo no alcanza: mide cuándo empezó, no si
   terminó. */
const postViva = (p: any) =>
  !["no_seleccionada", "retirada", "finalista_no_ganadora"].includes(p.estado)
  && ((p.conv?.anio ?? ANIO) >= ANIO || rendicionPendiente(p));

/* Un concurso sigue vivo si está abierto o si todavía se ejecuta un fondo
   suyo. Un 2025 con rendición pendiente NO es edición pasada: es trabajo.
   Y uno cerrado es pasado aunque sea de este año. */
const convViva = (c: any) =>
  !["finalizada", "cancelada"].includes(c.estado)
  && ((c.anio ?? ANIO) >= ANIO || ["abierta", "en_evaluacion", "con_resultados"].includes(c.estado));

const EST_ACT: Record<string, [string, string]> = {
  bloqueado: ["🚧 bloqueado", "var(--red)"],
  en_pausa: ["⏸ en pausa", "var(--blue)"],
  completado: ["✅ completado", "var(--green)"],
};


/* Corta sin partir un emoji. Un emoji ocupa dos unidades UTF-16 (par
   «surrogate»); si el corte cae en medio, queda medio carácter. Ese medio
   carácter se vuelve � (U+FFFD) al serializar el HTML del servidor, mientras el
   cliente conserva la mitad cruda — y React ve dos textos distintos y grita
   «hydration error». Se quitan las mitades sueltas de los extremos: surrogate
   BAJA al inicio, surrogate ALTA al final. */
const sinMedioEmoji = (s: string) =>
  s.replace(/^[\uDC00-\uDFFF]/, "").replace(/[\uD800-\uDBFF]$/, "");

/* recorte con contexto alrededor de la primera palabra coincidente */
function snippet(texto: string | null, palabras: string[]): string {
  if (!texto) return "";
  let i = -1;
  for (const w of palabras) { i = nrmB(texto).indexOf(w); if (i >= 0) break; }
  if (i < 0) return sinMedioEmoji(texto.slice(0, 100)) + (texto.length > 100 ? "…" : "");
  const ini = Math.max(0, i - 50);
  const fin = Math.min(texto.length, i + 80);
  return (ini > 0 ? "…" : "") + sinMedioEmoji(texto.slice(ini, fin)) + (fin < texto.length ? "…" : "");
}

/* La pestaña dice QUÉ buscaste: «🔍 pampacucho». Sin esto, tres buscadores
   abiertos a la vez son tres pestañas idénticas. No cuesta consulta. */
export function generateMetadata({ searchParams }: { searchParams: { q?: string } }): Metadata {
  const q = (searchParams?.q || "").trim();
  return { title: q ? `🔍 ${q}` : "🔍 Buscar" };
}

export default async function Buscar({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams?.q || "").trim();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let casos: any[] = [], coms: any[] = [], pers: any[] = [], proys: any[] = [],
      emps: any[] = [], equis: any[] = [], lugs: any[] = [], convs: any[] = [], postus: any[] = [],
      comps: any[] = [],
      creds: any[] = [], objs: any[] = [];
  let statProy = new Map<string, any>(), statEmp = new Map<string, any>(),
      statConv = new Map<string, any>(), statPers = new Map<string, any>();
  let equisMas = 0, persMas = 0, objsMas = 0;
  // Avatar de la cuenta (login) por id de perfil: la foto de quien no subió una
  // propia (persona.usuario_id) y la del autor de un caso (publicacion.autor_id).
  let avatarDe = new Map<string, string | null>();
  let perfilNom = new Map<string, string>();   // id de perfil → nombre (iniciales)
  // Cartel (póster) de proyectos/empresas/equipos de los resultados — clave `${tipo}:${id}`.
  let carteles = new Map<string, string>();
  // Quién tiene cada equipo ahora (portador) — clave: id de equipamiento.
  let portadorEq = new Map<string, any>();
  // Representante legal por empresa — clave: id de empresa.
  let rlDe = new Map<string, { nombre: string; foto?: string | null }>();
  // Interacción en la bitácora por equipo — clave: id de equipamiento.
  let bitaEq = new Map<string, number>();
  /* Los dos ejes que no se pueden deducir mirando la camara: con QUE ENTRO
     (el combo de compra) y con QUE SALE (los kits). En la lista de
     /equipamiento ya se ven; aqui no, y buscar es justo donde se llega a un
     equipo sin pasar por la lista —o sea, donde peor se nota no tenerlos—.
     Se llenan ANTES del filtro: no solo se pintan, tambien se buscan.
     Clave: id de equipamiento. */
  let comboEq = new Map<string, { codigo?: string | null; nombre: string }>();
  let kitsEq = new Map<string, string[]>();
  /* Título del padre de cada sub-caso encontrado: «Cámara A lista» a secas no
     dice nada — la mitad de un sub-caso es de quién es hijo. */
  let padreDe = new Map<string, string>();
  // Y al revés: cuántos sub-casos tiene un caso, y cuántos ya están cerrados
  let hijosDe = new Map<string, Familia>();
  /* Fuera del `if (q)`: ahí dentro se cargan los resultados, pero se pintan
     más abajo, ya fuera del bloque. */
  let urlSunat: string | undefined;
  const palabras = q ? partir(q) : [];

  if (q) {
    // El mismo motor que usan los seis listados (lib/buscar). Ahora TODO pasa
    // por él: era el único que ignora tildes y sabe quechua, y sin embargo
    // había un ilike de Postgres decidiendo antes qué le llegaba.
    const coincide = buscadorDe(q);

    /* ⚠ CASOS Y COMENTARIOS: se traen y se filtran en JS, como TODO lo demás
       de esta página. Antes eran los dos únicos con pre-filtro `.or(ilike)`
       en la base, y ése era el agujero:

       1. TILDES. `partir()` quita las tildes de lo que escribes («cámara» →
          «camara»), pero el ILIKE de Postgres SÍ las distingue: `'Cámara A'
          ILIKE '%camara%'` es FALSO. Nada con tilde en el título se podía
          encontrar. El motor de lib/buscar sí ignora tildes —y sabe quechua—
          pero nunca llegaba a ver lo que el pre-filtro ya había tirado.
       2. ESTADO Y TIPO. El pre-filtro solo mira título y cuerpo, así que
          «en progreso» o «aviso» no traían nada aunque el filtro de JS de
          abajo sepa buscarlos. El comentario viejo documentaba este hueco y
          lo daba por bueno.

       El pre-filtro existía «para tablas grandes». Pero `personas` (600),
       `credenciales` (600) y `equipamiento` (600) ya se traen enteras: aquí
       el pajar lo arma el servidor y al navegador solo viajan 12 resultados.
       Somos seis personas; si algún día esto pesa, el arreglo de verdad es
       `unaccent` con índice en Postgres, no un ilike que miente. */
    const [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13] = await Promise.all([
      supabase.from("publicaciones")
        // padre_id: un sub-caso sin su padre es un título huérfano
        // autor_id: para pintar la cara de quien lo creó
        .select("id,titulo,cuerpo,tipo,estado,creado_en,padre_id,autor_id")
        // Las notas del muro solo viven en su proyecto: no salen en la búsqueda global.
        .neq("tipo", "bitacora")
        .order("creado_en", { ascending: false }).limit(1500),
      /* `objeto_id` + el título del objeto: un comentario ya no cuelga solo de
         un caso. Sin esto, un comentario sobre un libro del repositorio salía
         en los resultados enlazando a /caso/null —404— y firmado «en «»». */
      supabase.from("comentarios")
        .select("id,cuerpo,creado_en,publicacion_id,objeto_id,autor:perfiles(nombre,avatar_url),pub:publicaciones(titulo),obj:objetos(titulo)")
        .order("creado_en", { ascending: false }).limit(1500),
      /* Los CVs viajan con la persona: se guardan por enfoque justo para
         poder pedir "el CV de Yajaida como Investigadora", y hasta hoy no
         había forma de encontrarlos. */
      /* Y sus películas. El buscador encontraba a alguien por su DNI, su RUC
         y su CV — toda su papelería— y no por el documental que dirige. */
      supabase.from("personas")
        /* Los CVs ya no se anidan: viven en `objetos` (tipo='cv'), que cuelga
           por (entidad_tipo, entidad_id) y no tiene FK a personas, así que no
           se puede embeber. Se traen aparte, abajo. */
        .select("id,nombre,alias,rol,tipo,estado,ruc_dni,email,region,dni_url,firma_url,carpeta_drive_url,foto_url,usuario_id,proys:proyecto_equipo(cargo,proy:proyectos(id,nombre,nombre_corto))")
        .limit(600),
      // RENCA, presupuesto y Drive del proyecto: guardados desde siempre y
      // nunca seleccionados aquí
      supabase.from("proyectos")
        .select("id,nombre,nombre_corto,folio,tipo,etapa,estado_actividad,descripcion,renca,renca_url,presupuesto_url,carpeta_drive_url"),
      // RENCA, vigencia y domicilio fiscal ni se seleccionaban: los papeles
      // que deciden si una empresa puede postular eran invisibles al buscador
      /* `estado` es imprescindible: sin él, alertaSunat() da por activa a
         cualquiera y le reclama la SUNAT a una empresa en cierre. */
      supabase.from("empresas")
        .select("id,nombre,razon_social,codigo,ruc,estado,estado_sunat,condicion_sunat,relacion,region,renca,renca_url,vigencia_poder_fecha,vigencia_poder_url,domicilio_fiscal,carpeta_drive_url"),
      supabase.from("equipamiento").select("id,nombre,folio,categoria,subcategoria,estado,descripcion,compra_id").limit(600),
      supabase.from("lugares").select("id,nombre"),
      supabase.from("convocatorias").select("id,codigo,nombre,anio,estado"),
      supabase.from("postulaciones")
        .select("id,codigo,codigo_plataforma,codigo_acta,estado,feedback_jurado,acta_url,matriz_jurado_url,carpeta_drive_url,monto_adjudicado,fecha_limite_rendicion,fecha_prorroga,fecha_rendicion_real,proy:proyectos(nombre),conv:convocatorias(codigo,nombre,anio)"),
      /* Los datos sueltos de cada cuenta (código de afiliación, correo de
         recuperación, N° de contrato...) son justo lo que uno viene a
         buscar meses después. Estaban guardados y no se buscaban. */
      supabase.from("credenciales")
        .select("id,plataforma,identificador,ubicacion,notas,url,metodo_acceso,empresa_id,persona_id,datos:credencial_datos(id,etiqueta,valor)")
        .limit(600),
      /* EL REPOSITORIO. Es la mitad de lo que la productora sabe —el libro que
         sostiene un documental, la referencia que justifica un plano, la nota
         de prensa de hace tres años— y el buscador no lo miraba: se podía
         encontrar a alguien por su DNI y no el material sobre el que trabaja.
         Los CV se excluyen: ya salen colgados de su persona, con su enfoque. */
      /* MISMO orden y MISMO techo que /repositorio: el «ver la lista completa»
         lleva ahí, y si cada página se quedara con 600 filas distintas el
         enlace prometería resultados que el destino no tiene. Allá además se
         ven los CV, así que el destino es un superconjunto — de más, nunca de
         menos. */
      supabase.from("objetos")
        .select("id,tipo,titulo,url,notas,fecha,entidad_tipo,entidad_id")
        .neq("tipo", "cv")
        .order("fecha", { ascending: false, nullsFirst: false })
        .order("creado_en", { ascending: false }).limit(600),
      /* Los COMBOS DE COMPRA. Se busca por el código de la boleta, por lo que
         se compró y por el proveedor: «C-003», «Combo DJI» o «Amazon» son
         justo las tres formas en que alguien vuelve a una compra meses
         después, cuando hay que reclamar una garantía.

         ⚠ VA AL FINAL, y el sitio importa. Este `select` se había colado en
         el puesto 7 y aquí el orden ES el nombre: `Promise.all` reparte por
         posición, así que `c7` pasó a ser `compras` mientras todo lo de abajo
         seguía leyendo `c7` como `lugares`, `c8` como `convocatorias`… y `c12`
         —los combos— como `objetos`. Seis tablas corridas un puesto.
         Y no fallaba: `.filter()` sobre el arreglo equivocado no revienta,
         solo devuelve poco o nada. Lugares, concursos, postulaciones, claves,
         repositorio y combos llevaban desde entonces saliendo mal en la
         búsqueda global sin un solo error en consola. Al añadir aquí, añade
         AL FINAL y sube el número. */
      supabase.from("compras").select("id,codigo,nombre,proveedor,fecha,total,moneda,nota"),
      /* De qué kit sale cada equipo. Con el nombre del kit dentro, para poder
         BUSCAR por él: «kit drone» tiene que traer las once piezas del kit,
         no solo el equipo que se llame «drone». */
      supabase.from("kit_equipos").select("equipamiento_id,kit:kits(id,nombre,retirado_en)"),
    ]);

    // El marcador en los resultados: 🏆 ganados · 🥈 casi · 🎯 intentos
    const [{ data: postStats }, { data: equipoStats }, uSunat, { data: cvObj }, { data: perfAv }] = await Promise.all([
      supabase.from("postulaciones").select("estado,proyecto_id,empresa_id,convocatoria_id"),
      supabase.from("postulacion_equipo").select("persona_id,post:postulaciones(estado)"),
      // El link de SUNAT sale del admin, no del código: si SUNAT lo cambia
      // —lo ha hecho— se corrige ahí sin esperar un deploy.
      urlPlataforma(PLAT.sunatConsultaRuc),
      /* Los CVs, ahora en el repositorio. Sin FK no se pueden anidar en la
         consulta de personas, así que se traen aparte y se cuelgan abajo — si
         no, el buscador se quedaría con la foto del día de la migración. */
      supabase.from("objetos").select("id,entidad_id,titulo,url")
        .eq("entidad_tipo", "persona").eq("tipo", "cv"),
      // Avatares de login: la foto de quien no subió una propia (foto_url) y la
      // del autor de cada caso. El nombre va para las iniciales de respaldo.
      supabase.from("perfiles").select("id,nombre,avatar_url"),
    ]);
    urlSunat = uSunat;
    avatarDe = new Map((perfAv || []).map((p: any) => [p.id, p.avatar_url]));
    perfilNom = new Map((perfAv || []).map((p: any) => [p.id, p.nombre]));
    // `enfoque`: el buscador y sus chips esperan ese nombre desde siempre.
    const cvsDePersona = new Map<string, any[]>();
    (cvObj || []).forEach((o: any) => {
      const l = cvsDePersona.get(o.entidad_id) || [];
      l.push({ id: o.id, enfoque: o.titulo, url: o.url });
      cvsDePersona.set(o.entidad_id, l);
    });
    (c3.data || []).forEach((p: any) => { p.cvs = cvsDePersona.get(p.id) || []; });
    const marca = (key: "proyecto_id" | "empresa_id" | "convocatoria_id") => {
      const m = new Map<string, { t: number; g: number; c: number }>();
      (postStats || []).forEach((p: any) => {
        const id = p[key];
        if (!id) return;
        const s = m.get(id) || { t: 0, g: 0, c: 0 };
        s.t++;
        if (p.estado === "ganadora") s.g++;
        if (p.estado === "finalista_no_ganadora") s.c++;
        m.set(id, s);
      });
      return m;
    };
    statProy = marca("proyecto_id");
    statEmp = marca("empresa_id");
    statConv = marca("convocatoria_id");
    (equipoStats || []).forEach((e: any) => {
      const s = statPers.get(e.persona_id) || { t: 0, g: 0, c: 0 };
      s.t++;
      if (e.post?.estado === "ganadora") s.g++;
      if (e.post?.estado === "finalista_no_ganadora") s.c++;
      statPers.set(e.persona_id, s);
    });

    /* Con los 1500 en mano ya se sabe todo de la familia sin pedir nada más:
       quién es hijo de quién sale del propio `padre_id`. */
    const tituloEn = new Map((c1.data || []).map((p: any) => [p.id, p.titulo]));
    hijosDe = contarHijos(c1.data);

    /* UN SUB-CASO HEREDA EL PAJAR DE SU PADRE.
       Nadie busca «corregir documento de Directora»: se busca «pampacucho»,
       que es de lo que trata. Un sub-caso existe PORQUE cuelga de algo — esa
       es la mitad de lo que es, y sin embargo su pajar solo llevaba lo suyo.
       Palabras de John (17/07): «como buscamos sub-casos rápidamente, ahora
       tenemos que poner algo del título del sub-caso para encontrarlo».
       Ojo: esto ya estaba inventado aquí mismo, dos líneas más abajo — el
       pajar de un comentario lleva el título de SU publicación desde
       siempre. La misma herencia, y los sub-casos no la tenían.

       Todo campo pasa por `pal()`. Esto era `${p.titulo} ${p.cuerpo} ...` en
       crudo, y es justo contra lo que avisa lib/buscar en su cabecera: un
       campo vacío en una plantilla no desaparece, se convierte en el TEXTO
       "null". Un sub-caso nace sin cuerpo, así que su pajar decía
       «Título null tarea abierta» — con la palabra `null` dentro, buscable.
       `pal` además cambia los guiones bajos por espacios: «en_progreso» se
       encuentra escribiendo «en progreso», que es como lo escribe la gente. */
    const marcados = (c1.data || []).map((p: any) => {
      const pajar = pal(p.titulo, p.cuerpo, p.tipo, p.estado);
      const propio = coincide(pajar);
      // Solo se paga el segundo `coincide` si el primero no bastó
      const heredado = !propio && !!p.padre_id
        && coincide(pal(pajar, tituloEn.get(p.padre_id)));
      return { p, propio, heredado };
    }).filter((x: any) => x.propio || x.heredado);

    /* UNA CABEZA DE FAMILIA PESA MÁS QUE SUS HIJOS.
       La herencia de arriba funcionó demasiado bien: al buscar «pampacucho»
       coincidían los DOCE sub-casos de la misma notificación, y como se
       crearon DESPUÉS que ella y el orden es por fecha, llenaban el cupo de
       12 y empujaban al padre fuera. O sea que la notificación —lo que de
       verdad buscabas— era lo único que no salía. Lo dijo John (17/07):
       «salen los sub-casos, pero no sale el caso padre».
         3 · coincide por sí mismo Y tiene hijos entre los resultados
         2 · coincide por sí mismo
         1 · coincide solo porque su padre coincide
       Un hijo que solo coincide por herencia nunca puede tapar a su padre:
       si estás ahí es por él. */
    const conHijoAqui = new Set(marcados.map((x: any) => x.p.padre_id).filter(Boolean));
    const peso = (x: any) => x.propio ? (conHijoAqui.has(x.p.id) ? 3 : 2) : 1;
    marcados.sort((a: any, b: any) =>
      peso(b) - peso(a) || (b.p.creado_en || "").localeCompare(a.p.creado_en || ""));
    casos = marcados.slice(0, 12).map((x: any) => x.p);

    coms = (c2.data || []).filter((c: any) =>
      coincide(pal(c.cuerpo, (c.pub as any)?.titulo))).slice(0, 12);

    /* El título del padre para pintarlo. Casi siempre ya vino en c1; si el
       padre es más viejo que los 1500 se pide aparte — son 12 filas. */
    const idsPadre = [...new Set(casos.map((p: any) => p.padre_id).filter(Boolean))];
    if (idsPadre.length) {
      const faltan = idsPadre.filter((id: any) => !tituloEn.has(id));
      const { data: px } = faltan.length
        ? await supabase.from("publicaciones").select("id,titulo").in("id", faltan)
        : { data: [] };
      (px || []).forEach((p: any) => tituloEn.set(p.id, p.titulo));
      idsPadre.forEach((id: any) => { const t = tituloEn.get(id); if (t) padreDe.set(id, t as string); });
    }
    /* El pajar lleva el número Y la palabra del documento: así «RENCA-1-PJ-…»
       encuentra la empresa, y «renca» sola encuentra a las que lo tienen.
       Un papel se busca de las dos formas: por su código cuando lo tienes a
       mano, y por su nombre cuando solo recuerdas que existe. */
    const docsPersona = (p: any) => [
      (p.cvs || []).length ? `cv hoja de vida ${(p.cvs || []).map((c: any) => c.enfoque).join(" ")}` : "",
      /* La palabra Y el número, como en RENCA. Con solo el número, "ruc john
         oros" no encontraba nada: "ruc" no vivía en ningún pajar.
         Y el RUC de una persona no se guarda —se deduce del DNI—, así que
         buscarlo completo era imposible por diseño. Aquí se calcula. */
      p.ruc_dni ? `dni ${p.ruc_dni}` : "",
      rucDePersona(p.ruc_dni) ? `ruc ${rucDePersona(p.ruc_dni)}` : "",
      p.dni_url ? "dni escaneado" : "",
      p.firma_url ? "firma escaneada" : "",
      p.carpeta_drive_url ? "carpeta drive" : "",
      /* Sus películas. El pajar tenía DNI, RUC, CV, firma y carpeta —toda su
         papelería— y nada de su obra: «Mujeres del Ande» no encontraba a
         Yajaida. Alguien es sus películas antes que sus papeles. */
      ...(p.proys || []).map((r: any) =>
        pal(r.cargo, r.proy?.nombre, r.proy?.nombre_corto)),
    ].filter(Boolean).join(" ");

    const persTodas = (c3.data || [])
      .filter((p: any) => coincide(
        `persona ${p.nombre} ${p.alias} ${p.rol} ${p.ruc_dni} ${p.email || ""} ${p.region} `
        + pal(p.tipo, p.estado, p.equipo) + ` ${docsPersona(p)}`))
      .map((p: any) => ({
        // Qué CV coincidió: sin esto buscas "cv investigadora" y sale una
        // fila con el nombre a secas, sin decirte que lo encontró
        ...p, cvsHit: (p.cvs || []).filter((c: any) => coincide(`cv hoja de vida ${c.enfoque}`)),
      }))
      /* Un puntaje, no una regla suelta: trae el papel que pediste (2), dirige
         algo (2), y es gente del equipo (1). Así arriba queda «del equipo, con
         el CV y dirigiendo», y al final el contacto que solo coincide de
         refilón — que se muestra apagado, no se esconde: buscaste algo y ahí
         está.
         Dirigir pesa igual que el CV: si buscas «narda» probablemente vengas
         por su película, no por su papelería. */
      .sort((a: any, b: any) => {
        const dirige = (x: any) => (x.proys || []).some((r: any) => /direc|codirec/i.test(r.cargo || ""));
        const pt = (x: any) => (x.cvsHit.length ? 2 : 0) + (dirige(x) ? 2 : 0) + (esProminente(x) ? 1 : 0);
        return pt(b) - pt(a) || String(a.nombre).localeCompare(String(b.nombre));
      });
    /* 25, no 10. El corte estaba para que la página no se hiciera eterna,
       pero con 130 personas una búsqueda con dos palabras casi nunca pasa
       de 25 — y "cv pro" daba 13, o sea que el corte solo servía para
       esconder justo lo que se buscaba. */
    pers = persTodas.slice(0, 25);
    persMas = Math.max(0, persTodas.length - 25);
    const docsProyecto = (p: any) => [
      p.renca ? `renca ${p.renca}` : "",
      p.presupuesto_url ? "presupuesto" : "",
      p.carpeta_drive_url ? "carpeta drive" : "",
    ].filter(Boolean).join(" ");
    proys = (c4.data || [])
      .filter((p: any) => coincide(
        // La etapa y el estado también se buscan: "bloqueado", "en pausa",
        // "produccion" son preguntas legítimas y no encontraban nada
        `proyecto ${p.nombre} ${p.nombre_corto} ${p.folio} ${p.descripcion} `
        + pal(p.tipo, p.etapa, p.estado_actividad) + ` ${docsProyecto(p)}`))
      // Lo que no se mueve, abajo
      .sort((a: any, b: any) =>
        (proyVivo(b) ? 1 : 0) - (proyVivo(a) ? 1 : 0)
        || String(a.nombre).localeCompare(String(b.nombre)))
      .slice(0, 10);
    const docsEmpresa = (e: any) => [
      e.renca ? `renca ${e.renca}` : "",
      e.ruc ? `ruc ${e.ruc}` : "",
      e.vigencia_poder_fecha ? "vigencia de poder" : "",
      e.carpeta_drive_url ? "carpeta drive" : "",
    ].filter(Boolean).join(" ");

    /* Se apaga lo que no es cancha de hoy: la que ya no está viva (en cierre,
       cerrada) y la que nunca fue nuestra (externa). Las aliadas se quedan
       encendidas — con ellas sí se postula. */
    const empEnJuego = (e: any) => empresaViva(e) && empresaDeCasa(e);
    emps = (c5.data || []).filter((e: any) => coincide(
      `empresa ${e.nombre} ${e.razon_social} ${e.codigo} ${e.region} ${e.domicilio_fiscal} `
      + pal(e.estado, e.relacion, e.tipo, e.estado_sunat, e.condicion_sunat)
      + ` ${docsEmpresa(e)}`
    )).sort((a: any, b: any) =>
      (empEnJuego(b) ? 1 : 0) - (empEnJuego(a) ? 1 : 0)
      || String(a.nombre).localeCompare(String(b.nombre))
    ).slice(0, 10);
    /* Carteles de los proyectos y empresas que se van a mostrar: un solo query
       por los ids visibles, para adornar sus filas con el póster/logo. */
    {
      const idsMedia = [...proys.map((p: any) => p.id), ...emps.map((e: any) => e.id)];
      if (idsMedia.length) {
        const { data: mm } = await supabase.from("entidad_media")
          .select("entidad_tipo,entidad_id,cartel_url").in("entidad_id", idsMedia);
        (mm || []).forEach((m: any) => {
          if (m.cartel_url) carteles.set(`${m.entidad_tipo}:${m.entidad_id}`, m.cartel_url);
        });
      }
    }
    /* Representante legal de las empresas mostradas: su miembro activo cuyo
       cargo es «representante legal» (prioridad) o presidente/titular/gerente
       —la misma regla que autocompleta el RL en la ficha. */
    {
      const idsEmp = emps.map((e: any) => e.id);
      if (idsEmp.length) {
        const { data: rls } = await supabase.from("empresa_miembros")
          .select("empresa_id,cargo,persona:personas(nombre,alias,foto_url)")
          .in("empresa_id", idsEmp).eq("estado", "activo");
        const prio = (c: string) => /representante/i.test(c) ? 0 : /presidente|titular|gerente/i.test(c) ? 1 : 9;
        const porEmp = new Map<string, any[]>();
        (rls || []).forEach((m: any) => { const l = porEmp.get(m.empresa_id) || []; l.push(m); porEmp.set(m.empresa_id, l); });
        porEmp.forEach((ms, eid) => {
          const r = ms.filter((m: any) => prio(m.cargo || "") < 9).sort((a: any, b: any) => prio(a.cargo || "") - prio(b.cargo || ""))[0];
          const per = r?.persona ? (Array.isArray(r.persona) ? r.persona[0] : r.persona) : null;
          if (per) rlDe.set(eid, { nombre: per.alias || per.nombre, foto: per.foto_url });
        });
      }
    }
    /* Combo y kits de CADA equipo —no solo de los que se pintan—, porque
       entran en el pajar: si se resolvieran después del filtro, los chips se
       verían pero «kit drone» no encontraría nada. Ambas tablas ya vinieron
       enteras arriba; esto es memoria, no consultas. */
    {
      const combosPorId = new Map(((c12 as any)?.data || []).map((c: any) => [c.id, c]));
      (c6.data || []).forEach((e: any) => {
        const cb = e.compra_id ? combosPorId.get(e.compra_id) : null;
        if (cb) comboEq.set(e.id, cb as any);
      });
      ((c13 as any)?.data || []).forEach((r: any) => {
        /* La relación vuelve objeto o arreglo según cómo PostgREST resuelva la
           clave; leer solo una de las dos formas es el fallo que no falla —sale
           vacío y parece que el equipo no está en ningún kit—. */
        const k = Array.isArray(r.kit) ? r.kit[0] : r.kit;
        // Un kit retirado ya no se entrega: ni se pinta ni se busca por él.
        if (!k || k.retirado_en) return;
        kitsEq.set(r.equipamiento_id, [...(kitsEq.get(r.equipamiento_id) || []), k.nombre]);
      });
    }
    const equisTodos = (c6.data || []).filter((e: any) => {
      /* Con QUÉ ENTRÓ y con QUÉ SALE también se busca. Es la forma natural de
         pedir un equipo cuando no recuerdas su nombre: «lo que vino en la
         boleta C-006», «lo del kit de entrevista». */
      const cb = comboEq.get(e.id);
      const extra = pal(
        (kitsEq.get(e.id) || []).length ? `kit ${(kitsEq.get(e.id) || []).join(" ")}` : "",
        cb ? `combo compra ${cb.codigo || ""} ${cb.nombre || ""} ${(cb as any).proveedor || ""}` : "");
      return coincide(
        `equipo ${e.nombre} ${e.folio} ${e.categoria} ${e.subcategoria} ${e.descripcion} `
        + pal(e.estado) + ` ${extra}`);
    });
    equis = equisTodos.slice(0, 15);
    equisMas = Math.max(0, equisTodos.length - 15);
    /* Cartel (miniatura) y portador (quién lo tiene ahora) de los equipos que se
       van a mostrar: para ponerles foto y decir en manos de quién están. */
    if (equis.length) {
      const idsEq = equis.map((e: any) => e.id);
      const [{ data: mmEq }, { data: prEq }] = await Promise.all([
        supabase.from("entidad_media").select("entidad_id,cartel_url").eq("entidad_tipo", "equipamiento").in("entidad_id", idsEq),
        supabase.from("equipo_prestamos").select("equipamiento_id,persona:personas(id,nombre,alias,foto_url)").is("hasta", null).in("equipamiento_id", idsEq),
      ]);
      (mmEq || []).forEach((m: any) => { if (m.cartel_url) carteles.set(`equipamiento:${m.entidad_id}`, m.cartel_url); });
      (prEq || []).forEach((p: any) => { const per = Array.isArray(p.persona) ? p.persona[0] : p.persona; if (per) portadorEq.set(p.equipamiento_id, per); });
      /* Interacción en la bitácora de cada equipo mostrado: comentarios sueltos
         (equipamiento_id) + los de sus usos (prestamo_id → equipo). */
      const [{ data: cbEq }, { data: prsEq }] = await Promise.all([
        supabase.from("comentarios").select("equipamiento_id").in("equipamiento_id", idsEq),
        supabase.from("equipo_prestamos").select("id,equipamiento_id").in("equipamiento_id", idsEq),
      ]);
      (cbEq || []).forEach((c: any) => bitaEq.set(c.equipamiento_id, (bitaEq.get(c.equipamiento_id) || 0) + 1));

      const prestEq = new Map((prsEq || []).map((p: any) => [p.id, p.equipamiento_id]));
      if (prsEq && prsEq.length) {
        const { data: cpEq } = await supabase.from("comentarios").select("prestamo_id").in("prestamo_id", prsEq.map((p: any) => p.id));
        (cpEq || []).forEach((c: any) => { const eid = prestEq.get(c.prestamo_id); if (eid) bitaEq.set(eid, (bitaEq.get(eid) || 0) + 1); });
      }
    }
    lugs = (c7.data || []).filter((l: any) => coincide(`lugar ${l.nombre}`)).slice(0, 6);
    comps = (c12?.data || [])
      .filter((x: any) => coincide(`compra combo ${x.codigo || ""} ${x.nombre} ${x.proveedor || ""} ${x.nota || ""}`))
      .slice(0, 8);

    /* EL REPOSITORIO. Se busca por título, nota, tipo y DE QUIÉN es: «khipu
       jesus» tiene que encontrar el libro aunque la palabra «jesus» no esté
       en su título, igual que una persona se encuentra por su película.
       Los nombres de los dueños se resuelven en una tanda por tabla —no una
       consulta por objeto— con el mismo `nombreDe` de todas las pantallas. */
    {
      const filas = (c11.data || []) as any[];
      const duenos = await resolverNombres(supabase,
        filas.map(o => ({ tipo: o.entidad_tipo, id: o.entidad_id })));
      const objsTodos = filas
        .map(o => ({ ...o, dueno: duenos.get(`${o.entidad_tipo}:${o.entidad_id}`) || "" }))
        /* Sin la palabra «repositorio» en el pajar: la metía SOLO esta página, así
           que buscarla aquí devolvía todo y en el destino, nada. */
        .filter(o => coincide(pal(o.titulo, o.notas, lblObjeto(o.tipo), o.dueno)));
      objs = objsTodos.slice(0, 10);
      // El listado global busca con el mismo motor, así que «ver todo» cumple.
      objsMas = Math.max(0, objsTodos.length - 10);
    }
    // Las ediciones vivas arriba; las pasadas, abajo y apagadas
    convs = (c8.data || []).filter((c: any) => coincide(
      `convocatoria concurso ${c.codigo} ${c.nombre} ${c.anio} ` + pal(c.estado)))
      .sort((a: any, b: any) =>
        (convViva(b) ? 1 : 0) - (convViva(a) ? 1 : 0) || (b.anio || 0) - (a.anio || 0))
      .slice(0, 6);
    postus = (c9.data || []).filter((p: any) => coincide(
      `postulacion ${p.codigo} ${p.codigo_plataforma} ${p.codigo_acta} ${pal(p.estado)} ${p.feedback_jurado} ` +
      `${(p.proy as any)?.nombre} ${(p.conv as any)?.codigo} ${(p.conv as any)?.nombre} ${(p.conv as any)?.anio} ` +
      `${p.codigo_acta || p.acta_url ? "acta de compromiso" : ""} ${p.fecha_limite_rendicion ? "rendicion" : ""} ` +
      `${p.matriz_jurado_url ? "matriz jurado" : ""} ${p.carpeta_drive_url ? "carpeta drive" : ""} ` +
      `${p.estado === "ganadora" ? "ganadora fondo estimulo" : ""}`
    )).sort((a: any, b: any) =>
      (postViva(b) ? 1 : 0) - (postViva(a) ? 1 : 0)
      || ((b.conv as any)?.anio || 0) - ((a.conv as any)?.anio || 0))
      .slice(0, 8);

    // Credenciales: inventario de accesos (plataforma, usuario, dónde vive la clave)
    const empMap = new Map((c5.data || []).map((e: any) => [e.id, e.nombre]));
    const persMap = new Map((c3.data || []).map((p: any) => [p.id, p.nombre]));
    /* El dueño, para el pajar — aparte del de arriba, que es para mostrar.
     *
     * Una credencial es «la de Kawsaycha» antes que «la de DAFO»: uno busca
     * por la empresa, no por la plataforma. Y su pajar tenía plataforma,
     * usuario, ubicación, notas… y nunca de quién era. Así, buscar el nombre
     * de una empresa encontraba la empresa y no sus llaves.
     *
     * Van también razón social, código y RUC: son las otras formas de llamar
     * a la misma empresa, y el que busca usa la que tiene a mano. */
    const empPajar = new Map((c5.data || []).map((e: any) =>
      [e.id, pal(e.nombre, e.razon_social, e.codigo, e.ruc)]));
    const persPajar = new Map((c3.data || []).map((p: any) =>
      [p.id, pal(p.nombre, p.alias, p.ruc_dni)]));
    const duenoPajar = (c: any) =>
      (c.empresa_id ? empPajar.get(c.empresa_id) : persPajar.get(c.persona_id)) || "";
    const textoDatos = (c: any) =>
      (c.datos || []).map((d: any) => `${d.etiqueta} ${d.valor}`).join(" ");
    /* Las puertas ANTES de filtrar, no después: "renta anual" y
       "declaraciones y pagos" son los nombres por los que uno busca —el que
       va a declarar el IGV no piensa "SUNAT", piensa "declaraciones"—. Si se
       colgaran después, saldrían en la fila pero no la encontrarían. */
    const mapaPlat = await platPorNombre();
    const platDe = (c: any) => mapaPlat.get(String(c.plataforma || "").trim().toLowerCase());
    const puertasDe = (c: any) => platDe(c)?.puertas || [];
    const textoPuertas = (c: any) =>
      puertasDe(c).map((q: any) => `${q.titulo} ${q.notas || ""}`).join(" ");
    creds = (c10.data || [])
      .filter((c: any) => coincide(pal(
        "credencial acceso clave usuario",
        // De quién es: es la primera forma de buscarla
        duenoPajar(c),
        c.plataforma, c.identificador, c.ubicacion, c.notas, c.metodo_acceso,
        // El dominio también se busca: a veces recuerdas la web, no el nombre
        c.url, textoDatos(c), textoPuertas(c))))
      .map((c: any) => {
        const dueno = c.empresa_id ? "empresa" : "persona";
        const duenoId = c.empresa_id || c.persona_id;
        const duenoNombre = c.empresa_id ? empMap.get(c.empresa_id) : persMap.get(c.persona_id);
        /* Qué dato concreto coincidió: sin esto, buscas un código de
           afiliación y te sale una fila «DAFO-Estímulos» sin decirte que lo
           encontró — y no sabrías si es lo que buscabas. */
        const golpes = (c.datos || []).filter((d: any) => coincide(`${d.etiqueta} ${d.valor}`));
        /* El link se resuelve aquí, no se copió al guardar. Propia >
           calculada del identificador > la de su plataforma: lo dicho gana a
           lo deducido, y lo deducido a lo genérico. */
        const pl = platDe(c);
        return {
          ...c, dueno, duenoId, duenoNombre, golpes,
          url: c.url || aplicarPlantilla(pl?.plantilla, c.identificador) || pl?.url || null,
          puertas: puertasDe(c),
        };
      }).slice(0, 10);
  }

  /* `objs` cuenta como cualquier otra sección. Sin sumarlo, una búsqueda que
     solo acierta en el repositorio pintaba «nada — prueba con menos palabras»
     con los resultados justo debajo: el buscador desmintiéndose a sí mismo. */
  const total = casos.length + coms.length + pers.length + proys.length
    + emps.length + equis.length + lugs.length + convs.length + postus.length + creds.length
    + objs.length;

  /* `mas` no es decoración: una sección que corta y no lo dice te hace creer
     que lo que buscabas no existe.
     `verTodo` SOLO se pasa cuando esa página busca lo mismo que aquí. El de
     personas mandaba a /personas?q=…, que no mira los CVs: prometía el resto
     y entregaba cero. Un enlace que miente es peor que no tenerlo. */
  /* Cada sección se puede plegar, con memoria (localStorage) por sección: si lo
     que buscas no salió arriba, cierras Personas y Casos y dejas a la vista lo
     que sí importa, y la próxima búsqueda respeta esa decisión. Nivel 2: sin
     caja, solo cabecera con flecha — no engorda la página. La `k` es la clave
     de memoria, estable por sección (no el título, que lleva emoji). */
  const Seccion = ({ titulo, k, n, mas, verTodo, tinte, children }: any) => n > 0 ? (
    <Plegable id={`busc:${k}`} nivel={2} tinte={tinte} titulo={
      <>{titulo} · {n}
        {mas > 0 && <span style={{ color: "var(--yellow)", fontWeight: 400 }}> de {n + mas}</span>}</>
    }>
      {/* Envoltorio para que las filas NO sean hijas directas de .plg-cuerpo:
          la regla `.plg-cuerpo>.card` les quitaría borde y fondo (existe para
          no doblar cajas cuando dentro va una sola tarjeta). */}
      <div>
        {children}
        {mas > 0 && (verTodo ? (
          <Link href={verTodo} style={{ color: "var(--violet)", fontSize: TXT.base, fontWeight: 600, display: "block", padding: "4px 2px" }}>
            … y {mas} más — ver la lista completa →
          </Link>
        ) : (
          <span style={{ color: "var(--dim)", fontSize: TXT.base, display: "block", padding: "4px 2px" }}>
            … y {mas} más — agrega una palabra para acotar
          </span>
        ))}
      </div>
    </Plegable>
  ) : null;

  /* Insignias del marcador: 🏆 ganados · 🥈 casi · 🎯 intentos */
  const Marca = ({ s }: { s?: { t: number; g: number; c: number } }) => !s?.t ? null : (
    <span style={{ display: "inline-flex", gap: 5 }}>
      {s.g > 0 && <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)", fontSize: TXT.chip }}>🏆 {s.g}</span>}
      {s.c > 0 && <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)", fontSize: TXT.chip }}>🥈 {s.c}</span>}
      <span className="badge" style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)", fontSize: TXT.chip }}>🎯 {s.t}</span>
    </span>
  );

  /* La fila entera es clickable, pero el <Link> NO envuelve el contenido:
     va como una capa que cubre la tarjeta. Envolviéndolo, cualquier enlace
     de adentro —el CV, por ejemplo— quedaba <a> dentro de <a>: HTML no lo
     permite, el navegador reacomoda el árbol al parsear y React falla la
     hidratación porque el DOM ya no es el que mandó el servidor.
     Con la capa, lo que quiera su propio clic solo necesita `fila-encima`. */
  /* `tenue`: existe, pero hoy no te toca — una empresa en cierre, alguien
     que no es del equipo. No se esconde (buscaste algo y ahí está), pero se
     apaga y se va abajo. Al pasar el cursor se prende. Mismo gesto que las
     empresas candidatas y los concursos donde nunca postulamos. */
  // `resaltar`: al revés de `tenue` — pide un poco de atención (en uso, en
  // reparación). Un filo de color a la izquierda y un tinte muy leve; nada más.
  const RES: Record<string, [string, string]> = Object.fromEntries(
    ESTADOS_EQUIPO.filter(e => e.tinte).map(e => [e.k, [e.color, e.tinte] as [string, string]]));
  const Fila = ({ href, children, docs, tenue, resaltar, avatar }: any) => {
    const contenido = (
      <>
        <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", fontSize: TXT.base }}>
          {children}
        </div>
        {/* Segunda línea: los papeles, todos clickables. Arriba, quién es;
            abajo, con qué se le abre la puerta a un fondo. */}
        {docs && <div className="fila-docs">{docs}</div>}
      </>
    );
    /* SIN `href` la fila no se enlaza. Un combo de compra no tiene página
       —se abre con el ⚡, que es una vista al vuelo— y la fila se pintaba
       igual: `<Link href={undefined}>`, que en desarrollo revienta la página
       entera con «The prop `href` expects a string». Y no se veía, porque la
       sección de combos leía la tabla equivocada y nunca pintaba una fila; al
       arreglar aquello salió esto. Segundo fallo escondido detrás del mismo.
       Sin enlace tampoco se finge que se puede pulsar: ni la capa que cubre
       la fila, ni `link`, ni el cursor de mano. */
    const clases = `card${href ? " link" : ""} fila-cap${tenue ? " fila-tenue" : ""}`;
    return (
      <div className={clases}
        style={{ cursor: href ? "pointer" : "default", padding: "8px 13px", marginBottom: 7,
          ...(resaltar && RES[resaltar] ? { borderLeft: `3px solid ${RES[resaltar][0]}`, background: RES[resaltar][1] } : {}) }}>
        {href && <Link href={href} className="fila-cubre" aria-label="Abrir" />}
        {/* Con `avatar`, la foto va como columna izquierda que ocupa las dos
            líneas (nombre + papeles) — así se aprovecha el alto de la fila. */}
        {avatar ? (
          <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
            {avatar}
            <div style={{ flex: 1, minWidth: 0 }}>{contenido}</div>
          </div>
        ) : contenido}
      </div>
    );
  };

  /* Póster/logo de una entidad (proyecto o empresa) si tiene cartel cargado;
     si no, null (la fila queda igual). Mismo estilo que en la trayectoria. */
  const poster = (tipo: string, id: string, size = 38) => {
    const u = carteles.get(`${tipo}:${id}`);
    if (!u) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={u} alt="" className="tr-poster" referrerPolicy="no-referrer"
      style={{ width: size, height: size }} />;
  };
  /* Avatar de columna (proyecto/empresa) a 60px, como la foto de persona: su
     cartel/logo si lo tiene, o un ícono de relleno —siempre ocupa el alto de la
     fila, nunca un hueco. */
  const avatarEntidad = (tipo: string, id: string, icono: string, size = 60) => {
    const u = carteles.get(`${tipo}:${id}`);
    return u
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={u} alt="" className="tr-poster" referrerPolicy="no-referrer" style={{ width: size, height: size }} />
      : <span className="tr-poster" style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.45, background: "var(--bg)" }}>{icono}</span>;
  };
  /* Miniatura de equipo: su cartel si lo tiene, o un 🎥 de relleno —el equipo
     SIEMPRE lleva imagen en la lista, aunque nadie haya subido una. */
  const posterEq = (id: string, size = 38) => {
    const u = carteles.get(`equipamiento:${id}`);
    return u
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={u} alt="" className="tr-poster" referrerPolicy="no-referrer" style={{ width: size, height: size }} />
      : <span className="tr-poster" style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, background: "var(--bg)" }}>🎥</span>;
  };
  // Avatar chico del portador (con relleno 👤 si no tiene foto).
  const miniPersona = (url: string | undefined, size = 22) => (
    <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: "var(--bg)", border: "1px solid var(--border2)", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", verticalAlign: "middle" }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: size * 0.5 }}>👤</span>}
    </span>
  );

  /* Chip de documento: si hay link, va al papel; si no, se muestra apagado
     —que el dato exista y el archivo no es información, no un hueco que
     esconder. `fila-encima` lo levanta sobre la capa clickable de la fila. */
  const Doc = ({ href, color = "var(--teal)", titulo, children, tenue }: any) => href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={titulo}
      className="badge fila-encima"
      style={{
        // `tenue`: teal apagado, igual que el chip de RUC (BotonFichaSunat), para
        // que no compita con los datos que sí importan.
        color: tenue ? "rgba(45,212,191,.7)" : color,
        background: tenue ? "rgba(45,212,191,.07)" : (color === "var(--teal)" ? "rgba(45,212,191,.12)" : "rgba(167,139,250,.12)"),
        textTransform: "none", letterSpacing: 0,
      }}>
      {children} ↗
    </a>
  ) : (
    <span className="badge" title={titulo ? `${titulo} — sin archivo cargado` : "Sin archivo cargado"}
      style={{ color: "var(--dim)", background: "#1c1c2c", textTransform: "none", letterSpacing: 0 }}>
      {children}
    </span>
  );

  return (
    <div className="shell">
      {/* La caja no se mueve: cabecera pegajosa mientras recorres resultados.
          Va en su propia fila y centrada: la nav de secciones creció y la
          empujaba contra la esquina, hasta partir en dos líneas justo lo
          único que se usa en esta pantalla. */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "var(--bg)", paddingBottom: 10 }}>
        <div className="topbar">
          <Volver />
          <span className="spacer" />
          {q && (
            <span style={{ color: "var(--muted)", fontSize: TXT.meta }}>
              🤖 {total ? `${total} resultado${total === 1 ? "" : "s"}` : "nada — prueba con menos palabras"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 4px" }}>
          <div style={{ width: "100%", maxWidth: 660 }}>
            <BuscadorGlobal inicial={q} autoEnfoque grande />
          </div>
        </div>
      </div>

      {/* Entidades primero: son la respuesta corta. Los casos, el océano, al final. */}
      {/* Sin verTodo: /personas no busca CVs, así que enlazar allá sería
          mandarte a una lista vacía */}
      <Seccion titulo="👤 Personas" k="personas" n={pers.length} mas={persMas} tinte={COLOR_ENTIDAD.persona}>
        {pers.map((p: any) => (
          <Fila key={p.id} href={`/entidad/persona/${p.id}`}
            // No es gente principal (equipo ni actor social): sigue ahí, pero apagado
            tenue={!esProminente(p)}
            // La cara como columna izquierda: ocupa el alto de la fila (nombre +
            // papeles), aprovechando el doble espacio que ya tenía la tarjeta.
            avatar={<Avatar nombre={p.nombre} src={p.foto_url || avatarDe.get(p.usuario_id)} size={60} />}
            docs={
              <>
                {/* Sus películas PRIMERO, antes que los papeles. Esta línea es
                    «todo lo clickable de una persona», y hasta hoy era su DNI,
                    su RUC, su CV, su firma y su carpeta — su papelería entera y
                    ni una obra. Alguien es sus películas antes que sus
                    trámites; el orden de la fila debería decirlo. */}
                {(p.proys || []).filter((r: any) => r.proy).map((r: any, i: number) => {
                  const dir = /direc|codirec/i.test(r.cargo || "");
                  return (
                    <Link key={i} href={`/entidad/proyecto/${r.proy.id}`}
                      className="badge fila-encima" title={`${r.cargo} · ${r.proy.nombre}`}
                      style={{
                        color: dir ? "var(--accent)" : "var(--muted)",
                        background: dir ? "rgba(124,92,255,.14)" : "#1c1c2c",
                        fontWeight: dir ? 700 : 400,
                        textTransform: "none", letterSpacing: 0, textDecoration: "none",
                      }}>
                      {dir ? "🎬 " : "📁 "}{r.proy.nombre_corto || r.proy.nombre}
                      {!dir && <i style={{ opacity: .6, fontStyle: "normal" }}> · {r.cargo}</i>} ↗
                    </Link>
                  );
                })}
                {/* El número enlaza a su escaneo; el botón abre SUNAT */}
                {p.ruc_dni && <Doc href={p.dni_url} titulo="DNI escaneado">🪪 DNI {p.ruc_dni}</Doc>}
                {/* El RUC no se guarda: sale del DNI. Vivía solo en su ficha,
                    y es el número que hace falta para verificar en SUNAT. */}
                {rucDePersona(p.ruc_dni) && (
                  <BotonFichaSunat numero={rucDePersona(p.ruc_dni)!} tipo="RUC"
                    compacto nota="se calcula del DNI" url={urlSunat} />
                )}
                {(p.cvs || []).map((c: any) => (
                  <Doc key={c.id} href={c.url} titulo={`CV con enfoque ${c.enfoque}`}>
                    📋 CV {c.enfoque}
                  </Doc>
                ))}
                {p.firma_url && <Doc href={p.firma_url} titulo="Firma escaneada">✍ Firma</Doc>}
                {p.carpeta_drive_url && (
                  <Doc href={p.carpeta_drive_url} color="var(--violet)" titulo="Carpeta en Drive">📁 Drive</Doc>
                )}
              </>
            }>
            <b>{p.nombre}</b>
            {p.rol && <span style={{ color: "var(--muted)", fontSize: TXT.meta }}>{p.rol.slice(0, 50)}</span>}
            <Marca s={statPers.get(p.id)} />
            <span style={{ flex: 1 }} />
            <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.tipo}</span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="🔑 Credenciales" k="credenciales" n={creds.length} tinte={COLOR_SECCION.credenciales}>
        {creds.map((c: any) => (
          <Fila key={c.id} href={`/entidad/${c.dueno}/${c.duenoId}`}
            docs={
              <>
                {/* La puerta primero: es a lo que se viene cuando buscas una
                    credencial. Sin link, se dice —el hueco es el dato. */}
                {c.url ? (
                  <Doc href={c.url} color="var(--violet)" titulo={`Entrar a ${c.plataforma}`}>
                    🔗 Entrar a {c.plataforma}
                  </Doc>
                ) : (
                  <span className="badge" title="Nadie cargó el link de esta plataforma"
                    style={{ color: "var(--dim)", background: "#1c1c2c", textTransform: "none", letterSpacing: 0 }}>
                    🔗 sin link
                  </span>
                )}
                {/* Las otras entradas de la misma cuenta: la Clave SOL abre
                    en tres sitios y el link de arriba es solo el menú
                    general. Quien busca "clave sol" a las 8 de la mañana va
                    a declarar, no a mirar el menú. */}
                {(c.puertas || []).map((q: any) => (
                  <Doc key={q.id} href={q.url} color="var(--violet)" titulo={q.notas || `Entrar a ${q.titulo}`}>
                    ↗ {q.titulo}
                  </Doc>
                ))}
                {c.ubicacion && (
                  <span className="badge" title="Dónde vive la contraseña real"
                    style={{ color: "var(--muted)", background: "#1c1c2c", textTransform: "none", letterSpacing: 0 }}>
                    🔒 {c.ubicacion}
                  </span>
                )}
                {/* El dato que hizo el match: buscas un código de afiliación
                    y aquí se ve cuál encontró */}
                {(c.golpes || []).map((d: any) => (
                  <span key={d.id} className="badge"
                    style={{ color: "var(--teal)", background: "rgba(45,212,191,.12)", textTransform: "none", letterSpacing: 0 }}>
                    {d.etiqueta}: <b>{d.valor || "—"}</b>
                  </span>
                ))}
              </>
            }>
            <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{c.plataforma}</span>
            {c.identificador && <b>{c.identificador}</b>}
            {c.metodo_acceso && (
              <span style={{ color: "var(--dim)", fontSize: TXT.micro }}>{c.metodo_acceso}</span>
            )}
            <span style={{ flex: 1 }} />
            {c.duenoNombre && <span style={{ color: "var(--muted)", fontSize: TXT.meta }}>{c.dueno === "empresa" ? "🏢" : "👤"} {c.duenoNombre}</span>}
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="📁 Proyectos" k="proyectos" n={proys.length} tinte={COLOR_ENTIDAD.proyecto}>
        {proys.map((p: any) => (
          <Fila key={p.id} href={`/entidad/proyecto/${p.id}`}
            // Solo lo que se mueve va encendido. Lo demás sigue ahí, apagado.
            tenue={!proyVivo(p)}
            avatar={avatarEntidad("proyecto", p.id, "📁")}
            docs={(p.renca || p.presupuesto_url || p.carpeta_drive_url) ? (
              <>
                {p.renca && <Doc href={p.renca_url} titulo="Constancia RENCA del proyecto">🎬 {p.renca}</Doc>}
                {p.presupuesto_url && <Doc href={p.presupuesto_url} titulo="Presupuesto">💰 Presupuesto</Doc>}
                {p.carpeta_drive_url && (
                  <Doc href={p.carpeta_drive_url} color="var(--violet)" titulo="Carpeta en Drive">📁 Drive</Doc>
                )}
              </>
            ) : null}>
            <b>{p.nombre}</b>
            {p.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.folio}</span>}
            {p.tipo && (
              <span className="badge" style={{
                color: TIPO_COLOR[p.tipo] || "var(--muted)",
                background: `${TIPO_COLOR[p.tipo] || "#8b8ba3"}1c`,
              }}>{p.tipo.replace(/_/g, " ")}</span>
            )}
            {/* El estado de actividad, que faltaba: es lo que dice si se
                mueve, y por tanto por qué la fila está apagada. Etapa y
                estado son dos preguntas distintas — se puede estar en
                producción y en pausa — así que van los dos. */}
            {EST_ACT[p.estado_actividad] && (
              <span className="badge" style={{
                color: EST_ACT[p.estado_actividad][1],
                background: `${EST_ACT[p.estado_actividad][1] === "var(--red)" ? "rgba(255,77,94,.12)"
                  : EST_ACT[p.estado_actividad][1] === "var(--blue)" ? "rgba(59,130,246,.12)"
                  : "rgba(46,204,113,.12)"}`,
              }}>{EST_ACT[p.estado_actividad][0]}</span>
            )}
            <Marca s={statProy.get(p.id)} />
            <span style={{ flex: 1 }} />
            <span style={{ color: "var(--dim)", fontSize: TXT.meta }}>{p.etapa?.replace(/_/g, " ")}</span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="🏢 Empresas" k="empresas" n={emps.length} tinte={COLOR_ENTIDAD.empresa}>
        {emps.map((e: any) => (
          <Fila key={e.id} href={`/entidad/empresa/${e.id}`}
            // Apagada si ya no está viva (en cierre) o si nunca fue nuestra
            // (externa). La aliada se queda: con ella sí se postula.
            tenue={!empresaViva(e) || !empresaDeCasa(e)}
            avatar={avatarEntidad("empresa", e.id, "🏢")}
            docs={
              <>
                {e.ruc && <BotonFichaSunat numero={e.ruc} tipo="RUC" compacto url={urlSunat} />}
                {/* RENCA y vigencia tienen su PDF guardado y los pintaba como
                    texto muerto: el papel estaba a un clic y no se ofrecía. */}
                {e.renca && (
                  <Doc href={e.renca_url} titulo="Constancia RENCA" tenue>🎬 {e.renca}</Doc>
                )}
                {e.vigencia_poder_fecha && (() => {
                  /* Vencida en rojo SOLO si no tiene RENCA. La vigencia sirve
                     para pedir el RENCA; con el RENCA en mano ya cumplió, y
                     pintarla de rojo manda a alguien a SUNARP a sacar un papel
                     que no le hace falta. Con el RENCA pendiente, en cambio,
                     es el trámite que hay que hacer primero. */
                  const estorba = vigenciaVencida(e.vigencia_poder_fecha) && !e.renca;
                  return (
                  <a href={e.vigencia_poder_url || undefined}
                    target={e.vigencia_poder_url ? "_blank" : undefined} rel="noopener noreferrer"
                    title={`Emitida el ${fechaLarga(e.vigencia_poder_fecha)} · ${haceOEn(e.vigencia_poder_fecha)}`
                      + `. Vale 90 días, así que ${vigenciaVencida(e.vigencia_poder_fecha)
                        ? `venció el ${fechaLarga(venceVigencia(e.vigencia_poder_fecha))}`
                        : `vence el ${fechaLarga(venceVigencia(e.vigencia_poder_fecha))}`}`
                      + (estorba ? ". Sin RENCA y sin vigencia vigente no se puede ni pedirlo."
                        : e.renca ? ". No estorba: con el RENCA ya sacado, la vigencia cumplió su trabajo." : "")
                      + `${e.vigencia_poder_url ? "" : " — sin archivo cargado"}`}
                    className={`badge${e.vigencia_poder_url ? " fila-encima" : ""}`}
                    style={{
                      color: estorba ? "var(--red)" : "var(--muted)",
                      background: estorba ? "rgba(255,77,94,.12)" : "#1c1c2c",
                      textTransform: "none", letterSpacing: 0,
                    }}>
                    📜 {vigenciaVencida(e.vigencia_poder_fecha)
                      ? "vigencia vencida" : `vigencia vence ${fmtVence(e.vigencia_poder_fecha)}`}
                    {e.vigencia_poder_url ? " ↗" : ""}
                  </a>
                  );
                })()}
                {e.carpeta_drive_url && (
                  <Doc href={e.carpeta_drive_url} color="var(--violet)" titulo="Carpeta en Drive">📁 Drive</Doc>
                )}
              </>
            }>
            <b>{e.nombre}</b>
            {/* De quién es y cómo está: sin esto, "⚠ SUNAT" en una empresa
                externa o en cierre parece un pendiente tuyo, y no lo es. */}
            {e.relacion && (
              <span className="badge" style={{ color: REL_EMPRESA[e.relacion]?.[1] || "var(--dim)", background: "#1c1c2c" }}>
                {REL_EMPRESA[e.relacion]?.[0] || e.relacion}
              </span>
            )}
            {e.estado && (
              <span className="badge" style={{ color: EST_EMPRESA[e.estado]?.[1] || "var(--dim)", background: "#1c1c2c" }}>
                {EST_EMPRESA[e.estado]?.[0] || e.estado.replace(/_/g, " ")}
              </span>
            )}
            {/* Razón social recortada (title = completa): ocupa poco y deja aire
                para el dato que más interesa aquí, el representante legal. */}
            {e.razon_social && (
              <span title={e.razon_social}
                style={{ color: "var(--dim)", fontSize: TXT.meta, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.razon_social}
              </span>
            )}
            {rlDe.get(e.id) && (
              <span className="badge" title="Representante legal"
                style={{ color: "var(--teal)", background: "rgba(45,212,191,.12)", textTransform: "none", letterSpacing: 0, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
                {miniPersona(rlDe.get(e.id)!.foto || undefined, 18)} {rlDe.get(e.id)!.nombre}
              </span>
            )}
            <Marca s={statEmp.get(e.id)} />
            {/* La regla compartida, no otra copia: solo alerta si es nuestra,
                está activa, y de verdad está mal (incluye "no habido"). */}
            {alertaSunat(e) && (
              <span className="badge" title={`SUNAT: ${textoSunat(e)}`}
                style={{ color: "var(--red)", background: "rgba(255,77,94,.12)" }}>
                ⚠ {textoSunat(e)}
              </span>
            )}
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="🎥 Equipos" k="equipos" n={equis.length} mas={equisMas}
        verTodo={`/equipamiento?q=${encodeURIComponent(q)}`} tinte={COLOR_ENTIDAD.equipamiento}>
        {equis.map((e: any) => {
          const per = portadorEq.get(e.id);
          const nBita = bitaEq.get(e.id) || 0;
          const cb = comboEq.get(e.id);
          const misKits = kitsEq.get(e.id) || [];
          return (
            <Fila key={e.id} href={`/entidad/equipamiento/${e.id}`}
              avatar={avatarEntidad("equipamiento", e.id, "🎥")}
              resaltar={RES[e.estado] ? e.estado : undefined}>
              {e.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{e.folio}</span>}
              <b>{e.nombre}</b>
              <span style={{ color: "var(--dim)", fontSize: TXT.meta }}>{e.categoria} · {(e.estado || "").replace(/_/g, " ")}</span>
              {/* Mismos colores que en /equipamiento —ambar el combo, violeta
                  el kit— para que se relacionen sin leerlos. */}
              {cb && (
                <span className="badge cmp-cod" title={`Vino en el combo ${`${cb.codigo || ""} ${cb.nombre}`.trim()}`}>
                  🧾 {cb.codigo || cb.nombre}
                </span>
              )}
              {misKits.map((kn: string) => (
                <span key={kn} className="badge eq-kit-chip" title={`Sale en el kit «${kn}»`}>📦 {kn}</span>
              ))}
              {nBita > 0 && (
                <span style={{ color: "var(--muted)", fontSize: TXT.chip }} title="Notas y comentarios en su bitácora">🗒 {nBita}</span>
              )}
              <span style={{ flex: 1 }} />
              {per && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: TXT.meta }}>
                  {miniPersona(per.foto_url)} {per.alias || per.nombre}
                </span>
              )}
            </Fila>
          );
        })}
      </Seccion>

      <Seccion titulo="🎯 Postulaciones" k="postulaciones" n={postus.length} tinte={COLOR_ENTIDAD.postulacion}>
        {postus.map((p: any) => (
          <Fila key={p.id} href={`/entidad/postulacion/${p.id}`}
            // Edición pasada o terminó sin ganar: historia, salvo que deba rendición
            tenue={!postViva(p)}
            docs={(p.codigo_acta || p.acta_url || p.matriz_jurado_url || p.carpeta_drive_url) ? (
              <>
                {p.codigo_acta && (
                  <Doc href={p.acta_url} titulo="Acta de compromiso">📜 Acta {p.codigo_acta}</Doc>
                )}
                {!p.codigo_acta && p.acta_url && (
                  <Doc href={p.acta_url} titulo="Acta de compromiso">📜 Acta de compromiso</Doc>
                )}
                {p.matriz_jurado_url && (
                  <Doc href={p.matriz_jurado_url} titulo="Matriz de evaluación del jurado">⚖️ Matriz jurado</Doc>
                )}
                {p.carpeta_drive_url && (
                  <Doc href={p.carpeta_drive_url} color="var(--violet)" titulo="Carpeta en Drive">📁 Drive</Doc>
                )}
              </>
            ) : null}>
            <b>{p.codigo ? `${p.codigo} · ` : ""}{(p.proy as any)?.nombre || "Postulación"}</b>
            {(p.conv as any) && <span style={{ color: "var(--muted)", fontSize: TXT.meta }}>📜 {(p.conv as any).codigo}{(p.conv as any).anio ? ` · ${(p.conv as any).anio}` : ""}</span>}
            {/* El monto ganado dice más que el código del acta */}
            {p.estado === "ganadora" && p.monto_adjudicado && (
              <span style={{ color: "var(--teal)", fontSize: TXT.meta, fontWeight: 700 }}>
                S/ {parseFloat(p.monto_adjudicado).toLocaleString("es-PE")}
              </span>
            )}
            {/* La rendición es la única fecha con consecuencia legal */}
            {p.estado === "ganadora" && (p.fecha_prorroga || p.fecha_limite_rendicion) && (() => {
              const f = p.fecha_prorroga || p.fecha_limite_rendicion;
              const d = Math.ceil((new Date(f + "T23:59:59").getTime() - Date.now()) / 86400000);
              return (
                <span style={{ fontSize: TXT.micro, fontWeight: 700,
                  color: d < 0 ? "var(--red)" : d <= 60 ? "var(--yellow)" : "var(--dim)" }}
                  title={`Rendición: ${fechaLarga(f)}${p.fecha_prorroga ? " (prórroga)" : ""}`}>
                  🧾 {d < 0 ? `rendición vencida ${haceOEn(f)}` : `rinde ${haceOEn(f)}`}
                </span>
              );
            })()}
            <span style={{ flex: 1 }} />
            <span className="badge" style={{
              color: p.estado === "ganadora" ? "var(--green)" : "var(--muted)", background: "#1c1c2c",
            }}>{p.estado === "ganadora" ? "🏆 ganadora" : (p.estado || "").replace(/_/g, " ")}</span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="📜 Convocatorias" k="convocatorias" n={convs.length} tinte={COLOR_ENTIDAD.convocatoria}>
        {convs.map((c: any) => (
          <Fila key={c.id} href={`/entidad/convocatoria/${c.id}`}
            // Edición pasada o cerrada: memoria del palmarés, no cancha de hoy
            tenue={!convViva(c)}>
            <b>{c.codigo}</b>
            <span style={{ color: "var(--muted)", fontSize: TXT.meta }}>{c.nombre}</span>
            {/* El año manda en un concurso: es su edición */}
            {c.anio && (
              <span className="badge" style={{
                color: c.anio >= ANIO ? "var(--violet)" : "var(--dim)",
                background: c.anio >= ANIO ? "rgba(167,139,250,.12)" : "#1c1c2c",
              }}>{c.anio}</span>
            )}
            {c.estado && (
              <span style={{ color: "var(--dim)", fontSize: TXT.micro }}>{c.estado.replace(/_/g, " ")}</span>
            )}
            <Marca s={statConv.get(c.id)} />
          </Fila>
        ))}
      </Seccion>

      {/* Los combos de compra: cómo entró cada cosa. Van justo después de los
          equipos porque es a donde se salta desde un equipo —«¿qué más vino
          con esto?», «¿está en garantía?»—. */}
      <Seccion titulo="🧾 Combos de compra" k="combos" n={comps.length} tinte={COLOR_ENTIDAD.compra}>
        {comps.map((x: any) => (
          /* Sin `href`: un combo no tiene página. Lo abre el ⚡ de la derecha,
             que enseña todo lo que hay que saber sin sacarte del buscador. */
          <Fila key={x.id}>
            {x.codigo && <span className="badge cmp-cod">{x.codigo}</span>}
            <b>{x.nombre}</b>
            {x.proveedor && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>· {x.proveedor}</span>}
            {x.total != null && (
              <span style={{ color: "var(--teal)", fontSize: 11.5 }}>
                {x.moneda === "USD" ? "$" : "S/"} {Math.round(Number(x.total)).toLocaleString("es-PE")}
              </span>
            )}
            <span style={{ flex: 1 }} />
            {/* El envoltorio y no `VistaCompra` directamente: esta página es
                de SERVIDOR y los hijos de VistaCompra son una función, que no
                cruza la frontera. Ver components/OjoCompra. */}
            <OjoCompra id={x.id} />
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="📍 Lugares" k="lugares" n={lugs.length} tinte={COLOR_ENTIDAD.lugar}>
        {lugs.map((l: any) => (
          <Fila key={l.id} href={`/entidad/lugar/${l.id}`}>
            <b>{l.nombre}</b>
          </Fila>
        ))}
      </Seccion>

      {/* El repositorio: material, no fichas. Va después de las entidades y
          antes de los casos —es «lo que sabemos», no «lo que hacemos»—. */}
      <Seccion titulo="📚 Repositorio" k="repositorio" n={objs.length} mas={objsMas}
        verTodo={`/repositorio?q=${encodeURIComponent(q)}`} tinte={COLOR_SECCION.repositorio}>
        {objs.map((o: any) => (
          <Fila key={o.id} href={`/objeto/${o.id}`}
            /* La cara del material como columna izquierda (ocupa el alto de la
               fila): miniatura del archivo (imagen, carátula de YouTube, primera
               página de un Drive) si el link la da; si no —un PDF suelto, un doc
               restringido— un recuadro con el ícono del tipo, del mismo tamaño. */
            avatar={previewCandidates(o.url, 200).length
              ? <Miniatura url={o.url} size={60} alt={o.titulo} />
              : <span className="tr-poster" style={{ width: 60, height: 60, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 27, background: "var(--bg)" }}>{icoObjeto(o.tipo)}</span>}>
            <b style={{ fontSize: TXT.titulo }}>{o.titulo}</b>
            {/* Segunda fila propia: tipo + dueño, para que no desborden junto al
                título. `width:100%` fuerza el salto de línea dentro del flex. */}
            <span style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
              <span className="badge" style={{ color: "var(--dim)", background: "#1c1c2c" }}>
                {lblObjeto(o.tipo)}
              </span>
              {o.dueno && (
                <span style={{ color: "var(--dim)", fontSize: TXT.micro }}>
                  {ICO_ENT[o.entidad_tipo] || "🔗"} {o.dueno}
                </span>
              )}
            </span>
            {o.notas && (
              <span style={{ color: "var(--muted)", fontSize: TXT.cuerpo, width: "100%" }}>
                {snippet(o.notas, palabras)}
              </span>
            )}
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="📌 Casos" k="casos" n={casos.length} tinte={COLOR_SECCION.casos}>
        {casos.map((p: any) => (
          <Fila key={p.id} href={`/caso/${p.id}`}>
            {/* La cara de quien lo creó (autor_id → su cuenta). Sin foto, las
                iniciales; sin autor, Avatar cae a «?». */}
            <span title={`Creado por ${perfilNom.get(p.autor_id) || "—"}`} style={{ display: "inline-flex", flex: "none" }}>
              <Avatar nombre={perfilNom.get(p.autor_id)} src={avatarDe.get(p.autor_id)} size={24} />
            </span>
            <span style={{ fontSize: 15 }}>{p.padre_id ? "🧩" : icoTipo(p.tipo)}</span>
            <b style={{ fontSize: TXT.titulo }}>{p.titulo}</b>
            {/* Que tiene hijos cambia lo que es: no es un caso suelto, es uno
                largo con trabajo dentro. Verde solo cuando están todos. */}
            {hijosDe.get(p.id) && (() => {
              const h = hijosDe.get(p.id)!;
              return (
                <span className="badge" title={`${h.ok} de ${h.total} sub-casos cerrados`}
                  style={{ color: colorFamilia(h), background: "rgba(45,212,191,.1)" }}>
                  🧩 {h.ok}/{h.total}
                </span>
              );
            })()}
            <span className={`pill st-${claseEstado(p.estado, p.tipo)}`} style={{ fontSize: 10 }}>{rotuloEstado(p.estado, p.tipo)}</span>
            <VistaRapida pubId={p.id} />
            {/* Un sub-caso sin su padre es un título huérfano: «Cámara A
                lista» no dice de qué rodaje habla. El padre no es adorno, es
                la mitad del dato. */}
            {p.padre_id && padreDe.get(p.padre_id) && (
              <span style={{ color: "var(--dim)", fontSize: TXT.micro, width: "100%" }}>
                ↑ parte de: <b style={{ color: "var(--violet)" }}>{padreDe.get(p.padre_id)}</b>
              </span>
            )}
            {p.cuerpo && <span style={{ color: "var(--muted)", fontSize: TXT.cuerpo, width: "100%", lineHeight: 1.4 }}>{snippet(p.cuerpo, palabras)}</span>}
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="💬 En comentarios" k="comentarios" n={coms.length} tinte={COLOR_SECCION.comentarios}>
        {coms.map((c: any) => (
          <Fila key={c.id} href={c.objeto_id ? `/objeto/${c.objeto_id}#comentarios` : `/caso/${c.publicacion_id}`}>
            <span style={{ color: "var(--text)", fontSize: TXT.cuerpo, fontStyle: "italic", width: "100%", lineHeight: 1.45 }}>
              "{snippet(c.cuerpo, palabras)}"
            </span>
            {/* La cara de quien comentó: su avatar de cuenta, o iniciales. */}
            <Avatar nombre={(c.autor as any)?.nombre} src={(c.autor as any)?.avatar_url} size={22} />
            <span style={{ color: "var(--muted)", fontSize: TXT.meta }}>
              — {(c.autor as any)?.nombre?.split(" ")[0]} en «{(c.pub as any)?.titulo || (c.obj as any)?.titulo || "—"}»
            </span>
          </Fila>
        ))}
      </Seccion>

      {!q && (
        <div className="empty">
          Escribe algo arriba — Bot Qhaway buscará en casos, comentarios, personas,
          proyectos, empresas, equipos, lugares, convocatorias y postulaciones a la vez.
          Puedes combinar palabras: «acta mujeres», «rendición 2027», «rodaje drone».
          <br />
          También los papeles: «cv investigadora», «renca», «vigencia de poder»,
          un número de RENCA o un DNI.
        </div>
      )}
    </div>
  );
}
