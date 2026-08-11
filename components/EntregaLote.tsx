"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import { prestarEquipos } from "@/app/actions";
import { porQueNo, nombraPieza, type PiezaKit, type KitVista } from "@/lib/kits";

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
 *
 * ── POR KIT ──
 * Doce casillas marcadas a mano es la misma pieza por pieza de antes, solo que
 * en una pantalla. Elegir «Entrevista PRO» marca sus equipos de golpe. Lo que
 * no puede salir NO se marca y se dice con nombre y motivo: un kit que sale
 * cojo en silencio se descubre en el sitio de rodaje, a dos horas de Cusco.
 * El préstamo guarda de qué kit salió, para que la vuelta sepa contar.
 */

type Eq = { id: string; folio?: string | null; nombre: string; categoria?: string | null; estado?: string | null; quien?: string | null };

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function EntregaLote({ equipos, personas, proyectos, kits = [], kitInicial = "" }: {
  equipos: Eq[];
  personas: CatalogoItem[];
  proyectos: CatalogoItem[];
  kits?: KitVista[];
  /** Kit preelegido al llegar desde el panel de kits (?kit=…). */
  kitInicial?: string;
}) {
  const router = useRouter();

  /* Solo lo entregable. Un equipo en reparación no se ofrece siquiera: es más
     honesto que ofrecerlo y rechazarlo después. */
  const libres = useMemo(
    () => equipos.filter(e => e.estado === "disponible")
      .sort((a, b) => (a.folio || "").localeCompare(b.folio || "")),
    [equipos]);
  const librePorId = useMemo(() => new Set(libres.map(e => e.id)), [libres]);
  const porId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);

  const kitsVivos = useMemo(() => kits.filter(k => !k.retirado && k.equipoIds.length), [kits]);

  /* Qué marca un kit y qué no. Se calcula aquí y no en el clic para que el
     aviso siga siendo cierto si la lista cambia bajo los pies. */
  const reparteKit = (kitId: string) => {
    const k = kitsVivos.find(x => x.id === kitId);
    if (!k) return { k: null, van: [] as string[], fuera: [] as PiezaKit[] };
    const van: string[] = [], fuera: PiezaKit[] = [];
    k.equipoIds.forEach(id => {
      const e = porId.get(id);
      if (!e) return;
      if (librePorId.has(id)) van.push(id);
      else fuera.push({ id: e.id, folio: e.folio, nombre: e.nombre, estado: e.estado, quien: e.quien });
    });
    return { k, van, fuera };
  };

  const arranque = kitInicial ? reparteKit(kitInicial) : null;

  const [abierto, setAbierto] = useState(!!arranque?.k);
  const [quien, setQuien] = useState<{ id: string; nombre: string } | null>(null);
  const [proy, setProy] = useState<{ id: string; nombre: string } | null>(null);
  const [nota, setNota] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set(arranque?.van || []));
  /* VARIOS kits a la vez, y no uno. Los chips ya se comportaban como
     multiselección —marcar un kit AÑADÍA a lo marcado, a propósito: un rodaje
     sale con el kit de entrevista más el trípode grande— pero solo se
     recordaba el último, y apagar un chip no quitaba nada.
     Así que mirar cinco kits para decidir dejaba los cinco marcados: 54
     equipos listos para entregar y ningún sitio donde se dijera de dónde
     habían salido. No fallaba; sumaba en silencio. */
  const [kitsSel, setKitsSel] = useState<Set<string>>(
    new Set(arranque?.k ? [kitInicial] : []));
  const [filtro, setFiltro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  /* Lo que los kits elegidos NO pudieron marcar, con nombre y motivo, de
     todos a la vez. Se calcula de la selección de kits y no se guarda: un
     aviso guardado envejece —el equipo vuelve, el aviso sigue diciendo que
     falta— y aquí lo que se enseña tiene que ser cierto ahora. */
  const fuera = useMemo(
    () => [...kitsSel].map(id => {
      const { k, fuera: f } = reparteKit(id);
      return k && f.length ? { k, piezas: f } : null;
    }).filter(Boolean) as { k: KitVista; piezas: PiezaKit[] }[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kitsSel, equipos]);

  /* De qué kit sale cada equipo marcado. Si está en dos kits elegidos manda
     el primero: hay que escribir UNO en el préstamo, y el primero es el que
     la persona eligió antes —el que tenía en la cabeza al armar la salida. */
  const kitDe = useMemo(() => {
    const m: Record<string, string> = {};
    [...kitsSel].forEach(kid => {
      const k = kitsVivos.find(x => x.id === kid);
      k?.equipoIds.forEach(id => { if (sel.has(id) && !m[id]) m[id] = kid; });
    });
    return m;
  }, [kitsSel, kitsVivos, sel]);

  const deAlgunKit = (id: string) => !!kitDe[id];

  /* Los marcados, para la segunda lista. En orden de FOLIO y no en el orden en
     que se fueron marcando: esta lista existe para repasarla contra los
     equipos que están sobre la mesa, y las etiquetas físicas están ordenadas
     por folio. El orden de clics es la historia de cómo se armó, que a nadie
     le sirve al entregar. */
  const marcados = useMemo(() => libres.filter(e => sel.has(e.id)), [libres, sel]);

  function alternaKit(id: string) {
    const { k, van } = reparteKit(id);
    if (!k) return;
    setMsg(null);

    if (kitsSel.has(id)) {
      /* Apagar el chip QUITA sus piezas. Antes solo apagaba la luz y las
         dejaba marcadas, que es como se llega a 54 equipos sin quererlo.
         Menos las que también trae otro kit encendido: quitar «Drone» no
         puede llevarse la batería que «Grabación Rápida» también necesita. */
      const otros = [...kitsSel].filter(x => x !== id);
      const salvadas = new Set(otros.flatMap(x => reparteKit(x).van));
      setKitsSel(new Set(otros));
      setSel(s => {
        const n = new Set(s);
        van.forEach(eq => { if (!salvadas.has(eq)) n.delete(eq); });
        return n;
      });
      return;
    }

    /* Se AÑADE a lo que ya hubiera marcado, no se reemplaza: un rodaje sale
       con el kit de entrevista MÁS el trípode grande, y borrarle la selección
       a alguien porque eligió un kit es perder trabajo hecho. */
    setKitsSel(s => new Set([...s, id]));
    setSel(s => new Set([...s, ...van]));
  }

  /* Los kits que de verdad salen: solo si queda marcado algo suyo. Elegir un
     kit y después desmarcarle todo y aun así etiquetar el préstamo con él
     sería mentir en el historial. */
  const kitsEfectivos = useMemo(
    () => kitsVivos.filter(k => kitsSel.has(k.id) && k.equipoIds.some(id => sel.has(id))),
    [kitsVivos, kitsSel, sel]);

  async function entregar() {
    if (!quien || !sel.size) return;
    setOcupado(true); setMsg(null);
    const r: any = await prestarEquipos([...sel], quien.id, proy?.id || null, nota, kitDe);
    setOcupado(false);
    if (r?.error) { setMsg(`⚠ ${r.error}`); return; }
    /* Lo omitido se dice, no se traga: quien entrega tiene que enterarse ahora,
       no cuando busque la cámara el sábado. */
    setMsg(`✔ ${r.entregados} equipo(s) a ${quien.nombre}` +
      (r.omitidos?.length ? ` · ⚠ fuera: ${r.omitidos.join(", ")}` : ""));
    setSel(new Set()); setNota(""); setKitsSel(new Set());
    router.refresh();
  }

  if (!abierto) {
    return (
      <div className="card" id="entregar">
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
    <div className="card" id="entregar">
      <div className="panel-h" style={{ color: "var(--yellow)" }}>🤝 Entregar equipos</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <EntPicker etiqueta={quien ? `👤 ${quien.nombre}` : "👤 ¿A quién?"} items={personas}
          onPick={id => { const p = personas.find(x => x.id === id); if (p) setQuien({ id: p.id, nombre: p.nombre }); }} />
        <EntPicker etiqueta={proy ? `📁 ${proy.nombre}` : "📁 ¿Para qué proyecto? (opcional)"} items={proyectos}
          onPick={id => { const p = proyectos.find(x => x.id === id); if (p) setProy({ id: p.id, nombre: p.nombre }); }} />
        <input className="ent-lote-inp" placeholder="Nota (opcional): «sale el 2, vuelve el 5»"
          value={nota} onChange={ev => setNota(ev.target.value)} style={{ flex: 1, minWidth: 200 }} />
      </div>

      {/* ── Por kit ── */}
      {kitsVivos.length > 0 && (
        <div className="kit-elige">
          <span style={{ fontSize: 12, color: "var(--muted)" }}>📦 Marcar un kit:</span>
          {kitsVivos.map(k => (
            <button key={k.id} type="button"
              className={`kit-chip${kitsSel.has(k.id) ? " on" : ""}`}
              title={kitsSel.has(k.id) ? `Quitar «${k.nombre}» y sus piezas` : `Marcar las piezas libres de «${k.nombre}»`}
              onClick={() => alternaKit(k.id)}>
              {k.nombre} <span style={{ opacity: .7 }}>· {k.equipoIds.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Lo que el kit NO pudo marcar, con nombre y motivo. Un kit que sale
          cojo en silencio se descubre a dos horas de Cusco. */}
      {fuera.map(({ k, piezas }) => (
        <div key={k.id} className="kit-fuera">
          ⚠ De «{k.nombre}» no {piezas.length === 1 ? "sale 1 pieza" : `salen ${piezas.length} piezas`}:{" "}
          {piezas.map((p, i) => (
            <span key={p.id}>
              {i > 0 && " · "}<b>{nombraPieza(p)}</b> ({porQueNo(p)})
            </span>
          ))}
        </div>
      ))}

      {/* ── DOS LISTAS: DE DÓNDE SE ELIGE Y QUÉ SE ELIGIÓ ──
          Con una sola, saber qué llevas marcado era recorrer doscientas filas
          buscando los cuadraditos azules —y con el buscador escrito, los
          marcados que no coinciden con el filtro ni siquiera se ven: se
          entregaban a ciegas—. La segunda lista es la que se repasa contra
          los equipos que están sobre la mesa antes de firmar.
          Lado a lado y no una debajo de otra: la de la izquierda se recorre
          mientras se mira crecer la de la derecha, que es el gesto real. */}
      <div className="ent-dos">
        <div>
          <input className="ent-lote-inp" placeholder="Buscar por folio, nombre o categoría…"
            value={filtro} onChange={ev => setFiltro(ev.target.value)} style={{ width: "100%", marginBottom: 6 }} />
          <div className="ent-col-h">
            <span>Disponibles</span>
            <span className="ent-col-n">{vistos.length}{filtro && vistos.length !== libres.length ? ` de ${libres.length}` : ""}</span>
          </div>
          <div className="ent-caja">
            {vistos.length === 0 && (
              <div style={{ padding: 12, color: "var(--dim)", fontSize: 13 }}>
                {libres.length ? "Nada coincide con esa búsqueda." : "No hay equipos disponibles."}
              </div>
            )}
            {vistos.map(e => (
              <label key={e.id} className="ent-lote-fila" data-marcada={sel.has(e.id) ? "1" : undefined}>
                <input type="checkbox" checked={sel.has(e.id)} onChange={() => alterna(e.id)} />
                {e.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: 10.5 }}>{e.folio}</span>}
                <span style={{ flex: 1, fontSize: 13.5 }}>{e.nombre}</span>
                {deAlgunKit(e.id) && <span className="kit-marca">del kit</span>}
                {e.categoria && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{e.categoria}</span>}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="ent-col-h marcados">
            <span>🤝 Se entregan</span>
            <span className="ent-col-n">{marcados.length}</span>
            <span style={{ flex: 1 }} />
            {marcados.length > 0 && (
              <button type="button" className="dato-btn" style={{ color: "var(--dim)" }}
                onClick={() => { setSel(new Set()); setKitsSel(new Set()); }}>
                Quitar todo
              </button>
            )}
          </div>
          <div className="ent-caja">
            {marcados.length === 0
              ? <div style={{ padding: 12, color: "var(--dim)", fontSize: 12.5, lineHeight: 1.5 }}>
                  Nada marcado todavía. Búscalo a la izquierda, o elige un kit arriba y se marca entero.
                </div>
              : marcados.map(e => (
                <div key={e.id} className="ent-lote-fila elegida">
                  {e.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: 10.5 }}>{e.folio}</span>}
                  <span style={{ flex: 1, fontSize: 13.5 }}>{e.nombre}</span>
                  {deAlgunKit(e.id) && <span className="kit-marca">del kit</span>}
                  {/* Quitar desde aquí: si hay que quitar uno, es mirando ESTA
                      lista —«sobran las baterías»—, y volver a buscarlo en la
                      de la izquierda para desmarcarlo es el paso que sobra. */}
                  <button type="button" className="ent-quita" title={`Quitar ${nombraPieza(e as any)}`}
                    onClick={() => alterna(e.id)}>✕</button>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button className="btn" disabled={ocupado || !quien || !sel.size} onClick={entregar}>
          {ocupado ? "Entregando…" : `Entregar ${sel.size || ""} equipo${sel.size === 1 ? "" : "s"}`}
        </button>
        <button className="btn btn-ghost" onClick={() => { setSel(new Set()); setMsg(null); setKitsSel(new Set()); setAbierto(false); }}>
          Cerrar
        </button>
        {kitsEfectivos.length > 0 && (
          <span style={{ fontSize: 11.5, color: "var(--violet)" }}>
            📦 se registra como {kitsEfectivos.map(k => `«${k.nombre}»`).join(" + ")}
          </span>
        )}
        {!quien && sel.size > 0 && (
          <span style={{ color: "var(--yellow)", fontSize: 12 }}>Falta elegir a quién.</span>
        )}
        {msg && <span style={{ fontSize: 12, color: msg.startsWith("⚠") ? "var(--red)" : "var(--green)" }}>{msg}</span>}
      </div>
    </div>
  );
}
