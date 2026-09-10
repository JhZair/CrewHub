"use client";
import { useEffect, useId, useRef, useState } from "react";

/* Diagramas ```mermaid. La librería pesa, así que se carga SOLO cuando una
   página tiene un diagrama, y en el navegador. Si falla, se muestra el código
   para que al menos se pueda leer. El tema sigue al de la wiki (.is-dark). */
export default function Mermaid({ codigo }: { codigo: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const oscuro = !!ref.current?.closest(".wk.is-dark");
        mermaid.initialize({ startOnLoad: false, theme: oscuro ? "dark" : "neutral", securityLevel: "strict", fontFamily: "IBM Plex Sans, sans-serif" });
        const r = await mermaid.render(`wk-mermaid-${id}`, codigo);
        if (vivo) setSvg(r.svg);
      } catch {
        if (vivo) setError(true);
      }
    })();
    return () => { vivo = false; };
  }, [codigo, id]);

  if (error) return <pre className="wk-mermaid-error"><code>{codigo}</code></pre>;
  return (
    <figure className="wk-fig wk-mermaid" ref={ref}>
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="wk-muted" style={{ fontSize: 13 }}>Dibujando diagrama…</div>}
    </figure>
  );
}
