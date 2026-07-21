"use client";
import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { plazoDe } from "@/lib/plazo";
import { icoTipo } from "@/lib/tipos";
import { colorEtapa, ETAPAS_CINE } from "@/lib/etapas";

/* AGENDA — todo lo que tiene fecha, en dos vistas.
   Línea de tiempo (barras por proyecto, con la duración inicio→fin de cada
   actividad y la fecha límite de cada caso) y calendario mensual. La data
   viene entera del servidor; aquí se filtra por persona y se cambia de vista
   sin recargar. */

export type ItemAgenda = {
  id: string;
  kind: "act" | "caso";
  titulo: string;
  ini: string;             // YYYY-MM-DD
  fin: string;             // YYYY-MM-DD (caso: = fecha límite)
  estado: string;
  etapa?: string;          // color de la actividad
  tipo?: string;           // ícono del caso
  respId: string | null;
  personas: string[];      // responsable + equipo, para el filtro
  grupo: string;           // rótulo del grupo (proyecto / "Casos")
  grupoId: string;
  href: string;
};

const DAY = 86400000;
const VENTANA = 70;        // días visibles en la línea de tiempo (10 semanas)
const LBL = 184;           // ancho de la columna de rótulos (px)
const RESP = 60;           // ancho de la columna del responsable (px)
const OFF = LBL + RESP;    // dónde empieza la pista: rejilla y eje se anclan aquí

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pd = (s: string) => new Date(s + "T12:00:00").getTime();
const fmtCorto = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });


export default function Agenda({ items, perfiles, miId }: {
  items: ItemAgenda[];
  perfiles: { id: string; nombre: string }[];
  miId: string;
}) {
  const [vista, setVista] = useState<"tl" | "cal">("tl");
  const [persona, setPersona] = useState("");   // "" = todo el equipo
  const [shift, setShift] = useState(0);         // días, línea de tiempo
  const [mesOff, setMesOff] = useState(0);       // meses, calendario

  const nombreDe = (id: string | null) => id ? (perfiles.find(p => p.id === id)?.nombre || "") : "";
  const cortoDe = (id: string | null) => nombreDe(id).split(" ")[0];

  const vis = items.filter(it => !persona || it.personas.includes(persona));

  /* Prendido / apagado, igual que el tablero: el "foco" es la persona filtrada
     o, si es "Todo el equipo", uno mismo. Se prende lo que ESA persona tiene a
     su cargo (es la responsable) y se apaga lo demás —donde solo apoya o que es
     de otro—, para reconocer de un vistazo lo propio en la agenda entera. */
  const foco = persona || miId;
  const apagado = (it: ItemAgenda) => !!foco && it.respId !== foco;

  /* El color dice la cosa: la actividad, su etapa; el caso, su urgencia
     (plazoDe pinta rojo si vencido, amarillo si cerca). */
  const colorDe = (it: ItemAgenda) =>
    it.kind === "act"
      ? colorEtapa(it.etapa || "")
      : (plazoDe(it.fin, it.estado)?.color || "var(--violet)");

  const icoDe = (it: ItemAgenda) => it.kind === "caso" ? icoTipo(it.tipo || "") : "▬";

  return (
    <>
      {/* ── Controles: vista + persona ── */}
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="vtabs" style={{ margin: 0 }}>
          <button className={`vtab ${vista === "tl" ? "on" : ""}`} onClick={() => setVista("tl")}>📊 Línea de tiempo</button>
          <button className={`vtab ${vista === "cal" ? "on" : ""}`} onClick={() => setVista("cal")}>🗓 Calendario</button>
        </div>
        <span style={{ flex: 1 }} />
        <label style={{ color: "var(--dim)", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          👤
          <select value={persona} onChange={e => setPersona(e.target.value)}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, color: "var(--text)", outline: "none" }}>
            <option value="">Todo el equipo</option>
            {miId && <option value={miId}>🙋 Solo lo mío</option>}
            {perfiles.filter(p => p.id !== miId).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
          {vis.length} · <span style={{ color: "var(--muted)" }}>{vis.filter(i => i.kind === "act").length} activ.</span> · <span style={{ color: "var(--muted)" }}>{vis.filter(i => i.kind === "caso").length} casos</span>
        </span>
      </div>

      {vista === "tl"
        ? <Timeline vis={vis} shift={shift} setShift={setShift} colorDe={colorDe} icoDe={icoDe} cortoDe={cortoDe} apagado={apagado} />
        : <Calendario vis={vis} mesOff={mesOff} setMesOff={setMesOff} colorDe={colorDe} icoDe={icoDe} apagado={apagado} />}

      {/* Leyenda de etapas. Muestra las de cine (las comunes); cada categoría
          reusa esta paleta, así que sirve de referencia aunque los nombres
          exactos varíen por categoría. */}
      <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 10.5, color: "var(--dim)", marginTop: 12 }}>
        {ETAPAS_CINE.map(e => (
          <span key={e.clave}><i style={{ display: "inline-block", width: 16, height: 7, background: e.color, borderRadius: 4, verticalAlign: "middle", marginRight: 4 }} />{e.nombre}</span>
        ))}
        <span style={{ marginLeft: 6 }}>· los <b style={{ color: "var(--violet)" }}>casos</b> se colorean por urgencia (rojo = vencido)</span>
      </div>
    </>
  );
}

/* ───────────────────────── LÍNEA DE TIEMPO ───────────────────────── */
function Timeline({ vis, shift, setShift, colorDe, icoDe, cortoDe, apagado }: {
  vis: ItemAgenda[]; shift: number; setShift: Dispatch<SetStateAction<number>>;
  colorDe: (it: ItemAgenda) => string; icoDe: (it: ItemAgenda) => string; cortoDe: (id: string | null) => string;
  apagado: (it: ItemAgenda) => boolean;
}) {
  /* Grupos plegables (como el tablero): plegar los proyectos que uno no mira
     devuelve alto a los que sí. La preferencia es personal —vive en
     localStorage, no en la URL— y se lee en useEffect para no desajustar la
     hidratación. */
  const CLAVE = "ag-tl-colapsados";
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { const raw = localStorage.getItem(CLAVE); if (raw) setColapsados(new Set(JSON.parse(raw))); } catch { /* modo privado */ }
  }, []);
  const plegar = (gid: string) => setColapsados(prev => {
    const n = new Set(prev);
    n.has(gid) ? n.delete(gid) : n.add(gid);
    try { localStorage.setItem(CLAVE, JSON.stringify([...n])); } catch { }
    return n;
  });

  const hoy0 = new Date();
  const baseD = new Date(hoy0.getFullYear(), hoy0.getMonth(), hoy0.getDate() - 7 + shift);
  const inicioT = new Date(baseD.getFullYear(), baseD.getMonth(), baseD.getDate(), 12).getTime();
  const finT = inicioT + VENTANA * DAY;
  const pct = (t: number) => ((t - inicioT) / (finT - inicioT)) * 100;
  const hoyPct = pct(pd(ymd(hoy0)));

  // Solo lo que cruza la ventana
  const dentro = vis.filter(it => pd(it.fin) + DAY >= inicioT && pd(it.ini) < finT);

  // Agrupar por proyecto; "Casos" PRIMERO, los cronogramas después
  const byGroup = new Map<string, { label: string; items: ItemAgenda[] }>();
  dentro.forEach(it => {
    const g = byGroup.get(it.grupoId) || { label: it.grupo, items: [] };
    g.items.push(it); byGroup.set(it.grupoId, g);
  });
  /* Orden: Casos → proyectos → convocatorias → (sin proyecto). Antes era
     alfabético a secas y los proyectos salían partidos alrededor del bloque
     "C-0xx" (15Emi arriba por el dígito, SanEsteban al final por la S). El
     prefijo del grupoId dice el tipo: p: proyecto, c: convocatoria. Dentro de
     cada bloque, alfabético (las convocatorias, por su código). */
  const rango = (gid: string) =>
    gid === "__casos__" ? 0 : gid.startsWith("postu:") ? 2
      : gid.startsWith("p:") ? 1 : gid.startsWith("c:") ? 3 : 4;
  const grupos = [...byGroup.entries()].sort((a, b) =>
    rango(a[0]) - rango(b[0]) || a[1].label.localeCompare(b[1].label));
  grupos.forEach(([, g]) => g.items.sort((x, y) => x.ini < y.ini ? -1 : x.ini > y.ini ? 1 : 0));

  // Marcas de semana (cada 7 días). Sin el tick final (== fin de ventana): su
  // etiqueta, centrada en el 100%, se salía por la derecha y forzaba un scroll
  // horizontal que no hacía falta.
  const semanas = Array.from({ length: Math.ceil(VENTANA / 7) }, (_, i) => {
    const t = inicioT + i * 7 * DAY;
    return { pct: pct(t), lbl: fmtCorto(ymd(new Date(t))) };
  });

  return (
    <div className="card">
      <div className="ag-tl-nav">
        <button className="vtab" onClick={() => setShift(0)}>Hoy</button>
        <button className="vtab" title="Antes" onClick={() => setShift(s => s - 14)}>‹</button>
        <button className="vtab" title="Después" onClick={() => setShift(s => s + 14)}>›</button>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>{fmtCorto(ymd(new Date(inicioT)))} — {fmtCorto(ymd(new Date(finT - DAY)))}</span>
      </div>

      {!dentro.length && <div className="empty" style={{ padding: "20px 0" }}>Nada con fecha en esta ventana.</div>}

      {!!dentro.length && (
        <div className="ag-tl-body">
          {/* Rejilla + línea de HOY, superpuestas sobre las filas */}
          <div className="ag-tl-lineas" style={{ left: OFF }}>
            {semanas.map((s, i) => <i key={i} style={{ left: `${s.pct}%` }} />)}
            {hoyPct >= 0 && hoyPct <= 100 && <span className="hoy" style={{ left: `${hoyPct}%` }} />}
          </div>

          {/* Eje de fechas (posiciona con el mismo offset de la columna de rótulos) */}
          <div className="ag-tl-axis">
            {semanas.map((s, i) => (
              <span key={i} style={{ left: `calc(${OFF}px + (100% - ${OFF}px) * ${s.pct / 100})` }}>{s.lbl}</span>
            ))}
          </div>

          {grupos.map(([gid, g]) => {
            const cerrado = colapsados.has(gid);
            /* Acceso rápido al cronograma: el título del proyecto/convocatoria
               enlaza a su ficha (donde vive el cronograma completo). La flecha
               ▾ sigue siendo solo el plegar. Casos no tiene ficha → sin link. */
            const hrefGrupo = gid.startsWith("postu:") ? `/entidad/postulacion/${gid.slice(6)}`
              : gid.startsWith("p:") ? `/entidad/proyecto/${gid.slice(2)}`
              : gid.startsWith("c:") ? `/entidad/convocatoria/${gid.slice(2)}` : null;
            const titulo = gid === "__casos__" ? "🗂 Casos" : `📁 ${g.label}`;
            return (
            <div key={gid}>
              <div className="ag-tl-grupo">
                <button className="ag-tl-caret" onClick={() => plegar(gid)}
                  title={cerrado ? "Desplegar" : "Plegar"} aria-label={cerrado ? "Desplegar" : "Plegar"}>
                  {cerrado ? "▸" : "▾"}
                </button>
                {hrefGrupo
                  ? <Link href={hrefGrupo} className="ag-tl-gtit" title="Abrir el cronograma">
                      {titulo} <span className="ag-tl-flecha">→</span>
                    </Link>
                  : <span className="ag-tl-gtit">{titulo}</span>}
                <span className="ag-tl-gn">{g.items.length}</span>
              </div>
              {!cerrado && g.items.map(it => {
                const left = Math.max(0, pct(pd(it.ini)));
                const right = Math.min(100, pct(pd(it.fin) + DAY));
                const w = Math.max(right - left, 1.5);
                const col = colorDe(it);
                return (
                  <div className={`ag-tl-row ${apagado(it) ? "ag-ajena" : ""}`} key={it.id}>
                    <Link href={it.href} className="ag-tl-lbl" title={it.titulo}>
                      {icoDe(it)} {it.titulo}
                    </Link>
                    <span className="ag-tl-resp" title={it.respId ? cortoDe(it.respId) : "sin responsable"}>
                      {it.respId ? cortoDe(it.respId) : "—"}
                    </span>
                    <div className="ag-tl-track">
                      <Link href={it.href} className="ag-tl-bar"
                        title={`${it.titulo} · ${fmtCorto(it.ini)}${it.fin !== it.ini ? ` → ${fmtCorto(it.fin)}` : ""}${it.respId ? ` · ${cortoDe(it.respId)}` : ""}`}
                        style={{
                          left: `${left}%`, width: `${w}%`,
                          background: it.kind === "caso" ? "transparent" : col,
                          border: it.kind === "caso" ? `2px solid ${col}` : "none",
                        }} />
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── CALENDARIO ───────────────────────── */
function Calendario({ vis, mesOff, setMesOff, colorDe, icoDe, apagado }: {
  vis: ItemAgenda[]; mesOff: number; setMesOff: Dispatch<SetStateAction<number>>;
  colorDe: (it: ItemAgenda) => string; icoDe: (it: ItemAgenda) => string;
  apagado: (it: ItemAgenda) => boolean;
}) {
  const hoyKey = ymd(new Date());
  const base = new Date();
  const calBase = new Date(base.getFullYear(), base.getMonth() + mesOff, 1);
  const y = calBase.getFullYear(), m = calBase.getMonth();
  const primerDow = (new Date(y, m, 1).getDay() + 6) % 7;   // lunes = 0
  const diasMes = new Date(y, m + 1, 0).getDate();

  // Un ítem cae en un día si el día está dentro de su rango (caso: solo su fecha)
  const enDia = (key: string) => vis.filter(it =>
    it.kind === "caso" ? it.fin === key : (it.ini <= key && key <= it.fin));

  const celdas: (string | null)[] = [
    ...Array.from({ length: primerDow }, () => null),
    ...Array.from({ length: diasMes }, (_, i) => ymd(new Date(y, m, i + 1))),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const TOPE = 4;   // chips por día antes de "+N"

  return (
    <div className="card">
      <div className="ag-tl-nav">
        <button className="vtab" onClick={() => setMesOff(0)}>Hoy</button>
        <button className="vtab" title="Mes anterior" onClick={() => setMesOff(s => s - 1)}>‹</button>
        <button className="vtab" title="Mes siguiente" onClick={() => setMesOff(s => s + 1)}>›</button>
        <span style={{ color: "var(--muted)", fontSize: 13, textTransform: "capitalize" }}>{MESES[m]} {y}</span>
      </div>

      <div className="ag-cal">
        {DOW.map(d => <div key={d} className="ag-cal-dow">{d}</div>)}
        {celdas.map((key, i) => {
          if (!key) return <div key={i} className="ag-cal-dia vacia" />;
          const dia = Number(key.slice(8));
          const items = enDia(key);
          return (
            <div key={i} className={`ag-cal-dia ${key === hoyKey ? "hoy" : ""}`}>
              <span className="ag-cal-num">{dia}</span>
              {items.slice(0, TOPE).map(it => (
                <Link key={it.id} href={it.href} className={`ag-cal-chip ${apagado(it) ? "ag-ajena" : ""}`} title={it.titulo}
                  style={{ borderLeft: `3px solid ${colorDe(it)}` }}>
                  {icoDe(it)} {it.titulo}
                </Link>
              ))}
              {items.length > TOPE && <span className="ag-cal-mas">+{items.length - TOPE} más</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
