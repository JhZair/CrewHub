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
  /** La retención de 4ta que el recibo declara. `undefined` = no se pudo leer,
   *  que NO es lo mismo que cero: ver `altaDe`. */
  retencion?: number;
  /** ISO, «2024-05-16». */
  fecha?: string;
  /** «Por concepto de …»: para qué se giró. No sirve para cruzar, pero es lo
   *  que hace legible una fila de la rendición dos años después, y viene
   *  escrito en el papel — teclearlo a mano cincuenta veces no lo hace nadie. */
  concepto?: string;
  /** El nombre de quien emite, tal como sale en la cabecera del recibo. No se
   *  usa para cruzar —los nombres se escriben de mil maneras— pero sí para
   *  decir de quién es un PDF cuyo RUC no está en ninguna ficha. */
  emisor?: string;
  /** true si el PDF no soltó texto (escaneo, foto). */
  ilegible?: boolean;
  /** true si algo de lo que se sabe salió del NOMBRE del archivo y no del
   *  papel. Lo que venga de ahí no puede valer «seguro». */
  delNombre?: boolean;
  /** Cuántos recibos distintos parece traer dentro, si trae más de uno. */
  varios?: number;
};

export type FilaRhe = {
  id: string;
  persona_id: string;
  /** El nombre COMPLETO de la ficha. `persona` suele ser el alias —«KatyP»— y
   *  contra el «PEREZ DIAZ KATY» del recibo el alias solo dice la mitad. */
  nombre?: string | null;
  numero: string | null;
  monto: number;
  fecha: string;
  url: string | null;
  persona?: string;
};

export type Certeza = "seguro" | "probable" | "dudoso" | "ninguno";

export type Cruce = {
  doc: DocRhe;
  /** Se leyó un RUC y no corresponde a ninguna ficha de persona. Es el
   *  hallazgo más rentable de esta pantalla: cargarlo UNA vez deja bien todos
   *  los recibos de esa persona de golpe. */
  rucSinFicha?: boolean;
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
  /** Una persona lo tocó: eligió fila, o la quitó. Su decisión no se rehace ni
   *  se reinterpreta — en particular, quitar una fila a mano NO puede
   *  convertirse en «pues créalo como gasto nuevo». */
  tocado?: boolean;
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

/* ══════════════════════════════════════════════════════════════════════════
   EL RUC DE UNA PERSONA NATURAL ES SU DNI

   10404559821 = «10» + 40455982 (el DNI) + «1» (dígito de control). No es una
   coincidencia ni una convención local: así los construye SUNAT.

   Esto importa mucho aquí. Las fichas del equipo se cargaron con el DNI —que
   es lo que uno pide para un contrato—, y los recibos traen el RUC. Comparando
   las cifras enteras no coinciden NUNCA, y dieciocho personas aparecían como
   «no está en ninguna ficha» teniendo su ficha delante, con el mismo número
   escrito de otra forma. Un dato que el sistema ya tenía y no reconocía.
   ══════════════════════════════════════════════════════════════════════════ */
export function dniDeRuc(ruc?: string | null): string {
  const d = soloDigitos(ruc);
  return /^10\d{9}$/.test(d) ? d.slice(2, 10) : "";
}

/** Busca por RUC y, si no está, por el DNI que ese RUC lleva dentro. */
export const personaDe = (mapa: Map<string, string>, ruc?: string | null) => {
  const d = soloDigitos(ruc);
  if (!d) return undefined;
  return mapa.get(d) || (dniDeRuc(d) ? mapa.get(dniDeRuc(d)) : undefined);
};

/* ── LEER UN RHE ──
   Se busca por patrón y no por posición: el PDF de SUNAT ha cambiado de
   maqueta varias veces y una lectura «la línea 7, columna 2» se rompe con el
   primer rediseño sin avisar. Lo que no aparece, no se inventa: se queda en
   `undefined` y el cruce lo tratará como lo que es —algo que no se sabe. */
export function leerRhe(archivo: string, texto: string): DocRhe {
  const t = (texto || "").replace(/ /g, " ");
  if (!t.trim()) return { archivo, ilegible: true, ...deNombre(archivo), delNombre: true };

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
  /* ⚠ MANDA LA DE LETRAS. La maqueta escribe la EMISIÓN en letras («02 de
     Abril del 2024»); cualquier fecha en cifras que aparezca —una impresión,
     un pago— es otra cosa, y coger «la primera numérica» la dejaba ganar. */

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
  const mHon = t.match(/Total\s+por\s+honorarios\s*:?\s*(?:S\/\.?\s*)?([\d,]+\.\d{2})/i);

  /* ── LA RETENCIÓN, LEÍDA Y NO SUPUESTA ──
     El papel la trae: «Retención ( %) IR: (0.00)». Darla por cero sin mirar
     era escribir un dato inventado en una fila de rendición — y encima uno que
     nadie va a revisar, porque el cero es lo esperado. Si no se puede leer se
     queda en `undefined`, y `altaDe` se niega a crear la fila: no sabemos
     cuánto se retuvo, y eso cambia lo que la persona cobró. */
  const mRet = t.match(/Retenci[oó]n[^\n]*?\(?\s*([\d,]+\.\d{2})\s*\)?/i);

  /* El nombre del emisor: la primera línea del recibo, encima del R.U.C. No
     sirve para cruzar —«PEREZ DIAZ KATY» y «Katy Pérez» son la misma persona
     para un humano y dos cadenas distintas para una máquina— pero convierte
     «el RUC no está en ninguna ficha» en «a Katy le falta el RUC en su
     ficha», que ya se puede arreglar. */
  const emisor = (t.split("\n").map(x => x.trim())
    .find(x => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .\-]{7,}$/.test(x)) || "").trim() || undefined;

  /* El concepto va entre «Por concepto de» y la siguiente etiqueta de la
     maqueta. Se corta ahí y no en el salto de línea porque el concepto ocupa
     dos y tres renglones a menudo. */
  const mCon = t.match(/Por\s+concepto\s+de\s+([\s\S]*?)\s*(?:Observaci[oó]n|Inciso|Fecha\s+de\s+emisi[oó]n|Total\s+por|$)/i);

  const nom = deNombre(archivo);
  return {
    archivo,
    concepto: mCon ? mCon[1].replace(/\s+/g, " ").trim().slice(0, 400) || undefined : undefined,
    clave: mNum || nom.clave,
    ruc: rucs[0] || nom.ruc,
    delNombre: !mNum || !rucs[0],
    emisor,
    monto: mHon ? Number(mHon[1].replace(/,/g, ""))
      : montos.length ? Math.max(...montos) : undefined,
    retencion: mRet ? Number(mRet[1].replace(/,/g, "")) : undefined,
    fecha: mFecTxt ? deLetras(mFecTxt[1], mFecTxt[2], mFecTxt[3])
      : mFec ? `${mFec[3]}-${mFec[2].padStart(2, "0")}-${mFec[1].padStart(2, "0")}`
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

/* ── EL NOMBRE DEL ARCHIVO TAMBIÉN HABLA ──
   La convención de la carpeta es «F-00212-RHE10430674183-E001-24 x 2000.pdf»:
   trae el RUC y el número. Es el último recurso —para los escaneos, que no
   sueltan texto— y por eso lo que salga de aquí nunca vale «seguro»: el nombre
   lo escribió una persona a mano y una letra de más lo cambia. Pero un recibo
   escaneado con su RUC en el nombre es un archivo que se puede colocar, y
   antes se quedaba fuera. */
function deNombre(archivo: string): { clave?: string; ruc?: string } {
  const base = archivo.replace(/\.[a-z0-9]+$/i, "");
  const c = claveNumero(base);
  /* El RUC pegado a letras («RHE10430674183») no lo encuentra un `\b`: se
     busca la cifra de once que empieza en 10 o 15 esté como esté. */
  const ruc = (base.match(/(?:10|15)\d{9}/g) || [])[0];
  return { ...(c ? { clave: c } : {}), ...(ruc ? { ruc } : {}) };
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
    const persona = personaDe(personaPorRuc, doc.ruc);
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
        /* Si el RUC o el número salieron del NOMBRE del archivo, el cruce vale
           tanto como el cuidado de quien lo bautizó: buen candidato, pero no es
           un dato del papel, así que no se guarda solo. */
        return doc.delNombre
          ? ok(doc, exactas[0], "probable", "RUC + número, leídos del NOMBRE del archivo (el PDF no soltó texto)")
          : ok(doc, exactas[0], "seguro", "RUC del emisor + número del recibo");
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
      /* ── DECIR LA VERDAD SOBRE POR QUÉ NO SE SABE DE QUIÉN ES ──
         Estos mensajes decían «no pude leer el RUC del emisor» también cuando
         el RUC estaba leído y a la vista en la misma fila. La causa real es
         otra —ese RUC no está en ninguna ficha de persona— y es además la
         única que se puede arreglar: cargarlo una vez deja bien TODOS los
         recibos de esa persona. Un mensaje que señala al sitio equivocado no
         es un detalle de redacción: manda a revisar el PDF cuando lo que falta
         es un dato de la ficha. */
      const porQue = rucHuerfano
        ? `el RUC ${doc.ruc}${doc.emisor ? ` (${doc.emisor})` : ""} no está en ninguna ficha`
        : "no pude leer el RUC del emisor";
      const mismas = filas.filter(f => claveNumero(f.numero) === cn);
      if (mismas.length === 1) {
        return casiIgual(mismas[0].monto, doc.monto)
          ? ok(doc, mismas[0], "probable", `Número + importe — ${porQue}`)
          : ok(doc, mismas[0], "dudoso", `Solo el número: es el único con ese número, pero ${porQue}`);
      }
      if (mismas.length > 1) {
        return dudoso(doc, mismas, `Ese número lo tienen ${mismas.length} recibos de personas distintas, y ${porQue}`);
      }
    }

    /* 4) Ni RUC ni número: solo queda el importe, y solo si es único. */
    const porMonto = filas.filter(f => casiIgual(f.monto, doc.monto));
    if (porMonto.length === 1) {
      return ok(doc, porMonto[0], "dudoso", rucHuerfano
        ? `Solo el importe coincide — el RUC ${doc.ruc}${doc.emisor ? ` (${doc.emisor})` : ""} no está en ninguna ficha`
        : "Solo el importe coincide, y con un único recibo");
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
  /* La marca viaja fuera del `motivo` para que la pantalla pueda contar
     cuántos archivos se arreglarían cargando un RUC, y ofrecer hacerlo ahí. */
  const sinFicha = new Set(docs
    .filter(d => d.ruc && !personaDe(personaPorRuc, d.ruc))
    .map(d => d.archivo));
  const conUrl = new Set(filas.filter(f => f.url).map(f => f.id));
  const yaTiene = " — ojo: ese recibo YA tiene comprobante, confírmalo solo si quieres reemplazarlo";
  return bruto.map(cc => {
    const c: Cruce = sinFicha.has(cc.doc.archivo) ? { ...cc, rucSinFicha: true } : cc;
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

/* ══════════════════════════════════════════════════════════════════════════
   ¿ES LA MISMA PERSONA? — solo para ORDENAR, nunca para decidir

   El PDF dice «OROS CONDORI CARLOS ZENON» y la ficha dice «Carlos Oros». Un
   humano lo ve en medio segundo; una comparación de cadenas no. Esto cuenta
   cuántas palabras comparten —sin tildes, sin mayúsculas, sin palabras de dos
   letras— y sirve para poner al candidato más probable ARRIBA del desplegable.

   ⚠ No se usa para asignar nada. Los apellidos se repiten mucho en un mismo
   equipo —aquí hay dos OROS— y «coincide en dos palabras» sería suficiente
   para colgarle a alguien el recibo de su hermano. Ordenar una lista es una
   ayuda; elegir por parecido es una apuesta.
   ══════════════════════════════════════════════════════════════════════════ */
const palabras = (s?: string | null) => String(s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().split(/[^A-Z]+/).filter(x => x.length > 2);

export function parecido(a?: string | null, b?: string | null): number {
  const A = palabras(a), B = palabras(b);
  if (!A.length || !B.length) return 0;
  const setA = new Set(A);
  let pts = B.filter(x => setA.has(x)).length;
  /* ── LOS ALIAS VAN PEGADOS ──
     En este sistema la gente se llama «KatyP», «MichelM», «CarlosO»: el alias
     es el nombre y la inicial del apellido, sin espacio. Comparando palabra
     con palabra, «PEREZ DIAZ KATY» y «KATYP» no comparten NADA y el
     desplegable ordenaba al azar justo en el caso más común.
     Se cuenta también el prefijo: cuatro letras seguidas ya no son casualidad
     entre los quince nombres de un fondo. Sigue siendo solo para ORDENAR. */
  for (const x of B) {
    if (setA.has(x)) continue;
    if (A.some(y => (x.startsWith(y) || y.startsWith(x)) && Math.min(x.length, y.length) >= 4)) pts++;
  }
  return pts;
}

/* ══════════════════════════════════════════════════════════════════════════
   LOS RECIBOS QUE NO ESTÁN REGISTRADOS

   Un fondo que empieza no tiene ni una fila de RHE, así que no hay nada con
   qué cruzar: el importador se quedaba mudo justo cuando más trabajo ahorra.
   Pero el PDF trae TODO lo que una fila necesita —de quién es (por su RUC),
   número, fecha, importe y concepto—, así que se puede dar de alta.

   ── QUÉ SE CONSIDERA DABLE DE ALTA ──
   Solo lo que está completo Y es de alguien conocido: RUC que resuelve a una
   ficha, número, importe y fecha. Con un dato menos, la fila nacería coja y
   habría que corregirla después mirando el mismo PDF — no se ahorra nada y se
   ensucia la rendición.
   Y solo si NO va a colgarse de una fila existente: si el archivo ya encontró
   su recibo, crear otro sería duplicar el gasto en la rendición, que es
   exactamente el error que nadie perdona en una auditoría.
   ══════════════════════════════════════════════════════════════════════════ */
export type AltaRhe = {
  archivo: string;
  personaId: string;
  numero: string;
  fecha: string;
  monto: number;
  retencion: number;
  concepto?: string;
};

export function altaDe(c: Cruce, mapa: Map<string, string>): AltaRhe | null {
  /* ── SOLO SI NO SE PARECE A NADA ──
     La primera versión miraba únicamente `filaId`, y eso metía en la lista de
     altas —marcadas— tres clases de archivo que NO son recibos nuevos:
       · los que cruzaron con una fila que ya tenía comprobante (ahí `filaId`
         se suelta a `sugerido` a propósito): habrían duplicado el gasto;
       · los ambiguos —«esa persona tiene dos recibos con ese número»—, que son
         justo los que hay que mirar antes de tocar nada;
       · los que alguien DESASIGNÓ a mano, convirtiendo «esto no lo toques» en
         «regístralo como gasto nuevo».
     Crear una fila es más caro que colgar un papel: si algo se le parece —una
     sugerencia, un candidato— o si una persona ya decidió sobre él, no se
     propone. Que quede fuera cuesta un registro a mano; que entre de más
     cuesta un gasto duplicado en una rendición ante el Estado. */
  if (c.filaId || c.sugerido || c.candidatos.length || c.tocado) return null;

  const personaId = personaDe(mapa, c.doc.ruc);
  const { clave, monto, fecha, concepto, archivo, retencion, delNombre } = c.doc;
  /* Nada sacado del NOMBRE del archivo: para cruzar vale como «probable»
     —lo peor que pasa es colgar el papel donde no era, y se ve—, pero para
     CREAR una fila con cifras significa inventarse un gasto a partir de cómo
     alguien bautizó un fichero. */
  if (delNombre) return null;
  /* `retencion` en `undefined` no es cero: es «no lo sé», y cambia lo que la
     persona cobró de verdad. Sin ese dato no se da de alta. */
  if (!personaId || !clave || !monto || !fecha || retencion == null) return null;
  return { archivo, personaId, numero: clave, monto, fecha, retencion, concepto };
}
