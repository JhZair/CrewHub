"use client";
import { useState } from "react";
import { previewCandidates, formatoDe, enlaceLimpio } from "@/lib/drive";

/* PREVIEW DE ENLACES en un texto (comentarios, bitácora…). Detecta las URLs del
 * cuerpo y pinta una tarjeta con la CARA del enlace: miniatura de YouTube o de
 * Google Docs/Drive (mismo motor que el repositorio, con fallback entre
 * candidatos), y para un enlace web cualquiera, su favicon + dominio. Así un
 * link deja de ser una línea azul y se reconoce de un vistazo.
 *
 * No hace fetch al servidor: todo sale del patrón de la URL, así que es
 * instantáneo y no depende de desbloquear un unfurler. */

const URL_RE = /\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/gi;

const sinCola = (u: string) => {
  const m = u.match(/[)\].,;:!?]+$/);
  return m ? u.slice(0, -m[0].length) : u;
};

const hostDe = (u: string) => {
  try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, ""); }
  catch { return u; }
};

function Tarjeta({ url }: { url: string }) {
  const href = enlaceLimpio(url.startsWith("http") ? url : `https://${url}`);
  const cand = previewCandidates(url, 320);
  const [i, setI] = useState(0);
  const fmt = formatoDe(url);
  const host = hostDe(url);
  const thumb = i < cand.length ? cand[i] : null;
  const esVideo = fmt?.key === "video";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="lp-card" onClick={e => e.stopPropagation()}>
      {thumb ? (
        <div className="lp-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setI(v => v + 1)} />
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
        <span className="lp-lbl">{fmt?.ico} {fmt?.lbl || "Enlace"}</span>
        <span className="lp-host">{host}</span>
      </div>
    </a>
  );
}

export default function LinkPreviews({ texto, max = 3 }: { texto?: string | null; max?: number }) {
  const urls = [...new Set((texto || "").match(URL_RE)?.map(sinCola) || [])].slice(0, max);
  if (!urls.length) return null;
  return <div className="lp-wrap">{urls.map((u, i) => <Tarjeta key={i} url={u} />)}</div>;
}
