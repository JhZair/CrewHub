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
  /** true si el PDF no soltó texto (escaneo, foto). */
  ilegible?: boolean;
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
  /** La fila propuesta, o null si no se pudo decidir. */
  filaId: string | null;
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
  const m = String(n).toUpperCase().replace(/\s+/g, "").match(/([A-Z]\d{2,3})-?(\d{1,8})/);
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

  /* El número. `E001` (electrónico) o `R001`/`B001` (los de papel antiguos).
     Se descartan los que vengan pegados a más dígitos para no comerse un
     código de barras. */
  const mNum = t.match(/\b([EBR]\d{3})\s*-\s*(\d{1,8})\b/);

  /* El RUC del EMISOR. En un RHE aparecen dos: el de quien cobra (persona
     natural, empieza en 10 o 15) y el del cliente (la asociación, 20). Se
     coge el de persona natural, que es el que identifica el recibo.
     Si hubiera varios —un RUC repetido en el pie— da igual: es el mismo. */
  const rucs = (t.match(/\b\d{11}\b/g) || []).filter(r => /^(10|15)/.test(r));

  /* La fecha de emisión. Se coge la PRIMERA del documento: en la maqueta de
     SUNAT la emisión va arriba y cualquier otra fecha (pago, impresión) va
     después. Si el cruce depende de esto, sale como «probable», no «seguro». */
  const mFec = t.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/);

  /* El importe. Se toma el MAYOR de los importes con dos decimales: en un RHE
     conviven el bruto, la retención (8 %) y el neto, y el que aparece en la
     rendición es el bruto —lo que se giró—. Coger «el primero» dependería del
     orden de la maqueta; coger el mayor depende de la aritmética, que no
     cambia con los rediseños. */
  const montos = (t.match(/\d[\d,]*\.\d{2}/g) || [])
    .map(x => Number(x.replace(/,/g, "")))
    .filter(x => x > 0);

  return {
    archivo,
    clave: mNum ? claveNumero(`${mNum[1]}-${mNum[2]}`) : deNombre(archivo).clave,
    ruc: rucs[0],
    monto: montos.length ? Math.max(...montos) : undefined,
    fecha: mFec
      ? `${mFec[3]}-${mFec[2].padStart(2, "0")}-${mFec[1].padStart(2, "0")}`
      : undefined,
  };
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
      return nada(doc, `El RUC ${doc.ruc} del PDF no está en ninguna ficha de persona`);
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
  return bruto.map(c => (c.filaId && c.certeza !== "seguro" && conUrl.has(c.filaId))
    ? { ...c, filaId: null, certeza: "dudoso" as const,
        motivo: `${c.motivo} — pero ese recibo YA tiene comprobante: elígelo a mano si quieres reemplazarlo` }
    : c);
}

const ok = (doc: DocRhe, f: FilaRhe, certeza: Certeza, motivo: string): Cruce =>
  ({ doc, filaId: f.id, certeza, motivo, candidatos: [f.id] });
const dudoso = (doc: DocRhe, fs: FilaRhe[], motivo: string): Cruce =>
  ({ doc, filaId: null, certeza: "dudoso", motivo, candidatos: fs.map(f => f.id) });
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
