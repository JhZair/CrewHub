"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { iguales, type UsoItem } from "@/components/EnUsoAhora";

/* ── LA LISTA EN PAPEL — para donde no hay señal ──
 *
 * El caso que la pide: te entregan treinta y seis equipos y te vas a zona rural
 * sin cobertura. Allá arriba la aplicación no existe, y la pregunta que hay que
 * poder contestar —«¿está todo?»— se contesta contando contra una lista. Sin
 * papel se cuenta contra la memoria, y la memoria a las seis de la tarde con
 * frío da que sí está todo.
 *
 * Tres decisiones, y las tres son por el campo y no por la pantalla:
 *
 * 1. UN CUADRITO DELANTE DE CADA COSA. Se cuenta con un lápiz, marcando. Una
 *    lista sin dónde marcar obliga a llevar la cuenta en la cabeza, que es lo
 *    que se quería evitar.
 *
 * 2. LAS PIEZAS MONTADAS, ESCRITAS. En la pantalla son un chip que se pulsa;
 *    en papel no hay nada que pulsar, así que van enumeradas debajo de su
 *    equipo. Un monopod sin su cabezal pesa casi lo mismo: si el papel no dice
 *    qué lleva dentro, la pieza que falta se descubre el mes que viene.
 *
 * 3. CON FOTOS, PERO ESPERÁNDOLAS. Una miniatura se reconoce antes que un
 *    nombre: «Trípode de luz Genérico» son cuatro trípodes distintos, y en el
 *    campo se identifica la cosa mirándola. El riesgo de las fotos es que
 *    vienen de Drive, así que si se imprime antes de que lleguen sale la hoja
 *    con los huecos vacíos — y una hoja que a veces sale bien no sirve para el
 *    único día que se va a usar. Por eso NO se llama a imprimir hasta que todas
 *    hayan cargado (o fallado), con un tope de espera para que un servidor
 *    caído no deje a nadie sin su hoja. Y por eso la hoja se pinta fuera de la
 *    pantalla en vez de con `display:none`: lo que no se pinta, no siempre se
 *    descarga.
 *    El folio (A-136) sigue estando y en columna: es lo que está escrito en el
 *    equipo, y es con lo que se cuenta cuando la foto no basta.
 *
 * Se imprime lo de UNA persona: es lo que se lleva uno, y una hoja con lo de
 * todo el equipo obligaría a buscar lo propio entre lo ajeno.
 */

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

const fechaCorta = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" });

/* ── ¿SE PUEDEN ESCRIBIR EN UN SOLO BLOQUE? ──
 *
 * Tres lámparas idénticas ocupan tres filas con la misma foto, el mismo nombre
 * y el mismo precio repetidos: en papel eso es media página gastada en decir
 * tres veces lo mismo, y contar tres cosas iguales se hace mejor con tres
 * cuadritos en una línea que con tres bloques separados por veinte milímetros.
 *
 * Pero solo si de verdad son intercambiables. Si una salió otro día, para otro
 * proyecto, la entregó otra persona, cuesta distinto o lleva piezas montadas
 * dentro, el bloque compacto se comería ese dato — y esa diferencia es
 * exactamente la que hará falta el día que una no vuelva. Ante cualquier duda,
 * cada una con su fila entera: ocupa más papel y no miente.
 */
function compactable(items: UsoItem[]): boolean {
  if (items.length < 2) return false;
  const a = items[0];
  return items.every(i =>
    !i.piezas?.length &&
    (i.valor || 0) === (a.valor || 0) &&
    (i.comboCodigo || "") === (a.comboCodigo || "") &&
    (i.proy || "") === (a.proy || "") &&
    i.desde === a.desde &&
    (i.entrego || "") === (a.entrego || ""));
}

export default function HojaEquipos({
  per, items, grupos, onCerrar,
}: {
  per: string;
  items: UsoItem[];
  /** Ya agrupados por kit, con la misma regla que la pantalla. */
  grupos: { kitId: string | null; kit?: string | null; items: UsoItem[] }[];
  onCerrar: () => void;
}) {
  /* `montado` existe porque esto se pinta con un portal a `document.body`, y en
     el servidor no hay body. Sin la espera, el primer render revienta. */
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  /* Imprimir DESPUÉS de que la hoja esté en el documento, no en el mismo clic:
     `window.print()` congela la página, y si se llama antes de que React haya
     pintado se imprime lo que había —o sea, nada—. */
  /* `onCerrar` llega en una función nueva en cada render del padre, y si
     estuviera en las dependencias del efecto, cualquier re-render de la lista
     —marcar una casilla, refrescar— volvería a lanzar `window.print()`. Por eso
     va en una referencia y el efecto depende SOLO de que la hoja esté montada:
     se imprime una vez, que es lo que se pidió. */
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const hoja = useRef<HTMLDivElement>(null);
  /* Mientras se esperan las fotos no pasa nada visible, y no pasar nada se lee
     como que el botón no funcionó — y se vuelve a pulsar. El aviso es para
     esos segundos. */
  const [esperando, setEsperando] = useState(true);

  useEffect(() => {
    if (!montado) return;
    let vivo = true;
    const cerrar = () => cerrarRef.current();
    window.addEventListener("afterprint", cerrar);

    /* ── NO SE IMPRIME HASTA QUE LAS FOTOS ESTÉN ──
       `window.print()` fotografía el documento tal como está en ese instante:
       una imagen que llega medio segundo tarde no sale, y no hay aviso de
       nada — la hoja simplemente tiene huecos.
       El `error` resuelve igual que el `load` a propósito: una foto rota no
       puede dejar a nadie esperando por una hoja que ya está lista salvo por
       ella. Y el tope de 8 s es la misma idea llevada al extremo: es mejor
       imprimir con dos huecos que no imprimir. */
    const imgs = Array.from(hoja.current?.querySelectorAll("img") || []);
    const cargadas = Promise.all(imgs.map(im => im.complete
      ? Promise.resolve()
      : new Promise<void>(res => {
          im.addEventListener("load", () => res(), { once: true });
          im.addEventListener("error", () => res(), { once: true });
        })));
    const tope = new Promise<void>(res => window.setTimeout(res, 8000));

    Promise.race([cargadas, tope]).then(() => {
      if (!vivo) return;
      setEsperando(false);
      /* Un cuadro más: el navegador tiene que haber maquetado la hoja con las
         imágenes ya dentro, no solo haberlas descargado. */
      window.setTimeout(() => { if (vivo) window.print(); }, 80);
    });

    return () => { vivo = false; window.removeEventListener("afterprint", cerrar); };
  }, [montado]);

  if (!montado) return null;

  const hoy = new Date().toLocaleDateString("es-PE",
    { day: "numeric", month: "long", year: "numeric" });
  /* Lo que se valoriza es lo que TIENE precio propio. Lo que lo tiene en su
     boleta no se estima: un total inventado en una hoja firmada es peor que un
     total incompleto, y por eso debajo se dice cuántos quedaron fuera. */
  const conPrecio = items.filter(i => (i.valor || 0) > 0);
  const total = conPrecio.reduce((a, i) => a + (i.valor || 0), 0);
  const sinPrecio = items.length - conPrecio.length;

  return createPortal(
    <>
      {/* Solo pantalla: en la impresión lo apaga la misma regla que apaga el
          resto de la aplicación. Sin él, los segundos que tardan las fotos se
          leen como que el botón no hizo nada. */}
      {esperando && (
        <div className="hoja-aviso">🖨 Preparando la hoja — cargando las fotos…</div>
      )}

      <div className="hoja" ref={hoja}>
      <div className="hoja-cab">
        <div>
          <h1>Cargo de equipos</h1>
          <div className="hoja-sub">
            <b>{per}</b> · {items.length} equipo{items.length === 1 ? "" : "s"} en su poder
          </div>
        </div>
        <div className="hoja-fecha">Impreso el {hoy}</div>
      </div>

      {grupos.map((sg, i) => {
        const total0 = sg.items[0]?.kitTotal || sg.items.length;
        const cojo = !!sg.kitId && sg.items.length < total0;
        return (
          <div key={sg.kitId || `_sueltos-${i}`} className="hoja-kit">
            <div className="hoja-kit-h">
              {sg.kitId
                ? <>Kit: {sg.kit} <span className="hoja-kit-n">
                    {cojo ? `${sg.items.length} de ${total0} piezas` : `completo · ${total0} piezas`}
                  </span></>
                /* Lo suelto lleva su propio encabezado en vez de ir pegado al
                   último kit: sin él, en el papel parece la continuación de
                   aquel y se cuenta contra el número equivocado. */
                : <>Sueltos <span className="hoja-kit-n">{sg.items.length} equipo{sg.items.length === 1 ? "" : "s"}</span></>}
            </div>

            {iguales(sg.items).map(gi => compactable(gi.items) ? (
              /* ── TRES IGUALES, UN BLOQUE ──
                  Una foto, un nombre, un precio — y tres cuadritos en fila.
                  Contar tres cosas idénticas se hace marcando tres casillas
                  juntas, no recorriendo tres bloques separados que dicen lo
                  mismo. Cada cuadrito lleva su folio, que es lo que está
                  escrito en el equipo y con lo que se distinguen entre sí. */
              <div key={gi.clave} className="hoja-fila hoja-multi">
                <span className="hoja-foto">
                  {gi.items[0].cartel
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={gi.items[0].cartel as string} alt="" referrerPolicy="no-referrer" />
                    : <span className="hoja-sinfoto">sin foto</span>}
                </span>
                <span className="hoja-txt">
                  <span className="hoja-nom">
                    <span className="hoja-x">×{gi.items.length}</span> {gi.nombre}
                  </span>
                  <span className="hoja-det">
                    {[gi.items[0].categoria, gi.items[0].subcategoria].filter(Boolean).join(" · ")}
                    {gi.items[0].proy ? ` — ${gi.items[0].proy}` : ""}
                    {` · desde ${fechaCorta(gi.items[0].desde)}`}
                    {gi.items[0].entrego ? ` · entregó ${gi.items[0].entrego}` : ""}
                  </span>
                  <span className="hoja-unidades">
                    {gi.items.map(u => (
                      <span key={u.id} className="hoja-unidad">
                        <span className="hoja-box" />{u.folio || "—"}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="hoja-val">
                  {(gi.items[0].valor || 0) > 0
                    ? <>{soles(gi.items[0].valor as number)}<span className="hoja-cu"> c/u</span></>
                    : gi.items[0].comboCodigo
                      ? <span className="hoja-encombo">en {gi.items[0].comboCodigo}</span> : ""}
                </span>
              </div>
            ) : gi.items.map(p => (
              <div key={p.id} className="hoja-fila">
                <span className="hoja-box" />
                {/* La foto. «Trípode de luz Genérico» son cuatro trípodes
                    distintos: en el campo la cosa se identifica mirándola, y el
                    nombre solo sirve para confirmar. `contain` y no `cover`
                    porque recortar un equipo alargado —un trípode, una jirafa—
                    deja en la hoja un trozo de tubo que no se reconoce. */}
                <span className="hoja-foto">
                  {p.cartel
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.cartel} alt="" referrerPolicy="no-referrer" />
                    : <span className="hoja-sinfoto">sin foto</span>}
                </span>
                <span className="hoja-folio">{p.folio || "—"}</span>
                <span className="hoja-txt">
                  <span className="hoja-nom">{p.nombre}</span>
                  <span className="hoja-det">
                    {[p.categoria, p.subcategoria].filter(Boolean).join(" · ")}
                    {p.proy ? ` — ${p.proy}` : ""}
                    {` · desde ${fechaCorta(p.desde)}`}
                    {p.entrego ? ` · entregó ${p.entrego}` : ""}
                  </span>
                  {/* Lo que va dentro, con su folio: al contar de vuelta se
                      busca por el número escrito en la pieza, no por su nombre. */}
                  {!!p.piezas?.length && (
                    <span className="hoja-piezas">
                      Lleva dentro ({p.piezas.length}):{" "}
                      {p.piezas.map(z => `${z.folio ? z.folio + " " : ""}${z.nombre}`).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="hoja-val">
                  {(p.valor || 0) > 0 ? soles(p.valor as number)
                    : p.comboCodigo ? <span className="hoja-encombo">en {p.comboCodigo}</span> : ""}
                </span>
              </div>
            )))}
          </div>
        );
      })}

      <div className="hoja-total">
        <b>{items.length} equipos</b>
        <span>
          Valorizado: <b>{soles(total)}</b>
          {sinPrecio > 0 && <> · {sinPrecio} sin precio registrado (no suman)</>}
        </span>
      </div>

      {/* Las firmas. Una entrega la hacen dos personas, y el papel es el único
          sitio donde eso queda cuando no hay señal para registrarlo. */}
      <div className="hoja-firmas">
        <div><span className="hoja-linea" />Entregó — nombre y firma</div>
        <div><span className="hoja-linea" />Recibió — {per}</div>
      </div>

      <div className="hoja-pie">
        CrewHub · esta hoja es una foto del momento en que se imprimió; lo que manda
        es lo registrado en el sistema.
      </div>
      </div>
    </>,
    document.body,
  );
}
