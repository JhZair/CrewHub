"use client";
import { useState } from "react";
import { metaRubro, nombreRubro } from "@/lib/rubros";

/* CONCILIACIÓN — lo ejecutado contra lo presupuestado (versión vigente).
 *
 * La pregunta de la rendición: ¿cada rubro gastó lo que dijo que gastaría?
 * A la izquierda, el presupuesto VIGENTE (la versión que manda, contra la que
 * DAFO revisa); a la derecha, lo EJECUTADO — la suma de los RHE con ese rubro.
 * El saldo dice cuánto queda; el avance, qué % del rubro ya se gastó. Un rubro
 * en rojo es un SOBREGIRO: gastó más de lo presupuestado, y eso DAFO lo observa.
 *
 * Dos vistas: POR RUBRO (contra el presupuesto, la conciliación de verdad) y
 * POR ETAPA (Pre/Prod/Post — cómo se repartió el gasto entre las fases). DAFO
 * presupuesta por rubro, no por fase, así que la vista por etapa no lleva
 * columna «presupuestado»: es la distribución del ejecutado.
 *
 * Alcance honesto: el ejecutado suma los RHE (pagos con recibo por honorarios).
 * Los gastos pagados directo del banco sin RHE no entran aquí. Los RHE sin
 * rubro/etapa asignado tampoco reparten —se avisan aparte—.
 */

type ItemP = { rubro?: string | null; cantidad?: number; costo_unit?: number };
type RheR = { rubro_item?: string | null; etapa?: string | null; monto?: number };
type Opcion = { id: string; nombre: string };

const money = (n: number) => "S/ " + Math.round(n || 0).toLocaleString("es-PE");
const pct = (a: number, b: number) => (b > 0 ? a / b : 0);

export default function ConciliacionFondo({
  items, esVigente, postuladoEn, rhe, etapas, estimulo,
}: {
  items: ItemP[];
  /** true si `items` viene de la versión vigente; false si es el presupuesto vivo (aún sin versión). */
  esVigente: boolean;
  postuladoEn: string | null;
  rhe: RheR[];
  /** Etapas del cronograma del fondo (Pre/Prod/Post), en orden, para la vista por etapa. */
  etapas: Opcion[];
  estimulo: number | null;
}) {
  const [modo, setModo] = useState<"rubro" | "etapa">("rubro");
  // ── Agregación por rubro ──
  const presPorRubro = new Map<string, number>();
  for (const i of items) {
    if (!i.rubro) continue;
    presPorRubro.set(i.rubro, (presPorRubro.get(i.rubro) || 0) + (i.cantidad || 0) * (i.costo_unit || 0));
  }
  const ejecPorRubro = new Map<string, number>();
  let ejecSinRubro = 0, nSinRubro = 0;
  for (const r of rhe) {
    const m = Number(r.monto || 0);
    if (!r.rubro_item) { ejecSinRubro += m; nSinRubro++; continue; }
    ejecPorRubro.set(r.rubro_item, (ejecPorRubro.get(r.rubro_item) || 0) + m);
  }

  type Fila = { clave: string; nombre: string; rubroCod?: string; pres: number; ejec: number };
  const claves = Array.from(new Set([...presPorRubro.keys(), ...ejecPorRubro.keys()]));
  const filas: Fila[] = claves.map(c => ({
    clave: c, nombre: nombreRubro(c), rubroCod: metaRubro(c)?.rubroCod,
    pres: presPorRubro.get(c) || 0, ejec: ejecPorRubro.get(c) || 0,
  }));

  // Agrupadas por categoría DAFO (1, 2…); las sin categoría van al final.
  const cats = new Map<string, { catCod: string; catNombre: string; filas: Fila[] }>();
  const otras: Fila[] = [];
  for (const f of filas) {
    const meta = metaRubro(f.clave);
    if (!meta) { otras.push(f); continue; }
    let g = cats.get(meta.catCod);
    if (!g) { g = { catCod: meta.catCod, catNombre: meta.catNombre, filas: [] }; cats.set(meta.catCod, g); }
    g.filas.push(f);
  }
  const catsList = [...cats.values()].sort((a, b) => a.catCod.localeCompare(b.catCod, undefined, { numeric: true }));
  const ordenarFilas = (fs: Fila[]) => [...fs].sort((a, b) =>
    (a.rubroCod || "").localeCompare(b.rubroCod || "", undefined, { numeric: true }) || b.pres - a.pres);

  const totPres = filas.reduce((s, f) => s + f.pres, 0);
  const totEjecRub = filas.reduce((s, f) => s + f.ejec, 0);   // ejecutado con rubro
  const totEjec = totEjecRub + ejecSinRubro;                  // todos los RHE
  const avanceGlobal = pct(totEjec, totPres);

  // ── Ejecutado por ETAPA (Pre/Prod/Post) — solo el gasto, no hay presupuesto por fase ──
  const ejecPorEtapa = new Map<string, number>();
  const nPorEtapa = new Map<string, number>();
  let ejecSinEtapa = 0, nSinEtapa = 0;
  for (const r of rhe) {
    const m = Number(r.monto || 0);
    if (!r.etapa) { ejecSinEtapa += m; nSinEtapa++; continue; }
    ejecPorEtapa.set(r.etapa, (ejecPorEtapa.get(r.etapa) || 0) + m);
    nPorEtapa.set(r.etapa, (nPorEtapa.get(r.etapa) || 0) + 1);
  }
  type FilaEt = { clave: string; nombre: string; ejec: number; n: number; sin?: boolean };
  const filasEt: FilaEt[] = etapas
    .filter(e => ejecPorEtapa.has(e.id))
    .map(e => ({ clave: e.id, nombre: e.nombre, ejec: ejecPorEtapa.get(e.id) || 0, n: nPorEtapa.get(e.id) || 0 }));
  // Etapas ejecutadas que no están en el preset del cronograma (huérfanas), al final.
  for (const [clave, ejec] of ejecPorEtapa) {
    if (!etapas.some(e => e.id === clave)) filasEt.push({ clave, nombre: clave, ejec, n: nPorEtapa.get(clave) || 0 });
  }
  if (nSinEtapa > 0) filasEt.push({ clave: "∅", nombre: "⚠ Sin etapa", ejec: ejecSinEtapa, n: nSinEtapa, sin: true });
  const totEjecEt = filasEt.reduce((s, f) => s + f.ejec, 0);

  if (!items.length) {
    return (
      <p style={{ color: "var(--dim)", fontSize: 13, margin: 0 }}>
        No hay presupuesto {esVigente ? "vigente" : "cargado"} contra el cual conciliar.
        Carga o fija el presupuesto (🧮 Presupuesto) y aquí verás lo ejecutado por rubro.
      </p>
    );
  }

  // Una fila de rubro con su barra de avance.
  const filaRubro = (f: Fila) => {
    const saldo = f.pres - f.ejec;
    const av = pct(f.ejec, f.pres);
    const sobregiro = f.ejec > f.pres + 1e-6;
    const sinPres = f.pres <= 0 && f.ejec > 0;   // ejecutó en un rubro sin presupuesto
    return (
      <div key={f.clave} className="con-row">
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {f.rubroCod && <span className="con-cod">{f.rubroCod}</span>}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nombre}</span>
          {sinPres && <span style={{ color: "var(--yellow)", fontSize: 10.5, fontWeight: 700 }}>sin presup.</span>}
        </span>
        <span className="con-num">{money(f.pres)}</span>
        <span className="con-num" style={{ color: "var(--muted)" }}>{money(f.ejec)}</span>
        <span className="con-num" style={{ color: sobregiro ? "var(--red)" : saldo === 0 ? "var(--dim)" : "var(--teal)" }}>
          {sobregiro ? "−" : ""}{money(Math.abs(saldo))}
        </span>
        <span className="con-av">
          <span className="con-bar"><span className="con-bar-fill"
            style={{ width: `${Math.min(100, av * 100)}%`, background: sobregiro ? "var(--red)" : "var(--green)" }} /></span>
          <span style={{ fontSize: 11, color: sobregiro ? "var(--red)" : "var(--dim)", minWidth: 34, textAlign: "right" }}>
            {f.pres > 0 ? `${Math.round(av * 100)}%` : "—"}
          </span>
        </span>
      </div>
    );
  };

  const sobregiros = filas.filter(f => f.ejec > f.pres + 1e-6).length;

  return (
    <div>
      {/* Cabecera: el panorama en una línea */}
      <div className="linked" style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, padding: "10px 12px" }}>
        <Stat k="Presupuesto vigente" v={money(totPres)} />
        <Stat k="Ejecutado (RHE)" v={money(totEjec)} col="var(--muted)" />
        <Stat k="Avance" v={`${Math.round(avanceGlobal * 100)}%`} col={avanceGlobal > 1 ? "var(--red)" : "var(--green)"} />
        <Stat k="Saldo por ejecutar" v={money(totPres - totEjec)} col={totPres - totEjec < 0 ? "var(--red)" : "var(--teal)"} />
      </div>

      {/* Selector de vistas: la conciliación de verdad (rubro) o el reparto por fase (etapa) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ color: "var(--dim)", fontSize: 12 }}>Cruzar por:</span>
        <div className="rhe-vistas">
          <button className={modo === "rubro" ? "on" : ""} onClick={() => setModo("rubro")}>🗂 Por rubro</button>
          <button className={modo === "etapa" ? "on" : ""} onClick={() => setModo("etapa")}>🎬 Por etapa</button>
        </div>
      </div>

      {modo === "rubro" && (<>
      {/* De qué presupuesto hablamos */}
      <div style={{ color: "var(--dim)", fontSize: 11.5, margin: "0 0 8px", lineHeight: 1.5 }}>
        {esVigente
          ? <>Contra la <b style={{ color: "var(--muted)" }}>versión vigente</b>{postuladoEn ? ` (fijada el ${new Date(postuladoEn).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })})` : ""}.</>
          : <><b style={{ color: "var(--yellow)" }}>Aún no hay versión vigente</b> — se compara contra el presupuesto vivo. Fija una versión en 🧮 Presupuesto → Historial.</>}
        {sobregiros > 0 && <> · <b style={{ color: "var(--red)" }}>{sobregiros} rubro(s) en sobregiro</b>.</>}
      </div>

      {/* Tabla por rubro */}
      <div className="con-grid">
        <div className="con-lbls">
          <span>Rubro</span><span>Presupuestado</span><span>Ejecutado</span><span>Saldo</span><span>Avance</span>
        </div>
        {catsList.map(cat => {
          const cp = cat.filas.reduce((s, f) => s + f.pres, 0);
          const ce = cat.filas.reduce((s, f) => s + f.ejec, 0);
          return (
            <div key={cat.catCod}>
              <div className="con-cat">
                <span><b style={{ marginRight: 6 }}>{cat.catCod}</b>{cat.catNombre}</span>
                <span className="con-num">{money(cp)}</span>
                <span className="con-num">{money(ce)}</span>
                <span className="con-num" style={{ color: ce > cp + 1e-6 ? "var(--red)" : "var(--dim)" }}>
                  {ce > cp + 1e-6 ? "−" : ""}{money(Math.abs(cp - ce))}
                </span>
                <span className="con-num" style={{ color: "var(--dim)" }}>{cp > 0 ? `${Math.round(pct(ce, cp) * 100)}%` : "—"}</span>
              </div>
              {ordenarFilas(cat.filas).map(filaRubro)}
            </div>
          );
        })}
        {otras.length > 0 && ordenarFilas(otras).map(filaRubro)}
        <div className="con-tot">
          <span>TOTAL</span>
          <span className="con-num">{money(totPres)}</span>
          <span className="con-num">{money(totEjecRub)}</span>
          <span className="con-num" style={{ color: totEjecRub > totPres + 1e-6 ? "var(--red)" : "var(--teal)" }}>
            {totEjecRub > totPres + 1e-6 ? "−" : ""}{money(Math.abs(totPres - totEjecRub))}
          </span>
          <span className="con-num" style={{ color: "var(--dim)" }}>{totPres > 0 ? `${Math.round(pct(totEjecRub, totPres) * 100)}%` : "—"}</span>
        </div>
      </div>

      {nSinRubro > 0 && (
        <div style={{ color: "var(--yellow)", fontSize: 11, marginTop: 10, lineHeight: 1.55 }}>
          ⚠ {nSinRubro} RHE por {money(ejecSinRubro)} aún <b>sin rubro</b> — no están repartidos arriba. Asígnalos en 🧾 Rendición para que la conciliación cuadre.
        </div>
      )}
      </>)}

      {modo === "etapa" && (<>
      {/* Reparto del gasto por fase */}
      <div style={{ color: "var(--dim)", fontSize: 11.5, margin: "0 0 8px", lineHeight: 1.5 }}>
        Cómo se repartió el <b style={{ color: "var(--muted)" }}>gasto ejecutado</b> entre las fases. DAFO presupuesta por rubro, no por fase, así que aquí no hay «presupuestado» — es la distribución del ejecutado.
      </div>
      <div className="con-grid">
        <div className="con-et-lbls">
          <span>Etapa</span><span>Ejecutado</span><span>RHE</span><span>% del ejecutado</span>
        </div>
        {filasEt.map(f => {
          const share = pct(f.ejec, totEjecEt);
          return (
            <div key={f.clave} className="con-et-row">
              <span style={{ color: f.sin ? "var(--yellow)" : undefined, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nombre}</span>
              <span className="con-num" style={{ color: "var(--teal)" }}>{money(f.ejec)}</span>
              <span className="con-num" style={{ color: "var(--dim)" }}>{f.n}</span>
              <span className="con-av">
                <span className="con-bar"><span className="con-bar-fill" style={{ width: `${Math.min(100, share * 100)}%`, background: "var(--violet)" }} /></span>
                <span style={{ fontSize: 11, color: "var(--dim)", minWidth: 34, textAlign: "right" }}>{Math.round(share * 100)}%</span>
              </span>
            </div>
          );
        })}
        {filasEt.length === 0 && (
          <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "8px 0" }}>
            Ningún RHE tiene etapa asignada todavía. Asígnalas en 🧾 Rendición (vista «por etapa»).
          </div>
        )}
        {filasEt.length > 0 && (
          <div className="con-et-tot">
            <span>TOTAL</span>
            <span className="con-num" style={{ color: "var(--teal)" }}>{money(totEjecEt)}</span>
            <span className="con-num">{filasEt.reduce((s, f) => s + f.n, 0)}</span>
            <span className="con-num" style={{ color: "var(--dim)" }}>100%</span>
          </div>
        )}
      </div>
      </>)}

      {/* Nota general del alcance (ambas vistas) */}
      <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 10, lineHeight: 1.55 }}>
        El ejecutado suma solo los <b>RHE</b> (pagos con recibo por honorarios). Otros gastos pagados directo de la cuenta se ven en 🏦 Movimientos del banco.
        {estimulo ? <> El estímulo desembolsado fue <b style={{ color: "var(--muted)" }}>{money(estimulo)}</b>.</> : null}
      </div>
    </div>
  );
}

function Stat({ k, v, col }: { k: string; v: string; col?: string }) {
  return (
    <div>
      <div style={{ color: "var(--dim)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".4px" }}>{k}</div>
      <div style={{ color: col || "var(--text)", fontWeight: 800, fontSize: 16, marginTop: 2 }}>{v}</div>
    </div>
  );
}
