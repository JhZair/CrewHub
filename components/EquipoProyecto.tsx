"use client";
import { agregarEquipoProyecto, quitarEquipoProyecto, editarCargoProyecto, cambiarPersonaProyecto } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import MiniSelect from "@/components/MiniSelect";
import Avatar from "@/components/Avatar";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { useState } from "react";
import {
  META_TIPO_AUT, ROTULO_ESTADO_AUT, colorEstadoAut, permisoResuelto,
  personaDeAutorizacion,
  type FilaAutorizacion, type NivelRiesgo, type EstadoAutorizacion,
} from "@/lib/clearance";

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
  /* ── CONDUCCIÓN ──
     Quien lleva el relato ante la cámara: presenta, pregunta, acompaña. En un
     documental de encuentro es la figura que hace avanzar la película, y en una
     cobertura es quien la conduce de principio a fin.
     Va con dirección y no al final entre los oficios porque conducir es trabajo
     de RELATO, no de gestión ni de técnica; y por encima de producción por el
     mismo motivo que el orden entero: sigue el rodaje, no el organigrama.
     ⚠ Es un cargo del EQUIPO —quien trabaja— y no hay que confundirlo con el
     grupo `conduccion` de lib/repartoFondo, que es del REPARTO: quién sale.
     Las conductoras de Mujeres del Ande están en las dos listas, y eso es
     correcto: dirigen la película y además aparecen en ella. */
  "Conductora", "Conductor",
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

export default function EquipoProyecto({
  proyectoId, equipo, personas, cesiones = [], riesgos = {}, cesionesError = "",
}: {
  proyectoId: string;
  equipo: any[];
  personas: CatalogoItem[];
  /* ── LA CESIÓN DE DERECHOS DE QUIEN HACE LA PELÍCULA ──
     ⚠ `aporte_de_equipo` existía en el vocabulario desde el primer día —«el
     aporte creativo de quien hace la película; aquí sí suele ser una cesión de
     verdad: la productora pasa a ser titular»— y NINGUNA pantalla lo enseñaba.
     El reparto sí tenía su estado bajo el nombre; el equipo, nada.
     Y es más grave que en el reparto: sin la cesión de la montajista o del
     director de fotografía, la productora no es titular de la obra que va a
     presentar a un fondo. Eso no lo arregla una llamada. */
  cesiones?: FilaAutorizacion[];
  /** El riesgo de cada una, calculado en el servidor. Cadenas, no funciones. */
  riesgos?: Record<string, NivelRiesgo>;
  /** ⚠ Si la consulta de permisos falló. Sin esto, una lista vacía POR ERROR
   *  hacía que este bloque afirmara «⚠ 6 sin cesión de derechos» y pintara «sin
   *  registrar» bajo cada nombre — un cero que no es un cero, por el lado
   *  contrario: no dice «todo bien», dice «falta todo», y manda a registrar
   *  duplicados de papeles que quizá ya existen. `ActoresProyecto` lo tenía
   *  desde el principio y esto se copió sin él. */
  cesionesError?: string;
}) {
  const [agregando, setAgregando] = useState(false);
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null);
  const [cargo, setCargo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const OPC = CARGOS.map(c => [c, c]) as [string, string][];

  /* La cesión de cada quien, por persona. `personaDeAutorizacion` y no un `||`
     escrito aquí: es la función que existe para que no haya dos criterios, y
     esta habría sido la cuarta copia. El primero si hay dos, igual que en el
     reparto — dos pantallas eligiendo filas distintas para la misma persona es
     el fallo que ya cometimos. */
  const cesionDe = new Map<string, FilaAutorizacion>();
  for (const a of cesiones) {
    if (a.tipo !== "aporte_de_equipo") continue;
    const k = personaDeAutorizacion(a);
    if (k && !cesionDe.has(k)) cesionDe.set(k, a);
  }
  /* ⚠ PERSONAS, no filas. `proyecto_equipo` es `unique (proyecto, persona,
     cargo)`: la misma persona puede ser Directora Y Guionista, y contando filas
     el titular decía «⚠ 2 sin cesión» habiendo una sola a quien pedírsela. Y
     /clearance sí deduplica, así que las dos pantallas daban números distintos
     sobre lo mismo. */
  const personasEquipo = [...new Set(
    equipo.map((m: any) => m.persona?.id).filter(Boolean) as string[])];
  const sinCeder = personasEquipo.filter(id => {
    const c = cesionDe.get(id);
    return !c || !permisoResuelto(c, riesgos[c.id]);
  }).length;

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
          {/* ⚠ El mismo titular que el reparto: quién falta, no cuántos hay.
              Sin la cesión de la montajista o del director de fotografía, la
              productora no es titular de la obra que va a presentar — y eso no
              lo arregla una llamada. */}
          {/* ⚠ Con la consulta caída no se afirma NADA: ni que falten ni que
              estén. El error se enseña abajo, en el bloque del reparto. */}
          {!!personasEquipo.length && !cesionesError && (
            sinCeder ? (
              <span className="act-ces-falta">
                {" "}⚠ {sinCeder} sin cesión de derechos
              </span>
            ) : (
              <span className="act-ces-ok">
                {" "}✓ {personasEquipo.length === 1
                  ? "con su cesión" : `las ${personasEquipo.length} con su cesión`}
              </span>
            )
          )}
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
              {/* ── SU CESIÓN DE DERECHOS ──
                  Debajo del nombre y no en una columna: es un dato de la
                  persona, no una casilla del cargo. Y sin botón: se registra en
                  ⚖ clearance, que es el único sitio que escribe permisos. */}
              {m.persona?.id && !cesionesError && (() => {
                const c = cesionDe.get(m.persona.id);
                const rg = c ? riesgos[c.id] : null;
                return (
                  <span className="eq-ces">
                    {META_TIPO_AUT.aporte_de_equipo.ico} cesión de derechos{" "}
                    {/* ⚠ El «sin registrar» en ÁMBAR, igual que en la ficha del
                        reparto. En gris se confundía con `no_iniciada`, que es
                        otra cosa: ahí hay un papel empezado y aquí no hay
                        ninguno. Dos cosas distintas, dos colores. */}
                    <b style={{ color: c ? colorEstadoAut(c, rg) : "var(--yellow)" }}>
                      {!c ? "sin registrar"
                        : c.estado === "firmada" && !c.documento_id
                          ? "firmada, falta el papel"
                          : ROTULO_ESTADO_AUT[c.estado as EstadoAutorizacion] || String(c.estado)}
                    </b>
                  </span>
                );
              })()}
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
