"use client";
import { useEffect, useState } from "react";
import { previewCandidates, formatoDe, enlaceLimpio } from "@/lib/drive";
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

const URL_RE = /\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/gi;

const sinCola = (u: string) => {
  const m = u.match(/[)\].,;:!?]+$/);
  return m ? u.slice(0, -m[0].length) : u;
};

const hostDe = (u: string) => {
  try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, ""); }
  catch { return u; }
};

type Meta = { title?: string; description?: string; image?: string; site?: string };

function Tarjeta({ url }: { url: string }) {
  const href = enlaceLimpio(url.startsWith("http") ? url : `https://${url}`);
  const cand = previewCandidates(url, 320);
  const [i, setI] = useState(0);
  const [meta, setMeta] = useState<Meta | null>(null);
  const fmt = formatoDe(url);
  const host = hostDe(url);
  const esVideo = fmt?.key === "video";

  useEffect(() => {
    let vivo = true;
    unfurlEnlace(url).then(m => { if (vivo && m && (m.title || m.image)) setMeta(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [url]);

  // Imagen: la real de las OG manda; si no, la tentativa por patrón.
  const imgPatron = i < cand.length ? cand[i] : null;
  const [ogFalla, setOgFalla] = useState(false);
  const thumb = meta?.image && !ogFalla ? meta.image : imgPatron;

  const titulo = meta?.title || fmt?.lbl || "Enlace";
  const sitio = meta?.site || host;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="lp-card" onClick={e => e.stopPropagation()}>
      {thumb ? (
        <div className="lp-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer"
            onError={() => { if (meta?.image && !ogFalla) setOgFalla(true); else setI(v => v + 1); }} />
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

export default function LinkPreviews({ texto, max = 3 }: { texto?: string | null; max?: number }) {
  const urls = [...new Set((texto || "").match(URL_RE)?.map(sinCola) || [])].slice(0, max);
  if (!urls.length) return null;
  return <div className="lp-wrap">{urls.map((u, i) => <Tarjeta key={i} url={u} />)}</div>;
}
