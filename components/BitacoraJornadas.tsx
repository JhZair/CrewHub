"use client";
import { aprobarJornada, editarJornada, borrarJornada } from "@/app/actions";
import MiniSelect from "@/components/MiniSelect";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FRACCIONES, fechaHum, esFinde, ICO_TIPO } from "@/lib/jornadas";

const TIPOS: [string, string][] = [["rodaje", "🎬"], ["oficina", "🏢"], ["scouting", "🚙"]];

const money = (n: number | null) => n != null ? `S/ ${Math.round(n).toLocaleString("es-PE")}` : "—";

const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 8px", fontSize: 12, color: "var(--text)", outline: "none" } as const;

function FilaJornada({ j, esAdmin, puedeEditar, proyectos, onChange }: {
  j: any; esAdmin: boolean; puedeEditar: boolean; proyectos: { id: string; nombre: string }[]; onChange: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [fecha, setFecha] = useState(j.fecha);
  const [proyectoId, setProyectoId] = useState(j.proyecto_id || "");
  const [tipo, setTipo] = useState(j.tipo);
  const [fraccion, setFraccion] = useState<number>(Number(j.fraccion));
  const [noche, setNoche] = useState(!!j.noche);

  const aprobar = async (v: boolean) => {
    setOcupado(true); const r: any = await aprobarJornada(j.id, v); setOcupado(false);
    if (r?.error) alert(r.error); else onChange();
  };
  const guardar = async () => {
    setOcupado(true);
    const r: any = await editarJornada(j.id, fecha, proyectoId || null, tipo, tipo === "oficina" ? fraccion : 1, tipo !== "oficina" && noche);
    setOcupado(false);
    if (r?.error) { alert(r.error); return; }
    setEdit(false); onChange();
  };
  const borrar = async () => {
    const r: any = await borrarJornada(j.id); setBorrando(false);
    if (r?.error) alert(r.error); else onChange();
  };

  if (edit) {
    return (
      <div className="info-row" style={{ gap: 7, flexWrap: "wrap", background: "var(--bg)", borderRadius: 9, padding: 8 }}>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...inp, width: 140 }} />
        <MiniSelect value={proyectoId}
          options={[["", "🏢 Oficina"], ...proyectos.map(p => [p.id, `📁 ${p.nombre}`])]}
          onSelect={setProyectoId} buttonClass="" buttonStyle={{ ...inp, minWidth: 150 }} />
        <span className="jr-seg">
          {TIPOS.map(([v, l]) => (
            <button key={v} className={tipo === v ? "on" : ""}
              onClick={() => { setTipo(v); if (v === "oficina") setNoche(false); else setFraccion(1); }}>{l}</button>
          ))}
        </span>
        {tipo === "oficina" && (
          <span className="jr-seg">
            {FRACCIONES.map(f => <button key={f.v} className={fraccion === f.v ? "on" : ""} onClick={() => setFraccion(f.v)}>{f.corto}</button>)}
          </span>
        )}
        {tipo !== "oficina" && (
          <button className={`jr-chip ${noche ? "on" : ""}`} onClick={() => setNoche(n => !n)}>🏕 {noche ? "✓" : ""}</button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" style={{ padding: "5px 11px", fontSize: 11.5 }} disabled={ocupado} onClick={guardar}>{ocupado ? "…" : "Guardar"}</button>
        <button className="btn btn-ghost" style={{ padding: "5px 9px", fontSize: 11.5 }} onClick={() => setEdit(false)}>Cancelar</button>
      </div>
    );
  }

  /* Una sola línea, sin `flex-wrap`. Con wrap, el ✕ de borrar caía a un
     segundo renglón en cuanto la fila crecía un poco —el 🏕 del pernocte
     bastaba— y esa fila pasaba a ocupar el doble sin decir por qué. Lo que
     cede es el NOMBRE DEL PROYECTO, con puntos suspensivos: es el único dato
     de la fila que se puede recortar sin perder sentido, y el completo queda
     en el tooltip. Los botones nunca se mueven de sitio. */
  return (
    <div className="info-row jr-fila">
      <span className={`jr-fecha${esFinde(j.fecha) ? " finde" : ""}`} title={j.fecha}>
        {fechaHum(j.fecha)}
      </span>
      <span className="jr-quien">{ICO_TIPO[j.tipo] || ""} {j.persona}</span>
      <span className="jr-proy" title={j.proyecto || "sin proyecto"}>{j.proyecto || "sin proyecto"}</span>
      <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{j.fraccion}j{j.noche ? " 🏕" : ""}</span>
      <span style={{ color: "var(--teal)", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{money(j.monto)}</span>
      <span className="badge jr-est" style={{
        fontSize: 10.5,
        color: j.aprobada ? "var(--green)" : "var(--yellow)",
        background: j.aprobada ? "rgba(46,204,113,.12)" : "rgba(244,180,0,.12)",
      }}>{j.aprobada ? "✅ aprobada" : "⏳ pendiente"}</span>
      {esAdmin && (j.aprobada
        ? <button className="dato-btn" disabled={ocupado} onClick={() => aprobar(false)}>↩ quitar</button>
        : <button className="dato-btn" disabled={ocupado} onClick={() => aprobar(true)}>✅ aprobar</button>)}
      {puedeEditar && <button className="dato-btn" title="Editar" onClick={() => setEdit(true)}>✎</button>}
      {puedeEditar && (borrando
        ? <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>¿borrar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={borrar}>sí</button>{" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(false)}>no</button></span>
        : <button className="dato-btn" style={{ color: "var(--dim)" }} title="Borrar" onClick={() => setBorrando(true)}>✕</button>)}
    </div>
  );
}

/* Nombre del mes de una fecha ISO: «2026-07-…» → «julio 2026». */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const rotuloMes = (ym: string) => {
  const [a, m] = ym.split("-").map(Number);
  return `${MESES[(m || 1) - 1]} ${a}`;
};
/** Todos los días de un mes «AAAA-MM», sin pasar de hoy. */
const diasDelMes = (ym: string) => {
  const [a, m] = ym.split("-").map(Number);
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const ultimo = new Date(a, m, 0).getDate();
  const enCurso = hoy.getFullYear() === a && hoy.getMonth() + 1 === m;
  /* En el mes en curso se corta en HOY: pintar en cero los días que aún no han
     llegado sería contarlos como no trabajados. */
  const tope = enCurso ? hoy.getDate() : (new Date(a, m - 1, 1) > hoy ? 0 : ultimo);
  return Array.from({ length: tope }, (_, i) =>
    `${a}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
};

export default function BitacoraJornadas({ items, esAdmin = false, miPersonaId = "", proyectos = [], titulo = "🗒 Jornadas del mes", bloqueado = false, porMes = false, diasVacios = false, plegable = true }: {
  items: any[]; esAdmin?: boolean; miPersonaId?: string; proyectos?: { id: string; nombre: string }[]; titulo?: string; bloqueado?: boolean;
  /** Subdivide cada persona por mes. Para listas que cruzan varios. */
  porMes?: boolean;
  /** Pinta también los días sin jornada, apagados y en 0.
   *  ⚠ Solo tiene sentido si `items` trae el mes COMPLETO. Con una lista
   *  filtrada (p. ej. solo pendientes), un día ya aprobado se dibujaría como
   *  «no trabajado», que es mentira sobre lo que ya se revisó. */
  diasVacios?: boolean;
  /** Envolver todo en un plegable con su rótulo.
   *
   *  En /jornadas sí: el detalle diario son treinta filas al final de una
   *  página con más cosas, y poder cerrarlo de un clic es la diferencia entre
   *  ver tu resumen y hacer scroll hasta encontrarlo.
   *  En administración no: la pestaña YA es la sección. Ahí el rótulo repetía
   *  el mes y el «por aprobar» que están dos líneas más arriba, y cerrarlo
   *  dejaba la pantalla en negro — un control cuyo único efecto es esconder
   *  todo lo que hay. */
  plegable?: boolean;
}) {
  const router = useRouter();
  const onChange = () => router.refresh();
  const pend = items.filter(j => !j.aprobada).length;

  /* ── Agrupado por PERSONA ──
   * Treinta y nueve filas seguidas ordenadas por fecha obligan a reconstruir a
   * ojo cuánto lleva cada quien: la fila dice el nombre, pero el total no está
   * en ninguna parte y hay que sumarlo mentalmente saltando entre nombres.
   * Aprobar es una decisión POR PERSONA —«¿le corresponden estas doce
   * jornadas?»—, así que ese es el grupo natural.
   * Dentro de cada persona se conserva el orden que traía (por fecha): el
   * detalle diario sigue leyéndose como un diario. */
  const grupos = new Map<string, { nombre: string; items: any[] }>();
  items.forEach(j => {
    const k = j.persona_id || j.persona || "—";
    const g = grupos.get(k) || { nombre: j.persona || "—", items: [] };
    g.items.push(j); grupos.set(k, g);
  });
  /* Primero quien tiene más por aprobar: es lo accionable. A igual pendiente,
     alfabético — un orden que no depende de los datos no se mueve solo. */
  const lista = [...grupos.entries()]
    .map(([id, g]) => {
      const p = g.items.filter(j => !j.aprobada);
      return {
        id, ...g,
        nPend: p.length,
        jorn: g.items.reduce((s, j) => s + (Number(j.fraccion) || 0), 0),
        montoPend: p.reduce((s, j) => s + (Number(j.monto) || 0), 0),
        monto: g.items.reduce((s, j) => s + (Number(j.monto) || 0), 0),
      };
    })
    .sort((a, b) => b.nPend - a.nPend || a.nombre.localeCompare(b.nombre, "es"));

  const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

  /* Plegable por persona. Arranca ABIERTO quien tiene algo por aprobar y
     cerrado quien no: lo que está resuelto no necesita ocupar pantalla, y así
     lo primero que se ve es lo que hay que hacer. Con una sola persona
     —/jornadas, que es personal— se abre igual: plegar tu propio mes cuando es
     lo único que hay solo esconde la página.
     `useState` con inicializador y no un `<details open>`: React reescribe el
     atributo en cada render y el panel se volvería a abrir solo. */
  const [cerrados, setCerrados] = useState<Set<string>>(() =>
    new Set(lista.length > 1 ? lista.filter(g => g.nPend === 0).map(g => g.id) : []));
  const alternar = (id: string) =>
    setCerrados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* CADA PERSONA, SU TARJETA. Antes había UNA tarjeta con todo dentro —el mes
     entero, las cuatro personas, sus cuarenta filas— y aprobar es una decisión
     por persona: «¿le corresponden a MichelM estas ocho jornadas?». Con las
     cuatro en la misma caja, el marco de fuera agrupaba lo que no va junto y
     no había nada separando lo que sí.
     El plegable de arriba se queda —sin caja— porque en /jornadas es el fold
     de «Detalle diario del mes», y ahí sirve: esconde treinta filas de un
     tirón. Lo que se va es su borde, que era el que sobraba. */
  const cuerpo = (
      <div style={{ marginTop: 8 }}>
        {lista.map(g => (
          <div key={g.id} className="jr-grupo card">
            <div className="jr-grupo-h">
              <button className="dato-btn jr-plegar"
                title={cerrados.has(g.id) ? `Ver las jornadas de ${g.nombre}` : "Plegar"}
                onClick={() => alternar(g.id)}>{cerrados.has(g.id) ? "▸" : "▾"}</button>
              <b>{g.nombre}</b>
              <span className="jr-grupo-n">{g.jorn}j · {g.items.length} registro{g.items.length === 1 ? "" : "s"}</span>
              <span style={{ flex: 1 }} />
              {g.nPend > 0
                ? <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)" }}>
                    ⏳ {g.nPend} · {soles(g.montoPend)}
                  </span>
                : <span className="badge" style={{ color: "var(--green)", background: "rgba(46,204,113,.12)" }}>✅ al día</span>}
              <span className="jr-grupo-t">{soles(g.monto)}</span>
            </div>
            {!cerrados.has(g.id) && (() => {
              const pinta = (j: any) => (
                <FilaJornada key={j.id} j={j} esAdmin={esAdmin}
                  puedeEditar={!bloqueado && (esAdmin || (j.persona_id === miPersonaId && !j.aprobada))}
                  proyectos={proyectos} onChange={onChange} />
              );
              if (!porMes) return g.items.map(pinta);

              /* Por mes: una lista que cruza julio y agosto se lee como una
                 sola tanda y esconde que lo de julio lleva ahí un mes. Cada
                 mes con su propio recuento, del más reciente al más viejo —lo
                 nuevo es lo que se aprueba primero—. */
              const meses = new Map<string, any[]>();
              g.items.forEach(j => {
                const k = String(j.fecha || "").slice(0, 7);
                meses.set(k, [...(meses.get(k) || []), j]);
              });
              return [...meses.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([ym, js]) => {
                const nP = js.filter(j => !j.aprobada).length;
                const porDia = new Map<string, any[]>();
                js.forEach(j => porDia.set(j.fecha, [...(porDia.get(j.fecha) || []), j]));
                const dias = diasVacios ? diasDelMes(ym) : [];
                const vacios = dias.filter(d => !porDia.has(d)).length;
                return (
                  <div key={ym} className="jr-mes">
                    <div className="jr-mes-h">
                      <span>{rotuloMes(ym)}</span>
                      <span className="jr-grupo-n">
                        {js.reduce((s, j) => s + (Number(j.fraccion) || 0), 0)}j
                        {nP > 0 && <> · ⏳ {nP}</>}
                        {vacios > 0 && <> · {vacios} día(s) sin registrar</>}
                      </span>
                    </div>
                    {diasVacios
                      ? dias.slice().reverse().map(d => {
                          const js2 = porDia.get(d);
                          if (js2) return js2.map(pinta);
                          /* Un día sin jornada se ve, apagado: el hueco es el
                             dato —no se distingue «descansó» de «lo olvidó»—
                             y después de aprobar el mes corregirlo cuesta. */
                          return (
                            <div key={d} className="info-row jr-fila jr-dia-vacio">
                              <span className={`jr-fecha${esFinde(d) ? " finde" : ""}`}>{fechaHum(d)}</span>
                              <span className="jr-proy">—</span>
                              <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>0j</span>
                            </div>
                          );
                        })
                      : js.map(pinta)}
                  </div>
                );
              });
            })()}
          </div>
        ))}
        {!items.length && <div className="empty">Sin jornadas este mes.</div>}
      </div>
  );

  if (!plegable) return cuerpo;
  return (
    <details className="jr-todo" open>
      <summary className="jr-todo-h">
        {titulo} · {items.length}{pend ? ` · ⏳ ${pend} por aprobar` : " · todas aprobadas ✅"}
      </summary>
      {cuerpo}
    </details>
  );
}
