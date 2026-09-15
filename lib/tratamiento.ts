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

/** Los tres estados, DERIVADOS del Record y no escritos otra vez. Un `Record`
 *  obliga a declarar todas las claves, así que añadir un cuarto estado rompe la
 *  compilación en `META_ESTADO_TRAT` — y la lista de la ayuda lo recoge sola.
 *  Una lista escrita a mano compilaría y lo omitiría en silencio. */
export const ESTADOS_TRAT = Object.keys(META_ESTADO_TRAT) as EstadoTrat[];

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
 * Cuatro situaciones que se ven distinto y se leen distinto:
 *   escrito      — tiene secuencias aquí dentro
 *   enlazado     — solo su `url`: existe, vive en Drive, no está troceado
 *   estructurado — tiene sus ACTOS (y su espina) y ni una secuencia escrita
 *   vacío        — ninguna de las tres. Es un documento que alguien creó y no
 *                  volvió a tocar, y decirlo evita que parezca que se perdió.
 *
 * ⚠ `estructurado` ES NUEVO Y ARREGLA UNA MENTIRA.
 * Hasta hoy solo se contaban las secuencias, así que un documento que acababa
 * de nacer con su modelo narrativo —tres actos y seis puntos de espina, un
 * mapa entero— se leía igual que uno creado y abandonado: «vacío · ni
 * secuencias ni enlace». Y eso es falso justo en el momento en que alguien
 * acaba de hacer lo correcto.
 * Son dos estados distintos y se atienden distinto: al vacío hay que elegirle
 * un modelo; al estructurado hay que sentarse a escribirlo. Pintarlos iguales
 * mandaba a la misma pantalla a resolver dos problemas que no lo son.
 *
 * ⚠ `nSecuencias` viene de fuera y puede ser `undefined` cuando la consulta
 * falló. `undefined` NO es cero: con la lista rota, todo saldría «enlazado» o
 * «vacío» —o sea, «aquí no hay nada escrito»— sobre documentos con veinte
 * secuencias dentro. Por eso existe `no-se-sabe`.
 *
 * ⚠ `nActos` NO tiene ese salvavidas, y es deliberado: omitirlo devuelve el
 * comportamiento viejo —un estructurado se lee «vacío»—, que es el error hacia
 * el lado ruidoso y no hacia el silencioso. Quien llame TIENE que pasarlo; las
 * tres pantallas que lo hacen lo piden embebido con `actos:guion_actos(count)`
 * en la misma consulta, sin viaje de más. */
export type Carga = "escrito" | "enlazado" | "estructurado" | "vacio" | "no-se-sabe";

export function cargaDe(t: Tratamiento, nSecuencias?: number, nActos?: number): Carga {
  if (nSecuencias === undefined || nSecuencias === null) return "no-se-sabe";
  if (nSecuencias > 0) return "escrito";
  /* El enlace manda sobre la estructura: si el documento vive en Drive, lo que
     hay que saber es eso —dónde está— y no que aquí dentro tenga actos. */
  if ((t.url || "").trim()) return "enlazado";
  return (nActos ?? 0) > 0 ? "estructurado" : "vacio";
}

export const META_CARGA: Record<Carga, { txt: string; ayuda: string }> = {
  escrito:  { txt: "escrito aquí", ayuda: "Tiene secuencias dentro del sistema" },
  enlazado: { txt: "solo el enlace", ayuda: "El documento vive fuera (Drive, PDF). Todavía no está troceado en secuencias aquí." },
  estructurado: { txt: "solo la estructura", ayuda: "Tiene sus actos y su espina —el mapa— pero ninguna secuencia escrita. Es el estado normal de un documento recién empezado: falta sentarse a escribirlo." },
  vacio:    { txt: "vacío", ayuda: "Ni estructura, ni secuencias, ni enlace: está creado y sin contenido" },
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
export type Falta = "sin-nada" | "sin-vigente" | "vacio" | "solo-estructura"
  | "corto" | "solo-enlazado" | null;

/* ── UN COLOR POR FALTA ──
   ⚠ Tres de las cinco eran `var(--yellow)`: `sin-nada`, `sin-vigente` y
   `vacio`. Un color que se repite no es un color, es un adorno: la línea de
   arriba salía amarilla entera y no se podía distinguir de un vistazo entre
   «no hay nada escrito» y «hay tres documentos y nadie sabe cuál manda», que
   son problemas distintos y se atienden de forma distinta.
   Es el mismo fallo que se acababa de corregir en ⚖ clearance, y se corrige
   con el mismo criterio: el color dice la GRAVEDAD, no la categoría.

     rojo    — el sistema está mintiendo. Un vigente vacío se cuenta en
               «tiene su documento» y por dentro no hay ni una palabra.
     naranja — hay trabajo hecho pero no se puede usar: nadie sabe cuál leer.
     gris    — no es un fallo. O nadie ha empezado, o vive en Drive y aquí
               solo está el enlace, que es lo normal.

   ⚠ `sin-nada` en GRIS y no en amarillo, a propósito, y esto sorprende: no
   tener nada escrito parece lo más grave. No lo es en esta pantalla. Es el
   estado de partida de toda película nueva, es el más numeroso, y pintarlo de
   alerta convierte el índice en un muro de avisos que se deja de leer. En el
   índice van agrupadas y plegadas aparte, con su número a la vista.
   ⚠ `corto` en gris es la decisión MÁS discutible de las cinco, y la primera
   versión de este comentario la justificó con algo falso: dijo que `corto` ya
   estaba documentada «como no es un error». No lo estaba — solo explicaba la
   regla del destino. Que una ficción se haya quedado en el secuenciado es
   exactamente lo que esta pantalla persigue.
   Va en gris porque es el estado NORMAL de una película que se está
   escribiendo: entre el secuenciado y el guion pasan meses, y pintarlo de
   alerta encendería a la mitad del catálogo todo el rato. Sigue contándose en
   el titular, con su número. Si algún día se quiere perseguir, el sitio de
   cambiarlo es esta línea. */
export const META_FALTA: Record<Exclude<Falta, null>, { txt: string; ayuda: string; col: string }> = {
  "sin-nada": { txt: "sin tratamiento", col: "var(--dim)",
    ayuda: "No hay ningún documento registrado para esta película, ni siquiera el enlace al de Drive. No es un fallo: es donde empieza todo lo que todavía no se ha escrito." },
  "sin-vigente": { txt: "sin vigente", col: "var(--orange)",
    ayuda: "Hay documentos, pero ninguno marcado como el que manda hoy: al entrar, nadie sabe cuál leer." },
  "vacio": { txt: "documento vacío", col: "var(--red)",
    ayuda: "El documento vigente no tiene estructura, ni secuencias, ni enlace: está creado y sin nada dentro. Es el peor de los seis porque MIENTE: la película se cuenta entre las que tienen su documento vigente." },
  /* ⚠ NARANJA, no rojo ni gris, y las dos alternativas se consideraron.
     No es rojo porque aquí sí hay trabajo hecho y es el trabajo correcto:
     alguien eligió el modelo y el documento tiene su mapa. Pintar de alarma el
     resultado de haber hecho lo que tocaba enseña a ignorar el rojo.
     No es gris porque un mapa sin texto NO SE PUEDE LEER NI MANDAR: la
     película sigue contándose entre las que tienen su documento vigente y no
     hay una palabra que enseñar a un jurado. Eso es exactamente el naranja de
     esta pantalla —hay trabajo hecho pero no se puede usar— y por eso también
     apaga el visto verde del titular. */
  "solo-estructura": { txt: "solo la estructura", col: "var(--orange)",
    ayuda: "El documento vigente tiene sus actos y su espina pero ni una secuencia escrita. No es un fallo: es el paso siguiente después de elegir el modelo. Pero todavía no hay nada que leer ni que mandar." },
  "solo-enlazado": { txt: "solo enlazado", col: "var(--dim)",
    ayuda: "El documento está registrado con su enlace pero no se ha troceado en secuencias aquí dentro. No es un error: es lo normal mientras vive en Drive." },
  /* ⚠ La ayuda NO nombra tipos de película, y es una corrección. Decía «en
     ficción y animación el destino es el guion»: son CINCO los tipos con guion
     y `nivelDestino` manda al guion también a `experimental`, mientras que
     `cobertura` para en el secuenciado igual que un documental. A una película
     experimental corta se le enseñaba una explicación que empezaba
     describiendo un tipo que ella no es.
     Quién va a dónde se pinta desde `nivelDestino`, en la ayuda de pantalla. */
  "corto": { txt: "no llegó al guion", col: "var(--dim)",
    ayuda: "El documento que manda hoy se quedó por debajo del destino de esta película: hay un escalón más que escribir. En las que terminan en el tratamiento secuenciado esto no aparece nunca." },
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
  /** Cuántos ACTOS tiene cada documento, por id. Distingue el documento vacío
   *  del que ya tiene su mapa y le falta el texto.
   *  ⚠ `null` o ausente cae en el diagnóstico viejo —todo lo no escrito es
   *  «vacío»—, que exagera en vez de callar. Con la consulta caída prefiero un
   *  rojo de más que una película en verde sin nada dentro. */
  actos: Record<string, number> | null = null,
): FilaPelicula {
  const suyos = ordenarTratamientos(tratamientos.filter(t => t.proyecto_id === peli.id));
  /* Los descartados no cuentan para el diagnóstico: una película cuyo único
     documento se abandonó está, a efectos de escritura, sin tratamiento. */
  const vivos = suyos.filter(t => estadoDe(t) !== "descartado");
  const vigente = vivos.find(t => t.vigente) || null;

  /* ── ESTA CADENA ES DE PRECEDENCIA, NO DE GRAVEDAD ──
     ⚠ Y hasta hoy se decía que eran lo mismo, que es lo que hacía frágil el
     conjunto. Lo que este `if/else` decide es cuál de VARIAS faltas ciertas a
     la vez se dice; el orden en que se PINTAN lo decide `ORDEN_FALTA`.
     Solo dos pares pueden darse a la vez, y en los dos manda la peor:
       · `vacio` antes que `corto`  — una ficción con la sinopsis vigente,
         sin secuencias y sin enlace, es un documento vacío antes que corto.
       · `corto` antes que `solo-enlazado` — lo que importa de una ficción
         secuenciada y enlazada es que no llegó al guion, no dónde vive.
     Los otros tres se excluyen entre sí (sin documentos, sin vigente, y todo
     lo que exige un vigente), así que su sitio aquí da igual. */
  let falta: Falta = null;
  const sinSecuencias = !!cuentas && vigente && (cuentas[vigente.id] ?? 0) === 0;
  if (!vivos.length) falta = "sin-nada";
  else if (!vigente) falta = "sin-vigente";
  /* Vigente sin secuencias Y sin enlace: no hay nada en ninguna parte.
     `cargaDe` ya nombraba este estado —«vacío»— y el diagnóstico era el único
     sitio que lo daba por bueno: la película se contaba en «✔ todas tienen su
     documento vigente» con un documento completamente vacío dentro. */
  /* Y de ese «nada en ninguna parte» se separa el que SÍ tiene su mapa: son
     dos trabajos distintos —elegirle un modelo, o sentarse a escribir— y con
     un solo veredicto la película en rojo mandaba a la pantalla equivocada. */
  else if (sinSecuencias && !(vigente.url || "").trim())
    falta = (actos && (actos[vigente.id] ?? 0) > 0) ? "solo-estructura" : "vacio";
  else if (!llegoAlDestino(vigente, peli.tipo)) falta = "corto";
  else if (sinSecuencias) falta = "solo-enlazado";

  return { peli, tratamientos: suyos, vivos, vigente, falta };
}

/** El recuento de arriba. Sale de las MISMAS filas que se pintan debajo. */
export type Diagnostico = {
  peliculas: number;
  sinNada: number;
  sinVigente: number;
  /** ⚠ `vacio` no se contaba en ninguna parte. La falta existía, se pintaba en
   *  su fila y no entraba en el titular — y como el «✔ todas tienen su
   *  documento vigente» solo miraba `sinNada` y `sinVigente`, una película con
   *  el vigente COMPLETAMENTE VACÍO dejaba encendido el visto verde. Un
   *  diagnóstico que no se suma es un diagnóstico que no existe. */
  vacios: number;
  /** Con el mapa puesto y sin escribir. Cuenta aparte de `vacios` porque se
   *  atiende distinto: aquí no hay nada que decidir, hay que escribir. */
  soloEstructura: number;
  soloEnlazado: number;
  cortos: number;
  /** Cuántos documentos hay en total, para que el titular no hable solo de
   *  huecos: «12 películas · 27 documentos» dice que el módulo se usa. */
  documentos: number;
};

export function resumirDiagnostico(filas: FilaPelicula[]): Diagnostico {
  const r: Diagnostico = { peliculas: filas.length, sinNada: 0, sinVigente: 0,
    vacios: 0, soloEstructura: 0, soloEnlazado: 0, cortos: 0, documentos: 0 };
  for (const f of filas) {
    /* Los VIVOS, no todos: ver el comentario de `FilaPelicula.vivos`. */
    r.documentos += f.vivos.length;
    if (f.falta === "sin-nada") r.sinNada++;
    else if (f.falta === "sin-vigente") r.sinVigente++;
    else if (f.falta === "vacio") r.vacios++;
    else if (f.falta === "solo-estructura") r.soloEstructura++;
    else if (f.falta === "solo-enlazado") r.soloEnlazado++;
    else if (f.falta === "corto") r.cortos++;
  }
  return r;
}

/** ── EL ORDEN DE GRAVEDAD, EN UN SOLO SITIO ──
 *  De peor a mejor, y es el MISMO que el de los colores de `META_FALTA`: rojo,
 *  naranja, y luego los grises. Lo usan el orden del índice y la ayuda de la
 *  pantalla, que antes lo repetía a mano.
 *
 *  ⚠ `sin-nada` va AL FINAL, no al principio, y es un cambio: no tener nada
 *  escrito es el estado de partida de toda película nueva y es el más
 *  numeroso. Arriba convertía el índice en un muro. En `/guion` van agrupadas
 *  y plegadas aparte, con su número a la vista. */
/* ⚠ Un `Record` y no un array, y se derivan las claves. Con
   `ORDEN_FALTA: Falta[] = [...]` escrito a mano, añadir una sexta falta
   compilaba: la nueva desaparecía de la ayuda y caía al final del orden sin
   que nadie se enterara. Un `Record` obliga a darle su sitio. */
const RANGO_FALTA: Record<Exclude<Falta, null>, number> = {
  "vacio": 0, "sin-vigente": 1, "solo-estructura": 2,
  "corto": 3, "solo-enlazado": 4, "sin-nada": 5,
};
export const ORDEN_FALTA = (Object.keys(RANGO_FALTA) as Exclude<Falta, null>[])
  .sort((a, b) => RANGO_FALTA[a] - RANGO_FALTA[b]);

/** El orden del índice: primero lo que le falta algo —es a lo que se entra— y
 *  dentro de cada grupo, por nombre. Las que están al día abajo: se consultan,
 *  no se atienden. */
export function ordenarPeliculas(filas: FilaPelicula[]): FilaPelicula[] {
  const peso = (f: FilaPelicula) => {
    return f.falta ? RANGO_FALTA[f.falta] : ORDEN_FALTA.length;
  };
  return [...filas].sort((a, b) =>
    peso(a) - peso(b)
    || (a.peli.nombre_corto || a.peli.nombre || "").localeCompare(
       b.peli.nombre_corto || b.peli.nombre || "", "es"));
}

/* ══════════════════════════════════════════════════════════════════════════
   LAS DOS FRASES DE UNA FILA DEL ÍNDICE

   El índice de ✍ guion pinta una línea por película y nada más: quien quiera
   escribir entra en la película. Para que esa línea sirva tiene que decir dos
   cosas distintas, y por eso son dos funciones y no una:

     `resumenPelicula` — QUÉ HAY. El documento que manda hoy y su nivel.
     `motivoFalta`     — POR QUÉ está en rojo. El hecho concreto.

   ⚠ Devuelven CADENAS ya compuestas porque el índice las manda a un componente
   de cliente. Una función cruzando esa frontera revienta en runtime y tsc no
   lo ve; está contado en components/ListaPeliculas.tsx.

   ⚠ Y las dos salen de la MISMA `FilaPelicula` que ya decidió `falta`. Un
   motivo calculado aparte del diagnóstico que explica es el que acaba diciendo
   «sin vigente» junto a un documento vigente.
   ══════════════════════════════════════════════════════════════════════════ */

/** Qué hay escrito, en una línea. Vacío cuando no hay nada: una fila que dice
 *  «0 documentos» ocupa lo mismo que decirlo y no añade nada. */
export function resumenPelicula(f: FilaPelicula): string {
  /* ⚠ Los descartados SÍ se nombran, y esto era un fallo de verdad. Una
     película cuyos dos documentos se abandonaron sale «sin tratamiento» —que
     es correcto a efectos de escritura— pero la fila salía además con el
     resumen vacío y agrupada bajo «sin ningún documento, ni siquiera el enlace
     al de Drive». Eso es falso sobre trabajo que existe y que sigue guardado.
     `vivos` decide el diagnóstico; `tratamientos` decide lo que se cuenta. */
  if (!f.vivos.length) {
    const d = f.tratamientos.length;
    return d ? `${d} documento${d === 1 ? "" : "s"}, todos descartados` : "";
  }
  const partes: string[] = [];
  if (f.vigente) {
    partes.push(tituloDe(f.vigente));
    partes.push(metaNivel(nivelDe(f.vigente)).txt.toLowerCase());
  }
  /* El recuento solo cuando hay más de uno: «1 documento» al lado del nombre
     de ese documento es la misma información dos veces. */
  if (f.vivos.length > 1) partes.push(`${f.vivos.length} documentos`);
  return partes.join(" · ");
}

/** El hecho concreto detrás del veredicto. Cadena vacía cuando no hay nada que
 *  explicar — o cuando la explicación sería repetir el veredicto.
 *
 *  ⚠ `sin-nada` devuelve vacío A PROPÓSITO. Son la mayoría de las películas,
 *  van agrupadas y plegadas aparte, y repetir «no hay ningún documento» ochenta
 *  veces debajo de ochenta filas que ya lo dicen es ruido. */
export function motivoFalta(f: FilaPelicula): string {
  /* Lo único que hay que explicar de un «sin tratamiento» es cuando NO es
     verdad del todo: que sí hubo documentos y se abandonaron. */
  if (f.falta === "sin-nada") {
    return f.tratamientos.length
      ? "hubo documentos y están todos descartados: a efectos de escritura, no hay nada vigente"
      : "";
  }
  switch (f.falta) {
    case "sin-vigente":
      return `${f.vivos.length} documento${f.vivos.length === 1 ? "" : "s"}`
        + " y ninguno marcado como el que manda hoy";
    case "vacio":
      return f.vigente
        ? `«${tituloDe(f.vigente)}» manda hoy y no tiene ni estructura, ni secuencias, ni enlace`
        : "";
    case "solo-estructura":
      return f.vigente
        ? `«${tituloDe(f.vigente)}» tiene su estructura puesta y ni una secuencia escrita`
        : "";
    case "corto": {
      const hay = f.vigente ? metaNivel(nivelDe(f.vigente)).txt.toLowerCase() : "";
      const destino = metaNivel(nivelDestino(f.peli.tipo)).txt.toLowerCase();
      return hay ? `se quedó en ${hay}; el destino de esta película es el ${destino}` : "";
    }
    case "solo-enlazado":
      return "está registrado con su enlace, sin trocear en secuencias aquí";
    default:
      return "";
  }
}
