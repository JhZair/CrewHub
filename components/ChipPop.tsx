"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Portal from "@/components/Portal";

/* ══════════════════════════════════════════════════════════════════════════
   🫧 UN CHIP QUE ABRE SU LISTA

   Esto es la CÁSCARA: el botón, el pop-up anclado a él y todo lo que cuesta
   que un pop-up dentro de una fila de una lista se comporte. Lo de dentro lo
   pone quien lo use.

   Existe porque `ChipPiezas` costó dos intentos y ahora hacen falta tres chips
   iguales —piezas, kit y combo— en la misma fila. Tres copias de esto son tres
   sitios donde volver a equivocarse, y equivocarse aquí no da error: da un
   pop-up cortado por abajo, o translúcido, o que se cierra al tocar su propia
   barra de desplazamiento.

   ── POR QUÉ `position: fixed` Y NO `absolute` ──
   Las listas que lo contienen tienen `overflow-y: auto`. Un hijo `absolute` de
   un contenedor con overflow SE RECORTA por sus bordes: el pop-up salía
   cortado, enseñando el título y ninguna fila — lo contrario de para lo que
   existe. `fixed` se posiciona contra la ventana y ningún overflow lo corta,
   pero entonces hay que decirle dónde: se mide el botón al abrir y se coloca
   debajo (o encima), corrigiendo si se saldría por el borde.

   ── Y POR QUÉ, ADEMÁS, EN UN PORTAL ──
   `fixed` esquiva el `overflow`, pero NO la opacidad. Una pieza que hoy no
   puede salir se apaga entera con `.kit-pz.ocupada .kit-pz-l2 > *{opacity:.5}`
   y el chip es hijo directo de esa línea: el pop-up salía translúcido, con lo
   de detrás leyéndose a través. El razonamiento entero —y el interruptor de
   montado, que es lo que evita el desajuste de hidratación— vive en
   `components/Portal`; aquí se usa, no se repite.

   ⚠ LO QUE SÍ CAMBIA CON EL PORTAL: los eventos NATIVOS. Los de React siguen
   burbujeando por el árbol de React, así que los `stopPropagation` de aquí
   siguen impidiendo que el enlace de detrás navegue. Pero la activación nativa
   de un `<label>` que envuelva la fila depende del árbol del DOM, y la tapa
   —un `<span>`— vivía dentro de ese label: un clic en cualquier punto habría
   marcado la casilla. Fuera del label eso ya no puede pasar.

   ── EL ALTO NO SE ESTIMA: SE MIDE ──
   Nueve filas no caben en un portátil, así que hace falta un tope. Pero la
   altura de una fila NO se puede calcular: depende de la fuente, del zoom y de
   si un nombre parte en dos líneas. Se intentó dos veces —40 px por fila, luego
   68— y las dos salieron mal, cada una hacia un lado: con 40 el pop-up se
   cortaba por abajo; con 68 aparecía una barra de desplazamiento para las dos
   filas que faltaban, en un hueco donde sí habrían cabido.
   Así que se pinta con el máximo que hay, se MIDE lo que ocupó de verdad y se
   encoge a eso, en `useLayoutEffect`, antes de que el navegador pinte: no hay
   parpadeo. La barra aparece SOLO cuando de verdad no cabe.

   ── LO QUE SE PIDE AL ABRIR ──
   `cargar` es opcional. Las piezas viajan con la fila —son suyas, no se repiten
   en ninguna otra— pero el contenido de un kit sí: un kit de doce equipos sale
   en doce filas, y mandarlo con cada una es mover lo mismo doce veces para
   pintar dos palabras. Esos se piden al pulsar, y solo la primera vez.
   ══════════════════════════════════════════════════════════════════════════ */

export default function ChipPop({
  etiqueta, titulo, clase = "", ancho = 340, cabecera, cargar, children,
}: {
  /** Lo que se lee en el chip. */
  etiqueta: React.ReactNode;
  titulo: string;
  /** Color propio del chip, encima de `.ens-marca`. */
  clase?: string;
  ancho?: number;
  /** La franja de arriba del pop-up, sin la ✕ (esa la pone esto). */
  cabecera: React.ReactNode;
  /** Qué pedir la primera vez que se abre. Devuelve el error, o null si fue
   *  bien. Si no se pasa, el contenido ya estaba aquí y no hay espera. */
  cargar?: () => Promise<string | null>;
  children: React.ReactNode;
}) {
  /* `hueco` es lo que se decidió al abrir: de qué lado y cuánto sitio hay.
     `alto` es lo que ocupa de verdad, medido después de pintar. */
  const [hueco, setHueco] = useState<
    { left: number; dispo: number; arriba: boolean; aTop: number; aBottom: number } | null>(null);
  const [alto, setAlto] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Ya se pidió y salió bien: no se vuelve a pedir al reabrir. Un ref y no
   *  estado — cambiarlo no tiene que repintar nada. */
  const traido = useRef(false);
  const btn = useRef<HTMLButtonElement>(null);

  /* ⚠ ESTADO, NO `useRef`, PARA EL POP Y SU LISTA.
     `Portal` no pinta nada en su primer render —tiene un interruptor de montado
     para no desajustar la hidratación— así que en el commit donde se abre el
     pop-up esos dos nodos NO EXISTEN todavía. Con `useRef`, el efecto de medida
     corría, se encontraba los refs vacíos y salía; cuando el portal montaba,
     nada volvía a disparar la medida —ninguna de sus dependencias había
     cambiado— y `alto` se quedaba en null para siempre. El pop-up se pintaba
     entonces con TODO el hueco disponible, y hacia arriba eso lo pega al borde
     superior de la ventana, despegado del chip que lo abrió.
     Con estado, montar el nodo es un cambio de dependencia y la medida corre
     cuando hay algo que medir.
     ⚠ Y las funciones de ref van con `useCallback([])`: una flecha nueva en
     cada render hace que React desmonte y remonte el ref en cada pasada —null,
     nodo, null, nodo—, o sea `setEstado` en bucle infinito. */
  const [pop, setPop] = useState<HTMLSpanElement | null>(null);
  const [lista, setLista] = useState<HTMLSpanElement | null>(null);
  const refPop = useCallback((n: HTMLSpanElement | null) => setPop(n), []);
  const refLista = useCallback((n: HTMLSpanElement | null) => setLista(n), []);
  const abierto = !!hueco;
  const cerrar = () => { setHueco(null); setAlto(null); };

  const MARGEN = 12;

  function pedir() {
    if (!cargar || traido.current || cargando) return;
    setCargando(true); setErr(null);
    /* ⚠ `catch` además del error devuelto: una acción de servidor RECHAZA si se
       cae la red, y sin esto `cargando` se quedaría en true para siempre con un
       «…» eterno en el chip y sin decir por qué. */
    cargar()
      .then(e => { if (e) setErr(e); else traido.current = true; })
      .catch((e: any) => setErr(e?.message || "se cortó la conexión"))
      .finally(() => setCargando(false));
  }

  function abrir() {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    /* Alineado por la DERECHA del botón, que es donde suele estar el borde de
       la lista; y si aun así se saldría, se empuja hacia dentro. */
    const left = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8));
    const debajo = window.innerHeight - r.bottom - MARGEN;
    const encima = r.top - MARGEN;
    /* Solo se elige el LADO —el que tenga más sitio—. Cuánto ocupa de verdad
       se sabe una línea más tarde, midiéndolo. */
    const arriba = encima > debajo;
    setHueco({ left, arriba, dispo: arriba ? encima : debajo, aTop: r.top, aBottom: r.bottom });
    pedir();
  }

  /* MEDIR Y ENCOGER. `scrollHeight` de la lista es lo que el contenido ocupa
     entero, aunque esté recortado; el resto de la caja —cabecera y relleno— es
     la diferencia entre lo que mide el pop-up y lo que se ve de la lista.
     Sumados dan el alto real, y de ahí se coge el menor con lo disponible.

     ⚠ `cargando` y `err` en las dependencias: con contenido que llega DESPUÉS,
     la medida del primer pintado es la del «buscando…» — una línea— y el
     pop-up se quedaba de ese alto, con doce filas dentro de una caja de un
     renglón. Se vuelve a medir cuando el contenido cambia. */
  useLayoutEffect(() => {
    if (!hueco || !pop || !lista) return;
    const marco = pop.offsetHeight - lista.clientHeight;
    setAlto(Math.min(lista.scrollHeight + marco, hueco.dispo));
  }, [hueco, cargando, err, pop, lista]);

  /* Cerrar al mover la página o cambiar su tamaño: el pop-up está anclado a una
     coordenada de PANTALLA, y en cuanto algo se mueve esa coordenada deja de
     ser la del botón. `capture` porque el scroll de un contenedor interno no
     burbujea hasta window. Y Escape, que es lo que uno pulsa.

     ⚠ MENOS EL SUYO PROPIO. La lista de dentro también se desplaza —para eso se
     mide y se le pone un tope— y ese scroll llegaba a este mismo oyente: se
     abría el pop-up, aparecía la barra, y al tocarla se cerraba. Las últimas
     filas no había forma de verlas. El pop-up NO se mueve cuando lo que se
     desplaza es su interior, así que ahí no hay nada que cerrar. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev: Event) => {
      /* `instanceof Node` y no un cast: `contains()` LANZA si le dan algo que
         no es un nodo —`window`, por ejemplo—, y esa excepción salta antes de
         `cerrar()`. El pop-up se quedaría clavado apuntando a una fila que ya
         no está ahí, que es justo lo que este oyente evita. */
      if (ev.type === "scroll" && ev.target instanceof Node
        && pop?.contains(ev.target)) return;
      cerrar();
    };
    /* ⚠ Escape en CAPTURA y cortado ahí mismo, como `Anclado` y `PaletaRx`.
       Este chip se abre a menudo DENTRO de otra cosa que también escucha
       Escape en `window` —una vista rápida, un panel de entrega—, y sin cortar,
       un solo Esc cerraba las dos capas: se quería cerrar la lista de piezas y
       se perdía el lote que se llevaba marcado. */
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") { ev.stopImmediatePropagation(); cerrar(); }
    };
    window.addEventListener("scroll", fuera, true);
    window.addEventListener("resize", fuera);
    window.addEventListener("keydown", tecla, true);
    return () => {
      window.removeEventListener("scroll", fuera, true);
      window.removeEventListener("resize", fuera);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [abierto, pop]);

  /* Mientras no se ha medido se pinta con todo el hueco: así el navegador puede
     decir cuánto ocuparía. Ese primer pintado no llega a verse. */
  const altoAhora = alto ?? hueco?.dispo ?? 0;
  const topAhora = hueco
    ? (hueco.arriba ? Math.max(MARGEN, hueco.aTop - altoAhora - 5) : hueco.aBottom + 5)
    : 0;

  return (
    <span className="ens-chip-wrap">
      {/* ⚠ `preventDefault` + `stopPropagation`: este chip vive dentro de una
          fila que es un ENLACE. Sin cortar aquí, pulsarlo abriría además la
          ficha del equipo — que es justo el viaje que el pop-up ahorra. */}
      <button type="button" ref={btn} className={`ens-marca ens-marca-btn ${clase}`.trim()}
        title={titulo} aria-expanded={abierto}
        onClick={e => { e.preventDefault(); e.stopPropagation(); abierto ? cerrar() : abrir(); }}>
        {etiqueta}{cargando && " …"}
      </button>

      {abierto && (
        <Portal>
          {/* La capa que cierra al pulsar fuera. */}
          <span className="ens-tapa"
            onClick={e => { e.preventDefault(); e.stopPropagation(); cerrar(); }} />
          <span className="ens-pop" ref={refPop}
            style={{ top: topAhora, left: hueco!.left, width: ancho, maxHeight: altoAhora }}
            onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
            {/* La cabecera NO se desplaza: es donde está la ✕, y con nueve filas
                desplazadas hacia abajo el botón de cerrar se iba de la vista
                justo cuando hace falta. */}
            <span className="ens-pop-h">
              {cabecera}
              <button type="button" className="ens-pop-x" onClick={cerrar} title="Cerrar">✕</button>
            </span>
            <span className="ens-pop-lista" ref={refLista}>
              {/* El fallo se dice AQUÍ, que es donde se está mirando, y con el
                  motivo: un pop-up vacío se lee como «no tiene nada dentro»,
                  que sobre un kit es la respuesta contraria a la verdadera. */}
              {err
                /* Y se puede REINTENTAR desde aquí. Sin esto había que cerrar y
                   volver a abrir para probar otra vez, que es lo que nadie
                   deduce delante de un aviso rojo. */
                ? <button type="button" className="ens-pop-aviso ens-pop-reintentar"
                    title="Volver a intentarlo"
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setErr(null); pedir(); }}>
                    ⚠ {err} · <b>reintentar</b>
                  </button>
                : cargando
                  ? <span className="ens-pop-aviso">Buscando…</span>
                  : children}
            </span>
          </span>
        </Portal>
      )}
    </span>
  );
}
