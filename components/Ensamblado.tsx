"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ensamblar, desensamblar } from "@/app/actions";
import PiezasKit from "@/components/PiezasKit";
import { type PiezaKit, type EqBase } from "@/lib/kits";

/* EQUIPO ENSAMBLADO — de qué está hecho.
 *
 * El tercer eje del inventario, y el único que es físico:
 *   · COMBO       con qué ENTRÓ.      Un hecho del pasado: no cambia.
 *   · KIT         con qué SALE.       Una decisión, reversible en un clic.
 *   · ENSAMBLADO  de qué ESTÁ HECHO.  Para deshacerlo hace falta un
 *                                     destornillador.
 *
 * Un monopod de paneo son siete piezas atornilladas. Cada una se compró y
 * tiene su boleta, pero mientras está montada NO se presta sola: ofrecerla en
 * la lista de entrega es ofrecer algo que habría que desarmar. Por eso montar
 * una pieza la pone en estado «ensamblado» y la saca del escogedor — que es
 * toda la funcionalidad, dicha en una línea.
 *
 * No es una tabla como `kits` porque un kit es una LISTA y un ensamblado es
 * una COSA: se presta, se cae al suelo, lleva una etiqueta con su folio y
 * puede salir dentro de un kit. Todo eso ya lo sabe hacer un equipo.
 *
 * El VALOR no se mueve. Cada pieza sigue contando su precio en el patrimonio;
 * el ensamblado no se compró, se armó. Lo que se enseña aquí —«7 piezas ·
 * S/ 340»— es una suma en pantalla, no un dato guardado, así que el total del
 * inventario no cuenta nada dos veces.
 */

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Ensamblado({ equipoId, montadoEn, piezas, candidatos }: {
  equipoId: string;
  /** Si ESTE equipo está montado dentro de otro, quién lo contiene. */
  montadoEn?: { id: string; folio?: string | null; nombre: string } | null;
  /** Lo que este equipo lleva montado dentro. */
  piezas: PiezaKit[];
  /** Equipos que se pueden montar: ni prestados, ni ya montados, ni él mismo. */
  candidatos: EqBase[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");
  const [pide, setPide] = useState(false);

  const vistos = useMemo(() => {
    const ps = nrm(filtro).split(/\s+/).filter(Boolean);
    if (!ps.length) return candidatos.slice(0, 40);
    return candidatos.filter(e =>
      ps.every(p => nrm(`${e.folio || ""} ${e.nombre} ${e.categoria || ""} ${e.subcategoria || ""}`).includes(p))
    ).slice(0, 40);
  }, [candidatos, filtro]);

  const valor = piezas.reduce((s, p) => s + (Number(p.valor) || 0), 0);

  async function montar() {
    if (!sel.size) return;
    setOcupado(true); setErr("");
    const r: any = await ensamblar(equipoId, [...sel]);
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    setSel(new Set()); setFiltro(""); setAbierto(false);
    router.refresh();
  }

  async function desmontar(ids: string[]) {
    setOcupado(true); setErr("");
    const r: any = await desensamblar(ids);
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    setPide(false);
    router.refresh();
  }

  /* Si este equipo ES una pieza de otro, lo primero que hay que saber es de
     cuál: buscarlo en el almacén y no encontrarlo porque está atornillado
     dentro del monopod es exactamente el rato que esto viene a evitar. */
  if (montadoEn) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <h4 className="ens-h">🔩 Montado en otro equipo</h4>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
          Esta pieza está atornillada dentro de{" "}
          <a href={`/entidad/equipamiento/${montadoEn.id}`} style={{ color: "var(--violet)", fontWeight: 600 }}>
            {montadoEn.folio ? `${montadoEn.folio} · ` : ""}{montadoEn.nombre}
          </a>
          , así que no se presta sola. Para liberarla, desmóntala desde la ficha de ese equipo.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h4 className="ens-h">
        🔩 {piezas.length ? "Ensamblado con" : "Piezas montadas"}
        {piezas.length > 0 && (
          <span className="ens-res">
            {piezas.length} pieza{piezas.length === 1 ? "" : "s"}
            {valor > 0 && <> · S/ {Math.round(valor).toLocaleString("es-PE")}</>}
          </span>
        )}
      </h4>

      {piezas.length === 0 && !abierto && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.55, marginBottom: 8 }}>
          Si este equipo está armado con otras piezas del inventario —varilla, cabezal, adaptadores,
          tornillos— móntalas aquí: dejan de ofrecerse por separado al entregar, y este equipo pasa a
          entregarse como una sola cosa.
        </div>
      )}

      {/* Las piezas con la MISMA fila que un kit: es la misma pregunta —qué hay
          dentro y en qué estado— y dos filas distintas para lo mismo divergen
          a la primera corrección. */}
      {/* Con ✕ por pieza: sacar el cabezal para el trípode grande es lo que
          pasa de verdad, y obligar a «desarmar entero» para eso haría que se
          hiciera en el estante y no en el sistema. Desarmar entero se queda
          para cuando de verdad se deshace todo. */}
      {piezas.length > 0 && (
        <PiezasKit piezas={piezas} enCasa
          onQuitar={ocupado ? undefined : (id) => desmontar([id])} />
      )}

      {err && <div className="err-inline" style={{ marginTop: 8 }}>⚠ {err}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 9 }}>
        {abierto
          ? <button className="btn btn-ghost" onClick={() => { setAbierto(false); setSel(new Set()); setErr(""); }}>Cancelar</button>
          : <button className="dato-add" onClick={() => setAbierto(true)}>＋ Montar piezas</button>}
        {piezas.length > 0 && !abierto && (
          pide
            ? <span style={{ fontSize: 11.5 }}>
                ¿Desarmarlo entero? sus {piezas.length} piezas vuelven a estar disponibles{" "}
                <button style={{ color: "var(--red)", fontWeight: 700 }} disabled={ocupado}
                  onClick={() => desmontar(piezas.map(p => p.id))}>sí</button>
                {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setPide(false)}>no</button>
              </span>
            : <button className="dato-btn" style={{ color: "var(--dim)" }} onClick={() => setPide(true)}>
                Desarmar entero
              </button>
        )}
      </div>

      {abierto && (
        <div style={{ marginTop: 9 }}>
          <input className="ent-lote-inp" placeholder="Buscar por folio, nombre o categoría…"
            value={filtro} onChange={e => setFiltro(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
          <div className="ent-caja">
            {vistos.length === 0 && (
              <div style={{ padding: 12, color: "var(--dim)", fontSize: 12.5 }}>
                {candidatos.length
                  ? "Nada coincide con esa búsqueda."
                  : "No hay piezas libres para montar: todo lo demás está prestado o ya montado en otro equipo."}
              </div>
            )}
            {vistos.map(e => (
              <label key={e.id} className="ent-lote-fila" data-marcada={sel.has(e.id) ? "1" : undefined}>
                <input type="checkbox" checked={sel.has(e.id)}
                  onChange={() => setSel(s => { const n = new Set(s); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; })} />
                <span className="kit-pz-img">
                  {e.cartel
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={e.cartel} alt="" referrerPolicy="no-referrer" />
                    : <span>🎥</span>}
                </span>
                {e.folio && <span className="badge kit-folio">{e.folio}</span>}
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 13.5 }}>{e.nombre}</span>
                  {(e.subcategoria || e.categoria) && (
                    <span style={{ fontSize: 10, color: "var(--dim)" }}>{e.subcategoria || e.categoria}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
          {/* El tope se DICE. Cortar a cuarenta en silencio hace pensar que la
              pieza que falta no existe, y el reflejo entonces es crearla otra
              vez — un duplicado nacido de un límite invisible. */}
          {candidatos.length > vistos.length && (
            <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 5 }}>
              Se muestran {vistos.length} de {candidatos.length}. Escribe para encontrar el resto.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 9 }}>
            <button className="btn" disabled={ocupado || !sel.size} onClick={montar}>
              {ocupado ? "Montando…" : `Montar ${sel.size || ""} pieza${sel.size === 1 ? "" : "s"}`}
            </button>
            <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
              dejan de ofrecerse por separado al entregar
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
