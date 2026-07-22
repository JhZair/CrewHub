import { createClient } from "@/lib/supabase/server";
import Volver from "@/components/Volver";
import { Chip, FilaFiltro, PanelFiltros } from "@/components/Filtros";
import { TIPOS_OBJETO, TIPO_CV, icoObjeto, lblObjeto, ordenObjeto } from "@/lib/objetos";
import { ICO_ENT } from "@/lib/secciones";
import { resolverNombres } from "@/lib/nombres";
import { enlaceLimpio } from "@/lib/drive";
import MiniObjeto from "@/components/MiniObjeto";
import NuevoObjeto from "@/components/NuevoObjeto";
import { catalogosDuenos, DUENOS } from "@/lib/catalogos";
import { buscadorDe, pal } from "@/lib/buscar";
import { mapaAlias } from "@/lib/personas";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "📚 Repositorio" };

/* EL REPOSITORIO, COMPLETO — todo lo que se sabe y no cabe en un formulario,
   de todas las entidades juntas. Cada objeto sigue perteneciendo a su ficha;
   esto es la vista de conjunto: qué tenemos, de quién, y de qué tipo.
   Es lo que hace posible armar un dossier: "todo lo que hay sobre los khipus". */

const fmtDia = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
/* `creado_en` es timestamp, no columna `date`: se formatea sin el T12:00 que
   necesitan las otras. */
const fmtHora = (d: string) =>
  new Date(d).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });

/** Los tipos de entidad que pueden tener repositorio (todas menos el objeto). */
// (DUENOS vive en lib/catalogos: lo comparten esta página y el selector.)

export default async function RepositorioPage({ searchParams }: {
  searchParams: { q?: string; t?: string; de?: string };
}) {
  const q = (searchParams?.q || "").trim();
  const t = searchParams?.t || "";
  const de = searchParams?.de || "";

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: objs }, { data: vincs }, { data: aliasPers },
         { data: coms }, { data: casos }] = await Promise.all([
    supabase.from("objetos")
      .select("id,tipo,titulo,url,fecha,notas,entidad_tipo,entidad_id,creado_en,creado_por,quien:perfiles(nombre)")
      .order("fecha", { ascending: false, nullsFirst: false })
      .order("creado_en", { ascending: false })
      .limit(600),
    supabase.from("objeto_vinculos").select("objeto_id").limit(5000),
    supabase.from("personas").select("usuario_id,alias")
      .not("alias", "is", null).not("usuario_id", "is", null),
    /* Conversación y trabajo, que es lo que dice si un objeto está vivo o solo
       está guardado. Dos consultas planas y se cuentan en memoria: pedir un
       count embebido por objeto serían 31 consultas.
       Con techo explícito: PostgREST corta en 1000 por defecto y sin `limit`
       el día que se pase, los badges empiezan a mentir en silencio. */
    supabase.from("comentarios").select("objeto_id").not("objeto_id", "is", null).limit(5000),
    supabase.from("publicacion_vinculos").select("entidad_id").eq("entidad_tipo", "objeto").limit(5000),
  ]);
  // Quién lo trajo, con su alias (JohnO) como en el resto del sistema.
  const alias = mapaAlias(aliasPers);
  const todos = (objs || []).map((o: any) => ({
    ...o, autor: (o.creado_por && alias[o.creado_por]) || o.quien?.nombre || null,
  }));

  // Cuántos vínculos tiene cada objeto: dice si es material suelto o si está
  // sosteniendo algo.
  const nVinc = new Map<string, number>();
  (vincs || []).forEach((v: any) => nVinc.set(v.objeto_id, (nVinc.get(v.objeto_id) || 0) + 1));
  const nCom = new Map<string, number>();
  (coms || []).forEach((c: any) => nCom.set(c.objeto_id, (nCom.get(c.objeto_id) || 0) + 1));
  const nCaso = new Map<string, number>();
  (casos || []).forEach((c: any) => nCaso.set(c.entidad_id, (nCaso.get(c.entidad_id) || 0) + 1));

  // Los nombres de los dueños: resolvedor compartido (lib/nombres).
  const nombres = await resolverNombres(supabase,
    todos.map((o: any) => ({ tipo: o.entidad_tipo, id: o.entidad_id })));
  const duenoDe = (o: any) => nombres.get(`${o.entidad_tipo}:${o.entidad_id}`) || "—";

  // Catálogos para elegir dueño al agregar desde aquí.
  const { catalogos, etiquetas } = await catalogosDuenos(supabase);

  // Mismo motor de búsqueda que el resto: sin tildes, por palabras
  const coincide = buscadorDe(q);
  const filtrados = todos.filter((o: any) =>
    (!t || o.tipo === t) &&
    (!de || o.entidad_tipo === de) &&
    (!q || coincide(pal(o.titulo, o.notas, lblObjeto(o.tipo), duenoDe(o)))));

  const cnt = (k: string) => todos.filter((o: any) => o.tipo === k).length;
  const cntDe = (k: string) => todos.filter((o: any) => o.entidad_tipo === k).length;
  const listar = !!(q || t || de);

  // Agrupado por tipo, en el orden pensado de la lista
  const grupos = [...new Set(filtrados.map((o: any) => o.tipo))]
    .sort((a, b) => ordenObjeto(a) - ordenObjeto(b))
    .map(tt => ({ tipo: tt, items: filtrados.filter((o: any) => o.tipo === tt) }));

  return (
    <div className="shell">
      <div className="topbar">
        <Volver />
        <span className="spacer" />
        <Link href="/casos/objeto" className="btn btn-ghost"
          title="Conversaciones sobre objetos del repositorio">🗂 Casos</Link>
        <Link href="/historial/objeto" className="btn btn-ghost"
          title="Todo lo que se movió en el repositorio">🕐 Historial</Link>
        {/* Se puede guardar material aquí mismo: el dueño se elige dentro del
            formulario, no viajando a su ficha. */}
        <NuevoObjeto catalogos={catalogos} etiquetas={etiquetas} />
      </div>
      <h1 className="title-lg">📚 Repositorio</h1>
      <p style={{ color: "var(--dim)", fontSize: 12.5, margin: "0 0 12px" }}>
        Todo lo que sabemos y no cabe en un formulario: obras, referencias, prensa,
        premios, investigaciones. Cada objeto pertenece a alguien — una persona,
        un proyecto, una empresa — y se puede agregar desde aquí o desde su ficha.
      </p>

      <form className="card" style={{ display: "flex", gap: 10, padding: 12 }}>
        {t && <input type="hidden" name="t" value={t} />}
        {de && <input type="hidden" name="de" value={de} />}
        <span className="buscador-lista">
          <span className="bg-lupa">🔍</span>
          <input name="q" defaultValue={q} placeholder="Título, nota, de quién…" />
        </span>
        <button className="btn" type="submit">Buscar</button>
      </form>

      <PanelFiltros limpiar="/repositorio" mostrarLimpiar={listar}>
        <FilaFiltro titulo="Tipo">
          {[...TIPOS_OBJETO, { key: TIPO_CV, ico: "📋", lbl: "CV" }].map((x: any) => {
            const n = cnt(x.key);
            return n === 0 ? null : (
              <Chip key={x.key} href={`/repositorio?t=${x.key}`} on={t === x.key}>
                {x.ico} {x.lbl} · {n}
              </Chip>
            );
          })}
        </FilaFiltro>
        <FilaFiltro titulo="De">
          {DUENOS.map(s => {
            const n = cntDe(s.tipo);
            return n === 0 ? null : (
              <Chip key={s.tipo} href={`/repositorio?de=${s.tipo}`} on={de === s.tipo} color="var(--violet)">
                {s.ico} {s.plural} · {n}
              </Chip>
            );
          })}
        </FilaFiltro>
      </PanelFiltros>

      <div style={{ color: "var(--muted)", fontSize: 13, margin: "2px 4px 10px" }}>
        {filtrados.length} objeto{filtrados.length === 1 ? "" : "s"}
        {t && ` · ${lblObjeto(t).toLowerCase()}`}{q && ` · «${q}»`}
      </div>

      {grupos.map(g => (
        <div key={g.tipo} style={{ marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 4px 6px" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
              {icoObjeto(g.tipo)} {lblObjeto(g.tipo)} · {g.items.length}
            </span>
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {g.items.map((o: any) => {
            const nv = nVinc.get(o.id) || 0;
            const nc = nCom.get(o.id) || 0;
            const nk = nCaso.get(o.id) || 0;
            return (
              /* Enlace ESTIRADO, no <Link> envolviendo: la tarjeta lleva a la
                 ficha del objeto por una capa invisible, y así el ↗ del link
                 original puede ser su propio enlace. Un <a> dentro de otro <a>
                 es HTML inválido y revienta al hidratar. */
              <div key={o.id} className="card link fila-cap repo-item">
                <Link href={`/objeto/${o.id}`} className="fila-cubre" aria-label={o.titulo} />
                <MiniObjeto url={o.url} ico={icoObjeto(o.tipo)} />
                <span className="repo-item-cuerpo">
                  {/* El título manda y se queda con TODO el ancho. Antes competía
                      en la misma línea con cuatro chips y un botón, así que un
                      título largo se partía o se comía a las píldoras. */}
                  <span className="repo-item-cab">
                    <b>{o.titulo}</b>
                    {o.fecha && <i className="repo-fecha">{fmtDia(o.fecha)}</i>}
                  </span>
                  {o.notas && <span className="repo-item-notas">{o.notas}</span>}
                  {/* Pie: de dónde viene y qué tiene encima, todo en una banda.
                      La procedencia del dato es parte del dato. */}
                  <span className="repo-item-pie">
                    <span className="repo-pie">
                      agregado{o.autor ? ` por ${o.autor}` : ""}
                      {o.creado_en ? ` · ${fmtHora(o.creado_en)}` : ""}
                    </span>
                    <span className="repo-item-chips">
                      {nv > 0 && <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)" }}>🔗 {nv}</span>}
                      {/* Un objeto con conversación o con trabajo encima no es lo
                          mismo que uno solo archivado. Solo se pintan si existen:
                          una fila de ceros no informa, estorba. */}
                      {nc > 0 && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>💬 {nc}</span>}
                      {nk > 0 && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>🗂 {nk}</span>}
                      <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>
                        {ICO_ENT[o.entidad_tipo] || "🔗"} {duenoDe(o)}
                      </span>
                      {/* Abrir el original sin pasar por la ficha */}
                      {o.url && (
                        <a href={enlaceLimpio(o.url)} target="_blank" rel="noopener noreferrer"
                          className="repo-abrir fila-encima" title={`Abrir ${lblObjeto(o.tipo).toLowerCase()} ↗`}>↗</a>
                      )}
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {!filtrados.length && (
        <div className="empty">
          {todos.length
            ? <>Sin resultados{q && ` para «${q}»`}.</>
            : <>Vacío. Usa ＋ Agregar aquí arriba, o hazlo desde la ficha de quien lo aporta.</>}
        </div>
      )}
      {todos.length === 600 && (
        <div className="empty">Mostrando 600 — afina la búsqueda para ver más.</div>
      )}
    </div>
  );
}
