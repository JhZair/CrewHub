"use client";
import { useEffect, useState } from "react";
import Portal from "@/components/Portal";

/* ══════════════════════════════════════════════════════════════════════════
   🖼 EL VISOR — UNA FOTO, O VARIAS

   Existía uno dentro de `components/Foto`, y solo sabía abrir UNA: sin
   flechas, sin contador, sin miniaturas. Con una galería de doce eso obliga a
   cerrar y volver a abrir doce veces, mirando cada vez la lista de detrás
   para acordarse de por dónde ibas.

   Está aquí y no dentro de la galería para que no haya DOS lightbox distintos
   en la aplicación: `Foto` lo usa con una lista de una, y en ese caso no se
   pinta ni la flecha ni el contador ni la tira. Los ocho sitios que ya usan
   `Foto` no cambian ni de API ni de aspecto.

   ── ESCAPE CIERRA ESTO, NO LO DE DETRÁS ──
   Una foto se abre a menudo DENTRO de otra cosa que también escucha Escape: la
   vista rápida de un caso, el hilo de un comentario. Sin cortar aquí, un solo
   Esc cerraba las dos capas — y el modal, al cerrarse, se lleva el comentario
   a medio escribir. Se escucha en CAPTURA y se corta ahí mismo.

   ⚠ Las flechas se leen también en captura y por lo mismo: un carrusel de
   detrás, o la lista que hay debajo, no puede moverse mientras se pasan fotos.
   ══════════════════════════════════════════════════════════════════════════ */

export type FotoVista = { url: string; pie?: string | null };

export default function VisorFotos({ fotos, desde = 0, alCerrar, alCambiar, barra }: {
  fotos: FotoVista[];
  /** Por cuál se abre. Si se va de rango se abre por la primera. */
  desde?: number;
  alCerrar: () => void;
  /** Por cuál se está mirando ahora. Sin esto, quien pone el visor no puede
   *  saberlo: el índice vive AQUÍ, y una barra de edición de fuera actuaría
   *  siempre sobre la foto por la que se abrió — abres por la 1, pasas a la 6,
   *  y el pie que escribes se le pone a la 1. */
  alCambiar?: (i: number) => void;
  /** Lo que se puede HACER con la foto que se está mirando. Va dentro del
   *  visor porque tiene que ir dentro: el visor es una capa a pantalla
   *  completa con velo, y cualquier cosa pintada fuera queda debajo —
   *  invisible, sin clics, y encima pulsarla cierra el visor. */
  barra?: React.ReactNode;
}) {
  const n = fotos.length;
  const [i, setI] = useState(() => (desde >= 0 && desde < n ? desde : 0));
  /* Si la lista ENCOGE con el visor abierto —se quita una foto—, `i` puede
     quedar fuera de rango y `fotos[i]` reventar. Se acota al leer y no con un
     efecto: un efecto corrige DESPUÉS de pintar, o sea después de haber
     reventado. */
  const idx = Math.min(i, n - 1);
  useEffect(() => { alCambiar?.(idx); }, [idx, alCambiar]);

  useEffect(() => {
    /* Ni scroll de fondo ni sorpresas al cerrar: se guarda lo que hubiera y se
       repone. Poner `""` a secas pisaría un `overflow` puesto por otra capa
       —un modal— que todavía sigue abierta debajo. */
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previo; };
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); alCerrar(); return; }
      if (n < 2) return;
      if (e.key === "ArrowRight") { e.stopImmediatePropagation(); setI(v => (Math.min(v, n - 1) + 1) % n); }
      if (e.key === "ArrowLeft") { e.stopImmediatePropagation(); setI(v => (Math.min(v, n - 1) - 1 + n) % n); }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [n, alCerrar]);

  if (!n) return null;
  const act = fotos[idx];
  const paso = (d: number) => setI(v => (Math.min(v, n - 1) + d + n) % n);

  return (
    <Portal>
      <div className="vis-fondo" onClick={alCerrar}>
        {/* La imagen y su pie, juntos y centrados. El clic en la imagen NO
            cierra: en una galería el gesto de «siguiente» es tocar el lado, y
            cerrar por error a media revisión es lo que hace que se deje de
            usar. Se cierra por el fondo, por la ✕ o con Escape. */}
        <div className="vis-centro" onClick={e => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={act.url} alt={act.pie || ""} className="vis-img" />
          {act.pie && <div className="vis-pie">{act.pie}</div>}
        </div>

        {n > 1 && (
          <>
            <button type="button" className="vis-flecha izq" title="Anterior (←)"
              onClick={e => { e.stopPropagation(); paso(-1); }}>‹</button>
            <button type="button" className="vis-flecha der" title="Siguiente (→)"
              onClick={e => { e.stopPropagation(); paso(1); }}>›</button>
            {/* Dónde estás. Sin esto, con doce fotos parecidas se pierde la
                cuenta y se vuelve a mirar la misma tres veces. */}
            <div className="vis-cuenta">{idx + 1} / {n}</div>
            {/* La tira: para SALTAR, no para pasar. Con doce fotos, llegar a la
                novena a base de flecha son ocho pasos. */}
            <div className="vis-tira" onClick={e => e.stopPropagation()}>
              {fotos.map((f, k) => (
                <button key={f.url + k} type="button"
                  className={`vis-mini${k === idx ? " on" : ""}`}
                  title={f.pie || `Foto ${k + 1}`}
                  onClick={() => setI(k)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {/* `lazy`: son las MISMAS urls de 1600px que la foto grande.
                      Sin esto, abrir una foto de un equipo con treinta dispara
                      la descarga de las treinta a tamaño completo. */}
                  <img src={f.url} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* La barra de acciones, DENTRO del velo y por encima de la tira. Con
            `stopPropagation` o pulsar cualquier botón cerraría el visor: el
            fondo cierra al clic, y esto está encima del fondo. */}
        {barra && (
          <div className={`vis-barra${n > 1 ? " con-tira" : ""}`} onClick={e => e.stopPropagation()}>
            {barra}
          </div>
        )}

        <button type="button" className="vis-x" title="Cerrar (Esc)"
          onClick={e => { e.stopPropagation(); alCerrar(); }}>✕</button>
      </div>
    </Portal>
  );
}
