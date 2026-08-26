"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { guardarHitoFondo, borrarHitoFondo } from "@/app/actions";
import { responderCarta, borrarCarta } from "@/app/casilla/acciones";
import { useAviso, useConfirmar } from "@/components/useConfirmar";
import { fechaCorta, hoyLima } from "@/lib/fechas";
import {
  vidaDelFondo, porAnio, porResponder, cuandoVence, TIPOS_HITO,
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

export default function VidaFondo({
  postulacionId, postulacion, hitos, cartas, hoy,
}: {
  postulacionId: string;
  postulacion: PostulacionVida;
  hitos: FilaHito[];
  cartas: FilaCarta[];
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
  const [editando, setEditando] = useState<FilaHito | null>(null);

  const linea = useMemo(
    () => vidaDelFondo(postulacion, hitos, cartas, hoy),
    [postulacion, hitos, cartas, hoy]);
  const anios = useMemo(() => porAnio(linea), [linea]);
  const deudas = useMemo(() => porResponder(linea, hoy), [linea, hoy]);
  /* Lo que aún no ha llegado —el límite de rendición, la prórroga— se enseña
     aparte de lo que ya pasó: son compromisos, no hechos. */
  const futuros = useMemo(() => linea.filter(h => h.futuro).reverse(), [linea]);
  const pasados = useMemo(() => anios.map(a => ({ ...a, hitos: a.hitos.filter(h => !h.futuro) }))
    .filter(a => a.hitos.length), [anios]);

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
            </div>
          ))}
        </div>
      )}

      <div className="vf-cab">
        <b>📍 Vida del fondo</b>
        <span className="rp-dim">{linea.length} hito(s)</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost vf-btn"
          onClick={() => { setEditando(null); setAbierto(!abierto); }}>
          {abierto ? "Cancelar" : "＋ Apuntar algo que pasó"}
        </button>
      </div>

      {(abierto || editando) && (
        /* ⚠ EL `key` NO ES DECORACIÓN. Los campos son no controlados
           (`defaultValue`), así que React reusa el mismo formulario al pasar de
           corregir un hito a corregir otro: se veían los datos del PRIMERO y se
           guardaban sobre el SEGUNDO. Con la clave, cambiar de hito monta un
           formulario nuevo. */
        <form key={editando?.id ?? "nuevo"} className="vf-form" onSubmit={enviar}>
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
            <div key={h.clave} className="vf-fila vf-fila-fut">
              <span className="vf-ico" style={{ color: COLOR[h.clase] }}>{h.ico}</span>
              <span className="vf-fecha">{fechaCorta(h.fecha)}</span>
              <span className="vf-txt">
                <b>{h.titulo}</b>
                <span className="vf-dias">{cuandoVence(h.fecha, hoy)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── LO QUE PASÓ, POR AÑOS ── */}
      {pasados.map(a => (
        <div key={a.anio} className="vf-anio">
          <div className="vf-anio-h"><span>{a.anio}</span><i /></div>
          {a.hitos.map(h => (
            <div key={h.clave} className="vf-fila">
              <span className="vf-ico" style={{ color: COLOR[h.clase] }}>{h.ico}</span>
              <span className="vf-fecha">{fechaCorta(h.fecha)}</span>
              <span className="vf-txt">
                <b>{h.titulo}</b>
                {h.detalle && <span className="vf-det">{h.detalle}</span>}
                <span className="vf-pie">
                  {h.autor && <span className="rp-dim">lo apuntó {h.autor}</span>}
                  {h.resuelto && <span className="vf-ok">contestada el {fechaCorta(h.resuelto)}</span>}
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
          ))}
        </div>
      ))}

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
