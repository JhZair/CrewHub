/* ══════════════════════════════════════════════════════════════════════════
   lib/leerPdf.ts — SACAR EL TEXTO DE UN PDF ORDENÁNDOLO POR COORDENADAS

   ── POR QUÉ EXISTE ESTE ARCHIVO ──
   El importador de SUNAT nació pidiendo que se pegara el texto del reporte. Con
   la «relación de constancia de pagos» funciona. Con el «detalle de casillas»
   NO, y no por culpa de quien pega: los PDF del PDT llevan las etiquetas y los
   importes escritos en pasadas distintas, así que su flujo interno va
   desordenado. Copiando de ahí sale esto:

       Pagos previos
       326 327 347 305 328 681 185
       0.00
       0.00

   cuando la línea real es «Pagos previos 185 0.00 342 317 0.00». Los códigos de
   casilla quedan separados de sus importes y no hay forma de reconstruir el
   emparejamiento. Se comprobó contra el flujo interno del archivo: no es un
   visor que copie mal, es el PDF. NINGÚN visor lo copia bien, así que decirle a
   nadie «pruébalo en Chrome» era mandarlo a repetir el mismo fracaso.

   Lo que sí funciona es leer el archivo y ordenar cada fragmento por su
   posición en la página —primero por altura, luego por columna—, que es
   exactamente lo que hace un extractor serio. Eso reconstruye la línea
   original, y con ella los pares casilla → importe.

   ── POR QUÉ SIN LIBRERÍA ──
   Un pdfjs completo son varios megas y una dependencia más que mantener, para
   leer un único formulario generado siempre por el mismo sistema. Estos PDF son
   1.4, sin cifrar, sin object streams y sin /ToUnicode: hace falta inflar los
   flujos y entender seis operadores de texto. Lo de abajo es eso y nada más.

   Si algún día SUNAT cambia el generador y esto deja de leer, FALLA EN SECO
   —no devuelve texto— y quien importe verá que no entró nada. Nunca puede
   devolver cifras a medias, que es el único desenlace que aquí importaría.

   ── POR QUÉ EN EL NAVEGADOR ──
   Usa DecompressionStream, que traen todos los navegadores actuales y también
   Node. Así el PDF no sale del ordenador de quien lo abre: son constancias
   tributarias de la asociación y no hay ninguna razón para subirlas a un
   servidor cuando lo único que necesitamos son cuatro cifras.
   ══════════════════════════════════════════════════════════════════════════ */

/** Un fragmento de texto con el sitio de la página donde estaba escrito. */
type Trozo = { x: number; y: number; t: string };

const ESCAPES: Record<string, string> = {
  n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\",
};

/* Lee una cadena literal `(así)` de un flujo de contenido.
   Los paréntesis pueden ANIDARSE sin escapar —«(Pag. 1)» dentro de otra
   cadena— así que hay que contar la profundidad en vez de parar en el primer
   `)`. Y los acentos vienen en octal (`\323` = Ó), que es como el PDT escribe
   «DECLARACIÓN». */
function leerCadena(s: string, i: number): [string, number] {
  let out = "", prof = 1;
  i++;
  while (i < s.length && prof > 0) {
    const c = s[i];
    if (c === "\\") {
      const n = s[i + 1];
      if (n >= "0" && n <= "7") {
        i++;
        let oct = "";
        while (oct.length < 3 && s[i] >= "0" && s[i] <= "7") oct += s[i++];
        out += String.fromCharCode(parseInt(oct, 8));
        continue;
      }
      out += ESCAPES[n] ?? n;
      i += 2;
    } else if (c === "(") { prof++; out += c; i++; }
    else if (c === ")") { prof--; if (prof > 0) out += c; i++; }
    else { out += c; i++; }
  }
  return [out, i];
}

/* ── LOS OPERADORES DE TEXTO QUE HACEN FALTA ──
   Tm fija la matriz (sus dos últimos números son x e y). Td y TD mueven
   relativo al inicio de línea. T* baja una línea usando el interlineado de TL.
   Tj, TJ, ' y " pintan. Todo lo demás —líneas, colores, rectángulos— se ignora,
   que es la mitad larga del archivo. */
function trozosDeFlujo(c: string): Trozo[] {
  const trozos: Trozo[] = [];
  let x = 0, y = 0, lineaX = 0, lineaY = 0, interlineado = 0;
  let nums: number[] = [];
  let textos: string[] = [];

  for (let i = 0; i < c.length; i++) {
    const ch = c[i];

    if (ch === "(") {
      const [t, fin] = leerCadena(c, i);
      textos.push(t);
      i = fin - 1;
      continue;
    }
    if (/\s/.test(ch)) continue;
    /* `[` y `]` delimitan los arrays de TJ y son tokens de UN carácter. Sin
       esta línea el tokenizador de abajo no avanzaba al toparse con ellos y se
       quedaba girando para siempre — pasó, y colgó la prueba. */
    if (ch === "[" || ch === "]") continue;

    let j = i;
    while (j < c.length && !/[\s([\])]/.test(c[j])) j++;
    if (j === i) continue;
    const tok = c.slice(i, j);
    i = j - 1;

    if (/^[-+]?[\d.]+$/.test(tok) && /\d/.test(tok)) { nums.push(Number(tok)); continue; }

    const soltar = () => {
      const t = textos.join("");
      if (t.trim()) trozos.push({ x, y, t });
    };

    switch (tok) {
      case "Tm":
        x = lineaX = nums[nums.length - 2] ?? 0;
        y = lineaY = nums[nums.length - 1] ?? 0;
        break;
      case "Td":
      case "TD":
        x = lineaX += nums[nums.length - 2] ?? 0;
        y = lineaY += nums[nums.length - 1] ?? 0;
        if (tok === "TD") interlineado = -(nums[nums.length - 1] ?? 0);
        break;
      case "TL": interlineado = nums[nums.length - 1] ?? 0; break;
      case "T*": x = lineaX; y = lineaY -= interlineado; break;
      case "Tj": case "TJ": soltar(); break;
      case "'": case '"': x = lineaX; y = lineaY -= interlineado; soltar(); break;
      default: break;
    }
    nums = [];
    textos = [];
  }
  return trozos;
}

/* ── DE TROZOS SUELTOS A LÍNEAS ──
   Se agrupa por altura redondeada: dos fragmentos escritos a la misma altura
   estaban en la misma línea aunque su `y` difiera en décimas por el tamaño de
   letra. Luego cada grupo se ordena de izquierda a derecha y se une con un
   espacio. Ahí es donde el código de casilla vuelve a quedar pegado a su
   importe, que es todo el propósito de este archivo. */
function trozosATexto(trozos: Trozo[]): string {
  const filas = new Map<number, Trozo[]>();
  for (const t of trozos) {
    const k = Math.round(t.y / 2);
    const f = filas.get(k);
    if (f) f.push(t); else filas.set(k, [t]);
  }
  return [...filas.entries()]
    .sort((a, b) => b[0] - a[0])            // la página se lee de arriba abajo
    .map(([, xs]) => xs.sort((a, b) => a.x - b.x)
      .map(t => t.t).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function inflar(bytes: Uint8Array): Promise<string | null> {
  /* Casi todos los flujos son zlib («deflate»); algún generador escribe deflate
     crudo. Se prueban los dos y si ninguno sirve el flujo no era texto —una
     imagen, el perfil de color— y se descarta sin ruido. */
  /* El corte llega hasta la palabra «endstream», así que arrastra el salto de
     línea que la precede. Node rechaza esa cola con TRAILING_JUNK y tira el
     flujo entero por dos bytes de más. */
  let fin = bytes.length;
  while (fin > 0 && (bytes[fin - 1] === 0x0a || bytes[fin - 1] === 0x0d)) fin--;
  const datos = bytes.subarray(0, fin);

  for (const formato of ["deflate", "deflate-raw"] as const) {
    /* ── EL FALLO AQUÍ ES ASÍNCRONO ──
       La primera versión hacía `w.write(...)` sin esperar y envolvía todo en un
       try/catch. El try terminaba antes de que el flujo fallara, así que el
       error salía por otro lado como promesa sin capturar y TUMBABA el proceso
       entero: un PDF con un flujo raro no habría dado «no pude leerlo», habría
       roto la página. Cada promesa se espera y se le cuelga su captura. */
    const ds = new DecompressionStream(formato);
    const salida = new Response(ds.readable).arrayBuffer().catch(() => null);
    try {
      const w = ds.writable.getWriter();
      // El genérico de Uint8Array no encaja con BufferSource desde TS 5.7; los
      // bytes son los mismos.
      await w.write(datos as unknown as BufferSource);
      await w.close();
    } catch { await salida; continue; }
    const buf = await salida;
    if (buf) return latin1(new Uint8Array(buf));
  }
  return null;
}

/* Byte a carácter, sin tocar nada. Hace falta que el índice de la cadena sea
   EL MISMO que el del array de bytes para poder cortar los flujos por posición;
   con TextDecoder("utf-8") los bytes altos se fusionarían y los índices se
   correrían. */
function latin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
}

/**
 * Devuelve el texto de un PDF, línea a línea, en el orden en que se ve.
 * Si el archivo no es un PDF legible devuelve cadena vacía: nunca a medias.
 */
export async function textoDePdf(datos: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  const crudo = latin1(bytes);
  const salida: string[] = [];

  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(crudo))) {
    const fin = crudo.indexOf("endstream", m.index);
    if (fin < 0) continue;
    const texto = await inflar(bytes.subarray(m.index + m[0].length, fin));
    if (!texto || !texto.includes("BT")) continue;   // no es un flujo de página
    const t = trozosATexto(trozosDeFlujo(texto));
    if (t) salida.push(t);
  }
  return salida.join("\n");
}

/** Varios PDF de una vez, uno detrás de otro. Los que no se puedan leer se
 *  DEVUELVEN por su nombre en vez de desaparecer: «importé 3 de 4» sin decir
 *  cuál es exactamente el resultado que se cree y deja un periodo fuera. */
export async function textoDePdfs(
  archivos: { nombre: string; datos: ArrayBuffer }[],
): Promise<{ texto: string; ilegibles: string[] }> {
  const partes: string[] = [];
  const ilegibles: string[] = [];
  for (const a of archivos) {
    let t = "";
    try { t = await textoDePdf(a.datos); } catch { t = ""; }
    if (t.trim()) partes.push(t); else ilegibles.push(a.nombre);
  }
  return { texto: partes.join("\n"), ilegibles };
}
