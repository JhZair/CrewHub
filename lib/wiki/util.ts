/* Funciones puras que usan servidor y cliente. Sin "use client" a propósito:
   ver la nota de lib/texto.ts sobre funciones que cruzan la frontera. */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09-10" → "10 sep 2026". Acepta también timestamps ISO. */
export function fechaCorta(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, dd] = d.slice(0, 10).split("-");
  if (!y || !m || !dd) return d;
  return `${+dd} ${MESES[+m - 1]} ${y}`;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Sin tildes, minúsculas, espacios colapsados. Para comparar títulos. */
export function normalizar(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** "Entrevista caminada" → "entrevista-caminada" (regla del slug, guía 3.1). */
export function slugificar(s: string): string {
  return normalizar(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Id de ancla para un encabezado del Markdown ("¿Qué es?" → "que-es"). */
export function anclaDe(texto: string): string {
  return slugificar(texto) || "seccion";
}

/** Lista de [[enlaces]] de un Markdown: { area, clave } con `area` null si es
 *  de la misma área. `[[Común/Micrófono lavalier]]`, `[[Título|texto]]`. */
export function extraerEnlaces(md: string): { area: string | null; clave: string }[] {
  const out: { area: string | null; clave: string }[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const dentro = m[1].trim();
    const i = dentro.indexOf("/");
    if (i > 0) out.push({ area: dentro.slice(0, i).trim(), clave: dentro.slice(i + 1).trim() });
    else out.push({ area: null, clave: dentro });
  }
  return out;
}
