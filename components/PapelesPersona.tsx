"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { registrarPapel, editarPapel, quitarPapel } from "@/app/actions";
/* `fechaDia` y NO `fechaDiaLima`: `vigente_hasta` es una columna `date`
   («2026-09-30»), y `fechaDiaLima` no pasa por `aFecha`, así que parsea la
   cadena como medianoche UTC y en Lima cae el día ANTERIOR — «29 set.» para
   una póliza que cubre hasta el 30, y «31 dic.» del año pasado para un
   1 de enero. Peor: `seguroVencido` compara cadenas ISO y acierta, así que el
   número y el texto se contradecían justo el último día de cobertura.
   `fechaDia` sí fija las 12:00 antes de formatear. */
import { fechaDia } from "@/lib/fechas";
import {
  estadoDePersona, estadoDe, tipoDe, sinPrueba, seguroVencido, sinVigencia,
  META_TIPO, META_ESTADO, CLAUSULA_PAPELES,
  type Papel, type TipoPapel, type EstadoPapel,
} from "@/lib/papeles";

/* ══════════════════════════════════════════════════════════════════════════
   LOS PAPELES DE UNA PERSONA EN UN FONDO — la cláusula 5.4, fila a fila

   El acta pide «documentación de contratos, convenios de prácticas o
   prestación de servicios de todo el personal vinculado» y, obligatoriamente,
   seguros contra accidentes para quienes participen. Eso no se cumple de
   golpe: se cumple persona a persona. Hasta ahora era UNA casilla en la
   pestaña Entregables — se marcaba «entregado» y nadie sabía si eran veintiún
   contratos o tres.

   ── DOS BURBUJAS, NO UNA LISTA ──
   En la pantalla de Equipo hay veintitantas filas y cada una ya lleva su
   cargo, su documento, su domicilio, su suspensión de 4ta y sus recibos. Una
   lista de papeles por fila la haría ilegible. Así que en la fila van dos
   burbujas —contrato y seguro—, que es exactamente lo que la cláusula pide, y
   el detalle se abre al pulsarlas.

   ── EL MISMO COMPONENTE EN LOS DOS SITIOS ──
   Lo usan 👥 Equipo (el crew) y 🎥 Audiovisual (el equipo artístico). Son la
   misma obligación sobre gente distinta, y dos componentes se habrían separado
   a la primera corrección.
   ══════════════════════════════════════════════════════════════════════════ */

/** Los dos huecos que la cláusula abre para cada persona. `otro` no aparece
 *  como hueco —no es una obligación, es un cajón— pero sus filas sí se ven al
 *  abrir el panel. */
const HUECOS: { k: "contrato" | "seguro"; tipoPorDefecto: TipoPapel; txt: string }[] = [
  { k: "contrato", tipoPorDefecto: "contrato", txt: "contrato" },
  { k: "seguro", tipoPorDefecto: "seguro", txt: "seguro" },
];

export default function PapelesPersona({
  postulacionId, personaId, nombre, papeles, hoy, compacto = false, puedeEditar = true,
  otroVinculo = null,
}: {
  postulacionId: string;
  personaId: string;
  nombre: string;
  /** SOLO los de esta persona. Vienen ya repartidos desde el servidor para no
   *  filtrar la lista entera una vez por fila. */
  papeles: Papel[];
  /** El día de hoy en Lima, calculado en el servidor. ⚠ No se usa `new Date()`
   *  aquí: el reloj del navegador puede estar en otra zona —o mal— y entonces
   *  un seguro vigente se pintaría vencido en la pantalla de una persona y no
   *  en la de otra, para los mismos datos. */
  hoy: string;
  /** En el equipo artístico las filas son más bajas y hay menos sitio. */
  compacto?: boolean;
  /** Sin permiso se ve todo pero no se toca nada. Hoy las dos pantallas que lo
   *  usan pasan `true`, pero un panel que registra Y BORRA documentos de una
   *  rendición no puede ser la única puerta del fondo que no mira el permiso. */
  puedeEditar?: boolean;
  /** ── EL OTRO VÍNCULO ──
   *  Yajaida dirige Y conduce; Roxana produce Y conduce. Su contrato es UNO
   *  —la clave es (fondo, persona, tipo)— y la misma burbuja se ve en las dos
   *  pestañas. Eso es correcto, pero no es evidente: quien la vea en el equipo
   *  artístico sin contrato intentará registrarle uno «de conductora» y
   *  chocará con «esa persona ya tiene registrado ese documento», que es
   *  cierto y críptico. Se dice antes de que pase. */
  otroVinculo?: { esCrew: boolean; que: string | null } | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nuevo, setNuevo] = useState<TipoPapel | null>(null);
  const [ed, setEd] = useState<Record<string, any>>({});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const est = estadoDePersona(papeles, hoy);

  const inputStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 9px", fontSize: 12.5, color: "var(--text)", width: "100%",
  } as const;

  const refrescar = () => { setNuevo(null); setEd({}); router.refresh(); };

  const guardarNuevo = async () => {
    if (!nuevo || ocupado) return;
    setOcupado(true); setError("");
    const r: any = await registrarPapel(postulacionId, {
      personaId, tipo: nuevo,
      estado: ed.estado || "pendiente",
      url: ed.url, firmadoEn: ed.firmado_en,
      vigenteDesde: ed.vigente_desde, vigenteHasta: ed.vigente_hasta,
      motivo: ed.motivo, nota: ed.nota,
    });
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    refrescar();
  };

  /** Un solo campo, sin abrir el formulario largo: marcar «ya firmó» es el
   *  gesto que se hace muchas veces y de a uno. */
  const tocar = async (id: string, campos: Record<string, any>) => {
    setOcupado(true); setError("");
    const r: any = await editarPapel(id, postulacionId, campos);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  const quitar = async (id: string) => {
    setOcupado(true); setError("");
    const r: any = await quitarPapel(id, postulacionId);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  /* ── LA BURBUJA DE UN HUECO ──
     `null` —ninguno registrado— se pinta igual de amarillo que `pendiente`.
     No son lo mismo (uno es un papel que existe sin firmar, el otro es que
     nadie lo apuntó) y el texto lo dice, pero para la cláusula las dos veces
     falta el papel, y pintar «no registrado» en gris lo haría parecer
     resuelto. */
  const burbuja = (k: "contrato" | "seguro") => {
    const e: EstadoPapel | null = k === "contrato" ? est.contrato : est.seguro;
    const vencido = k === "seguro" && est.seguroVencido;
    const col = vencido ? "var(--red)" : e ? META_ESTADO[e].col : "var(--yellow)";
    const ico = vencido ? "⏳" : e ? META_ESTADO[e].ico : "⚠";
    const txt = vencido ? "seguro vencido"
      : k === "contrato"
        ? (e === "firmado" ? "contrato" : e === "no_aplica" ? "contrato n/a" : e ? "contrato pend." : "sin contrato")
        : (e === "firmado" ? "seguro" : e === "no_aplica" ? "seguro n/a" : e ? "seguro pend." : "sin seguro");
    return (
      <span key={k} className="pap-burb" style={{ color: col }}>{ico} {txt}</span>
    );
  };

  /* ── EL PANEL VA EN FLUJO, NO FLOTANDO ──
     Estaba como `position:absolute` sobre la fila, y en la pestaña Audiovisual
     eso lo hacía DESAPARECER: `RepartoFondo` vive dentro de un `<Plegable>`,
     cuya `.plg` lleva `overflow:hidden`, así que un elemento absoluto que no
     aporta altura se corta en el borde inferior de la sección — sin error, sin
     scroll, simplemente no está. Justo en las últimas filas, que es donde más
     se usa.
     En flujo se acabaron de una vez el recorte, el z-index contra los otros
     paneles, el cerrar-al-pulsar-fuera y el Escape: es un bloque que empuja lo
     de abajo, como el editor de una fila del reparto. */
  return (
    <div className="pap-wrap">
      <button type="button" className={`pap-chip${compacto ? " es-compacto" : ""}`}
        aria-expanded={abierto} onClick={() => { setAbierto(v => !v); setError(""); }}
        title={`Contrato y seguro de ${nombre} — cláusula ${CLAUSULA_PAPELES} del acta. Pulsa para ver o registrar.`}>
        {HUECOS.map(h => burbuja(h.k))}
      </button>

      {abierto && (
        <div className="pap-panel">
          <div className="pap-panel-t">
            📎 Documentos de {nombre}
            <span className="pap-panel-cl">cláusula {CLAUSULA_PAPELES} del acta</span>
          </div>
          {/* Un contrato por persona, no por función: el acta pide
              documentación del personal vinculado, no un documento por cada
              cosa que alguien hace. Lo que sí es aparte es la cesión de imagen
              —el contrato paga el trabajo, la cesión autoriza usar la cara— y
              por eso vive en el equipo artístico y no aquí. */}
          {otroVinculo && (
            <div className="pap-doble">
              {otroVinculo.esCrew
                ? <>También está en el <b>equipo</b>{otroVinculo.que ? <> como <b>{otroVinculo.que}</b></> : null}.</>
                : <>También está en el <b>equipo artístico</b>{otroVinculo.que ? <> como <b>{otroVinculo.que}</b></> : null}.</>}
              {" "}Este contrato es el mismo en los dos sitios: no hace falta registrar otro.
              {otroVinculo.esCrew ? "" : " Su cesión de imagen sí va aparte, en el equipo artístico."}
            </div>
          )}
          {error && <div className="err-inline" style={{ marginBottom: 6 }}>⚠ {error}</div>}

          {papeles.length === 0 && !nuevo && (
            <div className="pap-vacio">
              Sin documentos registrados. El acta pide el contrato (o convenio, o locación de
              servicios) de todo el personal vinculado, y el seguro contra accidentes de quien
              participa en el rodaje.
            </div>
          )}

          {papeles.map(p => {
            const t = tipoDe(p);
            const e = estadoDe(p);
            const venc = seguroVencido(p, hoy);
            return (
              <div key={p.id} className="pap-fila">
                <span className="pap-fila-t" title={META_TIPO[t].ayuda}>
                  {META_TIPO[t].ico} {META_TIPO[t].txt}
                </span>
                <button type="button" className="pap-est"
                  style={{ color: venc ? "var(--red)" : META_ESTADO[e].col }}
                  disabled={ocupado || !puedeEditar}
                  onClick={() => {
                    /* Rota pendiente → firmado → (no aplica solo desde el
                       formulario, porque exige motivo y aquí no hay dónde
                       escribirlo). */
                    tocar(p.id, { estado: e === "firmado" ? "pendiente" : "firmado" });
                  }}
                  /* Los TRES estados: con dos, una fila «no aplica» decía
                     «Pendiente — pulsa para marcarlo firmado», que es mentira
                     sobre lo que se está mirando. */
                  title={e === "firmado" ? "Firmado — pulsa para volver a pendiente"
                    : e === "no_aplica" ? "No aplica — pulsa para marcarlo firmado"
                    : "Pendiente — pulsa para marcarlo firmado"}>
                  {venc ? "⏳ vencido" : `${META_ESTADO[e].ico} ${META_ESTADO[e].txt}`}
                </button>
                {sinPrueba(p) && (
                  <span className="pap-alerta" title="Marcado como firmado, pero sin el documento adjunto: en una rendición eso no se puede probar.">sin documento</span>
                )}
                {sinVigencia(p) && (
                  <span className="pap-alerta" title="Seguro firmado sin fecha de fin: no se puede afirmar que cubriera el rodaje.">sin vigencia</span>
                )}
                {p.vigente_hasta && (
                  <span className="pap-vig" title="Hasta cuándo cubre">
                    hasta {fechaDia(p.vigente_hasta)}
                  </span>
                )}
                {p.motivo && <span className="pap-motivo" title="Por qué no aplica">{p.motivo}</span>}
                {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="pap-doc" title="Abrir el documento">📄</a>}
                <span style={{ flex: 1 }} />
                {puedeEditar && (
                  <button type="button" className="pap-x" disabled={ocupado}
                    onClick={() => quitar(p.id)} title="Quitar este documento">✕</button>
                )}
              </div>
            );
          })}

          {nuevo ? (
            <div className="pap-nuevo">
              <div className="pap-nuevo-t">{META_TIPO[nuevo].ico} {META_TIPO[nuevo].txt}</div>
              <div className="pap-nuevo-g">
                <label>
                  <span>Tipo</span>
                  <select value={nuevo} onChange={e => setNuevo(e.target.value as TipoPapel)} style={inputStyle}>
                    {(Object.keys(META_TIPO) as TipoPapel[]).map(t => (
                      <option key={t} value={t}>{META_TIPO[t].txt}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Estado</span>
                  <select value={ed.estado || "pendiente"} onChange={e => setEd(v => ({ ...v, estado: e.target.value }))}
                    style={inputStyle}>
                    {(["pendiente", "firmado", "no_aplica"] as EstadoPapel[]).map(s => (
                      <option key={s} value={s}>{META_ESTADO[s].txt}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Firmado el</span>
                  <input type="date" value={ed.firmado_en || ""} style={inputStyle}
                    onChange={e => setEd(v => ({ ...v, firmado_en: e.target.value }))} />
                </label>
                {/* Las dos fechas SOLO en el seguro: un contrato firmado lo está
                    para siempre, un seguro cubre una ventana — y es esa ventana
                    lo que el acta exige que cubra el rodaje. */}
                {nuevo === "seguro" && (
                  <>
                    <label>
                      <span>Cubre desde</span>
                      <input type="date" value={ed.vigente_desde || ""} style={inputStyle}
                        onChange={e => setEd(v => ({ ...v, vigente_desde: e.target.value }))} />
                    </label>
                    <label>
                      <span>Cubre hasta</span>
                      <input type="date" value={ed.vigente_hasta || ""} style={inputStyle}
                        onChange={e => setEd(v => ({ ...v, vigente_hasta: e.target.value }))} />
                    </label>
                  </>
                )}
                <label className="pap-ancho">
                  <span>Documento (enlace)</span>
                  <input value={ed.url || ""} placeholder="https://…" style={inputStyle}
                    onChange={e => setEd(v => ({ ...v, url: e.target.value }))} />
                </label>
                {/* El motivo aparece solo cuando hace falta, y entonces hace
                    falta de verdad: «no aplica» sin explicación es
                    indistinguible de «alguien lo marcó para que dejara de salir
                    en rojo», y dentro de un año no hay forma de saber cuál fue. */}
                {ed.estado === "no_aplica" && (
                  <label className="pap-ancho">
                    <span>¿Por qué no aplica? (obligatorio)</span>
                    <input value={ed.motivo || ""} style={inputStyle}
                      placeholder="Proveedor con factura, no personal · Participó sin remuneración…"
                      onChange={e => setEd(v => ({ ...v, motivo: e.target.value }))} />
                  </label>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn" style={{ padding: "6px 13px", fontSize: 12 }}
                  disabled={ocupado} onClick={guardarNuevo}>{ocupado ? "…" : "Guardar"}</button>
                <button type="button" className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                  onClick={() => { setNuevo(null); setEd({}); setError(""); }}>Cancelar</button>
              </div>
            </div>
          ) : puedeEditar ? (
            <div className="pap-add">
              {HUECOS.map(h => (
                <button key={h.k} type="button" className="btn btn-ghost"
                  style={{ padding: "5px 11px", fontSize: 12 }}
                  onClick={() => { setNuevo(h.tipoPorDefecto); setEd({ estado: "pendiente" }); setError(""); }}>
                  ＋ {h.txt}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
