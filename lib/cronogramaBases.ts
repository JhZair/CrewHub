/* ══════════════════════════════════════════════════════════════════════════
   EL CRONOGRAMA QUE VIENE DENTRO DE LAS BASES

   Toda convocatoria DAFO trae, en su último tramo, una tabla de dos columnas
   —qué pasa y cuándo— que hasta hoy se copiaba a mano, fecha por fecha, en el
   cronograma de la convocatoria. Veinte filas por concurso, y son las fechas
   de las que cuelga todo lo demás: el aviso de cierre, la cuenta atrás de
   finalistas, el «sigue: Declaración de ganadores» de cada postulación. Una
   tecleada mal no se nota hasta que la cuenta atrás dice otra cosa que el PDF.

   Aquí solo se LEE. Ni base de datos ni PDF: entra el texto ya extraído y
   salen bloques con filas. Así el parser se prueba contra el texto real de
   unas bases guardado como fixture, sin abrir un PDF ni tocar Supabase — que
   es la única forma de saber que sigue leyendo bien cuando DAFO cambie algo.

   ── LO QUE HACE DIFÍCIL ESTA TABLA NO SON LAS FECHAS ──
   Es que NO es una tabla: son varios bloques. Uno común al concurso y luego
   uno por MODALIDAD —Desarrollo, Producción Nacional, Producción Regiones—, y
   alguno se parte además en categorías. Cada bloque repite las mismas cuatro
   filas («Revisión de postulaciones», «Declaración de beneficiarios») con
   fechas DISTINTAS.

   Y una convocatoria de CrewHub+ es UNA modalidad. Volcar la tabla entera le
   metería tres «Declaración de beneficiarios» contradictorias y ninguna sería
   señalable como la equivocada. Por eso esto devuelve los bloques SEPARADOS y
   no una lista: quién elige es la pantalla, con la persona delante.
   ══════════════════════════════════════════════════════════════════════════ */

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, setiembre: 9, septiembre: 9,
  octubre: 10, noviembre: 11, diciembre: 12,
};
/* «setiembre» Y «septiembre»: las dos son correctas en castellano y DAFO usa
   las dos —a veces en el mismo documento—. Una sola habría dejado un mes
   entero sin leer, y justo el de las declaraciones de beneficiarios. */

const MES = "(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)";

/** Una fecha suelta, ya en ISO. `null` si el día no existe en ese mes. */
function iso(d: number, m: number, a: number): string | null {
  if (!(d >= 1 && d <= 31) || !(m >= 1 && m <= 12) || !(a >= 1900 && a <= 2999)) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  /* ⚠ Comprobación de vuelta y no solo del rango: «31 de febrero» pasa el
     rango y `Date` lo convierte en el 2 o 3 de marzo sin quejarse. Una fecha
     inventada en silencio es peor que no leer la fila. */
  if (f.getUTCDate() !== d || f.getUTCMonth() !== m - 1) return null;
  return f.toISOString().slice(0, 10);
}

export type FechaBases = {
  inicio: string;            // ISO
  fin: string | null;        // ISO, o null si es un solo día
  /** Cómo estaba escrito. Se conserva para poder enseñarlo al confirmar: si el
   *  parser se equivoca, lo que delata el error es el texto original al lado. */
  txt: string;
};

/* ── LAS CINCO FORMAS EN QUE DAFO ESCRIBE UNA FECHA ──
   Salidas del cronograma de Ficción 2026, y el orden de abajo es el que
   importa: van de la MÁS específica a la más general porque todas terminan en
   «<día> de <mes> de <año>». Con el orden al revés, «Del 7 al 27 de abril de
   2026» casaría con la última y devolvería solo el 27 —perdiendo el inicio del
   plazo y sin dar ningún error—. */
const PATRONES: { re: RegExp; lee: (m: RegExpMatchArray) => FechaBases | null }[] = [
  {
    // «Desde el 13 de abril hasta las 13:00 del 02 de junio de 2026»
    re: new RegExp(`Desde\\s+el\\s+(\\d{1,2})\\s+de\\s+${MES}(?:\\s+de\\s+(\\d{4}))?\\s+hasta\\s+(?:las\\s+[\\d:.]+\\s+)?del?\\s+(\\d{1,2})\\s+de\\s+${MES}\\s+de\\s+(\\d{4})`, "i"),
    lee: m => {
      const aFin = Number(m[6]);
      /* El año del INICIO puede no estar escrito —«desde el 13 de abril hasta
         … del 02 de junio de 2026»— y entonces es el del final. */
      const aIni = m[3] ? Number(m[3]) : aFin;
      const i = iso(Number(m[1]), MESES[m[2].toLowerCase()], aIni);
      const f = iso(Number(m[4]), MESES[m[5].toLowerCase()], aFin);
      return i && f ? { inicio: i, fin: f, txt: m[0] } : null;
    },
  },
  {
    // «Del 7 al 27 de abril de 2026» — un solo mes para los dos extremos
    re: new RegExp(`Del\\s+(\\d{1,2})\\s+al\\s+(\\d{1,2})\\s+de\\s+${MES}\\s+de\\s+(\\d{4})`, "i"),
    lee: m => {
      const mes = MESES[m[3].toLowerCase()], a = Number(m[4]);
      const i = iso(Number(m[1]), mes, a), f = iso(Number(m[2]), mes, a);
      return i && f ? { inicio: i, fin: f, txt: m[0] } : null;
    },
  },
  {
    // «Del 7 de abril al 27 de mayo de 2026» — dos meses distintos
    re: new RegExp(`Del\\s+(\\d{1,2})\\s+de\\s+${MES}\\s+al\\s+(\\d{1,2})\\s+de\\s+${MES}\\s+de\\s+(\\d{4})`, "i"),
    lee: m => {
      const a = Number(m[5]);
      const i = iso(Number(m[1]), MESES[m[2].toLowerCase()], a);
      const f = iso(Number(m[3]), MESES[m[4].toLowerCase()], a);
      return i && f ? { inicio: i, fin: f, txt: m[0] } : null;
    },
  },
  {
    /* «Hasta el 30 de abril de 2026» — un tope, no un tramo. Se guarda como un
       solo día: la fecha que importa es la última, y pintar un tramo desde
       quién sabe cuándo sería inventarse un comienzo. */
    re: new RegExp(`Hasta\\s+(?:el\\s+)?(\\d{1,2})\\s+de\\s+${MES}\\s+de\\s+(\\d{4})`, "i"),
    lee: m => {
      const i = iso(Number(m[1]), MESES[m[2].toLowerCase()], Number(m[3]));
      return i ? { inicio: i, fin: null, txt: m[0] } : null;
    },
  },
  {
    // «6 de abril de 2026» — la forma llana
    re: new RegExp(`(\\d{1,2})\\s+de\\s+${MES}\\s+de\\s+(\\d{4})`, "i"),
    lee: m => {
      const i = iso(Number(m[1]), MESES[m[2].toLowerCase()], Number(m[3]));
      return i ? { inicio: i, fin: null, txt: m[0] } : null;
    },
  },
];

/** Lee una fecha suelta. Exportada porque es lo primero que hay que probar
 *  cuando una fila sale rara. */
export function leeFecha(txt: string): FechaBases | null {
  const t = String(txt || "").replace(/\s+/g, " ").trim();
  for (const p of PATRONES) {
    const m = t.match(p.re);
    if (m) return p.lee(m);
  }
  return null;
}

/** Si el texto TERMINA en una fecha, devuelve la fecha y lo que va delante. */
function partePorFechaFinal(buf: string): { nombre: string; fecha: FechaBases } | null {
  const t = buf.replace(/\s+/g, " ").trim();
  for (const p of PATRONES) {
    /* Anclado al final: la fecha es la cola de la fila y el nombre es todo lo
       de delante. Sin el ancla, «Fecha límite de solicitud de excepciones* 4 de
       mayo» partiría por la primera cosa que pareciera fecha. */
    const m = t.match(new RegExp(p.re.source + "\\s*$", "i"));
    if (!m) continue;
    const f = p.lee(m);
    if (!f) continue;
    return { nombre: t.slice(0, t.length - m[0].length).trim(), fecha: f };
  }
  return null;
}

export type FilaBases = { nombre: string; fecha: FechaBases };
export type BloqueBases = {
  /** «Común a todo el concurso», «MODALIDAD: …», «Categoría …». */
  titulo: string;
  /** Un bloque de categoría vive DENTRO de una modalidad. Se guarda para poder
   *  decir «Producción Nacional › Nuevos realizadores» al elegir. */
  padre?: string;
  filas: FilaBases[];
};
export type LecturaBases = {
  bloques: BloqueBases[];
  /** Líneas de la tabla en las que no se reconoció ninguna fecha. Se DEVUELVEN
   *  y no se tiran: es lo único que distingue «aquí no había nada» de «esto no
   *  lo supe leer», y sin ellas un cambio de formato de DAFO se vería como un
   *  cronograma más corto en vez de como un fallo. */
  sinLeer: string[];
};

const TITULO_COMUN = "Común a todo el concurso";

/* Basura de página que se cuela entre las filas de la tabla: el número de
   página suelto, el separador que mete el extractor y el encabezado repetido
   en cada hoja. Si no se quita, se pega al nombre de la fila siguiente y sale
   «38 BASES DEL CONCURSO … Publicación de finalistas». */
const ES_BASURA = (l: string) =>
  !l
  || /^\d{1,3}$/.test(l)
  || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(l)
  || /^BASES DEL CONCURSO/i.test(l);

const ES_MODALIDAD = (l: string) => /^MODALIDAD\s*:/i.test(l);

/* ⚠ CON EL BUFFER VACÍO Y SIN FECHA, o no es un encabezado.
   «Categoría “Tercer largometraje a más”» encabeza un bloque… pero el nombre de
   la fila de arriba también envuelve y su segunda línea empieza igual:
   «categoría “tercer largometraje a más”** 14 de julio de 2026». Sin estas dos
   condiciones, esa continuación abría un bloque falso —con la fecha metida en
   el título— y se COMÍA la fila a la que pertenecía. Salían cinco bloques y uno
   con una sola fila donde había cuatro.
   Las dos condiciones dicen lo mismo por dos caminos, y eso es a propósito: la
   continuación de una fila deja buffer pendiente Y arrastra la fecha. Que
   cualquiera de las dos la descarte es lo que hace esto difícil de romper. */
const ES_CATEGORIA = (l: string, buf: string) =>
  /^Categor[íi]a\s*[“"«]/i.test(l) && !buf.trim() && !leeFecha(l);

/* Continuación de un encabezado de MODALIDAD, que en el PDF ocupa hasta tres
   renglones: «MODALIDAD:PRODUCCIÓN DE LARGOMETRAJES DE FICCIÓN» / «EXCLUSIVO
   PARA LAS REGIONES DEL PAÍS (EXCEPTO LIMA» / «METROPOLITANA Y CALLAO)».
   Sin esto, el segundo y el tercero se pegaban al nombre de la primera fila
   —«EXCLUSIVO PARA LAS REGIONES … Revisión de postulaciones»— y el título del
   bloque quedaba a medias, justo en la palabra que distingue una modalidad de
   otra. Y «NACIONAL», que iba solo en su línea, acababa en `sinLeer`.
   Se reconoce por ser TODO MAYÚSCULAS sin fecha: una fila de datos siempre
   trae fecha, y los nombres de actividad llevan minúsculas. */
const ES_SIGUE_TITULO = (l: string) =>
  /[A-ZÁÉÍÓÚÑ]/.test(l) && !/[a-záéíóúñ]/.test(l) && !leeFecha(l);

/**
 * Saca el cronograma del texto completo de unas bases.
 *
 * ⚠ Busca la ÚLTIMA aparición de «CRONOGRAMA DEL CONCURSO», no la primera: la
 * primera es la del índice, y desde ahí lo que sigue son cuarenta páginas de
 * base legal. Con `indexOf` el parser leía el índice, no encontraba ninguna
 * fecha y devolvía vacío — «estas bases no traen cronograma» sobre unas que sí.
 */
export function leerCronogramaBases(texto: string): LecturaBases {
  const todo = String(texto || "");
  const desde = todo.toUpperCase().lastIndexOf("CRONOGRAMA DEL CONCURSO");
  if (desde < 0) return { bloques: [], sinLeer: [] };

  /* Hasta la llamada al pie («*Se recuerda…») o el siguiente apartado. Sin
     tope, el glosario que va detrás aporta sus propias fechas sueltas y se
     colarían como filas sin nombre. */
  const resto = todo.slice(desde);
  const finCandidatos = [
    resto.search(/\n\s*\*\s*Se\s+recuerda/i),
    resto.search(/\n\s*X?VII+\.\s+GLOSARIO/i),
    resto.search(/\n\s*Las\s+fechas\s+descritas/i),
  ].filter(i => i > 0);
  const tabla = resto.slice(0, finCandidatos.length ? Math.min(...finCandidatos) : resto.length);

  const lineas = tabla.split("\n").map(l => l.replace(/\s+/g, " ").trim());
  const bloques: BloqueBases[] = [];
  const sinLeer: string[] = [];
  let actual: BloqueBases | null = null;
  let modalidad = "";
  let buf = "";
  /** Si el encabezado de modalidad todavía se está escribiendo. */
  let enTitulo = false;

  /* Lo pendiente en el buffer cuando llega un encabezado o se acaba la tabla:
     si nunca casó una fecha, es una línea que no supimos leer. */
  const vaciar = () => {
    const t = buf.trim();
    if (t) sinLeer.push(t);
    buf = "";
  };
  const abre = (titulo: string, padre?: string) => {
    vaciar();
    actual = { titulo, padre, filas: [] };
    bloques.push(actual);
  };

  for (const l of lineas) {
    if (ES_BASURA(l)) continue;
    if (/^CRONOGRAMA DEL CONCURSO/i.test(l)) continue;

    if (ES_MODALIDAD(l)) { modalidad = l; abre(l); enTitulo = true; continue; }
    /* Mientras el encabezado siga abierto, sus renglones se le suman al título
       en vez de leerse como datos. Se cierra en la primera línea que no sea
       mayúsculas-sin-fecha, que es ya la primera fila. */
    if (enTitulo && actual && ES_SIGUE_TITULO(l)) {
      actual.titulo = `${actual.titulo} ${l}`;
      modalidad = actual.titulo;
      continue;
    }
    enTitulo = false;
    if (ES_CATEGORIA(l, buf)) { abre(l, modalidad || undefined); continue; }

    /* El título del concurso —«CONCURSO DE PROYECTOS DE FICCIÓN – 2026»— abre
       el bloque común. Se reconoce por ir TODO EN MAYÚSCULAS y sin fecha; no
       por su texto, que cambia con cada concurso. */
    if (!actual && /^[^a-záéíóúñ]{12,}$/.test(l) && !/\d{1,2} de /i.test(l)) {
      abre(TITULO_COMUN);
      continue;
    }

    if (!actual) abre(TITULO_COMUN);

    /* ── EL NOMBRE PUEDE VENIR PARTIDO EN VARIAS LÍNEAS, Y LA FECHA TAMBIÉN ──
       En el PDF la celda de la izquierda envuelve a dos o tres renglones, y hay
       una fila donde hasta el AÑO cayó a la línea siguiente («Hasta el 25 de
       agosto de» / «2026»). Por eso no se lee línea a línea: se van pegando
       hasta que el acumulado TERMINA en una fecha, y ahí se cierra la fila.
       La fecha es el separador natural de esta tabla — es lo único que toda
       fila tiene y que ningún encabezado tiene. */
    buf = buf ? `${buf} ${l}` : l;
    const corte = partePorFechaFinal(buf);
    if (corte && corte.nombre) {
      actual!.filas.push({ nombre: corte.nombre, fecha: corte.fecha });
      buf = "";
    }
  }
  vaciar();

  /* Un bloque sin filas no es un bloque: es un encabezado que se quedó solo
     —pasa con «MODALIDAD:» partido en dos líneas— y en la pantalla saldría
     como una modalidad elegible que no aporta ninguna fecha. */
  return { bloques: bloques.filter(b => b.filas.length > 0), sinLeer };
}

/* ── ¿QUÉ BLOQUE ES ESTA CONVOCATORIA? ──
   Una propuesta, nunca una decisión: se marca de antemano el bloque que más se
   parece al nombre de la convocatoria para ahorrar el clic, y la persona lo
   confirma o lo cambia. Acertar sola no es el objetivo —el objetivo es que
   nadie cargue las fechas de otra modalidad sin enterarse—.

   Se puntúa por palabras compartidas y no por parecido de cadena: «Producción
   Largo Regiones» y «MODALIDAD: PRODUCCIÓN DE LARGOMETRAJES DE FICCIÓN
   EXCLUSIVO PARA LAS REGIONES DEL PAÍS» no se parecen como texto —una mide el
   triple— pero comparten las dos palabras que deciden. */
const VACIAS = new Set([
  "de", "del", "la", "las", "el", "los", "y", "a", "en", "para", "por",
  "modalidad", "categoria", "concurso", "proyectos", "excepto",
]);

const palabras = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ").split(" ")
    .filter(p => p.length > 3 && !VACIAS.has(p));

/** Índice del bloque que mejor casa, o -1 si ninguno comparte nada. */
export function bloqueQueCasa(bloques: BloqueBases[], nombreConvocatoria: string): number {
  const busca = palabras(nombreConvocatoria);
  if (!busca.length) return -1;
  let mejor = -1, mejorN = 0;
  bloques.forEach((b, i) => {
    if (b.titulo === TITULO_COMUN) return;   // el común entra siempre, no compite
    /* Con el padre incluido: una categoría —«Nuevos realizadores»— no dice de
       qué modalidad es, y sin eso «Producción Nacional» no la alcanzaría. */
    const suyas = new Set([...palabras(b.titulo), ...palabras(b.padre || "")]);
    const n = busca.filter(p => suyas.has(p)).length;
    /* Estrictamente mayor: ante un empate se queda el PRIMERO, que es el orden
       del documento. Quedarse con el último sería igual de arbitrario y además
       depende de en qué orden vinieran los bloques. */
    if (n > mejorN) { mejorN = n; mejor = i; }
  });
  return mejor;
}

/** El bloque común, que se carga siempre: sus fechas son del concurso entero
 *  —convocatoria, consultas, cierre de postulación— y valen para cualquier
 *  modalidad. */
export const esComun = (b: BloqueBases) => b.titulo === TITULO_COMUN;
