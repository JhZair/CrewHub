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
/* ── UNA REUNIÓN OCURRE, NO SE RESUELVE ──
   Es el motivo de que sea un tipo y no una etiqueta: cambia cómo la trata el
   sistema, no solo de qué va. Su fecha no es un vencimiento sino CUÁNDO pasa;
   pasada la hora no está «vencida» ni «pendiente», está hecha. Con tipo tarea
   se quedaba en el tablero pidiendo que alguien la cerrara, y nadie cierra
   una reunión que ya ocurrió.
   Va ARRIBA de `esInformativo` a propósito: se declara con `const`, así que
   usarla antes de esta línea compila pero revienta si alguien llegara a
   llamarla durante la carga del módulo. */
export const esReunion = (tipo?: string | null) => tipo === "reunion";

export const esInformativo = (tipo?: string | null) =>
  tipo === "aviso" || tipo === "bitacora" || esReunion(tipo);

/* ── QUIÉN LO DIO POR VISTO ──
   El aviso tiene un «me enteré» que dice quiénes lo leyeron. Una reunión usa
   el MISMO mecanismo con otro significado: quién confirma que va. No es una
   pantalla nueva ni una tabla nueva —ya existía— pero hay que decir dónde
   aplica, o cuatro sitios lo preguntan cada uno a su manera: eso es lo que
   pasó cuando el feed ofrecía «Resuelta» a un aviso. */
export const llevaEnterado = (tipo?: string | null) =>
  esAviso(tipo) || esReunion(tipo);
const INFO_TXT: Record<string, Record<string, string>> = {
  aviso: { abierta: "Vigente" },
  bitacora: { abierta: "Publicado" },
  // «Convocada» y no «Vigente»: una reunión se convoca y luego ocurre.
  reunion: { abierta: "Convocada" },
};
const INFO_ICO: Record<string, Record<string, string>> = {
  aviso: { abierta: "📢" },
  bitacora: { abierta: "📝" },
  reunion: { abierta: "🤝" },
};

/* Un aviso VENCIÓ cuando pasó su fecha límite: deja de regir y desde entonces
   se comporta como cerrado —sale del muro y cae en «cerradas»— sin tener que
   archivarlo a mano. Los avisos SIN fecha rigen hasta que otro los reemplace.
   La comparación es por día: «vence hoy» sigue vigente hoy; vence al terminar.
   Una REUNIÓN pasada entra por la misma puerta —deja de ser pendiente el día
   siguiente— pero no desaparece de la agenda: ver `fueraDeAgenda`. */
export const avisoVencido = (tipo?: string | null, fechaLimite?: string | null): boolean => {
  if (!(esAviso(tipo) || esReunion(tipo)) || !fechaLimite) return false;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dl = new Date(String(fechaLimite).slice(0, 10) + "T00:00:00");
  return !isNaN(+dl) && dl < hoy;
};

/* ── PASADA NO ES LO MISMO QUE BORRADA ──
   Una reunión que ya ocurrió sale de lo PENDIENTE —feed, tablero, muro—: no
   hay nada que hacer con ella y dejarla ahí es enseñar a ignorar la lista.
   Pero en la AGENDA se queda, en su día: ahí no es una deuda, es historial —
   «¿cuándo fue la reunión de producción?» es una pregunta que se hace a un
   calendario, y un calendario al que se le borra el pasado deja de servir
   para eso.
   Un aviso vencido sí desaparece de las dos: dejó de regir y no hubo ningún
   hecho, solo un papel que caducó. */
export const fueraDeAgenda = (tipo?: string | null, fechaLimite?: string | null): boolean =>
  !esReunion(tipo) && avisoVencido(tipo, fechaLimite);

/* ── UNA ACTIVIDAD DE CRONOGRAMA CON CASO SIGUE LA VIDA DE SU CASO ──
 *
 * La agenda tiene dos mitades. Los CASOS filtraban bien —`.is("archivado_en",
 * null)` y solo estados vivos—, pero las ACTIVIDADES de cronograma miraban
 * únicamente su propio `estado <> 'cancelada'`. Y una actividad materializada
 * TIENE un caso (`publicacion_id`): al archivar ese caso, el caso desaparecía
 * de la agenda y la actividad se quedaba. En pantalla eran la misma cosa
 * —«Evaluación de APTOS»—, así que archivarla no servía de nada y encima
 * enseñaba que archivar no funciona.
 *
 * La regla: si tiene caso, manda el caso. Si no lo tiene —una actividad que
 * nadie materializó todavía—, manda su propio estado, que es lo único que hay.
 *
 * ── CERRADO EL CASO, LA ACTIVIDAD SE VA ──
 * Archivada, descartada Y RESUELTA. Las tres.
 *
 * Resuelta estuvo fuera de la lista, razonando que en un calendario el pasado
 * es historial y no deuda. El razonamiento es bueno pero se aplicaba a la cosa
 * equivocada: quien guarda ese historial es el CASO, que sigue apareciendo en
 * su día con su ✅. La actividad es el trabajo PREVISTO, y su ventana suele
 * durar semanas — «Registro del tratamiento en Indecopi» iba del 1 al 31 de
 * agosto—, así que se quedaba ocupando la lista de todos los días del mes
 * después de que alguien ya la hubiera cerrado. Se resolvió el caso, se cambió
 * su fecha, y la fila seguía saliendo hoy: el mismo título, sin forma de
 * quitarlo.
 *
 * Cerrar el caso es la manera de decir «esto ya está». Que la actividad siga
 * en pie después convierte ese gesto en algo que no sirve para nada. */
export function actividadFueraDeAgenda(a: {
  estado?: string | null;
  publicacion_id?: string | null;
  /** El caso al que se materializó, si lo hay. */
  pub?: { estado?: string | null; archivado_en?: string | null } | null;
}): boolean {
  if (a.estado === "cancelada") return true;
  /* Con `publicacion_id` pero sin `pub`, quien consultó no pidió el caso: no
     se sabe si está vivo. Se deja pasar —quedarse corto en un calendario es
     mejor que borrar del pasado algo que sí ocurrió— pero conviene pedirlo. */
  const p = a.pub;
  if (!p) return false;
  return !!p.archivado_en || p.estado === "descartada" || p.estado === "resuelta";
}

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
/* Una reunión se convoca y ocurre; lo único que le puede pasar antes es que
   se CANCELE. «En pausa» no significa nada para algo que tiene día y hora, y
   «resuelta» tampoco: no se resuelve, pasa. */
const OPC_REUNION = ["abierta", "descartada"];
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
  const base = tipo === "bitacora" ? OPC_BITACORA
    : esReunion(tipo) ? OPC_REUNION
    : esAviso(tipo) ? OPC_AVISO : OPC_CASO;
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
