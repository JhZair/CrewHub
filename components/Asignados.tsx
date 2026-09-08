"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import Avatar from "@/components/Avatar";
import { quitarAsignacion } from "@/app/actions";
import CajaBuscar from "@/components/CajaBuscar";
import ChipPiezas, { type PiezaMontada } from "@/components/ChipPiezas";
import { buscadorDe, pal } from "@/lib/buscar";
import { META_MOTIVO, MOTIVOS_ELEGIBLES, type MotivoFin } from "@/lib/asignaciones";

/* 📌 QUIÉN TIENE ASIGNADO QUÉ
 *
 * El espejo de «En uso ahora», con una diferencia que lo cambia todo: esta
 * lista NO es de cosas que tienen que volver. Es dónde vive cada equipo. Por
 * eso no hay «hace N días» ni botón de devolver: nadie debe nada.
 *
 * Lo que sí hace falta y no existía en ningún sitio: verlo TODO junto. Hasta
 * ahora había que abrir persona por persona, y la pregunta que se hace de
 * verdad —«¿qué hay que recuperar si alguien se va?», «¿quién tiene la
 * segunda cámara?»— no se podía contestar sin recorrer el inventario.
 *
 * ── LO QUE ESTÁ FUERA AHORA MISMO ──
 * Un equipo asignado puede salir a un rodaje: la asignación se APARTA y vuelve
 * sola al devolverlo (db/asignacion-suspender.sql). Esas filas se pintan
 * igual, marcadas: sigue siendo suyo, pero hoy no lo tiene encima. Esconderlas
 * sería mentir en las dos direcciones — quien busca «¿de quién es esto?» no lo
 * encontraría, y quien cuenta lo de alguien contaría de menos.
 */

export type AsigItem = {
  id: string;            // id de la fila de la asignación
  desde: string | null;
  nota: string | null;
  eqId?: string; folio?: string | null; nombre: string;
  cartel?: string | null;
  categoria?: string | null; subcategoria?: string | null;
  valor?: number | null;
  perId: string; per: string; foto?: string | null;
  /** Quién se la dio. */
  entrego?: string | null;
  /** Si está apartada por un rodaje: a qué proyecto salió. `null` si no. */
  fueraEn?: string | null;
  /** `true` aunque no se sepa el proyecto. */
  fuera?: boolean;
  /** Lo que lleva atornillado dentro. Aquí es donde más falta hace: el día que
   *  alguien deja el colectivo, lo que hay que recuperar no son ocho fichas,
   *  son ocho fichas MÁS lo que va montado dentro de ellas — y eso no se ve
   *  mirando el equipo. */
  piezas?: PiezaMontada[];
};

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

/* Fecha corta y sin «hace N días». Es deliberado: contar días es el lenguaje
   de una deuda, y aquí no hay ninguna. Que Katy tenga la ropa táctica desde
   hace catorce meses es lo correcto. */
const fechaCorta = (f?: string | null) => {
  if (!f) return "";
  const [a, m, d] = f.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a.slice(2)}` : f;
};

export default function Asignados({ items }: { items: AsigItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const hayFiltro = !!q.trim();

  /* El MISMO motor que el inventario, la entrega y el buscador global. Dos
     pestañas de la misma sección con dos ideas de «parecido» es cómo se acaba
     con una que encuentra un equipo y otra que no. */
  const pajares = useMemo(
    () => new Map(items.map(i =>
      [i.id, pal(i.per, i.folio, i.nombre, i.categoria, i.subcategoria, i.nota, i.fueraEn)])),
    [items]);
  const coincide = useMemo(() => buscadorDe(q), [q]);

  /* Agrupado por persona. `items` lleva TODO lo suyo —para el total en soles,
     que es la cifra que se mira el día que alguien se va— y `visibles` solo lo
     que pasa el filtro. Contar sobre lo filtrado convertiría el total en una
     cifra que cambia al teclear, y esa cifra se usa para reclamar. */
  const grupos = useMemo(() => {
    const m = new Map<string, { perId: string; per: string; foto?: string | null; items: AsigItem[] }>();
    for (const it of items) {
      if (!m.has(it.perId)) m.set(it.perId, { perId: it.perId, per: it.per, foto: it.foto, items: [] });
      m.get(it.perId)!.items.push(it);
    }
    return [...m.values()]
      .map(g => ({ ...g, visibles: g.items.filter(i => coincide(pajares.get(i.id) || "")) }))
      .filter(g => g.visibles.length > 0)
      .sort((a, b) => b.items.length - a.items.length || a.per.localeCompare(b.per, "es"));
  }, [items, coincide, pajares]);

  const totalFuera = useMemo(() => items.filter(i => i.fuera).length, [items]);

  if (!items.length) return null;

  return (
    <div className="card">
      <div className="panel-h" style={{ color: "var(--blue)" }}>
        📌 A cargo de alguien
        <span style={{ color: "var(--dim)", fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
          {items.length} equipo{items.length === 1 ? "" : "s"}
          {" · "}{new Set(items.map(i => i.perId)).size} persona{new Set(items.map(i => i.perId)).size === 1 ? "" : "s"}
          {totalFuera > 0 && ` · ${totalFuera} en un rodaje ahora`}
        </span>
      </div>

      {/* ⚠ La caja se pinta SIEMPRE que haya filtro escrito, aunque queden
          pocas filas. Con un umbral por cantidad, quitarle equipos a alguien
          podía bajar el total por debajo del umbral y DESMONTAR el buscador
          con el texto dentro: el filtro seguía aplicándose y la pantalla
          quedaba vacía, sin input, sin ✕ y sin forma de salir salvo recargar.
          Es el mismo encierro que hubo en «En uso ahora». */}
      {(items.length >= 8 || hayFiltro) && (
        <CajaBuscar valor={q} alCambiar={setQ}
          placeholder={`Busca entre los ${items.length} que están a cargo de alguien: persona, folio, equipo, nota…`}
          etiqueta="Buscar entre los equipos asignados" />
      )}

      {grupos.length === 0 && (
        <div style={{ padding: "10px 2px", color: "var(--dim)", fontSize: 12.5 }}>
          Nada coincide con esa búsqueda.
        </div>
      )}

      {grupos.map(g => {
        const total = g.items.reduce((a, i) => a + (Number(i.valor) || 0), 0);
        const escondidos = g.items.length - g.visibles.length;
        return (
          <div key={g.perId} className="eq-uso-grupo">
            <div className="eq-uso-h">
              <Link href={`/entidad/persona/${g.perId}`} className="eq-uso-per">
                <Avatar nombre={g.per} src={g.foto} size={26} /> {g.per}
              </Link>
              {/* Con filtro, «3 de 24»: decir «3 equipos» de quien tiene
                  veinticuatro es falso, y encima se lee como que le quitaron
                  los otros veintiuno. Es la misma regla que en «En uso ahora»,
                  y por el mismo motivo. */}
              <span style={{ color: "var(--dim)", fontSize: 11.5 }}>
                {escondidos > 0
                  ? `${g.visibles.length} de ${g.items.length}`
                  : `${g.items.length} equipo${g.items.length === 1 ? "" : "s"}`}
              </span>
              <span className="spacer" />
              {/* La cifra que se mira el día que alguien deja el colectivo. */}
              {total > 0 && (
                <span style={{ color: "var(--teal)", fontWeight: 700, fontSize: 12 }}
                  title="Lo que hay que recuperar si deja el equipo. Suma el precio de cada cosa asignada.">
                  {soles(total)}
                </span>
              )}
            </div>
            {g.visibles.map(i => (
              <Fila key={i.id} it={i} alHecho={() => router.refresh()} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* Una fila y su ✕. El motivo se pregunta en la propia fila y no en un modal:
   quitar una asignación es un gesto de dos segundos que se hace mirando la
   lista, y sacar un modal encima esconde justamente lo que se está mirando. */
function Fila({ it, alHecho }: { it: AsigItem; alHecho: () => void }) {
  const [preguntando, setPreguntando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function quitar(motivo: MotivoFin) {
    setOcupado(true); setErr(null);
    const r: any = await quitarAsignacion(it.id, motivo);
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    setPreguntando(false);
    alHecho();
  }

  return (
    <>
      <div className="eq-uso-fila">
        <span className="eq-uso-mini">
          {it.cartel
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={it.cartel} alt="" referrerPolicy="no-referrer" />
            : <span>🎥</span>}
        </span>
        <div className="eq-uso-txt">
          <div className="eq-uso-l1">
            {it.folio && <span className="badge eq-uso-folio">{it.folio}</span>}
            <Link href={`/entidad/equipamiento/${it.eqId}`} className="eq-uso-nom">{it.nombre}</Link>
            <ChipPiezas piezas={it.piezas || []}
              titulo="Va armado: pulsa para ver qué piezas lleva dentro" />
            {/* Sigue siendo suyo, pero hoy no lo tiene encima. Se dice en la
                fila y no escondiéndola: quien busca «¿de quién es esto?» tiene
                que encontrarlo igual. */}
            {it.fuera && (
              <span className="badge" style={{ color: "var(--yellow)", background: "rgba(244,180,0,.12)", fontSize: 10.5 }}
                title="Salió a un rodaje. Vuelve a su persona sola al devolverlo: la asignación no se ha perdido, está apartada.">
                🤝 en un rodaje{it.fueraEn ? ` · ${it.fueraEn}` : ""}
              </span>
            )}
          </div>
          <div className="eq-uso-l2">
            {it.categoria && <span>{it.categoria}</span>}
            {it.subcategoria && <><span className="eq-uso-sep">·</span><span>{it.subcategoria}</span></>}
            {it.valor ? <><span className="eq-uso-sep">·</span><span style={{ color: "var(--teal)" }}>{soles(it.valor)}</span></> : null}
            {it.desde && <><span className="eq-uso-sep">·</span><span>desde {fechaCorta(it.desde)}</span></>}
            {it.entrego && <><span className="eq-uso-sep">·</span><span>se lo dio {it.entrego}</span></>}
            {/* La nota es lo único que dice POR QUÉ es suya. Va en la fila, no
                en un title: un dato que hay que descubrir pasando el cursor no
                existe en un teléfono. */}
            {it.nota && <><span className="eq-uso-sep">·</span><span style={{ fontStyle: "italic" }}>{it.nota}</span></>}
          </div>
        </div>
        {!preguntando && (
          <button type="button" className="ent-quita" title="Quitarle esta asignación"
            onClick={() => setPreguntando(true)}>✕</button>
        )}
      </div>

      {preguntando && (
        <div className="kit-fuera" style={{ borderLeftColor: "var(--blue)" }}>
          <div style={{ color: "var(--text)", fontSize: 12.5, marginBottom: 6 }}>
            ¿Por qué deja de ser de <b>{it.per}</b>?
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MOTIVOS_ELEGIBLES.map(m => (
              <button key={m} type="button" className="kit-chip" disabled={ocupado}
                title={META_MOTIVO[m].ayuda}
                onClick={() => quitar(m)}>
                {META_MOTIVO[m].ico} {META_MOTIVO[m].txt}
              </button>
            ))}
            <button type="button" className="dato-btn" style={{ color: "var(--dim)" }}
              disabled={ocupado} onClick={() => { setPreguntando(false); setErr(null); }}>
              Cancelar
            </button>
          </div>
          {/* La consecuencia de cada motivo, escrita. Elegir mal aquí es lo que
              hace que un equipo malogrado vuelva al inventario como disponible
              y alguien se lo lleve el jueves. */}
          <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
            {MOTIVOS_ELEGIBLES.map(m => (
              <div key={m}>· <b>{META_MOTIVO[m].txt}</b> — {META_MOTIVO[m].ayuda}</div>
            ))}
          </div>
          {err && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>⚠ {err}</div>}
        </div>
      )}
    </>
  );
}
