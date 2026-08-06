import Link from "next/link";

/* LÍNEA DE TIEMPO — regla del sistema: lo que tiene fechas, se dibuja.
   Vertical, con el nodo HOY en su posición cronológica real, separación
   proporcional a la distancia entre eventos y la cifra de días visible. */

export type EventoLT = {
  fecha: string;        // YYYY-MM-DD
  titulo: string;
  icono?: string;
  color?: string;       // color del punto
  chip?: string;        // etiqueta pequeña (ej. código del concurso)
  href?: string;        // destino del clic
};

const dias = (f: string) => Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);
// Incluye el día de la semana: saber que un cierre cae viernes cambia el plan.
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/* Una distancia en días se lee mejor en la unidad que le queda cómoda: hasta 13
   días se dicen los días; hasta ~2 meses, en semanas; más allá, en meses. Así
   «68 días» se vuelve «2 meses» y «en 62 días» se vuelve «en 2 meses». */
const humano = (n: number) => {
  const a = Math.abs(n);
  if (a < 14) return `${a} día${a === 1 ? "" : "s"}`;
  if (a < 60) { const s = Math.round(a / 7); return `${s} semana${s === 1 ? "" : "s"}`; }
  const m = Math.round(a / 30); return `${m} mes${m === 1 ? "" : "es"}`;
};

type Nodo = (EventoLT & { esHoy?: false }) | { esHoy: true; fecha: string };

export default function LineaTiempo({ eventos }: { eventos: EventoLT[] }) {
  if (!eventos.length) return <div style={{ color: "var(--dim)", fontSize: 13 }}>Sin fechas en el horizonte.</div>;

  const hoyS = new Date().toISOString().slice(0, 10);
  const orden: Nodo[] = [...eventos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  // HOY entra en su posición cronológica
  const idx = orden.findIndex(e => e.fecha >= hoyS);
  const nodos: Nodo[] = [...orden];
  nodos.splice(idx < 0 ? nodos.length : idx, 0, { esHoy: true, fecha: hoyS });

  const brecha = (a: string, b: string) =>
    Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000);

  return (
    <div className="lt">
      {nodos.map((n, i) => {
        const gap = i > 0 ? brecha(nodos[i - 1].fecha, n.fecha) : 0;
        const alto = i > 0 ? Math.min(14 + gap * 1.1, 74) : 0;
        return (
          <div key={i}>
            {i > 0 && (
              <div className="lt-conn" style={{ height: alto }}>
                {gap >= 2 && <i>{humano(gap)}</i>}
              </div>
            )}
            {"esHoy" in n && n.esHoy ? (
              <div className="lt-ev lt-hoy">
                <span className="lt-dot" />
                <div className="lt-info"><span className="lt-fecha">HOY · {fmt(n.fecha)}</span></div>
              </div>
            ) : (() => {
              const e = n as EventoLT;
              const d = dias(e.fecha);
              const cuenta = d === 0 ? "HOY" : d > 0 ? `en ${humano(d)}` : `hace ${humano(d)}`;
              // Pasado = historia (gris tenue). Lo que vence en ≤7 días = ámbar,
              // que es lo único aquí que pide atención. El resto, normal.
              const cuerpo = (
                <>
                  <span className="lt-fecha" style={d < 0 ? { color: "var(--dim)" } : d <= 7 ? { color: "var(--yellow)" } : undefined}>
                    {fmt(e.fecha)} · {cuenta}
                  </span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {e.icono} {e.titulo}
                    {e.chip && <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)", fontSize: 10.5 }}>{e.chip}</span>}
                  </span>
                </>
              );
              return (
                <div className="lt-ev" style={d < 0 ? { opacity: 0.6 } : undefined}>
                  <span className="lt-dot" style={{ background: d < 0 ? "var(--dim)" : (e.color || "var(--violet)") }} />
                  {e.href
                    ? <Link href={e.href} className="lt-info" style={{ color: "var(--text)" }}>{cuerpo}</Link>
                    : <div className="lt-info">{cuerpo}</div>}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
