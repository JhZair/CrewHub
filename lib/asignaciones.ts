/* ══════════════════════════════════════════════════════════════════════════
   📌 ASIGNACIONES — POR QUÉ TERMINAN, Y CUÁNDO NO TERMINAN

   Una asignación es una fila de `equipo_prestamos` con `tipo = 'asignacion'`.
   No es un préstamo largo: es dónde VIVE un equipo. La laptop de Michel, la
   interfaz del puesto de post, la ropa táctica de Katy. Está contado en
   db/asignacion.sql y en lib/estadosEquipo.ts.

   Este fichero existe porque la misma regla se necesita en cuatro sitios —la
   acción que quita, el panel que pregunta el motivo, la lista que lo pinta y
   la ficha del equipo— y con la regla escrita cuatro veces basta con que
   alguien añada un motivo en uno para que los otros tres lo pinten como
   desconocido.
   ══════════════════════════════════════════════════════════════════════════ */

/** Los mismos cinco valores que acepta el check de la base. Si aquí entra uno
 *  que allá no está, la escritura falla con un error de restricción que no
 *  dice nada. Se cambian a la vez: db/asignacion-suspender.sql. */
export type MotivoFin = "prestado" | "se_fue" | "reasignado" | "baja" | "malogrado";

export type MetaMotivo = {
  txt: string;
  /** Lo que se lee en la lista de motivos al quitar. Tiene que decir la
   *  CONSECUENCIA, no repetir el título: quien elige aquí está decidiendo qué
   *  va a leer dentro de un año quien pregunte «¿y la cámara de Fulano?». */
  ayuda: string;
  color: string;
  ico: string;
  /** `false` = lo pone la máquina, no una persona. No sale en el desplegable. */
  eligible: boolean;
};

export const META_MOTIVO: Record<MotivoFin, MetaMotivo> = {
  /* NO es un final. Es el paréntesis de un rodaje: el equipo sale, la
     asignación se aparta, y al devolverlo vuelve sola. Se guarda como motivo
     porque el histórico tiene que poder distinguir «Michel dejó de tenerla»
     de «Michel la prestó una semana», y las dos cosas cierran la misma fila. */
  prestado: {
    txt: "Prestado a un rodaje", ico: "🤝", color: "var(--yellow)", eligible: false,
    ayuda: "Salió a una salida y vuelve a su persona al devolverlo. La asignación no terminó: está apartada.",
  },
  se_fue: {
    txt: "Se fue del colectivo", ico: "👋", color: "var(--red)", eligible: true,
    ayuda: "La persona ya no está. El equipo tiene que aparecer: es lo primero que se revisa cuando alguien se va.",
  },
  reasignado: {
    txt: "Pasa a otra persona", ico: "🔁", color: "var(--blue)", eligible: true,
    ayuda: "Sigue siendo de la casa y cambia de manos. Después de quitarlo hay que asignárselo a quien lo recibe.",
  },
  baja: {
    txt: "Ya no se usa", ico: "⬛", color: "var(--muted)", eligible: true,
    ayuda: "Vuelve al inventario disponible. Ni se perdió ni se rompió: dejó de hacer falta en ese puesto.",
  },
  malogrado: {
    txt: "Se malogró", ico: "🛠", color: "var(--yellow)", eligible: true,
    ayuda: "Pasa a «En reparación», no a disponible. Que salga de las manos de alguien no lo arregla.",
  },
};

/** Los que puede elegir una persona, en el orden en que se ofrecen: primero
 *  el que más se usa. `prestado` no está y no puede estar. */
export const MOTIVOS_ELEGIBLES: MotivoFin[] =
  (Object.keys(META_MOTIVO) as MotivoFin[]).filter(m => META_MOTIVO[m].eligible);

/** En qué estado queda el equipo al quitarle la asignación. Es la única regla
 *  que decide esto: la acción no puede escribir «disponible» a secas, porque
 *  un equipo que se malogró y vuelve al inventario como disponible es un
 *  equipo que alguien se va a llevar a un rodaje. */
export function estadoTrasQuitar(motivo: MotivoFin): string {
  /* `se_fue` NO deja el equipo «disponible». Cuando alguien deja el colectivo,
     su cámara sigue físicamente en su casa: marcarla libre en el almacén es
     poner en la lista de disponibles algo que nadie puede ir a coger, y el
     jueves alguien la cuenta para un rodaje. «No aparece» es exactamente eso
     —no está donde debería y todavía no se da por perdido, lo que hay que
     hacer con él es buscarlo— y es lo que ya dice su propia ayuda: «el equipo
     tiene que aparecer». Cuando aparezca, se marca disponible desde su ficha,
     que es un gesto de un clic y además deja constancia de que apareció. */
  if (motivo === "malogrado") return "en_reparacion";
  if (motivo === "se_fue") return "no_aparece";
  return "disponible";
}

export function esMotivo(v: unknown): v is MotivoFin {
  return typeof v === "string" && v in META_MOTIVO;
}

/* ── LA ASIGNACIÓN SUSPENDIDA ──
   Una asignación apartada por un rodaje está CERRADA en la base: tiene `hasta`
   puesto, igual que una que terminó de verdad. La diferencia no está en ella
   sino en el préstamo que la apartó, que la señala con `reanuda_id` y sigue
   abierto.

   Por eso «las asignaciones de alguien» NO es `hasta is null`: eso deja fuera
   justo las que están en un rodaje, que son las que más se preguntan. Se
   juntan las dos consultas y esta función las une en una sola lista, marcando
   cuáles están fuera. */
export type Custodia = {
  id: string; desde: string | null; hasta: string | null;
  tipo?: string | null; reanuda_id?: string | null;
  [k: string]: any;
};

export type AsignacionViva = {
  /** La fila de la asignación. Puede estar cerrada si está suspendida. */
  asig: Custodia;
  /** El préstamo que la tiene apartada, si lo hay. */
  prestada: Custodia | null;
};

/**
 * Las asignaciones que siguen vivas: las abiertas, más las que están cerradas
 * por un préstamo que aún no ha vuelto.
 *
 * ⚠ `abiertas` tiene que traer TODAS las custodias abiertas —préstamos
 * incluidos—, no solo las asignaciones: son los préstamos los que llevan el
 * `reanuda_id`, y sin ellos las suspendidas no se pueden encontrar.
 */
export function asignacionesVivas(abiertas: Custodia[], suspendidas: Custodia[]): AsignacionViva[] {
  const porId = new Map(suspendidas.map(a => [a.id, a]));
  const vivas: AsignacionViva[] = [];
  const yaPuesta = new Set<string>();

  for (const c of abiertas) {
    if (c.tipo === "asignacion") {
      vivas.push({ asig: c, prestada: null });
      yaPuesta.add(c.id);
    }
  }
  for (const c of abiertas) {
    if (c.tipo === "asignacion" || !c.reanuda_id) continue;
    const asig = porId.get(c.reanuda_id);
    /* Si no está, la asignación se borró a mano mientras el equipo andaba
       fuera. El préstamo sigue siendo válido; simplemente ya no hay a dónde
       volver, y aquí no hay nada que enseñar.
       Y se comprueba que sea una ASIGNACIÓN: la clave ajena permite apuntar a
       cualquier fila de la tabla, así que hoy solo la disciplina de la acción
       impide que un préstamo normal acabe pintado aquí como si fuera de
       alguien. Una condición cuesta menos que confiar. */
    if (!asig || asig.tipo !== "asignacion" || yaPuesta.has(asig.id)) continue;
    vivas.push({ asig, prestada: c });
    yaPuesta.add(asig.id);
  }
  return vivas;
}
