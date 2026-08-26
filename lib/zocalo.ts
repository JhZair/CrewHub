"use client";
import { estadoGlobal } from "@/app/actions";

/* ══════════════════════════════════════════════════════════════════════════
   UNA PROMESA COMPARTIDA — el reparto del zócalo

   Tres componentes del layout necesitan cada uno su parte al cambiar de
   página: el menú sus burbujas, el banco sus casos y su muro, la campanita sus
   avisos. Eran cuatro acciones de servidor, y Next las ENCOLA: cuatro POST de
   uno en uno, 4772 ms medidos en producción por navegación.

   ── POR QUÉ ESTO Y NO UN CONTEXTO ──
   Lo natural sería un proveedor en el layout que cargue todo y lo reparta. Y
   sería un cambio grande: los tres componentes tienen su propio estado, sus
   propias recargas en vivo y sus propias reglas de cuándo esconderse. Mover
   todo eso a un contexto es tocar el zócalo de las 34 pantallas para ganar
   velocidad — justo la clase de refactor que se lleva por delante algo que
   funcionaba.

   Esto hace lo mismo sin tocar nada: los tres piden a la MISMA función, y si
   los tres piden por la misma página, comparten una sola llamada. No hay
   estado compartido que sincronizar, ni orden de montaje que respetar, ni
   proveedor que envuelva: solo una promesa que se reutiliza mientras la clave
   no cambie.

   ── LA CLAVE ES LA RUTA ──
   Al navegar cambia y se pide de nuevo, que es exactamente cuando hay que
   pedir. Un componente que se monte más tarde en la MISMA página —la
   campanita, que se esconde en la portada y aparece al salir— recibe lo que
   ya se trajo en esa navegación, que es lo correcto y además es gratis.

   ⚠ Los tres siguen teniendo sus acciones sueltas y las siguen usando para
   recargarse en vivo. Que llegue un comentario no tiene por qué traerse las
   notificaciones. Esto es solo para el instante en que los tres preguntan a la
   vez.
   ══════════════════════════════════════════════════════════════════════════ */

type Zocalo = Awaited<ReturnType<typeof estadoGlobal>>;

let clave = "";
let vuelo: Promise<Zocalo> | null = null;

export function pedirZocalo(ruta: string): Promise<Zocalo> {
  /* ⚠ EN EL SERVIDOR NO SE GUARDA NADA. `"use client"` no impide que este
     módulo se ejecute en el paso de SSR, y ahí `vuelo` sería una variable del
     PROCESO, compartida por todos: el zócalo de una persona servido a otra.
     Hoy no puede pasar porque los tres que llaman lo hacen desde un
     `useEffect`, que no corre en SSR — pero eso es disciplina, no una
     garantía, y se rompe el día que alguien lo llame durante el render. */
  if (typeof window === "undefined") return estadoGlobal();
  /* Al salir, se olvida. La promesa vive en el módulo y sobrevive a un cambio
     de sesión; hoy salir es una navegación dura que tira el módulo entero,
     pero el día que sea un `router.push` la siguiente persona que entrase en
     la misma pestaña recibiría el banco, el muro y los avisos de la anterior. */
  if (ruta.startsWith("/login")) { clave = ""; vuelo = null; }
  if (!vuelo || clave !== ruta) {
    clave = ruta;
    /* Si la llamada falla, se OLVIDA la promesa. Guardar una rechazada
       dejaría el zócalo roto en esa página hasta navegar a otra, y el
       siguiente que pidiera recibiría el mismo error sin haber vuelto a
       intentarlo. */
    vuelo = estadoGlobal().catch(e => { if (clave === ruta) vuelo = null; throw e; });
  }
  return vuelo;
}

/* ══════════════════════════════════════════════════════════════════════════
   OLVIDAR LO PEDIDO — para lo que cambia SIN navegar

   `router.refresh()` vuelve a renderizar el servidor, pero este módulo guarda
   la promesa por RUTA: si no se cambia de página, el zócalo sigue devolviendo
   lo que trajo la primera vez. Se veía al apagar una alarma: el bloque de la
   ficha decía «apagada» y la franja roja de arriba seguía encendida, en la
   misma pantalla. Dos partes de la interfaz contando cosas distintas del mismo
   hecho es exactamente lo que no puede pasar con un aviso.

   Quien cambia algo del zócalo llama a esto y AVISA: los que lo pintan
   escuchan el evento y vuelven a pedir. No es un contexto ni un estado
   compartido —seguimos sin nada que sincronizar—, solo un «esto ya no vale».
   ══════════════════════════════════════════════════════════════════════════ */
export const EVENTO_ZOCALO = "zocalo:cambio";

export function olvidarZocalo() {
  clave = ""; vuelo = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_ZOCALO));
}
