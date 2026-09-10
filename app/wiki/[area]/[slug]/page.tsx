import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Enlace from "@/components/Enlace";
import { usuarioActual } from "@/lib/supabase/server";
import Sidebar from "@/components/wiki/Sidebar";
import Toc from "@/components/wiki/Toc";
import Verificacion from "@/components/wiki/Verificacion";
import { FilaPagina, Insignia, Migas } from "@/components/wiki/Piezas";
import {
  anotacionesDe, historialDe, listarAreas, listarPaginas, listarProyectos, listarSecciones,
  mencionadaEn, obtenerPagina, titulosEnlazables, vinculosDe,
} from "@/lib/wiki/datos";
import { renderizarMarkdown, primerParrafo } from "@/lib/wiki/markdown";
import {
  ESTADOS, ESTADOS_APLICACION, NIVELES, PLANTILLA_PROBLEMA, PLANTILLA_TECNICA, TIPOS, TIPOS_ANOTACION,
  type EstadoAplicacion, type TipoAnotacion,
} from "@/lib/wiki/tipos";
import { fechaCorta, hoyISO, pad2 } from "@/lib/wiki/util";
import { agregarAnotacion, borrarAnotacion, quitarVinculo, vincularProyecto } from "@/app/wiki/acciones";

/* ══════════════════════════════════════════════════════════════════════════
   UNA PÁGINA DE LA WIKI — /wiki/[area]/[slug]

   Lectura primero: columna de texto limitada, índice a la derecha (en
   pantallas anchas), barra de verificación arriba, y en la columna derecha
   los proyectos donde se aplica (leídos de `proyectos` vía la tabla
   intermedia) y «Mencionada en».
   ══════════════════════════════════════════════════════════════════════════ */

type Props = { params: { area: string; slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await obtenerPagina(params.area, params.slug);
  if (!p) return { title: "Página" };
  return { title: p.titulo, description: primerParrafo(p.contenido) || undefined };
}

export default async function PaginaWiki({ params }: Props) {
  const user = await usuarioActual();
  if (!user) redirect("/login");

  const pagina = await obtenerPagina(params.area, params.slug);
  if (!pagina) notFound();

  const [areas, secciones, paginasArea, enlazables, historial, vinculos, anotaciones, menciones, proyectos] = await Promise.all([
    listarAreas(), listarSecciones(pagina.area_id), listarPaginas(pagina.area_id), titulosEnlazables(),
    historialDe(pagina.id), vinculosDe(pagina.id), anotacionesDe(pagina.id), mencionadaEn(pagina), listarProyectos(),
  ]);
  const area = areas.find(a => a.id === pagina.area_id);
  if (!area) notFound();
  const seccion = secciones.find(s => s.id === pagina.seccion_id) || null;
  const ruta = `/wiki/${pagina.area_id}/${pagina.slug}`;
  const vacia = !pagina.contenido.trim();

  const r = renderizarMarkdown(pagina.contenido, { areaId: pagina.area_id, areas, paginas: enlazables });
  const toc = [...r.toc];
  if (!vacia) toc.push({ id: "anotaciones", label: "Anotaciones personales" }, { id: "historial", label: "Historial de cambios" });

  const plantilla = pagina.tipo === "problema" ? PLANTILLA_PROBLEMA : PLANTILLA_TECNICA;
  const yaVinculados = new Set(vinculos.map(v => v.proyecto_id));

  return (
    <div className="wk-layout has-rail" style={{ "--c": `var(--a-${area.id})` } as any}>
      <Sidebar areas={areas} area={area} secciones={secciones} paginas={paginasArea} seccionActiva={seccion?.numero} slugActivo={pagina.slug} />

      <main className="wk-main">
        <article className="wk-article">
          <header className="wk-page-head">
            <Migas items={[
              { label: "Wiki", href: "/wiki" },
              { label: area.nombre, href: `/wiki/${area.id}` },
              ...(seccion ? [{ label: `${pad2(seccion.numero)} ${seccion.nombre}`, href: `/wiki/${area.id}?s=${seccion.numero}` }] : []),
            ]} />
            <h1 className="wk-cond">{pagina.titulo}</h1>
            <div className="wk-badges">
              <span>{TIPOS[pagina.tipo] || pagina.tipo}</span>
              <Insignia estado={pagina.estado} />
              <span title={NIVELES[pagina.nivel]}>Nivel {pagina.nivel}</span>
              {pagina.etapa && <span>{pagina.etapa}</span>}
              <span className="wk-muted">Actualizada el {fechaCorta(pagina.actualizado)}</span>
              <Enlace className="wk-edit" href={`${ruta}/editar`}>✎ Editar</Enlace>
            </div>
            {pagina.etiquetas.length > 0 && (
              <div className="wk-tags">{pagina.etiquetas.map(t => <span key={t} className="wk-tag">{t}</span>)}</div>
            )}
          </header>

          {pagina.preguntas.length > 0 && (
            <p className="wk-answers">Responde a{pagina.preguntas.map(q => <span key={q} className="wk-serif">{q}</span>)}</p>
          )}

          {vacia ? (
            <>
              <div className="wk-emptybox" style={{ marginTop: pagina.preguntas.length ? 0 : 24 }}>
                <strong>Esta página está pendiente.</strong> Todavía no tiene contenido. Desarróllala en el hilo{" "}
                <em>Wiki › {area.nombre}{seccion ? ` › ${pad2(seccion.numero)} ${seccion.nombre}` : ""}</em> con la plantilla de{" "}
                {pagina.tipo === "problema" ? "consulta por problema" : "técnica o concepto"} y <Enlace className="wk-link" href={`${ruta}/editar`}>cárgala aquí</Enlace>.
              </div>
              <h2 className="wk-template-t">Apartados de la plantilla</h2>
              {pagina.tipo === "problema"
                ? <ol className="wk-template">{plantilla.map(x => <li key={x}>{x}</li>)}</ol>
                : <ul className="wk-template">{plantilla.map(x => <li key={x}>{x}</li>)}</ul>}
            </>
          ) : (
            <>
              <Verificacion afirmaciones={r.afirmaciones} />
              <div className="wk-body">
                {r.cuerpo}

                {/* ── Anotaciones personales: separadas del conocimiento ── */}
                <section className="wk-personal" aria-labelledby="anotaciones">
                  <h2 id="anotaciones">Anotaciones personales</h2>
                  {anotaciones.length === 0
                    ? <p>Separadas del conocimiento documentado. Todavía no hay anotaciones en esta página.</p>
                    : (
                      <ul className="wk-notes">
                        {anotaciones.map(a => (
                          <li key={a.id}>
                            <span className="wk-note-tipo">{TIPOS_ANOTACION[a.tipo as TipoAnotacion] || a.tipo}</span>
                            <span className="wk-note-texto">{a.texto}</span>
                            <span className="wk-note-meta">
                              {a.autor?.nombre || "—"}, {fechaCorta(a.creado_en)}
                              {a.autor_id === user.id && (
                                <form action={borrarAnotacion} style={{ display: "inline" }}>
                                  <input type="hidden" name="id" value={a.id} /><input type="hidden" name="ruta" value={ruta} />
                                  <button type="submit" className="wk-mini-btn" title="Borrar mi anotación">✕</button>
                                </form>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  <form action={agregarAnotacion} className="wk-note-form">
                    <input type="hidden" name="pagina_id" value={pagina.id} /><input type="hidden" name="ruta" value={ruta} />
                    <select name="tipo" defaultValue="comentario" aria-label="Tipo de anotación">
                      {Object.entries(TIPOS_ANOTACION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input name="texto" required placeholder="Escribe tu anotación" aria-label="Anotación" />
                    <button type="submit" className="wk-btn">Agregar</button>
                  </form>
                </section>

                {/* ── Historial ── */}
                <h2 id="historial">Historial de cambios</h2>
                <ul className="wk-history">
                  {historial.length === 0 && <li><span>{fechaCorta(pagina.actualizado)}</span>Página creada.</li>}
                  {historial.map(h => (
                    <li key={h.id}>
                      <span>{fechaCorta(h.fecha)}</span>
                      <div>
                        {h.cambio}
                        {h.motivo && <> — {h.motivo}</>}
                        {h.fuente && <> — <em>Fuente nueva: {h.fuente}</em></>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </article>
      </main>

      <aside className="wk-rail" aria-label="Información de la página">
        {!vacia && <Toc entradas={toc} />}

        <div className="wk-rail-block">
          <h3>Proyectos donde se aplica</h3>
          {vinculos.length === 0 && <p className="wk-rail-hint" style={{ marginTop: 0 }}>Todavía no está vinculada a ningún proyecto.</p>}
          {vinculos.map(v => (
            <div key={v.id} className="wk-proj">
              {v.proyecto
                ? <strong><Enlace href={`/entidad/proyecto/${v.proyecto.id}`}>{v.proyecto.nombre_corto || v.proyecto.nombre}</Enlace></strong>
                : <strong>Proyecto no disponible</strong>}
              <span className="wk-proj-state">
                <span className="wk-dot" style={{ background: `var(--ap-${v.estado})` }} />
                {ESTADOS_APLICACION[v.estado as EstadoAplicacion] || v.estado}
                <span className="wk-muted"> · {fechaCorta(v.fecha)}</span>
              </span>
              {v.uso && <p>{v.uso}</p>}
              {v.nota && <p className="wk-muted">{v.nota}</p>}
              <form action={quitarVinculo}>
                <input type="hidden" name="id" value={v.id} /><input type="hidden" name="ruta" value={ruta} />
                <button type="submit" className="wk-mini-btn">Quitar vínculo</button>
              </form>
            </div>
          ))}
          <details className="wk-rail-form">
            <summary>＋ Vincular a un proyecto</summary>
            <form action={vincularProyecto} className="wk-form-mini">
              <input type="hidden" name="pagina_id" value={pagina.id} /><input type="hidden" name="ruta" value={ruta} />
              <select name="proyecto_id" required defaultValue="" aria-label="Proyecto">
                <option value="" disabled>Proyecto de CrewHUB+…</option>
                {proyectos.filter(p => !yaVinculados.has(p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.folio ? `${p.folio} · ` : ""}{p.nombre_corto || p.nombre}</option>
                ))}
              </select>
              <input name="uso" placeholder="Uso: para qué se aplica en el proyecto" aria-label="Uso" />
              <select name="estado" defaultValue="evaluando" aria-label="Estado de aplicación">
                {Object.entries(ESTADOS_APLICACION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input name="fecha" type="date" defaultValue={hoyISO()} aria-label="Fecha" />
              <input name="nota" placeholder="Nota (opcional)" aria-label="Nota" />
              <button type="submit" className="wk-btn">Vincular</button>
            </form>
          </details>
          <p className="wk-rail-hint">Los datos del proyecto se leen de CrewHUB+.</p>
        </div>

        <div className="wk-rail-block">
          <h3>Mencionada en</h3>
          {menciones.length === 0 && <p className="wk-rail-hint" style={{ marginTop: 0 }}>Ninguna página la enlaza todavía.</p>}
          {menciones.map(p => (
            <FilaPagina key={p.id} p={p} area={areas.find(a => a.id === p.area_id)} />
          ))}
        </div>

        <div className="wk-rail-block wk-rail-meta">
          <h3>Ficha</h3>
          <p className="wk-rail-hint" style={{ marginTop: 0 }}>
            {ESTADOS[pagina.estado]?.icono} {ESTADOS[pagina.estado]?.label} · Nivel {pagina.nivel}, {NIVELES[pagina.nivel]}<br />
            {r.fuentes > 0 ? `${r.fuentes} fuentes` : "Sin fuentes registradas"}<br />
            slug <code>{pagina.slug}</code>
          </p>
        </div>
      </aside>
    </div>
  );
}
