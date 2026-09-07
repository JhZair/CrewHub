"use client";
import { situacionActorProyecto } from "@/app/actions";
import PermisosDeActor from "@/components/PermisosDeActor";
import {
  META_TIPO_AUT, riesgoDe, esPapelDeLaPersona, personaDeAutorizacion, permisoResuelto,
  type FilaAutorizacion, type NivelRiesgo, type FilaPersonaMin,
} from "@/lib/clearance";
import {
  repartirPorSituacion, situacionDe, type Situacion,
} from "@/lib/situacionReparto";
import { agregarActorProyecto, quitarActorProyecto,
  guardarFichaActor, repartirActor } from "@/app/actions";
import { EntPicker, type CatalogoItem } from "@/components/Composer";
import Avatar from "@/components/Avatar";
import { subirImagen, imagenesDePaste } from "@/lib/subirImagen";
import EditorImagenes from "@/components/EditorImagenes";
import Foto from "@/components/Foto";
import { rotuloActores, rolesDe, ordenarActores, leerActor, personaDe, esDocumental,
  CAMPOS_FICHA, CAMPOS_DETALLE, detallesDe, ARQUETIPOS, TIENE_FICHA } from "@/lib/actores";
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
export default function ActoresProyecto({
  proyectoId, actores, personas, tipo, error: errServidor,
  cesiones = [], cesionesError = "", hoy,
}: {
  proyectoId: string;
  actores: any[];
  personas: CatalogoItem[];
  /** Tipo del proyecto: decide cómo se llama esto y qué se pide. */
  tipo?: string | null;
  /** Si la consulta falló, POR QUÉ. Sin esto la lista se pinta vacía y eso se
   *  lee como «no hay personajes», que es justo lo contrario de lo que pasa. */
  error?: string;
  /** Las cesiones de TODO el reparto; se reparten por persona aquí. Quién
   *  autorizó que se le grabe, y quién que su música suene. */
  cesiones?: FilaAutorizacion[];
  /** El día de hoy en Lima, calculado en el servidor. ⚠ No se usa `new Date()`
   *  aquí: a partir de las 7 de la tarde en Perú ya sería mañana, y un plazo se
   *  daría por vencido un día antes. */
  hoy?: string;
  /** Mismo criterio que `error`: un cero que en realidad es «no se pudo leer»
   *  se lee como «no falta ninguna autorización». */
  cesionesError?: string;
}) {
  /* ── LOS PERMISOS, REPARTIDOS UNA VEZ ──
     ⚠ De `autorizacion`. Esta pantalla leía y ESCRIBÍA `proyecto_cesion`, la
     tabla que la migración del clearance dejó obsoleta — así que lo que se
     registraba aquí no salía en el semáforo, y al revés. Dos sitios diciendo
     cosas distintas sobre la misma firma.
     Ahora solo lee, y quien escribe es ⚖ clearance. */
  /* ⚠ Solo los papeles QUE HABLAN DE ELLA, y las dos funciones vienen de
     `lib/clearance` — no se decide aquí. Indexar por otorgante en una pantalla
     y por objeto en otra hacía que el mismo papel cayera bajo personas
     distintas en cada sitio; y sin el filtro, el permiso de la CASA que Braulia
     firmó como propietaria colgaba de su fila del reparto como si fuera un
     papel suyo de actriz. */
  const suyas = (cesiones as FilaAutorizacion[]).filter(esPapelDeLaPersona);
  const autsDe = new Map<string, FilaAutorizacion[]>();
  for (const a of suyas) {
    const k = personaDeAutorizacion(a);
    if (!k) continue;
    autsDe.set(k, [...(autsDe.get(k) || []), a]);
  }

  /* ── EL RIESGO, CON LA PERSONA DELANTE ──
     ⚠ `persona` no es opcional de verdad: sin ella, R5 —«es menor y no firma su
     representante legal», el motivo CRÍTICO— no puede dispararse nunca. Una
     actriz de quince años con su release firmado y su PDF salía aquí en verde
     mientras ⚖ clearance la pintaba en rojo. Volvía a haber dos pantallas
     diciendo cosas distintas del mismo papel, que es lo único que este cambio
     venía a matar: cerrada la puerta de la escritura, se había quedado abierta
     la del veredicto.
     Lo que sigue sin poder decirse aquí es lo que necesita el catálogo de obras
     y grabaciones; para un release de imagen, con esto basta. */
  const personasReparto = new Map<string, FilaPersonaMin>();
  for (const a of actores) {
    const p: any = personaDe(a);
    if (p?.id) personasReparto.set(p.id, p as FilaPersonaMin);
  }
  const riesgos: Record<string, NivelRiesgo> = Object.fromEntries(
    suyas.map(a => [a.id, riesgoDe(a, {
      hoy, persona: personasReparto.get(personaDeAutorizacion(a) || "") || null,
    })]),
  );

  /* El titular: cuántos confirmados no tienen su release firmado con papel.
     ⚠ Solo entre los CONFIRMADOS, que son los únicos a los que se les pide —
     contar a los candidatos dejaba un ⚠ que ningún clic podía apagar. */
  const confirmados = actores
    .filter((a: any) => situacionDe(a) === "confirmada")
    .map((a: any) => personaDe(a)?.id).filter(Boolean) as string[];
  const releaseDe = (id: string) =>
    (autsDe.get(id) || []).find(a => a.tipo === "imagen_voz_testimonio");
  const sinPapel = confirmados.filter(id => {
    const img = releaseDe(id);
    return !img || (img.estado !== "firmada" && img.estado !== "no_aplica")
      || (img.estado === "firmada" && !img.documento_id);
  }).length;
  /* ── Y LOS QUE TIENEN EL PAPEL PERO NO SIRVE ──
     ⚠ Cuenta aparte, y no sumado al de arriba, porque no es lo mismo y el
     rótulo tiene que poder decir cuál es: «sin firmar» manda a buscar una firma
     y «firmada con un problema grave» manda a ⚖ clearance a ver cuál. Meterlos
     en el mismo número obligaba a elegir una de las dos frases, y la que
     saliera sería falsa para la mitad.
     El caso real: una actriz de quince años con su release firmado y su PDF. La
     firma es de su madre, pero nadie registró que la madre la representa. En
     verde salía como resuelta; ⚖ clearance la pintaba en rojo. */
  const conPapelDudoso = confirmados.filter(id => {
    const img = releaseDe(id);
    if (!img || img.estado !== "firmada" || !img.documento_id) return false;
    const r = riesgos[img.id];
    return r === "critico" || r === "alto";
  }).length;

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
  /* Los descartados empiezan ABIERTOS, como en el reparto del fondo: en un
     documental de encuentro, a quién NO se grabó es parte de lo que se
     aprendió, y plegarlo de entrada lo esconde justo cuando aún se recuerda
     por qué. Se puede cerrar. */
  const [verDescartados, setVerDescartados] = useState(true);
  const [cambiando, setCambiando] = useState<string | null>(null);
  /* Alta como CANDIDATO en vez de como confirmado. Una casilla del formulario
     y no dos botones distintos: el alta es la misma, lo que cambia es en qué
     zona cae. */
  const [comoCandidato, setComoCandidato] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Confirmar, descartar o devolver a exploración. Candado POR FILA y no un
     booleano global: tocar a otro mientras el primero guarda no puede comerse
     el clic en silencio. */
  const cambiarSituacion = async (id: string, s: Situacion) => {
    if (cambiando) return;
    setCambiando(id); setError("");
    const r: any = await situacionActorProyecto(id, proyectoId, s);
    setCambiando(null);
    if (r?.error) { setError(r.error); return; }
    router.refresh();
  };
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
    const r: any = await agregarActorProyecto(
      proyectoId, sel?.id || "", rol, desc, nom, img || null, comoCandidato);
    setGuardando(false);
    if (r?.error) { setError(r.error); return; }
    setSel(null); setNom(""); setRol(""); setDesc(""); setImg("");
    /* `comoCandidato` NO se reinicia: quien está armando una lista de
       candidatos apunta varios seguidos, y volver a marcar la casilla cada vez
       es exactamente la fricción que hace que se deje de usar. */
    setAgregando(false);
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
    /* ⚠ Aquí se cargan TODOS los detalles, no solo los que pinta `detallesDe`.
       Si en un documental no se carga `genero`, el guardado lo mandaría vacío y
       borraría en silencio lo que alguien escribió antes de que este campo se
       ocultara. Cargado y no pintado, se guarda igual que estaba. */
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


  /* ── UNA FILA ──
     ⚠ FUNCIÓN, no componente. Definido dentro del render, React lo vería como
     un tipo distinto en cada pasada y desmontaría la ficha desplegada —con lo
     que se esté escribiendo dentro— en cuanto alguien confirmara a otro. Es la
     misma lección que ya está escrita en RepartoFondo. */
  const pintarFila = (a: any) => {
          const sit = situacionDe(a);
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

                  {/* ── QUIÉN AUTORIZÓ QUÉ ──
                      ⚠ Aquí, DEBAJO DEL NOMBRE, y no en la tira de botones de
                      la derecha donde estaba. Allí eran dos iconos de doce
                      píxeles entre la ficha, el ＋, el 🚫 y la ✕, con el estado
                      metido en un solo carácter: John registró la cesión de
                      imagen de Lino, volvió a la lista y no pudo saber si se
                      había guardado, porque el icono se veía igual antes y
                      después. Un dato que hay que descifrar es un dato que no
                      está.

                      Solo con persona vinculada: la cesión la firma alguien
                      real, y un personaje de ficción sin intérprete no tiene a
                      quién pedírsela.
                      Y solo en el reparto CONFIRMADO: pedirle la cesión a una
                      candidata que aún se está viendo es pedir un papel por un
                      trabajo que quizá no ocurra. */}
                  {sit === "confirmada" && per?.id && !cesionesError && !desplegada && (
                    <PermisosDeActor
                      proyectoId={proyectoId}
                      autorizaciones={autsDe.get(per.id) || []}
                      riesgos={riesgos} />
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
                      {/* ── LA SITUACIÓN, DESDE LA PROPIA FILA ──
                          Cada botón es el que FALTA en esa zona: al confirmado
                          se le ofrece descartar, al candidato confirmar o
                          descartar, y al descartado volver a exploración. Los
                          tres siempre habría que leerlos para saber cuál es el
                          de ahora.
                          ⚠ «Quitar» (✕ gris) BORRA la fila; «descartar» (🚫) la
                          conserva con su nota. Se separan a propósito: la nota
                          de por qué alguien no encajó es justo lo que evita
                          volver a proponerlo en seis meses. */}
                      {sit !== "confirmada" && (
                        <button title="Confirmar: entra en el proyecto"
                          style={{ color: "var(--green)" }} disabled={!!cambiando}
                          onClick={() => cambiarSituacion(a.id, "confirmada")}>✓</button>
                      )}
                      {sit !== "descartada" && (
                        <button title="Descartar: no entra, pero queda apuntado con su nota"
                          style={{ color: "var(--dim)" }} disabled={!!cambiando}
                          onClick={() => cambiarSituacion(a.id, "descartada")}>🚫</button>
                      )}
                      {sit !== "explorando" && (
                        <button title="Volver a exploración: todavía se está viendo"
                          style={{ color: "var(--dim)" }} disabled={!!cambiando}
                          onClick={() => cambiarSituacion(a.id, "explorando")}>🔎</button>
                      )}
                      <button title="Quitar del proyecto (BORRA la fila; para no perderla, descarta con 🚫)"
                        style={{ color: "var(--dim)" }} onClick={() => setQuitando(a.id)}>✕</button>
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
                    {detallesDe(tipo).map(c => (
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
  };

  /* Las tres zonas, en una sola pasada y con la MISMA regla que el reparto de
     un fondo (lib/situacionReparto): son la misma pregunta. Se ordena dentro de
     cada zona, no antes: mezclar el orden de papel con el de situación dejaba a
     un candidato a protagonista por delante de la protagonista confirmada. */
  const zonas = (() => {
    const z = repartirPorSituacion(actores as any[]);
    return {
      dentro: ordenarActores(z.dentro),
      explorando: ordenarActores(z.explorando),
      descartadas: ordenarActores(z.descartadas),
    };
  })();

  return (
    <div className="linked" style={{ marginTop: 14 }}>
      {/* ── EL DESPLEGABLE DE ROLES, EN LA RAÍZ ──
          ⚠ Vivía DENTRO del formulario de alta, que solo se renderiza con el
          formulario abierto. Resultado: al editar la ficha de alguien ya dado
          de alta, el `list="roles-actor"` apuntaba a un datalist que no existía
          y el campo Rol salía como una caja de texto vacía, sin sugerencias y
          sin dar ningún error. Aquí está siempre, y lo usan los dos sitios. */}
      <datalist id="roles-actor">{ROLES.map(r => <option key={r} value={r} />)}</datalist>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>
          {/* ⚠ El titular cuenta los CONFIRMADOS, no las filas.
              Sumando candidatos y descartados, «ACTORES SOCIALES · 6» diría
              seis contando a cuatro de los que aún no se sabe si estarán y a
              uno que ya se descartó: el número más visible del bloque sería el
              más falso. Los otros dos se cuentan en su propia zona, donde la
              cifra significa algo distinto. */}
          {R.ico} {R.titulo} · {zonas.dentro.length}
          {zonas.explorando.length > 0 && (
            <span style={{ color: "var(--muted)", fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
              {" "}+ {zonas.explorando.length} en exploración
            </span>
          )}
          {/* ── QUÉ FALTA AUTORIZAR ──
              La pregunta que se hace antes de estrenar, y que hoy no se hacía
              en ninguna parte para los proyectos sin fondo DAFO.
              ⚠ Si la consulta de cesiones falló NO se pinta el recuento: un
              «todo autorizado» calculado sobre una lista vacía por error es la
              mentira más cara que puede decir esta pantalla. */}
          {!cesionesError && confirmados.length > 0 && (
            <span className={sinPapel || conPapelDudoso ? "act-ces-falta" : "act-ces-ok"}>
              {sinPapel
                ? `⚠ ${sinPapel} sin ${META_TIPO_AUT.imagen_voz_testimonio.corto} firmada`
                : conPapelDudoso
                  ? `⚠ ${conPapelDudoso} con la firma puesta en duda`
                  : `✓ los ${confirmados.length} con su ${META_TIPO_AUT.imagen_voz_testimonio.corto}`}
              {/* Los dos números a la vez: el rótulo enseña el primero y este
                  añade el segundo, para que ninguno se quede sin decir. */}
              {/* ⚠ `> 0` y no `sinPapel &&`: con cero, `0 && x` vale `0` y React
                  pinta un «0» suelto al lado del rótulo. */}
              {sinPapel > 0 && conPapelDudoso > 0 ? ` · y ${conPapelDudoso} en duda` : ""}
            </span>
          )}
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
            /* Los DOS que puede faltar, no solo el primero: `situacion` y
               `situacion_en` llegaron después, y el aviso mandaba a correr un
               archivo que ya estaba corrido mientras la lista salía vacía. */
            <><br /><b>Falta correr <code>db/proyecto-personajes.sql</code> o <code>db/proyecto-actores-situacion.sql</code> en Supabase.</b></>
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
          </div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            placeholder={R.pideNombre ? "¿Qué hay que saber de este personaje?" : "Descripción del personaje (opcional)"}
            rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          {/* ── ¿ENTRA, O TODAVÍA SE ESTÁ VIENDO? ──
              Una casilla y no dos botones distintos: el alta es la misma, lo
              único que cambia es en qué zona cae. Por defecto entra dentro,
              que es lo que se hacía hasta hoy y lo que uno espera al pulsar
              «agregar»; la exploración se pide marcando. */}
          <label className="pj-cand" title="Todavía no está decidido: cae en «En exploración» y se confirma o se descarta desde su fila.">
            <input type="checkbox" checked={comoCandidato}
              onChange={e => setComoCandidato(e.target.checked)} />
            <span>Es un <b>candidato</b> — todavía se está viendo</span>
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
              title={puedeGuardar ? "Guardar" : doc ? "Elige la persona" : "Escribe el nombre del personaje o elige al intérprete"}
              disabled={!puedeGuardar || guardando} onClick={guardar}>
              {guardando ? "…" : comoCandidato ? "Guardar candidato" : "Guardar"}
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

      {/* ── LAS TRES ZONAS ──
          Dentro, en exploración y descartados. Misma pantalla que el reparto de
          un fondo, a propósito. */}
      {zonas.dentro.map(a => pintarFila(a))}

      {zonas.explorando.length > 0 && (
        <div className="pj-zona">
          <div className="pj-zona-h">
            🔎 En exploración
            <span className="pj-zona-n">{zonas.explorando.length}</span>
            <span className="pj-zona-nota">
              todavía no está decidido — confirma con ✓ o descarta con 🚫
            </span>
          </div>
          {zonas.explorando.map(a => pintarFila(a))}
        </div>
      )}

      {zonas.descartadas.length > 0 && (
        <div className="pj-zona pj-zona-off">
          <button type="button" className="pj-zona-h pj-zona-btn"
            onClick={() => setVerDescartados(v => !v)}>
            {verDescartados ? "▾" : "▸"} 🚫 Descartados
            <span className="pj-zona-n">{zonas.descartadas.length}</span>
            <span className="pj-zona-nota">
              no se borran: saber a quién descartaste evita volver a proponerlo dentro de seis meses
            </span>
          </button>
          {verDescartados && zonas.descartadas.map(a => pintarFila(a))}
        </div>
      )}

      {cesionesError && (
        <div className="err-inline" style={{ marginBottom: 8 }}>⚠ {cesionesError}</div>
      )}

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
