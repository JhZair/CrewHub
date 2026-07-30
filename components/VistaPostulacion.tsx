"use client";
import { type ReactNode } from "react";
import Link from "next/link";
import { cargarPostulacionRapida, comentarPostulacion, toggleReaccion } from "@/app/actions";
import { colorEstadoPost } from "@/lib/resultados";
import VistaHilo from "@/components/VistaHilo";

/* VISTA POSTULACIÓN — la MISMA postulación, listada en la ficha de empresa, de
 * proyecto y de persona, es un solo hilo de conversación. Sobre VistaHilo: sólo
 * aporta su cabecera (contexto conv/emp/proy + estado) y sus escrituras. Un
 * único componente → comportamiento idéntico en las tres fichas. */

const un1 = (x: any) => (Array.isArray(x) ? x[0] : x);

export default function VistaPostulacion({ postulacionId, children }: {
  postulacionId: string;
  children: (abrir: (e?: any) => void) => ReactNode;
}) {
  return (
    <VistaHilo
      tituloCab="📮 Postulación"
      ariaLabel="Vista de la postulación"
      abrirCompletoHref={`/entidad/postulacion/${postulacionId}`}
      abrirCompletoTitle="Abrir la página completa de la postulación"
      cargar={() => cargarPostulacionRapida(postulacionId)}
      listo={(d) => !!d?.postulacion}
      selComentarios={(d) => d?.comentarios || []}
      selReaccionesPorComentario={(d) => d?.reaccionesPorComentario || {}}
      selPerfiles={(d) => d?.perfiles || []}
      selUserId={(d) => d?.userId || ""}
      permitirResponder
      reaccionesHilo={(d) => d?.reaccionesPostulacion || []}
      onReaccionarHilo={(emoji) => toggleReaccion(null, null, emoji, null, postulacionId)}
      onComentar={(texto, respondeA) => comentarPostulacion(postulacionId, texto, [], respondeA)}
      onReaccionarComentario={(comentarioId, emoji) => toggleReaccion(null, comentarioId, emoji, null, postulacionId)}
      textoVacio="Aún no se ha hablado de esta postulación."
      cabecera={(d, cerrar) => {
        const p = d.postulacion;
        const proy = un1(p?.proy), conv = un1(p?.conv), emp = un1(p?.emp);
        const col = colorEstadoPost(p.estado);
        return (
          <>
            <div className="vo-head">
              <b style={{ flex: 1, fontSize: 17 }}>{proy?.nombre || p.codigo || "Postulación"}</b>
              {p.estado && (
                <span className="badge" style={{ color: col, background: `color-mix(in srgb, ${col} 15%, transparent)`, whiteSpace: "nowrap", flex: "none" }}>
                  {(p.estado || "").replace(/_/g, " ")}
                </span>
              )}
            </div>
            <div className="vo-meta">
              {conv && (
                <span>a{" "}
                  <Link href={`/entidad/convocatoria/${conv.id}`} className="vo-dueno" onClick={cerrar}>
                    📣 {conv.nombre}{conv.anio ? ` · ${conv.anio}` : ""}
                  </Link>
                </span>
              )}
              {emp && (
                <span>por{" "}
                  <Link href={`/entidad/empresa/${emp.id}`} className="vo-dueno" onClick={cerrar}>
                    🏢 {emp.nombre}
                  </Link>
                </span>
              )}
              {proy && (
                <span>·{" "}
                  <Link href={`/entidad/proyecto/${proy.id}`} className="vo-dueno" onClick={cerrar}>
                    🎬 {proy.nombre}
                  </Link>
                </span>
              )}
            </div>
          </>
        );
      }}
    >
      {children}
    </VistaHilo>
  );
}
