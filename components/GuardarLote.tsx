"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarEn, type Destino } from "@/app/equipamiento/acciones";
import { SinNavegar } from "@/components/FilaPop";
import ChipPiezas, { type PiezaMontada } from "@/components/ChipPiezas";
import { buscadorDe, pal } from "@/lib/buscar";

/* ══════════════════════════════════════════════════════════════════════════
   📍 ANOTAR EL SITIO DE VARIOS DE UNA VEZ

   El aviso de arriba dice «497 equipos sin sitio anotado» y hasta ahora la
   única forma de arreglarlo era abrir 497 fichas. Un dato que solo se puede
   rellenar de uno en uno sobre quinientas filas no se rellena: se queda como
   está y el aviso se vuelve parte del mobiliario.

   Es el mismo problema que ya resolvió `AsignarLote` para las asignaciones
   —«dar de alta a alguien que entra con ocho cosas eran ocho fichas abiertas, y
   lo que pasaba de verdad es que no se registraba»— y por eso es la misma
   forma: dos columnas, el mismo buscador del inventario, y la de la derecha es
   la que se repasa antes de confirmar.

   ── EL DESTINO PUEDE SER UN SITIO O UN BOLSO ──
   Las dos respuestas que db/sitios.sql separó: el Cajón 08 es un SITIO y el
   Bolso Tenba es un EQUIPO que contiene a otros. Las dos se ofrecen aquí, en su
   propio grupo, porque las dos son cosas que se hacen a puñados: vaciar una
   caja en un cajón, o meter dieciséis cosas en el bolso con el que salen.
   `guardarEn` recibe el destino y limpia el otro puntero en el mismo `update`.

   ── LO ATORNILLADO NO SALE EN LA LISTA ──
   ⚠ Una pieza montada dentro de otra NO puede tener sitio propio: lo hereda de
   su anfitrión y el check de la base rechaza el update entero. Ofrecerlas aquí
   sería dejar marcar veinte cosas para que el guardado falle por tres, así que
   se filtran antes y se dice cuántas — no es que falten, es que su sitio se
   cambia moviendo el equipo que las lleva.
   ══════════════════════════════════════════════════════════════════════════ */

export type EqLote = {
  id: string; folio?: string | null; nombre: string;
  categoria?: string | null; subcategoria?: string | null;
  cartel?: string | null;
  ensamblado_en?: string | null;
  piezas?: PiezaMontada[];
};

export type OpcionSitio = { id: string; cod: string | null; ruta: string };

const mini = (url?: string | null) => (
  <span className="kit-pz-img">
    {url
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={url} alt="" referrerPolicy="no-referrer" />
      : <span>🎥</span>}
  </span>
);

export default function GuardarLote({ candidatos, sitios, contenedores }: {
  /** Los que no tienen sitio, atornillados incluidos: se filtran aquí para
   *  poder decir cuántos se quedaron fuera y por qué. */
  candidatos: EqLote[];
  sitios: OpcionSitio[];
  contenedores: { id: string; folio?: string | null; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState<
    { tipo: "sitio" | "equipo"; id: string; texto: string } | null>(null);
  const [qDest, setQDest] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const montadas = useMemo(() => candidatos.filter(e => e.ensamblado_en), [candidatos]);
  const libres = useMemo(
    () => candidatos.filter(e => !e.ensamblado_en)
      .sort((a, b) => (a.folio || "").localeCompare(b.folio || "")),
    [candidatos]);

  /* El MISMO motor que el inventario, la entrega y el buscador global:
     `buscadorDe` de lib/buscar. Dos pestañas de la misma sección con dos ideas
     de «parecido» es cómo se acaba con una que encuentra un equipo y otra que
     no. */
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

  /* ⚠ «Marcar todo» marca LO QUE SE VE, no los cuatrocientos noventa y siete.
     Con el buscador escrito es lo único que puede querer decir, y sin filtro
     marcar quinientos de golpe es un movimiento que nadie puede repasar en la
     columna de la derecha antes de confirmarlo. */
  const marcaVistos = () => setSel(s => {
    const n = new Set(s); vistos.forEach(e => n.add(e.id)); return n;
  });

  const dest = useMemo(() => {
    const q = qDest.trim().toLowerCase();
    const casa = (t: string) => !q || t.toLowerCase().includes(q);
    return {
      sitios: sitios.filter(o => casa(`${o.cod || ""} ${o.ruta}`)).slice(0, 25),
      equipos: contenedores.filter(c => casa(`${c.folio || ""} ${c.nombre}`)).slice(0, 25),
    };
  }, [sitios, contenedores, qDest]);

  /* ⚠ EN TANDAS, Y NO DE UNA. `guardarEn` mete los ids en un `.in("id", …)`,
     que PostgREST manda en la URL: cuatrocientos UUID son quince kilobytes de
     dirección y el servidor la corta —414, o peor, un error que no dice que el
     problema es el tamaño—. Ochenta caben de sobra.
     Si una tanda falla se PARA y se dice cuántos entraron: seguir dejaría el
     lote a medias sin que nadie sepa por dónde iba, y «✔ 400 guardados» sobre
     240 escritos es la mentira que más cuesta descubrir. */
  const TANDA = 80;

  async function guardar() {
    if (!destino || !sel.size) return;
    setOcupado(true); setMsg(null);
    const d: Destino = destino.tipo === "sitio" ? { sitio: destino.id } : { equipo: destino.id };
    const ids = [...sel];
    let hechos = 0;
    for (let i = 0; i < ids.length; i += TANDA) {
      const r: any = await guardarEn("equipo", ids.slice(i, i + TANDA), d);
      if (r?.error) {
        setOcupado(false);
        setMsg(`⚠ ${r.error}`
          + (hechos ? ` · se alcanzaron a guardar ${hechos} antes de parar.` : ""));
        router.refresh();
        return;
      }
      hechos += r?.guardados || 0;
    }
    setOcupado(false);
    setMsg(`✔ ${hechos} equipo(s) se guardan en ${destino.texto}`);
    setSel(new Set());
    router.refresh();
  }

  if (!abierto) {
    return (
      <button type="button" className="btn" style={{ marginTop: 10 }}
        onClick={() => setAbierto(true)}>
        📍 Anotar el sitio de varios de una vez
      </button>
    );
  }

  /* Envuelto en `SinNavegar`: aquí hay un formulario a medio llenar y las filas
     de los pop-up de los chips son enlaces a la ficha del equipo. Un clic
     curioso y `router.push` se lleva lo marcado sin preguntar y sin error. El
     porqué, en `FilaPop`. */
  return (
    <SinNavegar>
      <div className="card" style={{ marginTop: 10 }}>
        <div className="panel-h" style={{ color: "var(--teal)" }}>📍 Anotar sitio en lote</div>

        {/* Qué significa lo que se está a punto de hacer. Es la distinción que
            db/sitios.sql tuvo que escribir entera, y aquí es donde se puede
            equivocar a puñados. */}
        <div style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.55, marginBottom: 10 }}>
          Esto es <b>dónde se guarda</b>, no dónde está ahora. Si Katy se llevó la
          cámara, su sitio sigue siendo el Cajón 08 porque es adonde vuelve —
          dónde está hoy ya lo contesta 🤝 Entrega.
        </div>

        {/* ── EL DESTINO ── */}
        <div className="ent-top">
          <input className="ent-lote-inp" placeholder="¿Dónde? Un sitio (OF01-M01-C08) o el bolso donde va…"
            value={qDest} onChange={e => setQDest(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div className="dsg-lista" style={{ maxHeight: 190, marginBottom: 10 }}>
          {dest.sitios.map(o => (
            <button key={o.id} type="button" className="dsg-op" disabled={ocupado}
              onClick={() => setDestino({ tipo: "sitio", id: o.id, texto: o.cod || o.ruta })}>
              <span className="dsg-ico">📍</span>
              {o.cod && <span className="badge dsg-clave">{o.cod}</span>}
              <span className="dsg-op-n">{o.ruta}</span>
            </button>
          ))}
          {dest.equipos.map(c => (
            <button key={c.id} type="button" className="dsg-op" disabled={ocupado}
              onClick={() => setDestino({ tipo: "equipo", id: c.id, texto: c.nombre })}>
              <span className="dsg-ico">🎒</span>
              {c.folio && <span className="badge kit-folio">{c.folio}</span>}
              <span className="dsg-op-n">{c.nombre}</span>
            </button>
          ))}
          {!dest.sitios.length && !dest.equipos.length && (
            <div className="dsg-vacio">Nada coincide. Los sitios se crean abajo, en el árbol.</div>
          )}
        </div>
        {destino && (
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            Van a <b style={{ color: "var(--teal)" }}>
              {destino.tipo === "sitio" ? "📍" : "🎒"} {destino.texto}
            </b>
            <button type="button" className="dato-btn" style={{ marginLeft: 8 }}
              onClick={() => setDestino(null)}>cambiar</button>
          </div>
        )}

        <div className="ent-dos">
          <div>
            <div className="ent-col-h">
              <span>Sin sitio anotado</span>
              <span className="ent-col-n">
                {vistos.length}{filtro && vistos.length !== libres.length ? ` de ${libres.length}` : ""}
              </span>
            </div>
            <div className="ent-top">
              <input className="ent-lote-inp" placeholder="Buscar por folio, nombre o categoría…"
                value={filtro} onChange={e => setFiltro(e.target.value)} style={{ flex: 1 }} />
              {vistos.length > 0 && (
                <button type="button" className="dato-btn" onClick={marcaVistos}>
                  marcar {filtro ? "lo que se ve" : "todo"}
                </button>
              )}
            </div>
            <div className="ent-caja">
              {!vistos.length && (
                <div style={{ padding: 12, color: "var(--dim)", fontSize: 13 }}>
                  {libres.length ? "Nada coincide con esa búsqueda." : "Todos tienen sitio anotado."}
                </div>
              )}
              {vistos.map(e => (
                <label key={e.id} className="ent-lote-fila" data-marcada={sel.has(e.id) ? "1" : undefined}>
                  <input type="checkbox" checked={sel.has(e.id)} onChange={() => alterna(e.id)} />
                  {mini(e.cartel)}
                  {e.folio && <span className="badge kit-folio">{e.folio}</span>}
                  <span style={{ flex: 1, fontSize: 13.5 }}>{e.nombre}</span>
                  <ChipPiezas piezas={e.piezas || []} />
                  {e.categoria && <span style={{ color: "var(--dim)", fontSize: 11.5 }}>{e.categoria}</span>}
                </label>
              ))}
            </div>
            {montadas.length > 0 && (
              <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                ⚠ {montadas.length} no salen aquí porque están atornilladas dentro de
                otro equipo: se guardan donde él, y su sitio cambia moviéndolo a él.
              </div>
            )}
          </div>

          <div>
            <div className="ent-col-h marcados">
              <span>📍 Se guardan aquí</span>
              <span className="ent-col-n">{marcados.length}</span>
            </div>
            <div className="ent-top derecha">
              {marcados.length > 0
                ? <button type="button" className="dato-btn" style={{ color: "var(--dim)" }}
                    onClick={() => setSel(new Set())}>Quitar todo</button>
                : <span style={{ color: "var(--dim)", fontSize: 11.5 }}>lo que se marque aparece aquí</span>}
            </div>
            <div className="ent-caja">
              {!marcados.length
                ? <div style={{ padding: 12, color: "var(--dim)", fontSize: 12.5, lineHeight: 1.5 }}>
                    Nada marcado todavía. Búscalo a la izquierda.
                  </div>
                : marcados.map(e => (
                  <div key={e.id} className="ent-lote-fila elegida">
                    {mini(e.cartel)}
                    {e.folio && <span className="badge kit-folio">{e.folio}</span>}
                    <span style={{ flex: 1, fontSize: 13.5 }}>{e.nombre}</span>
                    <button type="button" className="dato-btn"
                      onClick={() => alterna(e.id)}>quitar</button>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {msg && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: msg.startsWith("⚠") ? "var(--red)" : "var(--green)" }}>
            {msg}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <button type="button" className="btn" disabled={ocupado || !destino || !sel.size}
            onClick={guardar}>
            {ocupado ? "Guardando…" : `Guardar ${marcados.length || ""} aquí`.trim()}
          </button>
          <button type="button" className="dato-btn" onClick={() => setAbierto(false)}>cerrar</button>
          {!destino && <span style={{ color: "var(--dim)", fontSize: 12 }}>elige antes el destino</span>}
        </div>
      </div>
    </SinNavegar>
  );
}
