"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstado } from "@/app/actions";
import { celebrarResuelto } from "@/lib/celebra";
import { plazoDe } from "@/lib/plazo";
import { icoTipo } from "@/lib/tipos";

// Nombre corto que distingue homónimos: "John Oros" → "John O."
function corto(n?: string | null) {
  const p = (n || "").trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || "");
}

/* ── TABLERO · LÍNEA DE TIEMPO ──────────────────────────────────────
   Filas = estados, columnas = días. Cada caso se ubica en el día de su
   fecha_limite (o, si no tiene, su fecha de creación). La columna de
   HOY se resalta con una línea vertical, y los casos que vencen HOY
   llevan foco. Arrastrar una tarjeta a otra fila cambia su estado. */

type Caso = {
  id: string; titulo: string; tipo: string; estado: string;
  fecha_limite: string | null; creado_en: string; resp: string | null;
  nc?: number; sub?: number; reac?: Record<string, number>;
};

function reacStr(reac?: Record<string, number>) {
  if (!reac) return "";
  return Object.entries(reac).slice(0, 3).map(([em, n]) => `${em}${n}`).join(" ");
}

/* (El mapa de tipos salió a lib/tipos: eran diez copias.) */
const FILAS: { estado: string; label: string; color: string; icon: string }[] = [
  { estado: "abierta", label: "SIN RESOLVER", color: "var(--red)", icon: "🔴" },
  { estado: "en_progreso", label: "EN PROGRESO", color: "var(--yellow)", icon: "🟡" },
  { estado: "seguimiento", label: "SEGUIMIENTO", color: "var(--teal)", icon: "🔭" },
  { estado: "en_pausa", label: "EN PAUSA", color: "var(--blue)", icon: "⏸" },
  { estado: "resuelta", label: "RESUELTAS", color: "var(--green)", icon: "✅" },
];
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const PRE = 4;      // días antes de hoy que se muestran
const N = 21;       // total de columnas visibles

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* (La cuenta regresiva salió a lib/plazo.) */


export default function TableroTimeline({ casos }: { casos: Caso[] }) {
  const router = useRouter();
  const [shift, setShift] = useState(0);       // desplazamiento en días
  const [moviendo, setMoviendo] = useState(false);
  const [sobre, setSobre] = useState<string | null>(null);

  const hoy = new Date();
  const hoyKey = ymd(hoy);
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - PRE + shift);
  const dias = Array.from({ length: N }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const key = ymd(d);
    return { key, num: d.getDate(), dow: DOW[d.getDay()], hoy: key === hoyKey };
  });

  const claveDe = (c: Caso) => c.fecha_limite || ymd(new Date(c.creado_en));
  const conteo = (estado: string) => casos.filter(c => c.estado === estado).length;
  const enCelda = (estado: string, key: string) =>
    casos.filter(c => c.estado === estado && claveDe(c) === key);

  const mesLbl = `${MESES[base.getMonth()]} ${base.getFullYear()}`;

  const soltar = async (estadoDestino: string, id: string) => {
    setSobre(null);
    if (!id || moviendo) return;
    const c = casos.find(x => x.id === id);
    if (!c || c.estado === estadoDestino) return;
    setMoviendo(true);
    const r: any = await cambiarEstado(id, estadoDestino);
    setMoviendo(false);
    if (r?.error) alert(r.error);
    else { if (estadoDestino === "resuelta") celebrarResuelto(); router.refresh(); }
  };

  return (
    <div className="tl">
      <div className="tl-nav">
        <button className="vtab" onClick={() => setShift(0)}>Hoy</button>
        <button className="vtab" onClick={() => setShift(s => s - 7)} title="Semana anterior">‹</button>
        <button className="vtab" onClick={() => setShift(s => s + 7)} title="Semana siguiente">›</button>
        <span className="tl-mes" style={{ textTransform: "capitalize" }}>{mesLbl}</span>
      </div>

      <div className="tl-scroll">
        <div className="tl-grid"
          style={{ gridTemplateColumns: `150px repeat(${N}, 186px)` }}>
          <div className="tl-corner" />
          {dias.map(d => (
            <div key={d.key} className={`tl-dhead ${d.hoy ? "hoy" : ""}`}>
              <span className="dow">{d.dow}</span>
              <span className="dnum">{pad(d.num)}</span>
            </div>
          ))}

          {FILAS.map(f => (
            <Fragment key={f.estado}>
              <div className={`tl-rowlabel est-${f.estado}`}>
                <span style={{ color: f.color, fontWeight: 700, fontSize: 11.5, letterSpacing: ".5px" }}>
                  {f.icon} {f.label}
                </span>
                <span className="tl-n">{conteo(f.estado)}</span>
              </div>
              {dias.map(d => {
                const items = enCelda(f.estado, d.key);
                const zona = `${f.estado}|${d.key}`;
                return (
                  <div key={d.key}
                    className={`tl-cell est-${f.estado} ${d.hoy ? "hoy" : ""} ${sobre === f.estado ? "tl-sobre" : ""}`}
                    onDragOver={e => { e.preventDefault(); setSobre(f.estado); }}
                    onDragLeave={() => setSobre(s => (s === f.estado ? null : s))}
                    onDrop={e => soltar(f.estado, e.dataTransfer.getData("text/plain"))}>
                    {items.map(c => {
                      // `plazoDe` ya devuelve null si está cerrado: eso era el
                      // `!cerr` de aquí abajo, y su lista literal de estados.
                      const pl = plazoDe(c.fecha_limite, c.estado);
                      return (
                        <div key={c.id} className="tl-card" draggable
                          style={{ ["--st" as any]: f.color }}
                          onDragStart={e => e.dataTransfer.setData("text/plain", c.id)}
                          onClick={() => router.push(`/caso/${c.id}`)}>
                          <div className="tt">{icoTipo(c.tipo)} {c.titulo}</div>
                          <div className="mt">
                            {c.resp && <span className="tl-resp">{corto(c.resp)}</span>}
                            {pl && (
                              <span style={{ color: pl.color, fontWeight: 800 }}>
                                {pl.vencido ? `venc. ${-pl.d}d` : pl.d === 0 ? "HOY" : `${pl.d}d`}
                              </span>
                            )}
                            {!!c.nc && <span className="mini-ind">💬 {c.nc}</span>}
                            {!!c.sub && <span className="mini-ind">🧩 {c.sub}</span>}
                            {reacStr(c.reac) && <span className="mini-ind">{reacStr(c.reac)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="tl-leyenda">
        {FILAS.map(f => (
          <span key={f.estado}><i style={{ background: f.color }} /> {f.label}</span>
        ))}
      </div>
    </div>
  );
}
