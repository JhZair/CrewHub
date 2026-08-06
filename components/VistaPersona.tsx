"use client";
import { type ReactNode } from "react";
import VistaHilo from "@/components/VistaHilo";
import Avatar from "@/components/Avatar";
import { cargarPersonaRapida } from "@/app/actions";
import { palmaresDePersona, postulacionesDePersona, lineasPalmares,
  icoMerito, tituloMerito } from "@/lib/palmares";
import { esLiderazgo } from "@/lib/rolesEquipo";
import { trabasMiembro, dudasMiembro } from "@/lib/fondos";
import { ICO_EST, soles, un, nomProy } from "@/lib/vistaRapida";

/* VISTA RÁPIDA DE UNA PERSONA — orientarse sin salir de donde estás.
 *
 * SOLO LECTURA a propósito: un pop-up que se abre desde cualquier chip no es
 * buen sitio para cambiar datos. El shell viene de VistaHilo con
 * `conHilo={false}`; lo único propio es esta cabecera.
 *
 * ⚠ Regla que este archivo aprendió por las malas: NINGUNA lista se recorta.
 * La primera versión mostraba «las 6 primeras» de 10 y el resumen decía
 * «🏆 3» con solo dos trofeos visibles — el tercero estaba entre las
 * escondidas. Un resumen y su detalle no pueden contradecirse: o se muestra
 * todo (con scroll), o el resumen deja de existir. Aquí se muestra todo.
 */

const anioDe = (x: any) => Number(un(x?.conv)?.anio) || 0;

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="vp-bloque">
      <div className="vp-lbl">{titulo}</div>
      {children}
    </div>
  );
}

export default function VistaPersona({ personaId, children }: {
  personaId: string;
  children: (abrir: (e?: any) => void) => ReactNode;
}) {
  return (
    <VistaHilo
      conHilo={false}
      claseCaja="vp-caja"
      ariaLabel="Vista rápida de la persona"
      abrirCompletoHref={`/entidad/persona/${personaId}`}
      abrirCompletoTitle="Abrir la ficha completa"
      cargar={() => cargarPersonaRapida(personaId)}
      listo={(d: any) => !!d?.persona}
      tituloCab={(d: any) => (d?.persona ? `👤 ${d.persona.alias || d.persona.nombre}` : "👤 Persona")}
      cabecera={(d: any) => {
        const p = d.persona;
        const pal = palmaresDePersona(d.postulaciones);
        const lineas = lineasPalmares(pal);
        const trabas = trabasMiembro(p);
        const dudas = dudasMiembro(p);
        /* Una fila por postulación, con el cargo MÁS ALTO que tuvo en ella
           (si dirigió y además escribió, ganó dirigiendo). Ordenadas por año
           descendente: lo reciente arriba, que es como se lee una trayectoria. */
        const posts = postulacionesDePersona(d.postulaciones)
          .sort((a: any, b: any) => anioDe(b) - anioDe(a));
        const cargosVivos = (d.cargos || []).filter((c: any) => c.estado !== "inactivo" && !c.fecha_fin);
        const dirige = (c: any) => /direc|codirec/i.test(String(c.cargo || ""));
        const espec = String(p.rol || "").split(",").map((x: string) => x.trim()).filter(Boolean);

        return (
          <div className="vp-cuerpo">
            {/* ── Identidad ── */}
            <div className="vp-head">
              <Avatar nombre={p.nombre} src={p.foto_url} size={58} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="vp-nom">{p.nombre}</div>
                <div className="vp-sub">
                  {/* Diez especialidades ocupaban tres renglones y empujaban
                      todo lo demás fuera de la vista. Se ven tres; el resto
                      está en el tooltip y en la ficha. */}
                  {espec.slice(0, 3).join(" · ")}
                  {espec.length > 3 && (
                    <span className="vp-mas-inline" title={espec.join(" · ")}> +{espec.length - 3} más</span>
                  )}
                  {p.region && <> · {p.region}</>}
                </div>
                <div className="vp-badges">
                  {p.tipo && <span className="vp-b">{p.tipo}</span>}
                  {p.equipo && <span className="vp-b">{p.equipo}</span>}
                  {p.estado && p.estado !== "activo" && <span className="vp-b alerta">{p.estado}</span>}
                  {d.cuenta && <span className="vp-b ok">tiene cuenta</span>}
                  {p.es_comunero && <span className="vp-b">comunero</span>}
                </div>
              </div>
            </div>

            <div className="vp-datos">
              {p.ruc_dni && <span><b>DNI/RUC</b> {p.ruc_dni}</span>}
              {p.telefono && <span><b>Tel</b> {p.telefono}</span>}
              {p.email && <span><b>Correo</b> {p.email}</span>}
              {p.nombre_reniec && (
                <span title="Nombre según RENIEC"><b>RENIEC</b> {p.nombre_reniec}</span>
              )}
            </div>

            {/* ── Dos columnas: el espacio sobraba y la lista se leía apretada ── */}
            <div className="vp-cols">
              <div className="vp-col">
                {/* ── Mérito, jerarquizado por el papel desempeñado ── */}
                {pal.total > 0 && (
                  <Bloque titulo="🏆 Palmarés">
                    <div className="vp-lineas">
                      {/* El mismo ámbar que marca las filas encabezadas: así
                          «2 ganadas dirigiendo» se comprueba buscando dos 🏆
                          con filo, sin memorizar qué significa cada glifo. */}
                      {lineas.map((l, i) => (
                        <span key={i} className={`vp-linea${l.lider ? " lider" : ""}`} title={l.titulo}>
                          {l.ico} <b>{l.n}</b> {l.txt}
                        </span>
                      ))}
                    </div>
                    <div className="vp-pal">
                      {pal.monto > 0 && <span className="vp-pal-m">{soles(pal.monto)} adjudicado</span>}
                      <span className="vp-punt" title={
                        "Puntaje para ORDENAR listas, no para decidir por nadie. "
                        + "Ganada dirigiendo 5 · al jurado dirigiendo 3 · ganada en equipo 2 · "
                        + "al jurado en equipo 1 · cada postulación 0.2. "
                        + "Es una convención nuestra, no una medida: el desglose de arriba es el dato."
                      }>≈ {pal.puntaje}</span>
                    </div>
                  </Bloque>
                )}

                <Bloque titulo="📋 Papeles">
                  {trabas.length > 0 && (
                    <div className="vp-trabas">{trabas.map((t, i) => <span key={i}>⚠ {t}</span>)}</div>
                  )}
                  {/* Lo que NADIE verificó no es lo mismo que lo que está bien:
                      un hueco pintado de verde se lee como aprobado. */}
                  {dudas.length > 0 && (
                    <div className="vp-dudas">{dudas.map((t, i) => <span key={i}>◌ {t}</span>)}</div>
                  )}
                  {trabas.length === 0 && dudas.length === 0 && (
                    <div className="vp-ok">✓ Verificado y sin trabas</div>
                  )}
                  {p.suspension_4ta_anio && (
                    Number(p.suspension_4ta_anio) < new Date().getFullYear()
                      ? <div className="vp-trabas"><span>⚠ Suspensión de 4ta vencida ({p.suspension_4ta_anio})</span></div>
                      : <div className="vp-nota">Suspensión de 4ta · {p.suspension_4ta_anio}</div>
                  )}
                </Bloque>

                {cargosVivos.length > 0 && (
                  <Bloque titulo="🏢 Cargos vigentes">
                    <table className="vp-tabla">
                      <tbody>
                        {cargosVivos.map((c: any, i: number) => (
                          <tr key={i}>
                            <td><a href={`/entidad/empresa/${un(c.empresa)?.id}`} target="_blank"
                              rel="noopener noreferrer">{un(c.empresa)?.nombre}</a></td>
                            <td className="vp-td-d">{c.cargo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Bloque>
                )}

                {(d.prestamos || []).length > 0 && (
                  <Bloque titulo={`🤝 Equipos a su nombre · ${d.prestamos.length}`}>
                    <div className="vp-equipos">
                      {d.prestamos.map((r: any) => (
                        <a key={r.id} href={`/entidad/equipamiento/${un(r.equipo)?.id}`}
                          target="_blank" rel="noopener noreferrer" className="vp-eq"
                          title={un(r.equipo)?.nombre || ""}>
                          {un(r.equipo)?.folio || un(r.equipo)?.nombre}
                        </a>
                      ))}
                    </div>
                  </Bloque>
                )}
              </div>

              <div className="vp-col">
                {posts.length > 0 && (
                  <Bloque titulo={`🎯 Postulaciones · ${posts.length}`}>
                    <div className="vp-scroll">
                      <table className="vp-tabla">
                        <tbody>
                          {posts.map((x: any) => (
                            <tr key={x.id} className={esLiderazgo(x.cargo) ? "vp-lider" : ""}>
                              <td className="vp-td-a">{anioDe(x) || "—"}</td>
                              {/* El ícono dice resultado Y papel, igual que el
                                  desglose: un 🏆 en la lista es una ganada
                                  dirigiendo, y hay tantos como dice arriba. */}
                              <td className="vp-td-i" title={tituloMerito(x.estado, x.cargo)}>
                                {icoMerito(x.estado) || ICO_EST[x.estado] || "•"}
                              </td>
                              <td>
                                <a href={`/entidad/postulacion/${x.id}`} target="_blank" rel="noopener noreferrer">
                                  {nomProy(x.proy)}
                                </a>
                              </td>
                              <td className="vp-td-d" title={tituloMerito(x.estado, x.cargo)}>
                                {x.cargo || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Bloque>
                )}

                {((d.proyectos || []).length > 0 || (d.actor || []).length > 0) && (
                  <Bloque titulo={`🎬 Trayectoria · ${(d.proyectos || []).length + (d.actor || []).length}`}>
                    <div className="vp-scroll">
                      <table className="vp-tabla">
                        <tbody>
                          {(d.proyectos || []).map((c: any, i: number) => (
                            <tr key={i}>
                              <td className="vp-td-i">{dirige(c) ? "🎬" : "•"}</td>
                              <td><a href={`/entidad/proyecto/${un(c.proyecto)?.id}`} target="_blank"
                                rel="noopener noreferrer">{nomProy(c.proyecto)}</a></td>
                              <td className="vp-td-d" title={c.cargo || ""}>{c.cargo}</td>
                            </tr>
                          ))}
                          {(d.actor || []).map((c: any, i: number) => (
                            <tr key={`a${i}`}>
                              <td className="vp-td-i">🎭</td>
                              <td><a href={`/entidad/proyecto/${un(c.proyecto)?.id}`} target="_blank"
                                rel="noopener noreferrer">{nomProy(c.proyecto)}</a></td>
                              <td className="vp-td-d" title={c.rol || ""}>{c.rol}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Bloque>
                )}
              </div>
            </div>
          </div>
        );
      }}
    >
      {children}
    </VistaHilo>
  );
}
