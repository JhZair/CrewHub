"use client";
import { type ReactNode } from "react";
import VistaHilo from "@/components/VistaHilo";
import Avatar from "@/components/Avatar";
import { cargarEmpresaRapida } from "@/app/actions";
import { palmaresDe, resumenPalmares } from "@/lib/palmares";
import { compromisoDe, empresaLibre, trabasEmpresa, puedePedirRenca, trabasMiembro } from "@/lib/fondos";
import { ICO_EST, soles, un, nomProy } from "@/lib/vistaRapida";

/* VISTA RÁPIDA DE UNA EMPRESA — ¿puede postular hoy, y con qué historial?
 *
 * Solo lectura, mismo shell que VistaPersona. La pregunta que resuelve casi
 * siempre es una: «¿con cuál presento esto?». Por eso el veredicto de
 * elegibilidad va ARRIBA, antes que el palmarés — es lo que decide, y sale de
 * lib/fondos.ts, las mismas reglas que /empresas, no una copia.
 */


export default function VistaEmpresa({ empresaId, children }: {
  empresaId: string;
  children: (abrir: (e?: any) => void) => ReactNode;
}) {
  return (
    <VistaHilo
      conHilo={false}
      ariaLabel="Vista rápida de la empresa"
      abrirCompletoHref={`/entidad/empresa/${empresaId}`}
      abrirCompletoTitle="Abrir la ficha completa"
      cargar={() => cargarEmpresaRapida(empresaId)}
      listo={(d: any) => !!d?.empresa}
      tituloCab={(d: any) => (d?.empresa ? `🏢 ${d.empresa.nombre}` : "🏢 Empresa")}
      cabecera={(d: any) => {
        const e = d.empresa;
        const posts = d.postulaciones || [];
        /* Las postulaciones de una empresa vienen por FK directa: no hay filas
           repetidas, así que el dedup sobra —y activarlo escondería dos
           postulaciones distintas si alguna vez comparten id—. */
        const pal = palmaresDe(posts, false);
        const comp = compromisoDe(posts);
        const trabas = trabasEmpresa(e, comp);
        const casi = puedePedirRenca(e, comp);
        /* Los miembros ACTIVOS: `quitarMiembro` no borra la fila, la marca
           inactiva. Contarlas todas hace que una empresa que cambió dos veces
           de representante muestre cinco miembros donde hay tres —y pinte a los
           ex igual que al vigente, que es peor que el número—. */
        const miembros = (d.miembros || []).filter((m: any) => m.estado === "activo");
        /* El veredicto mira TAMBIÉN a los responsables, igual que la ficha y la
           hoja de postulación. Sin esta mitad, una empresa con papeles en regla
           y un representante con el DNI vencido salía en verde arriba del todo
           —justo el campo que decide con cuál se postula—. */
        const conProblema = miembros.filter((m: any) => trabasMiembro(un(m.persona)).length > 0);
        const libre = empresaLibre(e, comp) && miembros.length > 0 && conProblema.length === 0;

        return (
          <div className="vp-cuerpo">
            <div className="vp-head">
              {d.logo
                ? <img className="vp-logo" src={d.logo} alt="" referrerPolicy="no-referrer" />
                : <Avatar nombre={e.nombre} size={54} color="#3b82f6" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="vp-nom">{e.nombre}</div>
                <div className="vp-sub">{e.razon_social || "—"}</div>
                <div className="vp-badges">
                  {e.codigo && <span className="vp-b">{e.codigo}</span>}
                  {e.tipo && <span className="vp-b">{e.tipo}</span>}
                  {e.relacion && <span className="vp-b">{e.relacion}</span>}
                  {e.estado && e.estado !== "activa" && <span className="vp-b alerta">{e.estado}</span>}
                </div>
              </div>
            </div>

            <div className="vp-datos">
              {e.ruc && <span><b>RUC</b> {e.ruc}</span>}
              {e.estado_sunat && (
                <span className={e.estado_sunat !== "activo" ? "mal" : ""}>
                  <b>SUNAT</b> {e.estado_sunat}
                </span>
              )}
              {e.condicion_sunat && (
                <span className={e.condicion_sunat !== "habido" ? "mal" : ""}>
                  {e.condicion_sunat}
                </span>
              )}
              {e.renca && <span><b>RENCA</b> {e.renca}</span>}
              {e.domicilio_fiscal && <span><b>Domicilio</b> {e.domicilio_fiscal}</span>}
            </div>

            {/* ── El veredicto primero: es lo que decide con cuál se postula ── */}
            <div className={`vp-veredicto ${libre ? "si" : casi ? "casi" : "no"}`}>
              {libre ? "✓ Libre para postular"
                : trabas.length === 0 && miembros.length === 0
                  ? "◐ Papeles en regla, pero sin miembros registrados: no hay quién firme"
                : trabas.length === 0 && conProblema.length > 0
                  ? `◐ La empresa está en regla, pero ${conProblema.length} responsable(s) no: `
                    + conProblema.map((m: any) => `${un(m.persona)?.alias || un(m.persona)?.nombre} (${trabasMiembro(un(m.persona)).join(", ")})`).join(" · ")
                : casi ? "◐ A un trámite: solo le falta el RENCA y tiene con qué pedirlo"
                : `✕ No puede postular — ${trabas.join(" · ")}`}
            </div>
            {(comp.juego > 0 || comp.ejec > 0 || comp.debe > 0 || comp.sinPlazo > 0) && (
              <div className="vp-comp">
                {comp.juego > 0 && <span>🎯 {comp.juego} en concurso</span>}
                {comp.ejec > 0 && <span>⚙ {comp.ejec} ejecutando</span>}
                {comp.debe > 0 && <span className="mal">⚠ {comp.debe} con rendición vencida</span>}
                {comp.sinPlazo > 0 && <span className="mal">⚠ {comp.sinPlazo} ganada sin plazo de rendición</span>}
              </div>
            )}

            {pal.total > 0 && (
              <div className="vp-bloque">
                <div className="vp-lbl">🏆 Palmarés</div>
                <div className="vp-pal">
                  <span className="vp-pal-n">{resumenPalmares(pal)}</span>
                  {pal.monto > 0 && <span className="vp-pal-m">{soles(pal.monto)} adjudicado</span>}
                </div>
                <div className="vp-lista">
                  {posts.slice(0, 6).map((x: any) => (
                    <a key={x.id} href={`/entidad/postulacion/${x.id}`} className="vp-item"
                      target="_blank" rel="noopener noreferrer">
                      <span>{ICO_EST[x.estado] || "•"}</span>
                      <span className="vp-item-t">{nomProy(x.proy)}</span>
                      <span className="vp-item-d">{un(x.conv)?.anio || ""}</span>
                    </a>
                  ))}
                  {posts.length > 6 && <div className="vp-mas">y {posts.length - 6} más</div>}
                </div>
              </div>
            )}

            {miembros.length > 0 && (
              <div className="vp-bloque">
                <div className="vp-lbl">👥 Miembros · {miembros.length}</div>
                <div className="vp-miembros">
                  {miembros.slice(0, 8).map((m: any, i: number) => (
                    <a key={i} href={`/entidad/persona/${un(m.persona)?.id}`} className="vp-mini"
                      target="_blank" rel="noopener noreferrer" title={m.cargo || ""}>
                      <Avatar nombre={un(m.persona)?.nombre} src={un(m.persona)?.foto_url} size={24} />
                      <span>{un(m.persona)?.alias || un(m.persona)?.nombre}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }}
    >
      {children}
    </VistaHilo>
  );
}
