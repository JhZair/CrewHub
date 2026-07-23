"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import CronogramaProyecto from "./CronogramaProyecto";
import { fijarCronogramaPostulado } from "@/app/actions";
import { type Etapa, ETAPAS_CINE, nombreEtapa } from "@/lib/etapas";

/* CRONOGRAMA DE LA POSTULACIÓN — dos versiones en una.
   Arriba, el cronograma VIVO (editable, con todo lo del cronograma normal:
   plantillas, agenda, equipo). Abajo, la FOTO de lo que se postuló a DAFO:
   se congela con un botón y queda como registro de lo presentado. Si el fondo
   se gana, el vivo se sigue moviendo (ejecución) y la comparación dice qué
   cambió respecto a lo que se prometió. */

type Foto = {
  nombre: string; etapa: string | null;
  fecha_inicio: string | null; fecha_fin: string | null;
  responsable: string | null; descripcion: string | null;
};

const fmt = (s: string | null) => s
  ? new Date(s + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })
  : "—";

export default function CronogramaPostulacion({
  postulacionId, actividades, perfiles, plantillas, tipoProyecto, etapas = ETAPAS_CINE, postulado, postuladoEn, ocultarFijar = false,
}: {
  postulacionId: string;
  actividades: any[];
  perfiles: { id: string; nombre: string }[];
  plantillas?: { id: string; nombre: string; tipo_proyecto: string | null; n: number }[];
  tipoProyecto?: string;
  /** Etapas de la categoría de la convocatoria (las decide su categoría). */
  etapas?: Etapa[];
  postulado: Foto[] | null;
  postuladoEn: string | null;
  /* En el fondo, las versiones las maneja el panel de arriba: se oculta la foto
     única y `postulado` es la versión VIGENTE. */
  ocultarFijar?: boolean;
}) {
  const refNombre = ocultarFijar ? "la versión vigente" : "lo postulado";
  const ETAPA_ORDEN = etapas.map(e => e.clave);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [verFoto, setVerFoto] = useState(false);
  const router = useRouter();

  const vivas = actividades.filter(a => a.estado !== "cancelada" && a.fecha_inicio);

  const fijar = async () => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const res: any = await fijarCronogramaPostulado(postulacionId);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };

  /* Comparación vivo vs foto, por nombre de actividad. No es un diff perfecto
     —si renombras una actividad, sale como quitada + nueva—, pero para "¿qué
     se movió desde lo que postulé?" alcanza y se lee de un vistazo. */
  const foto = postulado || [];
  const porNombreFoto = new Map(foto.map(f => [f.nombre, f]));
  const porNombreVivo = new Map(vivas.map(a => [a.nombre, a]));
  const movidas = foto.filter(f => {
    const v = porNombreVivo.get(f.nombre);
    return v && (v.fecha_inicio !== f.fecha_inicio || (v.fecha_fin || null) !== (f.fecha_fin || null));
  });
  const nuevas = vivas.filter(a => !porNombreFoto.has(a.nombre));
  const quitadas = foto.filter(f => !porNombreVivo.has(f.nombre));
  const hayCambios = movidas.length + nuevas.length + quitadas.length > 0;

  // La foto agrupada por etapa, para leerla/copiarla como la tabla DAFO
  const fotoPorEtapa = ETAPA_ORDEN
    .map(et => ({ et, items: foto.filter(f => f.etapa === et) }))
    .filter(g => g.items.length);

  return (
    <div>
      {/* ===== Barra de estado de la foto (oculta en el fondo: versiones arriba) ===== */}
      {!ocultarFijar && (
        <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <b style={{ fontSize: 13 }}>📸 Cronograma postulado</b>
            <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 2 }}>
              {postuladoEn
                ? <>Fijado el {new Date(postuladoEn).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })} · {foto.length} actividades — es lo que fue a DAFO.</>
                : <>Aún no fijas la foto. Arma el cronograma abajo y fíjalo cuando esté listo para enviar.</>}
            </div>
          </div>
          {postulado && (
            <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={() => setVerFoto(v => !v)}>{verFoto ? "Ocultar la foto" : "👁 Ver la foto"}</button>
          )}
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12.5 }} disabled={ocupado}
            onClick={fijar} title="Congela el cronograma actual como lo presentado a DAFO">
            {ocupado ? "…" : postulado ? "📸 Volver a fijar" : "📸 Fijar como postulado"}
          </button>
        </div>
      )}
      {error && <div className="err-inline" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      {/* ===== Comparación vivo vs postulado/vigente ===== */}
      {postulado && (
        <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${hayCambios ? "var(--yellow)" : "var(--green)"}` }}>
          {!hayCambios ? (
            <span style={{ color: "var(--green)", fontSize: 12.5 }}>✅ El cronograma vivo coincide con {refNombre}.</span>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                <b style={{ color: "var(--yellow)" }}>Cambió desde {refNombre}:</b>{" "}
                {movidas.length > 0 && <>{movidas.length} con otra fecha</>}
                {movidas.length > 0 && (nuevas.length || quitadas.length) ? " · " : ""}
                {nuevas.length > 0 && <>{nuevas.length} nuevas</>}
                {nuevas.length > 0 && quitadas.length ? " · " : ""}
                {quitadas.length > 0 && <>{quitadas.length} quitadas</>}
              </div>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                {movidas.map((f, i) => {
                  const v = porNombreVivo.get(f.nombre);
                  return (
                    <div key={`m${i}`} style={{ fontSize: 11.5, color: "var(--dim)" }}>
                      🔀 <b style={{ color: "var(--muted)" }}>{f.nombre}</b>: {fmt(f.fecha_inicio)}→{fmt(f.fecha_fin)}{" "}
                      <span style={{ color: "var(--yellow)" }}>⇒ {fmt(v.fecha_inicio)}→{fmt(v.fecha_fin)}</span>
                    </div>
                  );
                })}
                {nuevas.map((a, i) => (
                  <div key={`n${i}`} style={{ fontSize: 11.5, color: "var(--dim)" }}>
                    ➕ <b style={{ color: "var(--green)" }}>{a.nombre}</b> (no estaba en lo postulado)
                  </div>
                ))}
                {quitadas.map((f, i) => (
                  <div key={`q${i}`} style={{ fontSize: 11.5, color: "var(--dim)" }}>
                    ➖ <b style={{ color: "var(--red)" }}>{f.nombre}</b> (estaba postulada, ya no)
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ===== La foto, como tabla para copiar al formato DAFO ===== */}
      {postulado && verFoto && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 8 }}>
            Lo que se presentó — para copiar a la tabla de cronograma del formulario DAFO:
          </div>
          {fotoPorEtapa.map(g => (
            <div key={g.et} style={{ marginBottom: 8 }}>
              <div className="cr-etapa-h">{nombreEtapa(g.et)}</div>
              {g.items.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 10, fontSize: 12, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span style={{ flex: 1 }}>{f.nombre}</span>
                  <span style={{ color: "var(--dim)", whiteSpace: "nowrap" }}>{fmt(f.fecha_inicio)} → {fmt(f.fecha_fin)}</span>
                  {f.responsable && <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{f.responsable.split(" ")[0]}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ===== El cronograma VIVO (editable) ===== */}
      <CronogramaProyecto dueno="postulacion" duenoId={postulacionId}
        actividades={actividades} perfiles={perfiles}
        plantillas={plantillas} tipoProyecto={tipoProyecto} etapas={etapas} />
    </div>
  );
}
