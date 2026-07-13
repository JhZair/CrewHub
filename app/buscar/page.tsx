import { createClient } from "@/lib/supabase/server";
import { coincideQ, nrmQ } from "@/lib/quechua";
import Volver from "@/components/Volver";
import BuscadorGlobal from "@/components/BuscadorGlobal";
import Link from "next/link";
import { redirect } from "next/navigation";

/* BÚSQUEDA GLOBAL — Qhaway busca en todo el conocimiento:
   casos, comentarios, personas, proyectos, empresas, equipos,
   lugares y convocatorias. Una caja, todo el sistema. */

const ESTADOS: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso", seguimiento: "🔭 Seguimiento",
  en_pausa: "En Pausa", resuelta: "Resuelta", archivada: "Archivada",
};
const TIPO_ICO: Record<string, string> = {
  aviso: "📢", tarea: "✅", problema: "❗", consulta: "❓", pago: "💰", idea: "💡", archivo: "📎",
};

/* ===== búsqueda por palabras =====
   La frase se parte en palabras (sin conectores) y un registro
   coincide si TODAS aparecen en él, aunque sea en campos distintos:
   «acta compromiso mujeres» encuentra la postulación ganadora de
   Mujeres del Ande porque tiene acta de compromiso. */
const STOP = new Set(["de", "del", "la", "las", "el", "los", "un", "una", "y", "en", "al", "con", "por", "para", "que"]);
const nrmB = (s: any) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const partir = (q: string) => {
  const ws = nrmB(q).split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w));
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
  let equisMas = 0;
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
      supabase.from("personas").select("id,nombre,alias,rol,tipo,estado,notas,ruc_dni").limit(600),
      supabase.from("proyectos").select("id,nombre,nombre_corto,folio,tipo,etapa,descripcion"),
      supabase.from("empresas").select("id,nombre,razon_social,codigo,ruc,estado_sunat"),
      supabase.from("equipamiento").select("id,nombre,folio,categoria,subcategoria,estado,descripcion").limit(600),
      supabase.from("lugares").select("id,nombre"),
      supabase.from("convocatorias").select("id,codigo,nombre,anio,estado"),
      supabase.from("postulaciones")
        .select("id,codigo,codigo_plataforma,codigo_acta,estado,feedback_jurado,acta_url,fecha_limite_rendicion,proy:proyectos(nombre),conv:convocatorias(codigo,nombre,anio)"),
      supabase.from("credenciales")
        .select("id,plataforma,identificador,ubicacion,notas,empresa_id,persona_id").limit(600),
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

    casos = (c1.data || []).filter((p: any) => coincide(`${p.titulo} ${p.cuerpo}`)).slice(0, 12);
    coms = (c2.data || []).filter((c: any) => coincide(`${c.cuerpo} ${(c.pub as any)?.titulo}`)).slice(0, 12);
    pers = (c3.data || []).filter((p: any) => coincide(`persona ${p.nombre} ${p.alias} ${p.rol} ${p.notas} ${p.ruc_dni}`)).slice(0, 10);
    proys = (c4.data || []).filter((p: any) => coincide(`proyecto ${p.nombre} ${p.nombre_corto} ${p.folio} ${p.descripcion}`)).slice(0, 10);
    emps = (c5.data || []).filter((e: any) => coincide(`empresa ${e.nombre} ${e.razon_social} ${e.codigo} ${e.ruc}`)).slice(0, 10);
    const equisTodos = (c6.data || []).filter((e: any) => coincide(`equipo ${e.nombre} ${e.folio} ${e.categoria} ${e.subcategoria} ${e.descripcion}`));
    equis = equisTodos.slice(0, 15);
    equisMas = Math.max(0, equisTodos.length - 15);
    lugs = (c7.data || []).filter((l: any) => coincide(`lugar ${l.nombre}`)).slice(0, 6);
    convs = (c8.data || []).filter((c: any) => coincide(`convocatoria concurso ${c.codigo} ${c.nombre} ${c.anio}`)).slice(0, 6);
    postus = (c9.data || []).filter((p: any) => coincide(
      `postulacion ${p.codigo} ${p.codigo_plataforma} ${p.codigo_acta} ${p.estado} ${p.feedback_jurado} ` +
      `${(p.proy as any)?.nombre} ${(p.conv as any)?.codigo} ${(p.conv as any)?.nombre} ${(p.conv as any)?.anio} ` +
      `${p.codigo_acta || p.acta_url ? "acta de compromiso" : ""} ${p.fecha_limite_rendicion ? "rendicion" : ""} ` +
      `${p.estado === "ganadora" ? "ganadora fondo estimulo" : ""}`
    )).slice(0, 8);

    // Credenciales: inventario de accesos (plataforma, usuario, dónde vive la clave)
    const empMap = new Map((c5.data || []).map((e: any) => [e.id, e.nombre]));
    const persMap = new Map((c3.data || []).map((p: any) => [p.id, p.nombre]));
    creds = (c10.data || [])
      .filter((c: any) => coincide(`credencial acceso clave usuario ${c.plataforma} ${c.identificador} ${c.ubicacion} ${c.notas}`))
      .map((c: any) => {
        const dueno = c.empresa_id ? "empresa" : "persona";
        const duenoId = c.empresa_id || c.persona_id;
        const duenoNombre = c.empresa_id ? empMap.get(c.empresa_id) : persMap.get(c.persona_id);
        return { ...c, dueno, duenoId, duenoNombre };
      }).slice(0, 10);
  }

  const total = casos.length + coms.length + pers.length + proys.length
    + emps.length + equis.length + lugs.length + convs.length + postus.length + creds.length;

  const Seccion = ({ titulo, n, children }: any) => n > 0 ? (
    <div style={{ marginBottom: 14 }}>
      <div className="panel-h" style={{ marginBottom: 6 }}>{titulo} · {n}</div>
      {children}
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

  const Fila = ({ href, children }: any) => (
    <Link href={href}>
      <div className="card link" style={{ cursor: "pointer", padding: "7px 13px", marginBottom: 7 }}>
        <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
          {children}
        </div>
      </div>
    </Link>
  );

  return (
    <div className="shell">
      {/* La caja no se mueve: cabecera pegajosa mientras recorres resultados */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "var(--bg)", paddingBottom: 10 }}>
        <div className="topbar" style={{ marginBottom: 12 }}>
          <Volver />
          <span style={{ fontWeight: 800, fontSize: 16 }}>🔍 Buscar</span>
          <div style={{ flex: 1, maxWidth: 520 }}>
            <BuscadorGlobal inicial={q} />
          </div>
          {q && (
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              🤖 {total ? `${total} resultado${total === 1 ? "" : "s"}` : "nada — prueba con menos palabras"}
            </span>
          )}
        </div>
      </div>

      {/* Entidades primero: son la respuesta corta. Los casos, el océano, al final. */}
      <Seccion titulo="👤 Personas" n={pers.length}>
        {pers.map((p: any) => (
          <Fila key={p.id} href={`/entidad/persona/${p.id}`}>
            <b>{p.nombre}</b>
            {p.ruc_dni && <span style={{ color: "var(--teal)", fontSize: 11.5, fontWeight: 700 }}>🪪 {p.ruc_dni}</span>}
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
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="📁 Proyectos" n={proys.length}>
        {proys.map((p: any) => (
          <Fila key={p.id} href={`/entidad/proyecto/${p.id}`}>
            <b>{p.nombre}</b>
            {p.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.folio}</span>}
            <Marca s={statProy.get(p.id)} />
            <span style={{ flex: 1 }} />
            <span style={{ color: "var(--dim)", fontSize: 12 }}>{p.etapa?.replace(/_/g, " ")}</span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="🏢 Empresas" n={emps.length}>
        {emps.map((e: any) => (
          <Fila key={e.id} href={`/entidad/empresa/${e.id}`}>
            <b>{e.nombre}</b>
            {e.ruc && <span style={{ color: "var(--teal)", fontSize: 11.5, fontWeight: 700 }}>RUC {e.ruc}</span>}
            {e.razon_social && <span style={{ color: "var(--dim)", fontSize: 12 }}>{e.razon_social}</span>}
            <Marca s={statEmp.get(e.id)} />
            {e.estado_sunat && e.estado_sunat !== "activo" &&
              <span className="badge" style={{ color: "var(--red)", background: "rgba(255,77,94,.12)" }}>⚠ SUNAT</span>}
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="🎥 Equipos" n={equis.length}>
        {equis.map((e: any) => (
          <Fila key={e.id} href={`/entidad/equipamiento/${e.id}`}>
            {e.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{e.folio}</span>}
            <b>{e.nombre}</b>
            <span style={{ color: "var(--dim)", fontSize: 12 }}>{e.categoria} · {(e.estado || "").replace(/_/g, " ")}</span>
          </Fila>
        ))}
        {equisMas > 0 && (
          <Link href={`/equipamiento?q=${encodeURIComponent(q)}`}
            style={{ color: "var(--violet)", fontSize: 12.5, fontWeight: 600, display: "block", padding: "4px 2px" }}>
            … y {equisMas} equipo{equisMas === 1 ? "" : "s"} más — ver todos en el inventario →
          </Link>
        )}
      </Seccion>

      <Seccion titulo="🎯 Postulaciones" n={postus.length}>
        {postus.map((p: any) => (
          <Fila key={p.id} href={`/entidad/postulacion/${p.id}`}>
            <b>{p.codigo ? `${p.codigo} · ` : ""}{(p.proy as any)?.nombre || "Postulación"}</b>
            {(p.conv as any) && <span style={{ color: "var(--muted)", fontSize: 12 }}>📜 {(p.conv as any).codigo}{(p.conv as any).anio ? ` · ${(p.conv as any).anio}` : ""}</span>}
            {p.codigo_acta && <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 700 }}>{p.codigo_acta}</span>}
            <span style={{ flex: 1 }} />
            <span className="badge" style={{
              color: p.estado === "ganadora" ? "var(--green)" : "var(--muted)", background: "#1c1c2c",
            }}>{p.estado === "ganadora" ? "🏆 ganadora" : (p.estado || "").replace(/_/g, " ")}</span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="📜 Convocatorias" n={convs.length}>
        {convs.map((c: any) => (
          <Fila key={c.id} href={`/entidad/convocatoria/${c.id}`}>
            <b>{c.codigo}</b>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{c.nombre}</span>
            {c.anio && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{c.anio}</span>}
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
          Escribe algo arriba — Qhaway buscará en casos, comentarios, personas,
          proyectos, empresas, equipos, lugares, convocatorias y postulaciones a la vez.
          Puedes combinar palabras: «acta mujeres», «rendición 2027», «rodaje drone».
        </div>
      )}
    </div>
  );
}
