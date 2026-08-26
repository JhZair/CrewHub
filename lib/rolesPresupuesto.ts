import { metaRubro, type ItemPre } from "@/lib/rubros";

/* ══════════════════════════════════════════════════════════════════════════
   CUÁNTO LE TOCA A CADA UNO — las partidas del presupuesto, agrupadas por rol

   El presupuesto de DAFO está ordenado por ETAPA y por RUBRO, que es como lo
   pide el formulario. Para girar un recibo hace falta lo contrario: cuánto
   suma UNA persona en todo el proyecto. Hoy eso se saca a mano sumando líneas
   de tres pestañas distintas, y es justo lo que tiene parado el giro de los
   RHE de PO-001.

   ── EL ROL NO ESTÁ EN NINGUNA COLUMNA, ESTÁ EN EL TEXTO ──
   Un ítem tiene `rubro` (la partida temática de DAFO) y `concepto` (texto
   libre). El rubro NO sirve para esto: en «producción · dirección» conviven la
   directora, su asistente y el técnico de datos. El rol solo está escrito en
   el concepto — y escrito a mano, así que la misma persona aparece como
   «Directora Responsable» en preproducción y como «Directora» en post.

   Así que se agrupa por el concepto NORMALIZADO y, cuando dos grupos se
   parecen mucho, se PROPONE unirlos en vez de hacerlo en silencio: sumar dos
   líneas que no son de la misma persona es un recibo mal girado, y un recibo
   mal girado es plata que hay que devolver.

   ── LA CORRECCIÓN MANDA Y SE GUARDA ──
   Cuando alguien dice «estas dos son la misma», eso se escribe en el propio
   ítem (`rol`), dentro del jsonb del presupuesto. No hace falta migración, y
   la decisión no hay que repetirla el mes que viene.
   ══════════════════════════════════════════════════════════════════════════ */

/** Un ítem del presupuesto con las dos marcas que puede llevar escritas a
 *  mano. Las dos son opcionales: un presupuesto viejo no tiene ninguna. */
export type ItemRol = ItemPre & {
  /** El rol, dicho por una persona. Manda sobre el texto del concepto. */
  rol?: string | null;
  /** Quién lo cobra. Es lo que permite cruzar con los RHE ya girados. */
  persona_id?: string | null;
};

/* Sufijos de numeración que NO distinguen un rol: «Operador de cámara 01» y
   «Operador de cámara 02» son dos personas del mismo rol, y para el
   presupuesto por rol interesa el rol. Los números romanos van aparte porque
   «II» no es una palabra que se pueda tirar a la ligera en otro contexto. */
const COLA_NUMERO = /\s*(?:n[°º]?\s*)?(?:\d{1,2}|i{1,3}|iv|v|vi{1,3}|ix|x)\s*$/i;

/** El texto de un concepto, listo para comparar: sin tildes, sin mayúsculas,
 *  sin puntuación, sin numeración al final y con los espacios colapsados. */
export function normalizarRol(texto?: string | null): string {
  const base = String(texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // fuera tildes
    .toLowerCase()
    .replace(/[.,;:()"'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.replace(COLA_NUMERO, "").trim();
}

/** La clave por la que se agrupa una partida: la etiqueta escrita a mano si la
 *  hay, y si no el concepto normalizado. */
export const claveRol = (it: ItemRol): string =>
  normalizarRol(it.rol) || normalizarRol(it.concepto) || "sin concepto";

/** Cuánto cuesta una línea. Igual que en el editor: cantidad × unitario. */
export const totalItem = (it: ItemPre): number =>
  (Number(it.cantidad) || 0) * (Number(it.costo_unit) || 0);

export type GrupoRol = {
  clave: string;
  /** Cómo se llama el grupo en pantalla. */
  titulo: string;
  /** `true` si el título viene de una etiqueta escrita a mano. */
  etiquetado: boolean;
  items: ItemRol[];
  total: number;
  /** Cuánto de ese total lo cubre OTRA fuente (contrapartida). No cambia lo
   *  que la persona cobra, pero sí de qué bolsillo sale: se dice, porque un
   *  recibo pagado con contrapartida no se rinde a DAFO. */
  otras: number;
  /** Cuánto suma en cada etapa del presupuesto («2 PRE PRODUCCIÓN»…). */
  porEtapa: { etapa: string; total: number }[];
  /** Las personas asignadas a sus líneas. Más de una es un aviso, no un dato:
   *  significa que el grupo mezcla gente. */
  personas: string[];
};

/** El nombre de la etapa de una partida, según su rubro. Sin rubro conocido
 *  cae en «Otros», que es honesto: no se inventa una etapa. */
export const etapaDe = (it: ItemPre): string =>
  metaRubro(it.rubro)?.catNombre || "Otros";

/**
 * Las partidas agrupadas por rol, de mayor a menor importe.
 *
 * El título del grupo es el concepto MÁS LARGO de los que lo forman —«Directora
 * Responsable» dice más que «Directora»—, salvo que alguien haya escrito una
 * etiqueta a mano, que entonces manda esa.
 */
export function agruparPorRol(items: ItemRol[]): GrupoRol[] {
  const mapa = new Map<string, GrupoRol>();
  for (const it of items || []) {
    const clave = claveRol(it);
    let g = mapa.get(clave);
    if (!g) {
      g = { clave, titulo: "", etiquetado: false, items: [], total: 0, otras: 0, porEtapa: [], personas: [] };
      mapa.set(clave, g);
    }
    g.items.push(it);
    g.total += totalItem(it);
    g.otras += Number(it.otras) || 0;
    if (it.persona_id && !g.personas.includes(it.persona_id)) g.personas.push(it.persona_id);
  }

  for (const g of mapa.values()) {
    const conEtiqueta = g.items.find(i => (i.rol || "").trim());
    g.etiquetado = !!conEtiqueta;
    g.titulo = conEtiqueta
      ? String(conEtiqueta.rol).trim()
      : g.items.map(i => String(i.concepto || "").trim())
        .sort((a, b) => b.length - a.length)[0] || "Sin concepto";
    const porEtapa = new Map<string, number>();
    for (const it of g.items) {
      const e = etapaDe(it);
      porEtapa.set(e, (porEtapa.get(e) || 0) + totalItem(it));
    }
    g.porEtapa = [...porEtapa.entries()]
      .map(([etapa, total]) => ({ etapa, total }))
      .sort((a, b) => a.etapa.localeCompare(b.etapa));
  }

  return [...mapa.values()].sort((a, b) => b.total - a.total || a.titulo.localeCompare(b.titulo));
}

/* ── ¿SERÁN LA MISMA PERSONA? ──
   Solo para PROPONER. Dos grupos se parecen si uno empieza por el otro
   («directora» ⊂ «directora responsable») o si comparten todas las palabras
   largas del más corto. No se unen solos: se enseña el par y decide quien
   sabe. Mismo criterio que `parecido` en lib/rheLote.ts, y por la misma razón
   —allí ordenaba candidatos, aquí sugiere uniones—: la máquina acota, la
   persona decide. */
const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "y", "a", "en", "los", "las"]);
const palabrasDe = (s: string) =>
  s.split(" ").filter(p => p.length >= 4 && !PALABRAS_VACIAS.has(p));

/* Cuánto puede alargar el más largo al más corto y seguir siendo «el mismo».
   «alimentación» → «alimentación *12 aprox.» sí; «alquiler» → «alquiler lentes
   para sony fx30 (sigma 18-50mm…)» no. */
const COLA_MAX = 25;

export function seParecen(a: string, b: string, distintiva?: (p: string) => boolean): boolean {
  if (!a || !b || a === b) return false;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  // Uno empieza por el otro y lo que sobra es una coletilla, no otro concepto.
  if (largo.startsWith(corto)) return largo.length - corto.length <= COLA_MAX;
  /* ⚠ DOS palabras largas en común como mínimo, y no una.
     Con una bastaba, y la primera prueba con el presupuesto real de PO-001
     escupió TREINTA Y OCHO sugerencias: «Alquiler DJI Mic» = «Alquiler Sony
     MDR-7506», «Master DCP» = «Archivo master»… Una lista de sugerencias que
     hay que descartar de a treinta es una lista que se cierra sin leer, y
     entonces la única que importaba —Directora— se pierde dentro. */
  const pc = palabrasDe(corto);
  if (pc.length < 2) return false;
  const pl = new Set(palabrasDe(largo));
  if (!pc.every(p => pl.has(p))) return false;
  /* Y que al menos UNA de las palabras compartidas signifique algo en ESTE
     presupuesto. «Alquiler» y «Sony» salen en diez partidas: comparten dos
     palabras y no se parecen en nada. Quién es genérica lo dice el propio
     presupuesto, no una lista escrita a mano que se quedaría corta en el
     siguiente proyecto. */
  return distintiva ? pc.some(distintiva) : true;
}

/** Pares de grupos que podrían ser el mismo rol, sin repetir (a,b)/(b,a).
 *  Los grupos ya etiquetados a mano no se sugieren: alguien ya decidió. */
export function unionesSugeridas(grupos: GrupoRol[]): [GrupoRol, GrupoRol][] {
  /* Cuántos grupos usan cada palabra. Una que sale en cuatro o más es del
     vocabulario del proyecto («alquiler», «sony», «gastos»), no del nombre de
     un rol. */
  const frec = new Map<string, number>();
  for (const g of grupos)
    for (const p of new Set(palabrasDe(g.clave)))
      frec.set(p, (frec.get(p) || 0) + 1);
  const distintiva = (p: string) => (frec.get(p) || 0) <= 3;

  const pares: [GrupoRol, GrupoRol][] = [];
  for (let i = 0; i < grupos.length; i++) {
    for (let j = i + 1; j < grupos.length; j++) {
      const a = grupos[i], b = grupos[j];
      if (a.etiquetado && b.etiquetado) continue;
      if (seParecen(a.clave, b.clave, distintiva)) pares.push([a, b]);
    }
  }
  // Por plata: la unión que más cambia el total va primero.
  return pares.sort((x, y) => (y[0].total + y[1].total) - (x[0].total + x[1].total));
}

/* ══════════════════════════════════════════════════════════════════════════
   Y LO QUE FALTA POR GIRAR

   La pregunta final no es «cuánto suma la directora» sino «cuánto le queda por
   cobrar a Katy». Son distintas: una persona puede tener DOS roles en el mismo
   fondo (dirige y además edita), y sus recibos no vienen separados por rol —
   `rhe` guarda persona y monto, no rol.

   Por eso, cuando dos grupos apuntan a la MISMA persona, se funden en una sola
   fila. Si se dejaran separados habría que enseñar el mismo «girado» dos veces
   —o repartirlo a ojo—, y las dos cosas mienten: la primera dice que cobró el
   doble, la segunda se inventa un reparto que nadie decidió.
   ══════════════════════════════════════════════════════════════════════════ */

export type FilaRol = {
  /** Los grupos que la forman: uno normalmente, varios si comparten persona. */
  grupos: GrupoRol[];
  titulo: string;
  personaId: string | null;
  presupuestado: number;
  /** De lo presupuestado, cuánto lo pone otra fuente. */
  otras: number;
  /** Lo ya girado a esa persona en este fondo. `null` mientras no se sepa
   *  quién es: sin persona no hay recibos que buscar, y un 0 se leería como
   *  «no ha cobrado nada». Un cero no es un cero, es «no lo sé». */
  girado: number | null;
  /** Presupuestado − girado. `null` por lo mismo. */
  falta: number | null;
};

export function filasPorPersona(
  grupos: GrupoRol[],
  giradoDe: (personaId: string) => number,
): FilaRol[] {
  const porPersona = new Map<string, GrupoRol[]>();
  const sueltos: GrupoRol[] = [];
  for (const g of grupos) {
    /* Con dos personas distintas en sus líneas el grupo está mal formado —son
       dos roles metidos en uno—, así que no se funde con nadie: se enseña tal
       cual y la pantalla avisa. */
    const p = g.personas.length === 1 ? g.personas[0] : null;
    if (!p) { sueltos.push(g); continue; }
    porPersona.set(p, [...(porPersona.get(p) || []), g]);
  }

  const filas: FilaRol[] = [];
  for (const [personaId, gs] of porPersona.entries()) {
    const presupuestado = gs.reduce((s, g) => s + g.total, 0);
    const girado = giradoDe(personaId);
    filas.push({
      grupos: gs, personaId, presupuestado, girado, falta: presupuestado - girado,
      otras: gs.reduce((s, g) => s + g.otras, 0),
      titulo: gs.map(g => g.titulo).join(" · "),
    });
  }
  for (const g of sueltos) {
    filas.push({
      grupos: [g], personaId: null, presupuestado: g.total, otras: g.otras,
      girado: null, falta: null, titulo: g.titulo,
    });
  }
  return filas.sort((a, b) => b.presupuestado - a.presupuestado);
}
