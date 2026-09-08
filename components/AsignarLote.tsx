"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import { prestarEquipos } from "@/app/actions";
import { buscadorDe, pal } from "@/lib/buscar";

/* 📌 ASIGNAR — dar de alta la dotación de alguien de una vez.
 *
 * Asignar no es prestar: es decir dónde VIVE un equipo. La laptop de Michel,
 * la interfaz del puesto de post, la ropa táctica de Katy. Está razonado en
 * db/asignacion.sql y en lib/estadosEquipo.ts.
 *
 * Hasta ahora solo se podía asignar de a uno, desde la ficha de cada equipo.
 * Dar de alta a alguien que entra con ocho cosas eran ocho fichas abiertas —y
 * lo que pasaba de verdad es que no se registraba, y el inventario decía
 * «disponible» sobre cosas que llevaban un año en la casa de alguien.
 *
 * ── LO QUE ESTE PANEL NO PREGUNTA, A PROPÓSITO ──
 * · PROYECTO. Una asignación no es para un rodaje: es de la persona. La ficha
 *   del equipo ya tomó esa decisión y la acción escribe `null` aunque se lo
 *   pasen.
 * · KIT. Un kit dice qué SALE junto a una salida. Nada de eso aplica a algo
 *   que no va a volver el viernes, y etiquetar la asignación con un kit haría
 *   que a la vuelta —que no hay— alguien contara piezas que nadie se llevó.
 *
 * ── DOS LISTAS, COMO EN ENTREGA ──
 * Con una sola, saber qué llevas marcado es recorrer trescientas filas
 * buscando los cuadraditos; y con el buscador escrito, lo marcado que no
 * coincide ni se ve. La de la derecha es la que se repasa antes de confirmar.
 */

type Eq = {
  id: string; folio?: string | null; nombre: string;
  categoria?: string | null; subcategoria?: string | null;
  estado?: string | null; cartel?: string | null;
};

const mini = (url?: string | null) => (
  <span className="kit-pz-img">
    {url
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={url} alt="" referrerPolicy="no-referrer" />
      : <span>🎥</span>}
  </span>
);

export default function AsignarLote({ equipos, personas }: {
  equipos: Eq[];
  personas: CatalogoItem[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [quien, setQuien] = useState<{ id: string; nombre: string } | null>(null);
  const [nota, setNota] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /* Solo lo disponible. Para que un equipo cambie de dueño hay que quitárselo
     antes al anterior —eso es lo que dice el motivo «pasa a otra persona»—, y
     ofrecer aquí algo que ya es de alguien convertiría una reasignación en un
     movimiento silencioso que nadie escribió. El servidor lo veta igual. */
  const libres = useMemo(
    () => equipos.filter(e => e.estado === "disponible")
      .sort((a, b) => (a.folio || "").localeCompare(b.folio || "")),
    [equipos]);

  /* El MISMO motor que el inventario, la entrega y el buscador global:
     `buscadorDe` de lib/buscar, que convierte los guiones bajos en espacios y
     trae la fonética quechua. Dos pestañas de la misma sección con dos ideas
     de «parecido» es cómo se acaba con una que encuentra un equipo y otra
     que no. */
  const pajares = useMemo(
    () => new Map(libres.map(e => [e.id, pal(e.folio, e.nombre, e.categoria, e.subcategoria)])),
    [libres]);
  const coincide = useMemo(() => buscadorDe(filtro), [filtro]);
  const vistos = useMemo(
    () => libres.filter(e => coincide(pajares.get(e.id) || "")),
    [libres, coincide, pajares]);

  const marcados = useMemo(() => libres.filter(e => sel.has(e.id)), [libres, sel]);
  const alterna = (id: string) =>
    setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function asignar() {
    if (!quien || !sel.size) return;
    setOcupado(true); setMsg(null);
    /* `tipo: "asignacion"` es lo único que distingue esto de una entrega. La
       acción es la misma a propósito: son la misma escritura y tener dos
       gemelas sería tener dos sitios donde arreglar el mismo fallo. */
    const r: any = await prestarEquipos([...sel], quien.id, null, nota, null, "asignacion");
    setOcupado(false);
    if (r?.error) { setMsg(`⚠ ${r.error}`); return; }
    /* Lo omitido se dice, no se traga: si algo pasó a reparación mientras se
       marcaban casillas, quien asigna tiene que enterarse ahora. */
    setMsg(`✔ ${r.entregados} equipo(s) a cargo de ${quien.nombre}` +
      (r.omitidos?.length ? ` · ⚠ fuera: ${r.omitidos.join(", ")}` : ""));
    setSel(new Set()); setNota("");
    router.refresh();
  }

  if (!abierto) {
    return (
      <div className="card" id="asignar">
        <button className="btn" onClick={() => setAbierto(true)}>
          📌 Asignar equipos a alguien
        </button>
        <span style={{ color: "var(--dim)", fontSize: 12, marginLeft: 10 }}>
          {libres.length} disponibles
        </span>
      </div>
    );
  }

  return (
    <div className="card" id="asignar">
      <div className="panel-h" style={{ color: "var(--blue)" }}>📌 Asignar equipos</div>

      {/* Qué significa lo que se está a punto de hacer. Sin esto, «asignar» y
          «entregar» son dos botones parecidos en dos pestañas parecidas, y la
          diferencia —que uno crea una deuda y el otro no— solo se descubre
          cuando la ficha empieza a regañar por un equipo que está donde debe. */}
      <div style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.55, marginBottom: 10 }}>
        Queda <b>a su cargo</b> de forma indefinida — su equipo de trabajo, no una
        salida. No se le cuentan días ni se le reclama la vuelta. Para una salida
        de rodaje, usa <b>🤝 Entrega</b>.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <EntPicker etiqueta={quien ? `👤 ${quien.nombre}` : "👤 ¿A cargo de quién?"} items={personas}
          onPick={id => { const p = personas.find(x => x.id === id); if (p) setQuien({ id: p.id, nombre: p.nombre }); }} />
        {/* La nota es lo único que dice POR QUÉ es suya. Sin ella, dentro de un
            año la fila solo dice que Michel tiene una laptop. */}
        <input className="ent-lote-inp" placeholder="¿Por qué es suya? «puesto de post», «dotación 2026»"
          value={nota} onChange={ev => setNota(ev.target.value)} style={{ flex: 1, minWidth: 220 }} />
      </div>

      <div className="ent-dos">
        <div>
          <div className="ent-col-h">
            <span>Disponibles</span>
            <span className="ent-col-n">
              {vistos.length}{filtro && vistos.length !== libres.length ? ` de ${libres.length}` : ""}
            </span>
          </div>
          <div className="ent-top">
            <input className="ent-lote-inp" placeholder="Buscar por folio, nombre o categoría…"
              value={filtro} onChange={ev => setFiltro(ev.target.value)} style={{ width: "100%" }} />
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
                {mini(e.cartel)}
                {e.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: 10.5 }}>{e.folio}</span>}
                <span style={{ flex: 1, fontSize: 13.5 }}>{e.nombre}</span>
                {e.categoria && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{e.categoria}</span>}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="ent-col-h marcados">
            <span>📌 Se asignan</span>
            <span className="ent-col-n">{marcados.length}</span>
          </div>
          <div className="ent-top derecha">
            {marcados.length > 0
              ? <button type="button" className="dato-btn" style={{ color: "var(--dim)" }}
                  onClick={() => setSel(new Set())}>Quitar todo</button>
              : <span style={{ color: "var(--dim)", fontSize: 11.5 }}>lo que se marque aparece aquí</span>}
          </div>
          <div className="ent-caja">
            {marcados.length === 0
              ? <div style={{ padding: 12, color: "var(--dim)", fontSize: 12.5, lineHeight: 1.5 }}>
                  Nada marcado todavía. Búscalo a la izquierda.
                </div>
              : marcados.map(e => (
                <div key={e.id} className="ent-lote-fila elegida">
                  {mini(e.cartel)}
                  {e.folio && <span className="badge" style={{ color: "var(--muted)", background: "#1c1c2c", fontSize: 10.5 }}>{e.folio}</span>}
                  <span style={{ flex: 1, fontSize: 13.5 }}>{e.nombre}</span>
                  {/* Quitar desde AQUÍ: si sobra uno, se ve mirando esta lista,
                      y volver a buscarlo en la de la izquierda para desmarcarlo
                      es el paso que sobra. */}
                  <button type="button" className="ent-quita" title={`Quitar ${e.nombre}`}
                    onClick={() => alterna(e.id)}>✕</button>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn" disabled={ocupado || !quien || !sel.size} onClick={asignar}>
          {ocupado ? "Asignando…" : `📌 Asignar ${sel.size || ""}`.trim()}
        </button>
        <button className="btn btn-ghost" onClick={() => setAbierto(false)}>Cerrar</button>
        {/* Por qué el botón está apagado. Un botón deshabilitado sin motivo se
            interpreta como que la pantalla está rota. */}
        {!ocupado && (!quien || !sel.size) && (
          <span style={{ color: "var(--dim)", fontSize: 12 }}>
            {!quien && !sel.size ? "Falta elegir a quién y marcar equipos."
              : !quien ? "Falta elegir a cargo de quién." : "Falta marcar equipos."}
          </span>
        )}
        {msg && <span style={{ fontSize: 12.5, color: msg.startsWith("⚠") ? "var(--red)" : "var(--green)" }}>{msg}</span>}
      </div>
    </div>
  );
}
