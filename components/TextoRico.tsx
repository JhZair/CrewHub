"use client";
import React from "react";

/* TEXTO CON FORMATO MÍNIMO.

   Se guarda como TEXTO PLANO con marcas —**negrita**, _cursiva_, `código`,
   líneas «- » de lista, «> » de cita— y se pinta aquí. No se guarda HTML: el
   texto sigue siendo buscable, copiable y no puede inyectar nada. Es el mismo
   trato que Slack o WhatsApp le dan a un mensaje.

   Deliberadamente CORTO. Un comentario no es un documento; las opciones son
   las que de verdad se usan para resaltar una idea o listar tres cosas. El
   editor del expediente NO usa esto: ese texto se copia tal cual a la
   plataforma DAFO, y una marca «**» ahí sería basura.

   Antes esto solo hacía enlaces y @menciones; se conservan. */

/* La cursiva `_…_` es la parte delicada: este repo está lleno de identificadores
   con guion bajo —dni_url, renca_url, suspension_4ta_url— y una regla laxa los
   volvía cursiva a mitad de palabra, borrando los guiones y dejando «cvurl».
   Por eso el `_` de apertura solo cuenta si NO tiene una letra/número pegado
   detrás, y el de cierre si no lo tiene delante: así `_texto_` en prosa marca,
   pero `cv_url` nunca. Igual criterio, más simple, para negrita y código. */
const INLINE = /(\*\*(?:[^*\n]+)\*\*|(?<![\w])_(?![\s_])(?:[^_\n]+?)(?<![\s_])_(?![\w])|`[^`\n]+`|https?:\/\/[^\s]+|www\.[^\s]+|@[^\s@,;:!?]+)/g;

/** Formato dentro de una línea: negrita, cursiva, código, enlaces, menciones. */
function inline(texto: string, keyBase: string): React.ReactNode[] {
  return (texto || "").split(INLINE).map((parte, i) => {
    if (!parte) return null;
    const k = `${keyBase}-${i}`;
    if (parte.startsWith("**") && parte.endsWith("**"))
      return <b key={k}>{parte.slice(2, -2)}</b>;
    if (parte.startsWith("_") && parte.endsWith("_"))
      return <i key={k}>{parte.slice(1, -1)}</i>;
    if (parte.startsWith("`") && parte.endsWith("`"))
      return <code key={k} className="tx-code">{parte.slice(1, -1)}</code>;
    if (/^https?:\/\//.test(parte) || /^www\./.test(parte)) {
      const m = parte.match(/[)\].,;:!?]+$/);
      const cola = m ? m[0] : "";
      const url = cola ? parte.slice(0, -cola.length) : parte;
      const href = url.startsWith("http") ? url : `https://${url}`;
      return (
        <span key={k}>
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="tx-link" onClick={e => e.stopPropagation()}>{url}</a>{cola}
        </span>
      );
    }
    if (parte.startsWith("@")) return <span key={k} className="mencion">{parte}</span>;
    return <span key={k}>{parte}</span>;
  });
}

export default function TextoRico({ texto }: { texto: string }) {
  const lineas = (texto || "").split("\n");
  const bloques: React.ReactNode[] = [];
  let lista: string[] = [];
  const cerrarLista = () => {
    if (!lista.length) return;
    const items = lista;
    bloques.push(
      <ul className="tx-ul" key={`ul-${bloques.length}`}>
        {items.map((li, i) => <li key={i}>{inline(li, `li-${bloques.length}-${i}`)}</li>)}
      </ul>
    );
    lista = [];
  };

  lineas.forEach((ln, i) => {
    const bullet = ln.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) { lista.push(bullet[1]); return; }
    cerrarLista();
    const cita = ln.match(/^\s*>\s?(.*)$/);
    if (cita) {
      bloques.push(<blockquote className="tx-cita" key={`q-${i}`}>{inline(cita[1], `q-${i}`)}</blockquote>);
      return;
    }
    // Línea normal (una vacía se conserva como salto, por el pre-wrap del padre)
    bloques.push(<React.Fragment key={`p-${i}`}>{inline(ln, `p-${i}`)}{i < lineas.length - 1 ? "\n" : ""}</React.Fragment>);
  });
  cerrarLista();

  return <>{bloques}</>;
}
