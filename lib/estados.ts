/* Los estados de un caso, en un solo sitio.
   Estaban duplicados en ocho archivos y ya habían empezado a divergir:
   unos con ícono, otros sin él. Cada ícono cuenta qué es el estado:
     📥 entró y espera turno   🛠 se está trabajando
     🔭 se vigila, no se cierra hoy   ⏸ está detenido a propósito
     ✅ terminó   🗄 descansa fuera del feed */

export const ESTADO_ICO: Record<string, string> = {
  abierta: "📥", en_progreso: "🛠", seguimiento: "🔭",
  en_pausa: "⏸", resuelta: "✅", archivada: "🗄",
};

export const ESTADO_TXT: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso", seguimiento: "Seguimiento",
  en_pausa: "En Pausa", resuelta: "Resuelta", archivada: "Archivada",
};

export const ESTADO_COL: Record<string, string> = {
  abierta: "var(--red)", en_progreso: "var(--yellow)", seguimiento: "var(--teal)",
  en_pausa: "var(--blue)", resuelta: "var(--green)", archivada: "var(--dim)",
};

/* (Aquí vivían ESTADOS —ícono + texto— y ESTADOS_SEL —la lista fija para los
   combos—. Las reemplazan `rotuloEstado(estado, tipo)` y
   `opcionesEstado(tipo)`: ninguna de las dos puede ser un mapa plano, porque
   el rótulo y las opciones dependen del TIPO de publicación. A un aviso se le
   ofrecía "Resuelta" y se le decía "Sin Resolver" justamente por esto.) */

/* ─────────────────────────────────────────────────────────────────────
   UN AVISO NO SE RESUELVE

   Esto ya lo sabían dos comentarios del sistema desde el día que se
   escribieron:
     AvisoEnterado.tsx  →  «Un aviso no se "resuelve"; importa hasta que
                            el equipo relevante se dio por enterado.»
     actions.ts         →  «el aviso se archiva solo — su ciclo cierra
                            por lectura, no por "resolver".»
   Y sin embargo el rótulo decía 📥 Sin Resolver, en rojo, encima de cada
   aviso. El 17/07 John cargó las indicaciones de una cobertura —«Hoy
   contamos una historia, no solo grabamos una fiesta»— y el sistema se
   la marcó Sin Resolver. Nadie iba a resolver eso. Se lee y se sigue.

   El mecanismo estaba bien construido y el rótulo de arriba lo negaba.
   Un caso abierto es una deuda; un aviso abierto es una instrucción que
   rige. Pintarlos igual es pedir que se resuelva lo que solo hay que
   leer — y es justo lo que John nombró al describir su rodaje:
     «Actividad → qué se hará.  Dirección → cómo debe ejecutarse.
      Caso → qué requiere atención o algo salió mal.»
   Las palabras son suyas: «Puede marcarse como Vigente o Finalizada.»

   ⚠ El `estado` en la base NO cambia: un aviso vigente sigue siendo
   "abierta". No se inventa un estado nuevo para decir lo mismo — eso
   partiría en dos los filtros, el kanban y las consultas. Lo único que
   estaba mal era lo que se muestra, así que es lo único que cambia. */

const AVISO_ICO: Record<string, string> = { abierta: "📢", resuelta: "✔" };
const AVISO_TXT: Record<string, string> = { abierta: "Vigente", resuelta: "Finalizada" };

export const esAviso = (tipo?: string | null) => tipo === "aviso";

/** Texto del estado tal como debe leerse para ESTE tipo de publicación. */
export const textoEstado = (estado: string, tipo?: string | null) =>
  (esAviso(tipo) && AVISO_TXT[estado]) || ESTADO_TXT[estado] || estado;

/** Ícono del estado para ESTE tipo. */
export const icoEstado = (estado: string, tipo?: string | null) =>
  (esAviso(tipo) && AVISO_ICO[estado]) || ESTADO_ICO[estado] || "";

/** Ícono + texto, para pills. */
export const rotuloEstado = (estado: string, tipo?: string | null) =>
  `${icoEstado(estado, tipo)} ${textoEstado(estado, tipo)}`.trim();

/** Sufijo de clase CSS (st-… / est-…). Un aviso vigente va en violeta:
 *  ni rojo (no es una deuda) ni verde (no terminó). Rige. */
export const claseEstado = (estado: string, tipo?: string | null) =>
  esAviso(tipo) && estado === "abierta" ? "vigente" : estado;

/* Qué estados se le pueden PONER a esto. Un aviso no pasa por "En Progreso"
   ni por "Resuelta": rige, se pausa o se archiva. Vive aquí y no en cada
   combo porque ya había dos listas —una en CaseActions y otra en PostCard—
   y la del feed le ofrecía "Resuelta" a un aviso. */
const OPC_AVISO = ["abierta", "en_pausa", "archivada"];
const OPC_CASO = ["abierta", "en_progreso", "seguimiento", "en_pausa", "resuelta", "archivada"];
const HINT: Record<string, string> = { seguimiento: " (caso largo)" };

/** [valor, etiqueta] en el orden del ciclo de vida, para ESTE tipo.
 *  Si `estado` no está entre las opciones —un aviso viejo marcado "resuelta"—
 *  se agrega delante: sin eso el combo muestra otra cosa y el primer cambio
 *  la pisa en silencio. */
export const opcionesEstado = (tipo?: string | null, estado?: string): [string, string][] => {
  const base = esAviso(tipo) ? OPC_AVISO : OPC_CASO;
  const opc = estado && !base.includes(estado) ? [estado, ...base] : base;
  return opc.map(k => [k, `${rotuloEstado(k, tipo)}${HINT[k] || ""}`]);
};
