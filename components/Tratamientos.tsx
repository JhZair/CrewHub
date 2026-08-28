"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import {
  crearTratamiento, editarTratamiento, marcarVigente,
  duplicarTratamiento, borrarTratamiento,
} from "@/app/guion/acciones";
import { fechaDia } from "@/lib/fechas";
import {
  ordenarTratamientos, tituloDe, nivelDe, metaNivel, NIVELES,
  nivelDestino, llegoAlDestino, estadoDe, META_ESTADO_TRAT,
  cargaDe, META_CARGA,
  type Tratamiento, type EstadoTrat,
} from "@/lib/tratamiento";

/* ══════════════════════════════════════════════════════════════════════════
   ✍ LOS TRATAMIENTOS DE UNA PELÍCULA

   Una película no tiene UN guion: tiene una sucesión de documentos. El que se
   presentó al concurso, el reescrito con las notas del jurado, el que se usa
   para rodar. El módulo se quedó a medias porque las tablas colgaban de
   `proyecto_id` —un proyecto, un guion— y no había dónde poner el segundo.

   ── LOS DE VERDAD ESTÁN EN DRIVE ──
   Por eso «＋ Enlazar uno de Drive» está al mismo nivel que «＋ Nuevo». Un
   documento puede existir aquí siendo solo su enlace y trocearse en secuencias
   más tarde, o nunca. Exigir transcribirlo primero es la forma segura de que
   no se registre ninguno, y entonces la lista de tratamientos de la película
   sigue estando en la cabeza de alguien.

   ── DUPLICAR ES EL GESTO DE REESCRIBIR ──
   Sin él, «hacer la versión 2» significa editar la 1 encima, y nadie puede
   volver a leer lo que vio el jurado.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Tratamientos({
  proyectoId, tipoProyecto, tratamientos, cuentas = null, fondos = [],
  soloDelFondo = null, error: errServidor = null, puedeEditar = true, puedeBorrar = true,
}: {
  proyectoId: string;
  /** Decide hasta dónde tiene que llegar el documento: el documental para en
   *  el secuenciado, la ficción y la animación siguen al guion. */
  tipoProyecto?: string | null;
  tratamientos: Tratamiento[];
  /** Cuántas secuencias tiene cada tratamiento, por id.
   *  ⚠ Un MAPA y no la lista de secuencias. La primera versión pasaba
   *  `Array(n).fill({tratamiento_id})` —un array de objetos falsos solo para
   *  transportar un número—, y como este componente es de cliente, eso se
   *  serializa entero en el payload RSC: un documento de 200 secuencias son
   *  once kilobytes para decir «200».
   *  ⚠ `null` es «no se sabe», no «cero»: con la consulta rota, la lista dice
   *  «—» en vez de «vacío», que sobre un documento con veinte secuencias
   *  dentro sería mentira. */
  cuentas?: Record<string, number> | null;
  /** Los fondos de esta película, para poder marcar a cuál se presentó cada
   *  documento. */
  fondos?: { id: string; codigo?: string | null; nombre?: string | null }[];
  /** En la pestaña Audiovisual de un fondo: solo los suyos, y sin las
   *  herramientas de gestión —esas viven en la ficha del proyecto, que es de
   *  quien son los documentos—. */
  soloDelFondo?: string | null;
  error?: string | null;
  puedeEditar?: boolean;
  /** ── BORRAR ES OTRA COSA QUE EDITAR ──
   *  En el índice `/guion` se puede CREAR —quien entra a «voy a escribir» y ve
   *  una película sin nada tiene que poder empezar ahí— pero no destruir:
   *  borrar un tratamiento se lleva por `cascade` sus actos, sus secuencias con
   *  todo el texto, sus hilos y su espina, y en una lista transversal de
   *  quince películas plegadas la ✕ queda a un clic y sin el contexto del
   *  proyecto. Con `puedeEditar={false}` no valía: eso también quita «＋ Nuevo». */
  puedeBorrar?: boolean;
}) {
  const [creando, setCreando] = useState<"nuevo" | "enlace" | null>(null);
  const [f, setF] = useState<Record<string, any>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [ed, setEd] = useState<Record<string, any>>({});
  const [confirmar, setConfirmar] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const router = useRouter();

  const inputStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 10px", fontSize: 13, color: "var(--text)", width: "100%",
  } as const;

  const lista = ordenarTratamientos(
    soloDelFondo ? tratamientos.filter(t => t.postulacion_id === soloDelFondo) : tratamientos);

  const refrescar = () => { setCreando(null); setF({}); setEditando(null); router.refresh(); };

  const crear = async () => {
    if (ocupado) return;
    const esEnlace = creando === "enlace";
    if (esEnlace && !(f.url || "").trim()) { setError("Pega el enlace al documento."); return; }
    setOcupado(true); setError("");
    const r: any = await crearTratamiento(proyectoId, {
      nombre: f.nombre, version: f.version, nivel: f.nivel,
      url: f.url, postulacionId: f.postulacion_id || null, nota: f.nota,
    });
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    refrescar();
  };

  const guardar = async (id: string) => {
    setOcupado(true); setError("");
    const r: any = await editarTratamiento(id, proyectoId, ed);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setEditando(null); router.refresh();
  };

  const vigente = async (id: string) => {
    setOcupado(true); setError("");
    const r: any = await marcarVigente(id, proyectoId);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  const duplicar = async (id: string) => {
    setOcupado(true); setError(""); setAviso("");
    const r: any = await duplicarTratamiento(id, proyectoId);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setAviso(`Copia creada con ${r.secuencias} secuencia${r.secuencias === 1 ? "" : "s"}. El original queda intacto.`);
    router.refresh();
  };

  /* Borrar pide confirmación con el número de palabras: «¿borrar?» a secas no
     dice que se van 4.200 palabras que no están en ninguna otra parte. */
  const borrar = async (id: string, ok = false) => {
    setOcupado(true); setError("");
    const r: any = await borrarTratamiento(id, proyectoId, ok);
    setOcupado(false);
    if (r?.confirmar) { setConfirmar({ id, ...r }); return; }
    if (r?.error) { setError(r.error); return; }
    setConfirmar(null); router.refresh();
  };

  const abrirEd = (t: Tratamiento) => {
    if (editando === t.id) { setEditando(null); return; }
    setEd({
      nombre: t.nombre || "", version: t.version || "", nivel: nivelDe(t),
      estado: estadoDe(t), presentado_en: t.presentado_en || "",
      url: t.url || "", nota: t.nota || "", postulacion_id: t.postulacion_id || "",
    });
    setEditando(t.id); setError(""); setAviso("");
  };

  const set = (k: string, v: any) => setEd(e => ({ ...e, [k]: v }));
  const setNuevo = (k: string, v: any) => setF(e => ({ ...e, [k]: v }));

  /* ⚠ Cae a «un fondo» y no a `null` cuando la lista de fondos no llega. En el
     índice `/guion` no se pasan —marcar a qué concurso se presentó un documento
     es una decisión de expediente y se toma con el expediente delante— pero eso
     no es razón para ESCONDER que el documento sí tiene uno. Con `null`, el
     mismo tratamiento se leía distinto en dos pantallas. */
  const nombreFondo = (id?: string | null) => {
    if (!id) return null;
    const x = fondos.find(y => y.id === id);
    return x ? (x.codigo || x.nombre || "un fondo") : "un fondo";
  };

  return (
    <div className="trt">
      {/* En la pestaña Audiovisual esto vive dentro de un plegable que ya se
          titula «✍ Tratamientos presentados»: repetirlo con otro recuento se
          lee como dos secciones. */}
      <div className="trt-cab" style={soloDelFondo ? { display: "none" } : undefined}>
        <span className="trt-cab-t">✍ Tratamientos{lista.length ? ` · ${lista.length}` : ""}</span>
        <span style={{ flex: 1 }} />
        {puedeEditar && !soloDelFondo && !creando && (
          <>
            {/* Los dos al mismo nivel: la mitad de los documentos de esta
                productora viven en Drive y no se van a transcribir. */}
            <button type="button" className="btn btn-ghost trt-btn"
              onClick={() => { setCreando("enlace"); setF({ nivel: "secuenciado" }); setError(""); setAviso(""); }}
              title="Registrar un tratamiento que ya existe en Drive, Word o PDF">🔗 Enlazar uno</button>
            <button type="button" className="btn btn-ghost trt-btn"
              onClick={() => { setCreando("nuevo"); setF({ nivel: "secuenciado" }); setError(""); setAviso(""); }}
              title="Empezar un documento vacío para escribirlo aquí dentro">＋ Nuevo</button>
          </>
        )}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}
      {aviso && <div className="trt-aviso">{aviso}</div>}
      {errServidor && (
        <div className="err-inline" style={{ lineHeight: 1.5 }}>
          ⚠ No se pudieron leer los tratamientos, así que esta lista está vacía por un fallo y
          no porque no haya ninguno.
          <br /><code style={{ fontSize: 11, opacity: .85 }}>{errServidor}</code>
          {/column|does not exist|schema cache|PGRST20/i.test(errServidor) && (
            <><br /><b>Falta correr <code>db/tratamiento.sql</code> en Supabase.</b></>
          )}
        </div>
      )}

      {creando && (
        <div className="trt-nuevo">
          <div className="trt-nuevo-t">
            {creando === "enlace"
              ? "🔗 Un documento que ya existe fuera. Se registra con su enlace; trocearlo en secuencias aquí dentro es opcional y se hace después."
              : "＋ Un documento vacío para escribirlo aquí: actos, secuencias y su tratamiento en prosa."}
          </div>
          <div className="trt-grid">
            <label>
              <span>Nombre</span>
              <input value={f.nombre || ""} onChange={e => setNuevo("nombre", e.target.value)}
                placeholder="Tratamiento" style={inputStyle} autoFocus />
            </label>
            <label>
              <span>Versión</span>
              <input value={f.version || ""} onChange={e => setNuevo("version", e.target.value)}
                placeholder="v3 · 2ª entrega DAFO · post-rodaje" style={inputStyle} />
            </label>
            <label>
              <span>Nivel</span>
              <select value={f.nivel || "secuenciado"} onChange={e => setNuevo("nivel", e.target.value)} style={inputStyle}>
                {NIVELES.map(n => <option key={n.k} value={n.k}>{n.txt}</option>)}
              </select>
            </label>
            {fondos.length > 0 && (
              <label>
                <span>¿Se presentó a un fondo?</span>
                <select value={f.postulacion_id || ""} onChange={e => setNuevo("postulacion_id", e.target.value)} style={inputStyle}>
                  <option value="">— a ninguno —</option>
                  {fondos.map(x => <option key={x.id} value={x.id}>{x.codigo || x.nombre}</option>)}
                </select>
              </label>
            )}
            {creando === "enlace" && (
              <label className="trt-ancho">
                <span>Enlace al documento (obligatorio)</span>
                <input value={f.url || ""} onChange={e => setNuevo("url", e.target.value)}
                  placeholder="https://docs.google.com/…" style={inputStyle} />
              </label>
            )}
            <label className="trt-ancho">
              <span>Nota</span>
              <input value={f.nota || ""} onChange={e => setNuevo("nota", e.target.value)}
                placeholder="Qué cambia respecto del anterior, para quién es…" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn" style={{ padding: "6px 14px", fontSize: 12 }}
              disabled={ocupado} onClick={crear}>{ocupado ? "…" : "Crear"}</button>
            <button type="button" className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={() => { setCreando(null); setF({}); setError(""); }}>Cancelar</button>
          </div>
        </div>
      )}

      {lista.map(t => {
        const nivel = nivelDe(t);
        const est = estadoDe(t);
        const n = cuentas ? (cuentas[t.id] ?? 0) : undefined;
        const carga = cargaDe(t, n);
        const abierta = editando === t.id;
        return (
          <div key={t.id} className={`trt-fila${est === "descartado" ? " es-desc" : ""}`}>
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                  {/* El enlace lleva a la pantalla de escritura. Se pinta
                      siempre, incluso en los que solo tienen `url`: entrar y
                      ver que está vacío es lo que empuja a empezar. */}
                  <Link href={`/guion/${t.id}`} className="trt-nom">{tituloDe(t)} →</Link>
                  {t.vigente && <span className="trt-vig" title="El que manda hoy en esta película">vigente</span>}
                  <span style={{ color: META_ESTADO_TRAT[est].col, fontSize: 11 }}>
                    {META_ESTADO_TRAT[est].ico} {META_ESTADO_TRAT[est].txt}
                  </span>
                  <span className="trt-niv" title={metaNivel(nivel).que}>
                    {metaNivel(nivel).ico} {metaNivel(nivel).txt}
                  </span>
                  {/* Hasta dónde tiene que llegar esta película. En documental
                      el secuenciado ES el destino y no falta nada. */}
                  {!llegoAlDestino(t, tipoProyecto) && est !== "descartado" && (
                    <span className="trt-falta"
                      title={`En ${tipoProyecto || "este tipo de proyecto"} el destino es el ${metaNivel(nivelDestino(tipoProyecto)).txt.toLowerCase()}, y el guion se escribe sobre el secuenciado.`}>
                      → falta {metaNivel(nivelDestino(tipoProyecto)).txt.toLowerCase()}
                    </span>
                  )}
                </div>
                <div className="trt-pie">
                  <span title={META_CARGA[carga].ayuda}>
                    {carga === "escrito" ? `${n} secuencia${n === 1 ? "" : "s"}` : META_CARGA[carga].txt}
                  </span>
                  {t.postulacion_id && nombreFondo(t.postulacion_id) && (
                    <span className="trt-fondo" title="Este documento se presentó a ese fondo">
                      🏛 {nombreFondo(t.postulacion_id)}
                    </span>
                  )}
                  {t.presentado_en && <span>presentado el {fechaDia(t.presentado_en)}</span>}
                  {t.url && <a href={t.url} target="_blank" rel="noreferrer" className="trt-doc">↗ el original</a>}
                </div>
                {t.nota && <div className="trt-nota">{t.nota}</div>}
              </div>

              {puedeEditar && !soloDelFondo && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  {!t.vigente && est !== "descartado" && (
                    <button type="button" className="trt-acc" disabled={ocupado}
                      onClick={() => vigente(t.id)}
                      title="Poner este como el que manda hoy. El que lo era deja de serlo.">★ vigente</button>
                  )}
                  <button type="button" className="trt-acc" disabled={ocupado}
                    onClick={() => duplicar(t.id)}
                    title="Copiar el documento entero —actos, secuencias, hilos y espina— para trabajar una versión nueva sin tocar esta.">⧉ duplicar</button>
                  <button type="button" style={{ color: abierta ? "var(--violet)" : "var(--dim)", fontSize: 11.5 }}
                    onClick={() => abrirEd(t)}>{abierta ? "▾ editar" : "▸ editar"}</button>
                  {puedeBorrar && (
                    <button type="button" style={{ color: "var(--dim)" }} title="Borrar el documento entero"
                      onClick={() => borrar(t.id)}>✕</button>
                  )}
                </div>
              )}
            </div>

            {abierta && (
              <div className="trt-ed">
                <div className="trt-grid">
                  <label>
                    <span>Nombre</span>
                    <input value={ed.nombre || ""} onChange={e => set("nombre", e.target.value)} style={inputStyle} />
                  </label>
                  <label>
                    <span>Versión</span>
                    <input value={ed.version || ""} onChange={e => set("version", e.target.value)}
                      placeholder="v3 · 2ª entrega DAFO" style={inputStyle} />
                  </label>
                  <label>
                    <span>Nivel</span>
                    <select value={ed.nivel || "secuenciado"} onChange={e => set("nivel", e.target.value)} style={inputStyle}>
                      {NIVELES.map(x => <option key={x.k} value={x.k}>{x.txt}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Estado</span>
                    <select value={ed.estado || "borrador"} onChange={e => set("estado", e.target.value)} style={inputStyle}>
                      {(["borrador", "presentado", "descartado"] as EstadoTrat[]).map(x => (
                        <option key={x} value={x}>{META_ESTADO_TRAT[x].txt}</option>
                      ))}
                    </select>
                  </label>
                  {/* La fecha solo cuando ya se presentó: en un borrador no
                      significa nada y pedirla invita a inventarla. */}
                  {ed.estado === "presentado" && (
                    <label>
                      <span>Presentado el</span>
                      <input type="date" value={ed.presentado_en || ""} style={inputStyle}
                        onChange={e => set("presentado_en", e.target.value)} />
                    </label>
                  )}
                  {fondos.length > 0 && (
                    <label>
                      <span>Fondo al que se presentó</span>
                      <select value={ed.postulacion_id || ""} onChange={e => set("postulacion_id", e.target.value)} style={inputStyle}>
                        <option value="">— a ninguno —</option>
                        {fondos.map(x => <option key={x.id} value={x.id}>{x.codigo || x.nombre}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="trt-ancho">
                    <span>Enlace al documento original</span>
                    <input value={ed.url || ""} onChange={e => set("url", e.target.value)}
                      placeholder="https://docs.google.com/…" style={inputStyle} />
                  </label>
                  <label className="trt-ancho">
                    <span>Nota</span>
                    <input value={ed.nota || ""} onChange={e => set("nota", e.target.value)} style={inputStyle} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn" style={{ padding: "6px 14px", fontSize: 12 }}
                    disabled={ocupado} onClick={() => guardar(t.id)}>{ocupado ? "…" : "Guardar"}</button>
                  <button type="button" className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* La confirmación dice QUÉ se va. Es lo único irreversible del módulo:
          borrar el tratamiento se lleva sus actos, secuencias, hilos y espina
          por `cascade`. */}
      {confirmar && (
        <div className="trt-conf">
          <b>¿Borrar «{confirmar.nombre}»?</b>
          <div style={{ marginTop: 5, lineHeight: 1.55 }}>
            Se van {confirmar.secuencias} secuencia{confirmar.secuencias === 1 ? "" : "s"}
            {confirmar.palabras > 0 && <> y <b>{confirmar.palabras} palabras</b> de tratamiento</>}
            , más sus actos, hilos y la espina. Esto no se puede deshacer.
            {confirmar.vigente && <><br />⚠ Además es el <b>vigente</b> de esta película.</>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn" style={{ padding: "6px 14px", fontSize: 12, background: "var(--red)" }}
              disabled={ocupado} onClick={() => borrar(confirmar.id, true)}>Sí, borrar</button>
            <button type="button" className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={() => setConfirmar(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {!lista.length && !creando && !errServidor && (
        <div className="trt-vacio">
          {soloDelFondo
            ? <>No hay ningún tratamiento marcado como presentado a este fondo. Se marcan desde
               la ficha del proyecto, en la lista de tratamientos.</>
            : <>Todavía no hay ningún tratamiento. Si el documento ya existe en Drive,
               <b> 🔗 Enlazar uno</b> lo registra con su enlace y no hace falta transcribirlo;
               <b> ＋ Nuevo</b> abre uno vacío para escribirlo aquí, secuencia a secuencia.</>}
        </div>
      )}
    </div>
  );
}
