"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { guardarPrecontratos } from "@/app/actions";
import { montoDeItems, rotuloItem, precontratoNuevo, normalizarPre, type Precontrato } from "@/lib/precontratos";
import { nombreRubro, type ItemPre } from "@/lib/rubros";

/* Precontratos del equipo nombrado. Una fila por persona; el monto se HEREDA de
   los ítems del presupuesto que marques (puede ser la suma de varios). Se guarda
   en jsonb y genera el .docx por persona vía /api/precontrato. Autosave en blur. */

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const inp = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 12.5, outline: "none", color: "var(--text)" } as const;
const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

type PersonaEq = { id: string; nombre: string; alias?: string; ruc_dni?: string };

export default function Precontratos({ postulacionId, equipo, items, inicial }: {
  postulacionId: string;
  equipo: any[];
  items: ItemPre[];
  inicial: Precontrato[] | null;
}) {
  // Equipo nombrado, sin repetir persona (puede estar en proyecto y postulación).
  const personas = useMemo(() => {
    const vistos = new Set<string>();
    const out: { persona: PersonaEq; cargo: string }[] = [];
    for (const m of equipo || []) {
      const p = m?.persona;
      if (!p?.id || vistos.has(p.id)) continue;
      vistos.add(p.id);
      out.push({ persona: p, cargo: (m.cargo || "").trim() });
    }
    return out;
  }, [equipo]);

  // Cargo por defecto de cada persona (el del equipo): sirve para saber si el
  // usuario cambió el rol y así no descartar esa edición al guardar.
  const cargoBase = useMemo(() => {
    const m = new Map<string, string>();
    personas.forEach(({ persona, cargo }) => m.set(persona.id, cargo));
    return m;
  }, [personas]);

  // Una fila por persona: la guardada si existe, si no una nueva con su cargo.
  // ⚠ CADA fila necesita un id ÚNICO: setF matea por id y el .docx se busca por
  // id — sin uid propio, todas las filas nuevas compartirían "" y se pisarían.
  const guardadas = (inicial || []).map(normalizarPre);
  const [filas, setFilas] = useState<Precontrato[]>(
    personas.map(({ persona, cargo }) => {
      const g = guardadas.find(f => f.persona_id === persona.id);
      return g ? { ...g, id: g.id || uid() } : { ...precontratoNuevo(persona.id, cargo), id: uid() };
    })
  );
  const [estado, setEstado] = useState<"ok" | "guardando" | "error">("ok");

  /* Reconciliar las filas con el equipo ACTUAL. Si el equipo cambió después de
     montar —agregaste o quitaste a alguien y hubo refresh—, `filas` se quedaba
     sin esa persona y el render reventaba (fila undefined). Aquí se agrega la
     fila que falte y se descarta la de quien ya no está, SIN perder lo editado
     de los demás. El guardia evita re-render en bucle cuando nada cambió. */
  useEffect(() => {
    setFilas(prev => {
      const porId = new Map(prev.map(f => [f.persona_id, f]));
      const next = personas.map(({ persona, cargo }) => {
        const ex = porId.get(persona.id);
        if (ex) return ex;
        const g = guardadas.find(f => f.persona_id === persona.id);
        return g ? { ...g, id: g.id || uid() } : { ...precontratoNuevo(persona.id, cargo), id: uid() };
      });
      const igual = next.length === prev.length && next.every((f, i) => f === prev[i]);
      return igual ? prev : next;
    });
    // guardadas se recalcula cada render; basta con reaccionar a `personas`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas]);

  const itemDe = (id: string) => items.find(i => i.id === id) || null;
  // Solo los ítems que TODAVÍA existen en el presupuesto (los demás son huérfanos).
  const idsValidos = (f: Precontrato) => f.item_ids.filter(id => itemDe(id));

  // Persistimos las filas con contenido real: ítems VÁLIDOS, firmado, forma,
  // nota, o un rol distinto del que trae el equipo (para no perder lo tecleado).
  // Usamos ítems válidos, no el bruto: una fila que quedó solo con huérfanos y
  // nada más se descarta y así se limpia sola.
  const conContenido = (f: Precontrato) =>
    idsValidos(f).length > 0 || f.estado === "firmado" || !!f.forma_pago || !!f.notas ||
    (f.cargo || "") !== (cargoBase.get(f.persona_id) || "");

  const cola = useRef<Promise<any>>(Promise.resolve());
  const persistir = (next: Precontrato[]) => {
    setEstado("guardando");
    const limpio = next.filter(conContenido);
    cola.current = cola.current.then(async () => {
      const r: any = await guardarPrecontratos(postulacionId, limpio);
      setEstado(r?.error ? "error" : "ok");
    });
    return cola.current;
  };
  const guardarActual = () => persistir(filas);

  // Generar: primero asegura el guardado (la fila DEBE estar en la base para que
  // la ruta la encuentre por id) y recién entonces dispara la descarga.
  const generar = async (id: string) => {
    await persistir(filas);
    window.location.href = `/api/precontrato?post=${postulacionId}&pre=${id}`;
  };

  const setF = (id: string, patch: Partial<Precontrato>) =>
    setFilas(filas.map(f => f.id === id ? { ...f, ...patch } : f));

  // Marca/desmarca un ítem en la fila (el honorario es la suma de los marcados).
  const toggleItem = (id: string, itemId: string) => {
    const f = filas.find(x => x.id === id);
    if (!f) return;
    const next = f.item_ids.includes(itemId)
      ? f.item_ids.filter(x => x !== itemId)
      : [...f.item_ids, itemId];
    setF(id, { item_ids: next });
  };
  // Deja solo los ítems que siguen en el presupuesto (limpia los huérfanos).
  const quitarHuerfanos = (id: string) => {
    const f = filas.find(x => x.id === id);
    if (!f) return;
    const next = f.item_ids.filter(x => itemDe(x));
    setF(id, { item_ids: next });
    persistir(filas.map(x => x.id === id ? { ...x, item_ids: next } : x));
  };

  const total = filas.reduce((s, f) => s + montoDeItems(items, f.item_ids), 0);
  const firmados = filas.filter(f => f.estado === "firmado").length;

  if (!personas.length) return (
    <div className="card">
      <b style={{ fontSize: 13 }}>📝 Precontratos del equipo</b>
      <p style={{ color: "var(--dim)", fontSize: 12, marginTop: 6 }}>
        Agrega personas al equipo (proyecto o postulación) para armar sus precontratos.
      </p>
    </div>
  );

  return (
    <div className="card" onBlur={guardarActual}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>📝 Precontratos del equipo</b>
        <span style={{ color: "var(--dim)", fontSize: 11 }}>
          {estado === "guardando" ? "guardando…" : estado === "error" ? "⚠ no se guardó" : "guardado ✓"}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
          comprometido <b style={{ color: "var(--text)" }}>{soles(total)}</b> · {firmados}/{filas.length} firmados
        </span>
      </div>
      <p style={{ color: "var(--dim)", fontSize: 11.5, margin: "4px 0 10px" }}>
        💡 El monto lo heredan los ítems del presupuesto que marques (puede ser la suma de varios) — así el documento y lo presupuestado nunca se contradicen.
      </p>

      {!items.length && (
        <div style={{ color: "var(--yellow)", fontSize: 11.5, marginBottom: 8 }}>
          ⚠ El presupuesto aún no tiene ítems. Arma el presupuesto para poder asignar montos.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {personas.map(({ persona }) => {
          // Fallback por si el equipo creció en este mismo render y el efecto
          // de reconciliación aún no corrió: nunca undefined (no revienta).
          const f = filas.find(x => x.persona_id === persona.id)
            ?? { ...precontratoNuevo(persona.id, ""), id: persona.id };
          const monto = montoDeItems(items, f.item_ids);
          const validos = f.item_ids.filter(id => itemDe(id));
          const huerfanos = f.item_ids.length - validos.length;   // ítems ya borrados del presupuesto
          const puedeDoc = validos.length > 0;                     // al menos un ítem que existe
          return (
            <div key={persona.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>{persona.nombre}</b>
                {persona.ruc_dni && <span style={{ color: "var(--dim)", fontSize: 11 }}>· {persona.ruc_dni}</span>}
                <span style={{
                  marginLeft: "auto", fontSize: 11, padding: "2px 8px", borderRadius: 999,
                  background: f.estado === "firmado" ? "rgba(46,204,113,.15)" : "var(--bg)",
                  color: f.estado === "firmado" ? "var(--green)" : "var(--muted)",
                  border: "1px solid var(--border)",
                }}>{f.estado === "firmado" ? "✅ firmado" : "○ pendiente"}</span>
              </div>

              <label style={{ fontSize: 11, color: "var(--dim)", display: "block" }}>
                Rol acordado
                <input value={f.cargo} placeholder="p. ej. Director"
                  onChange={e => setF(f.id, { cargo: e.target.value })}
                  style={{ ...inp, width: "100%", marginTop: 3 }} />
              </label>

              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Ítems del presupuesto (el honorario suma los marcados)</span>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: monto ? "var(--text)" : "var(--dim)" }}>
                    {monto ? soles(monto) : "—"}{validos.length > 1 ? ` · ${validos.length} ítems` : ""}
                  </span>
                </div>
                {items.length > 0 && (
                  <div style={{ marginTop: 4, maxHeight: 160, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                    {items.map(i => {
                      const marcado = f.item_ids.includes(i.id);
                      return (
                        <label key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "3px 4px", borderRadius: 4, cursor: "pointer", background: marcado ? "rgba(155,89,182,.10)" : "transparent" }}>
                          <input type="checkbox" checked={marcado} onChange={() => toggleItem(f.id, i.id)} />
                          <span style={{ color: "var(--text)" }}>{rotuloItem(i, nombreRubro)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "end", marginTop: 8 }}>
                <label style={{ fontSize: 11, color: "var(--dim)" }}>
                  Estado
                  <select value={f.estado}
                    onChange={e => setF(f.id, { estado: e.target.value as Precontrato["estado"], firmado_en: e.target.value === "firmado" ? (f.firmado_en || new Date().toISOString().slice(0, 10)) : "" })}
                    style={{ ...inp, marginTop: 3 }}>
                    <option value="pendiente">Pendiente</option>
                    <option value="firmado">Firmado</option>
                  </select>
                </label>
                <label style={{ fontSize: 11, color: "var(--dim)" }}>
                  Forma de pago (opcional)
                  <input value={f.forma_pago} placeholder="50% a la firma, 50% a la entrega"
                    onChange={e => setF(f.id, { forma_pago: e.target.value })}
                    style={{ ...inp, width: "100%", marginTop: 3 }} />
                </label>
              </div>

              {f.estado === "firmado" && (
                <label style={{ fontSize: 11, color: "var(--dim)", display: "block", marginTop: 8 }}>
                  Firmado el
                  <input type="date" value={f.firmado_en}
                    onChange={e => setF(f.id, { firmado_en: e.target.value })}
                    style={{ ...inp, marginTop: 3, marginLeft: 6 }} />
                </label>
              )}

              {huerfanos > 0 && (
                <div style={{ color: "var(--yellow)", fontSize: 11, marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span>⚠ {huerfanos === 1 ? "1 ítem marcado ya no está" : `${huerfanos} ítems marcados ya no están`} en el presupuesto (no suman al monto).</span>
                  <button onClick={() => quitarHuerfanos(f.id)}
                    style={{ ...inp, padding: "3px 8px", fontSize: 11, cursor: "pointer", color: "var(--yellow)" }}>
                    Quitarlos
                  </button>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                {puedeDoc ? (
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}
                    onClick={() => generar(f.id)}>
                    📄 Generar .docx
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Asigna un ítem del presupuesto para generar el documento.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
