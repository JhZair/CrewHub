import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import BuscadorGlobal from "@/components/BuscadorGlobal";
import Link from "next/link";
import { redirect } from "next/navigation";

/* BÚSQUEDA GLOBAL — Qhaway busca en todo el conocimiento:
   casos, comentarios, personas, proyectos, empresas, equipos,
   lugares y convocatorias. Una caja, todo el sistema. */

const ESTADOS: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso", en_pausa: "En Pausa",
  resuelta: "Resuelta", archivada: "Archivada",
};
const TIPO_ICO: Record<string, string> = {
  aviso: "📢", tarea: "✅", problema: "❗", pago: "💰", idea: "💡", archivo: "📎",
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
      emps: any[] = [], equis: any[] = [], lugs: any[] = [], convs: any[] = [], postus: any[] = [];
  const palabras = q ? partir(q) : [];

  if (q) {
    // Coincide si TODAS las palabras están en el "pajar" del registro
    const coincide = (hay: string) => { const h = nrmB(hay); return palabras.every(w => h.includes(w)); };
    // Para tablas grandes: pre-filtro OR en la BD (cualquier palabra en cualquier campo)
    const orDe = (campos: string[]) => palabras
      .map(w => w.replace(/[,%()]/g, ""))
      .flatMap(w => campos.map(f => `${f}.ilike.%${w}%`)).join(",");

    const [c1, c2, c3, c4, c5, c6, c7, c8, c9] = await Promise.all([
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
    ]);

    casos = (c1.data || []).filter((p: any) => coincide(`${p.titulo} ${p.cuerpo}`)).slice(0, 12);
    coms = (c2.data || []).filter((c: any) => coincide(`${c.cuerpo} ${(c.pub as any)?.titulo}`)).slice(0, 12);
    pers = (c3.data || []).filter((p: any) => coincide(`persona ${p.nombre} ${p.alias} ${p.rol} ${p.notas} ${p.ruc_dni}`)).slice(0, 10);
    proys = (c4.data || []).filter((p: any) => coincide(`proyecto ${p.nombre} ${p.nombre_corto} ${p.folio} ${p.descripcion}`)).slice(0, 10);
    emps = (c5.data || []).filter((e: any) => coincide(`empresa ${e.nombre} ${e.razon_social} ${e.codigo} ${e.ruc}`)).slice(0, 10);
    equis = (c6.data || []).filter((e: any) => coincide(`equipo ${e.nombre} ${e.folio} ${e.categoria} ${e.subcategoria} ${e.descripcion}`)).slice(0, 10);
    lugs = (c7.data || []).filter((l: any) => coincide(`lugar ${l.nombre}`)).slice(0, 6);
    convs = (c8.data || []).filter((c: any) => coincide(`convocatoria concurso ${c.codigo} ${c.nombre} ${c.anio}`)).slice(0, 6);
    postus = (c9.data || []).filter((p: any) => coincide(
      `postulacion ${p.codigo} ${p.codigo_plataforma} ${p.codigo_acta} ${p.estado} ${p.feedback_jurado} ` +
      `${(p.proy as any)?.nombre} ${(p.conv as any)?.codigo} ${(p.conv as any)?.nombre} ${(p.conv as any)?.anio} ` +
      `${p.codigo_acta || p.acta_url ? "acta de compromiso" : ""} ${p.fecha_limite_rendicion ? "rendicion" : ""} ` +
      `${p.estado === "ganadora" ? "ganadora fondo estimulo" : ""}`
    )).slice(0, 8);
  }

  const total = casos.length + coms.length + pers.length + proys.length
    + emps.length + equis.length + lugs.length + convs.length + postus.length;

  const Seccion = ({ titulo, n, children }: any) => n > 0 ? (
    <div style={{ marginBottom: 22 }}>
      <div className="h4" style={{ marginTop: 0 }}>{titulo} · {n}</div>
      {children}
    </div>
  ) : null;

  const Fila = ({ href, children }: any) => (
    <Link href={href}>
      <div className="card link" style={{ cursor: "pointer", padding: "11px 15px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
          {children}
        </div>
      </div>
    </Link>
  );

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
      </div>

      <h1 className="title-lg">🔍 Buscar en todo CrewHub+</h1>
      <div style={{ marginBottom: 18 }}>
        <BuscadorGlobal inicial={q} />
      </div>

      {q && (
        <div className="qhaway-tira" style={{ marginBottom: 20 }}>
          <span className="qa">🤖</span>
          <span>
            <b>Qhaway</b>: {total
              ? `encontré ${total} resultado${total === 1 ? "" : "s"} para «${q}» en todo el conocimiento del equipo.`
              : `nada para «${q}» — prueba con menos palabras o revisa la ortografía.`}
          </span>
        </div>
      )}

      <Seccion titulo="📌 Casos" n={casos.length}>
        {casos.map((p: any) => (
          <Fila key={p.id} href={`/caso/${p.id}`}>
            <span>{TIPO_ICO[p.tipo] || "💬"}</span>
            <b>{p.titulo}</b>
            <span className={`pill st-${p.estado}`} style={{ fontSize: 10 }}>{ESTADOS[p.estado] || p.estado}</span>
            {p.cuerpo && <span style={{ color: "var(--muted)", fontSize: 12, width: "100%" }}>{snippet(p.cuerpo, palabras)}</span>}
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="💬 En comentarios" n={coms.length}>
        {coms.map((c: any) => (
          <Fila key={c.id} href={`/caso/${c.publicacion_id}`}>
            <span style={{ color: "var(--muted)", fontSize: 12.5, fontStyle: "italic" }}>
              "{snippet(c.cuerpo, palabras)}"
            </span>
            <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
              — {(c.autor as any)?.nombre?.split(" ")[0]} en «{(c.pub as any)?.titulo}»
            </span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="👤 Personas" n={pers.length}>
        {pers.map((p: any) => (
          <Fila key={p.id} href={`/entidad/persona/${p.id}`}>
            <b>{p.nombre}</b>
            {p.rol && <span style={{ color: "var(--muted)", fontSize: 12 }}>{p.rol.slice(0, 50)}</span>}
            <span style={{ flex: 1 }} />
            <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.tipo}</span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="📁 Proyectos" n={proys.length}>
        {proys.map((p: any) => (
          <Fila key={p.id} href={`/entidad/proyecto/${p.id}`}>
            <b>{p.nombre}</b>
            {p.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{p.folio}</span>}
            <span style={{ color: "var(--dim)", fontSize: 12 }}>{p.etapa?.replace(/_/g, " ")}</span>
          </Fila>
        ))}
      </Seccion>

      <Seccion titulo="🏢 Empresas" n={emps.length}>
        {emps.map((e: any) => (
          <Fila key={e.id} href={`/entidad/empresa/${e.id}`}>
            <b>{e.nombre}</b>
            {e.razon_social && <span style={{ color: "var(--dim)", fontSize: 12 }}>{e.razon_social}</span>}
            {e.ruc && <span style={{ color: "var(--dim)", fontSize: 12 }}>RUC {e.ruc}</span>}
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
