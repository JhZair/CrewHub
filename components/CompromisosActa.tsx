"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { marcarCompromiso, editarDetalleCompromiso, casoDeCompromiso } from "@/app/actions";
import { rotuloEstado, claseEstado } from "@/lib/estados";
import {
  META_CLASE_COMP, META_ESTADO_COMP, ESTADOS_COMP, ordenarCompromisos,
  avanceEntregables, type Compromiso, type ClaseCompromiso, type EstadoCompromiso,
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
/* PostgREST devuelve la relación como objeto o como arreglo según cómo la
   resuelva. Leer solo una de las dos formas deja el estado del caso en blanco
   sin que nada falle — y un hueco se lee como «no tiene estado». */
const caso1 = (x: Compromiso) => {
  const c: any = (x as any).caso;
  return (Array.isArray(c) ? c[0] : c) || null;
};

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
    /* «Ya existía» no es un error: es la respuesta correcta al segundo clic.
       Se dice, y el enlace aparece igual. */
    if (r?.error) { setErr(r.error); if (!r?.id) return; }
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
    return (
      <div key={x.id} className={`cmp-fila${hecho && seTacha ? " hecho" : ""}`}>
        <div className="cmp-l1">
          {/* La cláusula, monoespaciada y primero: es la llave para volver al
              PDF, y en columna se recorre con el dedo. */}
          <span className="cmp-cl">{x.clausula || "—"}</span>
          <span className="cmp-tit">{x.titulo}</span>
          {x.fecha_limite && <span className="cmp-fecha">📅 {dmy(x.fecha_limite)}</span>}
          <span style={{ flex: 1 }} />
          {/* ── LOS DOS ESTADOS, DICIENDO A QUÉ CONTESTA CADA UNO ──
              Antes los dos ponían «en proceso» uno al lado del otro y no había
              forma de saber cuál era cuál. No se fundieron porque de verdad no
              son lo mismo: la ficha puede estar terminada (caso resuelto) y sin
              entregar, o entregada y con el caso abierto esperando que el
              Ministerio la apruebe. Lo que faltaba era que las palabras
              distinguieran la pregunta. */}
          {seTacha && (
            <span className="cmp-est" style={{ color: e.col }} title={e.ayuda}>
              {e.ico} {e.txt}
            </span>
          )}
          {x.url && (
            <a href={x.url} target="_blank" rel="noopener noreferrer" className="cmp-prueba"
              title="Lo entregado">📎 ver</a>
          )}
          {/* De la cláusula al trabajo. Con caso abierto es un enlace; sin él,
              el botón que lo abre — nunca los dos, para que no haya que
              adivinar cuál de los dos hace qué. */}
          {x.caso_id ? (
            <Link href={`/caso/${x.caso_id}`} className="cmp-caso"
              title="El caso dice si alguien está trabajando en esto. El estado de la izquierda dice si ya se entregó al Ministerio: son dos cosas distintas.">
              📋 caso
              {/* El estado del caso, con el mismo rótulo y color que en el
                  tablero: si aquí se llamara de otra forma habría dos nombres
                  para el mismo estado, que es peor que no enseñarlo. */}
              {caso1(x)?.estado && (
                <span className={`pill st-${claseEstado(caso1(x)!.estado!, caso1(x)!.tipo || "tarea")}`}
                  style={{ fontSize: 9, marginLeft: 4 }}>
                  {rotuloEstado(caso1(x)!.estado!, caso1(x)!.tipo || "tarea")}
                </span>
              )}
            </Link>
          ) : puedeEditar && (
            <button className="dato-btn cmp-caso-btn" disabled={ocupado}
              title="Abrir un caso para atender esta cláusula, con responsable y plazo"
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

        {x.detalle && <div className="cmp-det">{x.detalle}</div>}
        {x.entregado_en && <div className="cmp-ent">entregado el {dmy(x.entregado_en)}</div>}
        {x.nota && <div className="cmp-nota">📝 {x.nota}</div>}

        {abierto === x.id && (
          <div className="cmp-ed">
            {seTacha && (
              <span className="cmp-estados">
                {ESTADOS_COMP.map(s => {
                  const m = META_ESTADO_COMP[s];
                  return (
                    <button key={s} className={`cmp-est-btn${x.estado === s ? " on" : ""}`}
                      style={{ color: x.estado === s ? m.col : undefined }}
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
          <div className="cmp-ed">
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
      <div className="cmp-cab">
        <span>
          <b>{av.listos}/{av.cuentan}</b> entregables
          {av.enProceso > 0 && <span style={{ color: "var(--yellow)" }}> · {av.enProceso} en proceso</span>}
          {av.noAplica > 0 && (
            <span style={{ color: "var(--dim)" }} title="Marcados «no aplica»: no cuentan en el total">
              {" "}· {av.noAplica} no aplica
            </span>
          )}
        </span>
        <span className="cmp-barra"><i style={{ width: `${av.pct}%` }} /></span>
        {actaUrl ? (
          <a href={actaUrl} target="_blank" rel="noopener noreferrer" className="cmp-acta">
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
            <div className="cmp-h">
              {m.ico} {m.titulo} · {lista.length}
              <span className="cmp-h-sub">{m.sub}</span>
            </div>
            {lista.map(x => fila(x, m.seTacha))}
          </div>
        );
      })}
    </div>
  );
}
