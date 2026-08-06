"use client";
import { type ReactNode } from "react";
import VistaHilo from "@/components/VistaHilo";
import Avatar from "@/components/Avatar";
import Copiar from "@/components/Copiar";
import { cargarEmpresaRapida } from "@/app/actions";
import { palmaresDe, lineasPalmares, icoMerito } from "@/lib/palmares";
import {
  compromisoDe, empresaLibre, trabasEmpresa, trabasMiembro, dudasMiembro,
  elegibilidadDe, ROTULO_ELEGIBILIDAD,
} from "@/lib/fondos";
import { ICO_EST, soles, un, nomProy } from "@/lib/vistaRapida";

/* VISTA RÁPIDA DE UNA EMPRESA — ¿puedo presentar con ésta, y con qué historial?
 *
 * Solo lectura. El veredicto va ARRIBA porque es lo que decide, y su
 * clasificación sale de `elegibilidadDe` (lib/fondos), la MISMA que usa la
 * hoja de postulación de la ficha. Antes esta vista decidía por su cuenta y
 * mezclaba «ya está en concurso» —que no se arregla con un trámite— con «le
 * falta el RENCA», y encima se tragaba los problemas de los responsables.
 */

const anio = (x: any) => Number(un(x?.conv)?.anio) || 0;
const nom = (p: any) => un(p)?.alias || un(p)?.nombre || "—";

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="vp-bloque">
      <div className="vp-lbl">{titulo}</div>
      {children}
    </div>
  );
}

export default function VistaEmpresa({ empresaId, children }: {
  empresaId: string;
  children: (abrir: (e?: any) => void) => ReactNode;
}) {
  return (
    <VistaHilo
      conHilo={false}
      claseCaja="vp-caja"
      ariaLabel="Vista rápida de la empresa"
      abrirCompletoHref={`/entidad/empresa/${empresaId}`}
      abrirCompletoTitle="Abrir la ficha completa"
      cargar={() => cargarEmpresaRapida(empresaId)}
      listo={(d: any) => !!d?.empresa}
      tituloCab={(d: any) => (d?.empresa ? `🏢 ${d.empresa.nombre}` : "🏢 Empresa")}
      cabecera={(d: any) => {
        const e = d.empresa;
        const posts = d.postulaciones || [];
        /* Vienen por FK directa: no hay filas repetidas, así que el dedup
           sobra —y activarlo escondería dos postulaciones si compartieran id—. */
        const pal = palmaresDe(posts, false);
        const comp = compromisoDe(posts);
        /* Solo los ACTIVOS: quitar a alguien no borra la fila, la marca
           inactiva. Contarlas todas pinta a los ex igual que al vigente. */
        const miembros = (d.miembros || [])
          .filter((m: any) => m.estado === "activo")
          .map((m: any) => ({
            ...m, persona: un(m.persona),
            trabas: trabasMiembro(un(m.persona)), dudas: dudasMiembro(un(m.persona)),
          }));
        const libre = empresaLibre(e, comp);
        const trabasEmp = trabasEmpresa(e, comp);
        const el = elegibilidadDe({
          libre, trabasEmp, miembros,
          bloqueada: comp.ejec > 0, enConcurso: comp.juego > 0,
        });
        const rot = ROTULO_ELEGIBILIDAD[el.estado];
        const ordenadas = [...posts].sort((a: any, b: any) => anio(b) - anio(a));

        return (
          <div className="vp-cuerpo">
            <div className="vp-head">
              {d.logo
                ? <img className="vp-logo" src={d.logo} alt="" referrerPolicy="no-referrer" />
                : <Avatar nombre={e.nombre} size={58} color="#3b82f6" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="vp-nom">{e.nombre}</div>
                {e.razon_social && (
                  <div className="vp-sub">
                    <Copiar valor={e.razon_social} etiqueta="la razón social">{e.razon_social}</Copiar>
                  </div>
                )}
                <div className="vp-badges">
                  {e.codigo && <span className="vp-b">{e.codigo}</span>}
                  {e.tipo && <span className="vp-b">{e.tipo}</span>}
                  {e.relacion && <span className="vp-b">{e.relacion}</span>}
                  {e.estado && e.estado !== "activa" && <span className="vp-b alerta">{e.estado}</span>}
                </div>
              </div>
            </div>

            {/* Copiables: son los que se transcriben a los formularios de DAFO,
                y un RUC con un dígito de menos no falla — valida como otro. */}
            <div className="vp-datos">
              {e.ruc && <span><b>RUC</b> <Copiar valor={e.ruc} etiqueta="el RUC" /></span>}
              {e.estado_sunat && (
                <span className={e.estado_sunat !== "activo" ? "mal" : ""}>
                  <b>SUNAT</b> {e.estado_sunat}
                </span>
              )}
              {e.condicion_sunat && (
                <span className={e.condicion_sunat !== "habido" ? "mal" : ""}>{e.condicion_sunat}</span>
              )}
              {e.renca && <span><b>RENCA</b> <Copiar valor={e.renca} etiqueta="el RENCA" /></span>}
              {e.partida_electronica && (
                <span><b>Partida</b> <Copiar valor={e.partida_electronica} etiqueta="la partida electrónica" /></span>
              )}
              {e.domicilio_fiscal && (
                <span><b>Domicilio</b> <Copiar valor={e.domicilio_fiscal} etiqueta="el domicilio fiscal" /></span>
              )}
            </div>

            {/* ── El veredicto, con el matiz de la hoja: un fondo encima no es
                 un trámite pendiente, y lo que SÍ falta se dice aparte. ── */}
            <div className={`vp-veredicto ${rot.clase}`}>
              <div className="vp-ver-t">{rot.ico} {rot.txt}</div>
              <div className="vp-ver-x">
                {el.estado === "bloqueada"
                  ? <>Está {el.trabaFondo || "ejecutando un fondo ganado"} — hasta rendirlo, no puede
                      tomar otro. No es un trámite que arreglar: ya tiene un fondo encima.</>
                : el.estado === "concurso"
                  ? <>Está postulando con ésta. Según la estrategia de la productora, no conviene
                      apilar otra postulación encima — para eso hay más empresas.</>
                : el.estado === "lista"
                  ? <>Papeles en regla, sin fondos encima, y nada objetable en
                      sus {miembros.length} responsable(s).</>
                : <>Le falta algo para poder presentarse.</>}
              </div>

              {/* Lo pendiente NO se mezcla con el veredicto: en «concurso» y en
                  «bloqueada» la empresa está comprometida Y además puede tener
                  papeles sueltos. Antes esos papeles no se veían en absoluto. */}
              {el.hayPendientes && el.estado !== "lista" && (
                <div className="vp-pend">
                  <div className="vp-pend-h">Pendiente de arreglar:</div>
                  {el.otrasTrabasEmp.map((t: string, i: number) => <div key={i}>· {t}</div>)}
                  {!miembros.length && <div className="mal">· Sin responsables registrados — alguien tiene que firmar.</div>}
                  {el.conProblema.map((m: any, i: number) => (
                    <div key={`m${i}`}>· {m.cargo} ({nom(m.persona)}): <span className="mal">{m.trabas.join(", ")}</span></div>
                  ))}
                </div>
              )}
              {/* Lo que nadie comprobó no está mal, pero tampoco bien. */}
              {el.conReparo && (
                <div className="vp-pend">
                  <div className="vp-pend-h">Nadie lo comprobó:</div>
                  {el.conDuda.map((m: any, i: number) => (
                    <div key={i}>◌ {nom(m.persona)}: {m.dudas.join(", ")}</div>
                  ))}
                </div>
              )}
            </div>

            {(comp.juego > 0 || comp.ejec > 0 || comp.debe > 0 || comp.sinPlazo > 0) && (
              <div className="vp-comp">
                {comp.juego > 0 && <span>🎯 {comp.juego} en concurso</span>}
                {comp.ejec > 0 && <span>⚙ {comp.ejec} ejecutando</span>}
                {comp.debe > 0 && <span className="mal">⚠ {comp.debe} con rendición vencida</span>}
                {comp.sinPlazo > 0 && <span className="mal">⚠ {comp.sinPlazo} ganada sin plazo de rendición</span>}
              </div>
            )}

            <div className="vp-cols">
              <div className="vp-col">
                {pal.total > 0 && (
                  <Bloque titulo="🏆 Palmarés">
                    <div className="vp-lineas">
                      {lineasPalmares(pal).map((l, i) => (
                        <span key={i} className="vp-linea" title={l.titulo}>
                          {l.ico} <b>{l.n}</b> {l.txt}
                        </span>
                      ))}
                    </div>
                    {pal.monto > 0 && (
                      <div className="vp-pal"><span className="vp-pal-m">{soles(pal.monto)} adjudicado</span></div>
                    )}
                  </Bloque>
                )}

                {miembros.length > 0 && (
                  <Bloque titulo={`👥 Responsables · ${miembros.length}`}>
                    <table className="vp-tabla">
                      <tbody>
                        {miembros.map((m: any, i: number) => (
                          <tr key={i} className={m.trabas.length ? "vp-mal" : ""}>
                            <td className="vp-td-i">
                              {m.trabas.length ? "⚠" : m.dudas.length ? "◌" : "✓"}
                            </td>
                            <td>
                              <a href={`/entidad/persona/${m.persona?.id}`} target="_blank" rel="noopener noreferrer">
                                {nom(m.persona)}
                              </a>
                            </td>
                            <td className="vp-td-d" title={m.trabas.join(", ") || m.dudas.join(", ") || m.cargo}>
                              {m.cargo}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Bloque>
                )}
              </div>

              <div className="vp-col">
                {ordenadas.length > 0 && (
                  <Bloque titulo={`🎯 Postulaciones · ${ordenadas.length}`}>
                    {/* Completa y con scroll: un «y N más» que esconda una
                        ganadora hace que el 🏆 de arriba parezca un error. */}
                    <div className="vp-scroll">
                      <table className="vp-tabla">
                        <tbody>
                          {ordenadas.map((x: any) => (
                            <tr key={x.id}>
                              <td className="vp-td-a">{anio(x) || "—"}</td>
                              <td className="vp-td-i" title={x.estado || ""}>
                                {icoMerito(x.estado) || ICO_EST[x.estado] || "•"}
                              </td>
                              <td>
                                <a href={`/entidad/postulacion/${x.id}`} target="_blank" rel="noopener noreferrer">
                                  {nomProy(x.proy)}
                                </a>
                              </td>
                              <td className="vp-td-d" title={un(x.conv)?.nombre || ""}>
                                {Number(x.monto_adjudicado) > 0 ? soles(Number(x.monto_adjudicado)) : ""}
                              </td>
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
