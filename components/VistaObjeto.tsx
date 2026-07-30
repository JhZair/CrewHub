"use client";
import { type ReactNode } from "react";
import Link from "next/link";
import { cargarObjetoRapido, comentarObjeto, toggleReaccion } from "@/app/actions";
import { icoObjeto, lblObjeto } from "@/lib/objetos";
import { icoTipo } from "@/lib/tipos";
import { ICO_ENT, rutaEntidad } from "@/lib/secciones";
import { claseEstado, rotuloEstado } from "@/lib/estados";
import MiniObjeto from "@/components/MiniObjeto";
import VistaHilo from "@/components/VistaHilo";

/* VISTA OBJETO — un objeto del repositorio en un pop-up, para verlo e
 * interactuar SIN salir de la página de trabajo. Sobre VistaHilo: sólo aporta su
 * cabecera (portada, notas, vínculos, casos) y sus escrituras propias del
 * objeto. Se lee, se comenta y se reacciona al vuelo; al cerrar sigues donde
 * estabas. */

export default function VistaObjeto({ objetoId, children }: {
  objetoId: string;
  /** Disparador: recibe `abrir` y devuelve el elemento clicable de la superficie. */
  children: (abrir: (e?: any) => void) => ReactNode;
}) {
  return (
    <VistaHilo
      ariaLabel="Vista del objeto"
      tituloCab={(d) => <>📚 {d?.objeto ? lblObjeto(d.objeto.tipo) : "Repositorio"}</>}
      abrirCompletoHref={`/objeto/${objetoId}`}
      abrirCompletoTitle="Abrir la página completa del objeto"
      cargar={() => cargarObjetoRapido(objetoId)}
      listo={(d) => !!d?.objeto}
      selComentarios={(d) => d?.comentarios || []}
      selReaccionesPorComentario={(d) => d?.reaccionesPorComentario || {}}
      selPerfiles={(d) => d?.perfiles || []}
      selUserId={(d) => d?.userId || ""}
      onComentar={(texto) => comentarObjeto(objetoId, texto)}
      onReaccionarComentario={(comentarioId, emoji) => toggleReaccion(null, comentarioId, emoji, objetoId)}
      textoVacio="Aún no se ha hablado de este material."
      cabecera={(data, cerrar) => {
        const o = data.objeto;
        return (
          <>
            {/* Título + dueño */}
            <div className="vo-head">
              <span style={{ fontSize: 20 }}>{icoObjeto(o.tipo)}</span>
              <b style={{ flex: 1, fontSize: 17 }}>{o.titulo}</b>
            </div>
            <div className="vo-meta">
              {o.fecha && <span>{new Date(o.fecha + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}</span>}
              <span>de{" "}
                <Link href={rutaEntidad(data.dueno.tipo, data.dueno.id) || "#"} className="vo-dueno" onClick={cerrar}>
                  {ICO_ENT[data.dueno.tipo] || "🔗"} {data.dueno.nombre}
                </Link>
              </span>
              {data.verif && (
                <span className={`vo-verif ${data.verif.correcto ? "ok" : "warn"}`}>
                  {data.verif.correcto ? "✓ verificado" : "⚠ por reverificar"}{data.verif.por ? ` · ${data.verif.por}` : ""}
                </span>
              )}
            </div>

            {/* Portada: la imagen manda, como en la página completa. */}
            {o.url && (
              <div className="vo-portada">
                <MiniObjeto url={o.url} ico={icoObjeto(o.tipo)} ancho={900} />
              </div>
            )}
            {o.notas && <div className="vo-notas">{o.notas}</div>}
            {o.url && (
              <a href={o.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost vo-abrir-link">
                {icoObjeto(o.tipo)} Abrir el archivo ↗
              </a>
            )}

            {/* Vinculado a */}
            {data.vinculadas.length > 0 && (
              <div className="vo-vinc">
                <span className="vo-lbl">🔗 Vinculado a</span>
                {data.vinculadas.map((v: any) => (
                  <Link key={`${v.tipo}:${v.id}`} href={rutaEntidad(v.tipo, v.id) || "#"} className="echip" onClick={cerrar}>
                    {ICO_ENT[v.tipo] || "🔗"} {v.nombre}
                  </Link>
                ))}
              </div>
            )}

            {/* Casos (trabajo real sobre el objeto) */}
            {data.casos.length > 0 && (
              <div className="vo-casos">
                <span className="vo-lbl">🗂 Casos · {data.casos.length}</span>
                {data.casos.map((c: any) => (
                  <a key={c.id} href={`/caso/${c.id}`} target="_blank" rel="noopener noreferrer" className="vo-caso">
                    <span>{icoTipo(c.tipo)}</span>
                    <b style={{ flex: 1 }}>{c.titulo}</b>
                    {(c.comentarios?.[0]?.count ?? 0) > 0 && <span className="vo-caso-n">💬 {c.comentarios[0].count}</span>}
                    <span className={`pill st-${claseEstado(c.estado, c.tipo)}`}>{rotuloEstado(c.estado, c.tipo)}</span>
                  </a>
                ))}
              </div>
            )}
          </>
        );
      }}
    >
      {children}
    </VistaHilo>
  );
}
