"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import { prestarEquipos } from "@/app/actions";

/* SALIDA A RODAJE — entregar muchos equipos a una persona de una vez.
 *
 * El modelo ya decía quién tiene qué: `equipo_prestamos` es persona + proyecto
 * + desde/hasta. Lo que faltaba no era una tabla, era la velocidad: entregar
 * doce equipos eran doce fichas abiertas, y lo que ocurría de verdad es que no
 * se registraba nada y el inventario decía «disponible» con la camioneta en
 * Yaurisque.
 *
 * Una persona, un proyecto, N equipos, un botón. Lo que no se puede entregar
 * (reparación, perdido, de baja) ni siquiera se ofrece, y si algo cambió de
 * estado mientras tanto el servidor lo devuelve nombrado, no lo calla.
 */

type Eq = { id: string; folio?: string | null; nombre: string; categoria?: string | null; estado?: string | null };

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function EntregaLote({ equipos, personas, proyectos }: {
  equipos: Eq[];
  personas: CatalogoItem[];
  proyectos: CatalogoItem[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [quien, setQuien] = useState<{ id: string; nombre: string } | null>(null);
  const [proy, setProy] = useState<{ id: string; nombre: string } | null>(null);
  const [nota, setNota] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /* Solo lo entregable. Un equipo en reparación no se ofrece siquiera: es más
     honesto que ofrecerlo y rechazarlo después. */
  const libres = useMemo(
    () => equipos.filter(e => e.estado === "disponible")
      .sort((a, b) => (a.folio || "").localeCompare(b.folio || "")),
    [equipos]);

  const vistos = useMemo(() => {
    const ps = nrm(filtro).split(/\s+/).filter(Boolean);
    if (!ps.length) return libres;
    return libres.filter(e => {
      const t = nrm(`${e.folio || ""} ${e.nombre} ${e.categoria || ""}`);
      return ps.every(p => t.includes(p));
    });
  }, [libres, filtro]);

  const alterna = (id: string) =>
    setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function entregar() {
    if (!quien || !sel.size) return;
    setOcupado(true); setMsg(null);
    const r: any = await prestarEquipos([...sel], quien.id, proy?.id || null, nota);
    setOcupado(false);
    if (r?.error) { setMsg(`⚠ ${r.error}`); return; }
    /* Lo omitido se dice, no se traga: quien entrega tiene que enterarse ahora,
       no cuando busque la cámara el sábado. */
    setMsg(`✔ ${r.entregados} equipo(s) a ${quien.nombre}` +
      (r.omitidos?.length ? ` · ⚠ fuera: ${r.omitidos.join(", ")}` : ""));
    setSel(new Set()); setNota("");
    router.refresh();
  }

  if (!abierto) {
    return (
      <div className="card">
        <button className="btn" onClick={() => setAbierto(true)}>
          🤝 Entregar equipos a alguien
        </button>
        <span style={{ color: "var(--dim)", fontSize: 12, marginLeft: 10 }}>
          {libres.length} disponibles
        </span>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="panel-h" style={{ color: "var(--yellow)" }}>🤝 Entregar equipos</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <EntPicker etiqueta={quien ? `👤 ${quien.nombre}` : "👤 ¿A quién?"} items={personas}
          onPick={id => { const p = personas.find(x => x.id === id); if (p) setQuien({ id: p.id, nombre: p.nombre }); }} />
        <EntPicker etiqueta={proy ? `📁 ${proy.nombre}` : "📁 ¿Para qué proyecto? (opcional)"} items={proyectos}
          onPick={id => { const p = proyectos.find(x => x.id === id); if (p) setProy({ id: p.id, nombre: p.nombre }); }} />
        <input className="ent-lote-inp" placeholder="Nota (opcional): «sale el 2, vuelve el 5»"
          value={nota} onChange={ev => setNota(ev.target.value)} style={{ flex: 1, minWidth: 200 }} />
      </div>

      <input className="ent-lote-inp" placeholder="Buscar por folio, nombre o categoría…"
        value={filtro} onChange={ev => setFiltro(ev.target.value)} style={{ width: "100%", marginBottom: 8 }} />

      <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
        {vistos.length === 0 && (
          <div style={{ padding: 12, color: "var(--dim)", fontSize: 13 }}>
            {libres.length ? "Nada coincide con esa búsqueda." : "No hay equipos disponibles."}
          </div>
        )}
        {vistos.map(e => (
          <label key={e.id} className="ent-lote-fila">
            <input type="checkbox" checked={sel.has(e.id)} onChange={() => alterna(e.id)} />
            {e.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: 10.5 }}>{e.folio}</span>}
            <span style={{ flex: 1, fontSize: 13.5 }}>{e.nombre}</span>
            {e.categoria && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{e.categoria}</span>}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button className="btn" disabled={ocupado || !quien || !sel.size} onClick={entregar}>
          {ocupado ? "Entregando…" : `Entregar ${sel.size || ""} equipo${sel.size === 1 ? "" : "s"}`}
        </button>
        <button className="btn btn-ghost" onClick={() => { setSel(new Set()); setMsg(null); setAbierto(false); }}>
          Cerrar
        </button>
        {!quien && sel.size > 0 && (
          <span style={{ color: "var(--yellow)", fontSize: 12 }}>Falta elegir a quién.</span>
        )}
        {msg && <span style={{ fontSize: 12, color: msg.startsWith("⚠") ? "var(--red)" : "var(--green)" }}>{msg}</span>}
      </div>
    </div>
  );
}
