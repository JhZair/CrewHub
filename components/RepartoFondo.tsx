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
  repartir, leerFila, estadoCesion, firmadaSinPrueba, procedenciaDe, situacionDe,
  resumenCesiones, rolesReparto, rotuloReparto,
  COLOR_CESION, ROTULO_CESION, ROTULO_PROCEDENCIA, ROTULO_SITUACION, CLAUSULA_CESION,
  type FilaReparto, type CesionEstado, type Situacion,
} from "@/lib/repartoFondo";
/* `fechaDia` y NO `fechaDiaLima`: `situacion_en` es una columna `date`, y
   `fechaDiaLima` no pasa por `aFecha` — parsea la cadena como medianoche UTC y
   en Lima cae el día ANTERIOR. Una candidata descartada el 1 de enero salía
   «descartada el 31 dic.», del año pasado. */
import { fechaDia } from "@/lib/fechas";
import PapelesPersona from "@/components/PapelesPersona";
import { papelesPorPersona, type Papel } from "@/lib/papeles";

/* ══════════════════════════════════════════════════════════════════════════
   🎭 EL EQUIPO ARTÍSTICO DEL FONDO

   Quién sale en la película que este fondo financia, agrupado por lo que es en
   ella: conducción, protagonistas, secundarios, testimonios y voces expertas.
   Agrupado y no en una lista plana porque la pregunta que se le hace a esta
   pantalla casi nunca es «¿quién está?» sino «¿cuántas voces expertas
   tenemos?» — y eso, en una lista de treinta nombres ordenados por fecha de
   alta, no se contesta.

   ── TRES SITUACIONES, TRES ZONAS ──
   Un documental de personajes reales no se escribe: se busca. Arriba, quienes
   ya están dentro. Debajo, las CANDIDATAS a las que todavía hay que ir a ver,
   cada una con el papel al que aspira. Al final, apagadas, las DESCARTADAS: no
   se borran porque saber a quién descartaste —y por qué, en la nota— evita
   volver a proponer a la misma persona en seis meses.
   Confirmar a una candidata es un clic: no se reescribe nada, salta a su grupo.

   ── LA COLUMNA QUE IMPORTA ES LA DE LA DERECHA ──
   La cesión de imagen y voz. Sin ese papel el material no se puede usar, y se
   descubre en montaje, que es cuando volver a pedirlo significa volver a la
   comunidad. Por eso el contador va arriba y no escondido en cada ficha.
   ⚠ Y solo cuenta a las CONFIRMADAS: no se le pide un papel firmado a quien
   todavía se está yendo a ver. Un aviso que exagera es un aviso que se deja de
   mirar, y este es justo el que no se puede dejar de mirar.

   ── DOS LISTAS QUE NO SE PISAN ──
   El reparto del PROYECTO (`proyecto_actores`) tiene la ficha larga —qué
   quiere, qué necesita, el arte—. Esta lista es del FONDO y guarda lo que el
   proyecto no sabe: quién estaba en el expediente que ganó, quién apareció
   rodando y a quién se está explorando. «proyecto ↗» lleva a la ficha larga en
   vez de duplicarla; dos fichas de la misma persona divergen a la primera
   corrección.
   ══════════════════════════════════════════════════════════════════════════ */

export default function RepartoFondo({
  postulacionId, proyectoId, filas, personas, tipo, error: errServidor,
  papeles, hoy, papelesError = null, cargoEnNomina,
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
  /* ── LA CLÁUSULA 5.4 TAMBIÉN AQUÍ ──
     «Todo el personal vinculado» incluye a quien sale en la película: una
     protagonista social firma su contrato o su convenio igual que el
     sonidista. Es el MISMO componente que en 👥 Equipo — dos copias de la
     misma obligación se habrían separado a la primera corrección.

     ⚠ Los dos OBLIGATORIOS. Con `papeles` opcional, un llamante que se
     olvidara pintaría «sin contrato» a todo el mundo —la acusación falsa que
     el resto del código se esfuerza en evitar—; con `hoy` opcional, la columna
     entera DESAPARECÍA sin decir nada. Obligatorios, las dos son un error de
     compilación. */
  papeles: Papel[];
  /** Hoy en Lima, del servidor: el reloj del navegador puede estar en otra
   *  zona y pintar vencido un seguro que no lo está. */
  hoy: string;
  papelesError?: string | null;
  /** Persona → su cargo en la NÓMINA del fondo, para quien está en las dos
   *  listas. Yajaida es Directora Responsable y además conduce: verla aquí sin
   *  contrato, sin saber que ya lo tiene como directora, lleva a registrarle
   *  uno duplicado. */
  cargoEnNomina?: Map<string, string | null>;
}) {
  const R = rotuloReparto(tipo);
  const ROLES = rolesReparto(tipo);

  /* `null` = cerrado. Si está abierto, guarda CON QUÉ SITUACIÓN se está dando
     de alta, que es lo que distingue «＋ Agregar» de «＋ Candidata». Un
     booleano más una segunda variable habrían podido desincronizarse. */
  const [agregando, setAgregando] = useState<Situacion | null>(null);
  const [sel, setSel] = useState<{ id: string; nombre: string } | null>(null);
  const [nom, setNom] = useState("");
  const [rol, setRol] = useState("");
  const [esp, setEsp] = useState("");
  const [proc, setProc] = useState<"postulacion" | "ejecucion">("ejecucion");
  const [nota, setNota] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ed, setEd] = useState<Record<string, any>>({});
  const [quitando, setQuitando] = useState<string | null>(null);
  /* ABIERTA de entrada. Empezó plegada para que las descartadas no compitieran
     por la atención con quienes sí están, pero eso las volvía invisibles: la
     lista existe justamente para no volver a proponer a la misma persona
     dentro de seis meses, y una lista que hay que acordarse de abrir no cumple
     esa función — se mira cuando ya se propuso.
     Siguen apagadas al 45% y con el nombre tachado, que es lo que evita el
     ruido; lo que se quita es el clic de más. Y sigue plegándose a mano: en un
     fondo con veinte descartadas, quien está trabajando con las confirmadas
     puede cerrarla. */
  const [verDescartadas, setVerDescartadas] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const router = useRouter();

  const inputStyle = {
    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 10px", fontSize: 13, color: "var(--text)", width: "100%",
  } as const;

  const rep = repartir(filas);
  const res = resumenCesiones(filas);
  /* Un solo recorrido para todas las filas. */
  const papelDe = papelesPorPersona(papeles);

  /* En documental se pide la persona —Braulia ES el personaje—; en ficción
     basta el nombre, porque el casting llega después.
     ⚠ Salvo para una CANDIDATA: media exploración empieza con «una tejedora de
     Pitumarca de la que nos habló Zenón», sin ficha de persona y a veces sin
     nombre. Exigir la persona ahí obligaría a crear una ficha en `personas`
     —donde viven los DNI y los contactos— para poder apuntar una pista. */
  const esCandidata = agregando === "explorando";
  const pideNombreLibre = R.pideNombre || esCandidata;
  const puedeGuardar = pideNombreLibre ? (!!nom.trim() || !!sel) : !!sel;

  const limpiar = () => {
    setSel(null); setNom(""); setRol(""); setEsp(""); setNota("");
    setProc("ejecucion"); setAgregando(null);
  };

  const guardar = async () => {
    if (!puedeGuardar || ocupado || !agregando) return;
    setOcupado(true); setError("");
    const r: any = await agregarAlReparto(postulacionId, {
      personaId: sel?.id || null, personaje: nom, rol, especialidad: esp,
      procedencia: proc, nota, situacion: agregando,
    });
    setOcupado(false);
    if (r?.error) { fallo(r.error); return; }
    limpiar(); router.refresh();
  };

  const traer = async () => {
    if (!proyectoId || ocupado) return;
    setOcupado(true); setError(""); setAviso("");
    const r: any = await traerRepartoDelProyecto(postulacionId, proyectoId);
    setOcupado(false);
    if (r?.error) { fallo(r.error); return; }
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
      procedencia: procedenciaDe(f), situacion: situacionDe(f),
      cesion_estado: estadoCesion(f),
      cesion_url: f.cesion_url || "", cesion_fecha: f.cesion_fecha || "",
      personaje: f.personaje || "",
    });
    setAbierto(f.id); setError(""); setAviso("");
  };

  /* ⚠ SOLO LO QUE CAMBIÓ, no el formulario entero.
     Mandar los ocho campos siempre parece inofensivo —el resultado en la base
     es el mismo— pero rompe dos cosas que se deducen de «qué venía en el
     patch»: el sello de `situacion_en`, que volvía a fechar hoy a alguien
     descartada en marzo por corregirle una tilde a la nota; y el apunte del
     historial, que decía «marcó que entra en la película» aunque lo único que
     hubieras hecho fuera adjuntar el PDF de la cesión. Un formulario que
     manda de más obliga al servidor a adivinar la intención. */
  const guardarFila = async (f: FilaReparto) => {
    const antes: Record<string, any> = {
      rol: f.rol || "", especialidad: f.especialidad || "", nota: f.nota || "",
      procedencia: procedenciaDe(f), situacion: situacionDe(f),
      cesion_estado: estadoCesion(f),
      cesion_url: f.cesion_url || "", cesion_fecha: f.cesion_fecha || "",
      personaje: f.personaje || "",
    };
    const cambios: Record<string, any> = {};
    for (const k of Object.keys(antes)) {
      if ((ed[k] ?? "") !== antes[k]) cambios[k] = ed[k] ?? "";
    }
    if (!Object.keys(cambios).length) { setAbierto(null); return; }

    setOcupado(true); setError("");
    const r: any = await editarReparto(f.id, postulacionId, cambios);
    setOcupado(false);
    if (r?.error) { fallo(r.error); return; }
    setAbierto(null); router.refresh();
  };

  /** Un solo campo, sin abrir el editor. Lo usan la burbuja de la cesión y los
   *  botones de confirmar/descartar: son los tres gestos que se hacen de a uno
   *  y muchas veces, y obligar a abrir un formulario de siete campos para cada
   *  uno garantizaba que nadie los mantuviera al día. */
  const tocar = async (id: string, campos: Record<string, any>) => {
    setOcupado(true); setError("");
    const r: any = await editarReparto(id, postulacionId, campos);
    setOcupado(false);
    if (r?.error) { fallo(r.error); return; }
    router.refresh();
  };

  /** Cualquier error. Si habla de alguien descartada, se abre esa sección: el
   *  mensaje dice «mira en Descartadas» y esa sección puede estar cerrada a
   *  mano, así que sin esto se le pediría mirar donde no puede ver. */
  const fallo = (msg: string) => {
    setError(msg);
    if (/descartad/i.test(msg)) setVerDescartadas(true);
  };

  /** Confirmar a una candidata: entra en la película con el papel que tenga.
   *  ⚠ En documental se le vacía además el `personaje`. Una candidata se apunta
   *  con una descripción —«una tejedora de Pitumarca»— porque a veces ni
   *  siquiera se sabe su nombre; pero en cuanto tiene ficha de persona, ese
   *  texto deja de ser útil y pasa a ser dañino: `leerFila` usa el personaje
   *  como título, así que la fila se quedaría llamándose «tejedora de
   *  Pitumarca» con «👤 Braulia Puma» debajo en letra pequeña, para siempre y
   *  sin que nadie sepa que hay un campo que borrar. En ficción no se toca: ahí
   *  el personaje y el intérprete SÍ son dos cosas. */
  const confirmar = (f: FilaReparto) => {
    const campos: Record<string, any> = { situacion: "confirmada" };
    if (!R.pideNombre && f.persona_id && (f.personaje || "").trim()) campos.personaje = "";
    return tocar(f.id, campos);
  };

  const ciclarCesion = (f: FilaReparto) => {
    const orden: CesionEstado[] = ["pendiente", "firmada", "no_aplica"];
    const sig = orden[(orden.indexOf(estadoCesion(f)) + 1) % orden.length];
    return tocar(f.id, { cesion_estado: sig });
  };

  const quitar = async (id: string) => {
    setOcupado(true);
    const r: any = await quitarDelReparto(id, postulacionId);
    setOcupado(false); setQuitando(null);
    if (r?.error) fallo(r.error); else router.refresh();
  };

  /** Vincular (o soltar) a la persona que interpreta un personaje. */
  const asignarInterprete = async (id: string, personaId: string | null) => {
    setOcupado(true); setError("");
    const r: any = await repartirEnFondo(id, postulacionId, personaId);
    setOcupado(false);
    if (r?.error) { fallo(r.error); return; }
    router.refresh();
  };

  const set = (k: string, v: any) => setEd(e => ({ ...e, [k]: v }));

  /* ── UNA FILA ──
     Función y no componente: se llama `pintarFila(f)`, no `<PintarFila/>`, así
     que React no ve un tipo de componente nuevo en cada render (lo que
     desmontaría y volvería a montar el subárbol, perdiendo el foco del campo
     que estás escribiendo). A cambio usa los closures de arriba y no hace
     falta pasarle dieciocho props para pintarla igual en las tres zonas. */
  const pintarFila = (f: FilaReparto) => {
    const L = leerFila(f);
    const ces = estadoCesion(f);
    const pr = procedenciaDe(f);
    const sit = situacionDe(f);
    const desplegada = abierto === f.id;

    return (
      <div key={f.id} className={`rep-fila${sit === "descartada" ? " es-descartada" : ""}`}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Avatar nombre={L.persona?.nombre || L.titulo} src={L.persona?.foto_url} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
              {L.esPersona && L.persona?.id
                ? <Link href={`/entidad/persona/${L.persona.id}`} style={{ color: "var(--text)", fontWeight: 600, fontSize: 13.5 }}>{L.titulo} →</Link>
                : <b style={{ fontSize: 13.5 }}>{L.titulo}</b>}
              {f.rol && (
                <span className="badge" style={{ color: "var(--violet)", background: "rgba(167,139,250,.14)", textTransform: "none", letterSpacing: 0, fontWeight: 700 }}
                  /* En una candidata el papel es una aspiración, no un hecho, y
                     el badge tiene que decirlo o la lista de exploración se lee
                     como si ya estuviera repartida. */
                  title={sit === "explorando" ? "Papel al que aspira" : undefined}>
                  {sit === "explorando" ? "para " : ""}{f.rol}
                </span>
              )}
              {f.especialidad && <span className="badge rep-esp">{f.especialidad}</span>}
              {/* Hace la película además de salir en ella. Sin esto, ver a la
                  directora en el reparto se lee como un error de carga. */}
              {sit === "confirmada" && f.persona_id && cargoEnNomina?.has(f.persona_id) && (
                <span className="rep-doble" title="También está en el equipo del fondo: hace la película, además de salir en ella. Su contrato es uno solo.">
                  👥 {cargoEnNomina.get(f.persona_id) || "en el equipo"}
                </span>
              )}
              {/* La procedencia solo tiene sentido en quien ya está dentro: de
                  una candidata la pregunta no es «¿venía en el expediente?». */}
              {sit === "confirmada" && (
                <span className={`rep-proc${pr === "postulacion" ? " es-post" : ""}`}
                  title={pr === "postulacion"
                    ? "Estaba en el expediente que ganó el fondo"
                    : "Se sumó durante la ejecución"}>
                  {ROTULO_PROCEDENCIA[pr]}
                </span>
              )}
              {sit === "descartada" && f.situacion_en && (
                /* Con formato y no la cadena cruda: «2026-08-27» obliga a
                   traducir mentalmente en una lista que se lee de un vistazo, y
                   el resto de la aplicación ya escribe «27 ago.». */
                <span className="rep-proc" title="Cuándo se descartó">descartada el {fechaDia(f.situacion_en)}</span>
              )}
            </div>

            {L.pie && L.persona?.id && (
              <div className="pj-pie">
                <Link href={`/entidad/persona/${L.persona.id}`}>👤 {L.pie}</Link>
                <button title="Quitar al intérprete" disabled={ocupado} onClick={() => asignarInterprete(f.id, null)}>✕</button>
              </div>
            )}
            {L.sinRepartir && (
              <div className="pj-pie">
                {/* En exploración, «sin repartir» sería mentira: no es que falte
                    el casting, es que todavía es una pista. */}
                <span className="pj-sinrepartir">{sit === "explorando" ? "sin ficha de persona" : "sin repartir"}</span>
                <EntPicker etiqueta={sit === "explorando" ? "＋ vincular persona" : "＋ intérprete"}
                  items={personas} onPick={pid => asignarInterprete(f.id, pid)} />
              </div>
            )}
            {f.nota && !desplegada && (
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}>{f.nota}</div>
            )}

            {/* ── CONTRATO Y SEGURO (cláusula 5.4) ──
                Solo en quien está CONFIRMADA y tiene ficha de persona: a una
                candidata no se le pide un contrato —todavía se la está yendo a
                ver— y a «una tejedora de Pitumarca» sin ficha no hay a quién
                contratar. Con la consulta rota no se pinta: en blanco diría
                «sin contrato» para todos, que es una acusación falsa.
                Va en esta columna y no en la de botones porque su panel se
                despliega EN FLUJO y necesita el ancho de la fila. */}
            {sit === "confirmada" && f.persona_id && !papelesError && (
              <PapelesPersona postulacionId={postulacionId} personaId={f.persona_id}
                nombre={L.titulo} papeles={papelDe.get(f.persona_id) || []} hoy={hoy} compacto
                otroVinculo={cargoEnNomina?.has(f.persona_id)
                  ? { esCrew: true, que: cargoEnNomina.get(f.persona_id) || null }
                  : null} />
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
            {/* ── LO QUE SE PUEDE HACER, SEGÚN DÓNDE ESTÉ ──
                A una candidata no se le pide la cesión: no se le pide un papel
                firmado a quien todavía se está yendo a ver. Lo que se le hace
                es decidir. */}
            {sit === "confirmada" && (
              <>
                <button type="button" className="rep-ces" style={{ color: COLOR_CESION[ces] }}
                  disabled={ocupado} onClick={() => ciclarCesion(f)}
                  title={`${ROTULO_CESION[ces]} — pulsa para cambiar. Se rinde en la cláusula ${CLAUSULA_CESION} del acta.`}>
                  {ces === "firmada" ? "✔" : ces === "no_aplica" ? "–" : "⚠"} {ROTULO_CESION[ces]}
                </button>
                {/* Marcada firmada pero sin enlace: no es un error —el papel
                    puede estar en un archivador— pero no se puede enseñar, y en
                    una rendición eso es no tenerlo. */}
                {firmadaSinPrueba(f) && (
                  <span className="rep-sinprueba" title="Marcada como firmada, pero sin el documento adjunto: en una rendición eso no se puede probar.">sin documento</span>
                )}
              </>
            )}
            {/* ⚠ El documento va FUERA de la rama de confirmada. Una fila que
                llegó a tener su cesión firmada y luego se descartó sigue
                teniendo ese papel: existe, se firmó, y esconderlo obligaría a
                abrir el editor para encontrarlo. */}
            {f.cesion_url && (
              <a href={f.cesion_url} target="_blank" rel="noreferrer" className="rep-doc" title="Ver la cesión firmada">📄</a>
            )}
            {sit === "explorando" && (
              <>
                <button type="button" className="rep-dec rep-dec-si" disabled={ocupado}
                  onClick={() => confirmar(f)}
                  title="Entra en la película: pasa al equipo artístico con el papel que tenga escrito">✓ confirmar</button>
                <button type="button" className="rep-dec" disabled={ocupado}
                  onClick={() => tocar(f.id, { situacion: "descartada" })}
                  title="No entra. Se guarda descartada, para no volver a proponerla dentro de seis meses.">descartar</button>
              </>
            )}
            {/* Descartar a alguien que YA estaba dentro es el caso normal, no el
                raro: se enferma, un testimonio se cae, alguien se arrepiente.
                Sin este botón había que abrir el editor y encontrar el combo de
                Situación, o pulsar ✕ — que borra la decisión en vez de
                guardarla, justo lo contrario de lo que hace falta. */}
            {sit === "confirmada" && (
              <button type="button" className="rep-dec" disabled={ocupado}
                onClick={() => tocar(f.id, { situacion: "descartada" })}
                title="Sale de la película. Se guarda descartada, con la fecha, en vez de borrarse.">descartar</button>
            )}
            {sit === "descartada" && (
              <button type="button" className="rep-dec" disabled={ocupado}
                onClick={() => tocar(f.id, { situacion: "explorando" })}
                title="Volver a ponerla en exploración">↩ retomar</button>
            )}

            {quitando === f.id ? (
              <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                ¿borrar? <button style={{ color: "var(--red)", fontWeight: 700 }} disabled={ocupado} onClick={() => quitar(f.id)}>sí</button>
                {" / "}<button style={{ color: "var(--dim)" }} onClick={() => setQuitando(null)}>no</button>
              </span>
            ) : (
              <>
                {/* A la ficha larga del PROYECTO: qué quiere, qué necesita, el
                    arte. No se duplica aquí.
                    ⚠ SIN `#reparto`. El reparto del proyecto vive dentro de la
                    pestaña «Trayectoria» de un TabsPanel que NO lleva `claves`,
                    así que su contenido está en `display:none` al entrar: un
                    hash a un elemento sin caja no hace nada —el navegador lo
                    encuentra, no lo enseña, y el clic no da error—. El rótulo
                    dice «proyecto ↗» porque es lo que de verdad hace. */}
                {f.proyecto_actor_id && proyectoId && (
                  <Link href={`/entidad/proyecto/${proyectoId}`} className="rep-mas"
                    title="Su ficha completa —qué quiere, qué necesita, el arte— vive en el proyecto, pestaña Trayectoria">proyecto ↗</Link>
                )}
                <button style={{ color: desplegada ? "var(--violet)" : "var(--dim)", fontSize: 11.5 }}
                  onClick={() => abrir(f)}>{desplegada ? "▾ editar" : "▸ editar"}</button>
                {/* Borrar NO es descartar: descartar guarda la decisión, borrar
                    la hace desaparecer. Esto es para el error de tecleo. */}
                <button title="Borrar la fila (para descartar sin perderla, usa «descartar»)"
                  style={{ color: "var(--dim)" }} onClick={() => setQuitando(f.id)}>✕</button>
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
                <span>Situación</span>
                {/* Los rótulos salen de `ROTULO_SITUACION` y no escritos aquí:
                    escritos dos veces, el combo y la lista acaban llamando de
                    dos maneras distintas al mismo estado. */}
                <select value={ed.situacion || "confirmada"} onChange={e => set("situacion", e.target.value)}
                  style={inputStyle}>
                  {(["explorando", "confirmada", "descartada"] as const).map(s => (
                    <option key={s} value={s}>
                      {ROTULO_SITUACION[s].charAt(0).toUpperCase() + ROTULO_SITUACION[s].slice(1)}
                    </option>
                  ))}
                </select>
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
                placeholder="Dónde vive, quién la propuso, por qué se descartó, condiciones de la cesión…"
                style={{ ...inputStyle, resize: "vertical" }} />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }}
                disabled={ocupado} onClick={() => guardarFila(f)}>{ocupado ? "…" : "Guardar"}</button>
              <button className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                onClick={() => setAbierto(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rep-wrap">
      {/* ── LA CABECERA ──
          SIN repetir «Equipo artístico · 5»: eso ya lo dice el título del
          plegable y su resumen, justo encima. Un rótulo repetido dos veces con
          dos íconos distintos se lee como dos secciones, y el ojo pierde un
          segundo en comprobar que son la misma.
          Lo que sí va aquí es el DESGLOSE de cesiones, que el resumen del
          plegable no da: cuántas firmadas y cuántas no aplican.
          ⚠ Y no se pinta cuando la consulta falló: con la lista vacía diría «0
          pendientes», que se lee como «está todo firmado» — lo contrario de la
          verdad, y sobre el único papel que si falta impide usar el material. */}
      <div className="rep-cab">
        {!errServidor && res.total > 0 && (
          <span className="rep-cesiones" title={`Cesión de derechos de imagen y voz de quienes ya están confirmadas — se rinde en la cláusula ${CLAUSULA_CESION} del acta`}>
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
          <>
            {/* Dos botones y no un selector dentro del formulario: apuntar una
                pista y meter a alguien en la película son dos decisiones muy
                distintas, y con un solo botón la segunda se toma por descuido
                —el valor por defecto de un combo lo elige nadie—. */}
            <button className="btn btn-ghost rep-btn" onClick={() => { setAgregando("explorando"); setAviso(""); }}
              title="Apuntar a alguien a quien todavía hay que ir a ver">🔎 Candidata</button>
            <button className="btn btn-ghost rep-btn" onClick={() => { setAgregando("confirmada"); setAviso(""); }}
              title="Sumar a alguien que ya está en la película">＋ Agregar</button>
          </>
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
            <><br /><b>Falta correr <code>db/postulacion-reparto.sql</code> y <code>db/reparto-situacion.sql</code> en Supabase.</b></>
          )}
        </div>
      )}

      {agregando && (
        <div className={`pj-nuevo${esCandidata ? " rep-nuevo-cand" : ""}`}>
          {esCandidata && (
            <div className="rep-nuevo-t">
              🔎 Nueva candidata — todavía hay que ir a verla. Puedes apuntarla solo con una
              descripción («una tejedora de Pitumarca, nos habló Zenón») y vincularla a una ficha
              de persona más adelante.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {pideNombreLibre && (
              <input value={nom} onChange={e => setNom(e.target.value)}
                placeholder={esCandidata ? "Quién es — «tejedora de Pitumarca»" : "Nombre del personaje — «Robomac»"}
                style={{ ...inputStyle, flex: 1, minWidth: 180, width: "auto" }} autoFocus />
            )}
            <EntPicker etiqueta={sel ? `👤 ${sel.nombre}` : `👤 ${R.etqPersona}${pideNombreLibre ? " (si ya hay)" : ""}`}
              items={personas}
              onPick={id => {
                const p: any = personas.find(x => x.id === id);
                if (p) setSel({ id: p.id, nombre: p.nombre });
              }} />
            <input list="roles-reparto" value={rol} onChange={e => setRol(e.target.value)}
              placeholder={esCandidata ? "Papel al que aspira" : "Papel (protagonista, testimonio…)"}
              style={{ ...inputStyle, flex: 1, minWidth: 170, width: "auto" }} />
            <datalist id="roles-reparto">{ROLES.map(r => <option key={r} value={r} />)}</datalist>
            {/* La especialidad solo tiene sentido con voces expertas, pero el
                campo no se esconde según lo que se haya escrito en el papel: un
                input que aparece y desaparece mientras tecleas es peor que uno
                que a veces sobra. */}
            <input value={esp} onChange={e => setEsp(e.target.value)}
              placeholder="Especialidad (antropóloga, bióloga…)"
              style={{ ...inputStyle, flex: 1, minWidth: 170, width: "auto" }} />
          </div>
          {/* La nota, en el alta y no solo al editar: en una candidata es EL
              dato —de quién nos habló, dónde vive, por qué encajaría— y si hay
              que abrir el editor para escribirla, no se escribe. */}
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
            placeholder={esCandidata
              ? "Quién la propuso, dónde encontrarla, por qué encajaría…"
              : "Contexto, acuerdos, condiciones de la cesión… (opcional)"}
            style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* De dónde viene solo se pregunta cuando ya está dentro: de una
                candidata no tiene sentido decir «venía en el expediente». */}
            {!esCandidata && <SelProcedencia valor={proc} onCambia={setProc} />}
            <span style={{ flex: 1 }} />
            <button className="btn" style={{ padding: "7px 14px", fontSize: 12 }}
              title={puedeGuardar ? "Guardar"
                : pideNombreLibre ? "Escribe quién es, o elige una ficha de persona" : "Elige la persona"}
              disabled={!puedeGuardar || ocupado} onClick={guardar}>
              {ocupado ? "…" : esCandidata ? "Apuntar candidata" : "Guardar"}
            </button>
            <button className="btn btn-ghost" style={{ padding: "7px 10px", fontSize: 12 }}
              onClick={limpiar}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── QUIENES YA ESTÁN DENTRO ── */}
      {rep.grupos.map(({ grupo, filas: fs }) => (
        <div key={grupo.k} className="rep-grupo">
          <div className="rep-grupo-t">{grupo.titulo} · {fs.length}</div>
          {fs.map(pintarFila)}
        </div>
      ))}

      {/* ── A QUIENES SE ESTÁ YENDO A VER ──
          Debajo de las confirmadas, no arriba: lo que está decidido manda sobre
          lo que se está explorando. Pero con su propio marco, porque leer una
          candidata como si ya estuviera es el error que esta sección existe
          para evitar. */}
      {rep.explorando.length > 0 && (
        <div className="rep-grupo rep-explora">
          <div className="rep-grupo-t">🔎 En exploración — candidatas · {rep.explorando.length}</div>
          {rep.explorando.map(pintarFila)}
        </div>
      )}

      {/* ── LAS QUE NO ENTRARON ──
          A la vista, pero apagadas. No se borran: saber a quién descartaste, y
          por qué, evita volver a proponer a la misma persona dentro de seis
          meses — y en un documental de encuentro alguien que no encajaba para
          un bloque encaja para otro.
          Empezaron plegadas y no funcionaba: una lista que hay que acordarse de
          abrir se mira cuando ya volviste a proponer a la misma persona, o sea
          tarde. El ruido lo quita el 45% de opacidad, no el clic. */}
      {rep.descartadas.length > 0 && (
        <div className="rep-grupo rep-desc">
          <button type="button" className="rep-desc-t" aria-expanded={verDescartadas}
            onClick={() => setVerDescartadas(v => !v)}>
            {verDescartadas ? "▾" : "▸"} Descartadas · {rep.descartadas.length}
          </button>
          {verDescartadas && rep.descartadas.map(pintarFila)}
        </div>
      )}

      {!filas.length && !agregando && !errServidor && (
        <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "6px 0", lineHeight: 1.5 }}>
          {R.vacio}
          <br />Empieza por <b>🔎 Candidata</b> si todavía estás buscando, o por <b>＋ Agregar</b> si ya está decidido.
          {proyectoId && <><br />Y si ya está escrito en el proyecto, <b>⬇ Traer del proyecto</b> lo copia aquí.</>}
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
