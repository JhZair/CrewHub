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
var HILOS_POR_CORRIDA = 25;       // el endpoint acepta 100 mensajes por tanda

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
  hilos.forEach(function (h) {
    h.getMessages().forEach(function (m) {
      mensajes.push({
        id: m.getId(),
        threadId: h.getId(),
        fecha: m.getDate().toISOString(),
        buzon: buzon,
        de: m.getFrom(),
        asunto: m.getSubject(),
        para: destinatarios_(m),
        // Plano y aplastado: el HTML de los correos de gobierno es puro
        // maquetado y el extracto solo tiene que dejar entender de qué va.
        extracto: String(m.getPlainBody() || '').replace(/\s+/g, ' ').substring(0, 900)
      });
    });
  });

  var res = UrlFetchApp.fetch(CH_ENDPOINT + '?llave=' + encodeURIComponent(CH_LLAVE), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ mensajes: mensajes }),
    muteHttpExceptions: true
  });

  // Si el servidor no confirmó, NO se marca nada: en la próxima corrida se
  // vuelve a intentar. Marcar antes de saber es cómo se pierde un correo
  // para siempre — el único fallo que este sistema no puede permitirse.
  if (res.getResponseCode() !== 200) {
    throw new Error('CrewHub+ respondió ' + res.getResponseCode() + ': ' + res.getContentText());
  }
  hilos.forEach(function (h) { h.addLabel(hecho); });
  console.log(mensajes.length + ' mensajes · ' + res.getContentText());
}

/**
 * Todos los correos que aparecen como destino. El servidor elige cuál es la
 * cuenta de la postulación (el que no es el buzón maestro): aquí no se decide
 * nada, se manda lo que hay.
 *
 * `Delivered-To` y `X-Forwarded-To` importan porque son justo lo que agrega el
 * reenvío automático de Gmail — sin ellos, un correo dirigido por copia oculta
 * llegaría sin ninguna pista de a qué cuenta iba.
 */
function destinatarios_(m) {
  var crudo = [m.getTo(), m.getCc(), cab_(m, 'Delivered-To'), cab_(m, 'X-Forwarded-To')].join(',');
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

/** Ejecuta esto UNA vez: deja el trabajo corriendo cada 10 minutos. */
function instalarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarCasillaDafo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarCasillaDafo').timeBased().everyMinutes(10).create();
  console.log('disparador instalado: cada 10 minutos');
}
