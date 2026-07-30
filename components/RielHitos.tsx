import { TXT } from "@/lib/texto";

/* RIEL DE HITOS — la línea de tiempo de un concurso: sus fechas ubicadas por
   fecha real sobre un riel, con la marca de HOY, lo pasado en penumbra y lo que
   sigue por delante; debajo, cuál es la fecha más próxima y en cuántos días.
   Se usa en la cancha de la convocatoria y, la MISMA, en cada postulación del
   listado (comparten las fechas de su convocatoria). */
export type Hito = { id: string; nombre: string; fecha: string };

const d = (f: string) => new Date(f + "T12:00:00").getTime();
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });
const dias = (f: string) => Math.ceil((d(f) - Date.now()) / 86400000);
// Rojo TENUE para la urgencia (≤2 días): alerta sin gritar. El rojo pleno
// (var(--red)) se reservaba para el problema, y aquí saturaba la tarjeta.
const colorD = (n: number) => (n <= 2 ? "#e88a91" : n <= 7 ? "var(--yellow)" : "var(--muted)");

export default function RielHitos({ hitos, hoy, compacto = false }: {
  hitos: Hito[]; hoy: string;
  /** Sin fechas bajo cada punto (para filas muy apretadas). */
  compacto?: boolean;
}) {
  const hs = [...hitos].sort((a, b) => d(a.fecha) - d(b.fecha));
  if (!hs.length) return <div className="cn-next" style={{ color: "var(--dim)" }}>⏱ sin fechas cargadas</div>;
  const hoyT = d(hoy);
  const ts = [...hs.map(h => d(h.fecha)), hoyT];
  let min = Math.min(...ts), max = Math.max(...ts);
  if (max === min) max = min + 86400000;
  const pad = (max - min) * 0.06; min -= pad; max += pad;
  const pos = (t: number) => Math.max(0, Math.min(100, ((t - min) / (max - min)) * 100));
  const hoyPct = pos(hoyT);
  const iProx = hs.findIndex(h => h.fecha >= hoy);

  return (
    <div className={`cn-time${compacto ? " cn-time-mini" : ""}`}>
      <div className="cn-track">
        <div className="cn-past" style={{ width: `${hoyPct}%` }} />
        <div className="cn-hoy" style={{ left: `${hoyPct}%` }}><span>hoy</span></div>
        {hs.map((h, i) => {
          const cls = i < iProx || iProx < 0 ? "hecho" : i === iProx ? "prox" : "";
          return (
            <div key={h.id} className={`cn-hito ${cls}`} style={{ left: `${pos(d(h.fecha))}%` }}
              title={`${h.nombre || "hito"} · ${fmt(h.fecha)}`}>
              <span className="cn-hdot" />
              {!compacto && <span className="cn-hdate">{fmt(h.fecha)}</span>}
            </div>
          );
        })}
      </div>
      {iProx >= 0 ? (
        <div className="cn-next" style={{ color: colorD(dias(hs[iProx].fecha)), fontSize: TXT.chip }}>
          ⏱ sigue: <b>{hs[iProx].nombre || "hito"}</b> · {fmt(hs[iProx].fecha)} · en {dias(hs[iProx].fecha)} días
        </div>
      ) : (
        <div className="cn-next" style={{ color: "var(--green)", fontSize: TXT.chip }}>✅ todas las fechas cumplidas</div>
      )}
    </div>
  );
}
