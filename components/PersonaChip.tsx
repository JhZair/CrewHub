"use client";
import Avatar from "@/components/Avatar";
import VistaPersona from "@/components/VistaPersona";

/* CHIP DE PERSONA — cara + nombre, y la vista rápida al clic.
 *
 * Este markup estaba copiado LITERAL en cinco sitios. Mientras fue solo un
 * <Link> daba igual; ahora que lleva comportamiento, cinco copias son cinco
 * lugares donde el pop-up existirá o no según quién tocó el archivo por
 * última vez. Una sola pieza.
 *
 * El nombre sigue siendo un enlace de verdad (clic normal o clic derecho →
 * abrir en pestaña nueva) y el pop-up cuelga de un botón aparte. Convertir el
 * nombre entero en disparador rompería «abrir en otra pestaña», que es lo que
 * se hace cuando se quiere ver la ficha completa — justo lo contrario de lo
 * que el pop-up viene a resolver.
 */
export default function PersonaChip({ id, nombre, alias, foto, rol, yo, titulo, size = 26 }: {
  id: string;
  nombre?: string | null;
  alias?: string | null;
  foto?: string | null;
  /** Cargo o papel, en gris tras el nombre. */
  rol?: string | null;
  /** Resalta al usuario actual, como hacía el markup original. */
  yo?: boolean;
  titulo?: string;
  /** Tamaño del avatar; 26 salvo que la superficie use otro. */
  size?: number;
}) {
  /* Sin id no hay chip: pintarlo daría un enlace a «…/persona/undefined» y un
     ⚡ que consulta por un uuid inválido y responde «no se encontró», que
     parece un dato perdido cuando en realidad falta el vínculo. */
  if (!id) return null;
  return (
    <span className="pers-chip-wrap">
      <a href={`/entidad/persona/${id}`} className={`pers-chip${yo ? " pers-chip-yo" : ""}`}
        title={titulo || rol || ""}>
        <Avatar nombre={nombre} src={foto} size={size} />
        <span className="pers-chip-txt">
          {alias || nombre}
          {rol && <span className="pers-chip-rol"> · {rol}</span>}
        </span>
      </a>
      <VistaPersona personaId={id}>
        {(abrir) => (
          <button className="chip-ojo" onClick={abrir} title="Vista rápida (sin salir de aquí)">⚡</button>
        )}
      </VistaPersona>
    </span>
  );
}
