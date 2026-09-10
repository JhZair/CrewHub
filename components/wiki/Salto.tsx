"use client";
import type { ReactNode } from "react";

/* Un botón que salta a un elemento de la misma página (una afirmación, una
   fuente, un apartado) y lo ilumina un instante. Respeta
   `prefers-reduced-motion`. */
export function saltarA(id: string, block: ScrollLogicalPosition = "center") {
  const el = document.getElementById(id);
  if (!el) return;
  const reducido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reducido ? "auto" : "smooth", block });
  el.classList.add("wk-flash");
  window.setTimeout(() => el.classList.remove("wk-flash"), 1600);
}

export default function Salto({ a, children, className, block, ...rest }:
  { a: string; children: ReactNode; className?: string; block?: ScrollLogicalPosition; "aria-label"?: string; title?: string }) {
  return (
    <button type="button" className={className} onClick={() => saltarA(a, block)} {...rest}>
      {children}
    </button>
  );
}
