"use client";
import { useEffect, useState } from "react";
import { previewCandidates, formatoDe, enlaceLimpio, urlsDe } from "@/lib/drive";
import { unfurlEnlace } from "@/app/actions";

/* PREVIEW DE ENLACES en un texto (comentarios, bitácora, muro…). Detecta las
 * URLs del cuerpo y pinta una tarjeta con la CARA del enlace.
 *
 * Dos fuentes, en cascada:
 *  1) Al instante, sin red: por el PATRÓN de la URL (previewCandidates/formatoDe)
 *     salen una miniatura tentativa (YouTube/Drive) y el tipo. Se ve de inmediato.
 *  2) Al montar, `unfurlEnlace` lee del SERVIDOR las etiquetas Open Graph reales
 *     (título, descripción e imagen). Cuando responde, la tarjeta se enriquece:
 *     carátula de verdad + título + descripción. Así el video muestra su nombre y
 *     su imagen real, no el gris que YouTube devuelve al adivinar por el ID. */

const hostDe = (u: string) => {
  try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, ""); }
  catch { return u; }
};

type Meta = { title?: string; description?: string; image?: string; site?: string };

function Tarjeta({ url, sinRed }: { url: string; sinRed?: boolean }) {
  const href = enlaceLimpio(url.startsWith("http") ? url : `https://${url}`);
  const cand = previewCandidates(url, 320);
  const [i, setI] = useState(0);
  const [meta, setMeta] = useState<Meta | null>(null);
  const fmt = formatoDe(url);
  const host = hostDe(url);
  const esVideo = fmt?.key === "video";

  /* ── `sinRed`: la cara instantánea, sin ir a buscar las OG ──
     El unfurl es una acción de servidor POR TARJETA, y Next las encola de una
     en una. En una ficha con dos enlaces da igual; en la portada, con nueve
     notas, serían nueve viajes encolados en la pantalla que más se abre — que
     es exactamente lo que costó el «cada vez más lento» de hace dos semanas.
     Sin red se pierde el título real y la descripción, pero la miniatura de
     YouTube, el icono del PDF y el host salen del PATRÓN de la url, que es lo
     que hace falta para saber qué hay al otro lado. */
  useEffect(() => {
    if (sinRed) return;
    let vivo = true;
    unfurlEnlace(url).then(m => { if (vivo && m && (m.title || m.image)) setMeta(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [url, sinRed]);

  // Imagen: la real de las OG manda; si no, la tentativa por patrón.
  const imgPatron = i < cand.length ? cand[i] : null;
  const [ogFalla, setOgFalla] = useState(false);
  const usandoOg = !!meta?.image && !ogFalla;
  const thumb = usandoOg ? meta!.image! : imgPatron;

  /* Si la imagen no sirve (404, o el placeholder gris de 120×90 que YouTube
     devuelve con estado 200 para maxresdefault cuando el video no tiene esa
     versión), pasamos a la siguiente: primero soltamos la de OG, luego los
     candidatos por patrón. */
  const fallar = () => { if (usandoOg) setOgFalla(true); else setI(v => v + 1); };
  const alCargar = (e: any) => { const im = e.currentTarget; if (im.naturalWidth && im.naturalWidth <= 121) fallar(); };

  const titulo = meta?.title || fmt?.lbl || "Enlace";
  const sitio = meta?.site || host;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="lp-card" onClick={e => e.stopPropagation()}>
      {thumb ? (
        <div className="lp-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer"
            onError={fallar} onLoad={alCargar} />
          {esVideo && <span className="lp-play">▶</span>}
        </div>
      ) : (
        <div className="lp-ico">
          {fmt?.key === "web"
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt="" referrerPolicy="no-referrer" />
            : (fmt?.ico || "🔗")}
        </div>
      )}
      <div className="lp-body">
        <span className="lp-lbl">{fmt?.ico} {titulo}</span>
        {meta?.description && <span className="lp-desc">{meta.description}</span>}
        <span className="lp-host">{sitio}</span>
      </div>
    </a>
  );
}

export default function LinkPreviews({ texto, max = 3, sinRed }: {
  texto?: string | null; max?: number;
  /** Sin ir a buscar las etiquetas Open Graph: solo lo que se deduce de la
   *  url. Para listas largas — ver el comentario de `Tarjeta`. */
  sinRed?: boolean;
}) {
  const urls = urlsDe(texto).slice(0, max);
  if (!urls.length) return null;
  return <div className="lp-wrap">{urls.map((u, i) => <Tarjeta key={i} url={u} sinRed={sinRed} />)}</div>;
}
