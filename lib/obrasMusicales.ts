/* ══════════════════════════════════════════════════════════════════════════
   QUÉ SUENA EN LA PELÍCULA Y QUÉ FALTA AVERIGUAR — la regla en un solo sitio

   Lo que hizo falta este archivo, en una sola conversación y un solo
   documental:

     · «Fatal Destino», que toca la banda de Jennifer en el cargo de Lino.
       En el catálogo de APDAYC hay QUINCE registros con ese título exacto,
       cada uno con un compositor distinto —Zenobio Dágha entre ellos, que
       murió en 2008— y ninguno en dominio público. El título no identifica.
     · «Valicha», que todo el mundo canta como tradicional: dos registros, uno
       marcado DP y otro a nombre de una persona.
     · Música hecha con Suno para la pieza, que según Indecopi no tiene autor.
     · Y la interpretación de Las Patronas, que sí es suya y sí se cede.

   Cuatro músicas, cuatro preguntas distintas. Por eso lo que decide qué hay
   que averiguar NO es el título ni el autor: es el ORIGEN.

   ── POR QUÉ ESTO ES UN ARCHIVO ──
   «¿Está resuelta esta música?» se contesta en tres sitios —la etiqueta de
   cada fila, el titular de la película y el diagnóstico de la pantalla— y con
   la regla copiada, el día que cambie se cambia en dos.

   ── UN CERO AQUÍ NO ES UN CERO ──
   Si la consulta de obras falla y llega una lista vacía, «0 sin resolver» se
   lee como «está todo aclarado», que es lo contrario de la verdad sobre unos
   papeles cuya ausencia impide estrenar. Por eso este archivo NO decide qué
   pintar: devuelve los números, y quien llama enseña el error del servidor en
   vez del recuento.

   ⚠ NO IMPORTA NADA DE SUPABASE, y no llama a `new Date()`: el «hoy» entra
   por parámetro. A partir de las 7 de la tarde en Perú `new Date()` ya está en
   el día siguiente, y una licencia vencería un día antes de tiempo.
   ══════════════════════════════════════════════════════════════════════════ */

export type Origen =
  | "dominio_publico" | "preexistente_cedida" | "licenciada" | "ia_generada"
  | "original_encargada" | "biblioteca" | "ambiente";

export type PlanIA = "free" | "basic" | "pro" | "premier" | "otro";

export type FilaObra = {
  id: string;
  proyecto_id?: string | null;
  titulo?: string | null;
  origen?: string | null;
  persona_id?: string | null;
  cesion_id?: string | null;
  autor?: string | null;
  iswc?: string | null;
  consultado_en?: string | null;
  consultado_nota?: string | null;
  prueba_url?: string | null;
  vigente_hasta?: string | null;
  herramienta?: string | null;
  plan_ia?: string | null;
  prompt?: string | null;
  aporte_humano?: string | null;
  resuelto_como?: string | null;
  donde?: string | null;
  nota?: string | null;
};

const limpia = (v?: string | null) => String(v || "").trim();
const baja = (v?: string | null) => limpia(v).toLowerCase();
const hay = (v?: string | null) => !!limpia(v);

export const ORIGENES: Origen[] = [
  "dominio_publico", "preexistente_cedida", "licenciada", "ia_generada",
  "original_encargada", "biblioteca", "ambiente",
];

export const esOrigen = (v: any): v is Origen =>
  ORIGENES.includes(String(v || "") as Origen);

/** El origen, normalizado.
 *
 *  ⚠ Lo que no se entienda cae en `ambiente` y NO en `dominio_publico`.
 *  `ambiente` es el origen que significa «suena algo que no controlamos», que
 *  es exactamente lo que sabemos de una fila con el origen roto. Caer en
 *  dominio público daría por libre lo que nadie ha comprobado, y este archivo
 *  existe para no cometer ese error. */
export const origenDe = (o: FilaObra): Origen =>
  esOrigen(baja(o.origen)) ? (baja(o.origen) as Origen) : "ambiente";

export const PLANES: PlanIA[] = ["free", "basic", "pro", "premier", "otro"];
export const esPlan = (v: any): v is PlanIA =>
  PLANES.includes(String(v || "").toLowerCase() as PlanIA);

/** Los planes que NO permiten uso comercial. Según los términos de Suno, free
 *  y basic limitan el uso a fines «personal and non-commercial», y un
 *  documental que va a festivales o a una emisión es uso comercial aunque no
 *  se venda por entradas. */
const PLAN_SIN_COMERCIAL: PlanIA[] = ["free", "basic"];

export const ROTULO_PLAN: Record<PlanIA, string> = {
  free: "Free", basic: "Basic", pro: "Pro", premier: "Premier",
  otro: "no lo sé",
};

/* ══════════════ QUÉ PIDE CADA ORIGEN ══════════════ */

export type MetaOrigen = {
  ico: string;
  corto: string;
  /** Qué es, dicho entero. El rótulo corto no basta: «licenciada» y
   *  «biblioteca» suenan igual y se prueban con papeles distintos. */
  largo: string;
  /** Los campos del formulario que este origen usa. Los demás se ocultan: un
   *  formulario con catorce campos de los que doce sobran se rellena mal. */
  campos: (keyof FilaObra)[];
};

export const META_ORIGEN: Record<Origen, MetaOrigen> = {
  dominio_publico: {
    ico: "🕊", corto: "dominio público",
    largo: "La composición ya no tiene titular. Ojo: que un huayno sea tradicional no significa que esté libre — «Valicha» tiene un registro marcado DP y otro a nombre de una persona.",
    campos: ["autor", "iswc", "consultado_en", "consultado_nota", "prueba_url"],
  },
  preexistente_cedida: {
    ico: "🤝", corto: "preexistente cedida",
    largo: "Existía antes y quien la interpreta nos deja usarla. ⚠ Quien toca cede SU interpretación, no la composición: si es un cover, el tema sigue siendo de su autor.",
    campos: ["autor", "iswc", "consultado_en", "consultado_nota", "prueba_url"],
  },
  licenciada: {
    ico: "📜", corto: "licenciada",
    largo: "Pagada a su titular, con contrato. Anota hasta cuándo vale: una licencia vencida no avisa y la pieza sigue circulando.",
    campos: ["autor", "iswc", "prueba_url", "vigente_hasta"],
  },
  ia_generada: {
    ico: "🤖", corto: "generada con IA",
    largo: "Suno y parientes. No tiene autor —Indecopi no la registra— así que no hay a quién pedir permiso, pero tampoco es tuya. Lo que decide si puedes usarla es el PLAN con el que se generó.",
    campos: ["herramienta", "plan_ia", "prompt", "aporte_humano", "prueba_url"],
  },
  original_encargada: {
    ico: "🎼", corto: "original por encargo",
    largo: "Un compositor humano contratado para la pieza. Esta sí es música original, y la única que se declara como tal en los créditos.",
    /* ⚠ Sin `vigente_hasta`: un encargo se cede o se licencia a perpetuidad, y
       si de verdad tuviera plazo sería una `licenciada`. Estaba en la lista, se
       pedía en el formulario y NADIE lo miraba —el aviso de vencimiento solo
       cubre licencia y biblioteca—, así que era un campo que se rellenaba para
       no servir de nada. Si algún encargo lleva plazo, va en la nota. */
    campos: ["autor", "iswc", "prueba_url"],
  },
  biblioteca: {
    ico: "🗂", corto: "biblioteca",
    largo: "Artlist, Epidemic Sound y similares. Como la licenciada, pero la prueba es el enlace de la plataforma y la licencia suele tener plazo.",
    campos: ["autor", "prueba_url", "vigente_hasta"],
  },
  ambiente: {
    ico: "📻", corto: "ambiente",
    largo: "Suena en el lugar y no lo controlas: una radio, una banda que pasa. Se resuelve identificándola, bajándola en la mezcla o reemplazándola — y eso hay que anotarlo.",
    campos: ["autor", "resuelto_como"],
  },
};

/** Los orígenes que sí tienen una persona detrás, y a los que por tanto se les
 *  ofrece el selector del reparto y el de su cesión.
 *
 *  Un tema de dominio público no es de nadie y uno de Suno tampoco: enseñarles
 *  el desplegable de personas invita a rellenarlo con quien lo buscó o quien lo
 *  generó, y entonces la columna deja de significar «de quién es la obra».
 *  `ambiente` tampoco: si supieras de quién es, no sería ambiente.
 *  `biblioteca` y `licenciada` sí tienen titular, pero es una empresa o alguien
 *  de fuera del reparto — eso va en `autor`, no en un vínculo a `personas`. */
const ORIGENES_CON_PERSONA: Origen[] = ["preexistente_cedida", "original_encargada"];

/* La lista no se exporta: `llevaPersona` es la única forma de preguntarlo, y
   así nadie fuera puede copiarla ni recorrerla por su cuenta. */
export const llevaPersona = (o: Origen) => ORIGENES_CON_PERSONA.includes(o);

/** Los rótulos de cada campo, para que el formulario y las etiquetas de las
 *  filas usen las mismas palabras. Con dos listas acaban diciendo «Autor» en
 *  un sitio y «Compositor» en otro sobre la misma columna. */
/** Cuánto cabe en cada campo. Vive AQUÍ y no en el formulario porque el
 *  servidor recorta con `.slice()` sin avisar: con dos listas, el `maxLength`
 *  de la pantalla dejaba escribir 2000 caracteres de «qué decía la ficha del
 *  catálogo» y se guardaban 500, sin error y sin que se notara hasta recargar.
 *  Y ese es justo el campo que este módulo declara insustituible, porque el
 *  catálogo cambia y lo que se vio ya no se puede reconstruir.
 *  Un número, un sitio: lo leen el formulario y la acción. */
export const MAX_CAMPO: Record<string, number> = {
  titulo: 200, autor: 200, iswc: 40,
  consultado_nota: 500, prueba_url: 500,
  herramienta: 120, prompt: 2000, aporte_humano: 1000,
  resuelto_como: 500, donde: 200, nota: 1000,
};

export const ROTULO_CAMPO: Partial<Record<keyof FilaObra, { txt: string; pista: string }>> = {
  autor: { txt: "Autor según el catálogo", pista: "tal como lo escribe APDAYC" },
  iswc: { txt: "ISWC", pista: "T0468135387 — es lo único que desempata" },
  consultado_en: { txt: "Consultado el", pista: "" },
  consultado_nota: { txt: "Qué decía la ficha", pista: "«Compositor/Autor: DP»…" },
  prueba_url: { txt: "El papel", pista: "enlace al contrato, la cesión o la descarga" },
  vigente_hasta: { txt: "Vale hasta", pista: "" },
  herramienta: { txt: "Herramienta y modelo", pista: "Suno v4.5 — el modelo importa, se deprecan" },
  plan_ia: { txt: "Plan", pista: "" },
  prompt: { txt: "Prompt", pista: "el que la generó" },
  aporte_humano: { txt: "Qué hiciste tú encima", pista: "elegir, cortar a imagen, mezclar…" },
  resuelto_como: { txt: "Cómo se resolvió", pista: "bajada en la mezcla, reemplazada…" },
  donde: { txt: "Dónde suena", pista: "secuencia del cargo, créditos…" },
  nota: { txt: "Nota", pista: "" },
};

/* ══════════════ QUÉ LE FALTA A UNA OBRA ══════════════
 *
 * Tres gravedades y no dos, porque son tres cosas distintas:
 *
 *   `bloqueo`  no se puede usar TAL COMO ESTÁ. No es que falte un dato: es que
 *              el dato que hay dice que no. Un tema generado en el plan Free y
 *              una licencia vencida son esto.
 *   `falta`    falta averiguar algo para poder decir que está resuelta.
 *   null       resuelta.
 *
 * Mezclar las dos primeras sería el error caro: si «no puedes usar esto» sale
 * del mismo color que «te falta apuntar el ISWC», se lee como un pendiente más
 * y se estrena con ello dentro.
 */
export type Gravedad = "bloqueo" | "falta";

export type Pega = {
  gravedad: Gravedad;
  /** Qué pasa, en una frase que se pueda leer sin contexto. */
  txt: string;
};

/** Lo que hace falta saber de la cesión atada. No se pasa la fila entera de
 *  `proyecto_cesion` para no atar este archivo a aquella tabla: lo único que
 *  cambia la respuesta es si está firmada y si hay papel. */
export type CesionAtada = { estado?: string | null; url?: string | null };

/** Las cesiones DE MÚSICA por su id. Se pasa el mapa entero y no una fila suelta
 *  por dos razones:
 *    · el recuento recorre muchas obras, y un `find` por cada una sería recorrer
 *      la lista de cesiones una vez por obra;
 *    · y sobre todo porque así se distingue «no me diste el mapa» de «el mapa
 *      está y ese id no aparece». Lo segundo significa que la cesión se borró o
 *      que le cambiaron el tipo a `imagen`, y entonces la obra apunta a un papel
 *      que ya no autoriza la música — un agujero por el que salía en verde. */
export type MapaCesiones = Map<string, CesionAtada>;

export function pegasDe(o: FilaObra, hoy?: string, ces?: MapaCesiones | null): Pega[] {
  const org = origenDe(o);
  const ps: Pega[] = [];

  switch (org) {
    case "dominio_publico":
      /* La fecha de consulta, y no el autor. «Dominio público» sin fecha es
         una opinión; con fecha es una diligencia que se puede enseñar. Es el
         hallazgo entero de esta tanda metido en un `if`. */
      if (!hay(o.consultado_en))
        ps.push({ gravedad: "falta", txt: "sin verificar en el catálogo" });
      /* El ISWC desempata. Quince «Fatal Destino» y solo el código distingue
         el de Dágha del de Quintana: sin él, «lo busqué» no dice cuál.
         ⚠ Pero `consultado_nota` lo excusa, y tiene que hacerlo: un huayno
         realmente libre puede no estar REGISTRADO, y entonces no hay ISWC que
         apuntar. Sin esta salida, esa fila se quedaba con un ⚠ que ningún clic
         podía apagar — y un aviso que no se puede resolver se deja de leer,
         con todos los demás detrás. La nota es donde se escribe «buscado el
         31/08, no figura en el catálogo». */
      else if (!hay(o.iswc) && !hay(o.consultado_nota))
        ps.push({
          gravedad: "falta",
          txt: "verificada pero sin ISWC: apunta el código, o anota que no figura en el catálogo",
        });
      break;

    case "preexistente_cedida":
      /* Dos preguntas, no una, y es justo la trampa del caso de Jennifer: ella
         cede su interpretación, pero si el tema es un cover la composición
         sigue siendo de otro. Con solo pedir el papel, una fila con la cesión
         firmada saldría en verde ocultando la mitad del problema. */
      if (!hay(o.cesion_id) && !hay(o.prueba_url))
        ps.push({ gravedad: "falta", txt: "sin cesión de quien la interpreta" });
      /* ── LA CESIÓN ATADA, MIRADA DE VERDAD ──
         ⚠ Que el vínculo EXISTA no dice nada: una cesión nace `pendiente`, y
         antes de esto bastaba con atarla para que la obra saliera en verde
         mientras la ficha del proyecto la pintaba en ámbar. Dos pantallas
         diciendo cosas distintas del mismo papel es exactamente lo que atarlas
         venía a evitar, así que aquí se pregunta por el estado.
         `ces` puede no llegar —quien llama no siempre tiene las cesiones a
         mano— y entonces no se inventa nada: no se dice ni que sí ni que no. */
      else if (hay(o.cesion_id) && ces) {
        const c = ces.get(o.cesion_id!);
        if (!c)
          /* El id está puesto y el mapa —que trae TODAS las cesiones de música—
             no lo tiene. O se borró, o le cambiaron el tipo a `imagen`, que
             autoriza que se le grabe y no que su tema suene. En los dos casos
             la obra está apuntando a un papel que no dice lo que hace falta. */
          ps.push({ gravedad: "falta", txt: "la cesión atada ya no existe o dejó de ser de música" });
        else {
          const e = baja(c.estado);
          if (e === "firmada" && !hay(c.url))
            ps.push({ gravedad: "falta", txt: "su cesión dice «firmada» pero no está el documento" });
          else if (e !== "firmada")
            ps.push({
              gravedad: "falta",
              txt: `su cesión está ${e === "no_aplica" ? "marcada «no aplica»" : "pendiente de firma"}`,
            });
        }
      }
      if (!hay(o.consultado_en))
        ps.push({ gravedad: "falta", txt: "falta comprobar de quién es la composición" });
      break;

    case "licenciada":
    case "biblioteca":
      if (!hay(o.prueba_url))
        ps.push({ gravedad: "falta", txt: "sin el papel de la licencia" });
      /* Vencida es BLOQUEO y no falta: el dato está, y dice que no. */
      if (hay(o.vigente_hasta) && hoy && o.vigente_hasta! < hoy)
        ps.push({ gravedad: "bloqueo", txt: `licencia vencida el ${o.vigente_hasta}` });
      break;

    case "ia_generada": {
      if (!hay(o.herramienta))
        ps.push({ gravedad: "falta", txt: "sin decir con qué se generó" });
      const plan = baja(o.plan_ia);
      if (!plan)
        ps.push({ gravedad: "falta", txt: "sin el plan con el que se generó" });
      else if (PLAN_SIN_COMERCIAL.includes(plan as PlanIA))
        /* No es un pendiente: es que no se puede usar. Los términos de Suno
           limitan free y basic a uso «personal and non-commercial», y un
           documental que va a festivales es uso comercial. Se regenera con un
           plan de pago o se cambia de música; apuntar más datos no lo arregla. */
        ps.push({
          gravedad: "bloqueo",
          txt: `generada en plan ${ROTULO_PLAN[plan as PlanIA]}: no permite uso comercial`,
        });
      else if (plan === "otro")
        ps.push({ gravedad: "falta", txt: "el plan está sin identificar" });
      /* La descarga oficial. Los términos de Suno son explícitos: solo lo
         bajado por su canal con el cupo del plan de pago cuenta como uso
         comercial. Un archivo sacado de un ripper no lo cubre aunque pagues.
         Y es lo único que se puede enseñar: sin él, «lo generé con Pro» es una
         afirmación sin fecha. */
      if (!hay(o.prueba_url))
        ps.push({ gravedad: "falta", txt: "sin la descarga oficial guardada" });
      break;
    }

    case "original_encargada":
      if (!hay(o.autor))
        ps.push({ gravedad: "falta", txt: "sin decir quién la compuso" });
      if (!hay(o.prueba_url))
        ps.push({ gravedad: "falta", txt: "sin el contrato del encargo" });
      break;

    case "ambiente":
      /* Aquí no se pide el autor: si se supiera, no sería ambiente. Lo que se
         pide es qué se hizo con ella, que es lo único que la resuelve. */
      if (!hay(o.resuelto_como))
        ps.push({ gravedad: "falta", txt: "sin resolver: hay que identificarla, bajarla o reemplazarla" });
      break;
  }

  return ps;
}

/** La gravedad de una obra: la peor de sus pegas, o null si no tiene. */
export function gravedadDe(o: FilaObra, hoy?: string, ces?: MapaCesiones | null): Gravedad | null {
  const ps = pegasDe(o, hoy, ces);
  if (ps.some(p => p.gravedad === "bloqueo")) return "bloqueo";
  return ps.length ? "falta" : null;
}

export const COLOR_GRAVEDAD: Record<Gravedad, string> = {
  bloqueo: "var(--red)",
  falta: "var(--yellow)",
};

/* ══════════════ EL RECUENTO ══════════════ */

export type RecuentoObras = {
  obras: number;
  /** Sin ninguna pega. */
  resueltas: number;
  /** Con algo que averiguar. */
  conFalta: number;
  /** Que no se pueden usar tal como están. Se cuenta aparte de `conFalta`
   *  porque no es más de lo mismo: es otra cosa. */
  bloqueadas: number;
  /** Cuántas hay de cada origen. Para el titular: «7 de dominio público · 2
   *  con IA» dice de qué está hecha la película. */
  porOrigen: Record<Origen, number>;
};

export function recuento(obras: FilaObra[], hoy?: string, ces?: MapaCesiones | null): RecuentoObras {
  const porOrigen = Object.fromEntries(ORIGENES.map(o => [o, 0])) as Record<Origen, number>;
  let resueltas = 0, conFalta = 0, bloqueadas = 0;
  for (const o of obras) {
    porOrigen[origenDe(o)]++;
    const g = gravedadDe(o, hoy, ces);
    if (g === "bloqueo") bloqueadas++;
    else if (g === "falta") conFalta++;
    else resueltas++;
  }
  return { obras: obras.length, resueltas, conFalta, bloqueadas, porOrigen };
}

/** El titular, en palabras. Cadena vacía cuando no hay nada que decir, para
 *  que la pantalla no pinte un «0 de 0» que parece un fallo de carga. */
export function resumen(r: RecuentoObras): string {
  if (!r.obras) return "";
  const partes: string[] = [];
  if (r.bloqueadas) partes.push(`${r.bloqueadas} que no se puede${r.bloqueadas === 1 ? "" : "n"} usar`);
  if (r.conFalta) partes.push(`${r.conFalta} sin resolver`);
  if (!partes.length) return `${r.obras} obra${r.obras === 1 ? "" : "s"} · todo aclarado`;
  return `${r.obras} obra${r.obras === 1 ? "" : "s"} · ${partes.join(" · ")}`;
}

/* ══════════════ EL DIAGNÓSTICO TRANSVERSAL ══════════════
 *
 * La pantalla /musica mira TODAS las películas a la vez, igual que /guion.
 * Calcado de `lib/tratamiento.ts` a propósito: dos pantallas hermanas que
 * ordenan distinto se leen como dos criterios distintos, y no lo son.
 */

/* ⚠ El tipo se IMPORTA, no se redefine. La primera versión de este archivo
   tenía su propio `PeliMin` idéntico al del guion, y dos definiciones del mismo
   tipo son dos sitios donde arreglar lo mismo — que es justo lo que la cabecera
   de este archivo dice querer evitar. Además la pantalla ya depende de
   `lib/tratamiento` para `TIPOS_CON_GUION` y `peliculaViva`: es la misma idea
   de «película» en las dos pantallas hermanas, a propósito. */
export type { PeliMin } from "./tratamiento";
import type { PeliMin } from "./tratamiento";

/** Lo que le falta a una PELÍCULA, no a una obra. Ordenado de peor a mejor;
 *  el array manda sobre el orden de la lista, más abajo. */
export type FaltaPeli = "bloqueada" | "con-falta" | "sin-musica" | null;

export type FilaPeliObras = {
  peli: PeliMin;
  obras: FilaObra[];
  rec: RecuentoObras;
  falta: FaltaPeli;
};

export function diagnosticar(
  peli: PeliMin, obras: FilaObra[], hoy?: string, ces?: MapaCesiones | null,
): FilaPeliObras {
  const suyas = obras.filter(o => o.proyecto_id === peli.id);
  const rec = recuento(suyas, hoy, ces);
  let falta: FaltaPeli = null;
  if (rec.bloqueadas) falta = "bloqueada";
  else if (rec.conFalta) falta = "con-falta";
  /* «Sin música» no es un fallo: una película puede no llevar ninguna, o no
     haber llegado a ese punto. Se marca para poder entrar, no para acusar —por
     eso va el último del orden y en gris en la pantalla. */
  else if (!suyas.length) falta = "sin-musica";
  return { peli, obras: suyas, rec, falta };
}

export type DiagnosticoObras = {
  peliculas: number;
  conBloqueo: number;
  conFalta: number;
  sinMusica: number;
  /** Cuántas obras hay en total, para que el titular no hable solo de huecos. */
  obras: number;
};

export function resumirDiagnostico(filas: FilaPeliObras[]): DiagnosticoObras {
  const r: DiagnosticoObras = {
    peliculas: filas.length, conBloqueo: 0, conFalta: 0, sinMusica: 0, obras: 0,
  };
  for (const f of filas) {
    r.obras += f.obras.length;
    if (f.falta === "bloqueada") r.conBloqueo++;
    else if (f.falta === "con-falta") r.conFalta++;
    else if (f.falta === "sin-musica") r.sinMusica++;
  }
  return r;
}

/** El orden: primero lo que no se puede usar, luego lo que falta, y al final
 *  lo que está al día. Se consulta, no se atiende. */
export function ordenarPeliculas(filas: FilaPeliObras[]): FilaPeliObras[] {
  /* El MISMO array que usa `diagnosticar`, para que no puedan discrepar: quien
     añada un caso lo añade una vez. */
  const ORDEN: FaltaPeli[] = ["bloqueada", "con-falta", "sin-musica"];
  const peso = (f: FilaPeliObras) => {
    const i = ORDEN.indexOf(f.falta);
    return i < 0 ? ORDEN.length : i;
  };
  return [...filas].sort((a, b) =>
    peso(a) - peso(b)
    || (a.peli.nombre_corto || a.peli.nombre || "").localeCompare(
       b.peli.nombre_corto || b.peli.nombre || "", "es"));
}

export const META_FALTA_PELI: Record<
  Exclude<FaltaPeli, null>, { col: string; ayuda: string }
> = {
  bloqueada: {
    col: "var(--red)",
    ayuda: "Tiene música que no se puede usar tal como está: generada con un plan que no permite uso comercial, o con la licencia vencida.",
  },
  "con-falta": {
    col: "var(--yellow)",
    ayuda: "Tiene música con algo por averiguar: sin verificar en el catálogo, sin el papel, o sin identificar.",
  },
  "sin-musica": {
    col: "var(--dim)",
    ayuda: "Todavía no hay ninguna obra registrada. No es un fallo: puede que no lleve música o que no se haya llegado a ese punto.",
  },
};
