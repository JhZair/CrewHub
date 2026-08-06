import Link from "next/link";

/* Chip de conversación de una postulación. La conversación vive en el MURO de la
 * postulación (una sola sede, en vez de un hilo aparte por tarjeta), así que el
 * chip LLEVA a la ficha de la postulación —donde el Muro es la primera pestaña—.
 * Muestra el número de notas del muro si las hay. */
export default function HiloPostulacionBtn({ postulacionId, nComentarios = 0 }: {
  postulacionId: string;
  /** Notas del muro de la postulación (para el contador). */
  nComentarios?: number;
  /** Aceptado por compatibilidad con las llamadas; ya no se usa. */
  nReacciones?: number;
}) {
  return (
    <Link href={`/entidad/postulacion/${postulacionId}`} className="hilo-post-chip"
      title="Ver el muro de la postulación">
      💬 Muro{nComentarios > 0 ? ` · ${nComentarios}` : ""}
    </Link>
  );
}
