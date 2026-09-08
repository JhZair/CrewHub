"use client";
import { useEffect, useRef, useState } from "react";
import Portal from "@/components/Portal";

/* ══════════════════════════════════════════════════════════════════════════
   📌 ANCLADO — UN MENÚ QUE CUELGA DE SU BOTÓN PERO SE PINTA CONTRA LA VENTANA

   ── EL PROBLEMA ──
   Un menú `position:absolute` colgado de su botón hereda TODO lo que le pase
   al antepasado: si alguien apaga la tarjeta con `opacity`, si alguien le pone
   un `filter`, si alguien la posiciona con `z-index`, el menú se va con ella.
   `.fila-encima{position:relative;z-index:2}` —que es como este sistema levanta
   lo interactivo por encima del enlace estirado de una fila— basta para
   encerrarlo: el `z-index:50` del menú deja de competir con la página y pasa a
   valer 2, así que la fila SIGUIENTE de la lista se le pinta encima. Y el
   telón que cierra al pulsar fuera se queda al mismo nivel, o sea que pulsar
   sobre esa fila de abajo no cierra el menú: activa la fila.

   El fallo se esconde solo cuando la tarjeta se enciende al pasar el cursor:
   el menú se abre con el ratón encima, donde no hay nada apagado, y se mete
   debajo justo cuando bajas el ratón hacia la opción que ibas a elegir.

   ── POR QUÉ NO BASTA PORTALIZAR EL TELÓN ──
   Es lo primero que se intenta y es peor: el telón se iría a la raíz por
   encima de todo y el menú se quedaría dentro de la tarjeta, o sea DEBAJO del
   telón. Deja de poder pulsarse. Es todo o nada.

   ── QUÉ HACE ESTO ──
   Mide el botón al abrir y pinta telón y menú colgados de <body> con
   coordenadas de PANTALLA. Nada de lo que le pase a la tarjeta le llega.

   El alto no se calcula: se acota. Se le da al envoltorio el sitio que hay y
   se deja que el menú, que es un hijo flex con `min-height:0` y su propio
   `overflow-y:auto`, se encoja solo si no cabe. Intentar medir el contenido
   —que es lo que hace ChipPiezas, y le costó dos intentos— aquí no hace falta
   porque estos menús ya saben desplazarse.

   ── SE CIERRA AL MOVER LA PÁGINA ──
   Está anclado a una coordenada de pantalla, y en cuanto algo se mueve esa
   coordenada deja de ser la del botón. Perseguirlo sería peor. `capture`
   porque el scroll de un contenedor interno no burbujea hasta window; y se
   ignora el scroll que nace DENTRO del propio menú, que es la lista bajando.
   ══════════════════════════════════════════════════════════════════════════ */

const GAP = 5;       // separación con el botón
const BORDE = 8;     // aire mínimo contra el borde de la ventana
/* Lo que hace falta para que un menú sea usable. Por debajo de esto no se
   elige el lado preferido aunque «quepa»: un desplegable de 17 px de alto cabe
   y no sirve para nada. */
const MIN_ALTO = 140;
/* Y de ancho, cuando quien llama no dice cuánto va a medir. `.combo-menu` pide
   150 de mínimo; con este margen el menú no queda espachurrado contra el borde
   derecho por abrirse desde un botón que está allí.
   ⚠ Es un DEFECTO, no una verdad. Un menú más ancho tiene que decirlo con
   `anchoMin` o se saldrá de la pantalla: reservando 170 para algo que mide 360
   el hueco se calcula mal y el menú desborda por la derecha. */
const MIN_ANCHO = 170;

type Sitio = {
  left: number; top?: number; bottom?: number;
  width?: number; maxWidth: number; maxHeight: number;
};

export default function Anclado({
  ancla, alCerrar, ancho, anchoMin, lado = "abajo", children,
}: {
  /** El botón que abre. Se mide al montar: este componente solo existe
   *  mientras el menú está abierto. */
  ancla: React.RefObject<HTMLElement | null>;
  alCerrar: () => void;
  /** `"ancla"` para un menú del ancho de su campo —lo que hace un desplegable
   *  de formulario—. Sin esto, el menú mide lo que mida su contenido. */
  ancho?: "ancla";
  /** Lo que el menú necesita de ancho para no salirse. Solo hace falta si es
   *  bastante más que `MIN_ANCHO`. */
  anchoMin?: number;
  /** El lado que se PREFIERE, no el que se impone. Si por ese lado no queda
   *  sitio de verdad, se va al otro: una paleta que «siempre abre hacia
   *  arriba» en la primera fila de la pantalla abriría en diecisiete píxeles. */
  lado?: "arriba" | "abajo";
  children: React.ReactNode;
}) {
  const [sitio, setSitio] = useState<Sitio | null>(null);
  const [caja, setCaja] = useState<HTMLDivElement | null>(null);

  /* Se mide una vez, al abrir. Si la página se mueve no se recalcula: se
     cierra (ver el efecto de abajo), que es lo honesto — un menú que persigue
     a su botón mientras la lista se desplaza marea más que uno que se va. */
  useEffect(() => {
    const el = ancla.current;
    if (!el) { alCerrar(); return; }
    const r = el.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    const abajo = H - r.bottom - GAP - BORDE;
    const arriba = r.top - GAP - BORDE;
    /* El lado preferido manda MIENTRAS haya sitio de verdad. Si no, el que
       tenga más. Comparar a secas —«el que tenga más»— hacía que un botón a
       mitad de pantalla abriese hacia arriba por ocho píxeles de diferencia,
       que no es lo que espera nadie. */
    const quiereArriba = lado === "arriba";
    const vaArriba = (quiereArriba ? arriba : abajo) >= MIN_ALTO
      ? quiereArriba
      : arriba > abajo;
    /* El izquierdo se empuja hacia dentro si el menú no cabría: sin esto, un
       botón pegado al borde derecho abría un menú de setenta píxeles. Con
       ancho de ancla se sabe cuánto ocupa; sin él, se reserva un mínimo. */
    const reserva = ancho === "ancla" ? r.width : (anchoMin ?? MIN_ANCHO);
    const left = Math.max(BORDE, Math.min(r.left, W - BORDE - reserva));
    setSitio({
      ...(vaArriba
        ? { bottom: H - r.top + GAP, maxHeight: arriba }
        : { top: r.bottom + GAP, maxHeight: abajo }),
      left, maxWidth: W - BORDE - left,
      ...(ancho === "ancla" ? { width: r.width } : {}),
    });
    // Solo al montar: el sitio es el de ese instante, a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── EL FOCO ENTRA Y VUELVE ──
     Al colgarse de <body> el menú deja de ser el siguiente nodo enfocable
     después del botón: con el teclado, Tab desde el botón se iba al control de
     al lado y las opciones no se podían alcanzar. Se le da el foco al
     envoltorio —`tabIndex={-1}`, o sea enfocable a mano pero fuera del
     recorrido de Tab— y desde ahí Tab recorre las opciones.
     Al cerrar, el foco vuelve al botón. Solo si estaba DENTRO: si se cerró
     porque el usuario se fue a pulsar otra cosa, robarle el foco de vuelta
     sería peor que no devolverlo. */
  useEffect(() => {
    if (!caja) return;
    const antes = document.activeElement as HTMLElement | null;
    caja.focus({ preventScroll: true });
    return () => {
      if (caja.contains(document.activeElement)) (ancla.current ?? antes)?.focus?.({ preventScroll: true });
    };
  }, [caja, ancla]);

  /* `alCerrar` en un ref y NO en las dependencias: quien llama pasa una lambda
     nueva en cada render —`() => setOpen(false)`— y con ella en la lista los
     tres oyentes se quitaban y se volvían a poner en cada render del padre.
     En una pantalla que se refresca sola eso es puro trasiego. */
  const cerrarRef = useRef(alCerrar);
  cerrarRef.current = alCerrar;

  useEffect(() => {
    const alCerrar = () => cerrarRef.current();
    const fuera = (ev: Event) => {
      /* `instanceof Node` y no un cast: `contains()` LANZA con algo que no es
         un nodo —`window`, por ejemplo— y la excepción saltaría antes de
         cerrar, dejando el menú clavado señalando una fila que ya no está. */
      if (ev.type === "scroll" && ev.target instanceof Node && caja?.contains(ev.target)) return;
      alCerrar();
    };
    /* En captura y cortando ahí mismo: quien contiene esto puede estar
       escuchando Escape en `window` para cerrarse —y al cerrarse se lleva lo
       que hubiera a medio escribir—. `stopImmediatePropagation` es lo único
       que frena a otro oyente del MISMO nodo, que es justo ese. */
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.stopImmediatePropagation();
      alCerrar();
    };
    window.addEventListener("scroll", fuera, true);
    window.addEventListener("resize", fuera);
    window.addEventListener("keydown", tecla, true);
    return () => {
      window.removeEventListener("scroll", fuera, true);
      window.removeEventListener("resize", fuera);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [caja]);

  /* Mientras no se ha medido no se pinta nada. Es un solo render y no llega a
     verse; pintarlo antes lo enseñaría un fotograma en la esquina de arriba. */
  if (!sitio) return null;

  return (
    <Portal>
      {/* El telón. El clic MUERE aquí: cubre la pantalla entera y sin cortarlo
          se colaría a la fila o al modal de debajo. */}
      <span className="anc-fondo"
        onClick={e => { e.preventDefault(); e.stopPropagation(); alCerrar(); }} />
      <div ref={setCaja} className="anc" style={sitio} tabIndex={-1}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </Portal>
  );
}
