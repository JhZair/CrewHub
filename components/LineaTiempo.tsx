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
const fmt = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

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
                {gap >= 2 && <i>{gap} días</i>}
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
              const cuenta = d === 0 ? "HOY" : d > 0 ? `en ${d} día${d === 1 ? "" : "s"}` : `hace ${-d} día${d === -1 ? "" : "s"}`;
              const cuerpo = (
                <>
                  <span className="lt-fecha" style={d < 0 ? { color: "var(--red)" } : d <= 7 ? { color: "var(--yellow)" } : undefined}>
                    {fmt(e.fecha)} · {cuenta}
                  </span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {e.icono} {e.titulo}
                    {e.chip && <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.12)", fontSize: 10.5 }}>{e.chip}</span>}
                  </span>
                </>
              );
              return (
                <div className="lt-ev">
                  <span className="lt-dot" style={{ background: e.color || "var(--violet)" }} />
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
