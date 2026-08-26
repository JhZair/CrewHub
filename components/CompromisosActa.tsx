"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { marcarCompromiso, editarDetalleCompromiso, casoDeCompromiso } from "@/app/actions";
import { rotuloEstado, claseEstado } from "@/lib/estados";
import Avatar from "@/components/Avatar";
import {
  META_CLASE_COMP, META_ESTADO_COMP, ESTADOS_COMP, ordenarCompromisos,
  avanceEntregables, casosDe, type Compromiso, type ClaseCompromiso, type EstadoCompromiso,
} from "@/lib/compromisos";

/* ── 📦 LO QUE EL ACTA OBLIGA ──
 *
 * Un PDF escaneado de once páginas que nadie abre, y dentro las reglas que
 * deciden si el fondo se cierra bien o se pierde. Esta pantalla lo convierte en
 * una lista con la que se puede trabajar — sin dejar de ser el acta.
 *
 * ── LA CLÁUSULA VA SIEMPRE DELANTE ──
 * No es un adorno de archivista: es lo que hace verificable cada línea. Con el
 * número, comprobar que dice lo que decimos que dice cuesta diez segundos. Sin
 * él, este extracto sería una segunda versión del acta y en un año nadie sabría
 * a cuál creerle — que es exactamente el problema que veníamos a resolver, no a
 * mudar de sitio. Por eso el enlace al PDF se queda arriba, visible.
 */
const dmy = (f?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

export default function CompromisosActa({
  postulacionId, compromisos, actaUrl, codigoActa, puedeEditar, error,
}: {
  postulacionId: string;
  compromisos: Compromiso[];
  actaUrl?: string | null;
  codigoActa?: string | null;
  puedeEditar: boolean;
  error?: string | null;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ed, setEd] = useState({ url: "", nota: "", entregado_en: "" });
  const [edTexto, setEdTexto] = useState<string | null>(null);
  const [txt, setTxt] = useState({ titulo: "", detalle: "", fecha_limite: "" });

  const porClase = (c: ClaseCompromiso) =>
    ordenarCompromisos(compromisos.filter(x => x.clase === c));
  const av = useMemo(() => avanceEntregables(compromisos), [compromisos]);

  const guardar = async (x: Compromiso, estado: EstadoCompromiso) => {
    if (ocupado) return;
    setOcupado(true); setErr("");
    const r: any = await marcarCompromiso(x.id, postulacionId, estado,
      ed.url || x.url || "", ed.nota || x.nota || "", ed.entregado_en || null);
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    setAbierto(null); setEd({ url: "", nota: "", entregado_en: "" });
    router.refresh();
  };

  /* ── ABRIR EL CASO ──
     No navega solo al crearlo: se queda en la lista y la fila pasa a enseñar
     «📋 ver caso». Saltar al caso recién creado sacaría a quien está repasando
     el acta de las treinta cláusulas justo cuando va por la sexta — y volver
     es empezar otra vez. El enlace queda ahí para cuando quiera ir. */
  const abrirCaso = async (x: Compromiso) => {
    if (ocupado) return;
    setOcupado(true); setErr("");
    const r: any = await casoDeCompromiso(x.id, postulacionId);
    setOcupado(false);
    if (r?.error) { setErr(r.error); if (!r?.id) return; }
    /* El botón ya no devuelve «ya existía»: cada pulsación abre un caso nuevo,
       porque el trabajo de una cláusula se reparte. Lo que sí protege del
       doble clic es `ocupado`, arriba — sin él, dos toques rápidos abrirían
       dos casos iguales y habría que descartar uno a mano. */
    router.refresh();
  };

  const guardarTexto = async (x: Compromiso) => {
    if (ocupado) return;
    setOcupado(true); setErr("");
    const r: any = await editarDetalleCompromiso(x.id, postulacionId,
      txt.titulo, txt.detalle, txt.fecha_limite || null);
    setOcupado(false);
    if (r?.error) { setErr(r.error); return; }
    setEdTexto(null);
    router.refresh();
  };

  const fila = (x: Compromiso, seTacha: boolean) => {
    const e = META_ESTADO_COMP[x.estado] || META_ESTADO_COMP.pendiente;
    const hecho = x.estado === "entregado" || x.estado === "no_aplica";
    const casos = casosDe(x);
    return (
      /* ── UNA REJILLA DE DOS COLUMNAS, NO UNA FILA QUE ENVUELVE ──
         La cláusula tiene columna propia y todo lo demás cuelga de la segunda.
         Antes se sostenía con un margen de 61px repetido en cuatro reglas: si
         la cláusula crecía un dígito, el extracto y la fecha se quedaban
         desalineados sin que nada fallara. Ahora la rejilla los alinea sola. */
      <div key={x.id} className={`acta-fila${hecho && seTacha ? " hecho" : ""}`}>
        {/* La cláusula, monoespaciada y primero: es la llave para volver al
            PDF, y en columna se recorre con el dedo. */}
        <span className="acta-cl">{x.clausula || "—"}</span>
        <div className="acta-cuerpo">
        <div className="acta-l1">
          <span className="acta-tit">{x.titulo}</span>
          {x.fecha_limite && <span className="acta-fecha">📅 {dmy(x.fecha_limite)}</span>}
          <span style={{ flex: 1 }} />
          {/* ── LOS DOS ESTADOS, DICIENDO A QUÉ CONTESTA CADA UNO ──
              Antes los dos ponían «en proceso» uno al lado del otro y no había
              forma de saber cuál era cuál. No se fundieron porque de verdad no
              son lo mismo: la ficha puede estar terminada (caso resuelto) y sin
              entregar, o entregada y con el caso abierto esperando que el
              Ministerio la apruebe. Lo que faltaba era que las palabras
              distinguieran la pregunta. */}
          {seTacha && (
            <span className="acta-est" style={{ color: e.col }} title={e.ayuda}>
              {e.ico} {e.txt}
            </span>
          )}
          {x.url && (
            <a href={x.url} target="_blank" rel="noopener noreferrer" className="acta-prueba"
              title="Lo entregado">📎 ver</a>
          )}
          {/* ── DE LA CLÁUSULA AL TRABAJO: TODOS LOS CASOS ──
              Antes se enseñaba UNO, y el botón de abrir otro solo aparecía si
              ese hueco estaba libre o el caso muerto. Dos consecuencias malas:
              una cláusula como la 5.2.4 —meses y tres personas— no podía tener
              más de un caso a la vez, y al RESOLVERSE el caso desaparecía de la
              cláusula. En una rendición, lo hecho es justo lo que hay que poder
              enseñar. Ahora cuelgan todos y el ＋ está siempre. */}
          {casos.map(c => (
            <Link key={c.id} href={`/caso/${c.id}`} className="acta-caso"
              title={`${c.resp?.nombre ? `${c.resp.nombre} — ` : "Sin responsable — "}el caso dice si alguien está trabajando en esto. El estado de la izquierda dice si ya se entregó al Ministerio: son dos cosas distintas.`}>
              {/* La cara de quien lo lleva. «¿Quién lo está haciendo?» es la
                  primera pregunta al mirar esta lista, y hasta hoy había que
                  abrir el caso para contestarla. Sin responsable se DICE con un
                  hueco marcado, no con un vacío que parece un fallo de carga. */}
              {c.resp?.nombre
                ? <Avatar size={16} nombre={c.resp.nombre} src={c.resp.avatar_url} color={c.resp.color} />
                : <span className="acta-nadie" title="Sin responsable">·</span>}
              {/* El estado, con el mismo rótulo y color que en el tablero: si
                  aquí se llamara de otra forma habría dos nombres para el mismo
                  estado, que es peor que no enseñarlo. */}
              {c.estado && (
                <span className={`pill st-${claseEstado(c.estado, c.tipo || "tarea")}`}
                  style={{ fontSize: 9 }}>
                  {rotuloEstado(c.estado, c.tipo || "tarea")}
                </span>
              )}
            </Link>
          ))}
          {puedeEditar && (
            <button className="dato-btn acta-caso-btn" disabled={ocupado}
              title={casos.length
                ? "Abrir OTRO caso para esta cláusula — el trabajo de una cláusula puede repartirse"
                : "Abrir un caso para atender esta cláusula, con responsable y plazo"}
              onClick={() => abrirCaso(x)}>＋ caso</button>
          )}
          {puedeEditar && (
            <button className="dato-btn" title={seTacha ? "Marcar y guardar la prueba" : "Anotar"}
              onClick={() => {
                setAbierto(abierto === x.id ? null : x.id);
                setEd({ url: x.url || "", nota: x.nota || "", entregado_en: x.entregado_en || "" });
              }}>{abierto === x.id ? "▾" : "✎"}</button>
          )}
        </div>

        {x.detalle && <div className="acta-det">{x.detalle}</div>}
        {/* ── LOS DATOS DE LA ENTREGA, EN UN SOLO RENGLÓN ──
            Iban en dos bloques sueltos y, con la fila puesta en flex por una
            colisión de nombres, acababan flotando cada uno donde cabía: la
            fecha a la derecha en una fila y debajo en la siguiente. Juntos y en
            su propia línea se leen como lo que son: el pie de la cláusula. */}
        {(x.entregado_en || x.nota) && (
          <div className="acta-pie">
            {x.entregado_en && <span className="acta-ent">✅ entregado el {dmy(x.entregado_en)}</span>}
            {x.nota && <span className="acta-nota">📝 {x.nota}</span>}
          </div>
        )}

        {abierto === x.id && (
          <div className="acta-ed">
            {seTacha && (
              <span className="acta-estados">
                {ESTADOS_COMP.map(s => {
                  const m = META_ESTADO_COMP[s];
                  return (
                    /* ── CADA CHIP CON SU COLOR, SIEMPRE ──
                       Antes solo se pintaba el ACTIVO y los otros tres eran
                       cuatro pastillas grises indistinguibles: había que leer
                       las cuatro para encontrar la que se busca, cada vez.
                       El color es el mismo que ese estado tiene en la lista
                       —sale de `META_ESTADO_COMP`, un solo sitio—, así que la
                       pastilla que se toca aquí y la palabra que aparece allá
                       se reconocen como la misma cosa sin leerlas.
                       El fondo se calcula del propio color con `color-mix`: un
                       tono tenue por chip escrito a mano serían cuatro colores
                       más que mantener a juego con los de la lista. */
                    <button key={s} className={`acta-est-btn${x.estado === s ? " on" : ""}`}
                      style={{ color: m.col }} title={m.ayuda}
                      disabled={ocupado} onClick={() => guardar(x, s)}>
                      {m.ico} {m.txt}
                    </button>
                  );
                })}
              </span>
            )}
            <input value={ed.url} onChange={ev => setEd({ ...ed, url: ev.target.value })}
              placeholder="Enlace a lo entregado (Drive, plataforma…)" />
            <input value={ed.nota} onChange={ev => setEd({ ...ed, nota: ev.target.value })}
              placeholder="Nota: quién lo mandó, por qué medio, número de expediente…" />
            {/* La fecha solo si se está marcando entregado: en lo demás sería un
                campo que pide un dato que no significa nada todavía. */}
            {seTacha && (
              <input type="date" value={ed.entregado_en}
                onChange={ev => setEd({ ...ed, entregado_en: ev.target.value })}
                title="Fecha de entrega (si se deja vacía y marcas «entregado», se pone hoy)" />
            )}
            <button className="btn" disabled={ocupado}
              onClick={() => guardar(x, x.estado)}>{ocupado ? "…" : "Guardar"}</button>
            {/* Corregir el texto del extracto: viene de un OCR de un escaneo, y
                una tilde mal leída no debería obligar a volver al SQL. La
                cláusula NO se edita — si el número cambia, ya no es la misma
                cita, y entonces el extracto deja de ser verificable. */}
            <button className="btn btn-ghost" disabled={ocupado}
              title="Corregir el texto del extracto (la cláusula no se toca)"
              onClick={() => {
                setEdTexto(x.id);
                setTxt({ titulo: x.titulo, detalle: x.detalle || "", fecha_limite: x.fecha_limite || "" });
              }}>Corregir texto</button>
          </div>
        )}

        {edTexto === x.id && (
          <div className="acta-ed">
            <input value={txt.titulo} onChange={ev => setTxt({ ...txt, titulo: ev.target.value })}
              placeholder="Título" style={{ minWidth: 240 }} />
            <textarea value={txt.detalle} onChange={ev => setTxt({ ...txt, detalle: ev.target.value })}
              placeholder="Extracto, pegado a la letra del acta" rows={3} />
            <input type="date" value={txt.fecha_limite}
              onChange={ev => setTxt({ ...txt, fecha_limite: ev.target.value })}
              title="Fecha límite, si la cláusula fija una" />
            <button className="btn" disabled={ocupado} onClick={() => guardarTexto(x)}>
              {ocupado ? "…" : "Guardar texto"}
            </button>
            <button className="btn btn-ghost" onClick={() => setEdTexto(null)}>Cancelar</button>
          </div>
        )}
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="empty" style={{ color: "var(--yellow)" }}>
        No se pudieron leer los compromisos del acta ({error}). Falta correr{" "}
        <b>db/compromiso-acta.sql</b>.
      </div>
    );
  }

  if (!compromisos.length) {
    return (
      <div className="empty" style={{ lineHeight: 1.6 }}>
        Todavía no hay extracto del acta para este fondo. El acta está en su enlace
        {actaUrl ? <> (<a href={actaUrl} target="_blank" rel="noopener noreferrer">abrirla ↗</a>)</> : null},
        pero un PDF escaneado de once páginas no se consulta: hay que extraer sus
        cláusulas para poder trabajar con ellas.
      </div>
    );
  }

  return (
    <div>
      {/* El acta, a un clic. El extracto la indexa; no la reemplaza — y por eso
          la fuente tiene que estar siempre a la vista. */}
      <div className="acta-cab">
        {/* El avance y su barra son la MISMA cifra, dicha con números y
            dibujada: van pegados. Con los matices en medio, la barra quedaba
            al otro lado del renglón y se leía como un dato más. */}
        <span className="acta-av">
          <span><b>{av.listos}/{av.cuentan}</b> entregables</span>
          <span className="acta-barra"><i style={{ width: `${av.pct}%` }} /></span>
        </span>
        {/* Los dos matices, con la misma pastilla que la lista de abajo, los
            chips del editor y la tarjeta de /fondos. Cuatro sitios, un solo
            aspecto: «en proceso» se reconoce sin leerlo. */}
        {av.enProceso > 0 && (
          <span className="acta-est" style={{ color: META_ESTADO_COMP.en_proceso.col }}
            title={META_ESTADO_COMP.en_proceso.ayuda}>
            {META_ESTADO_COMP.en_proceso.ico} {av.enProceso} en proceso
          </span>
        )}
        {av.noAplica > 0 && (
          <span className="acta-est" style={{ color: META_ESTADO_COMP.no_aplica.col }}
            title="Marcados «no aplica»: no cuentan en el total">
            {META_ESTADO_COMP.no_aplica.ico} {av.noAplica} no aplica
          </span>
        )}
        <span style={{ flex: 1 }} />
        {actaUrl ? (
          <a href={actaUrl} target="_blank" rel="noopener noreferrer" className="acta-acta">
            📄 Acta {codigoActa || ""} ↗
          </a>
        ) : (
          <span style={{ color: "var(--yellow)", fontSize: 11.5 }}>
            ⚠ sin enlace al acta — el extracto no se puede comprobar contra nada
          </span>
        )}
      </div>

      {err && <div className="err-inline">⚠ {err}</div>}

      {(["entregable", "obligacion", "plazo"] as ClaseCompromiso[]).map(c => {
        const lista = porClase(c);
        if (!lista.length) return null;
        const m = META_CLASE_COMP[c];
        return (
          <div key={c} style={{ marginTop: 14 }}>
            <div className="sec-h">
              {m.ico} {m.titulo} · {lista.length}
              <span className="sec-h-sub">{m.sub}</span>
            </div>
            {lista.map(x => fila(x, m.seTacha))}
          </div>
        );
      })}
    </div>
  );
}
