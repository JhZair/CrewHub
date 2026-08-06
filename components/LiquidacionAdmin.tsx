"use client";
import { liquidarMes, reabrirLiquidacion } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fechaHum, esFinde, ICO_TIPO } from "@/lib/jornadas";

const money = (n: number) => `S/ ${Math.round(n || 0).toLocaleString("es-PE")}`;

/* Liquidación por persona del mes (admin): genera el recibo (solo si todo
   está aprobado) o reabre una liquidación para corregir. */
type Item = {
  id: string; fecha: string; tipo: string; noche: boolean;
  fraccion: number; monto: number; aprobada: boolean; proyecto: string | null;
};

export default function LiquidacionAdmin({ anio, mes, filas }: {
  anio: number; mes: number;
  filas: { personaId: string; nombre: string; dias: number; pend: number; monto: number; estado: string | null; items?: Item[] }[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  /* Desplegable y no un enlace a otra pantalla: liquidar es una decisión que
     se toma AQUÍ, y mandar a revisar a otro sitio hace perder el hilo de en
     cuál ibas —con seis personas, volver es acordarse. */
  const [abierto, setAbierto] = useState<string | null>(null);

  /* TODOS los días del mes, no solo los registrados.
   *
   * Con solo los trabajados, un mes con nueve registros se lee como nueve días
   * de trabajo — y no se distingue «no trabajó el 5» de «trabajó y no lo
   * registró». El hueco es justo lo que hay que mirar antes de congelar el
   * mes: después de liquidar, agregar una jornada olvidada obliga a reabrir.
   *
   * En el mes en curso se corta en HOY: pintar en cero los días que todavía no
   * han llegado sería contarlos como no trabajados. */
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const ultimo = new Date(anio, mes, 0).getDate();          // `mes` viene 1-12
  const esMesEnCurso = hoy.getFullYear() === anio && hoy.getMonth() + 1 === mes;
  const hastaDia = esMesEnCurso ? hoy.getDate() : (new Date(anio, mes - 1, 1) > hoy ? 0 : ultimo);
  const diasMes = Array.from({ length: hastaDia }, (_, i) =>
    `${anio}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
  const act = async (pid: string, fn: () => Promise<any>) => {
    setOcupado(pid); const r: any = await fn(); setOcupado(null);
    if (r?.error) alert(r.error); else router.refresh();
  };
  return (
    <div className="card">
      {filas.map(f => (
        <div key={f.personaId}>
        <div className="info-row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button className="dato-btn" style={{ minWidth: 26 }}
            title={abierto === f.personaId ? "Ocultar el detalle" : "Ver los días que componen este monto"}
            onClick={() => setAbierto(a => a === f.personaId ? null : f.personaId)}>
            {abierto === f.personaId ? "▾" : "▸"}
          </button>
          <span style={{ fontWeight: 600, fontSize: 12.5, minWidth: 120 }}>{f.nombre}</span>
          <span style={{ fontSize: 12 }}>{f.dias} jornadas</span>
          <span style={{ color: "var(--teal)", fontSize: 12, fontWeight: 700 }}>{money(f.monto)}</span>
          {f.pend > 0 && <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)", fontSize: 10.5 }}>⏳ {f.pend} por aprobar</span>}
          <span className="badge" style={{
            fontSize: 10.5, background: "#1c1c2c",
            color: f.estado === "liquidado" ? "var(--green)" : f.estado === "confirmado" ? "var(--blue)" : "var(--dim)",
          }}>
            {f.estado === "liquidado" ? "🧾 liquidado" : f.estado === "confirmado" ? "✓ confirmó" : "— abierto"}
          </span>
          <span style={{ flex: 1 }} />
          {f.estado === "liquidado" ? (
            <button className="dato-btn" disabled={ocupado === f.personaId}
              onClick={() => act(f.personaId, () => reabrirLiquidacion(f.personaId, anio, mes))}>↩ reabrir</button>
          ) : (
            <button className="btn" style={{ padding: "4px 11px", fontSize: 11.5, opacity: f.pend > 0 ? 0.5 : 1 }}
              disabled={f.pend > 0 || ocupado === f.personaId}
              title={f.pend > 0 ? "Aprueba todas las jornadas antes de liquidar" : "Generar el recibo"}
              onClick={() => act(f.personaId, () => liquidarMes(f.personaId, anio, mes))}>🧾 Liquidar</button>
          )}
        </div>

        {abierto === f.personaId && (() => {
          const porDia = new Map<string, Item[]>();
          (f.items || []).forEach(j => porDia.set(j.fecha, [...(porDia.get(j.fecha) || []), j]));
          /* Ascendente: con el mes completo delante, 1→31 se lee como un
             calendario. La bitácora sigue al revés porque ahí lo último es lo
             que interesa; aquí lo que interesa es el mes entero. */
          const vacios = diasMes.filter(d => !porDia.has(d)).length;
          return (
            <div className="liq-det">
              {diasMes.length === 0 && (
                <div style={{ color: "var(--dim)", fontSize: 12 }}>Ese mes todavía no ha empezado.</div>
              )}
              {diasMes.map(d => {
                const js = porDia.get(d);
                if (!js) {
                  return (
                    <div key={d} className="liq-dia vacio">
                      <span className={`jr-fecha${esFinde(d) ? " finde" : ""}`}>{fechaHum(d)}</span>
                      <span className="liq-proy">—</span>
                      <span style={{ fontWeight: 700 }}>0j</span>
                    </div>
                  );
                }
                return js.map(j => (
                  <div key={j.id} className={`liq-dia${j.aprobada ? "" : " pend"}`}>
                    <span className={`jr-fecha${esFinde(j.fecha) ? " finde" : ""}`}>{fechaHum(j.fecha)}</span>
                    <span title={j.tipo}>{ICO_TIPO[j.tipo] || "•"}</span>
                    {/* Sin proyecto se DICE, no se deja en blanco: al liquidar
                        es la última oportunidad de saber a qué se imputa. */}
                    <span className="liq-proy">{j.proyecto || <i style={{ color: "var(--yellow)", fontStyle: "normal" }}>sin proyecto</i>}</span>
                    {j.noche && <span title="Pernocte">🏕</span>}
                    <span style={{ color: "var(--blue)", fontWeight: 700 }}>{j.fraccion}j</span>
                    <span style={{ color: "var(--teal)", fontWeight: 700 }}>{money(j.monto)}</span>
                    {/* Lo NO aprobado no entra en el monto que se liquida.
                        Verlo explica por qué el total no cuadra con la suma de
                        la lista — si no, parece un error de cálculo. */}
                    {!j.aprobada && <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)", fontSize: 10 }}>⏳ no entra</span>}
                  </div>
                ));
              })}
              <div className="liq-pie">
                {f.items?.length || 0} registro(s) · {f.dias} jornadas ·
                {" "}<b style={{ color: "var(--teal)" }}>{money(f.monto)}</b> aprobado
                {f.pend > 0 && <> · <b style={{ color: "var(--yellow)" }}>{f.pend} sin aprobar</b> quedan fuera del recibo</>}
                {/* El hueco es el dato: un día en cero puede ser descanso o un
                    olvido, y después de liquidar corregirlo obliga a reabrir. */}
                {vacios > 0 && <> · <b>{vacios} día(s) sin registrar</b> — descanso u olvido</>}
              </div>
            </div>
          );
        })()}
        </div>
      ))}
      {!filas.length && <div className="empty">Sin jornadas este mes.</div>}
    </div>
  );
}
