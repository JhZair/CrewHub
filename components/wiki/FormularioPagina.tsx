"use client";
import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { guardarPagina, type ResultadoGuardar } from "@/app/wiki/acciones";
import { ESTADOS, NIVELES, TIPOS, type Area, type Pagina, type Seccion } from "@/lib/wiki/tipos";
import { pad2 } from "@/lib/wiki/util";

/* ══════════════════════════════════════════════════════════════════════════
   CARGAR O EDITAR UNA PÁGINA

   Un solo cuadro de texto: se pega lo que entrega el hilo (encabezado 3.1 +
   Markdown) y el servidor separa las dos cosas. Los campos de abajo son para
   corregir el encabezado sin reescribirlo; si se dejan vacíos, manda lo que
   dice el bloque pegado.
   ══════════════════════════════════════════════════════════════════════════ */

function Guardar({ etiqueta }: { etiqueta: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="wk-btn wk-btn-primary" disabled={pending}>{pending ? "Guardando…" : etiqueta}</button>;
}

export default function FormularioPagina({ areas, secciones, pagina, areaInicial, seccionInicial }: {
  areas: Area[]; secciones: Seccion[]; pagina?: Pagina | null; areaInicial?: string; seccionInicial?: number | null;
}) {
  const [estado, accion] = useFormState<ResultadoGuardar | null, FormData>(guardarPagina, null);
  const [area, setArea] = useState(pagina?.area_id || areaInicial || "");
  const secs = secciones.filter(s => s.area_id === area);
  const secActual = pagina ? secciones.find(s => s.id === pagina.seccion_id) : null;

  const textoInicial = pagina
    ? [
      `Título: ${pagina.titulo}`,
      `Área: ${pagina.area_id}`,
      `Sección: ${secActual ? `${pad2(secActual.numero)} ${secActual.nombre}` : ""}`,
      `Slug: ${pagina.slug}`,
      `Tipo: ${pagina.tipo}`,
      `Etiquetas: ${(pagina.etiquetas || []).join(", ")}`,
      `Etapa: ${pagina.etapa || ""}`,
      `Nivel: ${pagina.nivel}`,
      `Estado: ${ESTADOS[pagina.estado]?.label || pagina.estado}`,
      `Última actualización: ${pagina.actualizado}`,
      `Preguntas: ${(pagina.preguntas || []).join(" | ")}`,
      "",
      pagina.contenido,
    ].join("\n")
    : "";

  return (
    <form action={accion} className="wk-form">
      {pagina && <input type="hidden" name="id" value={pagina.id} />}

      <label className="wk-field">
        <span>Encabezado + Markdown <em>(pega aquí lo que entregó el hilo)</em></span>
        <textarea name="texto" rows={26} defaultValue={textoInicial} required spellCheck={false}
          placeholder={"Título: Entrevista caminada\nÁrea: documental\nSección: 08 Entrevistas\nSlug: entrevista-caminada\nTipo: técnica\nEtiquetas: entrevista, movimiento\nEtapa: Rodaje\nNivel: 2\nEstado: en investigación\nÚltima actualización: 2026-09-10\nPreguntas: ¿Cómo hacer una entrevista caminada?\n\n## ¿Qué es?\n…"} />
      </label>

      <details className="wk-form-extra" open={!!pagina}>
        <summary>Corregir el encabezado a mano (opcional: manda sobre el bloque pegado)</summary>
        <div className="wk-form-grid">
          <label className="wk-field"><span>Área</span>
            <select name="area" value={area} onChange={e => setArea(e.target.value)}>
              <option value="">— según el encabezado —</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}{a.estado !== "definida" ? ` (${a.estado})` : ""}</option>)}
            </select>
          </label>
          <label className="wk-field"><span>Sección</span>
            <select name="seccion" defaultValue={pagina && secActual ? String(secActual.numero) : (seccionInicial ? String(seccionInicial) : "")}>
              <option value="">— según el encabezado —</option>
              {secs.map(s => <option key={s.id} value={String(s.numero)}>{pad2(s.numero)} {s.nombre}</option>)}
            </select>
          </label>
          <label className="wk-field"><span>Título</span><input name="titulo" placeholder="según el encabezado" /></label>
          <label className="wk-field"><span>Slug</span><input name="slug" placeholder="según el título" /></label>
          <label className="wk-field"><span>Tipo</span>
            <select name="tipo" defaultValue="">
              <option value="">— según el encabezado —</option>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="wk-field"><span>Estado</span>
            <select name="estado" defaultValue="">
              <option value="">— según el encabezado —</option>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.icono} {v.label}</option>)}
            </select>
          </label>
          <label className="wk-field"><span>Nivel</span>
            <select name="nivel" defaultValue="">
              <option value="">— según el encabezado —</option>
              {Object.entries(NIVELES).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
            </select>
          </label>
          <label className="wk-field"><span>Etapa</span><input name="etapa" placeholder="según el encabezado" /></label>
          <label className="wk-field wk-field-wide"><span>Etiquetas (separadas por coma)</span><input name="etiquetas" placeholder="según el encabezado" /></label>
          <label className="wk-field wk-field-wide"><span>Preguntas a las que responde (una por línea)</span><textarea name="preguntas" rows={2} placeholder="según el encabezado" /></label>
          <label className="wk-field"><span>Fecha de actualización</span><input name="actualizado" type="date" /></label>
        </div>
      </details>

      <fieldset className="wk-form-hist">
        <legend>Historial de cambios</legend>
        <div className="wk-form-grid">
          <label className="wk-field wk-field-wide"><span>Qué cambió</span><input name="cambio" placeholder={pagina ? "p. ej. Se agregó la fuente [3] y se verificó el paso 4" : "Página creada (automático si se deja vacío)"} /></label>
          <label className="wk-field"><span>Por qué</span><input name="motivo" /></label>
          <label className="wk-field"><span>Fuente nueva</span><input name="fuente_nueva" /></label>
        </div>
      </fieldset>

      {estado?.error && <p className="wk-form-error" role="alert">{estado.error}</p>}

      <div className="wk-form-actions">
        <Guardar etiqueta={pagina ? "Guardar cambios" : "Crear página"} />
        <span className="wk-muted" style={{ fontSize: 13 }}>Las anotaciones personales y los proyectos se agregan desde la página, no aquí.</span>
      </div>
    </form>
  );
}
