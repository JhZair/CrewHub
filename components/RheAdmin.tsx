"use client";
import { guardarRhe, borrarRhe, enlazarRheALiquidacion } from "@/app/actions";
import MiniSelect from "@/components/MiniSelect";
import { estado4ta, money } from "@/lib/cuarta";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { hoyLima } from "@/lib/fechas";
import { VIAS_GIRO, rotuloGiro } from "@/lib/pagos";

const fmt = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

type Persona = { id: string; nombre: string; suspension_4ta_anio: number | null };
type Fila = { id: string; persona_id: string; numero: string | null; fecha: string; monto: number; retencion: number; concepto: string | null; proyecto_id: string | null; url: string | null; liquidacion_id: string | null; girado_por: string | null };
type Liq = { id: string; persona_id: string; anio: number; mes: number; estado: string | null; cerrado_en: string | null };

/* Registro de RHE del año + vigilancia del tope de 4ta por persona. */
export default function RheAdmin({ anio, personas, proyectos, rhes, liquidaciones, pre }: {
  anio: number;
  personas: Persona[];
  proyectos: { id: string; nombre: string }[];
  rhes: Fila[];
  liquidaciones: Liq[];
  /* Lo que trae quien llega desde «＋ registrar el recibo» del panel de
     liquidación: persona, mes que se paga e importe. */
  pre?: { personaId: string; liquidacionId: string; monto: string } | null;
}) {
  const vacio = { id: null as string | null, personaId: "", numero: "", fecha: hoyLima(), monto: "", retencion: "", concepto: "", proyectoId: "", url: "", liquidacionId: "", giradoPor: "" };
  /* Si venimos con datos, el formulario arranca abierto y relleno. En el
     `useState` inicial y no en un efecto: montarlo vacío y llenarlo después
     hace parpadear el formulario y, peor, pisaría lo que el usuario ya
     empezara a escribir en ese primer instante. */
  const [f, setF] = useState(pre
    ? { ...vacio, personaId: pre.personaId, monto: pre.monto, liquidacionId: pre.liquidacionId }
    : vacio);
  const [abierto, setAbierto] = useState(!!pre);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const router = useRouter();

  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const nombreDe = new Map(personas.map(p => [p.id, p.nombre]));
  const proyDe = new Map(proyectos.map(p => [p.id, p.nombre]));

  /* Los meses liquidados de cada persona, para el selector. Solo los
     LIQUIDADOS: un mes que todavía se está viviendo no tiene nada que pagar, y
     ofrecerlo invita a atar el recibo a un total que aún va a cambiar. */
  const liqPorPersona = new Map<string, Liq[]>();
  liquidaciones.filter(l => l.estado === "liquidado").forEach(l => {
    const xs = liqPorPersona.get(l.persona_id) || [];
    xs.push(l); liqPorPersona.set(l.persona_id, xs);
  });

  const enlazar = async (r: Fila, liqId: string) => {
    setOcupado(true);
    const res: any = await enlazarRheALiquidacion(r.id, liqId || null);
    setOcupado(false);
    if (res?.error) setError(res.error); else router.refresh();
  };

  // Acumulado del año por persona: la cuenta que nadie estaba llevando
  const acum = new Map<string, number>();
  rhes.forEach(r => acum.set(r.persona_id, (acum.get(r.persona_id) || 0) + Number(r.monto || 0)));
  const conRhe = personas.filter(p => acum.has(p.id))
    .sort((a, b) => (acum.get(b.id) || 0) - (acum.get(a.id) || 0));

  const guardar = async () => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const res: any = await guardarRhe({ ...f, id: f.id });
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    setF(vacio); setAbierto(false); router.refresh();
  };

  const quitar = async (r: Fila) => {
    const res: any = await borrarRhe(r.id, r.persona_id);
    setBorrando(null);
    if (res?.error) setError(res.error); else router.refresh();
  };

  const editar = (r: Fila) => {
    setF({
      id: r.id, personaId: r.persona_id, numero: r.numero || "", fecha: r.fecha,
      monto: String(r.monto), retencion: String(r.retencion || ""), concepto: r.concepto || "",
      proyectoId: r.proyecto_id || "", url: r.url || "",
      liquidacionId: r.liquidacion_id || "",
      giradoPor: r.girado_por || "",
    });
    setAbierto(true);
  };

  const inp = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: "var(--text)", outline: "none" } as const;

  return (
    <>
      {error && <div className="err-inline">⚠ {error}</div>}

      {/* Semáforo del tope: lo importante de todo esto */}
      {conRhe.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="panel-h">📊 Tope de 4ta · {anio}</div>
          <p style={{ color: "var(--dim)", fontSize: 11.5, margin: "0 0 8px" }}>
            Lo que le giramos <b>nosotros</b>. Si factura por fuera, el tope real llega antes.
          </p>
          {conRhe.map(p => {
            const a = acum.get(p.id) || 0;
            const e = estado4ta(a, anio);
            const col = e.supero ? "var(--red)" : e.cerca ? "var(--yellow)" : "var(--green)";
            return (
              <div key={p.id} style={{ padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                  <Link href={`/entidad/persona/${p.id}`} style={{ fontWeight: 600 }}>{p.nombre}</Link>
                  {p.suspension_4ta_anio === anio && (
                    <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)" }}>suspensión {anio}</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={{ color: col, fontWeight: 700 }}>{money(a)}</span>
                  <span style={{ color: "var(--dim)", fontSize: 11 }}>de {money(e.tope)}</span>
                </div>
                <div style={{ height: 4, background: "var(--bg)", borderRadius: 3, marginTop: 5, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, e.pct)}%`, height: "100%", background: col }} />
                </div>
                {e.supero && (
                  <div style={{ color: "var(--red)", fontSize: 11, marginTop: 4, fontWeight: 700 }}>
                    ⚠ Superó el tope: la suspensión se rompió — corresponde retener el 8% por el resto del año.
                  </div>
                )}
                {e.cerca && (
                  <div style={{ color: "var(--yellow)", fontSize: 11, marginTop: 4 }}>
                    Al {e.pct}% del tope — le quedan {money(e.resta)} antes de que haya que retener.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <b style={{ fontSize: 12.5 }}>🧾 Recibos girados · {rhes.length}</b>
        <span style={{ flex: 1 }} />
        {!abierto && (
          <button className="btn" style={{ padding: "5px 12px", fontSize: 12 }}
            onClick={() => { setF(vacio); setAbierto(true); }}>＋ Registrar RHE</button>
        )}
      </div>

      {abierto && (
        <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent)" }}>
          <div className="f-grid">
            <div className="f-campo">
              <span>Persona *</span>
              <MiniSelect block value={f.personaId} onSelect={v => set("personaId", v)}
                options={[["", "— elegir —"], ...personas.map(p => [p.id, p.nombre])]} />
            </div>
            <div className="f-campo">
              <span>N° de recibo</span>
              <input value={f.numero} onChange={e => set("numero", e.target.value)} placeholder="E001-123" style={inp} />
            </div>
            <div className="f-campo">
              <span>Fecha *</span>
              <input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)} style={inp} />
            </div>
            <div className="f-campo">
              <span>Monto bruto (S/) *</span>
              <input value={f.monto} onChange={e => set("monto", e.target.value)} placeholder="1500" style={inp} />
            </div>
            <div className="f-campo">
              <span>Retención (S/)</span>
              <input value={f.retencion} onChange={e => set("retencion", e.target.value)} placeholder="0 si tiene suspensión" style={inp} />
            </div>
            {/* El mes que este recibo paga, en el formulario y no solo en la
                lista: se elige mientras se está registrando, que es cuando se
                sabe. Atarlo después obliga a acordarse, y lo que hay que
                acordarse no se hace — el expediente de ese mes se queda «sin
                recibo» con su recibo delante. */}
            {/* Quién lo giró materialmente. No es una etiqueta descriptiva:
                decide a quién se le reclama cuando el recibo falta, y de quién
                es la responsabilidad del tope de 4ta. En los «delegado» somos
                los únicos que podemos ver venir la ruptura de la suspensión
                —la clave SOL la tenemos nosotros—; en los «propio» lo único
                que se puede hacer es avisar. */}
            <div className="f-campo">
              <span>Quién lo giró</span>
              <MiniSelect block value={f.giradoPor} onSelect={v => set("giradoPor", v)}
                options={[["", "— sin decir —"], ...VIAS_GIRO]} />
            </div>
            <div className="f-campo">
              <span>Paga el mes de</span>
              <MiniSelect block value={f.liquidacionId} onSelect={v => set("liquidacionId", v)}
                options={[
                  ["", "— ninguno (servicio externo) —"],
                  ...(liqPorPersona.get(f.personaId) || [])
                    .filter(l => !l.cerrado_en || l.id === f.liquidacionId)
                    .map(l => [l.id, `${MES_CORTO[l.mes - 1]} ${l.anio}`] as [string, string]),
                ]} />
            </div>
            <div className="f-campo">
              <span>Proyecto</span>
              <MiniSelect block value={f.proyectoId} onSelect={v => set("proyectoId", v)}
                options={[["", "— ninguno —"], ...proyectos.map(p => [p.id, p.nombre])]} />
            </div>
            <div className="f-campo" style={{ gridColumn: "1 / -1" }}>
              <span>Concepto</span>
              <input value={f.concepto} onChange={e => set("concepto", e.target.value)}
                placeholder="Dirección de fotografía — rodaje Mujeres del Ande" style={inp} />
            </div>
            <div className="f-campo" style={{ gridColumn: "1 / -1" }}>
              <span>PDF del recibo (link Drive)</span>
              <input value={f.url} onChange={e => set("url", e.target.value)} placeholder="https://..." style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => { setAbierto(false); setF(vacio); }}>Cancelar</button>
            <button className="btn" disabled={ocupado} onClick={guardar}>
              {ocupado ? "..." : f.id ? "Actualizar" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {rhes.map(r => (
          <div className="info-row" key={r.id} style={{ gap: 9, flexWrap: "wrap" }}>
            <span style={{ color: "var(--dim)", fontSize: 11.5, minWidth: 52 }}>{fmt(r.fecha)}</span>
            <Link href={`/entidad/persona/${r.persona_id}`} style={{ fontWeight: 600, fontSize: 12.5 }}>
              {nombreDe.get(r.persona_id) || "—"}
            </Link>
            {r.numero && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c" }}>{r.numero}</span>}
            {/* ── QUÉ MES PAGA ESTE RECIBO ──
                El eslabón que faltaba entre las dos mitades del pago. Se elige
                AQUÍ, mientras se registra el recibo y se sabe de cuál era; a los
                tres meses ya nadie lo recuerda y el expediente de aquel mes se
                queda «sin recibo» para siempre con el recibo delante.
                El selector lista TODO el año de esa persona, no el mes en curso:
                un recibo de octubre puede estar pagando agosto, y limitarlo al
                mes de la pantalla haría imposible registrarlo bien justo en el
                caso donde el vínculo más importa. */}
            <select value={r.liquidacion_id || ""} disabled={ocupado}
              className="dato-btn" style={{ fontSize: 11, maxWidth: 150 }}
              title="El mes de jornadas que este recibo paga. Vacío si no viene de jornadas — un servicio externo se gira igual."
              onChange={e => enlazar(r, e.target.value)}>
              <option value="">— sin mes —</option>
              {(liqPorPersona.get(r.persona_id) || []).map(l => (
                <option key={l.id} value={l.id} disabled={!!l.cerrado_en}>
                  {MES_CORTO[l.mes - 1]} {l.anio}{l.cerrado_en ? " 🔒" : ""}
                </option>
              ))}
            </select>
            {/* Quién lo giró. Se ve en la lista y no solo en el formulario
                porque la pregunta que trae aquí suele ser «¿a quién le pido el
                recibo que falta?», y esa se contesta mirando la columna, no
                abriendo cada ficha. */}
            <span style={{ color: r.girado_por ? "var(--dim)" : "var(--yellow)", fontSize: 11 }}
              title="Quién giró el recibo en SUNAT">
              {r.girado_por ? rotuloGiro(r.girado_por) : "¿quién lo giró?"}
            </span>
            {r.proyecto_id && (
              <span style={{ color: "var(--dim)", fontSize: 11 }}>📁 {proyDe.get(r.proyecto_id)}</span>
            )}
            {r.concepto && (
              <span style={{ color: "var(--dim)", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.concepto}
              </span>
            )}
            <span style={{ flex: 1 }} />
            {Number(r.retencion) > 0 && (
              <span style={{ color: "var(--yellow)", fontSize: 11 }}>ret. {money(Number(r.retencion))}</span>
            )}
            <span style={{ color: "var(--teal)", fontWeight: 700, fontSize: 12.5 }}>{money(Number(r.monto))}</span>
            {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="dato-btn" title="Ver el PDF">🧾</a>}
            <button className="dato-btn" onClick={() => editar(r)}>✎</button>
            {borrando === r.id ? (
              <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                ¿borrar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => quitar(r)}>sí</button>
                {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(null)}>no</button>
              </span>
            ) : (
              <button style={{ color: "var(--dim)" }} onClick={() => setBorrando(r.id)}>✕</button>
            )}
          </div>
        ))}
        {!rhes.length && <div className="empty">Sin RHE registrados en {anio}.</div>}
      </div>
    </>
  );
}
