/* ══════════════════════════════════════════════════════════════════════════
   📖 MARKDOWN DE LA WIKI → REACT

   Renderizador propio, sin dependencias. No es un Markdown completo: es el
   subconjunto que la guía (sección 8) pide para las páginas, más lo que la
   wiki necesita señalar y que un renderizador genérico no sabe:

     [[Título]] · [[Área/Título]]      → enlace a /wiki/area/slug (o «por crear»)
     [n]                                → referencia que salta a la fuente n
     (Pendiente de verificación)        → la afirmación queda resaltada
     URL de YouTube sola en su línea    → video incrustado
     ```mermaid                          → diagrama (se dibuja en el cliente)
     - [ ] / - [x]                       → checklist marcable
     ![alt](url "Autor / fuente")        → imagen con crédito
     tablas, listas, citas, código, negrita, cursiva, enlaces

   Además CUENTA las afirmaciones: cada [n] y cada (Pendiente de verificación)
   es una, y con eso la página muestra «k de n afirmaciones tienen fuente».

   Se ejecuta en el SERVIDOR (es un componente de servidor: sin hooks). Las
   piezas interactivas —saltos, checklist, Mermaid— son componentes de cliente
   pequeños que se importan desde components/wiki.
   ══════════════════════════════════════════════════════════════════════════ */
import type { ReactNode } from "react";
import Enlace from "@/components/Enlace";
import Salto from "@/components/wiki/Salto";
import Checklist from "@/components/wiki/Checklist";
import Mermaid from "@/components/wiki/Mermaid";
import { anclaDe, normalizar, slugificar } from "./util";
import { APARTADOS_DEL_MODULO } from "./tipos";

export type PaginaEnlazable = { area_id: string; slug: string; titulo: string };
export type AreaEnlazable = { id: string; nombre: string };

export type ContextoRender = {
  areaId: string;
  areas: AreaEnlazable[];
  paginas: PaginaEnlazable[];
};

export type Afirmacion = { id: string; ref: number | null };
export type EntradaToc = { id: string; label: string };

export type Renderizado = {
  cuerpo: ReactNode;
  toc: EntradaToc[];
  afirmaciones: Afirmacion[];
  fuentes: number;
};

/* ── Bloques ──────────────────────────────────────────────────────────── */

type Bloque =
  | { t: "h"; nivel: number; texto: string }
  | { t: "p"; texto: string }
  | { t: "code"; lang: string; texto: string }
  | { t: "quote"; texto: string }
  | { t: "hr" }
  | { t: "table"; filas: string[][]; cabecera: string[] }
  | { t: "list"; ordenada: boolean; items: ItemLista[] }
  | { t: "yt"; id: string }
  | { t: "img"; alt: string; url: string; credito: string };

type ItemLista = { texto: string; check: boolean | null; hijos: ItemLista[] };

const RE_YT = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/;

function parsearBloques(md: string): Bloque[] {
  const L = md.replace(/\r\n?/g, "\n").split("\n");
  const out: Bloque[] = [];
  let i = 0;
  const esItem = (l: string) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(l);

  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }

    // Código
    const cerca = l.match(/^\s*```\s*(\w*)/);
    if (cerca) {
      const lang = (cerca[1] || "").toLowerCase();
      const buf: string[] = []; i++;
      while (i < L.length && !/^\s*```/.test(L[i])) buf.push(L[i++]);
      i++;
      out.push({ t: "code", lang, texto: buf.join("\n") });
      continue;
    }
    // Encabezado
    const h = l.match(/^\s*(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (h) { out.push({ t: "h", nivel: h[1].length, texto: h[2] }); i++; continue; }
    // Regla
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push({ t: "hr" }); i++; continue; }
    // YouTube solo en su línea
    const yt = l.trim().match(RE_YT);
    if (yt && !/\s/.test(l.trim())) { out.push({ t: "yt", id: yt[1] }); i++; continue; }
    // Imagen sola en su línea
    const img = l.trim().match(/^!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)$/);
    if (img) { out.push({ t: "img", alt: img[1], url: img[2], credito: img[3] || "" }); i++; continue; }
    // Tabla
    if (/^\s*\|/.test(l) && i + 1 < L.length && /^\s*\|?\s*:?-{2,}/.test(L[i + 1])) {
      const celdas = (s: string) => s.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const cabecera = celdas(l); i += 2;
      const filas: string[][] = [];
      while (i < L.length && /^\s*\|/.test(L[i])) filas.push(celdas(L[i++]));
      out.push({ t: "table", cabecera, filas });
      continue;
    }
    // Cita
    if (/^\s*>/.test(l)) {
      const buf: string[] = [];
      while (i < L.length && /^\s*>/.test(L[i])) buf.push(L[i++].replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", texto: buf.join("\n") });
      continue;
    }
    // Lista (dos niveles por sangría)
    if (esItem(l)) {
      const ordenada = /^\s*\d+[.)]/.test(l);
      const items: ItemLista[] = [];
      while (i < L.length && (esItem(L[i]) || (/^\s{2,}\S/.test(L[i]) && items.length))) {
        const cur = L[i];
        if (!esItem(cur)) { // continuación del último ítem
          const ult = items[items.length - 1];
          const dest = ult.hijos.length ? ult.hijos[ult.hijos.length - 1] : ult;
          dest.texto += " " + cur.trim(); i++; continue;
        }
        const sangria = cur.match(/^(\s*)/)![1].length;
        let texto = cur.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
        let check: boolean | null = null;
        const ck = texto.match(/^\[([ xX])\]\s+(.*)$/);
        if (ck) { check = ck[1] !== " "; texto = ck[2]; }
        const item: ItemLista = { texto, check, hijos: [] };
        if (sangria >= 2 && items.length) items[items.length - 1].hijos.push(item);
        else items.push(item);
        i++;
      }
      out.push({ t: "list", ordenada, items });
      continue;
    }
    // Párrafo: hasta línea vacía o inicio de otro bloque
    const buf: string[] = [];
    while (i < L.length && L[i].trim() && !/^\s*(?:#{1,4}\s|```|>|\|)/.test(L[i]) && !esItem(L[i])
      && !(L[i].trim().match(RE_YT) && !/\s/.test(L[i].trim()))) {
      buf.push(L[i].trim()); i++;
    }
    if (buf.length) out.push({ t: "p", texto: buf.join(" ") });
    else i++;
  }
  return out;
}

/* ── Inline ───────────────────────────────────────────────────────────── */

const RE_PENDIENTE = /\(\s*pendiente de verificaci[oó]n\s*\)/i;

class Render {
  ctx: ContextoRender;
  afirmaciones: Afirmacion[] = [];
  toc: EntradaToc[] = [];
  fuentes = 0;
  enFuentes = false;
  k = 0;
  constructor(ctx: ContextoRender) { this.ctx = ctx; }

  key() { return `k${this.k++}`; }

  /* Resuelve [[...]] a una página real, o null. */
  resolver(clave: string): { href: string; label: string; area: AreaEnlazable | null } | null {
    let areaId = this.ctx.areaId;
    let area: AreaEnlazable | null = null;
    let titulo = clave;
    const i = clave.indexOf("/");
    if (i > 0) {
      const nombre = normalizar(clave.slice(0, i));
      area = this.ctx.areas.find(a => normalizar(a.nombre) === nombre || a.id === slugificar(nombre)) || null;
      if (area) areaId = area.id;
      titulo = clave.slice(i + 1).trim();
    }
    const n = normalizar(titulo), s = slugificar(titulo);
    const p = this.ctx.paginas.find(x => x.area_id === areaId && (normalizar(x.titulo) === n || x.slug === s));
    if (!p) return null;
    const otra = areaId !== this.ctx.areaId ? (this.ctx.areas.find(a => a.id === areaId) || null) : null;
    return { href: `/wiki/${p.area_id}/${p.slug}`, label: p.titulo, area: otra };
  }

  /* Texto plano con formato en línea. NO maneja [n] ni pendientes: eso lo
     hace `parrafo`, que primero parte el texto en afirmaciones. */
  inline(texto: string): ReactNode[] {
    const out: ReactNode[] = [];
    const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\b_[^_\n]+_\b)|(\[\[[^\]]+\]\])|(\[([^\]]+)\]\((\S+?)(?:\s+"[^"]*")?\))|(<?(https?:\/\/[^\s<>)]+)>?)/g;
    let ult = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      if (m.index > ult) out.push(texto.slice(ult, m.index));
      ult = m.index + m[0].length;
      if (m[1]) out.push(<code key={this.key()}>{m[1].slice(1, -1)}</code>);
      else if (m[2]) out.push(<strong key={this.key()}>{this.inline(m[2].slice(2, -2))}</strong>);
      else if (m[3]) out.push(<em key={this.key()}>{this.inline(m[3].slice(1, -1))}</em>);
      else if (m[4]) out.push(<em key={this.key()}>{this.inline(m[4].slice(1, -1))}</em>);
      else if (m[5]) out.push(this.wikilink(m[5].slice(2, -2)));
      else if (m[6]) out.push(<a key={this.key()} className="wk-link" href={m[8]} target="_blank" rel="noopener noreferrer">{this.inline(m[7])}</a>);
      else if (m[9]) out.push(<a key={this.key()} className="wk-link" href={m[10]} target="_blank" rel="noopener noreferrer">{m[10]}</a>);
    }
    if (ult < texto.length) out.push(texto.slice(ult));
    return out;
  }

  wikilink(dentro: string): ReactNode {
    const [clave, alias] = dentro.split("|").map(s => s.trim());
    const r = this.resolver(clave);
    const label = alias || (clave.includes("/") ? clave.slice(clave.indexOf("/") + 1) : clave);
    if (!r) return <span key={this.key()} className="wk-link is-missing" title="Página por crear">{label} (por crear)</span>;
    return (
      <Enlace key={this.key()} className="wk-link" href={r.href}>
        {r.area && !alias ? `${r.area.nombre}: ` : ""}{alias || r.label}
      </Enlace>
    );
  }

  /* Un párrafo o ítem: se parte en afirmaciones. Una afirmación termina en
     [n] o en (Pendiente de verificación) y empieza donde acabó la anterior o
     en el último final de oración. */
  parrafo(texto: string): ReactNode[] {
    const out: ReactNode[] = [];
    const re = /\[(\d{1,3})\](?!\()|\(\s*pendiente de verificaci[oó]n\s*\)/gi;
    let ult = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      const antes = texto.slice(ult, m.index);
      // Último final de oración dentro de `antes` (". ", "? ", "! ", ": ")
      let corte = 0;
      const fin = antes.match(/[.!?;:]\s+(?=[^\s])/g);
      if (fin) { let idx = 0; for (const f of fin) { idx = antes.indexOf(f, idx) + f.length; } corte = idx; }
      if (corte > 0) out.push(...this.inline(antes.slice(0, corte)));
      const cuerpo = antes.slice(corte);
      const ref = m[1] ? parseInt(m[1], 10) : null;
      const id = `c${this.afirmaciones.length + 1}`;
      this.afirmaciones.push({ id, ref });
      if (ref) {
        out.push(
          <span key={this.key()} id={`claim-${id}`} className="wk-claim">
            {this.inline(cuerpo)}
            <Salto a={`fuente-${ref}`} className="wk-ref" aria-label={`Ver fuente ${ref}`}>[{ref}]</Salto>
          </span>,
        );
      } else {
        out.push(
          <span key={this.key()} id={`claim-${id}`} className="wk-claim wk-pending" title="Pendiente de verificación: todavía no tiene fuente consultada">
            {this.inline(cuerpo.replace(/\s+$/, ""))}
          </span>,
          <span key={this.key()} className="wk-pending-tag">por verificar</span>,
        );
      }
      ult = m.index + m[0].length;
    }
    if (ult < texto.length) out.push(...this.inline(texto.slice(ult)));
    return out;
  }

  lista(b: Extract<Bloque, { t: "list" }>): ReactNode {
    const esCheck = b.items.every(x => x.check !== null);
    if (esCheck) {
      /* Componente de cliente: recibe los nodos YA renderizados (un ReactNode
         viaja del servidor al cliente; una función no). */
      return <Checklist key={this.key()} items={b.items.map(x => ({ hecho: !!x.check, nodo: <>{this.parrafo(x.texto)}</> }))} />;
    }
    const Tag = b.ordenada ? "ol" : "ul";
    const primerFuente = this.enFuentes && b.ordenada;
    return (
      <Tag key={this.key()} className={primerFuente ? "wk-sources" : undefined}>
        {b.items.map((it) => {
          const n = primerFuente ? ++this.fuentes : 0;
          return (
            <li key={this.key()} id={primerFuente ? `fuente-${n}` : undefined}>
              {primerFuente && <span className="wk-src-n">[{n}]</span>}
              {primerFuente ? <div>{this.parrafo(it.texto)}</div> : this.parrafo(it.texto)}
              {it.hijos.length > 0 && (
                <ul>{it.hijos.map(h => <li key={this.key()}>{this.parrafo(h.texto)}</li>)}</ul>
              )}
            </li>
          );
        })}
      </Tag>
    );
  }

  bloque(b: Bloque): ReactNode {
    switch (b.t) {
      case "h": {
        const id = anclaDe(b.texto);
        if (b.nivel <= 2) {
          this.toc.push({ id, label: b.texto });
          this.enFuentes = /^fuentes?\b/i.test(normalizar(b.texto));
        }
        /* «#» y «##» son apartados (h2): el h1 es el título de la página. */
        const Tag = (`h${Math.min(Math.max(b.nivel, 2), 4)}`) as "h2" | "h3" | "h4";
        return <Tag key={this.key()} id={id}>{this.inline(b.texto)}</Tag>;
      }
      case "p": return <p key={this.key()}>{this.parrafo(b.texto)}</p>;
      case "quote": return <blockquote key={this.key()}>{this.parrafo(b.texto)}</blockquote>;
      case "hr": return <hr key={this.key()} />;
      case "code":
        if (b.lang === "mermaid") return <Mermaid key={this.key()} codigo={b.texto} />;
        return <pre key={this.key()}><code>{b.texto}</code></pre>;
      case "yt":
        return (
          <div key={this.key()} className="wk-yt">
            <iframe src={`https://www.youtube-nocookie.com/embed/${b.id}`} title="Video de YouTube"
              loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        );
      case "img":
        return (
          <figure key={this.key()} className="wk-fig">
            <img src={b.url} alt={b.alt} loading="lazy" />
            {(b.credito || b.alt) && <figcaption>{b.alt}{b.credito ? ` — ${b.credito}` : ""}</figcaption>}
          </figure>
        );
      case "table":
        return (
          <div key={this.key()} className="wk-table-wrap">
            <table>
              <thead><tr>{b.cabecera.map((c, i) => <th key={i}>{this.inline(c)}</th>)}</tr></thead>
              <tbody>
                {b.filas.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j}>{this.parrafo(c)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        );
      case "list": return this.lista(b);
    }
  }
}

/** Renderiza el Markdown de una página. Omite los apartados que el módulo
 *  pinta desde las tablas (anotaciones, historial). */
export function renderizarMarkdown(md: string, ctx: ContextoRender): Renderizado {
  const r = new Render(ctx);
  const bloques = parsearBloques(md || "");
  const nodos: ReactNode[] = [];
  let omitiendo = false;
  for (const b of bloques) {
    if (b.t === "h" && b.nivel <= 2) {
      omitiendo = APARTADOS_DEL_MODULO.includes(normalizar(b.texto));
    }
    if (omitiendo) continue;
    nodos.push(r.bloque(b));
  }
  return { cuerpo: <>{nodos}</>, toc: r.toc, afirmaciones: r.afirmaciones, fuentes: r.fuentes };
}

/** Un resumen de texto plano (para listados y meta): primer párrafo. */
export function primerParrafo(md: string, max = 180): string {
  const b = parsearBloques(md || "").find(x => x.t === "p") as Extract<Bloque, { t: "p" }> | undefined;
  if (!b) return "";
  const t = b.texto.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, a, al) => al || a.replace(/^[^/]+\//, ""))
    .replace(/\[(\d{1,3})\](?!\()/g, "").replace(RE_PENDIENTE, "").replace(/[*_`]/g, "").replace(/\s+([.,;:!?])/g, "$1").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
