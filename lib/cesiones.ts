/* ══════════════════════════════════════════════════════════════════════════
   QUÉ FALTA AUTORIZAR — la regla en un solo sitio

   Jennifer Pachaqutec lidera «Las Patronas», la banda que toca en el cargo de
   Lino. Su música no se compuso para el documental —existía sin nosotros— y
   aun así entra en la pieza. Además la entrevistamos y su banda tiene una
   secuencia. Necesita DOS autorizaciones que nadie firma en el mismo papel:
   que se le grabe, y que su tema suene.

   ── POR QUÉ ESTO ES UN ARCHIVO ──
   «¿Está autorizado esto?» se contesta en tres sitios —la burbuja de cada
   fila, el recuento de la cabecera y el panel que se abre— y con la regla
   copiada, el día que cambie se cambia en dos.

   ── UN CERO AQUÍ NO ES UN CERO ──
   Si la consulta de cesiones falla y llega una lista vacía, «0 sin autorizar»
   se lee como «está todo firmado», que es lo contrario de la verdad sobre los
   papeles cuya ausencia impide estrenar. Por eso este archivo NO decide qué
   pintar: devuelve los números, y quien llama enseña el error del servidor en
   vez del recuento. Es el error más caro que hemos tenido en este proyecto.

   ⚠ NO IMPORTA NADA DE SUPABASE.
   ══════════════════════════════════════════════════════════════════════════ */

export type TipoCesion = "imagen" | "musica" | "otro";
export type EstadoCesion = "pendiente" | "firmada" | "no_aplica";

export type FilaCesion = {
  id: string;
  persona_id: string;
  tipo?: string | null;
  estado?: string | null;
  url?: string | null;
  firmado_en?: string | null;
  obra?: string | null;
  motivo?: string | null;
  nota?: string | null;
};

const limpia = (v?: string | null) => String(v || "").trim().toLowerCase();

export const TIPOS: TipoCesion[] = ["imagen", "musica", "otro"];

/** Lo que autoriza cada tipo, dicho entero. El rótulo corto no basta:
 *  «música» no dice si es la que compuso o la que suena, y esa diferencia es
 *  justamente la que hizo falta el día que apareció Jennifer. */
export const META_TIPO: Record<TipoCesion, { ico: string; corto: string; largo: string }> = {
  /* ── «IMAGEN, VOZ Y TESTIMONIO» Y NO «IMAGEN» A SECAS ──
     Es el nombre del papel que de verdad se firma en un documental, y las tres
     cosas van juntas en él a propósito: quien sale en cámara también habla, y
     lo que cuenta —su testimonio— es suyo aparte de su cara. Con el rótulo
     corto, alguien podía firmar «cesión de imagen» creyendo que autorizaba
     salir en un plano y encontrarse su entrevista entera en la pieza.
     ⚠ Sigue siendo UN tipo y no tres: el valor en la base es `imagen`, no hace
     falta migrar nada, y sobre todo es un solo documento. Partirlo en tres
     filas obligaría a firmar tres papeles donde el mundo real firma uno, y
     dejaría a todo el mundo con dos tercios de cesión para siempre. */
  imagen: {
    ico: "📷", corto: "imagen, voz y testimonio",
    largo: "Autoriza que se le grabe, que su voz suene y que lo que cuenta aparezca en la pieza. Es el papel que se firma una vez y cubre las tres cosas.",
  },
  musica: {
    ico: "🎵", corto: "música",
    largo: "Autoriza que una obra suya —que ya existía— suene dentro de la pieza. No es lo mismo que componer para ella.",
  },
  otro: {
    ico: "📄", corto: "otro",
    largo: "Cualquier otro material de alguien: una foto de archivo, un texto leído, un dibujo.",
  },
};

export const tipoDe = (c: FilaCesion): TipoCesion => {
  const t = limpia(c.tipo);
  return t === "musica" || t === "otro" ? t : "imagen";
};

/** El estado, normalizado. Cualquier cosa rara cae en `pendiente` y NO en
 *  `firmada`: dar por firmado lo que no se entiende es exactamente el error
 *  que este registro existe para no cometer. */
export const estadoDe = (c: FilaCesion): EstadoCesion => {
  const e = limpia(c.estado);
  return e === "firmada" || e === "no_aplica" ? e : "pendiente";
};

export const ROTULO_ESTADO: Record<EstadoCesion, string> = {
  pendiente: "pendiente",
  firmada: "firmada",
  no_aplica: "no aplica",
};

export const COLOR_ESTADO: Record<EstadoCesion, string> = {
  pendiente: "var(--yellow)",
  firmada: "var(--green)",
  no_aplica: "var(--dim)",
};

/** «Firmada» sin documento adjunto. No es un error —el papel puede escanearse
 *  días después— pero tampoco es una firma: es alguien diciendo que la hay.
 *  Se marca aparte para que el recuento no la dé por buena y la pantalla lo
 *  pueda decir sin acusar a nadie. Misma regla que en el reparto del fondo. */
export const firmadaSinPrueba = (c: FilaCesion) =>
  estadoDe(c) === "firmada" && !String(c.url || "").trim();

/** Las cesiones de una persona, agrupadas. Se hace aquí porque las tres
 *  pantallas que las pintan lo necesitan igual. */
export function cesionesPorPersona(cs: FilaCesion[]): Map<string, FilaCesion[]> {
  const m = new Map<string, FilaCesion[]>();
  for (const c of cs) {
    if (!c.persona_id) continue;
    m.set(c.persona_id, [...(m.get(c.persona_id) || []), c]);
  }
  return m;
}

/** La cesión de un tipo para una persona. Para `musica` puede haber varias
 *  —dos temas de la misma banda son dos permisos— así que se devuelve la
 *  lista; los otros tipos traen como mucho una, garantizado por el índice. */
export const deTipo = (cs: FilaCesion[], t: TipoCesion) =>
  cs.filter(c => tipoDe(c) === t);

/* ══════════════ EL RECUENTO ══════════════
 *
 * Cuenta PERSONAS, no papeles. «3 sin autorizar» se entiende; «5 cesiones
 * pendientes» obliga a saber cuántas hacen falta por cabeza, que es un dato
 * que nadie tiene en la cabeza.
 *
 * ⚠ QUÉ CUENTA COMO «FALTA LA IMAGEN».
 * Toda persona del reparto necesita cesión de imagen: se la va a grabar. La
 * de música solo la necesita quien aporte una obra, y eso no se puede deducir
 * —lo sabe quien hizo el rodaje—, así que NO se acusa a nadie de que le falte:
 * se cuenta la que existe y ya. Acusar de un papel que quizá no corresponde
 * llena la pantalla de rojo que nadie puede resolver, y entonces se deja de
 * mirar el rojo entero.
 */
export type RecuentoCesiones = {
  /** Cuántas personas hay en el reparto. Sale de la lista de personas, no de
   *  las cesiones: si es 0 es que no hay nadie, no que falte leer algo. */
  personas: number;
  conImagen: number;
  /** Personas SIN NINGUNA fila de cesión de imagen. No hay papel ni intención
   *  de papel: nadie ha empezado. */
  sinImagen: number;
  /** Personas con la cesión REGISTRADA pero todavía en `pendiente`.
   *
   *  ⚠ Se cuenta aparte de `sinImagen`, y no es una sutileza. Antes iban en el
   *  mismo saco y el titular decía «10 sin cesión de imagen» sobre diez
   *  personas de las que una YA tenía su cesión creada: John la registró, miró
   *  el número y creyó que no se había guardado. Registrar y firmar son dos
   *  pasos distintos, y el trabajo hecho tiene que notarse. */
  imagenPendiente: number;
  imagenNoAplica: number;
  /** Personas con al menos una cesión de música registrada. */
  conMusica: number;
  /** Firmadas que no tienen el documento adjunto. Se dice aparte porque no es
   *  ni «hecho» ni «falta»: es «dice que sí, pero no está el papel». */
  sinPrueba: number;
};

export function recuento(
  personasIds: string[],
  cesiones: FilaCesion[],
): RecuentoCesiones {
  /* ── SIN REPETIDOS ──
     La misma persona puede tener DOS filas en el reparto —como ella misma y
     como «la cantante»—: `proyecto_actores` no lo impide y el código que copia
     al fondo ya filtra duplicados por eso mismo. Contando la lista en crudo,
     Jennifer sumaba dos veces en `personas` y en `conMusica`, y el resumen
     nombraba una banda que no existe.
     Se deduplica AQUÍ y no en quien llama: es justo la clase de regla que este
     archivo existe para tener en un solo sitio. */
  const ids = [...new Set(personasIds.filter(Boolean))];
  const porP = cesionesPorPersona(cesiones);
  let conImagen = 0, sinImagen = 0, imagenPendiente = 0, imagenNoAplica = 0,
      conMusica = 0, sinPrueba = 0;

  for (const id of ids) {
    const suyas = porP.get(id) || [];
    const img = deTipo(suyas, "imagen")[0];
    /* ⚠ No hay fila y hay fila pendiente NO son lo mismo. El `!img || e ===
       "pendiente"` de la primera versión los juntaba, y entonces registrar una
       cesión no cambiaba ningún número: el trabajo hecho era invisible. */
    if (!img) sinImagen++;
    else {
      const e = estadoDe(img);
      if (e === "pendiente") imagenPendiente++;
      else if (e === "no_aplica") imagenNoAplica++;
      else conImagen++;
    }
    if (deTipo(suyas, "musica").length) conMusica++;
  }
  /* Las sin prueba, de cualquier tipo pero SOLO de quien sigue en el reparto.
     Las cesiones sobreviven a quien se quitó de la lista —a propósito, son la
     prueba de que autorizó— pero acusar por una fila que ya no existe deja un
     ⚠ que nadie puede apagar, porque no hay dónde. */
  const enReparto = new Set(ids);
  for (const c of cesiones) if (enReparto.has(c.persona_id) && firmadaSinPrueba(c)) sinPrueba++;

  return { personas: ids.length, conImagen, sinImagen, imagenPendiente,
           imagenNoAplica, conMusica, sinPrueba };
}

/** El titular del bloque, en palabras. Devuelve cadena vacía cuando no hay
 *  nada que decir —sin reparto no hay nada que autorizar— para que la pantalla
 *  no pinte un «0 de 0» que parece un fallo de carga. */
export function resumen(r: RecuentoCesiones): string {
  if (!r.personas) return "";
  const partes: string[] = [];
  if (r.sinImagen) partes.push(`${r.sinImagen} sin cesión de imagen, voz y testimonio`);
  /* «Pendiente de firma» y no «sin cesión»: el papel está registrado y lo que
     falta es que alguien lo firme. Decirlo con las mismas palabras que el caso
     anterior borra el trabajo de quien ya lo dio de alta. */
  if (r.imagenPendiente)
    partes.push(`${r.imagenPendiente} pendiente${r.imagenPendiente === 1 ? "" : "s"} de firma`);
  if (r.sinPrueba) partes.push(`${r.sinPrueba} firmada${r.sinPrueba === 1 ? "" : "s"} sin el documento`);
  if (!partes.length) {
    return r.conMusica
      ? `todo autorizado · ${r.conMusica} con cesión de música`
      : "todo autorizado";
  }
  return partes.join(" · ");
}
