/* Íconos de la wiki, dibujados aquí para no sumar una dependencia. Trazos
   sencillos a 24×24, stroke 2, como los que usa el prototipo. El de cada área
   se elige por nombre (`wiki_areas.icono`), así que un área nueva escoge uno
   de esta lista sin tocar código: layers · clapperboard · gamepad · film ·
   palette · tv · camera · book · mic · pen. Sin `"use client"`: son SVG puros
   y sirven en servidor y cliente. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 18, rest: P = {}) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...rest,
});

export const Layers = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="m2 13 10 5 10-5" /><path d="m2 18 10 5 10-5" /></svg>
);
export const Clapperboard = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" /><path d="m3.5 11 1.3-5.2 15.5 1.7-.6 3.5" /><path d="m8.5 6.3 2.4 4.2M13 6.8l2.4 4.2" /></svg>
);
export const Gamepad = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M6 12h4M8 10v4M15 13h.01M18 11h.01" /><path d="M17.3 5H6.7a4 4 0 0 0-4 3.5l-.9 7A3 3 0 0 0 4.8 19c1 0 1.9-.5 2.5-1.3L9 15h6l1.7 2.7a3 3 0 0 0 5.4-2.2l-.9-7a4 4 0 0 0-3.9-3.5Z" /></svg>
);
export const Film = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4" /></svg>
);
export const Palette = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.4-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6h1.8A4.8 4.8 0 0 0 21 10.7C21 6.5 17 3 12 3Z" /><circle cx="7.5" cy="11.5" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="7.5" r="1" /></svg>
);
export const Tv = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><rect x="2" y="7" width="20" height="13" rx="2" /><path d="m17 2-5 5-5-5" /></svg>
);
export const Camera = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const Book = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></svg>
);
export const Mic = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></svg>
);
export const Pen = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" /></svg>
);

export const Search = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const Menu = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
);
export const X = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const ArrowLeft = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
);
export const ChevronRight = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="m9 18 6-6-6-6" /></svg>
);
export const Check = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M20 6 9 17l-5-5" /></svg>
);
export const Sun = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const Moon = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
);
export const Play = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="m6 4 14 8-14 8V4Z" /></svg>
);
export const Plus = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M12 5v14M5 12h14" /></svg>
);

const POR_NOMBRE: Record<string, (p: P) => JSX.Element> = {
  layers: Layers, clapperboard: Clapperboard, gamepad: Gamepad, film: Film, palette: Palette,
  tv: Tv, camera: Camera, book: Book, mic: Mic, pen: Pen,
};

/** El ícono de un área por su nombre en la tabla. Desconocido → capas. */
export function IconoArea({ nombre, size = 18, ...r }: P & { nombre: string | null | undefined }) {
  const C = POR_NOMBRE[(nombre || "").toLowerCase()] || Layers;
  return <C size={size} {...r} />;
}

export const NOMBRES_ICONO = Object.keys(POR_NOMBRE);
