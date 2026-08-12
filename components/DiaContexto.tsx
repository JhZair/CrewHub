"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { contextoDelDia } from "@/app/actions";
import { fechaConDia } from "@/lib/fechas";

/* QUÉ HIZO ESE DÍA, EN TODO EL SISTEMA.
 *
 * Una fila de jornada dice «1.5j · S/ 195 · oficina». Al aprobarla, la
 * pregunta que uno se hace es otra: ¿en qué se fue ese día? Y hasta ahora
 * contestarla era abrir seis pantallas y cruzarlas a ojo.
 *
 * Donde más paga es en los días VACÍOS. Un día sin jornada no distingue
 * «descansó» de «se le olvidó registrar», y el sistema sí lo sabe: si esa
 * tarde dejó ocho comentarios y entregó dos equipos, no descansó. Por eso el
 * botón está también en los días en blanco — ahí es donde hay algo que
 * descubrir, no en los que ya están bien.
 *
 * Se carga AL ABRIR. Son cinco consultas por día y treinta días por persona:
 * traerlo con la página serían mil quinientas consultas para enseñar, casi
 * siempre, ninguna. La espera de medio segundo la paga quien de verdad
 * preguntó.
 *
 * ── Y SE PINTA EN EL <body>, NO DONDE VIVE EL BOTÓN ──
 * La fila de un día sin jornada lleva `opacity:.4` para verse apagada, y la
 * opacidad de un ancestro tiñe TODO lo que cuelga de él —también un hijo
 * `position:fixed`—. La ventana salía translúcida, con las filas de detrás
 * leyéndose a través del texto: no fallaba nada, simplemente era ilegible
 * justo en el caso para el que se hizo.
 * Un portal al `body` la saca de ahí de una vez, y de paso la deja a salvo de
 * los `overflow:auto` y de los contextos de apilamiento de quien la use
 * mañana — los otros dos accidentes que ya nos costaron un pop-up.
 */
export default function DiaContexto({ personaId, fecha, quien, auto = false, alCerrar }: {
  personaId: string; fecha: string; quien?: string;
  /** Sin lupa y abierta de entrada. La usa quien ya tiene su propio disparador
   *  —la barra del día en la franja del mes— y solo quiere la ventana: dos
   *  botones para lo mismo, uno encima del otro, es peor que ninguno. */
  auto?: boolean;
  /** Solo con `auto`: quien nos montó decide cuándo desmontarnos. Sin esto la
   *  ventana se cierra y el componente sigue vivo con el día de ayer dentro,
   *  y el siguiente clic en OTRA barra no vuelve a abrir nada. */
  alCerrar?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  /* El portal necesita `document`, que en el render del servidor no existe.
     Se monta después de la hidratación; hasta entonces solo se pinta el
     botón, que es lo único que hay que ver. */
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  /* Montado en modo `auto` = ya lo pidieron. Se dispara una sola vez: el
     efecto no lleva `abrir` en las dependencias a propósito, porque `abrir`
     se redefine en cada render y volvería a pedir el día en bucle. */
  useEffect(() => { if (auto) abrir(); /* eslint-disable-next-line */ }, [auto]);
  const [cargando, setCargando] = useState(false);
  const [hechos, setHechos] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  /* Dos filtros que se combinan: POR QUÉ ES y A QUÉ HORA. Ciento treinta
     hechos en un día no se leen de corrido; casi siempre uno viene buscando
     una cosa —«¿comentó algo?»— o un tramo —«¿qué hizo después de las
     tres?»—. */
  const [clase, setClase] = useState<string | null>(null);
  const [horaSel, setHoraSel] = useState<number | null>(null);
  /* Qué tandas están desplegadas. Cerradas de entrada: la fila plegada ya dice
     cuántos y para qué, que es lo que se pregunta primero. */
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());

  const abrir = async () => {
    setAbierto(true);
    if (hechos || cargando) return;   // ya se pidió: no se vuelve a pedir
    setCargando(true); setError("");
    const r: any = await contextoDelDia(personaId, fecha);
    setCargando(false);
    if (r?.error) { setError(r.error); return; }
    setHechos(r.hechos || []);
  };

  /* Cerrar es UNA cosa, la pidan la ✕, el fondo o la tecla. Con `auto` no
     basta con bajar la bandera: hay que avisar arriba para que nos quite. */
  const cerrar = () => { setAbierto(false); alCerrar?.(); };

  const hora = (at: string) =>
    new Date(at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
  /* La hora EN LIMA, no la del navegador de quien mira. Un admin revisando
     desde otro huso vería el día corrido. */
  const horaDe = (at: string) => Number(
    new Date(at).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Lima" }));

  const CLASES: [string, string, string][] = [
    ["com", "💬", "Comentarios"], ["cambio", "🛠", "Cambios"],
    ["pub", "📌", "Publicó"], ["equipo", "🎥", "Equipos"], ["rhe", "🧾", "RHE"],
  ];
  const todos = hechos || [];
  /* El conteo de cada chip se calcula sobre TODO, no sobre lo ya filtrado: un
     filtro cuyo número cambia según lo que tienes puesto no dice cuánto hay,
     dice cuánto queda — y entonces no sirve para decidir dónde ir. */
  const cuenta = (c: string) => todos.filter((h: any) => h.clase === c).length;
  const porHora = Array.from({ length: 24 }, (_, h) => ({
    h, n: todos.filter((x: any) => x.at && horaDe(x.at) === h).length,
  }));
  const pico = Math.max(1, ...porHora.map(x => x.n));
  const horaTop = porHora.reduce((a, b) => (b.n > a.n ? b : a), porHora[0]);
  const sinHora = todos.filter((h: any) => !h.at).length;

  const vistos = todos.filter((h: any) =>
    (!clase || h.clase === clase) &&
    /* Con una hora elegida, lo que no tiene hora NO cuela: decir que un
       préstamo pasó a las tres es justo lo que no sabemos. */
    (horaSel == null || (h.at && horaDe(h.at) === horaSel)));

  return (
    <>
      {!auto && (
        <button type="button" className="dato-btn dia-lupa" title={`Ver todo lo que hizo el ${fecha} en el sistema`}
          onClick={abrir}>🔍</button>
      )}

      {abierto && montado && createPortal((
        <div className="modal-fondo" onClick={e => { if (e.target === e.currentTarget) cerrar(); }}>
          <div className="modal-caja" style={{ maxWidth: 640 }}>
            <div className="modal-cab">
              <b style={{ textTransform: "capitalize" }}>
                🔍 {fechaConDia(fecha)}{quien ? ` · ${quien}` : ""}
              </b>
              <button className="dato-btn" onClick={cerrar}>✕</button>
            </div>

            {cargando && <div className="empty" style={{ padding: "20px 0" }}>Buscando…</div>}
            {error && <div className="err-inline">⚠ {error}</div>}

            {hechos && hechos.length === 0 && (
              /* Un vacío que DICE que es vacío. «No se encontró nada» y una
                 pantalla en blanco se distinguen mal, y aquí la diferencia
                 importa: este vacío es la respuesta. */
              <div className="empty" style={{ padding: "18px 0", lineHeight: 1.6 }}>
                Sin rastro en el sistema ese día.<br />
                <span style={{ fontSize: 11.5 }}>
                  No prueba que no trabajara —una grabación no deja huella aquí— pero
                  tampoco hay nada que respalde la jornada.
                </span>
              </div>
            )}

            {hechos && hechos.length > 0 && (
              <>
                {/* A QUÉ HORA. Ver el día como una barra contesta de un golpe
                    lo que la lista solo contesta leyéndola entera: si el
                    trabajo fue de mañana, si hubo un tirón de tres horas, o si
                    son cuatro cosas sueltas repartidas. Y cada columna filtra:
                    la gráfica no es un adorno al lado de la lista, es su
                    índice. */}
                <div className="dia-hg">
                  {porHora.map(({ h, n }) => (
                    <button key={h} type="button"
                      className={`dia-hg-col${horaSel === h ? " on" : ""}${n ? "" : " vacia"}`}
                      title={`${String(h).padStart(2, "0")}:00 — ${n} cosa${n === 1 ? "" : "s"}`}
                      disabled={!n}
                      onClick={() => setHoraSel(horaSel === h ? null : h)}>
                      <span className="dia-hg-barra">
                        <span className="dia-hg-lleno" style={{ height: `${(n / pico) * 100}%` }} />
                      </span>
                      <span className="dia-hg-h">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>
                    </button>
                  ))}
                </div>

                <div className="dia-filtros">
                  <button type="button" className={`muro-tag muro-tag-chip${!clase ? " on" : ""}`}
                    onClick={() => setClase(null)}>Todo · {todos.length}</button>
                  {CLASES.map(([k, ico, lbl]) => {
                    const n = cuenta(k);
                    if (!n) return null;   // un filtro que da cero no es una opción
                    return (
                      <button key={k} type="button" className={`muro-tag muro-tag-chip${clase === k ? " on" : ""}`}
                        onClick={() => setClase(clase === k ? null : k)}>{ico} {lbl} · {n}</button>
                    );
                  })}
                  {horaSel != null && (
                    <button type="button" className="muro-tag muro-tag-chip on"
                      title="Quitar el filtro de hora"
                      onClick={() => setHoraSel(null)}>🕗 {String(horaSel).padStart(2, "0")}:00 ✕</button>
                  )}
                </div>

                <div className="dia-n">
                  {vistos.length === todos.length
                    ? <>{todos.length} cosa{todos.length === 1 ? "" : "s"} en el sistema
                        {horaTop.n > 0 && <> · más movimiento a las <b style={{ color: "var(--teal)" }}>{String(horaTop.h).padStart(2, "0")}:00</b></>}</>
                    : <>{vistos.length} de {todos.length}</>}
                  {/* Lo que queda fuera de la barra se dice, o parecería que
                      la barra cuenta el día entero. */}
                  {sinHora > 0 && horaSel == null && <> · {sinHora} sin hora</>}
                </div>

                {vistos.length === 0 && (
                  <div className="empty" style={{ padding: "14px 0" }}>Nada con este filtro.</div>
                )}
                <div className="dia-lista">
                  {vistos.map((h: any, i: number) => {
                    const dentro = (
                      <>
                        {/* Sin hora ≠ a las doce. Un préstamo se guarda con
                            fecha suelta, y poner «12:00 p. m.» ahí es escribir
                            un dato que nadie registró. */}
                        <span className={`dia-hora${h.at ? "" : " sinhora"}`}
                          title={h.at ? undefined : "Se registró con fecha, sin hora"}>
                          {h.at ? hora(h.at) : "—"}
                        </span>
                        <span className="dia-ico">{h.ico}</span>
                        <span className="dia-txt">
                          <span className="dia-l1">
                            {h.txt}
                            {/* Una tanda dice cuántos son y se abre para ver
                                cuáles. El contador está en el texto; esto es
                                la puerta. */}
                            {h.lista && <span className="dia-mas">{abiertas.has(i) ? "▾ ocultar" : "▸ ver cuáles"}</span>}
                          </span>
                          {h.sub && <span className="dia-l2">{h.sub}</span>}
                          {h.lista && abiertas.has(i) && (
                            <span className="dia-tanda">
                              {h.lista.map((t: string, k: number) => <span key={k}>{t}</span>)}
                            </span>
                          )}
                        </span>
                      </>
                    );
                    if (h.lista) {
                      /* Botón y no enlace: una tanda no lleva a ninguna ficha
                         —son veintidós— así que lo que hace el clic es
                         abrirla. */
                      return (
                        <button key={i} type="button" className="dia-fila dia-fila-btn"
                          onClick={() => setAbiertas(s2 => {
                            const n2 = new Set(s2); n2.has(i) ? n2.delete(i) : n2.add(i); return n2;
                          })}>{dentro}</button>
                      );
                    }
                    return h.href
                      ? <Link key={i} href={h.href} className="dia-fila">{dentro}</Link>
                      : <span key={i} className="dia-fila">{dentro}</span>;
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      ), document.body)}
    </>
  );
}
