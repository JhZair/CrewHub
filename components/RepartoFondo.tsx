"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import Avatar from "@/components/Avatar";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import {
  agregarAlReparto, editarReparto, quitarDelReparto,
  repartirEnFondo, traerRepartoDelProyecto,
} from "@/app/actions";
import {
  agrupar, leerFila, estadoCesion, firmadaSinPrueba, procedenciaDe,
  resumenCesiones, rolesReparto, rotuloReparto,
  COLOR_CESION, ROTULO_CESION, ROTULO_PROCEDENCIA, CLAUSULA_CESION,
  type FilaReparto, type CesionEstado,
} from "@/lib/repartoFondo";

/* ══════════════════════════════════════════════════════════════════════════
   🎭 EL EQUIPO ARTÍSTICO DEL FONDO

   Quién sale en la película que este fondo financia, agrupado por lo que es en
   ella: protagonismo y conducción, secundarios, testimonios y voces expertas.
   Agrupado y no en una lista plana porque la pregunta que se le hace a esta
   pantalla casi nunca es «¿quién está?» sino «¿cuántas voces expertas
   tenemos?» — y eso, en una lista de treinta nombres ordenados por fecha de
   alta, no se contesta.

   ── LA COLUMNA QUE IMPORTA ES LA DE LA DERECHA ──
   La cesión de imagen y voz. Sin ese papel el material no se puede usar, y se
   descubre en montaje, que es cuando volver a pedirlo significa volver a la
   comunidad. Por eso el contador va arriba, en la cabecera, y no escondido en
   cada ficha: lo que no se ve en el primer vistazo no existe.

   ── DOS LISTAS QUE NO SE PISAN ──
   El reparto del PROYECTO (`proyecto_actores`) tiene la ficha larga —qué
   quiere, qué necesita, el arte—. Esta lista es del FONDO y guarda lo que el
   proyecto no sabe: quién estaba en el expediente que ganó y quién apareció
   rodando. `→ ficha` lleva a la del proyecto en vez de duplicarla; dos fichas
   de la misma persona divergen a la primera corrección.
   ══════════════════════════════════════════════════════════════════════════ */

export default function RepartoFondo({
  postulacionId, proyectoId, filas, personas, tipo, error: errServidor,
}: {
  postulacionId: string;
  /** El proyecto del fondo, para poder traer su reparto. Si el fondo no cuelga
   *  de ninguno, el botón no se pinta —en vez de fallar al pulsarlo—. */
  proyectoId?: string | null;
  filas: FilaReparto[];
  personas: CatalogoItem[];
  tipo?: string | null;
  /** Si la consulta falló, POR QUÉ. Sin esto la lista sale vacía y eso se lee
   *  como «no hay nadie», que es justo lo contrario de lo que pasa — y aquí
   *  además se leería como «no falta ninguna cesión». */
  error?: string | null;
}) {
  const R = rotuloReparto(tipo);
  const ROLES = rolesReparto(tipo);

  const [agregando, setAgregando] = useState(false);
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null);
  const [nom, setNom] = useState("");
  const [rol, setRol] = useState("");
  const [esp, setEsp] = useState("");
  const [proc, setProc] = useState<"postulacion" | "ejecucion">("ejecucion");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ed, setEd] = useState<Record<string, any>>({});
  const [quitando, setQuitando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const router = useRouter();

  const inputStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 10px", fontSize: 13, color: "var(--text)", width: "100%",
  } as const;

  const grupos = agrupar(filas);
  const res = resumenCesiones(filas);

  /* En documental se pide la persona —Braulia ES el personaje—; en ficción
     basta el nombre, porque el casting llega después. */
  const puedeGuardar = R.pideNombre ? (!!nom.trim() || !!sel) : !!sel;

  const limpiar = () => { setSel(null); setNom(""); setRol(""); setEsp(""); setProc("ejecucion"); setAgregando(false); };

  const guardar = async () => {
    if (!puedeGuardar || ocupado) return;
    setOcupado(true); setError("");
    const r: any = await agregarAlReparto(postulacionId, {
      personaId: sel?.id || null, personaje: nom, rol, especialidad: esp, procedencia: proc,
    });
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    limpiar(); router.refresh();
  };

  const traer = async () => {
    if (!proyectoId || ocupado) return;
    setOcupado(true); setError(""); setAviso("");
    const r: any = await traerRepartoDelProyecto(postulacionId, proyectoId);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    /* Se dice cuántos se saltaron y no solo cuántos entraron: «0 copiados» a
       secas se lee como que falló. Y el proyecto vacío trae su propio aviso —no
       es lo mismo «ya estaban todos» que «allí tampoco hay nadie»—. */
    setAviso(r.aviso || (r.copiados
      ? `Traídos ${r.copiados}${r.saltados ? `, saltados ${r.saltados} que ya estaban` : ""}.`
      : "No había nadie nuevo que traer: ya estaban todos."));
    router.refresh();
  };

  const abrir = (f: FilaReparto) => {
    if (abierto === f.id) { setAbierto(null); return; }
    setEd({
      rol: f.rol || "", especialidad: f.especialidad || "", nota: f.nota || "",
      procedencia: procedenciaDe(f), cesion_estado: estadoCesion(f),
      cesion_url: f.cesion_url || "", cesion_fecha: f.cesion_fecha || "",
      personaje: f.personaje || "",
    });
    setAbierto(f.id); setError(""); setAviso("");
  };

  const guardarFila = async (id: string) => {
    setOcupado(true); setError("");
    const r: any = await editarReparto(id, postulacionId, ed);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    setAbierto(null); router.refresh();
  };

  /* Cambiar la cesión desde la propia burbuja, sin abrir la ficha. Es el dato
     que más veces se toca y el único que se toca de a uno —«ya firmó»— así que
     obligarle a abrir un formulario de siete campos para marcar una casilla
     garantizaba que nadie lo mantuviera al día. */
  const ciclarCesion = async (f: FilaReparto) => {
    const orden: CesionEstado[] = ["pendiente", "firmada", "no_aplica"];
    const sig = orden[(orden.indexOf(estadoCesion(f)) + 1) % orden.length];
    setOcupado(true); setError("");
    const r: any = await editarReparto(f.id, postulacionId, { cesion_estado: sig });
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  const quitar = async (id: string) => {
    setOcupado(true);
    const r: any = await quitarDelReparto(id, postulacionId);
    setOcupado(false); setQuitando(null);
    if (r?.error) setError(r.error); else router.refresh();
  };

  const repartir = async (id: string, personaId: string | null) => {
    setOcupado(true); setError("");
    const r: any = await repartirEnFondo(id, postulacionId, personaId);
    setOcupado(false);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  const set = (k: string, v: any) => setEd(e => ({ ...e, [k]: v }));

  return (
    <div className="rep-wrap">
      {/* ── LA CABECERA: cuántos son y cuántos papeles faltan ──
          El contador de cesiones NO se pinta cuando la consulta falló: con la
          lista vacía diría «0 pendientes», que se lee como «está todo firmado»
          y es lo contrario de la verdad. */}
      <div className="rep-cab">
        {/* El contador tampoco se pinta con la consulta rota: «Equipo artístico
            · 0» junto al aviso rojo es el mismo cero que en realidad es «no lo
            sé», y el ojo se queda con el número. */}
        <span className="rep-cab-t">{R.ico} {R.titulo}{errServidor ? "" : ` · ${filas.length}`}</span>
        {!errServidor && filas.length > 0 && (
          <span className="rep-cesiones" title={`Cesión de derechos de imagen y voz — se rinde en la cláusula ${CLAUSULA_CESION} del acta`}>
            {res.pendientes > 0
              ? <b style={{ color: "var(--yellow)" }}>⚠ {res.pendientes} sin cesión</b>
              : <b style={{ color: "var(--green)" }}>✔ cesiones al día</b>}
            <span className="rep-cesiones-d">
              {res.firmadas} firmada{res.firmadas === 1 ? "" : "s"}
              {res.noAplica > 0 && ` · ${res.noAplica} no aplica`}
            </span>
          </span>
        )}
        <span style={{ flex: 1 }} />
        {proyectoId && !agregando && (
          <button className="btn btn-ghost rep-btn" disabled={ocupado} onClick={traer}
            title="Copiar al fondo el reparto que tiene el proyecto. No pisa lo que ya esté escrito aquí.">
            ⬇ Traer del proyecto
          </button>
        )}
        {!agregando && (
          <button className="btn btn-ghost rep-btn" onClick={() => { setAgregando(true); setAviso(""); }}>＋ Agregar</button>
        )}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}
      {aviso && <div className="rep-aviso">{aviso}</div>}
      {errServidor && (
        <div className="err-inline" style={{ lineHeight: 1.5 }}>
          ⚠ No se pudo leer el equipo artístico, así que esta lista está vacía por un fallo, no porque
          no haya nadie — y el contador de cesiones no se pinta, porque diría que no falta ninguna.
          <br /><code style={{ fontSize: 11, opacity: .85 }}>{errServidor}</code>
          {/column|does not exist|schema cache|PGRST20/i.test(errServidor) && (
            <><br /><b>Falta correr <code>db/postulacion-reparto.sql</code> en Supabase.</b></>
          )}
        </div>
      )}

      {agregando && (
        <div className="pj-nuevo">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {R.pideNombre && (
              <input value={nom} onChange={e => setNom(e.target.value)}
                placeholder="Nombre del personaje — «Robomac»"
                style={{ ...inputStyle, flex: 1, minWidth: 180, width: "auto" }} autoFocus />
            )}
            <EntPicker etiqueta={sel ? `👤 ${sel.nombre}` : `👤 ${R.etqPersona}${R.pideNombre ? " (si ya hay)" : ""}`}
              items={personas}
              onPick={id => {
                const p: any = personas.find(x => x.id === id);
                if (p) setSel({ id: p.id, nombre: p.nombre });
              }} />
            <input list="roles-reparto" value={rol} onChange={e => setRol(e.target.value)}
              placeholder="Papel (protagonista, testimonio…)"
              style={{ ...inputStyle, flex: 1, minWidth: 170, width: "auto" }} />
            <datalist id="roles-reparto">{ROLES.map(r => <option key={r} value={r} />)}</datalist>
            {/* La especialidad solo tiene sentido con voces expertas, pero el
                campo no se esconde según lo que se haya escrito en el papel:
                un input que aparece y desaparece mientras tecleas es peor que
                uno que a veces sobra. */}
            <input value={esp} onChange={e => setEsp(e.target.value)}
              placeholder="Especialidad (antropóloga, bióloga…)"
              style={{ ...inputStyle, flex: 1, minWidth: 170, width: "auto" }} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <SelProcedencia valor={proc} onCambia={setProc} />
            <span style={{ flex: 1 }} />
            <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
              title={puedeGuardar ? "Guardar" : R.pideNombre ? "Escribe el nombre del personaje o elige al intérprete" : "Elige la persona"}
              disabled={!puedeGuardar || ocupado} onClick={guardar}>
              {ocupado ? "…" : "Guardar"}
            </button>
            <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
              onClick={limpiar}>Cancelar</button>
          </div>
        </div>
      )}

      {grupos.map(({ grupo, filas: fs }) => (
        <div key={grupo.k} className="rep-grupo">
          <div className="rep-grupo-t">{grupo.titulo} · {fs.length}</div>
          {fs.map(f => {
            const L = leerFila(f);
            const ces = estadoCesion(f);
            const pr = procedenciaDe(f);
            const desplegada = abierto === f.id;
            return (
              <div key={f.id} className="rep-fila">
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Avatar nombre={L.persona?.nombre || L.titulo} src={L.persona?.foto_url} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                      {L.esPersona && L.persona?.id
                        ? <Link href={`/entidad/persona/${L.persona.id}`} style={{ color: "var(--text)", fontWeight: 600, fontSize: 13.5 }}>{L.titulo} →</Link>
                        : <b style={{ fontSize: 13.5 }}>{L.titulo}</b>}
                      {f.rol && (
                        <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.14)", textTransform: "none", letterSpacing: 0, fontWeight: 700 }}>
                          {f.rol}
                        </span>
                      )}
                      {f.especialidad && <span className="badge rep-esp">{f.especialidad}</span>}
                      {/* De dónde viene. El del expediente se marca; el de
                          ejecución se deja apagado, que es lo normal y no hace
                          falta gritarlo en cada fila. */}
                      <span className={`rep-proc${pr === "postulacion" ? " es-post" : ""}`}
                        title={pr === "postulacion"
                          ? "Estaba en el expediente que ganó el fondo"
                          : "Se sumó durante la ejecución"}>
                        {ROTULO_PROCEDENCIA[pr]}
                      </span>
                    </div>

                    {L.pie && L.persona?.id && (
                      <div className="pj-pie">
                        <Link href={`/entidad/persona/${L.persona.id}`}>👤 {L.pie}</Link>
                        <button title="Quitar al intérprete" disabled={ocupado} onClick={() => repartir(f.id, null)}>✕</button>
                      </div>
                    )}
                    {L.sinRepartir && (
                      <div className="pj-pie">
                        <span className="pj-sinrepartir">sin repartir</span>
                        <EntPicker etiqueta="＋ intérprete" items={personas} onPick={pid => repartir(f.id, pid)} />
                      </div>
                    )}
                    {f.nota && !desplegada && (
                      <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}>{f.nota}</div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                    {/* La burbuja de la cesión: se pulsa y rota. Es el dato que
                        más se toca y el único que se toca de a uno. */}
                    <button className="rep-ces" style={{ color: COLOR_CESION[ces] }}
                      disabled={ocupado} onClick={() => ciclarCesion(f)}
                      title={`${ROTULO_CESION[ces]} — pulsa para cambiar. Se rinde en la cláusula ${CLAUSULA_CESION} del acta.`}>
                      {ces === "firmada" ? "✔" : ces === "no_aplica" ? "–" : "⚠"} {ROTULO_CESION[ces]}
                    </button>
                    {/* Marcada firmada pero sin enlace: no es un error —el papel
                        puede estar en un archivador— pero no se puede enseñar,
                        y en una rendición eso es no tenerlo. */}
                    {firmadaSinPrueba(f) && (
                      <span className="rep-sinprueba" title="Marcada como firmada, pero sin el documento adjunto: en una rendición eso no se puede probar.">sin documento</span>
                    )}
                    {f.cesion_url && (
                      <a href={f.cesion_url} target="_blank" rel="noreferrer" className="rep-doc" title="Ver la cesión firmada">📄</a>
                    )}
                    {quitando === f.id ? (
                      <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                        ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} disabled={ocupado} onClick={() => quitar(f.id)}>sí</button>
                        {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setQuitando(null)}>no</button>
                      </span>
                    ) : (
                      <>
                        {/* A la ficha larga del PROYECTO: qué quiere, qué
                            necesita, el arte. No se duplica aquí.
                            ⚠ SIN `#reparto`. El reparto del proyecto vive
                            dentro de la pestaña «Trayectoria» de un TabsPanel
                            que NO lleva `claves`, así que su contenido está en
                            `display:none` al entrar: un hash a un elemento sin
                            caja no hace nada —el navegador lo encuentra, no lo
                            enseña, y el clic no da error—. Es el mismo fallo
                            que ya está documentado en esa misma pantalla. El
                            rótulo dice «proyecto ↗» porque es lo que de verdad
                            hace: llevar al proyecto, no a la ficha. */}
                        {f.proyecto_actor_id && proyectoId && (
                          <Link href={`/entidad/proyecto/${proyectoId}`} className="rep-mas"
                            title="Su ficha completa —qué quiere, qué necesita, el arte— vive en el proyecto, pestaña Trayectoria">proyecto ↗</Link>
                        )}
                        <button style={{ color: desplegada ? "var(--violet)" : "var(--dim)", fontSize: 11.5 }}
                          onClick={() => abrir(f)}>{desplegada ? "▾ editar" : "▸ editar"}</button>
                        <button title="Quitar" style={{ color: "var(--dim)" }} onClick={() => setQuitando(f.id)}>✕</button>
                      </>
                    )}
                  </div>
                </div>

                {desplegada && (
                  <div className="rep-ed">
                    <div className="rep-ed-grid">
                      <label>
                        <span>Personaje</span>
                        <input value={ed.personaje || ""} onChange={e => set("personaje", e.target.value)}
                          placeholder={R.pideNombre ? "Robomac" : "(es la persona)"} style={inputStyle} />
                      </label>
                      <label>
                        <span>Papel</span>
                        <input list="roles-reparto" value={ed.rol || ""} onChange={e => set("rol", e.target.value)} style={inputStyle} />
                      </label>
                      <label>
                        <span>Especialidad</span>
                        <input value={ed.especialidad || ""} onChange={e => set("especialidad", e.target.value)}
                          placeholder="antropóloga, bióloga…" style={inputStyle} />
                      </label>
                      <label>
                        <span>Cesión</span>
                        <select value={ed.cesion_estado || "pendiente"} onChange={e => set("cesion_estado", e.target.value)}
                          style={inputStyle}>
                          <option value="pendiente">Pendiente</option>
                          <option value="firmada">Firmada</option>
                          <option value="no_aplica">No aplica</option>
                        </select>
                      </label>
                      <label>
                        <span>Fecha de la cesión</span>
                        <input type="date" value={ed.cesion_fecha || ""} onChange={e => set("cesion_fecha", e.target.value)}
                          style={inputStyle} />
                      </label>
                      <label>
                        <span>Documento (enlace)</span>
                        <input value={ed.cesion_url || ""} onChange={e => set("cesion_url", e.target.value)}
                          placeholder="https://…" style={inputStyle} />
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                      <SelProcedencia valor={ed.procedencia || "ejecucion"} onCambia={v => set("procedencia", v)} />
                    </div>
                    <label className="rep-nota">
                      <span>Nota</span>
                      <textarea value={ed.nota || ""} onChange={e => set("nota", e.target.value)} rows={2}
                        placeholder="Contexto, acuerdos, condiciones de la cesión…"
                        style={{ ...inputStyle, resize: "vertical" }} />
                    </label>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }}
                        disabled={ocupado} onClick={() => guardarFila(f.id)}>{ocupado ? "…" : "Guardar"}</button>
                      <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                        onClick={() => setAbierto(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {!filas.length && !agregando && !errServidor && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0", lineHeight: 1.5 }}>
          {R.vacio}
          {proyectoId && <><br />Si ya está escrito en el proyecto, <b>⬇ Traer del proyecto</b> lo copia aquí.</>}
        </div>
      )}
    </div>
  );
}

/* Los dos botones de procedencia, en vez de un `select` de dos opciones: son
   dos y hay que verlos los dos a la vez, porque la pregunta —«¿esto estaba en
   el expediente?»— se contesta comparando, no desplegando. */
function SelProcedencia({ valor, onCambia }: {
  valor: string; onCambia: (v: "postulacion" | "ejecucion") => void;
}) {
  return (
    <span className="rep-procsel">
      <span className="rep-procsel-t">Viene de</span>
      {(["postulacion", "ejecucion"] as const).map(v => (
        <button key={v} type="button"
          className={`rep-procsel-b${valor === v ? " on" : ""}`}
          onClick={() => onCambia(v)}
          title={v === "postulacion"
            ? "Estaba en el expediente que ganó el fondo"
            : "Se sumó durante la ejecución"}>
          {v === "postulacion" ? "la postulación" : "la ejecución"}
        </button>
      ))}
    </span>
  );
}
