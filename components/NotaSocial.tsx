"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Reacciones, { type Reaccion } from "@/components/Reacciones";
import ComentarioTexto from "@/components/ComentarioTexto";
import { menciones, MencionesMenu, type Perfil } from "@/components/Menciones";
import { comentar } from "@/app/actions";

/* ══════════════════════════════════════════════════════════════════════════
   EL PIE DE UNA NOTA DEL MURO — reaccionar, leer las respuestas y responder

   Estaba escrito dentro de MuroProyecto, que es el muro de una ficha. Cuando
   la portada empezó a enseñar las notas de TODOS los muros, la opción era
   copiarlo (dos pies que empiezan iguales y en un mes reaccionan distinto) o
   sacarlo aquí. Está aquí.

   Lo que NO trae: publicar, editar, borrar ni destacar. Eso sigue siendo del
   muro de la ficha, que es donde se administra la nota. Aquí solo lo que tiene
   sentido hacer de paso: reaccionar y responder.
   ══════════════════════════════════════════════════════════════════════════ */

export type NotaComentario = {
  id: string; cuerpo: string; imagenes?: string[] | null; creado_en: string;
  autor_id: string; editado_en?: string | null;
  autor?: { nombre?: string | null; color?: string | null; avatar_url?: string | null } | null;
  reacciones?: Reaccion[];
};

const fecha = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("es-PE",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function NotaSocial({
  pubId, userId, reacciones, comentarios, perfiles, deQuien, onCambio, sinRed,
}: {
  pubId: string;
  userId: string;
  /** Las de la NOTA (las de cada comentario viajan dentro de él). */
  reacciones: Reaccion[];
  comentarios: NotaComentario[];
  /** Entre quiénes se puede elegir al escribir «@». */
  perfiles: Perfil[];
  /** Autor de la nota: va en el marcador de posición de la caja. */
  deQuien?: string | null;
  /** Qué hacer después de comentar. Por defecto, recargar la pantalla. */
  onCambio?: () => void;
  /** En una LISTA de notas (la portada): las tarjetas de enlace de cada
   *  respuesta se dibujan con lo que dice la url, sin preguntarle al servidor.
   *  Cada consulta de Open Graph es una acción de servidor, y Next las encola
   *  de una en una: nueve hilos con enlaces son treinta viajes en fila. En la
   *  ficha se deja apagado y las tarjetas traen su título real. */
  sinRed?: boolean;
}) {
  const router = useRouter();
  const refrescar = onCambio || (() => router.refresh());
  return (
    <>
      <div className="muro-post-pie">
        <Reacciones pubId={pubId} reacciones={reacciones} userId={userId} />
      </div>

      {/* Comentarios — sangrados y rotulados: lo que se escriba aquí cuelga de
          ESTA nota, no del muro. */}
      <div className="muro-coments">
        <div className="muro-coments-h">
          {comentarios.length
            ? `${comentarios.length} comentario${comentarios.length === 1 ? "" : "s"} en esta nota`
            : "Comentar esta nota"}
        </div>
        {comentarios.map(c => (
          <div key={c.id} className="muro-coment">
            <Avatar nombre={c.autor?.nombre} color={c.autor?.color} size={26} src={c.autor?.avatar_url} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <b style={{ fontSize: 12.5 }}>{c.autor?.nombre || "Alguien"}</b>
                <span style={{ color: "var(--dim)", fontSize: 11 }}>{fecha(c.creado_en)}</span>
              </div>
              <ComentarioTexto comentarioId={c.id} pubId={pubId} cuerpo={c.cuerpo}
                imagenes={c.imagenes || []} esMio={c.autor_id === userId}
                editadoEn={c.editado_en} sinRed={sinRed} />
              {/* `pubId` va igualmente: el servidor lo usa para revalidar y para
                  avisar al autor. Lo que decide que la reacción es DEL
                  COMENTARIO es `comentarioId`. */}
              <div className="muro-coment-rx">
                <Reacciones pubId={pubId} comentarioId={c.id}
                  reacciones={c.reacciones || []} userId={userId} />
              </div>
            </div>
          </div>
        ))}
        <CajaComentario pubId={pubId} perfiles={perfiles} deQuien={deQuien} onSent={refrescar} />
      </div>
    </>
  );
}

/* Caja para comentar una nota del muro. Mismo motor (`comentar`) y mismas
   menciones que en un caso — solo más compacta. */
export function CajaComentario({ pubId, perfiles, deQuien, onSent }: {
  pubId: string; perfiles: Perfil[];
  /** Autor de la nota que se comenta: va en el marcador de posición. */
  deQuien?: string | null;
  onSent: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { candidatos, aplicar } = menciones(texto, perfiles);
  const enviar = async () => {
    if (enviando || !texto.trim()) return;
    setEnviando(true);
    const r: any = await comentar(pubId, texto.trim());
    setEnviando(false);
    if (r?.error) { alert(r.error); return; }
    setTexto(""); onSent();
  };
  return (
    <div className="muro-caja" style={{ position: "relative" }}>
      <MencionesMenu candidatos={candidatos} onElegir={n => setTexto(aplicar(n))} />
      {/* El marcador de posición DICE a quién se le responde. «Comentar…» a
          secas se lee igual que «Comparte una nota…» de arriba; con el nombre
          del autor delante, escribir aquí una publicación nueva ya no es un
          descuido posible. */}
      <input value={texto}
        placeholder={deQuien ? `Responder a ${deQuien}… (@nombre para invocar)` : "Comentar esta nota…"}
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            if (candidatos.length) { e.preventDefault(); setTexto(aplicar(candidatos[0].nombre)); return; }
            e.preventDefault(); enviar();
          }
        }}
        className="muro-caja-input" />
      <button className="btn btn-ghost" disabled={enviando || !texto.trim()} onClick={enviar}
        style={{ padding: "6px 12px", fontSize: 12.5 }}>
        {enviando ? "…" : "Comentar"}
      </button>
    </div>
  );
}
