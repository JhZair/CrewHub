/* RÁFAGAS DE BITÁCORA — nueve líneas «vinculó persona: X» seguidas, del mismo
   actor y en el mismo minuto, no son nueve hechos: son uno. Agruparlas al
   MOSTRAR (no al escribir) tiene dos ventajas: funciona hacia atrás con lo ya
   registrado, y no pierde el detalle — el grupo se despliega.

   Los comentarios nunca se agrupan: cada uno es su propia cosa, aunque vengan
   seguidos. `creado` tampoco tiene sentido agruparlo (hay uno por entidad). */

/** Tipos de evento que sí forman ráfaga. Fuera: comentario y creado. */
export const AGRUPABLES = [
  "vinculo", "edicion", "editado", "dato", "miembro", "link",
  "archivo", "estado", "asignacion", "prioridad", "tarea", "relacion",
];

/** Cuánto pueden separarse dos eventos y seguir siendo la misma tanda. */
const VENTANA_MIN = 15;

/** Desde cuántos eventos vale la pena plegar. Con dos, agrupar estorba más
 *  de lo que ahorra. */
const MINIMO = 3;

export type Fila<T> = { solo: T; grupo?: never } | { grupo: T[]; solo?: never };

type Ev = {
  tipo: string;
  creado_en: string;
  actor_id?: string | null;
  /* La línea de tiempo del caso mezcla comentarios: los trae con el comentario
     colgado, y ésos jamás se agrupan. */
  comentario?: any;
};

/** Recorre los eventos EN EL ORDEN DADO y junta los consecutivos que compartan
 *  tipo y actor dentro de la ventana. Devuelve filas: sueltas o grupos. */
export function agruparEventos<T extends Ev>(eventos: T[] | null | undefined, minimo = MINIMO): Fila<T>[] {
  const out: Fila<T>[] = [];
  let buf: T[] = [];

  const cerrar = () => {
    if (!buf.length) return;
    if (buf.length >= minimo) out.push({ grupo: buf });
    else buf.forEach(e => out.push({ solo: e }));
    buf = [];
  };
  // Compara contra el ÚLTIMO del grupo, no contra el primero: así una tanda
  // larga encadena aunque su extremo se aleje más de la ventana.
  const sigue = (a: T, b: T) =>
    a.tipo === b.tipo
    && (a.actor_id ?? null) === (b.actor_id ?? null)
    && Math.abs(new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime()) <= VENTANA_MIN * 60000;

  for (const e of eventos || []) {
    if (!AGRUPABLES.includes(e.tipo) || e.comentario) { cerrar(); out.push({ solo: e }); continue; }
    if (buf.length && sigue(buf[buf.length - 1], e)) buf.push(e);
    else { cerrar(); buf = [e]; }
  }
  cerrar();
  return out;
}
