"use client";
import { cambiarEstadoPostulacion, cambiarEstadoConvocatoria, cambiarEtapaProyecto } from "@/app/actions";
import { etapasProyecto } from "@/lib/etapasProyecto";
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
type Salida = { e: string; label: string; col: string; bg: string; llego: number; pre?: string };

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
      // En subsanación NO es un final: es un desvío temporal (DAFO observó, hay
      // que corregir y reenviar). Va con 🔧, no con ✕, y marca hasta «enviada».
      { e: "en_subsanacion", label: "En subsanación", col: "var(--yellow)", bg: "rgba(244,180,0,.16)", llego: 1, pre: "🔧" },
      { e: "no_apta", label: "No apta", col: "var(--red)", bg: "rgba(255,77,94,.14)", llego: 1 },
      /* ── LA SALIDA QUE FALTABA: PASÓ PAPELES Y EL JURADO NO LA ELIGIÓ ──
         ⚠ Sin esta, una postulación apta que no llegó a la final NO TENÍA
         dónde acabar, y las dos salidas que había obligaban a mentir: «No
         apta» afirma que DAFO la sacó por papeles —pasó la revisión— y «No
         ganó» guarda `finalista_no_ganadora`, que afirma que llegó a la final
         —nunca llegó—. Las dos mentiras son de las que no fallan: la ficha se
         guarda tan contenta y el embudo del año cuenta un finalista que no
         existió, o un rechazo administrativo que no hubo.
         Y `no_seleccionada` no es un estado nuevo: la base lo tiene desde
         `db/schema.sql`, el embudo de /postulaciones le da su propia banda
         —«no las eligió el jurado», a la altura de «apta»— y el importador de
         resultados YA lo escribe solo al cargar un concurso decidido. Lo
         único que faltaba era el botón para ponerlo a mano.
         `llego: 2` porque llegó hasta «Apta», que es el tercer paso (0-based).
         Gris y no rojo: no es un rechazo, es no haber sido elegida entre
         varias buenas. El rojo lo tiene «No apta», que sí es un portazo. */
      { e: "no_seleccionada", label: "No la eligieron", col: "var(--dim)", bg: "rgba(255,255,255,.06)", llego: 2 },
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

export default function Pasos({ tipo, id, estado, subtipo }: {
  tipo: "postulacion" | "convocatoria" | "proyecto"; id: string; estado: string | null;
  /** Para el proyecto: su tipo (documental, videojuego…), que decide el ciclo
   *  de vida. Ignorado en postulación/convocatoria (tienen uno solo). */
  subtipo?: string | null;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState("");
  /* El proyecto arma su ciclo según su tipo (lib/etapasProyecto); postulación y
     convocatoria tienen ciclo único (CFG). Ninguno de los dos primeros tiene
     salidas negativas para el proyecto —eso lo dice el estado de actividad. */
  const { pasos, salidas, set } = tipo === "proyecto"
    ? {
        pasos: etapasProyecto(subtipo).map(p => ({ e: p.clave, label: p.label, ico: p.ico })),
        salidas: [] as Salida[],
        set: cambiarEtapaProyecto,
      }
    : CFG[tipo];

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
            {/* ── EL RÓTULO ARRIBA, Y EN EL DOM TAMBIÉN ──
                Se podría voltear con `flex-direction:column-reverse` y dejar el
                marcado como estaba, pero entonces lo que se lee y lo que se oye
                dejarían de coincidir: un lector de pantalla anuncia el orden del
                DOM, así que diría el icono antes que el nombre del paso. Se
                cambia el orden de verdad y el CSS solo alinea. */}
            <button className={`pp-nodo${i <= llego ? " hecho" : ""}${p.e === estado ? " actual" : ""}`}
              disabled={!!guardando} onClick={() => ir(p.e)} title={`Marcar: ${p.label}`}>
              <span className="pp-lbl">{p.label}</span>
              <span className="pp-punto">{guardando === p.e ? "…" : p.ico}</span>
            </button>
          </div>
        ))}
      </div>
      {/* ⚠ Solo si LAS HAY. Un proyecto no tiene salidas negativas —su ciclo
          las gobierna el estado de actividad— y esto le pintaba un `<div>`
          vacío igualmente. No se veía… hasta que la barra ganó marco y hueco
          entre filas: entonces el proyecto estrenaba seis píxeles de nada
          dentro del recuadro y una barra más alta que la de al lado, sin que
          nadie tocara su código. */}
      {salidas.length > 0 && (
      <div className="pp-salidas">
        {salidas.map(s => {
          const on = estado === s.e;
          return (
            <button key={s.e} className={`pp-salida${on ? " on" : ""}`}
              disabled={!!guardando} onClick={() => ir(s.e)} title={`Marcar: ${s.label}`}
              style={on ? { color: s.col, background: s.bg, borderColor: s.col } : undefined}>
              {guardando === s.e ? "…" : `${s.pre || "✕"} ${s.label}`}
            </button>
          );
        })}
      </div>
      )}
      {error && <span className="pp-err">⚠ {error}</span>}
    </div>
  );
}
