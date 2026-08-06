"use client";
import { type ReactNode } from "react";
import VistaHilo from "@/components/VistaHilo";
import Avatar from "@/components/Avatar";
import { cargarPersonaRapida } from "@/app/actions";
import { palmaresDePersona, postDeFila, resumenPalmares } from "@/lib/palmares";
import { trabasMiembro, dudasMiembro } from "@/lib/fondos";
import { ICO_EST, soles, un, nomProy } from "@/lib/vistaRapida";

/* VISTA RÁPIDA DE UNA PERSONA — orientarse sin salir de donde estás.
 *
 * Es de SOLO LECTURA a propósito. Un pop-up que se abre desde cualquier chip no
 * es un buen sitio para cambiar datos: el contexto de trabajo está en la ficha,
 * y aquí un clic de más edita algo que nadie estaba mirando. Por eso el shell
 * viene de VistaHilo con `conHilo={false}` — portal, Esc, cierre por fondo y
 * carga-al-abrir sin duplicar una línea— y lo único que aporta es la cabecera.
 *
 * El orden responde a las preguntas en el orden en que se hacen: quién es →
 * qué ha ganado → puede postular o le falta un papel → qué tiene entre manos →
 * de dónde viene.
 */


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
      ariaLabel="Vista rápida de la persona"
      abrirCompletoHref={`/entidad/persona/${personaId}`}
      abrirCompletoTitle="Abrir la ficha completa"
      cargar={() => cargarPersonaRapida(personaId)}
      listo={(d: any) => !!d?.persona}
      tituloCab={(d: any) => (d?.persona ? `👤 ${d.persona.alias || d.persona.nombre}` : "👤 Persona")}
      cabecera={(d: any) => {
        const p = d.persona;
        const pal = palmaresDePersona(d.postulaciones);
        const trabas = trabasMiembro(p);
        const dudas = dudasMiembro(p);
        /* Dedup por postulación ANTES de listar: la misma persona puede figurar
           como Director y como Autor en una sola, y sin esto la lista la muestra
           dos veces —y el lector cuenta dos intentos donde hubo uno—. */
        const vistos = new Set<string>();
        const posts = (d.postulaciones || [])
          .map(postDeFila)
          .filter((x: any) => x?.id && !vistos.has(x.id) && vistos.add(x.id));
        const cargosVivos = (d.cargos || []).filter((c: any) => c.estado !== "inactivo" && !c.fecha_fin);
        const dirige = (c: any) => /direc|codirec/i.test(String(c.cargo || ""));

        return (
          <div className="vp-cuerpo">
            {/* ── Identidad ── */}
            <div className="vp-head">
              <Avatar nombre={p.nombre} src={p.foto_url} size={54} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="vp-nom">{p.nombre}</div>
                <div className="vp-sub">
                  {[p.rol, p.region, p.organizacion].filter(Boolean).join(" · ") || "—"}
                </div>
                <div className="vp-badges">
                  {p.tipo && <span className="vp-b">{p.tipo}</span>}
                  {p.equipo && <span className="vp-b">{p.equipo}</span>}
                  {p.estado && p.estado !== "activo" && (
                    <span className="vp-b alerta">{p.estado}</span>
                  )}
                  {d.cuenta && <span className="vp-b ok">tiene cuenta</span>}
                  {p.es_comunero && <span className="vp-b">comunero</span>}
                </div>
              </div>
            </div>

            {/* ── Datos duros. El DNI aquí es una decisión: se ve sin fricción
                 porque llenar formularios de DAFO a deshora es el caso real. ── */}
            <div className="vp-datos">
              {p.ruc_dni && <span><b>DNI/RUC</b> {p.ruc_dni}</span>}
              {p.telefono && <span><b>Tel</b> {p.telefono}</span>}
              {p.email && <span><b>Correo</b> {p.email}</span>}
              {p.nombre_reniec && p.nombre_reniec !== p.nombre && (
                <span title="Nombre según RENIEC — no coincide con el registrado">
                  <b>RENIEC</b> {p.nombre_reniec}
                </span>
              )}
            </div>

            {/* ── Palmarés ── */}
            {pal.total > 0 && (
              <Bloque titulo="🏆 Palmarés">
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
              </Bloque>
            )}

            {/* ── Papeles: solo se habla de lo que FALTA. Una lista de todo lo
                 que está bien no se lee; lo que bloquea, sí. ── */}
            <Bloque titulo="📋 Papeles">
              {trabas.length > 0 && (
                <div className="vp-trabas">{trabas.map((t, i) => <span key={i}>⚠ {t}</span>)}</div>
              )}
              {/* Lo que NADIE verificó no es lo mismo que lo que está bien. Un
                  hueco pintado de verde se lee como aprobado, y así es como una
                  postulación se cae por un papel que el sistema daba por bueno.
                  `dudasMiembro` existe justo para esta tercera categoría. */}
              {dudas.length > 0 && (
                <div className="vp-dudas">{dudas.map((t, i) => <span key={i}>◌ {t}</span>)}</div>
              )}
              {trabas.length === 0 && dudas.length === 0 && (
                <div className="vp-ok">✓ Verificado y sin trabas</div>
              )}
              {/* Una suspensión de 4ta caduca el 31 de diciembre: mostrar el año
                  en gris neutro hace que una vencida se lea como vigente. */}
              {p.suspension_4ta_anio && (
                Number(p.suspension_4ta_anio) < new Date().getFullYear()
                  ? <div className="vp-trabas"><span>⚠ Suspensión de 4ta vencida ({p.suspension_4ta_anio})</span></div>
                  : <div className="vp-nota">Suspensión de 4ta · {p.suspension_4ta_anio}</div>
              )}
            </Bloque>

            {/* ── Qué tiene entre manos ── */}
            {(cargosVivos.length > 0 || (d.prestamos || []).length > 0) && (
              <Bloque titulo="🔗 Ahora">
                {cargosVivos.map((c: any, i: number) => (
                  <a key={i} href={`/entidad/empresa/${un(c.empresa)?.id}`} className="vp-item"
                    target="_blank" rel="noopener noreferrer">
                    <span>🏢</span>
                    <span className="vp-item-t">{un(c.empresa)?.nombre}</span>
                    <span className="vp-item-d">{c.cargo}</span>
                  </a>
                ))}
                {(d.prestamos || []).length > 0 && (
                  <div className="vp-nota">
                    🤝 tiene {d.prestamos.length} equipo(s):{" "}
                    {d.prestamos.slice(0, 4).map((r: any) => un(r.equipo)?.folio || un(r.equipo)?.nombre).join(", ")}
                    {d.prestamos.length > 4 ? "…" : ""}
                  </div>
                )}
              </Bloque>
            )}

            {/* ── De dónde viene ── */}
            {((d.proyectos || []).length > 0 || (d.actor || []).length > 0) && (
              <Bloque titulo="🎬 Trayectoria">
                {(d.proyectos || []).slice(0, 6).map((c: any, i: number) => (
                  <a key={i} href={`/entidad/proyecto/${un(c.proyecto)?.id}`} className="vp-item"
                    target="_blank" rel="noopener noreferrer">
                    <span>{dirige(c) ? "🎬" : "•"}</span>
                    <span className="vp-item-t">{nomProy(c.proyecto)}</span>
                    <span className="vp-item-d">{c.cargo}</span>
                  </a>
                ))}
                {(d.actor || []).slice(0, 4).map((c: any, i: number) => (
                  <a key={`a${i}`} href={`/entidad/proyecto/${un(c.proyecto)?.id}`} className="vp-item"
                    target="_blank" rel="noopener noreferrer">
                    <span>🎭</span>
                    <span className="vp-item-t">{nomProy(c.proyecto)}</span>
                    <span className="vp-item-d">{c.rol}</span>
                  </a>
                ))}
              </Bloque>
            )}
          </div>
        );
      }}
    >
      {children}
    </VistaHilo>
  );
}
