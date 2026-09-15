"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import CargarJurado from "@/components/CargarJurado";
import { borrarJurado } from "@/app/actions";
import ChipPop from "@/components/ChipPop";
import HiloRendicion, { idFila } from "@/components/HiloRendicion";
import Reacciones, { type Reaccion } from "@/components/Reacciones";
import type { FilaJur, HistJurado } from "@/lib/jurados";

/* ══════════════════════════════════════════════════════════════════════════
   ⚖️ QUIÉN JUZGA ESTA CONVOCATORIA

   La pestaña 🏁 dice contra quién competimos. Esta dice quién decide, que es
   la otra mitad de la misma pregunta y la que se puede leer ANTES de postular.

   ── LAS DOS LECTURAS QUE JUSTIFICAN LA PANTALLA ──
   · LA COMPOSICIÓN DE LA MESA. DAFO no junta cinco cinéfilos: pone un asiento
     por especialidad. Si hay un diseñador de sonido, la propuesta sonora del
     proyecto la va a leer alguien con criterio; si hay una productora con
     Cannes e IDFA detrás, el plan de festivales lo lee quien ha estado allí.
     Eso cambia qué partes del proyecto conviene escribir con más cuidado, y es
     una decisión que se toma antes de mandar nada.
   · QUIÉN REPITE. La misma persona vuelve, y entre concursos. «3ª vez que
     juzga» al lado de un nombre es la frase que esta pantalla existe para
     poder decir.

   ── LO QUE NO ES ──
   No es un directorio de contactos. Son personas nombradas en un documento
   público de un proceso público: se guarda lo que ese documento dice y de
   dónde salió, no se busca nada más de ellas, y no se dan de alta como
   personas del sistema. Lo que averigüemos por nuestra cuenta va en el 💬 de
   cada una, con autor y fecha, separado de lo que dice la resolución.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Jurado({ convocatoriaId, nombre, anio, filas, historial, cruce, hilos }: {
  convocatoriaId: string;
  nombre: string;
  anio: number | null;
  filas: FilaJur[];
  /** En qué otras mesas ha estado cada uno, por id de fila. */
  historial: Record<string, HistJurado>;
  cruce: { ediciones: number; desde: number | null; hasta: number | null } | null;
  hilos?: {
    conteo: Record<string, number>;
    reacciones: Record<string, Reaccion[]>;
    userId: string;
    error?: string | null;
  } | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [borrando, setBorrando] = useState("");
  /* La biografía entera, desplegada. Cerradas por defecto: cinco párrafos
     seguidos tapan la composición de la mesa, que es lo que se viene a ver. */
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const alterna = (id: string) => setAbiertas(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  async function borrar(id: string) {
    setBorrando(id);
    await borrarJurado(convocatoriaId, id);
    setBorrando("");
    router.refresh();
  }

  /* Los asientos de la mesa, de un vistazo. Es el resumen que contesta «¿quién
     lee qué?» sin tener que abrir cinco biografías. */
  const roles = [...new Set(filas.map(f => (f.rol || "").trim()).filter(Boolean))];

  return (
    <div className="linked">
      <div className="riv-top">
        <h4 style={{ margin: 0 }}>⚖️ El jurado · {filas.length}</h4>
        <span style={{ flex: 1 }} />
        {!abierto && (
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}
            onClick={() => setAbierto(true)}>📎 Cargar la sumilla del jurado</button>
        )}
      </div>

      {abierto && (
        <div style={{ marginBottom: 12 }}>
          <CargarJurado convocatoriaId={convocatoriaId} nombre={nombre} anio={anio}
            onCerrar={() => setAbierto(false)} />
        </div>
      )}

      {filas.length === 0 && !abierto && (
        <div className="empty" style={{ padding: "18px 0" }}>
          Todavía no se cargó quién juzga este concurso.
          <div style={{ color: "var(--dim)", fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
            DAFO publica un PDF con las sumillas de la mesa. Súbelo y aquí se ve quién
            decide, con qué especialidad entra cada uno y quién de ellos ya nos juzgó
            antes. No se dan de alta como personas del sistema.
          </div>
        </div>
      )}

      {filas.length > 0 && (
        <>
          {roles.length > 1 && (
            <div className="jur-roles">
              <span className="jur-roles-t">La mesa</span>
              {roles.map(r => <span key={r} className="badge jur-rol">{r}</span>)}
            </div>
          )}

          {hilos?.error && (
            <div className="err-inline" style={{ marginBottom: 8, color: "var(--yellow)" }}>
              ⚠ {hilos.error} Mientras tanto se puede leer todo, pero no anotar nada.
            </div>
          )}

          <div className="jur-lista">
            {filas.map(f => {
              const h = historial[f.id];
              const larga = (f.sumilla || "").length > 190;
              const abierta = abiertas.has(f.id);
              return (
                <div key={f.id} id={idFila("convocatoria_jurado", f.id)} className="jur-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="jur-l1">
                      <b>{f.nombre}</b>
                      {f.pais && <span className="badge riv-reg">{f.pais}</span>}
                      {f.rol && <span className="badge jur-rol">{f.rol}</span>}
                    </div>
                    {f.sumilla && (
                      <>
                        <div className={`jur-sum${larga && !abierta ? " corta" : ""}`}>{f.sumilla}</div>
                        {/* ⚠ FUERA de la caja recortada. Dentro, el propio
                            recorte se comía el botón: la biografía larga —la
                            única que lo necesita— era justo la que no lo
                            enseñaba, y las cortas lo enseñaban sin hacer falta. */}
                        {larga && (
                          <button type="button" className="jur-mas" onClick={() => alterna(f.id)}>
                            {abierta ? "▴ menos" : "▾ ver todo"}
                          </button>
                        )}
                      </>
                    )}
                    {/* ⚠ «1ª vez que lo vemos» se DICE, igual que en 🏁: un hueco
                        debajo de un nombre se lee como «es nuevo en esto», y lo
                        cierto es «no está en las ediciones que tenemos». */}
                    {h && (h.veces > 1 ? (
                      <div className="riv-hist">
                        <ChipPop clase="chip-hist" ancho={420}
                          titulo={`Ver las otras ${h.otras.length} mesas de ${f.nombre}`}
                          etiqueta={<>
                            <b>{h.veces}ª vez que juzga</b>
                            {h.otras.slice(0, 4).map(o => (
                              <span key={o.id} className="riv-hist-ed">{o.anio || o.codigo} ⚖️</span>
                            ))}
                            {h.otras.length > 4 && (
                              <span className="riv-hist-ed">+{h.otras.length - 4}</span>
                            )}
                          </>}
                          cabecera={<span className="chip-gr-h">⚖️ {f.nombre} · {h.veces} mesas</span>}>
                          {h.otras.map(o => (
                            <Link key={o.id} href={`/entidad/convocatoria/${o.convocatoriaId}`}
                              className="ens-pop-fila">
                              <span className="fpop-txt">
                                <span className="fpop-l1">
                                  <b style={{ color: "var(--text)" }}>{o.anio || "?"}</b>
                                  {o.codigo && <span className="kit-pz-folio">{o.codigo}</span>}
                                  {/* Con qué asiento entró ESE año: la misma
                                      persona puede volver con otra especialidad,
                                      y eso dice cómo la ve el Ministerio. */}
                                  {o.rol && <span className="badge jur-rol">{o.rol}</span>}
                                </span>
                                {o.concurso && <span className="fpop-nom">{o.concurso}</span>}
                              </span>
                            </Link>
                          ))}
                        </ChipPop>
                      </div>
                    ) : (
                      <div className="riv-hist riv-hist-1"
                        title={cruce
                          ? `No aparece en ninguna de las otras ${Math.max(cruce.ediciones - 1, 0)} mesas cargadas${
                              cruce.desde && cruce.hasta ? ` (${cruce.desde}–${cruce.hasta})` : ""
                            }.`
                          : "No aparece en ninguna otra mesa cargada."}>
                        1ª vez que lo vemos en una mesa
                      </div>
                    ))}
                    {(f.avisos || []).length > 0 && (
                      <div className="riv-aviso" title={f.crudo || undefined}>
                        ⚠ {(f.avisos || []).join(" · ")}
                      </div>
                    )}
                  </div>
                  {hilos && (
                    <span className="riv-acc">
                      <Reacciones pubId={null} compacto
                        rendicion={{ tabla: "convocatoria_jurado", id: f.id }}
                        reacciones={hilos.reacciones[f.id] || []} userId={hilos.userId} />
                      <HiloRendicion tabla="convocatoria_jurado" filaId={f.id}
                        cabecera={() => (
                          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: "var(--teal)" }}>{f.nombre}</span>
                            {f.rol && <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{f.rol}</span>}
                          </div>
                        )}>
                        {(abrir) => (
                          <button type="button" className="dato-btn" onClick={abrir}
                            title={hilos.conteo[f.id]
                              ? `${hilos.conteo[f.id]} nota(s) nuestras sobre esta persona`
                              : "Anotar lo que sepamos de este jurado"}
                            style={{ color: hilos.conteo[f.id] ? "var(--accent)" : undefined,
                              opacity: hilos.conteo[f.id] ? 1 : .5, whiteSpace: "nowrap" }}>
                            💬{hilos.conteo[f.id] ? ` ${hilos.conteo[f.id]}` : ""}
                          </button>
                        )}
                      </HiloRendicion>
                    </span>
                  )}
                  <button type="button" className="dato-btn" disabled={borrando === f.id}
                    onClick={() => borrar(f.id)} title={`Quitar a ${f.nombre} de la mesa`}>
                    {borrando === f.id ? "…" : "✕"}
                  </button>
                </div>
              );
            })}
          </div>

          {cruce && cruce.ediciones > 1 && (
            <div className="riv-pie">
              Cruzado contra {cruce.ediciones} mesas cargadas
              {cruce.desde && cruce.hasta ? ` (${cruce.desde}–${cruce.hasta})` : ""}, de todos los
              concursos. Quien juzgó antes de eso, o un concurso cuya mesa no está cargada, aquí
              figura como si fuera su primera vez.
            </div>
          )}
        </>
      )}
    </div>
  );
}
