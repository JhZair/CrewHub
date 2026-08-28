"use client";
import { useEffect, useState, type ReactNode } from "react";

/* SECCIÓN PLEGABLE, con memoria.

   La ficha de una postulación acumula ocho bloques altos —cronograma, Gantt,
   presupuesto con sus rubros, material de archivo, precontratos,
   beneficiarios, repositorio, casos— y todos abiertos son varias pantallas de
   scroll donde nada resalta. Pero cuál importa depende del día: mientras se
   arma el presupuesto no se mira el material de archivo, y la semana del envío
   es al revés. Por eso no se decide aquí qué va cerrado: lo decide quien
   trabaja, y se recuerda —en `localStorage`, por sección y por ficha—, que si
   cada visita vuelve a abrirlo todo el plegado no sirve de nada.

   El resumen del título es lo que se lee cerrado: «Presupuesto · S/ 60.000»
   dice más que «Presupuesto», y muchas veces evita abrirlo. */
export default function Plegable({ id, ancla, titulo, resumen, abiertoPorDefecto = true, nivel = 1, tinte, children }: {
  /** Clave de memoria. Única por ficha: `postulacion:<id>:presupuesto`. */
  id: string;
  /** Id en el DOM, para que «ir →» pueda abrirla antes de bajar hasta ella. */
  ancla?: string;
  titulo: ReactNode;
  /** Lo que se ve cuando está cerrado, a la derecha del título. */
  resumen?: ReactNode;
  abiertoPorDefecto?: boolean;
  /** Profundidad visual: 1 = tarjeta principal, 2 = sub-sección, 3 = grupo. */
  nivel?: 1 | 2 | 3;
  /** Color de identidad: tiñe MUY tenue el fondo del bloque (el buscador lo usa
      para dar a cada entidad su color). Cualquier color CSS o `var(--…)`. */
  tinte?: string;
  children: ReactNode;
}) {
  /* Arranca con el valor por defecto y lo corrige tras montar: leer
     localStorage durante el render haría que el servidor y el cliente pinten
     cosas distintas y React descarta el árbol entero (hydration mismatch). */
  const [abierto, setAbierto] = useState(abiertoPorDefecto);
  const [listo, setListo] = useState(false);
  const llave = `plg:${id}`;

  useEffect(() => {
    try {
      const v = localStorage.getItem(llave);
      if (v !== null) setAbierto(v === "1");
    } catch { /* modo privado o storage bloqueado: se queda el por defecto */ }
    setListo(true);
  }, [llave]);

  /* «ir →» desde el expediente baja hasta esta sección. Si estaba plegada, el
     usuario aterrizaba en una cabecera cerrada y la leía como vacía —cuatro de
     las cinco tarjetas del expediente llevan a secciones que arrancan
     cerradas—. El aviso llega por evento para no acoplar los dos componentes:
     el expediente grita un id, la sección que se llama así se abre. */
  useEffect(() => {
    if (!ancla) return;
    const onAbrir = (e: Event) => {
      if ((e as CustomEvent).detail === ancla) {
        setAbierto(true);
        try { localStorage.setItem(llave, "1"); } catch { /* da igual */ }
      }
    };
    window.addEventListener("plg:abrir", onAbrir);
    return () => window.removeEventListener("plg:abrir", onAbrir);
  }, [ancla, llave]);

  /* Plegado masivo: «expandir/plegar todo» dispara un evento con un PREFIJO de
     id y un booleano; cada sección cuyo id empieza con ese prefijo obedece y
     recuerda el nuevo estado. Sirve para las decenas de grupos de una lista
     (los RHE por persona) sin cablear cada uno a mano. */
  useEffect(() => {
    const onTodos = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (typeof d.prefijo === "string" && id.startsWith(d.prefijo)) {
        const ab = !!d.abrir;
        setAbierto(ab);
        try { localStorage.setItem(llave, ab ? "1" : "0"); } catch { /* da igual */ }
      }
    };
    window.addEventListener("plg:todos", onTodos);
    /* ── «ÁBRETE, QUE HAY ALGO DENTRO QUE MIRAR» ──
       Distinto de `plg:abrir`, que va por la prop `ancla` y lo usa el
       expediente. Este va por el `id` —que TODOS los plegables tienen, porque
       es su clave de memoria— y lo dispara quien llega con un ancla de fila:
       una factura, un recibo. Sin esto, el aviso aterrizaba en una fila que
       existe en el documento pero vive dentro de un `hidden`, o sea invisible
       y sin caja: `scrollIntoView` sobre ella no hace nada, en silencio.
       Solo ABRE. Nunca cierra: quien viene a ver una fila no puede llevarse
       por delante lo que el otro tenía desplegado. */
    const onAbrirId = (e: Event) => {
      if ((e as CustomEvent).detail !== id) return;
      setAbierto(true);
      try { localStorage.setItem(llave, "1"); } catch { /* da igual */ }
    };
    window.addEventListener("plg:abrir-id", onAbrirId);
    return () => {
      window.removeEventListener("plg:todos", onTodos);
      window.removeEventListener("plg:abrir-id", onAbrirId);
    };
  }, [id, llave]);

  const alternar = () => {
    const n = !abierto;
    setAbierto(n);
    try { localStorage.setItem(llave, n ? "1" : "0"); } catch { /* da igual */ }
  };

  return (
    /* `data-plg` con el id de memoria: es lo que permite a quien llega con un
       ancla subir por los ancestros y abrir los que estén plegados, sin tener
       que mantener a mano un mapa de qué fila vive dentro de qué sección — que
       es lo que se intentó primero y se queda desactualizado al primer cambio
       (los grupos por persona de la rendición ni siquiera tienen nombre fijo). */
    <section data-plg={id}
      className={`plg n${nivel} ${abierto ? "on" : ""} ${tinte ? "plg--tinte" : ""}`} id={ancla}
      style={tinte ? ({ ["--plg-tinte" as any]: tinte }) : undefined}>
      <button className="plg-cab" onClick={alternar}
        title={abierto ? "Plegar" : "Desplegar"} aria-expanded={abierto}>
        <span className="plg-flecha">{abierto ? "▾" : "▸"}</span>
        <span className="plg-tit">{titulo}</span>
        {resumen && <span className="plg-res">{resumen}</span>}
      </button>
      {/* SE ESCONDE, NO SE DESMONTA. Dentro viven editores con autosave que
          guardan en la base pero NO refrescan la página: al desmontarlos, el
          siguiente despliegue los remontaba con los datos del primer render y
          el siguiente autosave escribía ese estado viejo encima de lo ya
          guardado. Plegar no puede borrar trabajo; el coste de mantenerlos
          montados es barato al lado de eso.
          `listo` evita el parpadeo del primer pintado: hasta leer la memoria
          no se sabe si esta sección va abierta. */}
      <div className="plg-cuerpo" hidden={!abierto} style={listo ? undefined : { visibility: "hidden" }}>
        {children}
      </div>
    </section>
  );
}
