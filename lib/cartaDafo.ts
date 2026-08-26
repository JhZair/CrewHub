/* ══════════════════════════════════════════════════════════════════════════
   LEER UNA CARTA DE DAFO — lo que dice el PDF, sin teclearlo

   Las cartas de la Plataforma Virtual llegan en PDF y hoy se registran a mano:
   número, fecha, asunto, a qué fondo, hasta cuándo hay que contestar. Son seis
   campos por carta y hay decenas — y cada tecleo es una oportunidad de que el
   número quede mal y la carta se registre dos veces.

   Todo está dentro del propio PDF. El texto se saca con lib/leerPdf.ts (en el
   NAVEGADOR: el PDF no sale del ordenador de quien lo abre) y aquí se
   interpreta.

   ── DÓNDE ESTÁ CADA COSA ──
   Comprobado con la carta 000136-2025 de PO-005 (Mujunakuy):

   · El ASUNTO, arriba, tras «Asunto :» y hasta «De nuestra consideración».
   · El ACTA («N° 060-2023-DAFO») va DENTRO del asunto. Es la llave que dice de
     qué fondo es la carta: el número de expediente no aparece en ninguna parte.
   · El PLAZO, en el cuerpo: «un plazo de diez (10) días hábiles computados a
     partir del día hábil siguiente de la notificación».
   · Y el NÚMERO DE CARTA, la FECHA y el CÓDIGO no están en el cuerpo: viven en
     el SELLO DE FIRMA DIGITAL del final —el recuadro de la derecha—. Un
     extractor normal ni los ve; el nuestro sí, porque lee el flujo entero.
     Ahí está también la hora exacta de la firma, que es la misma que la casilla
     enseña como «fecha notificado».

   ── ESTO NO ADIVINA: LEE, Y SI NO ENTIENDE, LO DICE ──
   Cada campo puede salir vacío y la pantalla lo enseña vacío para que una
   persona lo complete. Rellenar a ojo lo que no se entendió —inventar una
   fecha, suponer un fondo— sería justo lo que convierte un importador en una
   fuente de datos falsos.
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo que se entendió de una carta. Todo opcional menos el texto: un PDF que
 *  no es una carta de DAFO devuelve casi todo vacío, y eso se ve. */
export type CartaLeida = {
  /** «CARTA N° 000136-2025-DAFO-DGIA-VMPCIC/MC» */
  numero: string | null;
  /** El código del validador documental del Ministerio («SXP0Y4A»). Es lo que
   *  permite comprobar en su web que la carta es auténtica. */
  codigo: string | null;
  /** `YYYY-MM-DD` de la firma digital = el día que la casilla notifica. */
  fecha: string | null;
  /** La hora de la firma, tal cual («17:45:11»). Solo para poder cotejarla con
   *  la casilla; no se guarda. */
  hora: string | null;
  asunto: string | null;
  /** El acta de compromiso: «060-2023-DAFO». */
  acta: string | null;
  /** Días HÁBILES para responder, si la carta pone plazo. */
  plazoDias: number | null;
  /** Quién firma («CHAVEZ HUAMAN Erika»). */
  firmante: string | null;
  /** A QUIÉN va dirigida («ALMICAR ESCALANTE QUILLANUAMAN»). No es un adorno:
   *  la Plataforma nos notificó una vez el requerimiento de otro beneficiario,
   *  y lo único que lo delataba era este nombre. Enseñarlo en cada fila hace
   *  que el error salte al cargar, no dos años después. */
  destinatario: string | null;
  /** La entidad destinataria, la línea de debajo del cargo. */
  entidad: string | null;
  /** Lo que hay que decirle a quien carga: un PDF con dos cartas dentro, un
   *  plazo que no se pudo leer con certeza. Vacío = todo limpio. */
  aviso: string | null;
};

export const CARTA_VACIA: CartaLeida = {
  numero: null, codigo: null, fecha: null, hora: null, asunto: null,
  acta: null, plazoDias: null, firmante: null, destinatario: null,
  entidad: null, aviso: null,
};

/* ── EL TEXTO, PLANCHADO ──
   El extractor devuelve el texto tal como está pintado en la página, y el
   generador del Ministerio parte las palabras («President e», «benefi ciarias»)
   y separa los guiones («060 - 2023 - DAFO»). Para BUSCAR se plancha: un solo
   espacio, y los guiones y el «N°» pegados a lo suyo. Para MOSTRAR (el asunto)
   se limpia aparte, que es otra cosa. */
const planchar = (t: string) => String(t || "")
  .replace(/\r/g, "")
  .replace(/[ \t]+/g, " ")
  /* «060 - 2023 - DAFO» → «060-2023-DAFO». Solo entre alfanuméricos: así no se
     come los guiones de una frase («— y por eso —»). */
  .replace(/(\w) ?- ?(\w)/g, "$1-$2")
  .replace(/N\s*[°º]\s*/gi, "N° ");

/* ── Y SIN NINGÚN ESPACIO, PARA BUSCAR LO QUE TIENE FORMA ──
   El generador del Ministerio parte las palabras por dentro: «días hábile s»,
   «President e», «benefi ciarias». No es un fallo de nuestro extractor —cada
   trozo se dibuja donde toca— pero rompe cualquier regex escrita como se
   escribe en español: `d[íi]as h[áa]biles` NO casa con «días hábile s», y el
   plazo se perdía en silencio justo en la carta que lo traía.
   Para los campos que tienen FORMA —un número, una fecha, un código— se busca
   aquí, donde los espacios ya no existen y no pueden estorbar. El asunto y el
   nombre del firmante no: esos se leen, y sin espacios no se leerían. */
const compactar = (t: string) => planchar(t).replace(/\s+/g, "");

const MESES: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", setiembre: "09", septiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
};

const dosD = (n: string | number) => String(n).padStart(2, "0");

/**
 * La carta que hay dentro de este texto.
 *
 * No lanza nunca: un PDF que no sea una carta devuelve `CARTA_VACIA` y quien
 * llama decide qué hacer. Un importador que revienta a mitad de un lote de
 * veinte deja al que importa sin saber cuáles entraron.
 */
export function leerCarta(textoCrudo: string): CartaLeida {
  const t = planchar(textoCrudo);
  if (!t.trim()) return { ...CARTA_VACIA };
  const c = compactar(textoCrudo);

  /* ── EL NÚMERO ──
     «CARTA N° 000136-2025-DAFO-DGIA-VMPCIC/MC», en el sello del final. Se
     admite también OFICIO y MEMORANDO: la casilla trae de los tres.
     ⚠ El cuerpo dice «...de la presente carta cumpla con...»: sin exigir el
     «N°» y un número detrás, esa frase se llevaría el campo. */
  /* Sobre el texto CON espacios: es el espacio el que dice dónde ACABA el
     número. Compactado, «…/MC» se pega a la palabra siguiente del sello y el
     número salía como «…/MCASUNTO» — que parece un número y no lo es, así que
     la llave anti-duplicado dejaba de funcionar sin que nadie lo notara. */
  const hallados = [...t.matchAll(/\b(CARTA|OFICIO|MEMORANDO)\s+N°\s*([0-9]{3,}-[0-9]{4}-[A-Z0-9\-\/\.]+)/gi)]
    .map(m => ({ num: `${m[1].toUpperCase()} N° ${m[2].toUpperCase()}`, i: m.index ?? 0 }));
  const distintos = [...new Set(hallados.map(h => h.num))];

  /* ── VARIOS NÚMEROS EN UN PDF: MANDA EL DEL SELLO ──
     Casi todas las cartas de DAFO citan otras: «mediante CARTA N° 000131-2025
     se le requirió…». Con cuatro de cinco PDF así, bloquearlos era dejar la
     carga por lote sin usar — y separar el PDF a mano no es algo que la
     Plataforma permita hacer.
     El número de LA carta es el del sello de firma digital, que va al final de
     todo, debajo de «San Borja, 3 de julio del 2025». Los del cuerpo son citas
     a documentos anteriores. Así que se toma el del sello y se DICE cuáles
     otros aparecían, para que quien mira pueda corregirlo en un segundo.
     Comprobado con la carta 000136-2025 (un solo número, al final) y con las
     cuatro del segundo requerimiento (000131 citada en el cuerpo, 000500 en el
     sello — que es la que la casilla enseña como notificada). */
  const iSello = Math.max(
    t.lastIndexOf("Firmado digitalmente"),
    t.lastIndexOf("San Borja"),
  );
  const enSello = iSello >= 0 ? hallados.filter(h => h.i > iSello) : [];
  const elegido = enSello.length ? enSello[enSello.length - 1]
    : hallados.length ? hallados[hallados.length - 1] : null;
  const numero = elegido ? elegido.num : null;
  const otros = distintos.filter(n => n !== numero);

  /* ── EL CÓDIGO DEL VALIDADOR ── «… Código: SXP0Y4A»
     ⚠ Este va sobre el texto CON espacios. Sin ellos, el código se pega a la
     palabra siguiente del sello y salía «SXP0Y4AFIRMA»: un código de siete
     letras con cinco de propina, que en el validador del Ministerio no
     comprueba nada. El espacio es aquí el único final de palabra que hay. */
  const mCod = t.match(/C[óo]digo:\s*([A-Z0-9]{5,12})\b/i);
  const codigo = mCod ? mCod[1].toUpperCase() : null;

  /* ── LA FECHA Y LA HORA ──
     Del sello: «Fecha: 24.03.2025 17:45:11 -05:00». Es la de la FIRMA, que es
     la que la casilla enseña como notificación —comprobado: la carta 000136
     firma a las 17:45:11 y la casilla dice «2025/03/24 17:45»—.
     Si no hay sello se cae a «San Borja, 24 de Marzo del 2025», que es la
     fecha impresa de la carta. Las dos coinciden en las cartas vistas; la del
     sello manda porque lleva hora. */
  let fecha: string | null = null, hora: string | null = null;
  const mSello = t.match(/Fecha:\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  if (mSello) { fecha = `${mSello[3]}-${mSello[2]}-${mSello[1]}`; hora = mSello[4]; }
  if (!fecha) {
    const mTxt = t.match(/,\s*(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+d?e?l?\s*(\d{4})/);
    const mes = mTxt ? MESES[mTxt[2].toLowerCase()] : null;
    if (mTxt && mes) fecha = `${mTxt[3]}-${mes}-${dosD(mTxt[1])}`;
  }

  /* ── EL ASUNTO ──
     Entre «Asunto :» y «De nuestra consideración». Se corta también en un
     salto doble por si esa despedida no aparece: un asunto que se come media
     carta es peor que uno corto. */
  /* El corte tiene varias salidas porque la despedida cambia de carta a carta
     —y porque el generador parte las palabras, así que «consideració n» puede
     no casar—. Sin más salidas que esa, un asunto de tres renglones se comía
     media carta o se quedaba en nada. */
  let asunto: string | null = null;
  const mAsu = t.match(/Asunto\s*:\s*([\s\S]{0,400}?)(?:De nuestra consideraci|Es propicia|Atentamente|Firmado digitalmente|Mediante el presente|$)/i);
  if (mAsu) {
    asunto = mAsu[1]
      .replace(/\s*\n\s*/g, " ")     // el asunto viene en dos renglones
      .replace(/\s+/g, " ")
      .replace(/\s+\./g, ".")
      .trim()
      .replace(/[.\s]+$/, "");
    if (!asunto) asunto = null;
  }

  /* ── EL ACTA ──
     «ACTA DE COMPROMISO N° 060-2023-DAFO». Es la llave del fondo. Se busca en
     TODO el texto y no solo en el asunto: el cuerpo la repite, y si el asunto
     se partió raro el cuerpo salva la lectura. */
  /* También con espacios, por lo mismo que el número: compactado, «060-2023-
     DAFO» se pegaba a la palabra siguiente y el acta salía «060-2023-DAFODE».
     Y si la carta menciona DOS actas distintas, ninguna: mandar la carta al
     fondo equivocado es peor que dejarla sin vincular —sin vincular se ve—. */
  const actas = [...t.matchAll(/ACTA\s+(?:DE\s+COMPROMISO\s+)?N°\s*([0-9]{2,4}-[0-9]{4}-[A-Z]+)/gi)]
    .map(m => m[1].toUpperCase());
  const actasUnicas = [...new Set(actas.map(a => normActa(a)))];
  const acta = actasUnicas.length === 1 ? actas[0] : null;

  /* ── EL PLAZO ──
     «un plazo de diez (10) días hábiles». Se lee el número EN CIFRAS, que es
     el que está entre paréntesis; la palabra («diez») se ignora a propósito
     —convertir palabras a números añade una tabla que puede equivocarse—. */
  /* ⚠ SOLO SI VA DETRÁS DE «PLAZO DE». Había un respaldo que cogía cualquier
     «(N) días hábiles» del texto, y estas cartas citan la Ley 27444: «el
     silencio administrativo de treinta (30) días hábiles» habría puesto un
     vencimiento de treinta días, con toda la pinta de correcto, sobre un
     requerimiento de diez. Un plazo inventado en un requerimiento es
     exactamente el error que cuesta el fondo, así que si no está escrito como
     plazo, no hay plazo: lo pone una persona.
     Y si aparecen DOS plazos distintos, tampoco. */
  const plazos = [...c.matchAll(/plazode[^()]{0,40}?\((\d{1,3})\)d[íi]ash[áa]biles/gi)]
    .map(m => Number(m[1]));
  const plazosUnicos = [...new Set(plazos)];
  const plazoDias = plazosUnicos.length === 1 ? plazosUnicos[0] : null;

  /* ── QUIÉN FIRMA ── «Firmado digitalmente por CHAVEZ HUAMAN Erika FAU …»
     Este SÍ va sobre el texto con espacios: un nombre sin espacios no es un
     nombre. Y el sello lo parte en dos renglones, de ahí el `\s`. */
  const mFir = t.match(/Firmado\s+digitalmente\s+por\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ\s]{4,60}?)\s+(?:FAU|FIR)\b/);
  const firmante = mFir ? mFir[1].replace(/\s+/g, " ").trim() : null;

  /* ── A QUIÉN VA DIRIGIDA ──
     El encabezado es siempre el mismo:
        Señor :
        ALMICAR ESCALANTE QUILLANUAMAN     ← el nombre
        Presidente                          ← el cargo
        ASOCIACION DE PRODUCTORES…          ← la entidad
        Presente . -
     Se corta en «Presente» y se toman la primera línea y la última. */
  let destinatario: string | null = null, entidad: string | null = null;
  const mDest = t.match(/Se[ñn]or(?:a|es)?\s*:\s*([\s\S]{0,240}?)Presente\s*[.\-]/i);
  if (mDest) {
    const lineas = mDest[1].split("\n").map(s => s.trim()).filter(Boolean);
    destinatario = lineas[0] || null;
    /* La entidad solo si hay más de una línea: en una carta a una persona
       natural no hay entidad, y repetir su nombre ahí diría que es una
       asociación que no existe. */
    entidad = lineas.length > 1 ? lineas[lineas.length - 1] : null;
  }

  const avisos = [
    otros.length
      ? `El PDF menciona también ${otros.join(", ")}. Se toma la del sello de firma; si la buena es otra, cámbiala aquí.`
      : "",
    actasUnicas.length > 1
      ? `La carta menciona ${actasUnicas.length} actas distintas: elige a mano de qué fondo es.`
      : "",
  ].filter(Boolean);
  const aviso = avisos.length ? avisos.join(" ") : null;

  return { numero, codigo, fecha, hora, asunto, acta, plazoDias, firmante, destinatario, entidad, aviso };
}

/* ══════════════════════════════════════════════════════════════════════════
   HASTA CUÁNDO HAY QUE RESPONDER

   «Diez (10) días hábiles computados a partir del día hábil siguiente de la
   notificación». O sea: se empieza a contar al día hábil SIGUIENTE, no el
   mismo día.

   ⚠ NO CUENTA FERIADOS. Solo salta sábados y domingos, porque no hay
   calendario de feriados peruanos en el sistema y meter uno a medias sería
   peor: un feriado olvidado ADELANTA el vencimiento y hace creer que hay menos
   tiempo del que hay — o al revés. Así que esto da una fecha ORIENTATIVA y la
   pantalla lo dice con esas palabras, para que nadie la use como si fuera del
   abogado.
   ══════════════════════════════════════════════════════════════════════════ */
export function diaHabilTras(fecha: string, dias: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !dias || dias < 1) return null;
  /* Mediodía: a medianoche, un cambio de horario resta un día. */
  const d = new Date(`${fecha}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  let quedan = dias;
  while (quedan > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) quedan--;   // 0 domingo, 6 sábado
  }
  return `${d.getFullYear()}-${dosD(d.getMonth() + 1)}-${dosD(d.getDate())}`;
}

/* ── ¿DE QUÉ FONDO ES ESTA CARTA? ──
   Por el número de acta, que es lo único que la carta dice del expediente. Se
   compara sin puntuación ni ceros de más: «N° 060-2023-DAFO», «060-2023-DAFO»
   y «60-2023-DAFO» son la misma acta escrita por tres personas distintas. */
export const normActa = (s?: string | null): string => {
  const u = String(s || "").toUpperCase();
  /* Se busca la FORMA del acta dentro del texto en vez de limpiarlo entero:
     limpiando, «N° 060-2023-DAFO» quedaba «N0602023DAFO» —la eñe del «N°» se
     pegaba al número— y no casaba con «060-2023-DAFO». El vínculo fallaba
     justo con el campo escrito como lo escribe una persona. */
  const m = u.match(/(\d{1,4})\s*-\s*(\d{4})\s*-\s*([A-Z]{2,10})/);
  if (m) return `${Number(m[1])}-${m[2]}-${m[3]}`;   // sin ceros de más
  return u.replace(/[^A-Z0-9]/g, "");
};

/**
 * La postulación cuya acta coincide. `null` si no hay ninguna o si hay VARIAS:
 * un vínculo dudoso puesto en silencio manda la carta al fondo equivocado, y
 * eso es peor que dejarla sin vincular — sin vincular se ve; mal vinculada, no.
 */
export function fondosDeActa<T extends { id: string; codigo_acta?: string | null }>(
  acta: string | null | undefined, posts: T[],
): T[] {
  const a = normActa(acta);
  if (!a) return [];
  return (posts || []).filter(p => p.codigo_acta && normActa(p.codigo_acta) === a);
}

/** El fondo, si es UNO solo. Con varios devuelve `null` y quien llama usa
 *  `fondosDeActa` para decir por qué —«ninguno» y «varios» no se arreglan
 *  igual, y el mismo mensaje para los dos manda a buscar donde no es—. */
export function fondoDeActa<T extends { id: string; codigo_acta?: string | null }>(
  acta: string | null | undefined, posts: T[],
): T | null {
  const hay = fondosDeActa(acta, posts);
  return hay.length === 1 ? hay[0] : null;
}
