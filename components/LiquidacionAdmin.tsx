"use client";
import {
  liquidarMes, reabrirLiquidacion, cerrarExpediente, reabrirExpediente,
  registrarPagoRhe, deshacerPagoRhe,
} from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fechaHum, esFinde, ICO_TIPO, FRACCIONES } from "@/lib/jornadas";
import {
  ETAPA, QUE_FALTA, PAGO_SIN_PAPEL, MEDIOS, rotuloMedio, type ClaveEtapa, type Pago,
} from "@/lib/pagos";
import VerAdjunto from "@/components/VerAdjunto";

const money = (n: number) => `S/ ${Math.round(n || 0).toLocaleString("es-PE")}`;

/* Liquidación por persona del mes (admin): genera el recibo (solo si todo
   está aprobado) o reabre una liquidación para corregir. */
type Item = {
  id: string; fecha: string; tipo: string; noche: boolean;
  fraccion: number; monto: number; aprobada: boolean; proyecto: string | null;
};

/* Un recibo, visto desde el expediente. `pago` no es un booleano: distingue el
   respaldado por el estado de cuenta del declarado a mano, y esa diferencia se
   pinta — un verde que no dice de dónde viene su certeza los iguala. */
type Recibo = {
  id: string; numero: string | null; url: string | null; monto: number;
  pago: Pago; nota: string | null; pagadoUrl: string | null; medio: string | null;
};
type FilaLiq = {
  personaId: string; nombre: string; dias: number; pend: number; monto: number;
  estado: string | null; items?: Item[];
  etapa: ClaveEtapa; dias_parado: number | null; atascada: boolean; recibos: Recibo[];
  liquidacionId: string | null;
};

export default function LiquidacionAdmin({ anio, mes, filas }: {
  anio: number; mes: number; filas: FilaLiq[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  /* Desplegable y no un enlace a otra pantalla: liquidar es una decisión que
     se toma AQUÍ, y mandar a revisar a otro sitio hace perder el hilo de en
     cuál ibas —con seis personas, volver es acordarse. */
  const [abierto, setAbierto] = useState<string | null>(null);
  /* Qué recibo se está declarando y con qué nota. La nota es obligatoria en el
     servidor: lo que distingue una declaración legítima de un tilde para
     quitar el aviso de en medio es que diga por dónde salió el dinero. */
  const [declarando, setDeclarando] =
    useState<{ id: string; medio: string; url: string; nota: string } | null>(null);

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
    /* ── UNA TARJETA POR PERSONA, NO UNA PARA LAS TRES ──
       Cada fila de aquí es un expediente de pago independiente: su mes, su
       recibo, su comprobante, su cierre. Metidas en un solo contenedor se leían
       como partes de una misma cosa, y al desplegar el detalle de una no se
       veía dónde acababa la suya y empezaba la siguiente.
       Es además cómo se ve Jornadas, y estas dos pestañas hablan del mismo
       trabajo: quien salta de una a otra no debería tener que reaprender la
       forma de la pantalla. */
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {filas.map(f => (
        <div className="card" key={f.personaId} style={{ padding: "9px 12px" }}>
        <div className="info-row" style={{ gap: 10, flexWrap: "wrap", borderBottom: "none", padding: 0 }}>
          <button className="dato-btn" style={{ minWidth: 26 }}
            title={abierto === f.personaId ? "Ocultar el detalle" : "Ver los días que componen este monto"}
            onClick={() => {
              /* Al plegar se descarta la nota a medio escribir. Si sobreviviera,
                 reaparecería más tarde sobre datos ya refrescados y se
                 guardaría una explicación que no corresponde a lo que hay
                 delante. */
              setDeclarando(null);
              setAbierto(a => a === f.personaId ? null : f.personaId);
            }}>
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
          {/* ── DÓNDE ESTÁ ESTE PAGO ──
              El sello no se avanza a mano: lo calcula lib/pagos.ts de los
              hechos —hay recibo, tiene PDF, salió el dinero—, así que no puede
              decir verde con el dinero dentro. El `title` dice qué falta como
              instrucción y no como diagnóstico: a las nueve de un viernes,
              «sin comprobante» describe y «sube el PDF y pega el link» sirve. */}
          {f.estado === "liquidado" && (
            <span className="badge" style={{
              fontSize: 10.5, background: "#1c1c2c", color: ETAPA[f.etapa].col,
              cursor: "help",
            }} title={QUE_FALTA[f.etapa]}>
              {ETAPA[f.etapa].ico} {ETAPA[f.etapa].txt}
            </span>
          )}
          {/* El tiempo parado, y solo cuando ya es raro. Es el sustituto del
              «🟡 emitido» que no se puede saber: si el recibo se giró en SUNAT
              y nadie lo registró aquí, no hay fila que consultar — pero sí hay
              un mes liquidado que lleva doce días sin recibo, y eso se puede
              contar solo. Un aviso que se mantiene solo vale más que una
              bandera que hay que acordarse de mover. */}
          {f.atascada && (
            <span style={{ color: "var(--yellow)", fontSize: 11 }}
              title="Liquidado hace tiempo y todavía sin terminar.">
              ⏳ {f.dias_parado} d parado
            </span>
          )}
          <span style={{ flex: 1 }} />
          {f.etapa === "cerrado" ? (
            <button className="dato-btn" disabled={ocupado === f.personaId}
              title="Quitar el sello para volver a tocarlo"
              onClick={() => act(f.personaId, () => reabrirExpediente(f.personaId, anio, mes))}>🔓 reabrir</button>
          ) : f.etapa === "completo" ? (
            /* Cerrar solo aparece cuando está completo, pero no se pulsa solo
               al estarlo: «completo» dice que no falta nada, «cerrado» dice que
               además alguien revisó que estuviera bien. Un expediente puede
               estar completo con el monto equivocado. */
            <button className="btn" style={{ padding: "4px 11px", fontSize: 11.5 }}
              disabled={ocupado === f.personaId}
              title="Revisado y terminado: no hay que volver"
              onClick={() => act(f.personaId, () => cerrarExpediente(f.personaId, anio, mes))}>🔒 Cerrar</button>
          ) : f.estado === "liquidado" ? (
            /* Reabrir el MES (borra la liquidación) solo si no hay recibos
               colgando: con recibos, el servidor lo rechaza siempre, y un botón
               que garantiza un error es peor que no tenerlo — enseña que los
               botones de esta pantalla no son de fiar. Se deja visible y
               apagado, no escondido: que falte sin explicación haría buscar la
               forma de reabrir en otro sitio. */
            <button className="dato-btn"
              disabled={ocupado === f.personaId || f.recibos.length > 0}
              title={f.recibos.length > 0
                ? `Hay ${f.recibos.length} recibo(s) enlazados a este mes. Desenlázalos desde 🧾 RHE antes de reabrirlo.`
                : "Borra la liquidación y devuelve el mes a edición"}
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

          /* Cuántos días de cada tamaño. «21.5 jornadas» no dice si fueron
             veintiún días completos y uno medio o catorce dobles: son cosas
             distintas para quien revisa, y el total las esconde por igual.
             Se ordena por la escalera de lib/jornadas; un valor que no esté en
             ella (dato viejo, o metido por fuera) se muestra igual al final en
             vez de desaparecer del recuento. */
          const porFrac = new Map<number, number>();
          (f.items || []).forEach(j => porFrac.set(j.fraccion, (porFrac.get(j.fraccion) || 0) + 1));
          const escalera = FRACCIONES.map(x => x.v);
          const conteo = [...porFrac.entries()].sort((a, b) => {
            const ia = escalera.indexOf(a[0]), ib = escalera.indexOf(b[0]);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0] - b[0];
          });
          const etq = (v: number) => FRACCIONES.find(x => x.v === v)?.corto || `${v}`;
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
              {/* ── LOS RECIBOS DE ESTE MES ──
                  Aquí y no en otra pestaña: el sello de arriba dice que falta
                  algo y esto dice EN CUÁL de los recibos. Con dos recibos por
                  un mes —un adelanto y un saldo— «sin comprobante» sin decir de
                  cuál obliga a abrir el panel de RHE y compararlos a ojo. */}
              {f.estado === "liquidado" && (() => {
                /* Cerrado = ya no se toca. Se calcula una vez para toda la
                   lista de recibos en vez de preguntarlo en cada botón. */
                const sellado = f.etapa === "cerrado";
                return (
                <div className="liq-pie" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {f.recibos.length === 0 ? (
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ color: "var(--muted)", flex: 1, minWidth: 240 }}>{QUE_FALTA[f.etapa]}</span>
                      {/* La puerta, y no solo la instrucción. Decir «regístralo
                          enlazado a este mes» sin dar por dónde obliga a cambiar
                          de pestaña, encontrar a la persona, escribir el monto
                          de memoria y acordarse de elegir el mes en un
                          desplegable — cuatro ocasiones de equivocarse para un
                          dato que esta pantalla ya tiene entero.
                          El enlace lleva los tres: quién, cuánto y qué mes. */}
                      {!sellado && f.liquidacionId && (
                        <a className="btn" style={{ padding: "4px 11px", fontSize: 11.5, textDecoration: "none" }}
                          href={`/admin?s=rhe&rhe_de=${f.personaId}&rhe_liq=${f.liquidacionId}&rhe_monto=${Math.round(f.monto)}`}>
                          ＋ registrar el recibo
                        </a>
                      )}
                    </div>
                  ) : f.recibos.map(r => (
                    <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600 }}>🧾 {r.numero || "sin número"}</span>
                      <span style={{ color: "var(--teal)", fontWeight: 700 }}>{money(r.monto)}</span>
                      {r.url ? (
                        <VerAdjunto url={r.url} titulo="Ver el recibo">📎 recibo</VerAdjunto>
                      ) : (
                        <span style={{ color: "var(--yellow)" }}>📎 sin comprobante</span>
                      )}
                      {r.pago ? (
                        <>
                          <span style={{ color: "var(--green)" }} title={r.nota || undefined}>
                            🟢 {rotuloMedio(r.medio)}
                          </span>
                          {/* El comprobante ES la prueba, así que se enlaza —
                              un «pagado» que no se puede abrir no sirve para
                              rendir. Y cuando falta se dice: dentro de un año
                              ese pago no lo va a poder comprobar nadie. */}
                          {r.pagadoUrl ? (
                            <VerAdjunto url={r.pagadoUrl} titulo="Ver el comprobante del pago">🧾 voucher</VerAdjunto>
                          ) : r.pago === "sin_papel" ? (
                            <i style={{ fontStyle: "normal", color: "var(--yellow)" }}>{PAGO_SIN_PAPEL}</i>
                          ) : null}
                          {/* Cerrado significa cerrado también aquí. Si se le
                              pudiera deshacer el pago sin quitar el sello, el
                              🔒 no afirmaría nada: describiría un momento que
                              ya pasó. El servidor lo rechaza igual; esto evita
                              ofrecerlo. */}
                          {!sellado && (
                            <button className="dato-btn" disabled={ocupado === f.personaId}
                              title="Deshacer el registro del pago"
                              onClick={() => act(f.personaId, () => deshacerPagoRhe(r.id))}>✕</button>
                          )}
                        </>
                      ) : declarando?.id === r.id ? (
                        <>
                          <select value={declarando.medio} className="dato-btn" style={{ fontSize: 11.5 }}
                            onChange={e => setDeclarando({ ...declarando, medio: e.target.value })}>
                            {MEDIOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                          </select>
                          <input autoFocus value={declarando.url}
                            onChange={e => setDeclarando({ ...declarando, url: e.target.value })}
                            placeholder="link del voucher / captura"
                            style={{ background: "var(--card)", border: "1px solid var(--border)",
                              borderRadius: 6, padding: "3px 8px", fontSize: 11.5, outline: "none", width: 210 }} />
                          <input value={declarando.nota}
                            onChange={e => setDeclarando({ ...declarando, nota: e.target.value })}
                            placeholder={declarando.url ? "nota (opcional)" : "sin voucher: di por dónde salió"}
                            style={{ background: "var(--card)", border: "1px solid var(--border)",
                              borderRadius: 6, padding: "3px 8px", fontSize: 11.5, outline: "none", width: 190 }} />
                          <button className="dato-btn" disabled={ocupado === f.personaId}
                            onClick={() => act(f.personaId, async () => {
                              const r2: any = await registrarPagoRhe(
                                r.id, declarando.medio, declarando.url, declarando.nota);
                              if (!r2?.error) setDeclarando(null);
                              return r2;
                            })}>guardar</button>
                          <button className="dato-btn" onClick={() => setDeclarando(null)}>cancelar</button>
                        </>
                      ) : (
                        <>
                          <span style={{ color: "var(--muted)" }}>→ falta registrar el pago</span>
                          {!sellado && (
                            <button className="dato-btn" disabled={ocupado === f.personaId}
                              title="Cómo salió el dinero y su comprobante"
                              onClick={() => setDeclarando({ id: r.id, medio: "transferencia", url: "", nota: "" })}>
                              registrar pago
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                );
              })()}

              <div className="liq-pie">
                {conteo.length > 0 && (
                  <div className="liq-frac">
                    {conteo.map(([v, n]) => (
                      <span key={v} title={`${n} registro(s) de ${etq(v)} jornada`}>
                        <b>{n}</b> × {etq(v)}j
                      </span>
                    ))}
                  </div>
                )}
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
