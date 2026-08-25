/* ══════════════════════════════════════════════════════════════════════════
   lib/rheLote.ts — EMPAREJAR UNA CARPETA DE PDF CON SUS RECIBOS

   ── EL PROBLEMA, DICHO CON PRECISIÓN ──
   Hay 58 archivos en una carpeta de Drive y 58 filas en la rendición. Unirlos
   a mano es abrir cada PDF, leer de quién es, buscar su fila y adjuntar: una
   tarde entera, y a la mitad se pierde el sitio.

   ── EL NÚMERO NO ES LA CLAVE ──
   La primera idea fue cruzar por el número del recibo. No sirve, y esto es lo
   que salva la operación: la serie E001 es de CADA emisor. El «E001-22» de
   Wilfredo y el «E001-22» de Katy existen los dos, son recibos distintos por
   montos distintos, y un cruce por número los intercambiaría sin que nada
   fallara. Un comprobante colgado del recibo de otra persona es peor que la
   casilla vacía: la vacía se ve.

   La clave real es EMISOR + NÚMERO. El emisor sale del RUC que el propio PDF
   lleva escrito, y el RUC está en `personas.ruc_dni`.

   ── PUNTEADO ES SUPOSICIÓN, SÓLIDO ES DATO ──
   Cada emparejamiento sale con su MOTIVO y su grado de certeza. Lo que se
   apoya en el RUC es un hecho; lo que se apoya en «el monto coincide y solo
   hay uno» es una suposición razonable, y quien confirma tiene derecho a
   saber cuál de las dos está mirando antes de dar el visto bueno.

   Nada se guarda sin que alguien lo confirme en pantalla.
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo que se pudo leer de UN archivo. Todo opcional: un escaneo no da nada. */
export type DocRhe = {
  archivo: string;
  /** Serie + número normalizados, «E001-22». */
  clave?: string;
  /** RUC de quien emite (el que cobra). En Perú, persona natural = 10……. */
  ruc?: string;
  monto?: number;
  /** ISO, «2024-05-16». */
  fecha?: string;
  /** El nombre de quien emite, tal como sale en la cabecera del recibo. No se
   *  usa para cruzar —los nombres se escriben de mil maneras— pero sí para
   *  decir de quién es un PDF cuyo RUC no está en ninguna ficha. */
  emisor?: string;
  /** true si el PDF no soltó texto (escaneo, foto). */
  ilegible?: boolean;
  /** Cuántos recibos distintos parece traer dentro, si trae más de uno. */
  varios?: number;
};

export type FilaRhe = {
  id: string;
  persona_id: string;
  numero: string | null;
  monto: number;
  fecha: string;
  url: string | null;
  persona?: string;
};

export type Certeza = "seguro" | "probable" | "dudoso" | "ninguno";

export type Cruce = {
  doc: DocRhe;
  /** La fila que SE VA A GUARDAR. Null mientras nadie lo haya decidido.
   *  ⚠ Lo dudoso nunca llega aquí: va en `sugerido`. */
  filaId: string | null;
  /** La fila que la máquina cree, sin atreverse a afirmarlo. Se enseña con un
   *  botón para aceptarla de un toque — la comodidad se conserva, pero el que
   *  la acepta es una persona. Preelegirla habría bastado para que una tanda
   *  de 58 se guardara entera de un clic, suposiciones incluidas, que es
   *  exactamente lo que este archivo existe para evitar. */
  sugerido?: string | null;
  certeza: Certeza;
  /** Por qué se propuso ESA fila, en palabras. Se enseña tal cual. */
  motivo: string;
  /** Las filas que quedaron empatadas, para el desplegable de a mano. */
  candidatos: string[];
};

/* ── NORMALIZAR EL NÚMERO ──
   «E001-22», «E001 - 0022» y «e001-22» son el mismo recibo. Los ceros a la
   izquierda se quitan porque SUNAT los escribe en el PDF y la persona que
   tecleó la fila casi nunca los puso. */
export function claveNumero(n?: string | null): string {
  if (!n) return "";
  /* ⚠ Serie = una letra y TRES dígitos, ni más ni menos. Con `\d{2,3}` y sin
     anclas, «WhatsApp Image 2024-05-16» daba la clave «E202-4» y «Recibo
     12345678» daba «O123-45678»: claves inventadas a partir del nombre del
     archivo que luego podían coincidir con un número tecleado sin separador.
     Una clave falsa es peor que ninguna — ninguna manda el archivo a la
     columna de «asígnalo a mano», que es donde tiene que estar. */
  const m = String(n).toUpperCase()
    .match(/(?:^|[^A-Z0-9])([A-Z]\d{3})\s*-\s*(\d{1,8})(?!\d)/);
  if (!m) return "";
  return `${m[1]}-${String(Number(m[2]))}`;
}

/** Solo dígitos, para comparar RUC y DNI escritos de mil maneras. */
export const soloDigitos = (s?: string | null) => String(s || "").replace(/\D/g, "");

/* ── LEER UN RHE ──
   Se busca por patrón y no por posición: el PDF de SUNAT ha cambiado de
   maqueta varias veces y una lectura «la línea 7, columna 2» se rompe con el
   primer rediseño sin avisar. Lo que no aparece, no se inventa: se queda en
   `undefined` y el cruce lo tratará como lo que es —algo que no se sabe. */
export function leerRhe(archivo: string, texto: string): DocRhe {
  const t = (texto || "").replace(/ /g, " ");
  if (!t.trim()) return { archivo, ilegible: true, ...deNombre(archivo) };

  /* ── EL NÚMERO, EN EL PDF, VA SIN GUION ──
     Comprobado con recibos reales: SUNAT escribe «E001 24», con un espacio.
     La regla estricta de `claveNumero` —que exige guion— es la correcta para
     el NOMBRE DEL ARCHIVO, donde cualquier cifra suelta puede fabricar una
     clave falsa; dentro de un recibo por honorarios, en cambio, «E001 24»
     solo puede ser una cosa. Por eso el texto se lee con su propio patrón.
     Los tres primeros archivos de prueba acertaron por casualidad: el número
     estaba en el nombre del archivo. Con la carpeta real, muchos no lo tendrán. */
  const nums = [...new Set((t.match(/\b[EBR]\d{3}[\s-]+\d{1,8}\b/g) || [])
    .map(x => `${x.slice(0, 4)}-${String(Number(x.slice(4).replace(/\D/g, "")))}`))];
  const mNum = nums[0];
  /* ── UN ARCHIVO CON VARIOS RECIBOS NO SE CRUZA ──
     La descarga agrupada de SOL mete varios RHE en un mismo PDF. Ahí el
     importe mayor y el primer RUC pueden ser de recibos DISTINTOS, y esas dos
     cifras son justo las que ascienden un cruce a «probable». El resultado
     sería un emparejamiento con pinta de razonable construido con datos de dos
     papeles diferentes: se para aquí y se dice. */
  if (nums.length > 1) return { archivo, varios: nums.length };

  /* El RUC del EMISOR. En un RHE aparecen dos: el de quien cobra (persona
     natural, empieza en 10 o 15) y el del cliente (la asociación, 20). Se
     coge el de persona natural, que es el que identifica el recibo.
     Si hubiera varios —un RUC repetido en el pie— da igual: es el mismo. */
  const rucs = (t.match(/\b\d{11}\b/g) || []).filter(r => /^(10|15)/.test(r));

  /* ── LA FECHA VIENE EN LETRAS ──
     «Fecha de emisión 02 de Abril del 2024». Una expresión de dd/mm/aaaa no
     encuentra nada ahí, y la fecha es lo que desempata cuando una persona
     tiene dos recibos del mismo importe. Se leen las dos formas. */
  const mFec = t.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/);
  const mFecTxt = t.match(/(\d{1,2})\s+de\s+([a-zA-ZáéíóúÁÉÍÓÚ]+)\s+d[e]?l?\s+(\d{4})/);

  /* El importe. Se toma el MAYOR de los importes con dos decimales: en un RHE
     conviven el bruto, la retención (8 %) y el neto, y el que aparece en la
     rendición es el bruto —lo que se giró—. Coger «el primero» dependería del
     orden de la maqueta; coger el mayor depende de la aritmética, que no
     cambia con los rediseños. */
  const montos = (t.match(/\d[\d,]*\.\d{2}/g) || [])
    .map(x => Number(x.replace(/,/g, "")))
    .filter(x => x > 0);
  /* Y si el recibo lo dice con todas las letras —«Total por honorarios:
     2,000.00»— se cree eso antes que a la aritmética. El máximo es un buen
     respaldo, no una buena primera opción. */
  const mHon = t.match(/Total\s+por\s+honorarios\s*:?\s*([\d,]+\.\d{2})/i);

  /* El nombre del emisor: la primera línea del recibo, encima del R.U.C. No
     sirve para cruzar —«PEREZ DIAZ KATY» y «Katy Pérez» son la misma persona
     para un humano y dos cadenas distintas para una máquina— pero convierte
     «el RUC no está en ninguna ficha» en «a Katy le falta el RUC en su
     ficha», que ya se puede arreglar. */
  const emisor = (t.split("\n").map(x => x.trim())
    .find(x => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .\-]{7,}$/.test(x)) || "").trim() || undefined;

  return {
    archivo,
    clave: mNum || deNombre(archivo).clave,
    ruc: rucs[0],
    emisor,
    monto: mHon ? Number(mHon[1].replace(/,/g, ""))
      : montos.length ? Math.max(...montos) : undefined,
    fecha: mFec
      ? `${mFec[3]}-${mFec[2].padStart(2, "0")}-${mFec[1].padStart(2, "0")}`
      : mFecTxt ? deLetras(mFecTxt[1], mFecTxt[2], mFecTxt[3])
      : undefined,
  };
}

const MESES = ["enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","setiembre","octubre","noviembre","diciembre"];

/* «02 de Abril del 2024» → «2024-04-02». Setiembre y septiembre se escriben
   de las dos formas en el Perú, y SUNAT usa la primera. */
function deLetras(d: string, mes: string, anio: string): string | undefined {
  const m = mes.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace("septiembre", "setiembre");
  const i = MESES.findIndex(x => x === m);
  if (i < 0) return undefined;
  return `${anio}-${String(i + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/* Del NOMBRE del archivo se saca lo único que suele traer: el número. Es el
   último recurso —para escaneos y fotos— y por eso nunca da «seguro» por sí
   solo. */
function deNombre(archivo: string): { clave?: string } {
  const c = claveNumero(archivo.replace(/\.[a-z0-9]+$/i, ""));
  return c ? { clave: c } : {};
}

/* ══════════════════════════════════════════════════════════════════════════
   EL CRUCE
   ══════════════════════════════════════════════════════════════════════════ */

const casiIgual = (a?: number, b?: number) =>
  a != null && b != null && Math.abs(a - b) < 0.5;

export function cruzar(
  docs: DocRhe[],
  filas: FilaRhe[],
  /** RUC (solo dígitos) → id de persona. Sale de `personas.ruc_dni`. */
  personaPorRuc: Map<string, string>,
): Cruce[] {
  const bruto = docs.map(doc => {
    if (doc.varios) {
      return nada(doc, `El archivo parece traer ${doc.varios} recibos dentro: sepáralos, o asígnalo a mano si sabes cuál es`);
    }
    const persona = doc.ruc ? personaPorRuc.get(soloDigitos(doc.ruc)) : undefined;
    const cn = doc.clave || "";
    /* Se leyó un RUC y no corresponde a ninguna ficha. Es un hallazgo, no un
       fracaso: casi siempre significa que a esa persona le falta el RUC en su
       ficha. Dicho así, se arregla en un minuto; dicho como «no encontré
       nada», se abandona el archivo. */
    const rucHuerfano = !!doc.ruc && !persona;

    /* 1) El camino bueno: RUC + número. Los dos son datos escritos en el
          papel, y juntos identifican el recibo sin ambigüedad posible. */
    if (persona && cn) {
      const exactas = filas.filter(f => f.persona_id === persona && claveNumero(f.numero) === cn);
      if (exactas.length === 1) {
        return ok(doc, exactas[0], "seguro", "RUC del emisor + número del recibo");
      }
      if (exactas.length > 1) {
        return dudoso(doc, exactas, "Esa persona tiene más de un recibo con ese número");
      }
      /* RUC conocido y número que no está: puede ser un recibo que falta por
         registrar. Se dice así, en vez de forzarlo contra otra fila. */
      const suyas = filas.filter(f => f.persona_id === persona);
      if (!suyas.length) {
        return nada(doc, "El RUC es de alguien sin recibos en este fondo");
      }
      const porMonto = suyas.filter(f => casiIgual(f.monto, doc.monto));
      if (porMonto.length === 1) {
        return ok(doc, porMonto[0], "probable", "RUC del emisor + importe (el número no coincide con ninguno suyo)");
      }
      return dudoso(doc, suyas, "Es de esa persona, pero el número no coincide con ninguno de sus recibos");
    }

    /* 2) Solo la persona: si tiene un único recibo aquí, no hay a dónde
          equivocarse. */
    if (persona && !cn) {
      const suyas = filas.filter(f => f.persona_id === persona);
      if (suyas.length === 1) return ok(doc, suyas[0], "probable", "RUC del emisor (tiene un solo recibo en este fondo)");
      const porMonto = suyas.filter(f => casiIgual(f.monto, doc.monto));
      if (porMonto.length === 1) return ok(doc, porMonto[0], "probable", "RUC del emisor + importe");
      if (suyas.length) return dudoso(doc, suyas, "Es de esa persona, pero tiene varios recibos y no pude distinguirlos");
      return nada(doc, "El RUC es de alguien sin recibos en este fondo");
    }

    /* 3) Sin RUC, solo el número. AQUÍ ESTÁ LA TRAMPA que da sentido a todo
          este archivo: «E001-22» lo puede tener cada persona. Si el número
          apunta a más de una fila, NO se elige — ni siquiera si el importe
          desempata, porque dos personas pueden cobrar lo mismo el mismo mes y
          el error resultante sería invisible. */
    if (cn) {
      const mismas = filas.filter(f => claveNumero(f.numero) === cn);
      if (mismas.length === 1) {
        return casiIgual(mismas[0].monto, doc.monto)
          ? ok(doc, mismas[0], "probable", "Número + importe (no pude leer el RUC del emisor)")
          : ok(doc, mismas[0], "dudoso", "Solo el número: es el único recibo con ese número, pero no pude comprobar de quién es");
      }
      if (mismas.length > 1) {
        return dudoso(doc, mismas, `Ese número lo tienen ${mismas.length} recibos de personas distintas`);
      }
    }

    /* 4) Ni RUC ni número: solo queda el importe, y solo si es único. */
    const porMonto = filas.filter(f => casiIgual(f.monto, doc.monto));
    if (porMonto.length === 1) {
      return ok(doc, porMonto[0], "dudoso", "Solo el importe coincide, y con un único recibo");
    }
    if (porMonto.length > 1) return dudoso(doc, porMonto, "Varios recibos con ese mismo importe");
    if (rucHuerfano) {
      return nada(doc, `El RUC ${doc.ruc}${doc.emisor ? ` (${doc.emisor})` : ""} no está en ninguna ficha de persona: cárgalo en su ficha y vuelve a soltar el archivo`);
    }
    return nada(doc, doc.ilegible
      ? "No pude sacar texto del archivo (es un escaneo o una foto)"
      : "No encontré nada que coincida");
  });

  /* ── LO QUE YA TIENE PAPEL NO SE PISA POR SUPOSICIÓN ──
     Un cruce firme —RUC + número— que caiga sobre un recibo que ya tenía PDF
     es casi siempre una resubida, y reemplazar está bien: la pantalla lo
     avisa. Pero una SUPOSICIÓN que además borra lo que había es el peor
     desenlace posible de esta pantalla: se pierde un comprobante correcto por
     una coincidencia de número, y no queda rastro de lo que había antes.
     Esas se sueltan: siguen ahí para elegirlas a mano, que es lo que convierte
     un accidente en una decisión. */
  const conUrl = new Set(filas.filter(f => f.url).map(f => f.id));
  const yaTiene = " — ojo: ese recibo YA tiene comprobante, confírmalo solo si quieres reemplazarlo";
  return bruto.map(c => {
    if (c.filaId && c.certeza !== "seguro" && conUrl.has(c.filaId)) {
      return { ...c, filaId: null, sugerido: c.filaId, certeza: "dudoso" as const,
               motivo: c.motivo + yaTiene };
    }
    /* La misma advertencia para lo que solo se SUGIERE. Se perdía: la
       comprobación miraba `filaId`, y desde que lo dudoso dejó de preelegirse,
       ninguna sugerencia la disparaba — justo las que más falta hacía avisar,
       porque son las que alguien va a aceptar de un toque. */
    if (!c.filaId && c.sugerido && conUrl.has(c.sugerido)) {
      return { ...c, motivo: c.motivo + yaTiene };
    }
    return c;
  });
}

const ok = (doc: DocRhe, f: FilaRhe, certeza: Certeza, motivo: string): Cruce =>
  certeza === "dudoso"
    ? { doc, filaId: null, sugerido: f.id, certeza, motivo, candidatos: [f.id] }
    : { doc, filaId: f.id, certeza, motivo, candidatos: [f.id] };
const dudoso = (doc: DocRhe, fs: FilaRhe[], motivo: string): Cruce =>
  ({ doc, filaId: null, sugerido: fs.length === 1 ? fs[0].id : null,
     certeza: "dudoso", motivo, candidatos: fs.map(f => f.id) });
const nada = (doc: DocRhe, motivo: string): Cruce =>
  ({ doc, filaId: null, certeza: "ninguno", motivo, candidatos: [] });

/* ── DOS ARCHIVOS PARA LA MISMA FILA ──
   El fallo que ninguna heurística evita: dos PDF distintos que acaban
   apuntando al mismo recibo. Uno de los dos está mal por definición, y si se
   sube la tanda tal cual, el segundo pisa al primero y no queda rastro. Se
   detecta antes de guardar y se devuelve por id. */
export function repetidos(cruces: Cruce[]): Set<string> {
  const veces = new Map<string, number>();
  for (const c of cruces) {
    if (c.filaId) veces.set(c.filaId, (veces.get(c.filaId) || 0) + 1);
  }
  return new Set([...veces.entries()].filter(([, n]) => n > 1).map(([id]) => id));
}
