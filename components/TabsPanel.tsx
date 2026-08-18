"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* Pestañas con contador en burbuja.
 *
 * Las etiquetas llegan como texto («📅 Cronograma · 25 · próx. 1 set.») porque
 * así es cómodo armarlas en el servidor. Aquí se parten: el nombre queda como
 * título de la pestaña, el primer número pasa a una burbuja compacta —como el
 * contador de la campanita— y cualquier nota extra (una fecha próxima) va a una
 * pastilla tenue y al tooltip. Sin esto, una etiqueta larga ensanchaba su
 * pestaña y descuadraba toda la fila.
 *
 * La burbuja solo aparece si hay algo que contar (> 0): una pestaña vacía no
 * necesita gritar un cero.
 *
 * `iconoSolo` recorta pestañas a «ícono + número» (sin el nombre) para ahorrar
 * ancho donde el texto se sobreentiende —Historial, típicamente—; el nombre
 * completo sigue en el tooltip.
 *
 * `extra` es un elemento que NO es panel (un enlace externo, la carpeta Drive):
 * se cuela en la fila, antes del botón «⋯ Más».
 *
 * `masUltima` manda la ÚLTIMA pestaña (el Historial) a un menú «⋯ Más», para
 * que la fila no se desborde cuando hay muchas pestañas. */
function parte(label: string) {
  const partes = String(label).split(" · ");
  const nombre = partes[0];
  const resto = partes.slice(1);
  const iNum = resto.findIndex(s => /^\d+$/.test(s.trim()));
  const n = iNum >= 0 ? resto[iNum].trim() : null;
  const nota = resto.filter((_, j) => j !== iNum).join(" · ") || null;
  return { nombre, n, nota };
}

export default function TabsPanel({ labels, paneles, inicial = 0, iconoSolo = [], extra, masUltima = false, perezoso = false, claves }: {
  labels: string[]; paneles: ReactNode[]; inicial?: number; iconoSolo?: number[];
  /** Un nombre corto por pestaña («bitacora», «casos»…) para poder abrirla
   *  desde el enlace: `…/entidad/equipamiento/xyz#bitacora`.
   *  Sin esto, un aviso de un comentario dejaba al lector en la pestaña de
   *  siempre, con lo que le habían escrito a dos clics — y si ya estaba en esa
   *  ficha, el aviso no hacía absolutamente nada al pulsarlo: misma URL,
   *  misma pestaña. */
  claves?: string[];
  /** Elemento(s) que NO son panel —típicamente un enlace externo, como la
   *  carpeta Drive— y se pintan en la fila de pestañas antes del «⋯ Más». */
  extra?: ReactNode;
  /** Manda la última pestaña (Historial) al menú «⋯ Más». */
  masUltima?: boolean;
  /** NO montar los paneles que nunca se han abierto.
   *
   *  Por defecto se montan los siete y se ocultan con `display:none`, y eso es
   *  deliberado: al volver a una pestaña sigue ahí el filtro que pusiste, el
   *  scroll donde lo dejaste y el comentario a medio escribir. Un panel que se
   *  desmonta al salir se lleva todo eso, y perder tres frases por tocar una
   *  pestaña es peor que cualquier milisegundo que se ahorre.
   *
   *  Pero en administración son siete secciones con sus tablas y editores, y
   *  todas arrancaban al abrir la portada. Con `perezoso` cada panel se monta
   *  la PRIMERA vez que se abre —y a partir de ahí se queda—: el coste de
   *  entrada desaparece y no se pierde nada al ir y volver. */
  perezoso?: boolean;
}) {
  const [i, setI] = useState(inicial);
  /* Qué pestañas se han abierto ya. Solo crece; con `perezoso` en falso vale
     cualquier cosa, porque no se consulta. */
  const [vistos, setVistos] = useState<Set<number>>(() => new Set([inicial]));
  const abrir = (k: number) => {
    setI(k);
    if (perezoso) setVistos(v => (v.has(k) ? v : new Set(v).add(k)));
  };
  /* El hash manda, al entrar Y al cambiar. Lo segundo importa tanto como lo
     primero: si ya estás en esta ficha, un enlace a la MISMA página con otro
     hash no remonta nada —React no se entera—, así que sin escuchar
     `hashchange` el aviso seguiría sin hacer nada. */
  useEffect(() => {
    if (!claves?.length) return;
    const aplica = () => {
      const bruto = decodeURIComponent(String(window.location.hash || "").replace(/^#/, ""));
      if (!bruto) return;
      /* El hash lleva DOS cosas: `#bitacora/c-<id>` = qué pestaña abrir y a qué
         elemento ir dentro de ella. Van juntas porque van juntas: un ancla a
         un comentario que vive en otra pestaña apunta a algo que el navegador
         encuentra —está montado— pero que nadie ve. */
      const [clave, ...resto] = bruto.split("/");
      const ancla = resto.join("/");
      const k = claves.findIndex(c => c && c.toLowerCase() === clave.toLowerCase());
      if (k < 0) return;
      abrir(k);
      /* Y se trae a la vista. Si el lector YA estaba en esta ficha —el caso de
         quien pulsa el aviso de algo que tiene abierto— cambiar de pestaña sin
         moverse no se ve: la página se queda donde estaba y el clic parece no
         haber hecho nada.
         El elemento manda sobre la pestaña cuando lo hay; y se busca en el
         fotograma siguiente porque con `perezoso` el panel se acaba de montar
         en este mismo render y todavía no está en el documento. */
      /* Si el destino es una sección PLEGADA, se le avisa para que se abra.
         Sin esto, el salto aterrizaba en una cabecera cerrada —«📝
         Precontratos ▸»— que se lee como «aquí no hay nada», que es lo
         contrario de para lo que sirve el enlace. El contrato ya existía
         (Plegable escucha `plg:abrir` con su ancla); faltaba usarlo también
         desde aquí y no solo desde el expediente. */
      if (ancla) window.dispatchEvent(new CustomEvent("plg:abrir", { detail: ancla }));
      requestAnimationFrame(() => {
        const el = ancla ? document.getElementById(ancla) : null;
        (el || raiz.current)?.scrollIntoView({ behavior: "smooth", block: el ? "center" : "start" });
        /* Un resalte que se apaga solo. Sin él, llegar al comentario correcto
           en un hilo de treinta iguales no se distingue de llegar a otro. */
        if (el) {
          el.classList.add("ancla-hit");
          window.setTimeout(() => el.classList.remove("ancla-hit"), 2600);
        }
      });
    };
    aplica();
    window.addEventListener("hashchange", aplica);
    return () => window.removeEventListener("hashchange", aplica);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claves?.join("|")]);

  const raiz = useRef<HTMLDivElement>(null);

  const [masOpen, setMasOpen] = useState(false);
  // Índices que viven en el menú «⋯ Más». Por ahora, solo la última (Historial).
  const enMas = masUltima && labels.length > 1 ? [labels.length - 1] : [];
  const activoEnMas = enMas.includes(i);

  const tabBtn = (k: number) => {
    const { nombre, n, nota } = parte(labels[k]);
    const hay = n != null && Number(n) > 0;
    const solo = iconoSolo.includes(k);
    // En modo ícono-solo se muestra solo el emoji inicial del nombre.
    const emoji = nombre.split(" ")[0];
    return (
      <button key={k} className={`vtab ${i === k ? "on" : ""}`}
        title={nota ? `${nombre} · ${nota}` : nombre} onClick={() => abrir(k)}>
        {solo ? emoji : nombre}
        {hay && <span className="vtab-n">{n}</span>}
        {!solo && nota && <span className="vtab-nota">{nota}</span>}
      </button>
    );
  };

  const actNom = parte(labels[i]);
  return (
    <div ref={raiz}>
      <div className="vtabs vtabs-nav" style={{ marginBottom: 14 }}>
        {labels.map((_, k) => (enMas.includes(k) ? null : tabBtn(k)))}
        {/* El extra (Drive) va después de las pestañas, antes del «⋯ Más». */}
        {extra}
        {enMas.length > 0 && (
          <div className="vtab-mas-wrap">
            <button className={`vtab vtab-mas ${activoEnMas ? "on" : ""}`}
              title="Más" aria-haspopup="menu" aria-expanded={masOpen}
              onClick={() => setMasOpen(o => !o)}>
              {/* Si hay una pestaña oculta activa, se ve su emoji + contador; si
                  no, los tres puntos VERTICALES (menú de más opciones). */}
              {activoEnMas ? actNom.nombre.split(" ")[0] : "⋮"}
              {activoEnMas && actNom.n && Number(actNom.n) > 0 && <span className="vtab-n">{actNom.n}</span>}
              <span className="vtab-mas-flecha">▾</span>
            </button>
            {masOpen && (
              <>
                {/* Fondo invisible: un clic afuera cierra el menú. */}
                <div className="vtab-mas-bg" onClick={() => setMasOpen(false)} />
                <div className="vtab-mas-menu" role="menu">
                  {enMas.map(k => {
                    const { nombre, n } = parte(labels[k]);
                    const hay = n != null && Number(n) > 0;
                    return (
                      <button key={k} role="menuitem" className={`vtab-mas-item ${i === k ? "on" : ""}`}
                        onClick={() => { abrir(k); setMasOpen(false); }}>
                        <span>{nombre}</span>
                        {hay && <span className="vtab-n">{n}</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {paneles.map((p, k) => (
        /* Se pinta el panel si está activo o si ya se abrió alguna vez. El
           `div` se queda siempre: quitarlo cambiaría las claves de React y
           remontaría los vecinos. */
        <div key={k} style={{ display: i === k ? "block" : "none" }}>
          {perezoso && !vistos.has(k) ? null : p}
        </div>
      ))}
    </div>
  );
}
