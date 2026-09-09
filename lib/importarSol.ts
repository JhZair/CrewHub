/* ── LEER EL REPORTE DE SUNAT ──
 *
 * SOL deja descargar «Relación de constancia de pagos»: la lista de lo que la
 * empresa presentó de verdad, con su número de orden y su fecha. Es el único
 * sitio donde vive la respuesta a «¿esto está declarado?» —no hay consulta
 * pública— y hasta ahora había que marcarlo mes a mano.
 *
 * Este módulo NO habla con SUNAT ni guarda credenciales. Lee un texto que
 * alguien pegó, y ya. Automatizar el login metiendo la Clave SOL en un robot
 * era la otra opción: se descartó por lo que es —poner la credencial en juego
 * para ahorrar un pegado al mes—.
 *
 * ── LO QUE EL FORMATO ENSEÑA, Y NO SE PODÍA ADIVINAR ──
 *
 *  · UN PERIODO PUEDE SALIR DOS VECES. No es un error del reporte: la segunda
 *    es una RECTIFICATORIA. Y eso obliga a una decisión que cambia el
 *    resultado: `declarado_en` guarda la fecha de la PRIMERA, porque lo que
 *    decide si se presentó dentro de plazo es la original — rectificar en
 *    noviembre no vuelve tardía una declaración de agosto, ni la salva si ya
 *    lo era.
 *
 *  · EL «Nº ORDEN» ES LA PRUEBA. Es lo que se cita si SUNAT pregunta, y sin
 *    él marcar el periodo es decir «sí, creo que sí».
 *
 *  · EL RUC VIENE EN LA CABECERA, y se comprueba. Pegar el reporte de una
 *    empresa en la ficha de otra es el error fácil de esta pantalla, no daría
 *    ningún síntoma, y dejaría a las dos mintiendo a la vez.
 */

export type FilaSol = {
  /** Año y mes DEL PERIODO, no de la presentación. */
  anio: number;
  mes: number;
  formulario: string;
  descripcion: string;
  nroOrden: string;
  /** 'YYYY-MM-DD' */
  fecha: string;
  montoPago: number;
};

export type LecturaSol = {
  ruc: string | null;
  razon: string | null;
  filas: FilaSol[];
  /** Cuántas filas parecían una declaración y no se pudieron interpretar. Se
   *  devuelven en vez de descartarse en silencio: un reporte medio leído que
   *  dice «importadas 12» cuando eran 14 es peor que uno que falla.
   *  ⚠ Un NÚMERO y no una lista de frases. Era `string[]` con una sola frase
   *  que llevaba la cifra dentro, y quien lo pintaba hacía `.length`: con siete
   *  filas perdidas la pantalla decía «1 línea». El aviso existía para que las
   *  que faltan no pasen desapercibidas, y él mismo las escondía. */
  ignoradas: number;
};

/* Qué obligación es cada formulario. 0621 es el IGV-Renta mensual —el único
   que hay hoy—; los de renta anual se reconocen por el texto porque su número
   cambia con el ejercicio (0710, 0711…). */
export function claseDeFormulario(form: string, desc: string): string | null {
  const f = String(form || "").trim();
  const d = String(desc || "").toLowerCase();
  if (f === "0621" || /igv.?renta mensual/.test(d)) return "igv_renta";
  if (/renta anual|regulariza/.test(d) || /^07\d\d$/.test(f)) return "dj_anual";
  return null;
}

const dmyAiso = (s: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/* ── NO SE LEE POR LÍNEAS ──
 *
 * La primera versión partía el texto en líneas y exigía una fila entera en
 * cada una. Funcionaba con la extracción de un PDF bien hecha y se rompía con
 * lo que de verdad va a pasar: cada visor copia distinto. Acrobat mete saltos
 * donde acaba la caja de texto, el visor de Chrome a veces parte por columnas,
 * y pegar desde Word añade espacios duros. Cualquiera de esas tres habría
 * dejado el importador diciendo «no encontré ninguna declaración» sobre un
 * reporte perfectamente válido.
 *
 * Así que se busca el PATRÓN por todo el texto, con `\s+` entre campos —que
 * también casa saltos de línea— en vez de exigir una forma de línea. Lo que
 * ancla cada fila no es su posición: es la secuencia periodo → formulario →
 * … → número de orden (una tirada larga de dígitos) → fecha. Esa secuencia no
 * la produce por casualidad ninguna cabecera ni ningún pie.
 *
 *   1 09/2024 0621 PDT IGV-RENTA MENSUAL-IEV 1133606408 19/05/2025 S/ 0
 *     └periodo┘ └form┘ └───descripción────┘ └──orden──┘ └──fecha──┘ └monto┘
 *
 * ── LOS DOS TROZOS ELÁSTICOS VAN ACOTADOS, Y NO POR ELEGANCIA ──
 *
 * La DESCRIPCIÓN: `[\s\S]{1,90}?` y no `.+?` con la bandera `s` —esa bandera
 * pide un objetivo de compilación más nuevo del que usa el proyecto—. El tope
 * de 90 además acota el daño si una fila viene rota: sin él, una descripción
 * sin cierre se tragaría las tres filas siguientes buscando un número de orden.
 *
 * La COLA (banco receptor y monto): dos intentos de acotarla por dónde TERMINA
 * fallaron, y los dos EN SILENCIO. Con `[^\n]*`, un reporte pegado en una sola
 * línea se leía como UNA declaración —el resto se lo tragaba la cola— y decía
 * «1 importada» tan tranquilo. Con un lookahead a la siguiente fila, se perdía
 * la ÚLTIMA de cada reporte, porque a esa no le sigue otra fila sino la
 * cabecera del siguiente.
 * A la tercera se busca lo que se QUIERE en vez de dónde acaba lo que no: un
 * «S/ importe» dentro de los treinta caracteres siguientes. Opcional —sin él
 * el monto es cero— y acotado, así que no puede irse de paseo.
 */
/* ── EL PERIODO NO PUEDE VENIR PEGADO A OTRA FECHA ──
 * `MM/AAAA` también está DENTRO de `DD/MM/AAAA`: en «Fecha de Presentación
 * 19/05/2025» hay un «05/2025» perfectamente válido. Si a eso le sigue un
 * número de cuatro cifras —y en el detalle de casillas la línea siguiente
 * empieza con «0621»— parece una fila del reporte de pagos y no lo es. Salía
 * como «1 línea parecía una declaración y no se pudo leer» cada vez que se
 * importaba un detalle de casillas: un aviso rojo sobre un archivo perfecto,
 * que es la clase de ruido que enseña a ignorar los avisos.
 * Exigiendo que delante no haya ni dígito ni barra, «19/05/2025» deja de
 * colarse y «1 09/2024 0621 …» —donde delante hay un espacio— sigue entrando. */
const ANTES = "(?:^|[^\\d/])";
const RE_FILA = new RegExp(
  ANTES + /(\d{2})\/(\d{4})\s+(\d{4})\s+([\s\S]{1,90}?)\s+(\d{6,})\s+(\d{2}\/\d{2}\/\d{4})(?:[\s\S]{0,30}?S\/\s*([\d.,]+))?/.source,
  "g");

/* El espacio duro que meten Word y algunos visores no es un espacio para una
   expresión regular: `\s` no lo casa y la fila se cae entera. Se normaliza
   antes de mirar nada. */
/* \u26a0 Y `normalize("NFC")`: una tilde puede venir como car\u00e1cter propio (\u00ab\u00f3\u00bb) o
   como letra + acento combinante (\u00abo\u00bb + U+0301). Las dos se ven id\u00e9nticas y solo
   la primera casa `[\u00f3o]`. Con la descompuesta, \u00abPresentaci\u00f3n\u00bb, \u00abPer\u00edodo\u00bb,
   \u00abN\u00famero de Orden\u00bb y \u00abTipo de Declaraci\u00f3n\u00bb fallaban los cuatro a la vez, as\u00ed
   que el PDF entero se le\u00eda como si no tuviera declaraciones. */
const limpiar = (t: string) => String(t || "")
  .normalize("NFC")
  .replace(/\u00a0|\u2007|\u202f/g, " ")
  .replace(/[\u2010-\u2015]/g, "-");

/* ══════════════════════════════════════════════════════════════════════════
   DE QUIÉN ES ESTE PAPEL — sin depender de qué formato sea

   El RUC se leía dentro de `leerReporteSol`, o sea SOLO en la relación de
   constancias. Los otros dos formatos que este importador acepta —el detalle
   de casillas y la declaración entera— no lo devolvían, así que la
   comprobación de «este reporte no es de esta empresa» se saltaba entera para
   ellos: soltar el detalle de casillas de otra empresa la importaba sin decir
   nada. Justo el error que esa comprobación existe para evitar, entrando por
   la puerta de al lado.

   La cabecera «RUC : 20612545058» está en los tres. Se lee de aquí, del texto
   crudo, para que la pregunta no dependa de qué lector acertó.

   ⚠ Anclado a la ETIQUETA y no a «once dígitos seguidos». En estos reportes
   hay números de orden de diez a trece dígitos, y un RUC inventado a partir de
   uno de ellos no dejaría entrar un archivo perfectamente válido — un falso
   positivo aquí bloquea trabajo legítimo, que es peor que no comprobar. */
export function rucDelTexto(texto: string): string | null {
  const m = /RUC\s*:?\s*(\d{11})/.exec(limpiar(texto || ""));
  return m ? m[1] : null;
}

export function leerReporteSol(texto: string): LecturaSol {
  const t = limpiar(texto);
  const filas: FilaSol[] = [];

  const mRaz = /Nombre o raz[oó]n\s*:?\s*(.+)/i.exec(t);

  for (const m of t.matchAll(RE_FILA)) {
    const [, mes, anio, formulario, descripcion, nroOrden, fechaDmy, monto] = m;
    const fecha = dmyAiso(fechaDmy);
    if (!fecha) continue;
    const nMes = Number(mes);
    /* ── EL PERIODO 13 EXISTE, Y ES EL ANUAL ──
       SUNAT numera el periodo de regularización anual como el mes 13 del año
       («13/2024»). Este filtro decía «de 1 a 12» y descartaba esas filas en
       silencio: la jurada anual de Wilkakalle salía vencida en la pantalla
       mientras su constancia estaba presentada y en el PDF.
       No se cuela nada por aceptarlo: quien empareja con la base es
       `importarDeclaracionesSol`, y allí todo lo que no es la mensual se busca
       con `mes = 0`, que es como la base guarda el periodo anual. El 13 nunca
       llega a la tabla — solo tiene que sobrevivir hasta ahí. */
    if (nMes < 1 || nMes > 13) continue;
    // Sin «S/» en la cola no hubo pago, que es lo que trae todo este reporte.
    const montoPago = monto ? Number(String(monto).replace(/,/g, "")) || 0 : 0;

    filas.push({
      anio: Number(anio), mes: nMes,
      formulario, descripcion: descripcion.replace(/\s+/g, " ").trim(),
      nroOrden, fecha, montoPago,
    });
  }

  /* ── CUÁNTAS DEBERÍA HABER ──
     Sin lectura por líneas ya no se puede decir «esta línea parecía una fila y
     falló». Lo que sí se puede es contar los CANDIDATOS —cada «MM/AAAA» seguido
     de un formulario de cuatro dígitos— y compararlos con lo leído. La
     diferencia es lo que no se pudo interpretar, y se devuelve: un importador
     que dice «12 importadas» cuando el reporte traía 14 es peor que uno que
     falla, porque a las otras dos no las echa de menos nadie. */
  const candidatos = (t.match(new RegExp(ANTES + /\d{2}\/\d{4}\s+\d{4}\s/.source, "g")) || []).length;
  const perdidas = Math.max(0, candidatos - filas.length);

  return {
    ruc: rucDelTexto(texto),
    razon: mRaz ? mRaz[1].split(/\n/)[0].trim() : null,
    filas,
    ignoradas: perdidas,
  };
}

/* ══════════════════════════════════════════════════════════════════
   EL TERCER FORMATO: LA DECLARACIÓN EN SU PROPIO PDF

   Los dos lectores de arriba esperan LISTADOS —«estas veintitrés se
   presentaron», «estas son las casillas de aquella»—. La jurada anual no
   aparece así: se descarga como el formulario entero, un PDF de treinta
   páginas cuya cabecera dice todo lo que hace falta y se repite en cada una:

       Periodo Tributario: 202413
       Número de Formulario: 0710
       Fecha Presentación: 15/05/2025 Número de Orden: 1005204598
       Tipo de Declaración : ORIGINAL

   Sin este lector, ese PDF entraba y el importador contestaba «no encontré
   ninguna declaración» — sobre el documento oficial de la declaración. Es la
   peor respuesta posible: manda a dudar del archivo, que está perfecto.

   ── EL PERIODO 202413 ──
   Trece es el periodo de regularización anual, no un mes que sobra. Aquí se
   lee como `mes = 13` y `importarDeclaracionesSol` lo empareja con el periodo
   anual, que la base guarda con `mes = 0`.

   ── VARIOS PDF DE UNA VEZ ──
   La cabecera se repite por página, así que no vale contar apariciones: se
   agrupa por NÚMERO DE ORDEN, igual que hace el lector de casillas. Así dos
   juradas sueltas juntas —2024 y 2025— salen como dos declaraciones y una sola
   de treinta páginas sale como una.
   ══════════════════════════════════════════════════════════════════ */
const RE_ORDEN_DECL = /N[úu]mero de Orden\s*:?\s*(?:Text Field\s*)?(\d{6,})/g;
/* `Text Field` es basura del PDF: son los nombres de los campos del formulario,
   que el lector de coordenadas recoge junto al valor. Se salta donde aparece en
   vez de limpiarla del texto entero — limpiar a lo ancho es como se estropean
   los datos de al lado. */
const uno = (re: RegExp, t: string) => (re.exec(t) || [])[1] || "";

export function leerDeclaracionesSol(texto: string): FilaSol[] {
  const t = limpiar(texto);
  const porOrden = new Map<string, FilaSol>();

  for (const m of t.matchAll(RE_ORDEN_DECL)) {
    const orden = m[1];
    /* Una ventana alrededor de la cabecera: los cuatro campos viven juntos, y
       mirar el documento entero mezclaría la cabecera de una declaración con
       la de la siguiente cuando se pegan dos PDF. */
    const i = m.index ?? 0;
    const v = t.slice(Math.max(0, i - 700), i + 700);

    const per = /Per[íi]odo Tributario\s*:?\s*(?:Text Field\s*)?(\d{4})(\d{2})/.exec(v);
    if (!per) continue;                      // sin periodo no hay nada que emparejar
    const anio = Number(per[1]);
    const mes = Number(per[2]);
    if (!anio || mes < 1 || mes > 13) continue;

    const form = uno(/N[úu]mero de Formulario\s*:?\s*(?:Text Field\s*)?(\d{3,4})/, v);
    const fechaDmy = uno(/Fecha Presentaci[óo]n\s*:?\s*(?:Text Field\s*)?(\d{2}\/\d{2}\/\d{4})/, v);
    const fecha = dmyAiso(fechaDmy);
    if (!fecha) continue;                    // sin fecha no se puede decir si fue a tiempo

    const prev = porOrden.get(orden);
    /* La primera cabecera completa manda. Las demás páginas repiten lo mismo, y
       alguna sale coja porque el visor parte la línea: quedarse con la primera
       que trajo fecha evita que una página rota pise a una buena. */
    if (prev) continue;

    const tipo = uno(/Tipo de Declaraci[óo]n\s*:?\s*(?:Text Field\s*)?(\w+)/, v).toLowerCase();
    /* El título del documento sirve de descripción: `claseDeFormulario` mira
       tanto el número como el texto, y «renta anual» aparece en la portada. */
    const titulo = uno(/FORMULARIO\s+\d+\s+([A-ZÁÉÍÓÚÑ ]{6,60})/, t).trim();

    porOrden.set(orden, {
      anio, mes,
      formulario: form.padStart(4, "0"),
      descripcion: [titulo || "Declaración", tipo === "rectificatoria" ? "(rectificatoria)" : ""]
        .filter(Boolean).join(" "),
      nroOrden: orden,
      fecha,
      /* Este PDF trae el detalle de la deuda, pero leer el importe pagado de
         aquí exigiría emparejar casillas en una tabla de tres columnas — el
         mismo problema que ya se decidió no adivinar. Se deja en cero: lo que
         este lector aporta es QUE se presentó y CUÁNDO, que es justo lo que a
         la pantalla le faltaba. */
      montoPago: 0,
    });
  }

  return [...porOrden.values()].sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

export type PeriodoSol = {
  clase: string;
  anio: number;
  mes: number;
  /** La PRIMERA presentación: la que decide si fue dentro de plazo. */
  fecha: string;
  nroOrden: string;
  /** Las posteriores del mismo periodo. Rectificar no cambia la puntualidad
   *  de la original, pero es un hecho que conviene conservar: explica por qué
   *  el importe declarado no coincide con el de la primera. */
  rectificaciones: { fecha: string; nroOrden: string }[];
  montoPago: number;
};

/** Agrupa las filas por (clase, periodo) y separa original de rectificatorias. */
export function periodosDeSol(filas: FilaSol[]): PeriodoSol[] {
  const m = new Map<string, FilaSol[]>();
  for (const f of filas) {
    const clase = claseDeFormulario(f.formulario, f.descripcion);
    if (!clase) continue;   // un formulario que no seguimos: no se inventa
    const k = `${clase}|${f.anio}|${f.mes}`;
    m.set(k, [...(m.get(k) || []), f]);
  }
  const out: PeriodoSol[] = [];
  m.forEach((fs, k) => {
    const [clase] = k.split("|");
    // Por fecha, y a igualdad por número de orden: los dos crecen con el tiempo.
    fs.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nroOrden.localeCompare(b.nroOrden));
    const [primera, ...resto] = fs;
    out.push({
      clase, anio: primera.anio, mes: primera.mes,
      fecha: primera.fecha, nroOrden: primera.nroOrden,
      rectificaciones: resto.map(r => ({ fecha: r.fecha, nroOrden: r.nroOrden })),
      /* El monto de la ÚLTIMA: si se rectificó, lo que se debe es lo de la
         rectificatoria, no lo de la original. */
      montoPago: fs[fs.length - 1].montoPago,
    });
  });
  return out.sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

/* ══════════════════════════════════════════════════════════════════
   EL SEGUNDO REPORTE: LAS CASILLAS DE LA DECLARACIÓN
   ══════════════════════════════════════════════════════════════════

   El de constancias dice SI se presentó y CUÁNDO. Este dice QUÉ SE PUSO — y
   son dos preguntas distintas con dos respuestas que pueden no cuadrar. En
   esta asociación no cuadraban: dieciocho periodos presentados, y noviembre
   de 2024 y abril de 2025 declarados enteramente en cero mientras sus facturas
   sumaban S/ 1,189 y S/ 1,157 de crédito fiscal. Eso no lo dice ningún reporte
   de pagos, porque una declaración en cero y una con saldo a favor pagan lo
   mismo: nada.

   ── LAS CUATRO CASILLAS QUE IMPORTAN ──
     101 · IGV de las ventas del periodo        (débito)
     178 · total del crédito fiscal de compras  (crédito)
     140 · impuesto resultante o saldo a favor  (140 = 101 − 178, en negativo si sobra crédito)
     184 · tributo a pagar o saldo a favor      (140 menos el saldo que venía arrastrado)

   El PDT tiene más de doscientas casillas. Se leen estas cuatro y no el resto
   porque son las que se pueden CONTRASTAR con lo que el sistema calcula de los
   comprobantes; guardar las otras doscientas sería guardar datos que nadie va
   a mirar y que nadie va a mantener.
*/

export type CasillasSol = {
  anio: number;
  mes: number;
  nroOrden: string;
  /** 'original' | 'rectificatoria' */
  tipo: string;
  /* ── CUÁNDO SE PRESENTÓ, 'YYYY-MM-DD' ──
   * El detalle de casillas la trae, en la misma línea que el número de orden:
   * «0621 Número de Orden 1205072105 Fecha de Presentación 08/09/2026». No se
   * leía, y por eso importar SOLO el detalle dejaba el periodo en «Pendiente»
   * con su número de orden ya guardado: el sistema sabía el número de la
   * declaración y seguía diciendo que no se había declarado. Cuadraba con lo
   * que la pantalla contestaba —«✅ 1 declaración con sus cifras»— y con lo que
   * el usuario veía —nada cambia—, y las dos cosas eran ciertas a la vez.
   * `null` si el reporte no la trae: entonces las cifras entran y la fecha no,
   * que es exactamente lo que había antes. */
  fecha: string | null;
  /** Casilla 101 — IGV de ventas declarado. */
  debito: number;
  /** Casilla 178 — crédito fiscal de compras declarado. */
  credito: number;
  /** Casilla 140 — impuesto resultante del periodo. */
  resultado: number | null;
  /** Casilla 184 — tras aplicar el saldo arrastrado. */
  aPagar: number | null;
};

/* Una casilla es un código de TRES dígitos seguido de un importe CON decimales.
   Los dos requisitos hacen falta:
   · `\b\d{3}\b` con fronteras — sin ellas, «1133359148» (el número de orden)
     contiene una docena de secuencias de tres dígitos.
   · el punto decimal — en el PDT una casilla vacía va seguida del código de la
     casilla siguiente («154 155»), y sin exigir decimales el 155 se leería
     como el VALOR del 154. Cero silencioso donde no había nada. */
const RE_CASILLA = /\b(\d{3})\b\s+(-?[\d,]*\d\.\d+)/g;

const num = (s: string) => Number(String(s).replace(/,/g, "")) || 0;

/* ── CUANDO EL VISOR COPIA POR COLUMNAS ──
 *
 * Algunos lectores de PDF, al seleccionar todo, recorren la página COLUMNA a
 * columna en vez de línea a línea. El detalle de casillas sale entonces así:
 *
 *     185 342
 *     0.00
 *     187 0.00 0.00
 *     343
 *     317 0.00
 *
 * cuando el original decía «Pagos previos 185 0.00 342 317 0.00». Los códigos
 * y sus importes acaban en líneas distintas y en otro orden.
 *
 * ── POR QUÉ ESTO SE DETECTA Y NO SE ARREGLA ──
 * Se podría emparejar el enésimo código con el enésimo importe. Con el texto de
 * arriba eso daría 185=0.00, 342=0.00, 187=0.00 — y el original tiene la 342
 * VACÍA, así que a partir de ahí todo el emparejamiento va corrido. Acertaría
 * muchas veces y fallaría algunas, sin ninguna señal de cuál fue cuál.
 *
 * Este módulo existe para encontrar diferencias entre lo declarado y lo
 * facturado. Una cifra inventada con aspecto de dato bueno no es un fallo
 * menor aquí: es lo contrario de la función. Así que se reconoce el formato
 * solo para poder DECIRLO y mandar a la persona a copiar de otra manera.
 */
export function pareceCopiaPorColumnas(texto: string): boolean {
  const lineas = limpiar(texto).split("\n").map(l => l.trim()).filter(Boolean);
  // Líneas que son solo códigos de casilla, sin ningún importe: «185 342».
  const soloCodigos = lineas.filter(l => /^(\d{3})(\s+\d{3})*$/.test(l)).length;
  // Líneas que son solo un importe, huérfano de su código: «0.00».
  const soloImportes = lineas.filter(l => /^-?[\d,]*\d\.\d{2}$/.test(l)).length;
  return soloCodigos >= 3 && soloImportes >= 3;
}

export function leerCasillasSol(texto: string): CasillasSol[] {
  const t = limpiar(texto);
  /* ── UN PEGADO POR COLUMNAS SE RECHAZA ENTERO ──
     Esta guarda parece redundante con la de la pantalla y no lo es. La cabecera
     («Número de Orden», «Período») sobrevive a la copia por columnas aunque las
     casillas no, así que sin esto se construía una declaración PERFECTAMENTE
     VÁLIDA con todo a cero: los ceros no vienen del PDF, vienen de los valores
     por defecto de más abajo. Y como la pantalla solo avisa cuando los dos
     lectores vuelven vacíos, ese cero inventado se habría guardado sin que
     saltara nada. Devolver nada es la única respuesta honesta. */
  if (pareceCopiaPorColumnas(texto)) return [];
  /* Cada declaración ocupa dos páginas y su número de orden aparece en las
     dos. Se corta por ese número y luego se FUNDEN los trozos del mismo: las
     casillas de ventas y compras están en la página 1 y las del resultado en
     la 2, así que leer solo un trozo daría media declaración —con el crédito
     pero sin el resultado, o al revés—. */
  const cortes = [...t.matchAll(/N[úu]mero de Orden\s+(\d{6,})/g)];
  if (!cortes.length) return [];

  const porOrden = new Map<string, CasillasSol & { _c: Record<string, number> }>();
  cortes.forEach((c, i) => {
    const orden = c[1];
    const desde = c.index ?? 0;
    const hasta = i + 1 < cortes.length ? (cortes[i + 1].index ?? t.length) : t.length;
    /* El trozo empieza en «Número de Orden» pero el periodo y el tipo están
       ANTES, en la cabecera. Se retrocede un poco para alcanzarlos. */
    const bloque = t.slice(Math.max(0, desde - 400), hasta);

    /* ⚠ EN LA CABECERA DE ESTA DECLARACIÓN, Y EN NINGÚN OTRO SITIO.
       El «Período» va ANTES del número de orden, y por eso el retroceso de 400
       caracteres existe. Pero la fecha y el tipo van DESPUÉS, en la misma línea
       o en la siguiente:

         0621 Número de Orden 1205072105 Fecha de Presentación 08/09/2026
         Tipo de Declaración Original Tipo de Moneda Soles

       Buscarlos en `bloque` los leía del trozo de atrás —con dos declaraciones
       seguidas, LA ANTERIOR— y buscarlos en todo el trozo de delante los podía
       leer de LA SIGUIENTE si algún formato pone la fecha antes del número. Las
       dos direcciones dan lo mismo de malo: una fecha de otra declaración en
       `declarado_en`, en silencio. Acotado a los 200 primeros caracteres, la
       cabecera entra entera y ninguna vecina cabe.
       Sin recurso hacia atrás: heredar del vecino es peor que no tener. Si no
       está, `tipo` cae al «original» de siempre y `fecha` a null.
       ⚠ Y los espacios de las etiquetas son `\s+`: literales, un PDF que parta
       «Fecha de / Presentación» en dos líneas devolvía null sin decir nada. */
    const cabecera = t.slice(desde, Math.min(hasta, desde + 200));
    const per = /Per[íi]odo\s+(\d{4})(\d{2})/.exec(bloque);
    const tip = /Tipo\s+de\s+Declaraci[óo]n\s+(\w+)/.exec(cabecera);
    const fpr = /Fecha\s+de\s+Presentaci[óo]n\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(cabecera);

    const prev = porOrden.get(orden);
    const c3: Record<string, number> = prev?._c || {};
    for (const m of t.slice(desde, hasta).matchAll(RE_CASILLA)) {
      // La PRIMERA aparición manda: el PDT no repite una casilla en su página.
      if (!(m[1] in c3)) c3[m[1]] = num(m[2]);
    }

    porOrden.set(orden, {
      anio: prev?.anio || (per ? Number(per[1]) : 0),
      mes: prev?.mes || (per ? Number(per[2]) : 0),
      nroOrden: orden,
      tipo: prev?.tipo || (tip ? tip[1].toLowerCase() : "original"),
      /* La página 2 de la misma declaración repite la cabecera; se queda la
         primera que se leyó, como con el periodo y el tipo. */
      fecha: prev?.fecha || (fpr ? `${fpr[3]}-${fpr[2]}-${fpr[1]}` : null),
      debito: c3["101"] ?? 0,
      credito: c3["178"] ?? 0,
      resultado: "140" in c3 ? c3["140"] : null,
      aPagar: "184" in c3 ? c3["184"] : null,
      _c: c3,
    });
  });

  return [...porOrden.values()]
    .filter(x => x.anio > 0 && x.mes >= 1 && x.mes <= 12)
    /* ── SIN NINGUNA CASILLA LEÍDA NO HAY DECLARACIÓN ──
       `debito` y `credito` caen a 0 cuando la casilla no aparece, así que una
       cabecera suelta —media página, un corte de copiado, un PDF que se pegó a
       medias— producía una declaración en cero indistinguible de una empresa
       que de verdad declaró cero. El PDT siempre imprime estos cuatro códigos;
       si no hay ni uno, lo que falta es el texto, no las cifras. */
    .filter(x => ["101", "178", "140", "184"].some(k => k in x._c))
    .map(({ _c, ...x }) => x)
    .sort((a, b) => a.anio - b.anio || a.mes - b.mes || a.nroOrden.localeCompare(b.nroOrden));
}

/* ══════════════════════════════════════════════════════════════════════════
   EL PERIODO SEGÚN SU DETALLE DE CASILLAS

   ⚠ DOS PREGUNTAS, DOS DECLARACIONES DISTINTAS, y confundirlas cambia un dato
   fiscal. Las CIFRAS que valen son las de la ÚLTIMA rectificatoria, porque es
   la que sustituye a todas las anteriores ante SUNAT. Pero la FECHA que decide
   si se presentó a tiempo es la de la PRIMERA — rectificar en octubre no vuelve
   tardía una declaración de agosto, ni la salva si ya lo era. Está escrito en
   `periodosDeSol` y en db/obligacion-constancia.sql, y aun así se coló: aquí
   había una `casillasVigentes` que solo sabía dar la última, se marcaba el
   periodo con ella, y un mes presentado dentro de plazo salía «declarado
   tarde». La función se fue: una que solo contesta media pregunta es una
   invitación a usarla para la otra media.

   Así que esto devuelve las dos cosas juntas, con la misma forma que
   `periodosDeSol` para que las dos puertas del importador se lean igual:
   · `fecha` y `nroOrden` — de la PRIMERA. Son la prueba de la presentación.
   · `rectificaciones` — las demás, que no se tiran: explican por qué el número
     vigente no coincide con el de la prueba.
   · `vigente` — la última, de donde salen las cifras y `declarado_orden`.
   ══════════════════════════════════════════════════════════════════════════ */
export type PeriodoCasillas = {
  anio: number;
  mes: number;
  /** De la PRIMERA presentación. `null` si el detalle no traía fecha. */
  fecha: string | null;
  nroOrden: string;
  rectificaciones: { fecha: string | null; nroOrden: string }[];
  vigente: CasillasSol;
};

export function periodosDeCasillas(cs: CasillasSol[]): Map<string, PeriodoCasillas> {
  const porK = new Map<string, CasillasSol[]>();
  for (const c of cs) {
    const k = `${c.anio}|${c.mes}`;
    porK.set(k, [...(porK.get(k) || []), c]);
  }
  const out = new Map<string, PeriodoCasillas>();
  porK.forEach((fs, k) => {
    /* Por fecha y, a igualdad o sin ella, por número de orden: los dos crecen
       con el tiempo. Es el mismo criterio de `periodosDeSol`; escrito distinto,
       la misma declaración sería «la primera» por una puerta y no por la otra. */
    const orden = [...fs].sort((a, b) =>
      (a.fecha || "9999").localeCompare(b.fecha || "9999")
      || a.nroOrden.localeCompare(b.nroOrden));
    const [primera, ...resto] = orden;
    out.set(k, {
      anio: primera.anio, mes: primera.mes,
      fecha: primera.fecha, nroOrden: primera.nroOrden,
      rectificaciones: resto.map(r => ({ fecha: r.fecha, nroOrden: r.nroOrden })),
      vigente: orden[orden.length - 1],
    });
  });
  return out;
}
