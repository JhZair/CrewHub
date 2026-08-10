/* LOS KITS, EN UN SOLO SITIO
 *
 * Un kit es un puñado de equipos que salen juntos porque juntos hacen un
 * trabajo: «Entrevista PRO» es la cámara, el micro y la luz, no tres fichas
 * que alguien recuerda marcar de a una. Roxana tenía tres equipos fuera y los
 * tres eran el mismo kit; la aplicación no tenía forma de decirlo.
 *
 * Aquí vive lo único que hay que saber de un kit para pintarlo en cualquier
 * pantalla: cuántas de sus piezas se pueden entregar AHORA, y —cuando ya
 * salió— si salió entero. Si esto se calculara en cada pantalla, la primera
 * en cambiar de criterio dejaría a las otras diciendo otra cosa.
 */

/** Estados de equipo que impiden entregar. Los mismos que veta `prestarEquipos`
 *  en el servidor: si esta lista y aquélla se separan, la pantalla ofrece algo
 *  que el servidor rechaza —y el rechazo llega después del clic. */
export const NO_ENTREGABLE: Record<string, string> = {
  en_reparacion: "en reparación", perdido: "perdido", de_baja: "de baja",
};

/** Un equipo tal como lo necesitan las pantallas de kits: qué es, cómo está,
 *  y quién lo tiene si está fuera. */
export type EqBase = {
  id: string; folio?: string | null; nombre: string;
  categoria?: string | null; estado?: string | null; quien?: string | null;
};

/** Un kit tal como viaja a las pantallas: los ids en el orden en que se armó,
 *  que se lee como una lista de empaque. */
export type KitVista = {
  id: string; nombre: string; uso?: string | null; descripcion?: string | null;
  retirado?: boolean; equipoIds: string[];
};

export type PiezaKit = {
  id: string;                 // equipamiento_id
  folio?: string | null;
  nombre: string;
  estado?: string | null;
  /** Quién lo tiene ahora, si está fuera. */
  quien?: string | null;
};

export type EstadoKit = {
  total: number;
  libres: PiezaKit[];
  /** Fuera con alguien: vuelve, pero hoy no. */
  prestadas: PiezaKit[];
  /** En reparación, perdido o de baja: no vuelve solo. */
  vetadas: PiezaKit[];
  /** ¿Se puede entregar el kit tal cual, entero? */
  completo: boolean;
};

export function estadoKit(piezas: PiezaKit[]): EstadoKit {
  const libres: PiezaKit[] = [], prestadas: PiezaKit[] = [], vetadas: PiezaKit[] = [];
  piezas.forEach(p => {
    if (NO_ENTREGABLE[p.estado || ""]) vetadas.push(p);
    else if (p.quien) prestadas.push(p);
    else libres.push(p);
  });
  return { total: piezas.length, libres, prestadas, vetadas, completo: libres.length === piezas.length };
}

/** Por qué una pieza no se puede entregar, dicho con nombre y apellido.
 *  «no disponible» no sirve de nada: lo que se necesita saber es a quién
 *  llamar o qué hay que arreglar. */
export const porQueNo = (p: PiezaKit): string =>
  NO_ENTREGABLE[p.estado || ""] ? NO_ENTREGABLE[p.estado || ""]
  : p.quien ? `lo tiene ${p.quien}`
  : "no disponible";

export const nombraPieza = (p: PiezaKit) => `${p.folio ? p.folio + " " : ""}${p.nombre}`;

/** Resumen de una línea para la cabecera de un kit. */
export function resumenKit(e: EstadoKit): { txt: string; color: string } {
  if (!e.total) return { txt: "vacío — sin equipos", color: "var(--dim)" };
  if (e.completo) return { txt: `${e.total} equipos · completo`, color: "var(--green)" };
  if (!e.libres.length) return { txt: `${e.total} equipos · ninguno disponible`, color: "var(--red)" };
  return { txt: `${e.libres.length} de ${e.total} disponibles`, color: "var(--yellow)" };
}

/* ── LO QUE YA SALIÓ ──
 * Un kit prestado se lee al revés: no «cuántos puedo llevarme» sino «de los
 * que salieron, ¿están todos con la misma persona?». Un kit que salió cojo
 * —porque una pieza estaba en reparación— tiene que decirlo en la fila, o al
 * devolverlo nadie se entera de que falta cerrar la que quedó fuera. */
export function saliCompleto(enManos: number, delKit: number) {
  return { completo: enManos >= delKit, faltan: Math.max(0, delKit - enManos) };
}
