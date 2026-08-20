/* Los estados de un caso, en un solo sitio.
   El estado dice CÓMO VA o CÓMO TERMINÓ. Nada más — «si estorba» es otro eje
   (`archivado_en`), ver más abajo. Cada ícono cuenta qué es:
     📥 entró y espera turno   🛠 se está trabajando
     🔭 se vigila, no se cierra hoy   ⏸ está detenido a propósito
     ✅ se hizo   🚫 ya no aplica (se cayó, cambió, se descartó)

   ⚠ «archivada» ya NO es un estado. Era tres cosas a la vez —«se hizo»,
   «ya no aplica», «quítamelo de la vista»— y por eso no decía ninguna bien:
   el «✅ 2/20» de los sub-casos sumaba lo hecho con lo abandonado. Se partió
   en dos ejes el 17/07 (db/archivo-dos-ejes.sql):
     estado        → resuelta | descartada  (cómo terminó)
     archivado_en  → si estorba o no        (ver lib/familia)
   «descartada» es el estado que faltaba: el opuesto de «resuelta». */

export const ESTADO_ICO: Record<string, string> = {
  abierta: "📥", en_progreso: "🛠", seguimiento: "🔭",
  en_pausa: "⏸", resuelta: "✅", descartada: "🚫",
};

export const ESTADO_TXT: Record<string, string> = {
  abierta: "Sin Resolver", en_progreso: "En Progreso", seguimiento: "Seguimiento",
  en_pausa: "En Pausa", resuelta: "Resuelta", descartada: "Descartada",
};

export const ESTADO_COL: Record<string, string> = {
  abierta: "var(--red)", en_progreso: "var(--yellow)", seguimiento: "var(--teal)",
  // Descartada en gris, no en rojo: no es un problema, es un final. Terminó
  // sin hacerse, y ya está — no reclama nada.
  en_pausa: "var(--blue)", resuelta: "var(--green)", descartada: "var(--dim)",
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

/* Un aviso no termina «resuelto» ni «descartado»: rige y deja de regir. Solo
   tiene un estado vivo —Vigente— y se guarda archivándolo, no cerrándolo. */
export const esAviso = (tipo?: string | null) => tipo === "aviso";

/* INFORMATIVO = no es una deuda ni una tarea: se lee, no se resuelve. El aviso
   rige; la bitácora (nota del muro) queda publicada. Ambos muestran su estado
   como algo vivo, en violeta, y no ofrecen «Resuelta».

   ⚠ ESTA REGLA TIENE UN GEMELO EN SQL: `public.es_informativa(text)`, en
   db/qhaway-matutino.sql. El Bot de las 7:30 vive dentro de Postgres y no
   puede leer este archivo; mientras no lo tuvo, le preguntó a cada nota del
   muro «¿sigue vivo?» cada tres días durante meses —y una bitácora no se
   puede cerrar, así que no había forma de callarlo—. Si aquí se agrega un
   tercer tipo informativo, hay que agregarlo allá EL MISMO DÍA. */
export const esInformativo = (tipo?: string | null) => tipo === "aviso" || tipo === "bitacora";
const INFO_TXT: Record<string, Record<string, string>> = {
  aviso: { abierta: "Vigente" },
  bitacora: { abierta: "Publicado" },
};
const INFO_ICO: Record<string, Record<string, string>> = {
  aviso: { abierta: "📢" },
  bitacora: { abierta: "📝" },
};

/* Un aviso VENCIÓ cuando pasó su fecha límite: deja de regir y desde entonces
   se comporta como cerrado —sale del muro y cae en «cerradas»— sin tener que
   archivarlo a mano. Los avisos SIN fecha rigen hasta que otro los reemplace.
   La comparación es por día: «vence hoy» sigue vigente hoy; vence al terminar. */
export const avisoVencido = (tipo?: string | null, fechaLimite?: string | null): boolean => {
  if (!esAviso(tipo) || !fechaLimite) return false;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dl = new Date(String(fechaLimite).slice(0, 10) + "T00:00:00");
  return !isNaN(+dl) && dl < hoy;
};

/* LOS ESTADOS VIVOS — para las consultas de «qué está en curso».
   ⚠ Filtrar por ESTOS ya NO basta para excluir lo archivado. Antes sí:
   `estado='archivada'` sacaba gratis lo archivado de cualquier `.in(estado)`.
   Ahora archivar es `archivado_en`, y un AVISO archivado se queda en 'abierta'
   (Vigente) — así que sigue pasando el filtro de estado. Toda consulta de
   «vivos» tiene que añadir `.is("archivado_en", null)`, o cuenta avisos ya
   archivados como vigentes/pendientes/vencidos. Le pasó a ocho pantallas el
   día que se partió el eje; el muro de la oficina mostraba un aviso archivado
   como «Vigente» para siempre. */
export const ESTADOS_VIVOS = ["abierta", "en_progreso", "seguimiento", "en_pausa"];
/* ⚠ Este export está de momento HUÉRFANO a propósito. Nueve consultas siguen
   escribiendo el array a mano —y por eso a nueve se les olvidó el
   `.is("archivado_en", null)` cuando se partió el eje—. Migrarlas todas a
   `ESTADOS_VIVOS` (y a un helper que ya traiga el filtro de archivado) es la
   forma de que no vuelva a pasar, pero es otra ronda: tocar nueve queries de
   lectura no cabía en ésta sin volverla ingobernable. Queda dicho para que el
   siguiente no crea que ya está hecho. */

/** Texto del estado tal como debe leerse para ESTE tipo de publicación. */
export const textoEstado = (estado: string, tipo?: string | null) =>
  (tipo && INFO_TXT[tipo]?.[estado]) || ESTADO_TXT[estado] || estado;

/** Ícono del estado para ESTE tipo. */
export const icoEstado = (estado: string, tipo?: string | null) =>
  (tipo && INFO_ICO[tipo]?.[estado]) || ESTADO_ICO[estado] || "";

/** Ícono + texto, para pills. */
export const rotuloEstado = (estado: string, tipo?: string | null) =>
  `${icoEstado(estado, tipo)} ${textoEstado(estado, tipo)}`.trim();

/** Sufijo de clase CSS (st-… / est-…). Un aviso vigente va en violeta:
 *  ni rojo (no es una deuda) ni verde (no terminó). Rige. */
export const claseEstado = (estado: string, tipo?: string | null) =>
  esInformativo(tipo) && estado === "abierta" ? "vigente" : estado;

/* Qué estados se le pueden PONER a esto. «archivada» ya no está: archivar es
   una acción aparte (lib/familia · archivado_en), no un estado. Un caso puede
   terminar de dos formas —se hizo (resuelta) o ya no aplica (descartada)—; un
   aviso no pasa por ninguna, solo rige o se pausa.
   Vive aquí y no en cada combo porque ya había dos listas —CaseActions y
   PostCard— y la del feed le ofrecía "Resuelta" a un aviso. */
const OPC_AVISO = ["abierta", "en_pausa"];
const OPC_BITACORA = ["abierta"];
const OPC_CASO = ["abierta", "en_progreso", "seguimiento", "en_pausa", "resuelta", "descartada"];
const HINT: Record<string, string> = {
  seguimiento: " (caso largo)",
  descartada: " (ya no aplica)",   // que nadie la confunda con "resuelta"
};

/** [valor, etiqueta] en el orden del ciclo de vida, para ESTE tipo.
 *  Si `estado` no está entre las opciones —un aviso viejo marcado "resuelta"—
 *  se agrega delante: sin eso el combo muestra otra cosa y el primer cambio
 *  la pisa en silencio. */
export const opcionesEstado = (tipo?: string | null, estado?: string): [string, string][] => {
  const base = tipo === "bitacora" ? OPC_BITACORA : esAviso(tipo) ? OPC_AVISO : OPC_CASO;
  const opc = estado && !base.includes(estado) ? [estado, ...base] : base;
  return opc.map(k => [k, `${rotuloEstado(k, tipo)}${HINT[k] || ""}`]);
};

/* ══════════════════════════════════════════════════════════════════════════
   EL SELLO DE UN CASO TERMINADO

   Las postulaciones ya lo tenían: cuando un concurso acaba, el resultado se
   estampa grande sobre el bloque y no hay que leer nada para saberlo. Los
   casos no, y el desenlace vivía en un desplegable de estado como cualquier
   otro valor — «Descartada» en una lista junto a «En progreso», del mismo
   tamaño y con la misma voz.

   No son lo mismo. Los estados vivos son una elección que sigue abierta; los
   tres de aquí son un final, y un final tiene que verse antes de leer, porque
   cambia qué sentido tiene todo lo demás de la pantalla. Alguien que entra a
   un caso descartado y se pone a redactar un comentario ha perdido el tiempo
   por no haber mirado un desplegable.

   ── EL ORDEN IMPORTA ──
   Archivada gana a los otros dos: un caso puede estar resuelto Y archivado, y
   lo que hay que saber primero es que ya no está en el feed ni en el tablero.
   Es dónde está, no cómo acabó.

   Devuelve `null` para todo lo vivo. Un sello sobre un caso en progreso sería
   exactamente el ruido que esto viene a evitar.
   ══════════════════════════════════════════════════════════════════════════ */
export type SelloCaso = { titulo: string; sub: string; ico: string; tono: string };

export const selloDeCaso = (
  estado?: string | null, archivado?: string | null,
): SelloCaso | null => {
  if (archivado) {
    return { titulo: "Archivada", sub: "fuera del feed", ico: "🗄", tono: "cerrada" };
  }
  if (estado === "descartada") {
    /* ── ROJO APAGADO, NI GRIS NI ALARMA ──
       Nació en gris, el mismo que archivada, y las dos se veían idénticas: dos
       finales distintos con el mismo sello no distinguen nada. Y son cosas
       diferentes — archivar es guardar algo que se terminó; descartar es
       decidir que no se hace.
       Tampoco es el rojo de «no apta»: eso grita error, y aquí no hubo ningún
       error. Un rojo bajado de tono dice «esto se cerró sin hacerse» sin
       reclamar nada. */
    return { titulo: "Descartada", sub: "ya no aplica", ico: "🚫", tono: "descartada" };
  }
  if (estado === "resuelta") {
    return { titulo: "Resuelta", sub: "trabajo terminado", ico: "✅", tono: "gano" };
  }
  return null;
};
