/**
 * ══════════════════════════════════════════════════════════════
 *  CASILLA DAFO → CrewHub+   ·   Google Apps Script
 * ══════════════════════════════════════════════════════════════
 *
 *  Corre en los servidores de Google cada 10 minutos, dentro del buzón
 *  MAESTRO (el que recibe el reenvío de las diez cuentas de postulación).
 *  Por eso funciona con la computadora apagada, gratis, sin OAuth y sin
 *  gastar créditos de nada.
 *
 *  Qué hace: busca los hilos con la etiqueta DAFO que todavía no mandó,
 *  los empuja a /api/ingesta/dafo y los marca. La deduplicación de verdad
 *  la hace el servidor (gmail_msg_id es unique), así que si esto se corre
 *  dos veces no pasa nada.
 *
 *  INSTALACIÓN — ver CASILLA-DAFO.md en la raíz del repo. Resumen:
 *    1. script.google.com → Nuevo proyecto → pega este archivo
 *    2. cambia CH_LLAVE por la misma que pusiste en Vercel
 *    3. ejecuta `probar` una vez (Google pedirá permiso de Gmail)
 *    4. ejecuta `instalarDisparador` una vez
 *
 *  ⚠ La llave vive aquí en claro. Este proyecto de Apps Script es privado
 *    de tu cuenta de Google: no lo compartas con «cualquiera con el
 *    enlace». Si se filtra, cambia INGESTA_DAFO_LLAVE en Vercel y aquí.
 */

var CH_ENDPOINT = 'https://crew-hub-sigma.vercel.app/api/ingesta/dafo';
var CH_LLAVE    = 'PEGA-AQUI-LA-MISMA-LLAVE-QUE-PUSISTE-EN-VERCEL';

var ETIQ_DAFO  = 'DAFO';          // la que pone tu filtro de Gmail
var ETIQ_HECHO = 'DAFO-enviado';  // la marca de «ya viajó»

var HILOS_POR_CORRIDA = 25;
/**
 * Tope de MENSAJES por petición. Tiene que ser ≤ al TOPE del endpoint (100):
 * si se pasa, el servidor rechaza la tanda entera —a propósito— y no entra
 * nada. Un hilo de DAFO puede traer diez mensajes, así que el límite real es
 * este, no el de hilos: se cortan HILOS COMPLETOS hasta caber, y los que no
 * entraron NO se marcan. Van en la corrida siguiente, diez minutos después.
 */
var MENSAJES_POR_CORRIDA = 90;

/** El trabajo. Es lo que corre el disparador cada 10 minutos. */
function revisarCasillaDafo() {
  var hecho = GmailApp.getUserLabelByName(ETIQ_HECHO) || GmailApp.createLabel(ETIQ_HECHO);

  // `newer_than:60d` es la red de seguridad: si algún día se borra la
  // etiqueta de enviados, esto NO reenvía tres años de correo de golpe.
  var q = 'label:' + ETIQ_DAFO + ' -label:' + ETIQ_HECHO + ' newer_than:60d';
  var hilos = GmailApp.search(q, 0, HILOS_POR_CORRIDA);
  if (!hilos.length) { console.log('nada nuevo'); return; }

  var buzon = Session.getActiveUser().getEmail();
  var mensajes = [];
  var procesados = [];   // SOLO los hilos que de verdad viajaron

  for (var i = 0; i < hilos.length; i++) {
    var ms = hilos[i].getMessages();
    // Un hilo entra entero o no entra: partirlo dejaría la mitad sin marcar
    // y la otra mitad marcada, que es la forma más limpia de perder un correo.
    if (mensajes.length && mensajes.length + ms.length > MENSAJES_POR_CORRIDA) break;
    for (var j = 0; j < ms.length; j++) {
      mensajes.push(deMensaje_(ms[j], hilos[i].getId(), buzon));
    }
    procesados.push(hilos[i]);
  }
  if (!mensajes.length) { console.log('nada que mandar'); return; }

  var res = UrlFetchApp.fetch(CH_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    // En la cabecera y no en la URL: las query strings quedan escritas en los
    // logs de Vercel, y esta llave escribe en la base de datos.
    headers: { Authorization: 'Bearer ' + CH_LLAVE },
    payload: JSON.stringify({ mensajes: mensajes }),
    muteHttpExceptions: true
  });

  // Si el servidor no confirmó, NO se marca nada: en la próxima corrida se
  // vuelve a intentar. Marcar antes de saber es cómo se pierde un correo
  // para siempre — el único fallo que este sistema no puede permitirse.
  if (res.getResponseCode() !== 200) {
    throw new Error('CrewHub+ respondió ' + res.getResponseCode() + ': ' + res.getContentText());
  }
  procesados.forEach(function (h) { h.addLabel(hecho); });
  console.log(procesados.length + ' hilos · ' + mensajes.length + ' mensajes · ' + res.getContentText());
  if (procesados.length < hilos.length) {
    console.log('quedaron ' + (hilos.length - procesados.length) + ' hilos para la próxima corrida');
  }
}

function deMensaje_(m, threadId, buzon) {
  return {
    id: m.getId(),
    threadId: threadId,
    fecha: m.getDate().toISOString(),
    buzon: buzon,
    de: m.getFrom(),
    asunto: m.getSubject(),
    para: destinatarios_(m),
    // Plano y aplastado: el HTML de los correos de gobierno es puro maquetado
    // y el extracto solo tiene que dejar entender de qué va.
    extracto: String(m.getPlainBody() || '').replace(/\s+/g, ' ').substring(0, 900)
  };
}

/**
 * Todos los correos que aparecen como destino. El servidor elige cuál es la
 * cuenta de la postulación (el que no es el buzón maestro): aquí no se decide
 * nada, se manda lo que hay.
 *
 * Orden a propósito:
 *   · X-Forwarded-For — la agrega Gmail al reenviar y trae la cuenta que
 *     reenvió, que es exactamente el dato que buscamos. Google documenta que
 *     usa esta cabecera para señalar reenvío, pero NO documenta el formato
 *     exacto del valor, así que no se parsea por posición: se extraen todos
 *     los correos con regex y el servidor descarta el maestro.
 *   · To / Cc — respaldo sólido: el reenvío conserva el To original intacto
 *     (cambiarlo rompería la firma DKIM del mensaje).
 *   · Delivered-To — la peor: después de un reenvío hay DOS y getHeader()
 *     devuelve solo una, sin garantía documentada de cuál. Va al final.
 */
function destinatarios_(m) {
  var crudo = [
    cab_(m, 'X-Forwarded-For'),
    m.getTo(),
    m.getCc(),
    cab_(m, 'Delivered-To')
  ].join(',');
  var hallados = String(crudo).match(/[\w.+-]+@[\w.-]+\.\w+/g) || [];
  var unicos = [];
  hallados.forEach(function (x) {
    var e = x.toLowerCase();
    if (unicos.indexOf(e) === -1) unicos.push(e);
  });
  return unicos.slice(0, 10);
}

function cab_(m, nombre) {
  try { return m.getHeader(nombre) || ''; } catch (e) { return ''; }
}

/** Ejecuta esto UNA vez a mano: Google pide los permisos y ves el resultado. */
function probar() {
  revisarCasillaDafo();
}

/**
 * Diagnóstico para el día de la instalación: NO manda nada. Imprime qué
 * destinatarios está viendo en los últimos hilos, que es lo único de todo
 * este montaje que depende de cabeceras no documentadas. Si aquí no aparece
 * la cuenta de la postulación, la vinculación por cuenta no va a funcionar
 * y hay que confiar en el código del asunto.
 */
function verDestinatarios() {
  var buzon = Session.getActiveUser().getEmail();
  var hilos = GmailApp.search('label:' + ETIQ_DAFO + ' newer_than:60d', 0, 5);
  console.log('buzón maestro: ' + buzon);
  hilos.forEach(function (h) {
    var m = h.getMessages()[0];
    console.log('— ' + m.getSubject());
    console.log('   To: ' + m.getTo());
    console.log('   X-Forwarded-For: ' + cab_(m, 'X-Forwarded-For'));
    console.log('   Delivered-To: ' + cab_(m, 'Delivered-To'));
    console.log('   → detectados: ' + destinatarios_(m).join(', '));
  });
}

/** Ejecuta esto UNA vez: deja el trabajo corriendo cada 10 minutos. */
function instalarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarCasillaDafo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarCasillaDafo').timeBased().everyMinutes(10).create();
  console.log('disparador instalado: cada 10 minutos');
}
