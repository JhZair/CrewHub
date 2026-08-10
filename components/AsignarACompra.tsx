"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { asignarACompra } from "@/app/compras/acciones";

/* SUMAR AL COMBO EQUIPOS QUE YA EXISTEN.
 *
 * El alta en lote sirve para lo que se compra de ahora en adelante. Pero el
 * inventario ya tiene 208 equipos cargados, y lo que falta de ellos no es
 * la ficha: es decir QUÉ VINO JUNTO. Las cinco radios ya estaban; lo que no
 * había era forma de contar que fueron una sola compra.
 *
 * Dos cosas que esta pantalla no puede hacer callando:
 *  · Un equipo que YA está en otro combo se ofrece igual, pero diciendo en
 *    cuál. Esconderlo obligaría a adivinar por qué no aparece; moverlo sin
 *    avisar reescribiría una procedencia que alguien registró.
 *  · Lo que se quita no se borra: sale del combo y sigue en el inventario,
 *    sin procedencia. Se dice.
 */

export type EqLibre = {
  id: string; folio?: string | null; nombre: string;
  categoria?: string | null; estado?: string | null;
  compra_id?: string | null; compra?: string | null;
};

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function AsignarACompra({ compraId, equipos }: {
  compraId: string; equipos: EqLibre[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  /* Los que ya son de este combo no se ofrecen aquí: se quitan desde la
     lista de arriba, que es donde se ven. */
  const candidatos = useMemo(
    () => equipos.filter(e => e.compra_id !== compraId),
    [equipos, compraId]);

  const vistos = useMemo(() => {
    const ps = nrm(filtro).split(/\s+/).filter(Boolean);
    const base = ps.length
      ? candidatos.filter(e => {
          const t = nrm(`${e.folio || ""} ${e.nombre} ${e.categoria || ""}`);
          return ps.every(p => t.includes(p));
        })
      : candidatos;
    /* Sin búsqueda no se vuelcan 200 filas: se pide que busque. Una lista
       de doscientos con casillas invita a marcar la que no era. */
    return ps.length ? base.slice(0, 60) : [];
  }, [candidatos, filtro]);

  const alterna = (id: string) =>
    setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function sumar() {
    if (!sel.size) return;
    setOcupado(true); setErr(""); setMsg("");
    const r: any = await asignarACompra([...sel], compraId);
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    setMsg(`✔ ${r.movidos} equipo(s) sumados al combo.`);
    setSel(new Set()); setFiltro("");
    router.refresh();
  }

  if (!abierto) {
    return (
      <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12, marginTop: 8 }}
        onClick={() => setAbierto(true)}>
        ＋ Sumar equipos que ya existen
      </button>
    );
  }

  return (
    <div className="cmp-asignar">
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
        Busca los equipos que vinieron en esta compra y márcalos. Ya están registrados: esto
        solo añade de dónde salieron.
      </div>
      <input className="ent-lote-inp" autoFocus value={filtro} onChange={e => setFiltro(e.target.value)}
        placeholder="Buscar por folio, nombre o categoría — «radio», «A-127»…"
        style={{ width: "100%" }} />

      <div className="cmp-lista">
        {!filtro.trim() && (
          <div style={{ padding: 11, color: "var(--dim)", fontSize: 12.5 }}>
            Escribe algo para buscar entre los {candidatos.length} equipos del inventario.
          </div>
        )}
        {filtro.trim() && !vistos.length && (
          <div style={{ padding: 11, color: "var(--dim)", fontSize: 12.5 }}>Nada coincide con «{filtro}».</div>
        )}
        {vistos.map(e => (
          <label key={e.id} className="ent-lote-fila">
            <input type="checkbox" checked={sel.has(e.id)} onChange={() => alterna(e.id)} />
            {e.folio && <span className="badge kit-folio">{e.folio}</span>}
            <span style={{ flex: 1, fontSize: 13.5 }}>{e.nombre}</span>
            {/* Ya tiene procedencia: se ofrece igual, pero diciendo cuál.
                Marcarlo la reescribe, y eso hay que saberlo antes. */}
            {e.compra_id && (
              <span style={{ color: "var(--yellow)", fontSize: 11, fontStyle: "italic" }}>
                ya es de {e.compra || "otro combo"}
              </span>
            )}
            {e.categoria && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{e.categoria}</span>}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 9 }}>
        <button className="btn" disabled={ocupado || !sel.size} onClick={sumar}>
          {ocupado ? "Sumando…" : `Sumar ${sel.size || ""} al combo`}
        </button>
        <button className="btn btn-ghost" onClick={() => { setAbierto(false); setSel(new Set()); setFiltro(""); setMsg(""); }}>
          Cerrar
        </button>
        {msg && <span style={{ color: "var(--green)", fontSize: 12 }}>{msg}</span>}
        {err && <span style={{ color: "var(--red)", fontSize: 12 }}>⚠ {err}</span>}
      </div>
    </div>
  );
}

/** Sacar una unidad del combo. No la borra: la deja en el inventario sin
 *  procedencia, que es lo que era antes de asignarla. */
export function SacarDelCombo({ equipoId }: { equipoId: string }) {
  const router = useRouter();
  const [pide, setPide] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  if (!pide) {
    return (
      <button className="dato-btn" style={{ color: "var(--dim)" }} title="Sacar de este combo (no borra el equipo)"
        onClick={e => { e.preventDefault(); setPide(true); }}>✕</button>
    );
  }
  return (
    <span style={{ fontSize: 11, whiteSpace: "nowrap" }} onClick={e => e.preventDefault()}>
      ¿sacar del combo?{" "}
      <button style={{ color: "var(--red)", fontWeight: 700 }} disabled={ocupado}
        onClick={async e => {
          e.preventDefault(); setOcupado(true);
          await asignarACompra([equipoId], null);
          setOcupado(false); setPide(false); router.refresh();
        }}>sí</button>
      {" / "}
      <button style={{ color: "var(--dim)" }} onClick={e => { e.preventDefault(); setPide(false); }}>no</button>
    </span>
  );
}
