"use client";
import { guardarObjeto, borrarObjeto } from "@/app/actions";
import LinkVerificable from "@/components/LinkVerificable";
import MiniSelect from "@/components/MiniSelect";
import TextoCorto from "@/components/TextoCorto";
import { TIPOS_OBJETO, TIPO_OBJ, icoObjeto, lblObjeto, ordenObjeto } from "@/lib/objetos";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* 📚 REPOSITORIO — todo lo que se sabe de una entidad y no cabe en su ficha.
   Obras, investigaciones, prensa, premios, redes, notas. Agrupado por tipo,
   con el verificador de links por objeto para que no se vuelva un cementerio
   de enlaces muertos. Los CVs tienen sección aparte (su enfoque se cruza con
   el cargo de cada postulación), aunque vivan en la misma tabla. */

const fmt = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
/* `creado_en` es un timestamp, no una fecha: se formatea aparte (sin el
   T12:00 que necesitan las columnas `date`). */
const fmtHora = (d: string) =>
  new Date(d).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });

type Obj = {
  id: string; tipo: string; titulo: string;
  url?: string | null; fecha?: string | null; notas?: string | null;
  creado_en?: string | null;
  /** Alias de quien lo agregó, ya resuelto en el servidor. */
  autor?: string | null;
};

const VACIO = { id: "", tipo: "obra", titulo: "", url: "", fecha: "", notas: "" };

export default function Repositorio({ entidadTipo, entidadId, objetos, verif }: {
  entidadTipo: string; entidadId: string;
  objetos: Obj[];
  /** Verificaciones de link, indexadas por `objeto:<id>`. */
  verif: Record<string, { url: string; por?: string | null; en?: string | null; correcto?: boolean }>;
}) {
  const router = useRouter();
  const [f, setF] = useState({ ...VACIO });
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState("");

  const limpiar = () => { setF({ ...VACIO }); setAbierto(false); setError(""); };

  /* El link es obligatorio salvo en una nota: un objeto del repositorio es la
     referencia a algo que existe en alguna parte. */
  const esNota = f.tipo === "nota";
  const puedeGuardar = !!f.titulo.trim() && (esNota || !!f.url.trim());

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true); setError("");
    const r: any = await guardarObjeto({
      id: f.id || null, entidadTipo, entidadId,
      tipo: f.tipo, titulo: f.titulo, url: f.url, fecha: f.fecha, notas: f.notas,
    });
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    limpiar(); router.refresh();
  };

  const quitar = async (id: string) => {
    const r: any = await borrarObjeto(id, entidadTipo, entidadId);
    setBorrando(null);
    if (r?.error) setError(r.error); else router.refresh();
  };

  const editar = (o: Obj) => {
    setF({
      id: o.id, tipo: o.tipo, titulo: o.titulo,
      url: o.url || "", fecha: o.fecha || "", notas: o.notas || "",
    });
    setAbierto(true);
  };

  // Agrupado por tipo, en el orden de la lista (no alfabético: la lista tiene
  // un orden pensado, de lo que más pesa a lo que menos).
  const grupos = [...new Set(objetos.map(o => o.tipo))]
    .sort((a, b) => ordenObjeto(a) - ordenObjeto(b))
    .map(t => ({ tipo: t, items: objetos.filter(o => o.tipo === t) }));

  return (
    <div className="linked repo" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          📚 Repositorio · {objetos.length}
        </h4>
        <span style={{ flex: 1 }} />
        {!abierto && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
            onClick={() => setAbierto(true)}>＋ Agregar</button>
        )}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}

      {/* En ventana amplia: cinco campos no caben en la columna del carné, y
          apretados se llenan mal (o no se llenan). */}
      {abierto && (
        <div className="modal-fondo" onClick={e => { if (e.target === e.currentTarget) limpiar(); }}>
          <div className="modal-ed">
            <div className="card" style={{ borderColor: "var(--accent)" }}>
              <b style={{ fontSize: 15 }}>{f.id ? "✏️ Editar objeto" : "📚 Agregar al repositorio"}</b>
              {error && <div className="err-inline" style={{ marginTop: 10 }}>⚠ {error}</div>}

              <div className="repo-campos">
                <label className="f-campo">
                  <span>Tipo</span>
                  <MiniSelect block value={f.tipo} options={TIPOS_OBJETO.map(t => [t.key, `${t.ico} ${t.lbl}`])}
                    onSelect={v => setF({ ...f, tipo: v })} />
                </label>
                <label className="f-campo">
                  <span>Fecha <i style={{ color: "var(--dim)", fontStyle: "normal" }}>— cuándo ocurrió</i></span>
                  <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
                </label>
                <label className="f-campo" style={{ gridColumn: "1 / -1" }}>
                  <span>Título <b style={{ color: "var(--red)" }}>*</b></span>
                  <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })}
                    placeholder={TIPO_OBJ[f.tipo]?.pista || "Cómo se llama"} autoFocus />
                </label>
                <label className="f-campo" style={{ gridColumn: "1 / -1" }}>
                  <span>
                    Link {esNota
                      ? <i style={{ color: "var(--dim)", fontStyle: "normal" }}>— una nota puede ir sin link</i>
                      : <b style={{ color: "var(--red)" }}>*</b>}
                  </span>
                  <input value={f.url} onChange={e => setF({ ...f, url: e.target.value })}
                    placeholder="https://…  (Drive, YouTube, web)" inputMode="url" />
                </label>
                <label className="f-campo" style={{ gridColumn: "1 / -1" }}>
                  <span>Nota <i style={{ color: "var(--dim)", fontStyle: "normal" }}>— por qué importa (opcional)</i></span>
                  <textarea rows={4} value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} />
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={limpiar}>Cancelar</button>
                <button className="btn" disabled={!puedeGuardar || guardando} onClick={guardar}>
                  {guardando ? "Guardando..." : f.id ? "Actualizar" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {grupos.map(g => (
        <div key={g.tipo} className="repo-grupo">
          <div className="repo-grupo-h">{icoObjeto(g.tipo)} {lblObjeto(g.tipo)} · {g.items.length}</div>
          {g.items.map(o => (
            <div key={o.id} className="repo-fila">
              <div className="repo-cab">
                {/* Su página propia: ahí se lee entero, se vincula a proyectos
                    y se conversa sobre él. */}
                <Link href={`/objeto/${o.id}`} className="repo-tit"><b>{o.titulo}</b></Link>
                {o.fecha && <span className="repo-fecha">{fmt(o.fecha)}</span>}
                <span style={{ flex: 1 }} />
                <button className="dato-btn" title="Editar" onClick={() => editar(o)}>✎</button>
                {borrando === o.id ? (
                  <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                    ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => quitar(o.id)}>sí</button>
                    {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setBorrando(null)}>no</button>
                  </span>
                ) : (
                  <button style={{ color: "var(--dim)" }} title="Quitar" onClick={() => setBorrando(o.id)}>✕</button>
                )}
              </div>
              {o.notas && <TextoCorto texto={o.notas} corte={220} className="repo-notas" />}
              {/* El link, con miniatura y veredicto: un repositorio de enlaces
                  sin verificar se pudre solo. `campo` lleva el id del objeto
                  para reusar link_verificaciones sin migrar nada. */}
              {o.url && (
                <LinkVerificable linea tipo={entidadTipo} id={entidadId} campo={`objeto:${o.id}`}
                  url={o.url} etiqueta={lblObjeto(o.tipo)} icono={icoObjeto(o.tipo)}
                  verif={verif[`objeto:${o.id}`]} />
              )}
              {/* Quién lo trajo y cuándo: en un repositorio compartido,
                  la procedencia del dato es parte del dato. */}
              <div className="repo-pie">
                agregado{o.autor ? ` por ${o.autor}` : ""}
                {o.creado_en ? ` · ${fmtHora(o.creado_en)}` : ""}
              </div>
            </div>
          ))}
        </div>
      ))}

      {!objetos.length && !abierto && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0" }}>
          Vacío. Aquí va lo que no cabe en la ficha: obras, investigaciones, prensa, premios, redes, notas.
        </div>
      )}
    </div>
  );
}
