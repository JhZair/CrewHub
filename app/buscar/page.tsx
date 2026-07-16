import { createClient } from "@/lib/supabase/server";
import { coincideQ, nrmQ } from "@/lib/quechua";
import { ESTADOS } from "@/lib/estados";
import { REL_EMPRESA, EST_EMPRESA, TIPO_COLOR } from "@/lib/entidades";
import { alertaSunat, empresaDeCasa, empresaViva, textoSunat } from "@/lib/sunat";
import { esDelEquipo } from "@/lib/personas";
import { fmtVence, venceVigencia, vigenciaVencida } from "@/lib/vigencia";
import { fechaLarga, haceOEn } from "@/lib/fechas";
import { rucDePersona } from "@/lib/ruc";
import BotonFichaSunat from "@/components/BotonFichaSunat";
import Volver from "@/components/Volver";
import BuscadorGlobal from "@/components/BuscadorGlobal";
import Link from "next/link";
import { redirect } from "next/navigation";

/* BÚSQUEDA GLOBAL — Qhaway busca en todo el conocimiento:
   casos, comentarios, personas, proyectos, empresas, equipos,
   lugares y convocatorias. Una caja, todo el sistema. */

const TIPO_ICO: Record<string, string> = {
  aviso: "📢", tarea: "✅", problema: "❗", consulta: "❓", pago: "💰", idea: "💡", archivo: "📎",
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
   mientras el plazo no venza, el fondo sigue encima aunque el concurso sea
   de hace dos años. */
const rendicionPendiente = (p: any) => {
  const f = p.fecha_prorroga || p.fecha_limite_rendicion;
  return p.estado === "ganadora" && !!f && f >= HOY_S;
};

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
  c.estado !== "cerrada"
  && ((c.anio ?? ANIO) >= ANIO || ["en_ejecucion", "rendicion_pendiente"].includes(c.estado));

const EST_ACT: Record<string, [string, string]> = {
  bloqueado: ["🚧 bloqueado", "var(--red)"],
  en_pausa: ["⏸ en pausa", "var(--blue)"],
  completado: ["✅ completado", "var(--green)"],
};

/* Los estados se guardan con guion bajo —«en_constitucion», «de_baja»— y así
   no los encuentra nadie: la gente escribe «en constitución». Toda
   clasificación entra al pajar en palabras. Aplica a TODAS las entidades: el
   estado es de las primeras cosas que uno busca. */
const pal = (...xs: any[]) =>
  xs.map(x => String(x ?? "").replace(/_/g, " ")).join(" ");

const STOP = new Set(["de", "del", "la", "las", "el", "los", "un", "una", "y", "en", "al", "con", "por", "para", "que"]);
const nrmB = (s: any) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/* Dos letras bastan. El corte estaba en 3 y se comía justo las siglas que
   más se buscan —cv, tv, 3d, po— así que «cv pro» buscaba solo «pro» y
   devolvía a todos los Productores, Programadores e Investigadores sin CV.
   Los conectores ya los filtra STOP, que es lo que había que hacer. */
const partir = (q: string) => {
  const ws = nrmB(q).split(/\s+/).filter(w => w.length >= 2 && !STOP.has(w));
  return ws.length ? ws : [nrmB(q)];
};

/* recorte con contexto alrededor de la primera palabra coincidente */
function snippet(texto: string | null, palabras: string[]): string {
  if (!texto) return "";
  let i = -1;
  for (const w of palabras) { i = nrmB(texto).indexOf(w); if (i >= 0) break; }
  if (i < 0) return texto.slice(0, 100) + (texto.length > 100 ? "…" : "");
  const ini = Math.max(0, i - 50);
  const fin = Math.min(texto.length, i + 80);
  return (ini > 0 ? "…" : "") + texto.slice(ini, fin) + (fin < texto.length ? "…" : "");
}

export default async function Buscar({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams?.q || "").trim();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let casos: any[] = [], coms: any[] = [], pers: any[] = [], proys: any[] = [],
      emps: any[] = [], equis: any[] = [], lugs: any[] = [], convs: any[] = [], postus: any[] = [],
      creds: any[] = [];
  let statProy = new Map<string, any>(), statEmp = new Map<string, any>(),
      statConv = new Map<string, any>(), statPers = new Map<string, any>();
  let equisMas = 0, persMas = 0;
  const palabras = q ? partir(q) : [];

  if (q) {
    // Coincide si TODAS las palabras están en el "pajar" del registro
    // (literal o por esqueleto fonético quechua: Mujunacuy = Mujunakuy)
    const coincide = (hay: string) => coincideQ(hay, palabras);
    // Para tablas grandes: pre-filtro OR en la BD (cualquier palabra en cualquier campo)
    const orDe = (campos: string[]) => palabras
      .map(w => w.replace(/[,%()]/g, ""))
      .flatMap(w => campos.map(f => `${f}.ilike.%${w}%`)).join(",");

    const [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10] = await Promise.all([
      supabase.from("publicaciones")
        .select("id,titulo,cuerpo,tipo,estado,creado_en")
        .or(orDe(["titulo", "cuerpo"]))
        .order("creado_en", { ascending: false }).limit(40),
      supabase.from("comentarios")
        .select("id,cuerpo,creado_en,publicacion_id,autor:perfiles(nombre),pub:publicaciones(titulo)")
        .or(orDe(["cuerpo"]))
        .order("creado_en", { ascending: false }).limit(40),
      /* Los CVs viajan con la persona: se guardan por enfoque justo para
         poder pedir "el CV de Yajaida como Investigadora", y hasta hoy no
         había forma de encontrarlos. */
      supabase.from("personas")
        .select("id,nombre,alias,rol,tipo,estado,ruc_dni,region,dni_url,firma_url,carpeta_drive_url,cvs:persona_cv(id,enfoque,url)")
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
      supabase.from("equipamiento").select("id,nombre,folio,categoria,subcategoria,estado,descripcion").limit(600),
      supabase.from("lugares").select("id,nombre"),
      supabase.from("convocatorias").select("id,codigo,nombre,anio,estado"),
      supabase.from("postulaciones")
        .select("id,codigo,codigo_plataforma,codigo_acta,estado,feedback_jurado,acta_url,matriz_jurado_url,carpeta_drive_url,monto_adjudicado,fecha_limite_rendicion,fecha_prorroga,proy:proyectos(nombre),conv:convocatorias(codigo,nombre,anio)"),
      /* Los datos sueltos de cada cuenta (código de afiliación, correo de
         recuperación, N° de contrato...) son justo lo que uno viene a
         buscar meses después. Estaban guardados y no se buscaban. */
      supabase.from("credenciales")
        .select("id,plataforma,identificador,ubicacion,notas,empresa_id,persona_id,datos:credencial_datos(id,etiqueta,valor)")
        .limit(600),
    ]);

    // El marcador en los resultados: 🏆 ganados · 🥈 casi · 🎯 intentos
    const [{ data: postStats }, { data: equipoStats }] = await Promise.all([
      supabase.from("postulaciones").select("estado,proyecto_id,empresa_id,convocatoria_id"),
      supabase.from("postulacion_equipo").select("persona_id,post:postulaciones(estado)"),
    ]);
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

    /* Ojo: la consulta de casos SÍ pre-filtra en la base por título y cuerpo
       (orDe), así que buscar «en progreso» a secas no puede traerlos — no
       hay pre-filtro por estado. Aquí el estado solo afina lo ya traído:
       «linderaje en progreso» funciona, «en progreso» solo, no. Para eso
       está el tablero, que es donde se mira por estado. */
    casos = (c1.data || []).filter((p: any) =>
      coincide(`${p.titulo} ${p.cuerpo} ${pal(p.tipo, p.estado)}`)).slice(0, 12);
    coms = (c2.data || []).filter((c: any) => coincide(`${c.cuerpo} ${(c.pub as any)?.titulo}`)).slice(0, 12);
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
    ].filter(Boolean).join(" ");

    const persTodas = (c3.data || [])
      .filter((p: any) => coincide(
        `persona ${p.nombre} ${p.alias} ${p.rol} ${p.ruc_dni} ${p.region} `
        + pal(p.tipo, p.estado, p.equipo) + ` ${docsPersona(p)}`))
      .map((p: any) => ({
        // Qué CV coincidió: sin esto buscas "cv investigadora" y sale una
        // fila con el nombre a secas, sin decirte que lo encontró
        ...p, cvsHit: (p.cvs || []).filter((c: any) => coincide(`cv hoja de vida ${c.enfoque}`)),
      }))
      /* Un puntaje, no una regla suelta: trae el papel que pediste (2) y es
         gente del equipo (1). Así arriba queda «del equipo y con el CV», y
         al final el contacto que solo coincide de refilón — que se muestra
         apagado, no se esconde: buscaste algo y ahí está. */
      .sort((a: any, b: any) => {
        const pt = (x: any) => (x.cvsHit.length ? 2 : 0) + (esDelEquipo(x) ? 1 : 0);
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
    const equisTodos = (c6.data || []).filter((e: any) => coincide(
      `equipo ${e.nombre} ${e.folio} ${e.categoria} ${e.subcategoria} ${e.descripcion} ` + pal(e.estado)));
    equis = equisTodos.slice(0, 15);
    equisMas = Math.max(0, equisTodos.length - 15);
    lugs = (c7.data || []).filter((l: any) => coincide(`lugar ${l.nombre}`)).slice(0, 6);
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
    const textoDatos = (c: any) =>
      (c.datos || []).map((d: any) => `${d.etiqueta} ${d.valor}`).join(" ");
    creds = (c10.data || [])
      .filter((c: any) => coincide(
        `credencial acceso clave usuario ${c.plataforma} ${c.identificador} ${c.ubicacion} ${c.notas} ${textoDatos(c)}`))
      .map((c: any) => {
        const dueno = c.empresa_id ? "empresa" : "persona";
        const duenoId = c.empresa_id || c.persona_id;
        const duenoNombre = c.empresa_id ? empMap.get(c.empresa_id) : persMap.get(c.persona_id);
        /* Qué dato concreto coincidió: sin esto, buscas un código de
           afiliación y te sale una fila «DAFO-Estímulos» sin decirte que lo
           encontró — y no sabrías si es lo que buscabas. */
        const golpes = (c.datos || []).filter((d: any) => coincide(`${d.etiqueta} ${d.valor}`));
        return { ...c, dueno, duenoId, duenoNombre, golpes };
      }).slice(0, 10);
  }

  const total = casos.length + coms.length + pers.length + proys.length
    + emps.length + equis.length + lugs.length + convs.length + postus.length + creds.length;

  /* `mas` no es decoración: una sección que corta y no lo dice te hace creer
     que lo que buscabas no existe.
     `verTodo` SOLO se pasa cuando esa página busca lo mismo que aquí. El de
     personas mandaba a /personas?q=…, que no mira los CVs: prometía el resto
     y entregaba cero. Un enlace que miente es peor que no tenerlo. */
  const Seccion = ({ titulo, n, mas, verTodo, children }: any) => n > 0 ? (
    <div style={{ marginBottom: 14 }}>
      <div className="panel-h" style={{ marginBottom: 6 }}>
        {titulo} · {n}
        {mas > 0 && <span style={{ color: "var(--yellow)", fontWeight: 400 }}> de {n + mas}</span>}
      </div>
      {children}
      {mas > 0 && (verTodo ? (
        <Link href={verTodo} style={{ color: "var(--violet)", fontSize: 12.5, fontWeight: 600, display: "block", padding: "4px 2px" }}>
          … y {mas} más — ver la lista completa →
        </Link>
      ) : (
        <span style={{ color: "var(--dim)", fontSize: 12.5, display: "block", padding: "4px 2px" }}>
          … y {mas} más — agrega una palabra para acotar
        </span>
      ))}
    </div>
  ) : null;

  /* Insignias del marcador: 🏆 ganados · 🥈 casi · 🎯 intentos */
  const Marca = ({ s }: { s?: { t: number; g: number; c: number } }) => !s?.t ? null : (
    <span style={{ display: "inline-flex", gap: 5 }}>
      {s.g > 0 && <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)", fontSize: 10.5 }}>🏆 {s.g}</span>}
      {s.c > 0 && <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)", fontSize: 10.5 }}>🥈 {s.c}</span>}
      <span className="badge" style={{ color: "var(--blue)", background: "rgba(59,130,246,.12)", fontSize: 10.5 }}>🎯 {s.t}</span>
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
  const Fila = ({ href, children, docs, tenue }: any) => (
    <div className={`card link fila-cap${tenue ? " fila-tenue" : ""}`}
      style={{ cursor: "pointer", padding: "8px 13px", marginBottom: 7 }}>
      <Link href={href} className="fila-cubre" aria-label="Abrir" />
      <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
        {children}
      </div>
      {/* Segunda línea: los papeles, todos clickables. Arriba, quién es;
          abajo, con qué se le abre la puerta a un fondo. */}
      {docs && <div className="fila-docs">{docs}</div>}
    </div>
  );

  /* Chip de documento: si hay link, va al papel; si no, se muestra apagado
     —que el dato exista y el archivo no es información, no un hueco que
     esconder. `fila-encima` lo levanta sobre la capa clickable de la fila. */
  const Doc = ({ href, color = "var(--teal)", titulo, children }: any) => href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={titulo}
      className="badge fila-encima"
      style={{ color, background: `${color === "var(--teal)" ? "rgba(45,212,191,.12)" : "rgba(167,139,250,.12)"}`, textTransform: "none", letterSpacing: 0 }}>
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
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
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
      <Seccion titulo="👤 Personas" n={pers.length} mas={persMas}>
        {pers.map((p: any) => (
          <Fila key={p.id} href={`/entidad/persona/${p.id}`}
            // No es del equipo: sigue ahí, pero apagado
            tenue={!esDelEquipo(p)}
            docs={
              <>
                {/* El número enlaza a su escaneo; el botón abre SUNAT */}
                {p.ruc_dni && <Doc href={p.dni_url} titulo="DNI escaneado">🪪 DNI {p.ruc_dni}</Doc>}
                {/* El RUC no se guarda: sale del DNI. Vivía solo en su ficha,
                    y es el número que hace falta para verificar en SUNAT. */}
                {rucDePersona(p.ruc_dni) && (
                  <BotonFichaSunat numero={rucDePersona(p.ruc_dni)!} tipo="RUC"
                    compacto nota="se calcula del DNI" />
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
            {p.rol && <span style={{ color: "var(--muted)", fontSize: 12 }}>{p.rol.slice(0, 50)}</span>}
            <Marca s={statPers.get(p.id)} />
            <span style={{ flex: 1 }} />
            <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.tipo}</span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="🔑 Credenciales" n={creds.length}>
        {creds.map((c: any) => (
          <Fila key={c.id} href={`/entidad/${c.dueno}/${c.duenoId}`}>
            <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{c.plataforma}</span>
            {c.identificador && <b>{c.identificador}</b>}
            {c.ubicacion && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>🔒 {c.ubicacion}</span>}
            <span style={{ flex: 1 }} />
            {c.duenoNombre && <span style={{ color: "var(--muted)", fontSize: 12 }}>{c.dueno === "empresa" ? "🏢" : "👤"} {c.duenoNombre}</span>}
            {/* El dato que hizo el match, en su propia línea */}
            {(c.golpes || []).length > 0 && (
              <span style={{ width: "100%", display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                {c.golpes.map((d: any) => (
                  <span key={d.id} className="badge"
                    style={{ color: "var(--teal)", background: "rgba(45,212,191,.12)", textTransform: "none", letterSpacing: 0 }}>
                    {d.etiqueta}: <b>{d.valor || "—"}</b>
                  </span>
                ))}
              </span>
            )}
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="📁 Proyectos" n={proys.length}>
        {proys.map((p: any) => (
          <Fila key={p.id} href={`/entidad/proyecto/${p.id}`}
            // Solo lo que se mueve va encendido. Lo demás sigue ahí, apagado.
            tenue={!proyVivo(p)}
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
            <span style={{ color: "var(--dim)", fontSize: 12 }}>{p.etapa?.replace(/_/g, " ")}</span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="🏢 Empresas" n={emps.length}>
        {emps.map((e: any) => (
          <Fila key={e.id} href={`/entidad/empresa/${e.id}`}
            // Apagada si ya no está viva (en cierre) o si nunca fue nuestra
            // (externa). La aliada se queda: con ella sí se postula.
            tenue={!empresaViva(e) || !empresaDeCasa(e)}
            docs={
              <>
                {e.ruc && <BotonFichaSunat numero={e.ruc} tipo="RUC" compacto />}
                {/* RENCA y vigencia tienen su PDF guardado y los pintaba como
                    texto muerto: el papel estaba a un clic y no se ofrecía. */}
                {e.renca && (
                  <Doc href={e.renca_url} titulo="Constancia RENCA">🎬 {e.renca}</Doc>
                )}
                {e.vigencia_poder_fecha && (
                  <a href={e.vigencia_poder_url || undefined}
                    target={e.vigencia_poder_url ? "_blank" : undefined} rel="noopener noreferrer"
                    title={`Emitida el ${fechaLarga(e.vigencia_poder_fecha)} · ${haceOEn(e.vigencia_poder_fecha)}`
                      + `. Vale 90 días, así que ${vigenciaVencida(e.vigencia_poder_fecha)
                        ? `venció el ${fechaLarga(venceVigencia(e.vigencia_poder_fecha))}`
                        : `vence el ${fechaLarga(venceVigencia(e.vigencia_poder_fecha))}`}`
                      + `${e.vigencia_poder_url ? "" : " — sin archivo cargado"}`}
                    className={`badge${e.vigencia_poder_url ? " fila-encima" : ""}`}
                    style={{
                      // Vencida en rojo: es lo que impide postular hoy
                      color: vigenciaVencida(e.vigencia_poder_fecha) ? "var(--red)" : "var(--muted)",
                      background: vigenciaVencida(e.vigencia_poder_fecha) ? "rgba(255,77,94,.12)" : "#1c1c2c",
                      textTransform: "none", letterSpacing: 0,
                    }}>
                    📜 {vigenciaVencida(e.vigencia_poder_fecha)
                      ? "vigencia vencida" : `vigencia vence ${fmtVence(e.vigencia_poder_fecha)}`}
                    {e.vigencia_poder_url ? " ↗" : ""}
                  </a>
                )}
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
            {e.razon_social && <span style={{ color: "var(--dim)", fontSize: 12 }}>{e.razon_social}</span>}
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

      <Seccion titulo="🎥 Equipos" n={equis.length} mas={equisMas}
        verTodo={`/equipamiento?q=${encodeURIComponent(q)}`}>
        {equis.map((e: any) => (
          <Fila key={e.id} href={`/entidad/equipamiento/${e.id}`}>
            {e.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{e.folio}</span>}
            <b>{e.nombre}</b>
            <span style={{ color: "var(--dim)", fontSize: 12 }}>{e.categoria} · {(e.estado || "").replace(/_/g, " ")}</span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="🎯 Postulaciones" n={postus.length}>
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
                  <Doc href={p.acta_url} titulo="Acta de compromiso">📜 Acta</Doc>
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
            {(p.conv as any) && <span style={{ color: "var(--muted)", fontSize: 12 }}>📜 {(p.conv as any).codigo}{(p.conv as any).anio ? ` · ${(p.conv as any).anio}` : ""}</span>}
            {/* El monto ganado dice más que el código del acta */}
            {p.estado === "ganadora" && p.monto_adjudicado && (
              <span style={{ color: "var(--teal)", fontSize: 12, fontWeight: 700 }}>
                S/ {parseFloat(p.monto_adjudicado).toLocaleString("es-PE")}
              </span>
            )}
            {/* La rendición es la única fecha con consecuencia legal */}
            {p.estado === "ganadora" && (p.fecha_prorroga || p.fecha_limite_rendicion) && (() => {
              const f = p.fecha_prorroga || p.fecha_limite_rendicion;
              const d = Math.ceil((new Date(f + "T23:59:59").getTime() - Date.now()) / 86400000);
              return (
                <span style={{ fontSize: 11.5, fontWeight: 700,
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

      <Seccion titulo="📜 Convocatorias" n={convs.length}>
        {convs.map((c: any) => (
          <Fila key={c.id} href={`/entidad/convocatoria/${c.id}`}
            // Edición pasada o cerrada: memoria del palmarés, no cancha de hoy
            tenue={!convViva(c)}>
            <b>{c.codigo}</b>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{c.nombre}</span>
            {/* El año manda en un concurso: es su edición */}
            {c.anio && (
              <span className="badge" style={{
                color: c.anio >= ANIO ? "var(--violet)" : "var(--dim)",
                background: c.anio >= ANIO ? "rgba(167,139,250,.12)" : "#1c1c2c",
              }}>{c.anio}</span>
            )}
            {c.estado && (
              <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{c.estado.replace(/_/g, " ")}</span>
            )}
            <Marca s={statConv.get(c.id)} />
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="📍 Lugares" n={lugs.length}>
        {lugs.map((l: any) => (
          <Fila key={l.id} href={`/entidad/lugar/${l.id}`}>
            <b>{l.nombre}</b>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="📌 Casos" n={casos.length}>
        {casos.map((p: any) => (
          <Fila key={p.id} href={`/caso/${p.id}`}>
            <span>{TIPO_ICO[p.tipo] || "💬"}</span>
            <b>{p.titulo}</b>
            <span className={`pill st-${p.estado}`} style={{ fontSize: 10 }}>{ESTADOS[p.estado] || p.estado}</span>
            {p.cuerpo && <span style={{ color: "var(--muted)", fontSize: 11.5, width: "100%" }}>{snippet(p.cuerpo, palabras)}</span>}
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="💬 En comentarios" n={coms.length}>
        {coms.map((c: any) => (
          <Fila key={c.id} href={`/caso/${c.publicacion_id}`}>
            <span style={{ color: "var(--muted)", fontSize: 12, fontStyle: "italic" }}>
              "{snippet(c.cuerpo, palabras)}"
            </span>
            <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
              — {(c.autor as any)?.nombre?.split(" ")[0]} en «{(c.pub as any)?.titulo}»
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
