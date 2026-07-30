"use client";
import VistaPostulacion from "@/components/VistaPostulacion";

/* Chip de interacción de una postulación: 💬 comentarios + 😊 reacciones. Al
 * pulsarlo abre el hilo (VistaPostulacion) —el MISMO desde la ficha de empresa,
 * de proyecto o de persona—. Un solo componente para las tres superficies. */
export default function HiloPostulacionBtn({ postulacionId, nComentarios = 0, nReacciones = 0 }: {
  postulacionId: string;
  nComentarios?: number;
  nReacciones?: number;
}) {
  return (
    <VistaPostulacion postulacionId={postulacionId}>
      {(abrir) => (
        <button className="hilo-post-chip" onClick={abrir} title="Abrir el hilo de la postulación (comentar y reaccionar)">
          💬 {nComentarios > 0 ? nComentarios : ""}
          {nReacciones > 0 && <span className="hilo-post-rx">😊 {nReacciones}</span>}
          {nComentarios === 0 && nReacciones === 0 && <span className="hilo-post-lbl">Comentar</span>}
        </button>
      )}
    </VistaPostulacion>
  );
}
