"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "@/components/Enlace";
import { txtEstadoEq, colorEstadoEq } from "@/lib/estadosEquipo";

export type PiezaMontada = {
  id: string; folio?: string | null; nombre: string;
  cartel?: string | null; estado?: string | null;
  /* ── LO QUE CUESTA CADA PIEZA ──
   * Seis baterías de vuelo y dos centros de carga dentro de un drone son casi
   * tres mil soles. Al firmar la salida de un kit, o al devolverlo con una
   * pieza menos, la pregunta que sigue es siempre cuánto valía esa pieza — y
   * hasta ahora había que salir a buscarla al inventario, una por una.
   * `combo` para las que no tienen precio propio: vinieron dentro de una
   * boleta y les toca su parte, que se calcula donde se conoce el combo
   * entero y viaja ya resuelta. */
  valor?: number | null;
  combo?: { codigo?: string | null; porPieza?: number | null } | null;
};

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

/* Lo que vale una pieza montada: el suyo, o la parte que le toca de su
   boleta. `estimado` se propaga para que la cifra lleve su «~»: un número
   repartido y uno de una factura no valen lo mismo como prueba. */
const valeM = (p: PiezaMontada): { v: number; esti: boolean } => {
  const propio = Number(p.valor) || 0;
  if (propio > 0) return { v: propio, esti: false };
  const parte = Number(p.combo?.porPieza) || 0;
  return parte > 0 ? { v: parte, esti: true } : { v: 0, esti: false };
};

/* «🔩 3 piezas», y al pulsarlo QUÉ tres.
 *
 * El número solo avisa; la lista es lo que se usa. Al recibir de vuelta un
 * monopod hay que contar contra algo, y ese algo son tres nombres con su
 * foto — no un número que obliga a abrir la ficha en otra pestaña justo
 * cuando tienes el equipo en la mano y a alguien esperando.
 *
 * Las piezas viajan con la fila y no se piden al pulsar: un ensamblado tiene
 * tres o diez, no doscientas, y la página ya las tiene en memoria. Cargarlas
 * al abrir sería una espera de red para enseñar algo que ya estaba aquí.
 *
 * El pop-up NO es un enlace a ningún sitio: se abre encima y se cierra. Ir a
 * la ficha del ensamblado desde la pantalla de entrega es perder lo que ya
 * llevabas marcado.
 *
 * ── POR QUÉ VA EN `position: fixed` Y NO `absolute` ──
 * Las listas que lo contienen tienen `overflow-y: auto` para poder desplazarse.
 * Un hijo `absolute` de un contenedor con overflow SE RECORTA por sus bordes:
 * el pop-up salía cortado por abajo, enseñando el título y ninguna pieza —o
 * sea, justo lo contrario de para lo que existe—. `fixed` se posiciona contra
 * la ventana y ningún overflow lo corta, pero entonces hay que decirle dónde:
 * se mide el botón al abrir y se coloca debajo, corrigiendo si se saldría por
 * el borde derecho o por abajo.
 * Se cierra al hacer scroll en vez de perseguir al botón: un pop-up que sigue
 * a su fila mientras la lista se mueve es peor que uno que se va. Y el cierre
 * escucha el scroll de TODA la página en captura, no la rueda sobre una capa:
 * con el puntero encima del propio pop-up la rueda no llegaba a esa capa, así
 * que el pop-up se quedaba clavado en pantalla mientras la lista se movía
 * debajo — apuntando a una fila que ya no estaba ahí.
 *
 * ── EL ALTO NO SE ESTIMA: SE MIDE ──
 * Nueve baterías no caben en un portátil, así que hace falta un tope. Pero la
 * altura de una fila NO se puede calcular: depende de la fuente, del zoom y
 * de si un nombre parte en dos líneas. Se intentó dos veces —40 px por fila,
 * luego 68— y las dos salieron mal, cada una hacia un lado: con 40 el pop-up
 * sobresalía media pantalla y se cortaba por abajo; con 68 se abría a la
 * altura entera disponible y aparecía una barra de desplazamiento para las
 * dos filas que faltaban, en un hueco donde sí habrían cabido.
 *
 * Así que se pinta primero con el máximo que hay, se MIDE lo que ocupó de
 * verdad y se encoge a eso. En `useLayoutEffect`, antes de que el navegador
 * pinte: no hay parpadeo. El resultado es que la barra aparece SOLO cuando
 * de verdad no cabe, que es lo único que la justifica.
 */
export default function ChipPiezas({ piezas, titulo = "Va armado: lleva piezas montadas dentro" }: {
  piezas: PiezaMontada[];
  titulo?: string;
}) {
  /* `hueco` es lo que se decidió al abrir: de qué lado y cuánto sitio hay.
     `alto` es lo que ocupa de verdad, medido después de pintar. */
  const [hueco, setHueco] = useState<
    { left: number; dispo: number; arriba: boolean; aTop: number; aBottom: number } | null>(null);
  const [alto, setAlto] = useState<number | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const lista = useRef<HTMLSpanElement>(null);
  const abierto = !!hueco;
  const cerrar = () => { setHueco(null); setAlto(null); };

  /* MEDIR Y ENCOGER. `scrollHeight` de la lista es lo que el contenido ocupa
     entero, aunque esté recortado; el resto de la caja —cabecera y relleno—
     es la diferencia entre lo que mide el pop-up y lo que se ve de la lista.
     Sumados dan el alto real, y de ahí se coge el menor con lo disponible. */
  useLayoutEffect(() => {
    if (!hueco || !pop.current || !lista.current) return;
    const marco = pop.current.offsetHeight - lista.current.clientHeight;
    setAlto(Math.min(lista.current.scrollHeight + marco, hueco.dispo));
  }, [hueco]);

  /* Cerrar al mover la página o cambiar su tamaño: el pop-up está anclado a
     una coordenada de PANTALLA, y en cuanto algo se mueve esa coordenada deja
     de ser la del botón. `capture` porque el scroll de un contenedor interno
     no burbujea hasta window. Y Escape, que es lo que uno pulsa. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = () => cerrar();
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") cerrar(); };
    window.addEventListener("scroll", fuera, true);
    window.addEventListener("resize", fuera);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("scroll", fuera, true);
      window.removeEventListener("resize", fuera);
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  if (!piezas.length) return null;

  const sumas = piezas.map(valeM);
  const total = sumas.reduce((a, x) => a + x.v, 0);
  const estimado = sumas.some(x => x.esti);

  const ANCHO = 340;
  const MARGEN = 12;

  function abrir() {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    /* Alineado por la DERECHA del botón, que es donde suele estar el borde de
       la lista; y si aun así se saldría, se empuja hacia dentro. */
    const left = Math.max(8, Math.min(r.right - ANCHO, window.innerWidth - ANCHO - 8));
    const debajo = window.innerHeight - r.bottom - MARGEN;
    const encima = r.top - MARGEN;
    /* Solo se elige el LADO —el que tenga más sitio—. Cuánto ocupa de verdad
       se sabe una línea más tarde, midiéndolo. */
    const arriba = encima > debajo;
    setHueco({ left, arriba, dispo: arriba ? encima : debajo, aTop: r.top, aBottom: r.bottom });
  }

  /* Mientras no se ha medido se pinta con todo el hueco: así el navegador
     puede decir cuánto ocuparía. Ese primer pintado no llega a verse. */
  const altoAhora = alto ?? hueco?.dispo ?? 0;
  const topAhora = hueco
    ? (hueco.arriba ? Math.max(MARGEN, hueco.aTop - altoAhora - 5) : hueco.aBottom + 5)
    : 0;

  return (
    <span className="ens-chip-wrap">
      <button type="button" ref={btn} className="ens-marca ens-marca-btn" title={titulo}
        aria-expanded={abierto}
        onClick={e => { e.preventDefault(); e.stopPropagation(); abierto ? cerrar() : abrir(); }}>
        🔩 {piezas.length} pieza{piezas.length === 1 ? "" : "s"}
      </button>

      {abierto && (
        <>
          {/* La capa que cierra al pulsar fuera —y al hacer scroll, porque el
              pop-up está anclado a una posición de pantalla que deja de ser la
              del botón en cuanto la lista se mueve. */}
          <span className="ens-tapa"
            onClick={e => { e.preventDefault(); e.stopPropagation(); cerrar(); }} />
          <span className="ens-pop" ref={pop}
            style={{ top: topAhora, left: hueco!.left, width: ANCHO, maxHeight: altoAhora }}
            onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
            {/* La cabecera NO se desplaza: es donde está la ✕, y con nueve
                piezas desplazadas hacia abajo el botón de cerrar se iba de la
                vista justo cuando hace falta. */}
            <span className="ens-pop-h">
              🔩 Va con {piezas.length} pieza{piezas.length === 1 ? "" : "s"} montada{piezas.length === 1 ? "" : "s"}
              {/* El total de lo que va dentro. Con nueve filas de precios, la
                  suma a mano es justo lo que nadie hace: se dice aquí. */}
              {total > 0 && (
                <span className="ens-pop-tot" title={estimado
                  ? "Aproximado: alguna pieza vino en un combo sin precio propio y se le reparte su parte de la boleta."
                  : "Suma de lo que cuesta cada pieza montada."}>
                  {estimado ? "~" : ""}{soles(total)}
                </span>
              )}
              <button type="button" className="ens-pop-x" onClick={cerrar} title="Cerrar">✕</button>
            </span>
            <span className="ens-pop-lista" ref={lista}>
            {piezas.map(p => (
              <Link key={p.id} href={`/entidad/equipamiento/${p.id}`} className="ens-pop-fila">
                <span className="kit-pz-img">
                  {p.cartel
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.cartel} alt="" referrerPolicy="no-referrer" />
                    : <span>🎥</span>}
                </span>
                {p.folio && <span className="kit-pz-folio">{p.folio}</span>}
                <span className="ens-pop-n">{p.nombre}</span>
                {/* El estado solo cuando NO es «ensamblado»: dentro de su
                    ensamblado eso es lo normal y decirlo en cada fila es
                    repetir el título del pop-up tres veces. Lo que sí importa
                    es la pieza que está rota o no aparece estando montada. */}
                {p.estado && p.estado !== "ensamblado" && (
                  <span style={{ fontSize: 10, color: colorEstadoEq(p.estado), whiteSpace: "nowrap" }}>
                    {txtEstadoEq(p.estado)}
                  </span>
                )}
                {/* El precio al final de la fila, no pegado al nombre: la
                    columna de cifras se suma con la vista, y con el precio
                    entremedio del texto hay que buscarlo nueve veces. */}
                {(() => {
                  const { v, esti } = valeM(p);
                  if (v > 0) return (
                    <span className={`ens-pop-val${esti ? " esti" : ""}`}
                      title={esti ? `Sin precio propio: le toca esta parte de ${p.combo?.codigo || "su boleta"}.` : undefined}>
                      {esti ? "~" : ""}{soles(v)}
                    </span>
                  );
                  /* Sin precio NO se calla: una pieza sin valorar es la que
                     hace que el total del kit vaya corto, y el hueco solo se
                     arregla si se ve. */
                  return <span className="ens-pop-sinval" title="Sin precio propio ni combo: no suma al valor del kit.">⚠</span>;
                })()}
              </Link>
            ))}
            </span>
          </span>
        </>
      )}
    </span>
  );
}
