"use client";
import { useEffect, useRef, useState, Fragment, type ReactNode } from "react";
import BotonOcultarResueltos from "@/components/BotonOcultarResueltos";

/* Lista del feed, del lado del cliente, para tres cosas que el servidor no
   puede resolver solo:
   1. AUTO-OCULTAR resueltos ya vistos: un caso resuelto se ve la sesión en que
      aparece; en la próxima visita (recarga), se va solo. La marca es
      por-usuario y por-navegador —un registro de ids ya vistos en localStorage—,
      así funciona aunque el caso sea viejo y se acabe de resolver (no depende de
      la fecha de creación).
   2. ESTADO VACÍO real: si tras auto-ocultar no queda nada, muestra el mensaje
      (el servidor no sabe qué escondió el cliente).
   3. BOTÓN de bloque con los ids que quedan A LA VISTA, para que ocultar en
      bloque coincida con lo que se ve. */

const CLAVE = "cw_resueltos_vistos";
const TOPE = 600;   // recordar los últimos N, para no crecer sin fin

const leer = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE) || "[]")); } catch { return new Set(); }
};
const marcar = (nuevos: string[]) => {
  try {
    const s = leer(); nuevos.forEach(id => s.add(id));
    let arr = [...s]; if (arr.length > TOPE) arr = arr.slice(-TOPE);
    localStorage.setItem(CLAVE, JSON.stringify(arr));
  } catch { /* modo privado */ }
};

export type CardFeed = { id: string; resuelto: boolean; card: ReactNode };

export default function ListaFeed({ items }: { items: CardFeed[] }) {
  /* SSR y primer render: todo visible (coincide con el HTML del servidor, sin
     desajustar la hidratación). Ya montado, escondemos los resueltos vistos. */
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  /* FOTO del registro tomada UNA vez por carga real de la página. Los
     router.refresh de la sesión (comentar, reaccionar, cambiar estado) vuelven
     a correr este efecto, pero deben usar la MISMA foto: si releyéramos el
     registro cada vez, un resuelto que estás viendo se ocultaría de golpe al
     refrescar por otra acción. La foto solo se renueva al recargar (nueva
     instancia del componente → ref en null otra vez). */
  const foto = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (foto.current === null) foto.current = leer();
    const vistos = foto.current;
    const esconder = new Set<string>();
    const primeraVez: string[] = [];
    for (const it of items) {
      if (!it.resuelto) continue;
      if (vistos.has(it.id)) esconder.add(it.id);   // ya estaba visto al cargar → fuera
      else primeraVez.push(it.id);                   // nuevo esta sesión: se ve hoy, se marca para la próxima
    }
    if (primeraVez.length) marcar(primeraVez);        // persiste para la PRÓXIMA carga (la foto no cambia)
    setOcultos(esconder);
  }, [items]);

  const vis = items.filter(it => !ocultos.has(it.id));
  const resVis = vis.filter(it => it.resuelto).map(it => it.id);

  return (
    <>
      {resVis.length > 0 && <BotonOcultarResueltos ids={resVis} />}
      {vis.length
        ? vis.map(it => <Fragment key={it.id}>{it.card}</Fragment>)
        : <div className="empty">Nada en esta vista todavía.</div>}
    </>
  );
}
