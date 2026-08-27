"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { guardarHitoFondo, borrarHitoFondo } from "@/app/actions";
import { responderCarta, borrarCarta } from "@/app/casilla/acciones";
import { useAviso, useConfirmar } from "@/components/useConfirmar";
import CartasLote from "@/components/CartasLote";
import BuzonPegar from "@/components/BuzonPegar";
import Avatar from "@/components/Avatar";
import { fechaCorta, hoyLima } from "@/lib/fechas";
import {
  vidaDelFondo, conSilencios, duracion, porResponder, cuandoVence, TIPOS_HITO,
  type Hito, type FilaHito, type FilaCarta, type PostulacionVida,
} from "@/lib/vidaFondo";

/* ══════════════════════════════════════════════════════════════════════════
   📍 LA VIDA DEL FONDO

   Dos años de ejecución caben en una pantalla: el acta, el desembolso, cada
   carta de DAFO y cada llamada que alguien apuntó. No es decoración — es el
   expediente con el que se contesta «¿y ustedes qué hicieron?» el día que lo
   pregunten.

   ── LO QUE HAY QUE CONTESTAR VA ARRIBA, NO EN LA LÍNEA ──
   Un requerimiento con plazo no es historia: es un reloj. Mezclado entre
   treinta filas de hace dos años se lee como una anécdota más, y el día que
   vence nadie lo vio venir. Así que va suelto, arriba y con su cuenta atrás.

   ── UNA FILA NO ES UNA CONVERSACIÓN ──
   El titular vive aquí; lo que se dijo, en el caso. Por eso cada hito puede
   llevar el enlace a su caso en vez de intentar contener el hilo entero.
   ══════════════════════════════════════════════════════════════════════════ */

const COLOR: Record<string, string> = {
  acta: "var(--violet)", desembolso: "var(--teal)", plazo: "var(--yellow)",
  prorroga: "var(--blue)", rendido: "var(--green)", carta: "var(--blue)",
  propio: "var(--muted)",
};

/* ── ¿QUIÉN DIJO ESTO? ──
   Con la conversación entera en una sola columna, lo que mandamos nosotros y
   lo que nos dijo DAFO se leían igual. Y no es un matiz: en un descargo, la
   diferencia entre «lo avisamos» y «nos lo advirtieron» es toda la diferencia.

   No hace falta una columna nueva: ya está dicho en el TIPO del hito —enviar y
   recibir son las dos direcciones— y en la clase —una carta viene siempre de
   ellos—. Lo que no tiene dirección (una llamada, una reunión, una fecha del
   acta) no lleva etiqueta: inventarle un lado sería peor que no decir nada. */
type Lado = "nos" | "dafo" | null;
function ladoDe(h: Hito): Lado {
  if (h.clase === "carta") return "dafo";
  if (h.clase !== "propio") return null;
  const t = h.tipo || undefined;
  return t === "envio" ? "nos" : t === "recepcion" ? "dafo" : null;
}

/* Los mensajes del buzón guardan en su cuerpo una primera línea con la ficha
   del mensaje —`[060-2023-DAFO-28 · Nosotros · 12:42:14]`— para poder citarlos
   por su número. Eso es metadato, no texto: se saca del cuerpo y se pinta
   aparte, que es donde se lee sin estorbar. */
const RE_FICHA = /^\[([^\]\n]{4,120})\]\s*\n+/;
const fichaDe = (d?: string | null) => (String(d || "").match(RE_FICHA) || [])[1] || null;
const cuerpoDe = (d?: string | null) => String(d || "").replace(RE_FICHA, "");

/* ══════════════════════════════════════════════════════════════════════════
   LAS FECHAS, RESALTADAS

   Un descargo se arma citando fechas: «entregamos el 19 de enero de 2026»,
   «el plazo era de diez (10) días hábiles», «venció el 20/10/2024». En un
   mensaje de veinte renglones esas cuatro palabras son lo único que se busca,
   y estaban del mismo color que el resto.

   Se resalta lo que tiene FORMA de fecha o de plazo, no lo que parezca
   importante: una regla que adivina qué es clave acabaría subrayando media
   carta, y media carta subrayada es una carta sin subrayar.
   ══════════════════════════════════════════════════════════════════════════ */
const RE_CLAVE = new RegExp(
  "(\\d{1,2}\\s+de\\s+[a-záéíóúñ]+\\s+de\\s+\\d{4}"      // 19 de enero de 2026
  + "|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}"                    // 20/10/2024
  + "|\\d{4}-\\d{2}-\\d{2}"                                // 2026-02-04
  + "|\\(\\d{1,3}\\)\\s*d[íi]as\\s+h[áa]biles"             // (10) días hábiles
  + "|\\bplazo\\s+m[áa]ximo\\b)", "gi");

/** El texto con sus fechas marcadas. `split` con UN grupo de captura deja las
 *  coincidencias en las posiciones impares — así no hace falta volver a probar
 *  cada trozo contra una expresión global, que lleva estado y se equivoca. */
function conFechas(texto: string) {
  return texto.split(RE_CLAVE).map((t, i) =>
    i % 2 === 1 ? <mark key={i} className="vf-clave">{t}</mark> : t);
}

/* ── Y LOS TEXTOS LARGOS, PLEGADOS DEL TODO ──
   Un mensaje del buzón ocupa media pantalla, y tres seguidos convierten la
   línea de tiempo en un documento que hay que leer entero para llegar al hito
   de abajo.

   ── NI UN TROZO ──
   La primera versión enseñaba ocho renglones con el final desvanecido. Un
   asomo de texto no es media lectura: es una interrupción —se empieza a leer y
   se corta— y encima ocupaba casi lo mismo que el mensaje entero. Plegado no
   se ve nada del cuerpo; el titular ya dice de qué va, que para eso está.

   Y el botón dice «ver más», nada más. Llevaba también cuántos renglones
   había detrás, y era un número que no cambia ninguna decisión: se abre para
   leerlo, no para saber cuánto mide. */
const LARGO = 420;
const RENGLONES = 6;
function Detalle({ texto }: { texto: string }) {
  const [abierto, setAbierto] = useState(false);
  const largo = texto.length > LARGO || texto.split("\n").length > RENGLONES;
  if (!largo) return <span className="vf-det">{conFechas(texto)}</span>;
  return (
    <span className="vf-det-caja">
      {abierto && <span className="vf-det">{conFechas(texto)}</span>}
      <button type="button" className="vf-mas" onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}>
        {abierto ? "ver menos ↑" : "ver más ↓"}
      </button>
    </span>
  );
}

export default function VidaFondo({
  postulacionId, postulacion, hitos, cartas, hoy, etiquetaFondo, esAdmin, casos,
}: {
  postulacionId: string;
  postulacion: PostulacionVida;
  hitos: FilaHito[];
  cartas: FilaCarta[];
  /** Cómo se llama este fondo, para el selector de la carga por lote. */
  etiquetaFondo: string;
  /** Registrar cartas es escribir en el expediente: solo administración. */
  esAdmin: boolean;
  /** Los casos de este fondo, para poder atar un hito al suyo. */
  casos: { id: string; titulo: string; estado?: string | null }[];
  /** El día de HOY según el servidor, en Lima. Se pasa desde la página en vez
   *  de preguntarlo aquí: calculado en el navegador, un equipo con la fecha
   *  torcida vería vencido lo que no lo está — y al revés. */
  hoy: string;
}) {
  const router = useRouter();
  const { avisar, aviso } = useAviso();
  const { pedir, dialogo } = useConfirmar();
  const [ocupado, setOcupado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [pegando, setPegando] = useState(false);
  const [editando, setEditando] = useState<FilaHito | null>(null);
  /* La carta cuyo plazo se está cerrando sin contestar, con su titular a la
     vista: el motivo se escribe mirando de qué carta se habla. */
  const [cerrando, setCerrando] = useState<{ id: string; titulo: string } | null>(null);
  /* ── CORREGIR LLEVA AL FORMULARIO ──
     El botón está al pie de un hito que puede estar a dos pantallas del
     formulario, arriba del todo. Pulsarlo parecía no hacer nada: el
     formulario se abría fuera de la vista, con los datos cargados, y quien lo
     pulsaba volvía a pulsarlo. */
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!editando) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    /* Y el foco en el titular, que es lo que se viene a corregir. Sin esto hay
       que volver a apuntar con el ratón a lo que ya está en pantalla. */
    const t = setTimeout(() => {
      (formRef.current?.querySelector('input[name="titulo"]') as HTMLInputElement | null)?.focus();
    }, 260);
    return () => clearTimeout(t);
  }, [editando]);
  /* El acta de este fondo: es la llave con la que se comprueba que una carta
     cargada aquí es de verdad de este expediente. */
  const codigoActa = (postulacion as any)?.codigo_acta || null;

  const linea = useMemo(
    () => vidaDelFondo(postulacion, hitos, cartas, hoy),
    [postulacion, hitos, cartas, hoy]);
  const deudas = useMemo(() => porResponder(linea, hoy), [linea, hoy]);
  /* Lo que aún no ha llegado —el límite de rendición, la prórroga— se enseña
     aparte de lo que ya pasó: son compromisos, no hechos. */
  const futuros = useMemo(() => linea.filter(h => h.futuro).reverse(), [linea]);
  /* Lo que ya pasó, con los silencios intercalados. El año se marca cuando
     cambia, dentro de la misma línea: una cabecera de año por bloque partía la
     línea de tiempo en trozos y los huecos no se podían cruzar de un año a
     otro — que es justo cuando más largos son. */
  const tramos = useMemo(
    () => conSilencios(linea.filter(h => !h.futuro), hoy),
    [linea, hoy]);

  const correr = async (fn: () => Promise<any>) => {
    if (ocupado) return false;
    setOcupado(true);
    try {
      const r: any = await fn();
      if (r?.error) { avisar(r.error); return false; }
      router.refresh();
      return true;
    } catch { avisar("No se pudo guardar."); return false; }
    finally { setOcupado(false); }
  };

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const ok = await correr(() => guardarHitoFondo({
      id: editando?.id || null,
      postulacionId,
      fecha: String(d.get("fecha") || ""),
      tipo: String(d.get("tipo") || "otro"),
      titulo: String(d.get("titulo") || ""),
      detalle: String(d.get("detalle") || ""),
      url: String(d.get("url") || ""),
      publicacionId: String(d.get("caso") || "") || null,
    }));
    if (ok) { setAbierto(false); setEditando(null); }
  };

  return (
    <div className="vf">
      {aviso}{dialogo}

      {/* ── EL RELOJ ──
          Cartas con plazo y sin respuesta. Si no hay ninguna, no hay caja: un
          recuadro vacío que dice «nada pendiente» ocupa el mismo sitio que uno
          lleno y enseña a no mirarlo. */}
      {deudas.todas.length > 0 && (
        <div className={`vf-deuda${deudas.vencidas.length ? " vf-deuda-mal" : ""}`}>
          <b>{deudas.vencidas.length ? "⏰ Hay que contestar — con el plazo pasado" : "⏳ Hay que contestar"}</b>
          {deudas.todas.map(h => (
            <div key={h.clave} className="vf-deuda-fila">
              <span className="vf-deuda-t">{h.titulo}</span>
              <span className={`vf-deuda-v${(h.vence as string) < hoy ? " mal" : ""}`}>
                {cuandoVence(h.vence as string, hoy)}
              </span>
              {h.url && <a className="vf-link" href={h.url} target="_blank" rel="noreferrer">ver documento →</a>}
              <button type="button" className="btn btn-ghost vf-btn" disabled={ocupado}
                onClick={async () => {
                  if (!(await pedir(`¿Marcar «${h.titulo}» como contestada hoy?`,
                    { aceptar: "Sí, ya se contestó" }))) return;
                  correr(() => responderCarta(h.id as string, hoy));
                }}>Ya se contestó</button>
              {/* ── CERRAR SIN CONTESTAR ──
                  Un requerimiento de hace quinientos días no se va a contestar:
                  se resolvió por otra vía o se dejó pasar. La única salida era
                  marcarlo «ya se contestó», que es una mentira escrita en el
                  expediente — justo donde no se puede mentir. Aquí se apaga el
                  reloj diciendo POR QUÉ, y la línea de tiempo lo lee distinto. */}
              <button type="button" className="vf-mini" disabled={ocupado}
                onClick={() => setCerrando({ id: h.id as string, titulo: h.titulo })}>
                ya no se va a contestar
              </button>
            </div>
          ))}
          {/* El motivo NO es opcional: sin él, dentro de un año la fila diría
              «dejó de estar pendiente» y nadie sabría si se contestó, si se
              resolvió por otra vía o si se dejó caer. */}
          {cerrando && (
            <form className="vf-cerrar" onSubmit={async e => {
              e.preventDefault();
              const motivo = String(new FormData(e.currentTarget).get("motivo") || "").trim();
              if (!motivo) { avisar("Escribe por qué se cierra: es lo que explicará esta fila dentro de un año."); return; }
              const ok = await correr(() => responderCarta(cerrando.id, hoy, null, motivo));
              if (ok) setCerrando(null);
            }}>
              <label className="vf-lbl vf-ancho">
                ¿Por qué se cierra «{cerrando.titulo}» sin contestarla?
                <input name="motivo" className="rp-input vf-ancho" autoFocus
                  placeholder="Se entregó todo el material el 19/01/2026 (expediente 007170); este requerimiento ya no aplica." />
              </label>
              <div className="vf-form-fila">
                <button className="btn" type="submit" disabled={ocupado}>Cerrar el plazo</button>
                <button type="button" className="btn btn-ghost" disabled={ocupado}
                  onClick={() => setCerrando(null)}>Cancelar</button>
                <span className="rp-dim">Queda escrito que NO se contestó, y por qué.</span>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="vf-cab">
        <b>📍 Vida del fondo</b>
        <span className="rp-dim">{linea.length} hito(s)</span>
        <span style={{ flex: 1 }} />
        {/* ── LA CARGA DE CARTAS, AQUÍ ──
            Estaba solo en 📬 la casilla, que es la bandeja general. Pero quien
            descarga los PDF de la Plataforma está trabajando en UN fondo —el
            que le está reclamando— y tenía que irse a otra pantalla y volver.
            Aquí, además, el fondo ya se sabe: la carta se vincula sola y, si su
            acta es otra, se dice. */}
        {esAdmin && (
          <>
            <button type="button" className="btn btn-ghost vf-btn"
              onClick={() => { setCargando(!cargando); setPegando(false); setAbierto(false); setEditando(null); }}>
              {cargando ? "Cerrar la carga" : "📥 Cargar cartas (PDF)"}
            </button>
            {/* La tercera ventanilla. Ver components/BuzonPegar.tsx: no hay API
                ni PDF, pero la tabla se puede pegar. */}
            <button type="button" className="btn btn-ghost vf-btn"
              onClick={() => { setPegando(!pegando); setCargando(false); setAbierto(false); setEditando(null); }}>
              {pegando ? "Cerrar el buzón" : "📋 Pegar el buzón"}
            </button>
          </>
        )}
        <button type="button" className="btn btn-ghost vf-btn"
          onClick={() => { setEditando(null); setAbierto(!abierto); setCargando(false); }}>
          {abierto ? "Cancelar" : "＋ Apuntar algo que pasó"}
        </button>
      </div>

      {pegando && <BuzonPegar postulacionId={postulacionId} codigoActa={codigoActa} />}

      {cargando && (
        <CartasLote
          opciones={[{ id: postulacionId, etiqueta: etiquetaFondo, enJuego: true }]}
          posts={[{ id: postulacionId, codigo_acta: codigoActa }]}
          fondoFijo={{ id: postulacionId, etiqueta: etiquetaFondo, codigo_acta: codigoActa }} />
      )}

      {(abierto || editando) && (
        /* ⚠ EL `key` NO ES DECORACIÓN. Los campos son no controlados
           (`defaultValue`), así que React reusa el mismo formulario al pasar de
           corregir un hito a corregir otro: se veían los datos del PRIMERO y se
           guardaban sobre el SEGUNDO. Con la clave, cambiar de hito monta un
           formulario nuevo. */
        <form key={editando?.id ?? "nuevo"} ref={formRef} className="vf-form" onSubmit={enviar}>
          <div className="vf-form-fila">
            <label className="vf-lbl">
              Día
              <input name="fecha" type="date" required max={hoy}
                defaultValue={editando?.fecha || hoy} className="rp-input" />
            </label>
            <label className="vf-lbl">
              Qué fue
              <select name="tipo" className="rp-sel" defaultValue={editando?.tipo || "llamada"}>
                {TIPOS_HITO.map(t => <option key={t.clave} value={t.clave}>{t.ico} {t.nombre}</option>)}
              </select>
            </label>
          </div>
          {/* Con `aria-label`: el `placeholder` desaparece al escribir y un
              lector de pantalla no lo anuncia como nombre del campo. */}
          <input name="titulo" required className="rp-input vf-ancho"
            aria-label="Qué pasó, en una línea"
            defaultValue={editando?.titulo || ""}
            placeholder="Llamamos a DAFO: dicen que recién están revisando el informe" />
          {/* El detalle es lo que se relee para armar un descargo: quién
              contestó, qué dijo exactamente, qué quedamos. */}
          <textarea name="detalle" className="rp-input vf-ancho" rows={3}
            aria-label="Detalle: con quién se habló y qué se dijo"
            defaultValue={editando?.detalle || ""}
            placeholder="Con quién se habló, qué dijeron exactamente, qué quedó pendiente…" />
          <input name="url" className="rp-input vf-ancho" defaultValue={editando?.url || ""}
            aria-label="Enlace a la prueba (opcional)"
            placeholder="Enlace a la prueba (cargo, acta de la reunión, correo) — opcional" />
          {/* ── EL CASO DONDE ESTÁ LA CONVERSACIÓN ──
              Un hito es el titular; lo que se dijo, con quién y qué quedó
              pendiente vive en el caso. Sin este campo el enlace existía en la
              base y no había forma de ponerlo — la línea de tiempo enseñaba
              «ver el caso →» solo si alguien lo escribía por SQL. */}
          <label className="vf-lbl vf-ancho">
            ¿Hay un caso de esto?
            <select name="caso" className="rp-sel vf-ancho"
              defaultValue={editando?.publicacion_id || ""}>
              <option value="">— ninguno —</option>
              {casos.map(c => (
                <option key={c.id} value={c.id}>
                  {c.titulo.slice(0, 90)}{c.estado ? ` · ${c.estado}` : ""}
                </option>
              ))}
            </select>
            <span className="rc-ayuda">
              {casos.length
                ? "Los casos vinculados a este fondo. El hito enseñará «ver el caso →»."
                : "Este fondo todavía no tiene casos vinculados: abre uno desde el caso y enlázalo a la postulación."}
            </span>
          </label>
          <div className="vf-form-fila">
            <button className="btn" disabled={ocupado} type="submit">
              {editando ? "Guardar cambios" : "Apuntar"}
            </button>
            {editando && (
              <button type="button" className="btn btn-ghost" disabled={ocupado}
                onClick={() => { setEditando(null); setAbierto(false); }}>Cancelar</button>
            )}
            <span className="rp-dim">
              Lo que pasó, con su día. Lo que va a pasar va en la agenda.
            </span>
          </div>
        </form>
      )}

      {/* ── LO QUE VIENE ── */}
      {futuros.length > 0 && (
        <div className="vf-futuro">
          <span className="vf-futuro-h">Por delante</span>
          {futuros.map(h => (
            <div key={h.clave} className="vf-hito vf-fila-fut">
              <span className="vf-punto" style={{ borderColor: COLOR[h.clase] }}>{h.ico}</span>
              <span className="vf-cuerpo">
                <span className="vf-cab-hito">
                  <b className="vf-fecha-hito">{fechaCorta(h.fecha)}</b>
                  <span className="vf-dias">{cuandoVence(h.fecha, hoy)}</span>
                </span>
                <b>{h.titulo}</b>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          LA LÍNEA DE TIEMPO — con su raíl, sus nodos y sus silencios

          Era una tabla: filas iguales, una debajo de otra, donde dos hitos
          separados por ocho meses se leían igual que dos del mismo día. Y en
          un fondo con problemas la distancia ES la historia — el hueco entre
          el requerimiento y la respuesta explica el expediente mejor que
          ninguna de las dos filas.

          El año se marca cuando cambia, DENTRO de la misma línea. Con una
          cabecera por año la línea se partía en trozos y los silencios no
          podían cruzar de diciembre a enero, que es cuando más largos son.
          ══════════════════════════════════════════════════════════════ */}
      {tramos.length > 0 && (
        <div className="vf-linea">
          {tramos.map((t, i) => {
            if (t.tipo === "silencio") {
              return (
                <div key={`s-${i}`} className={`vf-silencio${t.hastaHoy ? " vf-silencio-hoy" : ""}`}>
                  <span className="vf-sil-txt">
                    {t.hastaHoy
                      ? `${duracion(t.dias)} sin novedades — hasta hoy`
                      : `${duracion(t.dias)} sin que nadie dijera nada`}
                  </span>
                </div>
              );
            }
            const h = t.hito;
            /* El año se pinta cuando cambia respecto del tramo anterior — y
               siempre en el primero. */
            const anterior = [...tramos.slice(0, i)].reverse()
              .find(x => x.tipo === "hito") as { tipo: "hito"; hito: Hito } | undefined;
            const cambiaAnio = !anterior || anterior.hito.fecha.slice(0, 4) !== h.fecha.slice(0, 4);
            return (
              <div key={h.clave} className="vf-tramo">
                {/* El año, en su propio renglón y dentro del raíl. Iba flotando
                    encima del nodo con posición absoluta y se pisaba con él. */}
                {cambiaAnio && (
                  <div className="vf-anio-fila"><span>{h.fecha.slice(0, 4)}</span><i /></div>
                )}
                <div className={`vf-hito${ladoDe(h) ? ` vf-lado-${ladoDe(h)}` : ""}`}>
                <span className="vf-punto" style={{ borderColor: COLOR[h.clase] }}>{h.ico}</span>
                <span className="vf-cuerpo">
                  <span className="vf-cab-hito">
                    <b className="vf-fecha-hito">{fechaCorta(h.fecha)}</b>
                    {ladoDe(h) && (
                      <span className={`vf-quien vf-quien-${ladoDe(h)}`}>
                        {ladoDe(h) === "nos" ? "lo dijimos nosotros" : "nos lo dijo DAFO"}
                      </span>
                    )}
                  </span>
            <b>{h.titulo}</b>
            {fichaDe(h.detalle) && <span className="cl-cod">{fichaDe(h.detalle)}</span>}
            {cuerpoDe(h.detalle) && <Detalle texto={cuerpoDe(h.detalle)} />}
            <span className="vf-pie">
              {h.autor && (
                <span className="vf-autor" title={`Lo apuntó ${h.autor}`}>
                  <Avatar nombre={h.autor} src={h.autorFoto} color={h.autorColor} size={17} />
                  lo apuntó {h.autor}
                </span>
              )}
              {h.resuelto && (h.motivoCierre
                ? <span className="vf-cerrada" title={h.motivoCierre}>
                    cerrada el {fechaCorta(h.resuelto)} sin contestar — {h.motivoCierre}
                  </span>
                : <span className="vf-ok">contestada el {fechaCorta(h.resuelto)}</span>)}
              {/* ── Y SE PUEDE DESHACER ──
                  Marcar «ya se contestó» por error dejaba el reloj apagado
                  para siempre: no había ninguna manera de volver a
                  encenderlo desde la aplicación. */}
              {h.clase === "carta" && h.resuelto && (
                <button type="button" className="vf-mini" disabled={ocupado}
                  onClick={async () => {
                    if (!(await pedir(<>¿Volver a poner <b>{h.titulo}</b> entre lo que hay que contestar?</>,
                      { aceptar: "Sí, sigue pendiente" }))) return;
                    correr(() => responderCarta(h.id as string, null));
                  }}>volver a abrirla</button>
              )}
              {h.url && <a className="vf-link" href={h.url} target="_blank" rel="noreferrer">ver documento →</a>}
              {h.casoId && <Link className="vf-link" href={`/caso/${h.casoId}`}>ver el caso →</Link>}
              {/* Solo lo escrito a mano se corrige aquí. Una fecha del acta
                  se edita en el expediente —es un dato del documento, no
                  una nota— y una carta, en la casilla. */}
              {/* Una carta registrada a mano se puede borrar —un número
                  mal tecleado, una que no era de este fondo—. Una que llegó
                  por correo, no: es la prueba de que DAFO escribió. */}
              {h.clase === "carta" && h.registrada && (
                <button type="button" className="vf-mini vf-mini-x" disabled={ocupado}
                  onClick={async () => {
                    if (!(await pedir(<>¿Borrar la carta <b>{h.titulo}</b> del registro?
                      Solo se borra lo que apuntamos nosotros.</>,
                      { peligro: true, aceptar: "Borrar" }))) return;
                    correr(() => borrarCarta(h.id as string));
                  }}>borrar</button>
              )}
              {h.clase === "propio" && (
                <>
                  <button type="button" className="vf-mini" disabled={ocupado}
                    onClick={() => {
                      const f = (hitos || []).find(x => x.id === h.id);
                      /* Si no está, alguien lo borró desde otra pantalla y
                         esta copia es vieja. Un botón que no hace nada ni
                         dice nada es peor que uno que falla. */
                      if (!f) { avisar("Ese hito ya no está. Recarga la página."); return; }
                      setEditando(f); setAbierto(false);
                    }}>corregir</button>
                  <button type="button" className="vf-mini vf-mini-x" disabled={ocupado}
                    onClick={async () => {
                      if (!(await pedir(`¿Borrar «${h.titulo}» de la línea de tiempo?`,
                        { peligro: true, aceptar: "Borrar" }))) return;
                      correr(() => borrarHitoFondo(h.id as string, postulacionId));
                    }}>borrar</button>
                </>
              )}
            </span>
                </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!linea.length && (
        <p className="rp-vacio">
          Todavía no hay nada. En cuanto se cargue la fecha del acta o se apunte la primera
          llamada, esto empieza a contar la historia del fondo.
        </p>
      )}

      <p className="rp-pie">
        Las fechas del acta —firma, desembolso, rendición, prórroga— se leen del expediente y se
        corrigen ahí. Las cartas de DAFO llegan de <Link className="vf-link" href="/casilla">📬 la casilla</Link>;
        las de la Plataforma Virtual se registran a mano, porque esa plataforma no avisa a ninguna parte.
      </p>
    </div>
  );
}
