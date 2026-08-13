"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarGastoDj, borrarGastoDj, fijarTopeDj } from "@/app/actions";
import { useConfirmar, useAviso } from "@/components/useConfirmar";
import { money, rangoFechas, trayecto, type SaldoDJ } from "@/lib/dj";
import { hoyLima } from "@/lib/fechas";
import CampoAdjunto from "@/components/CampoAdjunto";
import VerAdjunto from "@/components/VerAdjunto";

/* ── EL SALDO DE DECLARACIONES JURADAS ──
 *
 * La pantalla más consecuente del módulo de fondos, y no por el dinero que
 * mueve sino por lo que cuesta equivocarla: si los gastos declarados pasan el
 * tope, el contrato obliga a devolver el exceso (acta, cláusula 6.9) — plata
 * que ya se pagó en efectivo, en comunidad, y no se recupera.
 *
 * Por eso el número grande es LO QUE QUEDA y no lo que se gastó. Son el mismo
 * dato al revés y no sirven igual: el que hace falta llevarse a la puna es el
 * que queda. Todo lo demás de este bloque está subordinado a que ese número se
 * lea de un vistazo.
 */

type Gasto = {
  id: string; descripcion: string; importe: number;
  fecha: string; fecha_hasta: string | null;
  lugar_origen: string | null; lugar_destino: string | null;
  etapa: string | null; rubro_item: string | null;
  dj_numero: string | null; dj_url: string | null;
};
type Opcion = { id: string; nombre: string };

export default function SaldoDj({
  postulacionId, saldo, gastos, etapas, rubros, esAdmin, error,
}: {
  postulacionId: string; saldo: SaldoDJ; gastos: Gasto[];
  etapas: Opcion[]; rubros: { id: string; etiqueta: string }[];
  esAdmin: boolean; error?: string | null;
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [tope, setTope] = useState("");
  const [editTope, setEditTope] = useState(false);

  const vacio = {
    id: null as string | null, descripcion: "", importe: "",
    fecha: hoyLima(), fechaHasta: "", lugarOrigen: "", lugarDestino: "",
    etapa: "", rubroItem: "", djNumero: "", djUrl: "",
  };
  const [f, setF] = useState(vacio);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  const guardar = async () => {
    if (ocupado) return;
    avisar(""); setOcupado(true);
    const r: any = await guardarGastoDj({ ...f, postulacionId });
    setOcupado(false);
    if (r?.error) { avisar(r.error); return; }
    setF(vacio); setAbierto(false); router.refresh();
  };

  const quitar = async (g: Gasto) => {
    if (!(await pedir(
      <>Se quitará <b>{g.descripcion}</b> por {money(g.importe)}. El saldo de DJ vuelve a subir.</>,
      { titulo: "Borrar gasto declarado", aceptar: "Borrar", peligro: true }))) return;
    avisar(""); setOcupado(true);
    const r: any = await borrarGastoDj(g.id, postulacionId);
    setOcupado(false);
    if (r?.error) avisar(r.error); else router.refresh();
  };

  const guardarTope = async () => {
    avisar(""); setOcupado(true);
    const r: any = await fijarTopeDj(postulacionId, tope);
    setOcupado(false);
    if (r?.error) { avisar(r.error); return; }
    setEditTope(false); router.refresh();
  };

  const inp = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 9px", fontSize: 12.5, color: "var(--text)", outline: "none",
  } as const;

  /* El color del saldo. Verde no es «vas bien» sino «todavía puedes decidir»;
     el ámbar entra al 80% porque a esa altura aún se puede cambiar quién sube o
     pedirle factura a un proveedor formal, y el rojo ya no es un aviso: es una
     cantidad que habrá que devolver. */
  const col = saldo.supero ? "var(--red)" : saldo.cerca ? "var(--yellow)" : "var(--green)";

  return (
    <>
      {dialogo}{aviso}

      {error ? (
        /* Con la lectura caída NO se enseña ningún saldo. Con la lista vacía el
           cálculo diría «te queda el tope entero», que es exactamente la
           conclusión que hace gastar de más en el único número cuyo exceso
           obliga a devolver plata. */
        <div className="empty" style={{ color: "var(--yellow)" }}>
          {/does not exist|42P01|42703/.test(error)
            ? "Falta correr db/declaraciones-juradas.sql en Supabase."
            : `No se pudieron leer los gastos declarados: ${error}`}
        </div>
      ) : saldo.falta === "estimulo" ? (
        /* Faltaba el MONTO, no el porcentaje. Antes las dos causas daban el
           mismo mensaje y la pantalla ofrecía cargar un % que ya estaba: se
           guardaba, el aviso seguía ahí, y no había salida ni pista. */
        <div className="empty" style={{ color: "var(--yellow)", textAlign: "left" }}>
          <b>Falta el monto adjudicado de este fondo.</b> El tope de DJ es un porcentaje
          del estímulo ({saldo.pct}% según {saldo.fuente === "acta" ? "el acta" : "las bases"}),
          así que sin saber cuánto se ganó no hay saldo que calcular. Cárgalo en la ficha
          de la postulación.
        </div>
      ) : saldo.tope === null ? (
        /* ── SIN TOPE NO SE INVENTA UN NÚMERO ──
           La tentación es asumir el 10% general. Quedarse corto frena rodaje
           que sí se podía hacer; pasarse termina en devolver plata. Un hueco
           reconocido se arregla en dos minutos; un número inventado no se
           descubre hasta que ya no tiene arreglo. */
        <div className="empty" style={{ color: "var(--yellow)", textAlign: "left" }}>
          <b>Falta el tope de DJ de este fondo.</b> Sin él no se puede decir cuánto queda,
          y este es el número que evita tener que devolver plata: DAFO topea lo que se
          rinde con declaración jurada a un % del estímulo (10% general, 25% en cine
          indígena) y el que manda es el que diga tu acta.
          {esAdmin && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 9 }}>
              <input value={tope} onChange={e => setTope(e.target.value)}
                placeholder="10" inputMode="decimal" style={{ ...inp, width: 70 }} />
              <span style={{ color: "var(--dim)", fontSize: 12 }}>% — lo que dice el acta</span>
              <button className="btn" disabled={ocupado || !tope.trim()}
                style={{ fontSize: 12, padding: "5px 11px" }} onClick={guardarTope}>Guardar</button>
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ borderColor: saldo.supero ? "rgba(231,76,60,.45)" : undefined }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, color: "var(--dim)" }}>
                {saldo.supero ? "Exceso a devolver" : "Te queda en DJ"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: col, lineHeight: 1.15 }}>
                {money(saldo.supero ? saldo.exceso : (saldo.resta ?? 0))}
              </div>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12.5 }}>
              usado {money(saldo.usado)} de {money(saldo.tope)}
              <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 2 }}>
                tope {saldo.pct}% del estímulo · según {saldo.fuente === "acta" ? "el acta de este fondo" : "las bases del concurso"}
                {esAdmin && (
                  <button className="dato-btn" style={{ marginLeft: 6, fontSize: 11 }}
                    onClick={() => { setTope(String(saldo.pct ?? "")); setEditTope(v => !v); }}>✎</button>
                )}
              </div>
            </div>
            <span style={{ flex: 1 }} />
            {esAdmin && !abierto && (
              <button className="btn btn-ghost" style={{ fontSize: 12 }}
                onClick={() => setAbierto(true)}>＋ Registrar gasto con DJ</button>
            )}
          </div>

          <div style={{ height: 6, background: "var(--bg)", borderRadius: 4, marginTop: 9, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, saldo.pctUsado ?? 0)}%`, height: "100%", background: col }} />
          </div>

          {saldo.supero && (
            /* No se dice «superaste el tope» a secas. Lo que hay que entender es
               la consecuencia, y está en el contrato: esa plata se devuelve. */
            <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8, fontWeight: 600 }}>
              ⚠ Pasaste el tope en {money(saldo.exceso)}. Esa parte no se puede acreditar con DJ:
              el contrato obliga a devolverla (cláusula 6.9). Busca comprobante formal para
              esos gastos o reasígnalos antes de rendir.
            </div>
          )}
          {saldo.cerca && (
            <div style={{ color: "var(--yellow)", fontSize: 12, marginTop: 8 }}>
              Al {saldo.pctUsado}% del tope. Quedan {money(saldo.resta ?? 0)} — decídelo antes de la próxima salida,
              no después.
            </div>
          )}

          {editTope && esAdmin && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 9 }}>
              <input value={tope} onChange={e => setTope(e.target.value)}
                placeholder="10" inputMode="decimal" style={{ ...inp, width: 70 }} />
              <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                % según el acta — déjalo vacío para volver al de las bases
              </span>
              <button className="btn" disabled={ocupado} style={{ fontSize: 12, padding: "5px 11px" }}
                onClick={guardarTope}>Guardar</button>
              <button className="btn btn-ghost" style={{ fontSize: 12 }}
                onClick={() => setEditTope(false)}>Cancelar</button>
            </div>
          )}

          {abierto && esAdmin && (
            <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 9 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <input value={f.descripcion} onChange={e => set("descripcion", e.target.value)}
                  placeholder="Qué se pagó" style={{ ...inp, flex: 1, minWidth: 200 }} />
                <input value={f.importe} onChange={e => set("importe", e.target.value)}
                  placeholder="Importe S/" inputMode="decimal" style={{ ...inp, width: 110 }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                {/* Dos fechas y no una: una semana de rodaje es UNA fila del
                    cuaderno, y una DJ solo admite nueve. Partirla en siete
                    llenaría el documento con un solo viaje. */}
                <input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)}
                  title="Del día…" style={{ ...inp, width: 145 }} />
                <input type="date" value={f.fechaHasta} onChange={e => set("fechaHasta", e.target.value)}
                  title="…al día (déjalo vacío si fue un solo día)" style={{ ...inp, width: 145 }} />
                <input value={f.lugarOrigen} onChange={e => set("lugarOrigen", e.target.value)}
                  placeholder="Origen" style={{ ...inp, width: 130 }} />
                <input value={f.lugarDestino} onChange={e => set("lugarDestino", e.target.value)}
                  placeholder="Destino" style={{ ...inp, width: 130 }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                <select value={f.etapa} onChange={e => set("etapa", e.target.value)} style={{ ...inp, width: 175 }}>
                  <option value="">Etapa…</option>
                  {etapas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
                <select value={f.rubroItem} onChange={e => set("rubroItem", e.target.value)} style={{ ...inp, width: 175 }}>
                  <option value="">Rubro…</option>
                  {rubros.map(r => <option key={r.id} value={r.id}>{r.etiqueta}</option>)}
                </select>
                <input value={f.djNumero} onChange={e => set("djNumero", e.target.value)}
                  placeholder="Nº de DJ" title="La DJ donde va esta fila (admite 9)" style={{ ...inp, width: 100 }} />
                {/* La DJ firmada se escanea o se fotografía. Mismo campo que en
                    la caja: pegar, arrastrar o escribir el enlace si ya vive en
                    Drive. */}
                <CampoAdjunto valor={f.djUrl} onCambio={v => set("djUrl", v)}
                  placeholder="DJ firmada: pega la foto o el enlace" />
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button className="btn" disabled={ocupado} style={{ fontSize: 12, padding: "6px 14px" }}
                  onClick={guardar}>{ocupado ? "…" : "Guardar"}</button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => { setAbierto(false); setF(vacio); }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {gastos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          {gastos.map(g => (
            <div key={g.id} className="info-row" style={{ gap: 9, flexWrap: "wrap", fontSize: 12.5 }}>
              <span style={{ color: "var(--dim)", fontSize: 11.5, minWidth: 96 }}>
                {rangoFechas(g.fecha, g.fecha_hasta)}
              </span>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 180 }}>{g.descripcion}</span>
              <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                {trayecto(g.lugar_origen, g.lugar_destino)}
              </span>
              {g.dj_numero && (
                g.dj_url
                  ? <VerAdjunto url={g.dj_url} titulo="Ver la DJ firmada">📄 DJ {g.dj_numero}</VerAdjunto>
                  : <span style={{ color: "var(--yellow)", fontSize: 11.5 }}>DJ {g.dj_numero} · sin firmar</span>
              )}
              {!g.dj_numero && (
                /* Un gasto sin DJ asignada consume el tope igual, pero todavía
                   no se puede presentar. Es trabajo pendiente, no un error. */
                <span style={{ color: "var(--muted)", fontSize: 11.5 }}>→ sin DJ asignada</span>
              )}
              <span style={{ color: "var(--teal)", fontWeight: 700 }}>{money(g.importe)}</span>
              {esAdmin && (
                <button onClick={() => quitar(g)} disabled={ocupado} title="Borrar"
                  style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12 }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
