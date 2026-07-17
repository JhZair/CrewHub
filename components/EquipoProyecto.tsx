"use client";
import { agregarEquipoProyecto, quitarEquipoProyecto, editarCargoProyecto } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import MiniSelect from "@/components/MiniSelect";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

/* Quién hace esta película — desde «idea», no desde la postulación.
 *
 * Es casi gemelo de `Miembros` (empresas), y eso no me gusta: son la tercera
 * pareja de tabla+componente que hace lo mismo (empresa_miembros,
 * postulacion_equipo, proyecto_equipo). Unificar las tres sería lo correcto y
 * hoy no toca — las otras dos están en producción con datos. Al menos que se
 * parezcan, para que el día que se unifiquen sea un solo trabajo.
 *
 * Lo que SÍ cambia respecto de Miembros, y por qué:
 *   · Los cargos son de cine, no de sociedad. Un directorio tiene presidente;
 *     una película tiene directora.
 *   · No hay «baja»: un proyecto no da de baja a su directora — o está o no
 *     está. La empresa sí, porque un cargo societario tiene fecha de cese que
 *     figura en SUNARP.
 */

/* El orden no es alfabético: sigue el rodaje. Dirección arriba, después
   producción, después los oficios — y dentro de los oficios, la cámara junta.
   Buscar «segunda cámara» debajo de «dirección de fotografía» es donde la
   mano la va a buscar. */
const CARGOS = [
  "Directora", "Director", "Codirección",
  "Productora", "Productor", "Producción ejecutiva", "Jefatura de producción",
  "Guion", "Investigación",
  "Dirección de fotografía", "Segunda cámara (cámara B)",
  // Un solo cargo, no dos: la misma persona hace la foto fija y el BTS
  "Foto fija y detrás de cámaras (BTS)",
  "Sonido", "Montaje", "Música original",
  "Dirección de arte", "Asistencia de dirección", "Asistencia de producción",
];

export default function EquipoProyecto({ proyectoId, equipo, personas }: {
  proyectoId: string;
  equipo: any[];
  personas: CatalogoItem[];
}) {
  const [agregando, setAgregando] = useState(false);
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null);
  const [cargo, setCargo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const OPC = CARGOS.map(c => [c, c]) as [string, string][];

  const guardar = async () => {
    if (!sel || !cargo || guardando) return;
    setGuardando(true); setError("");
    const r: any = await agregarEquipoProyecto(proyectoId, sel.id, cargo);
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    setSel(null); setCargo(""); setAgregando(false);
    router.refresh();
  };
  const quitar = async (id: string) => {
    const r: any = await quitarEquipoProyecto(id, proyectoId);
    setQuitando(null);
    if (r?.error) setError(r.error); else router.refresh();
  };
  const cambiarCargo = async (id: string, nuevo: string) => {
    const r: any = await editarCargoProyecto(id, proyectoId, nuevo);
    if (r?.error) setError(r.error); else router.refresh();
  };

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          🎬 Equipo del proyecto · {equipo.length}
        </h4>
        <span style={{ flex: 1 }} />
        {!agregando && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
            onClick={() => setAgregando(true)}>＋ Agregar</button>
        )}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}

      {agregando && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 10 }}>
          <EntPicker etiqueta={sel ? `👤 ${sel.nombre}` : "👤 Elegir persona"} items={personas}
            onPick={id => {
              const p: any = personas.find(x => x.id === id);
              if (p) setSel({ id: p.id, nombre: p.alias || p.nombre });
            }} />
          <MiniSelect value={cargo} options={[["", "— elegir cargo —"], ...OPC]}
            onSelect={v => setCargo(v)}
            buttonStyle={{ background: "var(--card)", border: `1px solid ${cargo ? "var(--border)" : "var(--border2)"}`, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: cargo ? "var(--text)" : "var(--dim)", minWidth: 200, justifyContent: "space-between" }} />
          <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
            title={!sel ? "Elige la persona" : !cargo ? "Elige el cargo" : "Guardar"}
            disabled={!sel || !cargo || guardando} onClick={guardar}>
            {guardando ? "…" : "Guardar"}
          </button>
          <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
            onClick={() => { setAgregando(false); setSel(null); setCargo(""); }}>Cancelar</button>
        </div>
      )}

      {equipo.map(m => (
        <div key={m.id} className="eq-row" style={{ alignItems: "center" }}>
          {/* El cargo es un combo: un clic abre, elegir guarda. Sin modo
              edición aparte no hay estado que se quede pegado. */}
          <MiniSelect value={m.cargo || ""} options={OPC}
            onSelect={v => cambiarCargo(m.id, v)}
            buttonClass="cargo" buttonStyle={{ cursor: "pointer", border: "none" }} />
          <span style={{ flex: 1, textAlign: "right" }}>
            <Link href={`/entidad/persona/${m.persona?.id}`} style={{ color: "var(--text)" }}>
              {m.persona?.alias || m.persona?.nombre} →
            </Link>
          </span>
          {quitando === m.id ? (
            <span style={{ fontSize: 11.5, marginLeft: 8, whiteSpace: "nowrap" }}>
              ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => quitar(m.id)}>sí</button>
              {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setQuitando(null)}>no</button>
            </span>
          ) : (
            <button title="Quitar del equipo" style={{ color: "var(--dim)", marginLeft: 8 }}
              onClick={() => setQuitando(m.id)}>✕</button>
          )}
        </div>
      ))}

      {!equipo.length && !agregando && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "4px 0" }}>
          Sin equipo — empieza por su directora: es con quien nace el proyecto.
        </div>
      )}
    </div>
  );
}
