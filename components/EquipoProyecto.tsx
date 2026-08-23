"use client";
import { agregarEquipoProyecto, quitarEquipoProyecto, editarCargoProyecto, cambiarPersonaProyecto } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import MiniSelect from "@/components/MiniSelect";
import Avatar from "@/components/Avatar";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

/* «desde ene 2024» — el mes y el año en que se sumó al proyecto. Da contexto
   sin ocupar una fila: cuánto lleva alguien es parte de saber quién es en la
   película. Sin fecha no se inventa nada. */
const desdeTxt = (f?: string | null) => {
  if (!f) return "";
  const d = new Date(f + "T12:00:00");
  return isNaN(d.getTime()) ? "" : `desde ${d.toLocaleDateString("es-PE", { month: "short", year: "numeric" })}`;
};

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
  /* El dron va con la cámara y no al final: es una cámara más, y quien busca
     «quién vuela» baja por el bloque de imagen. */
  "Dirección de fotografía", "Segunda cámara (cámara B)", "Operador de dron",
  // Un solo cargo, no dos: la misma persona hace la foto fija y el BTS
  "Foto fija y detrás de cámaras (BTS)",
  /* «Montaje» y «Edición» conviven a propósito y pegados: el equipo usa las dos
     palabras para el mismo oficio y ya hay filas guardadas como «Montaje».
     Ponerlas juntas hace visible la elección; unificarlas habría reescrito
     datos que alguien puso a conciencia. Si un día se decide una sola, es un
     UPDATE de una línea — y esta nota dice por qué había dos. */
  "Sonido", "Montaje", "Edición", "Música original",
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

  /* ── EL ORDEN DEL RODAJE, NO EL DEL ABECEDARIO ──
     La consulta pide `.order("cargo")`, así que llegaba alfabético: «Dirección
     de fotografía» por encima de «Directora». En una ficha de proyecto eso se
     lee mal — quien mira busca primero quién dirige.
     `CARGOS` ya tiene el orden bueno (dirección, producción, oficios) y está
     tres líneas más arriba; se usa como índice en vez de escribir un segundo
     criterio que pueda separarse de él. Un cargo que no esté en la lista
     —escrito a mano antes de que existiera este catálogo— va al final en vez de
     desaparecer o colarse arriba. */
  const equipoOrdenado = [...equipo].sort((a, b) => {
    const i = (m: any) => {
      const k = CARGOS.indexOf(m.cargo || "");
      return k === -1 ? CARGOS.length : k;
    };
    return i(a) - i(b)
      || String(a.persona?.alias || a.persona?.nombre || "")
          .localeCompare(String(b.persona?.alias || b.persona?.nombre || ""));
  });

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
  const cambiarPersona = async (id: string, personaId: string) => {
    setError("");
    const r: any = await cambiarPersonaProyecto(id, proyectoId, personaId);
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

      {/* ── LA PERSONA PRIMERO, EL CARGO DESPUÉS ──
          Estaba al revés: el cargo pegado al borde izquierdo y la gente al
          otro lado de un hueco elástico. Una lista de equipo se recorre por
          nombres —«¿está Frank?»— y los nombres quedaban en una columna que se
          movía de sitio según lo largo que fuera el cargo de al lado.
          Ahora la columna de la izquierda son las caras, que es por donde baja
          el ojo, y el cargo va detrás como lo que es: lo que esa persona hace
          aquí. */}
      {equipoOrdenado.map(m => (
        <div key={m.id} className="eq-row" style={{ alignItems: "center" }}>
          {/* Foto + nombre + desde: la cara de quien hace la película, no solo
              su nombre. Para la directora —con quien nace el proyecto— importa
              más que para nadie. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Avatar nombre={m.persona?.nombre} src={m.persona?.foto_url} size={30} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.25, minWidth: 0 }}>
              <Link href={`/entidad/persona/${m.persona?.id}`}
                style={{ color: "var(--text)", fontWeight: 600 }}>
                {m.persona?.alias || m.persona?.nombre} →
              </Link>
              {(desdeTxt(m.desde) || m.persona?.tipo) && (
                <span style={{ color: "var(--dim)", fontSize: 11 }}>
                  {[m.persona?.tipo, desdeTxt(m.desde)].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
          </div>
          {/* ── CORREGIR A QUIÉN, SIN BORRAR LA FILA ──
              El cargo ya se podía cambiar; la persona no, y arreglar un error
              de dedo obligaba a quitar y volver a agregar. Eso no es lo mismo:
              se pierde el «desde» y la bitácora acaba contando una baja y un
              alta que nunca pasaron. */}
          <EntPicker etiqueta="⇄" items={personas} titulo="Cambiar a otra persona"
            onPick={id => cambiarPersona(m.id, id)} />
          {/* El cargo es un combo: un clic abre, elegir guarda. Sin modo
              edición aparte no hay estado que se quede pegado. */}
          <MiniSelect value={m.cargo || ""} options={OPC}
            onSelect={v => cambiarCargo(m.id, v)}
            buttonClass="cargo" buttonStyle={{ cursor: "pointer", border: "none" }} />
          <span style={{ flex: 1 }} />
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
