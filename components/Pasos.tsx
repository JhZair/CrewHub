"use client";
import { cambiarEstadoPostulacion, cambiarEstadoConvocatoria } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Un mini-cronograma editable para las entidades que tienen ciclo de vida: la
 * postulación (preparación → enviada → apta → finalista → ganadora) y la
 * convocatoria (planificada → abierta → en evaluación → con resultados →
 * finalizada). Ambas son carreras con fin, y su estado se toca seguido según
 * avanzan; entrar al formulario para editarlo era tedioso y nada visual.
 *
 * Un clic en cualquier paso lo cambia ahí mismo. Las «salidas» son los finales
 * negativos (no apta, no ganó, cancelada), cada una en la etapa hasta donde de
 * verdad llegó. El cambio queda en el historial solo (trigger de la base). */

type Paso = { e: string; label: string; ico: string };
type Salida = { e: string; label: string; col: string; bg: string; llego: number };

const CFG: Record<string, { pasos: Paso[]; salidas: Salida[]; set: (id: string, e: string) => Promise<any> }> = {
  postulacion: {
    pasos: [
      { e: "en_preparacion", label: "Preparación", ico: "🛠" },
      { e: "enviada", label: "Enviada", ico: "📨" },
      { e: "apta", label: "Apta", ico: "✅" },
      { e: "finalista", label: "Finalista", ico: "⭐" },
      { e: "ganadora", label: "Ganadora", ico: "🏆" },
    ],
    salidas: [
      { e: "no_apta", label: "No apta", col: "var(--red)", bg: "rgba(255,77,94,.14)", llego: 1 },
      { e: "finalista_no_ganadora", label: "No ganó", col: "var(--yellow)", bg: "rgba(244,180,0,.16)", llego: 3 },
    ],
    set: cambiarEstadoPostulacion,
  },
  convocatoria: {
    pasos: [
      { e: "planificada", label: "Planificada", ico: "📅" },
      { e: "abierta", label: "Abierta", ico: "📣" },
      { e: "en_evaluacion", label: "En evaluación", ico: "⚖️" },
      { e: "con_resultados", label: "Con resultados", ico: "🏆" },
      { e: "finalizada", label: "Finalizada", ico: "🏁" },
    ],
    // Cancelada puede pasar en cualquier momento: no marca ningún paso cumplido.
    salidas: [
      { e: "cancelada", label: "Cancelada", col: "var(--red)", bg: "rgba(255,77,94,.14)", llego: -1 },
    ],
    set: cambiarEstadoConvocatoria,
  },
};

export default function Pasos({ tipo, id, estado }: {
  tipo: "postulacion" | "convocatoria"; id: string; estado: string | null;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { pasos, salidas, set } = CFG[tipo];

  const salidaActiva = salidas.find(s => s.e === estado);
  // Hasta dónde llegó de verdad: si está en una salida negativa, su etapa; si
  // no, el índice del paso actual.
  const llego = salidaActiva ? salidaActiva.llego : pasos.findIndex(p => p.e === estado);

  const ir = async (nuevo: string) => {
    if (nuevo === estado || guardando) return;
    setGuardando(nuevo); setError("");
    const r: any = await set(id, nuevo);
    setGuardando(null);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  return (
    <div className="pasos-post">
      <div className="pp-linea">
        {pasos.map((p, i) => (
          <div key={p.e} className="pp-item">
            {i > 0 && <span className={`pp-con${i <= llego ? " on" : ""}`} />}
            <button className={`pp-nodo${i <= llego ? " hecho" : ""}${p.e === estado ? " actual" : ""}`}
              disabled={!!guardando} onClick={() => ir(p.e)} title={`Marcar: ${p.label}`}>
              <span className="pp-punto">{guardando === p.e ? "…" : p.ico}</span>
              <span className="pp-lbl">{p.label}</span>
            </button>
          </div>
        ))}
      </div>
      <div className="pp-salidas">
        {salidas.map(s => {
          const on = estado === s.e;
          return (
            <button key={s.e} className={`pp-salida${on ? " on" : ""}`}
              disabled={!!guardando} onClick={() => ir(s.e)} title={`Marcar: ${s.label}`}
              style={on ? { color: s.col, background: s.bg, borderColor: s.col } : undefined}>
              {guardando === s.e ? "…" : `✕ ${s.label}`}
            </button>
          );
        })}
      </div>
      {error && <span className="pp-err">⚠ {error}</span>}
    </div>
  );
}
