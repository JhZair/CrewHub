import Avatar from "@/components/Avatar";

/* ── QUIÉN LO APUNTÓ, CON SU CARA ──
 *
 * Un nombre suelto al final de una fila —«KatyP»— se lee como un dato más de
 * la tabla. La cara no: se reconoce sin leer, que es como se busca a alguien
 * en una lista de quince empresas.
 *
 * Vive aparte porque son dos pantallas —/comprobantes y /obligaciones— con la
 * misma columna «último apunte», y el resto del sistema ya pone la cara en
 * todos lados. Escribirlo dos veces habría durado hasta que una de las dos
 * cambiara de tamaño.
 *
 * El `color` es el respaldo de <Avatar/> cuando la persona no subió foto: pinta
 * las iniciales sobre SU color, no sobre el violeta de todos.
 */

export type Quien = {
  /** El corto («KatyP»), que es como se llaman entre ellos. */
  nombre: string;
  foto?: string | null;
  color?: string | null;
};

export default function Firma({ quien, size = 16 }: { quien?: Quien | null; size?: number }) {
  if (!quien?.nombre) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--dim)" }}>
      <Avatar nombre={quien.nombre} src={quien.foto} color={quien.color} size={size} />
      {quien.nombre}
    </span>
  );
}
