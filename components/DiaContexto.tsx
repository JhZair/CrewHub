"use client";
import { useState } from "react";
import Link from "next/link";
import { contextoDelDia } from "@/app/actions";
import { fechaConDia } from "@/lib/fechas";

/* QUÉ HIZO ESE DÍA, EN TODO EL SISTEMA.
 *
 * Una fila de jornada dice «1.5j · S/ 195 · oficina». Al aprobarla, la
 * pregunta que uno se hace es otra: ¿en qué se fue ese día? Y hasta ahora
 * contestarla era abrir seis pantallas y cruzarlas a ojo.
 *
 * Donde más paga es en los días VACÍOS. Un día sin jornada no distingue
 * «descansó» de «se le olvidó registrar», y el sistema sí lo sabe: si esa
 * tarde dejó ocho comentarios y entregó dos equipos, no descansó. Por eso el
 * botón está también en los días en blanco — ahí es donde hay algo que
 * descubrir, no en los que ya están bien.
 *
 * Se carga AL ABRIR. Son cinco consultas por día y treinta días por persona:
 * traerlo con la página serían mil quinientas consultas para enseñar, casi
 * siempre, ninguna. La espera de medio segundo la paga quien de verdad
 * preguntó.
 */
export default function DiaContexto({ personaId, fecha, quien }: {
  personaId: string; fecha: string; quien?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [hechos, setHechos] = useState<any[] | null>(null);
  const [error, setError] = useState("");

  const abrir = async () => {
    setAbierto(true);
    if (hechos || cargando) return;   // ya se pidió: no se vuelve a pedir
    setCargando(true); setError("");
    const r: any = await contextoDelDia(personaId, fecha);
    setCargando(false);
    if (r?.error) { setError(r.error); return; }
    setHechos(r.hechos || []);
  };

  const hora = (at: string) =>
    new Date(at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

  return (
    <>
      <button type="button" className="dato-btn dia-lupa" title={`Ver todo lo que hizo el ${fecha} en el sistema`}
        onClick={abrir}>🔍</button>

      {abierto && (
        <div className="modal-fondo" onClick={e => { if (e.target === e.currentTarget) setAbierto(false); }}>
          <div className="modal-caja" style={{ maxWidth: 640 }}>
            <div className="modal-cab">
              <b style={{ textTransform: "capitalize" }}>
                🔍 {fechaConDia(fecha)}{quien ? ` · ${quien}` : ""}
              </b>
              <button className="dato-btn" onClick={() => setAbierto(false)}>✕</button>
            </div>

            {cargando && <div className="empty" style={{ padding: "20px 0" }}>Buscando…</div>}
            {error && <div className="err-inline">⚠ {error}</div>}

            {hechos && hechos.length === 0 && (
              /* Un vacío que DICE que es vacío. «No se encontró nada» y una
                 pantalla en blanco se distinguen mal, y aquí la diferencia
                 importa: este vacío es la respuesta. */
              <div className="empty" style={{ padding: "18px 0", lineHeight: 1.6 }}>
                Sin rastro en el sistema ese día.<br />
                <span style={{ fontSize: 11.5 }}>
                  No prueba que no trabajara —una grabación no deja huella aquí— pero
                  tampoco hay nada que respalde la jornada.
                </span>
              </div>
            )}

            {hechos && hechos.length > 0 && (
              <>
                <div className="dia-n">{hechos.length} cosa{hechos.length === 1 ? "" : "s"} en el sistema</div>
                <div className="dia-lista">
                  {hechos.map((h: any, i: number) => {
                    const dentro = (
                      <>
                        <span className="dia-hora">{hora(h.at)}</span>
                        <span className="dia-ico">{h.ico}</span>
                        <span className="dia-txt">
                          <span className="dia-l1">{h.txt}</span>
                          {h.sub && <span className="dia-l2">{h.sub}</span>}
                        </span>
                      </>
                    );
                    return h.href
                      ? <Link key={i} href={h.href} className="dia-fila">{dentro}</Link>
                      : <span key={i} className="dia-fila">{dentro}</span>;
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
