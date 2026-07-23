"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarMovimiento, borrarMovimiento } from "@/app/actions";
import { useConfirmar, useAviso } from "@/components/useConfirmar";

/* ── El libro del banco, línea a línea ──
 *
 * El saldo mensual escondía cuánto era comisión y cuánto gasto real. Aquí
 * cada movimiento lleva su categoría, así el banco se suma solo y un retiro
 * grande se distingue de un cobro de mantenimiento. Solo administración
 * escribe; los datos suelen entrar por carga (SQL), y a mano para correcciones.
 */

type Mov = {
  id: string; fecha: string; glosa: string; medio: string | null;
  tipo: "abono" | "cargo"; monto: number; saldo: number | null;
  categoria: string; nota: string | null;
};

const soles = (n: number | null | undefined) =>
  "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}` : "";
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesNombre = (key: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(key || "");
  return m ? `${MESES[+m[2] - 1]} ${m[1]}` : key;
};

const CAT: Record<string, { ico: string; txt: string; col: string }> = {
  desembolso: { ico: "💵", txt: "desembolso", col: "var(--green)" },
  retiro:     { ico: "📤", txt: "retiro",     col: "var(--teal)" },
  comision:   { ico: "🏦", txt: "comisión",   col: "var(--dim)" },
  interes:    { ico: "％", txt: "interés",    col: "var(--yellow)" },
  otro:       { ico: "•",  txt: "otro",       col: "var(--dim)" },
};

export default function MovimientosBanco({ postulacionId, esAdmin, movimientos }: {
  postulacionId: string; esAdmin: boolean; movimientos: Mov[];
}) {
  const router = useRouter();
  const { pedir, dialogo } = useConfirmar();
  const { avisar, aviso } = useAviso();
  const [abrirAlta, setAbrirAlta] = useState(false);
  const [filtro, setFiltro] = useState<string>("todos");

  const suma = (cat: string, ms: Mov[] = movimientos) => ms.filter(m => m.categoria === cat).reduce((s, m) => s + Number(m.monto || 0), 0);
  const desembolso = suma("desembolso");
  const retiros = suma("retiro");
  const comisiones = suma("comision");
  const interes = suma("interes");
  // El saldo actual es el del último movimiento (ya vienen ordenados por fecha asc).
  const saldoActual = movimientos.length ? movimientos[movimientos.length - 1].saldo : null;

  // Filtro por categoría + agrupación por mes.
  const catOrden = ["desembolso", "retiro", "comision", "interes", "otro"];
  const presentes = catOrden.filter(c => movimientos.some(m => m.categoria === c));
  const vis = filtro === "todos" ? movimientos : movimientos.filter(m => m.categoria === filtro);
  const grupos: { key: string; items: Mov[] }[] = [];
  for (const m of vis) {
    const key = (m.fecha || "").slice(0, 7);
    let g = grupos.find(x => x.key === key);
    if (!g) { g = { key, items: [] }; grupos.push(g); }
    g.items.push(m);
  }

  // Una fila de movimiento (reutilizada dentro de cada mes).
  const fila = (m: Mov) => {
    const c = CAT[m.categoria] || CAT.otro;
    const abono = m.tipo === "abono";
    return (
      <div className={`mov-fila${esAdmin ? " has-del" : ""}`} key={m.id}>
        <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{dmy(m.fecha)}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontSize: 12.5 }}>{m.glosa}</span>
          <span className="mov-chip" style={{ color: c.col }}> {c.ico} {c.txt}</span>
        </span>
        <span style={{ textAlign: "right", fontWeight: 600, fontSize: 12.5, color: abono ? "var(--green)" : "var(--text)" }}>
          {abono ? "+" : "−"}{soles(m.monto).replace("S/ ", "")}
        </span>
        <span style={{ textAlign: "right", fontSize: 12, color: Number(m.saldo) < 0 ? "var(--red)" : "var(--dim)" }}>
          {m.saldo == null ? "" : soles(m.saldo).replace("S/ ", "")}
        </span>
        {esAdmin && (
          <button onClick={async () => {
            if (!(await pedir(`¿Borrar «${m.glosa}» del ${dmy(m.fecha)}?`, { peligro: true, aceptar: "Borrar" }))) return;
            const r: any = await borrarMovimiento(m.id, postulacionId);
            if (r?.error) avisar(r.error); else router.refresh();
          }} title="Borrar"
            style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 11 }}>✕</button>
        )}
      </div>
    );
  };

  return (
    <div>
      {dialogo}
      {aviso}
      {/* Resumen: la respuesta de un vistazo a «¿en qué se fue la plata?» */}
      <div className="mov-resumen">
        <Tot k="Desembolso" v={soles(desembolso)} col="var(--green)" />
        <Tot k="Retiros a gastos" v={soles(retiros)} col="var(--teal)" />
        <Tot k="Comisiones banco" v={soles(comisiones)} col="var(--yellow)" />
        {interes > 0 && <Tot k="Interés" v={soles(interes)} col="var(--dim)" />}
        <Tot k="Saldo actual" v={soles(saldoActual)} col={Number(saldoActual) < 0 ? "var(--red)" : "var(--text)"} />
      </div>

      {/* Filtros por categoría: el mismo lenguaje del resumen, para acotar la lista. */}
      {movimientos.length > 0 && (
        <div className="mov-filtros">
          <button className={`mov-chipf${filtro === "todos" ? " on" : ""}`} onClick={() => setFiltro("todos")}>
            Todos · {movimientos.length}
          </button>
          {presentes.map(c => {
            const info = CAT[c]; const n = movimientos.filter(m => m.categoria === c).length;
            return (
              <button key={c} className={`mov-chipf${filtro === c ? " on" : ""}`}
                onClick={() => setFiltro(filtro === c ? "todos" : c)}
                style={filtro === c ? undefined : { color: info.col }}>
                {info.ico} {info.txt} · {n}
              </button>
            );
          })}
        </div>
      )}

      {movimientos.length === 0 ? (
        <div className="empty" style={{ marginTop: 8 }}>Sin movimientos cargados.</div>
      ) : (
        <div className="mov-tabla">
          <div className={`mov-cab${esAdmin ? " has-del" : ""}`}>
            <span>Fecha</span><span>Movimiento</span><span style={{ textAlign: "right" }}>Monto</span><span style={{ textAlign: "right" }}>Saldo</span>{esAdmin && <span />}
          </div>
          {grupos.map(g => {
            const ret = suma("retiro", g.items);
            const com = suma("comision", g.items);
            return (
              <div key={g.key}>
                <div className="mov-mes">
                  <span>{mesNombre(g.key)}</span>
                  <span className="mov-mes-sub">
                    {g.items.length} mov
                    {ret > 0 ? ` · retiros ${soles(ret)}` : ""}
                    {com > 0 ? ` · comisión ${soles(com)}` : ""}
                  </span>
                </div>
                {g.items.map(fila)}
              </div>
            );
          })}
          {vis.length === 0 && (
            <div className="empty" style={{ padding: "10px" }}>Nada en este filtro.</div>
          )}
        </div>
      )}

      {esAdmin && (abrirAlta
        ? <FormMov postulacionId={postulacionId} onListo={() => setAbrirAlta(false)} />
        : <button className="btn btn-ghost" onClick={() => setAbrirAlta(true)}
            style={{ fontSize: 12, padding: "6px 12px", marginTop: 8 }}>＋ Movimiento a mano</button>
      )}
    </div>
  );
}

function Tot({ k, v, col }: { k: string; v: string; col: string }) {
  return (
    <div className="mov-tot">
      <span className="mov-tot-k">{k}</span>
      <span className="mov-tot-v" style={{ color: col }}>{v}</span>
    </div>
  );
}

function FormMov({ postulacionId, onListo }: { postulacionId: string; onListo: () => void }) {
  const router = useRouter();
  const [fecha, setFecha] = useState("");
  const [glosa, setGlosa] = useState("");
  const [medio, setMedio] = useState("");
  const [tipo, setTipo] = useState("cargo");
  const [monto, setMonto] = useState("");
  const [saldo, setSaldo] = useState("");
  const [categoria, setCategoria] = useState("retiro");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const enviar = async () => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const r: any = await guardarMovimiento({ postulacionId, fecha, glosa, medio, tipo, monto, saldo, categoria, nota: "" });
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    onListo(); router.refresh();
  };

  const inp = (w: number): React.CSSProperties => ({
    width: w, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 10px", fontSize: 12.5, color: "var(--text)", outline: "none", fontFamily: "inherit",
  });

  return (
    <div className="linked" style={{ marginTop: 8 }}>
      {error && <div className="err-inline" style={{ marginBottom: 6 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp(140)} />
        <input value={glosa} onChange={e => setGlosa(e.target.value)} placeholder="Glosa (descripción del banco)" style={{ ...inp(200), flex: 1, minWidth: 160 }} />
        <input value={medio} onChange={e => setMedio(e.target.value)} placeholder="Medio" style={inp(70)} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={inp(100)}>
          <option value="cargo">Cargo (−)</option>
          <option value="abono">Abono (+)</option>
        </select>
        <input value={monto} onChange={e => setMonto(e.target.value)} placeholder="Monto S/" inputMode="decimal" style={inp(110)} />
        <input value={saldo} onChange={e => setSaldo(e.target.value)} placeholder="Saldo después S/" inputMode="decimal" style={inp(130)} />
        <select value={categoria} onChange={e => setCategoria(e.target.value)} style={inp(140)}>
          <option value="desembolso">💵 desembolso</option>
          <option value="retiro">📤 retiro</option>
          <option value="comision">🏦 comisión</option>
          <option value="interes">％ interés</option>
          <option value="otro">• otro</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button className="btn" disabled={ocupado} onClick={enviar} style={{ fontSize: 12, padding: "6px 14px" }}>{ocupado ? "…" : "Guardar"}</button>
        <button className="btn btn-ghost" onClick={onListo} style={{ fontSize: 12, padding: "6px 12px" }}>Cancelar</button>
      </div>
    </div>
  );
}
