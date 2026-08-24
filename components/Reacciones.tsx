"use client";
import { toggleReaccion } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PaletaRx from "@/components/PaletaRx";
import { agrupar } from "@/lib/reacciones";

/* La paleta, sus rótulos y el agrupado viven en lib/reacciones.ts: los tres
 * sitios que pintan reacciones tienen que contar lo mismo. */

/* Cada reacción trae, si el server la embebió, el nombre de quién la puso
   (`perfil.nombre`): así el tooltip dice QUIÉN reaccionó —el acuse de haber
   visto el mensaje— en vez de un genérico «Reaccionar igual». */
export type Reaccion = { emoji: string; usuario_id: string; nombre?: string | null; perfil?: any };

/* Chips de reacción con toggle: clic en un chip = sumar/quitar la mía.
   El ＋ abre la paleta. Funciona en publicaciones y comentarios. */
export default function Reacciones({
  pubId, comentarioId = null, reacciones, userId, objetoId = null,
  movCajaId = null, compacto = false, rendicion = null,
}: {
  pubId: string | null;
  comentarioId?: string | null;
  reacciones: Reaccion[];
  userId: string;
  /** Cuando el comentario es de un objeto del repositorio, no de un caso. */
  objetoId?: string | null;
  /** Cuando se reacciona al MOVIMIENTO DE CAJA en sí, no a un comentario suyo. */
  movCajaId?: string | null;
  /** En una lista apretada: la paleta solo aparece al pasar el ratón, y sin
      reacciones el ＋ no ocupa sitio. Una fila de caja tiene ya nueve cosas. */
  compacto?: boolean;
  /** Cuando se reacciona a una FILA DE LA RENDICIÓN —factura, estado de
   *  cuenta, RHE, declaración jurada, movimiento del banco—. Va como objeto y
   *  no como cinco props: son un solo concepto, y cinco props opcionales más
   *  en una firma que ya tiene seis es una firma que se llama mal. */
  rendicion?: { tabla: string; id: string } | null;
}) {
  // Abrir y cerrar la paleta es cosa suya (PaletaRx); aquí solo se reacciona.
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // PostgREST devuelve la relación como objeto o como arreglo según cardinalidad;
  // se contemplan ambos para sacar el nombre del autor de la reacción.
  const nombreDe = (r: Reaccion): string | null => {
    if (r.nombre) return r.nombre;
    const p = r.perfil;
    if (!p) return null;
    return (Array.isArray(p) ? p[0]?.nombre : p?.nombre) ?? null;
  };
  // Quiénes reaccionaron: «Tú» primero, luego los demás por nombre. Es el
  // acuse de lectura —quién ya lo vio—, no un botón anónimo.
  const grupos = agrupar(reacciones, userId).map(g => ({
    ...g,
    quien: [
      ...(g.mia ? ["Tú"] : []),
      ...g.rs.filter(r => r.usuario_id !== userId).map(nombreDe).filter(Boolean) as string[],
    ],
  }));

  /* ── EN UNA FILA DE LISTA, EL ANCHO ESTÁ ACOTADO ──
     Una fila de caja tiene fecha, caja, cuenta, descripción, proyecto, quién,
     monto y cuatro botones: el hueco de las reacciones no puede crecer con el
     número de emojis distintos, porque entonces cada fila corta por un punto
     distinto y la columna deja de leerse como columna.
     Antes esto se resolvía solo, mal: `.rx` envuelve, así que lo que sobraba
     caía a un segundo renglón y ensanchaba la fila hacia abajo.
     Se muestran dos chips como mucho. Si hay más, el segundo cede su sitio a un
     «＋N» que dice cuántas faltan y las nombra en su título — nada se esconde
     en silencio, y la lista completa está a un clic en el pop-up del apunte. */
  const TOPE = 2;
  const hayResto = compacto && grupos.length > TOPE;
  const visibles = hayResto ? grupos.slice(0, TOPE - 1) : grupos;
  const resto = hayResto ? grupos.slice(TOPE - 1) : [];
  const nResto = resto.reduce((a, g) => a + g.n, 0);

  const tituloDe = (g: { mia: boolean; quien: string[] }) => {
    const txt = g.quien.join(", ");
    if (!txt) return g.mia ? "Quitar mi reacción" : "Reaccionar igual";
    return g.mia ? `${txt} · toca para quitar la tuya` : `${txt} · toca para reaccionar igual`;
  };

  const tap = async (emoji: string) => {
    if (ocupado) return;
    setOcupado(true); setError("");
    const res = await toggleReaccion(pubId, comentarioId, emoji, objetoId, null, movCajaId, rendicion);
    setOcupado(false);
    if (res?.error) { setError(res.error); return; }
    router.refresh();
  };

  return (
    <span className={`rx${compacto ? " rx-compacto" : ""}`} onClick={e => e.stopPropagation()}>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>⚠ {error}</span>}
      {visibles.map(g => (
        <button key={g.emoji} type="button" className={`rx-chip ${g.mia ? "mia" : ""}`}
          title={tituloDe(g)}
          onClick={() => tap(g.emoji)}>
          {g.emoji} {g.n}
        </button>
      ))}
      {resto.length > 0 && (
        <span className="rx-chip rx-resto"
          title={`También: ${resto.map(g => `${g.emoji} ${g.n}`).join(", ")}`
            + " · ábrelo para verlas todas"}>
          ⋯{nResto}
        </span>
      )}
      <PaletaRx hayReacciones={grupos.length > 0} ocupado={ocupado} onElegir={tap} />
    </span>
  );
}
