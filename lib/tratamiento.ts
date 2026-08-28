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

/** Cuántas secuencias tiene cada tratamiento, indexado. Un solo recorrido: la
 *  lista pinta N filas y hacer un `filter` por fila sería recorrerla N veces. */
export function secuenciasPorTratamiento(
  secs: { tratamiento_id?: string | null }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of secs) {
    if (!s.tratamiento_id) continue;
    m.set(s.tratamiento_id, (m.get(s.tratamiento_id) || 0) + 1);
  }
  return m;
}
