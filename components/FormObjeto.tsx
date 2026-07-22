"use client";
import MiniSelect from "@/components/MiniSelect";
import { TIPOS_OBJETO, TIPO_OBJ } from "@/lib/objetos";
import type { ReactNode } from "react";

/* EL FORMULARIO DE UN OBJETO, en un solo sitio.

   Lo usan las dos puertas de entrada al repositorio: la sección dentro de una
   ficha (donde el dueño ya se sabe) y la página global (donde hay que
   elegirlo). Vivía suelto dentro del componente de la ficha; al abrir la
   segunda puerta habría quedado copiado, y el día que se agregue un campo se
   agrega en uno solo y nadie se entera. */

export type ValorObjeto = {
  id: string; tipo: string; titulo: string; url: string; fecha: string; notas: string;
};
export const OBJETO_VACIO: ValorObjeto = {
  id: "", tipo: "obra", titulo: "", url: "", fecha: "", notas: "",
};

/* El link es obligatorio salvo en una nota: un objeto del repositorio es la
   referencia a algo que existe en alguna parte. */
export const objetoListo = (f: ValorObjeto) =>
  !!f.titulo.trim() && (f.tipo === "nota" || !!f.url.trim());

export default function FormObjeto({ f, setF, error, guardando, onCancelar, onGuardar, dueno }: {
  f: ValorObjeto;
  setF: (v: ValorObjeto) => void;
  error?: string;
  guardando?: boolean;
  onCancelar: () => void;
  onGuardar: () => void;
  /** Campo extra al inicio: de quién es el objeto (solo en la página global). */
  dueno?: ReactNode;
}) {
  const esNota = f.tipo === "nota";

  return (
    /* En ventana amplia: cinco campos no caben en la columna del carné, y
       apretados se llenan mal (o no se llenan). */
    <div className="modal-fondo" onClick={e => { if (e.target === e.currentTarget) onCancelar(); }}>
      <div className="modal-ed">
        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <b style={{ fontSize: 15 }}>{f.id ? "✏️ Editar objeto" : "📚 Agregar al repositorio"}</b>
          {error && <div className="err-inline" style={{ marginTop: 10 }}>⚠ {error}</div>}

          <div className="repo-campos">
            {dueno}
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
            <button className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
            <button className="btn" disabled={!objetoListo(f) || guardando} onClick={onGuardar}>
              {guardando ? "Guardando..." : f.id ? "Actualizar" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
