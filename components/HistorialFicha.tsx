"use client";
import { useMemo, useState } from "react";
import EventoHistorial, { icoDe, ROTULO_EV, ROTULO_ENT, ICO_ENT, type Evento } from "@/components/EventoHistorial";
import EventoGrupo from "@/components/EventoGrupo";
import { agruparEventos } from "@/lib/agrupar";
import { tipoCanonico } from "@/lib/secciones";
import { BOT } from "@/lib/personas";

/* HISTORIAL DE UNA FICHA, CON FILTROS.
 *
 * El diario (/historial) ya filtraba por qué pasó, sobre qué y quién; la ficha
 * no, y desde que reúne lo que pasó en TODO el proyecto —casos, cronograma,
 * postulaciones— una lista corrida de 120 líneas no se lee: se hojea.
 *
 * Filtra en memoria y no por URL, a diferencia del diario: esto vive dentro de
 * una pestaña, y navegar a un `?e=estado` recargaría la ficha entera y volvería
 * a la primera pestaña. El resultado es además instantáneo.
 *
 * Los conteos de los chips salen del total, no de lo ya filtrado: un chip que
 * dijera «2» porque hay otro filtro puesto haría creer que solo hay dos.
 */
export default function HistorialFicha({ eventos, vacio }: {
  /* Cada evento trae su fecha YA ESCRITA en `hora`. No se recibe la función que
     la escribe: cruzar la frontera servidor→cliente con una función es un error
     de ejecución («Functions cannot be passed directly to Client Components»),
     y el typecheck no lo ve. El formato lo sigue decidiendo la ficha; lo que
     cruza es texto. */
  eventos: (Evento & { actor_id?: string | null; entidad_id?: string; hora?: string })[];
  /** Qué decir cuando no hay nada — el texto cambia según la entidad. */
  vacio: string;
}) {
  const [fEv, setFEv] = useState("");
  const [fEnt, setFEnt] = useState("");
  const [fActor, setFActor] = useState("");

  const nomActor = (x: any) => x.actor?.alias || x.actor?.nombre || `🤖 ${BOT}`;
  const entDe = (x: any) => tipoCanonico(x.entidad_tipo || "");

  const cuenta = (f: (x: any) => any) => {
    const m = new Map<string, number>();
    eventos.forEach(x => { const k = f(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const porEvento = useMemo(() => cuenta((x: any) => x.tipo), [eventos]);
  /* Solo tiene sentido preguntar «sobre qué» cuando hay más de una cosa: en una
     ficha sin arrastre, todo es de ella misma y la fila sobraría. */
  const porEntidad = useMemo(() => cuenta(entDe).filter(([t]) => t), [eventos]);
  const porActor = useMemo(() => cuenta(nomActor), [eventos]);

  const lista = eventos.filter((x: any) =>
    (!fEv || x.tipo === fEv) &&
    (!fEnt || entDe(x) === fEnt) &&
    (!fActor || nomActor(x) === fActor));

  const hayFiltro = !!(fEv || fEnt || fActor);
  const limpiar = () => { setFEv(""); setFEnt(""); setFActor(""); };

  const Chip = ({ on, color, onClick, children }: any) => (
    <button type="button" className={`vtab${on ? " on" : ""}`} onClick={onClick}
      style={!on && color ? { color, cursor: "pointer" } : { cursor: "pointer" }}>
      {children}
    </button>
  );
  const Fila = ({ titulo, children }: any) => (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "5px 0" }}>
      <span style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, color: "var(--dim)", width: 58, flex: "none" }}>
        {titulo}
      </span>
      {children}
    </div>
  );

  if (!eventos.length) {
    return <div className="empty" style={{ padding: "18px 0" }}>{vacio}</div>;
  }

  return (
    <div>
      {/* Con dos o tres eventos, una barra de filtros pesa más que la lista. */}
      {eventos.length > 6 && (
        <div className="card" style={{ padding: "6px 12px", marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4, borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--dim)", fontWeight: 700 }}>
              Filtros
            </span>
            <span style={{ flex: 1 }} />
            {hayFiltro && (
              <button type="button" className="vtab" style={{ padding: "2px 9px", fontSize: 11, cursor: "pointer" }}
                onClick={limpiar}>✕ limpiar filtros</button>
            )}
          </div>
          {porEntidad.length > 1 && (
            <Fila titulo="Sobre qué">
              {porEntidad.map(([t, n]) => (
                <Chip key={t} on={fEnt === t} onClick={() => setFEnt(fEnt === t ? "" : t)}>
                  {ICO_ENT[t] || "🔗"} {ROTULO_ENT[t] || t} · {n}
                </Chip>
              ))}
            </Fila>
          )}
          {porEvento.length > 1 && (
            <Fila titulo="Qué pasó">
              {porEvento.map(([t, n]) => (
                <Chip key={t} on={fEv === t} onClick={() => setFEv(fEv === t ? "" : t)}>
                  {icoDe(t)} {ROTULO_EV[t] || t} · {n}
                </Chip>
              ))}
            </Fila>
          )}
          {porActor.length > 1 && (
            <Fila titulo="Quién">
              {porActor.map(([a, n]) => (
                <Chip key={a} on={fActor === a} color={a.startsWith("🤖") ? "var(--dim)" : "var(--teal)"}
                  onClick={() => setFActor(fActor === a ? "" : a)}>
                  {a} · {n}
                </Chip>
              ))}
            </Fila>
          )}
        </div>
      )}

      {hayFiltro && (
        <div style={{ color: "var(--muted)", fontSize: 12, margin: "8px 0 2px" }}>
          {lista.length} de {eventos.length}
        </div>
      )}

      <div className="tl" style={{ marginTop: 12 }}>
        {lista.length === 0 && (
          <div className="empty" style={{ padding: "14px 0" }}>Nada con esos filtros.</div>
        )}
        {agruparEventos(lista as any[]).map((f, i) =>
          f.grupo
            ? <EventoGrupo key={i} items={f.grupo} horaDe={(x: any) => x.hora || ""}
                conEntidad={!!(f.grupo[0] as any)?.entidadNombre} />
            : <EventoHistorial key={i} e={f.solo} hora={(f.solo as any).hora || ""}
                conEntidad={!!(f.solo as any).entidadNombre} />
        )}
      </div>
    </div>
  );
}
