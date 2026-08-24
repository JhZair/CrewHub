"use client";
import { agregarActorProyecto, quitarActorProyecto,
  guardarFichaActor, repartirActor } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import Avatar from "@/components/Avatar";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import EditorImagenes from "@/components/EditorImagenes";
import Foto from "@/components/Foto";
import { rotuloActores, rolesDe, ordenarActores, leerActor, personaDe, esDocumental,
  CAMPOS_FICHA, CAMPOS_DETALLE, ARQUETIPOS, TIENE_FICHA } from "@/lib/actores";
import { useRouter } from "next/navigation";
import Link from "@/components/Enlace";
import { useRef, useState } from "react";

/* QUIÉN APARECE EN LA PELÍCULA.
 *
 * Esta sección nació para el documental, donde la persona y el personaje son
 * la misma cosa: Braulia Puma es Braulia Puma, y basta con elegirla de la
 * tabla de personas. En ficción y animación no: Robomac no tiene —ni debe
 * tener— ficha en `personas`, que es donde viven los DNI y las jornadas.
 *
 * Y no van al mismo ritmo. El personaje existe desde el guion; quien lo
 * interpreta aparece en casting, meses después. Por eso «sin repartir» no es
 * un dato que falte: es un estado normal, y se dice.
 *
 * La ficha —qué quiere, qué necesita— tampoco es cosa de ficción. El
 * tratamiento de un documental pide lo mismo y el jurado DAFO lee justamente
 * eso. Cambia el rótulo según el tipo de proyecto; el modelo es uno solo.
 */
export default function ActoresProyecto({ proyectoId, actores, personas, tipo, error: errServidor }: {
  proyectoId: string;
  actores: any[];
  personas: CatalogoItem[];
  /** Tipo del proyecto: decide cómo se llama esto y qué se pide. */
  tipo?: string | null;
  /** Si la consulta falló, POR QUÉ. Sin esto la lista se pinta vacía y eso se
   *  lee como «no hay personajes», que es justo lo contrario de lo que pasa. */
  error?: string;
}) {
  const R = rotuloActores(tipo);
  const ROLES = rolesDe(tipo);
  const doc = esDocumental(tipo);

  const [agregando, setAgregando] = useState(false);
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null);
  const [nom, setNom] = useState("");
  const [rol, setRol] = useState("");
  const [desc, setDesc] = useState("");
  const [img, setImg] = useState<string>("");
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);   // ficha desplegada
  const [ficha, setFicha] = useState<Record<string, any>>({});
  /* La galería viaja aparte del resto de la ficha porque es un array y el
     resto son cadenas; mezclarlas obligaría a que cada `set` supiera de qué
     tipo es lo que guarda. */
  const [gal, setGal] = useState<string[]>([]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const inputStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 10px", fontSize: 13, color: "var(--text)", width: "100%",
  } as const;

  /* Se puede guardar con persona O con nombre de personaje. En documental se
     pide la persona; en ficción basta el nombre, porque el casting llega
     después y exigirlo aquí bloquearía escribir el reparto. */
  const puedeGuardar = doc ? !!sel : (!!nom.trim() || !!sel);

  async function subir(f?: File | null) {
    if (!f) return;
    setSubiendo(true); setError("");
    const r = await subirImagen(f);
    setSubiendo(false);
    if (r.error) { setError(r.error); return; }
    setImg(r.url || "");
  }

  const guardar = async () => {
    if (!puedeGuardar || guardando) return;
    setGuardando(true); setError("");
    const r: any = await agregarActorProyecto(proyectoId, sel?.id || "", rol, desc, nom, img || null);
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    setSel(null); setNom(""); setRol(""); setDesc(""); setImg(""); setAgregando(false);
    router.refresh();
  };

  const quitar = async (id: string) => {
    const r: any = await quitarActorProyecto(id, proyectoId);
    setQuitando(null);
    if (r?.error) setError(r.error); else router.refresh();
  };

  const abrirFicha = (a: any) => {
    if (abierto === a.id) { setAbierto(null); return; }
    const f: Record<string, string> = {};
    [...CAMPOS_FICHA, ...CAMPOS_DETALLE].forEach(c => { f[c.k] = a[c.k] || ""; });
    f.personaje = a.personaje || ""; f.rol = a.rol || "";
    f.arquetipo = a.arquetipo || ""; f.imagen_url = a.imagen_url || "";
    setGal(Array.isArray(a.imagenes) ? a.imagenes : []);
    setFicha(f); setAbierto(a.id); setError("");
  };

  const guardarFicha = async (id: string) => {
    setGuardando(true); setError("");
    const r: any = await guardarFichaActor(id, proyectoId, { ...ficha, imagenes: gal });
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    setAbierto(null); router.refresh();
  };

  const repartir = async (id: string, personaId: string | null) => {
    const r: any = await repartirActor(id, proyectoId, personaId);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };

  const set = (k: string, v: string) => setFicha(f => ({ ...f, [k]: v }));

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          {R.ico} {R.titulo} · {actores.length}
        </h4>
        <span style={{ flex: 1 }} />
        {!agregando && (
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
            onClick={() => setAgregando(true)}>＋ Agregar</button>
        )}
      </div>

      {error && <div className="err-inline">⚠ {error}</div>}
      {errServidor && (
        <div className="err-inline" style={{ lineHeight: 1.5 }}>
          ⚠ No se pudo leer el reparto, así que esta lista está vacía por un fallo, no porque no haya nadie.
          <br /><code style={{ fontSize: 11, opacity: .85 }}>{errServidor}</code>
          {/^column|does not exist|schema cache/i.test(errServidor) && (
            <><br /><b>Falta correr <code>db/proyecto-personajes.sql</code> en Supabase.</b></>
          )}
        </div>
      )}

      {agregando && (
        <div className="pj-nuevo">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* En ficción, el nombre del personaje va PRIMERO: es lo único que
                existe seguro cuando se escribe el reparto. */}
            {R.pideNombre && (
              <input value={nom} onChange={e => setNom(e.target.value)}
                placeholder="Nombre del personaje — «Robomac»"
                style={{ ...inputStyle, flex: 1, minWidth: 190, width: "auto" }} autoFocus />
            )}
            <EntPicker etiqueta={sel ? `👤 ${sel.nombre}` : `👤 ${R.etqPersona}${R.pideNombre ? " (si ya hay)" : ""}`}
              items={personas}
              onPick={id => {
                const p: any = personas.find(x => x.id === id);
                if (p) setSel({ id: p.id, nombre: p.alias || p.nombre });
              }} />
            <input list="roles-actor" value={rol} onChange={e => setRol(e.target.value)}
              placeholder="Rol (protagonista, secundario…)"
              style={{ ...inputStyle, flex: 1, minWidth: 160, width: "auto" }} />
            <datalist id="roles-actor">{ROLES.map(r => <option key={r} value={r} />)}</datalist>
          </div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            placeholder={R.pideNombre ? "¿Qué hay que saber de este personaje?" : "Descripción del personaje (opcional)"}
            rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
              title={puedeGuardar ? "Guardar" : doc ? "Elige la persona" : "Escribe el nombre del personaje o elige al intérprete"}
              disabled={!puedeGuardar || guardando} onClick={guardar}>
              {guardando ? "…" : "Guardar"}
            </button>
            <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
              onClick={() => { setAgregando(false); setSel(null); setNom(""); setRol(""); setDesc(""); setImg(""); }}>Cancelar</button>
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={e => subir(e.target.files?.[0])} />
            <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
              disabled={subiendo} onClick={() => fileRef.current?.click()}>
              {subiendo ? "Subiendo…" : img ? "✔ Imagen" : "🖼 Imagen"}
            </button>
            {img && <img src={img} alt="" className="pj-mini" />}
          </div>
        </div>
      )}

      {ordenarActores(actores).map(a => {
        const L = leerActor(a);
        const per = personaDe(a);
        const desplegada = abierto === a.id;
        return (
          <div key={a.id} className="pj-fila">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {/* La cara del personaje manda sobre la del intérprete: en la
                  lista se busca a Robomac, no a quien le pone la voz. */}
              {a.imagen_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.imagen_url} alt="" className="pj-cara" />
                : <Avatar nombre={per?.nombre || L.titulo} src={per?.foto_url} size={38} />}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {L.esPersona && per?.id
                    ? <Link href={`/entidad/persona/${per.id}`} style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>
                        {L.titulo} →
                      </Link>
                    : <b style={{ fontSize: 14 }}>{L.titulo}</b>}
                  {a.rol && (
                    <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.14)", textTransform: "none", letterSpacing: 0, fontWeight: 700 }}>
                      {a.rol}
                    </span>
                  )}
                  {a.arquetipo && <span className="badge pj-arq">{a.arquetipo}</span>}
                </div>

                {/* Quién lo interpreta, o que todavía no lo interpreta nadie.
                    Un hueco en blanco se lee como un olvido; «sin repartir» se
                    lee como lo que es: el guion va por delante del casting. */}
                {L.pie && per?.id && (
                  <div className="pj-pie">
                    <Link href={`/entidad/persona/${per.id}`}>👤 {L.pie}</Link>
                    <button title="Quitar al intérprete" onClick={() => repartir(a.id, null)}>✕</button>
                  </div>
                )}
                {L.sinRepartir && (
                  <div className="pj-pie">
                    <span className="pj-sinrepartir">sin repartir</span>
                    <EntPicker etiqueta="＋ intérprete" items={personas}
                      onPick={pid => repartir(a.id, pid)} />
                  </div>
                )}

                {a.descripcion && !desplegada && (
                  <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>
                    {a.descripcion}
                  </div>
                )}

                {/* Lo que la ficha ya tiene escrito, sin abrirla. Si no hay
                    nada, no se pinta una cabecera vacía. */}
                {!desplegada && (a.quiere || a.necesita) && (
                  <div className="pj-deseo">
                    {a.quiere && <div><b>Quiere</b> {a.quiere}</div>}
                    {a.necesita && <div><b>Necesita</b> {a.necesita}</div>}
                  </div>
                )}

                {/* El arte se ve SIN abrir la ficha. Una galería que solo
                    aparece en modo edición es una galería que no existe: nadie
                    entra a editar para mirar. Clic para abrirla a tamaño real
                    —una hoja de modelo en miniatura no se lee—. */}
                {!desplegada && (a.imagenes || []).length > 0 && (
                  <div className="pj-tira">
                    {(a.imagenes as string[]).map((u, i) => (
                      <Foto key={i} src={u} maxHeight={96} />
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                {quitando === a.id ? (
                  <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                    ¿quitar? <button style={{ color: "var(--red)", fontWeight: 700 }} onClick={() => quitar(a.id)}>sí</button>
                    {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setQuitando(null)}>no</button>
                  </span>
                ) : (
                  <>
                    <button style={{ color: desplegada ? "var(--violet)" : "var(--dim)", fontSize: 11.5 }}
                      title="Ficha del personaje" onClick={() => abrirFicha(a)}>
                      {desplegada ? "▾ ficha" : TIENE_FICHA(a) ? "▸ ficha" : "▸ ficha…"}
                    </button>
                    <button title="Quitar" style={{ color: "var(--dim)" }} onClick={() => setQuitando(a.id)}>✕</button>
                  </>
                )}
              </div>
            </div>

            {desplegada && (
              <div className="pj-ficha">
                <div className="pj-detalles">
                  <label>
                    <span>Personaje</span>
                    <input value={ficha.personaje || ""} onChange={e => set("personaje", e.target.value)}
                      placeholder={doc ? "(es la persona)" : "Robomac"} style={inputStyle} />
                  </label>
                  <label>
                    <span>Rol</span>
                    <input list="roles-actor" value={ficha.rol || ""} onChange={e => set("rol", e.target.value)} style={inputStyle} />
                  </label>
                  <label>
                    <span>Arquetipo</span>
                    <input list="arquetipos" value={ficha.arquetipo || ""} onChange={e => set("arquetipo", e.target.value)}
                      placeholder="Héroe, Mentor…" style={inputStyle} />
                    <datalist id="arquetipos">{ARQUETIPOS.map(x => <option key={x} value={x} />)}</datalist>
                  </label>
                  {CAMPOS_DETALLE.map(c => (
                    <label key={c.k}>
                      <span>{c.label}</span>
                      <input value={ficha[c.k] || ""} onChange={e => set(c.k, e.target.value)}
                        placeholder={c.hint} style={inputStyle} />
                    </label>
                  ))}
                </div>

                {CAMPOS_FICHA.map(c => (
                  <label key={c.k} className={`pj-campo${c.par ? " par" : ""}`}>
                    <span>{c.label}</span>
                    {c.area
                      ? <textarea value={ficha[c.k] || ""} onChange={e => set(c.k, e.target.value)}
                          placeholder={c.hint} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                      : <input value={ficha[c.k] || ""} onChange={e => set(c.k, e.target.value)}
                          placeholder={c.hint} style={inputStyle} />}
                  </label>
                ))}

                {/* ARTE — hoja de modelo, ortogonales, paleta, ciclos de poses.
                    Todo esto es material de postulación: el diseño de personaje
                    se adjunta al expediente DAFO. Con una sola imagen no cabía,
                    y acababa en una carpeta de Drive que no sabe de qué
                    personaje es. Ctrl+V pega directo, como en el muro. */}
                <div className="pj-arte"
                  onPaste={e => {
                    const files = imagenesDePaste(e);
                    if (!files.length) return;
                    e.preventDefault();
                    (async () => {
                      const urls: string[] = [];
                      for (const f of files) {
                        const r = await subirImagen(f);
                        if (r.error) { setError(r.error); break; }
                        if (r.url) urls.push(r.url);
                      }
                      if (urls.length) setGal(g => [...g, ...urls]);
                    })();
                  }}>
                  <span className="pj-arte-t">Arte del personaje · {gal.length}</span>
                  <EditorImagenes imgs={gal} setImgs={setGal} max={12} onError={setError} />
                  <span className="pj-arte-h">Hoja de modelo, ortogonales, paleta, poses… (o pega con Ctrl+V)</span>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                  <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }}
                    disabled={guardando} onClick={() => guardarFicha(a.id)}>
                    {guardando ? "…" : "Guardar ficha"}
                  </button>
                  <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => setAbierto(null)}>Cancelar</button>
                  <span style={{ flex: 1 }} />
                  <SubirCara actual={ficha.imagen_url} onSube={u => set("imagen_url", u)} onError={setError} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!actores.length && !agregando && !errServidor && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "4px 0" }}>{R.vacio}</div>
      )}
    </div>
  );
}

/* Subir (o quitar) la cara del personaje. Aparte porque necesita su propio
   `input file`: uno solo compartido entre el formulario de alta y N fichas
   abiertas acabaría escribiendo la imagen en la fila equivocada. */
function SubirCara({ actual, onSube, onError }: {
  actual?: string; onSube: (url: string) => void; onError: (e: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      {actual && <img src={actual} alt="" className="pj-mini" />}
      <input ref={ref} type="file" accept="image/*" hidden onChange={async e => {
        const f = e.target.files?.[0]; if (!f) return;
        setOcupado(true); onError("");
        const r = await subirImagen(f);
        setOcupado(false);
        if (r.error) onError(r.error); else onSube(r.url || "");
      }} />
      <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
        disabled={ocupado} onClick={() => ref.current?.click()}>
        {ocupado ? "Subiendo…" : actual ? "Cambiar imagen" : "🖼 Imagen"}
      </button>
      {actual && (
        <button style={{ color: "var(--dim)", fontSize: 11.5 }} onClick={() => onSube("")}>quitar</button>
      )}
    </span>
  );
}
