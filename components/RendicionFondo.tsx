"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  guardarEstadoCuenta, borrarEstadoCuenta, guardarRhe, fijarEjesRhe, fijarEjesRheLote, borrarRhe,
} from "@/app/actions";
import ImagenesEstado from "@/components/ImagenesEstado";
import Plegable from "@/components/Plegable";
import { useConfirmar, useAviso } from "@/components/useConfirmar";
import { VIAS_GIRO } from "@/lib/pagos";

/* ── La cara financiera de un fondo ganado ──
 *
 * Hasta hoy un fondo era solo cabecera: monto, fechas, «entregado sí/no».
 * Aquí vive lo que pasa DENTRO —lo que se paga y en qué banco— porque el plan
 * lo dice claro: el dinero del fondo vive con su fondo.
 *
 * Tres bloques, en el orden en que importan:
 *   1) el DESEMBOLSO — la fecha de la que cuelga todo el plazo (acta 7.2);
 *   2) los ESTADOS DE CUENTA — un PDF por mes, con su saldo e intereses;
 *   3) los RHE del fondo — cada pago con sus dos ejes: actividad y rubro.
 *
 * Solo administración escribe. El resto lo ve, que para eso está.
 */

type EstadoCuenta = {
  id: string; periodo: string; url: string | null;
  saldo: number | null; intereses: number | null; nota: string | null;
  imagenes?: string[] | null;
  creado_en?: string | null; comprobante_en?: string | null;
  creado?: { nombre: string } | null; quien?: { nombre: string } | null;
};
type RheFila = {
  id: string; persona_id: string; persona?: string;
  fecha: string; monto: number; numero: string | null; url: string | null;
  etapa: string | null; rubro_item: string | null; concepto?: string | null;
};
type Opcion = { id: string; nombre: string };

const soles = (n: number | null | undefined) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Los conceptos de los RHE vienen EN MAYÚSCULAS del PDF. Se leen mejor en
// oración: primera letra arriba, el resto abajo (sin tocar siglas cortas).
const capitaliza = (s?: string | null) => {
  const t = (s || "").trim();
  if (!t) return "";
  const lower = t.toLocaleLowerCase("es-PE");
  return lower.charAt(0).toLocaleUpperCase("es-PE") + lower.slice(1);
};

// "2026-07-01" → "jul. 2026"
const mesLargo = (p: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(p || "");
  if (!m) return p;
  const meses = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "set.", "oct.", "nov.", "dic."];
  return `${meses[parseInt(m[2], 10) - 1]} ${m[1]}`;
};
// dd/mm/aaaa
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
// "22 jul. 2026" a partir de un timestamptz
const fechaSubido = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
};
// Desembolso + 2 años (acta 7.2): el plazo de ejecución.
const masDosAnios = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  if (!m) return "";
  return `${+m[1] + 2}-${m[2]}-${m[3]}`;
};

export default function RendicionFondo({
  postulacionId, esAdmin, fechaDesembolso, montoAdjudicado,
  estados, rhe, empresa, etapas, rubros, personas,
}: {
  postulacionId: string;
  esAdmin: boolean;
  fechaDesembolso: string | null;
  montoAdjudicado: number | null;
  estados: EstadoCuenta[];
  rhe: RheFila[];
  empresa?: string | null;   // quien gira los recibos (la asociación titular del fondo)
  etapas: Opcion[];        // etapas del cronograma (eje del informe económico)
  rubros: { id: string; etiqueta: string }[];  // catálogo de rubros DAFO (eje rubro)
  personas: Opcion[];      // a quién se le puede girar
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();

  const totalIntereses = estados.reduce((s, e) => s + Number(e.intereses || 0), 0);
  // Un mes «tiene comprobante» si hay escaneo(s) adjunto(s) o un link de PDF.
  const tieneComprobante = (e: EstadoCuenta) => (e.imagenes?.length || 0) > 0 || !!e.url;
  const conComprobante = estados.filter(tieneComprobante).length;
  const totalRhe = rhe.reduce((s, r) => s + Number(r.monto || 0), 0);
  // Cuántos RHE ya tienen sus dos ejes puestos (lo que hace que la rendición cuadre sola)
  const rheSinEje = rhe.filter(r => !r.etapa || !r.rubro_item).length;
  const conEjes = rhe.length - rheSinEje;
  const rubrosOpc = rubros.map(x => ({ id: x.id, nombre: x.etiqueta }));
  // ── Los mismos RHE, mirados de tres maneras ──
  // Por persona (a quién se le pagó), por etapa (en qué fase del cronograma) o
  // por rubro (en qué partida del presupuesto). Es la MISMA plata reagrupada:
  // sirve para leer la rendición desde el eje que toque en cada momento.
  const [modo, setModo] = useState<"persona" | "etapa" | "rubro">("persona");
  const totGrupo = (g: { items: RheFila[] }) => g.items.reduce((s, r) => s + Number(r.monto || 0), 0);
  const nombreDe = (opc: Opcion[], id: string) => opc.find(o => o.id === id)?.nombre;
  const SIN = "∅";  // clave del grupo «sin asignar»

  type GrupoRhe = { clave: string; titulo: string; personaId?: string; items: RheFila[] };
  const grupos: GrupoRhe[] = (() => {
    const map = new Map<string, GrupoRhe>();
    for (const r of rhe) {
      let clave: string, titulo: string, personaId: string | undefined;
      if (modo === "persona") {
        clave = r.persona_id; titulo = r.persona || "—"; personaId = r.persona_id;
      } else if (modo === "etapa") {
        clave = r.etapa || SIN; titulo = r.etapa ? (nombreDe(etapas, r.etapa) || r.etapa) : "⚠ Sin etapa";
      } else {
        clave = r.rubro_item || SIN; titulo = r.rubro_item ? (nombreDe(rubrosOpc, r.rubro_item) || r.rubro_item) : "⚠ Sin rubro";
      }
      let g = map.get(clave);
      if (!g) { g = { clave, titulo, personaId, items: [] }; map.set(clave, g); }
      g.items.push(r);
    }
    const gs = [...map.values()];
    if (modo === "etapa") {
      // Orden natural del cronograma (pre → prod → post); «sin etapa» al final.
      const orden = new Map(etapas.map((e, i) => [e.id, i]));
      gs.sort((a, b) =>
        (a.clave === SIN ? 1e9 : orden.get(a.clave) ?? 1e8) -
        (b.clave === SIN ? 1e9 : orden.get(b.clave) ?? 1e8));
    } else {
      // Persona y rubro: mayor gasto primero, «sin asignar» al final.
      gs.sort((a, b) =>
        (a.clave === SIN ? 1 : 0) - (b.clave === SIN ? 1 : 0) || totGrupo(b) - totGrupo(a));
    }
    return gs;
  })();

  // Expandir / plegar todos los grupos de la vista actual de una sola vez.
  const plegarTodos = (abrir: boolean) => {
    try {
      window.dispatchEvent(new CustomEvent("plg:todos", {
        detail: { prefijo: `rhegrp:${postulacionId}:${modo}:`, abrir },
      }));
    } catch { /* da igual */ }
  };

  return (
    <div>
      {dialogo}
      {aviso}
      {/* ── 1) Desembolso y plazo ── */}
      <div className="linked" style={{ marginBottom: 14 }}>
        <div className="eq-row">
          <span className="cargo">Estímulo</span>
          <span style={{ flex: 1, textAlign: "right", color: "var(--teal)", fontWeight: 700 }}>
            {montoAdjudicado ? soles(montoAdjudicado) : "—"}
          </span>
        </div>
        <div className="eq-row">
          <span className="cargo">Desembolso</span>
          <span style={{ flex: 1, textAlign: "right" }}>
            {fechaDesembolso
              ? dmy(fechaDesembolso)
              : <i style={{ color: "var(--yellow)", fontStyle: "normal", fontSize: 12 }}>
                  ⚠ falta — edítalo arriba en la ficha
                </i>}
          </span>
        </div>
        <div className="eq-row">
          <span className="cargo">Plazo (2 años)</span>
          <span style={{ flex: 1, textAlign: "right", color: "var(--dim)" }}>
            {fechaDesembolso ? dmy(masDosAnios(fechaDesembolso)) : "—"}
          </span>
        </div>
        {!fechaDesembolso && (
          <p style={{ color: "var(--dim)", fontSize: 11, margin: "6px 0 0", lineHeight: 1.5 }}>
            El plazo de ejecución se cuenta desde que el dinero llega a la cuenta, no desde la
            firma del acta. Sin esta fecha, la rendición no tiene reloj.
          </p>
        )}
      </div>

      {/* ── 2) Estados de cuenta (sub-sección plegable, nivel 2) ── */}
      <Plegable nivel={2} id={`ren:${postulacionId}:estados`} titulo="🏦 Estados de cuenta"
        abiertoPorDefecto={false}
        resumen={
          <>
            <span style={{ color: "var(--muted)" }}>
              {estados.length ? `${estados.length} mes(es) · intereses ${soles(totalIntereses)}` : "sin cargar"}
            </span>
            {estados.length > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 600,
                color: conComprobante === estados.length ? "var(--green)" : "var(--yellow)" }}>
                {conComprobante === estados.length ? "✓" : "⚠"} {conComprobante}/{estados.length} compr.
              </span>
            )}
          </>
        }>
      {estados.length > 0 && (
        <div className="linked" style={{ marginBottom: 8, padding: "4px 10px" }}>
          {estados.map(e => (
            <div key={e.id} style={{ borderTop: "1px solid var(--border)", padding: "7px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ minWidth: 82, fontWeight: 600, fontSize: 13.5 }}>{mesLargo(e.periodo)}</span>
                <span style={{ flex: 1, fontSize: 13 }}>
                  <span style={{ color: "var(--dim)" }}>saldo </span>
                  <b style={{ color: Number(e.saldo) < 0 ? "var(--red)" : "var(--teal)" }}>{soles(e.saldo)}</b>
                  <span style={{ color: "var(--dim)" }}> · interés </span>
                  <b style={{ color: Number(e.intereses) > 0 ? "var(--yellow)" : "var(--muted)" }}>{soles(e.intereses)}</b>
                  {e.nota ? <span style={{ color: "var(--dim)" }}> · {e.nota}</span> : ""}
                </span>
                {!tieneComprobante(e) && (
                  <span title="Este mes aún no tiene comprobante adjunto"
                    style={{ fontSize: 11.5, color: "var(--yellow)", fontWeight: 600, whiteSpace: "nowrap" }}>⚠ sin comprobante</span>
                )}
                {e.url && (
                  <a href={e.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: "var(--violet)", fontSize: 12.5 }}>📄 PDF ↗</a>
                )}
                {esAdmin && (
                  <button onClick={async () => {
                    if (!(await pedir(`¿Borrar el estado de cuenta de ${mesLargo(e.periodo)}?`, { peligro: true, aceptar: "Borrar" }))) return;
                    const r: any = await borrarEstadoCuenta(e.id, postulacionId);
                    if (r?.error) avisar(r.error); else router.refresh();
                  }} title="Borrar"
                    style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}>✕</button>
                )}
              </div>
              {/* El comprobante físico del mes: escaneos/fotos del estado impreso. */}
              <ImagenesEstado estadoId={e.id} postulacionId={postulacionId} esAdmin={esAdmin}
                inicial={e.imagenes || []} />
              {/* Sello: quién subió el comprobante y cuándo (o quién cargó la fila). */}
              {(() => {
                const comp = e.comprobante_en
                  ? `📎 comprobante subido${e.quien?.nombre ? ` por ${e.quien.nombre}` : ""} · ${fechaSubido(e.comprobante_en)}`
                  : e.creado_en
                    ? `cargado${e.creado?.nombre ? ` por ${e.creado.nombre}` : ""} · ${fechaSubido(e.creado_en)}`
                    : "";
                return comp ? (
                  <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 3 }}>{comp}</div>
                ) : null;
              })()}
            </div>
          ))}
        </div>
      )}
        {esAdmin && <FormEstado postulacionId={postulacionId} />}
      </Plegable>

      {/* ── 3) Pagos al personal — RHE (sub-sección plegable, nivel 2) ── */}
      <Plegable nivel={2} id={`ren:${postulacionId}:rhe`} titulo="🧾 Pagos al personal (RHE)"
        abiertoPorDefecto={true}
        resumen={
          rhe.length ? (
            <>
              <span style={{ fontWeight: 700, color: "var(--muted)" }}>{rhe.length} RHE</span>
              <span style={{ marginLeft: 8, color: "var(--teal)", fontWeight: 700 }}>{soles(totalRhe)}</span>
              <span style={{ marginLeft: 8, fontWeight: 600, color: rheSinEje ? "var(--yellow)" : "var(--green)" }}>
                {rheSinEje ? "⚠" : "✓"} {conEjes}/{rhe.length}
              </span>
            </>
          ) : <span style={{ color: "var(--dim)" }}>sin pagos</span>
        }>
      {rhe.length > 0 && empresa && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, margin: "0 0 8px" }}>
          Girados por <b style={{ color: "var(--muted)", fontWeight: 600 }}>{empresa}</b> — la asociación titular del fondo.
        </div>
      )}
      {rhe.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ color: "var(--dim)", fontSize: 12 }}>Ver:</span>
          <div className="rhe-vistas">
            {([["persona", "👤 Por persona"], ["etapa", "🎬 Por etapa"], ["rubro", "🗂 Por rubro"]] as const).map(([m, txt]) => (
              <button key={m} onClick={() => setModo(m)}
                className={modo === m ? "on" : ""}>{txt}</button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <button className="plg-todo" onClick={() => plegarTodos(true)}>⤢ Expandir todo</button>
          <button className="plg-todo" onClick={() => plegarTodos(false)}>⤡ Plegar todo</button>
        </div>
      )}
      {esAdmin && rhe.length > 0 && etapas.length === 0 && (
        <div className="err-inline" style={{ marginBottom: 8 }}>
          ⚠ El eje «etapa» sale del cronograma del fondo, y todavía no tiene actividades cargadas.
          Carga el cronograma (📅 Cronograma) y aquí podrás asignar la etapa.
        </div>
      )}
      {grupos.map(g => {
        const ids = g.items.map(r => r.id);
        const faltan = g.items.filter(r => !r.etapa || !r.rubro_item).length;
        return (
          <Plegable key={g.clave} nivel={3} abiertoPorDefecto={false}
            id={`rhegrp:${postulacionId}:${modo}:${g.clave}`}
            titulo={<span style={{ color: g.clave === SIN ? "var(--yellow)" : undefined }}>{g.titulo}</span>}
            resumen={
              <>
                <span style={{ fontWeight: 700, color: "var(--muted)" }}>{g.items.length} RHE</span>
                <span style={{ marginLeft: 8, color: "var(--teal)", fontWeight: 700, fontSize: 13.5 }}>{soles(totGrupo(g))}</span>
                {faltan > 0 && <span style={{ marginLeft: 8, color: "var(--yellow)", fontWeight: 600 }}>⚠ {faltan}</span>}
              </>
            }>
            {/* «Aplicar a todos» — solo cuando el grupo es una persona: sus recibos
                suelen ir a la misma fase y partida. */}
            {esAdmin && modo === "persona" && g.items.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingBottom: 6, marginBottom: 2, borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                <span style={{ color: "var(--dim)", fontSize: 11.5 }}>Aplicar a todos:</span>
                <EjeSelect valor="" vacio="⇊ etapa" opciones={etapas} editable
                  onCambio={v => v && fijarEjesRheLote(ids, { etapa: v }, postulacionId).then(() => router.refresh())} />
                <EjeSelect valor="" vacio="⇊ rubro" opciones={rubrosOpc} editable
                  onCambio={v => v && fijarEjesRheLote(ids, { rubroItem: v }, postulacionId).then(() => router.refresh())} />
              </div>
            )}
                {g.items.map(r => (
                  <div key={r.id} className="rhe-fila" style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.045)" }}>
                    {/* Izquierda: monto, fecha·número, y el CONCEPTO (por qué se pagó) */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "var(--teal)", fontWeight: 700, fontSize: 14.5 }}>{soles(r.monto)}</span>
                        {modo !== "persona" && (
                          <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 12.5 }}>{r.persona || "—"}</span>
                        )}
                        <span style={{ color: "var(--dim)", fontSize: 12 }}>{dmy(r.fecha)}{r.numero ? ` · ${r.numero}` : ""}</span>
                        {r.url && (
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            title="Ver el recibo (PDF)"
                            style={{ color: "var(--violet)", fontSize: 12.5, textDecoration: "none" }}>📄 ↗</a>
                        )}
                      </div>
                      {r.concepto
                        ? <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>{capitaliza(r.concepto)}</div>
                        : <div style={{ color: "var(--dim)", fontSize: 12, marginTop: 3, fontStyle: "italic" }}>sin concepto</div>}
                    </div>
                    {/* Derecha: los dos ejes + borrar, ocupando el espacio que antes quedaba vacío */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, paddingTop: 1 }}>
                      <EjeSelect valor={r.etapa || ""} vacio="⚠ etapa…" opciones={etapas}
                        editable={esAdmin}
                        onCambio={v => fijarEjesRhe(r.id, { postulacionId, etapa: v || null }).then(() => router.refresh())} />
                      <EjeSelect valor={r.rubro_item || ""} vacio="⚠ rubro…" opciones={rubrosOpc}
                        editable={esAdmin}
                        onCambio={v => fijarEjesRhe(r.id, { postulacionId, rubroItem: v || null }).then(() => router.refresh())} />
                      {esAdmin && (
                        <button onClick={async () => {
                          if (!(await pedir("¿Borrar este RHE?", { peligro: true, aceptar: "Borrar" }))) return;
                          const res: any = await borrarRhe(r.id, r.persona_id, postulacionId);
                          if (res?.error) avisar(res.error); else router.refresh();
                        }} title="Borrar"
                          style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}>✕</button>
                      )}
                    </div>
                  </div>
                ))}
          </Plegable>
        );
      })}
      {esAdmin && (
        <FormRhe postulacionId={postulacionId} etapas={etapas}
          rubros={rubros} personas={personas} />
      )}
      </Plegable>
      {!esAdmin && !rhe.length && !estados.length && (
        <p style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 6 }}>
          La carga de estados de cuenta y RHE la hace administración.
        </p>
      )}
    </div>
  );
}

/* Un eje: combo si eres admin, texto si no. Vacío se pinta en ámbar porque un
   gasto sin su eje es justo lo que rompe la rendición dos años después. */
function EjeSelect({ valor, vacio, opciones, editable, onCambio }: {
  valor: string; vacio: string; opciones: Opcion[]; editable: boolean;
  onCambio: (v: string) => void;
}) {
  const actual = opciones.find(o => o.id === valor);
  if (!editable) {
    return (
      <span style={{ fontSize: 12.5, color: actual ? "var(--muted)" : "var(--yellow)" }}>
        {actual ? actual.nombre : vacio}
      </span>
    );
  }
  return (
    <select value={valor} onChange={e => onCambio(e.target.value)}
      style={{
        fontSize: 12.5, padding: "4px 8px", borderRadius: 6,
        background: "var(--bg)", color: valor ? "var(--text)" : "var(--yellow)",
        border: `1px solid ${valor ? "var(--border)" : "rgba(244,180,0,.4)"}`, maxWidth: 210,
      }}>
      <option value="">{vacio}</option>
      {opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
    </select>
  );
}

/* Alta de un estado de cuenta mensual. */
function FormEstado({ postulacionId }: { postulacionId: string }) {
  const router = useRouter();
  const [mes, setMes] = useState("");
  const [saldo, setSaldo] = useState("");
  const [intereses, setIntereses] = useState("");
  const [url, setUrl] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const enviar = async () => {
    if (ocupado) return;
    if (!mes) { setError("Elige el mes."); return; }
    setOcupado(true); setError("");
    const r: any = await guardarEstadoCuenta({
      postulacionId, periodo: mes + "-01", url, saldo, intereses, nota,
    });
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setMes(""); setSaldo(""); setIntereses(""); setUrl(""); setNota("");
    router.refresh();
  };

  return (
    <div className="linked" style={{ marginBottom: 8 }}>
      {error && <div className="err-inline" style={{ marginBottom: 6 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          title="Mes que cubre" style={inp(120)} />
        <input value={saldo} onChange={e => setSaldo(e.target.value)}
          placeholder="Saldo S/" inputMode="decimal" style={inp(100)} />
        <input value={intereses} onChange={e => setIntereses(e.target.value)}
          placeholder="Interés S/" inputMode="decimal" style={inp(100)} />
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="Link del PDF del banco" style={{ ...inp(180), flex: 1, minWidth: 140 }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
        <input value={nota} onChange={e => setNota(e.target.value)}
          placeholder="Nota (opcional)" style={{ ...inp(180), flex: 1 }} />
        <button className="btn" disabled={ocupado} onClick={enviar}
          style={{ fontSize: 12, padding: "6px 14px" }}>
          {ocupado ? "…" : "＋ Estado de cuenta"}
        </button>
      </div>
    </div>
  );
}

/* Girar un RHE ya con sus dos ejes: se paga a la actividad y al rubro desde
   el inicio, no dos años después. */
function FormRhe({ postulacionId, etapas, rubros, personas }: {
  postulacionId: string; etapas: Opcion[];
  rubros: { id: string; etiqueta: string }[]; personas: Opcion[];
}) {
  const router = useRouter();
  const [abrir, setAbrir] = useState(false);
  const [personaId, setPersonaId] = useState("");
  const [fecha, setFecha] = useState("");
  const [monto, setMonto] = useState("");
  const [numero, setNumero] = useState("");
  const [etapa, setEtapa] = useState("");
  const [rubroItem, setRubroItem] = useState("");
  const [url, setUrl] = useState("");
  /* Iban hardcodeados a "" y "0" al llamar a guardarRhe, y las dos ausencias
     dolían donde más:
       · el concepto es lo que esta misma lista pinta como dato principal, así
         que todo recibo dado de alta desde aquí nacía con «sin concepto» en
         cursiva — y lo que dice qué se pagó no se reconstruye a los dos años;
       · la retención en cero impedía registrar el 8% de quien rompió el tope de
         4ta, que es justo el caso que el sistema existe para vigilar. */
  const [concepto, setConcepto] = useState("");
  const [retencion, setRetencion] = useState("");
  const [giradoPor, setGiradoPor] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const enviar = async () => {
    if (ocupado) return;
    if (!personaId) { setError("Elige a quién se le giró."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { setError("Pon la fecha del recibo."); return; }
    setOcupado(true); setError("");
    const r: any = await guardarRhe({
      personaId, fecha, monto, numero, url, concepto, retencion, giradoPor,
      proyectoId: "", postulacionId, etapa, rubroItem,
    });
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setPersonaId(""); setFecha(""); setMonto(""); setNumero(""); setEtapa(""); setRubroItem(""); setUrl("");
    setConcepto(""); setRetencion(""); setGiradoPor("");
    setAbrir(false); router.refresh();
  };

  if (!abrir) {
    return (
      <button className="btn btn-ghost" onClick={() => setAbrir(true)}
        style={{ fontSize: 12, padding: "6px 12px" }}>＋ Registrar pago (RHE)</button>
    );
  }
  return (
    <div className="linked">
      {error && <div className="err-inline" style={{ marginBottom: 6 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <select value={personaId} onChange={e => setPersonaId(e.target.value)} style={inp(150)}>
          <option value="">¿A quién?</option>
          {personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp(140)} />
        <input value={monto} onChange={e => setMonto(e.target.value)}
          placeholder="Monto S/" inputMode="decimal" style={inp(100)} />
        <input value={numero} onChange={e => setNumero(e.target.value)}
          placeholder="Nº recibo" style={inp(110)} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <select value={etapa} onChange={e => setEtapa(e.target.value)}
          title="Etapa del informe económico" style={inp(180)}>
          <option value="">Etapa…</option>
          {etapas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select value={rubroItem} onChange={e => setRubroItem(e.target.value)}
          title="Rubro del gasto (catálogo DAFO)" style={inp(180)}>
          <option value="">Rubro…</option>
          {rubros.map(i => <option key={i.id} value={i.id}>{i.etiqueta}</option>)}
        </select>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="Link del PDF del recibo" style={{ ...inp(160), flex: 1, minWidth: 140 }} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <input value={concepto} onChange={e => setConcepto(e.target.value)}
          placeholder="Concepto — qué se le pagó"
          title="Lo que esta lista muestra como dato principal. Sin él, el recibo sale como «sin concepto»."
          style={{ ...inp(200), flex: 1, minWidth: 160 }} />
        <input value={retencion} onChange={e => setRetencion(e.target.value)}
          placeholder="Retención S/" inputMode="decimal"
          title="El 8% cuando la persona ya rompió el tope de 4ta. En blanco si tiene suspensión vigente."
          style={inp(110)} />
        <select value={giradoPor} onChange={e => setGiradoPor(e.target.value)}
          title="Quién giró el recibo en SUNAT" style={inp(170)}>
          <option value="">¿Quién lo giró?</option>
          {VIAS_GIRO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button className="btn" disabled={ocupado} onClick={enviar}
          style={{ fontSize: 12, padding: "6px 14px" }}>{ocupado ? "…" : "Girar RHE"}</button>
        <button className="btn btn-ghost" onClick={() => setAbrir(false)}
          style={{ fontSize: 12, padding: "6px 12px" }}>Cancelar</button>
      </div>
    </div>
  );
}

const inp = (w: number): React.CSSProperties => ({
  width: w, background: "var(--bg)", border: "1px solid var(--border)",
  borderRadius: 8, padding: "6px 10px", fontSize: 12.5, color: "var(--text)",
  outline: "none", fontFamily: "inherit",
});
