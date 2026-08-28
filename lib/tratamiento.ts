/* ══════════════════════════════════════════════════════════════════════════
   EL TRATAMIENTO — qué es, hasta dónde llega y quién lo lee

   Una película no tiene UN guion: tiene una sucesión de documentos. El que se
   presentó al concurso, el que se reescribió con las notas del jurado, el que
   se está usando para rodar. Hasta ahora el sistema solo podía guardar uno
   —las tablas del guion colgaban de `proyecto_id`— y por eso el módulo se
   quedó a medias: en cuanto hizo falta el segundo, no había dónde ponerlo.

   ── TRES NIVELES, NO TRES DOCUMENTOS ──
        sinopsis  →  secuenciado  →  guion
   No son tipos distintos: es hasta dónde ha llegado el MISMO documento. El
   documental para en el secuenciado —lo que la gente diga, lo dirá ella— y la
   ficción y la animación siguen hasta el guion. Y el guion se escribe SOBRE el
   secuenciado: la escena cuelga de la secuencia, no del documento.
   Por eso `nivel` es una escala y no un `tipo`: un documento que sube de nivel
   no cambia de naturaleza, solo se desarrolla.

   ── EL ENLACE ES UN NIVEL CERO QUE NO SE NOMBRA ──
   Los tratamientos reales viven en Drive. Un documento puede existir aquí
   siendo solo su `url` —«2ª entrega DAFO · v3 · ↗ Drive»— y trocearse en
   secuencias más tarde, o nunca. Esto NO es un cuarto nivel: es la diferencia
   entre estar registrado y estar escrito aquí dentro, y se deduce de si tiene
   secuencias. Un nivel más habría obligado a mantenerlo a mano y a que alguien
   olvidara subirlo el día que empezó a escribir.

   ⚠ NO IMPORTA NADA DE SUPABASE: lo leen el servidor y el cliente.
   ══════════════════════════════════════════════════════════════════════════ */

import { modoGuion } from "@/lib/guion";

export type Nivel = "sinopsis" | "secuenciado" | "guion";
export type EstadoTrat = "borrador" | "presentado" | "descartado";

export type Tratamiento = {
  id: string;
  proyecto_id?: string | null;
  postulacion_id?: string | null;
  nombre?: string | null;
  version?: string | null;
  nivel?: string | null;
  estado?: string | null;
  presentado_en?: string | null;
  plantilla?: string | null;
  vigente?: boolean | null;
  url?: string | null;
  nota?: string | null;
  creado_en?: string | null;
  editado_en?: string | null;
};

const limpia = (s?: string | null) => (s || "").trim().toLowerCase();

/* ── LOS NIVELES, EN ORDEN ──
 * El orden del array ES la escala: se usa para saber si un documento llegó
 * más lejos que otro y para pintar hasta dónde tiene que llegar. */
export const NIVELES: { k: Nivel; ico: string; txt: string; que: string }[] = [
  { k: "sinopsis", ico: "◔", txt: "Sinopsis",
    que: "El documento corto: de qué va la película. Todavía sin dividir en secuencias." },
  { k: "secuenciado", ico: "◑", txt: "Tratamiento secuenciado",
    que: "La película contada secuencia a secuencia, en prosa. Es donde para un documental, y es la base sobre la que se escribe un guion." },
  { k: "guion", ico: "●", txt: "Guion",
    que: "Las escenas dentro de cada secuencia, con encabezado y diálogo. Se escribe SOBRE el secuenciado, no en vez de él." },
];

/** El nivel, normalizado. Lo que no reconocemos cae en `secuenciado`, que es
 *  lo que hace la pantalla: un dato raro no puede vaciar un documento escrito. */
export function nivelDe(t: Tratamiento): Nivel {
  const n = limpia(t.nivel);
  return (n === "sinopsis" || n === "guion") ? n : "secuenciado";
}

export const rangoNivel = (n: Nivel) => NIVELES.findIndex(x => x.k === n);
export const metaNivel = (n: Nivel) => NIVELES[rangoNivel(n)] || NIVELES[1];

/** ── HASTA DÓNDE TIENE QUE LLEGAR ESTA PELÍCULA ──
 *  En documental, el tratamiento secuenciado ES el destino: no se escribe un
 *  guion de lo que la gente va a decir. En ficción y animación, el destino es
 *  el guion — y el secuenciado es el paso obligatorio de antes.
 *  Sale de `modoGuion`, que ya decide esto para el vocabulario de la pantalla:
 *  dos criterios para la misma pregunta se separan a la primera corrección. */
export const nivelDestino = (tipoProyecto?: string | null): Nivel =>
  modoGuion(tipoProyecto) === "documental" ? "secuenciado" : "guion";

/** ¿Este documento llegó ya a donde tenía que llegar? */
export const llegoAlDestino = (t: Tratamiento, tipoProyecto?: string | null) =>
  rangoNivel(nivelDe(t)) >= rangoNivel(nivelDestino(tipoProyecto));

export const META_ESTADO_TRAT: Record<EstadoTrat, { ico: string; txt: string; col: string }> = {
  borrador:   { ico: "✎", txt: "borrador",   col: "var(--dim)" },
  presentado: { ico: "📤", txt: "presentado", col: "var(--blue)" },
  descartado: { ico: "✕", txt: "descartado", col: "var(--dim)" },
};

export function estadoDe(t: Tratamiento): EstadoTrat {
  const e = limpia(t.estado);
  return (e === "presentado" || e === "descartado") ? e : "borrador";
}

/** El título de una fila: nombre y versión, sin repetir. «Tratamiento · v3».
 *  Sin la versión, tres documentos llamados «Tratamiento» son indistinguibles
 *  — que es exactamente lo que pasa en una carpeta de Drive. */
export function tituloDe(t: Tratamiento): string {
  const n = (t.nombre || "").trim() || "Tratamiento";
  const v = (t.version || "").trim();
  return v ? `${n} · ${v}` : n;
}

/* ── EN QUÉ ESTADO DE CARGA ESTÁ ──
 * Tres situaciones que se ven distinto y se leen distinto:
 *   escrito   — tiene secuencias aquí dentro
 *   enlazado  — solo su `url`: existe, vive en Drive, no está troceado
 *   vacío     — ni una cosa ni la otra. Es un documento que alguien creó y no
 *               volvió a tocar, y decirlo evita que parezca que se perdió.
 * ⚠ `nSecuencias` viene de fuera y puede ser `undefined` cuando la consulta
 * falló. `undefined` NO es cero: con la lista rota, todo saldría «enlazado» o
 * «vacío» —o sea, «aquí no hay nada escrito»— sobre documentos con veinte
 * secuencias dentro. Por eso hay un cuarto valor. */
export type Carga = "escrito" | "enlazado" | "vacio" | "no-se-sabe";

export function cargaDe(t: Tratamiento, nSecuencias?: number): Carga {
  if (nSecuencias === undefined || nSecuencias === null) return "no-se-sabe";
  if (nSecuencias > 0) return "escrito";
  return (t.url || "").trim() ? "enlazado" : "vacio";
}

export const META_CARGA: Record<Carga, { txt: string; ayuda: string }> = {
  escrito:  { txt: "escrito aquí", ayuda: "Tiene secuencias dentro del sistema" },
  enlazado: { txt: "solo el enlace", ayuda: "El documento vive fuera (Drive, PDF). Todavía no está troceado en secuencias aquí." },
  vacio:    { txt: "vacío", ayuda: "Ni secuencias ni enlace: está creado y sin contenido" },
  "no-se-sabe": { txt: "—", ayuda: "No se pudo contar las secuencias" },
};

/* ── EL ORDEN DE LA LISTA ──
 * El vigente primero —es el que se va a abrir nueve de cada diez veces—, los
 * descartados al final, y en medio por fecha descendente: lo último que se
 * escribió es lo que se está mirando.
 * ⚠ Los descartados NO se esconden. Un tratamiento descartado sigue siendo el
 * que vio un jurado, y en dos años nadie recordará por qué se abandonó esa
 * versión si no está donde se puede leer. */
export function ordenarTratamientos<T extends Tratamiento>(ts: T[]): T[] {
  return [...ts].sort((a, b) => {
    if (!!a.vigente !== !!b.vigente) return a.vigente ? -1 : 1;
    const da = estadoDe(a) === "descartado" ? 1 : 0;
    const db = estadoDe(b) === "descartado" ? 1 : 0;
    if (da !== db) return da - db;
    return String(b.creado_en || "").localeCompare(String(a.creado_en || ""));
  });
}

/* (Aquí vivía `secuenciasPorTratamiento`, que contaba secuencias agrupándolas
   por documento. No lo usa nadie: el recuento viene EMBEBIDO de PostgREST
   —`secs:guion_secuencias(count)`— y llega ya calculado. Existía para consumir
   un array de secuencias falsas que se construía solo para transportar un
   número, y que en un componente de cliente se serializaba entero en el
   payload. Un export que nadie importa es una segunda forma de contar lo mismo
   esperando a discrepar con la primera.) */

/* ══════════════ EL ÍNDICE: /guion ══════════════
 *
 * La pantalla que contesta «¿cómo va el guion?» sin abrir proyecto por
 * proyecto. Agrupada POR PELÍCULA y no como lista plana de documentos: la
 * pregunta que se le hace es «¿cómo va el de X?», y cuarenta documentos de
 * quince películas ordenados por fecha no la contestan.
 *
 * ⚠ El diagnóstico de arriba y las filas de abajo salen de LA MISMA función.
 * Un titular calculado aparte del contenido que resume es el que acaba
 * discrepando —«3 sin tratamiento» sobre una lista donde se ven cuatro— y
 * entonces no se puede creer ninguno de los dos.
 */

/* ── QUÉ PROYECTOS TIENEN GUION ──
 * `proyectos.tipo` incluye `videojuego` y `gestion_cultural`, que no se cuentan
 * en secuencias ni tienen tratamiento. Sin este filtro, el índice los pintaba
 * con 🎭, los sumaba a «N películas» y los acusaba de «⚠ sin tratamiento» —y a
 * un videojuego encima le exigía llegar al guion, porque `modoGuion` manda a
 * ficción todo lo que no es documental—.
 * Y no era solo un número mal: con casi todo diagnosticado, `abiertoPorDefecto`
 * habría desplegado la página entera.
 * La lista sale de lib/etapasProyecto, menos los dos que no son obra
 * audiovisual narrada. */
export const TIPOS_CON_GUION = [
  "documental", "ficcion", "animacion", "experimental", "cobertura",
];
export const tieneGuion = (tipo?: string | null) =>
  TIPOS_CON_GUION.includes((tipo || "").trim().toLowerCase());

export type PeliMin = {
  id: string;
  nombre?: string | null;
  nombre_corto?: string | null;
  tipo?: string | null;
  etapa?: string | null;
};

/** ── ¿SE SIGUE ESCRIBIENDO AQUÍ? ──
 *  NO es `enMarchaProy`, que pregunta otra cosa: aquella exige que el proyecto
 *  ya haya arrancado (`i > 0`), y una película en «idea» no ha arrancado pero
 *  es exactamente donde se escribe el primer tratamiento. Lo único que saca a
 *  una película de esta lista es haber terminado. */
export const peliculaViva = (p: PeliMin) => (p.etapa || "") !== "finalizado";

/** Qué le falta a una película. `null` cuando no le falta nada — y eso NO es
 *  lo mismo que «no lo sé»: si la consulta de tratamientos falló, quien llama
 *  no debe pintar ningún diagnóstico. */
export type Falta = "sin-nada" | "sin-vigente" | "vacio" | "corto" | "solo-enlazado" | null;

export const META_FALTA: Record<Exclude<Falta, null>, { txt: string; ayuda: string; col: string }> = {
  "sin-nada": { txt: "sin tratamiento", col: "var(--yellow)",
    ayuda: "No hay ningún documento registrado para esta película, ni siquiera el enlace al de Drive." },
  "sin-vigente": { txt: "sin vigente", col: "var(--yellow)",
    ayuda: "Hay documentos, pero ninguno marcado como el que manda hoy: al entrar, nadie sabe cuál leer." },
  "vacio": { txt: "documento vacío", col: "var(--yellow)",
    ayuda: "El documento vigente no tiene secuencias NI enlace: está creado y sin nada dentro. `cargaDe` ya nombraba este estado; el diagnóstico era el único sitio que lo daba por bueno." },
  "solo-enlazado": { txt: "solo enlazado", col: "var(--dim)",
    ayuda: "El documento está registrado con su enlace pero no se ha troceado en secuencias aquí dentro. No es un error: es lo normal mientras vive en Drive." },
  "corto": { txt: "no llegó al guion", col: "var(--dim)",
    ayuda: "En ficción y animación el destino es el guion, y este documento se quedó en el tratamiento secuenciado. En documental el secuenciado ES el destino y esto no aparece." },
};

export type FilaPelicula = {
  peli: PeliMin;
  /** Ordenados: el vigente primero, los descartados al final. */
  tratamientos: Tratamiento[];
  /** Los que NO están descartados. El diagnóstico se hace sobre estos, así que
   *  el recuento de arriba tiene que contar los mismos: sumar `tratamientos`
   *  daba titulares como «1 película · 3 documentos · ⚠ 1 sin tratamiento», los
   *  tres descartados, en la misma línea. */
  vivos: Tratamiento[];
  /** El que manda hoy, si lo hay. */
  vigente: Tratamiento | null;
  falta: Falta;
};

/** Una película con sus documentos y qué le falta. El orden de las
 *  comprobaciones es el de gravedad: no tener nada es peor que no tener
 *  vigente, y eso es peor que no haberlo troceado. Solo se dice UNA cosa —la
 *  peor— porque una fila con tres avisos no se lee, se ignora. */
export function diagnosticar(
  peli: PeliMin,
  tratamientos: Tratamiento[],
  cuentas: Record<string, number> | null,
): FilaPelicula {
  const suyos = ordenarTratamientos(tratamientos.filter(t => t.proyecto_id === peli.id));
  /* Los descartados no cuentan para el diagnóstico: una película cuyo único
     documento se abandonó está, a efectos de escritura, sin tratamiento. */
  const vivos = suyos.filter(t => estadoDe(t) !== "descartado");
  const vigente = vivos.find(t => t.vigente) || null;

  /* ⚠ El orden ES el de gravedad, y tiene que coincidir con el de
     `ordenarPeliculas`. En la primera versión no coincidía: aquí se miraba
     `solo-enlazado` antes que `corto`, y allí `corto` pesaba más. Una ficción
     cuyo vigente era una sinopsis enlazada salía en gris y por debajo de
     películas más adelantadas, cuando el hecho que importa es que ni siquiera
     llegó al secuenciado. */
  let falta: Falta = null;
  const sinSecuencias = !!cuentas && vigente && (cuentas[vigente.id] ?? 0) === 0;
  if (!vivos.length) falta = "sin-nada";
  else if (!vigente) falta = "sin-vigente";
  /* Vigente sin secuencias Y sin enlace: no hay nada en ninguna parte.
     `cargaDe` ya nombraba este estado —«vacío»— y el diagnóstico era el único
     sitio que lo daba por bueno: la película se contaba en «✔ todas tienen su
     documento vigente» con un documento completamente vacío dentro. */
  else if (sinSecuencias && !(vigente.url || "").trim()) falta = "vacio";
  else if (!llegoAlDestino(vigente, peli.tipo)) falta = "corto";
  else if (sinSecuencias) falta = "solo-enlazado";

  return { peli, tratamientos: suyos, vivos, vigente, falta };
}

/** El recuento de arriba. Sale de las MISMAS filas que se pintan debajo. */
export type Diagnostico = {
  peliculas: number;
  sinNada: number;
  sinVigente: number;
  soloEnlazado: number;
  cortos: number;
  /** Cuántos documentos hay en total, para que el titular no hable solo de
   *  huecos: «12 películas · 27 documentos» dice que el módulo se usa. */
  documentos: number;
};

export function resumirDiagnostico(filas: FilaPelicula[]): Diagnostico {
  const r: Diagnostico = { peliculas: filas.length, sinNada: 0, sinVigente: 0, soloEnlazado: 0, cortos: 0, documentos: 0 };
  for (const f of filas) {
    /* Los VIVOS, no todos: ver el comentario de `FilaPelicula.vivos`. */
    r.documentos += f.vivos.length;
    if (f.falta === "sin-nada") r.sinNada++;
    else if (f.falta === "sin-vigente") r.sinVigente++;
    else if (f.falta === "solo-enlazado") r.soloEnlazado++;
    else if (f.falta === "corto") r.cortos++;
  }
  return r;
}

/** El orden del índice: primero lo que le falta algo —es a lo que se entra— y
 *  dentro de cada grupo, por nombre. Las que están al día abajo: se consultan,
 *  no se atienden. */
export function ordenarPeliculas(filas: FilaPelicula[]): FilaPelicula[] {
  /* El MISMO orden que el de `diagnosticar`. Sale del array de `Falta`, para
     que no puedan volver a discrepar: quien añada un caso lo añade una vez. */
  const ORDEN: Falta[] = ["sin-nada", "sin-vigente", "vacio", "corto", "solo-enlazado"];
  const peso = (f: FilaPelicula) => {
    const i = ORDEN.indexOf(f.falta);
    return i < 0 ? ORDEN.length : i;
  };
  return [...filas].sort((a, b) =>
    peso(a) - peso(b)
    || (a.peli.nombre_corto || a.peli.nombre || "").localeCompare(
       b.peli.nombre_corto || b.peli.nombre || "", "es"));
}
