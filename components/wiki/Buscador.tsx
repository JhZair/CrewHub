"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buscarWiki, type ResultadoConRuta } from "@/app/wiki/acciones";
import { pad2 } from "@/lib/wiki/util";
import { Search, X } from "./Iconos";

/* ══════════════════════════════════════════════════════════════════════════
   EL BUSCADOR — «¿Qué necesitas resolver?»

   Busca en títulos, preguntas, etiquetas y contenido (full-text en Supabase,
   ver lib/wiki/datos.ts). Dos formas: grande en el inicio (resultados en
   línea, con preguntas de ejemplo) y compacta en la barra (desplegable).
   Espera 220 ms tras la última tecla antes de consultar.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Buscador({ grande = false, areaId = null, ejemplos = [] }:
  { grande?: boolean; areaId?: string | null; ejemplos?: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [res, setRes] = useState<ResultadoConRuta[]>([]);
  const [cargando, setCargando] = useState(false);
  const ultimo = useRef(0);
  const hay = q.trim().length > 1;

  useEffect(() => {
    if (!hay) { setRes([]); return; }
    const n = ++ultimo.current;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const r = await buscarWiki(q, areaId);
        if (n === ultimo.current) setRes(r);
      } catch { if (n === ultimo.current) setRes([]); }
      finally { if (n === ultimo.current) setCargando(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q, areaId, hay]);

  const abrir = (p: ResultadoConRuta) => {
    setQ(""); setAbierto(false);
    router.push(`/wiki/${p.area_id}/${p.slug}`);
  };

  return (
    <div className={`wk-search ${grande ? "is-big" : ""}`}>
      <label className="wk-input">
        <Search size={grande ? 22 : 16} />
        <input value={q}
          onChange={e => { setQ(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          onKeyDown={e => {
            if (e.key === "Escape") { setQ(""); setAbierto(false); }
            if (e.key === "Enter" && res[0]) abrir(res[0]);
          }}
          placeholder={grande ? "Escribe un problema, una técnica o un concepto" : "Buscar en la wiki"}
          aria-label="Buscar en la wiki" />
        {q && (
          <button type="button" className="wk-clear" onMouseDown={e => e.preventDefault()} onClick={() => setQ("")} aria-label="Borrar búsqueda">
            <X size={16} />
          </button>
        )}
      </label>

      {grande && !hay && ejemplos.length > 0 && (
        <div className="wk-examples">
          {ejemplos.map(x => <button key={x} type="button" className="wk-example" onClick={() => setQ(x)}>{x}</button>)}
        </div>
      )}

      {hay && (grande || abierto) && (
        <div className={`wk-results ${grande ? "is-inline" : ""}`} onMouseDown={e => e.preventDefault()}>
          {res.length === 0 ? (
            <p className="wk-results-empty">
              {cargando ? "Buscando…" : "Ninguna página responde a esta búsqueda. Llévala como pregunta al hilo del área que corresponda para crear la página."}
            </p>
          ) : res.map(p => (
            <button key={p.id} type="button" className="wk-result" onClick={() => abrir(p)}>
              <span className="wk-result-title">
                <span className="wk-dot" style={{ background: `var(--a-${p.area_id})` }} />
                {p.titulo}
              </span>
              <span className="wk-result-path">{p.areaNombre}{p.seccion ? ` / ${pad2(p.numero || 0)} ${p.seccion}` : ""}</span>
              {p.pregunta && <span className="wk-result-q wk-serif">{p.pregunta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
