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

/* La lista de «qué no se puede entregar» vivía aquí, copiada. Ahora sale de
   lib/estadosEquipo, que es donde vive el estado de un equipo entero —color,
   rótulo, si cuenta en el inventario, si pide atención—. Se re-exporta para
   no romper a quien ya la importaba de aquí. */
export { NO_ENTREGABLE } from "@/lib/estadosEquipo";
import { NO_ENTREGABLE } from "@/lib/estadosEquipo";

/** Un equipo tal como lo necesitan las pantallas de kits: qué es, cómo está,
 *  y quién lo tiene si está fuera. */
/** Otro kit al que pertenece una pieza, en lo mínimo para nombrarlo. */
export type KitBreve = { id: string; nombre: string };

/** El combo del que vino una pieza, en lo mínimo para nombrarlo.
 *
 *  `nUnidades` es CUÁNTAS TIENE EL COMBO, que no es cuántas de ellas están en
 *  el kit que se está mirando. Sin ese número el encabezado solo podía decir
 *  «2» y quien conocía el combo lo leía como un error —«pero si el combo
 *  tiene tres»—. Con los dos, dice lo que de verdad pasa: «2 de 3», o sea que
 *  el kit se lleva parte del combo y algo se queda. */
export type ComboBreve = { codigo?: string | null; nombre: string; nUnidades?: number | null };

export type EqBase = {
  id: string; folio?: string | null; nombre: string;
  categoria?: string | null; subcategoria?: string | null;
  estado?: string | null; quien?: string | null;
  /** De qué compra vino. Un kit grande se arma con varias compras y la
   *  procedencia es lo que explica por qué hay tres cosas casi iguales. */
  combo?: ComboBreve | null;
  /** En qué OTROS kits está. «La gorra y el SmallRig son un kit»: salen
   *  juntos siempre, estén en el kit que estén. Es un hecho de los equipos,
   *  no de la lista que se esté mirando. */
  kits?: KitBreve[];
  /** Cartel del equipo (entidad_media). Una lista de equipos sin foto obliga
   *  a leer folio por folio; con foto se reconoce de un vistazo cuál falta. */
  cartel?: string | null;
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
  cartel?: string | null;
  combo?: ComboBreve | null;
  kits?: KitBreve[];
  /* Para el resumen de la cabecera: cuánto vale el kit y de qué está hecho.
     Plegado, «12 equipos · completo» no dice si son doce baterías o una
     cámara con sus accesorios. */
  categoria?: string | null;
  subcategoria?: string | null;
  valor?: number | null;
};

/** Lo que un kit ES, para poder decirlo con el kit plegado: cuánto suma, de
 *  qué categorías está hecho y —si algo falta— en manos de quién está.
 *  «Ninguno disponible» sin decir quién los tiene obliga a desplegarlo para
 *  saber a quién llamar, que es lo único que se quería saber. */
export function contextoKit(piezas: PiezaKit[]) {
  const valor = piezas.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const cats: string[] = [];
  piezas.forEach(p => {
    const c = (p.categoria || "").trim();
    if (c && !cats.includes(c)) cats.push(c);
  });
  const quienes: string[] = [];
  piezas.forEach(p => { if (p.quien && !quienes.includes(p.quien)) quienes.push(p.quien); });
  return { valor, cats, quienes };
}

/* ── AGRUPAR POR PROCEDENCIA ──
 * Un kit de quince piezas es una pared de miniaturas. Partirlo por el combo
 * del que vino cada una devuelve la pregunta que de verdad se hace mirándolo:
 * «esto vino todo junto, ¿lo guardo junto?», «la batería de repuesto, ¿es de
 * la compra de la cámara o de la otra?».
 *
 * Una sola definición porque la usan dos listas distintas —las piezas
 * pintadas y el escogedor de equipos del editor— y agrupar de dos maneras
 * sería peor que no agrupar.
 *
 * Genérica a propósito: lo único que pide es que la cosa tenga `combo`.
 */
export type Grupo<T> = {
  clave: string; codigo?: string | null; nombre: string | null; items: T[];
  /** Unidades que tiene el combo entero, si se sabe. `items.length` son las
   *  que están AQUÍ; las dos cifras juntas son la información. */
  total?: number | null;
};

export const SIN_COMBO = "_sin";

export function agruparPorCombo<T extends { combo?: ComboBreve | null }>(xs: T[]): Grupo<T>[] {
  const m = new Map<string, Grupo<T>>();
  xs.forEach(x => {
    const c = x.combo || null;
    const clave = c ? (c.codigo || c.nombre) : SIN_COMBO;
    const g = m.get(clave) || { clave, codigo: c?.codigo ?? null, nombre: c?.nombre ?? null,
      total: c?.nUnidades ?? null, items: [] };
    g.items.push(x); m.set(clave, g);
  });
  /* «Sin combo» al final: no es un combo más, es lo que no tiene
     procedencia. Los demás quedan en el orden en que aparecieron, que es el
     orden en que se armó el kit —una lista de empaque. */
  return [...m.values()].sort((a, b) =>
    (a.clave === SIN_COMBO ? 1 : 0) - (b.clave === SIN_COMBO ? 1 : 0));
}

/* ── EL OTRO EJE: POR KIT ──
 * Dentro de un kit grande hay kits pequeños. La gorra y el SmallRig salen
 * juntos siempre, estén donde estén, y verlos pegados dice algo que la
 * procedencia no puede decir: no vinieron de la misma compra, pero viajan en
 * la misma bolsa.
 *
 * Ojo: esto NO es una partición. Una pieza puede estar en tres kits y sale en
 * los tres grupos, a propósito —esconderla en dos dejaría esos kits
 * incompletos, que es justo lo que un kit no puede estar—. Por eso la suma de
 * los grupos puede pasar del total, y por eso el conmutador dice siempre qué
 * eje se está mirando: sin decirlo, el número descuadrado parecería un error.
 */
export function agruparPorKit<T extends { kits?: KitBreve[] }>(xs: T[], excluir?: string): Grupo<T>[] {
  const m = new Map<string, Grupo<T>>();
  const sueltos: T[] = [];
  xs.forEach(x => {
    /* Fuera el kit que se está mirando: agrupar sus propias piezas bajo su
       propio nombre sería un encabezado que repite el título. */
    const otros = (x.kits || []).filter(k => k.id !== excluir);
    if (!otros.length) { sueltos.push(x); return; }
    otros.forEach(k => {
      const g = m.get(k.id) || { clave: k.id, codigo: null, nombre: k.nombre, items: [] };
      g.items.push(x); m.set(k.id, g);
    });
  });
  const gs = [...m.values()];
  // Lo que solo está aquí, al final. Mismo gesto que «sin combo».
  if (sueltos.length) gs.push({ clave: SIN_COMBO, codigo: null, nombre: null, items: sueltos });
  return gs;
}

/** Agrupar solo cuando dice algo. Con un solo grupo, los encabezados son
 *  ruido: repiten en cada bloque lo que ya se sabe de todo el conjunto. */
export const valeAgrupar = (gs: Grupo<any>[]) => gs.length > 1;

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
