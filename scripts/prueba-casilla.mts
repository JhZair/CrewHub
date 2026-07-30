/**
 * Pruebas de lib/casilla.ts — la lógica que decide de qué postulación es un
 * correo de DAFO. Se corre a mano, sin instalar nada:
 *
 *     node --experimental-strip-types scripts/prueba-casilla.mts
 *
 * Por qué existe: esta lógica es pura (entra texto, sale un id o null) y es la
 * única pieza del módulo que puede equivocarse EN SILENCIO — un correo mal
 * vinculado, o sin vincular, no da ningún error: solo aparece en el sitio
 * equivocado. La primera versión llevaba el espacio entre los separadores de
 * código y eso rompía el caso más normal («Subsanacion CDO-P-00094-26 del
 * expediente» no casaba con nada). Se descubrió escribiendo estas pruebas, no
 * leyendo el código.
 *
 * Extensión .mts a propósito: así queda fuera del `include` de tsconfig (que
 * pide *.ts) y el import con extensión explícita —que Node necesita— no le
 * molesta al typecheck del proyecto.
 */
import { candidatosCodigo, vincularPorCodigo, vincularPorAsuntoOCuerpo, pideAccion, esAcuse, esRuido, linkGmail, soloNombre } from "../lib/casilla.ts";

const POSTS = [
  { id: "sol", codigo: "CDO-P-00094-26-P-074-Solischa", codigo_plataforma: null },
  { id: "cha", codigo: "042-2024-DAFO-P-031-Chaccu", codigo_plataforma: null },
  { id: "oro", codigo: "CDO-P-00121-26-P-080-Oro", codigo_plataforma: "2026-000481" },
];
let fallos = 0;
const ok = (nombre: string, real: any, esperado: any) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? "✓" : "✗ FALLA"}  ${nombre}` + (bien ? "" : `\n     esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`));
};

// ── El caso que estaba roto ──
ok("código en asunto con palabras alrededor",
  vincularPorCodigo("Notificacion de subsanacion CDO-P-00094-26 del expediente", POSTS), "sol");
ok("código completo en el asunto",
  vincularPorCodigo("Re: CDO-P-00094-26-P-074-Solischa", POSTS), "sol");
ok("código con año-DAFO",
  vincularPorCodigo("Acta 042-2024-DAFO-P-031 conformidad", POSTS), "cha");
ok("codigo_plataforma también cuenta",
  vincularPorCodigo("Expediente 2026-000481 observado", POSTS), "oro");

// ── Lo que NO debe emparejar ──
ok("sin código: null", vincularPorCodigo("Comunicado general para postulantes", POSTS), null);
ok("fecha no es código", vincularPorCodigo("Cronograma actualizado al 2026-07-29", POSTS), null);
ok("RUC no empareja", vincularPorCodigo("Empresa con RUC 20601234567", POSTS), null);
ok("ambiguo: dos candidatos → null",
  vincularPorCodigo("Resolucion: CDO-P-00094-26 y CDO-P-00121-26 aptas", POSTS), null);
ok("fragmento corto no basta", vincularPorCodigo("Ficha P-074 recibida", POSTS), null);

// ── El asunto manda sobre el cuerpo ──
ok("asunto gana al cuerpo",
  vincularPorAsuntoOCuerpo("Subsanacion CDO-P-00121-26",
    "Lista de beneficiarios: CDO-P-00094-26, 042-2024-DAFO-P-031", POSTS), "oro");
ok("sin código en asunto, cae al cuerpo",
  vincularPorAsuntoOCuerpo("Notificacion", "Sobre el expediente CDO-P-00094-26", POSTS), "sol");
ok("cuerpo ambiguo → null",
  vincularPorAsuntoOCuerpo("Notificacion", "CDO-P-00094-26 y CDO-P-00121-26", POSTS), null);

// ── pide_accion: el semáforo tiene que distinguir ──
ok("requerimiento sí", pideAccion("Requerimiento de subsanacion", ""), true);
ok("subsanación con tilde sí", pideAccion("SUBSANACIÓN de observaciones", ""), true);
ok("apercibimiento sí", pideAccion("Apercibimiento", ""), true);
ok("resolución sola NO", pideAccion("Notificación de Resolución Directoral N° 123", ""), false);
ok("plazo solo NO", pideAccion("Cronograma: plazo de evaluación", ""), false);
ok("acuse de recibo NO", pideAccion("Notificación: postulación recibida", ""), false);
ok("presentar solo NO", pideAccion("Guía para presentar proyectos", ""), false);
ok("observaciones en el cuerpo sí", pideAccion("Notificación", "Se han registrado observaciones al expediente"), true);

/* ── ASUNTOS REALES ──
   Los 17 correos de plataformacultura@cultura.gob.pe de una cuenta, vistos el
   30/07/2026. No son inventados: son el motivo de que exista `esAcuse`. */
ok("REAL observación sí suena",
  pideAccion("ESTÍMULOS ECONÓMICOS PARA LA CULTURA - NOTIFICACIÓN DE OBSERVACIÓN", ""), true);
ok("REAL observación del registro sí suena",
  pideAccion("REGISTRO NACIONAL DE LA CINEMATOGRAFÍA Y EL AUDIOVISUAL - NOTIFICACIÓN DE OBSERVACIÓN", ""), true);
ok("REAL constancia de subsanación NO suena (traía «subsan»)",
  pideAccion("CONSTANCIA DE ENVÍO DE SUBSANACIÓN - DAFO", ""), false);
ok("REAL constancia de postulación NO suena (el cuerpo traía «observaciones»)",
  pideAccion("CONSTANCIA DE ENVÍO DE POSTULACIÓN",
    "Hemos recibido la información actualizada vinculada a las observaciones notificadas"), false);
ok("REAL constancia de envío NO suena",
  pideAccion("CONSTANCIA DE ENVÍO", "Su postulación ha sido enviada satisfactoriamente. Pallay"), false);
ok("REAL constancia de recepción NO suena",
  pideAccion("CONSTANCIA DE RECEPCIÓN DE MODIFICACIÓN DE INFORMACIÓN", ""), false);
ok("REAL casilla electrónica es rutina",
  pideAccion("CASILLA ELECTRÓNICA - MINISTERIO DE CULTURA", "Hemos depositado un mensaje en su casilla electrónica"), false);
ok("REAL matriz del jurado es rutina",
  pideAccion("MATRIZ DEL JURADO", "Ya se encuentra disponible la matriz del jurado"), false);

ok("acuse: constancia", esAcuse("CONSTANCIA DE ENVÍO DE SUBSANACIÓN - DAFO"), true);
ok("acuse: reenviada a mano sigue siendo acuse", esAcuse("Fwd: CONSTANCIA DE ENVÍO"), true);
ok("acuse: reenvío doble", esAcuse("Fwd: Re: CONSTANCIA DE ENVÍO"), true);
ok("acuse: observación NO es acuse", esAcuse("NOTIFICACIÓN DE OBSERVACIÓN"), false);
ok("acuse: la palabra en medio NO cuenta", esAcuse("Requerimiento sobre su constancia de envío"), false);
ok("y por eso ese sí sigue sonando",
  pideAccion("Requerimiento sobre su constancia de envío", ""), true);

ok("ruido: código de verificación",
  esRuido("Código de verificacion - Plataforma Virtual de Atención a la Ciudadanía"), true);
ok("ruido: una observación no es ruido", esRuido("NOTIFICACIÓN DE OBSERVACIÓN"), false);

// ── Detalles ──
ok("link con buzón",
  linkGmail("18f2", "maestro@gmail.com"),
  "https://mail.google.com/mail/u/?authuser=maestro%40gmail.com#all/18f2");
ok("link sin hilo", linkGmail(null, "x@y.com"), null);
ok("nombre del remitente", soloNombre('"DAFO Estímulos" <notif@cultura.gob.pe>'), "DAFO Estímulos");
ok("remitente sin nombre", soloNombre("notif@cultura.gob.pe"), "notif@cultura.gob.pe");
ok("candidatos limpios",
  candidatosCodigo("Subsanacion CDO-P-00094-26 al 2026-07-29"), ["CDOP0009426"]);

console.log(fallos ? `\n${fallos} PRUEBAS FALLARON` : "\nTodas las pruebas pasaron");
